import type { EnquiryOutcome } from "../../lib/agent/enquiryTypes";
import type { EvidenceResult, PlannerResult, Say, CrewId } from "../../lib/agent/plannerTypes";
import type { FirmFinding } from "../../lib/agent/legalAidTypes";

/**
 * "Prepare your case" as it builds: four parts, one per crew member, each with one plain line that fills in as the
 * crew finishes it (same idea as the research screen's "what to know" rows). Pure, so it can be tested without a browser.
 */
export type PartId = "funding" | "lawyers" | "evidence" | "enquiries";
export type Part = {
  id: PartId;
  crew: CrewId;
  label: string;
  status: "waiting" | "working" | "done" | "skipped";
  headline: string;
  /** What kind of backing it has, in words ("Quoted from the official checker"), never a bare score. */
  chip?: string;
  /** What the crew member said, oldest first (plain lines, shown on click). */
  reports: string[];
};

export type BoardInput = {
  says: Say[];
  crew: Record<string, { state: "idle" | "working" | "waiting" | "done"; note: string }>;
  firms: FirmFinding[];
  evidence: EvidenceResult;
  enquiries: EnquiryOutcome[];
  result?: PlannerResult;
  skipped: (CrewId | "all")[];
  /** What the place's funding check and register are called, from the research ("the legal aid checker"). */
  checker?: string;
};

const first = (t: string) => (t.match(/^.*?[.!?](\s|$)/)?.[0] ?? t).trim();
const SKIPPED = "Skipped, as you asked.";
const NO_GUIDELINE_TOPIC = /NICE|guideline/i;

const PARTS: { id: PartId; crew: CrewId; label: string }[] = [
  { id: "funding", crew: "nell", label: "Paying for a solicitor" },
  { id: "lawyers", crew: "robin", label: "Solicitors" },
  { id: "evidence", crew: "iona", label: "Medical evidence" },
  { id: "enquiries", crew: "kit", label: "Enquiries" },
];

export function boardParts(i: BoardInput): Part[] {
  return PARTS.map((p) => {
    const mine = i.says.filter((s) => s.from === p.crew && s.kind === "report");
    const real = mine.filter((s) => s.text !== SKIPPED && s.ok !== false);
    const skipped = i.skipped.includes(p.crew) || i.skipped.includes("all") || mine.some((s) => s.text === SKIPPED);
    const live = i.crew[p.crew]?.state;
    const finished = i.result !== undefined || live === "done";
    const status: Part["status"] = skipped && !real.length ? "skipped" : live === "working" || live === "waiting" ? "working" : real.length || finished ? "done" : "waiting";
    const reports = real.map((s) => s.text);
    const base = { id: p.id, crew: p.crew, label: p.label, status, reports };
    const where = i.checker ?? "the legal aid checker";

    if (p.id === "funding") {
      const v = i.result?.verdict;
      if (status === "skipped") return { ...base, headline: "Not checked this time" };
      if (v === "likely") return { ...base, headline: "Legal aid looks likely", chip: `Quoted from ${where}` };
      if (v === "unlikely") return { ...base, headline: "Legal aid looks unlikely", chip: `Quoted from ${where}` };
      if (v) return { ...base, headline: "Could not tell if legal aid would pay", chip: "No estimate from the checker" };
      return { ...base, headline: status === "working" ? "Checking if legal aid could pay" : reports.length ? first(reports[reports.length - 1]) : status === "done" ? "Not checked this time" : "Not started" };
    }
    if (p.id === "lawyers") {
      const n = i.result?.firms.length ?? i.firms.length;
      const top = i.result?.shortlist.length;
      if (status === "skipped") return { ...base, headline: "Not checked this time" };
      if (i.result) return { ...base, headline: top ? `${top} solicitor${top === 1 ? "" : "s"} who could take your case` : "No suitable solicitor found yet", chip: `${n} checked on their own sites` };
      return { ...base, headline: n ? `${n} firm${n === 1 ? "" : "s"} checked so far` : status === "working" ? "Looking for solicitors near you" : "Not started" };
    }
    if (p.id === "evidence") {
      const ev = i.result?.evidence ?? i.evidence;
      const gap = ev.gaps?.[0];
      const point = ev.guideline?.points[0];
      if (status === "skipped") return { ...base, headline: "Not checked this time" };
      if (gap) return { ...base, headline: "One question worth asking", chip: ev.guideline && NO_GUIDELINE_TOPIC.test(ev.guideline.name) ? "From published guidance" : "From the guidance" };
      if (point) return { ...base, headline: "What the guidance says", chip: "From published guidance" };
      return { ...base, headline: status === "working" ? "Reading the clinical guidance" : status === "done" ? "No guidance point found for your injury" : "Not started" };
    }
    const outs = i.result?.enquiries ?? i.enquiries;
    const ready = outs.filter((o) => o.status === "ready_to_send" || o.status === "needs_input");
    const typed = ready.reduce((n, o) => n + o.filled.length, 0);
    if (status === "skipped") return { ...base, headline: "Not prepared this time" };
    if (ready.length) return { ...base, headline: `${ready.length} enquir${ready.length === 1 ? "y" : "ies"} ready for you to check`, chip: `${typed} details filled, nothing sent` };
    return { ...base, headline: status === "working" ? "Filling in the solicitors' forms" : status === "done" ? "No enquiry form could be filled" : "Not started" };
  });
}
