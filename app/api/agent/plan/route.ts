import { z } from "zod";
import { busyResponse, claimAgentRun } from "../../../../lib/agentLock";
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
  // One run at a time (lib/agentLock.ts). Released when the run ends or when the page stops listening (refresh, restart).
  const claim = claimAgentRun(parsed.data.flow === "complaint" ? "preparing your complaint" : "preparing your case");
  if ("busy" in claim) return busyResponse(claim.busy);
  const enc = new TextEncoder();
  let closed = false;
  let ping: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream({
    cancel() {
      closed = true; claim.release();
      clearInterval(ping);
    },
    async start(controller) {
      const send = (o: unknown) => {
        if (!closed) controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      };
      // Keep the connection alive while the crew waits for the user's answer.
      ping = setInterval(() => send({ type: "ping" }), 15000);
      try {
        if (parsed.data.flow === "complaint") await runComplaint(parsed.data.facts, { onEvent: send, keepOpen: true });
        else await runPlanner(parsed.data.facts, parsed.data.funding ?? {}, { onEvent: send, keepOpen: true });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message.split("\n")[0] : String(e) });
      } finally {
        claim.release();
        clearInterval(ping);
        // Approval can still log through this callback after the response ends.
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
