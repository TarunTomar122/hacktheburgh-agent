"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EnquiryMessage, EnquiryOutcome, EnquiryRecord, EnquiryStatus, FieldEdit, FormField } from "../../lib/agent/enquiryTypes";
import type { AgentTile, FirmFinding, Stats, TraceStep } from "../../lib/agent/legalAidTypes";
import { setEnquiry, setLegalAid, setOutcome, skipStep, upsertEnquiries, type Profile } from "../../lib/profile";
import { Button, Callout, control, cx, Eyebrow, Paper } from "../ui";
import { draftMessage, editEnquiry, fieldsOf, runStep4, sendEnquiry } from "./enquiryRun";
import { closeAgentBrowser } from "./streamAgent";
import { AgentsPanel } from "./LegalAidStep";
import { fixtureMode } from "./legalAidRun";
import { WHY } from "./scoreParts";
import TraceSheet, { type TraceScope } from "./TraceSheet";

/**
 * Step 4 (D45, D46): contact up to 3 firms.
 * Before the run: the message (left) and one button (right). After: one card per firm, side by side, each with a small
 * progress track and ONE next action that changes with its state. The card itself opens how the agent did it.
 * The agent retries failures by itself, falls back to a backup engine, and swaps in the next best firm when a firm has no
 * online form, so the user rarely has to do anything but approve. Replies are tracked on the same card.
 */

const today = () => new Date().toISOString().slice(0, 10);
/** 3 working days after a date (weekends skipped). Our rule of thumb for a follow-up, not a legal deadline. */
export function followUpFrom(iso: string, days = 3) {
  const d = new Date(iso);
  let n = 0;
  while (n < days) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) n++;
  }
  return d.toISOString().slice(0, 10);
}
const nice = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

const BUSY: EnquiryStatus[] = ["queued", "finding_form", "filling", "sending"];

/** Where a firm is on the way: form found, filled, your OK, sent. */
function stage(o: EnquiryOutcome): number {
  if (o.status === "sent") return 4;
  if (o.status === "ready_to_send" || o.status === "send_blocked" || o.status === "needs_input") return 2;
  if (o.status === "filling" || o.status === "partial" || o.status === "could_not_fill") return 1; // found, but never counted as filled
  return 0;
}

