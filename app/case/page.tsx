"use client";

import { useEffect, useRef, useState } from "react";
import { missingForOnboarding, missingRequired } from "../../lib/agent/facts";
import { TRACKS } from "../../lib/agent/track";
import { addStepEffort, setDraft, setOmbudsman, setProgress, skipStep, useProfile, type Profile } from "../../lib/profile";
import { useAccount } from "../AccountMenu";
import { Button, Callout, PageTitle } from "../ui";
import type { ExtraAnswers } from "../../lib/agent/extra";
import AgentAsk from "./AgentAsk";
import AskMissing from "./AskMissing";
import TimeLimitNote from "./TimeLimitNote";
import Header from "./Header";
import CaseRun from "./CaseRun";
import OmbudsmanStep from "./OmbudsmanStep";
import ProfileTab from "./ProfileTab";
import { closeAgentBrowser, streamAgent, type DoneEvent } from "./streamAgent";
import TrackBar from "./TrackBar";
import TrackChoice from "./TrackChoice";
import ComplaintEmail from "./ComplaintEmail";
import ContactLawyersStep from "./ContactLawyersStep";
import { milestones } from "./progress";
import StepAside from "./StepAside";
import UnsupportedComplaint from "./UnsupportedComplaint";
import YellowCardStep from "./YellowCardStep";
import { supportsLothian } from "../../lib/agent/complaintScope";

