import type { Page } from "playwright";
import type { FunctionTool, ResponseFunctionToolCall } from "openai/resources/responses/responses";
import { EFFORT, MODELS, respond } from "./llm";
import { formatObservation, observe, unfilledRequired, type El, type Observation } from "./observe";
import type { OnEvent, RunStatus } from "./events";

export type Value = { key: string; description: string; value: string; public?: boolean }; // public: not personal, may be shown to the model

export type RunStats = { calls: number; ms: number; inputTokens: number };

export type BrowserRun = {
  status: RunStatus;
  summary: string;
  unfilled: string[];
  question?: string;
  steps: number;
  stats?: RunStats;
};

const obj = (properties: Record<string, unknown>, required: string[]) => ({
  type: "object" as const,
  properties,
  required,
  additionalProperties: false,
});

const TOOLS: FunctionTool[] = [
  { type: "function", name: "fill", strict: true, description: "Type text into a text box or text area. Replaces what is there.",
    parameters: obj({ id: { type: "integer" }, text: { type: "string" } }, ["id", "text"]) },
  { type: "function", name: "select", strict: true, description: "Choose an option in a dropdown, by its visible text.",
    parameters: obj({ id: { type: "integer" }, option: { type: "string" } }, ["id", "option"]) },
  { type: "function", name: "check", strict: true, description: "Select a radio button or tick a checkbox.",
    parameters: obj({ id: { type: "integer" } }, ["id"]) },
  { type: "function", name: "click", strict: true, description: "Click a button or link. You cannot click submit buttons.",
    parameters: obj({ id: { type: "integer" } }, ["id"]) },
  { type: "function", name: "ask_user", strict: true, description: "The form needs information that is not in VALUES. Ask the user. Never guess.",
    parameters: obj({ question: { type: "string" } }, ["question"]) },
  { type: "function", name: "finish", strict: true, description: "Call when every required field is filled. The code checks this itself.",
    parameters: obj({ summary: { type: "string" } }, ["summary"]) },
];

const SYSTEM_BASE = `You operate a web form for a user. You see the page as a numbered list of elements and act with tools.
Rules:
- Enter ONLY data from VALUES. Never invent, guess or paraphrase personal data. If the form needs something not in VALUES, call ask_user.
- Fill every required field. Also fill optional fields when you have a matching value.
- You may call several tools in one turn (e.g. fill many fields at once). Use element ids from the latest page view only.
- Tick a checkbox (consent, agreement, disclaimer) ONLY if VALUES says the user agreed to it. Otherwise leave it and call finish.
- Do not touch fields you cannot map to a value.
{{SUBMIT_RULE}}
- After filling, check the next page view shows the values you entered. When all required fields show values, call finish.
- Radios and dropdowns: choose the option that matches the value's meaning.`;

const SUBMIT_NEVER = "- Do not click submit. The human approves submission, not you.";
const SUBMIT_OK = "- This page is read-only (a search, calculator or checker). You may click submit/next buttons to move forward; nothing is sent to anyone. Use the page text to understand each question, answer it from VALUES, and call finish when the goal is reached or you cannot answer from VALUES.";

