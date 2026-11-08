/* eslint-disable @next/next/no-img-element -- unmodified local run evidence and static crew artwork */
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { allRuns, browserEvidence, type Flow } from "../../lib/insights";
import { DECISION_MODEL } from "../../lib/agent/decisions";
import { MODELS } from "../../lib/agent/llm";

const FLOW_NAME: Partial<Record<Flow, string>> = { discovery: "Research", compensation: "Prepare your case", complaint: "Complaint", escalation: "Independent review", enquiries: "Contact lawyers" };
const mins = (ms: number) => ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${(ms / 60_000).toFixed(1)} min`;
const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};
const CREW = [
  { id: "elliot", name: "Elliot", job: "Plans, delegates and adapts." },
  { id: "nell", name: "Nell", job: "Answers the legal-aid checker." },
  { id: "robin", name: "Robin", job: "Finds and checks law firms." },
  { id: "iona", name: "Iona", job: "Finds guidance and decisions." },
  { id: "kit", name: "Kit", job: "Prepares enquiries for review." },
];

/** What each model is for, and why that model: keyed by the configured model ids (lib/agent/llm.ts, lib/agent/decisions.ts). */
const MODEL_ROLES: { id: string; name: string; why: string }[] = [
  { id: MODELS.draft, name: "Reasoning", why: "Plans, re-plans and writes. Used where a wrong call costs the most." },
  { id: MODELS.browser, name: "Fast reader", why: "Reads pages and picks links many times a run, so it has to be quick and cheap." },
  { id: DECISION_MODEL, name: "Decisions", why: "Yes, no or pick-one answers with a confidence, like 'does this firm act for patients?'." },
  { id: MODELS.private, name: "On this Mac", why: "Anything with your health story, money or identity stays on this machine." },
];
/** Why each step uses the models it does, in one line. Facts about where data goes are taken from the ledger, not assumed. */
const STEP_WHY: Partial<Record<Flow, string>> = {
  discovery: "Research is many small reads at once, so one fast model plans and reads: speed wins.",
  compensation: "The reasoning model plans and writes, the fast reader works the pages, Decisions answers yes or no.",
  complaint: "The reasoning model writes your complaint; readers check the rules on the provider's own pages.",
  escalation: "The reasoning model works out if you can go to the independent body and what to send.",
  enquiries: "Kit fills each firm's form; quick decisions pick the right fields.",
};
/** The ledger's job names in plain words. Unknown jobs fall back to their own name. */
const TASK_WORDS: [RegExp, string][] = [
  [/planner$/, "Plans the crew's next moves and changes the plan"],
  [/^discovery (robin|iona|nell)$/, "Runs one crew member's own short research loop"],
  [/^read_page$/, "Reads a page or PDF and pulls out quotes that code then checks"],
  [/^explore_judge$/, "Chooses which link or button to try next on a site"],
  [/^explore_pdf_check$/, "Checks whether a PDF is the document it needs"],
  [/^auto_record$/, "Turns what was read into a step of your route"],
  [/^route_takeaways$/, "Writes the plain-language 'what to know' lines"],
  [/^decisions$/, "Answers yes, no or pick-one questions with a confidence"],
  [/^directory_/, "Works a lawyer register: its search form, results and entries"],
  [/^find_firms$/, "Picks the real law firms out of search results"],
  [/^questionnaire_/, "Answers an online checker's questions, one page at a time"],
  [/^investigat/, "Searches for and judges published decisions and reports"],
  [/^guidance_source$/, "Checks a guidance page comes from a credible clinical source"],
  [/^guidance_applicability$/, "Checks a guideline applies to someone like you"],
  [/^patient_age_band$/, "Works out your age group from your story, nothing more"],
  [/^care_comparison$/, "Compares the guideline with what happened to you"],
  [/^enquiry_draft$/, "Writes your enquiry to the solicitors"],
  [/^complaint_draft$/, "Writes your complaint"],
  [/^time_limit$/, "Reads the time limit from the official page"],
  [/^escalation_/, "Works out when and how to go to the independent body"],
  [/^handoff_relevance$/, "Decides whether a sign-in or check needs you"],
];
const taskWords = (t: string) => TASK_WORDS.find(([re]) => re.test(t))?.[1] ?? t.replace(/_/g, " ");
const DATA_WORDS: Record<string, string> = { place: "where your care happened", health: "your health story", money: "your money answers", identity: "your name and contact details" };
const modelLabel = (id: string) => id.replace(/^local:/, "").replace(/^qwen3:8b$/, "Qwen3 8B");

export default function Insights() {
  return <Suspense fallback={<main className="mx-auto max-w-6xl px-6 py-16 text-muted">Reading the run logs.</main>}><Dashboard /></Suspense>;
}

async function Dashboard() {
  await connection();
  const runs = allRuns();
  // One recent cohort for web access, including unfinished runs, so slow runs are not silently discarded.
  const scope = runs.slice(0, 25);
  const access = scope.flatMap((r) => r.access);
  const fetch = scope.reduce((n, r) => n + r.pages.fetch, 0);
  const browser = scope.reduce((n, r) => n + r.pages.browser, 0);
  const searches = scope.reduce((n, r) => n + r.searches.api, 0);
  const finished = scope.filter((r) => r.finished);
  const prep = finished.filter((r) => r.flow === "compensation" && r.lanes.length >= 3);
  // Use the lower median of the recent finished cohort: a typical fast run, never a stalled run.
  const lanesRun = [...prep].sort((a, b) => a.ms - b.ms)[Math.floor((prep.length - 1) / 2)];
  const evidence = browserEvidence(scope);
  const speed = (["discovery", "compensation", "complaint", "escalation"] as Flow[]).flatMap((flow) => {
    const sample = finished.filter((r) => r.flow === flow);
    return sample.length ? [{ flow, n: sample.length, ms: median(sample.map((r) => r.ms)) }] : [];
  });
  const reasons = [
    { label: "Bot checks", test: /bot check/ },
    { label: "Script-built pages", test: /built by scripts|JavaScript/ },
    { label: "Register filters", test: /register.*filters/ },
    { label: "Eligibility checkers", test: /eligibility checker/ },
    { label: "Enquiry forms", test: /filled .*form \([1-9]\d* fields\)/ },
  ].map((r) => ({ ...r, n: access.filter((a) => a.via === "browser" && r.test.test(a.reason)).length })).filter((r) => r.n).sort((a, b) => b.n - a.n);
  const cloudPrivate = scope.flatMap((r) => r.models).some((m) => m.where === "cloud" && m.data.some((d) => /health|money|identity|contact|financial/i.test(d)));
  const stops = access.filter((a) => a.kind === "task" && /filled .*form \([1-9]\d* fields\).*stopped before Send/.test(a.reason)).length;
  const cohort = `Latest ${scope.length} runs · ${scope.at(-1)?.startedAt.slice(0, 16).replace("T", " ")} to ${scope[0]?.startedAt.slice(11, 16)} UTC`;
  // Which model did which job, per step, from the ledger of the recent finished runs.
  const modelsByFlow = (["discovery", "compensation", "complaint", "escalation", "enquiries"] as Flow[]).map((flow) => {
    // The latest finished runs of this step (any age: some steps run less often than others).
    const rs = runs.filter((r) => r.finished && r.flow === flow).slice(0, 15);
    const by = new Map<string, { model: string; where: string; calls: number; ms: number; crew: Set<string>; tasks: Map<string, number>; data: Set<string> }>();
    for (const r of rs)
      for (const m of r.models) {
        const cur = by.get(m.model) ?? { model: m.model, where: m.where, calls: 0, ms: 0, crew: new Set<string>(), tasks: new Map<string, number>(), data: new Set<string>() };
        cur.calls += m.calls;
        cur.ms += m.ms;
        for (const [t, n] of Object.entries(m.tasks ?? {})) {
          const w = taskWords(t);
          cur.tasks.set(w, (cur.tasks.get(w) ?? 0) + n);
        }
        m.data.forEach((d) => cur.data.add(d));
        if (CREW.some((c) => c.id === m.agent)) cur.crew.add(m.agent);
        by.set(m.model, cur);
      }
    return { flow, runs: rs.length, models: [...by.values()].filter((m) => m.calls > 0).sort((a, b) => b.calls - a.calls) };
  }).filter((f) => f.runs > 0);

  return (
    <main className="mx-auto max-w-6xl space-y-16 px-6 py-10 sm:px-10 sm:py-14">
      <header>
        <div className="mb-10 flex items-center justify-between text-xs text-muted"><Link href="/" className="font-medium text-brand hover:underline">Elliot / for judges</Link><Link href="/compare" className="font-medium text-brand hover:underline">One story, four countries →</Link></div>
        <p className="mb-4 text-xs uppercase tracking-widest text-muted">Harmed by care. Faced with a maze.</p>
        <h1 className="display max-w-3xl text-5xl text-ink sm:text-6xl">One patient.<br />A crew on their side.</h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-ink-2">Elliot finds the local route from medical harm to help, wherever the patient lives.</p>
        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          {[['Research', 'Learn how this place works.'], ['Prepare your case', 'Check funding, firms and evidence.'], ['Review and send', 'The patient has the final word.']].map(([title, text]) => <div key={title} className="rounded-card border border-line bg-subtle p-5"><p className="text-sm font-medium text-ink">{title}</p><p className="mt-1 text-sm text-muted">{text}</p></div>)}
        </div>
      </header>

      <section aria-labelledby="crew-title">
        <Heading id="crew-title" label="The people behind the work" title="Meet the crew." />
        <div className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {CREW.map((c) => <div key={c.id} className="border-t border-line pt-4"><Avatar id={c.id} size="size-24" /><h3 className="mt-3 text-base font-medium text-ink">{c.name}</h3><p className="mt-1 text-sm leading-6 text-ink-2">{c.job}</p></div>)}
        </div>
      </section>

      {modelsByFlow.length > 0 && <section aria-labelledby="models-title">
        <Heading id="models-title" label="The right model for each job" title="Four models, one crew." />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {MODEL_ROLES.map((m) => <div key={m.name} className="rounded-card border border-line p-5"><p className="text-xs uppercase tracking-widest text-muted">{m.name}</p><p className="mt-2 text-base font-medium text-ink">{modelLabel(m.id)}</p><p className="mt-2 text-sm leading-6 text-ink-2">{m.why}</p></div>)}
        </div>
        <div className="mt-8 space-y-6">
          <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
            <div><p className="text-sm font-medium text-ink">Onboarding</p><p className="mt-1 text-xs leading-5 text-muted">A quick model asks the questions in plain words.</p></div>
            <div className="flex flex-wrap gap-3"><div className="flex items-center gap-3 rounded-card border border-line bg-white px-4 py-3"><Avatar id="elliot" size="size-6" /><span className="text-sm text-ink">{modelLabel(MODELS.interview)}</span><span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand">Cloud</span></div></div>
          </div>
          {modelsByFlow.map((f) => <div key={f.flow} className="grid gap-2 sm:grid-cols-[14rem_1fr]">
            <div><p className="text-sm font-medium text-ink">{FLOW_NAME[f.flow]} <span className="font-normal text-muted">· {f.runs} runs</span></p>{STEP_WHY[f.flow] && <p className="mt-1 text-xs leading-5 text-muted">{STEP_WHY[f.flow]}{f.models.some((m) => m.where === "local") ? " Your private details go to the model on this Mac." : ""}</p>}</div>
            <div className="flex flex-wrap gap-3">
              {f.models.map((m) => {
                const role = MODEL_ROLES.find((r) => r.id === m.model);
                const sees = [...m.data].map((d) => DATA_WORDS[d] ?? d);
                return <details key={m.model} className="group rounded-card border border-line bg-white open:basis-full open:border-brand/40">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden" title="Open: why this model, what it gets and what it does">
                    <span className="flex -space-x-1.5">{[...m.crew].map((c) => <Avatar key={c} id={c} size="size-6" />)}</span>
                    <span className="text-sm text-ink">{modelLabel(m.model)}</span>
                    <span className={m.where === "local" ? "rounded-full bg-teal-soft px-2 py-0.5 text-xs text-teal" : "rounded-full bg-brand-soft px-2 py-0.5 text-xs text-brand"}>{m.where === "local" ? "On this Mac" : "Cloud"}</span>
                    <span className="text-xs tabular-nums text-muted">{m.calls} calls · {(m.ms / m.calls / 1000).toFixed(1)} s each</span>
                    <span aria-hidden className="ml-auto text-sm text-muted group-open:rotate-45 transition-transform">+</span>
                  </summary>
                  <div className="grid gap-5 border-t border-line-soft px-4 py-4 text-sm sm:grid-cols-3">
                    <div><p className="text-xs uppercase tracking-widest text-muted">Why this model</p><p className="mt-2 leading-6 text-ink-2">{role ? role.why : "Configured for this job."}</p></div>
                    <div><p className="text-xs uppercase tracking-widest text-muted">What it gets</p><p className="mt-2 leading-6 text-ink-2">{sees.length ? `The job's own text, and from you: ${sees.join(", ")}.` : "Public web pages and the crew's notes. None of your details."}</p><p className="mt-1 text-xs text-muted">{m.where === "local" ? "Runs on this Mac: nothing leaves it." : "Runs in the cloud."}</p></div>
                    <div><p className="text-xs uppercase tracking-widest text-muted">What it does here</p><ul className="mt-2 space-y-1.5 text-ink-2">{[...m.tasks.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => <li key={t} className="flex gap-3"><span className="w-10 shrink-0 text-right tabular-nums text-muted">{n}×</span><span>{t}</span></li>)}</ul></div>
                  </div>
                </details>;
              })}
            </div>
          </div>)}
        </div>
        <p className="mt-4 text-xs text-muted">From the model ledger of every run: who called which model, how often and how long it took. Onboarding asks its questions with {modelLabel(MODELS.interview)}.</p>
      </section>}

      {lanesRun && <section aria-labelledby="parallel-title" className="rounded-card border border-line bg-subtle p-5 sm:p-8">
        <Heading id="parallel-title" label="One shared clock" title="Together, not in a queue." />
        <div className="my-6 flex flex-wrap items-baseline gap-x-5 gap-y-2"><span className="display text-5xl tabular-nums text-ink">{mins(lanesRun.ms)}</span><span className="text-sm text-ink-2">Prepare your case · finished run</span></div>
        <div className="space-y-4">
          {lanesRun.lanes.map((lane) => <div key={lane.crew} className="grid grid-cols-[5rem_1fr] items-center gap-3 sm:grid-cols-[7rem_1fr]"><span className="flex items-center gap-2 text-xs capitalize text-ink-2"><Avatar id={lane.crew} size="size-6" />{lane.crew}</span><div className="relative h-7 border-x border-line bg-white">{lane.spans.map(([a,b], i) => <div key={i} title={`${lane.crew}: ${mins(a)} to ${mins(b)}`} aria-label={`${lane.crew}: ${mins(a)} to ${mins(b)}`} className="absolute top-2 h-3 rounded-sm bg-ink-2" style={{ left: `${a / lanesRun.ms * 100}%`, width: `${Math.max(0.3, (b-a) / lanesRun.ms * 100)}%` }} />)}</div></div>)}
          <div className="grid grid-cols-[5rem_1fr] gap-3 text-xs tabular-nums text-muted sm:grid-cols-[7rem_1fr]"><span>Work spans</span><div className="flex justify-between"><span>0 s</span><span>{mins(lanesRun.ms / 2)}</span><span>{mins(lanesRun.ms)}</span></div></div>
        </div>
        <p className="mt-5 break-words text-xs leading-5 text-muted">{lanesRun.id} · middle-duration run from {prep.length} recent finished case runs.</p>
      </section>}

      {fetch + browser > 0 && <section aria-labelledby="web-title">
        <Heading id="web-title" label="Spend browser time where it counts" title="Fetch first. Browser when it matters." />
        <div className="mt-6 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center">
          <div><p className="display text-6xl tabular-nums text-ink">{Math.round(fetch / (fetch + browser) * 100)}%</p><p className="mt-1 text-sm text-ink-2">of page reads used plain fetch</p></div>
          <div className="space-y-4">
            {[{label:'Plain fetch', n:fetch, color:'bg-teal'}, {label:'Real browser',n:browser,color:'bg-brand'}].map((x) => <div key={x.label}><div className="mb-2 flex justify-between text-sm text-ink-2"><span className="flex items-center gap-2"><span className={`size-2 ${x.color}`} />{x.label}</span><span>{x.n} reads</span></div><div className="h-2 bg-subtle"><div className={`h-2 ${x.color}`} style={{ width: `${x.n / (fetch+browser) * 100}%` }} title={`${x.label}: ${x.n} of ${fetch+browser} reads`} /></div></div>)}
          </div>
        </div>
        <div className="mt-7 flex flex-wrap gap-2">{reasons.map((r) => <span key={r.label} title={`${r.n} browser access events: ${r.label}`} className="rounded-full border border-line px-3 py-2 text-xs text-ink-2">{r.label} · {r.n}</span>)}</div>
        {searches > 0 && <p className="mt-4 text-sm text-ink-2">{searches} searches via API, without opening a search engine.</p>}
        <p className="mt-3 text-xs text-muted">{cohort} · includes unfinished runs.</p>
      </section>}

      {evidence.length > 0 && <section aria-labelledby="proof-title">
        <Heading id="proof-title" label="Real pages, recorded during runs" title="Jobs a browser can do." />
        <div className="mt-6 grid gap-5 lg:grid-cols-3">{evidence.map((shot) => <figure key={shot.title} className="min-w-0 rounded-card border border-line bg-subtle p-3"><a href={`/api/agent/step3/shot?run=${encodeURIComponent(shot.run)}&file=${encodeURIComponent(shot.file)}`} target="_blank" rel="noreferrer" className="block focus-visible:outline-2 focus-visible:outline-brand"><img src={`/api/agent/step3/shot?run=${encodeURIComponent(shot.run)}&file=${encodeURIComponent(shot.file)}`} alt={`${shot.title}: recorded browser page`} className="aspect-[4/3] w-full object-contain" /></a><figcaption className="px-1 pt-4"><h3 className="text-sm font-medium text-ink">{shot.title}</h3><p className="mt-2 break-words text-xs leading-5 text-muted">{shot.run}</p></figcaption></figure>)}</div>
        <p className="mt-4 text-xs text-muted">Recorded demo patients · open an image to inspect the full page.</p>
      </section>}

      {speed.length > 0 && <section aria-labelledby="speed-title">
        <Heading id="speed-title" label="From the run logs" title="Minutes to a next step." />
        <div className="mt-6 grid gap-5 sm:grid-cols-2">{speed.map((s) => <div key={s.flow} className="rounded-card border border-line p-6"><p className="text-sm text-ink-2">{FLOW_NAME[s.flow]}</p><p className="display mt-4 text-6xl tabular-nums text-ink">{mins(s.ms)}</p><p className="mt-3 text-xs text-muted">Median · {s.n} finished runs</p></div>)}</div>
        <p className="mt-4 text-xs text-muted">{cohort} · finished runs only; includes time waiting for answers.</p>
      </section>}

      <section aria-labelledby="safety-title" className="rounded-card bg-paper p-6 sm:p-8">
        <Heading id="safety-title" label="The patient stays in control" title="Prepared by the crew. Sent by you." />
        <div className="mt-7 grid gap-6 sm:grid-cols-2">
          <div className="border-t border-line pt-5"><p className="mb-3 text-xs uppercase tracking-widest text-muted">Crew → Review → Patient sends</p><h3 className="text-lg font-medium text-ink">Stop before Send.</h3><p className="mt-2 text-sm leading-6 text-ink-2">{stops ? `${stops} form tasks recorded a stop before Send in this sample.` : 'The patient reviews each enquiry before sending.'}</p></div>
          <div className="border-t border-line pt-5"><p className="mb-3 text-xs uppercase tracking-widest text-muted">Mac / Cloud</p><h3 className="text-lg font-medium text-ink">Keep private reasoning local.</h3><p className="mt-2 text-sm leading-6 text-ink-2">{cloudPrivate ? 'Design goal; sampled ledgers still record private-data tags on cloud calls.' : 'Local privacy routing needs verification before a stronger claim.'}</p></div>
        </div>
      </section>
      <footer className="border-t border-line pt-5 text-xs text-muted">Live evidence from this machine&apos;s run logs. No crew runs are started by this page.</footer>
    </main>
  );
}

function Heading({ id, label, title }: { id: string; label: string; title: string }) {
  return <div><p className="mb-3 text-xs uppercase tracking-widest text-muted">{label}</p><h2 id={id} className="display text-3xl text-ink sm:text-4xl">{title}</h2></div>;
}
function Avatar({ id, size }: { id: string; size: string }) {
  return <img src={`/crew/${id}-256.png`} alt="" aria-hidden className={`${size} object-contain`} />;
}
