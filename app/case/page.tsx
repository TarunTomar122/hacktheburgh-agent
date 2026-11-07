"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { missingForOnboarding, missingRequired } from "../../lib/agent/facts";
import { TRACKS } from "../../lib/agent/track";
import { setDraft, setOmbudsman, setProgress, useProfile, type Profile } from "../../lib/profile";
import { Button, Callout, Console, PageTitle } from "../ui";
import type { ExtraAnswers } from "../../lib/agent/extra";
import AgentAsk from "./AgentAsk";
import AskMissing from "./AskMissing";
import Header from "./Header";
import LegalAidStep from "./LegalAidStep";
import OmbudsmanStep from "./OmbudsmanStep";
import ProfileTab from "./ProfileTab";
import { streamAgent, type DoneEvent } from "./streamAgent";
import TrackBar from "./TrackBar";
import TrackChoice from "./TrackChoice";
import ContactLawyersStep from "./ContactLawyersStep";
import StepAside from "./StepAside";

export default function CasePage() {
  const router = useRouter();
  const profile = useProfile();
  const [picked, setActive] = useState<number | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);

  // /case#profile (the logo on the landing page, once a path is chosen) opens with the profile showing. Read after mount: during a client-side
  // navigation the address is not updated yet at the first render.
  useEffect(() => {
    if (window.location.hash === "#profile") {
      setProfileOpen(true); // eslint-disable-line react-hooks/set-state-in-effect
      window.history.replaceState(null, "", window.location.pathname); // so a reload or Back does not reopen it
    }
  }, []);

  useEffect(() => {
    if (profile === null) router.replace("/");
  }, [profile, router]);

  if (!profile) return null;
  const f = profile.facts;
  const name = [f.firstName, f.lastName].filter(Boolean).join(" ") || "you";
  const incomplete = missingForOnboarding(f).length > 0;
  // D42: one track at a time. Before a track is chosen, the page shows the recommendation instead of steps.
  const chosen = profile.track?.chosen ?? null;
  const active = chosen && picked !== null && TRACKS[chosen].steps.includes(picked) ? picked : chosen ? TRACKS[chosen].steps[0] : 1;

  return (
    <div className="flex h-screen flex-col">
      <Header name={name} profileOpen={profileOpen} incomplete={incomplete} stripes={!profileOpen} onProfile={() => setProfileOpen((o) => !o)} onLogo={(to) => setProfileOpen(to === "profile")} />
      {profileOpen ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ProfileTab
            profile={profile}
            onClose={() => setProfileOpen(false)}
            onDeleted={() => router.replace("/")}
            onSwitched={(n) => {
              setActive(n);
              setProfileOpen(false);
            }}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {chosen && <TrackBar profile={profile} active={active} onSelect={setActive} />}
          <main className="@container min-w-0">
            {!chosen ? (
              <div className="mx-auto max-w-4xl px-8 py-12">
                <TrackChoice profile={profile} onChosen={setActive} />
              </div>
            ) : active === 3 ? (
              // Step 3 is a results page: it uses the full width (filters on the left, cards on the right).
              <div className="mx-auto max-w-6xl px-8 py-10">
                <LegalAidStep profile={profile} onContinue={() => setActive(4)} />
              </div>
            ) : active === 4 ? (
              // Step 4 is firm cards side by side: full width too, no side panel (D46).
              <div className="mx-auto max-w-6xl px-8 py-10">
                <ContactLawyersStep profile={profile} onBack={() => setActive(3)} />
              </div>
            ) : (
              <div className="mx-auto grid max-w-6xl gap-12 px-8 py-10 @4xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                  {active === 2 ? (
                    <OmbudsmanStep profile={profile} goToStepOne={() => setActive(1)} />
                  ) : active === 4 ? (
                    <ContactLawyersStep profile={profile} onBack={() => setActive(3)} />
                  ) : (
                    <StepOne profile={profile} onContinue={() => setActive(2)} />
                  )}
                </div>
                <StepAside profile={profile} step={active} />
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}

function StepOne({ profile, onContinue }: { profile: Profile; onContinue: () => void }) {
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
        eyebrow="Complaint · step 1"
        title="Complain to NHS Lothian"
        lede="We have written your complaint from what you told us. We fill in NHS Lothian's form with it; you check it there, change anything you like, and press Submit yourself."
      />

      <AskMissing profile={profile} scope="nhs" why="NHS Lothian's form needs this. We only ask it now that you are making a complaint." />

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => fill()} disabled={!canFill}>
          {filling ? "Filling the form…" : preparing ? "Getting it ready…" : "Fill in NHS Lothian's form"}
        </Button>
        {/* Demo (D48): no real complaint is filed, so the demo can go on to step 2 as if NHS Lothian had replied. Always shown, on purpose. */}
        <Button
          variant="secondary"
          disabled={filling}
          onClick={() => {
            setOmbudsman({ unlocked: true });
            onContinue();
          }}
          title="Demo: nothing is sent to NHS Lothian. Opens step 2 as if they had replied."
        >
          Skip and continue to step 2 (demo)
        </Button>
      </div>

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
