import { z } from "zod";
import { CaseFacts, emptyFacts } from "../../../../lib/agent/facts";
import { InputError, interviewTurn } from "../../../../lib/agent/interview";

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["agent", "user"]), content: z.string() })),
  facts: CaseFacts.optional(),
  // What a form, button or checklist gave for the open question. When present, no model call is made.
  answer: z.record(z.string(), z.union([z.string(), z.array(z.string()), z.boolean()])).optional(),
});

/** POST { messages, facts?, answer? } -> { facts, reply, done, missing, target, input } */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", detail: parsed.error.message }, { status: 400 });
  try {
    return Response.json(await interviewTurn(parsed.data.messages, parsed.data.facts ?? emptyFacts(), parsed.data.answer));
  } catch (e) {
    if (e instanceof InputError) return Response.json({ error: e.message }, { status: 400 });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
