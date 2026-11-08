"use client";

import { useState } from "react";
import { CREW } from "../../lib/agent/plannerTypes";
import type { PlannerResult } from "../../lib/agent/plannerTypes";
import { Button, cx } from "../ui";
import { CrewMark } from "./crew/Crew";
import { boardParts, type BoardInput, type Part } from "./boardParts";
import { Quote } from "./CaseRun";
import { useProfile } from "../../lib/profile";

/**
 * The case as the crew builds it (same look as the research screen): one row per part with one plain line, a word for how
 * well it is backed, and the detail one click away. Rows fill in while the crew works and stay after it finishes.
 */
export default function CaseBoard({ input, onAgain, checkerUrl, next, onFile }: { input: BoardInput; onAgain?: () => void; checkerUrl?: string; /** The one next action once the crew has finished. */ next?: { label: string; note: string; run: () => void }; /** The full written case file. */ onFile?: () => void }) {
  const parts = boardParts(input);
  return (
    <section aria-label="Your case" className="rounded-card border border-line bg-white">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-line-soft px-6 py-5">
        <div>
          <p className="text-[12px] text-muted">Your case</p>
          <h2 className="display mt-1 text-[26px] leading-tight text-ink">{input.result ? "Ready for you to check" : "Being prepared"}</h2>
        </div>
        {input.result && <BundleButton result={input.result} />}
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
      {input.result && <BundleDownload result={input.result} />}
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

/**
 * "Download the case bundle (PDF)": one document for a solicitor, built by POST /api/case/bundle from what the app saved for this case
 * (nothing is looked up again). The case lives in this browser, so it is sent in the request. The board's own finished result is
 * used when the saved case does not have it yet.
 */
function useBundle(result?: PlannerResult | null) {
  const profile = useProfile();
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const saved = profile?.legalAid?.result;
  const available = !!profile && (!!saved || !!result);
  const download = async () => {
    if (!profile) return;
    setState("working");
    try {
      const body = saved || !result ? profile : { ...profile, legalAid: { ...profile.legalAid, result } };
      const res = await fetch("/api/case/bundle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ profile: body }) });
      if (!res.ok) throw new Error(String(res.status));
      const file = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "case-bundle.pdf";
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = file;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState("idle");
    } catch {
      setState("error");
    }
  };
  return { available, state, download };
}

/** The PDF button on its own, for the top of the board and of the case file. */
export function BundleButton({ result }: { result?: PlannerResult | null }) {
  const b = useBundle(result);
  if (!b.available) return null;
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" size="sm" onClick={b.download} disabled={b.state === "working"}>
        {b.state === "working" ? "Making the PDF" : "Download PDF"}
      </Button>
      {b.state === "error" && (
        <p role="alert" className="text-[12px] text-danger">
          The PDF could not be made just now. Try again.
        </p>
      )}
    </div>
  );
}

function BundleDownload({ result }: { result?: PlannerResult | null }) {
  const b = useBundle(result);
  if (!b.available) return null;
  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-line-soft px-6 py-4">
      <div className="min-w-[14rem] flex-1">
        <p className="text-[12px] text-muted">For a solicitor</p>
        <p className="text-[13px] leading-5 text-muted">One PDF with your story, the route where you live, the time limits, funding, the evidence and the solicitors, each with its source.</p>
        {b.state === "error" && (
          <p role="alert" className="mt-1 text-[13px] leading-5 text-danger">
            The PDF could not be made just now. Try again in a moment.
          </p>
        )}
      </div>
      <Button variant="secondary" size="sm" onClick={b.download} disabled={b.state === "working"}>
        {b.state === "working" ? "Making the PDF" : "Download the case bundle (PDF)"}
      </Button>
    </div>
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
          {p.summary && <span className="mt-0.5 block text-[13px] leading-5 text-muted">{p.summary}</span>}
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
                  <span className="font-medium text-ink">{o.firmName}</span>: Kit typed or picked {o.filled.length} detail{o.filled.length === 1 ? "" : "s"} ({o.filled.slice(0, 4).map((x) => x.label).join(", ")}{o.filled.length > 4 ? ` and ${o.filled.length - 4} more` : ""}) and stopped before Send.
                </p>
              ))}
          {p.status !== "done" && <p className="text-[13px] text-muted">{p.status === "working" ? `${CREW[p.crew].name} is still on this.` : "Nothing yet."}</p>}
        </div>
      )}
    </li>
  );
}
