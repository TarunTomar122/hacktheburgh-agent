import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

let client: OpenAI | null = null;
export function openai(): OpenAI {
  // The SDK's defaults are a 10-minute timeout and 2 retries, so one stuck call could freeze a run with no message.
  // 90 s covers the slowest writing call seen; one retry. OPENAI_TIMEOUT_MS overrides.
  return (client ??= new OpenAI({ timeout: Number(process.env.OPENAI_TIMEOUT_MS) || 90_000, maxRetries: 1 })); // reads OPENAI_API_KEY from env
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
}): Promise<z.infer<T>> {
  const res = await openai().responses.parse({
    model: opts.model,
    reasoning: { effort: opts.effort },
    instructions: opts.instructions,
    input: opts.input,
    text: { format: zodTextFormat(opts.schema, opts.name) },
  });
  if (!res.output_parsed) throw new Error(`Model returned no parsable output for ${opts.name}`);
  return res.output_parsed as z.infer<T>;
}
