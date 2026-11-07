"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { missingRequired } from "../../lib/agent/facts";
import { setDraft, setProgress, useProfile, type Profile } from "../../lib/profile";
import { ActionCard, Button, Callout, Console, control, Eyebrow, PageTitle, Paper, SectionTitle } from "../ui";
import Header from "./Header";
import OmbudsmanStep from "./OmbudsmanStep";
import ProfileTab, { FIELD_LABELS } from "./ProfileTab";
import { streamAgent, type DoneEvent } from "./streamAgent";
import Timeline from "./Timeline";

export default function CasePage() {
  const router = useRouter();
  const profile = useProfile();
  const [active, setActive] = useState(1);
  const [profileOpen, setProfileOpen] = useState(false);

  useEffect(() => {
    if (profile === null) router.replace("/");
  }, [profile, router]);

  if (!profile) return null;
  const f = profile.facts;
  const name = [f.firstName, f.lastName].filter(Boolean).join(" ") || "you";
  const incomplete = missingRequired(f).length > 0;

  return (
    <div className="flex h-screen flex-col">
      <Header name={name} profileOpen={profileOpen} incomplete={incomplete} stripes={!profileOpen} onProfile={() => setProfileOpen((o) => !o)} />
      {profileOpen ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ProfileTab profile={profile} onClose={() => setProfileOpen(false)} onDeleted={() => router.replace("/")} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <Timeline profile={profile} active={active} onSelect={setActive} />
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-3xl px-12 py-12">
              {active === 2 ? (
                <OmbudsmanStep profile={profile} goToStepOne={() => setActive(1)} />
              ) : (
                <StepOne profile={profile} openProfile={() => setProfileOpen(true)} />
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

/** One part of the draft: reads like a document, edits in place. */
function DraftBlock({ label, value, rows, disabled, onChange }: { label: string; value: string; rows: number; disabled: boolean; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  return (
    <section className="py-5 first:pt-0 last:pb-0 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-rail/70">
      <div className="mb-2 flex items-center justify-between">
        <Eyebrow>{label}</Eyebrow>
        <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setEditing((e) => !e)}>
          {editing ? "Done" : "Edit"}
        </Button>
      </div>
      {editing ? (
        <textarea autoFocus rows={rows} className={control + " font-serif text-[17px] leading-7"} value={value} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <p className="whitespace-pre-wrap font-serif text-[17px] leading-7 text-ink">{value || <span className="text-faint">Nothing here yet.</span>}</p>
      )}
    </section>
  );
}

function StepOne({ profile, openProfile }: { profile: Profile; openProfile: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<DoneEvent | null>(null);
  const missing = missingRequired(profile.facts);
  const draft = profile.draft;

  async function fill() {
    if (!draft || filling) return;
    setFilling(true);
    setError(null);
    setResult(null);
    setLog(["Starting the browser agent…"]);
    try {
      const done = await streamAgent("/api/agent/step1", { facts: profile.facts, draft }, (line) => setLog((p) => [...p.slice(-19), line]));
      setResult(done);
      if (done.status === "ready_to_submit") setProgress({ nhsFilled: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFilling(false);
    }
  }

  async function write() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agent/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ facts: profile.facts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not write the draft");
      setDraft(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const canFill = !busy && !filling && missing.length === 0 && !!draft?.details.trim() && !!draft?.location.trim();

  return (
    <div className="space-y-10">
      <PageTitle
        eyebrow="Step 1"
        title="Complain to NHS Lothian"
        lede="We write the complaint from what you told us. You read it, change anything you like, and nothing is sent until you approve."
      />

      {missing.length > 0 && (
        <Callout tone="warn" title="We still need a few details">
          {missing.map((k) => FIELD_LABELS[k] ?? k).join(", ")}.{" "}
          <button onClick={openProfile} className="font-medium text-brand underline underline-offset-2">
            Open your profile
          </button>
        </Callout>
      )}

      <section className="space-y-4">
        <SectionTitle
          aside={
            <Button variant="secondary" size="sm" onClick={write} disabled={busy || filling || missing.length > 0}>
              {busy ? "Writing…" : draft ? "Write it again" : "Write my draft"}
            </Button>
          }
        >
          Your complaint
        </SectionTitle>
        {error && <p className="text-sm text-danger">{error}</p>}
        {!draft ? (
          <Paper>
            <p className="font-serif text-[17px] leading-7 text-ink-2">
              {busy ? "Writing your complaint…" : "We write this from your profile. Press “Write my draft” and you can edit every word."}
            </p>
          </Paper>
        ) : (
          <Paper>
            <DraftBlock label="What happened" value={draft.details} rows={12} disabled={filling} onChange={(v) => setDraft({ ...draft, details: v })} />
            <DraftBlock label="Where it happened" value={draft.location} rows={2} disabled={filling} onChange={(v) => setDraft({ ...draft, location: v })} />
            <DraftBlock label="What you would like to happen" value={draft.outcome} rows={3} disabled={filling} onChange={(v) => setDraft({ ...draft, outcome: v })} />
          </Paper>
        )}
      </section>

      <ActionCard
        title="Happy with it?"
        action={
          <Button onClick={fill} disabled={!canFill}>
            {filling ? "Filling the form…" : "Approve and fill the form"}
          </Button>
        }
      >
        We open the NHS Lothian form in a separate browser window and fill it in. The window stays open for up to 10 minutes so you can check it. Demo
        data is for review only.
      </ActionCard>

      {log.length > 0 && (
        <section className="space-y-3">
          <Eyebrow>Browser activity</Eyebrow>
          <Console label="Browser agent progress" lines={log} />
        </section>
      )}

      {result && (
        <Callout tone={result.status === "ready_to_submit" ? "ok" : "warn"} title={result.status === "ready_to_submit" ? "Form filled and ready for review" : "The form needs your attention"}>
          <p>{result.summary}</p>
          {result.question && <p className="mt-1">{result.question}</p>}
          {result.unfilled.length > 0 && <p className="mt-1">Still needed: {result.unfilled.join(", ")}</p>}
          <p className="mt-2">Nothing has been submitted. Review the separate browser window.</p>
          {result.status === "ready_to_submit" && (
            <div className="mt-3">
              {profile.progress?.nhsSent ? (
                <span className="font-medium text-teal">Marked as sent. Nice work.</span>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setProgress({ nhsSent: true })}>
                  I&apos;ve pressed Send
                </Button>
              )}
            </div>
          )}
          {result.status !== "ready_to_submit" && (
            <button onClick={openProfile} className="mt-2 font-medium text-brand underline underline-offset-2">
              Review your profile before retrying
            </button>
          )}
        </Callout>
      )}
    </div>
  );
}
