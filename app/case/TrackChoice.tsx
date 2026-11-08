"use client";

import { useEffect, useRef, useState } from "react";
import { isCurrentRecommendation, TRACK_IDS, TRACKS, type TrackId, type TrackRecommendation } from "../../lib/agent/track";
import { setTrack, type Profile } from "../../lib/profile";
import { Button, cx } from "../ui";
import { CheckRow, FitRing } from "./scoreParts";
import { emailOnlyGoals } from "../../lib/agent/complaintEmail";
import { STEPS } from "./steps";

/**
 * After onboarding (D42): one recommended track with its fit % and the reasons, one button to continue,
 * and the other track underneath for anyone who wants it instead. Fit is how well the track matches what they
 * told us, never a chance of success.
 */
export default function TrackChoice({ profile, onChosen }: { profile: Profile; onChosen: (firstStep: number) => void }) {
  // A recommendation saved before the Yellow Card track has no score for it: ask again.
  const saved = profile.track?.rec;
  const rec = isCurrentRecommendation(saved) ? saved : undefined;
  const simple = emailOnlyGoals(profile.facts.desiredOutcome); // never true when a Yellow Card box is ticked: it only allows explanation/apology
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (simple || rec || asked.current) return;
    asked.current = true;
    fetch("/api/agent/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts: profile.facts }) })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Could not work out a recommendation");
        setTrack({ rec: data as TrackRecommendation });
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [rec, profile.facts, simple]);

  const choose = (t: TrackId) => {
    setTrack({ chosen: t });
    onChosen(TRACKS[t].steps[0]);
  };

  if (simple) return <section className="space-y-6">
    <h1 className="display text-[40px]">Start by asking for a response</h1>
    <p className="text-ink-2">You asked for an explanation, an apology, or both. Elliot can prepare one editable email from your story for the hospital or clinic involved.</p>
    <p className="text-sm text-muted">You check the recipient and send it yourself. It may take follow-up; no complaint form is filled and no ombudsman step starts automatically.</p>
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => { setTrack({ chosen: "complaint", complaintMode: "email" }); onChosen(1); }}>Ask for an explanation or apology</Button>
      <Button variant="secondary" onClick={() => choose("complaint")}>Make a formal complaint instead</Button>
      <Button variant="ghost" onClick={() => choose("compensation")}>Explore compensation</Button>
    </div>
  </section>;

  if (!rec) {
    return (
      <div className="py-24 text-center">
        {error ? (
          <p className="text-sm text-danger">{error}</p>
        ) : (
          <>
            <div className="mx-auto mb-5 size-8 animate-spin rounded-full border-2 border-line border-t-brand" aria-hidden />
            <p className="text-[15px] text-ink-2">Reading your answers to suggest the best way forward…</p>
          </>
        )}
      </div>
    );
  }

  // D80: if they ticked several paths in onboarding, suggest the best-fitting of those and offer only the rest of them.
  const wanted = profile.track?.wanted?.length ? profile.track.wanted : null;
  const pool = wanted ?? TRACK_IDS;
  const best = wanted ? pool.reduce((b, t) => (rec.tracks[t].fit > rec.tracks[b].fit ? t : b), pool[0]) : rec.recommended;
  const others = pool.filter((t) => t !== best);
  const steps = (t: TrackId) => STEPS.filter((s) => TRACKS[t].steps.includes(s.n));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="display text-[40px] text-ink">
          We suggest you <span className="text-brand">{TRACKS[best].title.toLowerCase()}</span>
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-6 text-ink-2">{TRACKS[best].what}</p>
        {wanted && (
          <p className="mt-2 max-w-2xl text-[13px] leading-5 text-muted">
            You asked for help with {wanted.length} things. We work on one at a time: start with this one, and switch to the others whenever you like from your profile.
          </p>
        )}
      </div>

      <section className="rounded-card border border-brand/40 bg-white">
        <div className="flex items-center gap-6 border-b border-line-soft p-6">
          <FitRing fit={rec.tracks[best].fit} size={104} title="How well this track fits what you told Elliot. Not a chance of success." />
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">What you can get</div>
            <p className="mt-1 text-[17px] leading-6 text-ink">{TRACKS[best].gets}</p>
            <p className="mt-2 text-xs text-muted">Fit is how well this matches what you told Elliot. It is not a chance of winning.</p>
          </div>
        </div>
        <div className="grid gap-8 p-6 sm:grid-cols-[1fr_220px]">
          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted">Why Elliot suggests it</div>
            <ul>
              {rec.tracks[best].reasons.map((r) => (
                <CheckRow key={r.label} row={r} />
              ))}
            </ul>
          </div>
          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted">What happens next</div>
            <ol className="space-y-2">
              {steps(best).map((s, i) => (
                <li key={s.n} className="flex gap-3 text-[14px] leading-5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-[4px] bg-brand-soft text-[11px] font-medium text-brand">{i + 1}</span>
                  <span className={cx(s.state === "soon" ? "text-muted" : "text-ink")}>
                    {s.title}
                    {s.state === "soon" && <span className="block text-xs text-faint">Coming soon</span>}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className="border-t border-line-soft p-6">
          <Button onClick={() => choose(best)}>Continue: {TRACKS[best].title.toLowerCase()}</Button>
        </div>
      </section>

      {others.map((other) => (
        <section key={other} className="flex items-center gap-5 rounded-card bg-subtle p-5">
          {/* A path they ticked themselves gets no score: the NHS complaint stores no outcome sentence (D76), so its fit would read 0%. */}
          {!wanted && <FitRing fit={rec.tracks[other].fit} size={56} title="How well this track fits what you told Elliot. Not a chance of success." />}
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-medium text-ink">{wanted ? "Also: " : "Or: "}{TRACKS[other].title.toLowerCase()}</div>
            {wanted && <p className="text-xs text-teal">You ticked this too.</p>}
            <p className="mt-0.5 text-[13px] leading-5 text-ink-2">{TRACKS[other].gets}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => choose(other)}>
            {wanted ? "Start with this instead" : "Choose this instead"}
          </Button>
        </section>
      ))}
    </div>
  );
}
