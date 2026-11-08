/**
 * Round 5, blocker 2: an enquiry is "filled and ready" only if the form is verified, its message/contact boxes read back
 * the expected values from the DOM, and the Send control is found and left unpressed. Never for an empty enquiry.
 * Everything is served locally (page.route); anything off the fixture host is aborted; any POST is a failure.
 *
 *   npx tsx --env-file=.env.local scripts/test-enquiry-ready.ts
 *   NO_MODEL=1 npx tsx --env-file=.env.local scripts/test-enquiry-ready.ts      skip the one run that calls the Decisions API
 */
import { chromium, type Page } from "playwright";
import { assessForm, classifyField, expectFrom, sameValue } from "../lib/agent/enquiryReady";
import { checkFilledForm, fillOne } from "../lib/agent/enquiry";
import { emptyFacts } from "../lib/agent/facts";
import type { FirmFinding } from "../lib/agent/legalAidTypes";

let failures = 0;
const check = (ok: boolean, what: string, detail = "") => {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? `  (${detail})` : ""}`);
};

const VALUES = [
  { key: "full_name", value: "Rhys Morgan" },
  { key: "first_name", value: "Rhys" },
  { key: "last_name", value: "Morgan" },
  { key: "email", value: "rhys.morgan@example.com" },
  { key: "phone", value: "07700 900123" },
  { key: "subject", value: "Enquiry: possible clinical negligence (missed wrist fracture)" },
  { key: "message", value: "My A&E missed a scaphoid fracture in March 2026 and it was found months later. Could you advise me?" },
];
const EXPECT = expectFrom(VALUES);
const MSG = EXPECT.message!;

/* ---------------------------------------------------------------- part 1: the verdict function, no browser */
const f = (label: string, value: string, kind: "text" | "textarea" | "select" = "text", required = false, name = "") => ({ name, label, value, kind, required });
function unit() {
  console.log("\n================ Part 1: the verdict (pure)");
  const ready = assessForm({ fields: [f("Your name", "Rhys Morgan"), f("Email", "rhys.morgan@example.com", "text", true), f("How can we help?", MSG, "textarea", true)], expect: EXPECT, finalControl: "Send enquiry", stillOnForm: true, missingRequired: [] });
  check(ready.status === "ready_to_send", "a normal form read back with its Send button found is ready_to_send", ready.reason);
  const empty = assessForm({ fields: [], expect: EXPECT, finalControl: null, stillOnForm: true, missingRequired: [] });
  check(empty.status === "could_not_fill", "no fields at all (Enable Law: filled [], fields []) is could_not_fill, never ready", empty.reason);
  const emptyBoxes = assessForm({ fields: [f("Your name", ""), f("Email", "", "text", true), f("How can we help?", "", "textarea", true)], expect: EXPECT, finalControl: "Send", stillOnForm: true, missingRequired: ["Email", "How can we help?"] });
  check(emptyBoxes.status === "could_not_fill", "a form whose boxes are all still empty is could_not_fill, even with required fields listed", emptyBoxes.reason);
  const unknown = assessForm({ fields: [f("Favourite colour", "blue")], expect: EXPECT, finalControl: "Send", stillOnForm: true, missingRequired: [] });
  check(unknown.status === "could_not_fill", "no recognisable message or contact box: could_not_fill", unknown.reason);
  const req = assessForm({ fields: [f("Email", "rhys.morgan@example.com"), f("How can we help?", MSG, "textarea"), f("Solicitor bar number", "", "text", true)], expect: EXPECT, finalControl: "Send", stillOnForm: true, missingRequired: ["Solicitor bar number"] });
  check(req.status === "needs_input", "an unfillable required field: needs_input, not ready", req.reason);
  const wrong = assessForm({ fields: [f("Email", "07700 900123"), f("How can we help?", MSG, "textarea")], expect: EXPECT, finalControl: "Send", stillOnForm: true, missingRequired: [] });
  check(wrong.status === "partial", "the phone number in the email box: partial (read-back mismatch), not ready", wrong.reason);
  const noMsg = assessForm({ fields: [f("Email", "rhys.morgan@example.com"), f("How can we help?", "", "textarea")], expect: EXPECT, finalControl: "Send", stillOnForm: true, missingRequired: [] });
  check(noMsg.status === "partial", "email filled but the message box empty: partial", noMsg.reason);
  const noFinal = assessForm({ fields: [f("Email", "rhys.morgan@example.com"), f("How can we help?", MSG, "textarea")], expect: EXPECT, finalControl: null, stillOnForm: true, missingRequired: [] });
  check(noFinal.status === "partial", "filled but no Send control identified: partial", noFinal.reason);
  const gone = assessForm({ fields: [f("Email", "rhys.morgan@example.com"), f("How can we help?", MSG, "textarea")], expect: EXPECT, finalControl: "Send", stillOnForm: false, missingRequired: [] });
  check(gone.status === "partial", "the page no longer shows the unsent form: partial", gone.reason);
  check(sameValue("07700900123", "07700 900123") && sameValue(MSG.slice(0, 10), MSG) === false && !sameValue("x", "y"), "read-back compares letters and digits (masks ok), not a short stub");
  check(classifyField({ name: "", label: "Your message", kind: "textarea" }) === "message" && classifyField({ name: "email", label: "", kind: "text" }) === "email" && classifyField({ name: "", label: "Area of law", kind: "select" }) === null, "classifyField: message, email, and selects are left alone");
}

/* ---------------------------------------------------------------- part 2: real pages */
const HOST = "https://firm.test";
const shell = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><title>Contact</title></head><body>${body}</body></html>`;
const FORM = (extra = "", button = `<button type="submit">Send enquiry</button>`) => `<main><h1>Contact our clinical negligence team</h1><form method="post" action="/SENT"><label for="n">Your name</label><input id="n" name="name" type="text" required><label for="e">Email address</label><input id="e" name="email" type="email" required><label for="m">How can we help?</label><textarea id="m" name="message" required></textarea>${extra}${button}</form></main>`;
const PAGES: Record<string, string> = {
  "/normal": shell(FORM()),
  "/unfillable": shell(FORM(`<label for="b">Solicitor referral code (required)</label><input id="b" name="ref" type="text" required>`)),
  "/nobutton": shell(FORM("", "")),
  // the form lives only in the footer: code that skips page furniture sees no fields (what happened at Enable Law)
  "/footer-only": shell(`<main><h1>Clinical negligence</h1><p>We help people who were harmed by poor care.</p></main><footer><form method="post" action="/SENT"><label for="m">Message</label><textarea id="m" name="message"></textarea><input type="email" name="email" aria-label="Email"><button type="submit">Send</button></form></footer>`),
  "/empty": shell(`<main><h1>Clinical negligence</h1><p>Call us on 029 2000 0000.</p></main>`),
};

