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

/** First sentence, capped: the card shows one line per part; the rest is one click away. */
const firstLine = (t: string, n = 150) => {
  const f = t.split(/(?<=[.!?])\s+/)[0] ?? t;
  return f.length > n ? `${f.slice(0, f.lastIndexOf(" ", n - 2))}…` : f;
};

export default function RouteMapCard({ route, compact }: { route: Route; compact?: boolean }) {
  const [more, setMore] = useState(false);
  const where = [route.place.region, route.place.country].filter(Boolean).join(", ") || "your place";
  const lead = route.summary ? firstLine(route.summary, 220) : "";
  return (
    <section aria-label="How it works where you live" className="rounded-card border border-line bg-white">
      <header className="border-b border-line-soft px-6 py-5">
        <p className="text-[12px] text-muted">How it works where you live</p>
        <h2 className="display mt-1 text-[26px] leading-tight text-ink">{where}</h2>
        {!compact && lead && (
          <p className="mt-2 max-w-3xl font-serif text-[16px] leading-7 text-ink-2">
            {more ? route.summary : lead}{" "}
            {route.summary !== lead && (
              <button className="font-sans text-[13px] text-brand hover:underline" onClick={() => setMore((m) => !m)}>
                {more ? "Less" : "More"}
              </button>
            )}
          </p>
        )}
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
  const conditions = [step.requires?.length ? `First: ${step.requires.join("; ")}` : "", step.appliesIf ? `Only if: ${step.appliesIf}` : "", step.alternatives?.length ? `Or: ${step.alternatives.join("; ")}` : ""].filter(Boolean);
  return (
    <li className="px-6 py-4">
      <div className="flex items-start gap-4">
        <CrewMark id={crew} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="w-36 shrink-0 text-[13px] text-muted">{label}</span>
            <span className="text-[15px] font-medium text-ink">{step.body}</span>
          </div>
          {!compact && <p className="mt-1 text-[14px] leading-6 text-ink-2 md:pl-39">{firstLine(step.what)}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] md:pl-39">
            {HOW[step.how] && <Chip tone={step.how === "online_form" ? "ok" : step.how === "login_required" ? "warn" : "plain"}>{HOW[step.how]}</Chip>}
            {step.deadline && step.deadline.length <= 40 && <Chip tone="plain">{step.deadline}</Chip>}
            {step.wall && <Chip tone="warn">{firstLine(step.wall, 60)}</Chip>}
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
            <div className="rise mt-3 space-y-3 md:pl-39">
              {step.what !== firstLine(step.what) && <p className="text-[14px] leading-6 text-ink-2">{step.what}</p>}
              {step.deadline && step.deadline.length > 40 && <p className="text-[13px] leading-5 text-ink-2">Time limit: {step.deadline}</p>}
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
