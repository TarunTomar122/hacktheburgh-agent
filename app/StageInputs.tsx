"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { emailProblem, outcomeSentence, phoneProblem, postcodeProblem, splitPostcode, type FormField, type InputSpec } from "../lib/agent/inputs";
import type { WidgetAnswer } from "../lib/agent/interview";
import DateField from "./DateField";
import { demoChoiceValue, demoFieldValue, demoName, demoOutcomes, demoStory } from "../lib/personas/demoFill";
import { DemoFillButton, ErrorLine, OkRow } from "./StageControls";

/**
 * The inputs of the onboarding interview as full-screen, one-question-at-a-time controls, in the manner of Typeform:
 * big type, one thing to answer, OK or Enter to go on. Same props and the same answers as `InputPanel`, which stays as it is for the
 * compact version the case page uses ("ask only what is missing"). A form with several fields is asked one field at a time
 * and sent as one answer at the end, so the server sees exactly what it saw before.
 */
export default function StageInput({
  spec,
  busy,
  error,
  onFree,
  onAnswer,
}: {
  spec: InputSpec;
  busy: boolean;
  error: string | null;
  onFree: (text: string) => Promise<boolean>;
  onAnswer: (answer: WidgetAnswer) => Promise<boolean>;
}) {
  switch (spec.kind) {
    case "text":
    case "textarea":
      return <FreeText spec={spec} busy={busy} error={error} onFree={onFree} />;
    case "form":
      return <StageForm spec={spec} busy={busy} error={error} onAnswer={onAnswer} />;
    case "choice":
      return <StageChoice spec={spec} busy={busy} error={error} onAnswer={onAnswer} />;
    case "checklist":
      return <StageChecklist spec={spec} busy={busy} error={error} onAnswer={onAnswer} />;
    case "none":
      return null;
  }
}

/* ---------------------------------------------------------------- free text */

