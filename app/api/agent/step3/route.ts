import { z } from "zod";
import { runStep3 } from "../../../../lib/agent/legalAid";
import { Funding, fundingMissing } from "../../../../lib/agent/legalAidTypes";

/**
 * POST { funding, facts? } -> newline-delimited JSON `Step3Event`s (lib/agent/legalAidTypes.ts, D36).
 * Runs several browser agents in parallel tabs (SLAB calculator, SLAB lawyer list, Law Society, firm websites),
 * shown live in the app's grid. Nothing is submitted anywhere. Ends with one "result" or "error" event.
 */
export async function POST(req: Request) {
  const parsed = z.object({ funding: Funding, facts: z.unknown().optional() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", detail: parsed.error.message }, { status: 400 });
  const missing = fundingMissing(parsed.data.funding);
  if (missing.length) return Response.json({ error: `Still needed: ${missing.join(", ")}` }, { status: 400 });

  const enc = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() {
      cancelled = true;
    },
    async start(controller) {
      const send = (o: unknown) => {
        if (!cancelled) controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      };
      try {
        await runStep3(parsed.data.funding, { onEvent: send, keepOpen: true });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message.split("\n")[0] : String(e) });
      } finally {
        if (!cancelled) controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
