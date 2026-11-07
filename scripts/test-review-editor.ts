import assert from "node:assert/strict";
import { chromium } from "playwright";
import { SAMPLE_FACTS } from "../lib/agent/sample";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Isolated browser context, fictional data, mocked agent: no model or external form requests.
  await page.route("**/api/agent/**", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ facts: SAMPLE_FACTS, reply: "Please review your details.", done: true, missing: [], target: "done", input: { kind: "none", target: "done" } }) }));
  try {
    await page.goto("http://localhost:3000");
    await page.getByLabel("Your name", { exact: true }).fill("Test Patient");
    await page.getByRole("button", { name: "OK", exact: true }).click();
    await page.getByRole("button", { name: "Edit details", exact: true }).click();
    await page.getByLabel("What happened", { exact: true }).fill("Discard this change");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.getByText("Discard this change", { exact: true }).count(), 0);
    await page.getByRole("button", { name: "Edit details", exact: true }).click();
    await page.getByLabel("First name", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Please complete" }).waitFor();
    await page.getByLabel("First name", { exact: true }).fill("Test Patient");
    await page.getByLabel("What happened", { exact: true }).fill("Corrected fictional story.");
    await page.getByLabel("Description of event 1", { exact: true }).fill("Corrected fictional event.");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.getByText("Corrected fictional story.", { exact: true }).waitFor();
    await page.getByRole("button", { name: "Looks right, start my case", exact: true }).click();
    await page.waitForURL("**/case");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("case-profile-v2")!).facts);
    assert.equal(saved.firstName, "Test Patient");
    assert.equal(saved.incidentSummary, "Corrected fictional story.");
    assert.equal(saved.events[0].what, "Corrected fictional event.");
    assert.deepEqual(errors, []);
    console.log("PASS: cancel discards, invalid details block saving, corrected story and timeline are used to start the case");
  } catch (error) { console.error(await page.locator("main").innerText()); throw error; }
  finally { await browser.close(); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
