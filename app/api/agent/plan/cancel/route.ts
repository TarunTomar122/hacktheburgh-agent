import { z } from "zod";
import { cancelRun } from "../../../../../lib/agent/runRegistry";

/** POST { runId } -> { ok }. The only way (with starting a new run in the same slot) a run stops: closes its browsers and ends its work. */
export async function POST(req: Request) {
  const parsed = z.object({ runId: z.string().max(80) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const ok = cancelRun(parsed.data.runId);
  return Response.json({ ok }, { status: ok ? 200 : 404 });
}
