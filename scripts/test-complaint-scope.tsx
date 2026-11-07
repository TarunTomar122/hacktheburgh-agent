import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Page } from "playwright";
import { emptyFacts } from "../lib/agent/facts";
import { factualComplaint, supportsLothian, hasFractureContext } from "../lib/agent/complaintScope";
import { fillNhsForm, fillNhsComplaint } from "../lib/agent/nhsLothian";
import { runComplaint } from "../lib/agent/complaintPlanner";
import { draftComplaint } from "../lib/agent/draft";
import UnsupportedComplaint from "../app/case/UnsupportedComplaint";

async function main() {
  Object.assign(globalThis, { React });
  const facts = { ...emptyFacts(), incidentLocation: "Mater Dei Hospital", incidentSummary: "I was hit by a car and was advised to use ice.", events: [{ date: "last week", what: "I went to Mater Dei Hospital." }], desiredOutcome: "An apology." };
  assert.equal(supportsLothian(facts), false);
  assert.equal(supportsLothian({ ...facts, incidentLocation: "GP surgery" }), false);
  assert.equal(supportsLothian({ ...facts, incidentLocation: "Royal Infirmary of Edinburgh, A&E" }), true);
  assert.equal(hasFractureContext(facts), false);
  assert.equal(hasFractureContext({ ...facts, incidentSummary: "A suspected scaphoid fracture" }), true);
  const draft = factualComplaint(facts);
  assert.equal(await draftComplaint(facts).then((d) => d.details), draft.details);
  // A missing page object proves the route is rejected before any browser interaction.
  await assert.rejects(fillNhsForm({} as Page, facts, draft), /not confirmed/);
  await assert.rejects(fillNhsComplaint(facts, draft), /not confirmed/);
  const result = await runComplaint(facts);
  assert.equal(result.form.status, "not_started");
  assert.equal(result.form.url, "");
  assert.equal(result.timeLimit, undefined);
  assert.equal(result.process, undefined);
  assert.deepEqual(result.evidence, {});
  assert.equal(result.draft?.details, draft.details);
  const html = renderToStaticMarkup(<UnsupportedComplaint facts={facts} />);
  assert.match(html, /Copy draft/);
  assert.match(html, /Download draft/);
  assert.match(html, /local deadlines/);
  assert.ok(!html.includes("Run again"));
  assert.ok(!html.includes("You are in time"));
  assert.ok(!html.includes("NG38"));
  console.log("PASS: unsupported case stays draft-only, no browser/model calls, no deadline or guideline claims, editable export available");
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
