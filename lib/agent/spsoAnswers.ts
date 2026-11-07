import { z } from "zod";
import type { Draft } from "./draft";

/** How the user will give the SPSO a document. "upload" is not automated yet (it needs a real file from the user), so the UI only offers post / none. */
export const DocRoute = z.enum(["upload", "none", "post"]);
export type DocRoute = z.infer<typeof DocRoute>;
export const DOC_OPTION: Record<DocRoute, string> = { upload: "I will upload below", none: "I do not have this document", post: "I will send a copy by post" };

/** Things only known once the NHS has replied. Asked at the ombudsman step, never during onboarding (D29). */
export const SpsoAnswers = z.object({
  /** The user has read the SPSO "Making a complaint" page and ticks its confirmation box. */
  readConfirmed: z.boolean(),
  /** Date of NHS Lothian's final written reply (kept for the 12-month limit; the form does not ask for it). */
  finalReplyDate: z.string(),
  /** NHS Lothian's complaint reference, if the letter has one. Empty is fine. */
  nhsReference: z.string(),
  /** Were any under-18s affected? The SPSO form asks. */
  childAffected: z.boolean(),
  /** Has the matter been to court, or does the user plan to take it there? Matters for the solicitor step too. */
  courtAction: z.boolean(),
  /** Does NHS Lothian's final letter clearly refer the user to the SPSO? Only the user can see the letter. */
  letterMentionsSpso: z.boolean(),
  /** Documents page: final (stage 2) letter, a stage 1 reply, a copy of the user's own written complaint, other correspondence. */
  documents: z.object({ finalResponse: DocRoute, stage1Response: DocRoute, ownComplaint: DocRoute, other: DocRoute }),
  /** Has it been through another review (e.g. a Significant Adverse Event Review)? */
  otherReviews: z.boolean(),
  /** Reported to a regulator such as the GMC or NMC? */
  reportedToRegulator: z.boolean(),
  /** "How has this affected you?" In the user's own words, required by the form (max 500 words). */
  impact: z.string(),
  /** What the user wants the ombudsman to achieve. The form needs 15 to 500 words. */
  outcome: z.string(),
});
export type SpsoAnswers = z.infer<typeof SpsoAnswers>;

export const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** Problems we can see in code before opening the browser (word limits are on the SPSO page). Empty list = fine. */
export function spsoProblems(draft: Draft, a: Partial<SpsoAnswers>): string[] {
  const out: string[] = [];
  const impact = a.impact ?? "";
  const outcome = a.outcome ?? "";
  if (wordCount(impact) < 1) out.push("Tell us how this has affected you (the form requires it).");
  if (wordCount(outcome) < 15) out.push(`What you would like the ombudsman to achieve needs at least 15 words (you have ${wordCount(outcome)}).`);
  if (wordCount(outcome) > 500 || wordCount(impact) > 500) out.push("The form allows at most 500 words in each box.");
  if (wordCount(draft.details) < 20) out.push("The description of what went wrong needs at least 20 words.");
  return out;
}

/** Yes/no questions the user must answer explicitly (no default), with the wording shown in the UI. */
export const SPSO_YES_NO: { key: "letterMentionsSpso" | "courtAction" | "childAffected" | "otherReviews" | "reportedToRegulator"; label: string }[] = [
  { key: "letterMentionsSpso", label: "Does NHS Lothian's final letter say you can take the complaint to the ombudsman (SPSO)?" },
  { key: "courtAction", label: "Has this been to court, or do you plan to take it to court?" },
  { key: "childAffected", label: "Was anyone under 18 affected?" },
  { key: "otherReviews", label: "Has it been through any other review (for example a Significant Adverse Event Review)?" },
  { key: "reportedToRegulator", label: "Have you reported it to a regulator such as the GMC or NMC?" },
];

/** Everything answered and valid? Used to enable the button. */
export function spsoComplete(draft: Draft | null, a: Partial<SpsoAnswers>): a is SpsoAnswers {
  if (!draft) return false;
  const yn = SPSO_YES_NO.every((q) => typeof a[q.key] === "boolean");
  const docs = !!a.documents && Object.values(a.documents).every(Boolean);
  return yn && docs && a.readConfirmed === true && typeof a.nhsReference === "string" && typeof a.finalReplyDate === "string" && spsoProblems(draft, a).length === 0;
}
