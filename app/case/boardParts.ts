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
  /** One short line of what was learned, under the headline (empty until there is something). */
  summary?: string;
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
  /** The funding check's conclusion as soon as it has one (the result carries it at the end). */
  verdict?: PlannerResult["verdict"];
  /** What the crew noted as it went ("Scottish Legal Aid Board: ..."), newest last. */
  findings?: { text: string; crew?: CrewId }[];
  skipped: (CrewId | "all")[];
  /** What the place's funding check and register are called, from the research ("the legal aid checker"). */
  checker?: string;
};

/** Whole sentences only: the first one, never cut mid-way and never ended with "…". */
const sentence = (t: string) => {
  const one = t.replace(/\s+/g, " ").trim();
  return one.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? one;
};
/** A finding without its "Publisher: " lead-in, as its first whole sentence. */
const lineOf = (t: string) => sentence(t.replace(/^[^:]{1,70}:\s+/, ""));
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
      const v = i.result?.verdict ?? i.verdict;
      const note = [...(i.findings ?? [])].reverse().find((f) => f.crew === "nell")?.text;
      const summary = i.result?.calculatorText ? lineOf(i.result.calculatorText) : note ? lineOf(note) : undefined;
      if (status === "skipped") return { ...base, headline: "Not checked this time" };
      if (v === "skipped") return { ...base, headline: "You skipped the checker's questions", summary: "A solicitor can check legal aid with you." };
      if (v === "likely") return { ...base, summary, headline: "Legal aid looks likely", chip: `Quoted from ${where}` };
      if (v === "unlikely") return { ...base, summary, headline: "Legal aid looks unlikely", chip: `Quoted from ${where}` };
      if (v) return { ...base, summary, headline: "Could not tell if legal aid would pay", chip: "No estimate from the checker" };
      return { ...base, summary, headline: status === "working" ? "Checking if legal aid could pay" : status === "done" ? "Not checked this time" : "Not started" };
    }
    if (p.id === "lawyers") {
      // Only firms whose own website was checked count as checked (a register entry alone is not).
      const n = (i.result?.firms ?? i.firms).filter((f) => f.sources?.includes("website")).length;
      const top = i.result?.shortlist.length;
      const checked = (i.result?.firms ?? i.firms).filter((f) => f.sources?.includes("website"));
      const names = (i.result ? i.result.shortlist.map((id) => i.result!.firms.find((f) => f.id === id)).filter((f): f is NonNullable<typeof f> => !!f) : checked).map((f) => f.name);
      const summary = names.length ? names.slice(0, 3).join(", ") + (names.length > 3 ? ` and ${names.length - 3} more` : "") : undefined;
      if (status === "skipped") return { ...base, headline: "Not checked this time" };
      if (i.result) return { ...base, summary, headline: top ? `${top} solicitor${top === 1 ? "" : "s"} who could take your case` : "No suitable solicitor found yet", chip: `${n} checked on their own sites` };
      return { ...base, summary, headline: n ? `${n} firm${n === 1 ? "" : "s"} checked so far` : status === "working" ? "Looking for solicitors near you" : "Not started" };
    }
    if (p.id === "evidence") {
      const ev = i.result?.evidence ?? i.evidence;
      const gap = ev.gaps?.[0];
      const point = ev.guideline?.points[0];
      const nothing = ev.investigation && !ev.investigation.items.length ? "No published decisions or awards found" : undefined;
      const found = ev.investigation?.items.length ? `${ev.investigation.items.length} published decision${ev.investigation.items.length === 1 ? "" : "s"} or award${ev.investigation.items.length === 1 ? "" : "s"} found` : undefined;
      const summary = gap && point ? sentence(point.text) : gap ? sentence(gap.question) : point ? sentence(point.text) : found ?? nothing;
      if (status === "skipped") return { ...base, headline: "Not checked this time" };
      if (gap) return { ...base, summary, headline: "A possible gap in your care", chip: ev.guideline && NO_GUIDELINE_TOPIC.test(ev.guideline.name) ? "From published guidance" : "From the guidance" };
      if (point) return { ...base, summary, headline: "What the guidance says", chip: "From published guidance" };
      return { ...base, summary, headline: status === "working" ? "Reading the clinical guidance" : status === "done" ? "No guidance point found for your injury" : "Not started" };
    }
    const outs = i.result?.enquiries ?? i.enquiries;
    const ready = outs.filter((o) => o.status === "ready_to_send" || o.status === "needs_input");
    const typed = ready.reduce((n, o) => n + o.filled.length, 0);
    if (status === "skipped") return { ...base, headline: "Not prepared this time" };
    const summary = ready.length ? ready.map((o) => o.firmName).join(", ") : undefined;
    if (ready.length) return { ...base, summary, headline: `${ready.length} enquir${ready.length === 1 ? "y" : "ies"} ready for you to check`, chip: `${typed} details filled, nothing sent` };
    return { ...base, headline: status === "working" ? "Filling in the solicitors' forms" : status === "done" ? "No enquiry form could be filled" : "Not started" };
  });
}
