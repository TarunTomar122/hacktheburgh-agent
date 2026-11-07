import { missingRequired } from "../../lib/agent/facts";
import { fundingMissing } from "../../lib/agent/legalAidTypes";
import type { Profile } from "../../lib/profile";

export type Milestone = { step: number; label: string; done: boolean };

/**
 * What counts as progress. Only things we can know:
 *  - from the profile (details complete, draft written, NHS reply received),
 *  - from the agent (form filled up to the review page),
 *  - self-reported by the user ("I've sent it"), because we cannot see them press Send in the other window.
 * Step 5 is not built and step 4 cannot send yet, so those milestones cannot be done yet. The percentage counts them, so it never reaches 100% early.
 */
export function milestones(p: Profile): Milestone[] {
  const g = p.progress ?? {};
  const skipped = g.skipped ?? []; // steps the user skipped in the demo (D60)
  return [
    { step: 1, label: "Your details are complete", done: missingRequired(p.facts).length === 0 },
    { step: 1, label: "Complaint written", done: !!p.draft?.details.trim() },
    { step: 1, label: "NHS form filled in and checked", done: g.nhsFilled === true },
    { step: 1, label: "Complaint sent to NHS Lothian", done: g.nhsSent === true },
    { step: 2, label: "NHS Lothian's final reply received", done: p.ombudsman?.unlocked === true },
    { step: 2, label: "Ombudsman form filled in and checked", done: g.spsoFilled === true },
    { step: 2, label: "Complaint sent to the ombudsman", done: g.spsoSent === true },
    { step: 3, label: "Money questions answered", done: !!p.legalAid && fundingMissing(p.legalAid.funding).length === 0 },
    // Sample (fixture) results never count: they are not a real check.
    { step: 3, label: "Legal aid checked", done: !!p.legalAid?.result && !p.legalAid.sample },
    { step: 3, label: "Lawyers shortlisted", done: !!p.legalAid?.result && !p.legalAid.sample && p.legalAid.result.shortlist.length > 0 },
    { step: 4, label: "Lawyers selected", done: (p.legalAid?.selected?.length ?? 0) > 0 && !p.legalAid?.sample },
    // Sent = the agent sent it, or the user marked an email draft as sent (self-reported).
    { step: 4, label: "Enquiries sent", done: (p.enquiries ?? []).some((e) => e.status === "sent" || e.status === "replied" || e.status === "not_interested") },
    { step: 4, label: "A firm replied", done: (p.enquiries ?? []).some((e) => e.status === "replied") },
    { step: 5, label: "Case file complete", done: false },
  ].map((m) => ({ ...m, done: m.done || skipped.includes(m.step) }));
}

export function summarise(ms: Milestone[]) {
  const done = ms.filter((m) => m.done).length;
  const next = ms.find((m) => !m.done && m.step <= 4);
  return { done, total: ms.length, pct: Math.round((done / ms.length) * 100), next: next?.label ?? null };
}
