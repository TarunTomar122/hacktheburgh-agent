// Fetch-first reading: a plain page is read without a browser; a bot check, a login and a script-built shell fall back to the browser.
//   npx tsx --env-file=.env.local scripts/test-quick-read.ts
import http from "node:http";
import { quickFetch } from "../lib/agent/workers/quickRead";

const para = "Complaints about NHS services must be made within twelve months of the event. ".repeat(30);
const pages: Record<string, { type: string; body: string; status?: number }> = {
  "/plain": { type: "text/html", body: `<html><head><title>How to complain</title></head><body><nav><a href="/next">Next page</a></nav><h1>Complain</h1><p>${para}</p><script>var x=1</script></body></html>` },
  "/bot": { type: "text/html", body: `<html><body><p>Just a moment... Checking if the site connection is secure. Verify you are human</p><p>${"x ".repeat(300)}</p></body></html>` },
  "/login": { type: "text/html", body: `<html><body><form><input type="password" name="p"></form><p>${para}</p></body></html>` },
  "/shell": { type: "text/html", body: `<html><head><script src="app.js"></script></head><body><div id="root"></div><noscript>Please enable JavaScript</noscript></body></html>` },
  "/missing": { type: "text/html", body: "Not found", status: 404 },
  "/json": { type: "application/json", body: "{}" },
};
const srv = http.createServer((q, r) => {
  const p = pages[q.url ?? ""];
  r.writeHead(p?.status ?? 200, { "content-type": p?.type ?? "text/html" });
  r.end(p?.body ?? "");
});
let bad = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name} ${extra}`);
  if (!ok) bad++;
};
srv.listen(0, async () => {
  const base = `http://127.0.0.1:${(srv.address() as { port: number }).port}`;
  const plain = await quickFetch(`${base}/plain`);
  check("plain page is read without a browser, with title, text and its link", plain?.kind === "html" && plain.title === "How to complain" && plain.text.includes("twelve months") && !plain.text.includes("var x") && plain.links.some((l) => l.url.endsWith("/next")));
  check("bot check falls back to the browser", (await quickFetch(`${base}/bot`)) === null);
  check("login page falls back to the browser", (await quickFetch(`${base}/login`)) === null);
  check("script-built shell falls back to the browser", (await quickFetch(`${base}/shell`)) === null);
  check("404 falls back", (await quickFetch(`${base}/missing`)) === null);
  check("non-HTML falls back", (await quickFetch(`${base}/json`)) === null);
  process.env.QUICK_READ = "0";
  check("QUICK_READ=0 turns it off", (await quickFetch(`${base}/plain`)) === null);
  srv.close();
  console.log(bad ? `${bad} FAILED` : "ALL PASSED");
  process.exit(bad ? 1 : 0);
});
