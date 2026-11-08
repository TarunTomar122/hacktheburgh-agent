import { z } from "zod";
import { busyResponse, claimAgentRun } from "../../../../lib/agentLock";
import { Draft } from "../../../../lib/agent/draft";
import { CaseFacts, missingRequired } from "../../../../lib/agent/facts";
import { ExtraAnswers } from "../../../../lib/agent/extra";
import { fillSpsoComplaint } from "../../../../lib/agent/spso";
import { SpsoAnswers, spsoProblems } from "../../../../lib/agent/spsoAnswers";

/**
 * POST { facts, draft, answers } -> newline-delimited JSON events (see lib/agent/events.ts).
 * Opens a visible browser, fills the SPSO complaint form page by page, and stops at "Review and send".
 * It never presses Send. The last event has type "done" (ready_to_submit | needs_input | incomplete | max_steps).
 */
export async function POST(req: Request) {
  const parsed = z.object({ facts: CaseFacts, draft: Draft, answers: SpsoAnswers, extra: ExtraAnswers.optional() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", detail: parsed.error.message }, { status: 400 });
  const { facts, draft, answers, extra } = parsed.data;
  const problems = [...(missingRequired(facts).length ? ["Complete your profile first."] : []), ...spsoProblems(draft, answers)];
  if (problems.length) return Response.json({ error: problems.join(" ") }, { status: 400 });

  // One run at a time (lib/agentLock.ts). Released when the run ends or when the page stops listening (refresh, restart).
  const claim = claimAgentRun("filling the ombudsman's form");
  if ("busy" in claim) return busyResponse(claim.busy);
  const enc = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() { cancelled = true; claim.release(); },
    async start(controller) {
      const send = (o: unknown) => {
        if (!cancelled) controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      };
      try {
        await fillSpsoComplaint(facts, draft, answers, { onEvent: send, keepOpen: true, extra });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        claim.release();
        if (!cancelled) controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
