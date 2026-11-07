"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EnquiryMessage, EnquiryOutcome, EnquiryRecord, EnquiryStatus } from "../../lib/agent/enquiryTypes";
import type { AgentTile, FirmFinding, Stats, TraceStep } from "../../lib/agent/legalAidTypes";
import { setEnquiry, setOutcome, upsertEnquiries, type Profile } from "../../lib/profile";
import { Button, Callout, control, cx, Eyebrow, PageTitle, Paper, SectionTitle, selectControl } from "../ui";
import { draftMessage, runStep4, sendEnquiry } from "./enquiryRun";
import { AgentsPanel } from "./LegalAidStep";
import { fixtureMode } from "./legalAidRun";
import TraceSheet, { type TraceScope } from "./TraceSheet";

/**
 * Step 4 (D45): contact up to 3 firms. D33 pattern: the firms, the message (editable), one button. The agents fill each firm's
 * enquiry form and stop; the user approves each firm (seeing what was filled and any consent boxes) and only then does the agent
 * press Send. No form found -> an email draft. Replies are tracked by hand below.
 */

const STATUS: Record<EnquiryStatus, { t: string; cls: string }> = {
  queued: { t: "Waiting", cls: "bg-subtle text-muted" },
  finding_form: { t: "Looking for their form", cls: "bg-brand-soft text-brand" },
  filling: { t: "Filling their form", cls: "bg-brand-soft text-brand" },
  ready_to_send: { t: "Ready for your approval", cls: "bg-brand text-white" },
  needs_input: { t: "Needs an answer", cls: "bg-amber-soft text-amber" },
  email_draft: { t: "No form: email ready", cls: "bg-amber-soft text-amber" },
  sending: { t: "Sending", cls: "bg-brand-soft text-brand" },
  sent: { t: "Sent", cls: "bg-teal-soft text-teal" },
  send_blocked: { t: "Not sent", cls: "bg-danger-soft text-danger" },
  failed: { t: "Failed", cls: "bg-danger-soft text-danger" },
};

const TRACK_STATUS: Record<EnquiryRecord["status"], string> = {
  draft: "Not sent yet",
  ready_to_send: "Ready to send",
  email_draft: "Email to send",
  sent: "Sent, waiting for a reply",
  replied: "They replied",
  not_interested: "Not interested",
};

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

