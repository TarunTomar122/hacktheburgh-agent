// Print exactly what the agent sees at a URL (elements, required flags, page text). Submits nothing.
// Usage: HEADLESS=1 npx tsx scripts/probes/observe.ts <url> [<url> ...]
import { dismissCookies, openSession } from "../../lib/browser";
import { formatObservation, observe, unfilledRequired } from "../../lib/agent/observe";

async function main() {
  const { browser, page } = await openSession();
  for (const url of process.argv.slice(2)) {
    console.log(`\n===== ${url}`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(2500);
      console.log("cookies:", await dismissCookies(page, 4000));
      const o = await observe(page);
      console.log(formatObservation(o));
      console.log("REQUIRED & EMPTY:", unfilledRequired(o));
    } catch (e) {
      console.log("ERROR", e instanceof Error ? e.message.split("\n")[0] : e);
    }
  }
  await browser.close();
}
main();
