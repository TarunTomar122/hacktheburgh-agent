import type { CaseFacts } from "./facts";

/**
 * Does the patient's story involve a medicine, a side effect or a medical device? Then the case offers an extra step:
 * report it to the place's medicines regulator (UK: Yellow Card; elsewhere the crew finds that country's own scheme live).
 * Read from the story the patient wrote, in code, so the step never appears for a case that does not mention one. Client-safe.
 */
const MEDICINE = /\b(medicines?|medications?|drugs?|tablets?|pills?|capsules?|painkillers?|prescri\w*|doses?|dosage|side[- ]effects?|allergic reaction|reaction to|vaccines?|vaccinations?|antibiotics?|injections?|inhalers?|implants?|medical devices?|co-?codamol|codeine|ibuprofen|paracetamol|naproxen|morphine|tramadol|insulin|warfarin|statins?)\b/i;

export function involvesMedicine(f: Pick<CaseFacts, "incidentSummary" | "events" | "desiredOutcome">): boolean {
  const text = [f.incidentSummary, f.desiredOutcome, ...(f.events ?? []).map((e) => e.what)].filter(Boolean).join(" ");
  return MEDICINE.test(text);
}

/** The extra step's number in the address (/case?step=6) and the step bar. */
export const MEDICINE_STEP = 6;

/** What the medicine-report crew found and prepared (step 6 anywhere). */
export type MedicineReport = {
  regulator?: { body: string; url: string; quote?: string };
  medicine?: { name: string; reactions: string[]; started: string; outcome: string; howBad: string };
  form: { status: "ready_to_submit" | "needs_input" | "failed" | "not_started"; filled: { label: string; value: string }[]; unfilled: string[]; note: string; url: string; handedOff?: boolean };
};
