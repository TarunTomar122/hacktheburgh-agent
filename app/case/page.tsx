"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { missingForOnboarding } from "../../lib/agent/facts";
import { TRACKS } from "../../lib/agent/track";
import { useProfile } from "../../lib/profile";
import Header from "./Header";
import CaseRun from "./CaseRun";
import ComplaintRun from "./ComplaintRun";
import OmbudsmanStep from "./OmbudsmanStep";
import ProfileTab from "./ProfileTab";
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
              // Step 3 is Elliot's crew (D49): it uses the whole width while it runs, and a case file when done.
              <div className="px-8 py-8">
                <CaseRun profile={profile} onReviewEnquiries={() => setActive(4)} />
              </div>
            ) : active === 1 ? (
              // Step 1 is the complaint crew (D65): the same run screen as step 3, then a complaint file.
              <div className="px-8 py-8">
                <ComplaintRun profile={profile} onContinue={() => setActive(2)} />
              </div>
            ) : active === 4 ? (
              // Step 4 is firm cards side by side: full width too, no side panel (D46).
              <div className="mx-auto max-w-6xl px-8 py-10">
                <ContactLawyersStep profile={profile} onBack={() => setActive(3)} />
              </div>
            ) : (
              <div className="mx-auto grid max-w-6xl gap-12 px-8 py-10 @4xl:grid-cols-[minmax(0,1fr)_280px]">
                <div className="min-w-0">
                  <OmbudsmanStep profile={profile} goToStepOne={() => setActive(1)} />
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
