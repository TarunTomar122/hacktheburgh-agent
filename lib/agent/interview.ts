import { z } from "zod";
import { EFFORT, MODELS, structured } from "./llm";
import { CaseFacts, emptyFacts, mergeFacts, missingRequired } from "./facts";

import type { ChatMessage } from "./chat";
export type { ChatMessage } from "./chat";

const Turn = z.object({
  facts: CaseFacts.describe("The full updated facts. Keep everything already known; add or correct from the latest answer."),
  reply: z.string().describe("What to say to the user next: one short question, or a brief wrap-up if done."),
  done: z.boolean().describe("True only when every required fact is known."),
});

const INSTRUCTIONS = `You are the intake assistant for someone who may have received poor medical care in Scotland.
Your job is to collect the facts needed to fill in an NHS Lothian complaint form, by chatting in simple, warm, plain words.

Rules:
- Order matters: after their first name, ask what happened and let them tell the story. Ask for last name and contact details AFTER the story, never before.
- Ask ONE question at a time. Keep it short. No jargon.
- Only record what the user actually said. Never guess or invent a fact. If unsure, leave it null.
- The user may give several facts in one answer: capture all of them.
- Build the timeline in "events" (oldest first) as you learn dates and what happened.
- Contact details (address, postcode, phone, email) can be asked together as one question.
- Be sensitive. The user may be hurt or worried. Do not give legal or medical advice.
- If they choose Email as their preferred contact, the NHS form shows this disclaimer: "I request NHS Lothian to contact me via email in relation to my enquiry. I understand and accept the risk that sending clinical information by an un-secured internet address involves the risk that the information can be diverted/sent to other parties/become lost and understand that NHS Lothian takes no responsibility for this." Explain it in one plain sentence and ask a clear yes/no. Set emailRiskAccepted true only for an explicit yes, false for an explicit no. Never assume consent. If they say no, offer Letter or Phone Call instead.
- Once every required fact is known, ask once whether they want to add anything about what they would like to happen (desiredOutcome), then wrap up.
- "done" is true only when all required facts are known AND desiredOutcome has been asked about.
Required facts: complainingFor, firstName, lastName, address, postcode, phone, email, preferredContact, incidentLocation, incidentSummary, at least one event with a date, and emailRiskAccepted if preferredContact is Email.`;

export type InterviewResult = {
  facts: CaseFacts;
  reply: string;
  done: boolean;
  missing: string[];
};

/** One turn of the intake chat. Pass the whole conversation so far (the agent's opener included). */
export async function interviewTurn(messages: ChatMessage[], known: CaseFacts = emptyFacts()): Promise<InterviewResult> {
  const transcript = messages.map((m) => `${m.role === "agent" ? "Assistant" : "User"}: ${m.content}`).join("\n");
  const input = `Facts known so far:\n${JSON.stringify(known)}\n\nConversation:\n${transcript}\n\nReturn the updated facts and the next thing to say.`;

  let turn = await structured({
    model: MODELS.interview,
    effort: EFFORT.interview,
    instructions: INSTRUCTIONS,
    input,
    schema: Turn,
    name: "interview_turn",
  });

  let facts = mergeFacts(known, turn.facts);
  let missing = missingRequired(facts);

  // The model says "done" too early sometimes. Code decides, not the model.
  if (turn.done && missing.length > 0) {
    turn = await structured({
      model: MODELS.interview,
      effort: EFFORT.interview,
      instructions: INSTRUCTIONS,
      input: `${input}\n\nYou said done, but these required facts are still missing: ${missing.join(", ")}. Ask for them.`,
      schema: Turn,
      name: "interview_turn",
    });
    facts = mergeFacts(facts, turn.facts);
    missing = missingRequired(facts);
  }

  return { facts, reply: turn.reply, done: turn.done && missing.length === 0, missing };
}

export { OPENER } from "./chat";
