import { z } from "zod";
import { Draft } from "../../../../lib/agent/draft";
import { CaseFacts } from "../../../../lib/agent/facts";
import { draftOmbudsman } from "../../../../lib/agent/spsoDraft";

const Body = z.object({
  facts: CaseFacts,
  draft: Draft,
  messages: z.array(z.object({ role: z.enum(["agent", "user"]), content: z.string() })),
});

/** POST { facts, draft, messages } -> { impact: string | null, outcome }. impact is null when the user never said how it affected them; the UI then asks that one thing. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", detail: parsed.error.message }, { status: 400 });
  try {
    return Response.json(await draftOmbudsman(parsed.data.facts, parsed.data.draft, parsed.data.messages));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
