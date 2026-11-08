import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * GET -> { runId, events: [{ t, e }] }. A real recorded planner run (demo/<runId>/events.ndjson, screenshots
 * alongside), so the run screen and case file can be shown in seconds during a demo. The client plays it back.
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const asked = params.get("flow");
  const flow = asked === "complaint" || asked === "discovery" || asked === "escalation" || asked === "medicine" ? asked : "step3";
  // ?place=Wales: only a recording made for that place (demo/<run>/meta.json), so a Welsh case never plays a Scottish run.
  const place = params.get("place")?.toLowerCase() ?? null;
  const root = path.join(process.cwd(), "demo");
  try {
    // Run folders end with the time, and newer ones with a short random tail ("-x1y2") so runs started together never share a folder.
    const runs = (await readdir(root)).filter((d) => new RegExp(`^${flow}-[0-9T-]+Z?(-[a-z0-9]{4})?$`).test(d)).sort();
    const placeOf = async (d: string) => {
      try {
        return String(JSON.parse(await readFile(path.join(root, d, "meta.json"), "utf8")).place ?? "").toLowerCase();
      } catch {
        return "";
      }
    };
    const matching: string[] = [];
    for (const d of runs) if (!place || (await placeOf(d)) === place) matching.push(d);
    const runId = matching.at(-1);
    if (!runId) throw new Error("no demo run");
    const text = await readFile(path.join(root, runId, "events.ndjson"), "utf8");
    const events = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    return Response.json({ runId, events }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "No recorded demo run yet" }, { status: 404 });
  }
}
