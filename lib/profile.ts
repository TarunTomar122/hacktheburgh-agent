"use client";

import { useMemo, useSyncExternalStore } from "react";

export type Answer = { id: string; label: string; question: string; answer: string };

export type Profile = {
  name: string;
  story: string;
  followUps: Answer[];
  createdAt: string;
};

const KEY = "case-profile-v1";
const EVENT = "case-profile-change";

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

export function saveProfile(profile: Profile) {
  localStorage.setItem(KEY, JSON.stringify(profile));
  window.dispatchEvent(new Event(EVENT));
}

export function clearProfile() {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVENT));
}

/** undefined while loading (server render), null when no profile saved, else the profile. */
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

/** First draft of the complaint text, built from onboarding answers. The user edits it. */
export function buildComplaintDraft(p: Profile): string {
  const details = p.followUps.map((a) => `- ${a.label}: ${a.answer}`).join("\n");
  return [
    "Dear Patient Experience Team,",
    "",
    `My name is ${p.name} and I am writing to make a complaint about the care I received.`,
    "",
    p.story.trim(),
    "",
    "Further details:",
    details,
    "",
    "I would like this complaint to be looked into and for you to reply to me in writing.",
    "",
    `Yours sincerely,\n${p.name}`,
  ].join("\n");
}
