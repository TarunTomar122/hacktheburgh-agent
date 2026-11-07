"use client";

import { missingRequired, type CaseFacts } from "../../lib/agent/facts";
import { EMAIL_DISCLAIMER, formatPostcode, isEmail, isPhone, isPostcode, PLACE_SUGGESTIONS, TITLES } from "../../lib/agent/inputs";
import DateField from "../DateField";
import { clearProfile, updateFacts, type Profile } from "../../lib/profile";

export const FIELD_LABELS: Record<string, string> = {
  complainingFor: "Who the complaint is about",
  firstName: "First name",
  lastName: "Last name",
  address: "Address",
  postcode: "Postcode",
  phone: "Telephone",
  email: "Email",
  preferredContact: "How to contact you",
  incidentLocation: "Where it happened",
  incidentSummary: "What happened",
  events: "Timeline (at least one dated event)",
  emailRiskAccepted: "Email disclaimer answer",
};

const input = "field";

function Field({ label, children, wide, problem }: { label: string; children: React.ReactNode; wide?: boolean; problem?: string | null }) {
  return (
    <label className={"block space-y-1 " + (wide ? "col-span-2" : "")}>
      <span className="eyebrow">{label}</span>
      {children}
      {problem && <span className="block text-xs text-danger">{problem}</span>}
    </label>
  );
}

