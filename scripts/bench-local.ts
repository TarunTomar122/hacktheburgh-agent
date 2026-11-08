// Local vs cloud on the same private-data tasks. Fictional personas only.
//   npx tsx --env-file=.env.local scripts/bench-local.ts [--reps 3] [--personas scotland,wales] [--configs cloud,qwen3,lfm2,qwen3-think]
//     [--tasks care_comparison,complaint_draft,time_limit] [--out docs/night-runs/some-name]
// Configs force Qwen3's thinking off (LOCAL_THINK=0) or on (LOCAL_THINK=1), whatever the production default per task.
// Writes docs/night-runs/local-vs-cloud.md (table) and local-vs-cloud.json (every output, score and ledger entry).
// Text below the "<!-- by hand -->" marker in the .md is kept across reruns.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { judgeTimeLimit } from "../lib/agent/complaintAgents";
import { draftComplaintTo } from "../lib/agent/draft";
import { compareCare, type GuidelineReading } from "../lib/agent/evidence";
import type { CaseFacts } from "../lib/agent/facts";
import { withLedger, type LedgerEntry } from "../lib/agent/ledger";
import { MODELS, structured } from "../lib/agent/llm";

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const REPS = Number(arg("reps") ?? 3);
const TODAY = "2026-11-07";
const OUT = arg("out") ?? "docs/night-runs/local-vs-cloud"; // a different --out for a partial rerun keeps the main table
const OUT_MD = `${OUT}.md`;
const OUT_JSON = `${OUT}.json`;
const JUDGE = process.env.JUDGE_MODEL ?? MODELS.draft;

type Config = { id: string; label: string; where: "cloud" | "local"; env: Record<string, string>; private?: string; cases?: string[] };
const CONFIGS: Config[] = [
  { id: "cloud", label: MODELS.draft, where: "cloud", env: { LOCAL_MODELS: "0" } },
  { id: "qwen3", label: "local:qwen3:8b", where: "local", env: { LOCAL_MODELS: "1", LOCAL_THINK: "0" }, private: "local:qwen3:8b" },
  { id: "lfm2", label: "local:LFM2-2.6B", where: "local", env: { LOCAL_MODELS: "1", LOCAL_THINK: "0" }, private: "local:hf.co/LiquidAI/LFM2-2.6B-GGUF:Q4_K_M" },
  { id: "qwen3-think", label: "local:qwen3:8b (thinking)", where: "local", env: { LOCAL_MODELS: "1", LOCAL_THINK: "1" }, private: "local:qwen3:8b", cases: ["scotland", "northern-ireland", "scotland-2025"] }, // slow: a subset
].filter((c) => !arg("configs") || arg("configs")!.split(",").includes(c.id)) as Config[];

type Task = "care_comparison" | "complaint_draft" | "time_limit";
const TASKS: Task[] = (["care_comparison", "complaint_draft", "time_limit"] as Task[]).filter((t) => !arg("tasks") || arg("tasks")!.split(",").includes(t));

const GUIDELINE: GuidelineReading = {
  guideline: "NICE NG38 Fractures (non-complex)",
  url: "https://www.nice.org.uk/guidance/ng38/chapter/Recommendations",
  points: [{ id: "1.2.3", text: "Consider MRI for first-line imaging in people with suspected scaphoid fractures following a thorough clinical examination." }],
};
const EVIDENCE = { guideline: "NICE NG38 Fractures (non-complex), recommendation 1.2.3", point: GUIDELINE.points[0].text, question: "Was MRI considered as first-line imaging when a scaphoid fracture was suspected?" };

