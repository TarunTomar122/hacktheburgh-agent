import { z } from "zod";
import { CaseFacts, missingForOnboarding } from "../../../../lib/agent/facts";
import { ExtraAnswers } from "../../../../lib/agent/extra";
import { fillYellowCard } from "../../../../lib/agent/yellowCard";
import { YellowCardAnswers, yellowCardProblems } from "../../../../lib/agent/yellowCardAnswers";

/**
 * POST { facts, answers } -> newline-delimited JSON events (see lib/agent/events.ts).
 * Step 6 (proposed): opens a browser, fills the MHRA Yellow Card report page by page, and stops before it is sent.
 * It never registers, sets a password or submits. The last event has type "done".
 */
export async function POST(req: Request) {
  const parsed = z.object({ facts: CaseFacts, answers: YellowCardAnswers, extra: ExtraAnswers.optional() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", detail: parsed.error.message }, { status: 400 });
  const { facts, answers, extra } = parsed.data;
  const problems = [...(missingForOnboarding(facts).length ? ["Complete your profile first."] : []), ...yellowCardProblems(answers)];
  if (problems.length) return Response.json({ error: problems.join(" ") }, { status: 400 });

  const enc = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream({
    cancel() { cancelled = true; },
    async start(controller) {
      const send = (o: unknown) => {
        if (!cancelled) controller.enqueue(enc.encode(JSON.stringify(o) + "\n"));
      };
      try {
        await fillYellowCard(facts, answers, { onEvent: send, keepOpen: true, extra });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        if (!cancelled) controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
