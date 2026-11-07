"use client";

import { missingRequired, type CaseFacts } from "../../lib/agent/facts";
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

const input =
  "w-full rounded-md border border-zinc-300 bg-transparent p-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700";

const EMAIL_DISCLAIMER =
  "I request NHS Lothian to contact me via email in relation to my enquiry. I understand and accept the risk that sending clinical information by an un-secured internet address involves the risk that the information can be diverted/sent to other parties/become lost and understand that NHS Lothian takes no responsibility for this.";

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={"block space-y-1 " + (wide ? "col-span-2" : "")}>
      <span className="text-xs uppercase text-zinc-500">{label}</span>
      {children}
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
        <h1 className="text-2xl font-semibold">Your profile</h1>
        <p className="mt-1 text-sm text-zinc-500">
          This is what the agent uses to fill in forms for you. Changes save as you type, on this device only.
        </p>
      </header>

      {missing.length > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          Still needed for the NHS form: {missing.map((k) => FIELD_LABELS[k] ?? k).join(", ")}.
        </div>
      ) : (
        <div className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          Everything the NHS form needs is here.
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium">About you</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title">
            <input className={input} value={text("title")} onChange={(e) => set("title")(e.target.value)} />
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
          <Field label="Postcode">
            <input className={input} value={text("postcode")} onChange={(e) => set("postcode")(e.target.value)} />
          </Field>
          <Field label="Telephone">
            <input className={input} value={text("phone")} onChange={(e) => set("phone")(e.target.value)} />
          </Field>
          <Field label="Email" wide>
            <input className={input} value={text("email")} onChange={(e) => set("email")(e.target.value)} />
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
          <label className="flex items-start gap-3 rounded-md border border-zinc-200 p-3 text-xs dark:border-zinc-800">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={f.emailRiskAccepted === true}
              onChange={(e) => updateFacts({ emailRiskAccepted: e.target.checked })}
            />
            <span>
              <span className="block font-medium">
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
          <input className={input} value={text("incidentLocation")} onChange={(e) => set("incidentLocation")(e.target.value)} />
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
            className="text-xs underline"
          >
            Add event
          </button>
        </div>
        {f.events.length === 0 && <p className="text-sm text-zinc-500">No events yet.</p>}
        {f.events.map((e, i) => (
          <div key={i} className="grid grid-cols-[10rem_1fr_auto] items-start gap-2">
            <input className={input} placeholder="Date" value={e.date} onChange={(ev) => setEvent(i, { date: ev.target.value })} />
            <textarea rows={2} className={input} placeholder="What happened" value={e.what} onChange={(ev) => setEvent(i, { what: ev.target.value })} />
            <button
              onClick={() => updateFacts({ events: f.events.filter((_, j) => j !== i) })}
              className="px-2 py-2 text-xs text-zinc-500 underline"
            >
              Remove
            </button>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Your conversation</h2>
        <details className="rounded-md border border-zinc-200 p-3 text-sm dark:border-zinc-800">
          <summary className="cursor-pointer text-zinc-500">Show what you told us ({profile.messages.length} messages)</summary>
          <div className="mt-3 space-y-2">
            {profile.messages.map((m, i) => (
              <p key={i}>
                <span className="font-medium">{m.role === "agent" ? "Assistant" : "You"}:</span> {m.content}
              </p>
            ))}
          </div>
        </details>
      </section>

      <section className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
        <button
          onClick={() => {
            if (window.confirm("Delete everything saved about your case on this device?")) {
              clearProfile();
              onDeleted();
            }
          }}
          className="text-sm text-red-600 underline"
        >
          Delete all my data
        </button>
        <p className="mt-1 text-xs text-zinc-500">Saved in this browser only. Nothing is stored on a server.</p>
      </section>
    </div>
  );
}
