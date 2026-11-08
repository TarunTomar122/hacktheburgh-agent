import { z } from "zod";
import type { CaseFacts } from "./facts";
import { missingRequired } from "./facts";
import { modelFor, structured } from "./llm";
import type { Draft } from "./draft";
import type { Emit } from "./planner";
import { ASK_TOOL, FINISH_TOOL, PLAN_TOOL, runCrew, short, tool, type CrewKit } from "./crewRun";
import type { CrewId, EscalationInput, EscalationResult, Thought } from "./plannerTypes";
import type { RouteMap } from "./routeTypes";
import { exploreSite, readPage, type PageReading } from "./workers/explore";
import { fillForm } from "./workers/fillForm";
import type { Value, WorkerCtx } from "./workers/types";

/**
 * Step 2, anywhere (night plan, "Elliot anywhere"): taking the complaint to the independent body discovery found
 * (an ombudsman, a commission, a regulator). Robin reads the body's own pages for when you can go, the time limit and
 * what to include, and checks the patient's progress honestly ("not yet: you need the final reply first"). Elliot
 * writes the case from the complaint and the provider's reply. Kit explores to the body's own online form or checker,
 * fills it and stops before the final submit. When there is no usable online form (none, down, behind a login or a
 * CAPTCHA), Robin finds where it goes, quoted from the body's own page and checked by code, and Elliot prepares the
 * message. Nothing per place is in this file: body, pages and form come from the route map and the live site.
 */

