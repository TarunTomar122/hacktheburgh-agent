import { z } from "zod";
import type { CaseFacts } from "./facts";
import { missingRequired, NHS_ONLY } from "./facts";
import { modelFor, structured } from "./llm";
import { draftComplaintTo, type Draft } from "./draft";
import type { GuidelineReading } from "./evidence";
import { findGuidance } from "./guidance";
import { describeInvestigation, describeIssue, investigate, supportFor } from "./investigate";
import type { Emit } from "./planner";
import { ASK_TOOL, FINISH_TOOL, PLAN_TOOL, runCrew, short, tool } from "./crewRun";
import type { ComplaintResult, CrewId, EvidenceResult, Investigation } from "./plannerTypes";
import type { RouteMap, RouteStep } from "./routeTypes";
import { exploreSite, readPage } from "./workers/explore";
import { fillForm } from "./workers/fillForm";
import type { Value, WorkerCtx } from "./workers/types";

/**
 * The complaint, anywhere (night plan, "Elliot anywhere"). Runs on the route map discovery produced: Robin reads the
 * provider's own rules and checks the time limit against the patient's dates; Iona finds the recommendation in the
 * place's own clinical guidance and compares it with the timeline; Elliot writes the complaint to the right body;
 * Kit goes to the form discovery found (or finds it) and fills it, stopping before the final submit. When the
 * provider only takes email or post, Elliot prepares the message and says exactly where it goes. Nothing per place
 * is in this file.
 */

