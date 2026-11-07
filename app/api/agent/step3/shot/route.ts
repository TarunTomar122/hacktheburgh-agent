import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * GET ?run=<runId>&file=<shot> -> one JPEG screenshot from a step 3 trace (D39).
 * Only files written by the step 3 runner, under .runs/step3-*, are served; both names are checked strictly.
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const run = u.searchParams.get("run") ?? "";
  const file = u.searchParams.get("file") ?? "";
  if (!/^step3-[0-9T-]+Z?$/.test(run) || !/^[a-zA-Z0-9-]+\.jpg$/.test(file)) return new Response("Not found", { status: 404 });
  try {
    const data = await readFile(path.join(process.cwd(), ".runs", run, file));
    return new Response(new Uint8Array(data), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
