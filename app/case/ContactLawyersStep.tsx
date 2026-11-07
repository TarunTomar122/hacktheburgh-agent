"use client";

import type { FirmFinding } from "../../lib/agent/legalAidTypes";
import type { Profile } from "../../lib/profile";
import { Button, Callout, PageTitle } from "../ui";

/** Step 4 placeholder (the backend is being built): lists the firms picked in step 3. Nothing is sent from here yet. */
export default function ContactLawyersStep({ profile, onBack }: { profile: Profile; onBack: () => void }) {
  const result = profile.legalAid?.result;
  const ids = profile.legalAid?.selected ?? [];
  const firms = ids.map((id) => result?.firms.find((f) => f.id === id)).filter((f): f is FirmFinding => !!f);
  return (
    <div className="space-y-8">
      <PageTitle eyebrow="Compensation · step 2" title="Contact lawyers" lede="We send a short enquiry to each solicitor you picked, on their own website. You check each one before it goes." />
      {firms.length === 0 ? (
        <Callout tone="info" title="Pick some solicitors first.">
          In the previous step, tick the firms you would like to contact.
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={onBack}>
              Back to the list
            </Button>
          </div>
        </Callout>
      ) : (
        <>
          <ul className="divide-y divide-line-soft rounded-card border border-line bg-white">
            {firms.map((f) => (
              <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-4">
                <div>
                  <div className="text-[15px] font-medium text-ink">{f.name}</div>
                  <div className="text-sm text-muted">
                    {f.town}
                    {f.enquiryUrl ? " · has an online enquiry form" : " · no online form found"}
                  </div>
                </div>
                {f.fit !== undefined && <span className="text-xs tabular-nums text-muted">{f.fit}% fit</span>}
              </li>
            ))}
          </ul>
          <Callout tone="info" title="Sending enquiries is coming next.">
            Nothing has been sent. This step will fill in each firm&apos;s enquiry form for you to check.
          </Callout>
          <Button variant="secondary" size="sm" onClick={onBack}>
            Change who to contact
          </Button>
        </>
      )}
    </div>
  );
}
