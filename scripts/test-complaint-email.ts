import assert from "node:assert/strict";
import { chromium } from "playwright";
import { emailOnlyGoals, buildComplaintEmail } from "../lib/agent/complaintEmail";
import { OUTCOME_CHOICES, outcomeSentence } from "../lib/agent/inputs";
import { SAMPLE_FACTS, SAMPLE_DRAFT } from "../lib/agent/sample";

async function main() {
  for (const choices of [[OUTCOME_CHOICES[0]], [OUTCOME_CHOICES[1]], OUTCOME_CHOICES.slice(0, 2)]) assert.equal(emailOnlyGoals(outcomeSentence(choices, "")), true);
  for (const outcome of [null, "", outcomeSentence([OUTCOME_CHOICES[0], OUTCOME_CHOICES[4]], ""), outcomeSentence([OUTCOME_CHOICES[1]], "I also need treatment")]) assert.equal(emailOnlyGoals(outcome), false);
  const facts = { ...SAMPLE_FACTS, desiredOutcome: outcomeSentence(OUTCOME_CHOICES.slice(0, 2), "") };
  assert.match(buildComplaintEmail(facts).subject, /an explanation and an apology/);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/agent/**", (route) => route.abort());
  try {
    await page.goto("http://localhost:3000");
    await page.evaluate((profile) => localStorage.setItem("case-profile-v2", JSON.stringify(profile)), { facts, draft: SAMPLE_DRAFT, messages: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    await page.goto("http://localhost:3000/case");
    await page.getByRole("button", { name: "Draft an email", exact: true }).click();
    await page.getByRole("heading", { name: "Start with an email", exact: true }).waitFor();
    assert.equal(await page.getByRole("navigation", { name: "Steps", exact: true }).count(), 0);
    await page.getByLabel("Email subject", { exact: true }).fill("My edited subject");
    await page.getByLabel("Email message", { exact: true }).fill("My edited fictional email.");
    await page.reload();
    assert.equal(await page.getByLabel("Email message", { exact: true }).inputValue(), "My edited fictional email.");
    assert.equal(await page.getByLabel("Email subject", { exact: true }).inputValue(), "My edited subject");
    await page.getByRole("button", { name: "Make a formal complaint instead", exact: true }).click();
    await page.getByRole("heading", { name: "Complain to NHS Lothian", exact: true }).waitFor();
    const mode = await page.evaluate(() => JSON.parse(localStorage.getItem("case-profile-v2")!).track.complaintMode);
    assert.equal(mode, "formal");
    assert.deepEqual(errors, []);
    console.log("PASS: goal branching, editable email persists across reload, no automatic escalation, formal route remains available");
  } finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
