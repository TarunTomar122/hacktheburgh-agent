import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { record, type DataKind } from "./ledger";

let client: OpenAI | null = null;
export function openai(): OpenAI {
  return (client ??= new OpenAI()); // reads OPENAI_API_KEY from env (.env.local)
}

// Override per role with env vars. Browser steps want speed; writing wants quality.
export const MODELS = {
  interview: process.env.INTERVIEW_MODEL ?? "gpt-5.4-mini",
  draft: process.env.DRAFT_MODEL ?? "gpt-5.4",
  browser: process.env.BROWSER_MODEL ?? "gpt-5.4-mini",
};

type Effort = "none" | "low" | "medium" | "high";
export const EFFORT = {
  interview: (process.env.INTERVIEW_EFFORT as Effort) ?? "low",
  draft: (process.env.DRAFT_EFFORT as Effort) ?? "low",
  browser: (process.env.BROWSER_EFFORT as Effort) ?? "none",
};

/** One model call that must return JSON matching a zod schema. */
export async function structured<T extends z.ZodType>(opts: {
  model: string;
  effort: Effort;
  instructions: string;
  input: string;
  schema: T;
  name: string;
  data?: DataKind[]; // kinds of personal data in the input, if not the agent's default (ledger)
}): Promise<z.infer<T>> {
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

/** One planner or agent-loop call to the Responses API, written to the ledger. */
export async function respond(body: Parameters<OpenAI["responses"]["create"]>[0] & { stream?: false }, task: string, data?: DataKind[]) {
  const t0 = Date.now();
  const res = await openai().responses.create(body);
  record({ task, model: String(body.model), inTok: res.usage?.input_tokens ?? 0, outTok: res.usage?.output_tokens ?? 0, ms: Date.now() - t0, data });
  return res;
}