// The body each complaint goes to, and the time limit as the public pages state it (paraphrased fixtures, checked 2026-11-07).
const PLACES: Record<string, { body: string; place: string; limitUrl: string; limit: string }> = {
  scotland: {
    body: "NHS Lothian",
    place: "Scotland",
    limitUrl: "https://www.citizensadvice.org.uk/scotland/health/nhs-healthcare-s/nhs-complaints-s/",
    limit: "Time limits for making a complaint. You should normally complain within six months of the event you want to complain about, or within six months of finding out that you have a reason to complain, but no longer than 12 months after the event itself. The time limit can sometimes be extended if there are good reasons why you could not complain sooner.",
  },
  england: {
    body: "Guy's and St Thomas' NHS Foundation Trust",
    place: "England",
    limitUrl: "https://www.nhs.uk/using-the-nhs/about-the-nhs/how-to-complain-to-the-nhs/",
    limit: "You should normally make a complaint within 12 months of the date of the event you're complaining about, or as soon as the matter first came to your attention. The time limit can sometimes be extended, as long as it's still possible to investigate your complaint.",
  },
  wales: {
    body: "Cardiff and Vale University Health Board",
    place: "Wales",
    limitUrl: "https://www.gov.wales/nhs-wales-complaints-and-concerns-putting-things-right",
    limit: "You should raise your concern within 12 months of the event, or within 12 months of realising you have reason to raise a concern. The time limit can be extended if there are good reasons, but not beyond 3 years after the event.",
  },
  "northern-ireland": {
    body: "Belfast Health and Social Care Trust",
    place: "Northern Ireland",
    limitUrl: "https://www.nidirect.gov.uk/articles/complaining-about-health-and-social-care",
    limit: "You should normally make your complaint within six months of the event, or within six months of becoming aware of it, but no longer than 12 months after the event. This time limit can be extended in some circumstances.",
  },
};

type Case = { id: string; persona: string; facts: CaseFacts; expected: string[] };
function cases(): Case[] {
  const only = arg("personas")?.split(",");
  const list: Case[] = Object.keys(PLACES)
    .filter((p) => !only || only.includes(p))
    .map((p) => ({ id: p, persona: p, facts: JSON.parse(readFileSync(path.join("scripts/personas", `${p}.json`), "utf8")) as CaseFacts, expected: p === "scotland" ? ["within", "close"] : ["within"] }));
  // A harder date case: the Scotland persona with every date a year earlier is past the 12-month backstop.
  const sc = list.find((c) => c.persona === "scotland");
  if (sc) list.push({ id: "scotland-2025", persona: "scotland", facts: { ...sc.facts, events: sc.facts.events.map((e) => ({ ...e, date: e.date.replace("2026", "2025") })) }, expected: ["outside"] });
  return list;
}

type Run = { task: Task; config: string; model: string; where: string; caseId: string; rep: number; ms: number; inTok: number; outTok: number; calls: number; output?: unknown; error?: string; statusOk?: boolean; score?: number; judge?: Judged };

async function runOne(task: Task, c: Case): Promise<Omit<Run, "rep" | "config" | "model" | "where" | "caseId" | "task">> {
  const entries: LedgerEntry[] = [];
  const p = PLACES[c.persona];
  const t0 = Date.now();
  try {
    const output = await withLedger({ agent: "iona", emit: (e) => entries.push(e.entry) }, async () => {
      if (task === "care_comparison") return compareCare(c.facts, GUIDELINE);
      if (task === "complaint_draft") return draftComplaintTo(c.facts, { body: p.body, place: p.place }, EVIDENCE);
      return judgeTimeLimit(p.limit, p.limitUrl, c.facts, TODAY);
    });
    const statusOk = task === "time_limit" ? c.expected.includes((output as { status: string }).status) : undefined;
    return { ms: Date.now() - t0, ...sum(entries), output, statusOk };
  } catch (e) {
    return { ms: Date.now() - t0, ...sum(entries), error: (e instanceof Error ? e.message : String(e)).slice(0, 300) };
  }
}
const sum = (es: LedgerEntry[]) => ({ inTok: es.reduce((a, e) => a + e.inTok, 0), outTok: es.reduce((a, e) => a + e.outTok, 0), calls: es.length });

/* ------------------------------------------------------------------ judge */

const Judged = z.object({
  factual: z.number().int().min(0).max(2).describe("2 = everything stated matches the input; 1 = a minor slip; 0 = wrong facts or dates"),
  noInvention: z.number().int().min(0).max(2).describe("2 = nothing added that is not in the input; 1 = a small embellishment; 0 = invented symptoms, dates, diagnoses or statements"),
  noBlame: z.number().int().min(0).max(2).describe("2 = neutral, never says anyone was negligent, at fault or that care was wrong; 0 = it does"),
  followsInstruction: z.number().int().min(0).max(2).describe("2 = does exactly what the task asks (format, scope, required parts); 1 = partly; 0 = not"),
  note: z.string().describe("One short line: the main weakness, or 'clean' if none"),
});
type Judged = z.infer<typeof Judged>;

