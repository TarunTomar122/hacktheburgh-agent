"use client";

import type { ReactNode } from "react";

/** The big green-light row under a one-question screen: the OK button, how to use the keyboard, and (optionally) a way back. */
export function OkRow({
  disabled,
  busy,
  label = "OK",
  hint,
  onBack,
}: {
  disabled?: boolean;
  busy?: boolean;
  label?: string;
  /** Replaces the default "or press Enter" text. */
  hint?: ReactNode;
  onBack?: () => void;
}) {
  return (
    <div className="mt-8 flex flex-wrap items-center gap-4">
      <button type="submit" disabled={disabled || busy} className="btn-primary !px-7 !py-3 !text-[15px]">
        {busy ? "One moment…" : label}
      </button>
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
