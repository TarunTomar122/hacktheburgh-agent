"use client";

import { useEffect, useRef } from "react";
import { PERSONA_PICKER_ENABLED } from "../../lib/personas";
import { minutes, readResearchTime, writeResearchTime } from "./speedPref";
import { placeOf, useDemoAvailable } from "./useDemo";
import { CREW, type CrewId } from "../../lib/agent/plannerTypes";
import type { RouteKind, RouteMap } from "../../lib/agent/routeTypes";
import type { Profile } from "../../lib/profile";
import { Button } from "../ui";
import { DemoBar, DemoButton, Workspace, type CrewKit } from "./CaseRun";
import { CrewMark } from "./crew/Crew";
import StepStrip, { type Step } from "./crew/StepStrip";
import RouteMapCard from "./RouteMap";
import { usePlannerRun } from "./usePlannerRun";

/**
 * Discovery (night plan, "Elliot anywhere"): before any step, the crew works out live how the system works where the
 * patient's care happened, and finds the real pages and forms. Same crew screen as the other runs; the result is the
 * route map, which the later steps use.
 */

const ROLES: Partial<Record<CrewId, string>> = { elliot: "Leads the search", robin: "Finds the rules", iona: "Finds the guidance", nell: "Finds the money" };
const KIT: CrewKit = { workers: ["robin", "iona", "nell"], role: (id) => ROLES[id] ?? CREW[id].role };
const STEPS: Step[] = [
  { crew: ["robin"], title: "Find the rules", line: "Who to complain to, who checks it, how claims work" },
  { crew: ["iona"], title: "Find the guidance", line: "What doctors there are told to do" },
  { crew: ["nell"], title: "Find the money", line: "How help can be paid for" },
];

export default function DiscoveryRun({ profile, saved, onDone, onSkip }: { profile: Profile; saved?: RouteMap; onDone: (route: RouteMap, sample: boolean) => void; onSkip?: () => void }) {
  const { state, start, answer, replay, skip, pause } = usePlannerRun({ scope: "discovery", caseId: profile.createdAt });
  const done = useRef<string | null>(null);
  useEffect(() => {
    const r = state.discovery;
    if (state.status !== "done" || !r || done.current === r.runId) return;
    done.current = r.runId;
    if (!state.demo && state.startedAt) writeResearchTime(profile.createdAt, Date.now() - state.startedAt, "fast");
    onDone(r.route, state.demo);
  }, [state.status, state.discovery, state.demo, state.startedAt, onDone, profile.createdAt]);

  // Demo controls only when a recorded discovery run exists.
  const place = placeOf(profile);
  const hasDemo = useDemoAvailable("discovery", place);

  // The crew screen stays after the research is done: look back through what they did, and ask for more on any part.
  const live = state.status === "running" || state.says.length > 0;
  const more = (kind: RouteKind) => start(profile.facts, undefined, "discovery", state.route ?? saved, undefined, kind);
  // One row: the route map fills in on the left (3/4), one row per part, as soon as a quote checks on an official page;
  // what the crew did scrolls past on the right (1/4). The map is there from the start, every part saying "Not found yet".
  if (live) {
    const f = profile.facts as { region?: string | null; country?: string | null };
    const route: RouteMap = state.route ?? { runId: "", place: { country: f.country ?? "", region: f.region ?? "", city: "", hospital: "", careSetting: "unknown", why: "" }, system: "", summary: "", steps: [], foundAt: "" };
    return <Workspace state={state} onAnswer={answer} onSkip={skip} onPause={pause} onRetry={() => start(profile.facts, undefined, "discovery")} kit={KIT} main={<RouteMapCard route={route} compact={state.status === "running"} handoff={state.handoffs.find((h) => !h.outcome) ?? null} onRerun={state.status === "running" ? undefined : more} />} />;
  }
  if (saved && state.status !== "error") {
    const t = PERSONA_PICKER_ENABLED ? readResearchTime(profile.createdAt) : null;
    return (
      <>
        <RouteMapCard route={saved} onRerun={more} />
        {t && (
          <p data-testid="research-time" className="mx-auto mt-6 max-w-6xl text-[12px] text-muted">
            Test build: researched in {minutes(t.ms)}
          </p>
        )}
      </>
    );
  }
  const f = profile.facts;
  const where = [(f as { region?: string | null }).region, (f as { country?: string | null }).country].filter(Boolean).join(", ");
  return (
    <div className="mx-auto max-w-5xl py-4">
      <h1 className="display text-[44px] text-ink">How it works where you live</h1>
      <p className="mt-3 flex items-center gap-2 text-[15px] text-ink-2">
        <CrewMark id="elliot" size={28} /> First, the crew researches how complaints and claims work{where ? ` in ${where}` : ""}, from official sites. It takes about 10 minutes. Nothing is filled in or sent.
      </p>
      <div className="mt-12">
        <StepStrip steps={STEPS} />
      </div>
      <div className="mt-12 flex flex-col items-center gap-4">
        <Button onClick={() => start(profile.facts, undefined, "discovery")}>Start the research</Button>
        <p className="text-[13px] text-muted">
          <span className="text-teal">✓</span> Every fact quoted and checked <span className="mx-2 text-fade">·</span> <span className="text-teal">✓</span> Official sources first
        </p>
        {state.status === "error" && <p className="text-sm text-danger">{state.error}</p>}
      </div>
      {onSkip && (
        <p className="mt-10 text-center text-[13px]">
          <button className="text-muted hover:text-brand hover:underline" onClick={onSkip}>
            Skip for now
          </button>
        </p>
      )}
      {hasDemo && (
        <DemoBar>
          <DemoButton onClick={() => replay({ flow: "discovery", place })}>Play a recorded run, fast</DemoButton>
          <DemoButton onClick={() => replay({ flow: "discovery", toEnd: true, place })}>Jump to the result</DemoButton>
        </DemoBar>
      )}
    </div>
  );
}
