import type { AgentTile, FirmFinding, ScoreItem, Step3Result, TraceStep } from "./legalAidTypes";

/**
 * Sample step 3 output for building the UI before the real runner exists. NOT a real result.
 * Firm names, towns and distances come from one SLAB solicitor-finder search on 2026-11-07
 * (Civil > Medical negligence > active only, from Edinburgh). Everything else (scores, "acts for patients",
 * "no win no fee", enquiry pages) is made up for layout and must not be shown as fact.
 */

const FIXTURE_RESULT_TEXT = "Based on the information you have provided, you are likely to qualify financially for civil legal aid.";

const firm = (f: Partial<FirmFinding> & Pick<FirmFinding, "id" | "name" | "town">): FirmFinding => ({
  distanceMiles: null,
  website: null,
  email: null,
  phone: null,
  sources: ["slab"],
  legalAid: true,
  activeRecently: true,
  actsForPatients: "unknown",
  noWinNoFee: "unknown",
  enquiryUrl: null,
  score: 0,
  reasons: [],
  excluded: null,
  ...f,
});

/** Made-up score rows for the layout (D39). Each firm's `score` is the sum of its points; `fit` = score / 100. */
type Row = [ScoreItem["key"], string, number, number, ScoreItem["status"], string];
const withScore = (f: FirmFinding, rows: Row[]): FirmFinding => {
  const breakdown = rows.map(([key, label, points, max, status, evidence]) => ({ key, label, points, max, status, evidence }));
  const score = breakdown.reduce((n, r) => n + r.points, 0);
  const max = breakdown.reduce((n, r) => n + r.max, 0);
  return { ...f, breakdown, score, fit: Math.round((score / max) * 100) };
};
const rows = (o: { la?: boolean; active?: boolean; miles?: number | null; lawsoc?: boolean | null; patients?: "yes" | "no" | "unknown"; nwnf?: "yes" | "no" | "unknown"; form?: boolean; checked?: boolean }): Row[] => [
  ["legal_aid", "Takes legal aid for medical negligence", o.la ? 25 : 0, 25, o.la ? "yes" : "no", o.la ? "Listed on SLAB's solicitor finder under Civil > Medical negligence" : "Not on SLAB's list for medical negligence"],
  ["active", "Did this kind of case in the last 12 months", o.active ? 15 : 0, 15, o.active ? "yes" : "unknown", o.active ? "Still listed with SLAB's 'active in the last 12 months' filter on" : "Not checked"],
  ["distance", "Close to you", o.miles == null ? 0 : Math.max(0, Math.round(15 - o.miles)), 15, o.miles == null ? "unknown" : o.miles < 5 ? "yes" : "no", o.miles == null ? "No distance on SLAB's list" : `SLAB's finder: ${o.miles} miles from EH1`],
  ["lawsoc", "Found on the Law Society register", o.lawsoc ? 10 : 0, 10, o.lawsoc === null ? "unknown" : o.lawsoc ? "yes" : "no", o.lawsoc ? "Same firm name on the Law Society of Scotland directory" : "Not looked up"],
  ["patients", "Acts for patients", o.patients === "yes" ? 15 : 0, 15, o.patients ?? "unknown", o.patients === "yes" ? "The model read their medical negligence page: acts for patients (confidence 0.93)" : "Could not tell from their website"],
  ["nwnf", "Offers no win no fee", o.nwnf === "yes" ? 10 : 0, 10, o.nwnf ?? "unknown", o.nwnf === "yes" ? "Their page mentions 'no win, no fee' (confidence 0.81)" : "Not mentioned on the pages Elliot read"],
  ["form", "Has an online enquiry form", o.form ? 5 : 0, 5, o.form ? "yes" : "unknown", o.form ? "Found a contact form step 4 can fill in" : "No form found"],
  ["checked", "Elliot could read their website", o.checked ? 5 : 0, 5, o.checked ? "yes" : "no", o.checked ? "Website opened normally" : "Website not checked"],
];

