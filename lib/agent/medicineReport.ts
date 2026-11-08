import { z } from "zod";
import type { CaseFacts } from "./facts";
import { EFFORT, MODELS, modelFor, structured } from "./llm";
import type { Emit } from "./planner";
import { searchViaApi } from "./planner";
import { ASK_TOOL, FINISH_TOOL, PLAN_TOOL, runCrew, tool, tabName, type CrewKit } from "./crewRun";
import type { CrewId, MedicineResult, Thought } from "./plannerTypes";
import type { MedicineReport } from "./medicine";
import { cleanRoute, type RouteMap } from "./routeTypes";
import { recordAccess } from "./access";
import { exploreSite, readPage } from "./workers/explore";
import { fillForm } from "./workers/fillForm";
import type { Value, WorkerCtx } from "./workers/types";

/**
 * Report a medicine problem, anywhere (the optional extra step when the story involves a medicine, a side effect or a
 * device). Nothing per country is in this file: Robin finds the place's own medicines regulator and its reporting page
 * live (search API, then the page read and quoted), Iona reads the medicine and the side effect out of the patient's own
 * story (on this Mac), and Kit explores to the regulator's online report form, fills it page by page and stops before the
 * final submit. In the UK that is the MHRA's Yellow Card; elsewhere it is whatever that country runs.
 */

const TOOLS = [
  PLAN_TOOL,
  tool("find_regulator", "Robin: find the place's own medicines regulator and its page for members of the public to report a suspected side effect or a problem with a medicine or device.", {}, []),
  tool("read_medicine", "Iona: read the medicine, the side effect, when it started and how it ended from the patient's own story.", {}, []),
  tool("fill_report", "Kit: go from the regulator's page to its online report form, fill it with the patient's details, the medicine and the side effect, page by page, and stop before the final submit.", {}, []),
  ASK_TOOL,
  FINISH_TOOL,
];

const Pick = z.object({
  result: z.number().describe("The number of the search result that is the regulator's OWN page for the public to report a side effect; -1 if none is"),
  body: z.string().describe("The regulator's name as it calls itself, short (e.g. 'MHRA Yellow Card scheme'); empty if none"),
});

const Med = z.object({
  name: z.string().describe("The medicine, vaccine or device, as the patient names it; empty if the story does not say"),
  reactions: z.array(z.string()).describe("Each side effect in plain words, one or two words each (e.g. 'Nausea', 'Dizziness'), from the story only"),
  started: z.string().describe("When the side effect started, in the story's own words; empty if not said"),
  outcome: z.enum(["recovered", "recovering", "not recovered", "recovered with lasting effects", "unknown"]).describe("How the SIDE EFFECT ended (not the injury or illness the medicine was for). If the story says the medicine was stopped and does not mention the side effect lasting, 'recovered'; if it does not say at all, 'unknown'"),
  howBad: z.string().describe("How the SIDE EFFECT affected the patient, one short sentence from the story (e.g. 'Very sick and dizzy, so I stopped taking it'). Never the original injury or illness"),
  narrative: z.string().describe("What happened, first person, two to four plain sentences, from the story only: the medicine, why it was given, the side effect and what the patient did"),
});

