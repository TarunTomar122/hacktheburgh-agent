"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { buildComplaintDraft, clearProfile, useProfile, type Profile } from "../../lib/profile";

const STEPS = [
  { n: 1, title: "Complain to NHS Lothian", ready: true },
  { n: 2, title: "Request your medical records", ready: false },
  { n: 3, title: "Ombudsman check", ready: false },
  { n: 4, title: "Legal aid check", ready: false },
  { n: 5, title: "Find a solicitor", ready: false },
  { n: 6, title: "Your case file", ready: false },
];

export default function CasePage() {
  const router = useRouter();
  const profile = useProfile();
  const [active, setActive] = useState(1);

  useEffect(() => {
    if (profile === null) router.replace("/");
  }, [profile, router]);

  if (!profile) return null;

  return (
    <div className="flex h-screen">
      <aside className="flex w-72 shrink-0 flex-col border-r border-zinc-200 dark:border-zinc-800">
        <div className="p-5">
          <div className="text-sm text-zinc-500">Case for</div>
          <div className="text-lg font-semibold">{profile.name}</div>
        </div>
        <nav className="flex-1 space-y-1 px-3">
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
        <button
          onClick={() => {
            clearProfile();
            router.replace("/");
          }}
          className="m-4 text-left text-xs text-zinc-500 underline"
        >
          Start over
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <StepOne profile={profile} />
      </main>
    </div>
  );
}

function StepOne({ profile }: { profile: Profile }) {
  const [draft, setDraft] = useState(() => buildComplaintDraft(profile));

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-8">
      <header>
        <div className="text-sm text-zinc-500">Step 1</div>
        <h1 className="text-2xl font-semibold">Complain to NHS Lothian</h1>
        <p className="mt-1 text-sm text-zinc-500">
          We prepare the complaint. You review and edit it, and nothing is sent until you approve.
        </p>
      </header>

      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="mb-3 text-sm font-medium">What you&apos;ve told us</h2>
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="text-xs uppercase text-zinc-500">What happened</dt>
            <dd className="whitespace-pre-wrap">{profile.story}</dd>
          </div>
          {profile.followUps.map((a) => (
            <div key={a.id}>
              <dt className="text-xs uppercase text-zinc-500">{a.label}</dt>
              <dd className="whitespace-pre-wrap">{a.answer}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">Draft complaint</h2>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={16}
          className="w-full rounded-md border border-zinc-300 bg-transparent p-3 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
        />
      </section>

      <section className="flex items-center gap-4 rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
        <div className="flex-1 text-sm text-zinc-500">
          Next, the agent will open the NHS Lothian form in a visible browser and fill it in with this text.
          You approve before anything is submitted.
        </div>
        <button disabled className="rounded-md bg-black px-4 py-2 text-sm text-white opacity-40 dark:bg-white dark:text-black">
          Fill in the NHS form · coming next
        </button>
      </section>
    </div>
  );
}
