"use client";

import { useEffect, useMemo, useState } from "react";
import type { FirmFinding, Step3Result, TraceStep } from "../../lib/agent/legalAidTypes";
import { MAX_ENQUIRIES } from "../../lib/agent/enquiryTypes";
import { Button, Callout, cx, Eyebrow } from "../ui";
import { Badge, FitRing, host, ScoreRow, StatsLine } from "./scoreParts";
import TraceSheet, { type TraceScope } from "./TraceSheet";

/**
 * Step 3 results as a shopping page (Tarun): a compact verdict on top, filters on the left built from the actual result (with
 * counts), a sort, and a grid of compact firm cards. A card shows only name, place, fit and up to 3 badges; everything else is
 * one click away in a detail window, and the full trace behind that (progressive disclosure). Cards can be ticked for step 4.
 */

const CALCULATOR = "SLAB calculator";

/** The verdict as one small chip in the results line (Tarun: a card repeating it on every visit is not helpful). Hover for the honest detail, click for the calculator's steps. */
const VERDICT: Record<Step3Result["verdict"], { cls: string; chip: string; tip: string }> = {
  likely: { cls: "bg-teal-soft text-teal", chip: "May qualify for legal aid", tip: "SLAB's calculator says you may qualify financially. A solicitor applies for you, and SLAB also checks the case has merit." },
  unlikely: { cls: "bg-amber-soft text-amber", chip: "Legal aid unlikely", tip: "SLAB's calculator says you may not qualify financially. Some solicitors take cases like this on a no win no fee basis." },
  unknown: { cls: "bg-subtle text-ink-2", chip: "Legal aid not checked", tip: "We could not get an answer from SLAB's calculator. A solicitor can check this with you." },
  skipped: { cls: "bg-subtle text-ink-2", chip: "No win no fee search", tip: "You chose not to share money details, so we looked for solicitors who may work on a no win no fee basis." },
};

type Flag = "legalAid" | "nwnf" | "patients" | "form" | "lawsoc" | "website";
const statusOf = (f: FirmFinding, key: string) => f.breakdown?.find((r) => r.key === key)?.status;
const FLAGS: { id: Flag; label: string; test: (f: FirmFinding) => boolean }[] = [
  { id: "legalAid", label: "Takes legal aid", test: (f) => f.legalAid },
  { id: "nwnf", label: "No win no fee", test: (f) => f.noWinNoFee === "yes" },
  { id: "patients", label: "Acts for patients", test: (f) => f.actsForPatients === "yes" },
  { id: "form", label: "Has an enquiry form", test: (f) => !!f.enquiryUrl },
  { id: "lawsoc", label: "On the Law Society register", test: (f) => (statusOf(f, "lawsoc") ? statusOf(f, "lawsoc") === "yes" : f.sources.includes("lawsoc")) },
  { id: "website", label: "Website checked", test: (f) => (statusOf(f, "checked") ? statusOf(f, "checked") === "yes" : f.sources.includes("website")) },
];
const FITS = [0, 50, 70, 85];
const MILES: (number | null)[] = [null, 1, 5, 15];

type Filters = { minFit: number; maxMiles: number | null; flags: Flag[]; ruledOut: boolean };
const fitOf = (f: FirmFinding) => f.fit ?? f.score;
const miles = (m: number) => (m < 10 ? m.toFixed(1) : String(Math.round(m)));

function passes(f: FirmFinding, q: Filters, skip?: "fit" | "miles" | Flag) {
  if (!q.ruledOut && f.excluded) return false;
  if (skip !== "fit" && fitOf(f) < q.minFit) return false;
  if (skip !== "miles" && q.maxMiles !== null && (f.distanceMiles === null || f.distanceMiles > q.maxMiles)) return false;
  for (const id of q.flags) if (id !== skip && !FLAGS.find((x) => x.id === id)!.test(f)) return false;
  return true;
}

