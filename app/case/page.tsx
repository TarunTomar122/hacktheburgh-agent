"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { missingRequired } from "../../lib/agent/facts";
import type { AgentEvent } from "../../lib/agent/events";
import { setDraft, useProfile, type Profile } from "../../lib/profile";
import ProfileTab, { FIELD_LABELS } from "./ProfileTab";

const STEPS = [
  { n: 1, title: "Complain to NHS Lothian", ready: true },
  { n: 2, title: "Request your medical records", ready: false },
  { n: 3, title: "Ombudsman check", ready: false },
  { n: 4, title: "Legal aid check", ready: false },
  { n: 5, title: "Find a solicitor", ready: false },
  { n: 6, title: "Your case file", ready: false },
];

type Tab = "profile" | number;

export default function CasePage() {
  const router = useRouter();
  const profile = useProfile();
  const [active, setActive] = useState<Tab>(1);

  useEffect(() => {
    if (profile === null) router.replace("/");
  }, [profile, router]);

  if (!profile) return null;
  const f = profile.facts;
  const name = [f.firstName, f.lastName].filter(Boolean).join(" ") || "you";
  const incomplete = missingRequired(f).length > 0;

  return (
    <div className="flex h-screen">
      <aside className="flex w-72 shrink-0 flex-col border-r border-hairline bg-cream">
        <div className="p-5">
          <div className="eyebrow">Case for</div>
          <div className="display mt-1 text-2xl">{name}</div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          <button
            onClick={() => setActive("profile")}
            className={
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm text-ink " +
              (active === "profile" ? "border border-hairline bg-paper shadow-sm" : "border border-transparent hover:bg-paper/60")
            }
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-xs font-medium text-brand">
              {(f.firstName ?? "?").charAt(0).toUpperCase()}
            </span>
            <span className="flex-1">Profile</span>
            {incomplete && <span className="h-2 w-2 rounded-full bg-orange" title="Some details are missing" />}
          </button>
          <div className="eyebrow px-3 pt-5 pb-1">Steps</div>
          {STEPS.map((s) => (
            <button
              key={s.n}
              disabled={!s.ready}
              onClick={() => setActive(s.n)}
              className={
                "flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left text-sm " +
                (active === s.n ? "border-hairline bg-paper text-ink shadow-sm " : "border-transparent ") +
                (s.ready ? (active === s.n ? "" : "text-ink hover:bg-paper/60") : "cursor-not-allowed text-faint")
              }
            >
              <span
                className={
                  "flex h-6 w-6 items-center justify-center rounded-full text-xs " +
                  (active === s.n && s.ready ? "bg-brand text-white" : "border border-current")
                }
              >
                {s.n}
              </span>
              <span className="flex-1">{s.title}</span>
              {!s.ready && <span className="text-xs">Soon</span>}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {active === "profile" ? (
          <ProfileTab profile={profile} onDeleted={() => router.replace("/")} />
        ) : (
          <StepOne profile={profile} openProfile={() => setActive("profile")} />
        )}
      </main>
    </div>
  );
}

function StepOne({ profile, openProfile }: { profile: Profile; openProfile: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filling, setFilling] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [result, setResult] = useState<Extract<AgentEvent, { type: "done" }> | null>(null);
  const missing = missingRequired(profile.facts);
  const draft = profile.draft;

  async function fill() {
    if (!draft || filling) return;
    setFilling(true);
    setError(null);
    setResult(null);
    setProgress(["Starting the browser agent…"]);
    try {
      const res = await fetch("/api/agent/step1", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ facts: profile.facts, draft }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Could not start the browser agent");
      }
      if (!res.body) throw new Error("The browser agent returned no progress stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let pending = "";
      let completed = false;
      function receive(line: string) {
        if (!line.trim()) return;
        const event = JSON.parse(line) as AgentEvent | { type: "error"; message: string };
        if (event.type === "error") throw new Error(event.message);
        if (event.type === "done") {
          completed = true;
          setResult(event);
        } else {
          const message = event.type === "status" ? event.message
            : event.type === "observe" ? `Step ${event.step}: inspecting ${event.fields} page elements`
            : event.type === "blocked" ? event.reason
            : `Step ${event.step}: ${event.tool} — ${event.result}`;
          setProgress((previous) => [...previous.slice(-19), message]);
        }
      }
      try {
        while (true) {
          const { value, done } = await reader.read();
          pending += decoder.decode(value, { stream: !done });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          lines.forEach(receive);
          if (done) break;
        }
        receive(pending);
        if (!completed) throw new Error("The browser connection ended before a result. You can retry.");
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
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

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <header>
        <div className="eyebrow">Step 1</div>
        <h1 className="display mt-2 text-4xl">
          Complain to <span className="hl-blue">NHS Lothian</span>
        </h1>
        <p className="mt-3 text-sm text-muted">
          We prepare the complaint. You review and edit it, and nothing is sent until you approve.
        </p>
      </header>

      {missing.length > 0 && (
        <div className="rounded-lg border border-orange/40 bg-orange-50 p-3 text-sm text-body">
          Before we can fill in the form we still need: {missing.map((k) => FIELD_LABELS[k] ?? k).join(", ")}.{" "}
          <button onClick={openProfile} className="underline">
            Open your profile
          </button>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Draft complaint</h2>
          <button
            onClick={write}
            disabled={busy || filling || missing.length > 0}
            className="btn-ghost !px-3 !py-1 !text-xs"
          >
            {busy ? "Writing…" : draft ? "Write it again" : "Write my draft"}
          </button>
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        {!draft && !busy && <p className="text-sm text-muted">We write this from your profile. You can edit every word.</p>}
        {draft && (
          <fieldset disabled={filling} className="space-y-3">
            <label className="block space-y-1">
              <span className="eyebrow">Details of your complaint</span>
              <textarea rows={12} className="field" value={draft.details} onChange={(e) => setDraft({ ...draft, details: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="eyebrow">Where it happened</span>
              <textarea rows={2} className="field" value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="eyebrow">What you would like to happen</span>
              <textarea rows={2} className="field" value={draft.outcome} onChange={(e) => setDraft({ ...draft, outcome: e.target.value })} />
            </label>
          </fieldset>
        )}
      </section>

      <section className="flex items-center gap-4 rounded-lg border border-dashed border-line bg-mist p-4">
        <div className="flex-1 text-sm text-muted">
          Review the draft above, then open the NHS form with your saved details. The browser stays open for review for up to 10 minutes. Demo data is for review only.
        </div>
        <button onClick={fill} disabled={busy || filling || missing.length > 0 || !draft?.details.trim() || !draft?.location.trim()} className="btn-primary">
          {filling ? "Filling the form…" : "Approve draft and fill NHS form"}
        </button>
      </section>
      {progress.length > 0 && (
        <section aria-label="Browser agent progress" className="space-y-2 text-sm text-muted">
          <h2 className="font-medium">Browser activity</h2>
          <ol>{progress.map((message, i) => <li key={i}>{message}</li>)}</ol>
        </section>
      )}
      {result && (
        <section role="status" className="card space-y-2 text-sm">
          <h2 className="font-medium">{result.status === "ready_to_submit" ? "Form filled and ready for review" : "The form needs your attention"}</h2>
          <p>{result.summary}</p>
          {result.question && <p>{result.question}</p>}
          {result.unfilled.length > 0 && <p>Still needed — {result.unfilled.join(", ")}</p>}
          <p>Nothing has been submitted. Review the separate browser window.</p>
          {result.status !== "ready_to_submit" && <button onClick={openProfile} className="underline">Review your profile before retrying</button>}
        </section>
      )}
    </div>
  );
}
