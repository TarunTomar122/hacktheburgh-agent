"use client";

import { countLimit, LIMITS, type LimitKind, type TimeLimitStatus } from "../../lib/agent/timeLimit";
import type { Profile } from "../../lib/profile";
import { Callout } from "../ui";

/** Colour follows the time left: green with plenty, yellow when close, red once past, blue when the dates cannot be counted. */
const TONE: Record<TimeLimitStatus, "ok" | "warn" | "danger" | "info"> = { within: "ok", close: "warn", outside: "danger", unclear: "info" };

const TITLE: Record<LimitKind, Record<TimeLimitStatus, string>> = {
  nhs: { within: "Time limit: you are in time", close: "Time limit: close", outside: "Time limit: this may be too late", unclear: "Time limit: could not be counted" },
  spso: { within: "Ombudsman time limit: you are in time", close: "Ombudsman time limit: close", outside: "Ombudsman time limit: this may be too late", unclear: "Ombudsman time limit: could not be counted" },
  claim: { within: "Time limit for a claim: you are in time", close: "Time limit for a claim: close", outside: "Time limit for a claim: this may be too late", unclear: "Time limit for a claim: could not be counted" },
};

/**
 * A time limit on the patient's path, counted in code from the dates they gave (lib/agent/timeLimit.ts): the NHS complaint (step 1),
 * the ombudsman (step 2) and a court claim (steps 3-4). Nothing is fetched; each rule links its source. The Yellow Card has no limit.
 */
export default function TimeLimitNote({ profile, kind, className }: { profile: Profile; kind: LimitKind; className?: string }) {
  const r = countLimit(kind, profile.facts.events.map((e) => e.date));
  const { rule, source } = LIMITS[kind];
  return (
    <Callout tone={TONE[r.status]} title={TITLE[kind][r.status]} className={className}>
      <p>
        {rule} {r.explanation}
      </p>
      <p className="mt-2 text-xs">
        Source:{" "}
        <a className="underline" href={source.url} target="_blank" rel="noreferrer">
          {source.name}
        </a>
        . This is information, not legal advice.
      </p>
    </Callout>
  );
}