export const FIXTURE_FIRMS: FirmFinding[] = [
  withScore(firm({ id: "balfour-and-manson", name: "Balfour and Manson Solicitors", town: "Edinburgh", distanceMiles: 0.51, website: "http://www.balfour-manson.co.uk", sources: ["slab", "lawsoc", "website"], actsForPatients: "yes", noWinNoFee: "yes", enquiryUrl: "http://www.balfour-manson.co.uk/contact", reasons: ["Takes legal aid for medical negligence", "Did this kind of case in the last 12 months", "Office 0.5 miles away", "Has an online enquiry form"] }),
    rows({ la: true, active: true, miles: 0.51, lawsoc: true, patients: "yes", nwnf: "yes", form: true, checked: true })),
  withScore(firm({ id: "drummond-miller", name: "Drummond Miller LLP", town: "Edinburgh", distanceMiles: 0.35, website: "http://www.drummondmiller.co.uk/", sources: ["slab", "lawsoc", "website"], actsForPatients: "yes", noWinNoFee: "unknown", enquiryUrl: "https://www.drummondmiller.co.uk/contact", reasons: ["Takes legal aid for medical negligence", "Office 0.4 miles away", "Has an online enquiry form"] }),
    rows({ la: true, active: true, miles: 0.35, lawsoc: true, patients: "yes", nwnf: "unknown", form: true, checked: true })),
  withScore(firm({ id: "anderson-strathern", name: "Anderson Strathern LLP Solicitors", town: "Haddington", distanceMiles: 16, website: "https://andersonstrathern.co.uk/", sources: ["slab", "lawsoc", "website"], actsForPatients: "yes", noWinNoFee: "yes", enquiryUrl: "https://www.andersonstrathern.co.uk/legal-expertise/medical-negligence/", reasons: ["Takes legal aid for medical negligence", "Has a medical negligence page with a form"] }),
    rows({ la: true, active: true, miles: 16, lawsoc: true, patients: "yes", nwnf: "yes", form: true, checked: true })),
  withScore(firm({ id: "starling-lawyers", name: "Starling Lawyers Limited", town: "Edinburgh", distanceMiles: 0.32, sources: ["slab"], reasons: ["Takes legal aid for medical negligence", "Office 0.3 miles away"], excluded: null }),
    rows({ la: true, active: true, miles: 0.32, lawsoc: null })),
  withScore(firm({ id: "lindsays", name: "Lindsays Solicitors", town: "Edinburgh", distanceMiles: 0.92, website: "http://www.lindsays.co.uk/", sources: ["slab", "website"], reasons: ["Takes legal aid for medical negligence"], excluded: "Website redirects to a claims company" }),
    rows({ la: true, active: true, miles: 0.92, lawsoc: null, checked: false })),
];

export const FIXTURE_TILES: AgentTile[] = [
  { id: "p1", label: "SLAB calculator", color: "#0060df", url: "https://www.slab.org.uk/new-to-legal-aid/eligibility-estimators/estimator-civil-legal-aid/", state: "done", note: "Likely to qualify" },
  { id: "p2", label: "SLAB lawyer list", color: "#8600fa", url: "https://www.slab.org.uk/new-to-legal-aid/find-a-solicitor/", state: "done", note: "Read 38 firms" },
  { id: "p3", label: "Law Society check", color: "#e64d00", url: "https://www.lawscot.org.uk/find-a-solicitor/", state: "working", note: "Checking Drummond Miller" },
  { id: "p4", label: "Balfour and Manson", color: "#009587", url: "http://www.balfour-manson.co.uk", state: "working", note: "Reading medical negligence page" },
  { id: "p5", label: "Lindsays", color: "#d6336c", url: "https://www.calio.co.uk/", state: "failed", note: "Redirected to a claims company" },
];

const C = { calc: "#0060df", list: "#8600fa", lawsoc: "#e64d00", bm: "#009587", lind: "#d6336c" };
const step = (i: number, t: number, agent: string, color: string, kind: TraceStep["kind"], text: string, o: Partial<TraceStep> = {}): TraceStep => ({ i, t, agent, color, kind, text, ...o });