export default function ContactLawyersStep({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const result = profile.legalAid?.result;
  const selected = profile.legalAid?.selected ?? [];
  const firms = selected.map((id) => result?.firms.find((f) => f.id === id)).filter((f): f is FirmFinding => !!f);
  // Next best checked firms with a website, to swap in when a selected firm has no online form (D46).
  const reserves = (result?.firms ?? []).filter((f) => !selected.includes(f.id) && !f.excluded && f.website).sort((a, b) => b.score - a.score).slice(0, 4);
  const verdict = result?.verdict;
  const route = result?.route;
  const legalAid = useMemo(() => (verdict && route ? { verdict, route } : undefined), [verdict, route]);
  const message = profile.enquiry?.message;
  const saved = profile.enquiry?.outcomes ?? [];
  const records = profile.enquiries ?? [];
  const [live, setLive] = useState<EnquiryOutcome[] | null>(null);
  // Keep historical outcomes in storage, but only offer actions for selected firms.
  const outcomes = (live ?? saved).filter((o) => selected.includes(o.firmId));
  const contacted = (id: string) => records.some((r) => r.firmId === id && ["sent", "replied", "not_interested"].includes(r.status));
  const pending = firms.filter((f) => !outcomes.some((o) => o.firmId === f.id) && !contacted(f.id));
  const [running, setRunning] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tiles, setTiles] = useState<AgentTile[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [lines, setLines] = useState<TraceStep[]>([]);
  const [trace, setTrace] = useState<TraceStep[]>([]);
  const [runId, setRunId] = useState<string | undefined>(profile.enquiry?.runId);
  const [review, setReview] = useState<EnquiryOutcome | null>(null);
  const [scope, setScope] = useState<TraceScope | null>(null);
  const [info, setInfo] = useState<EnquiryOutcome | null>(null);

  // The message is written once from the profile; the user can edit it.
  const asked = useRef(false);
  const [draftAttempt, setDraftAttempt] = useState(0);
  useEffect(() => {
    if (message || firms.length === 0 || asked.current) return;
    asked.current = true;
    setWriting(true);
    setError(null);
    draftMessage(profile.facts, legalAid)
      .then((m) => setEnquiry({ message: m }))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setWriting(false));
  }, [message, firms.length, profile.facts, legalAid, draftAttempt]);

  if (firms.length === 0) {
    return (
      <div className="space-y-8">
        <h1 className="display text-[40px] text-ink">Contact lawyers</h1>
        <Callout tone="info" title="Pick up to 3 solicitors first.">
          In the previous step, tick the firms you would like to contact.
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={onBack}>
              Back to the list
            </Button>
          </div>
        </Callout>
      </div>
    );
  }

  /** Fill every selected firm, or just one again ("Try again"). Outcomes stream into the cards. */
  async function run(only?: FirmFinding) {
    if (!message || running) return;
    const targets = (only ? [only] : firms).filter((f) => selected.includes(f.id) && !contacted(f.id));
    if (!targets.length) return;
    setRunning(true);
    setError(null);
    setTiles([]);
    setStats(null);
    setLines([]);
    const start: EnquiryOutcome[] = [...saved.filter((o) => !targets.some((f) => f.id === o.firmId)), ...targets.map((f) => ({ firmId: f.id, firmName: f.name, status: "queued" as const, formUrl: null, filled: [], unfilled: [], consents: [], note: "Waiting" }))];
    setLive(start);
    const upsert = (cur: EnquiryOutcome[] | null, o: EnquiryOutcome) => {
      const list = cur ?? [];
      return list.some((x) => x.firmId === o.firmId) ? list.map((x) => (x.firmId === o.firmId ? o : x)) : [...list, o];
    };
    try {
      const r = await runStep4({ facts: profile.facts, message, firms: targets, reserves: reserves.filter((x) => !contacted(x.id) && !saved.some((o) => o.firmId === x.id)), legalAid }, (e) => {
        if (e.type === "agent") setTiles((ts) => (ts.some((t) => t.id === e.tile.id) ? ts.map((t) => (t.id === e.tile.id ? e.tile : t)) : [...ts, e.tile]));
        else if (e.type === "stats") setStats(e.stats);
        else if (e.type === "status") setStatus(e.message);
        else if (e.type === "trace") setLines((l) => [...l.slice(-5), e.step]);
        else if (e.type === "enquiry") setLive((cur) => upsert(cur, e.enquiry));
      });
      const merged = r.enquiries.reduce<EnquiryOutcome[]>((acc, o) => upsert(acc, o), saved);
      // Automatic replacements become selected so their cards remain actionable.
      const replaced = r.enquiries.filter((o) => o.status === "no_form" && /swapped in/i.test(o.note)).map((o) => o.firmId);
      const replacements = r.enquiries.filter((o) => !selected.includes(o.firmId) && !replaced.includes(o.firmId)).map((o) => o.firmId);
      if (replaced.length) setLegalAid({ selected: [...new Set([...selected.filter((id) => !replaced.includes(id)), ...replacements])].slice(0, 3) });
      setTrace((t) => (only ? [...t, ...r.trace] : r.trace));
      setRunId(r.runId);
      setEnquiry({ outcomes: merged, runId: r.runId, sample: fixtureMode() });
      upsertEnquiries(r.enquiries.filter((o) => o.status === "ready_to_send").map((o) => ({ firmId: o.firmId, firmName: o.firmName, status: "ready_to_send" as const })));
      setLive(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLive(null);
    } finally {
      setRunning(false);
    }
  }

  const markSent = (o: EnquiryOutcome, at = new Date().toISOString()) =>
    upsertEnquiries([{ firmId: o.firmId, firmName: o.firmName, status: "sent", sentAt: at, followUpOn: followUpFrom(at) }]);
  const started = outcomes.length > 0 || running;

  // Demo (D59): no real enquiry is sent, so the demo can carry on as if every firm had been sent its enquiry.
  const isSent = (id: string) => ["sent", "replied", "not_interested"].includes(records.find((r) => r.firmId === id)?.status ?? "");
  const skipSending = () => {
    void closeAgentBrowser(); // the filled forms are no use any more
    const at = new Date().toISOString();
    const targets: EnquiryOutcome[] = outcomes.length
      ? outcomes.filter((o) => !(o.status === "no_form" && /swapped in/i.test(o.note)))
      : firms.map((f) => ({ firmId: f.id, firmName: f.name, status: "queued" as const, formUrl: null, filled: [], unfilled: [], consents: [], note: "" }));
    const skipped = targets.filter((o) => !isSent(o.firmId) && o.status !== "no_form" && o.status !== "could_not_fill").map((o) => ({ ...o, status: "sent" as const, sentAt: at, note: "Skipped in the demo: nothing was actually sent" }));
    setEnquiry({ outcomes: [...targets.filter((o) => !skipped.some((s) => s.firmId === o.firmId)), ...skipped] });
    upsertEnquiries(skipped.map((o) => ({ firmId: o.firmId, firmName: o.firmName, status: "sent" as const, sentAt: at, followUpOn: followUpFrom(at) })));
    skipStep(4);
    setLive(null);
  };
  const skippable = outcomes.length ? outcomes.filter((o) => o.status !== "no_form" && o.status !== "could_not_fill").map((o) => o.firmId) : firms.map((f) => f.id);
  const canSkip = !running && !writing && skippable.some((id) => !isSent(id));
  // A firm with no online form that was replaced drops to a one-line note; one we could not replace keeps its card.
  const swapped = (o: EnquiryOutcome) => o.status === "no_form" && /swapped in/i.test(o.note);
  const rank: Partial<Record<EnquiryOutcome["status"], number>> = { ready_to_send: 0, sent: 1, send_blocked: 2, needs_input: 3, partial: 3, could_not_fill: 6, filling: 4, finding_form: 4, queued: 5, failed: 6, no_form: 7 };
  const active = outcomes.filter((o) => !swapped(o)).sort((a, b) => (rank[a.status] ?? 5) - (rank[b.status] ?? 5));
  const swappedOut = outcomes.filter(swapped);

  return (
    <div className="@container space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="display text-[40px] text-ink">Contact lawyers</h1>
        {trace.length > 0 && !running && (
          <Button variant="secondary" size="sm" onClick={() => setScope({ title: "Everything the agents did", steps: trace, whole: true })}>
            See how the forms were filled
          </Button>
        )}
      </div>

      {started && pending.length > 0 && (
        <div className="space-y-3">
          {pending.map((firm) => <Button key={firm.id} variant="secondary" disabled={running || writing || !message} onClick={() => run(firm)}>Fill enquiry for {firm.name}</Button>)}
        </div>
      )}

      {!started ? (
        <div className="grid gap-6 @3xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-3">
            <MessageDoc message={message} writing={writing} disabled={running} />
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
            {error && !message && !writing && <Button variant="secondary" size="sm" onClick={() => { asked.current = false; setDraftAttempt((n) => n + 1); }}>Try writing the message again</Button>}
          </div>
          <aside className="space-y-4 self-start rounded-card border border-line bg-white p-5 @3xl:sticky @3xl:top-6">
            <Eyebrow>Sending to</Eyebrow>
            <ul className="space-y-2">
              {firms.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 text-[14px] text-ink">
                  <span>{f.name}</span>
                  {f.fit !== undefined && <span className="shrink-0 tabular-nums text-xs text-muted">{f.fit}%</span>}
                </li>
              ))}
            </ul>
            <Button className="w-full" onClick={() => run()} disabled={!message || writing}>
              Fill their enquiry forms
            </Button>
            <Button className="w-full" variant="secondary" disabled={running || writing} onClick={skipSending} title="Demo: nothing is sent. Marks every enquiry as sent.">
              Skip and mark as sent (demo)
            </Button>
            <p className="text-xs leading-5 text-muted">
              Our agents fill each form and stop. Nothing is sent until you approve it.{" "}
              <button className="text-brand hover:underline" onClick={onBack}>
                Change firms
              </button>
            </p>
          </aside>
        </div>
      ) : (
        <>
          {running && <AgentsPanel tiles={tiles} stats={stats} status={status} live={lines} />}
          {error && <p className="text-sm text-danger">{error}</p>}
          {profile.enquiry?.sample && !running && <p className="text-xs text-amber">Sample data (fixture): nothing was visited and nothing can be sent.</p>}

          {canSkip && (
            <div className="flex justify-end">
              <Button variant="secondary" size="sm" onClick={skipSending} title="Demo: nothing is sent. Marks every enquiry as sent.">
                Skip and mark as sent (demo)
              </Button>
            </div>
          )}

          <div className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
            {active.map((o) => {
              const firm = result?.firms.find((f) => f.id === o.firmId);
              const rec = records.find((r) => r.firmId === o.firmId);
              return (
                <FirmCard
                  key={o.firmId}
                  o={o}
                  firm={firm}
                  rec={rec}
                  running={running}
                  onOpen={() => setInfo(o)}
                  onReview={() => setReview(o)}
                  onRetry={() => firm && run(firm)}
                  onReply={(status) => upsertEnquiries([{ firmId: o.firmId, firmName: o.firmName, status }])}
                />
              );
            })}
          </div>

          {swappedOut.length > 0 && (
            <ul className="space-y-1 text-[13px] text-muted">
              {swappedOut.map((o) => (
                <li key={o.firmId}>
                  <span className="text-ink-2">{o.firmName}</span> had no online form, so the agent {o.note.replace(/^.*swapped in/i, "swapped in")}.
                </li>
              ))}
            </ul>
          )}

          {!running && (
            <details className="group rounded-card border border-line bg-white">
              <summary className="cursor-pointer list-none px-5 py-3 text-[13px] text-ink-2 hover:text-ink">
                <span className="mr-2 inline-block transition-transform group-open:rotate-90">›</span>The message we used
              </summary>
              <div className="border-t border-line-soft p-5">
                <MessageDoc message={message} writing={false} disabled />
              </div>
            </details>
          )}
        </>
      )}

      {review && selected.includes(review.firmId) && !contacted(review.firmId) && (
        <ApproveModal
          o={review}
          local={!!profile.enquiry?.sample}
          onClose={() => setReview(null)}
          onResult={(o2) => {
            setOutcome(o2);
            setReview(o2);
            if (o2.status === "sent") markSent(o2, o2.sentAt);
          }}
        />
      )}
      {info && (
        <FirmModal
          o={info}
          firm={result?.firms.find((f) => f.id === info.firmId)}
          steps={trace.filter((s) => s.firms?.includes(info.firmId))}
          onClose={() => setInfo(null)}
          onSteps={(steps) => {
            setInfo(null);
            setScope({ title: info.firmName, steps });
          }}
          onReview={
            selected.includes(info.firmId) && !contacted(info.firmId) && (info.status === "ready_to_send" || info.status === "needs_input" || info.status === "partial")
              ? () => {
                  setInfo(null);
                  setReview(info);
                }
              : undefined
          }
        />
      )}
      {scope && <TraceSheet scope={scope} runId={runId} onClose={() => setScope(null)} />}
    </div>
  );
}

