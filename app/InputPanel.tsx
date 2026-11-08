"use client";

import { useId, useState } from "react";
import {
  emailProblem,
  phoneProblem,
  postcodeProblem,
  splitPostcode,
  outcomeSentence,
  type FormField,
  type InputSpec,
} from "../lib/agent/inputs";
import DateField from "./DateField";
import type { WidgetAnswer } from "../lib/agent/interview";

/**
 * Shows the right kind of input for the question that is open: a text box only where the answer is
 * really free text, and otherwise a date picker, dropdown, buttons, number-style fields or a checklist.
 * Free text goes to `onFree`; everything else goes to `onAnswer` and needs no model call.
 */
export default function InputPanel({
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
      return <FreeText spec={spec} busy={busy} onFree={onFree} />;
    case "form":
      return <FormPanel spec={spec} busy={busy} error={error} onAnswer={onAnswer} />;
    case "choice":
      return <Choice spec={spec} busy={busy} onAnswer={onAnswer} />;
    case "checklist":
      return <Checklist spec={spec} busy={busy} onAnswer={onAnswer} />;
    case "none":
      return null;
  }
}

const bar = "border-t border-hairline p-4";

function FreeText({
  spec,
  busy,
  onFree,
}: {
  spec: Extract<InputSpec, { kind: "text" | "textarea" }>;
  busy: boolean;
  onFree: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const id = useId();
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
      className={bar + " flex gap-2"}
    >
      <label htmlFor={id} className="sr-only">
        {spec.label}
      </label>
      {spec.kind === "text" ? (
        <input
          id={id}
          autoFocus
          autoComplete={spec.autoComplete}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={spec.placeholder}
          className="field flex-1"
        />
      ) : (
        <textarea
          id={id}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={4}
          placeholder={spec.placeholder}
          className="field flex-1 resize-none"
        />
      )}
      <button type="submit" disabled={!text.trim() || busy} className="btn-primary self-end">
        Send
      </button>
    </form>
  );
}

function FormPanel({
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
  const [problem, setProblem] = useState<string | null>(null);
  const baseId = useId();
  const set = (k: string, v: string) => setValues((s) => ({ ...s, [k]: v }));

  function submit() {
    // A postcode typed inside the address fills the postcode field.
    const all = { ...values };
    if (spec.fields.some((f) => f.key === "postcode" && f.uk !== false) && !(all.postcode ?? "").trim()) {
      const found = splitPostcode(all.address ?? "");
      if (found) {
        all.address = found.address;
        all.postcode = found.postcode;
        setValues(all);
      }
    }
    for (const f of spec.fields) {
      const v = (all[f.key] ?? "").trim();
      if (f.required && !v) return setProblem(`Please fill in: ${f.label.replace(/\?$/, "")}.`);
      const bad = !v ? null : f.kind === "postcode" ? postcodeProblem(v, f.uk ?? null) : f.kind === "tel" ? phoneProblem(v, f.uk ?? null) : null;
      if (bad) return setProblem(bad);
      const badEmail = v && f.kind === "email" ? emailProblem(v) : null;
      if (badEmail) return setProblem(badEmail);
    }
    setProblem(null);
    onAnswer(all);
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className={bar + " space-y-3"}
    >
      <div className="grid grid-cols-2 gap-3">
        {spec.fields.map((f, i) => (
          <FormInput key={f.key} id={`${baseId}-${f.key}`} f={f} value={values[f.key] ?? ""} onChange={(v) => set(f.key, v)} autoFocus={i === 0} />
        ))}
      </div>
      {(problem || error) && (
        <p role="alert" className="text-sm text-danger">
          {problem ?? error}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn-primary">
        {spec.submit}
      </button>
    </form>
  );
}

function FormInput({
  id,
  f,
  value,
  onChange,
  autoFocus,
}: {
  id: string;
  f: FormField;
  value: string;
  onChange: (v: string) => void;
  autoFocus: boolean;
}) {
  const wide = f.kind === "date" || f.key === "address" || f.key === "eventWhat" || f.key === "incidentLocation" || f.key === "email";
  let control: React.ReactNode;
  switch (f.kind) {
    case "date":
      control = <DateField label={f.label} value={value} onChange={onChange} autoFocus={autoFocus} />;
      break;
    case "select":
      control = (
        <select id={id} className="field" autoComplete={f.autoComplete} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select</option>
          {f.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
      break;
    default: {
      const type = f.kind === "tel" ? "tel" : f.kind === "email" ? "email" : "text";
      control = (
        <>
          <input
            id={id}
            type={type}
            inputMode={f.kind === "tel" ? "tel" : f.kind === "email" ? "email" : undefined}
            autoComplete={f.autoComplete}
            autoCapitalize={f.kind === "postcode" ? "characters" : undefined}
            autoFocus={autoFocus}
            list={f.suggestions ? `${id}-list` : undefined}
            placeholder={f.placeholder ?? (f.kind === "email" ? "name@example.com" : undefined)}
            maxLength={f.kind === "postcode" ? (f.uk ? 8 : 12) : undefined}
            className="field"
            value={value}
            onChange={(e) => onChange(e.target.value)}
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
  }
  return (
    <div className={"space-y-1 " + (wide ? "col-span-2" : "")}>
      {f.kind === "date" ? <div className="eyebrow">{f.label}</div> : <label htmlFor={id} className="eyebrow block">{f.label}</label>}
      {control}
      {f.hint && <p className="text-xs text-muted">{f.hint}</p>}
    </div>
  );
}

function Choice({
  spec,
  busy,
  onAnswer,
}: {
  spec: Extract<InputSpec, { kind: "choice" }>;
  busy: boolean;
  onAnswer: (answer: WidgetAnswer) => Promise<boolean>;
}) {
  return (
    <div className={bar + " space-y-3"}>
      {spec.disclaimer && (
        <details className="card p-3 text-xs text-muted">
          <summary className="cursor-pointer">Read the exact wording on the form</summary>
          <p className="mt-2">{spec.disclaimer}</p>
        </details>
      )}
      <div role="group" aria-label="Choose one" className="flex flex-wrap gap-2">
        {spec.options.map((o) => (
          <button key={o.value} type="button" disabled={busy} onClick={() => onAnswer({ value: o.value, label: o.label })} className="btn-ghost !px-4 !py-2">
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Checklist({
  spec,
  busy,
  onAnswer,
}: {
  spec: Extract<InputSpec, { kind: "checklist" }>;
  busy: boolean;
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
        onAnswer(none ? { none: true } : { chosen: ordered, other, preview: outcomeSentence(ordered, other) });
      }}
      className={bar + " space-y-3"}
    >
      <fieldset className="space-y-2" disabled={none}>
        <legend className="sr-only">What you would like to happen</legend>
        {spec.options.map((o) => (
          <label key={o} className="flex items-start gap-3 text-sm text-body">
            <input type="checkbox" className="mt-0.5 accent-brand" checked={chosen.includes(o)} onChange={() => toggle(o)} />
            <span>{o}</span>
          </label>
        ))}
        <label htmlFor={id} className="eyebrow mt-3 block">
          {spec.otherLabel}
        </label>
        <input id={id} className="field" value={other} onChange={(e) => setOther(e.target.value)} />
      </fieldset>
      <label className="flex items-start gap-3 text-sm text-body">
        <input type="checkbox" className="mt-0.5 accent-brand" checked={none} onChange={(e) => setNone(e.target.checked)} />
        <span>{spec.noneLabel}</span>
      </label>
      <button type="submit" disabled={!ready || busy} className="btn-primary">
        Continue
      </button>
    </form>
  );
}
