// Fill the SPSO complaint form with the fictional demo patient and stop before submitting. Prints every action.
process.env.HANDOFF_WAIT_MS ??= "0";
import { SAMPLE_DRAFT, SAMPLE_FACTS, SAMPLE_SPSO } from "../lib/agent/sample";
import { fillSpsoComplaint } from "../lib/agent/spso";

async function main() {
  const result = await fillSpsoComplaint(SAMPLE_FACTS, SAMPLE_DRAFT, SAMPLE_SPSO, {
    onEvent: (e) => {
      if (e.type === "action") console.log(`  step ${e.step} ${e.tool}(${JSON.stringify(e.args).slice(0, 90)}) -> ${e.result}`);
      else if (e.type === "blocked") console.log(`  step ${e.step} ${e.reason}`);
      else if (e.type === "observe") console.log(`step ${e.step}: ${e.url} sees ${e.fields} elements`);
      else if (e.type === "status") console.log(e.message);
    },
  });
  console.log("\nRESULT", JSON.stringify({ status: result.status, steps: result.steps, unfilled: result.unfilled, question: result.question, summary: result.summary }, null, 2));
  console.log("Screenshot:", result.screenshot);
}
main().catch((e) => { console.error(e); process.exit(1); });
