// Checks that closeWhenSubmitted announces a submit (so the app marks the step sent and moves on) and stays quiet when the site rejects it.
// Uses a local page that behaves like the NHS Lothian form (Ninja Forms: AJAX POST, success message in .nf-response-msg).
// Run: npx tsx scripts/test-submit-detect.ts
import http from "node:http";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { closeWhenSubmitted } from "../lib/browser";
import { subscribeLive, type LiveEvent } from "../lib/liveview";

const PAGE = () => `<!doctype html><body><div class="nf-form-cont"><form id="f"><input name="a"><button type="submit" id="go">Submit</button></form><div class="nf-response-msg"></div></div>
<script>document.getElementById('f').addEventListener('submit',async e=>{e.preventDefault();const r=await fetch('/ajax',{method:'POST',body:'x'});const j=await r.json();
document.querySelector('.nf-response-msg').textContent=j.ok?'Form submitted successfully.':'Please correct the errors and try again.';});</script></body>`;

async function run(ok: boolean): Promise<string[]> {
  const server = http.createServer((req, res) => {
    if (req.method === "POST") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok }));
    } else {
      res.setHeader("content-type", "text/html");
      res.end(PAGE());
    }
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as { port: number }).port;
  const seen: string[] = [];
  const stop = subscribeLive((e: LiveEvent) => e.type === "submitted" && seen.push(e.flow));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${port}/`);
  closeWhenSubmitted(page, browser, { flow: "nhs", lingerMs: 100 });
  await page.waitForTimeout(300);
  await page.click("#go");
  // The watcher looks every 1.5 s and closes the browser shortly after a submit, so poll a plain timer, not the page.
  for (let i = 0; i < 20 && seen.length === 0; i++) await new Promise((r) => setTimeout(r, 200));
  await new Promise((r) => setTimeout(r, 1000)); // long enough to catch a second, unwanted announcement
  stop();
  await browser.close().catch(() => {});
  server.close();
  return seen;
}

async function main() {
  assert.deepEqual(await run(true), ["nhs"], "a submit the site accepted should be announced once");
  console.log("PASS accepted submit is announced");
  assert.deepEqual(await run(false), [], "a submit the site rejected must not be announced");
  console.log("PASS rejected submit is not announced");
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
