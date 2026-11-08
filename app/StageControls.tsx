"use client";

import type { ReactNode } from "react";
import { PERSONA_PICKER_ENABLED } from "../lib/personas";

/**
 * "Demo fill": a quiet dashed control that puts a fictional answer from the demo persona into the question, for live demos.
 * It never submits and never skips a step; the presenter still presses OK. Same rule as the header's "Try a persona".
 */
export function DemoFillButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  if (!PERSONA_PICKER_ENABLED) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Demo shortcut: fill in a fictional answer. You still press OK yourself."
      className="inline-flex shrink-0 items-center rounded-ctl border border-dashed border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-faint hover:text-ink-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      Demo fill
    </button>
  );
}

/** The big green-light row under a one-question screen: the OK button, how to use the keyboard, and (optionally) a way back. */
export function OkRow({
  disabled,
  busy,
  label = "OK",
  hint,
  onBack,
  onDemo,
}: {
  disabled?: boolean;
  busy?: boolean;
  label?: string;
  /** Replaces the default "or press Enter" text. */
  hint?: ReactNode;
  onBack?: () => void;
  /** Puts a demo answer in the question (see DemoFillButton). Not shown unless the demo shortcuts are on. */
  onDemo?: () => void;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-4">
      <button type="submit" disabled={disabled || busy} className="btn-primary !px-7 !py-3 !text-[15px]">
        {busy ? "One moment…" : label}
      </button>
      {onDemo && <DemoFillButton onClick={onDemo} disabled={busy} />}
      {hint ?? (
        <span className="hidden text-[13px] text-muted sm:inline">
          or press <kbd className="rounded-ctl border border-line bg-subtle px-1.5 py-0.5 font-sans text-[12px] font-medium text-ink-2">Enter ↵</kbd>
        </span>
      )}
      {onBack && (
        <button type="button" onClick={onBack} className="text-[13px] font-medium text-brand hover:underline">
          ← Back
        </button>
      )}
    </div>
  );
}

export function ErrorLine({ message, id }: { message: string | null; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-3 text-sm text-danger">
      {message}
    </p>
  );
}
