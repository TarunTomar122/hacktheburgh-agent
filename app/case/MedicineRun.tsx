"use client";

import { useState } from "react";
import { CREW, type CrewId } from "../../lib/agent/plannerTypes";
import type { MedicineReport } from "../../lib/agent/medicine";
import type { RouteMap } from "../../lib/agent/routeTypes";
import type { Profile } from "../../lib/profile";
import { Button, cx } from "../ui";
import { Workspace, type CrewKit } from "./CaseRun";
import { CrewMark } from "./crew/Crew";
import StepStrip, { type Step } from "./crew/StepStrip";
import { usePlannerRun } from "./usePlannerRun";
import { placeOf, useDemoAvailable } from "./useDemo";

/**
 * Report a medicine problem (the optional extra step, shown when the story involves a medicine). Same crew screen as the
 * other steps: Robin finds the place's own medicines regulator, Iona reads the medicine and the side effect from the
 * story, Kit fills the regulator's own report form and stops before Submit. The patient checks it and submits it.
 */

const ROLES: Partial<Record<CrewId, string>> = { elliot: "Leads the report", robin: "Finds the regulator", iona: "Reads the medicine", kit: "Fills the report" };
const KIT: CrewKit = { workers: ["robin", "iona", "kit"], role: (id) => ROLES[id] ?? CREW[id].role };
const STEPS: Step[] = [
  { crew: ["robin"], title: "Find the regulator", line: "Where anyone can report a side effect here" },
  { crew: ["iona"], title: "Read the medicine", line: "The medicine and what it did, from your story" },
  { crew: ["kit"], title: "Fill the report", line: "Their own form, stopped before Submit" },
];

export default function MedicineRun({ profile, route }: { profile: Profile; route?: RouteMap }) {
  const { state, start, answer, skip, pause, switchToRecording } = usePlannerRun({ scope: "medicine", caseId: profile.createdAt });
  const place = placeOf(profile);
  const hasDemo = useDemoAvailable("medicine", place);
  const go = () => start(profile.facts, undefined, "medicine_anywhere", route);
  const live = state.status === "running" || state.says.length > 0;
  if (live) {
    const r = state.medicine;
    return <Workspace state={state} onAnswer={answer} onSkip={skip} onPause={pause} onRetry={go} onRecorded={hasDemo ? () => switchToRecording({ flow: "medicine", place }) : undefined} kit={KIT} main={<Board report={r ?? null} running={state.status === "running"} />} />;
  }
  const where = [profile.facts.region, profile.facts.country].filter(Boolean).join(", ");
  return (
    <div className="mx-auto max-w-5xl py-4">
      <h1 className="display text-[44px] text-ink">Report a medicine problem</h1>
      <p className="mt-3 flex items-center gap-2 text-[15px] text-ink-2">
        <CrewMark id="elliot" size={28} /> Your story mentions a medicine. The crew can report the side effect to the medicines regulator{where ? ` in ${where}` : ""}, so it can protect others. It takes about a minute.
      </p>
      <div className="mt-12">
        <StepStrip steps={STEPS} />
      </div>
      <div className="mt-12 flex flex-col items-center gap-4">
        <Button onClick={go}>Prepare the report</Button>
        <p className="text-[13px] text-muted">
          <span className="text-teal">✓</span> Their own official form <span className="mx-2 text-fade">·</span> <span className="text-teal">✓</span> Nothing sent without your OK
        </p>
        {state.status === "error" && <p className="text-sm text-danger">{state.error}</p>}
      </div>
    </div>
  );
}

/** The report as it builds: who it goes to, the medicine, and the form. Details one click away. */
function Board({ report, running }: { report: MedicineReport | null; running: boolean }) {
  const reg = report?.regulator;
  const med = report?.medicine;
  const form = report?.form;
  const rows: { id: string; crew: CrewId; label: string; headline: string; line?: string; detail?: React.ReactNode }[] = [
    {
      id: "regulator",
      crew: "robin",
      label: "Who it goes to",
      headline: reg ? reg.body : running ? "Finding the medicines regulator" : "Not found",
      line: reg ? new URL(reg.url).hostname.replace(/^www\./, "") : undefined,
      detail: reg && (
        <>
          {reg.quote && <p className="border-l-2 border-line pl-3 font-serif text-[15px] leading-6 text-ink">&ldquo;{reg.quote}&rdquo;</p>}
          <a className="text-[13px] text-brand hover:underline" href={reg.url} target="_blank" rel="noreferrer">
            Open their page ↗
          </a>
        </>
      ),
    },
    {
      id: "medicine",
      crew: "iona",
      label: "The medicine",
      headline: med ? med.name || "The medicine is not named in your story" : running ? "Reading your story" : "Not read",
      line: med ? [med.reactions.join(", "), med.outcome !== "unknown" ? med.outcome : ""].filter(Boolean).join(" · ") : undefined,
      detail: med && <p className="text-[14px] leading-6 text-ink-2">{med.howBad}</p>,
    },
    {
      id: "form",
      crew: "kit",
      label: "The report",
      headline: !form || form.status === "not_started" ? (running ? "Filling their form" : "Not filled") : form.status === "ready_to_submit" ? "Filled, waiting for you to submit it" : form.status === "needs_input" ? (form.unfilled.some((u) => u.startsWith("Your agreement")) ? "Filled, waiting for your agreement" : "Filled as far as it could go") : "Could not be filled",
      line: form && form.status !== "not_started" ? (form.status === "ready_to_submit" ? `${form.filled.length} answers on their own form, stopped before Submit` : form.filled.length ? `${form.filled.length} answers on their own form. ${form.note}` : form.note) : undefined,
      detail: form && form.filled.length > 0 && (
        <ul className="space-y-1 text-[13px] leading-5 text-ink-2">
          {form.filled.map((f, i) => (
            <li key={i}>
              <span className="text-muted">{f.label}:</span> {f.value}
            </li>
          ))}
        </ul>
      ),
    },
  ];
  return (
    <section aria-label="Your report" className="rounded-card border border-line bg-white">
      <header className="border-b border-line-soft px-6 py-5">
        <p className="text-[12px] text-muted">Your report</p>
        <h2 className="display mt-1 text-[26px] leading-tight text-ink">{form?.status === "ready_to_submit" ? "Ready for you to check and submit" : running ? "Being prepared" : form?.status === "needs_input" ? "Waiting for you" : form?.status === "failed" ? "Could not finish the form" : "Being prepared"}</h2>
      </header>
      <ol className="divide-y divide-line-soft">
        {rows.map((r) => (
          <Row key={r.id} {...r} />
        ))}
      </ol>
    </section>
  );
}

function Row({ crew, label, headline, line, detail }: { crew: CrewId; label: string; headline: string; line?: string; detail?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button className="flex w-full items-start gap-4 px-6 py-4 text-left hover:bg-subtle/40" onClick={() => setOpen((o) => !o)} aria-expanded={open} disabled={!detail}>
        <span className="flex w-36 shrink-0 items-start gap-2 text-[13px] leading-6 text-muted">
          <CrewMark id={crew} size={24} />
          <span>{label}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-medium leading-6 text-ink">{headline}</span>
          {line && <span className="mt-0.5 block text-[13px] leading-5 text-muted">{line}</span>}
        </span>
        {detail && <span aria-hidden className={cx("mt-1 text-[13px] text-muted")}>{open ? "−" : "+"}</span>}
      </button>
      {open && detail && <div className="rise space-y-3 px-6 pb-5 pl-[calc(1.5rem+9rem+1rem)]">{detail}</div>}
    </li>
  );
}
