// Offline test of the model ledger: context travels through awaits, agents override, totals add up.
import { enterLedger, record, summarise, withLedger, type LedgerEntry } from "../lib/agent/ledger";

async function main() {
  const got: LedgerEntry[] = [];
  enterLedger({ runId: "t", agent: "elliot", emit: (e) => got.push(e.entry), t0: Date.now() });
  record({ task: "planner", model: "gpt-x", inTok: 100, outTok: 10, ms: 5 });
  await withLedger({ agent: "iona" }, async () => {
    await new Promise((r) => setTimeout(r, 5));
    record({ task: "guideline", model: "local:lfm2", inTok: 50, outTok: 5, ms: 3 });
  });
  await Promise.all([withLedger({ agent: "kit" }, async () => record({ task: "decisions", model: "gpt-6-luna", inTok: 20, outTok: 1, ms: 1 })), withLedger({ agent: "robin" }, async () => record({ task: "page", model: "gpt-x", inTok: 30, outTok: 3, ms: 2, data: [] }))]);
  record({ task: "planner", model: "gpt-x", inTok: 100, outTok: 10, ms: 5 });
  const s = summarise(got);
  const ok =
    got.length === 5 &&
    got[1].agent === "iona" && got[1].where === "local" && got[1].data.join() === "health" &&
    got[2].agent === "kit" && got[3].agent === "robin" && got[3].data.length === 0 &&
    got[4].agent === "elliot" &&
    s.find((x) => x.agent === "elliot")!.calls === 2 && s.find((x) => x.agent === "elliot")!.inTok === 200;
  console.log(ok ? "PASS: ledger context, agents, local/cloud, data kinds, totals" : `FAIL ${JSON.stringify(got)}`);
  if (!ok) process.exit(1);
}
main();
