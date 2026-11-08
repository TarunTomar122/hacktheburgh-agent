"use client";

import { useState } from "react";
import { ROUTE_KINDS, trustOf, type RouteMap as Route, type RouteStep } from "../../lib/agent/routeTypes";
import { cx } from "../ui";
import { CrewMark } from "./crew/Crew";

/**
 * "How it works where you live" (night plan, "Elliot anywhere"): the route the crew worked out live, one quiet row per
 * part, sources one click away. Confidence is said in words, never by colour alone.
 */

const HOW: Record<RouteStep["how"], string> = {
  online_form: "Online form",
  email: "By email",
  post: "By post",
  phone: "By phone",
  login_required: "Needs a login",
  court: "Through the courts",
  unknown: "",
};

const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};

export default function RouteMapCard({ route, compact, handoff }: { route: Route; compact?: boolean; handoff?: { url: string } | null }) {
  const where = [route.place.region, route.place.country].filter(Boolean).join(", ") || "your place";
  if (route.steps.some((s) => s.takeaway)) return <Takeaways route={route} where={where} handoff={handoff} />;
  return (
    <section aria-label="How it works where you live" className="rounded-card border border-line bg-white">
      <header className="border-b border-line-soft px-6 py-5">
        <p className="text-[12px] text-muted">How it works where you live</p>
        <h2 className="display mt-1 text-[26px] leading-tight text-ink">{where}</h2>
        {!compact && route.summary && <p className="mt-2 max-w-3xl font-serif text-[16px] leading-7 text-ink-2">{route.summary}</p>}
      </header>
      <ol className="divide-y divide-line-soft">
        {ROUTE_KINDS.map((k) => {
          const s = route.steps.find((x) => x.kind === k.kind);
          const ask = !!(handoff && s?.url && host(s.url) === host(handoff.url));
          return <Row key={k.kind} label={k.label} step={s} crew={s?.by ?? k.crew} compact={compact} ask={ask} />;
        })}
      </ol>
    </section>
  );
}

