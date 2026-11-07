import { z } from "zod";
import { CaseFacts } from "../../../../lib/agent/facts";
import { recommendTrack } from "../../../../lib/agent/track";
import { trackSignals } from "../../../../lib/agent/trackSignals";

/** POST { facts } -> TrackRecommendation (D42): which track fits, with a fit % and reasons for each. */
export async function POST(req: Request) {
  const parsed = z.object({ facts: CaseFacts }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", detail: parsed.error.message }, { status: 400 });
  const signals = await trackSignals(parsed.data.facts);
  return Response.json(recommendTrack(parsed.data.facts, signals));
}
