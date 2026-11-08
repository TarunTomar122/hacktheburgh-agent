// Headless check of /compare (one story, four countries) with the recorded runs: no crew run, no outside site.
//   npx tsx scripts/check-compare.ts   (dev server on BASE; screenshots in docs/night-runs/compare/)
import { chromium } from "playwright";
import { devLogin } from "./devLogin";

const BASE = process.env.BASE ?? "http://localhost:3001";
let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failed++;
};
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1500, height: 1000 } });
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  await devLogin(p, BASE);
  await p.goto(`${BASE}/compare`);
  await p.getByRole("button", { name: "Play the recorded runs" }).waitFor({ timeout: 60000 });
  await p.screenshot({ path: "docs/night-runs/compare/1-start.png" });
  await p.getByRole("button", { name: "Play the recorded runs" }).click();
  await p.waitForTimeout(12000);
  await p.screenshot({ path: "docs/night-runs/compare/2-researching.png" });
  const ok = await p.getByText("all four done").waitFor({ timeout: 300000 }).then(() => true, () => false);
  check(ok, "all four countries finish research and the case");
  await p.screenshot({ path: "docs/night-runs/compare/3-done.png", fullPage: true });
  for (const place of ["Edinburgh", "Dublin", "Auckland", "San Francisco"]) check((await p.getByText(place).count()) > 0, `column: ${place}`);
  check((await p.getByText("Same story, four different systems.").count()) > 0, "the differences table is there");
  check((await p.getByText(/forms filled, stopped before Send/).count()) >= 4, "every column prepared the case (enquiry forms filled)");
  check((await p.getByText("The case stopped").count()) === 0, "no column's case stopped");
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  await b.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(String(e).split("\n").slice(0, 3).join("\n"));
  process.exit(1);
});