export default function ProfileTab({ profile, onDeleted }: { profile: Profile; onDeleted: () => void }) {
  const f = profile.facts;
  const missing = missingRequired(f);
  const text = (k: keyof CaseFacts) => (f[k] as string | null) ?? "";
  const set = (k: keyof CaseFacts) => (v: string) => updateFacts({ [k]: v === "" ? null : v } as Partial<CaseFacts>);

  function setEvent(i: number, patch: Partial<CaseFacts["events"][number]>) {
    updateFacts({ events: f.events.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-8">
      <header>
        <h1 className="display text-4xl">Your <span className="hl-blue">profile</span></h1>
        <p className="mt-3 text-sm text-muted">
          This is what the agent uses to fill in forms for you. Changes save as you type, on this device only.
        </p>
      </header>

      {missing.length > 0 ? (
        <div className="rounded-lg border border-orange/40 bg-orange-50 p-3 text-sm text-body">
          Still needed for the NHS form: {missing.map((k) => FIELD_LABELS[k] ?? k).join(", ")}.
        </div>
      ) : (
        <div className="rounded-lg border border-teal/40 bg-teal-50 p-3 text-sm text-body">
          Everything the NHS form needs is here.
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium">About you</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title">
            <select className={input} autoComplete="honorific-prefix" value={text("title")} onChange={(e) => set("title")(e.target.value)}>
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
          <Field label="Address" wide>
            <input className={input} value={text("address")} onChange={(e) => set("address")(e.target.value)} />
          </Field>
          <Field label="Postcode" problem={f.postcode && !isPostcode(f.postcode) ? "This does not look like a UK postcode, for example EH1 1AA." : null}>
            <input
              className={input}
              autoComplete="postal-code"
              autoCapitalize="characters"
              maxLength={8}
              value={text("postcode")}
              onChange={(e) => set("postcode")(e.target.value)}
              onBlur={(e) => e.target.value && set("postcode")(formatPostcode(e.target.value))}
            />
          </Field>
          <Field label="Telephone" problem={f.phone && !isPhone(f.phone) ? "Use digits only, for example 07700 900123." : null}>
            <input type="tel" inputMode="tel" autoComplete="tel" className={input} value={text("phone")} onChange={(e) => set("phone")(e.target.value)} />
          </Field>
          <Field label="Email" wide problem={f.email && !isEmail(f.email) ? "This does not look like an email address." : null}>
            <input type="email" inputMode="email" autoComplete="email" className={input} value={text("email")} onChange={(e) => set("email")(e.target.value)} />
          </Field>
          <Field label="Complaint is about">
            <select
              className={input}
              value={f.complainingFor ?? ""}
              onChange={(e) => updateFacts({ complainingFor: (e.target.value || null) as CaseFacts["complainingFor"] })}
            >
              <option value="">Not answered</option>
              <option value="me">Me</option>
              <option value="someone_else">Someone else</option>
            </select>
          </Field>
          <Field label="Contact me by">
            <select
              className={input}
              value={f.preferredContact ?? ""}
              onChange={(e) => updateFacts({ preferredContact: (e.target.value || null) as CaseFacts["preferredContact"] })}
            >
              <option value="">Not answered</option>
              <option value="Letter">Letter</option>
              <option value="Email">Email</option>
              <option value="Phone Call">Phone call</option>
            </select>
          </Field>
        </div>

        {f.preferredContact === "Email" && (
          <label className="flex items-start gap-3 rounded-md border border-line bg-cream p-3 text-xs">
            <input
              type="checkbox"
              className="mt-0.5 accent-brand"
              checked={f.emailRiskAccepted === true}
              onChange={(e) => updateFacts({ emailRiskAccepted: e.target.checked })}
            />
            <span>
              <span className="block font-medium text-ink">
                Email disclaimer {f.emailRiskAccepted === null ? "(not answered yet)" : f.emailRiskAccepted ? "(you agreed)" : "(you declined)"}
              </span>
              {EMAIL_DISCLAIMER}
            </span>
          </label>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium">What happened</h2>
        <Field label="Where it happened">
          <input
            className={input}
            list="place-suggestions"
            value={text("incidentLocation")}
            onChange={(e) => set("incidentLocation")(e.target.value)}
          />
          <datalist id="place-suggestions">
            {PLACE_SUGGESTIONS.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
        </Field>
        <Field label="In your words">
          <textarea rows={4} className={input} value={text("incidentSummary")} onChange={(e) => set("incidentSummary")(e.target.value)} />
        </Field>
        <Field label="What you would like to happen">
          <textarea rows={2} className={input} value={text("desiredOutcome")} onChange={(e) => set("desiredOutcome")(e.target.value)} />
        </Field>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Timeline</h2>
          <button
            onClick={() => updateFacts({ events: [...f.events, { date: "", what: "" }] })}
            className="text-xs text-brand underline"
          >
            Add event
          </button>
        </div>
        {f.events.length === 0 && <p className="text-sm text-muted">No events yet.</p>}
        {f.events.map((e, i) => (
          <div key={i} className="grid grid-cols-[13rem_1fr_auto] items-start gap-2">
            <DateField label={`Event ${i + 1} date`} value={e.date} onChange={(v) => setEvent(i, { date: v })} />
            <textarea rows={2} className={input} placeholder="What happened" value={e.what} onChange={(ev) => setEvent(i, { what: ev.target.value })} />
            <button
              onClick={() => updateFacts({ events: f.events.filter((_, j) => j !== i) })}
              className="px-2 py-2 text-xs text-muted underline"
            >
              Remove
            </button>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Your conversation</h2>
        <details className="card p-3 text-sm">
          <summary className="cursor-pointer text-muted">Show what you told us ({profile.messages.length} messages)</summary>
          <div className="mt-3 space-y-2">
            {profile.messages.map((m, i) => (
              <p key={i}>
                <span className="font-medium">{m.role === "agent" ? "Assistant" : "You"}:</span> {m.content}
              </p>
            ))}
          </div>
        </details>
      </section>

      <section className="border-t border-hairline pt-4">
        <button
          onClick={() => {
            if (window.confirm("Delete everything saved about your case on this device?")) {
              clearProfile();
              onDeleted();
            }
          }}
          className="text-sm text-danger underline"
        >
          Delete all my data
        </button>
        <p className="mt-1 text-xs text-muted">Saved in this browser only. Nothing is stored on a server.</p>
      </section>
    </div>
  );
}
