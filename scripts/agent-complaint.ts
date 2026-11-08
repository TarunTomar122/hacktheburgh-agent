// Run the complaint crew (D65) on the fictional demo patient, headless, and stop before Submit. Used to record the demo run.
// IN_APP_BROWSER=1 keeps the browser invisible. Answers any question the crew asks with ANSWER (default "yes").
process.env.HANDOFF_WAIT_MS ??= "0";
import { runComplaint } from "../lib/agent/complaintPlanner";
import { answerQuestion } from "../lib/agent/planner";
import { DEMO_PERSONAS } from "../lib/agent/sample";

async function main() {
  const persona = DEMO_PERSONAS.find((p) => p.id === (process.env.PERSONA ?? "compensation"))!; // Ailsa, the missed scaphoid fracture
  const preferredContact = persona.facts.preferredContact ?? "Email";
  const facts = { ...persona.facts, preferredContact, emailRiskAccepted: preferredContact === "Email" ? true : persona.facts.emailRiskAccepted };
  let runId = "";
  const result = await runComplaint(facts, {
    onEvent: (e) => {
      if (e.type === "run") runId = e.runId;
      if (e.type === "say") console.log(`[${e.say.from}${e.say.to ? ` → ${e.say.to}` : ""}] ${e.say.text}`);
      if (e.type === "ask") {
        console.log(`ASK: ${e.ask.question}`);
        setTimeout(() => answerQuestion(runId, e.ask.id, process.env.ANSWER ?? (e.ask.kind === "yes_no" ? "yes" : "none")), 1500);
      }
      if (e.type === "error") console.log("ERROR", e.message);
    },
  });
  console.log("\nRUN", result.runId, "form:", result.form.status, "filled:", result.form.filled.length, "unfilled:", result.form.unfilled.join(", "));
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