const TOOLS = [
  PLAN_TOOL,
  tool("read_rules", "Robin: read the complaint body's own pages (from the route map) for how to complain, the stages, response times and the time limit, and check the patient's dates against that limit.", {}, []),
  tool("find_guidance", "Iona: on the clinical guidance body's site found by discovery, find the recommendation that applies to the patient's condition, quote it exactly, and compare it with the patient's timeline.", { condition: { type: "string", description: "e.g. 'suspected scaphoid fracture'" } }, ["condition"]),
  tool("investigate", "Iona: before the complaint is written, look on the official sites (the independent complaints body, the provider, the health regulator, public records) for published decisions on similar cases, the provider's own policies, inspection reports and public records that make the complaint stronger. Quotes are checked by code; where nothing is found it says so. Takes up to 3.5 minutes.", { condition: { type: "string", description: "e.g. 'suspected scaphoid fracture'" }, issue: { type: "string", description: "One generic sentence on what went wrong with the care: no names, no dates, no places" } }, ["condition", "issue"]),
  tool("draft_complaint", "Elliot: write the complaint to the body, from the patient's facts, with Iona's finding as one polite question if there is one.", {}, []),
  tool("fill_form", "Kit: open the complaint body's online form (found by discovery, or find it) and fill it with the patient's details and the draft, page by page, stopping before the final submit. If there is no online form, report how the body takes complaints instead.", { answers: { type: "array", items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" } }, required: ["label", "value"] } } }, []),
  tool("prepare_message", "Elliot: when the body takes complaints only by email or post, prepare the full message and where to send it (address or email from its own page).", {}, []),
  ASK_TOOL,
  FINISH_TOOL,
];

const Limit = z.object({
  limit: z.string().describe("The time limit, quoted from the page in one sentence; empty if the page does not say"),
  status: z.enum(["within", "close", "outside", "unclear"]).describe("Is the patient inside the limit today? close = under 8 weeks left"),
  explanation: z.string().describe("Two plain sentences: which date you counted from and what it means"),
  steps: z.array(z.string()).describe("What happens after the complaint is made, in order, as the page says, at most 4"),
  include: z.array(z.string()).describe("What the page asks complainants to include, if it says, at most 4"),
});

export async function runComplaintAnywhere(facts: CaseFacts, route: RouteMap, opts: { onEvent?: Emit; keepOpen?: boolean; runId?: string } = {}): Promise<ComplaintResult> {
  const step = (k: RouteStep["kind"]) => route.steps.find((s) => s.kind === k);
  const body = step("complaint");
  const placeName = [route.place.region, route.place.country].filter(Boolean).join(", ");
  const proof: EvidenceResult = {};
  let guideline: GuidelineReading | null = null;
  let investigation: Investigation | undefined;
  let process: ComplaintResult["process"];
  let timeLimit: ComplaintResult["timeLimit"];
  let draft: Draft | undefined;
  let message: string | undefined;
  let form: ComplaintResult["form"] = { status: "not_started", filled: [], unfilled: [], note: "The form has not been filled yet.", url: body?.url ?? "" };
  const extra: { label: string; value: string }[] = [];
  let fills = 0;

  const values = (d: Draft): Value[] => {
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
      { ...v("hospital", "Hospital, ward or service where the care happened", facts.incidentLocation), public: true },
      { ...v("organisation", "The organisation the complaint is about (the provider)", body?.body), public: true },
      v("date_of_care", "Date the care happened (first event)", first?.date),
      v("complaint_details", "Details of the complaint: what happened", d.details),
      v("location_details", "Where it happened (hospital, department)", d.location),
      v("desired_outcome", "What they would like to happen as a result", d.outcome),
      ...extra.map((x, i) => v(`user_answer_${i + 1}`, `The patient's answer to the form's question "${x.label}"`, x.value)),
    ].filter((x) => x.value.trim());
  };

  return runCrew<ComplaintResult>(
    {
      prefix: "complaint",
      system: `You lead a crew making a complaint for a patient about their care, in ${placeName}. Discovery already worked out the route (below). Work ONE step at a time and let each result decide the next.
Order (adapt when results call for it, and say why with update_plan): read_rules (Robin) -> find_guidance (Iona; skip with update_plan if the story is not about a condition with clinical guidance) -> investigate (Iona; official decisions, policies and reports to cite; call it once, in the same turn as find_guidance) -> draft_complaint (you) -> fill_form (Kit), or prepare_message if the body takes complaints only by email or post -> finish.
If read_rules says the patient may be outside the time limit, say so with update_plan and ask_user (yes_no) whether to carry on. If fill_form reports a question the patient must answer, ask_user once and call fill_form again with answers (at most twice in total).
Never ask the patient to do browsing or searching for you: the crew does the web work, or reports honestly what it could not reach. Never say anyone was at fault. Never submit anything. Never invent facts.
ROUTE MAP:\n${JSON.stringify({ place: route.place, steps: route.steps.map((s) => ({ kind: s.kind, body: s.body, what: s.what, how: s.how, url: s.url, deadline: s.deadline, wall: s.wall, requires: s.requires })) }, null, 1).slice(0, 6000)}`,
      tools: TOOLS,
      firstInput: `Patient: (name withheld from the planner).\nWhere treated: ${facts.incidentLocation ?? "unknown"}.\nWhat happened:\n${[facts.incidentSummary, ...facts.events.map((e) => `${e.date}: ${e.what}`)].filter(Boolean).join("\n")}\nWhat they would like: ${facts.desiredOutcome || "not said"}.`,
      maxTurns: 14,
      stage: { read_rules: 1, find_guidance: 1, investigate: 1, draft_complaint: 2, fill_form: 3, prepare_message: 3 },
      who: (name): CrewId => (name === "read_rules" ? "robin" : name === "find_guidance" || name === "investigate" ? "iona" : name === "fill_form" ? "kit" : "elliot"),
      doing: (name) =>
        ({ read_rules: `Reading ${body?.body ?? "the provider"}'s complaint rules`, find_guidance: "Finding the clinical guidance", investigate: "Looking for official decisions, policies and reports", draft_complaint: "Writing your complaint", fill_form: `Filling ${body?.body ?? "the"} form`, prepare_message: "Preparing your message" })[name] ?? "Working",
      describe: (name, _a, out) => {
        if (name === "read_rules" && timeLimit) return `${timeLimit.status === "within" ? "You are inside the time limit." : timeLimit.status === "close" ? "You are close to the time limit." : timeLimit.status === "outside" ? "This may be past the time limit." : "I could not tell from your dates."} ${timeLimit.explanation}`;
        if (name === "find_guidance" && proof.guideline?.points.length) return `${proof.guideline.name}: "${proof.guideline.points[0].text}"${proof.gaps?.length ? ` One question to ask: ${proof.gaps[0].question}` : ""}`;
        if (name === "investigate" && investigation) return investigation.items.length ? `Found ${investigation.items.length} official ${investigation.items.length === 1 ? "item" : "items"} you can cite. ${investigation.items[0].publisher}: "${investigation.items[0].quote}"` : "I looked on the official sites and found nothing to cite this time.";
        if (name === "draft_complaint" && draft) return `Written to ${body?.body ?? "the provider"}. ${proof.gaps?.length ? "It asks about the guidance politely, without blaming anyone." : "Facts only, no blame."}${supportFor(investigation).length ? " It cites official material Iona found." : ""}`;
        if (name === "fill_form") return form.status === "ready_to_submit" ? `The form is filled (${form.filled.length} fields) and waiting for you to check it and press Submit yourself.` : form.status === "needs_input" ? `Filled as far as I could. It still needs: ${form.unfilled.join(", ") || "an answer from you"}.` : out;
        if (name === "prepare_message" && message) return `Your message is ready to send. ${out}`;
        return out.split("\n")[0];
      },
      exec: async (call, a, thought, kit) => {
        const ctxFor = (p: WorkerCtx["page"], note: WorkerCtx["note"], who: CrewId): WorkerCtx => ({ page: p, note, track: kit.track, ask: (spec) => kit.ask({ ...spec, crew: who }) });
        switch (call.name) {
          case "read_rules": {
            const url = body?.url ?? body?.sources[0]?.url;
            if (!url) return "Could not read the rules: discovery found no page for the complaint body.";
            const page = body?.how === "online_form" && body.sources[0]?.url ? body.sources[0].url : url;
            const r = await kit.inTab(thought, "robin", short(body?.body ?? "Rules", 26), (p, note) => readPage(ctxFor(p, note, "robin"), page, "How does a patient complain: the stages, response times, the time limit for complaining, and what to include?"), 90_000);
            if (!r.ok) return `Could not read the rules: ${r.error}`;
            const today = new Date().toISOString().slice(0, 10);
            const lim = await structured({
              ...modelFor("reason", ["health"]), // the patient's timeline: on this Mac by default
              instructions: "Check a patient's complaint against a time limit, using only the page text for the limit and only the patient's timeline for the dates. Never guess a date.",
              input: `Today: ${today}\nPage answer: ${r.value.answer}\nQuotes: ${r.value.quotes.map((q) => q.quote).join(" | ")}\nRoute deadline: ${body?.deadline ?? ""}\nTimeline:\n${facts.events.map((e) => `${e.date}: ${e.what}`).join("\n")}`,
              schema: Limit,
              name: "time_limit",
              data: ["health"],
            });
            process = { summary: r.value.answer, steps: lim.steps, support: "", url: r.value.url };
            timeLimit = { limit: lim.limit, status: lim.status, explanation: lim.explanation, url: r.value.url };
            kit.finding(`Time limit: ${lim.limit || "not stated"}`, r.value.url, "robin");
            return `Status: ${lim.status}. ${lim.limit}\n${lim.explanation}\nSteps: ${lim.steps.join(" -> ")}\nInclude: ${lim.include.join("; ")}`;
          }
          case "find_guidance": {
            const g = await findGuidance(kit, thought, route, facts, String(a.condition ?? "the patient's condition"), proof);
            guideline = g.guideline ?? guideline;
            return g.text;
          }
          case "investigate": {
            if (investigation) return "Already investigated; use draft_complaint.";
            const brief = String(a.issue ?? "").trim() ? { condition: String(a.condition ?? "").trim() || "the patient's condition", issue: String(a.issue).trim() } : await describeIssue(facts);
            investigation = await investigate(kit, thought, route, brief, proof, { focus: "complaint" });
            return describeInvestigation(investigation);
          }
          case "draft_complaint": {
            const gp = proof.guideline?.points[0];
            draft = await draftComplaintTo(facts, { body: body?.body ?? "the health provider", place: placeName }, gp && proof.gaps?.[0] ? { guideline: proof.guideline!.name, point: gp.text, question: proof.gaps[0].question } : undefined, supportFor(investigation));
            kit.finding(`Complaint written to ${body?.body ?? "the provider"} (${draft.details.split(/\s+/).length} words)`, undefined, "elliot");
            // The letter is written on this Mac and stays out of the cloud planner's conversation (privacy, Codex round 3).
            return `Drafted (${draft.details.split(/\s+/).length} words). The text stays on the patient's device; you do not need it to continue.`;
          }
          case "fill_form": {
            if (!draft) return "Write the complaint first (draft_complaint).";
            // Only the generic essentials: one provider's own extra questions (e.g. an email-risk consent) are the form's to ask, not ours to require.
            const missing = missingRequired(facts).filter((k) => !NHS_ONLY.includes(k));
            if (missing.length) return `Blocked: the profile is missing ${missing.join(", ")}.`;
            if (fills >= 2) return "Blocked: the form was already filled twice. Finish now.";
            fills++;
            for (const x of (a.answers as { label: string; value: string }[] | undefined) ?? []) if (x?.label && x?.value) extra.push({ label: String(x.label), value: String(x.value) });
            const d = draft;
            const r = await kit.inTab(thought, "kit", short(body?.body ?? "Form", 26), async (p, note) => {
              const ctx = ctxFor(p, note, "kit");
              let url = body?.how === "online_form" ? body.url : undefined;
              if (!url) {
                const start = body?.url ?? body?.sources[0]?.url;
                if (!start) return { kind: "none" as const, detail: "No page to start from." };
                const found = await exploreSite(ctx, start, `the online form to make a complaint about care at ${facts.incidentLocation ?? "the hospital"}`, { want: "form" });
                if (!found.ok) return { kind: "none" as const, detail: `${found.summary}${found.wall ? ` (${found.wall.kind}: ${found.wall.detail})` : ""}` };
                url = found.url;
              } else await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
              const out = await fillForm(ctx, { goal: `Make a complaint to ${body?.body ?? "the health provider"} about the patient's care`, values: values(d) });
              if (out.status === "ready_to_submit" || out.status === "needs_input") kit.keep(p);
              return { kind: "filled" as const, out, url: p.url() };
            }, 300_000);
            if (!r.ok) {
              form = { ...form, status: "failed", note: `Stopped: ${r.error}` };
              return `The form could not be filled: ${r.error}`;
            }
            if (r.value.kind === "none") {
              form = { ...form, status: "failed", note: r.value.detail };
              return `No online form: ${r.value.detail}. Use prepare_message if the body takes complaints by email or post.`;
            }
            const o = r.value.out;
            form = {
              // Fields filled but the finishing button not identified: that is "filled as far as we could", not a failure.
              status: o.status === "ready_to_submit" ? "ready_to_submit" : o.status === "needs_input" || (o.status === "failed" && o.pages.some((pg) => pg.filled.length > 0)) ? "needs_input" : "failed",
              filled: o.pages.flatMap((pg) => pg.filled),
              unfilled: o.unfilled,
              note: o.summary,
              url: r.value.url,
              handedOff: o.handedOff || undefined,
            };
            kit.finding(form.status === "ready_to_submit" ? `${body?.body ?? "The"} form is filled, waiting for you to submit` : `The form needs: ${o.unfilled.join(", ") || o.summary}`, r.value.url, "kit");
            return o.status === "ready_to_submit" ? `Form filled across ${o.pages.length} page(s), ${form.filled.length} fields. Stopped before "${o.finalSubmitLabel ?? "Submit"}".` : o.status === "blocked" ? `Blocked: ${o.wall?.kind ?? ""} ${o.wall?.detail ?? o.summary}` : `Status: ${o.status}. Still needs: ${o.unfilled.join(", ")}. ${o.summary}`;
          }
          case "prepare_message": {
            if (!draft) return "Write the complaint first (draft_complaint).";
            // Robin reads the body's own page for where complaints go: an email or postal address, quoted and checked.
            const page = body?.url ?? body?.sources[0]?.url;
            let to = "";
            let toQuote = "";
            if (page) {
              const r = await kit.inTab(thought, "robin", short(`${body?.body ?? "Provider"} contact`, 26), (p, note) => readPage({ page: p, note, track: kit.track }, page, "Exactly which email address or postal address should a patient send a complaint to? Quote the address."), 90_000);
              if (r.ok) {
                // Only an email address that code finds inside a checked quote from their page counts (never the model's answer text).
                const q = r.value.quotes.find((x) => x.checked && /[\w.+-]+@[\w-]+(\.[\w-]+)+/.test(x.quote));
                to = q?.quote.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/)?.[0] ?? "";
                toQuote = q?.quote ?? "";
              }
            }
            message = `${to ? `To: ${to}\n` : ""}Subject: Complaint about my care at ${facts.incidentLocation ?? "your hospital"}\n\nDear ${body?.body ?? "Complaints team"},\n\n${draft.details}${draft.outcome ? `\n\nWhat I would like: ${draft.outcome}` : ""}\n\nYours sincerely,\n${[facts.firstName, facts.lastName].filter(Boolean).join(" ")}\n${[facts.address, facts.postcode].filter(Boolean).join(", ")}\n${facts.phone ?? ""}\n${facts.email ?? ""}`;
            form = { ...form, status: "not_started", note: to ? `${body?.body ?? "The provider"} takes complaints by email or post. Your message is ready to send to ${to}.` : `${body?.body ?? "The provider"} takes complaints by email or post. Your message is ready; we could not confirm the address on their page.`, url: page ?? form.url };
            if (to) kit.finding(`Complaints go to ${to}`, page, "robin");
            return to ? `Message ready. Send it to: ${to}${toQuote ? ` (their page: "${short(toQuote, 120)}")` : ""}` : "Message ready, but the address could not be confirmed on their page.";
          }
          default:
            return `Unknown tool ${call.name}`;
        }
      },
      failed: (name, out) => /^(Error|Could not|Blocked|The form could not)/.test(out) || (name === "fill_form" && /^No online form/.test(out)),
      finish: (kit, x) => {
        const result: ComplaintResult = { runId: kit.runId, runDir: kit.runDir, plan: x.plan, thoughts: x.thoughts, turns: x.turns, says: x.says, trace: kit.tracer.steps, stats: kit.track.stats, asks: x.asks, process, timeLimit, evidence: proof, draft, form, message };
        kit.emit({ type: "complaint_result", result });
        return result;
      },
    },
    opts,
  );
}
