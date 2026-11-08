// Fill the MHRA Yellow Card report with the fictional demo patient and stop before "Submit". Prints every action.
// Run: npm run agent:yellowcard            (the user is the patient)
//      npm run agent:yellowcard -- --someone-else   (checks that it asks for the patient's initials)
// The engine can never press Register, Submit or Send. Nothing is sent.
import { SAMPLE_FACTS } from "../lib/agent/sample";
import { fillYellowCard } from "../lib/agent/yellowCard";

async function main() {
  const someoneElse = process.argv.includes("--someone-else");
  const facts = someoneElse ? { ...SAMPLE_FACTS, complainingFor: "someone_else" as const } : SAMPLE_FACTS;
  const result = await fillYellowCard(
    facts,
    {
      kind: "side_effect",
      product: "ibuprofen",
      reaction: "I took ibuprofen for back pain and got a bad headache and felt dizzy within an hour. It cleared the next day.",
      privacyAgreed: true,
    },
    {
      onEvent: (e) => {
        if (e.type === "action") console.log(`  step ${e.step} ${e.tool}(${JSON.stringify(e.args).slice(0, 100)}) -> ${e.result}`);
        else if (e.type === "blocked") console.log(`  step ${e.step} ${e.reason}`);
        else if (e.type === "observe") console.log(`step ${e.step}: ${e.url.split("?")[0]} sees ${e.fields} elements`);
        else if (e.type === "status") console.log(e.message);
      },
    },
  );
  console.log("\nRESULT", JSON.stringify({ status: result.status, steps: result.steps, unfilled: result.unfilled, question: result.question, summary: result.summary, product: result.product }, null, 2));
  console.log("Screenshot:", result.screenshot);
  console.log("Log:", result.runDir);
}
main().catch((e) => { console.error(e); process.exit(1); });
