/**
 * Hand-off: a patient sign-in is offered and resumed in the same tab; a staff console is left alone.
 * Local pages only. The secret is typed through the live-view input path and must never appear in a result.
 *
 *   npx tsx scripts/test-handoff.ts
 */
import { createServer, type Server } from "node:http";
import { mkdirSync } from "node:fs";
import { spawn, type ChildProcess } from "node:child_process";
import { chromium, type Page } from "playwright";
import { openSession } from "../lib/browser";
import { gateWall } from "../lib/agent/handoff";
import { concreteBenefit, handoffLine, isStaffConsole } from "../lib/agent/handoffCopy";
import { liveInput } from "../lib/liveview";
import { fillForm } from "../lib/agent/workers/fillForm";
import { searchDirectory } from "../lib/agent/workers/searchDirectory";
import type { Note } from "../lib/agent/legalAid";
import type { Wall, WorkerCtx } from "../lib/agent/workers/types";

const SECRET = "s3ssion-key-9f3a";
const COMPLAINT = { flow: "complaint" as const, crew: "kit" as const };
const DISCOVERY = { flow: "discovery" as const, crew: "kit" as const };
const WHY = handoffLine(COMPLAINT, "login");
const CAPTCHA_WHY = handoffLine({ flow: "compensation", crew: "robin" }, "captcha");
const shotDir = "docs/night-runs/handoff-ui";

let failed = 0;
const check = (cond: unknown, msg: string) => {
  if (cond) console.log(`  ok  ${msg}`);
  else {
    failed++;
    console.error(`  FAIL  ${msg}`);
  }
};

function pageOf(html: string, title: string) {
  return `<!doctype html><html><head><title>${title}</title></head><body style="margin:0;font:16px sans-serif">${html}</body></html>`;
}

function startFixture(): Promise<{ server: Server; origin: string }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const cookie = req.headers.cookie ?? "";
    const send = (status: number, body: string, extra: Record<string, string> = {}) => {
      res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...extra });
      res.end(body);
    };
    if (req.method === "POST" && url.pathname === "/login") {
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        const pass = new URLSearchParams(raw).get("pass");
        if (pass === SECRET) {
          send(302, "", { location: "/records", "set-cookie": "session=ok; Path=/" });
        } else send(200, pageOf(`<h1>Patient complaint portal</h1><p>Wrong password</p>`, "Patient complaint portal"));
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/human") {
      send(302, "", { location: "/records", "set-cookie": "session=ok; Path=/" });
      return;
    }
    if (url.pathname === "/records") {
      send(200, cookie.includes("session=ok") ? pageOf(`<h1>Your records</h1><p>Records ready for you</p>`, "Your records") : pageOf(`<h1>Sign in</h1>`, "Sign in"));
      return;
    }
    if (url.pathname === "/admin/secure-login") {
      send(200, pageOf(`<h1>Admin panel</h1><form><input name="user" style="position:absolute;left:100px;top:100px"><input type="password" name="pass" style="position:absolute;left:100px;top:150px"><button style="position:absolute;left:100px;top:200px">Secure Login</button></form>`, "Secure Login"));
      return;
    }
    if (url.pathname === "/beschwerde") {
      send(200, pageOf(`<header><a href="/portal">Portal login</a></header><h1>Patientenbeschwerden</h1><form><label>Name <input name="name"></label> <label>Vorname <input name="vorname"></label> <label>What happened <textarea name="what"></textarea></label></form>`, "Patientenbeschwerden"));
      return;
    }
    if (url.pathname === "/pay") {
      send(200, pageOf(`<h1>Pay the fee</h1><input name="cardnumber" autocomplete="cc-number" style="position:absolute;left:100px;top:100px">`, "Payment"));
      return;
    }
    if (url.pathname === "/captcha") {
      send(
        200,
        pageOf(
          `<h1>Public directory</h1><div class="captcha">Complete the CAPTCHA</div><form method="POST" action="/human"><button type="submit" style="position:absolute;left:100px;top:200px;width:160px;height:40px">I am human</button></form>`,
          "Public directory",
        ),
      );
      return;
    }
    send(
      200,
      pageOf(
        `<h1>Patient complaint portal</h1><form method="POST" action="/login"><input name="user" style="position:absolute;left:100px;top:100px;width:220px;height:32px"><input type="password" name="pass" style="position:absolute;left:100px;top:150px;width:220px;height:32px"><button type="submit" style="position:absolute;left:100px;top:200px;width:160px;height:40px">Sign in</button></form>`,
        "Patient complaint portal",
      ),
    );
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const a = server.address();
      const port = typeof a === "object" && a ? a.port : 0;
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