function Row({ label, step, crew, compact, ask }: { label: string; step?: RouteStep; crew: RouteStep["by"]; compact?: boolean; ask?: boolean }) {
  const [open, setOpen] = useState(false);
  // Nothing checked on an official page: the claimed body stays out of the headline (Cursor review).
  if (!step || step.confidence === "unconfirmed")
    return (
      <li className="flex items-start gap-4 px-6 py-3.5">
        <CrewMark id={crew} size={32} className="opacity-40 grayscale" />
        <span className="w-36 shrink-0 text-[13px] leading-6 text-muted">{label}</span>
        <span className="min-w-0 flex-1 text-[14px] leading-6 text-muted">{step ? `Not confirmed yet${step.body ? ` (maybe ${step.body})` : ""}` : "Not found yet"}</span>
      </li>
    );
  const checked = step.sources.filter((x) => x.checked).length;
  const conditions = [step.requires?.length ? `First: ${step.requires.join("; ")}` : "", step.appliesIf ? `Only if: ${step.appliesIf}` : "", step.alternatives?.length ? `Or: ${step.alternatives.join("; ")}` : ""].filter(Boolean);
  return (
    <li className="px-6 py-4">
      <div className="flex items-start gap-4">
        <CrewMark id={crew} size={32} />
        <span className="w-36 shrink-0 text-[13px] leading-6 text-muted">{label}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium leading-6 text-ink">{step.body}</p>
          {!compact && <p className="mt-1 text-[14px] leading-6 text-ink-2">{step.what}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
            {HOW[step.how] && <Chip tone={step.how === "online_form" ? "ok" : step.how === "login_required" ? "warn" : "plain"}>{HOW[step.how]}</Chip>}
            {step.deadline && step.deadline.length <= 40 && <Chip tone={step.deadlineCheck === "sources_differ" ? "warn" : "plain"}>{step.deadline}{step.deadlineCheck === "one_site" ? " · one source" : step.deadlineCheck === "sources_differ" ? " · sources differ" : ""}</Chip>}
            {ask && (
              <button
                className="rounded-full bg-amber px-2 py-0.5 text-[12px] font-medium text-white"
                onClick={() => {
                  window.dispatchEvent(new Event("live-open"));
                  window.dispatchEvent(new CustomEvent("live-handoff-open"));
                }}
              >
                Needs you
              </button>
            )}
            {step.handedOff && <Chip tone="ok">You signed in here</Chip>}
            {step.wall && !ask && <Chip tone="warn">{step.wall}</Chip>}
            {step.url && (
              <a className="text-brand hover:underline" href={step.url} target="_blank" rel="noreferrer">
                {host(step.url)} ↗
              </a>
            )}
            <button className="text-muted hover:text-brand hover:underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? "Less" : `Details · ${step.confidence === "confirmed" ? "confirmed" : "one official source"} · ${checked}/${step.sources.length} quotes checked`}
            </button>
          </div>
          {open && (
            <div className="rise mt-3 space-y-3">
              {step.deadline && step.deadline.length > 40 && <p className="text-[13px] leading-5 text-ink-2">Time limit: {step.deadline}{step.deadlineCheck === "one_site" ? " (one official source: confirm with the body)" : ""}</p>}
              {step.deadlineCheck === "sources_differ" && <p className="text-[13px] leading-5 text-amber">Official pages give different periods ({[step.deadline, ...(step.deadlineOthers ?? [])].join(" / ")}). Check with the body before relying on it.</p>}
              {step.points?.length ? (
                <ul className="list-disc space-y-0.5 pl-5 text-[13px] leading-5 text-ink-2">
                  {step.points.map((pt) => (
                    <li key={pt}>{pt}</li>
                  ))}
                </ul>
              ) : null}
              {conditions.length > 0 && <p className="text-[13px] leading-5 text-muted">{conditions.join(" · ")}</p>}
              <ul className="space-y-2">
                {step.sources.map((src) => (
                  <li key={src.url + src.quote} className="border-l-2 border-line pl-3">
                    <p className={cx("font-serif text-[15px] leading-6", src.checked ? "text-ink" : "text-muted line-through decoration-faint/60")}>&ldquo;{src.quote}&rdquo;</p>
                    <p className="mt-0.5 text-[12px] text-muted">
                      <a className="text-brand hover:underline" href={src.url} target="_blank" rel="noreferrer">
                        {src.publisher || host(src.url)} ↗
                      </a>
                      {src.official ? " · official" : ""} · {src.checked ? "found on the page" : "not found on the page, not counted"}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Chip({ tone, children }: { tone: "ok" | "warn" | "plain"; children: React.ReactNode }) {
  return <span className={cx("rounded-[4px] px-1.5 py-0.5", tone === "ok" ? "bg-teal-soft text-teal" : tone === "warn" ? "bg-amber-soft text-amber" : "bg-subtle text-ink-2")}>{children}</span>;
}

/** What to know: one plain line per part the crew could back, the reason and the exact sources one click away. */
function Takeaways({ route, where, handoff }: { route: Route; where: string; handoff?: { url: string } | null }) {
  const found = ROUTE_KINDS.map((k) => ({ k, s: route.steps.find((x) => x.kind === k.kind) })).filter((x): x is { k: (typeof ROUTE_KINDS)[number]; s: RouteStep } => !!x.s?.takeaway && x.s.confidence !== "unconfirmed");
  const missing = ROUTE_KINDS.filter((k) => !found.some((f) => f.k.kind === k.kind));
  return (
    <section aria-label="How it works where you live" className="rounded-card border border-line bg-white">
      <header className="border-b border-line-soft px-6 py-5">
        <p className="text-[12px] text-muted">How it works where you live</p>
        <h2 className="display mt-1 text-[26px] leading-tight text-ink">{where}</h2>
      </header>
      <ol className="divide-y divide-line-soft">
        {found.map(({ k, s }) => (
          <Takeaway key={k.kind} label={k.label} step={s} ask={!!(handoff && s.url && host(s.url) === host(handoff.url))} />
        ))}
      </ol>
      {missing.length > 0 && (
        <p data-testid="not-found" className="border-t border-line-soft px-6 py-4 text-[13px] leading-6 text-muted">
          Not found in this research: {missing.map((m) => m.label).join(" · ")}
        </p>
      )}
    </section>
  );
}

function Takeaway({ label, step, ask }: { label: string; step: RouteStep; ask: boolean }) {
  const [open, setOpen] = useState(false);
  const t = step.takeaway!;
  const trust = trustOf(step);
  const tone = trust.label === "Solid" ? "ok" : trust.label === "Likely" ? "plain" : "warn";
  const checked = step.sources.filter((x) => x.checked);
  return (
    <li>
      <button className="flex w-full items-start gap-4 px-6 py-4 text-left hover:bg-subtle/40" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="w-36 shrink-0 text-[13px] leading-6 text-muted">{label}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium leading-6 text-ink">{t.headline}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
            <Chip tone={tone}>{trust.label}</Chip>
            {ask && <span className="rounded-full bg-amber px-2 py-0.5 font-medium text-white">Needs you</span>}
            {step.wall && !ask && <Chip tone="warn">{step.wall}</Chip>}
          </span>
        </span>
        <span aria-hidden className="mt-1 text-[13px] text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="rise space-y-3 px-6 pb-5 pl-[calc(1.5rem+9rem+1rem)]">
          <p className="text-[14px] leading-6 text-ink-2">{t.why}</p>
          <p className="text-[12px] leading-5 text-muted">{trust.why}</p>
          {step.deadlineCheck === "sources_differ" && <p className="text-[13px] leading-5 text-amber">Official pages give different periods ({[step.deadline, ...(step.deadlineOthers ?? [])].join(" / ")}). Check with the body before relying on it.</p>}
          <ul className="space-y-2">
            {checked.map((src) => (
              <li key={src.url + src.quote} className="border-l-2 border-line pl-3">
                <p className="font-serif text-[15px] leading-6 text-ink">&ldquo;{src.quote}&rdquo;</p>
                <p className="mt-0.5 text-[12px] text-muted">
                  <a className="text-brand hover:underline" href={src.url} target="_blank" rel="noreferrer">
                    {src.publisher || host(src.url)} ↗
                  </a>
                  {src.official ? " · official" : ""} · found on the page
                </p>
              </li>
            ))}
          </ul>
          {step.url && (
            <a className="text-[13px] text-brand hover:underline" href={step.url} target="_blank" rel="noreferrer">
              Open the page ({host(step.url)}) ↗
            </a>
          )}
        </div>
      )}
    </li>
  );
}
