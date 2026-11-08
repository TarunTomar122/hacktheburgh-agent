"use client";

import { useState } from "react";
import type { ExtraAnswers } from "../../lib/agent/extra";
import { Button, control, Eyebrow } from "../ui";
import type { DoneEvent } from "./streamAgent";

/** "* Forenames: (unsure, confidence 0.58)" -> "Forenames" */
const clean = (s: string) => s.replace(/\s*\((?:unsure|no answer|no saved value fits|chosen option not found)[^)]*\)\s*$/i, "").replace(/^\s*\*\s*|\s*\*\s*$/g, "").replace(/:\s*$/, "").trim();

/**
 * When the agent stops on a field it could not fill, ask exactly that here, on the step, then run again with the answer.
 * Consent boxes are not answered here: those come from onboarding.
 */
export default function AgentAsk({ result, busy, onAnswer }: { result: DoneEvent; busy: boolean; onAnswer: (extra: ExtraAnswers) => void }) {
  const items = (result.unfilled.length ? result.unfilled : result.question ? [result.question] : []).map(clean).filter(Boolean);
  const [values, setValues] = useState<string[]>(() => items.map(() => ""));
  // No concrete question (the agent got stuck on a page): offer a retry instead of a meaningless question.
  if (result.unfilled.length === 0) {
    return (
      <section className="rounded-card border border-line bg-white p-6">
        <Eyebrow>The agent stopped part-way</Eyebrow>
        <p className="mt-1 text-sm text-ink-2">It was not sure how to continue on one page. Nothing has been sent.</p>
        <Button size="sm" className="mt-3" disabled={busy} onClick={() => onAnswer([])}>
          Try again
        </Button>
      </section>
    );
  }
  const ready = values.every((v) => v.trim());
  return (
    <section className="overflow-hidden rounded-card border border-brand/30 bg-white">
      <div className="space-y-1 bg-brand-soft/60 px-6 py-4">
        <Eyebrow className="text-brand">The form asked something we do not know</Eyebrow>
        <p className="text-sm text-ink-2">Answer below and we will fill it in again. Nothing has been sent.</p>
      </div>
      <div className="space-y-4 p-6">
        {items.map((label, i) => (
          <label key={label + i} className="block space-y-1.5">
            <span className="block text-sm font-medium text-ink">{label}</span>
            <input className={control} value={values[i]} onChange={(e) => setValues(values.map((v, j) => (j === i ? e.target.value : v)))} />
          </label>
        ))}
        <Button size="sm" disabled={!ready || busy} onClick={() => onAnswer(items.map((label, i) => ({ label, value: values[i].trim() })))}>
          Continue
        </Button>
      </div>
    </section>
  );
}
