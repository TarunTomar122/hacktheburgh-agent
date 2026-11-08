// Deterministic checks for the discovery speed levers (no network, no model): npx tsx scripts/test-discovery-speed.ts
import { LEVERS, parseSpeed, PRESETS, speedLabel } from "../lib/agent/discoverySpeed";

let fail = 0;
const ok = (name: string, cond: boolean) => {
  if (!cond) fail++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}`);
};
const on = (spec?: string | null) => LEVERS.filter((l) => parseSpeed(spec)[l]).join("+");

ok("default is classic (all off)", on(undefined) === "" && on("") === "" && speedLabel(parseSpeed(null)) === "classic");
ok("fast turns all five on", on("fast") === LEVERS.join("+") && speedLabel(parseSpeed("fast")) === "fast");
ok("quick = everything except workers", on("quick") === "fastmodel+batch+autorecord+selfrecover");
ok("single levers and lists", on("batch") === "batch" && on("fastmodel,batch") === "fastmodel+batch" && on("fastmodel batch+workers") === "fastmodel+batch+workers");
ok("preset plus a lever", on("quick,workers") === LEVERS.join("+"));
ok("unknown words are ignored", on("turbo,batch") === "batch" && on("nonsense") === "");
ok("case-insensitive", on("FAST") === LEVERS.join("+"));
ok("labels", speedLabel(parseSpeed("fastmodel,batch")) === "fastmodel+batch");
ok("presets are not shared objects", parseSpeed("classic") !== PRESETS.classic);
process.exit(fail ? 1 : 0);
