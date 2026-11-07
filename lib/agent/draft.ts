import { z } from "zod";
import { supportsLothian, hasFractureContext, factualComplaint } from "./complaintScope";
import type { CaseFacts } from "./facts";
import { EFFORT, MODELS, structured } from "./llm";

export const Draft = z.object({
  details: z.string().describe("Body of the complaint for the 'details of your feedback' box"),
  location: z.string().describe("Where the care happened, for the 'location' box"),
  outcome: z.string().describe("What the user wants to happen. Empty string if they did not say."),
});
export type Draft = z.infer<typeof Draft>;

const INSTRUCTIONS = `You write the text for an NHS complaint form on behalf of the patient, in the first person.
Rules:
- Use ONLY the facts given. Do not add medical claims, diagnoses, blame, dates or details that are not in the facts.
- Do not write "I was told" or attribute statements to doctors unless the facts say so.
- Plain, polite, factual. Chronological. Short paragraphs. No legal language.
- Include the dates and places from the timeline.
- Do not include the patient's contact details (they go in separate fields).
- If desiredOutcome is null, return an empty string for outcome.`;

/** What Iona found (D65): one guideline recommendation and the question it raises. Goes in as a polite question, never a claim. */
export type DraftEvidence = { guideline: string; point: string; question: string };

const EVIDENCE_RULE = `
- An "evidence" item may be given: a clinical guideline recommendation and a question it raises. Add ONE short paragraph near the end that quotes the recommendation exactly and politely asks NHS Lothian to explain how that was followed in the patient's care. Do not say it was not followed. Do not say anyone was at fault.`;

export async function draftComplaint(facts: CaseFacts, evidence?: DraftEvidence): Promise<Draft> {
  if (!supportsLothian(facts)) return factualComplaint(facts);
  if (!hasFractureContext(facts)) evidence = undefined;
  return structured({
    model: MODELS.draft,
    effort: EFFORT.draft,
    instructions: evidence ? INSTRUCTIONS + EVIDENCE_RULE : INSTRUCTIONS,
    input: `Facts:\n${JSON.stringify(facts, null, 2)}${evidence ? `\n\nEvidence:\n${JSON.stringify(evidence, null, 2)}` : ""}`,
    schema: Draft,
    name: "complaint_draft",
  });
}