function FreeText({
  spec,
  busy,
  error,
  onFree,
}: {
  spec: Extract<InputSpec, { kind: "text" | "textarea" }>;
  busy: boolean;
  error: string | null;
  onFree: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const id = useId();
  const multi = spec.kind === "textarea";
  const box = useRef<HTMLTextAreaElement>(null);
  // The story box grows with what is typed: two lines to start, then as tall as the text needs, up to 60% of the window, then it scrolls.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);
  async function send() {
    if (!text.trim() || busy) return;
    if (await onFree(text.trim())) setText("");
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <label htmlFor={id} className="sr-only">
        {spec.label}
      </label>
      {multi ? (
        <textarea
          id={id}
          ref={box}
          autoFocus
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={spec.placeholder}
          className="big-input max-h-[60vh] overflow-y-auto !text-[22px] !leading-9 sm:!text-[26px]"
        />
      ) : (
        <input id={id} autoFocus autoComplete="off" value={text} onChange={(e) => setText(e.target.value)} placeholder={spec.placeholder} className="big-input" />
      )}
      <ErrorLine message={error} />
      <OkRow disabled={!text.trim()} busy={busy} onDemo={() => setText(multi ? demoStory() : demoName())} hint={multi ? <span className="hidden text-[13px] text-muted sm:inline">Enter sends. Shift + Enter starts a new line.</span> : undefined} />
    </form>
  );
}

/* ---------------------------------------------------------------- a form, one field at a time */

function problemWith(f: FormField, v: string): string | null {
  if (f.required && !v) return `Please fill in: ${f.label.replace(/\?$/, "")}.`;
  // The UK checks only apply where the place is in the UK (f.uk, set from the facts by inputFor).
  if (v && f.kind === "postcode") return postcodeProblem(v, f.uk ?? null);
  if (v && f.kind === "tel") return phoneProblem(v, f.uk ?? null);
  if (v && f.kind === "email") return emailProblem(v);
  return null;
}

function StageForm({
  spec,
  busy,
  error,
  onAnswer,
}: {
  spec: Extract<InputSpec, { kind: "form" }>;
  busy: boolean;
  error: string | null;
  onAnswer: (answer: WidgetAnswer) => Promise<boolean>;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [i, setI] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  // A postcode found inside the address is taken out of it and its question skipped.
  const [note, setNote] = useState<string | null>(null);
  const [autoPostcode, setAutoPostcode] = useState(false);
  // The date field keeps its own mode, so a demo fill remounts it to show the filled date in the right mode.
  const [dateKey, setDateKey] = useState(0);
  const baseId = useId();
  const total = spec.fields.length;
  const f = spec.fields[i];
  const value = values[f.key] ?? "";
  const id = `${baseId}-${f.key}`;
  const setValue = (v: string) => setValues((s) => ({ ...s, [f.key]: v }));

  /** Check this field, then go to the next one, or send everything after the last. `override` is for choices that go on at once. */
  function advance(override?: string) {
    const v = override ?? value;
    const msg = problemWith(f, v.trim());
    if (msg) return setProblem(msg);
    setProblem(null);
    let next = { ...values, [f.key]: v };
    let step = i + 1;
    let auto = false;
    if (f.key === "address") {
      const at = spec.fields.findIndex((x) => x.key === "postcode");
      // Only a postcode we filled in ourselves (or none yet) may be replaced by one found in the address; only UK postcodes are recognised, so not outside the UK.
      const open = at > i && spec.fields[at].uk !== false && (autoPostcode || !(next.postcode ?? "").trim());
      const found = open ? splitPostcode(v.trim()) : null;
      if (found) {
        next = { ...next, address: found.address, postcode: found.postcode };
        step = at + 1;
        auto = true;
        setNote(`Postcode ${found.postcode} taken from your address.`);
      }
    }
    if (!auto) setNote(null);
    setAutoPostcode(auto);
    setValues(next);
    if (step >= total) void onAnswer(next);
    else setI(step);
  }

  let control: React.ReactNode;
  if (f.kind === "date") {
    control = <DateField key={dateKey} big label={f.label} value={value} onChange={setValue} autoFocus />;
  } else if (f.kind === "select") {
    control = (
      <div role="group" aria-label={f.label} className="flex flex-wrap gap-2">
        {f.options?.map((o) => (
          <button
            key={o}
            type="button"
            disabled={busy}
            aria-pressed={value === o}
            onClick={() => {
              setValue(o);
              advance(o);
            }}
            className="btn-ghost !px-5 !py-2.5 !text-[15px] aria-pressed:!border-brand aria-pressed:!bg-brand-soft aria-pressed:!text-brand"
          >
            {o}
          </button>
        ))}
      </div>
    );
  } else {
    const type = f.kind === "tel" ? "tel" : f.kind === "email" ? "email" : "text";
    control = (
      <>
        <input
          id={id}
          type={type}
          autoFocus
          inputMode={f.kind === "tel" ? "tel" : f.kind === "email" ? "email" : undefined}
          autoComplete="off"
          autoCapitalize={f.kind === "postcode" ? "characters" : undefined}
          list={f.suggestions ? `${id}-list` : undefined}
          placeholder={f.placeholder ?? (f.kind === "email" ? "name@example.com" : f.kind === "postcode" || f.kind === "tel" ? "" : "Type your answer here")}
          maxLength={f.kind === "postcode" ? (f.uk ? 8 : 12) : undefined}
          className="big-input"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {f.suggestions && (
          <datalist id={`${id}-list`}>
            {f.suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
      </>
    );
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        advance();
      }}
    >
      <div key={f.key} className="fade-up">
        {total > 1 && (
          <p className="eyebrow mb-3">
            {i + 1} of {total}
          </p>
        )}
        {f.kind === "date" || f.kind === "select" ? (
          <p className="font-serif text-[26px] font-light leading-tight text-ink">{f.label}</p>
        ) : (
          <label htmlFor={id} className="block font-serif text-[26px] font-light leading-tight text-ink">
            {f.label}
          </label>
        )}
        {f.hint && <p className="mt-1.5 text-sm text-muted">{f.hint}</p>}
        {note && <p className="mt-1.5 text-sm text-brand">{note}</p>}
        <div className="mt-6">{control}</div>
      </div>
      <ErrorLine message={problem ?? error} />
      <OkRow
        disabled={f.required && !value.trim()}
        busy={busy && i === total - 1}
        onDemo={() => {
          setValue(demoFieldValue(f));
          setProblem(null);
          if (f.kind === "date") setDateKey((k) => k + 1);
        }}
        label={!f.required && !value.trim() ? "Skip" : "OK"}
        onBack={
          i > 0
            ? () => {
                setProblem(null);
                setNote(null);
                // Back over a postcode we filled in ourselves lands on the address, with the postcode put back in it so it can be edited there.
                if (autoPostcode && spec.fields[i - 1]?.key === "postcode") {
                  setValues((s) => ({ ...s, address: `${s.address ?? ""}, ${s.postcode ?? ""}` }));
                  setI(i - 2);
                } else setI(i - 1);
              }
            : undefined
        }
      />
    </form>
  );
}

/* ---------------------------------------------------------------- one choice, with keys A, B, C */

function StageChoice({
  spec,
  busy,
  error,
  onAnswer,
}: {
  spec: Extract<InputSpec, { kind: "choice" }>;
  busy: boolean;
  error: string | null;
  onAnswer: (answer: WidgetAnswer) => Promise<boolean>;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  // A demo fill only marks the option; the presenter still presses OK to send it.
  const [marked, setMarked] = useState<string | null>(null);

  async function pick(o: { label: string; value: string }) {
    if (busy || picked) return;
    setPicked(o.value);
    if (!(await onAnswer({ value: o.value, label: o.label }))) setPicked(null);
  }

  // Press A, B, C ... to choose, unless the person is typing somewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement | null)?.tagName ?? "")) return;
      const o = spec.options[e.key.toLowerCase().charCodeAt(0) - 97];
      if (o) {
        e.preventDefault();
        void pick(o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="space-y-5">
      {spec.disclaimer && (
        <details className="card p-4 text-sm text-ink-2">
          <summary className="cursor-pointer font-medium text-ink">Read the exact wording on the form</summary>
          <p className="mt-3 leading-6">{spec.disclaimer}</p>
        </details>
      )}
      <div role="group" aria-label="Choose one" className="space-y-2.5">
        {spec.options.map((o, i) => (
          <button key={o.value} type="button" disabled={busy || picked !== null} aria-pressed={picked === o.value || marked === o.value} onClick={() => void pick(o)} className="choice-row">
            <span className="keycap" aria-hidden>
              {String.fromCharCode(65 + i)}
            </span>
            <span className="flex-1">{o.label}</span>
            {picked === o.value && busy && <span className="text-[13px] text-muted">One moment…</span>}
          </button>
        ))}
      </div>
      <ErrorLine message={error} />
      <div className="flex flex-wrap items-center gap-4">
        {marked && (
          <button
            type="button"
            disabled={busy || picked !== null}
            onClick={() => {
              const o = spec.options.find((x) => x.value === marked);
              if (o) void pick(o);
            }}
            className="btn-primary !px-7 !py-3 !text-[15px]"
          >
            {busy ? "One moment…" : "OK"}
          </button>
        )}
        <DemoFillButton disabled={busy || picked !== null} onClick={() => setMarked(demoChoiceValue(spec.target, spec.options))} />
        <p className="hidden text-[13px] text-muted sm:block">Click one, or press its letter.</p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- tick what applies */

function StageChecklist({
  spec,
  busy,
  error,
  onAnswer,
}: {
  spec: Extract<InputSpec, { kind: "checklist" }>;
  busy: boolean;
  error: string | null;
  onAnswer: (answer: WidgetAnswer) => Promise<boolean>;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [other, setOther] = useState("");
  const [none, setNone] = useState(false);
  const id = useId();
  const ready = none || chosen.length > 0 || other.trim() !== "";
  const toggle = (o: string) => setChosen((c) => (c.includes(o) ? c.filter((x) => x !== o) : [...c, o]));
  // Keep the order of the list, whatever order the boxes were ticked in.
  const ordered = spec.options.filter((o) => chosen.includes(o));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready || busy) return;
        void onAnswer(none ? { none: true } : { chosen: ordered, other, preview: outcomeSentence(ordered, other) });
      }}
    >
      <fieldset className="space-y-2.5" disabled={none}>
        <legend className="sr-only">What you would like to happen</legend>
        {spec.options.map((o) => (
          <label key={o} className="choice-row cursor-pointer" data-on={chosen.includes(o)}>
            <input type="checkbox" className="sr-only" checked={chosen.includes(o)} onChange={() => toggle(o)} />
            <span className="check" aria-hidden />
            <span className="flex-1">{o}</span>
          </label>
        ))}
        <div className="pt-5">
          <label htmlFor={id} className="eyebrow block">
            {spec.otherLabel}
          </label>
          <input id={id} className="big-input mt-2 !text-[22px]" value={other} onChange={(e) => setOther(e.target.value)} />
        </div>
      </fieldset>
      <label className="choice-row mt-6 cursor-pointer" data-on={none}>
        <input type="checkbox" className="sr-only" checked={none} onChange={(e) => setNone(e.target.checked)} />
        <span className="check" aria-hidden />
        <span className="flex-1">{spec.noneLabel}</span>
      </label>
      <ErrorLine message={error} />
      <OkRow
        disabled={!ready}
        busy={busy}
        onDemo={() => {
          setNone(false);
          setChosen(demoOutcomes(spec.options));
        }}
      />
    </form>
  );
}
