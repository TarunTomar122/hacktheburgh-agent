import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ageBandOf, checkApplicability, clearGuidance } from "../lib/agent/guidance";
import type { CaseFacts } from "../lib/agent/facts";
import type { EvidenceResult } from "../lib/agent/plannerTypes";

// A short model-call test (local model by default, no browser): quotes saved from earlier runs, an adult persona.
// The NZ quote came from a children's hospital page and must NOT be used for an adult; the NICE one must be.
const persona = JSON.parse(readFileSync("scripts/personas/new-zealand.json", "utf8")) as CaseFacts;
const patient = { ageBand: "", condition: "suspected scaphoid fracture of the wrist", setting: "public", place: "New Zealand" };

async function main() {
  const band = await ageBandOf(persona);
  console.log("age band:", band);
  patient.ageBand = band.band.replace(/_/g, " ");
  const nz = await checkApplicability(patient, { body: "Starship Child Health", title: "Fracture clinic: scaphoid fractures", url: "https://www.starship.org.nz/guidelines/fracture-clinic-scaphoid-fractures/" }, ["N.B Scaphoid fractures are extremely rare in children under 10 years of age."]);
  console.log("children's page:", nz);
  const nice = await checkApplicability({ ...patient, place: "England" }, { body: "NICE", title: "Fractures (non-complex): assessment and management (NG38)", url: "https://www.nice.org.uk/guidance/NG38/chapter/recommendations" }, ["Consider MRI for first-line imaging in people with suspected scaphoid fractures following a thorough clinical examination."]);
  console.log("NICE:", nice);
  const wrongCondition = await checkApplicability(patient, { body: "NICE", title: "Hip fracture", url: "https://www.nice.org.uk/guidance/cg124" }, ["Offer surgery on the day of admission or the following day to people with hip fracture."]);
  console.log("other condition:", wrongCondition);
  assert.notEqual(nz[0].verdict, "applies", "a children-under-10 note must not apply to an adult");
  assert.equal(nice[0].verdict, "applies");
  assert.notEqual(wrongCondition[0].verdict, "applies");

  const proof: EvidenceResult = { guideline: { name: "x", url: "u", points: [{ id: "1", text: "t" }] }, gaps: [{ guideline: "g", timeline: "t", question: "q" }], caveat: "c" };
  clearGuidance(proof);
  assert.deepEqual(proof, {});
  console.log("applicability and clearGuidance checks pass");
}
main().catch((e) => { console.error(e); process.exit(1); });
