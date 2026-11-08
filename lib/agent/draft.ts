import { z } from "zod";
import { supportsLothian, hasFractureContext, factualComplaint } from "./complaintScope";
import type { CaseFacts } from "./facts";
import { modelFor, structured } from "./llm";
import type { DraftSupport } from "./investigate";

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

/** What Iona found: one guideline recommendation and the question it raises. Goes in as a polite question, never a claim. */
export type DraftEvidence = { guideline: string; point: string; question: string };

const EVIDENCE_RULE = `
- An "evidence" item may be given: a clinical guideline recommendation and a question it raises. Add ONE short paragraph near the end that quotes the recommendation exactly and politely asks NHS Lothian to explain how that was followed in the patient's care. Do not say it was not followed. Do not say anyone was at fault.`;

/**
 * Code's check on the evidence paragraph: if the model left out the exact quote (local Qwen3 8B did in 12 of 12 bench
 * drafts), add the paragraph from a fixed, neutral template. English only.
 */
export function ensureEvidence(d: Draft, evidence: DraftEvidence | undefined, body: string, language = "English"): Draft {
  if (!evidence || !/^english$/i.test(language) || d.details.includes(evidence.point.slice(0, 40))) return d;
  return { ...d, details: `${d.details.trim()}\n\n${evidence.guideline} says: "${evidence.point}" Could ${body} please explain how this recommendation was considered in my care?` };
}

/**
 * Same check for Iona's investigation (official material the patient can cite): any item the model left out is added from a
 * fixed, neutral template, so a quote that code verified always reaches the letter word for word. English only.
 */
export function ensureSupport(d: Draft, support: DraftSupport[] | undefined, body: string, language = "English"): Draft {
  if (!support?.length || !/^english$/i.test(language)) return d;
  const missing = support.slice(0, 2).filter((x) => !d.details.includes(x.quote.slice(0, 40)));
  if (!missing.length) return d;
  return { ...d, details: `${d.details.trim()}\n\n${missing.map((x) => `For reference, ${x.source} (${x.title}) published: "${x.quote}"`).join("\n")}\nI would be grateful if ${body} would take ${missing.length > 1 ? "these" : "this"} into account when looking at my complaint.` };
}

export async function draftComplaint(facts: CaseFacts, evidence?: DraftEvidence): Promise<Draft> {
  if (!supportsLothian(facts)) return factualComplaint(facts);
  if (!hasFractureContext(facts)) evidence = undefined;
  const d = await structured({
    ...modelFor("draft", ["health", "identity"]), // the patient's story and name: on this Mac by default
    instructions: evidence ? INSTRUCTIONS + EVIDENCE_RULE : INSTRUCTIONS,
    input: `Facts:\n${JSON.stringify(facts, null, 2)}${evidence ? `\n\nEvidence:\n${JSON.stringify(evidence, null, 2)}` : ""}`,
    schema: Draft,
    name: "complaint_draft",
    data: ["health", "identity"],
  });
  return ensureEvidence(d, evidence, "NHS Lothian");
}

/**
 * The complaint, addressed to whichever body discovery found ("Elliot anywhere"). Same rules as above, no
 * place baked in: the body, the place and its own guidance come from the route map at run time.
 */
export async function draftComplaintTo(facts: CaseFacts, to: { body: string; place: string; language?: string }, evidence?: DraftEvidence, support?: DraftSupport[]): Promise<Draft> {
  if (!hasFractureContext(facts)) evidence = undefined;
  const instructions = `You write the text for a complaint to ${to.body} (${to.place}) about the patient's care, in the first person, on behalf of the patient.
Rules:
- Use ONLY the facts given. Do not add medical claims, diagnoses, blame, dates or details that are not in the facts.
- Plain, polite, factual. Chronological. Short paragraphs. No legal language.
- Include the dates and places from the timeline. Do not include the patient's contact details (they go in separate fields).
- If desiredOutcome is null, return an empty string for outcome.${evidence ? `
- An "evidence" item is given: a clinical guidance recommendation and a question it raises. Add ONE short paragraph near the end that quotes the recommendation exactly, names its source, and politely asks ${to.body} to explain how it was followed in the patient's care. Do not say it was not followed. Do not say anyone was at fault.` : ""}
- Write in ${to.language ?? "English"}.`;
  const d = await structured({ ...modelFor("draft", ["health", "identity"]), instructions, input: `Facts:\n${JSON.stringify(facts, null, 2)}${evidence ? `\n\nEvidence:\n${JSON.stringify(evidence, null, 2)}` : ""}${support?.length ? `\n\nSupport:\n${JSON.stringify(support.slice(0, 2).map(({ source, title, quote }) => ({ source, title, quote })), null, 2)}` : ""}`, schema: Draft, name: "complaint_draft", data: ["health", "identity"] });
  return ensureSupport(ensureEvidence(d, evidence, to.body, to.language), support, to.body, to.language);
}
