"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { ChatMessage } from "./agent/chat";
import type { Draft } from "./agent/draft";
import type { CaseFacts } from "./agent/facts";

/** Everything we keep about the user's case. Stored in this browser only (localStorage). */
export type Profile = {
  facts: CaseFacts;
  messages: ChatMessage[]; // the intake conversation
  draft: Draft | null; // complaint text for step 1, once written
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

export function createProfile(facts: CaseFacts, messages: ChatMessage[]) {
  const now = new Date().toISOString();
  write({ facts, messages, draft: null, createdAt: now, updatedAt: now });
}

export function updateFacts(patch: Partial<CaseFacts>) {
  const p = read();
  if (p) write({ ...p, facts: { ...p.facts, ...patch } });
}

export function setDraft(draft: Draft | null) {
  const p = read();
  if (p) write({ ...p, draft });
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