export default function FirmResults({
  result,
  sample,
  selected,
  onSelected,
  onContinue,
}: {
  result: Step3Result;
  sample: boolean;
  selected: string[];
  onSelected: (ids: string[]) => void;
  onContinue: () => void;
}) {
  const trace: TraceStep[] = useMemo(() => result.trace ?? [], [result.trace]);
  const [q, setQ] = useState<Filters>({ minFit: 0, maxMiles: null, flags: [], ruledOut: false });
  const [sort, setSort] = useState<"fit" | "near">("fit");
  const [open, setOpen] = useState<FirmFinding | null>(null);
  const [scope, setScope] = useState<TraceScope | null>(null);
  const v = VERDICT[result.verdict];
  const calcSteps = trace.filter((s) => s.agent === CALCULATOR);
  const quoted = result.verdict === "likely" || result.verdict === "unlikely";
  const ruledOut = result.firms.filter((f) => f.excluded).length;

  const shown = result.firms
    .filter((f) => passes(f, q))
    .sort((a, b) => (sort === "fit" ? fitOf(b) - fitOf(a) : (a.distanceMiles ?? 1e9) - (b.distanceMiles ?? 1e9)));
  const count = (test: (f: FirmFinding) => boolean, skip: "fit" | "miles" | Flag) => result.firms.filter((f) => passes(f, q, skip) && test(f)).length;
  const full = selected.length >= MAX_ENQUIRIES;
  // Up to MAX_ENQUIRIES firms (D45): once full, unticked boxes are disabled.
  const toggle = (id: string) => onSelected(selected.includes(id) ? selected.filter((x) => x !== id) : full ? selected : [...selected, id]);
  const firmScope = (f: FirmFinding): TraceScope => ({ title: f.name, subtitle: f.excluded ? `Left out: ${f.excluded}` : undefined, steps: trace.filter((s) => s.firms?.includes(f.id)) });
  const anyFilter = q.minFit > 0 || q.maxMiles !== null || q.flags.length > 0;

  return (
    <div className="space-y-6">
      {sample && (
        <Callout tone="warn" title="Sample data, not a real result.">
          Played back from test data to show the layout. The firm names are real; the scores and details are made up.
        </Callout>
      )}

      <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Filters */}
        <aside aria-label="Filters" className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <FilterGroup title="Fit">
            {FITS.map((n) => (
              <Radio key={n} on={q.minFit === n} onClick={() => setQ({ ...q, minFit: n })} label={n === 0 ? "Any" : `${n}% or more`} count={count((f) => fitOf(f) >= n, "fit")} />
            ))}
          </FilterGroup>
          <FilterGroup title="Distance">
            {MILES.map((m) => (
              <Radio
                key={String(m)}
                on={q.maxMiles === m}
                onClick={() => setQ({ ...q, maxMiles: m })}
                label={m === null ? "Any distance" : `Within ${m} ${m === 1 ? "mile" : "miles"}`}
                count={count((f) => m === null || (f.distanceMiles !== null && f.distanceMiles <= m), "miles")}
              />
            ))}
          </FilterGroup>
          <FilterGroup title="Must have">
            {FLAGS.map((x) => {
              const on = q.flags.includes(x.id);
              const n = count(x.test, x.id);
              return (
                <label key={x.id} className={cx("flex cursor-pointer items-start gap-2.5 py-1 text-[13px] leading-5", n === 0 && !on ? "text-faint" : "text-ink")}>
                  <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={on} onChange={() => setQ({ ...q, flags: on ? q.flags.filter((y) => y !== x.id) : [...q.flags, x.id] })} />
                  <span className="flex-1">{x.label}</span>
                  <span className="tabular-nums text-muted">{n}</span>
                </label>
              );
            })}
          </FilterGroup>
          {ruledOut > 0 && (
            <label className="flex cursor-pointer items-start gap-2.5 border-t border-line pt-4 text-[13px] leading-5 text-ink-2">
              <input type="checkbox" className="mt-0.5 size-4 accent-brand" checked={q.ruledOut} onChange={() => setQ({ ...q, ruledOut: !q.ruledOut })} />
              <span className="flex-1">Show firms we ruled out</span>
              <span className="tabular-nums text-muted">{ruledOut}</span>
            </label>
          )}
          {anyFilter && (
            <button className="text-[13px] text-brand hover:underline" onClick={() => setQ({ ...q, minFit: 0, maxMiles: null, flags: [] })}>
              Clear filters
            </button>
          )}
        </aside>

        {/* Results */}
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
              {calcSteps.length > 0 ? (
                <button
                  title={`${v.tip} Click to see how we checked.`}
                  onClick={() => setScope({ title: "The legal aid calculator", subtitle: v.tip + (quoted ? ` It said: "${result.calculatorText}"` : ""), steps: calcSteps })}
                  className={cx("rounded-full px-2.5 py-0.5 text-[12px] font-medium hover:underline", v.cls)}
                >
                  {v.chip}
                </button>
              ) : (
                <span title={v.tip} className={cx("rounded-full px-2.5 py-0.5 text-[12px] font-medium", v.cls)}>
                  {v.chip}
                </span>
              )}
              <span>
                <span className="font-medium text-ink">{shown.length}</span> of {result.firms.length} firms · <StatsLine stats={result.stats} inline />
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div role="group" aria-label="Sort" className="flex rounded-ctl border border-line p-0.5 text-[12px]">
                {(["fit", "near"] as const).map((k) => (
                  <button key={k} onClick={() => setSort(k)} className={cx("rounded-[4px] px-2.5 py-1", sort === k ? "bg-ink text-white" : "text-ink-2 hover:text-ink")}>
                    {k === "fit" ? "Best fit" : "Nearest"}
                  </button>
                ))}
              </div>
              {trace.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setScope({ title: "The whole run", subtitle: `${trace.length} steps by ${new Set(trace.map((s) => s.agent)).size} agents, in time order.`, steps: trace, whole: true })}
                >
                  Whole run
                </Button>
              )}
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="rounded-card bg-subtle px-5 py-8 text-center text-sm text-ink-2">No firm matches these filters.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((f) => (
                <li key={f.id}>
                  <FirmTile firm={f} top={result.shortlist.includes(f.id)} selected={selected.includes(f.id)} locked={full && !selected.includes(f.id)} onToggle={() => toggle(f.id)} onOpen={() => setOpen(f)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {selected.length > 0 && (
        <div className="sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-card bg-ink px-5 py-3 text-white shadow-[0_12px_32px_rgba(0,0,0,0.25)]">
          <span className="text-[14px]">
            <span className="font-medium tabular-nums">{selected.length}</span> of {MAX_ENQUIRIES} selected
            {full && <span className="ml-2 text-[13px] text-white/70">(the most we contact at once)</span>}
            <button className="ml-3 text-[13px] text-white/70 underline-offset-2 hover:text-white hover:underline" onClick={() => onSelected([])}>
              Clear
            </button>
          </span>
          <Button size="sm" onClick={onContinue}>
            Send enquiry to selected →
          </Button>
        </div>
      )}

      {open && (
        <FirmModal
          firm={open}
          top={result.shortlist.includes(open.id)}
          selected={selected.includes(open.id)}
          locked={full && !selected.includes(open.id)}
          onToggle={() => toggle(open.id)}
          onClose={() => setOpen(null)}
          onTrace={trace.some((s) => s.firms?.includes(open.id)) ? () => setScope(firmScope(open)) : undefined}
        />
      )}
      {scope && <TraceSheet scope={scope} runId={result.runId} onClose={() => setScope(null)} />}
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2">
        <Eyebrow>{title}</Eyebrow>
      </legend>
      <div className="space-y-0.5">{children}</div>
    </fieldset>
  );
}

function Radio({ on, onClick, label, count }: { on: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={cx("flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[13px] leading-5", on ? "bg-brand-soft font-medium text-brand" : count === 0 ? "text-faint" : "text-ink hover:bg-subtle")}>
      <span className="flex-1">{label}</span>
      <span className="tabular-nums text-muted">{count}</span>
    </button>
  );
}

/** Badges for a firm, most useful first, at most `max`. */
function badges(f: FirmFinding, max: number) {
  const all: { t: string; cls: string }[] = [];
  if (f.excluded) all.push({ t: "Ruled out", cls: "bg-danger-soft text-danger" });
  if (f.legalAid) all.push({ t: "Takes legal aid", cls: "bg-brand-soft text-brand" });
  if (f.noWinNoFee === "yes") all.push({ t: "No win no fee", cls: "bg-teal-soft text-teal" });
  if (f.actsForPatients === "yes") all.push({ t: "Acts for patients", cls: "bg-subtle text-ink-2" });
  if (f.enquiryUrl) all.push({ t: "Enquiry form", cls: "bg-subtle text-ink-2" });
  return all.slice(0, max);
}

function FirmTile({ firm, top, selected, locked, onToggle, onOpen }: { firm: FirmFinding; top: boolean; selected: boolean; locked: boolean; onToggle: () => void; onOpen: () => void }) {
  return (
    <article
      className={cx(
        "relative flex h-full cursor-pointer flex-col gap-3 rounded-card border bg-white p-4 transition-colors",
        selected ? "border-brand ring-2 ring-brand-soft" : "border-line hover:border-brand/50",
        firm.excluded && "opacity-70",
      )}
      onClick={onOpen}
    >
      <div className="flex items-center justify-between gap-2">
        <label
          className={cx("flex items-center gap-2 text-[12px]", locked ? "cursor-not-allowed text-faint" : "cursor-pointer text-ink-2")}
          onClick={(e) => e.stopPropagation()}
          title={locked ? `You can contact up to ${MAX_ENQUIRIES} firms at once` : undefined}
        >
          <input type="checkbox" className="size-4 accent-brand" checked={selected} disabled={locked} onChange={onToggle} aria-label={`Select ${firm.name}`} />
          Select
        </label>
        {top && <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-white">Top pick</span>}
      </div>
      <div className="flex items-start gap-3">
        <FitRing fit={fitOf(firm)} size={52} />
        <div className="min-w-0">
          <h3 className="text-[15px] font-medium leading-5 text-ink">{firm.name}</h3>
          <p className="mt-0.5 text-[13px] text-muted">
            {firm.town}
            {firm.distanceMiles !== null && ` · ${miles(firm.distanceMiles)} mi`}
          </p>
        </div>
      </div>
      <div className="mt-auto flex flex-wrap gap-1.5">
        {badges(firm, 3).map((b) => (
          <Badge key={b.t} cls={b.cls}>
            {b.t}
          </Badge>
        ))}
      </div>
    </article>
  );
}

function FirmModal({ firm, top, selected, locked, onToggle, onClose, onTrace }: { firm: FirmFinding; top: boolean; selected: boolean; locked: boolean; onToggle: () => void; onClose: () => void; onTrace?: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const contacts = [
    firm.website && { k: "Website", v: <a className="break-all text-brand hover:underline" href={firm.website} target="_blank" rel="noreferrer">{host(firm.website)} ↗</a> },
    firm.enquiryUrl && { k: "Enquiry form", v: <a className="break-all text-brand hover:underline" href={firm.enquiryUrl} target="_blank" rel="noreferrer">{firm.enquiryUrl.replace(/^https?:\/\/(www\.)?/, "")} ↗</a> },
    firm.email && { k: "Email", v: <span className="break-all">{firm.email}</span> },
    firm.phone && { k: "Phone", v: firm.phone },
  ].filter(Boolean) as { k: string; v: React.ReactNode }[];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6 sm:p-12" role="dialog" aria-modal="true" aria-label={firm.name}>
      <button aria-label="Close" className="fixed inset-0 bg-ink/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-card bg-white shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
        <header className="flex items-start gap-5 border-b border-line-soft p-6">
          <FitRing fit={fitOf(firm)} size={76} />
          <div className="min-w-0 flex-1">
            {top && <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.08em] text-white">Top pick</span>}
            <h2 className="display mt-1.5 text-[26px] text-ink">{firm.name}</h2>
            <p className="text-sm text-muted">
              {firm.town}
              {firm.distanceMiles !== null && ` · ${miles(firm.distanceMiles)} miles away`}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {badges(firm, 5).map((b) => (
                <Badge key={b.t} cls={b.cls}>
                  {b.t}
                </Badge>
              ))}
            </div>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </header>

        <div className="space-y-6 p-6">
          {firm.excluded && (
            <Callout tone="danger" title="We ruled this firm out">
              {firm.excluded}
            </Callout>
          )}
          {contacts.length > 0 && (
            <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-[13px]">
              {contacts.map((c) => (
                <div key={c.k} className="contents">
                  <dt className="text-muted">{c.k}</dt>
                  <dd className="text-ink">{c.v}</dd>
                </div>
              ))}
            </dl>
          )}
          {firm.breakdown && firm.breakdown.length > 0 && (
            <div>
              <Eyebrow>How the fit is made up</Eyebrow>
              <p className="mt-1 text-xs text-muted">Click a row for the evidence. Fit is how well the firm matches what you need, not a chance of winning.</p>
              <ul className="mt-2">
                {firm.breakdown.map((r) => (
                  <ScoreRow key={r.key} row={r} />
                ))}
              </ul>
            </div>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line-soft p-6">
          <label className={cx("flex items-center gap-2 text-[14px]", locked ? "cursor-not-allowed text-faint" : "cursor-pointer text-ink")}>
            <input type="checkbox" className="size-4 accent-brand" checked={selected} disabled={locked} onChange={onToggle} />
            {locked ? `Contact this firm (you already picked ${MAX_ENQUIRIES})` : "Contact this firm in the next step"}
          </label>
          {onTrace && (
            <Button variant="secondary" size="sm" onClick={onTrace}>
              See how we found them
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}
