"use client";

import { useState } from "react";
import { CREW } from "../../lib/agent/plannerTypes";
import type { PlannerResult } from "../../lib/agent/plannerTypes";
import { Button, cx } from "../ui";
import { CrewMark } from "./crew/Crew";
import { boardParts, type BoardInput, type Part } from "./boardParts";
import { Quote } from "./CaseRun";

/**
 * The case as the crew builds it (same look as the research screen): one row per part with one plain line, a word for how
 * well it is backed, and the detail one click away. Rows fill in while the crew works and stay after it finishes.
 */
export default function CaseBoard({ input, onAgain, checkerUrl, next, onFile }: { input: BoardInput; onAgain?: () => void; checkerUrl?: string; /** The one next action once the crew has finished. */ next?: { label: string; note: string; run: () => void }; /** The full written case file. */ onFile?: () => void }) {
  const parts = boardParts(input);
  return (
    <section aria-label="Your case" className="rounded-card border border-line bg-white">
      <header className="border-b border-line-soft px-6 py-5">
        <p className="text-[12px] text-muted">Your case</p>
        <h2 className="display mt-1 text-[26px] leading-tight text-ink">{input.result ? "Ready for you to check" : "Being prepared"}</h2>
      </header>
      <ol className="divide-y divide-line-soft">
        {parts.map((p) => (
          <PartRow key={p.id} part={p} input={input} checkerUrl={checkerUrl} />
        ))}
      </ol>
      {next && (
        <div className="flex flex-wrap items-center gap-4 border-t border-line-soft px-6 py-4">
          <div className="min-w-[14rem] flex-1">
            <p className="text-[12px] text-muted">Your next step</p>
            <p className="text-[15px] font-medium leading-6 text-ink">{next.label}</p>
            <p className="text-[13px] leading-5 text-muted">{next.note}</p>
          </div>
          <Button onClick={next.run}>{next.label.startsWith("Check") ? "Review and send" : "Continue"}</Button>
        </div>
      )}
      {(onAgain || onFile) && (
        <p className="flex flex-wrap gap-x-5 border-t border-line-soft px-6 py-4 text-[13px] text-muted">
          {onFile && (
            <button className="text-brand hover:underline" onClick={onFile}>
              Open the full case file
            </button>
          )}
          {onAgain && (
            <button className="hover:text-ink" onClick={onAgain}>
              Something look thin? Run the crew again
            </button>
          )}
        </p>
      )}
    </section>
  );
}

function PartRow({ part: p, input, checkerUrl }: { part: Part; input: BoardInput; checkerUrl?: string }) {
  const [open, setOpen] = useState(false);
  const idle = p.status === "waiting" || p.status === "skipped";
  const r: PlannerResult | undefined = input.result;
  return (
    <li>
      <button className="flex w-full items-start gap-4 px-6 py-4 text-left hover:bg-subtle/40 disabled:cursor-default" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="flex w-36 shrink-0 items-start gap-2 text-[13px] leading-6 text-muted">
          <CrewMark id={p.crew} size={24} className={cx(idle && "opacity-40 grayscale")} />
          <span>{p.label}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx("block text-[16px] leading-6", idle ? "text-muted" : "font-medium text-ink")}>{p.headline}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
            {p.status === "working" && <span className="rounded-[4px] bg-brand-soft px-1.5 py-0.5 text-brand">{CREW[p.crew].name} is on it</span>}
            {p.chip && <span className="rounded-[4px] bg-teal-soft px-1.5 py-0.5 text-teal">{p.chip}</span>}
          </span>
        </span>
        <span aria-hidden className="mt-1 text-[13px] text-muted">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="rise space-y-3 px-6 pb-5 pl-[calc(1.5rem+9rem+1rem)]">
          {p.id === "funding" && r?.calculatorText && (
            <Quote source={input.checker ?? "The legal aid checker"} href={checkerUrl}>
              {r.calculatorText}
            </Quote>
          )}
          {p.id === "lawyers" && r && (
            <ul className="space-y-1 text-[14px] leading-6 text-ink">
              {r.shortlist.map((id) => r.firms.find((f) => f.id === id)).filter((f) => !!f).map((f) => (
                <li key={f.id}>
                  {f.website ? (
                    <a className="text-brand hover:underline" href={f.website} target="_blank" rel="noreferrer">
                      {f.name} ↗
                    </a>
                  ) : (
                    f.name
                  )}
                  {f.town && <span className="text-muted"> · {f.town}</span>}
                </li>
              ))}
            </ul>
          )}
          {p.id === "evidence" && (r?.evidence ?? input.evidence).guideline?.points[0] && (
            <Quote source={(r?.evidence ?? input.evidence).guideline!.name.split(":")[0]} href={(r?.evidence ?? input.evidence).guideline!.url}>
              {(r?.evidence ?? input.evidence).guideline!.points[0].text}
            </Quote>
          )}
          {p.id === "enquiries" &&
            (r?.enquiries ?? input.enquiries)
              .filter((o) => o.filled.length)
              .map((o) => (
                <p key={o.firmId} className="text-[14px] leading-6 text-ink-2">
                  <span className="font-medium text-ink">{o.firmName}</span>: Kit typed or picked {o.filled.length} detail{o.filled.length === 1 ? "" : "s"} ({o.filled.slice(0, 4).map((x) => x.label).join(", ")}
                  {o.filled.length > 4 ? ", …" : ""}) and stopped before Send.
                </p>
              ))}
          {p.status !== "done" && <p className="text-[13px] text-muted">{p.status === "working" ? `${CREW[p.crew].name} is still on this.` : "Nothing yet."}</p>}
          <p className="text-[12px] text-faint">Everything {CREW[p.crew].name} did is in the history on the right.</p>
        </div>
      )}
    </li>
  );
}
