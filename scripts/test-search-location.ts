import assert from "node:assert/strict";
import { askSearchLocation } from "../lib/agent/searchLocation";
async function run(answers: (string | null)[]) {
  const questions: string[] = [];
  const result = await askSearchLocation(async (q) => { questions.push(q.question); assert.ok(answers.length); return answers.shift()!; });
  return { result, questions };
}
async function main() {
  for (const answer of ["No", null]) {
    const r = await run([answer]);
    assert.deepEqual(r.result, { allowed: false });
    assert.equal(r.questions.length, 1);
  }
  const approved = await run(["Yes", "g1 1xw"]);
  assert.deepEqual(approved.result, { allowed: true, postcode: "G1 1XW" });
  assert.match(approved.questions[1], /patient/);
  assert.deepEqual((await run(["Yes", null])).result, { allowed: false });
  assert.deepEqual((await run(["Yes", "invalid", "No"])).result, { allowed: false });
  assert.deepEqual((await run(["Yes", "invalid", "Yes", "eh1 1aa"])).result, { allowed: true, postcode: "EH1 1AA" });
  console.log("PASS: permission first, patient postcode, decline, skip, validation and retry");
}
void main();
