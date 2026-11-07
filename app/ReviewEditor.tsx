"use client";

import { useState } from "react";
import { missingForOnboarding, type CaseFacts } from "../lib/agent/facts";
import { normaliseFacts, validatePatch } from "../lib/agent/inputs";
import DateField from "./DateField";
import { Button, control } from "./ui";

export function reviewProblem(facts: CaseFacts): string | null {
  if (missingForOnboarding(facts).length) return "Please complete the name, treatment location, story, contact details and timeline before saving.";
  if (facts.events.some((e) => !e.date.trim() || !e.what.trim())) return "Each timeline event needs a date and a description. A rough date is fine.";
  return validatePatch(facts);
}

export default function ReviewEditor({ facts, onSave, onCancel }: { facts: CaseFacts; onSave: (facts: CaseFacts) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(facts);
  const [error, setError] = useState<string | null>(null);
  const fields = [
    ["title", "Title (optional)"], ["firstName", "First name"], ["lastName", "Last name"],
    ["incidentLocation", "Hospital, clinic or GP surgery where you received care"],
    ["incidentSummary", "What happened"], ["desiredOutcome", "What you would like (optional)"],
    ["address", "Address"], ["postcode", "Postcode"], ["phone", "Telephone"], ["email", "Email"],
  ] as const;
  function save() {
    const clean = normaliseFacts(draft);
    const problem = reviewProblem(clean);
    if (problem) return setError(problem);
    onSave(clean);
  }
  return <form className="space-y-5" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
    {fields.map(([key, label]) => <label key={key} className="block space-y-2">
      <span className="text-sm font-medium text-ink">{label}</span>
      {key === "incidentSummary" || key === "desiredOutcome" ?
        <textarea aria-label={label} className={control} rows={key === "incidentSummary" ? 5 : 3} value={draft[key] ?? ""} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /> :
        <input aria-label={label} className={control} type={key === "email" ? "email" : key === "phone" ? "tel" : "text"} value={draft[key] ?? ""} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} />}
    </label>)}
    <fieldset className="space-y-4">
      <legend className="mb-3 text-lg font-medium">Timeline</legend>
      {draft.events.map((event, i) => <div key={i} className="space-y-3 rounded-card border border-line p-4">
        <DateField label={`Date of event ${i + 1}`} value={event.date} onChange={(date) => setDraft({ ...draft, events: draft.events.map((v, j) => j === i ? { ...v, date } : v) })} />
        <label className="block space-y-2"><span className="text-sm">What happened at this time?</span><textarea aria-label={`Description of event ${i + 1}`} className={control} rows={3} value={event.what} onChange={(e) => setDraft({ ...draft, events: draft.events.map((v, j) => j === i ? { ...v, what: e.target.value } : v) })} /></label>
        <Button type="button" variant="ghost" size="sm" onClick={() => setDraft({ ...draft, events: draft.events.filter((_, j) => j !== i) })}>Remove event {i + 1}</Button>
      </div>)}
      <Button type="button" variant="secondary" onClick={() => setDraft({ ...draft, events: [...draft.events, { date: "", what: "" }] })}>Add timeline event</Button>
    </fieldset>
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    <div className="flex gap-3"><Button type="submit">Save changes</Button><Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button></div>
  </form>;
}
