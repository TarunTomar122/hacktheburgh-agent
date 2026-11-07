import assert from "node:assert/strict";
import { emptyFacts } from "../lib/agent/facts";
import { InputError, interviewTurn } from "../lib/agent/interview";

// Live extraction regression. Fictional text only; no browser actions or submissions.
async function main() {
  for (const [text, reject] of [["dfahkdiosfaiojf", true], ["afkjnfaf", true], ["I fell", false], ["i hurt my arm an the docter didnt chek it", false]] as const) {
    const known = { ...emptyFacts(), firstName: "Test Patient" };
    const before = JSON.stringify(known);
    const run = () => interviewTurn([{ role: "agent", content: "Tell me what happened." }, { role: "user", content: text }], known);
    if (reject) await assert.rejects(run, (e: unknown) => e instanceof InputError && /Please try again/.test(e.message));
    else assert.ok((await run()).facts.incidentSummary);
    assert.equal(JSON.stringify(known), before);
    console.log(`PASS: ${reject ? "rejects meaningless text" : "accepts meaningful text"}: ${text}`);
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
