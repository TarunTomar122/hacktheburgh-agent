import { z } from "zod";
import { resolveRelativeDates } from "./timeLimit";
import { EFFORT, MODELS, structured } from "./llm";
import { CaseFacts, emptyFacts, mergeFacts, missingForOnboarding, missingRequired } from "./facts";
import { inputFor, joinReply, nextTarget, normaliseFacts, parseName, patchFromAnswer, questionFor, validatePatch, type InputSpec, type Target } from "./inputs";

import type { ChatMessage } from "./chat";
export type { ChatMessage } from "./chat";

/** Thrown when a widget answer is not valid (bad postcode, future date). The route turns it into a 400. */
export class InputError extends Error {}

const Extract = z.object({
  answerUnderstood: z.boolean().describe("Whether the latest answer has an understandable meaning in context. False for random letters or meaningless text; true for meaningful short answers, uncertainty, spelling mistakes or another language."),
  facts: CaseFacts.describe("The full updated facts. Keep everything already known; add or correct from the latest answer only."),
  acknowledgement: z
    .string()
    .describe("Zero or one short sentence showing you heard them, in their own words. Empty if the answer was only a plain detail. Never a question."),
});

// The order of the questions and their wording are fixed in code (inputs.ts, D28). The model only reads free text.
const INSTRUCTIONS = `You read what a person tells you about care they received from the NHS in Scotland, and record it as facts for an NHS Lothian complaint form. You do not choose the next question: the program does that.

Recording facts
- First judge the latest answer, not whether earlier messages were understandable. Set answerUnderstood to false for random keyboard characters or text with no understandable meaning, such as 'dfahkdiosfaiojf' or 'afkjnfaf'. Do not turn this into an incident or invent a meaning. Keep the existing facts unchanged in that case.
- Accept meaningful short answers, imperfect spelling, informal language and other languages. 'I fell', 'hurt my arm', and 'I cannot remember' are understandable. Missing detail is not gibberish; the program will ask follow-up questions.
- Only record what the user actually said. Never guess or invent a fact. If unsure, leave it null.
- Keep everything already known. Add or correct from the latest answer only.
- The user may give several facts in one answer: capture all of them.
- incidentSummary is what went wrong, in the user's own words. If they add more later, extend it rather than replacing it.
- Build the timeline in "events" (oldest first). Use YYYY-MM-DD only for a full date. Otherwise copy their wording, such as "early July 2026". Do not turn a rough date into an exact one.
- Never suggest or fill in a date, a name or a place the user has not given.
- desiredOutcome: set it only if the question being answered is the one about what they would like to happen. If they say they have nothing to add, set it to an empty string.
- emailRiskAccepted: set it only if the question being answered is the email question. true only for an explicit yes, false for an explicit no.
- preferredContact is one of Letter, Email, Phone Call. Set it only if they clearly chose.
- medicalRecords: never ask about it and leave it null unless the user volunteers it; a later step handles it (D29).

The acknowledgement
- Say it the way a good GP or a careful solicitor would, but only in everyday words. Unhurried and calm, never theatrical.
- No jargon at all. Use no medical term the user has not used first, and no legal term ever (nothing like "negligence", "liability", "breach" or "duty of care"). Use their own words for their injury and the places they went.
- Do not diagnose, do not say who was at fault, do not say what will happen, and do not give advice.
- One short sentence at most, without a question. Vary how you start. Never say "I'm sorry to hear that".
- Leave it empty when the answer was only a plain detail such as a name, a phone number or a yes or no.
- Never open with thanks: the program adds its own thanks to the next question.
- Use British spelling.`;

export type InterviewResult = {
  facts: CaseFacts;
  reply: string;
  done: boolean;
  missing: string[];
  /** What the question is about, and which kind of input answers it. The UI renders this. */
  target: Target;
  input: InputSpec;
};

export type WidgetAnswer = Record<string, string | string[] | boolean>;

/**
 * One turn of the intake chat. Pass the whole conversation so far (the agent's opener included).
 * - `answer` is what a form, button or checklist gave us for the question currently open. No model call.
 * - Without it, the last message is free text and the model reads it.
 */
export async function interviewTurn(messages: ChatMessage[], known: CaseFacts = emptyFacts(), answer?: WidgetAnswer, scope: "onboarding" | "nhs" = "onboarding"): Promise<InterviewResult> {
  const asked = nextTarget(known, scope);
  let merged: CaseFacts;
  let acknowledgement = "";

  if (answer) {
    const patch = patchFromAnswer(asked, known, answer);
    const problem = validatePatch(patch);
    if (problem) throw new InputError(problem);
    merged = { ...known, ...patch };
  } else {
    const text = [...messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const name = asked === "name" ? parseName(text) : null;
    if (name) {
      merged = { ...known, firstName: name };
    } else {
      const transcript = messages.map((m) => `${m.role === "agent" ? "Assistant" : "User"}: ${m.content}`).join("\n");
      const input = `Facts known so far:\n${JSON.stringify(known)}\n\nThe question the user is answering now:\n${questionFor(asked, known)}\n\nConversation:\n${transcript}\n\nReturn the updated facts and the acknowledgement.`;
      const turn = await structured({
        model: MODELS.interview,
        effort: EFFORT.interview,
        instructions: INSTRUCTIONS,
        input,
        schema: Extract,
        name: "interview_extract",
      });
      if (!turn.answerUnderstood) throw new InputError("I couldn't understand that answer. Please try again in your own words. A short sentence is fine.");
      merged = mergeFacts(known, turn.facts);
      // Consent and the outcome are only ever taken from their own question, whatever else the user said.
      if (asked !== "emailRisk") merged.emailRiskAccepted = known.emailRiskAccepted;
      if (asked !== "outcome") merged.desiredOutcome = known.desiredOutcome;
      acknowledgement = turn.acknowledgement.trim();
    }
    // Typed text can hold a mistake the model passed on; drop a bad value so the form asks for it again.
    if (merged.postcode && validatePatch({ postcode: merged.postcode })) merged.postcode = known.postcode;
    if (merged.phone && validatePatch({ phone: merged.phone })) merged.phone = known.phone;
    if (merged.email && validatePatch({ email: merged.email })) merged.email = known.email;
  }

  const emailDeclined = asked === "emailRisk" && merged.emailRiskAccepted === false;
  // "Yesterday" only means something on the day it is said: turn relative dates into calendar dates now, in code (timeLimit.ts).
  const facts = normaliseFacts({ ...merged, events: resolveRelativeDates(merged.events, new Date()) });
  const target = nextTarget(facts, scope);
  const reply = joinReply(acknowledgement, questionFor(target, facts, { emailDeclined }));

  return {
    facts,
    reply,
    done: target === "done" && (scope === "nhs" ? missingRequired(facts) : missingForOnboarding(facts)).length === 0,
    missing: scope === "nhs" ? missingRequired(facts) : missingForOnboarding(facts),
    target,
    input: inputFor(target, facts, { emailDeclined }),
  };
}

export { OPENER } from "./chat";
