"use client";

import { useState } from "react";
import { buildComplaintEmail, emailOnlyGoals, emailSource } from "../../lib/agent/complaintEmail";
import { setComplaintEmail, setTrack, type Profile } from "../../lib/profile";
import { Button, control } from "../ui";

export default function ComplaintEmail({ profile }: { profile: Profile }) {
  const draft = profile.complaintEmail ?? buildComplaintEmail(profile.facts);
  const [status, setStatus] = useState("");
  const stale = draft.source !== emailSource(profile.facts);
  const exportText = `Subject: ${draft.subject}\n\n${draft.body}`;
  return <section className="mx-auto max-w-3xl space-y-6 px-8 py-12">
    <p className="eyebrow">Request an explanation or apology</p>
    <h1 className="display text-[40px]">Start with an email</h1>
    <p className="text-ink-2">Review this draft for the hospital or clinic involved. Find and verify its complaints-team email address before sending. No recipient has been checked and nothing has been sent.</p>
    <p className="text-sm text-muted">This prepares one email. A reply may lead to further questions or a formal complaint; it does not guarantee an explanation or apology.</p>
    {(!emailOnlyGoals(profile.facts.desiredOutcome) || stale) && <p role="status" className="text-sm text-amber">Your case details or goals have changed. Review this saved draft, update it below, or choose the formal complaint route.</p>}
    <label className="block space-y-2"><span className="text-sm font-medium">Subject</span><input aria-label="Email subject" className={control} value={draft.subject} onChange={(e) => setComplaintEmail({ ...draft, subject: e.target.value })} /></label>
    <label className="block space-y-2"><span className="text-sm font-medium">Message</span><textarea aria-label="Email message" className={control} rows={15} value={draft.body} onChange={(e) => setComplaintEmail({ ...draft, body: e.target.value })} /></label>
    <div className="flex flex-wrap gap-3">
      <Button disabled={!draft.subject.trim() || !draft.body.trim()} onClick={async () => { try { await navigator.clipboard.writeText(exportText); setStatus("Email draft copied. Nothing has been sent."); } catch { setStatus("Could not copy automatically. Select the text and copy it, or download the draft."); } }}>Copy email</Button>
      <Button variant="secondary" onClick={() => { const url = URL.createObjectURL(new Blob([exportText], { type: "text/plain;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = "email-draft.txt"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Download draft</Button>
    </div>
    <p role="status" className="text-sm text-muted">{status || "Edits are saved on this device."}</p>
    <details className="rounded-card border border-line p-4"><summary className="cursor-pointer text-sm">Draft from current case details</summary><p className="my-3 text-sm text-muted">This replaces the draft above, including your edits. Copy or download anything you want to keep first.</p><Button variant="secondary" onClick={() => { setComplaintEmail(buildComplaintEmail(profile.facts)); setStatus("Draft updated from your current case details."); }}>Replace draft with current details</Button></details>
    <Button variant="secondary" onClick={() => setTrack({ chosen: "complaint", complaintMode: "formal" })}>Make a formal complaint instead</Button>
  </section>;
}
