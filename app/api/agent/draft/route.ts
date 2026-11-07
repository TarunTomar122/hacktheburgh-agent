import { z } from "zod";
import { draftComplaint } from "../../../../lib/agent/draft";
import { CaseFacts } from "../../../../lib/agent/facts";

/** POST { facts } -> { details, location, outcome }. The user reviews and edits this before step 1 runs. */
export async function POST(req: Request) {
  const parsed = z.object({ facts: CaseFacts }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", detail: parsed.error.message }, { status: 400 });
  try {
    return Response.json(await draftComplaint(parsed.data.facts));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
