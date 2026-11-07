// Test of the generic fill_form worker (Kit). Headless only. Never submits: every final POST is counted and must be 0.
//   npx tsx --env-file=.env.local scripts/test-fill-form.ts            fixtures (English wizard, German JS wizard, walls)
//   npx tsx --env-file=.env.local scripts/test-fill-form.ts --live     + real public complaint forms (fictional patient)
//   --only=wizard,wizard-noask,spa,walls,nhs,spso                       pick cases
// Test scripts may hold URLs; the worker itself holds none.
import { createServer } from "node:http";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { chromium, type Browser, type Page } from "playwright";
import { fillForm, FINAL_RE, type FillFormResult } from "../lib/agent/workers/fillForm";
import type { Value, WorkerCtx } from "../lib/agent/workers/types";
import type { Note } from "../lib/agent/legalAid";

const FIX = path.join(process.cwd(), "scripts/fixtures/forms");
const OUT = path.join(process.cwd(), ".runs", "test-fill-form-" + new Date().toISOString().replace(/[:.]/g, "-"));
const args = process.argv.slice(2);
const live = args.includes("--live");
const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");
const want = (name: string, isLive = false) => (only ? only.includes(name) : !isLive || live);

/* ---------------------------------------------------------------- fixture server: counts any POST to /submit */
let submits = 0;
const server = createServer((req, res) => {
  if (req.method === "POST") {
    submits++;
    res.writeHead(200, { "content-type": "text/html" }).end("<h1>Thank you for your complaint. It has been submitted.</h1>");
    return;
  }
  const file = path.join(FIX, decodeURIComponent((req.url ?? "/").split("?")[0]));
  if (!file.startsWith(FIX) || !existsSync(file)) { res.writeHead(404).end("not found"); return; }
  const type = file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "text/html; charset=utf-8";
  res.writeHead(200, { "content-type": type }).end(readFileSync(file));
});

/* ---------------------------------------------------------------- privacy: no saved value may reach the model */
const secrets = new Set<string>();
/** Values that are also the page's own option labels (a hospital in a dropdown) are not personal: the model may see them as options. */
const NOT_SECRET = new Set(["hospital", "department", "matter", "contact_preference", "relationship", "complaint_about", "preferred_contact", "organisation", "title", "town"]);
const addSecrets = (vs: Value[]) => { for (const v of vs) if (v.value.length >= 5 && !NOT_SECRET.has(v.key)) secrets.add(v.value); };
const leaks: string[] = [];
let modelCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  if (/api\.openai\.com/.test(url)) {
    modelCalls++;
    const body = typeof init?.body === "string" ? init.body.toLowerCase() : "";
    for (const s of secrets) if (body.includes(s.toLowerCase())) leaks.push(`${s} -> ${url}`);
  }
  return realFetch(input, init);
}) as typeof fetch;

/* ---------------------------------------------------------------- harness */
type Trace = { kind: string; text: string }[];
function makeCtx(page: Page, name: string, answers: [RegExp, string][] = [], withAsk = true): { ctx: WorkerCtx; trace: Trace; asked: string[] } {
  const dir = path.join(OUT, name);
  mkdirSync(dir, { recursive: true });
  const trace: Trace = [];
  const asked: string[] = [];
  let n = 0;
  const note = Object.assign((s: string) => console.log(`      · ${s}`), {
    log: async (kind: string, text: string, extra: { shot?: boolean | string; confidence?: number; detail?: string } = {}) => {
      trace.push({ kind, text });
      let shot = "";
      if (extra.shot === true && !page.isClosed()) {
        shot = path.join(dir, `${String(++n).padStart(2, "0")}-${kind}.jpg`);
        await page.screenshot({ path: shot, type: "jpeg", quality: 50 }).catch(() => (shot = ""));
      }
      console.log(`    [${kind}] ${text}${extra.confidence != null ? ` (${extra.confidence.toFixed(2)})` : ""}${shot ? `  <${path.basename(shot)}>` : ""}`);
    },
  }) as unknown as Note;
  const ctx: WorkerCtx = { page, note, track: { bump: () => {} } };
  if (withAsk) ctx.ask = async (spec) => {
    asked.push(spec.question);
    const hit = answers.find(([re]) => re.test(spec.question));
    console.log(`    ASK  ${spec.question}${spec.options ? ` ${JSON.stringify(spec.options)}` : ""} -> ${hit ? JSON.stringify(hit[1]) : "(no answer)"}`);
    return hit?.[1] ?? null;
  };
  return { ctx, trace, asked };
}

