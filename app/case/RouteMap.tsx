"use client";

import { useState } from "react";
import { ROUTE_KINDS, type RouteMap as Route, type RouteStep } from "../../lib/agent/routeTypes";
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

export default function RouteMapCard({ route, compact }: { route: Route; compact?: boolean }) {
  const where = [route.place.region, route.place.country].filter(Boolean).join(", ") || "your place";
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
          return <Row key={k.kind} label={k.label} step={s} crew={s?.by ?? k.crew} compact={compact} />;
        })}
      </ol>
    </section>
  );
}

function Row({ label, step, crew, compact }: { label: string; step?: RouteStep; crew: RouteStep["by"]; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  // Nothing checked on an official page: the claimed body stays out of the headline (Cursor review).
  if (!step || step.confidence === "unconfirmed")
    return (
      <li className="flex items-center gap-4 px-6 py-3 text-[14px] text-muted">
        <CrewMark id={crew} size={28} className="opacity-40 grayscale" />
        <span className="w-36 shrink-0">{label}</span>
        <span>{step ? `Not confirmed yet${step.body ? ` (maybe ${step.body})` : ""}` : "Not found yet"}</span>
      </li>
    );
  const checked = step.sources.filter((x) => x.checked).length;
  return (
    <li className="px-6 py-4">
      <div className="flex items-start gap-4">
        <CrewMark id={crew} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="w-36 shrink-0 text-[13px] text-muted">{label}</span>
            <span className="text-[15px] font-medium text-ink">{step.body}</span>
          </div>
          {!compact && <p className="mt-1 text-[14px] leading-6 text-ink-2 md:pl-39">{step.what}</p>}
          {!compact && step.deadline && step.deadline.length > 40 && <p className="mt-1 text-[13px] leading-5 text-ink-2 md:pl-39">Time limit: {step.deadline}</p>}
          {!compact && step.points?.length ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] leading-5 text-ink-2 md:ml-39">
              {step.points.map((pt) => (
                <li key={pt}>{pt}</li>
              ))}
            </ul>
          ) : null}
          {!compact && (step.requires?.length || step.appliesIf || step.alternatives?.length) ? (
            <p className="mt-1 text-[13px] leading-5 text-muted md:pl-39">
              {[step.requires?.length ? `First: ${step.requires.join("; ")}` : "", step.appliesIf ? `Only if: ${step.appliesIf}` : "", step.alternatives?.length ? `Or: ${step.alternatives.join("; ")}` : ""].filter(Boolean).join(" · ")}
            </p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] md:pl-39">
            {HOW[step.how] && <Chip tone={step.how === "online_form" ? "ok" : step.how === "login_required" ? "warn" : "plain"}>{HOW[step.how]}</Chip>}
            {step.deadline && step.deadline.length <= 40 && <Chip tone="plain">{step.deadline}</Chip>}
            {step.wall && <Chip tone="warn">{step.wall}</Chip>}
            <button className="text-muted hover:text-brand hover:underline" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {step.confidence === "confirmed" ? "Confirmed" : step.confidence === "likely" ? "One official source" : "Not confirmed"} · {checked} of {step.sources.length} quote{step.sources.length === 1 ? "" : "s"} checked
            </button>
            {step.url && (
              <a className="text-brand hover:underline" href={step.url} target="_blank" rel="noreferrer">
                {host(step.url)} ↗
              </a>
            )}
          </div>
          {open && (
            <ul className="rise mt-3 space-y-2 md:pl-39">
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
          )}
        </div>
      </div>
    </li>
  );
}

function Chip({ tone, children }: { tone: "ok" | "warn" | "plain"; children: React.ReactNode }) {
  return <span className={cx("rounded-[4px] px-1.5 py-0.5", tone === "ok" ? "bg-teal-soft text-teal" : tone === "warn" ? "bg-amber-soft text-amber" : "bg-subtle text-ink-2")}>{children}</span>;
}