/** Made-up trace for the layout (D39). No screenshots: `shot` is left out. */
export const FIXTURE_TRACE: TraceStep[] = [
  step(0, 300, "SLAB calculator", C.calc, "open", "Opened SLAB's civil legal aid calculator", { url: FIXTURE_TILES[0].url }),
  step(1, 900, "SLAB lawyer list", C.list, "open", "Opened SLAB's solicitor finder", { url: FIXTURE_TILES[1].url }),
  step(2, 1400, "SLAB calculator", C.calc, "pick", "Answered 'Are you on benefits?': No", { confidence: 0.99 }),
  step(3, 1900, "SLAB lawyer list", C.list, "pick", "Chose 'Civil' then 'Medical negligence'", { confidence: 0.97, detail: "Options seen: Adults with incapacity, Civil, Children's, Criminal. Picked: Civil (0.97). Then from 23 civil categories picked: Medical negligence (0.96)." }),
  step(4, 2600, "SLAB calculator", C.calc, "type", "Typed yearly income £14,000, outgoings £9,000, savings £500"),
  step(5, 3100, "SLAB lawyer list", C.list, "click", "Ticked 'Active in the last 12 months'"),
  step(6, 3800, "SLAB calculator", C.calc, "click", "Pressed 'Calculate'"),
  step(7, 4300, "SLAB lawyer list", C.list, "read", "Read 38 firms, nearest first", { detail: "1. Drummond Miller LLP, 0.35 mi\n2. Starling Lawyers Limited, 0.32 mi\n3. Balfour and Manson Solicitors, 0.51 mi\n… 38 in total" }),
  step(8, 4500, "SLAB lawyer list", C.list, "found", "Drummond Miller LLP: #1 of 38, 0.35 miles", { firms: ["drummond-miller"] }),
  step(9, 4550, "SLAB lawyer list", C.list, "found", "Balfour and Manson: #3 of 38, 0.51 miles", { firms: ["balfour-and-manson"] }),
  step(10, 4600, "SLAB lawyer list", C.list, "found", "Starling Lawyers: #2 of 38, 0.32 miles, no website listed", { firms: ["starling-lawyers"] }),
  step(11, 4650, "SLAB lawyer list", C.list, "found", "Lindsays: #5 of 38, 0.92 miles", { firms: ["lindsays"] }),
  step(12, 4700, "SLAB lawyer list", C.list, "found", "Anderson Strathern: #12 of 38, 16 miles", { firms: ["anderson-strathern"] }),
  step(13, 5200, "SLAB calculator", C.calc, "read", "Read the result", { detail: FIXTURE_RESULT_TEXT }),
  step(14, 5300, "SLAB calculator", C.calc, "result", "Likely to qualify financially", { confidence: 0.98 }),
  step(15, 5600, "Law Society check", C.lawsoc, "open", "Opened the Law Society of Scotland directory", { url: FIXTURE_TILES[2].url }),
  step(16, 6900, "Law Society check", C.lawsoc, "check", "Balfour and Manson is on the register ✓", { firms: ["balfour-and-manson"] }),
  step(17, 7600, "Law Society check", C.lawsoc, "check", "Drummond Miller is on the register ✓", { firms: ["drummond-miller"] }),
  step(18, 8300, "Law Society check", C.lawsoc, "check", "Anderson Strathern is on the register ✓", { firms: ["anderson-strathern"] }),
  step(19, 6000, "Balfour and Manson", C.bm, "open", "Opened balfour-manson.co.uk", { url: "http://www.balfour-manson.co.uk", firms: ["balfour-and-manson"] }),
  step(20, 6800, "Balfour and Manson", C.bm, "click", "Clicked 'Medical negligence'", { confidence: 0.94, firms: ["balfour-and-manson"], detail: "Links seen: About, Family law, Personal injury, Medical negligence, Contact. Picked: Medical negligence (0.94)." }),
  step(21, 7500, "Balfour and Manson", C.bm, "decide", "Acts for patients: yes", { confidence: 0.93, firms: ["balfour-and-manson"], detail: "Page excerpt: 'We represent patients and families who have been harmed by medical negligence…'" }),
  step(22, 7700, "Balfour and Manson", C.bm, "decide", "Offers no win no fee: yes", { confidence: 0.81, firms: ["balfour-and-manson"] }),
  step(23, 8100, "Balfour and Manson", C.bm, "found", "Enquiry form at /contact", { url: "http://www.balfour-manson.co.uk/contact", firms: ["balfour-and-manson"] }),
  step(24, 6200, "Lindsays", C.lind, "open", "Opened lindsays.co.uk", { firms: ["lindsays"] }),
  step(25, 6900, "Lindsays", C.lind, "recover", "The site redirected to calio.co.uk; checked whether it is the same firm", { url: "https://www.calio.co.uk/", firms: ["lindsays"] }),
  step(26, 7300, "Lindsays", C.lind, "fail", "Redirects to a claims company, so left out", { firms: ["lindsays"] }),
  step(27, 9000, "Ranking", "#525252", "result", "Ranked 5 firms; top 3 kept", { firms: ["balfour-and-manson", "drummond-miller", "anderson-strathern"] }),
].sort((a, b) => a.t - b.t).map((s, i) => ({ ...s, i }));

export const FIXTURE_RESULT: Step3Result = {
  verdict: "likely",
  route: "legal_aid",
  calculatorText: FIXTURE_RESULT_TEXT,
  firms: FIXTURE_FIRMS,
  shortlist: ["balfour-and-manson", "drummond-miller", "anderson-strathern"],
  stats: { agents: 5, sites: 9, pages: 41, actions: 163 },
  runDir: ".runs/fixture",
  runId: "fixture",
  trace: FIXTURE_TRACE,
};
