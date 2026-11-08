import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";
import type { FunctionTool, Response, ResponseFunctionToolCall, ResponseInputItem } from "openai/resources/responses/responses";
import { keepOnlyTabs, openSession } from "../browser";
import { agent, Tracer, Tracker, type Note } from "./legalAid";
import { MODELS, respond } from "./llm";
import { makeLogger } from "./events";
import { enterLedger, withLedger } from "./ledger";
import { limiter, skips, waiting, type Ask, type Emit } from "./planner";
import { CREW, type AskSpec, type CrewId, type PlanStep, type Say, type Thought } from "./plannerTypes";

/**
 * One crew run, reusable (night plan, "Elliot anywhere"): a reasoning model (Elliot) plans and calls tools; each tool
 * belongs to a crew member who works in their own browser tab; the user sees who does what, answers questions, and
 * can skip. The flows (discovery, complaint, escalation, compensation) only bring their tools, prompt and result.
 * Calls in one turn that belong to different crew members run at the same time; one member's calls run in order.
 */

const ASK_TIMEOUT_MS = 5 * 60 * 1000;
export const short = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

/** "Reading x.org" -> "Read x.org": the crew's present-tense status line, said as done. */
function pastTense(doing: string): string {
  const map: [RegExp, string][] = [[/^Searching/i, "Searched"], [/^Reading/i, "Read"], [/^Opening/i, "Opened"], [/^Exploring/i, "Explored"], [/^Filling/i, "Filled"], [/^Checking/i, "Checked"], [/^Looking/i, "Looked"], [/^Finding/i, "Found"], [/^Comparing/i, "Compared"], [/^Writing/i, "Wrote"], [/^Drafting/i, "Drafted"], [/^Working/i, "Worked"]];
  for (const [re, to] of map) if (re.test(doing)) return doing.replace(re, to);
  return doing;
}

const WHY = { why: { type: "string", description: "Shown to the user as your instruction to the crew member. At most 8 plain words saying what they are about to do, like \"Find the hospital's complaint form\" or \"Check the time limit\". No jargon, no scores, no quotes." } } as const;
export const tool = (name: string, description: string, props: Record<string, unknown>, required: string[]): FunctionTool => ({
  type: "function",
  name,
  description,
  strict: false,
  parameters: { type: "object", properties: { ...WHY, ...props }, required: ["why", ...required] },
});

export const PLAN_TOOL = tool("update_plan", "Write or rewrite your plan as a short checklist. Call it first, and again whenever what you learn changes the plan.", {
  steps: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" }, status: { type: "string", enum: ["todo", "doing", "done", "dropped"] }, why: { type: "string" } }, required: ["id", "text", "status"] } },
}, ["steps"]);
export const ASK_TOOL = tool("ask_user", "Ask the user one question when you need something no page and no tool can tell you.", {
  question: { type: "string" },
  kind: { type: "string", enum: ["yes_no", "choice", "text"] },
  options: { type: "array", items: { type: "string" } },
}, ["question", "kind"]);
export const FINISH_TOOL = tool("finish", "End the work with a short summary for the patient.", { summary: { type: "string", description: "Two or three short sentences in plain words, to the patient." } }, ["summary"]);

export type CrewKit = {
  runId: string;
  runDir: string;
  emit: Emit;
  track: Tracker;
  tracer: Tracer;
  browser: Browser;
  context: BrowserContext;
  say: (s: Omit<Say, "i" | "t">) => void;
  crewState: (id: CrewId, state: "idle" | "working" | "waiting" | "done", note: string) => void;
  finding: (text: string, source?: string, crew?: CrewId) => void;
  ask: Ask;
  /** Run `work` in crew member `id`'s own tab (spotlighted, coloured, traced, timed out, in the ledger as that member). */
  inTab: <T>(th: Thought, id: CrewId, task: string, work: (p: Page, note: Note) => Promise<T>, timeoutMs: number) => Promise<{ ok: true; value: T } | { ok: false; error: string }>;
  keep: (p: Page) => void; // keep this tab open after the run (a filled form waiting for the user)
};

