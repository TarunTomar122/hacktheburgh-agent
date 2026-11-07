"use client";

import { missingForOnboarding, missingRequired, placeIsUK, type CaseFacts } from "../../lib/agent/facts";
import { EMAIL_DISCLAIMER, emailProblem, formatPostcode, phoneProblem, postcodeProblem, splitPostcode, TITLES } from "../../lib/agent/inputs";
import DateField from "../DateField";
import { clearProfile, setTrack, updateFacts, type Profile } from "../../lib/profile";
import { TRACKS, type TrackId } from "../../lib/agent/track";
import { FitRing } from "./scoreParts";
import { Button, Callout, control, Eyebrow, Field, SectionTitle, selectControl } from "../ui";
import { Stripes } from "./Header";

export const FIELD_LABELS: Record<string, string> = {
  complainingFor: "Who the complaint is about",
  firstName: "First name",
  lastName: "Last name",
  address: "Address",
  postcode: "Postcode",
  phone: "Telephone",
  email: "Email",
  preferredContact: "How to contact you",
  country: "Country",
  region: "Region",
  incidentLocation: "Where it happened",
  incidentSummary: "What happened",
  events: "Timeline (at least one dated event)",
  emailRiskAccepted: "Email disclaimer answer",
};

const input = control;


export default function ProfileTab({ profile, onClose, onDeleted, onSwitched }: { profile: Profile; onClose: () => void; onDeleted: () => void; onSwitched?: (firstStep: number) => void }) {
  const f = profile.facts;
  // How the reply should come is only needed for the complaint path, and only asked once the user takes it (D42).
  const forNhs = profile.track?.chosen === "complaint";
  const missing = forNhs ? missingRequired(f) : missingForOnboarding(f);
  const text = (k: keyof CaseFacts) => (f[k] as string | null) ?? "";
  const set = (k: keyof CaseFacts) => (v: string) => updateFacts({ [k]: v === "" ? null : v } as Partial<CaseFacts>);
  // UK postcode and phone rules only for a UK place (null = place not known yet).
  const uk = placeIsUK(f);

  function setEvent(i: number, patch: Partial<CaseFacts["events"][number]>) {
    updateFacts({ events: f.events.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  }

  const set2 = <K extends keyof CaseFacts>(k: K, v: CaseFacts[K]) => updateFacts({ [k]: v } as Partial<CaseFacts>);

  return (
    <div>
      {/* The header's blue carries on into the page title, then stops with the stepped lines. */}
      <div className="bg-brand text-white">
        <div className="mx-auto max-w-3xl px-12 pb-14 pt-10">
          <h1 className="display text-[48px] text-white">Your profile</h1>
          <p className="mt-3 max-w-[52ch] text-[15px] leading-6 text-white/85">
            This is what the agent uses to fill in forms for you. Changes save as you type, on this device only.
          </p>
        </div>
      </div>
      <Stripes />

      <div className="mx-auto max-w-3xl space-y-12 px-12 py-12">
        <PathSection profile={profile} onContinue={onClose} onSwitched={onSwitched} />

        {missing.length > 0 ? (
          <Callout tone="warn" title={forNhs ? "Still needed for the complaint form" : "Still needed"}>
            {missing.map((k) => FIELD_LABELS[k] ?? k).join(", ")}.
          </Callout>
        ) : (
          <Callout tone="ok" title={forNhs ? "Everything the complaint form needs is here." : "Everything we need so far is here."} />
        )}

        <section className="space-y-5">
          <SectionTitle>About you</SectionTitle>
          <div className="grid grid-cols-2 gap-x-5 gap-y-5">
            <Field label="Title">
              <select className={selectControl} autoComplete="honorific-prefix" value={text("title")} onChange={(e) => set("title")(e.target.value)}>
                <option value="">Not given</option>
                {/* keep a title that was typed earlier or came from the interview, even if it is not in the list */}
                {text("title") && !(TITLES as readonly string[]).includes(text("title")) && <option value={text("title")}>{text("title")}</option>}
                {TITLES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <div />
            <Field label="First name">
              <input className={input} value={text("firstName")} onChange={(e) => set("firstName")(e.target.value)} />
            </Field>
            <Field label="Last name">
              <input className={input} value={text("lastName")} onChange={(e) => set("lastName")(e.target.value)} />
            </Field>
            <Field label="Address" className="col-span-2">
              <input
                className={input}
                autoComplete="street-address"
                value={text("address")}
                onChange={(e) => set("address")(e.target.value)}
                onBlur={(e) => {
                  // A postcode typed inside the address goes to the postcode field, if that is empty (D44).
                  const found = uk !== false && !f.postcode?.trim() ? splitPostcode(e.target.value) : null;
                  if (found) {
                    set("address")(found.address);
                    set("postcode")(found.postcode);
                  }
                }}
              />
            </Field>
            <Field label={uk === true ? "Postcode" : "Postcode (if you have one)"} problem={f.postcode ? postcodeProblem(f.postcode, uk) : null}>
              <input
                className={input}
                autoComplete="postal-code"
                autoCapitalize="characters"
                maxLength={uk === true ? 8 : 12}
                value={text("postcode")}
                onChange={(e) => set("postcode")(e.target.value)}
                onBlur={(e) => e.target.value && uk !== false && set("postcode")(formatPostcode(e.target.value))}
              />
            </Field>
            <Field label="Telephone" problem={f.phone ? phoneProblem(f.phone, uk) : null}>
              <input type="tel" inputMode="tel" autoComplete="tel" className={input} value={text("phone")} onChange={(e) => set("phone")(e.target.value)} />
            </Field>
            <Field label="Email" className="col-span-2" problem={f.email ? emailProblem(f.email) : null}>
              <input type="email" inputMode="email" autoComplete="email" className={input} value={text("email")} onChange={(e) => set("email")(e.target.value)} />
            </Field>
            <Field label="Complaint is about">
              <select className={selectControl} value={f.complainingFor ?? ""} onChange={(e) => set2("complainingFor", (e.target.value || null) as CaseFacts["complainingFor"])}>
                <option value="">Not answered</option>
                <option value="me">Me</option>
                <option value="someone_else">Someone else</option>
              </select>
            </Field>
            <Field label="Contact me by">
              <select className={selectControl} value={f.preferredContact ?? ""} onChange={(e) => set2("preferredContact", (e.target.value || null) as CaseFacts["preferredContact"])}>
                <option value="">Not answered</option>
                <option value="Letter">Letter</option>
                <option value="Email">Email</option>
                <option value="Phone Call">Phone call</option>
              </select>
            </Field>
          </div>

          {f.preferredContact === "Email" && (
            <label className="flex cursor-pointer items-start gap-3 rounded-card border border-line bg-subtle p-4 text-xs leading-5 text-ink-2">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand" checked={f.emailRiskAccepted === true} onChange={(e) => updateFacts({ emailRiskAccepted: e.target.checked })} />
              <span>
                <span className="block text-sm font-medium text-ink">
                  Email disclaimer {f.emailRiskAccepted === null ? "(not answered yet)" : f.emailRiskAccepted ? "(you agreed)" : "(you declined)"}
                </span>
                {EMAIL_DISCLAIMER}
              </span>
            </label>
          )}
        </section>

        <section className="space-y-5">
          <SectionTitle>What happened</SectionTitle>
          <Field label="Where it happened">
            <input className={input} value={text("incidentLocation")} onChange={(e) => set("incidentLocation")(e.target.value)} />
          </Field>
          {/* Worked out from the story at onboarding; whose rules apply follows from these, so the user can correct them here. */}
          <div className="grid grid-cols-2 gap-x-5 gap-y-5">
            <Field label="Country">
              <input className={input} autoComplete="off" value={text("country")} onChange={(e) => set("country")(e.target.value)} />
            </Field>
            <Field label="Region or state (if it matters)">
              <input className={input} autoComplete="off" value={text("region")} onChange={(e) => set("region")(e.target.value)} />
            </Field>
          </div>
          <Field label="In your words">
            <textarea rows={4} className={input} value={text("incidentSummary")} onChange={(e) => set("incidentSummary")(e.target.value)} />
          </Field>
          <Field label="What you would like to happen">
            <textarea rows={2} className={input} value={text("desiredOutcome")} onChange={(e) => set("desiredOutcome")(e.target.value)} />
          </Field>
        </section>

        <section className="space-y-5">
          <SectionTitle aside={<Button variant="ghost" size="sm" onClick={() => updateFacts({ events: [...f.events, { date: "", what: "" }] })}>Add event</Button>}>
            Timeline
          </SectionTitle>
          {f.events.length === 0 && <p className="text-sm text-muted">No events yet.</p>}
          {f.events.map((e, i) => (
            <div key={i} className="space-y-3 rounded-card border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="w-72 max-w-full">
                  <DateField label={`Event ${i + 1} date`} value={e.date} onChange={(v) => setEvent(i, { date: v })} />
                </div>
                <Button variant="ghost" size="sm" onClick={() => updateFacts({ events: f.events.filter((_, j) => j !== i) })}>
                  Remove
                </Button>
              </div>
              {/* Full width and tall enough for what is written (about 80 characters a line), so nothing is cut off. */}
              <textarea
                rows={Math.min(8, Math.max(2, Math.ceil(e.what.length / 80)))}
                className={input}
                aria-label={`Event ${i + 1}: what happened`}
                placeholder="What happened"
                value={e.what}
                onChange={(ev) => setEvent(i, { what: ev.target.value })}
              />
            </div>
          ))}
        </section>

        <section className="space-y-3">
          <SectionTitle>Medical records (optional)</SectionTitle>
          <p className="text-sm text-ink-2">Nothing to do now. We only ask about this at the step that needs it (finding a solicitor), so you can leave it.</p>
          <select className={selectControl} value={f.medicalRecords ?? ""} onChange={(e) => set2("medicalRecords", (e.target.value || null) as CaseFacts["medicalRecords"])}>
            <option value="">Not decided yet</option>
            <option value="not_requested">I have not asked for them</option>
            <option value="requested">I have asked and am waiting</option>
            <option value="have_copy">I have a copy</option>
          </select>
        </section>

        <section className="space-y-3">
          <SectionTitle>Your conversation</SectionTitle>
          <details className="rounded-card border border-line p-4 text-sm">
            <summary className="cursor-pointer text-ink-2">Show what you told us ({profile.messages.length} messages)</summary>
            <div className="mt-3 space-y-2 text-ink-2">
              {profile.messages.map((m, i) => (
                <p key={i}>
                  <span className="font-medium text-ink">{m.role === "agent" ? "Assistant" : "You"}:</span> {m.content}
                </p>
              ))}
            </div>
          </details>
        </section>

        <section className="space-y-2 border-t border-line pt-6">
          <Eyebrow>Your data</Eyebrow>
          <button
            onClick={() => {
              if (window.confirm("Delete everything saved about your case on this device?")) {
                clearProfile();
                onDeleted();
              }
            }}
            className="text-sm font-medium text-danger underline underline-offset-2"
          >
            Delete all my data
          </button>
          <p className="text-xs text-muted">Your profile is saved in this browser. Agent runs also create logs and screenshots on the server.</p>
        </section>
      </div>
    </div>
  );
}

/** "Your path" (D42): the track they are on, its fit, and the only place to switch (Tarun: not on the step pages). */
function PathSection({ profile, onContinue, onSwitched }: { profile: Profile; onContinue: () => void; onSwitched?: (firstStep: number) => void }) {
  const chosen = profile.track?.chosen ?? null;
  const rec = profile.track?.rec;
  if (!chosen) {
    return (
      <section className="space-y-2">
        <SectionTitle>Your path</SectionTitle>
        <p className="text-sm text-ink-2">You have not chosen a path yet. Close your profile to see what we suggest.</p>
      </section>
    );
  }
  const other: TrackId = chosen === "complaint" ? "compensation" : "complaint";
  const fit = rec?.tracks[chosen].fit;
  const otherFit = rec?.tracks[other].fit;
  return (
    <section className="space-y-4">
      <SectionTitle>Your path</SectionTitle>
      <div className="flex flex-wrap items-center gap-5 rounded-card border border-line bg-white p-5">
        {fit !== undefined && <FitRing fit={fit} size={64} title="How well this path fits what you told us. Not a chance of success." />}
        <div className="min-w-[14rem] flex-1">
          <div className="text-[17px] font-medium text-ink">{TRACKS[chosen].title}</div>
          <p className="mt-0.5 text-sm text-ink-2">{TRACKS[chosen].gets}</p>
          {rec?.recommended === chosen && <p className="mt-1 text-xs text-teal">This is the path we suggested.</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onContinue}>
            Continue
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setTrack({ chosen: other });
              onSwitched?.(TRACKS[other].steps[0]);
            }}
          >
            Switch to {TRACKS[other].title.toLowerCase()}
            {otherFit !== undefined && ` (${otherFit}% fit)`}
          </Button>
        </div>
      </div>
    </section>
  );
}
