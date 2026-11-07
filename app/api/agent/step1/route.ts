import { z } from "zod";
import { Draft } from "../../../../lib/agent/draft";
import { CaseFacts } from "../../../../lib/agent/facts";
import { fillNhsComplaint } from "../../../../lib/agent/nhsLothian";

/**
 * POST { facts, draft } -> newline-delimited JSON events (see lib/agent/events.ts).
 * Opens a visible browser, fills the NHS Lothian form, and stops before submitting.
 * The last event has type "done" with status ready_to_submit | needs_input | incomplete | max_steps.
 */
export async function POST(req: Request) {
  const parsed = z.object({ facts: CaseFacts, draft: Draft }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", detail: parsed.error.message }, { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: unknown) => controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      try {
        await fillNhsComplaint(parsed.data.facts, parsed.data.draft, { onEvent: send });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
