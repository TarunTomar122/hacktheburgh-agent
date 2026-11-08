// Fill the NHS Lothian form with fictional data and stop before submitting.
process.env.HANDOFF_WAIT_MS ??= "0";
import { draftComplaint } from "../lib/agent/draft";
import type { CaseFacts } from "../lib/agent/facts";
import { fillNhsComplaint } from "../lib/agent/nhsLothian";
import { SAMPLE_FACTS } from "../lib/agent/sample";

// Fictional demo patient shared with the UI skip button (lib/agent/sample.ts). NO_CONSENT=1 withholds the email consent.
export const SAMPLE: CaseFacts = { ...SAMPLE_FACTS, emailRiskAccepted: process.env.NO_CONSENT ? null : true };

async function main() {
  console.log("Drafting complaint text...");
  const draft = await draftComplaint(SAMPLE);
  console.log("\n--- DRAFT details ---\n" + draft.details + "\n--- location ---\n" + draft.location + "\n--- outcome ---\n" + draft.outcome + "\n");

  const result = await fillNhsComplaint(SAMPLE, draft, {
    onEvent: (e) => {
      if (e.type === "action") console.log(`  step ${e.step} ${e.tool}(${JSON.stringify(e.args).slice(0, 90)}) -> ${e.result}`);
      else if (e.type === "blocked") console.log(`  step ${e.step} ${e.reason}`);
      else if (e.type === "observe") console.log(`step ${e.step}: sees ${e.fields} elements`);
      else if (e.type === "status") console.log(e.message);
    },
  });
  console.log("\nRESULT", JSON.stringify({ status: result.status, steps: result.steps, unfilled: result.unfilled, question: result.question, summary: result.summary }, null, 2));
  console.log("Screenshot:", result.screenshot);
}

if (process.argv[1]?.includes("agent-nhs")) main().catch((e) => { console.error(e); process.exit(1); });
