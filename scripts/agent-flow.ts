// Run a generic flow ("Elliot anywhere") on a fictional persona and a saved route map, headless:
//   npx tsx --env-file=.env.local scripts/agent-flow.ts <persona> <complaint|compensation> <route.json>
// Questions from the crew get fictional answers: money -> 14000, yes/no -> "No", choice -> the first option, text -> skipped.
process.env.HANDOFF_WAIT_MS ??= "0";
import { readFileSync, writeFileSync } from "node:fs";
import { personaFacts } from "./personaFacts";
import { runComplaintAnywhere } from "../lib/agent/complaintAnywhere";
import { runCompensationAnywhere } from "../lib/agent/compensationAnywhere";
import { answerQuestion } from "../lib/agent/planner";

async function main() {
  const [who, flow, routePath] = process.argv.slice(2);
  const facts = personaFacts(who);
  const route = JSON.parse(readFileSync(routePath, "utf8"));
  let runId = "";
  const t0 = Date.now();
  const onEvent = (e: import("../lib/agent/plannerTypes").PlannerEvent) => {
    if (e.type === "run") runId = e.runId;
    if (e.type === "say") console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] [${e.say.from}${e.say.to ? ` → ${e.say.to}` : ""}] ${e.say.text.slice(0, 240)}`);
    if (e.type === "ask") {
      const a = e.ask.kind === "money" || e.ask.kind === "number" ? "14000" : e.ask.kind === "yes_no" ? "No" : e.ask.kind === "choice" ? (e.ask.options?.[0] ?? null) : null;
      console.log(`ASK (${e.ask.kind}): ${e.ask.question} -> ${a}`);
      setTimeout(() => answerQuestion(runId, e.ask.id, a), 800);
    }
  };
  if (flow === "complaint") {
    const r = await runComplaintAnywhere(facts, route, { onEvent });
    writeFileSync(`${r.runDir}/result.json`, JSON.stringify({ ...r, trace: undefined, thoughts: undefined }, null, 2));
    console.log(`\nRUN ${r.runId} ${((Date.now() - t0) / 60000).toFixed(1)} min; form ${r.form.status} (${r.form.filled.length} fields, unfilled: ${r.form.unfilled.join(", ") || "none"}) at ${r.form.url}; limit ${r.timeLimit?.status}; guidance ${r.evidence.guideline?.points.length ?? 0} points; stats ${JSON.stringify(r.stats)}`);
  } else {
    const r = await runCompensationAnywhere(facts, route, { onEvent });
    writeFileSync(`${r.runDir}/result.json`, JSON.stringify({ ...r, trace: undefined, thoughts: undefined }, null, 2));
    console.log(`\nRUN ${r.runId} ${((Date.now() - t0) / 60000).toFixed(1)} min; verdict ${r.verdict} "${r.calculatorText.slice(0, 120)}"; firms ${r.firms.length}, checked ${r.firms.filter((f) => f.sources.includes("website")).length}, ruled out ${r.firms.filter((f) => f.excluded).length}; shortlist ${r.shortlist.join(", ")}; enquiries ${r.enquiries.map((e) => `${e.firmName}: ${e.status}`).join("; ")}; stats ${JSON.stringify(r.stats)}`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