const TASK_BRIEF: Record<Task, string> = {
  care_comparison: "Compare the guideline with the patient's own account; list only POSSIBLE gaps as questions for a solicitor or expert; never say anyone was negligent; one-sentence caveat.",
  complaint_draft: "Write the body of a first-person, polite, factual, chronological complaint (several short paragraphs are fine) to the named body using ONLY the facts; include dates and places; no contact details; it MUST include one paragraph near the end that quotes the guideline recommendation exactly, names its source and politely asks the body how it was followed; never say it was not followed or that anyone was at fault; outcome = the patient's desired outcome.",
  time_limit: "Quote the time limit from the page; say whether the complaint is within it today (close = fewer than 8 weeks left; outside if past the limit, including the 12-month backstop), and explain which date was counted from, in two plain sentences.",
};

async function judge(task: Task, c: Case, output: unknown): Promise<Judged> {
  const p = PLACES[c.persona];
  const input =
    task === "time_limit"
      ? `Today: ${TODAY}\nPage text: ${p.limit}\nTimeline:\n${c.facts.events.map((e) => `${e.date}: ${e.what}`).join("\n")}\nCorrect status: ${c.expected.join(" or ")}`
      : `Facts:\n${JSON.stringify({ incidentLocation: c.facts.incidentLocation, incidentSummary: c.facts.incidentSummary, events: c.facts.events, desiredOutcome: c.facts.desiredOutcome })}\nGuideline: ${GUIDELINE.guideline} ${GUIDELINE.points[0].id}: "${GUIDELINE.points[0].text}"${task === "complaint_draft" ? `\nAddressed to: ${p.body} (${p.place})` : ""}`;
  return structured({
    model: JUDGE,
    effort: "low",
    name: "bench_judge",
    data: [],
    schema: Judged,
    instructions: `You grade one output of a patient-support agent strictly, against a short rubric. The task was: ${TASK_BRIEF[task]} Paraphrase is fine; reasonable inferences from the facts (e.g. "early July" -> "July 2026") are not inventions.`,
    input: `INPUT THE AGENT HAD:\n${input}\n\nOUTPUT TO GRADE:\n${JSON.stringify(output, null, 1)}`,
  });
}

/* ------------------------------------------------------------------ main */

async function runConfig(cfg: Config, list: Case[], runs: Run[]) {
  Object.assign(process.env, cfg.env);
  if (cfg.private) MODELS.private = cfg.private;
  const model = cfg.where === "local" ? cfg.private! : MODELS.draft;
  for (const task of TASKS) {
    for (const c of list.filter((x) => !cfg.cases || cfg.cases.includes(x.id))) {
      if (task !== "time_limit" && c.id === "scotland-2025") continue; // the shifted dates only matter for the time limit
      for (let rep = 0; rep < REPS; rep++) {
        const r = await runOne(task, c);
        runs.push({ task, config: cfg.id, model, where: cfg.where, caseId: c.id, rep, ...r });
        console.log(`${cfg.id.padEnd(12)} ${task.padEnd(16)} ${c.id.padEnd(17)} #${rep} ${(r.ms / 1000).toFixed(1)}s ${r.inTok}/${r.outTok} tok${r.error ? ` ERROR ${r.error.slice(0, 120)}` : ""}${r.statusOk === false ? " WRONG STATUS" : ""}`);
      }
    }
  }
}

