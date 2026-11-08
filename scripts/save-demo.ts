// Keep a finished run as a demo recording: its events and screenshots, copied from .runs/<run> to demo/<run>, with the
// place it was made for (demo/<run>/meta.json), so the demo can play it ("Use the recorded run") when a live step is slow.
//   npx tsx scripts/save-demo.ts <runId> [place]    place defaults to the run's own place, else "Scotland"
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const run = process.argv[2];
if (!run || !/^(step3|complaint|discovery|escalation|medicine)-[0-9T-]+Z?(-[a-z0-9]{4})?$/.test(run)) {
  console.error("usage: npx tsx scripts/save-demo.ts <runId> [place]");
  process.exit(1);
}
const from = path.join(".runs", run);
if (!existsSync(path.join(from, "events.ndjson"))) {
  console.error(`no run at ${from}`);
  process.exit(1);
}
const text = readFileSync(path.join(from, "events.ndjson"), "utf8");
if (!/"type":"(planner|complaint|escalation|discovery|medicine)_result"|"type":"result"/.test(text)) console.warn("warning: this run has no result event; its playback will end without one");
// The run's own place (research writes it), else the one given.
let place = process.argv[3] ?? "";
if (!place) {
  for (const l of text.split("\n")) {
    try {
      const e = JSON.parse(l).e;
      if (e?.type === "place" && e.place?.region) place = e.place.region;
      else if (e?.type === "place" && e.place?.country && !place) place = e.place.country;
    } catch {}
  }
}
place ||= "Scotland";
const to = path.join("demo", run);
mkdirSync(to, { recursive: true });
copyFileSync(path.join(from, "events.ndjson"), path.join(to, "events.ndjson"));
// The access log and the model ledger too, so /insights can tell the run in full from the recording alone.
for (const f of ["access.ndjson", "ledger.ndjson"]) if (existsSync(path.join(from, f))) copyFileSync(path.join(from, f), path.join(to, f));
const shots = readdirSync(from).filter((f) => f.endsWith(".jpg"));
for (const f of shots) copyFileSync(path.join(from, f), path.join(to, f));
const flow = run.split("-")[0];
writeFileSync(path.join(to, "meta.json"), JSON.stringify({ flow, place }) + "\n");
console.log(`saved ${run} -> ${to} (${shots.length} screenshots, place ${place})`);
