"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { missingRequired } from "../../lib/agent/facts";
import { setDraft, setProgress, useProfile, type Profile } from "../../lib/profile";
import { Button, Callout, Console, PageTitle } from "../ui";
import type { ExtraAnswers } from "../../lib/agent/extra";
import AgentAsk from "./AgentAsk";
import AskMissing from "./AskMissing";
import Header from "./Header";
import OmbudsmanStep from "./OmbudsmanStep";
import ProfileTab from "./ProfileTab";
import { streamAgent, type DoneEvent } from "./streamAgent";
import PathMap from "./PathMap";

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
        <div className="min-h-0 flex-1 overflow-y-auto">
          <PathMap profile={profile} active={active} onSelect={setActive} onOpenProfile={() => setProfileOpen(true)} />
          <main className="min-w-0">
            <div className="mx-auto max-w-3xl px-12 py-12">
              {active === 2 ? (
                <OmbudsmanStep profile={profile} goToStepOne={() => setActive(1)} />
              ) : (
                <StepOne profile={profile} />
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

function StepOne({ profile }: { profile: Profile }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [result, setResult] = useState<DoneEvent | null>(null);
  const missing = missingRequired(profile.facts);
  const draft = profile.draft;

  async function fill(extra?: ExtraAnswers) {
    if (!draft || filling) return;
    setFilling(true);
    setError(null);
    setResult(null);
    setLog(["Starting the browser agent…"]);
    try {
      const done = await streamAgent("/api/agent/step1", { facts: profile.facts, draft, extra }, (line) => setLog((p) => [...p.slice(-19), line]));
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

  // Nothing to fill in here: once onboarding has everything, the agent writes the draft by itself (once).
  const autoWrote = useRef(false);
  useEffect(() => {
    if (!draft && missing.length === 0 && !autoWrote.current) {
      autoWrote.current = true;
      void write();
    }
  });

  const preparing = busy || (!draft && missing.length === 0);

  return (
    <div className="space-y-8">
      <PageTitle
        eyebrow="Step 1"
        title="Complain to NHS Lothian"
        lede="We have written your complaint from what you told us. We fill in NHS Lothian's form with it; you check it there, change anything you like, and press Submit yourself."
      />

      <AskMissing profile={profile} why="The NHS form needs this, and it was not covered when we first talked." />

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button onClick={() => fill()} disabled={!canFill}>
        {filling ? "Filling the form…" : preparing ? "Getting it ready…" : "Fill in NHS Lothian's form"}
      </Button>

      {log.length > 0 && <Console label="Browser agent progress" lines={log} />}

      {result &&
        (result.status === "ready_to_submit" ? (
          <Callout tone="ok" title="Done. It is waiting for you in the other window.">
            <p>Check it there, change anything you like, then press Submit yourself. Nothing has been sent.</p>
            <div className="mt-3">
              {profile.progress?.nhsSent ? (
                <span className="font-medium text-teal">Marked as sent. Nice work.</span>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setProgress({ nhsSent: true })}>
                  I&apos;ve pressed Submit
                </Button>
              )}
            </div>
          </Callout>
        ) : (
          <AgentAsk key={result.summary + result.unfilled.join()} result={result} busy={filling} onAnswer={(extra) => fill(extra)} />
        ))}
    </div>
  );
}
