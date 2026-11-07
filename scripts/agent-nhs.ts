// Fill the NHS Lothian form with fictional data and stop before submitting.
import { draftComplaint } from "../lib/agent/draft";
import type { CaseFacts } from "../lib/agent/facts";
import { fillNhsComplaint } from "../lib/agent/nhsLothian";

export const SAMPLE: CaseFacts = {
  complainingFor: "me",
  title: "Ms",
  firstName: "Ailsa",
  lastName: "Reid",
  address: "14 Example Street, Edinburgh",
  postcode: "EH1 1AA",
  phone: "07700 900123",
  email: "ailsa.reid@example.com",
  preferredContact: "Email",
  incidentLocation: "Royal Infirmary of Edinburgh, Accident & Emergency department",
  incidentSummary: "I fell on my outstretched hand. A&E X-rayed my wrist and told me it was a sprain. The pain did not go away.",
  events: [
    { date: "early July 2026", what: "Fell on outstretched hand and attended A&E at the Royal Infirmary. X-rayed, told it was a sprain, sent home." },
    { date: "mid August 2026", what: "Pain continued. My GP sent me back and a second X-ray showed a scaphoid fracture." },
    { date: "November 2026", what: "The fracture has not healed and I now need surgery." },
  ],
  desiredOutcome: "An explanation of why the fracture was missed, and an apology.",
  emailRiskAccepted: process.env.NO_CONSENT ? null : true,
};

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
