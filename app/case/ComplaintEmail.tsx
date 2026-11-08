"use client";

import { useState } from "react";
import { buildComplaintEmail, complaintEmailGoals, emailSource } from "../../lib/agent/complaintEmail";
import { setComplaintEmail, setTrack, type Profile } from "../../lib/profile";
import { Button, control } from "../ui";
import { supportsLothian } from "../../lib/agent/complaintScope";
import TimeLimitNote from "./TimeLimitNote";

export default function ComplaintEmail({ profile }: { profile: Profile }) {
  const draft = profile.complaintEmail;
  const [requests, setRequests] = useState(() => draft?.requests ?? complaintEmailGoals(profile.facts));
  const [status, setStatus] = useState("");
  const stale = draft && draft.source !== emailSource(profile.facts);
  const draftedRequests = draft?.requests ?? complaintEmailGoals(profile.facts);
  const requestsChanged = requests.explanation !== draftedRequests.explanation || requests.apology !== draftedRequests.apology;
  const exportText = draft ? `Subject: ${draft.subject}\n\n${draft.body}` : "";
  return <section className="mx-auto max-w-3xl space-y-6 px-8 py-12">
    <p className="eyebrow">Request an explanation or apology</p>
    <h1 className="display text-[40px]">Start with an email</h1>
    <p className="text-ink-2">Review this draft for the hospital or clinic involved. Find and verify its complaints-team email address before sending. No recipient has been checked and nothing has been sent.</p>
    <p className="text-sm text-muted">This prepares one email. A reply may lead to further questions or a formal complaint; it does not guarantee an explanation or apology.</p>
    {/* The NHS complaint time limit applies to an email complaint too; only shown where the place is a confirmed NHS Lothian site (Scottish rule). */}
    {supportsLothian(profile.facts) && <TimeLimitNote profile={profile} kind="nhs" />}
    <fieldset className="space-y-3">
      <legend className="mb-3 font-medium">What would you like to ask for?</legend>
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={requests.explanation} onChange={(e) => setRequests({ ...requests, explanation: e.target.checked })} />
        An explanation of what went wrong
      </label>
      <label className="flex items-center gap-3">
        <input type="checkbox" checked={requests.apology} onChange={(e) => setRequests({ ...requests, apology: e.target.checked })} />
        An apology
      </label>
      {draft && <p className="text-sm text-muted">Replacing the draft will overwrite your edits.</p>}
      {draft && requestsChanged && <p role="status" className="text-sm text-amber">Click Replace draft to apply the new selections to your email.</p>}
      <Button disabled={!requests.explanation && !requests.apology} onClick={() => {
        setComplaintEmail(buildComplaintEmail(profile.facts, requests));
        setStatus(draft ? "Email draft replaced." : "Email draft ready.");
      }}>{draft ? "Replace draft" : "Prepare email draft"}</Button>
    </fieldset>
    {draft && <>
    {stale && <p role="status" className="text-sm text-amber">Your case details or goals have changed. Review this saved draft or replace it using the current details.</p>}
    <label className="block space-y-2"><span className="text-sm font-medium">Subject</span><input aria-label="Email subject" className={control} value={draft.subject} onChange={(e) => setComplaintEmail({ ...draft, subject: e.target.value })} /></label>
    <label className="block space-y-2"><span className="text-sm font-medium">Message</span><textarea aria-label="Email message" className={control} rows={15} value={draft.body} onChange={(e) => setComplaintEmail({ ...draft, body: e.target.value })} /></label>
    <div className="flex flex-wrap gap-3">
      <Button disabled={!draft.subject.trim() || !draft.body.trim()} onClick={async () => { try { await navigator.clipboard.writeText(exportText); setStatus("Email draft copied. Nothing has been sent."); } catch { setStatus("Could not copy automatically. Select the text and copy it, or download the draft."); } }}>Copy email</Button>
      <Button variant="secondary" onClick={() => { const url = URL.createObjectURL(new Blob([exportText], { type: "text/plain;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = "email-draft.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Download draft</Button>
    </div>
    <p role="status" className="text-sm text-muted">{status || "Edits are saved on this device."}</p>
    </>}
    <Button variant="secondary" onClick={() => setTrack({ chosen: "complaint", complaintMode: "formal" })}>Make a formal complaint instead</Button>
  </section>;
}
