import assert from "node:assert/strict";
import { chromium } from "playwright";
import { SAMPLE_FACTS, SAMPLE_DRAFT } from "../lib/agent/sample";
import { FIXTURE_RESULT } from "../lib/agent/legalAidFixture";
import { EMPTY_FUNDING } from "../lib/agent/legalAidTypes";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  await page.addInitScript("window.__name = (f) => f;");
  await page.route("**/api/agent/plan", (route) => route.abort());
  await page.route("**/api/agent/plan/answer", (route) => route.abort());
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const profile = { facts: SAMPLE_FACTS, draft: SAMPLE_DRAFT, messages: [], track: { chosen: "compensation" }, legalAid: { funding: EMPTY_FUNDING }, enquiry: { sample: true }, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  const result = { ...FIXTURE_RESULT, runId: "review-test", plan: [], thoughts: [], says: [], evidence: {}, enquiries: [], asks: 1, recoveries: 0, turns: 1 };
  await page.addInitScript(({ profile, result }) => {
    localStorage.setItem("case-profile-v2", JSON.stringify(profile));
    const realFetch = window.fetch.bind(window);
    let runs = 0;
    let answers = 0;
    let controller: ReadableStreamDefaultController<Uint8Array>;
    const enc = new TextEncoder();
    const event = (value: unknown) => controller.enqueue(enc.encode(JSON.stringify(value) + "\n"));
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
      if (url === "/api/agent/plan") {
        runs++;
        if (runs > 1) return new Response(JSON.stringify({ type: "planner_result", result }), { headers: { "content-type": "application/x-ndjson" } });
        return new Response(new ReadableStream({ start(c) {
          controller = c;
          event({ type: "run", runId: "review-test" });
          event({ type: "ask", ask: { id: "q1", agent: "Robin", crew: "robin", question: "May we use your postcode?", why: "Test permission", kind: "yes_no" } });
          event({ type: "say", say: { i: 0, t: 0, from: "robin", kind: "ask", text: "May we use your postcode?" } });
        } }), { headers: { "content-type": "application/x-ndjson" } });
      }
      if (url === "/api/agent/plan/answer") {
        answers++;
        if (answers === 1) throw new TypeError("Network unavailable");
        if (answers === 2) return Response.json({ error: "Temporary failure" }, { status: 500 });
        event({ type: "answered", id: "q1", answer: "yes" });
        event({ type: "error", message: "Simulated worker failure" });
        controller.close();
        return Response.json({ ok: true });
      }
      return realFetch(input, init);
    };
  }, { profile, result });
  try {
    await page.goto(process.env.TEST_APP_URL ?? "http://localhost:3000/case");
    await page.getByRole("button", { name: "Start preparing my case", exact: true }).click();
    await page.getByRole("button", { name: "Yes", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Network unavailable" }).waitFor();
    await page.getByRole("button", { name: "Yes", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Your answer could not be sent" }).waitFor();
    await page.getByRole("button", { name: "Yes", exact: true }).click();
    await page.getByText("Simulated worker failure", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Yes", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem("case-profile-v2") ?? "{}").caseRun?.runId === "review-test");
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("case-profile-v2")!));
    assert.equal(saved.enquiry.sample, false);
    assert.equal(saved.legalAid.result.runId, "review-test");
    assert.deepEqual(errors, []);
    console.log("PASS: network/HTTP answer retry, run-error recovery, unterminated final event, real-result sample reset");
  } catch (error) { console.log(await page.locator("body").innerText()); console.log(errors); throw error; } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