function noteFor(logs: string[], onBack?: () => void): Note {
  return Object.assign(
    (s: string) => {
      logs.push(s);
      if (s === "Back to work") onBack?.();
    },
    { log: async (_k: string, text: string) => void logs.push(text) },
  ) as Note;
}

const judge = async () => ({ relevant: true, why: WHY });

async function signIn(page: Page): Promise<string> {
  const resize = await liveInput({ type: "resize", width: 1300, height: 900 });
  check(resize === "ok", `live resize ${resize}`);
  await liveInput({ type: "click", x: 180, y: 116 });
  await liveInput({ type: "text", text: "ada" });
  await liveInput({ type: "click", x: 180, y: 166 });
  await liveInput({ type: "text", text: SECRET });
  await liveInput({ type: "click", x: 160, y: 218 });
  await page.waitForURL(/\/records/, { timeout: 8000 });
  return page.locator("body").innerText();
}

async function workerTests(origin: string) {
  process.env.HANDOFF_WAIT_MS = "60000";
  process.env.HEADLESS = "1";
  process.env.IN_APP_BROWSER = "1";
  const { browser, context, page } = await openSession();
  const track = { bump() {} };
  try {
    check(concreteBenefit("ok") === null, "a vague benefit is not a hand-off");
    check(concreteBenefit("Sign in so the patient can continue their complaint.") === null, "third person is not a hand-off");
    check(concreteBenefit(handoffLine(DISCOVERY, "login"), DISCOVERY)?.includes("reach the complaint form") === true, "discovery only promises reaching the form");
    check(concreteBenefit(WHY, DISCOVERY) === null, "discovery does not promise to fill the complaint");
    check(concreteBenefit(WHY, COMPLAINT)?.includes("you press Submit yourself") === true, "the complaint step says you press Submit");
    check(concreteBenefit("This site wants you to sign in before Kit can send your complaint.", COMPLAINT) === null, "the crew never sends");
    check(concreteBenefit(handoffLine({ flow: "escalation", crew: "robin" }, "login"), { flow: "escalation", crew: "robin" })?.includes("ombudsman's rules") === true, "escalation reads the rules");
    check(concreteBenefit(handoffLine({ flow: "compensation", crew: "robin" }, "login"), { flow: "compensation", crew: "robin" })?.includes("search the register") === true, "compensation searches the register");
    check(isStaffConsole(`${origin}/admin/secure-login`, "Secure Login", "Admin panel"), "an admin panel is staff");
    check(isStaffConsole(`${origin}/staff`, "Staff intranet", ""), "a staff address is staff");
    check(!isStaffConsole(`${origin}/complain`, "Patient complaint portal", "Sign in"), "a patient portal is not staff");

    console.log("patient sign-in resumes in the same tab");
    await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
    const logs: string[] = [];
    let body = "";
    const started = page;
    let offers = 0;
    const ctx: WorkerCtx = {
      page,
      note: noteFor(logs, () => void page.close().catch(() => {})),
      track,
      step: COMPLAINT,
      judge,
      handoff: async (_wall, why) => {
        offers++;
        check(why.includes("fill in your complaint form"), "the offer matches the complaint step");
        check(page === started && !page.isClosed(), "same tab is still open");
        body = await signIn(page);
        return "continued";
      },
    };
    const filled = await fillForm(ctx, { goal: "File a complaint", values: [], maxPages: 2 });
    check(body.includes("Records ready for you"), "the page after sign-in is the patient's records");
    check(offers === 1, "asked once");
    check(filled.handedOff === true, "the result records that you signed in");
    check(filled.wall?.kind !== "login", "it did not come back as a login wall");
    check(!JSON.stringify(filled).includes(SECRET) && !logs.join("\n").includes(SECRET), "the secret is not in the result or the log");
    check(!/handing over/i.test(filled.summary), "the summary does not say handing over");

    console.log("staff console is a dead end");
    const admin = await context.newPage();
    await admin.goto(`${origin}/admin/secure-login`, { waitUntil: "domcontentloaded" });
    let adminOffers = 0;
    const adminLogs: string[] = [];
    const adminResult = await fillForm(
      {
        page: admin,
        note: noteFor(adminLogs),
        track,
        handoff: async () => {
          adminOffers++;
          return "continued";
        },
      },
      { goal: "File a complaint", values: [], maxPages: 1 },
    );
    await admin.close().catch(() => {});
    check(adminOffers === 0, "a staff sign-in is never offered");
    console.log("   admin", adminResult.status, adminResult.wall?.kind, adminResult.summary);
    check(adminResult.wall?.kind === "dead_end", `left as a dead end (${adminResult.wall?.kind})`);
    check(!/handing over/i.test(adminResult.summary + adminLogs.join(" ")), "nothing is said about handing over");

    console.log("skip and timeout stay an honest wall");
    for (const outcome of ["skipped", "timeout"] as const) {
      const p = await context.newPage();
      await p.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
      const r = await fillForm(
        { page: p, note: noteFor([]), track, judge, handoff: async () => outcome },
        { goal: "File a complaint", values: [], maxPages: 1 },
      );
      await p.close().catch(() => {});
      console.log("  ", outcome, r.status, r.wall?.kind, r.handedOff, r.summary);
      check(r.status === "blocked" && r.wall?.kind === "login" && !r.handedOff, `${outcome} reports the login wall`);
      check(!/handing over/i.test(r.summary), `${outcome} does not say handing over`);
    }

    console.log("still blocked after two continues");
    const stuck = await context.newPage();
    await stuck.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
    let stuckOffers = 0;
    const stuckResult = await fillForm(
      {
        page: stuck,
        note: noteFor([]),
        track,
        judge,
        handoff: async () => {
          stuckOffers++;
          return "continued";
        },
      },
      { goal: "File a complaint", values: [], maxPages: 1 },
    );
    await stuck.close().catch(() => {});
    console.log("   stuck", stuckOffers, stuckResult.status, stuckResult.wall?.kind, stuckResult.summary);
    check(stuckOffers === 2, "asked at most twice");
    check(stuckResult.wall?.kind === "login" && !stuckResult.handedOff, "still a login wall, not marked signed-in");

    console.log("no concrete benefit, no hand-off");
    const vague = await context.newPage();
    await vague.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
    let vagueOffers = 0;
    await fillForm(
      {
        page: vague,
        note: noteFor([]),
        track,
        judge: async () => ({ relevant: true, why: "ok" }),
        handoff: async () => {
          vagueOffers++;
          return "continued";
        },
      },
      { goal: "File a complaint", values: [], maxPages: 1 },
    );
    await vague.close().catch(() => {});
    check(vagueOffers === 0, "a benefit that is not concrete is not offered");

    console.log("payment is not a hand-off");
    const pay = await context.newPage();
    await pay.goto(`${origin}/pay`, { waitUntil: "domcontentloaded" });
    let payOffers = 0;
    const payResult = await fillForm(
      {
        page: pay,
        note: noteFor([]),
        track,
        judge: async () => {
          throw new Error("payment must not be judged");
        },
        handoff: async () => {
          payOffers++;
          return "continued";
        },
      },
      { goal: "File a complaint", values: [], maxPages: 1 },
    );
    await pay.close().catch(() => {});
    console.log("   pay", payOffers, payResult.status, payResult.wall?.kind, payResult.summary);
    check(payOffers === 0 && payResult.wall?.kind === "payment", "a payment stops without asking");

    console.log("a header login does not hide a real form");
    const formPage = await context.newPage();
    await formPage.goto(`${origin}/beschwerde`, { waitUntil: "domcontentloaded" });
    let formOffers = 0;
    let judged = false;
    const opened = await gateWall(
      {
        page: formPage,
        note: noteFor([]),
        track,
        step: DISCOVERY,
        judge: async () => {
          judged = true;
          return { relevant: true, why: handoffLine(DISCOVERY, "login") };
        },
        handoff: async () => {
          formOffers++;
          return "continued";
        },
      },
      { kind: "login", detail: "Kammerportal", url: formPage.url() },
      async () => null,
    );
    await formPage.close().catch(() => {});
    check(!judged && formOffers === 0 && opened.go && opened.open === true, "a complaint form with a header login is not a hand-off");

    console.log("captcha resumes in the same tab");
    const cap = await context.newPage();
    const capLogs: string[] = [];
    let capBody = "";
    const capStarted = cap;
    await searchDirectory(
      {
        page: cap,
        note: noteFor(capLogs, () => void cap.close().catch(() => {})),
        track,
        step: { flow: "compensation", crew: "robin" },
        judge: async () => ({ relevant: true, why: CAPTCHA_WHY }),
        handoff: async () => {
          check(cap === capStarted, "captcha stays on the same tab");
          await liveInput({ type: "click", x: 180, y: 220 });
          await cap.waitForURL(/\/records/, { timeout: 8000 });
          capBody = await cap.locator("body").innerText();
          return "continued";
        },
      },
      { url: `${origin}/captcha`, goal: "Find a public directory", criteria: [{ label: "place", value: "town" }] },
    ).catch((e) => console.log("   captcha threw", e instanceof Error ? e.message.split("\n")[0] : e));
    check(capBody.includes("Records ready for you"), "the directory opens after the check");
    check(capLogs.includes("Back to work"), "the crew notes it is back to work");
    check(!capLogs.join("\n").includes(SECRET), "captcha log has no secret");
  } finally {
    await browser.close().catch(() => {});
  }
}