export default function ContactLawyersStep({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const result = profile.legalAid?.result;
  const firms = (profile.legalAid?.selected ?? []).map((id) => result?.firms.find((f) => f.id === id)).filter((f): f is FirmFinding => !!f);
  const verdict = result?.verdict;
  const route = result?.route;
  const legalAid = useMemo(() => (verdict && route ? { verdict, route } : undefined), [verdict, route]);
  const message = profile.enquiry?.message;
  const saved = profile.enquiry?.outcomes ?? [];
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
  const [email, setEmail] = useState<EnquiryOutcome | null>(null);
  const [scope, setScope] = useState<TraceScope | null>(null);

  // The message is written once from the profile; the user can edit it.
  const asked = useRef(false);
  useEffect(() => {
    if (message || firms.length === 0 || asked.current) return;
    asked.current = true;
    setWriting(true);
    draftMessage(profile.facts, legalAid)
      .then((m) => setEnquiry({ message: m }))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setWriting(false));
  }, [message, firms.length, profile.facts, legalAid]);

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

  async function run() {
    if (!message) return;
    setRunning(true);
    setError(null);
    setTiles([]);
    setStats(null);
    setLines([]);
    setTrace([]);
    setLive(firms.map((f) => ({ firmId: f.id, firmName: f.name, status: "queued", formUrl: null, filled: [], unfilled: [], consents: [], note: "Waiting" })));
    try {
      const r = await runStep4({ facts: profile.facts, message, firms, legalAid }, (e) => {
        if (e.type === "agent") setTiles((ts) => (ts.some((t) => t.id === e.tile.id) ? ts.map((t) => (t.id === e.tile.id ? e.tile : t)) : [...ts, e.tile]));
        else if (e.type === "stats") setStats(e.stats);
        else if (e.type === "status") setStatus(e.message);
        else if (e.type === "trace") setLines((l) => [...l.slice(-5), e.step]);
        else if (e.type === "enquiry") setLive((cur) => (cur ?? []).map((o) => (o.firmId === e.enquiry.firmId ? e.enquiry : o)));
      });
      setTrace(r.trace);
      setRunId(r.runId);
      setEnquiry({ outcomes: r.enquiries, runId: r.runId, sample: fixtureMode() });
      upsertEnquiries(
        r.enquiries
          .filter((o) => o.status === "ready_to_send" || o.status === "email_draft")
          .map((o) => ({ firmId: o.firmId, firmName: o.firmName, status: o.status as "ready_to_send" | "email_draft" })),
      );
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

  return (
    <div className="space-y-8">
      <PageTitle eyebrow="Compensation · step 2" title="Contact lawyers" lede="We fill in each firm's enquiry form with your message and stop. You check each one, and only then do we press Send." />

      {/* The firms, compact */}
      <div className="flex flex-wrap items-center gap-2">
        {firms.map((f) => (
          <span key={f.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-[13px] text-ink">
            {f.name}
            {f.fit !== undefined && <span className="tabular-nums text-muted">{f.fit}%</span>}
          </span>
        ))}
        <button className="text-[13px] text-brand hover:underline" onClick={onBack}>
          Change
        </button>
      </div>

      <MessageDoc message={message} writing={writing} disabled={running} />

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button onClick={run} disabled={!message || running || writing}>
        {running ? "Filling their forms…" : outcomes.length ? "Fill their forms again" : "Fill their enquiry forms"}
      </Button>

      {running && <AgentsPanel tiles={tiles} stats={stats} status={status} live={lines} />}

      {outcomes.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>Each firm</SectionTitle>
          {profile.enquiry?.sample && !running && (
            <p className="text-xs text-amber">Sample data (fixture): nothing was visited and nothing can be sent.</p>
          )}
          <ul className="divide-y divide-line-soft rounded-card border border-line bg-white">
            {outcomes.map((o) => (
              <li key={o.firmId} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4">
                <div className="min-w-[14rem] flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[15px] font-medium text-ink">{o.firmName}</span>
                    <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-medium", STATUS[o.status].cls)}>{STATUS[o.status].t}</span>
                  </div>
                  <p className="mt-1 text-[13px] leading-5 text-ink-2">{o.status === "send_blocked" && !o.note ? "Not sent: this is a demo persona; we never send fictional enquiries to real firms." : o.note}</p>
                  {o.question && <p className="mt-1 text-[13px] text-amber">The form asks: {o.question}</p>}
                  {o.sentAt && <p className="mt-1 text-xs text-muted">Sent {nice(o.sentAt)}{o.confirmation ? `. They said: “${o.confirmation}”` : ""}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {trace.some((s) => s.firms?.includes(o.firmId)) && (
                    <Button variant="ghost" size="sm" onClick={() => setScope({ title: o.firmName, steps: trace.filter((s) => s.firms?.includes(o.firmId)) })}>
                      How we did it
                    </Button>
                  )}
                  {(o.status === "ready_to_send" || o.status === "send_blocked") && (
                    <Button size="sm" variant={o.status === "ready_to_send" ? "primary" : "secondary"} onClick={() => setReview(o)}>
                      Review and approve
                    </Button>
                  )}
                  {o.status === "email_draft" && (
                    <Button size="sm" variant="secondary" onClick={() => setEmail(o)}>
                      Open email draft
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {trace.length > 0 && (
            <button className="text-[13px] text-brand hover:underline" onClick={() => setScope({ title: "The whole run", steps: trace, whole: true })}>
              See everything the agents did
            </button>
          )}
        </section>
      )}

      <Tracker records={profile.enquiries ?? []} />

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
      {email && (
        <EmailModal
          o={email}
          onClose={() => setEmail(null)}
          onSent={() => {
            markSent(email);
            setEmail(null);
          }}
        />
      )}
      {scope && <TraceSheet scope={scope} runId={runId} onClose={() => setScope(null)} />}
    </div>
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

function EmailModal({ o, onClose, onSent }: { o: EnquiryOutcome; onClose: () => void; onSent: () => void }) {
  const [copied, setCopied] = useState(false);
  const e = o.email;
  return (
    <Modal
      title={o.firmName}
      sub="We could not find an online form, so here is an email to send yourself."
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-3">
          {e && (
            <a href={e.mailto} className="inline-flex items-center rounded-ctl bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand/90">
              Open in your email app
            </a>
          )}
          {e && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                void navigator.clipboard?.writeText(`${e.subject}\n\n${e.body}`).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy the text"}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onSent}>
            I&apos;ve sent it
          </Button>
        </div>
      }
    >
      {e ? (
        <dl className="grid grid-cols-[80px_1fr] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-muted">To</dt>
          <dd className="break-all text-ink">{e.to ?? "We did not find an address. Use the firm's website."}</dd>
          <dt className="text-muted">Subject</dt>
          <dd className="text-ink">{e.subject}</dd>
          <dt className="text-muted">Message</dt>
          <dd className="whitespace-pre-wrap font-serif text-[15px] leading-6 text-ink">{e.body}</dd>
        </dl>
      ) : (
        <p className="text-sm text-ink-2">No email draft came back.</p>
      )}
    </Modal>
  );
}

/** Replies, tracked by hand until the app can read the inbox. A nudge appears once the follow-up date has passed. */
function Tracker({ records }: { records: EnquiryRecord[] }) {
  if (records.length === 0) return null;
  const due = records.filter((r) => r.status === "sent" && r.followUpOn && r.followUpOn <= today());
  return (
    <section className="space-y-3">
      <SectionTitle>Replies</SectionTitle>
      {due.map((r) => (
        <Callout key={r.firmId} tone="warn" title={`No reply from ${r.firmName} yet`}>
          You sent it on {nice(r.sentAt)}. A short follow-up email or call is reasonable now (our rule of thumb is 3 working days, not a legal deadline).
        </Callout>
      ))}
      <ul className="divide-y divide-line-soft rounded-card border border-line bg-white">
        {records.map((r) => (
          <li key={r.firmId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
            <div className="min-w-[12rem] flex-1">
              <div className="text-[14px] font-medium text-ink">{r.firmName}</div>
              <div className="text-xs text-muted">
                {r.sentAt ? `Sent ${nice(r.sentAt)}` : "Not sent yet"}
                {r.followUpOn && r.status === "sent" && ` · follow up from ${nice(r.followUpOn)}`}
              </div>
            </div>
            <select
              className={selectControl + " !w-56"}
              value={r.status}
              aria-label={`Status for ${r.firmName}`}
              onChange={(e) => {
                const status = e.target.value as EnquiryRecord["status"];
                const sentAt = status === "sent" && !r.sentAt ? new Date().toISOString() : r.sentAt;
                upsertEnquiries([{ firmId: r.firmId, status, sentAt, followUpOn: sentAt ? followUpFrom(sentAt) : r.followUpOn }]);
              }}
            >
              {(Object.keys(TRACK_STATUS) as EnquiryRecord["status"][]).map((k) => (
                <option key={k} value={k}>
                  {TRACK_STATUS[k]}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
    </section>
  );
}