const results: { name: string; ok: boolean; why: string[] }[] = [];
function check(name: string, r: FillFormResult, trace: Trace, conds: [boolean, string][]) {
  // Common to every case: no click on anything that sends.
  const finalClicks = trace.filter((t) => t.kind === "click" && FINAL_RE.test(t.text.replace(/^.*?"(.*)".*$/, "$1")));
  conds.push([finalClicks.length === 0, `no click on a final button (${finalClicks.map((c) => c.text).join("; ") || "none"})`]);
  conds.push([leaks.length === 0, `no saved value in any model request (${leaks.length} leaks${leaks.length ? `: ${leaks.slice(0, 3).join("; ")}` : ""})`]);
  const why = conds.filter(([ok]) => !ok).map(([, w]) => w);
  results.push({ name, ok: why.length === 0, why });
  console.log(`  => ${why.length ? "FAIL" : "PASS"} ${name}: ${r.status}${r.finalSubmitLabel ? ` before "${r.finalSubmitLabel}"` : ""}${r.wall ? ` wall=${r.wall.kind}` : ""} | pages ${r.pages.length} | unfilled ${JSON.stringify(r.unfilled)} | consents ${r.consents.length}`);
  console.log(`     ${r.summary}`);
  for (const w of why) console.log(`     FAILED: ${w}`);
}

const PATIENT: Value[] = [
  { key: "first_name", description: "The complainant's first name", value: "Morag" },
  { key: "last_name", description: "The complainant's last name (surname)", value: "Testperson" },
  { key: "email", description: "The complainant's email address", value: "morag.testperson@example.com" },
  { key: "phone", description: "The complainant's telephone number", value: "+44 7700 900123" },
];
addSecrets(PATIENT);

