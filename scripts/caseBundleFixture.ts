import { readFileSync } from "node:fs";
import { EMPTY_FUNDING } from "../lib/agent/legalAidTypes";
import type { PlannerResult } from "../lib/agent/plannerTypes";
import type { RouteMap } from "../lib/agent/routeTypes";
import type { Profile } from "../lib/profile";

/**
 * A realistic fictional Ailsa Reid case for the case-bundle checks, built from what real runs saved: her persona facts, the route map
 * from the discovery run of 2026-11-08, and the planner result (funding, firms, evidence, enquiries) of the step 3 run that morning.
 */
export function ailsaProfile(): Profile {
  const facts = JSON.parse(readFileSync("scripts/personas/scotland.json", "utf8"));
  const map = JSON.parse(readFileSync(".runs/discovery-2026-11-08T08-19-55-240Z-b0sc/route.json", "utf8")) as RouteMap;
  let result: PlannerResult | null = null;
  for (const l of readFileSync("demo/step3-2026-11-08T08-20-36-382Z-5jza/events.ndjson", "utf8").split("\n")) {
    try {
      const e = JSON.parse(l).e;
      if (e?.type === "planner_result") result = e.result as PlannerResult;
    } catch {
      // not a JSON line
    }
  }
  if (!result) throw new Error("no planner_result in the saved run");
  const now = "2026-11-08T09:00:00.000Z";
  return {
    facts,
    messages: [],
    draft: null,
    route: { map, sample: false },
    legalAid: { funding: result.funding ?? EMPTY_FUNDING, result, selected: result.shortlist },
    enquiry: { message: result.message, outcomes: result.enquiries, runId: result.runId, sample: false },
    caseRun: { runId: result.runId ?? "", says: result.says, plan: result.plan, evidence: result.evidence, asks: result.asks, recoveries: result.recoveries, turns: result.turns, durationMs: 0, finishedAt: now },
    createdAt: now,
    updatedAt: now,
  };
}
