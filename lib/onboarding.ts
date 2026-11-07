import type { Answer, Profile } from "./profile";

type Question = { id: string; label: string; question: string };

// MOCK: fixed follow-ups. To be replaced by an OpenAI agent that decides what to ask next.
const QUESTIONS: Question[] = [
  { id: "when", label: "When it happened", question: "Roughly when did this happen? An approximate date is fine." },
  { id: "where", label: "Where I was treated", question: "Where were you treated? For example a hospital, GP surgery or clinic." },
  { id: "since", label: "What has happened since", question: "What has happened to your health since then?" },
  { id: "outcome", label: "What I would like", question: "What would you like to come out of this? For example an explanation, an apology, or changes to how things are done." },
  { id: "contact", label: "How to contact me", question: "How would you prefer to be contacted: email, phone or post?" },
];

export type NextQuestion = { done: false; id: string; label: string; question: string } | { done: true };

/** Decide the next follow-up question from what we know so far. */
export async function getNextQuestion(p: Pick<Profile, "name" | "story"> & { followUps: Answer[] }): Promise<NextQuestion> {
  await new Promise((r) => setTimeout(r, 700)); // pretend to think
  const next = QUESTIONS[p.followUps.length];
  return next ? { done: false, ...next } : { done: true };
}
