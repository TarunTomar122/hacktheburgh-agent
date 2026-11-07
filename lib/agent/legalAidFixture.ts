import type { AgentTile, FirmFinding, Step3Result } from "./legalAidTypes";

/**
 * Sample step 3 output for building the UI before the real runner exists. NOT a real result.
 * Firm names, towns and distances come from one SLAB solicitor-finder search on 2026-11-07
 * (Civil > Medical negligence > active only, from Edinburgh). Everything else (scores, "acts for patients",
 * "no win no fee", enquiry pages) is made up for layout and must not be shown as fact.
 */

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

export const FIXTURE_FIRMS: FirmFinding[] = [
  firm({ id: "balfour-and-manson", name: "Balfour and Manson Solicitors", town: "Edinburgh", distanceMiles: 0.51, website: "http://www.balfour-manson.co.uk", sources: ["slab", "lawsoc", "website"], actsForPatients: "yes", noWinNoFee: "yes", enquiryUrl: "http://www.balfour-manson.co.uk/contact", score: 92, reasons: ["Takes legal aid for medical negligence", "Did this kind of case in the last 12 months", "Office 0.5 miles away", "Has an online enquiry form"] }),
  firm({ id: "drummond-miller", name: "Drummond Miller LLP", town: "Edinburgh", distanceMiles: 0.35, website: "http://www.drummondmiller.co.uk/", sources: ["slab", "lawsoc", "website"], actsForPatients: "yes", noWinNoFee: "unknown", enquiryUrl: "https://www.drummondmiller.co.uk/contact", score: 85, reasons: ["Takes legal aid for medical negligence", "Office 0.4 miles away", "Has an online enquiry form"] }),
  firm({ id: "anderson-strathern", name: "Anderson Strathern LLP Solicitors", town: "Haddington", distanceMiles: 16, website: "https://andersonstrathern.co.uk/", sources: ["slab", "lawsoc", "website"], actsForPatients: "yes", noWinNoFee: "yes", enquiryUrl: "https://www.andersonstrathern.co.uk/legal-expertise/medical-negligence/", score: 80, reasons: ["Takes legal aid for medical negligence", "Has a medical negligence page with a form"] }),
  firm({ id: "starling-lawyers", name: "Starling Lawyers Limited", town: "Edinburgh", distanceMiles: 0.32, sources: ["slab"], score: 60, reasons: ["Takes legal aid for medical negligence", "Office 0.3 miles away"], excluded: null }),
  firm({ id: "lindsays", name: "Lindsays Solicitors", town: "Edinburgh", distanceMiles: 0.92, website: "http://www.lindsays.co.uk/", sources: ["slab", "website"], score: 40, reasons: ["Takes legal aid for medical negligence"], excluded: "Website redirects to a claims company" }),
];

export const FIXTURE_TILES: AgentTile[] = [
  { id: "p1", label: "SLAB calculator", color: "#0060df", url: "https://www.slab.org.uk/new-to-legal-aid/eligibility-estimators/estimator-civil-legal-aid/", state: "done", note: "Likely to qualify" },
  { id: "p2", label: "SLAB lawyer list", color: "#8600fa", url: "https://www.slab.org.uk/new-to-legal-aid/find-a-solicitor/", state: "done", note: "Read 38 firms" },
  { id: "p3", label: "Law Society check", color: "#e64d00", url: "https://www.lawscot.org.uk/find-a-solicitor/", state: "working", note: "Checking Drummond Miller" },
  { id: "p4", label: "Balfour and Manson", color: "#009587", url: "http://www.balfour-manson.co.uk", state: "working", note: "Reading medical negligence page" },
  { id: "p5", label: "Lindsays", color: "#d6336c", url: "https://www.calio.co.uk/", state: "failed", note: "Redirected to a claims company" },
];

export const FIXTURE_RESULT: Step3Result = {
  verdict: "likely",
  route: "legal_aid",
  calculatorText: "Based on the information you have provided, you are likely to qualify financially for civil legal aid.",
  firms: FIXTURE_FIRMS,
  shortlist: ["balfour-and-manson", "drummond-miller", "anderson-strathern"],
  stats: { agents: 5, sites: 9, pages: 41, actions: 163 },
  runDir: ".runs/fixture",
};
