import { z } from "zod";
import { CaseFacts, missingRequired } from "../../../../lib/agent/facts";
import { runComplaint } from "../../../../lib/agent/complaintPlanner";
import { runDiscovery } from "../../../../lib/agent/discovery";
import { runComplaintAnywhere } from "../../../../lib/agent/complaintAnywhere";
import { runCompensationAnywhere } from "../../../../lib/agent/compensationAnywhere";
import { runEscalationAnywhere } from "../../../../lib/agent/escalationAnywhere";
import type { RouteMap } from "../../../../lib/agent/routeTypes";
import { Funding } from "../../../../lib/agent/legalAidTypes";
import { runPlanner } from "../../../../lib/agent/planner";
import { startRun, streamRun } from "../../../../lib/agent/runRegistry";

/**
 * POST { facts, funding?, flow? } -> newline-delimited JSON PlannerEvent (D47, D48).
 * The planner and its crew plan their own route: legal aid, firms, evidence, enquiry forms (never sent).
 * flow "complaint" (D65) runs the complaint crew instead: NHS Lothian's process, time limit, evidence, the draft and the form (never submitted).
 * The first event is {type:"run", runId}; answers to the crew's questions go to POST /api/agent/plan/answer.
 * The run lives on the server (lib/agent/runRegistry.ts): dropping this connection does not stop it. See ./attach, ./active, ./cancel.
 * `slot` ("<case id>:<screen>") makes a new run replace the one still going in the same slot.
 */
export async function POST(req: Request) {
  const parsed = z.object({ facts: CaseFacts, funding: Funding.partial().optional(), flow: z.enum(["compensation", "complaint", "discovery", "complaint_anywhere", "compensation_anywhere", "escalation_anywhere"]).optional(), route: z.any().optional(), slot: z.string().max(120).optional(), focus: z.enum(["complaint", "escalation", "compensation", "funding", "lawyers", "guideline", "advice", "records"]).optional(), progress: z.object({ complaintSent: z.boolean(), finalResponse: z.enum(["yes", "no", "unknown"]), complaintText: z.string().max(20000).optional(), providerReply: z.string().max(20000).optional() }).optional() }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request", detail: parsed.error.message }, { status: 400 });
  if ((parsed.data.flow === "complaint" || parsed.data.flow === "complaint_anywhere" || parsed.data.flow === "escalation_anywhere") && missingRequired(parsed.data.facts).length) {
    return Response.json({ error: "Complete your profile before making a complaint" }, { status: 400 });
  }
  // The run belongs to the server, not to this request: it carries on if the client goes away (navigation, reload,
  // a dropped connection) and stops only through POST /api/agent/plan/cancel or a restart of the same slot.
  // This response is the same stream as GET /api/agent/plan/attach, minus the framing.
  const d = parsed.data;
  const slot = d.slot ?? `anon:${d.flow ?? "compensation"}`;
  let run;
  try {
    run = await startRun(d.flow ?? "compensation", slot, (onEvent) => {
      if (d.flow === "discovery") return runDiscovery(d.facts, { onEvent, ...(d.focus && d.route ? { focus: d.focus, base: d.route as RouteMap } : {}) });
      if (d.flow === "compensation_anywhere" && d.route) return runCompensationAnywhere(d.facts, d.route as RouteMap, { onEvent, keepOpen: true });
      if (d.flow === "escalation_anywhere" && d.route) return runEscalationAnywhere(d.facts, d.route as RouteMap, { onEvent, keepOpen: true, progress: d.progress });
      if (d.flow === "complaint_anywhere" && d.route) return runComplaintAnywhere(d.facts, d.route as RouteMap, { onEvent, keepOpen: true });
      if (d.flow === "complaint") return runComplaint(d.facts, { onEvent, keepOpen: true });
      return runPlanner(d.facts, d.funding ?? {}, { onEvent, keepOpen: true });
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message.split("\n")[0] : String(e) }, { status: 500 });
  }
  return streamRun(run, false);
}