export default function CasePage() {
  const profile = useProfile();
  const account = useAccount();
  const leaving = useRef(false); // set while "Delete all my data" is finishing, so the page does not jump away first
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

  // The agent's browser saw the user press Submit on a form it filled (lib/browser.ts closeWhenSubmitted): do what "I've pressed Submit" does
  // and nothing more. The page stays where it is; its button then changes (NHS: "Continue to Ombudsman") and the user moves on when they choose.
  useEffect(() => {
    const onSubmitted = (e: Event) => {
      const flow = (e as CustomEvent<string>).detail;
      if (flow === "nhs") setProgress({ nhsSent: true });
      else if (flow === "spso") setProgress({ spsoSent: true });
      else if (flow === "yellowcard") setProgress({ ycSent: true });
    };
    window.addEventListener("agent-submitted", onSubmitted);
    return () => window.removeEventListener("agent-submitted", onSubmitted);
  }, []);

  useEffect(() => {
    // A full page load, not router.replace: with Cache Components the start page you left earlier is kept alive with its state, so a client-side
    // return would show the old "check your details" screen (D76) instead of a blank form.
    if (profile === null && !leaving.current) window.location.replace("/");
  }, [profile]);

  if (!profile) return null;
  const f = profile.facts;
  const name = [f.firstName, f.lastName].filter(Boolean).join(" ") || "you";
  const incomplete = missingForOnboarding(f).length > 0;
  // D42: one track at a time. Before a track is chosen, the page shows the recommendation instead of steps.
  const chosen = profile.track?.chosen ?? null;
  const emailMode = chosen === "complaint" && profile.track?.complaintMode === "email";
  // Which step opens (D75): the one the person picked this visit, otherwise the first step of the track that still has something to do (so a
  // case saved to the account reopens where it was left, on any device), otherwise the last step once everything is done.
  const trackSteps = chosen ? TRACKS[chosen].steps : [];
  const ms = milestones(profile);
  const resume = trackSteps.find((s) => ms.some((m) => m.step === s && !m.done)) ?? trackSteps[trackSteps.length - 1] ?? 1;
  const active = chosen && picked !== null && trackSteps.includes(picked) ? picked : chosen ? resume : 1;

  return (
    <div className="flex h-screen flex-col">
      <Header name={name} profileOpen={profileOpen} incomplete={incomplete} stripes={!profileOpen} onProfile={() => setProfileOpen((o) => !o)} onLogo={(to) => setProfileOpen(to === "profile")} />
      {profileOpen ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ProfileTab
            profile={profile}
            onClose={() => setProfileOpen(false)}
            onDeleting={() => {
              leaving.current = true;
            }}
            // After "Delete all my data" a signed-in user is signed out and lands on the login screen (/auth/logout ends at /welcome).
            // A demo case or a browser-only case goes back to the start page.
            onDeleted={(wasDemo) => window.location.replace(!wasDemo && account.sub ? "/auth/logout" : "/")}
            onSwitched={(n) => {
              setActive(n);
              setProfileOpen(false);
            }}
          />
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {chosen && !emailMode && <TrackBar profile={profile} active={active} onSelect={setActive} />}
          <main className="@container min-w-0">
            {emailMode ? <ComplaintEmail profile={profile} /> : !chosen ? (
              <div className="mx-auto max-w-4xl px-8 py-12">
                <TrackChoice profile={profile} onChosen={setActive} />
              </div>
            ) : active === 3 ? (
              // Step 3 is Elliot's crew (D49): it uses the whole width while it runs, and a case file when done.
              <div className="px-8 py-8">
                <CaseRun profile={profile} onReviewEnquiries={() => setActive(4)} />
              </div>
            ) : active === 4 ? (
              // Step 4 is firm cards side by side: full width too, no side panel (D46).
              <div className="mx-auto max-w-6xl px-8 py-10">
                <ContactLawyersStep profile={profile} onBack={() => setActive(3)} />
              </div>
            ) : (
              <div className="mx-auto grid max-w-6xl gap-12 px-8 py-10 @4xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                  {active === 6 ? (
                    <YellowCardStep profile={profile} />
                  ) : active === 2 ? (
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
  const [result, setResult] = useState<DoneEvent | null>(null);
  const missing = missingRequired(profile.facts);
  const draft = profile.draft;

  async function fill(extra?: ExtraAnswers) {
    if (!draft || filling || !supportsLothian(profile.facts)) return;
    setFilling(true);
    setProgress({ nhsFilled: false, nhsSent: false }); // a new form has not been sent yet, whatever an earlier one did
    window.dispatchEvent(new Event("live-open")); // show the agent's browser beside the page, as soon as it starts
    setError(null);
    setResult(null);
    try {
      const done = await streamAgent("/api/agent/step1", { facts: profile.facts, draft, extra }, () => {});
      setResult(done);
      if (done.effort) addStepEffort(1, done.effort); // patient insights: what Elliot did on this run
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
    if (supportsLothian(profile.facts) && !draft && missing.length === 0 && !autoWrote.current) {
      autoWrote.current = true;
      void write();
    }
  });

  if (!supportsLothian(profile.facts)) return <UnsupportedComplaint key={JSON.stringify(profile.facts)} facts={profile.facts} />;

  const preparing = busy || (!draft && missing.length === 0);

  return (
    <div className="space-y-8">
      <PageTitle
        eyebrow="Complaint · step 1"
        title="Complain to NHS Lothian"
        lede="Elliot has written your complaint from what you told him. He fills in NHS Lothian's form with it; you check it there, change anything you like, and press Submit yourself."
      />

      <TimeLimitNote profile={profile} kind="nhs" />

      <AskMissing profile={profile} scope="nhs" why="NHS Lothian's form needs this. Elliot only asks it now that you are making a complaint." />

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => fill()} disabled={!canFill}>
          {filling ? "Filling the form…" : preparing ? "Getting it ready…" : "Fill in NHS Lothian's form"}
        </Button>
        {/* Demo (D49): no real complaint is filed, so the demo can go on to step 2 as if NHS Lothian had replied. Always shown, on purpose.
            Once the complaint is marked sent (the agent's browser saw Submit, or "I've pressed Submit") it becomes the plain way on, and skips nothing. */}
        {profile.progress?.nhsSent ? (
          <Button
            disabled={filling}
            onClick={() => {
              void closeAgentBrowser();
              setOmbudsman({ unlocked: true });
              onContinue();
            }}
          >
            Continue to Ombudsman
          </Button>
        ) : (
          <Button
            variant="secondary"
            disabled={filling}
            onClick={() => {
              void closeAgentBrowser(); // the half-filled form is no use any more
              skipStep(1);
              setOmbudsman({ unlocked: true });
              onContinue();
            }}
            title="Demo: nothing is sent to NHS Lothian. Opens step 2 as if they had replied."
          >
            Skip and continue to step 2 (demo)
          </Button>
        )}
      </div>


      {result &&
        (result.status === "ready_to_submit" ? (
          <Callout tone="ok" title="Done. It is waiting for you in the browser panel.">
            <p>Check it there, change anything you like, then press Submit yourself. Nothing has been sent. Click &ldquo;Take control&rdquo; in the panel first: your clicks only reach the form while it is on.</p>
            <div className="mt-3">
              {profile.progress?.nhsSent ? (
                <span className="font-medium text-teal">Marked as sent. Nice work.</span>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => {
                    void closeAgentBrowser();
                    setProgress({ nhsSent: true });
                  }}>
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
