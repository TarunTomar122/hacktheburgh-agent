// Headless check: signs in with the dev login, POSTs the fixture Ailsa case to /api/case/bundle and checks the PDF that comes back.
//   npx tsx scripts/check-case-bundle.ts   (dev server on BASE, default http://localhost:3001)
// No crew run and no live web: the case is the saved fixture. Saves the sample PDF to docs/night-runs/case-bundle/.
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { devLogin } from "./devLogin";
import { ailsaProfile } from "./caseBundleFixture";

const BASE = process.env.BASE ?? "http://localhost:3001";
let failed = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) failed++;
};
(async () => {
  const profile = ailsaProfile();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const signedOut = await page.request.post(`${BASE}/api/case/bundle`, { data: { profile } });
  console.log(`(signed out: ${signedOut.status()})`);
  await devLogin(page, BASE);
  const bad = await page.request.post(`${BASE}/api/case/bundle`, { data: { nope: 1 } });
  check(bad.status() === 400, `a body without a profile is refused (${bad.status()})`);
  const res = await page.request.post(`${BASE}/api/case/bundle`, { data: { profile }, timeout: 120000 });
  check(res.status() === 200, `the API answers 200 (${res.status()})`);
  check((res.headers()["content-type"] ?? "").startsWith("application/pdf"), `content type is application/pdf (${res.headers()["content-type"]})`);
  check(/attachment; filename="case-bundle-ms-ailsa-reid\.pdf"/.test(res.headers()["content-disposition"] ?? ""), `it downloads as case-bundle-ms-ailsa-reid.pdf (${res.headers()["content-disposition"]})`);
  const body = await res.body();
  check(body.subarray(0, 5).toString("latin1") === "%PDF-", "the file starts with %PDF-");
  const pages = (body.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  check(pages > 1, `it has more than one page (${pages})`);
  mkdirSync("docs/night-runs/case-bundle", { recursive: true });
  writeFileSync("docs/night-runs/case-bundle/ailsa-case-bundle.pdf", body);
  console.log(`saved docs/night-runs/case-bundle/ailsa-case-bundle.pdf (${body.length} bytes, ${pages} pages)`);
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(String(e).split("\n").slice(0, 3).join("\n"));
  process.exit(1);
});