async function withPage<T>(run: (page: Page, posts: string[], external: string[]) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    await ctx.addInitScript("window.__name = (f) => f;");
    const page = await ctx.newPage();
    const posts: string[] = [];
    const external: string[] = [];
    await page.route("**/*", (r) => {
      const u = r.request().url();
      if (r.request().method() !== "GET") posts.push(`${r.request().method()} ${u}`);
      if (!u.startsWith(HOST)) { external.push(u); return r.abort(); }
      const path = new URL(u).pathname;
      return r.fulfill({ status: PAGES[path] ? 200 : 404, contentType: "text/html", body: PAGES[path] ?? shell("<h1>Not found</h1>") });
    });
    return await run(page, posts, external);
  } finally {
    await browser.close();
  }
}

const firm = (path: string): FirmFinding => ({ id: "test-firm", name: "Test Firm LLP", town: "Cardiff", distanceMiles: 2, website: `${HOST}${path}`, email: null, phone: null, sources: ["website"], legalAid: false, activeRecently: true, actsForPatients: "yes", noWinNoFee: "unknown", enquiryUrl: `${HOST}${path}` } as unknown as FirmFinding);
const facts = () => ({ ...emptyFacts(), firstName: "Rhys", lastName: "Morgan", email: "rhys.morgan@example.com", phone: "07700 900123", postcode: "CF10 1AA", address: "1 Fake Street, Cardiff" });

