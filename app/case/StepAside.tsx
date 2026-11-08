"use client";

import { TRACKS } from "../../lib/agent/track";
import type { Profile } from "../../lib/profile";
import { Eyebrow } from "../ui";
import { milestones } from "./progress";
import { STEPS } from "./steps";
import { Tick } from "./TrackBar";
import { StepEffort } from "./insights";

/** The right-hand column of a step page: what this step does, its checklist, and what the path gets you. Sticky, compact. */
export default function StepAside({ profile, step }: { profile: Profile; step: number }) {
  const s = STEPS.find((x) => x.n === step);
  const chosen = profile.track?.chosen;
  if (!s) return null;
  const mine = milestones(profile).filter((m) => m.step === step);
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20 space-y-6 rounded-card bg-subtle p-5">
        <div>
          <Eyebrow>This step</Eyebrow>
          <p className="mt-1.5 text-[13px] leading-5 text-ink-2">{s.help}</p>
        </div>
        {mine.length > 0 && (
          <div>
            <Eyebrow>Checklist</Eyebrow>
            <ul className="mt-2 space-y-1.5">
              {mine.map((m) => (
                <li key={m.label} className={`flex gap-2 text-[13px] leading-5 ${m.done ? "text-ink" : "text-muted"}`}>
                  <Tick done={m.done} />
                  {m.label}
                </li>
              ))}
            </ul>
          </div>
        )}
        <StepEffort profile={profile} step={step} />
        {chosen && (
          <div>
            <Eyebrow>What this path can get you</Eyebrow>
            <p className="mt-1.5 text-[13px] leading-5 text-ink-2">{TRACKS[chosen].gets}</p>
          </div>
        )}
      </div>
    </aside>
  );
}
