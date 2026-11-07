"use client";

import { useState } from "react";
import type { CaseFacts } from "../../lib/agent/facts";
import { factualComplaint, SCOPE_NOTE } from "../../lib/agent/complaintScope";
import { Button, control } from "../ui";

export default function UnsupportedComplaint({ facts }: { facts: CaseFacts }) {
  const draft = factualComplaint(facts);
  const [text, setText] = useState([draft.details, `Where: ${draft.location}`, draft.outcome ? `What I would like: ${draft.outcome}` : ""].filter(Boolean).join("\n\n"));
  const [message, setMessage] = useState("");
  return <section className="mx-auto max-w-4xl space-y-6">
    <h1 className="display text-[40px] text-ink">Draft prepared — complaint route unverified</h1>
    <p className="text-ink-2">{SCOPE_NOTE}</p>
    <p className="text-muted">Review this draft built from your saved story and timeline. Check the details and the correct recipient before using it. Earlier guideline additions have been left out.</p>
    <label className="block space-y-2"><span className="font-medium">Review and edit your draft</span><textarea className={control} rows={14} value={text} onChange={(e) => setText(e.target.value)} /></label>
    <div className="flex flex-wrap gap-3">
      <Button onClick={async () => { try { await navigator.clipboard.writeText(text); setMessage("Draft copied."); } catch { setMessage("Could not copy automatically. Select the draft text and copy it manually."); } }}>Copy draft</Button>
      <Button variant="secondary" onClick={() => { const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "complaint-draft.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Download draft</Button>
    </div>
    <p role="status" className="text-sm text-muted">{message || "Edits here are temporary. Copy or download the draft to keep them. Nothing has been sent."}</p>
  </section>;
}
