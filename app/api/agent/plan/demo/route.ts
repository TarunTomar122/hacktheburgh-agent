import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * GET -> { runId, events: [{ t, e }] } (D63). A real recorded planner run (demo/<runId>/events.ndjson, screenshots
 * alongside), so the run screen and case file can be shown in seconds during a demo. The client plays it back.
 */
export async function GET() {
  const root = path.join(process.cwd(), "demo");
  try {
    const runId = (await readdir(root)).filter((d) => /^step3-[0-9T-]+Z?$/.test(d)).sort().at(-1);
    if (!runId) throw new Error("no demo run");
    const text = await readFile(path.join(root, runId, "events.ndjson"), "utf8");
    const events = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    return Response.json({ runId, events }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "No recorded demo run yet" }, { status: 404 });
  }
}
