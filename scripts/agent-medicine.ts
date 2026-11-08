// Run the medicine report step on a fictional persona, headless:
//   HEADLESS=1 npx tsx --env-file=.env.local scripts/agent-medicine.ts <persona> [route.json]
// Questions get fictional answers (yes/no "No" except agreeing to terms, choice: the first option, text: skipped). Nothing is submitted.
process.env.HANDOFF_WAIT_MS ??= "0";
import { readFileSync, writeFileSync } from "node:fs";
import { personaFacts } from "./personaFacts";
import { runMedicineReport } from "../lib/agent/medicineReport";
import { answerQuestion } from "../lib/agent/planner";

async function main() {
  const [who = "scotland", routePath] = process.argv.slice(2);
  const facts = personaFacts(who);
  const route = routePath ? JSON.parse(readFileSync(routePath, "utf8")) : undefined;
  let runId = "";
  const t0 = Date.now();
  const r = await runMedicineReport(facts, route, {
    onEvent: (e) => {
      if (e.type === "run") runId = e.runId;
      if (e.type === "say" && e.say.kind !== "assign") console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] [${e.say.from}] ${e.say.text.slice(0, 220)}`);
      if (e.type === "ask") {
        const q = e.ask;
        const a = q.kind === "yes_no" ? (/agree|confirm|consent|accept|understand|shall kit press/i.test(q.question) ? "Yes" : "No") : q.kind === "choice" ? (q.options?.[0] ?? null) : q.kind === "number" || q.kind === "money" ? "20" : /age/i.test(q.question) ? "20" : /sex|gender/i.test(q.question) ? "Female" : null;
        console.log(`ASK (${q.kind}) ${q.question} -> ${a}`);
        setTimeout(() => answerQuestion(runId, q.id, a), 800);
      }
    },
  });
  writeFileSync(`${r.runDir}/result.json`, JSON.stringify({ ...r, trace: undefined, thoughts: undefined }, null, 2));
  console.log(`\nMEDICINE ${r.runId} ${((Date.now() - t0) / 60000).toFixed(1)} min\n  regulator: ${r.regulator?.body} ${r.regulator?.url}\n  medicine: ${JSON.stringify(r.medicine)}\n  form: ${r.form.status}, ${r.form.filled.length} fields, unfilled: ${r.form.unfilled.join(", ") || "none"} | ${r.form.note.slice(0, 200)} | ${r.form.url}`);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
