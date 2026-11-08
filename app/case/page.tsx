"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { missingForOnboarding, missingRequired } from "../../lib/agent/facts";
import { TRACKS } from "../../lib/agent/track";
import { setDraft, setOmbudsman, setProgress, setRoute, skipStep, useProfile, type Profile } from "../../lib/profile";
import { Button, Callout, Console, PageTitle } from "../ui";
import type { ExtraAnswers } from "../../lib/agent/extra";
import AgentAsk from "./AgentAsk";
import AskMissing from "./AskMissing";
import Header from "./Header";
import CaseRun from "./CaseRun";
import ComplaintRun from "./ComplaintRun";
import DiscoveryRun from "./DiscoveryRun";
import EscalationRun from "./EscalationRun";
import RouteMapCard from "./RouteMap";
import OmbudsmanStep from "./OmbudsmanStep";
import ProfileTab from "./ProfileTab";
import { closeAgentBrowser, streamAgent, type DoneEvent } from "./streamAgent";
import { useStageParam, type Stage } from "./stage";
import TrackBar from "./TrackBar";
import TrackChoice from "./TrackChoice";
import ContactLawyersStep from "./ContactLawyersStep";
import StepAside from "./StepAside";
import UnsupportedComplaint from "./UnsupportedComplaint";
import { supportsLothian } from "../../lib/agent/complaintScope";

export default function CasePage() {
  const router = useRouter();
  const profile = useProfile();
  const [param, go] = useStageParam();
  const [profileOpen, setProfileOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  // /case#profile opens with the profile showing. Read after mount: during a client-side
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

  // Every move starts at the top of the page.
  const stageKey = `${param ?? ""}|${profileOpen}`;
  useEffect(() => {
    scroller.current?.scrollTo(0, 0);
  }, [stageKey]);

  if (!profile) return null;
  const f = profile.facts;
  const name = [f.firstName, f.lastName].filter(Boolean).join(" ") || "you";
  const incomplete = missingForOnboarding(f).length > 0;
  // D42: one track at a time. Research first, then the choice of path, then that path's steps.
  const chosen = profile.track?.chosen ?? null;
  const hasRoute = !!profile.route;
  const trackSteps = chosen ? TRACKS[chosen].steps : [];
  const natural: Stage = !hasRoute ? "research" : !chosen ? "path" : trackSteps[0];
  const open = (s: Stage) => (s === "research" ? true : s === "path" ? hasRoute : hasRoute && trackSteps.includes(s));
  // The address can ask for any stage that is open; anything else falls back to where the case has got to.
  const stage: Stage = param !== null && open(param) ? param : natural;
  const move = (s: Stage) => {
    setProfileOpen(false);
    go(s);
  };

  return (
    <div className="flex h-screen flex-col">
      <Header name={name} profileOpen={profileOpen} incomplete={incomplete} stripes={!profileOpen} onProfile={() => setProfileOpen((o) => !o)} />
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        {!profileOpen && <TrackBar profile={profile} stage={stage} onSelect={move} />}
        {profileOpen ? (
          <>
            <ProfileTab
              profile={profile}
              onClose={() => setProfileOpen(false)}
              onDeleted={() => router.replace("/")}
              onSwitched={(n) => {
                setProfileOpen(false);
                go(n);
              }}
            />
          </>
        ) : (
          <>
            <main className="@container min-w-0">
              {stage === "research" ? (
                !profile.route || "map" in profile.route ? (
                  // Night plan ("Elliot anywhere"): first the crew works out how the system works where the care happened. It stays here afterwards: the crew's history and the result, with more research on any part.
                  <div className="px-8 py-8">
                    <DiscoveryRun
                      profile={profile}
                      saved={profile.route && "map" in profile.route ? profile.route.map : undefined}
                      onDone={(map, sample) => {
                        const first = !profile.route;
                        setRoute({ map, sample });
                        if (first) go("path", true);
                      }}
                      onSkip={() => {
                        setRoute({ skipped: true });
                        go("path", true);
                      }}
                    />
                  </div>
                ) : (
                  <div className="mx-auto max-w-6xl space-y-6 px-8 py-8">
                    <Callout title="You skipped the research">The next steps use general information instead of what the crew would have found for your place.</Callout>
                  </div>
                )
              ) : stage === "path" ? (
                <div className="mx-auto max-w-4xl space-y-10 px-8 py-12">
                  {profile.route && "map" in profile.route && <RouteMapCard route={profile.route.map} />}
                  <TrackChoice profile={profile} onChosen={(n) => go(n)} />
                </div>
              ) : stage === 1 && profile.route && "map" in profile.route ? (
                // With a route map, step 1 is the complaint crew for whichever body discovery found (night plan).
                <div className="px-8 py-8">
                  <ComplaintRun profile={profile} onContinue={() => go(2)} />
                </div>
              ) : stage === 2 && profile.route && "map" in profile.route ? (
                // With a route map, step 2 takes the complaint to whichever independent body discovery found (night plan).
                <div className="px-8 py-8">
                  <EscalationRun profile={profile} route={profile.route.map} goToStepOne={() => go(1)} onContinue={trackSteps.includes(3) ? () => go(3) : undefined} />
                </div>
              ) : stage === 3 ? (
                // Step 3 is Elliot's crew (D49): it uses the whole width while it runs, and a case file when done.
                <div className="px-8 py-8">
                  <CaseRun profile={profile} onReviewEnquiries={() => go(4)} />
                </div>
              ) : stage === 4 ? (
                // Step 4 is firm cards side by side: full width too, no side panel (D46).
                <div className="mx-auto max-w-6xl px-8 py-10">
                  <ContactLawyersStep profile={profile} onBack={() => go(3)} />
                </div>
              ) : (
                <div className="mx-auto grid max-w-6xl gap-12 px-8 py-10 @4xl:grid-cols-[minmax(0,1fr)_280px]">
                  <div className="min-w-0">{stage === 2 ? <OmbudsmanStep profile={profile} goToStepOne={() => go(1)} /> : <StepOne profile={profile} onContinue={() => go(2)} />}</div>
                  <StepAside profile={profile} step={typeof stage === "number" ? stage : 1} />
                </div>
              )}
            </main>
          </>
        )}
      </div>
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
    if (!draft || filling || !supportsLothian(profile.facts)) return;
    setFilling(true);
    window.dispatchEvent(new Event("live-open")); // show the agent's browser beside the page, as soon as it starts
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
        lede="We have written your complaint from what you told us. We fill in NHS Lothian's form with it; you check it there, change anything you like, and press Submit yourself."
      />

      <AskMissing profile={profile} scope="nhs" why="NHS Lothian's form needs this. We only ask it now that you are making a complaint." />

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => fill()} disabled={!canFill}>
          {filling ? "Filling the form…" : preparing ? "Getting it ready…" : "Fill in NHS Lothian's form"}
        </Button>
        {/* Demo (D49): no real complaint is filed, so the demo can go on to step 2 as if NHS Lothian had replied. Always shown, on purpose. */}
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