export async function runBrowserAgent(opts: {
  page: Page;
  goal: string;
  values: Value[];
  maxSteps?: number;
  onEvent?: OnEvent;
  /** Tick consent/agreement checkboxes only when the user has explicitly agreed. Default: never. */
  allowCheckboxes?: boolean;
  /** Let the agent click submit buttons. Only for read-only pages (search, calculators, "next" in a checker). Never for forms that send data to an organisation. */
  allowSubmit?: boolean;
}): Promise<BrowserRun> {
  const { page, goal, values, onEvent } = opts;
  const emit: OnEvent = onEvent ?? (() => {});
  const maxSteps = opts.maxSteps ?? 12;
  const history: string[] = [];
  const stats: RunStats = { calls: 0, ms: 0, inputTokens: 0 };
  const system = SYSTEM_BASE.replace("{{SUBMIT_RULE}}", opts.allowSubmit ? SUBMIT_OK : SUBMIT_NEVER);
  const valuesText = values.filter((v) => v.value.trim()).map((v) => `- ${v.key} (${v.description}): ${JSON.stringify(v.value)}`).join("\n");

  for (let step = 1; step <= maxSteps; step++) {
    const obs = await observe(page);
    emit({ type: "observe", step, url: obs.url, fields: obs.elements.length });

    const input = [
      `GOAL: ${goal}`,
      `VALUES (the only data you may enter):\n${valuesText}`,
      history.length ? `WHAT YOU DID SO FAR:\n${history.slice(-20).join("\n")}` : "",
      `CURRENT PAGE:\n${formatObservation(obs)}`,
    ].filter(Boolean).join("\n\n");

    const t0 = Date.now();
    const res = await respond({
      model: MODELS.browser,
      reasoning: { effort: EFFORT.browser },
      instructions: system,
      input,
      tools: TOOLS,
      tool_choice: "required",
      parallel_tool_calls: true,
    }, "form agent (backup engine)", ["identity", "health"]); // the backup engine sees the values it types
    stats.calls++; stats.ms += Date.now() - t0; stats.inputTokens += res.usage?.input_tokens ?? 0;
    const calls = res.output.filter((o): o is ResponseFunctionToolCall => o.type === "function_call");

    for (const call of calls) {
      const args = JSON.parse(call.arguments) as Record<string, unknown>;

      if (call.name === "ask_user") {
        const question = String(args.question);
        return { status: "needs_input", summary: "The form needs information we don't have.", unfilled: [], question, steps: step, stats };
      }

      if (call.name === "finish") {
        const after = await observe(page);
        const unfilled = unfilledRequired(after);
        const pending = after.elements.filter((e) => e.kind === "checkbox" && !e.checked && !e.disabled);
        if (unfilled.length === 0 && pending.length > 0) {
          if (!opts.allowCheckboxes) {
            const question = `The form asks you to confirm: "${pending[0].label}". Do you agree?`;
            return { status: "needs_input", summary: "The form needs the user's consent before it can be submitted.", unfilled: [], question, steps: step, stats };
          }
          const msg = `finish REJECTED: the user agreed, so tick these checkboxes first: ${pending.map((p) => `[${p.id}] ${p.label.slice(0, 60)}`).join("; ")}`;
          history.push(msg);
          emit({ type: "action", step, tool: "finish", args, result: msg });
          break;
        }
        if (unfilled.length === 0) return { status: "ready_to_submit", summary: String(args.summary), unfilled, steps: step, stats };
        const msg = `finish REJECTED: required fields still empty: ${unfilled.join("; ")}`;
        history.push(msg);
        emit({ type: "action", step, tool: "finish", args, result: msg });
        break; // look at the page again
      }

      const result = await execute(page, obs, call.name, args, !!opts.allowCheckboxes, !!opts.allowSubmit);
      history.push(`${call.name}(${JSON.stringify(args)}) -> ${result}`);
      if (result.startsWith("BLOCKED")) emit({ type: "blocked", step, reason: result });
      else emit({ type: "action", step, tool: call.name, args, result });
      if (call.name === "click" && result === "ok") break; // page may have changed
    }
  }

  const unfilled = unfilledRequired(await observe(page));
  return { status: "max_steps", summary: "Ran out of steps before the form was complete.", unfilled, steps: maxSteps, stats };
}

async function execute(page: Page, obs: Observation, tool: string, args: Record<string, unknown>, allowCheckboxes: boolean, allowSubmit: boolean): Promise<string> {
  const el: El | undefined = obs.elements.find((e) => e.id === args.id);
  if (!el) return `error: no element with id ${String(args.id)} on the current page`;
  if (el.disabled) return "error: element is disabled";
  const loc = page.locator(`[data-aid="${el.id}"]`);
  try {
    switch (tool) {
      case "fill":
        if (el.kind !== "text" && el.kind !== "textarea") return `error: element ${el.id} is a ${el.kind}, not a text box`;
        await loc.fill(String(args.text), { timeout: 5000 });
        return "ok";
      case "select": {
        if (el.kind !== "select") return `error: element ${el.id} is a ${el.kind}, not a dropdown`;
        const want = String(args.option).trim().toLowerCase();
        const match = el.options.find((o) => o.trim().toLowerCase() === want) ?? el.options.find((o) => o.toLowerCase().includes(want));
        if (!match) return `error: no option "${String(args.option)}". Options: ${JSON.stringify(el.options)}`;
        await loc.selectOption({ label: match }, { timeout: 5000 });
        return "ok";
      }
      case "check":
        // Consent is the user's decision. Hard rule in code.
        if (el.kind === "checkbox" && !allowCheckboxes) return "BLOCKED: the user has not agreed to this. Do not tick it. Call finish and the user will be asked.";
        if (el.kind !== "radio" && el.kind !== "checkbox") return `error: element ${el.id} is a ${el.kind}, not a radio or checkbox`;
        try {
          await loc.check({ timeout: 4000 });
        } catch {
          await loc.check({ force: true, timeout: 4000 }); // custom-drawn boxes sit under their label
        }
        return "ok";
      case "click":
        // Hard rule in code, not a prompt: the agent can never submit.
        if (el.kind === "submit" && !allowSubmit) return "BLOCKED: submitting needs human approval. Do not click it. Call finish when the form is filled.";
        await loc.click({ timeout: 5000 });
        await page.waitForTimeout(500);
        return "ok";
      default:
        return `error: unknown tool ${tool}`;
    }
  } catch (e) {
    return `error: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`;
  }
}
