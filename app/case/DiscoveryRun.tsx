"use client";

import { useEffect, useRef } from "react";
import { placeOf, useDemoAvailable } from "./useDemo";
import { CREW, type CrewId } from "../../lib/agent/plannerTypes";
import type { RouteMap } from "../../lib/agent/routeTypes";
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

const ROLES: Partial<Record<CrewId, string>> = { elliot: "Leads the search", robin: "Finds the rules", iona: "Finds the guidance", nell: "Finds the money", kit: "Finds the forms" };
const KIT: CrewKit = { workers: ["robin", "iona", "nell", "kit"], role: (id) => ROLES[id] ?? CREW[id].role };
const STEPS: Step[] = [
  { crew: ["robin"], title: "Find the rules", line: "Who to complain to, who checks it, how claims work" },
  { crew: ["iona"], title: "Find the guidance", line: "What doctors there are told to do" },
  { crew: ["nell"], title: "Find the money", line: "How help can be paid for" },
  { crew: ["kit"], title: "Find the forms", line: "The real online forms you will need" },
];

export default function DiscoveryRun({ profile, saved, onDone, onSkip }: { profile: Profile; saved?: RouteMap; onDone: (route: RouteMap, sample: boolean) => void; onSkip?: () => void }) {
  const { state, start, answer, replay, skip } = usePlannerRun();
  const done = useRef<string | null>(null);
  useEffect(() => {
    const r = state.discovery;
    if (state.status !== "done" || !r || done.current === r.runId) return;
    done.current = r.runId;
    onDone(r.route, state.demo);
  }, [state.status, state.discovery, state.demo, onDone]);

  // Demo controls only when a recorded discovery run exists.
  const place = placeOf(profile);
  const hasDemo = useDemoAvailable("discovery", place);

  const live = state.status === "running" || (state.status === "error" && state.says.length > 0);
  // The route map fills in beside the work, one row per part, as soon as a quote checks on an official page.
  if (live)
    return (
      <div className="space-y-6">
        <Workspace state={state} onAnswer={answer} onSkip={skip} onRetry={() => start(profile.facts, undefined, "discovery")} kit={KIT} />
        {state.route && (
          <div className="mx-auto max-w-6xl">
            <RouteMapCard route={state.route} compact />
          </div>
        )}
      </div>
    );
  if (saved && state.status !== "error") return <RouteMapCard route={saved} />;
  const f = profile.facts;
  const where = [(f as { region?: string | null }).region, (f as { country?: string | null }).country].filter(Boolean).join(", ");
  return (
    <div className="mx-auto max-w-5xl py-4">
      <h1 className="display text-[44px] text-ink">How it works where you live</h1>
      <p className="mt-3 flex items-center gap-2 text-[15px] text-ink-2">
        <CrewMark id="elliot" size={28} /> The crew works it out live, from official sites{where ? `, for ${where}` : ""}. Nothing is filled in or sent.
      </p>
      <div className="mt-12">
        <StepStrip steps={STEPS} />
      </div>
      <div className="mt-12 flex flex-col items-center gap-4">
        <Button onClick={() => start(profile.facts, undefined, "discovery")}>Work it out</Button>
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
