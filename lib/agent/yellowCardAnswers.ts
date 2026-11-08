import { z } from "zod";

/**
 * Step 6 (Yellow Card, proposed on feature/yellow-card): what the user is reporting. Client-safe.
 * Asked on the step itself, not in onboarding (D33). The privacy box on the MHRA form is only ticked if the user agreed here.
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
