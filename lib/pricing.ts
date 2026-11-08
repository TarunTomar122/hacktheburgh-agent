/**
 * List prices behind the cost figures on /insights. USD per million tokens. These are estimates at standard list prices:
 * no cached-input, batch or contract discounts. A model that is not here is shown as "not priced" and left out of the totals,
 * never guessed. Models that run on this Mac (ids starting "local:") cost nothing per call.
 * Prices checked 2026-11-08 against OpenAI's model pages as reported by third-party price trackers and Linkup's pricing page; confirm before quoting them.
 */
export type Price = { in: number; out: number };

export const MODEL_PRICES: Record<string, Price> = {
  "gpt-5.4": { in: 2.5, out: 15 },
  "gpt-5.4-mini": { in: 0.75, out: 4.5 },
  // The Decisions API (gpt-6-luna) charges for input only; output answers are free.
  "gpt-6-luna": { in: 0.1, out: 0 },
};

/** One standard Linkup web search. */
export const SEARCH_PRICE = 0.005;

export const isLocalModel = (id: string) => id.startsWith("local:");

/** Dollars for one model's tokens, 0 for a local model, null when the model has no listed price. */
export function costOf(model: string, inTok: number, outTok: number): number | null {
  if (isLocalModel(model)) return 0;
  const p = MODEL_PRICES[model];
  return p ? (inTok * p.in + outTok * p.out) / 1_000_000 : null;
}

export const usd = (n: number) => (n < 0.01 ? `$${n.toFixed(4)}` : n < 1 ? `$${n.toFixed(3)}` : `$${n.toFixed(2)}`);
export const tokens = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(2)}M` : n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));
