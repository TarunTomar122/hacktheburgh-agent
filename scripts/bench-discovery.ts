// Time discovery under different speed settings on one persona (real run: live search and pages, Exa max 10 per run):
//   npx tsx --env-file=.env.local scripts/bench-discovery.ts wales classic/fast [--grade]   (settings split by "/"; e.g. classic/quick/fast/fastmodel+batch)
// Prints one row per setting: wall time, planner time, calls, steps recorded, how many are confirmed, and the answer-key grade.
// Runs one after the other (the search is serialised and the Exa budget is per run). Never submits anything.
process.env.HANDOFF_WAIT_MS ??= "0";
process.env.IN_APP_BROWSER ??= "1";
process.env.LIVEVIEW ??= "0";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { personaFacts } from "./personaFacts";
import { runDiscovery } from "../lib/agent/discovery";
import { parseSpeed, speedLabel } from "../lib/agent/discoverySpeed";
import { answerQuestion } from "../lib/agent/planner";

type Row = { speed: string; sec: number; plannerSec: number; workerSec: number; turns: number; steps: number; confirmed: number; checked: string; grade: string; runId: string };

async function one(who: string, spec: string, grade: boolean): Promise<Row> {
  const t0 = Date.now();
  let runId = "";
  const r = await runDiscovery(personaFacts(who), {
    speed: spec,
    onEvent: (e) => {
      if (e.type === "run") runId = e.runId;
      if (e.type === "ask") setTimeout(() => answerQuestion(runId, e.ask.id, null), 500);
    },
  });
  const sec = (Date.now() - t0) / 1000;
  writeFileSync(`${r.runDir}/route.json`, JSON.stringify(r.route, null, 2));
  const led = existsSync(`${r.runDir}/ledger.ndjson`) ? readFileSync(`${r.runDir}/ledger.ndjson`, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { task: string; ms: number; agent?: string }) : [];
  const planner = led.filter((l) => /planner/.test(l.task)).reduce((a, l) => a + l.ms, 0) / 1000;
  const workers = led.filter((l) => !/planner/.test(l.task)).reduce((a, l) => a + l.ms, 0) / 1000;
  const steps = r.route.steps;
  const sources = steps.flatMap((s) => s.sources);
  let g = "-";
  if (grade) {
    const key = `docs/research/jurisdictions/${who}.md`;
    if (existsSync(key)) {
      try {
        const out = execFileSync("npx", ["tsx", "--env-file=.env.local", "scripts/grade-route.ts", `${r.runDir}/route.json`, key], { encoding: "utf8" });
        g = out.match(/SCORE ([\d.]+)/)?.[1] ?? "?";
      } catch {
        g = "err";
      }
    }
  }
  return { speed: speedLabel(parseSpeed(spec)), sec: Math.round(sec), plannerSec: Math.round(planner), workerSec: Math.round(workers), turns: r.turns, steps: steps.length, confirmed: steps.filter((s) => s.confidence === "confirmed").length, checked: `${sources.filter((s) => s.checked).length}/${sources.length}`, grade: g, runId: r.runId };
}

async function main() {
  const who = process.argv[2] ?? "wales";
  const specs = (process.argv[3] ?? "classic/fast").split("/").filter(Boolean); // settings separated by "/", levers by "+" or ","
  const grade = process.argv.includes("--grade");
  const rows: Row[] = [];
  for (const spec of specs) {
    console.log(`\n== ${who} · ${spec} ==`);
    try {
      rows.push(await one(who, spec, grade));
    } catch (e) {
      console.log(`failed: ${e instanceof Error ? e.message : e}`);
    }
    const last = rows[rows.length - 1];
    if (last) console.log(JSON.stringify(last));
  }
  const table = ["| speed | total s | planner s | model calls s | turns | steps | confirmed | quotes checked | grade |", "|---|---|---|---|---|---|---|---|---|", ...rows.map((r) => `| ${r.speed} | ${r.sec} | ${r.plannerSec} | ${r.workerSec} | ${r.turns} | ${r.steps}/8 | ${r.confirmed} | ${r.checked} | ${r.grade} |`)].join("\n");
  console.log(`\n${table}`);
  writeFileSync(`docs/night-runs/bench-discovery-${who}-${Date.now()}.md`, `# Discovery speed bench: ${who}\n\n${table}\n\n${rows.map((r) => `- ${r.speed}: .runs/${r.runId}`).join("\n")}\n`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
