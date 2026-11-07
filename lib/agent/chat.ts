// Client-safe chat types (no OpenAI imports) so UI code can use them.
export type ChatMessage = { role: "agent" | "user"; content: string };

export const OPENER: ChatMessage = {
  role: "agent",
  content: "Hello, I'm here to help you work out what went wrong with your care and what to do next. First, what should I call you?",
};
