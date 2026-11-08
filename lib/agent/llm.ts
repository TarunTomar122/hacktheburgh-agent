import OpenAI from "openai";
import { zodResponseFormat, zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { currentAgent, record, SEES, type DataKind } from "./ledger";
import { throwIfCancelled } from "./runControl";

let client: OpenAI | null = null;
export function openai(): OpenAI {
  return (client ??= new OpenAI()); // reads OPENAI_API_KEY from env (.env.local)
}

// Local models run in Ollama on this Mac, through its OpenAI-compatible API. Model ids look like "local:qwen3:8b".
let localClient: OpenAI | null = null;
function ollama(): OpenAI {
  return (localClient ??= new OpenAI({ baseURL: process.env.OLLAMA_URL ?? "http://localhost:11434/v1", apiKey: "ollama", maxRetries: 0, timeout: 180_000 }));
}
export const isLocal = (model: string) => model.startsWith("local:");

// Override per role with env vars. Browser steps want speed; writing wants quality.
export const MODELS = {
  interview: process.env.INTERVIEW_MODEL ?? "gpt-5.4-mini",
  draft: process.env.DRAFT_MODEL ?? "gpt-5.4",
  browser: process.env.BROWSER_MODEL ?? "gpt-5.4-mini",
  /** Writing and reasoning over the patient's health story, money or identity: on this Mac (night plan, Phase 4b). */
  private: process.env.PRIVATE_MODEL ?? "local:qwen3:8b",
  /** Short structured checks over private data (a label, an option, a yes/no). */
  privateCheck: process.env.PRIVATE_CHECK_MODEL ?? "local:qwen3:8b",
};

type Effort = "none" | "low" | "medium" | "high";
export const EFFORT = {
  interview: (process.env.INTERVIEW_EFFORT as Effort) ?? "low",
  draft: (process.env.DRAFT_EFFORT as Effort) ?? "low",
  browser: (process.env.BROWSER_EFFORT as Effort) ?? "none",
};

const SENSITIVE: DataKind[] = ["health", "money", "identity"];
export const isSensitive = (data: DataKind[]) => data.some((d) => SENSITIVE.includes(d));
export const localModelsOn = () => process.env.LOCAL_MODELS !== "0";

/**
 * The one place where a call's model follows from its data (night plan, Phase 4b). Anything that carries the
 * patient's health story, money or identity runs on a local model unless LOCAL_MODELS=0; everything else (public
 * pages, plans with placeholders) uses the cloud model for its role.
 *   "draft": writing (complaint, enquiry) and comparing.  "reason": date arithmetic (time limits); locally Qwen3 thinks
 *   for these, because without thinking it missed the 12-month backstop 3 of 3 times in the bench.  "check": a short
 *   structured check (an option, a label).
 */
export function modelFor(task: "draft" | "reason" | "check", data: DataKind[]): { model: string; effort: Effort } {
  if (localModelsOn() && isSensitive(data)) return { model: task === "check" ? MODELS.privateCheck : MODELS.private, effort: task === "reason" ? "medium" : "low" };
  return task === "check" ? { model: MODELS.browser, effort: "low" } : { model: MODELS.draft, effort: task === "reason" ? "low" : EFFORT.draft };
}

/** A local call that failed (Ollama down, or output that did not match the schema twice). */
export class LocalModelError extends Error {}

type StructuredOpts<T extends z.ZodType> = {
  model: string;
  effort: Effort;
  instructions: string;
  input: string;
  schema: T;
  name: string;
  data?: DataKind[]; // kinds of personal data in the input, if not the agent's default (ledger)
};

/** One model call that must return JSON matching a zod schema. Local ("local:...") or cloud. */
export async function structured<T extends z.ZodType>(opts: StructuredOpts<T>): Promise<z.infer<T>> {
  throwIfCancelled();
  if (!isLocal(opts.model)) return cloudStructured(opts);
  try {
    return await localStructured(opts);
  } catch (e) {
    const data = opts.data ?? SEES[currentAgent()];
    const why = e instanceof Error ? e.message : String(e);
    if (isSensitive(data)) {
      throw new LocalModelError(`The local model ${opts.model} failed for ${opts.name} (${why}). This call carries the patient's ${data.join(", ")} data, so it was NOT sent to the cloud. Start Ollama (ollama serve) and pull the model, or set LOCAL_MODELS=0 to allow cloud models.`);
    }
    const fallback = process.env.CLOUD_FALLBACK_MODEL ?? MODELS.draft;
    console.warn(`[llm] local model ${opts.model} failed for ${opts.name} (${why}); no private data in this call, so it falls back to ${fallback} in the cloud`);
    return cloudStructured({ ...opts, model: fallback, effort: opts.effort === "none" ? "low" : opts.effort });
  }
}

async function cloudStructured<T extends z.ZodType>(opts: StructuredOpts<T>): Promise<z.infer<T>> {
  const t0 = Date.now();
  const res = await openai().responses.parse({
    model: opts.model,
    reasoning: { effort: opts.effort },
    instructions: opts.instructions,
    input: opts.input,
    text: { format: zodTextFormat(opts.schema, opts.name) },
  });
  record({ task: opts.name, model: opts.model, inTok: res.usage?.input_tokens ?? 0, outTok: res.usage?.output_tokens ?? 0, ms: Date.now() - t0, data: opts.data });
  if (!res.output_parsed) throw new Error(`Model returned no parsable output for ${opts.name}`);
  return res.output_parsed as z.infer<T>;
}

/**
 * Ollama, with the JSON schema both as a grammar (response_format json_schema, which Ollama enforces) and in the
 * prompt (Ollama does not show the schema's field descriptions to the model). Qwen3 thinks only for effort "medium" or
 * "high" (modelFor's "reason"); LOCAL_THINK=1 / 0 forces it on / off. Off = reasoning_effort "none" ("/no_think" in the
 * prompt did not turn it off in Ollama 0.40). One retry on output that fails zod.
 */
async function localStructured<T extends z.ZodType>(opts: StructuredOpts<T>): Promise<z.infer<T>> {
  const name = opts.model.slice("local:".length);
  const fmt = zodResponseFormat(opts.schema, opts.name);
  const think = process.env.LOCAL_THINK === "1" ? opts.effort !== "none" : process.env.LOCAL_THINK === "0" ? false : opts.effort === "medium" || opts.effort === "high";
  const system = `${opts.instructions}\n\nReply with one JSON object only, matching this JSON schema (follow each field's description):\n${JSON.stringify(fmt.json_schema.schema)}`;
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = Date.now();
    let res: OpenAI.Chat.Completions.ChatCompletion;
    try {
      res = await ollama().chat.completions.create({
        model: name,
        messages: [
          { role: "system", content: system },
          { role: "user", content: opts.input },
        ],
        response_format: { type: "json_schema", json_schema: fmt.json_schema },
        ...(think ? {} : { reasoning_effort: "none" as never }),
        temperature: 0.2,
      });
    } catch (e) {
      throw new LocalModelError(`Ollama unreachable or errored: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
    }
    record({ task: attempt ? `${opts.name} (retry)` : opts.name, model: opts.model, where: "local", inTok: res.usage?.prompt_tokens ?? 0, outTok: res.usage?.completion_tokens ?? 0, ms: Date.now() - t0, data: opts.data });
    const text = (res.choices[0]?.message?.content ?? "").replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, "");
    try {
      const parsed = opts.schema.safeParse(JSON.parse(text));
      if (parsed.success) return parsed.data as z.infer<T>;
      last = parsed.error.message.slice(0, 200);
    } catch (e) {
      last = `not JSON: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200);
    }
  }
  throw new LocalModelError(`output did not match the ${opts.name} schema twice (${last})`);
}

/** One planner or agent-loop call to the Responses API, written to the ledger. Always cloud. */
export async function respond(body: Parameters<OpenAI["responses"]["create"]>[0] & { stream?: false }, task: string, data?: DataKind[]) {
  throwIfCancelled();
  const t0 = Date.now();
  const res = await openai().responses.create(body);
  record({ task, model: String(body.model), inTok: res.usage?.input_tokens ?? 0, outTok: res.usage?.output_tokens ?? 0, ms: Date.now() - t0, data });
  return res;
}
