import { z } from "zod";
import { CaseFacts, emptyFacts } from "../../../../lib/agent/facts";
import { interviewTurn } from "../../../../lib/agent/interview";

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(["agent", "user"]), content: z.string() })),
  facts: CaseFacts.optional(),
});

/** POST { messages, facts? } -> { facts, reply, done, missing } */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", detail: parsed.error.message }, { status: 400 });
  try {
    return Response.json(await interviewTurn(parsed.data.messages, parsed.data.facts ?? emptyFacts()));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
