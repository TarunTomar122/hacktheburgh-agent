import { z } from "zod";
import { CaseFacts, missingRequired } from "../../../../lib/agent/facts";
import { runComplaint } from "../../../../lib/agent/complaintPlanner";
import { Funding } from "../../../../lib/agent/legalAidTypes";
import { runPlanner } from "../../../../lib/agent/planner";

/**
 * POST { facts, funding?, flow? } -> newline-delimited JSON PlannerEvent (D47, D48).
 * The planner and its crew plan their own route: legal aid, firms, evidence, enquiry forms (never sent).
 * flow "complaint" (D65) runs the complaint crew instead: NHS Lothian's process, time limit, evidence, the draft and the form (never submitted).
 * The first event is {type:"run", runId}; answers to the crew's questions go to POST /api/agent/plan/answer.
 */
export async function POST(req: Request) {
  const parsed = z.object({ facts: CaseFacts, funding: Funding.partial().optional(), flow: z.enum(["compensation", "complaint"]).optional() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", detail: parsed.error.message }, { status: 400 });
  if (parsed.data.flow === "complaint" && missingRequired(parsed.data.facts).length) {
    return Response.json({ error: "Complete your profile before making a complaint" }, { status: 400 });
  }
  const enc = new TextEncoder();
  let cancelled = false;
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    cancel() {
      cancelled = true;
      clearInterval(ping);
    },
    async start(controller) {
      const send = (o: unknown) => {
        if (!cancelled) controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      };
      // Keep the connection alive while the crew waits for the user's answer.
      ping = setInterval(() => send({ type: "ping" }), 15000);
      try {
        if (parsed.data.flow === "complaint") await runComplaint(parsed.data.facts, { onEvent: send, keepOpen: true });
        else await runPlanner(parsed.data.facts, parsed.data.funding ?? {}, { onEvent: send, keepOpen: true });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message.split("\n")[0] : String(e) });
      } finally {
        clearInterval(ping);
        if (!cancelled) controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
