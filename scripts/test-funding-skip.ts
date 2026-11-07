import assert from "node:assert/strict";
import { chromium } from "playwright";
import { calculatorAsking } from "../lib/agent/planner";
import { EMPTY_FUNDING } from "../lib/agent/legalAidTypes";
import { Tracker, type Note } from "../lib/agent/legalAid";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addInitScript("window.__name = (f) => f;");
  const page = await context.newPage();
  // All navigation is served locally. No model calls, real calculator or patient data.
  await page.route("**/*", (route) => route.fulfill({ contentType: "text/html", body: `
    <fieldset><input id="b-y" type="radio" name="benefits" value="Yes"><label for="b-y">Yes</label><input id="b-n" type="radio" name="benefits" value="No"><label for="b-n">No</label></fieldset>
    <fieldset><input id="p-y" type="radio" name="partner" value="Yes"><label for="p-y">Yes</label><input id="p-n" type="radio" name="partner" value="No"><label for="p-n">No</label></fieldset>
    <label>How many dependants<select><option value="0">0</option></select></label>
    <label>Net annual income<input></label><label>Annual outgoings<input></label><label>Total disposable capital<input></label>
    <p>Step 5: Estimate You are likely to qualify for civil legal aid. Some final points</p>` }));
  try {
    const funding = { ...EMPTY_FUNDING };
    const answers: (string | null)[] = ["no", "no", "0", null, "100", "0"];
    const note = Object.assign(() => {}, { log: async () => {} }) as Note;
    const result = await calculatorAsking(page, funding, async () => answers.shift() ?? null, note, new Tracker(() => {}));
    assert.equal(result.skipped, true);
    assert.equal(result.verdict, "unknown");
    assert.equal(funding.netIncomeYearly, null);
    assert.equal(await page.getByLabel("Net annual income", { exact: true }).inputValue(), "");
    console.log("PASS: skipped finances stay unknown even when the page displays a positive estimate");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
