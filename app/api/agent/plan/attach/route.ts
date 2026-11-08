import { getRun, streamRun } from "../../../../../lib/agent/runRegistry";

/**
 * GET ?runId=... -> NDJSON, the same events as POST /api/agent/plan, for a run that is (or was) going on this server.
 * First {type:"attached", runId, flow, startedAt, status, now}, then every event so far (each with `_t`, ms since the
 * start), then {type:"live"}, then the live tail until the run ends. Going away only detaches; it never stops the run.
 * 404 if the server does not know the run (it restarted, or the run is old): the client starts clean.
 */
export async function GET(req: Request) {
  const runId = new URL(req.url).searchParams.get("runId") ?? "";
  const run = /^[A-Za-z0-9_-]{1,80}$/.test(runId) ? getRun(runId) : null;
  if (!run) return Response.json({ error: "Unknown run" }, { status: 404 });
  return streamRun(run, true);
}