async function newPage(browser: Browser) {
  const context = await browser.newContext({ locale: "en-GB", viewport: { width: 1300, height: 900 }, userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" });
  await context.addInitScript("window.__name = (f) => f;"); // tsx wraps named functions in __name() inside page.evaluate
  return context.newPage();
}

async function main() {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const browser = await chromium.launch({ headless: true });
  console.log(`Screenshots: ${OUT}`);
  try {
    /* ------------------------------------------------ A. English wizard: landing, conditional, missing field asked, date error fixed, consent */
    const wizardValues: Value[] = [
      ...PATIENT,
      { key: "on_behalf", description: "Is the complaint made on behalf of someone else (the patient)? Yes or No", value: "Yes" },
      { key: "patient_name", description: "The patient's full name", value: "Ewan Testperson" },
      { key: "relationship", description: "The complainant's relationship to the patient", value: "Partner" },
      { key: "incident_date", description: "Date the care problem happened", value: "2026-07-03" },
      { key: "hospital", description: "Hospital where the care happened", value: "Northfield Royal Infirmary" },
      { key: "department", description: "Department involved in the care: the emergency department (A&E). Only that one.", value: "Emergency department (A&E)" },
      { key: "what_happened", description: "Full account of what happened (the complaint text)", value: "Ewan was seen in A&E after a fall onto his outstretched hand. No X-ray of the wrist was taken and he was sent home. A scaphoid fracture was found six weeks later." },
      { key: "outcome", description: "What the complainant would like to happen as a result of the complaint", value: "An explanation, an apology, and a review of how wrist injuries are assessed in A&E." },
      { key: "contact_preference", description: "How the complainant prefers to be contacted: Email, Post or Phone", value: "Email" },
    ];
    addSecrets(wizardValues);
    const goal = "Make a complaint to Northfield Health Board about the care the patient received, using its online complaint form.";

    if (want("wizard")) {
      console.log("\nA. English 4-step wizard (ask on, declaration allowed)");
      submits = 0;
      const page = await newPage(browser);
      await page.goto(`${base}/wizard/start.html`);
      const { ctx, trace, asked } = makeCtx(page, "wizard", [[/reference/i, "NHB-2026-0412"]]);
      const r = await fillForm(ctx, { goal, values: wizardValues, allowConsent: (l) => /^I declare/i.test(l) });
      const answers = await page.evaluate(() => JSON.parse(sessionStorage.getItem("answers") || "{}") as Record<string, string>);
      const side = await page.goto(`${base}/wizard/step1.html`).then(() => page.inputValue("#resume-email")).catch(() => "?");
      check("wizard", r, trace, [
        [r.status === "ready_to_submit", "status ready_to_submit"],
        [/submit complaint/i.test(r.finalSubmitLabel ?? ""), `final label "Submit complaint" (got ${r.finalSubmitLabel})`],
        [submits === 0, `no POST to /submit (${submits})`],
        [asked.some((q) => /reference/i.test(q)) && asked.length === 1, `asked exactly once, for the reference (${asked.length}: ${asked.join(" | ")})`],
        [answers.ref === "NHB-2026-0412", `the user's answer typed (${answers.ref})`],
        [/^0?3\/0?7\/2026$/.test(answers.when ?? ""), `date fixed after the validation error (${answers.when})`],
        [trace.some((t) => t.kind === "recover" && /DD\/MM\/YYYY|format/i.test(t.text)), "a recover step for the date error"],
        [answers.patient === "Ewan Testperson" && answers.rel === "Spouse or partner", `conditional questions filled (${answers.patient}, ${answers.rel})`],
        [answers.behalf === "yes" && answers.contact === "email", `radios (${answers.behalf}, ${answers.contact})`],
        [answers["dept[]"] === "ae", `only the A&E box ticked (${answers["dept[]"]})`],
        [answers.decl === "on" && !answers.priv, `declaration ticked (allowed), privacy left (${answers.decl}, ${answers.priv})`],
        [r.consents.some((c) => /privacy notice/i.test(c)), "privacy consent listed for the user"],
        [answers.first === "Morag" && answers.email === "morag.testperson@example.com", "personal values typed by code"],
        [side === "", "the 'sign in to resume' box left untouched"],
        [r.pages.length === 4 && r.pages.every((p) => p.verified), `4 form pages recorded, all read back (${r.pages.length})`],
      ]);
      await page.context().close();
    }

    /* ------------------------------------------------ B. Same wizard, no ask, no consent: must stop with needs_input */
    if (want("wizard-noask")) {
      console.log("\nB. English wizard without ask and without consent");
      submits = 0;
      const page = await newPage(browser);
      await page.goto(`${base}/wizard/start.html`);
      const { ctx, trace } = makeCtx(page, "wizard-noask", [], false);
      const r = await fillForm(ctx, { goal, values: wizardValues });
      check("wizard-noask", r, trace, [
        [r.status === "needs_input", "status needs_input"],
        [r.unfilled.some((u) => /reference/i.test(u)), "the reference is reported as unfilled"],
        [/step2\.html$/.test(page.url()), `stopped on step 2, did not push on (${page.url()})`],
        [submits === 0, "no POST to /submit"],
      ]);
      await page.context().close();
    }

    /* ------------------------------------------------ C. German single-URL JS wizard, phone error, split date, JS send button */
    if (want("spa")) {
      console.log("\nC. German JavaScript wizard (one URL, div role=button send)");
      submits = 0;
      const page = await newPage(browser);
      await page.goto(`${base}/anfrage.html`);
      const values: Value[] = [
        ...PATIENT,
        { key: "date_of_birth", description: "The client's date of birth", value: "1985-04-12" },
        { key: "matter", description: "Type of legal matter: medical negligence (Arzthaftung)", value: "Arzthaftung / Behandlungsfehler" },
        { key: "message", description: "The enquiry message to the law firm", value: "My partner's broken wrist was missed in the emergency department. We would like an initial assessment of a medical negligence claim." },
        { key: "has_legal_insurance", description: "Does the client have legal expenses insurance (Rechtsschutzversicherung)? Yes/No", value: "Ja" },
        { key: "insurer", description: "Name of the client's legal expenses insurer", value: "Beispiel Rechtsschutz AG" },
      ];
      addSecrets(values);
      const { ctx, trace } = makeCtx(page, "spa");
      const r = await fillForm(ctx, { goal: "Send an initial enquiry to this law firm about a medical negligence case, using its contact form.", values });
      const dom = await page.evaluate(() => ({
        tel: (document.getElementById("tel") as HTMLInputElement).value,
        dob: ["gd", "gm", "gy"].map((i) => (document.getElementById(i) as HTMLInputElement).value).join("."),
        vs: (document.getElementById("vs") as HTMLInputElement).value,
        ds: (document.getElementById("ds") as HTMLInputElement).checked,
        nl: (document.getElementById("nl") as HTMLInputElement).checked,
        sent: !(document.getElementById("sent") as HTMLElement).hidden,
      }));
      check("spa", r, trace, [
        [r.status === "ready_to_submit", "status ready_to_submit"],
        [/absenden/i.test(r.finalSubmitLabel ?? ""), `final control is the JS 'Anfrage absenden' (got ${r.finalSubmitLabel})`],
        [/^\d+$/.test(dom.tel), `phone retyped as digits after the German error (${dom.tel})`],
        [dom.dob === "12.4.1985" || dom.dob === "12.04.1985", `split date filled from one value (${dom.dob})`],
        [dom.vs === "Beispiel Rechtsschutz AG", "conditional insurer field filled"],
        [!dom.ds && r.consents.some((c) => /datenschutz/i.test(c)), "Datenschutz consent left for the user and listed"],
        [!dom.nl, "newsletter not ticked"],
        [!dom.sent && submits === 0, "nothing sent"],
      ]);
      await page.context().close();
    }

    /* ------------------------------------------------ D. Walls: login, CAPTCHA, payment (code-detected, no model needed) */
    if (want("walls")) {
      console.log("\nD. Walls");
      const walls: [string, string, string][] = [
        ["login", "<h1>Sign in to continue</h1><form><label for=u>Email</label><input id=u type=email><label for=p>Password</label><input id=p type=password><button>Sign in</button></form><a href='#'>Create an account</a>", "login"],
        ["captcha", "<h1>Security check</h1><p>Please complete the security check to access the complaint form.</p><iframe title='reCAPTCHA' src='about:blank' width=304 height=78></iframe><button>Continue</button>", "captcha"],
        ["payment", "<h1>Pay the application fee</h1><form><label for=n>Name on card</label><input id=n><label for=c>Card number</label><input id=c autocomplete=cc-number><label for=e>Expiry date</label><input id=e><label for=v>CVC</label><input id=v><button>Pay £35</button></form>", "payment"],
      ];
      for (const [name, html, kind] of walls) {
        const page = await newPage(browser);
        await page.setContent(`<!doctype html><html><head><title>${name}</title></head><body><main>${html}</main></body></html>`);
        const { ctx, trace } = makeCtx(page, `wall-${name}`);
        const r = await fillForm(ctx, { goal: "Make a complaint using the online form.", values: PATIENT });
        check(`wall-${name}`, r, trace, [
          [r.status === "blocked" && r.wall?.kind === kind, `blocked by ${kind} (got ${r.status} ${r.wall?.kind})`],
          [!trace.some((t) => t.kind === "type"), "nothing typed"],
        ]);
        await page.context().close();
      }
    }

    /* ------------------------------------------------ E. Live: NHS Lothian online feedback form (single page, Submit) */
    const livePatient: Value[] = [
      ...PATIENT,
      { key: "complaint_about", description: "Who the feedback is about: the user themself ('Me') or someone else", value: "Someone Else" },
      { key: "patient_first_name", description: "The patient's first name (the person the complaint is about, when that is not the complainant)", value: "Ewan" },
      { key: "patient_last_name", description: "The patient's last name (the person the complaint is about, when that is not the complainant)", value: "Testperson" },
      { key: "address", description: "The complainant's postal address", value: "12 Example Street, Edinburgh" },
      { key: "postcode", description: "The complainant's postcode", value: "EH1 1AA" },
      { key: "preferred_contact", description: "How the complainant wants to be contacted: Letter, Email or Phone Call", value: "Email" },
      { key: "details", description: "Details of the complaint: what happened (the main text)", value: "My partner Ewan Testperson was seen in the emergency department after a fall onto his outstretched hand. No X-ray of the wrist was taken. A scaphoid fracture was found six weeks later. (Test entry by a fictional patient; please disregard.)" },
      { key: "location", description: "Where the care happened (hospital, department)", value: "Royal Infirmary of Edinburgh, Emergency Department" },
      { key: "outcome", description: "What the complainant would like to happen", value: "An explanation and an apology." },
    ];
    addSecrets(livePatient);
    if (want("nhs", true)) {
      console.log("\nE. LIVE: NHS Lothian online feedback form (all POSTs blocked)");
      const page = await newPage(browser);
      let blocked = 0;
      await page.route("**/*", (route) => (route.request().method() === "POST" ? (blocked++, route.abort()) : route.continue()));
      await page.goto("https://www.nhslothian.scot/yourrights/online-feedback-form/", { waitUntil: "domcontentloaded" });
      const { ctx, trace } = makeCtx(page, "nhs");
      const r = await fillForm(ctx, { goal: "Make a complaint to NHS Lothian about care at the Royal Infirmary of Edinburgh, using its online feedback form.", values: livePatient, maxPages: 4 });
      check("nhs", r, trace, [
        [r.status === "ready_to_submit" || r.status === "needs_input", `prepared or needs input (got ${r.status})`],
        [!!r.finalSubmitLabel, `final control identified (${r.finalSubmitLabel})`],
        [(r.pages.at(-1)?.filled.length ?? 0) >= 6, `filled at least 6 fields (${r.pages.at(-1)?.filled.length})`],
      ]);
      console.log(`     (POSTs blocked during the run: ${blocked})`);
      await page.context().close();
    }

    /* ------------------------------------------------ F. Live: SPSO ombudsman form (multi-page; Next posts each page, Send never) */
    if (want("spso", true)) {
      console.log("\nF. LIVE: SPSO online complaint form (multi-page)");
      const page = await newPage(browser);
      const posts: string[] = [];
      page.on("request", (q) => { if (q.method() === "POST" && q.isNavigationRequest()) posts.push(q.url()); });
      await page.goto("https://forms.spso.org.uk/spso/form/delay/", { waitUntil: "domcontentloaded" });
      const values: Value[] = [
        ...livePatient,
        { key: "title", description: "Title, e.g. Ms", value: "Ms" },
        { key: "town", description: "Town or city", value: "Edinburgh" },
        { key: "address_line_1", description: "First line of the address", value: "12 Example Street" },
        { key: "confirm_email", description: "The email address typed again to confirm it", value: "morag.testperson@example.com" },
        { key: "organisation", description: "The organisation complained about", value: "NHS Lothian" },
        { key: "problem_date", description: "When the problem happened", value: "2026-07-03" },
        { key: "is_health", description: "Is the complaint about a health service? Yes/No", value: "Yes" },
        { key: "is_education", description: "Is it about a higher or further education institution? Yes/No", value: "No" },
        { key: "children", description: "Were any children or young people under 18 affected? Yes/No", value: "No" },
        { key: "court", description: "Has the matter been, or will it be, raised in court? Yes/No", value: "No" },
        { key: "complained_first", description: "Has the user complained to the organisation directly first? Yes/No", value: "Yes" },
        { key: "final_response", description: "Has the user had the organisation's final response? Yes/No", value: "Yes" },
        { key: "refers_to_ombudsman", description: "Does the organisation's final response refer the user to the ombudsman? Yes/No", value: "Yes" },
        { key: "nhs_reference", description: "The organisation's complaint reference number", value: "LOTH-26-0412" },
        { key: "impact", description: "How the matter has affected the user", value: "Months of pain and a second operation." },
        { key: "regulator", description: "Has the matter been reported to a regulator (e.g. GMC, NMC)? Yes/No", value: "No" },
        { key: "other_reviews", description: "Has the complaint had any other review? Yes/No/Don't know", value: "No" },
      ];
      const { ctx, trace, asked } = makeCtx(page, "spso", [[/\d+ words/i, "A full explanation of why the wrist fracture was missed, a written apology, and changes so that wrist injuries are always X-rayed in future."], [/document|response|correspondence|copy/i, "I will send a copy by post"]]);
      const r = await fillForm(ctx, { goal: "Complain to the Scottish Public Services Ombudsman about NHS Lothian's handling of a complaint, using its online complaint form.", values, maxPages: 16, allowConsent: (l) => /read this page/i.test(l) });
      const text = await page.locator("body").innerText().catch(() => "");
      check("spso", r, trace, [
        [r.status === "ready_to_submit" || r.status === "needs_input", `prepared or needs input (got ${r.status})`],
        [r.pages.length >= 3, `went through several pages (${r.pages.length})`],
        [!/(has|have) been (submitted|sent|received)|thank you for (your complaint|submitting)/i.test(text), "no 'submitted' confirmation on the page"],
      ]);
      console.log(`     (asked: ${asked.join(" | ") || "nothing"})`);
      console.log(`     (page POSTs: ${posts.length}; stopped at ${page.url()})`);
      await page.context().close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${results.filter((r) => r.ok).length}/${results.length} cases passed; model calls ${modelCalls}; leaks ${leaks.length}`);
  if (results.some((r) => !r.ok)) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
