/* eslint-disable @next/next/no-img-element -- recorded run screenshots and static crew artwork */
import { CREW } from "../../lib/agent/plannerTypes";
import type { Journey } from "../../lib/journey";
import { costOf, isLocalModel, SEARCH_PRICE, tokens, usd } from "../../lib/pricing";

/**
 * The judges' page as one story: a single recorded journey (Research, then Prepare your case) told in four parts that
 * match how the track is judged: the workflow, the models, the tokens and the time. Every number comes from the run logs.
 */

const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
};
const shot = (run: string, file: string) => `/api/agent/step3/shot?run=${encodeURIComponent(run)}&file=${encodeURIComponent(file)}`;
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });

type Role = { id: string; name: string; why: string; label: string };

export default function Story({ j, roles }: { j: Journey; roles: Role[] }) {
  const cut = (j.research.ms / j.ms) * 100;
  const cloud = j.models.filter((m) => m.where === "cloud" && !isLocalModel(m.model));
  const local = j.models.filter((m) => m.where === "local" || isLocalModel(m.model));
  const cloudTok = cloud.reduce((n, m) => n + m.inTok + m.outTok, 0);
  const localTok = local.reduce((n, m) => n + m.inTok + m.outTok, 0);
  const dollars = cloud.reduce((n, m) => n + (costOf(m.model, m.inTok, m.outTok) ?? 0), 0) + j.counts.searches * SEARCH_PRICE;
  const counters: [number, string][] = [
    [j.counts.pages, "web pages read"],
    [j.counts.browserPages, "needed a browser"],
    [j.counts.handoffs, "hand-offs between agents"],
    [j.counts.forms, "enquiry forms filled"],
    [j.counts.asks, j.counts.asks === 1 ? "question for the patient" : "questions for the patient"],
  ];

  return (
    <>
      <header>
        <p className="display text-[96px] leading-none tabular-nums text-ink sm:text-[128px]">{clock(j.ms)}</p>
        <h1 className="mt-6 max-w-3xl text-2xl leading-snug text-ink sm:text-3xl">
          From a patient&apos;s story to {j.counts.forms} law firms&apos; own enquiry forms, filled in and waiting for the patient&apos;s OK.
        </h1>
        <p className="mt-4 text-sm text-muted">
          One recorded run on {day(j.startedAt)}, {j.place}. Research took {clock(j.research.ms)} and preparing the case took {clock(j.case.ms)}.
        </p>
      </header>

      <section aria-labelledby="workflow-title">
        <h2 id="workflow-title" className="display text-4xl text-ink">How the crew did it</h2>
        <p className="mt-3 max-w-2xl text-ink-2">Elliot plans and hands out the work. The others run at the same time, each in their own browser. Open a row to see what they did.</p>

        <div className="mt-8 grid grid-cols-[9rem_1fr] text-xs text-muted sm:grid-cols-[11rem_1fr]">
          <span />
          <div className="relative h-5">
            <span className="absolute left-0">Research</span>
            <span className="absolute" style={{ left: `${cut}%` }}>
              <span className="pl-2">Prepare the case</span>
            </span>
          </div>
        </div>
        <div className="divide-y divide-line-soft border-y border-line-soft">
          {j.lanes.map((lane) => {
            const c = CREW[lane.crew];
            const w = j.work[lane.crew];
            const dots = j.moments.filter((m) => m.crew === lane.crew);
            const asked = w.asked.slice(0, 5);
            return (
              <details key={lane.crew} className="group">
                <summary className="grid cursor-pointer list-none grid-cols-[9rem_1fr] items-center py-3 hover:bg-subtle sm:grid-cols-[11rem_1fr] [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center gap-3">
                    <img src={`/crew/${lane.crew}-256.png`} alt="" aria-hidden className="size-9 object-contain" />
                    <span>
                      <span className="block text-sm font-medium text-ink">{c.name}</span>
                      <span className="block text-xs text-muted">{c.role}</span>
                    </span>
                  </span>
                  <span className="relative block h-9">
                    <span aria-hidden className="absolute inset-y-0 w-px bg-line" style={{ left: `${cut}%` }} />
                    {lane.spans.map(([a, b], i) => (
                      <span key={i} className="absolute top-3 h-3 rounded-full opacity-80" style={{ left: `${(a / j.ms) * 100}%`, width: `${Math.max(0.6, ((b - a) / j.ms) * 100)}%`, background: c.color }} title={`${c.name} working, ${clock(a)} to ${clock(b)}`} />
                    ))}
                    {dots.map((m, i) => (
                      <span key={i} className="absolute top-2.5 size-4 -translate-x-1/2 rounded-full border-2 border-white" style={{ left: `${(m.t / j.ms) * 100}%`, background: c.color }} title={`${clock(m.t)}: ${m.text}`} />
                    ))}
                  </span>
                </summary>
                <div className="grid gap-6 pb-6 pt-2 sm:grid-cols-[11rem_1fr]">
                  <span />
                  <div className="min-w-0 space-y-5">
                    {lane.crew === "elliot" ? (
                      <p className="text-sm text-ink-2">Planned the work, handed it out and read every report back: {j.counts.handoffs} hand-offs in all.{j.counts.replans ? ` Changed the plan ${j.counts.replans} ${j.counts.replans === 1 ? "time" : "times"} when something did not work.` : ""}</p>
                    ) : (
                      <div className="text-sm text-ink-2">
                        <p className="text-muted">Elliot asked {c.name} to:</p>
                        <ul className="mt-2 space-y-1">
                          {asked.map((a) => (
                            <li key={a}>{a}</li>
                          ))}
                        </ul>
                        {w.asked.length > asked.length && <p className="mt-2 text-muted">And {w.asked.length - asked.length} other jobs.</p>}
                      </div>
                    )}
                    {dots.length > 0 && (
                      <ul className="space-y-1 text-sm text-ink">
                        {dots.slice(-3).map((m, i) => (
                          <li key={i} className="flex gap-3">
                            <span className="w-24 shrink-0 whitespace-nowrap tabular-nums text-muted">{clock(m.t)}</span>
                            <span>{m.text}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {w.shots.length > 0 && (
                      <div className="flex gap-3 overflow-x-auto pb-2">
                        {w.shots.slice(-6).map((s) => (
                          <a key={s.file} href={shot(s.run, s.file)} target="_blank" rel="noreferrer" className="w-56 shrink-0">
                            <img src={shot(s.run, s.file)} alt={`${c.name}'s browser on ${s.site}`} className="aspect-[4/3] w-full rounded-md border border-line object-cover object-top" />
                            <span className="mt-1 block text-xs text-muted">{s.site}</span>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </details>
            );
          })}
        </div>
        <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-5">
          {counters.map(([n, label]) => (
            <div key={label}>
              <p className="display text-5xl tabular-nums text-ink">{n}</p>
              <p className="mt-1 text-sm text-ink-2">{label}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="models-story-title">
        <h2 id="models-story-title" className="display text-4xl text-ink">Four models, each with one job</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {roles.map((r) => {
            const m = j.models.find((x) => x.model === r.id);
            const mac = isLocalModel(r.id);
            return (
              <div key={r.id} className={mac ? "rounded-card bg-teal-soft p-5" : "rounded-card border border-line p-5"}>
                <p className="text-sm text-muted">{r.name}</p>
                <p className="mt-1 text-lg font-medium text-ink">{r.label}</p>
                <p className="mt-3 text-sm leading-6 text-ink-2">{r.why}</p>
                <p className="mt-4 text-sm tabular-nums text-ink">{m ? `${m.calls} calls in this run` : "Not needed in this run"}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="cost-story-title">
        <h2 id="cost-story-title" className="display text-4xl text-ink">What it cost</h2>
        <div className="mt-8 flex flex-wrap items-end gap-x-14 gap-y-6">
          <div>
            <p className="display text-7xl tabular-nums text-ink">{dollars < 0.1 ? usd(dollars) : `$${dollars.toFixed(2)}`}</p>
            <p className="mt-1 text-sm text-ink-2">for the whole case, at list prices</p>
          </div>
          <div>
            <p className="display text-5xl tabular-nums text-ink">{tokens(cloudTok)}</p>
            <p className="mt-1 text-sm text-ink-2">tokens sent to cloud models</p>
          </div>
          <div>
            <p className="display text-5xl tabular-nums text-teal">{tokens(localTok)}</p>
            <p className="mt-1 text-sm text-ink-2">tokens of private details, read only on this Mac</p>
          </div>
        </div>
      </section>

      {j.forms.length > 0 && (
        <section aria-labelledby="forms-story-title">
          <h2 id="forms-story-title" className="display text-4xl text-ink">Ready for the patient to send</h2>
          <p className="mt-3 max-w-2xl text-ink-2">Kit filled in each firm&apos;s own form and stopped before Send. Nothing goes out until the patient presses it.</p>
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {j.forms.map((f) => (
              <figure key={f.firm} className="min-w-0">
                {f.shot ? (
                  <a href={shot(f.shot.run, f.shot.file)} target="_blank" rel="noreferrer">
                    <img src={shot(f.shot.run, f.shot.file)} alt={`${f.firm}'s enquiry form, filled in`} className="aspect-[4/3] w-full rounded-card border border-line object-cover object-top" />
                  </a>
                ) : (
                  <div className="aspect-[4/3] w-full rounded-card border border-line bg-subtle" />
                )}
                <figcaption className="mt-3">
                  <p className="text-sm font-medium text-ink">{f.firm}</p>
                  <p className="text-sm text-muted">{f.fields} answers typed in. Stopped before Send.</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