export type CrewFlow<R> = {
  prefix: string; // run id prefix, e.g. "discovery"
  system: string;
  tools: FunctionTool[];
  firstInput: string;
  maxTurns: number;
  effort?: "low" | "medium" | "high"; // the planner's reasoning effort (default low)
  /** Which crew member owns a call (tools may take a `who` argument). */
  who: (name: string, args: Record<string, unknown>) => CrewId;
  doing: (name: string, args: Record<string, unknown>) => string;
  describe: (name: string, args: Record<string, unknown>, out: string) => string;
  /** Run one tool; return what the planner sees. Throwing is caught and shown as a problem. */
  exec: (call: ResponseFunctionToolCall, args: Record<string, unknown>, thought: Thought, kit: CrewKit) => Promise<string>;
  /** Tools that only write down what others found: run after the browser work of the same turn (so their checks see the pages). */
  after?: string[];
  /** Dependencies between tools called in the same turn: lower stages finish before higher ones start (default 1). Within a stage, different crew members work at the same time. */
  stage?: Record<string, number>;
  /** Did this result count as a failure? (default: text starts with Error / Could not / Blocked) */
  failed?: (name: string, out: string) => boolean;
  /** Build and emit the result at the end. */
  finish: (kit: CrewKit, extra: { plan: PlanStep[]; thoughts: Thought[]; says: Say[]; turns: number; asks: number }) => R;
};

