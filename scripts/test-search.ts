// Live check of the search fallback (Brave -> DuckDuckGo -> Bing): npx tsx scripts/test-search.ts "query"
import { chromium } from "playwright";
import { webSearch } from "../lib/agent/planner";

async function main() {
  const b = await chromium.launch({ headless: true });
  const ctx = await b.newContext({ locale: "en-GB", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" });
  await ctx.addInitScript("window.__name = (f) => f;");
  const p = await ctx.newPage();
  const note = Object.assign((s: string) => console.log("note:", s), { log: async (k: string, t: string) => console.log(`[${k}] ${t}`) });
  const r = await webSearch(p, process.argv[2] ?? "Public Services Ombudsman for Wales complain about NHS", note as never, { bump: () => {} } as never);
  r.slice(0, 5).forEach((x, i) => console.log(`${i + 1}. ${x.title} — ${x.url}`));
  await b.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
