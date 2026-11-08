"use client";

import { useState } from "react";
import { dateMode, MONTHS, type DateMode } from "../lib/agent/inputs";

const MODES: { value: DateMode; label: string }[] = [
  { value: "exact", label: "I know the date" },
  { value: "month", label: "Month and year" },
  { value: "words", label: "In my own words" },
];

/**
 * A date that may be exact ("2026-07-04"), a month ("July 2026") or the person's own wording
 * ("a few days after Christmas"). Memory is rarely exact, so all three are first-class.
 * Stored as one string, the same shape the timeline already uses.
 */
export default function DateField({
  value,
  onChange,
  label = "Date",
  autoFocus,
  big,
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  autoFocus?: boolean;
  /** Full-screen version for the onboarding stage: the three ways to say a date as buttons, and big fields. */
  big?: boolean;
}) {
  const [mode, setMode] = useState<DateMode>(value ? dateMode(value) : "exact");
  const initialMonth = value.match(/^([A-Za-z]+) (\d{4})$/);
  const [month, setMonth] = useState(initialMonth?.[1] ?? "");
  const [year, setYear] = useState(initialMonth?.[2] ?? "");
  const thisYear = new Date().getFullYear();
  const today = new Date().toISOString().slice(0, 10);

  function changeMode(next: DateMode) {
    if (next === mode) return;
    setMode(next);
    if (next !== dateMode(value)) onChange("");
    if (next === "month") {
      setMonth("");
      setYear("");
    }
  }

  function changeMonthYear(m: string, y: string) {
    setMonth(m);
    setYear(y);
    onChange(m && /^\d{4}$/.test(y) ? `${m} ${y}` : "");
  }

  const input = big ? "big-input" : "field";

  return (
    <div className={big ? "space-y-6" : "space-y-2"}>
      {big ? (
        <div role="group" aria-label={`${label}: how exact`} className="flex flex-wrap gap-2">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={mode === m.value}
              onClick={() => changeMode(m.value)}
              className="btn-ghost !px-4 !py-2 !text-[14px] aria-pressed:!border-brand aria-pressed:!bg-brand-soft aria-pressed:!text-brand"
            >
              {m.label}
            </button>
          ))}
        </div>
      ) : (
        <select aria-label={`${label}: how exact`} className="field" value={mode} onChange={(e) => changeMode(e.target.value as DateMode)}>
          {MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      )}

      {mode === "exact" && (
        <input
          type="date"
          aria-label={label}
          className={input}
          max={today}
          min="1990-01-01"
          autoFocus={autoFocus}
          value={dateMode(value) === "exact" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {mode === "month" && (
        <div className={big ? "grid grid-cols-[1fr_9rem] gap-6" : "grid grid-cols-[minmax(0,1fr)_5.5rem] gap-2"}>
          <select aria-label={`${label}: month`} className={input} value={month} onChange={(e) => changeMonthYear(e.target.value, year)}>
            <option value="">Month</option>
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <input
            type="number"
            inputMode="numeric"
            aria-label={`${label}: year`}
            className={input}
            placeholder="Year"
            min={1990}
            max={thisYear}
            value={year}
            onChange={(e) => changeMonthYear(month, e.target.value)}
          />
        </div>
      )}

      {mode === "words" && (
        <input
          type="text"
          aria-label={label}
          className={input}
          placeholder="For example, a few days after Christmas"
          autoFocus={autoFocus}
          value={dateMode(value) === "words" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}
