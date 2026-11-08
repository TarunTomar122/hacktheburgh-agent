// One case end to end, headless: research the place (discovery), then prepare the case (compensation), timed.
//   HEADLESS=1 npx tsx --env-file=.env.local scripts/e2e-case.ts <persona> [--route=.runs/<discovery>/route.json]
// Questions from the crew get fictional answers (money 14000, yes/no "No" except "I have read / I agree" which gets "Yes", choice: the first option). Nothing is sent:
// the crew stops before every Send. Prints how each page and job reached the web (fetch, search API, cache, browser).
process.env.HANDOFF_WAIT_MS ??= "0";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { personaFacts } from "./personaFacts";
import { runDiscovery } from "../lib/agent/discovery";
import { runCompensationAnywhere } from "../lib/agent/compensationAnywhere";
import { answerQuestion } from "../lib/agent/planner";
import type { Access } from "../lib/agent/access";
import type { PlannerEvent } from "../lib/agent/plannerTypes";

const who = process.argv[2] ?? "scotland";
const routeArg = process.argv.find((a) => a.startsWith("--route="))?.slice(8);
const t0 = Date.now();
const s = () => `${((Date.now() - t0) / 1000).toFixed(0)}s`;

function listener(tag: string) {
  let runId = "";
  return (e: PlannerEvent) => {
    if (e.type === "run") runId = e.runId;
    if (e.type === "say" && e.say.kind !== "assign") console.log(`[${s()}] ${tag} [${e.say.from}] ${e.say.text.slice(0, 200)}`);
    if (e.type === "ask") {
      const a = e.ask.kind === "money" || e.ask.kind === "number" ? "14000" : e.ask.kind === "yes_no" ? (/confirm|agree|understand|accept|disclaimer|read the/i.test(e.ask.question) ? "Yes" : "No") : e.ask.kind === "choice" ? (e.ask.options?.[0] ?? null) : null;
      console.log(`[${s()}] ${tag} ASK (${e.ask.kind}) ${e.ask.question} -> ${a}`);
      setTimeout(() => answerQuestion(runId, e.ask.id, a), 800);
    }
  };
}

function accessSummary(runDir: string) {
  const f = path.join(runDir, "access.ndjson");
  if (!existsSync(f)) return "no access log";
  const xs = readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Access);
  const n = (k: Access["kind"], v: Access["via"]) => xs.filter((x) => x.kind === k && x.via === v).length;
  const why = [...new Set(xs.filter((x) => x.via === "browser").map((x) => `${x.kind}: ${x.reason}`))];
  return `pages fetch ${n("page", "fetch")} / browser ${n("page", "browser")}; firms fetch ${n("firm", "fetch")} / browser ${n("firm", "browser")}; searches api ${n("search", "api")} cache ${n("search", "cache")} browser ${n("search", "browser")}; browser jobs ${xs.filter((x) => x.kind === "task").length}\n  browser because: ${why.join(" | ")}`;
}

async function main() {
  const facts = personaFacts(who);
  let route;
  let discoveryMs = 0;
  if (routeArg) route = JSON.parse(readFileSync(routeArg, "utf8"));
  else {
    const d = await runDiscovery(facts, { onEvent: listener("research") });
    writeFileSync(`${d.runDir}/route.json`, JSON.stringify(d.route, null, 2));
    discoveryMs = Date.now() - t0;
    console.log(`\nRESEARCH ${d.runId} ${(discoveryMs / 60000).toFixed(1)} min: ${d.route.steps.map((x) => `${x.kind}=${x.body} (${x.confidence})`).join("; ")}\n  ${accessSummary(d.runDir)}\n`);
    route = d.route;
  }
  const c0 = Date.now();
  const r = await runCompensationAnywhere(facts, route, { onEvent: listener("case") });
  const caseMs = Date.now() - c0;
  writeFileSync(`${r.runDir}/result.json`, JSON.stringify({ ...r, trace: undefined, thoughts: undefined }, null, 2));
  const checked = r.firms.filter((f) => f.sources.includes("website"));
  console.log(
    `\nCASE ${r.runId} ${(caseMs / 60000).toFixed(1)} min (research ${(discoveryMs / 60000).toFixed(1)} min)\n  funding: ${r.verdict} "${r.calculatorText.slice(0, 160)}"\n  firms: ${r.firms.length} found, ${checked.length} checked on their sites, shortlist ${r.shortlist.join(", ")}\n  guidance: ${r.evidence.guideline ? `${r.evidence.guideline.name}: "${r.evidence.guideline.points[0]?.text.slice(0, 120)}"` : "none"}; gaps ${r.evidence.gaps?.length ?? 0}; decisions ${r.evidence.investigation?.items.length ?? 0}\n  enquiries: ${r.enquiries.map((e) => `${e.firmName}: ${e.status} (${e.filled.length} fields)`).join("; ")}\n  questions to the patient: ${r.asks}\n  ${accessSummary(r.runDir)}`,
  );
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
