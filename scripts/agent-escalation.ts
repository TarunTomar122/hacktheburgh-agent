// Run the generic escalation crew (step 2 anywhere) on a fictional persona and a saved route map, headless:
//   IN_APP_BROWSER=1 LIVEVIEW=0 npx tsx --env-file=.env.local scripts/agent-escalation.ts <persona> <route.json> [complaint-result.json] [--not-sent|--no-reply]
// Progress defaults to: complaint sent, final response received, with a short fictional reply. The complaint text comes
// from a saved complaint run's result.json when given. Questions from the crew get fictional answers:
// yes/no -> "No", choice -> the first option, text -> skipped. Nothing is ever submitted or sent.
import { readFileSync, writeFileSync } from "node:fs";
import { runEscalationAnywhere } from "../lib/agent/escalationAnywhere";
import { answerQuestion } from "../lib/agent/planner";
import type { EscalationInput, PlannerEvent } from "../lib/agent/plannerTypes";

async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const [who, routePath, complaintPath] = args.filter((a) => !a.startsWith("--"));
  const facts = JSON.parse(readFileSync(`scripts/personas/${who}.json`, "utf8"));
  const raw = JSON.parse(readFileSync(routePath, "utf8"));
  const route = raw.route ?? raw;
  const complaint = complaintPath ? JSON.parse(readFileSync(complaintPath, "utf8")) : null;
  const provider = route.steps.find((s: { kind: string }) => s.kind === "complaint")?.body ?? "the hospital";
  const progress: EscalationInput = flags.has("--not-sent")
    ? { complaintSent: false, finalResponse: "no" }
    : {
        complaintSent: true,
        finalResponse: flags.has("--no-reply") ? "no" : "yes",
        complaintText: complaint?.draft?.details,
        providerReply: flags.has("--no-reply") ? undefined : `${provider} wrote that the wrist was examined and X-rayed in line with its procedures, the X-ray was reported as showing no fracture at the time, and it apologised that I had a poor experience. It did not explain why no follow-up was arranged.`,
      };
  let runId = "";
  const t0 = Date.now();
  const onEvent = (e: PlannerEvent) => {
    if (e.type === "run") runId = e.runId;
    if (e.type === "say") console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] [${e.say.from}${e.say.to ? ` → ${e.say.to}` : ""}] ${e.say.text.slice(0, 260)}`);
    if (e.type === "finding") console.log(`  finding (${e.crew ?? "?"}): ${e.text}${e.source ? ` <${e.source}>` : ""}`);
    if (e.type === "ask") {
      const a = e.ask.kind === "money" || e.ask.kind === "number" ? "14000" : e.ask.kind === "yes_no" ? "No" : e.ask.kind === "choice" ? (e.ask.options?.[0] ?? null) : null;
      console.log(`ASK (${e.ask.kind}): ${e.ask.question} -> ${a}`);
      setTimeout(() => answerQuestion(runId, e.ask.id, a), 800);
    }
  };
  console.log(`Progress: ${JSON.stringify({ ...progress, complaintText: progress.complaintText ? `${progress.complaintText.length} chars` : undefined })}`);
  const r = await runEscalationAnywhere(facts, route, { onEvent, progress });
  writeFileSync(`${r.runDir}/result.json`, JSON.stringify({ ...r, trace: undefined, thoughts: undefined }, null, 2));
  console.log(`\nRUN ${r.runId} ${((Date.now() - t0) / 60000).toFixed(1)} min; body ${r.body}; ready ${r.ready?.status} ("${r.ready?.when ?? ""}"); limit ${r.timeLimit?.status} "${r.timeLimit?.limit ?? ""}"; form ${r.form.status} (${r.form.filled.length} fields, unfilled: ${r.form.unfilled.join(", ") || "none"}) at ${r.form.url} — ${r.form.note}; sendTo ${r.sendTo ? `${r.sendTo.kind} ${r.sendTo.address}` : "none"}; letter ${r.message ? "yes" : "no"}; stats ${JSON.stringify(r.stats)}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
