// Run discovery (night plan, "Elliot anywhere") on a fictional persona, headless: npx tsx --env-file=.env.local scripts/agent-discovery.ts wales
// RECORD_VIDEO=docs/night-runs/<run>/video records every tab. Answers any question with ANSWER (default: skip).
import { writeFileSync } from "node:fs";
import { personaFacts } from "./personaFacts";
import { runDiscovery } from "../lib/agent/discovery";
import { answerQuestion } from "../lib/agent/planner";

async function main() {
  const who = process.argv[2] ?? "wales";
  const facts = personaFacts(who);
  let runId = "";
  const t0 = Date.now();
  const r = await runDiscovery(facts, {
    onEvent: (e) => {
      if (e.type === "run") runId = e.runId;
      if (e.type === "place") console.log(`PLACE: ${JSON.stringify(e.place)}`);
      if (e.type === "say") console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] [${e.say.from}${e.say.to ? ` → ${e.say.to}` : ""}] ${e.say.text.slice(0, 220)}`);
      if (e.type === "ask") {
        console.log(`ASK: ${e.ask.question}`);
        setTimeout(() => answerQuestion(runId, e.ask.id, process.env.ANSWER ?? null), 1000);
      }
    },
  });
  writeFileSync(`${r.runDir}/route.json`, JSON.stringify(r.route, null, 2));
  console.log(`\nRUN ${r.runId} in ${((Date.now() - t0) / 60000).toFixed(1)} min, ${r.turns} turns, stats ${JSON.stringify(r.stats)}`);
  for (const s of r.route.steps) console.log(`- ${s.kind}: ${s.body} | ${s.how}${s.url ? ` ${s.url}` : ""} | ${s.confidence} (${s.sources.filter((x) => x.checked).length}/${s.sources.length} checked)${s.wall ? ` | wall: ${s.wall}` : ""}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