const TRI = { yes: { mark: "✓", cls: "bg-teal-soft text-teal", word: "Yes" }, no: { mark: "✕", cls: "bg-danger-soft text-danger", word: "No" }, unknown: { mark: "?", cls: "bg-subtle text-muted", word: "Not confirmed" } } as const;

/** Everything we know about one firm, with links to check it yourself. Opens from its card. */
function FirmModal({ o, firm, steps, onClose, onSteps, onReview }: { o: EnquiryOutcome; firm?: FirmFinding; steps: TraceStep[]; onClose: () => void; onSteps: (s: TraceStep[]) => void; onReview?: () => void }) {
  const where = [firm?.town, firm?.distanceMiles != null ? `${firm.distanceMiles < 1 ? firm.distanceMiles.toFixed(1) : Math.round(firm.distanceMiles)} miles away` : null].filter(Boolean).join(" · ");
  const rows: { label: string; v: keyof typeof TRI; why: string }[] = firm
    ? [
        { label: "Takes legal aid for medical negligence", v: firm.legalAid ? "yes" : "unknown", why: WHY.legal_aid },
        { label: "Represents patients", v: firm.actsForPatients, why: WHY.patients },
        { label: "Offers no win, no fee", v: firm.noWinNoFee, why: WHY.nwnf },
        { label: "On the official register", v: firm.sources.includes("lawsoc") ? "yes" : "unknown", why: WHY.lawsoc },
        { label: "Online enquiry form", v: o.formUrl || firm.enquiryUrl ? "yes" : "no", why: WHY.form },
      ]
    : [];
  const form = o.formUrl || firm?.enquiryUrl || null;
  const host = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  return (
    <Modal
      title={o.firmName}
      sub={[where, firm?.fit !== undefined ? `${firm.fit}% fit for what you need` : null].filter(Boolean).join(" · ")}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-3">
          {onReview && <Button onClick={onReview}>{o.status === "needs_input" ? "Add the missing details" : o.status === "partial" ? "Check what was filled" : "Review and send"}</Button>}
          {firm?.website && (
            <a href={firm.website} target="_blank" rel="noreferrer" className="inline-flex items-center rounded-ctl border border-line px-3 py-2 text-[14px] font-medium text-ink hover:border-faint">
              Visit their website ↗
            </a>
          )}
          {steps.length > 0 && (
            <button className="ml-auto text-[13px] text-brand hover:underline" onClick={() => onSteps(steps)}>
              How the form was filled
            </button>
          )}
        </div>
      }
    >
      <ul className="divide-y divide-line-soft">
        {rows.map((r) => (
          <li key={r.label} className="flex items-start justify-between gap-4 py-3 text-[14px]">
            <span>
              <span className="text-ink">{r.label}</span>
              {r.why && <span className="mt-0.5 block text-[12px] leading-5 text-muted">{r.why}</span>}
            </span>
            <span className={cx("inline-flex shrink-0 items-center gap-1 rounded-[4px] px-1.5 py-0.5 text-[12px]", TRI[r.v].cls)}>
              <span aria-hidden>{TRI[r.v].mark}</span>
              {TRI[r.v].word}
            </span>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-[14px]">
        {firm?.website && (
          <>
            <dt className="text-muted">Website</dt>
            <dd>
              <a className="text-brand hover:underline" href={firm.website} target="_blank" rel="noreferrer">
                {host(firm.website)}
              </a>
            </dd>
          </>
        )}
        {form && (
          <>
            <dt className="text-muted">Enquiry form</dt>
            <dd className="min-w-0 truncate">
              <a className="text-brand hover:underline" href={form} target="_blank" rel="noreferrer">
                {host(form)}
              </a>
            </dd>
          </>
        )}
        {firm?.phone && (
          <>
            <dt className="text-muted">Phone</dt>
            <dd>
              <a className="text-ink hover:text-brand" href={`tel:${firm.phone.replace(/\s+/g, "")}`}>
                {firm.phone}
              </a>
            </dd>
          </>
        )}
        {firm?.email && (
          <>
            <dt className="text-muted">Email</dt>
            <dd>
              <a className="text-ink hover:text-brand" href={`mailto:${firm.email}`}>
                {firm.email}
              </a>
            </dd>
          </>
        )}
      </dl>
      {firm?.reasons && firm.reasons.length > 0 && <p className="text-[13px] leading-5 text-muted">Why we picked them: {firm.reasons.join(" · ")}.</p>}
    </Modal>
  );
}

const STAGES = ["Form found", "Filled", "Your OK", "Sent"];

/** One firm: who, where it is on the way, one plain line, and exactly one next action. The card opens the agent's steps. */
function FirmCard({
  o,
  firm,
  rec,
  running,
  onOpen,
  onReview,
  onRetry,
  onReply,
}: {
  o: EnquiryOutcome;
  firm?: FirmFinding;
  rec?: EnquiryRecord;
  running: boolean;
  onOpen: () => void;
  onReview: () => void;
  onRetry: () => void;
  onReply: (s: EnquiryRecord["status"]) => void;
}) {
  const at = stage(o);
  const busy = BUSY.includes(o.status);
  const sent = o.status === "sent" || rec?.status === "sent" || rec?.status === "replied" || rec?.status === "not_interested";
  const due = rec?.status === "sent" && rec.followUpOn && rec.followUpOn <= today();
  const line =
    o.status === "send_blocked"
      ? "Not sent: this is a demo persona, and we never send fictional enquiries to real firms."
      : rec?.status === "replied"
        ? "They replied."
        : sent
          ? `Sent ${nice(rec?.sentAt ?? o.sentAt)}.${rec?.followUpOn ? ` Follow up from ${nice(rec.followUpOn)} if no reply.` : ""}`
          : o.status === "failed"
            ? "The agent tried twice and could not finish this one."
            : o.status === "ready_to_send"
              ? "Form filled. Check it, then we send it."
              : o.status === "partial"
                ? `Only partly filled. ${o.note} Check it yourself before anything is sent.`
                : o.status === "could_not_fill"
                  ? `We found their form but could not fill it. ${o.note} A phone call works just as well.`
                : o.status === "needs_input"
                ? `Their form needs ${o.unfilled.length ? o.unfilled.join(", ") : "a detail we do not have"}. Add it and the agent fills it in.`
                : o.status === "no_form"
                  ? "No online enquiry form on their website, and no other checked firm to swap in. A phone call works just as well."
                  : o.note;
  return (
    <article
      onClick={onOpen}
      className={cx(
        "flex cursor-pointer flex-col rounded-card border bg-white p-5 transition-colors hover:border-brand/40",
        o.status === "ready_to_send" || o.status === "needs_input" ? "border-brand/50" : due ? "border-amber/50" : "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="min-h-12 text-[16px] font-medium leading-6 text-ink">{o.firmName}</h3>
          <p className="min-h-4 text-xs text-muted">
            {[firm?.town, firm?.distanceMiles != null ? `${firm.distanceMiles < 1 ? firm.distanceMiles.toFixed(1) : Math.round(firm.distanceMiles)} miles` : null].filter(Boolean).join(" · ")}
            {o.swappedFor ? ` · in place of ${o.swappedFor}` : ""}
          </p>
        </div>
        {firm?.fit !== undefined && <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium tabular-nums text-brand">{firm.fit}% fit</span>}
      </div>

      {/* Where it is: four stages, the current one pulses while an agent works on it. */}
      <ol className="mt-5 grid grid-cols-4 gap-1.5" aria-label="Progress">
        {STAGES.map((label, i) => {
          const done = sent ? true : i < at;
          const stuck = o.status === "failed" || o.status === "send_blocked" || o.status === "no_form" || o.status === "partial" || o.status === "could_not_fill";
          const now = !sent && i === at && !stuck;
          return (
            <li key={label}>
              <div className={cx("h-1.5 rounded-full", done ? "bg-teal" : now ? (busy ? "animate-pulse bg-brand" : "bg-brand") : stuck && i === at ? (o.status === "no_form" || o.status === "partial" || o.status === "could_not_fill" ? "bg-amber/60" : "bg-danger/60") : "bg-line-soft")} />
              <div className={cx("mt-1.5 text-[11px] leading-4", done || now ? "text-ink-2" : "text-faint")}>{label}</div>
            </li>
          );
        })}
      </ol>

      <p className={cx("mt-4 flex-1 text-[13px] leading-5", o.status === "failed" || o.status === "send_blocked" ? "text-danger" : due || o.status === "partial" || o.status === "could_not_fill" ? "text-amber" : "text-ink-2")}>
        {due ? `No reply since ${nice(rec?.sentAt)}. Worth a short follow-up now.` : line}
      </p>

      <div className="mt-4" onClick={(e) => e.stopPropagation()}>
        {o.status === "ready_to_send" && !sent && (
          <Button className="w-full" size="sm" onClick={onReview}>
            Review and send
          </Button>
        )}
        {o.status === "needs_input" && !sent && (
          <Button className="w-full" size="sm" onClick={onReview}>
            Add the missing details
          </Button>
        )}
        {o.status === "partial" && !sent && (
          <Button className="w-full" size="sm" variant="secondary" onClick={onReview}>
            Check what was filled
          </Button>
        )}
        {(o.status === "failed" || o.status === "could_not_fill") && (
          <Button className="w-full" size="sm" variant="secondary" disabled={running} onClick={onRetry}>
            Try again
          </Button>
        )}
        {(o.status === "no_form" || o.status === "could_not_fill") && firm?.phone && (
          <a href={`tel:${firm.phone.replace(/\s+/g, "")}`} className="flex w-full items-center justify-center rounded-ctl border border-line px-3 py-1.5 text-xs font-medium text-ink hover:border-faint">
            Call them: {firm.phone}
          </a>
        )}
        {sent && rec?.status !== "replied" && (
          <Button className="w-full" size="sm" variant="secondary" onClick={() => onReply("replied")}>
            They replied
          </Button>
        )}
      </div>
    </article>
  );
}

/** The one message, as a document; edit in place. */
function MessageDoc({ message, writing, disabled }: { message?: EnquiryMessage; writing: boolean; disabled: boolean }) {
  const [editing, setEditing] = useState(false);
  if (!message) {
    return (
      <Paper>
        <p className="font-serif text-[17px] leading-7 text-ink-2">{writing ? "Writing your message from what you told us…" : "No message yet."}</p>
      </Paper>
    );
  }
  return (
    <Paper>
      <div className="mb-3 flex items-center justify-between gap-4">
        <Eyebrow>Your message to each firm</Eyebrow>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setEditing((e) => !e)}>
          {editing ? "Done" : "Edit"}
        </Button>
      </div>
      {editing ? (
        <div className="space-y-3">
          <input className={control} value={message.subject} onChange={(e) => setEnquiry({ message: { ...message, subject: e.target.value } })} aria-label="Subject" />
          <textarea rows={12} className={control + " font-serif text-[16px] leading-7"} value={message.body} onChange={(e) => setEnquiry({ message: { ...message, body: e.target.value } })} aria-label="Message" />
        </div>
      ) : (
        <>
          <p className="text-[14px] font-medium text-ink">{message.subject}</p>
          <p className="mt-2 whitespace-pre-wrap font-serif text-[16px] leading-7 text-ink">{message.body}</p>
        </>
      )}
    </Paper>
  );
}

function Modal({ title, sub, onClose, children, footer }: { title: string; sub?: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-6 sm:p-12" role="dialog" aria-modal="true" aria-label={title}>
      <button aria-label="Close" className="fixed inset-0 bg-ink/30" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-card bg-white">
        <header className="flex items-start justify-between gap-4 border-b border-line-soft p-6">
          <div>
            <h2 className="display text-[24px] text-ink">{title}</h2>
            {sub && <div className="mt-1 text-sm text-muted">{sub}</div>}
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </header>
        <div className="space-y-5 p-6">{children}</div>
        {footer && <footer className="border-t border-line-soft p-6">{footer}</footer>}
      </div>
    </div>
  );
}

/**
 * The review (D64). Everything we are about to send is a field you can change, including the message. Required fields we
 * have no answer for are at the top, waiting for you. "Save changes" has the agent type your edits into the firm's real
 * form and read it back; "Approve and send" does that too, then presses Send. Send stays off until nothing required is
 * empty and every consent is ticked by you.
 */
function ApproveModal({ o, local, onClose, onResult }: { o: EnquiryOutcome; local: boolean; onClose: () => void; onResult: (o: EnquiryOutcome) => void }) {
  const fields = fieldsOf(o);
  const key = (f: Pick<FormField, "name" | "label">) => `${f.name}\u0000${f.label}`;
  const [values, setValues] = useState<Record<string, string>>({});
  const [base, setBase] = useState<Record<string, string>>({}); // what the form holds now, to tell what changed
  const [agreed, setAgreed] = useState<string[]>([]);
  const [busy, setBusy] = useState<"save" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [more, setMore] = useState(false);
  const current = (f: FormField) => values[key(f)] ?? f.value;
  const was = (f: FormField) => base[key(f)] ?? f.value;
  const edits: FieldEdit[] = fields.filter((f) => current(f) !== was(f)).map((f) => ({ name: f.name, label: f.label, value: current(f) }));
  const needed = fields.filter((f) => f.required && !current(f).trim());
  const done = o.status === "sent" || o.status === "send_blocked";
  const allAgreed = o.consents.every((c) => agreed.includes(c));

  const waiting = fields.filter((f) => f.required && !was(f).trim());
  const filled = fields.filter((f) => was(f).trim() && !waiting.includes(f));
  const optional = fields.filter((f) => !was(f).trim() && !f.required);

  const afterServer = (next: EnquiryOutcome) => {
    const now: Record<string, string> = {};
    for (const f of fieldsOf(next)) now[key(f)] = f.value;
    setBase(now);
    setValues(now);
    onResult(next);
  };
  async function save() {
    setBusy("save");
    setError(null);
    setSaved(false);
    try {
      afterServer(await editEnquiry(o.firmId, edits, o, local));
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }
  async function send() {
    setBusy("send");
    setError(null);
    try {
      afterServer(await sendEnquiry(o.firmId, agreed, o, edits, local));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const input = (f: FormField, missing: boolean) => {
    const id = `f-${key(f)}`;
    const common = { id, value: current(f), disabled: done || !!busy, "aria-label": f.label, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => { setSaved(false); setValues((v) => ({ ...v, [key(f)]: e.target.value })); } };
    return (
      <div key={key(f)} className="space-y-1">
        <label htmlFor={id} className="flex items-baseline justify-between gap-3 text-[13px]">
          <span className={missing ? "font-medium text-ink" : "text-muted"}>{f.label.replace(/\s*\*$/, "")}</span>
          {missing ? <span className="text-[12px] text-amber">Needed to send</span> : current(f) !== was(f) ? <span className="text-[12px] text-brand">Changed</span> : null}
        </label>
        {f.kind === "textarea" ? (
          <textarea {...common} rows={Math.min(14, Math.max(4, Math.ceil(current(f).length / 70)))} className={cx(control, "font-serif text-[15px] leading-6", missing && "border-amber")} />
        ) : f.kind === "select" && f.options?.length ? (
          <select {...common} className={cx(control, missing && "border-amber")}>
            {!f.options.includes(current(f)) && <option value={current(f)}>{current(f) || "Choose…"}</option>}
            {f.options.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        ) : (
          <input {...common} className={cx(control, missing && "border-amber")} />
        )}
      </div>
    );
  };

  return (
    <Modal
      title={o.firmName}
      sub={o.formUrl ? <a className="break-all text-brand hover:underline" href={o.formUrl} target="_blank" rel="noreferrer">{o.formUrl.replace(/^https?:\/\/(www\.)?/, "")} ↗</a> : undefined}
      onClose={onClose}
      footer={
        done ? (
          <Callout tone={o.status === "sent" ? "ok" : "danger"} title={o.status === "sent" ? "Sent." : "Not sent."}>
            {o.status === "sent" ? o.confirmation ?? o.note : o.note || "This is a demo persona; we never send fictional enquiries to real firms."}
          </Callout>
        ) : (
          <div className="space-y-3">
            {needed.length > 0 && <p className="text-[13px] text-amber">Still needed before we can send: {needed.map((f) => f.label.replace(/\s*\*$/, "")).join(", ")}.</p>}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-muted">The agent presses Send on their page only after you approve.</span>
              <span className="flex items-center gap-2">
                {edits.length > 0 && (
                  <Button variant="secondary" onClick={save} disabled={!!busy}>
                    {busy === "save" ? "Saving…" : `Save changes (${edits.length})`}
                  </Button>
                )}
                <Button onClick={send} disabled={!!busy || !allAgreed || needed.length > 0}>
                  {busy === "send" ? "Sending…" : "Approve and send"}
                </Button>
              </span>
            </div>
          </div>
        )
      }
    >
      {o.status === "partial" && (
        <p className="rounded-card border border-amber/40 bg-amber-soft/40 p-4 text-[13px] leading-5 text-ink-2">
          <span className="font-medium text-ink">Only partly filled.</span> {o.note} Nothing is sent until the form reads back as filled and you approve it.
        </p>
      )}
      {waiting.length > 0 && (
        <section className="space-y-3 rounded-card border border-amber/40 bg-amber-soft/40 p-4">
          <div>
            <p className="text-[14px] font-medium text-ink">Their form needs {waiting.length === 1 ? "one more detail" : `${waiting.length} more details`}</p>
            <p className="text-[12px] leading-5 text-muted">We did not have {waiting.length === 1 ? "this" : "these"} in your case file. Type {waiting.length === 1 ? "it" : "them"} here and the agent puts {waiting.length === 1 ? "it" : "them"} into their form.</p>
          </div>
          {waiting.map((f) => input(f, !current(f).trim()))}
        </section>
      )}

      {filled.length > 0 && (
        <section className="space-y-3">
          <div>
            <Eyebrow>What we will send</Eyebrow>
            <p className="mt-1 text-xs text-muted">This is what the agent put into their form. Change anything that is wrong.</p>
          </div>
          {filled.map((f) => input(f, false))}
        </section>
      )}

      {optional.length > 0 && (
        <div>
          <button className="text-[13px] text-brand hover:underline" onClick={() => setMore((m) => !m)} aria-expanded={more}>
            {more ? "Hide the other fields" : `${optional.length} other optional field${optional.length === 1 ? "" : "s"} on their form`}
          </button>
          {more && <div className="mt-3 space-y-3">{optional.map((f) => input(f, false))}</div>}
        </div>
      )}

      {o.consents.length > 0 && (
        <div>
          <Eyebrow>Their form asks you to agree</Eyebrow>
          <p className="mt-1 text-xs text-muted">We only tick the boxes you tick here.</p>
          <ul className="mt-2 space-y-2">
            {o.consents.map((c) => (
              <li key={c}>
                <label className="flex cursor-pointer items-start gap-3 rounded-card border border-line bg-subtle p-3 text-[13px] leading-5 text-ink">
                  <input type="checkbox" className="mt-0.5 size-4 accent-brand" disabled={done} checked={agreed.includes(c)} onChange={() => setAgreed((a) => (a.includes(c) ? a.filter((x) => x !== c) : [...a, c]))} />
                  {c}
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
      {saved && !error && <p className="text-[13px] text-teal">Saved. The agent has put your changes into their form.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
    </Modal>
  );
}
