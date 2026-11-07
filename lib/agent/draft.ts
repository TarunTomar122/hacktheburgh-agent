import { z } from "zod";
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

export async function draftComplaint(facts: CaseFacts): Promise<Draft> {
  return structured({
    model: MODELS.draft,
    effort: EFFORT.draft,
    instructions: INSTRUCTIONS,
    input: `Facts:\n${JSON.stringify(facts, null, 2)}`,
    schema: Draft,
    name: "complaint_draft",
  });
}
