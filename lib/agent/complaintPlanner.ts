import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { supportsLothian, hasFractureContext, factualComplaint, SCOPE_NOTE } from "./complaintScope";
import type { Page } from "playwright";
import type { FunctionTool, Response, ResponseFunctionToolCall, ResponseInputItem } from "openai/resources/responses/responses";
import { closeWhenSubmitted, keepOnlyTabs, openSession } from "../browser";
import { agent, Tracer, Tracker, type Note } from "./legalAid";
import { respond, MODELS } from "./llm";
import { enterLedger } from "./ledger";
import { makeLogger } from "./events";
import type { CaseFacts } from "./facts";
import { missingRequired } from "./facts";
import { draftComplaint, type Draft } from "./draft";
import { compareCare, readGuideline, type GuidelineReading } from "./evidence";
import { checkTimeLimit, readProcess } from "./complaintAgents";
import { hasSupport } from "./complaintSupport";
import { fillNhsForm, NHS_LOTHIAN_FORM } from "./nhsLothian";
import { readForm } from "./enquiry";
import type { ExtraAnswers } from "./extra";
import { limiter, skips, waiting, type Ask, type Emit } from "./planner";
import { CREW, TOOL_CREW, type AskSpec, type ComplaintResult, type CrewId, type EvidenceResult, type PlanStep, type Say, type Thought } from "./plannerTypes";

/**
 * The complaint crew (D65): the same Elliot-led story as the compensation crew, for step 1.
 * Robin reads NHS Lothian's own pages and the NHS complaints time limit. Iona reads the clinical guideline and
 * compares it with the patient's account. Elliot writes the complaint. Kit fills in NHS Lothian's form and stops
 * before Submit: the patient presses it themselves. A reasoning model plans the route; nothing is ever submitted.
 */

const MAX_TURNS = 14;
const ASK_TIMEOUT_MS = 5 * 60 * 1000;
const short = (s: string, n = 140) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

const WHY = { why: { type: "string", description: "One short line, shown to the user: why you are doing this now." } } as const;
const tool = (name: string, description: string, props: Record<string, unknown>, required: string[]): FunctionTool => ({
  type: "function",
  name,
  description,
  strict: false,
  parameters: { type: "object", properties: { ...WHY, ...props }, required: ["why", ...required] },
});

