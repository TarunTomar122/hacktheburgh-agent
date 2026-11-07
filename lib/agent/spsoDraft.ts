import { z } from "zod";
import type { ChatMessage } from "./chat";
import type { Draft } from "./draft";
import type { CaseFacts } from "./facts";
import { EFFORT, MODELS, structured } from "./llm";
import { wordCount } from "./spsoAnswers";

const SpsoText = z.object({
  impact: z
    .string()
    .nullable()
    .describe("How this has affected the user, first person, from their own words only. null if they said nothing about any effect on them."),
  outcome: z.string().describe("What the user wants the ombudsman to achieve, first person, 20 to 60 words, only the things they asked for."),
});
export type SpsoText = z.infer<typeof SpsoText>;

const INSTRUCTIONS = `You write two short answers for the Scottish Public Services Ombudsman's complaint form, in the first person, on behalf of the patient.
Rules:
- Use ONLY what the facts and the conversation say. Never invent symptoms, losses, feelings, money, dates or demands.
- impact ("How has this affected you?"): what the user said about effects on them (pain, treatment, surgery, work, study, worry). Plain sentences. If they said nothing about any effect, return null; do not guess.
- outcome ("What would resolve the complaint for you?"): restate what they want in a full, polite sentence or two of 20 to 60 words. Do not add requests they did not make. Do not ask the ombudsman to "investigate"; say what NHS Lothian should do (for example explain, apologise).
- Plain words, no legal or medical jargon the user did not use, British spelling.`;

/** Writes the ombudsman's "how it affected you" and "what you want" from the onboarding facts, so the user is not asked again. */
export async function draftOmbudsman(facts: CaseFacts, draft: Draft, messages: ChatMessage[]): Promise<SpsoText> {
  const transcript = messages.map((m) => `${m.role === "agent" ? "Assistant" : "User"}: ${m.content}`).join("\n");
  const out = await structured({
    model: MODELS.draft,
    effort: EFFORT.draft,
    instructions: INSTRUCTIONS,
    input: `Facts:\n${JSON.stringify(facts, null, 2)}\n\nTheir complaint to NHS Lothian:\n${draft.details}\n\nWhat they want (from the complaint): ${draft.outcome}\n\nConversation:\n${transcript}`,
    schema: SpsoText,
    name: "ombudsman_text",
  });
  // The form needs at least 15 words for the outcome; code checks, not the model.
  if (wordCount(out.outcome) < 15) throw new Error("The outcome came back shorter than the form allows. Try again.");
  return { impact: out.impact?.trim() ? out.impact.trim() : null, outcome: out.outcome.trim() };
}