async function warm(model: string) {
  const name = model.replace(/^local:/, "");
  const t0 = Date.now();
  await fetch(`${(process.env.OLLAMA_URL ?? "http://localhost:11434/v1").replace(/\/v1\/?$/, "")}/api/generate`, { method: "POST", body: JSON.stringify({ model: name, prompt: "hi", stream: false, options: { num_predict: 1 } }) }).catch(() => {});
  console.log(`warmed ${name} in ${((Date.now() - t0) / 1000).toFixed(1)}s (load time not counted)`);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const f1 = (x: number) => (Number.isFinite(x) ? x.toFixed(1) : "—");

async function main() {
  const list = cases();
  const runs: Run[] = [];
  const local = CONFIGS.filter((c) => c.where === "local");
  const cloud = CONFIGS.filter((c) => c.where === "cloud");
  // Env and MODELS.private are process-wide, so configs run one after another (local latency must not overlap anyway).
  for (const cfg of [...cloud, ...local]) {
    if (cfg.private) await warm(cfg.private);
    await runConfig(cfg, list, runs);
  }
  process.env.LOCAL_MODELS = "0";

  console.log(`judging ${runs.filter((r) => !r.error).length} outputs with ${JUDGE}`);
  const todo = runs.filter((r) => !r.error);
  for (let i = 0; i < todo.length; i += 8) {
    await Promise.all(
      todo.slice(i, i + 8).map(async (r) => {
        try {
          r.judge = await judge(r.task, list.find((c) => c.id === r.caseId)!, r.output);
          r.score = ((r.judge.factual + r.judge.noInvention + r.judge.noBlame + r.judge.followsInstruction) / 8) * 10;
        } catch (e) {
          console.warn("judge failed", e);
        }
      }),
    );
  }
  writeFileSync(OUT_JSON, JSON.stringify({ date: new Date().toISOString(), reps: REPS, judge: JUDGE, runs }, null, 1));

  const rows: string[] = [];
  for (const task of TASKS) {
    for (const cfg of CONFIGS) {
      const rs = runs.filter((r) => r.task === task && r.config === cfg.id);
      if (!rs.length) continue;
      const ok = rs.filter((r) => !r.error);
      const scored = ok.filter((r) => r.score !== undefined);
      const worst = [...scored].sort((a, b) => a.score! - b.score!)[0];
      const notes = [
        rs.length - ok.length ? `${rs.length - ok.length}/${rs.length} failed (${(rs.find((r) => r.error)?.error ?? "").slice(0, 60)})` : "",
        task === "time_limit" ? `status right ${ok.filter((r) => r.statusOk).length}/${rs.length}` : "",
        worst && worst.judge && worst.judge.note.toLowerCase() !== "clean" ? `worst (${f1(worst.score!)}): ${worst.judge.note.replace(/\|/g, "/").slice(0, 110)}` : "all clean",
      ].filter(Boolean);
      rows.push(`| ${task} | ${cfg.label} | ${cfg.where} | ${f1(mean(ok.map((r) => r.ms)) / 1000)} s | ${Math.round(mean(ok.map((r) => r.inTok)))} / ${Math.round(mean(ok.map((r) => r.outTok)))} | ${f1(mean(scored.map((r) => r.score!)))} | ${notes.join("; ")} |`);
    }
  }

  const head = `# Local vs cloud on the private-data tasks

Generated by \`scripts/bench-local.ts\` on ${new Date().toISOString().slice(0, 16).replace("T", " ")} (M1 Max, 32 GB, Ollama ${await ollamaVersion()}).
Same tasks, same prompts (the production functions \`compareCare\`, \`draftComplaintTo\`, \`judgeTimeLimit\`), fictional personas in \`scripts/personas/\` (${list.map((c) => c.id).join(", ")}; \`scotland-2025\` = the Scotland persona with every date a year earlier, past the 12-month backstop, time limit only).
${REPS} repetitions per persona. Latency is wall time per call after the model is loaded; tokens are as reported by the API (local thinking tokens count as output).
Quality: ${JUDGE} as judge, rubric 0-2 on each of factual, no invented facts, no blame, follows the instruction, scaled to /10. For the time limit, "status right" is checked by code against the known answer.

| Task | Model | Where | Mean latency | Tokens in / out | Quality /10 | Notes |
|---|---|---|---|---|---|---|
${rows.join("\n")}
`;
  const marker = "<!-- by hand -->";
  const kept = existsSync(OUT_MD) && readFileSync(OUT_MD, "utf8").includes(marker) ? readFileSync(OUT_MD, "utf8").split(marker)[1] : "\n\n## Findings\n\n(to be written)\n";
  writeFileSync(OUT_MD, `${head}\n${marker}${kept}`);
  console.log(`wrote ${OUT_MD} and ${OUT_JSON}`);
}

async function ollamaVersion() {
  try {
    const r = await fetch(`${(process.env.OLLAMA_URL ?? "http://localhost:11434/v1").replace(/\/v1\/?$/, "")}/api/version`);
    return ((await r.json()) as { version: string }).version;
  } catch {
    return "?";
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