async function pages() {
  console.log("\n================ Part 2: real pages (local, headless, nothing sent)");
  await withPage(async (page, posts, external) => {
    const fill = async (path: string, vals: Record<string, string>) => {
      await page.goto(HOST + path);
      for (const [name, v] of Object.entries(vals)) await page.locator(`[name=${name}]`).fill(v);
    };
    const all = { name: "Rhys Morgan", email: "rhys.morgan@example.com", message: MSG };
    await fill("/normal", all);
    let v = await checkFilledForm(page, EXPECT);
    check(v.status === "ready_to_send", "normal form, all three boxes typed: ready_to_send (read back, Send found, unpressed)", v.reason);
    await fill("/normal", {});
    v = await checkFilledForm(page, EXPECT);
    check(v.status === "could_not_fill", "the same form left EMPTY: could_not_fill, not ready", v.reason);
    await fill("/normal", { name: "Rhys Morgan", email: "rhys.morgan@example.com" });
    v = await checkFilledForm(page, EXPECT);
    check(v.status === "partial", "name and email typed but no message: partial", v.reason);
    await fill("/normal", { ...all, email: "someone.else@elsewhere.test" });
    v = await checkFilledForm(page, EXPECT);
    check(v.status === "partial", "an email that is not ours in the email box: partial", v.reason);
    await fill("/unfillable", all);
    v = await checkFilledForm(page, EXPECT);
    check(v.status === "needs_input", "a form with a required box we cannot fill (referral code): needs_input, not ready", v.reason);
    await fill("/nobutton", all);
    v = await checkFilledForm(page, EXPECT);
    check(v.status === "partial" && /Send button/.test(v.reason), "filled form with no Send control to be found: partial", v.reason);

    // The whole worker on the empty / no-fields fixtures (no model is called: there is nothing to decide on).
    const run = async (path: string) => {
      const notes: string[] = [];
      const note = Object.assign((s: string) => void notes.push(s), { log: async (_k: string, t: string) => void notes.push(t) });
      return fillOne(page, firm(path), { facts: facts(), message: { subject: VALUES[5].value, body: MSG } }, note as never);
    };
    let o = await run("/footer-only");
    check(o.status === "could_not_fill" && o.filled.length === 0, "fillOne on a page whose form no agent can read (footer only): could_not_fill, filled [], never ready_to_send", `${o.status}: ${o.note}`);
    o = await run("/empty");
    check(o.status === "no_form", "fillOne on a page with no form at all: no_form", `${o.status}: ${o.note}`);

    if (!process.env.NO_MODEL) {
      o = await run("/normal");
      check(o.status === "ready_to_send" && o.filled.length >= 3, "fillOne on a normal form (Decisions API picks keys, code types): ready_to_send with the fields read back", `${o.status}: ${o.note} | filled ${o.filled.length}`);
      o = await run("/unfillable");
      check(o.status === "needs_input" && o.unfilled.some((u) => /referral/i.test(u)), "fillOne on a form with an unfillable required box: needs_input naming it", `${o.status}: ${o.note}`);
    }
    check(posts.length === 0 && external.length === 0, "nothing was posted or requested off the fixture host", `${posts.join(", ")} ${external.join(", ")}`);
  });
}

unit();
void pages()
  .catch((e) => { failures++; console.error(e); })
  .finally(() => {
    console.log(`\n${failures ? `${failures} FAILED` : "ALL PASSED"}`);
    process.exit(failures ? 1 : 0);
  });
