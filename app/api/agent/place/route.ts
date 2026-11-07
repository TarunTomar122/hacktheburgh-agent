import { z } from "zod";
import { CaseFacts } from "../../../../lib/agent/facts";
import { detectPlace } from "../../../../lib/agent/place";

/** POST { facts } -> Place: where the care happened (country, region, city), read by the model from the story and address. */
export async function POST(req: Request) {
  const parsed = z.object({ facts: CaseFacts }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", detail: parsed.error.message }, { status: 400 });
  try {
    return Response.json(await detectPlace(parsed.data.facts));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
