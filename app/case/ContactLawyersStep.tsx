"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EnquiryMessage, EnquiryOutcome, EnquiryRecord, EnquiryStatus } from "../../lib/agent/enquiryTypes";
import type { AgentTile, FirmFinding, Stats, TraceStep } from "../../lib/agent/legalAidTypes";
import { setEnquiry, setOutcome, upsertEnquiries, type Profile } from "../../lib/profile";
import { Button, Callout, control, cx, Eyebrow, PageTitle, Paper } from "../ui";
import { draftMessage, runStep4, sendEnquiry } from "./enquiryRun";
import { closeAgentBrowser } from "./streamAgent";
import { AgentsPanel } from "./LegalAidStep";
import { fixtureMode } from "./legalAidRun";
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
  if (o.status === "filling") return 1;
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
  const outcomes = live ?? saved;
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
        <PageTitle eyebrow="Compensation · step 2" title="Contact lawyers" />
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
    if (!message) return;
    const targets = only ? [only] : firms;
    setRunning(true);
    setError(null);
    setTiles([]);
    setStats(null);
    setLines([]);
    const start = only ? outcomes.map((o) => (o.firmId === only.id ? { ...o, status: "queued" as const, note: "Trying again" } : o)) : targets.map((f) => ({ firmId: f.id, firmName: f.name, status: "queued" as const, formUrl: null, filled: [], unfilled: [], consents: [], note: "Waiting" }));
    setLive(start);
    const upsert = (cur: EnquiryOutcome[] | null, o: EnquiryOutcome) => {
      const list = cur ?? [];
      return list.some((x) => x.firmId === o.firmId) ? list.map((x) => (x.firmId === o.firmId ? o : x)) : [...list, o];
    };
    try {
      const r = await runStep4({ facts: profile.facts, message, firms: targets, reserves: reserves.filter((x) => !outcomes.some((o) => o.firmId === x.id)), legalAid }, (e) => {
        if (e.type === "agent") setTiles((ts) => (ts.some((t) => t.id === e.tile.id) ? ts.map((t) => (t.id === e.tile.id ? e.tile : t)) : [...ts, e.tile]));
        else if (e.type === "stats") setStats(e.stats);
        else if (e.type === "status") setStatus(e.message);
        else if (e.type === "trace") setLines((l) => [...l.slice(-5), e.step]);
        else if (e.type === "enquiry") setLive((cur) => upsert(cur, e.enquiry));
      });
      const merged = r.enquiries.reduce<EnquiryOutcome[]>((acc, o) => upsert(acc, o), only ? outcomes : []);
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

  // Demo (D57): no real enquiry is sent, so the demo can carry on as if every firm had been sent its enquiry.
  const isSent = (id: string) => ["sent", "replied", "not_interested"].includes(records.find((r) => r.firmId === id)?.status ?? "");
  const skipSending = () => {
    void closeAgentBrowser(); // the filled forms are no use any more
    const at = new Date().toISOString();
    const targets: EnquiryOutcome[] = outcomes.length
      ? outcomes.filter((o) => !(o.status === "no_form" && /swapped in/i.test(o.note)))
      : firms.map((f) => ({ firmId: f.id, firmName: f.name, status: "queued" as const, formUrl: null, filled: [], unfilled: [], consents: [], note: "" }));
    const skipped = targets.filter((o) => !isSent(o.firmId) && o.status !== "no_form").map((o) => ({ ...o, status: "sent" as const, sentAt: at, note: "Skipped in the demo: nothing was actually sent" }));
    setEnquiry({ outcomes: [...targets.filter((o) => !skipped.some((s) => s.firmId === o.firmId)), ...skipped] });
    upsertEnquiries(skipped.map((o) => ({ firmId: o.firmId, firmName: o.firmName, status: "sent" as const, sentAt: at, followUpOn: followUpFrom(at) })));
    setLive(null);
  };
  const skippable = outcomes.length ? outcomes.filter((o) => o.status !== "no_form").map((o) => o.firmId) : firms.map((f) => f.id);
  const canSkip = !running && !writing && skippable.some((id) => !isSent(id));
  // A firm with no online form that was replaced drops to a one-line note; one we could not replace keeps its card.
  const swapped = (o: EnquiryOutcome) => o.status === "no_form" && /swapped in/i.test(o.note);
  const active = outcomes.filter((o) => !swapped(o));
  const swappedOut = outcomes.filter(swapped);

  return (
    <div className="@container space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle eyebrow="Compensation · step 2" title="Contact lawyers" />
        {trace.length > 0 && !running && (
          <button className="text-[13px] text-muted hover:text-brand" onClick={() => setScope({ title: "Everything the agents did", steps: trace, whole: true })}>
            Agent log
          </button>
        )}
      </div>

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
                  onOpen={() => {
                    const steps = trace.filter((s) => s.firms?.includes(o.firmId));
                    if (steps.length) setScope({ title: o.firmName, steps });
                  }}
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

      {review && (
        <ApproveModal
          o={review}
          onClose={() => setReview(null)}
          onResult={(o2) => {
            setOutcome(o2);
            setReview(o2);
            if (o2.status === "sent") markSent(o2, o2.sentAt);
          }}
        />
      )}
      {scope && <TraceSheet scope={scope} runId={runId} onClose={() => setScope(null)} />}
    </div>
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
  const sent = o.status === "sent" || rec?.status === "sent" || rec?.status === "replied";
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
              : o.status === "needs_input"
                ? (o.question ?? "Their form asks for something we do not know.")
                : o.status === "no_form"
                  ? "No online enquiry form on their website, and no other checked firm to swap in. A phone call works just as well."
                  : o.note;
  return (
    <article
      onClick={onOpen}
      className={cx(
        "flex cursor-pointer flex-col rounded-card border bg-white p-5 transition-colors hover:border-brand/40",
        o.status === "ready_to_send" ? "border-brand/50" : due ? "border-amber/50" : "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[16px] font-medium leading-6 text-ink">{o.firmName}</h3>
          <p className="text-xs text-muted">
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
          const stuck = o.status === "failed" || o.status === "send_blocked" || o.status === "no_form";
          const now = !sent && i === at && !stuck;
          return (
            <li key={label}>
              <div className={cx("h-1.5 rounded-full", done ? "bg-teal" : now ? (busy ? "animate-pulse bg-brand" : "bg-brand") : stuck && i === at ? (o.status === "no_form" ? "bg-amber/60" : "bg-danger/60") : "bg-line-soft")} />
              <div className={cx("mt-1.5 text-[11px] leading-4", done || now ? "text-ink-2" : "text-faint")}>{label}</div>
            </li>
          );
        })}
      </ol>

      <p className={cx("mt-4 flex-1 text-[13px] leading-5", o.status === "failed" || o.status === "send_blocked" ? "text-danger" : due ? "text-amber" : "text-ink-2")}>
        {due ? `No reply since ${nice(rec?.sentAt)}. Worth a short follow-up now.` : line}
      </p>

      <div className="mt-4" onClick={(e) => e.stopPropagation()}>
        {o.status === "ready_to_send" && !sent && (
          <Button className="w-full" size="sm" onClick={onReview}>
            Review and send
          </Button>
        )}
        {o.status === "failed" && (
          <Button className="w-full" size="sm" variant="secondary" disabled={running} onClick={onRetry}>
            Try again
          </Button>
        )}
        {o.status === "no_form" && firm?.phone && (
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
      <div className="relative w-full max-w-2xl rounded-card bg-white shadow-[0_20px_60px_rgba(0,0,0,0.2)]">
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

/** What the agent filled in, the consent boxes to agree to, then Send. Send stays off until every consent is agreed. */
function ApproveModal({ o, onClose, onResult }: { o: EnquiryOutcome; onClose: () => void; onResult: (o: EnquiryOutcome) => void }) {
  const [agreed, setAgreed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allAgreed = o.consents.every((c) => agreed.includes(c));
  const done = o.status === "sent" || o.status === "send_blocked";
  async function send() {
    setBusy(true);
    setError(null);
    try {
      onResult(await sendEnquiry(o.firmId, agreed, o));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-muted">The agent presses Send on their page only after you approve.</span>
            <Button onClick={send} disabled={busy || !allAgreed || o.unfilled.length > 0}>
              {busy ? "Sending…" : "Approve and send"}
            </Button>
          </div>
        )
      }
    >
      <div>
        <Eyebrow>What we filled in</Eyebrow>
        <dl className="mt-2 grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-[13px]">
          {o.filled.map((x) => (
            <div key={x.label} className="contents">
              <dt className="text-muted">{x.label}</dt>
              <dd className="whitespace-pre-wrap text-ink">{x.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      {o.unfilled.length > 0 && (
        <Callout tone="warn" title="Some required fields are still empty">
          {o.unfilled.join(", ")}. We cannot send until these are filled.
        </Callout>
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
      {error && <p className="text-sm text-danger">{error}</p>}
    </Modal>
  );
}
