"use client";

import { countTimeLimit, TIME_LIMIT_SOURCE, type TimeLimitStatus } from "../../lib/agent/timeLimit";
import type { Profile } from "../../lib/profile";
import { Callout } from "../ui";

const LOOK: Record<TimeLimitStatus, { tone: "ok" | "warn" | "danger" | "info"; title: string }> = {
  within: { tone: "ok", title: "Time limit: you are in time" },
  close: { tone: "warn", title: "Time limit: close" },
  outside: { tone: "danger", title: "Time limit: this may be too late" },
  unclear: { tone: "info", title: "Time limit: could not be counted" },
};

/**
 * Step 1: where the patient stands against NHS Scotland's complaint time limit, counted in code from the dates they gave
 * (lib/agent/timeLimit.ts). Nothing is fetched: the rule is the one Citizens Advice Scotland states, linked as the source.
 */
export default function TimeLimitNote({ profile }: { profile: Profile }) {
  const r = countTimeLimit(profile.facts.events.map((e) => e.date));
  const look = LOOK[r.status];
  return (
    <Callout tone={look.tone} title={look.title}>
      <p>
        Complaints to the NHS in Scotland should normally be made within 6 months, and no later than 12 months after what happened. {r.explanation}
      </p>
      <p className="mt-2 text-xs">
        Source:{" "}
        <a className="underline" href={TIME_LIMIT_SOURCE} target="_blank" rel="noreferrer">
          Citizens Advice Scotland
        </a>
        . This is information, not legal advice.
      </p>
    </Callout>
  );
}
