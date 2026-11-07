import assert from "node:assert/strict";
import { chromium } from "playwright";
import { SAMPLE_FACTS, SAMPLE_DRAFT } from "../lib/agent/sample";
import { FIXTURE_RESULT } from "../lib/agent/legalAidFixture";
import { EMPTY_FUNDING } from "../lib/agent/legalAidTypes";
async function main() {
 const browser = await chromium.launch({ headless: true });
 const page = await browser.newPage();
 const errors: string[] = [];
 page.on("pageerror", e => errors.push(e.message));
 let drafts = 0;
 await page.route("**/api/agent/step4/draft", route => {
   drafts++;
   return route.fulfill({ status: drafts === 1 ? 503 : 200, contentType: "application/json", body: JSON.stringify(drafts === 1 ? { error: "Draft temporarily unavailable" } : { subject: "Fictional test", body: "Fictional message for testing only." }) });
 });
 await page.route("**/api/agent/plan", route => route.abort());
 await page.route("**/api/agent/step4", route => route.abort());
 try {
  await page.goto("http://localhost:3000");
  await page.evaluate(profile => localStorage.setItem("case-profile-v2", JSON.stringify(profile)), { facts: SAMPLE_FACTS, draft: SAMPLE_DRAFT, messages: [], track: { chosen: "compensation" }, legalAid: { funding: EMPTY_FUNDING, result: FIXTURE_RESULT, selected: [FIXTURE_RESULT.firms[0].id] }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  await page.goto("http://localhost:3000/case");
  await page.getByRole("button", { name: /Contact lawyers/ }).click();
  await page.getByRole("alert").filter({ hasText: "Draft temporarily unavailable" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Fill their enquiry forms", exact: true }).isDisabled(), true);
  await page.getByRole("button", { name: "Try writing the message again", exact: true }).click();
  await page.getByText("Fictional message for testing only.", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Fill their enquiry forms", exact: true }).isEnabled(), true);
  assert.equal(drafts, 2);
  assert.deepEqual(errors, []);
  console.log("PASS: drafting failure is visible, retry succeeds, filling unlocks without submitting");
 } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
