import { z } from "zod";
import { Draft } from "../../../../lib/agent/draft";
import { CaseFacts, missingRequired } from "../../../../lib/agent/facts";
import { fillNhsComplaint } from "../../../../lib/agent/nhsLothian";

/**
 * POST { facts, draft } -> newline-delimited JSON events (see lib/agent/events.ts).
 * Opens a visible browser, fills the NHS Lothian form, and stops before submitting.
 * The last event has type "done" with status ready_to_submit | needs_input | incomplete | max_steps.
 */
export async function POST(req: Request) {
  const parsed = z.object({ facts: CaseFacts, draft: Draft }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", detail: parsed.error.message }, { status: 400 });
  if (missingRequired(parsed.data.facts).length || !parsed.data.draft.details.trim() || !parsed.data.draft.location.trim()) {
    return Response.json({ error: "Complete your profile and complaint draft before filling the form" }, { status: 400 });
  }

  const enc = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() { cancelled = true; },
    async start(controller) {
      const send = (o: unknown) => {
        if (!cancelled) controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      };
      try {
        await fillNhsComplaint(parsed.data.facts, parsed.data.draft, { onEvent: send, keepOpen: true });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        if (!cancelled) controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
