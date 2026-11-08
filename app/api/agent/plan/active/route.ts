import { activeRun } from "../../../../../lib/agent/runRegistry";

/** GET ?slot=<case id>:<screen> -> { run } : the run still going in that slot, else the newest finished one, else null. */
export async function GET(req: Request) {
  const slot = new URL(req.url).searchParams.get("slot") ?? "";
  return Response.json({ run: slot ? activeRun(slot) : null }, { headers: { "Cache-Control": "no-store" } });
}