const TOOLS = [
  PLAN_TOOL,
  tool("read_rules", "Robin: read the independent body's own pages (from the route map): when a patient can bring a complaint (what must happen first, e.g. the provider's final reply), the time limit, what to include, how to apply. Checks the patient's progress against it.", {}, []),
  tool("draft_case", "Elliot: write the patient's case for the independent body: what happened, the complaint they made, what the provider said, why it is not resolved, what they would like.", {}, []),
  tool("fill_form", "Kit: explore the body's site to its own online complaint form or online checker, fill it with the patient's details and the case, page by page, and stop before the final submit. Reports walls (login, CAPTCHA, form unavailable).", { answers: { type: "array", items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" } }, required: ["label", "value"] } } }, []),
  tool("find_address", "Robin: when there is no usable online form, find on the body's own pages the email or postal address complaints go to, quoted exactly and checked against the page.", {}, []),
  tool("prepare_message", "Elliot: prepare the full message or letter to the body, addressed to where Robin found it goes.", {}, []),
  ASK_TOOL,
  FINISH_TOOL,
];

const Ready = z.object({
  when: z.string().describe("When a patient can bring a complaint to this body, in one sentence close to the page's words (e.g. after the provider's final response, or after a set time without one). Empty if the page does not say."),
  direct: z.boolean().describe("True only if the page says patients may come straight to this body without complaining to the provider first."),
  status: z.enum(["ready", "not_yet", "unclear"]).describe("Can THIS patient go now, given their progress? not_yet = something the page requires has not happened yet."),
  explanation: z.string().describe("One or two plain sentences to the patient. If not yet, say exactly what they need first (e.g. 'Not yet: you need the hospital's final response first.')."),
  limit: z.string().describe("The time limit for going to this body, from the page, one sentence; empty if not stated"),
  limitStatus: z.enum(["within", "close", "outside", "unclear"]).describe("Is the patient inside that limit today? close = under 8 weeks left; unclear when the start date is unknown"),
  limitExplanation: z.string().describe("One plain sentence: which date you counted from"),
  include: z.array(z.string()).describe("What the page asks people to include or send, at most 5, short"),
  steps: z.array(z.string()).describe("What happens after applying, in order, as the page says, at most 4"),
});

const Case = z.object({
  details: z.string().describe("What happened, first person, chronological, facts only, short paragraphs"),
  complaintMade: z.string().describe("What the patient did to complain to the provider, from the input only; empty if not known"),
  providerSaid: z.string().describe("What the provider said in its reply, one or two sentences, from the input only; empty if not given"),
  whyNotResolved: z.string().describe("Why the patient is still unhappy, from the input only; empty if not said"),
  outcome: z.string().describe("What the patient would like the body to do; empty if not said"),
});
type CaseText = z.infer<typeof Case>;

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
// A postal address in a quote: a number plus a postcode-like token or a street word. Generic, no place in it.
const POSTAL = /\d.*(?:\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b|\b\d{4,6}\b|street|road|avenue|house|building|floor|square|lane|p\.?o\.? box|postbus|rue|straße|strasse|via|calle|plaza)/i;

export async function runEscalationAnywhere(facts: CaseFacts, route: RouteMap, opts: { onEvent?: Emit; keepOpen?: boolean; runId?: string; progress?: EscalationInput } = {}): Promise<EscalationResult> {
  const step = (k: RouteMap["steps"][number]["kind"]) => route.steps.find((s) => s.kind === k);
  const esc = step("escalation");
  const provider = step("complaint")?.body ?? "the health provider";
  const bodyName = esc?.body ?? "the independent body";
  const placeName = [route.place.region, route.place.country].filter(Boolean).join(", ");
  const progress: EscalationInput = opts.progress ?? { complaintSent: false, finalResponse: "unknown" };
  // Pages to start from, in order: the step's own page, then its other official sources (distinct).
  const pages = [...new Set([esc?.url, ...(esc?.sources ?? []).filter((s) => s.official).map((s) => s.url)].filter((u): u is string => !!u))];

  let process: EscalationResult["process"];
  let timeLimit: EscalationResult["timeLimit"];
  let ready: EscalationResult["ready"];
  let caseText: CaseText | undefined;
  let draft: Draft | undefined;
  let message: string | undefined;
  let subject: string | undefined;
  let sendTo: EscalationResult["sendTo"];
  let form: EscalationResult["form"] = { status: "not_started", filled: [], unfilled: [], note: "The form has not been filled yet.", url: esc?.url ?? "" };
  const extra: { label: string; value: string }[] = [];
  let fills = 0;

  const status = `Complaint to ${provider}: ${progress.complaintSent ? "sent" : "not sent yet"}. Final response from ${provider}: ${progress.finalResponse === "yes" ? "received" : progress.finalResponse === "no" ? "not received yet" : "not known"}.`;

  const values = (c: CaseText): Value[] => {
    const v = (key: string, description: string, value: string | null | undefined): Value => ({ key, description, value: value ?? "" });
    const first = facts.events[0];
    return [
      v("complaint_about", "Who the complaint is about: the patient themself (me) or someone else", facts.complainingFor === "someone_else" ? "Someone else" : "Me"),
      v("title", "Title, e.g. Ms", facts.title),
      v("first_name", "First name / given name", facts.firstName),
      v("last_name", "Last name / surname / family name", facts.lastName),
      v("full_name", "Full name", [facts.firstName, facts.lastName].filter(Boolean).join(" ")),
      v("address", "Postal address (street and town)", facts.address),
      v("postcode", "Postcode / postal code / ZIP", facts.postcode),
      v("phone", "Telephone number", facts.phone),
      v("email", "Email address", facts.email),
      v("preferred_contact", "How they prefer to be contacted: Letter, Email or Phone Call", facts.preferredContact),
      { ...v("organisation", "The organisation the complaint is about (the provider)", provider), public: true },
      v("hospital", "Hospital, ward or service where the care happened", facts.incidentLocation),
      v("date_of_care", "Date the care happened (first event)", first?.date),
      v("complained_first", "Has the patient already complained to the organisation? Yes or No", progress.complaintSent ? "Yes" : "No"),
      v("final_response", "Has the organisation sent its final response? Yes or No", progress.finalResponse === "yes" ? "Yes" : progress.finalResponse === "no" ? "No" : ""),
      v("what_happened", "What happened: the complaint in the patient's own words", c.details),
      v("provider_response", "What the organisation said in its response", c.providerSaid || progress.providerReply),
      v("why_unhappy", "Why the patient is unhappy with the organisation's response", c.whyNotResolved),
      v("desired_outcome", "What they would like to happen as a result", c.outcome),
      ...extra.map((x, i) => v(`user_answer_${i + 1}`, `The patient's answer to the form's question "${x.label}"`, x.value)),
    ].filter((x) => x.value.trim());
  };

  /** Read the body's pages in order (and the best link from the first), until one answers with a checked quote. */
  const readBest = async (ctx: WorkerCtx, question: string, ok: (r: PageReading) => boolean, max = 3): Promise<PageReading | null> => {
    const todo = [...pages];
    const seen = new Set<string>();
    let best: PageReading | null = null;
    for (let i = 0; i < todo.length && seen.size < max; i++) {
      const url = todo[i];
      if (seen.has(url)) continue;
      seen.add(url);
      const r = await readPage(ctx, url, question);
      if (r.wall) continue;
      if (!best || r.quotes.filter((q) => q.checked).length > best.quotes.filter((q) => q.checked).length) best = r;
      if (ok(r)) return r;
      // Follow the page's own best links next (same order the reader ranked them).
      todo.splice(i + 1, 0, ...r.links.slice(0, 2).map((l) => l.url).filter((u) => !seen.has(u)));
    }
    return best;
  };

  const ctxFor = (kit: CrewKit, p: WorkerCtx["page"], note: WorkerCtx["note"], who: CrewId): WorkerCtx => ({ page: p, note, track: kit.track, ask: (spec) => kit.ask({ ...spec, crew: who }) });
  const tab = (kit: CrewKit, thought: Thought, who: CrewId, task: string) => <T,>(work: (ctx: WorkerCtx) => Promise<T>, ms: number) =>
    kit.inTab(thought, who, short(task, 26), (p, note) => work(ctxFor(kit, p, note, who)), ms);

  return runCrew<EscalationResult>(
    {
      prefix: "escalation",
      system: `You lead a crew helping a patient in ${placeName} take their complaint about ${provider} to the independent body: ${bodyName}. Discovery already worked out the route (below). Work ONE step at a time and let each result decide the next.
Order (adapt when results call for it, and say why with update_plan): read_rules (Robin) -> draft_case (you) -> fill_form (Kit) -> finish.
If fill_form finds no usable online form (none, unavailable, login, CAPTCHA, bot check, phone or post only), call find_address (Robin) and prepare_message (you) in the same turn, then finish.
If read_rules says the patient cannot go yet (e.g. they need ${provider}'s final response first), say so plainly with update_plan, but still prepare the case (draft_case, then the form or the message) so it is ready when they can go; the patient must not send it before then.
If fill_form reports a question only the patient can answer, ask_user once and call fill_form again with answers (at most twice in total).
If the form is still not complete after that (or the patient does not answer), also call find_address and prepare_message, so the patient has the letter as a backup.
Never say anyone was at fault. Never submit or send anything. Never invent facts, addresses or dates.
ROUTE MAP:\n${JSON.stringify({ place: route.place, steps: route.steps.filter((s) => s.kind === "complaint" || s.kind === "escalation" || s.kind === "advice").map((s) => ({ kind: s.kind, body: s.body, what: s.what, how: s.how, url: s.url, deadline: s.deadline, wall: s.wall, requires: s.requires, points: s.points })) }, null, 1).slice(0, 6000)}`,
      tools: TOOLS,
      firstInput: `Patient: (name withheld from the planner).\nWhere treated: ${facts.incidentLocation ?? "unknown"}.\nProgress: ${status}\n${progress.providerReply ? `What ${provider} said (from the patient): ${progress.providerReply}\n` : ""}What happened:\n${[facts.incidentSummary, ...facts.events.map((e) => `${e.date}: ${e.what}`)].filter(Boolean).join("\n")}\nWhat they would like: ${facts.desiredOutcome || "not said"}.`,
      maxTurns: 14,
      who: (name): CrewId => (name === "read_rules" || name === "find_address" ? "robin" : name === "fill_form" ? "kit" : "elliot"),
      after: ["prepare_message"],
      doing: (name) =>
        ({ read_rules: `Reading ${bodyName}'s rules`, draft_case: "Writing your case", fill_form: `Filling ${bodyName}'s form`, find_address: "Finding where it goes", prepare_message: "Preparing your letter" })[name] ?? "Working",
      describe: (name, _a, out) => {
        if (name === "read_rules" && ready) return `${ready.status === "ready" ? "You can go now." : ready.status === "not_yet" ? "Not yet." : "I could not tell if you can go yet."} ${short(ready.explanation, 200)}`;
        if (name === "draft_case" && draft) return `Written for ${bodyName}: what happened, your complaint${caseText?.providerSaid ? `, what ${provider} said` : ""} and what you would like.`;
        if (name === "fill_form") return form.status === "ready_to_submit" ? `The form is filled (${form.filled.length} fields) and waiting for you to check it and press Submit yourself.` : form.status === "needs_input" ? `Filled as far as I could. It still needs: ${form.unfilled.join(", ") || "an answer from you"}.` : short(out, 200);
        if (name === "find_address" && sendTo) return `It goes to ${sendTo.address}, as their own page says.`;
        if (name === "prepare_message" && message) return sendTo ? `Your letter is ready to send to ${short(sendTo.address, 80)}.` : "Your letter is ready; I could not confirm the address on their pages.";
        return short(out.split("\n")[0], 200);
      },
      exec: async (call, a, thought, kit) => {
        switch (call.name) {
          case "read_rules": {
            if (!pages.length) return "Could not read the rules: discovery found no page for the independent body.";
            const r = await tab(kit, thought, "robin", bodyName)(
              (ctx) => readBest(ctx, `When can a patient bring a complaint about health care to ${bodyName}: what must happen first (for example the provider's final response), the time limit, what to include, and how to apply (online form, email, post)?`, (x) => x.quotes.filter((q) => q.checked).length >= 2),
              150_000,
            );
            if (!r.ok) return `Could not read the rules: ${r.error}`;
            if (!r.value) return `Could not read the rules: ${bodyName}'s pages did not open.`;
            const page = r.value;
            const today = new Date().toISOString().slice(0, 10);
            const x = await structured({
              ...modelFor("reason", ["health"]), // date reasoning on the patient's timeline: on this Mac, thinking on
              instructions: "Decide whether a patient can take their complaint to an independent body yet, using ONLY the page text for the body's rules and ONLY the patient's progress and timeline for what has happened. Never guess a date. If the page requires a step the progress says has not happened, the answer is not_yet.",
              input: `Today: ${today}\nBody: ${bodyName}\nPage answer: ${page.answer}\nQuotes: ${page.quotes.filter((q) => q.checked).map((q) => q.quote).join(" | ")}\nRoute map: requires ${JSON.stringify(esc?.requires ?? [])}; deadline ${esc?.deadline ?? ""}\nProgress: ${status}\nTimeline:\n${facts.events.map((e) => `${e.date}: ${e.what}`).join("\n")}`,
              schema: Ready,
              name: "escalation_ready",
              data: ["health"],
            });
            // Honesty in code: no complaint sent and the page does not invite people straight in -> not yet.
            let st = x.status;
            let explanation = x.explanation;
            if (!progress.complaintSent && !x.direct && st !== "not_yet") {
              st = "not_yet";
              explanation = `Not yet: complain to ${provider} first and wait for their final response. ${x.when}`.trim();
            }
            // One recommendation, reconciled in code: "you can go" never stands next to "past the time limit" without saying so.
            if (st === "ready" && x.limitStatus === "outside") explanation = `${explanation} But this may be past ${bodyName}'s time limit (${x.limit || "see their page"}); they can sometimes accept a late complaint, so say why it is late.`;
            if (st === "ready" && !x.limit) explanation = `${explanation} We could not confirm ${bodyName}'s time limit on its page.`;
            ready = { status: st, when: x.when, explanation, include: x.include.slice(0, 5), url: page.url };
            process = { summary: page.answer, steps: x.steps.slice(0, 4), support: "", url: page.url };
            timeLimit = { limit: x.limit, status: x.limitStatus, explanation: x.limitExplanation, url: page.url };
            kit.finding(st === "ready" ? `You can go to ${bodyName} now` : st === "not_yet" ? `Not yet: ${short(explanation, 120)}` : `When you can go: ${short(x.when || "not stated", 120)}`, page.url, "robin");
            if (x.limit) kit.finding(`Time limit: ${short(x.limit, 120)}`, page.url, "robin");
            return `Can go: ${st}. ${explanation}\nWhen: ${x.when}\nTime limit: ${x.limit || "not stated"} (${x.limitStatus})\nInclude: ${x.include.join("; ")}\nAfter applying: ${x.steps.join(" -> ")}\nHow (page): ${short(page.answer, 300)}\nChecked quotes: ${page.quotes.filter((q) => q.checked).map((q) => `"${short(q.quote, 140)}"`).join(" | ") || "none"}`;
          }
          case "draft_case": {
            caseText = await structured({
              ...modelFor("draft", ["health", "identity"]), // the patient's story: on this Mac by default
              instructions: `You write a patient's case for ${bodyName} (${placeName}), the independent body that reviews complaints about ${provider}. First person, plain, polite, factual, short paragraphs, no legal language.
Use ONLY the facts, the complaint text and the provider's reply given. Never add diagnoses, blame, dates or details. Never say anyone was at fault. Do not include contact details. Leave a field empty when the input does not say.`,
              input: `Progress: ${status}\nFacts:\n${JSON.stringify({ ...facts, phone: undefined, email: undefined, address: undefined, postcode: undefined }, null, 1)}\n\nThe complaint sent to ${provider}:\n${progress.complaintText || "(not given)"}\n\nWhat ${provider} said in reply:\n${progress.providerReply || "(not given)"}`,
              schema: Case,
              name: "escalation_case",
              data: ["health", "identity"],
            });
            const c = caseText;
            draft = {
              details: [c.details, c.complaintMade && `My complaint to ${provider}: ${c.complaintMade}`, c.providerSaid && `What ${provider} said: ${c.providerSaid}`, c.whyNotResolved && `Why this is not resolved: ${c.whyNotResolved}`].filter(Boolean).join("\n\n"),
              location: facts.incidentLocation ?? provider,
              outcome: c.outcome,
            };
            kit.finding(`Case written for ${bodyName} (${draft.details.split(/\s+/).length} words)`, undefined, "elliot");
            return `Drafted (${draft.details.split(/\s+/).length} words). The text stays on the patient's device; you do not need it to continue.`;
          }
          case "fill_form": {
            if (!caseText) return "Write the case first (draft_case).";
            // Only what a form can ask: contact preferences and one provider's email-risk consent are not the patient's details.
            const missing = missingRequired(facts).filter((k) => k !== "preferredContact" && k !== "emailRiskAccepted");
            if (missing.length) return `Blocked: the profile is missing ${missing.join(", ")}.`;
            if (fills >= 2) return "Blocked: the form was already filled twice. Finish now.";
            if (!pages.length) return "No online form: discovery found no page for the independent body. Use find_address and prepare_message.";
            fills++;
            for (const x of (a.answers as { label: string; value: string }[] | undefined) ?? []) if (x?.label && x?.value) extra.push({ label: String(x.label), value: String(x.value) });
            const c = caseText;
            const r = await tab(kit, thought, "kit", `${bodyName} form`)(async (ctx) => {
              let url = esc?.how === "online_form" ? esc.url : undefined;
              if (url) await ctx.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
              else {
                const found = await exploreSite(ctx, pages[0], `the online form (or online checker) to bring a complaint about ${provider} to ${bodyName}`, { want: "form" });
                if (!found.ok) return { kind: "none" as const, detail: `${found.summary}${found.wall ? ` (${found.wall.kind}: ${found.wall.detail})` : ""}` };
                url = found.url;
              }
              const out = await fillForm(ctx, { goal: `Bring a complaint about ${provider} to ${bodyName} (the independent body), for the patient`, values: values(c) });
              if (out.status === "ready_to_submit" || out.status === "needs_input") kit.keep(ctx.page);
              return { kind: "filled" as const, out, url: ctx.page.url() };
            }, 300_000);
            if (!r.ok) {
              form = { ...form, status: "failed", note: `Stopped: ${r.error}` };
              return `The form could not be filled: ${r.error}. Use find_address and prepare_message.`;
            }
            if (r.value.kind === "none") {
              form = { ...form, status: "failed", note: r.value.detail };
              return `No online form: ${r.value.detail}. Use find_address and prepare_message.`;
            }
            const o = r.value.out;
            form = {
              status: o.status === "ready_to_submit" ? "ready_to_submit" : o.status === "needs_input" ? "needs_input" : "failed",
              filled: o.pages.flatMap((pg) => pg.filled),
              unfilled: o.unfilled,
              note: o.status === "blocked" ? `${o.wall?.kind ?? "blocked"}: ${o.wall?.detail ?? o.summary}` : o.summary,
              url: r.value.url,
            };
            kit.finding(form.status === "ready_to_submit" ? `${bodyName}'s form is filled, waiting for you to submit` : form.status === "needs_input" ? `The form needs: ${o.unfilled.join(", ") || o.summary}` : `The form stopped: ${short(form.note, 120)}`, r.value.url, "kit");
            return o.status === "ready_to_submit"
              ? `Form filled across ${o.pages.length} page(s), ${form.filled.length} fields. Stopped before "${o.finalSubmitLabel ?? "Submit"}".`
              : o.status === "blocked"
                ? `Blocked: ${o.wall?.kind ?? ""} ${o.wall?.detail ?? o.summary}. Use find_address and prepare_message.`
                : o.status === "failed"
                  ? `The form could not be filled: ${o.summary}. Use find_address and prepare_message.`
                  : `Status: ${o.status}. Still needs: ${o.unfilled.join(", ")}. ${o.summary}`;
          }
          case "find_address": {
            if (!pages.length) return "Could not find where it goes: discovery found no page for the independent body.";
            const found = (r: PageReading) => r.quotes.some((q) => q.checked && (EMAIL.test(q.quote) || POSTAL.test(q.quote)));
            const r = await tab(kit, thought, "robin", `${bodyName} contact`)(
              (ctx) => readBest(ctx, `Exactly which email address or postal address should a member of the public send a complaint to ${bodyName} to? Quote the address exactly as written.`, found, 4),
              150_000,
            );
            if (!r.ok) return `Could not find where it goes: ${r.error}`;
            const checked = r.value?.quotes.filter((q) => q.checked) ?? [];
            // Only a code-checked quote counts: the address must be in the page's own text, never the model's answer.
            const e = checked.find((q) => EMAIL.test(q.quote));
            const p = checked.find((q) => POSTAL.test(q.quote));
            if (e) sendTo = { kind: "email", address: e.quote.match(EMAIL)![0].replace(/\.$/, ""), quote: e.quote, url: e.url };
            else if (p) sendTo = { kind: "post", address: p.quote.trim(), quote: p.quote, url: p.url };
            if (!sendTo) return `Could not confirm an address on ${bodyName}'s pages.${r.value ? ` They say: ${short(r.value.answer, 200)}` : ""}`;
            kit.finding(`${sendTo.kind === "email" ? "Email" : "Post"}: ${sendTo.address}`, sendTo.url, "robin");
            return `${sendTo.kind === "email" ? "Email" : "Postal address"}: ${sendTo.address} (their page: "${short(sendTo.quote, 160)}")`;
          }
          case "prepare_message": {
            if (!draft) return "Write the case first (draft_case).";
            subject = `Complaint about ${provider}: ${facts.incidentLocation ?? "my care"}`;
            const name = [facts.firstName, facts.lastName].filter(Boolean).join(" ");
            message = `Dear ${bodyName},\n\nI would like you to look at my complaint about ${provider}.\n\n${draft.details}${draft.outcome ? `\n\nWhat I would like: ${draft.outcome}` : ""}\n\nYours sincerely,\n${name}\n${[facts.address, facts.postcode].filter(Boolean).join(", ")}\n${facts.phone ?? ""}\n${facts.email ?? ""}`.trim();
            form = { ...form, note: sendTo ? `${bodyName}: your letter is ready to send to ${sendTo.address}.` : `${bodyName}: your letter is ready; the address could not be confirmed on their pages.` };
            return sendTo ? `Letter ready, to ${sendTo.address}.` : "Letter ready, but no address was confirmed on their pages.";
          }
          default:
            return `Unknown tool ${call.name}`;
        }
      },
      failed: (name, out) => /^(Error|Could not|Blocked|The form could not)/.test(out) || (name === "fill_form" && /^No online form/.test(out)),
      finish: (kit, x) => {
        const result: EscalationResult = { runId: kit.runId, runDir: kit.runDir, plan: x.plan, thoughts: x.thoughts, turns: x.turns, says: x.says, trace: kit.tracer.steps, stats: kit.track.stats, asks: x.asks, process, timeLimit, evidence: {}, draft, form, message, stage: "escalation", body: bodyName, provider, ready, sendTo, subject };
        kit.emit({ type: "escalation_result", result });
        return result;
      },
    },
    opts,
  );
}