export async function runMedicineReport(facts: CaseFacts, routeIn: RouteMap | undefined, opts: { onEvent?: Emit; keepOpen?: boolean; runId?: string } = {}): Promise<MedicineResult> {
  const route = routeIn ? cleanRoute(routeIn) : undefined;
  const place = [route?.place.region, route?.place.country ?? facts.country].filter(Boolean).join(", ") || facts.country || "";
  const country = route?.place.country || facts.country || "";
  const report: MedicineReport = { form: { status: "not_started", filled: [], unfilled: [], note: "The form has not been filled yet.", url: "" } };
  let narrative = "";

  const ctxFor = (kit: CrewKit, p: WorkerCtx["page"], note: WorkerCtx["note"], who: CrewId): WorkerCtx => ({ page: p, note, track: kit.track, ask: (spec) => kit.ask({ ...spec, crew: who }) });
  const tab = (kit: CrewKit, thought: Thought, who: CrewId, task: string) => <T,>(work: (ctx: WorkerCtx) => Promise<T>, ms: number) => kit.inTab(thought, who, tabName(task), (p, note) => work(ctxFor(kit, p, note, who)), ms);

  const values = (): Value[] => {
    const v = (key: string, description: string, value: string | null | undefined): Value => ({ key, description, value: value ?? "" });
    const m = report.medicine;
    const initials = [facts.firstName, facts.lastName].filter(Boolean).map((x) => x![0].toUpperCase()).join("");
    return [
      v("reporter_type", "Who is reporting: a member of the public / patient (not a healthcare professional)", "Member of the public"),
      v("about_whom", "Whose side effect it is: the person reporting (you / myself) or someone else", facts.complainingFor === "someone_else" ? "Someone else" : "Me (myself)"),
      v("report_kind", "What is being reported: a suspected side effect (not a fake or faulty product)", "A suspected side effect"),
      v("title", "Title, e.g. Ms", facts.title),
      v("first_name", "First name / given name", facts.firstName),
      v("last_name", "Last name / surname", facts.lastName),
      v("initials", "The patient's initials", initials),
      v("email", "Email address", facts.email),
      v("phone", "Telephone number", facts.phone),
      v("address", "Postal address (street and town)", facts.address),
      v("postcode", "Postcode", facts.postcode),
      v("medicine", "The medicine, vaccine or product suspected of causing the side effect (its name)", m?.name),
      ...(m?.reactions ?? []).map((r, i) => v(`side_effect_${i + 1}`, `Side effect ${i + 1} (a short medical term or plain word)`, r)),
      v("side_effect_started", "When the side effect started", m?.started),
      v("outcome", "Outcome of the side effect: Recovered, Recovering, Not recovered, Recovered with lasting effects or Unknown", m ? m.outcome.replace(/^./, (c) => c.toUpperCase()) : ""),
      v("how_serious", "How serious it was / how it affected the patient", m?.howBad),
      v("what_happened", "Description of what happened (free text)", narrative),
      v("medicine_reason", "What the medicine was taken for", "Pain after an injury"),
      v("medicine_stopped", "What happened with the medicine after the side effect (stopped, dose reduced, continued)", m && /stop/i.test(narrative) ? "Stopped" : ""),
    ].filter((x) => x.value.trim());
  };

  return runCrew<MedicineResult>(
    {
      prefix: "medicine",
      system: `You lead a crew helping a patient in ${place || "their country"} report a suspected side effect of a medicine to that place's medicines regulator. Nothing is ever sent: the form is filled and left for the patient to check and submit.
FIRST TURN, together: find_regulator (Robin) and read_medicine (Iona). Then fill_report (Kit). Then finish with one or two plain sentences to the patient.
If the story does not name the medicine, ask_user once for it. Never invent a medicine, a side effect or a date. Never say anyone was at fault.`,
      tools: TOOLS,
      firstInput: `Where: ${place || "unknown"}.\nWhat happened (patient's words):\n${[facts.incidentSummary, ...facts.events.map((e) => `${e.date}: ${e.what}`)].filter(Boolean).join("\n")}`,
      maxTurns: 8,
      tabLimit: 4,
      stage: { find_regulator: 1, read_medicine: 1, fill_report: 2 },
      who: (name): CrewId => (name === "find_regulator" ? "robin" : name === "read_medicine" ? "iona" : name === "fill_report" ? "kit" : "elliot"),
      doing: (name) => ({ find_regulator: "Finding the medicines regulator", read_medicine: "Reading the medicine and the side effect", fill_report: `Filling ${report.regulator?.body ?? "the regulator"}'s report` })[name] ?? "Working",
      describe: (name, _a, out) => {
        if (name === "find_regulator" && report.regulator) return `Found ${report.regulator.body}, where anyone can report a side effect.`;
        if (name === "read_medicine" && report.medicine) return `${report.medicine.name || "The medicine"}: ${report.medicine.reactions.join(", ") || "the side effect"}.`;
        if (name === "fill_report") return report.form.status === "ready_to_submit" ? `The report is filled (${report.form.filled.length} fields) and waiting for you to check it and submit it yourself.` : report.form.status === "needs_input" ? `Filled as far as I could. It still needs: ${report.form.unfilled.join(", ")}.` : `The report could not be filled: ${report.form.note}`;
        return out.split("\n")[0];
      },
      exec: async (call, _a, thought, kit) => {
        switch (call.name) {
          case "find_regulator": {
            // The place's own scheme, found by search (no browser), then its page read and quoted.
            const queries = [`report a suspected side effect of a medicine ${country} medicines regulator`, `${place} report side effect medicine online form member of the public`];
            const hits = (await Promise.all(queries.map((q) => searchViaApi(q, kit.track)))).flat();
            const seen = new Set<string>();
            const list = hits.filter((h) => (seen.has(h.url) ? false : (seen.add(h.url), true))).slice(0, 14);
            if (!list.length) return "Could not find the regulator: the search gave nothing.";
            const pick = await structured({
              model: MODELS.browser,
              effort: EFFORT.browser,
              instructions: `Which search result is the OWN page of the medicines regulator in ${country || "this country"} where a member of the public reports a suspected side effect of a medicine? A government or regulator site only, not news, not a charity, not a pharmacy.`,
              input: list.map((h, i) => `${i}. ${h.title} | ${h.url}\n   ${h.snippet.slice(0, 200)}`).join("\n"),
              schema: Pick,
              name: "medicine_regulator",
              data: [],
            });
            const hit = list[pick.result];
            if (!hit) return "Could not find the regulator's reporting page in the search results.";
            const r = await tab(kit, thought, "robin", pick.body || "Regulator")((ctx) => readPage(ctx, hit.url, "Can a member of the public report a suspected side effect of a medicine here, and how (online form)? Quote the sentence that says so."), 90_000);
            if (!r.ok) return `Could not read the regulator's page: ${r.error}`;
            const quote = r.value.quotes.find((q) => q.checked)?.quote;
            report.regulator = { body: pick.body || r.value.title, url: r.value.url, quote };
            kit.finding(`${report.regulator.body}${quote ? `: "${quote}"` : ""}`, r.value.url, "robin");
            return `${report.regulator.body} (${r.value.url}). ${r.value.answer}`;
          }
          case "read_medicine": {
            const m = await structured({
              ...modelFor("draft", ["health"]), // the patient's health story: on this Mac
              instructions: "Read the medicine, the side effect and what happened from a patient's own story, for a report to the medicines regulator. Use ONLY the story. Never invent a medicine, side effect or date; leave a field empty if the story does not say.",
              input: [facts.incidentSummary, ...facts.events.map((e) => `${e.date}: ${e.what}`)].filter(Boolean).join("\n"),
              schema: Med,
              name: "medicine_details",
              data: ["health"],
            });
            // Checked in code, not left to the small local model: "how bad" must be about the side effect itself, and an outcome
            // the story does not state is "unknown" (the form then asks the patient rather than us guessing).
            const reactions = m.reactions.slice(0, 4);
            const story = [facts.incidentSummary, ...facts.events.map((e) => e.what)].join(" ").toLowerCase();
            const aboutReaction = reactions.some((r) => m.howBad.toLowerCase().includes(r.toLowerCase().split(" ").pop() ?? ""));
            const howBad = aboutReaction ? m.howBad : reactions.length ? `${reactions.join(" and ").replace(/^./, (c) => c.toUpperCase())}.` : m.howBad;
            const stated = m.outcome === "unknown" || (m.outcome.startsWith("recover") ? /recover|got better|went away|stopped/.test(story) : /still|ongoing|not (gone|stopped|better)/.test(story));
            report.medicine = { name: m.name, reactions, started: m.started, outcome: stated ? m.outcome : "unknown", howBad };
            narrative = m.narrative;
            if (!m.name) return "The story does not name the medicine. Ask the patient for it.";
            kit.finding(`${m.name}: ${m.reactions.join(", ")}`, undefined, "iona");
            return `Medicine: ${m.name}. Side effects: ${m.reactions.join(", ")}. Started: ${m.started || "not said"}. Outcome: ${m.outcome}.`;
          }
          case "fill_report": {
            if (!report.regulator) return "Find the regulator first (find_regulator).";
            if (!report.medicine) return "Read the medicine first (read_medicine).";
            const reg = report.regulator;
            const r = await tab(kit, thought, "kit", `${reg.body} report`)(async (ctx) => {
              const found = await exploreSite(ctx, reg.url, `the online form where a member of the public reports a suspected side effect of a medicine to ${reg.body}`, { want: "form" });
              if (!found.ok) return { kind: "none" as const, detail: `${found.summary}${found.wall ? ` (${found.wall.kind}: ${found.wall.detail})` : ""}` };
              const out = await fillForm(ctx, { goal: `Report a suspected side effect of ${report.medicine!.name} to ${reg.body}, as a member of the public reporting about themself`, values: values(), maxPages: 12 });
              if (out.status === "ready_to_submit" || out.status === "needs_input") kit.keep(ctx.page);
              return { kind: "filled" as const, out, url: ctx.page.url() };
            }, 360_000);
            if (!r.ok) {
              report.form = { ...report.form, status: "failed", note: `Stopped: ${r.error}` };
              return `The report could not be filled: ${r.error}`;
            }
            if (r.value.kind === "none") {
              report.form = { ...report.form, status: "failed", note: r.value.detail };
              return `No online report form found: ${r.value.detail}`;
            }
            const o = r.value.out;
            report.form = {
              status: o.status === "ready_to_submit" ? "ready_to_submit" : o.status === "needs_input" ? "needs_input" : "failed",
              filled: o.pages.flatMap((pg) => pg.filled),
              unfilled: o.unfilled,
              note: o.status === "blocked" ? `${o.wall?.kind ?? "blocked"}: ${o.wall?.detail ?? o.summary}` : o.summary,
              url: r.value.url,
              handedOff: o.handedOff || undefined,
            };
            recordAccess({ via: "browser", kind: "task", reason: `filled ${reg.body}'s side-effect report (${report.form.filled.length} fields across ${o.pages.length} pages) and stopped before Submit`, url: r.value.url });
            kit.finding(report.form.status === "ready_to_submit" ? `${reg.body}: report filled, waiting for you to submit` : `${reg.body}: ${report.form.note}`, r.value.url, "kit");
            return o.status === "ready_to_submit" ? `Filled across ${o.pages.length} page(s), ${report.form.filled.length} fields. Stopped before "${o.finalSubmitLabel ?? "Submit"}".` : `Status: ${o.status}. ${o.unfilled.length ? `Still needs: ${o.unfilled.join(", ")}. ` : ""}${o.summary}`;
          }
          default:
            return `Unknown tool ${call.name}`;
        }
      },
      failed: (name, out) => /^(Error|Could not|Blocked|The report could not|No online report form)/.test(out),
      finish: (kit, x) => {
        const result: MedicineResult = { ...report, runId: kit.runId, runDir: kit.runDir, plan: x.plan, thoughts: x.thoughts, says: x.says, turns: x.turns, asks: x.asks, trace: kit.tracer.steps, stats: kit.track.stats };
        kit.emit({ type: "medicine_result", result });
        return result;
      },
    },
    opts,
  );
}