const TOOLS: FunctionTool[] = [
  tool("update_plan", "Write or rewrite your plan as a short checklist. Call it first, and again whenever what you learn changes the plan.", {
    steps: { type: "array", items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" }, status: { type: "string", enum: ["todo", "doing", "done", "dropped"] }, why: { type: "string" } }, required: ["id", "text", "status"] } },
  }, ["steps"]),
  tool("read_process", "Robin: open NHS Lothian's own pages on how to complain and what happens next, and report the steps and any free support they offer.", {}, []),
  tool("check_time_limit", "Robin: open Citizens Advice Scotland's page on NHS complaints and work out whether the patient's complaint is still inside the limit, from their own dates.", {}, []),
  tool("read_guideline", "Iona: open the clinical guideline (NICE NG38 Fractures) and quote its recommendations about the patient's condition.", { topic: { type: "string", description: "e.g. 'suspected scaphoid fracture'" } }, []),
  tool("compare_care", "Iona: compare the guideline with the patient's own timeline and list POSSIBLE gaps as questions. Call after read_guideline.", {}, []),
  tool("draft_complaint", "Elliot: write the complaint text (details, location, outcome) from the patient's facts. If Iona found a gap, the draft asks about it politely.", {}, []),
  tool("fill_complaint_form", "Kit: open NHS Lothian's online feedback form and fill it with the patient's details and the draft, stopping before Submit. Pass answers when the form asked something and the patient answered.", {
    answers: { type: "array", items: { type: "object", properties: { label: { type: "string", description: "The form's question" }, value: { type: "string" } }, required: ["label", "value"] } },
  }, []),
  tool("ask_user", "Ask the user one question when you need something no page and no tool can tell you.", {
    question: { type: "string" },
    kind: { type: "string", enum: ["yes_no", "choice", "text"] },
    options: { type: "array", items: { type: "string" } },
  }, ["question", "kind"]),
  tool("finish", "End the work with a summary for the patient. Call after fill_complaint_form.", { summary: { type: "string", description: "Two or three short sentences in plain words, written to the patient: what is ready and what they do next." } }, ["summary"]),
];

const SYSTEM = `You lead a small crew helping a patient in Scotland complain to NHS Lothian about their care. You plan your own route and drive browser agents through tools. The patient watches the work as a story, so work ONE STEP AT A TIME: call one tool per turn, and let each result decide the next step.
Your crew: Robin (reads NHS Lothian's pages and the NHS complaints time limit), Iona (clinical evidence) and Kit (fills in NHS Lothian's online form). Each tool belongs to one of them; draft_complaint is yours.
The story, in this order (adapt it when results call for it, and say why with update_plan):
1. update_plan.
2. Robin: read_process, to learn how NHS Lothian handles a complaint.
3. Robin: check_time_limit, to see whether the patient is still inside the time limit.
4. Iona: read_guideline for the patient's condition, then compare_care.
5. You: draft_complaint. It carries Iona's finding as a polite question when there is one.
6. Kit: fill_complaint_form.
7. finish.
Rules:
- Every tool call needs a short "why" in plain words, written like a short instruction to the crew member, e.g. "Read how NHS Lothian handles complaints". No jargon.
- Iona's guideline tool only covers fractures and bone injuries (NICE NG38). If the patient's story is about something else, drop that step with update_plan and say why, and go on to draft_complaint.
- If check_time_limit says the patient may be outside the limit, say so with update_plan and ask_user (yes_no) whether to carry on anyway.
- If fill_complaint_form reports the form needs something the patient has not given, ask_user for it (one question), then call fill_complaint_form again with answers. Do this at most once.
- Never say anyone was negligent or at fault. Never submit anything. Never invent facts.`;

export async function runComplaint(facts: CaseFacts, opts: { onEvent?: Emit; keepOpen?: boolean; runId?: string } = {}): Promise<ComplaintResult> {
  const runId = opts.runId ?? `complaint-${new Date().toISOString().replace(/[:.]/g, "-")}`;
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
  if (!supportsLothian(facts)) {
    const result: ComplaintResult = { runId, runDir, plan: [], thoughts: [], turns: 0, says: [{ i: 0, t: 0, from: "elliot", kind: "done", text: SCOPE_NOTE }], trace: [], stats: track.stats, asks: 0, evidence: {}, draft: factualComplaint(facts), form: { status: "not_started", filled: [], unfilled: [], note: SCOPE_NOTE, url: "" } };
    emit({ type: "complaint_result", result });
    return result;
  }
  const { browser, context, page } = await openSession();
  const ctx = { context, emit, track, tracer, first: page };
  const tabs = limiter(2);
  waiting.set(runId, new Map());
  skips.set(runId, new Set());

  let plan: PlanStep[] = [];
  const thoughts: Thought[] = [];
  const says: Say[] = [];
  const proof: EvidenceResult = {};
  let guideline: GuidelineReading | null = null;
  let processReading: ComplaintResult["process"];
  let timeLimit: ComplaintResult["timeLimit"];
  let draft: Draft | undefined;
  let formPage: Page | null = null;
  let form: ComplaintResult["form"] = { status: "not_started", filled: [], unfilled: [], note: "The form has not been filled yet.", url: NHS_LOTHIAN_FORM };
  const extra: ExtraAnswers = [];
  let fills = 0;
  const t0 = Date.now();
  let asks = 0;
  let replanned = false;
  const say = (s: Omit<Say, "i" | "t">) => {
    const full: Say = { i: says.length, t: Date.now() - t0, ...s };
    says.push(full);
    emit({ type: "say", say: full });
  };
  const crewState = (id: CrewId, state: "idle" | "working" | "waiting" | "done", note: string) => emit({ type: "crew", id, state, note });
  const finding = (text: string, source?: string, crew?: CrewId) => emit({ type: "finding", text, source, crew });
  const crewFor = <T,>(th: Thought, id: CrewId, task: string, work: (p: Page, note: Note) => Promise<T>, timeoutMs: number) => {
    th.tab = `${CREW[id].name} · ${task}`;
    emit({ type: "spotlight", crew: id, tab: th.tab });
    return agent(ctx, th.tab, work, timeoutMs, undefined, { color: CREW[id].color, cursor: th.tab });
  };

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

  const doing = (name: string): string => {
    switch (name) {
      case "read_process":
        return "Reading how NHS Lothian handles complaints";
      case "check_time_limit":
        return "Checking the NHS complaints time limit";
      case "read_guideline":
        return "Reading the NICE clinical guideline";
      case "compare_care":
        return "Comparing the guideline with your story";
      case "draft_complaint":
        return "Writing your complaint";
      case "fill_complaint_form":
        return "Filling in NHS Lothian's form";
      default:
        return "Working";
    }
  };

  /** What a crew member says back after a tool: one plain sentence for the user. */
  const describe = (name: string, out: string): string => {
    switch (name) {
      case "read_process":
        return processReading ? `${processReading.summary}${hasSupport(processReading.support) ? ` ${processReading.support}` : ""}` : out;
      case "check_time_limit":
        return timeLimit ? `${timeLimit.status === "within" ? "You are inside the time limit." : timeLimit.status === "close" ? "You are close to the time limit." : timeLimit.status === "outside" ? "This may be past the time limit." : "I could not tell from your dates."} ${timeLimit.explanation}` : out;
      case "read_guideline":
        return proof.guideline?.points.length ? `${proof.guideline.name}, ${proof.guideline.points[0].id}: "${proof.guideline.points[0].text}"` : "The guideline says nothing about this.";
      case "compare_care":
        return proof.gaps?.length ? `${proof.gaps.length} possible gap${proof.gaps.length === 1 ? "" : "s"} to ask NHS Lothian about: ${proof.gaps[0].question}` : "No gap between the guideline and your account.";
      case "draft_complaint":
        return draft ? `Written. ${proof.gaps?.length ? "It asks NHS Lothian about the guideline politely, without blaming anyone." : "Facts only, no blame."}` : out;
      case "fill_complaint_form":
        return form.status === "ready_to_submit"
          ? `NHS Lothian's form is filled (${form.filled.length} fields). It is waiting for you: check it, change anything, and press Submit yourself.`
          : form.status === "needs_input"
            ? `The form is filled as far as I could. It still needs: ${form.unfilled.join(", ") || "an answer from you"}.`
            : out;
      default:
        return out.split("\n")[0];
    }
  };

  async function run(call: ResponseFunctionToolCall, thought: Thought): Promise<string> {
    const a = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
    const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
    switch (call.name) {
      case "update_plan": {
        const before = plan;
        plan = ((a.steps as PlanStep[]) ?? []).map((st, i) => ({ id: st.id || `s${i + 1}`, text: st.text, status: st.status ?? "todo", why: st.why }));
        const key = (xs: PlanStep[]) => xs.filter((x) => x.status !== "dropped").map((x) => x.text).join("|");
        replanned = before.length > 0 && (key(before) !== key(plan) || plan.some((x) => x.status === "dropped" && before.find((b) => b.id === x.id)?.status !== "dropped"));
        emit({ type: "plan", steps: plan });
        return "Plan updated.";
      }
      case "read_process": {
        const r = await tabs(() => crewFor(thought, "robin", "NHS Lothian", (p, note) => readProcess(p, note, track), 120_000));
        if (!r.ok) return `Could not read NHS Lothian's pages: ${r.error}`;
        processReading = { summary: r.value.summary, steps: r.value.steps, support: r.value.support, url: r.value.url };
        finding(`NHS Lothian handles a complaint in ${r.value.steps.length} steps`, r.value.url, "robin");
        if (hasSupport(r.value.support)) finding(r.value.support, r.value.url, "robin");
        return `${r.value.summary}\nSteps: ${r.value.steps.join(" → ")}\nSupport: ${hasSupport(r.value.support) ? r.value.support : "none mentioned"}`;
      }
      case "check_time_limit": {
        const r = await tabs(() => crewFor(thought, "robin", "Time limit", (p, note) => checkTimeLimit(p, facts, note, track), 120_000));
        if (!r.ok) return `Could not check the time limit: ${r.error}`;
        timeLimit = { limit: r.value.limit, status: r.value.status, explanation: r.value.explanation, url: r.value.url };
        finding(`Time limit: ${r.value.limit}`, r.value.url, "robin");
        return `Status: ${r.value.status}. ${r.value.limit}\n${r.value.explanation}`;
      }
      case "read_guideline": {
        if (!hasFractureContext(facts)) return "Blocked: fracture guidance is not established as relevant to the saved story. Skip clinical comparison and draft from facts only.";
        const r = await tabs(() => crewFor(thought, "iona", "Clinical guideline", (p, note) => readGuideline(p, s("topic") || "suspected scaphoid fracture", note, track), 90_000));
        if (!r.ok) return `Could not read the guideline: ${r.error}`;
        guideline = r.value;
        proof.guideline = { name: r.value.guideline, url: r.value.url, points: r.value.points };
        emit({ type: "evidence", evidence: { ...proof } });
        if (r.value.points.length) finding(`${r.value.guideline} ${r.value.points.map((x) => x.id).join(", ")}: "${r.value.points[0].text}"`, r.value.url, "iona");
        return r.value.points.length ? `${r.value.guideline}:\n${r.value.points.map((x) => `${x.id}: ${x.text}`).join("\n")}` : "No recommendation about this on the page.";
      }
      case "compare_care": {
        if (!guideline) return "Read the guideline first (read_guideline).";
        const c = await compareCare(facts, guideline);
        proof.gaps = c.gaps;
        proof.caveat = c.caveat;
        emit({ type: "evidence", evidence: { ...proof } });
        for (const gap of c.gaps) finding(`Possible gap to ask about: ${gap.question}`, guideline.url, "iona");
        return c.gaps.length ? `${c.gaps.length} possible gap(s):\n${c.gaps.map((x) => `- ${x.question}`).join("\n")}\nCaveat: ${c.caveat}` : `No gap between the guideline and the account. ${c.caveat}`;
      }
      case "draft_complaint": {
        const g = proof.guideline?.points[0];
        draft = await draftComplaint(facts, g && proof.gaps?.[0] ? { guideline: proof.guideline!.name.split(":")[0], point: g.text, question: proof.gaps[0].question } : undefined);
        finding(`Complaint written (${draft.details.split(/\s+/).length} words)`, undefined, "elliot");
        return `Drafted. Location: ${draft.location}. Outcome: ${draft.outcome || "(none given)"}\n\n${draft.details}`;
      }
      case "fill_complaint_form": {
        if (!draft) return "Write the complaint first (draft_complaint).";
        if (missingRequired(facts).length) return `Blocked: the patient's profile is missing ${missingRequired(facts).join(", ")}.`;
        if (fills >= 2) return "Blocked: the form has already been filled twice. Finish now.";
        fills++;
        for (const x of (a.answers as { label: string; value: string }[] | undefined) ?? []) if (x?.label && x?.value) extra.push({ label: x.label, value: x.value });
        const d = draft;
        const r = await tabs(() =>
          crewFor(thought, "kit", "NHS Lothian form", async (p, note) => {
            const run = await fillNhsForm(p, facts, d, {
              extra,
              onEvent: (e) => {
                if (e.type === "action") track.bump("action");
                if (e.type === "status") note(e.message);
              },
            });
            const f = await readForm(p);
            await note.log("type", `Filled ${f.filled.length} field${f.filled.length === 1 ? "" : "s"}; stopped before Submit`, { shot: true, detail: f.filled.map((x) => `${x.label}: ${x.value.length > 80 ? x.value.slice(0, 80) + "…" : x.value}`).join("\n") });
            note(run.unfilled.length ? "Needs an answer from you" : "Filled. Waiting for you to submit");
            formPage = p;
            return { run, f };
          }, 240_000),
        );
        if (!r.ok) {
          form = { ...form, status: "failed", note: `Stopped: ${r.error}` };
          return `The form could not be filled: ${r.error}`;
        }
        const { run: br, f } = r.value;
        const unfilled = [...new Set([...br.unfilled, ...f.unfilled])];
        form = {
          status: unfilled.length || br.status === "needs_input" ? "needs_input" : br.status === "ready_to_submit" ? "ready_to_submit" : "incomplete",
          filled: f.filled,
          unfilled,
          note: br.question || br.summary,
          url: NHS_LOTHIAN_FORM,
        };
        finding(form.status === "ready_to_submit" ? "NHS Lothian's form is filled, waiting for you to submit" : `The form needs: ${unfilled.join(", ") || "an answer"}`, NHS_LOTHIAN_FORM, "kit");
        return form.status === "ready_to_submit" ? `Form filled (${f.filled.length} fields). Stopped before Submit; the patient submits it.` : `Form status: ${form.status}. Still needs: ${unfilled.join(", ") || "an answer"}. ${br.question ?? ""}`;
      }
      case "ask_user": {
        const answer = await ask({ agent: "Planner", crew: "elliot", question: s("question"), why: s("why"), kind: (s("kind") as AskSpec["kind"]) || "text", options: a.options as string[] | undefined });
        return answer === null ? "The user did not answer. Carry on without it." : `The user answered: ${answer}`;
      }
      case "finish":
        return "Finished.";
      default:
        thought.result = "Unknown tool";
        return `Unknown tool ${call.name}`;
    }
  }

  let reviewing = false;
  let turns = 0;
  try {
    const story = [facts.incidentSummary, ...facts.events.map((e) => `${e.date}: ${e.what}`)].filter(Boolean).join("\n");
    let input: ResponseInputItem[] | string = `Patient: ${facts.firstName ?? "the patient"}.\nWhere treated: ${facts.incidentLocation ?? "unknown"}.\nWhat happened:\n${story}\nWhat they would like: ${facts.desiredOutcome || "not said"}.`;
    let prev: string | undefined;
    let finished = false;
    for (turns = 1; turns <= MAX_TURNS && !finished; turns++) {
      const res: Response = await respond({
        model: MODELS.draft,
        reasoning: { effort: "low" },
        instructions: SYSTEM,
        input,
        tools: TOOLS,
        tool_choice: "required",
        parallel_tool_calls: false,
        ...(prev ? { previous_response_id: prev } : {}),
      }, "complaint planner");
      prev = res.id;
      const calls = res.output.filter((o): o is ResponseFunctionToolCall => o.type === "function_call");
      if (!calls.length) {
        input = [{ role: "user", content: "Call a tool. Use finish when you are done." }];
        continue;
      }
      const STAGE: Record<string, number> = { update_plan: 0, ask_user: 0, read_process: 1, check_time_limit: 2, read_guideline: 3, compare_care: 3, draft_complaint: 4, fill_complaint_form: 5, finish: 6 };
      calls.sort((x, y) => (STAGE[x.name] ?? 3) - (STAGE[y.name] ?? 3));
      const outputs: ResponseInputItem[] = [];
      for (const call of calls) {
        const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
        const thought: Thought = { i: thoughts.length, t: Date.now() - t0, text: String(args.why ?? call.name), tool: call.name, detail: JSON.stringify(Object.fromEntries(Object.entries(args).filter(([k]) => k !== "why")), null, 1).slice(0, 1500) };
        thoughts.push(thought);
        if (call.name !== "update_plan") emit({ type: "thought", thought });
        const who = TOOL_CREW[call.name] ?? "elliot";
        const why = String(args.why ?? "").trim();
        const skipSet = skips.get(runId);
        if (who !== "elliot" && (skipSet?.has(who) || skipSet?.has("all"))) {
          say({ from: who, to: "elliot", kind: "report", text: "Skipped, as you asked.", tool: call.name });
          crewState(who, "idle", "Skipped");
          outputs.push({ type: "function_call_output", call_id: call.call_id, output: `Skipped: the user asked to skip ${CREW[who].name}'s work. Do not call this tool again; carry on.` });
          continue;
        }
        const busy = call.name !== "update_plan" && call.name !== "ask_user" && call.name !== "finish";
        if (busy) {
          // Elliot's own job (the draft) is also shown as work, with Elliot's colour.
          if (who !== "elliot") say({ from: "elliot", to: who, kind: "assign", text: why || call.name, tool: call.name });
          crewState(who, "working", doing(call.name));
        }
        let out: string;
        try {
          out = await run(call, thought);
        } catch (e) {
          out = `Error: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`;
        }
        if (call.name === "update_plan") say({ from: "elliot", kind: "plan", text: why || "Updated the plan", tool: call.name, replan: replanned });
        else {
          thought.result = short(out, 600);
          emit({ type: "thought", thought: { ...thought } });
        }
        if (busy) {
          const failed = /^(Error|Could not|Blocked:|The form could not|Write the complaint|Read the guideline|.*failed\b)/.test(out);
          const ok = !failed && (call.name !== "fill_complaint_form" || form.status === "ready_to_submit" || form.status === "needs_input");
          const text = failed ? `I hit a problem: ${out}` : describe(call.name, out);
          say({ from: who, to: who === "elliot" ? "you" : "elliot", kind: "report", text, detail: out.includes("\n") ? short(out, 1500) : undefined, tool: call.name, tab: thought.tab, ok });
          crewState(who, "idle", text);
        } else if (call.name === "finish") say({ from: "elliot", to: "you", kind: "done", text: String(args.summary ?? "Done."), tool: call.name });
        if (call.name === "finish") finished = true;
        outputs.push({ type: "function_call_output", call_id: call.call_id, output: out });
      }
      input = skips.get(runId)?.has("all") && !finished ? [...outputs, { role: "user" as const, content: "The user asked to finish now. Call finish with what you have." }] : outputs;
    }

    const result: ComplaintResult = {
      runId,
      runDir,
      plan,
      thoughts,
      turns: turns - 1,
      says,
      trace: tracer.steps,
      stats: track.stats,
      asks,
      process: processReading,
      timeLimit,
      evidence: proof,
      draft,
      form,
      message: undefined,
    };
    emit({ type: "complaint_result", result });
    // Research tabs close. Only the filled form stays, for the patient to check and submit (D57).
    if (opts.keepOpen && formPage && !(formPage as Page).isClosed()) {
      reviewing = true;
      await keepOnlyTabs(context, [formPage]);
      closeWhenSubmitted(formPage, browser);
    }
    return result;
  } finally {
    waiting.delete(runId);
    skips.delete(runId);
    if (!reviewing) await browser.close().catch(() => {});
  }
}