function waitFor(url: string, ms: number) {
  const t0 = Date.now();
  return new Promise<void>((resolve, reject) => {
    const tick = () => {
      fetch(url)
        .then((r) => (r.ok || r.status < 500 ? resolve() : Promise.reject(new Error(String(r.status)))))
        .catch(() => (Date.now() - t0 > ms ? reject(new Error(`timed out waiting for ${url}`)) : setTimeout(tick, 500)));
    };
    tick();
  });
}

async function uiCheck(origin: string) {
  const port = 3023;
  mkdirSync(shotDir, { recursive: true });
  const child: ChildProcess = spawn("npx", ["next", "dev", "-p", String(port)], {
    cwd: process.cwd(),
    env: { ...process.env, HANDOFF_FIXTURE: "1", HANDOFF_JUDGE: "local", IN_APP_BROWSER: "1", HEADLESS: "1", PORT: String(port), NEXT_DIST: ".next-handoff" },
    stdio: "pipe",
  });
  let appLog = "";
  child.stdout?.on("data", (d) => (appLog += d.toString()));
  child.stderr?.on("data", (d) => (appLog += d.toString()));
  const base = `http://localhost:${port}`;
  try {
    await waitFor(base, 90000);
    const createdAt = "2026-11-08T03:00:00.000Z";
    const slot = `${createdAt}:discovery`;
    const started = await fetch(`${base}/api/agent/plan/handoff-fixture`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: `${origin}/`, slot }),
    });
    const body = (await started.json()) as { runId?: string; error?: string };
    check(started.ok && !!body.runId, `fixture run started (${body.runId ?? body.error})`);
    if (!body.runId) return;
    const facts = {
      complainingFor: null, title: null, firstName: "Ada", lastName: null, address: null, postcode: null, phone: null, email: null,
      preferredContact: null, country: null, region: null, incidentLocation: null, incidentSummary: null, events: [], desiredOutcome: null, emailRiskAccepted: null, medicalRecords: null,
    };
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.addInitScript(
      ({ createdAt, runId, facts }) => {
        localStorage.setItem("case-profile-v2", JSON.stringify({ facts, messages: [], draft: null, createdAt, updatedAt: createdAt }));
        localStorage.setItem(`elliot-run-v1:${createdAt}:discovery`, JSON.stringify({ runId, flow: "discovery", startedAt: Date.now(), status: "running" }));
      },
      { createdAt, runId: body.runId, facts },
    );
    await page.goto(`${base}/case`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("[data-needs-you='1']", { timeout: 20000 });
    check((await page.title()).includes("(1) Needs you"), `page title is ${(await page.title())}`);
    await page.screenshot({ path: `${shotDir}/tile.png`, fullPage: true });
    await page.locator("[data-needs-you='1']").click();
    await page.waitForSelector("[data-handoff-modal='1']", { timeout: 8000 });
    const modalText = (await page.locator("[data-handoff-modal='1']").innerText()).replace(/\s+/g, " ");
    check(modalText.includes("reach the complaint form"), "the modal's line matches discovery");
    check(/127\.0\.0\.1|localhost/.test(modalText), "the modal names the site");
    check((await page.getByRole("button", { name: "I've signed in, continue" }).count()) === 1, "continue button");
    check((await page.getByRole("button", { name: "Skip this step" }).count()) === 1, "skip button");
    check(!/handing over|Take control|FAILED|Problem/i.test(modalText), "no extra hand-off wording");
    await page.screenshot({ path: `${shotDir}/modal.png` });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("live-handoff", { detail: { id: "demo", runId: "demo", tab: "Kit · Complaint form", url: "http://127.0.0.1/", crew: "kit", why: "This site wants you to sign in before Kit can reach the complaint form behind it.", demo: true } })));
    await page.waitForTimeout(300);
    check((await page.locator("[data-handoff-modal='1']").count()) === 0, "a recorded run shows no hand-off buttons");
    await fetch(`${base}/api/agent/plan/cancel`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ runId: body.runId }) }).catch(() => {});
    await browser.close();
  } catch (e) {
    failed++;
    console.error(`  FAIL  ui ${e instanceof Error ? e.message : e}`);
    console.error(appLog.slice(-1500));
  } finally {
    child.kill("SIGTERM");
  }
}

async function main() {
  const { server, origin } = await startFixture();
  try {
    await workerTests(origin);
    if (process.env.SKIP_UI !== "1") await uiCheck(origin);
  } finally {
    server.close();
  }
  if (failed) {
    console.error(`\n${failed} failed`);
    process.exit(1);
  }
  console.log("\nhandoff tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
