import { z } from "zod";
import type { Draft } from "./draft";

/** How the user will give the SPSO a document. "upload" is not automated yet (it needs a real file from the user), so the UI only offers post / none. */
export const DocRoute = z.enum(["upload", "none", "post"]);
export type DocRoute = z.infer<typeof DocRoute>;
export const DOC_OPTION: Record<DocRoute, string> = { upload: "I will upload below", none: "I do not have this document", post: "I will send a copy by post" };

/**
 * What the SPSO form needs beyond the profile. None of it is a form for the user (D33):
 * - impact and outcome are written by the agent from what the user said at onboarding (lib/agent/spsoDraft.ts),
 * - the yes/no answers start from sensible defaults; the user changes them on the real form's review page,
 * - readConfirmed is set by the single approval click.
 * The user is only asked something when the agent cannot work it out.
 */
export const SpsoAnswers = z.object({
  /** The user confirmed (in the approval) that they have read the SPSO "Making a complaint" page. */
  readConfirmed: z.boolean(),
  /** NHS Lothian's complaint reference, if known. The form marks it "if you have it"; empty is fine. */
  nhsReference: z.string(),
  childAffected: z.boolean(),
  courtAction: z.boolean(),
  letterMentionsSpso: z.boolean(),
  documents: z.object({ finalResponse: DocRoute, stage1Response: DocRoute, ownComplaint: DocRoute, other: DocRoute }),
  /** The form's own options are Yes / No / Don't know. */
  otherReviews: z.enum(["yes", "no", "dont_know"]),
  reportedToRegulator: z.boolean(),
  /** "How has this affected you?" Written from the user's own words; max 500 words. */
  impact: z.string(),
  /** What the user wants the ombudsman to achieve. The form needs 15 to 500 words. */
  outcome: z.string(),
});
export type SpsoAnswers = z.infer<typeof SpsoAnswers>;

export const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

/** Starting answers, worked out in code. Not shown as a list (D33): the user checks and edits them on the real form's review page, which has an edit link per section. */
export function defaultAssumptions(): Omit<SpsoAnswers, "impact" | "outcome" | "readConfirmed"> {
  return {
    nhsReference: "",
    letterMentionsSpso: true, // the SPSO says the final letter "should clearly refer you to us"
    courtAction: false,
    childAffected: false,
    otherReviews: "dont_know",
    reportedToRegulator: false,
    documents: { finalResponse: "post", stage1Response: "none", ownComplaint: "post", other: "none" },
  };
}

/** Problems we can see in code before opening the browser (word limits are on the SPSO page). Empty list = fine. */
export function spsoProblems(draft: Draft, a: Partial<SpsoAnswers>): string[] {
  const out: string[] = [];
  const impact = a.impact ?? "";
  const outcome = a.outcome ?? "";
  if (wordCount(impact) < 1) out.push("How this has affected you is still missing.");
  if (wordCount(outcome) < 15) out.push(`What you want the ombudsman to achieve needs at least 15 words (it has ${wordCount(outcome)}).`);
  if (wordCount(outcome) > 500 || wordCount(impact) > 500) out.push("The form allows at most 500 words in each box.");
  if (wordCount(draft.details) < 20) out.push("The description of what went wrong needs at least 20 words.");
  return out;
}
