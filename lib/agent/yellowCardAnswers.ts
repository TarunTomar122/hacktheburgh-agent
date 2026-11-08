import { z } from "zod";

/**
 * Step 6 (Yellow Card, proposed on feature/yellow-card): what the user is reporting. Client-safe.
 * Asked on the step itself, not in onboarding. The privacy box on the MHRA form is only ticked if the user agreed here.
 */
export const YellowCardKind = z.enum(["side_effect", "defective", "fake"]);
export type YellowCardKind = z.infer<typeof YellowCardKind>;

export const YellowCardAnswers = z.object({
  kind: YellowCardKind,
  /** As on the box or label, e.g. "Amoxicillin 500mg capsules". Matched against the site's own product list by the agent. */
  product: z.string(),
  /** What happened, in the user's own words. Starts as their story from onboarding; they can edit it. */
  reaction: z.string(),
  privacyAgreed: z.boolean(),
  /** Side effects only: the severity boxes to tick, worded exactly as on the site's "Side Effects" page (SEVERITY_CHOICES). Optional so older callers still work. */
  severity: z.array(z.string()).optional(),
});
export type YellowCardAnswers = z.infer<typeof YellowCardAnswers>;

/** The Yellow Card start page's options for "What does your report relate to?" (seen 2026-11-07). */
export const KIND_LABEL: Record<YellowCardKind, string> = {
  side_effect: "A suspected side effect",
  defective: "A suspected defective product",
  fake: "A suspected fake product",
};

/** Plain words for our own page. */
export const KIND_CHOICES: { value: YellowCardKind; label: string; hint: string }[] = [
  { value: "side_effect", label: "A side effect or reaction", hint: "Something happened to you after taking or using it." },
  { value: "defective", label: "A faulty product", hint: "Damaged, wrong strength, wrong contents, or not what was prescribed." },
  { value: "fake", label: "A fake product", hint: "You think it is counterfeit or not genuine." },
];

/**
 * The severity boxes on the site's "Side Effects" page (seen 2026-11-08), worded as there without the "(Optional)" tag. The site labels
 * every one "(Optional)" but refuses to move on until at least one is ticked ("Please indicate why the reaction was serious by selecting at
 * least one value"). "Caused death" is greyed out and fills itself in, so it is not offered. These are the user's own answers: never guessed.
 */
export const SEVERITY_CHOICES = [
  "Not serious",
  "Mild or slightly uncomfortable",
  "Uncomfortable, a nuisance or irritation, but able to carry on with everyday activities",
  "Had short term effect that was bad enough to affect everyday activities",
  "Caused significant or long term incapacity",
  "Significant enough to lead you to seek advice from a healthcare professional",
  "Bad enough to be admitted to hospital",
  "Caused an abnormality in an unborn child",
  "Life threatening",
];

/** Demo default: ticked when the user chose none, because the site will not go on with none ticked. Plausible for the demo story, not a real assessment. */
export const DEFAULT_SEVERITY = "Significant enough to lead you to seek advice from a healthcare professional";

export const YELLOW_CARD_SITE = "https://yellowcard.mhra.gov.uk/";

/** What still stops the agent from starting, in plain words. Empty when it can run. */
export function yellowCardProblems(a: Partial<YellowCardAnswers>): string[] {
  const out: string[] = [];
  if (!a.kind) out.push("Choose what you are reporting.");
  if (!a.product?.trim()) out.push("Name the medicine, vaccine or device.");
  if (!a.reaction?.trim()) out.push("Say what happened.");
  if (!a.privacyAgreed) out.push("The Yellow Card form asks you to agree to how the MHRA handles your report.");
  return out;
}
