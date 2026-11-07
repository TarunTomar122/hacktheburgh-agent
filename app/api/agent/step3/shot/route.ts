import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * GET ?run=<runId>&file=<shot> -> one JPEG screenshot from a step 3 trace (D39).
 * Only files written by the step 3 and step 4 runners, under .runs/step3-* or .runs/step4-*, are served; both names are checked strictly.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const run = u.searchParams.get("run") ?? "";
  const file = u.searchParams.get("file") ?? "";
  if (!/^(step[34]|complaint)-[0-9T-]+Z?$/.test(run) || !/^[a-zA-Z0-9-]+\.jpg$/.test(file)) return new Response("Not found", { status: 404 });
  // A run on this machine first, then the recorded demo run that ships with the repo (D63).
  for (const dir of [path.join(process.cwd(), ".runs", run), path.join(process.cwd(), "demo", run)]) {
    try {
      const data = await readFile(path.join(dir, file));
      return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
    } catch {
      /* try the next place */
    }
  }
  return new Response("Not found", { status: 404 });
}
