"use client";

import { useEffect, useRef, useState } from "react";
import { TRACKS, type TrackId, type TrackRecommendation } from "../../lib/agent/track";
import { setTrack, type Profile } from "../../lib/profile";
import { Button, cx } from "../ui";
import { CheckRow, FitRing } from "./scoreParts";
import { STEPS } from "./steps";

/**
 * After onboarding (D42): one recommended track with its fit % and the reasons, one button to continue,
 * and the other track underneath for anyone who wants it instead. Fit is how well the track matches what they
 * told us, never a chance of success.
 */
export default function TrackChoice({ profile, onChosen }: { profile: Profile; onChosen: (firstStep: number) => void }) {
  const rec = profile.track?.rec;
  const [error, setError] = useState<string | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (rec || asked.current) return;
    asked.current = true;
    fetch("/api/agent/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts: profile.facts }) })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error ?? "Could not work out a recommendation");
        setTrack({ rec: data as TrackRecommendation });
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [rec, profile.facts]);

  const choose = (t: TrackId) => {
    setTrack({ chosen: t });
    onChosen(TRACKS[t].steps[0]);
  };

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

  const best = rec.recommended;
  const other: TrackId = best === "complaint" ? "compensation" : "complaint";
  const steps = (t: TrackId) => STEPS.filter((s) => TRACKS[t].steps.includes(s.n));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="display text-[40px] text-ink">
          We suggest you <span className="text-brand">{TRACKS[best].title.toLowerCase()}</span>
        </h1>
        <p className="mt-4 max-w-2xl text-[15px] leading-6 text-ink-2">{TRACKS[best].what}</p>
      </div>

      <section className="rounded-card border border-brand/40 bg-white">
        <div className="flex items-center gap-6 border-b border-line-soft p-6">
          <FitRing fit={rec.tracks[best].fit} size={104} title="How well this track fits what you told us. Not a chance of success." />
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">What you can get</div>
            <p className="mt-1 text-[17px] leading-6 text-ink">{TRACKS[best].gets}</p>
            <p className="mt-2 text-xs text-muted">Fit is how well this matches what you told us. It is not a chance of winning.</p>
          </div>
        </div>
        <div className="grid gap-8 p-6 sm:grid-cols-[1fr_220px]">
          <div>
            <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.1em] text-muted">Why we suggest it</div>
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

      <section className="flex items-center gap-5 rounded-card bg-subtle p-5">
        <FitRing fit={rec.tracks[other].fit} size={56} title="How well this track fits what you told us. Not a chance of success." />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-medium text-ink">Or: {TRACKS[other].title.toLowerCase()}</div>
          <p className="mt-0.5 text-[13px] leading-5 text-ink-2">{TRACKS[other].gets}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => choose(other)}>
          Choose this instead
        </Button>
      </section>
    </div>
  );
}
