import { z } from "zod";
import { runEnquiries } from "../../../../lib/agent/enquiry";
import { MAX_ENQUIRIES } from "../../../../lib/agent/enquiryTypes";
import { CaseFacts } from "../../../../lib/agent/facts";

const Body = z.object({
  facts: CaseFacts,
  message: z.object({ subject: z.string().min(1), body: z.string().min(1) }),
  // The firm objects come from step 3's result; only the fields the runner reads are checked strictly.
  firms: z.array(z.object({ id: z.string(), name: z.string(), website: z.string().nullable(), enquiryUrl: z.string().nullable(), email: z.string().nullable() }).passthrough()).min(1).max(MAX_ENQUIRIES),
  legalAid: z.object({ verdict: z.enum(["likely", "unlikely", "unknown", "skipped"]), route: z.enum(["legal_aid", "no_win_no_fee"]) }).optional(),
});

/**
 * POST { facts, message, firms (max 3), legalAid? } -> newline-delimited JSON Step4Event (D45).
 * One tab per firm: find the enquiry form, fill it, stop before Send. The tabs stay open for the approvals.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", detail: parsed.error.message }, { status: 400 });
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- firms are full FirmFinding objects from step 3 (passthrough)
        await runEnquiries({ ...parsed.data, firms: parsed.data.firms as any }, { onEvent: send, keepOpen: true });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message.split("\n")[0] : String(e) });
      } finally {
        if (!cancelled) controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
