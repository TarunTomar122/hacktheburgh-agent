// Thin client for OpenAI's Decisions API (POST /v1/decisions). Typed answers only: no free text comes back.
// Docs checked 2026-11-07: https://developers.openai.com/api/reference/resources/decisions

export const DECISION_MODEL = process.env.DECISION_MODEL ?? "gpt-6-luna";

export type DChoice = { value: string; description?: string };
export type DQuestion =
  | { type: "choice"; name: string; instructions: string; choices: DChoice[] }
  | { type: "predicate"; name: string; instructions: string };

export type DAnswer =
  | { type: "choice"; name: string; choice: string; confidence: number; probabilities: { value: string; probability: number }[] }
  | { type: "predicate"; name: string; probability: number }
  | { type: "refusal"; name: string };

export type DUsage = { input_tokens: number; output_tokens: number; total_tokens: number };

export async function decide(input: string, questions: DQuestion[]): Promise<{ answers: DAnswer[]; usage: DUsage; ms: number }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const body = JSON.stringify({ model: DECISION_MODEL, input, questions });

  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const t = Date.now();
    let res: Response;
    try {
      // A stuck request must not freeze the browser agent: give up after DECISION_TIMEOUT_MS (default 20 s) and try again.
      res = await fetch("https://api.openai.com/v1/decisions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body,
        signal: AbortSignal.timeout(Number(process.env.DECISION_TIMEOUT_MS) || 20_000),
      });
    } catch (e) {
      lastErr = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "timed out" : `network error (${e instanceof Error ? e.message : String(e)})`;
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
      continue;
    }
    const json = (await res.json().catch(() => ({}))) as { answers?: DAnswer[]; usage?: DUsage; error?: { message?: string } };
    if (res.ok && json.answers) {
      const u = json.usage ?? { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
      return { answers: json.answers, usage: u, ms: Date.now() - t };
    }
    lastErr = `${res.status} ${json.error?.message ?? "unknown error"}`;
    if (res.status !== 429 && res.status < 500) break; // do not retry client errors
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
  }
  throw new Error(`Decisions API failed: ${lastErr}`);
}

/** Probability the chosen value was picked with, from the probabilities array. */
export function probOf(a: Extract<DAnswer, { type: "choice" }>, value: string): number {
  return a.probabilities.find((p) => p.value === value)?.probability ?? 0;
}
