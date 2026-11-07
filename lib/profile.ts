"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { ChatMessage } from "./agent/chat";
import type { Draft } from "./agent/draft";
import type { CaseFacts } from "./agent/facts";
import type { SpsoAnswers } from "./agent/spsoAnswers";

/** Everything we keep about the user's case. Stored in this browser only (localStorage). */
export type Profile = {
  facts: CaseFacts;
  messages: ChatMessage[]; // the intake conversation
  draft: Draft | null; // complaint text for step 1, once written
  /** Step 2 (ombudsman). Opens after the NHS replies; answers are asked there, not at onboarding (D29). Missing in older saved profiles. */
  ombudsman?: { unlocked: boolean; answers: Partial<SpsoAnswers> };
  /** Milestones the app cannot work out from other data. nhsSent / spsoSent are self-reported (we cannot see the user press Send). Missing in older profiles. */
  progress?: { nhsFilled?: boolean; nhsSent?: boolean; spsoFilled?: boolean; spsoSent?: boolean };
  createdAt: string;
  updatedAt: string;
};

const KEY = "case-profile-v2";
const EVENT = "case-profile-change";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

function read(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function write(p: Profile) {
  localStorage.setItem(KEY, JSON.stringify({ ...p, updatedAt: new Date().toISOString() }));
  window.dispatchEvent(new Event(EVENT));
}

export function createProfile(facts: CaseFacts, messages: ChatMessage[], draft: Draft | null = null) {
  const now = new Date().toISOString();
  write({ facts, messages, draft, createdAt: now, updatedAt: now });
}

export function updateFacts(patch: Partial<CaseFacts>) {
  const p = read();
  if (p) write({ ...p, facts: { ...p.facts, ...patch } });
}

export function setDraft(draft: Draft | null) {
  const p = read();
  if (p) write({ ...p, draft });
}

export function setOmbudsman(patch: { unlocked?: boolean; answers?: Partial<SpsoAnswers> }) {
  const p = read();
  if (!p) return;
  const cur = p.ombudsman ?? { unlocked: false, answers: {} };
  write({ ...p, ombudsman: { unlocked: patch.unlocked ?? cur.unlocked, answers: patch.answers ? { ...cur.answers, ...patch.answers } : cur.answers } });
}

export function setProgress(patch: NonNullable<Profile["progress"]>) {
  const p = read();
  if (p) write({ ...p, progress: { ...p.progress, ...patch } });
}

export function clearProfile() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

/** undefined while loading (server render), null when nothing saved, else the profile. */
export function useProfile(): Profile | null | undefined {
  const raw = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(KEY) ?? "",
    () => undefined,
  );
  return useMemo(() => {
    if (raw === undefined) return undefined;
    if (raw === "") return null;
    try {
      return JSON.parse(raw) as Profile;
    } catch {
      return null;
    }
  }, [raw]);
}