export async function runCrew<R>(flow: CrewFlow<R>, opts: { onEvent?: Emit; keepOpen?: boolean; runId?: string } = {}): Promise<R> {
  const runId = opts.runId ?? `${flow.prefix}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const runDir = path.join(process.cwd(), ".runs", runId);
  const log = makeLogger(runDir);
  const startedAt = Date.now();
  mkdirSync(runDir, { recursive: true });
  const emit: Emit = (e) => {
    if (e.type !== "stats" && e.type !== "trace") log({ type: "status", message: JSON.stringify(e).slice(0, 2000) });
    try {
      appendFileSync(path.join(runDir, "events.ndjson"), JSON.stringify({ t: Date.now() - startedAt, e }) + "\n");
    } catch {
      /* recording must never stop the run */
    }
    opts.onEvent?.(e);
  };
  enterLedger({ runId, runDir, agent: "elliot", t0: startedAt, emit });
  emit({ type: "run", runId });
  const track = new Tracker(emit);
  const tracer = new Tracer(emit, runDir);
  const { browser, context, page } = await openSession();
  const actx = { context, emit, track, tracer, first: page };
  const tabs = limiter(4);
  waiting.set(runId, new Map());
  skips.set(runId, new Set());

  let plan: PlanStep[] = [];
  const thoughts: Thought[] = [];
  const says: Say[] = [];
  const kept: Page[] = [];
  let asks = 0;
  let replanned = false;
  const t0 = Date.now();
  const say = (s: Omit<Say, "i" | "t">) => {
    const full: Say = { i: says.length, t: Date.now() - t0, ...s };
    says.push(full);
    emit({ type: "say", say: full });
  };
  const crewState: CrewKit["crewState"] = (id, state, note) => emit({ type: "crew", id, state, note });
  const ask: Ask = (spec) => {
    const id = `q${++asks}`;
    const crew = spec.crew ?? "elliot";
    const full: AskSpec = { id, ...spec, crew };
    emit({ type: "ask", ask: full });
    say({ from: crew, to: "you", kind: "ask", text: spec.question, detail: spec.why });
    crewState(crew, "waiting", "Waiting for your answer");
    return new Promise((resolve) => {
      const done = (a: string | null) => {
        clearTimeout(timer);
        emit({ type: "answered", id, answer: a });
        crewState(crew, "working", a === null ? "Carrying on without it" : "Got your answer");
        resolve(a);
      };
      const timer = setTimeout(() => {
        waiting.get(runId)?.delete(id);
        done(null);
      }, ASK_TIMEOUT_MS);
      waiting.get(runId)!.set(id, done);
    });
  };
  const kit: CrewKit = {
    runId,
    runDir,
    emit,
    track,
    tracer,
    browser,
    context,
    say,
    crewState,
    finding: (text, source, crew) => emit({ type: "finding", text, source, crew }),
    ask,
    inTab: (th, id, task, work, timeoutMs) => {
      th.tab = `${CREW[id].name} · ${task}`;
      emit({ type: "spotlight", crew: id, tab: th.tab });
      return tabs(() => agent(actx, th.tab!, (p, note) => withLedger({ agent: id }, () => work(p, note)), timeoutMs, undefined, { color: CREW[id].color, cursor: th.tab }));
    },
    keep: (p) => void kept.push(p),
  };
  const isFailed = flow.failed ?? ((_: string, out: string) => /^(Error|Could not|Blocked)\b/.test(out));

  let reviewing = false;
  let turns = 0;
  try {
    let input: ResponseInputItem[] | string = flow.firstInput;
    let prev: string | undefined;
    let finished = false;
    for (turns = 1; turns <= flow.maxTurns && !finished; turns++) {
      const res: Response = await respond(
        { model: MODELS.draft, reasoning: { effort: flow.effort ?? "low" }, instructions: flow.system, input, tools: flow.tools, tool_choice: "required", parallel_tool_calls: true, ...(prev ? { previous_response_id: prev } : {}) },
        `${flow.prefix} planner`,
      );
      prev = res.id;
      const calls = res.output.filter((o): o is ResponseFunctionToolCall => o.type === "function_call");
      if (!calls.length) {
        input = [{ role: "user", content: "Call a tool. Use finish when you are done." }];
        continue;
      }
      // Plans first, finish last; calls for different crew members run at the same time, each member's in order.
      const order = (n: string) => (n === "update_plan" ? 0 : n === "finish" ? 2 : 1);
      calls.sort((x, y) => order(x.name) - order(y.name));
      const exec1 = async (call: ResponseFunctionToolCall): Promise<ResponseInputItem> => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
        } catch {
          return { type: "function_call_output", call_id: call.call_id, output: "Error: the arguments were not valid JSON." };
        }
        const thought: Thought = { i: thoughts.length, t: Date.now() - t0, text: String(args.why ?? call.name), tool: call.name, detail: short(JSON.stringify(Object.fromEntries(Object.entries(args).filter(([k]) => k !== "why"))), 1500) };
        thoughts.push(thought);
        if (call.name !== "update_plan") emit({ type: "thought", thought });
        const who = call.name === "update_plan" || call.name === "ask_user" || call.name === "finish" ? "elliot" : flow.who(call.name, args);
        const why = String(args.why ?? "").trim();
        const skipSet = skips.get(runId);
        if (who !== "elliot" && (skipSet?.has(who) || skipSet?.has("all"))) {
          say({ from: who, to: "elliot", kind: "report", text: "Skipped, as you asked.", tool: call.name });
          crewState(who, "idle", "Skipped");
          return { type: "function_call_output", call_id: call.call_id, output: `Skipped: the user asked to skip ${CREW[who].name}'s work. Do not call it again; carry on.` };
        }
        const busy = call.name !== "update_plan" && call.name !== "ask_user" && call.name !== "finish";
        if (busy) {
          if (who !== "elliot") say({ from: "elliot", to: who, kind: "assign", text: why || call.name, tool: call.name });
          crewState(who, "working", flow.doing(call.name, args));
        }
        let out: string;
        try {
          if (call.name === "update_plan") {
            const before = plan;
            plan = ((args.steps as PlanStep[]) ?? []).map((st, i) => ({ id: st.id || `s${i + 1}`, text: st.text, status: st.status ?? "todo", why: st.why }));
            const key = (xs: PlanStep[]) => xs.filter((x) => x.status !== "dropped").map((x) => x.text).join("|");
            replanned = before.length > 0 && key(before) !== key(plan);
            emit({ type: "plan", steps: plan });
            out = "Plan updated.";
          } else if (call.name === "ask_user") {
            const a = await ask({ agent: "Planner", crew: "elliot", question: String(args.question ?? ""), why, kind: (String(args.kind ?? "text") as AskSpec["kind"]) || "text", options: args.options as string[] | undefined });
            out = a === null ? "The user did not answer. Carry on without it." : `The user answered: ${a}`;
          } else if (call.name === "finish") out = "Finished.";
          else out = await flow.exec(call, args, thought, kit);
        } catch (e) {
          out = `Error: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`;
        }
        if (call.name === "update_plan") say({ from: "elliot", kind: "plan", text: why || "Updated the plan", tool: call.name, replan: replanned });
        else {
          thought.result = short(out, 600);
          emit({ type: "thought", thought: { ...thought } });
        }
        if (busy) {
          const bad = isFailed(call.name, out);
          // What the patient reads is one short plain line of what was done; what the page said stays in the details.
          const full = bad ? out : flow.describe(call.name, args, out);
          const did = pastTense(flow.doing(call.name, args));
          const text = bad ? `Could not finish: ${did.charAt(0).toLowerCase()}${did.slice(1)}` : full.length <= 90 && !/[:;]\s.{40,}/.test(full) ? full : did;
          say({ from: who, to: who === "elliot" ? "you" : "elliot", kind: "report", text, detail: full !== text ? short(full, 1500) : out.includes("\n") ? short(out, 1500) : undefined, tool: call.name, tab: thought.tab, ok: !bad });
          crewState(who, "idle", short(text, 90));
        } else if (call.name === "finish") {
          say({ from: "elliot", to: "you", kind: "done", text: String(args.summary ?? "Done."), tool: call.name });
          finished = true;
        }
        return { type: "function_call_output", call_id: call.call_id, output: out };
      };
      // Stages first (a tool that needs another's result waits for it), then crew members in parallel within a stage, each member's calls in order.
      const stageOf = (c: ResponseFunctionToolCall) => (c.name === "update_plan" ? -2 : c.name === "ask_user" ? -1 : c.name === "finish" ? 99 : flow.after?.includes(c.name) ? 98 : (flow.stage?.[c.name] ?? 1));
      const outputs: ResponseInputItem[] = [];
      for (const st of [...new Set(calls.map(stageOf))].sort((x, y) => x - y)) {
        const inStage = calls.filter((c) => stageOf(c) === st);
        if (st < 1 || st >= 98) {
          for (const c of inStage) outputs.push(await exec1(c));
          continue;
        }
        const groups = new Map<string, ResponseFunctionToolCall[]>();
        for (const c of inStage) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(c.arguments || "{}");
          } catch {
            /* handled in exec1 */
          }
          const key = flow.who(c.name, args);
          groups.set(key, [...(groups.get(key) ?? []), c]);
        }
        const done = await Promise.all([...groups.values()].map(async (cs) => { const o: ResponseInputItem[] = []; for (const c of cs) o.push(await exec1(c)); return o; }));
        outputs.push(...done.flat());
      }
      input = skips.get(runId)?.has("all") && !finished ? [...outputs, { role: "user" as const, content: "The user asked to finish now. Call finish with what you have." }] : outputs;
    }
    const result = flow.finish(kit, { plan, thoughts, says, turns: turns - 1, asks });
    const alive = kept.filter((p) => !p.isClosed());
    if (opts.keepOpen && alive.length) {
      reviewing = true;
      await keepOnlyTabs(context, alive);
    }
    return result;
  } finally {
    waiting.delete(runId);
    skips.delete(runId);
    if (!reviewing) await browser.close().catch(() => {});
  }
}
