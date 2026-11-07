"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { missingRequired } from "../../lib/agent/facts";
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
      <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800">
        <div className="p-5">
          <div className="text-sm text-zinc-500">Case for</div>
          <div className="text-lg font-semibold">{name}</div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
          <button
            onClick={() => setActive("profile")}
            className={"flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm " + (active === "profile" ? "bg-zinc-100 dark:bg-zinc-900" : "")}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200 text-xs dark:bg-zinc-800">
              {(f.firstName ?? "?").charAt(0).toUpperCase()}
            </span>
            <span className="flex-1">Profile</span>
            {incomplete && <span className="h-2 w-2 rounded-full bg-amber-500" title="Some details are missing" />}
          </button>
          <div className="px-3 pt-4 pb-1 text-xs uppercase text-zinc-400">Steps</div>
          {STEPS.map((s) => (
            <button
              key={s.n}
              disabled={!s.ready}
              onClick={() => setActive(s.n)}
              className={
                "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm " +
                (active === s.n ? "bg-zinc-100 dark:bg-zinc-900 " : "") +
                (s.ready ? "" : "cursor-not-allowed text-zinc-400")
              }
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-current text-xs">{s.n}</span>
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

const box =
  "w-full rounded-md border border-zinc-300 bg-transparent p-3 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700";

function StepOne({ profile, openProfile }: { profile: Profile; openProfile: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = missingRequired(profile.facts);
  const draft = profile.draft;

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
        <div className="text-sm text-zinc-500">Step 1</div>
        <h1 className="text-2xl font-semibold">Complain to NHS Lothian</h1>
        <p className="mt-1 text-sm text-zinc-500">
          We prepare the complaint. You review and edit it, and nothing is sent until you approve.
        </p>
      </header>

      {missing.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
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
            disabled={busy || missing.length > 0}
            className="rounded-md border border-zinc-300 px-3 py-1 text-xs disabled:opacity-40 dark:border-zinc-700"
          >
            {busy ? "Writing…" : draft ? "Write it again" : "Write my draft"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!draft && !busy && <p className="text-sm text-zinc-500">We write this from your profile. You can edit every word.</p>}
        {draft && (
          <div className="space-y-3">
            <label className="block space-y-1">
              <span className="text-xs uppercase text-zinc-500">Details of your complaint</span>
              <textarea rows={12} className={box} value={draft.details} onChange={(e) => setDraft({ ...draft, details: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs uppercase text-zinc-500">Where it happened</span>
              <textarea rows={2} className={box} value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
            </label>
            <label className="block space-y-1">
              <span className="text-xs uppercase text-zinc-500">What you would like to happen</span>
              <textarea rows={2} className={box} value={draft.outcome} onChange={(e) => setDraft({ ...draft, outcome: e.target.value })} />
            </label>
          </div>
        )}
      </section>

      <section className="flex items-center gap-4 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <div className="flex-1 text-sm text-zinc-500">
          Next, the agent will open the NHS Lothian form in a visible browser and fill it in. You approve before anything is submitted.
        </div>
        <button disabled className="rounded-md bg-black px-4 py-2 text-sm text-white opacity-40 dark:bg-white dark:text-black">
          Fill in the NHS form · coming next
        </button>
      </section>
    </div>
  );
}
