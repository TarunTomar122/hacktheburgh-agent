"use client";

import { useEffect, useRef } from "react";

/**
 * The first screen of onboarding, in the manner of Typeform: one question, big, and one large field to type into.
 * Enter submits. The text is lifted into the page (`value`), so a failed request does not lose what was typed.
 * The answer goes through the normal free-text path (`onSubmit`), so "Om" and "Om Prabhu" both work.
 */
export default function NameStep({
  value,
  onChange,
  busy,
  error,
  onSubmit,
}: {
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
  error: string | null;
  onSubmit: (text: string) => Promise<boolean>;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);

  const text = value.trim();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text && !busy) void onSubmit(text);
  };

  return (
    <form onSubmit={submit} className="fade-up flex flex-1 flex-col justify-center pb-16" aria-labelledby="name-question">
      <p className="eyebrow mb-5">Welcome</p>
      <h1 id="name-question" className="display text-[42px] sm:text-[52px]">
        First, what should I <span className="hl-blue">call you</span>?
      </h1>
      <p className="mt-5 max-w-lg text-[17px] leading-7 text-ink-2">
        I am here to help you work out what went wrong with your care, and what to do next. A first name is fine.
      </p>

      <label htmlFor="name-field" className="sr-only">
        Your name
      </label>
      <input
        id="name-field"
        ref={input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="name"
        maxLength={80}
        placeholder="Type your name here"
        aria-describedby={error ? "name-error" : undefined}
        className="mt-12 w-full border-0 border-b-2 border-line bg-transparent pb-3 font-serif text-[34px] font-light tracking-tight text-ink outline-none transition-colors placeholder:text-fade focus:border-brand sm:text-[40px]"
      />

      {error && (
        <p id="name-error" role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-8 flex items-center gap-4">
        <button type="submit" disabled={!text || busy} className="btn-primary !px-7 !py-3 !text-[15px]">
          {busy ? "One moment…" : "OK"}
        </button>
        <span className="hidden text-[13px] text-muted sm:inline">
          or press <kbd className="rounded-ctl border border-line bg-subtle px-1.5 py-0.5 font-sans text-[12px] font-medium text-ink-2">Enter ↵</kbd>
        </span>
      </div>

      <p className="mt-14 text-[13px] text-muted">A few questions so we can prepare your case. Nothing is sent to the NHS yet.</p>
    </form>
  );
}
