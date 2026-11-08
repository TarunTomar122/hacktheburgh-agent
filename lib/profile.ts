"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { ComplaintEmail } from "./agent/complaintEmail";
import type { ChatMessage } from "./agent/chat";
import type { Draft } from "./agent/draft";
import { emptyFacts, type CaseFacts } from "./agent/facts";
import type { SpsoAnswers } from "./agent/spsoAnswers";
import { EMPTY_FUNDING, type Funding, type Step3Result } from "./agent/legalAidTypes";
import type { EnquiryMessage, EnquiryOutcome, EnquiryRecord } from "./agent/enquiryTypes";
import type { TrackId, TrackRecommendation } from "./agent/track";
import type { ComplaintResult, EvidenceResult, PlanStep, Say } from "./agent/plannerTypes";

export type CaseRunRecord = {
  runId: string;
  says: Say[];
  plan: PlanStep[];
  evidence: EvidenceResult;
  asks: number;
  recoveries: number;
  turns: number;
  durationMs: number;
  finishedAt: string;
};

/** D65: the complaint crew's last run (the case file for step 1). `sample` = a recorded run played back, not a real one. */
export type ComplaintRunRecord = { result: ComplaintResult; sample: boolean; durationMs: number; finishedAt: string };

/** Everything we keep about the user's case. Kept in this browser (localStorage) and, for a signed-in user, saved to their account (D75). */
export type Profile = {
  facts: CaseFacts;
  messages: ChatMessage[]; // the intake conversation
  draft: Draft | null; // complaint text for step 1, once written
  /** Step 2 (ombudsman). Opens after the NHS replies; answers are asked there, not at onboarding (D29). Missing in older saved profiles. */
  ombudsman?: { unlocked: boolean; answers: Partial<SpsoAnswers> };
  /** Milestones the app cannot work out from other data. nhsSent / spsoSent are self-reported (we cannot see the user press Send). Missing in older profiles. */
  progress?: { nhsFilled?: boolean; nhsSent?: boolean; spsoFilled?: boolean; spsoSent?: boolean; skipped?: number[] };
  /** Step 3 (D36): the calculator's money answers (asked on the step only, D33) and the result. `sample` = the result came from the fixture, not a real run. */
  /** `selected`: firm ids ticked in step 3 for step 4 to contact. */
  legalAid?: { funding: Funding; result?: Step3Result; sample?: boolean; selected?: string[] };
  /** D52: the crew's last run, for the case file and "Review the run" (conversation, plan, evidence, counts). */
  caseRun?: CaseRunRecord;
  complaintRun?: ComplaintRunRecord;
  /** Step 4: the message (editable), the last run's outcome per firm (`sample` = fixture), and the tracker (updated by hand for now). */
  enquiry?: { message?: EnquiryMessage; outcomes?: EnquiryOutcome[]; runId?: string; sample?: boolean };
  enquiries?: EnquiryRecord[];
  /** D42: the recommendation shown after onboarding, and the track the user chose (null until they choose). */
  track?: { chosen: TrackId | null; rec?: TrackRecommendation; complaintMode?: "email" | "formal" };
  complaintEmail?: ComplaintEmail;
  createdAt: string;
  updatedAt: string;
};

const LEGACY_KEY = "case-profile-v2";
const DEMO_KEY = "case-profile-v2:demo";
const DEMO_FLAG = "case-demo";
const EVENT = "case-profile-change";
const STATUS_EVENT = "case-sync-status";

/** Whose case this browser shows (D74). Null with no accounts, which keeps the one shared key below. */
let owner: string | null = null;
const userKey = () => (owner ? `${LEGACY_KEY}:${owner}` : LEGACY_KEY);

/**
 * Demo mode (D75). The "Demo: complaint" and "Demo: compensation" personas run on a throwaway copy that lives in this tab only
 * (sessionStorage): it never replaces the user's real saved case and is never sent to the server. It ends when the tab closes or
 * the user chooses Exit demo.
 */
function inDemo(): boolean {
  try {
    return typeof window !== "undefined" && sessionStorage.getItem(DEMO_FLAG) === "1";
  } catch {
    return false;
  }
}
const store = (): Storage => (inDemo() ? sessionStorage : localStorage);
const key = () => (inDemo() ? DEMO_KEY : userKey());

/**
 * Saving to the user's account (D75). The browser copy stays the one the screens read, so they are instant and still work when the
 * network or database does not. When accounts and a database are on, every change is also sent to the server, and the newest
 * copy (by `updatedAt`) wins when the user opens the app on another device. "loading" holds the screens back for the first pull so a
 * new device does not flash the empty start page before the saved case arrives.
 */
type Phase = "off" | "loading" | "ready";
let phase: Phase = "off";
let phaseFor: string | null = null;
let online: "unknown" | "yes" | "no" = "unknown"; // "no": the server said saving is switched off (no accounts or no DATABASE_URL)
export type SyncStatus = "off" | "saved" | "saving" | "error";
let status: SyncStatus = "off";
const setStatus = (s: SyncStatus) => {
  if (s === status) return;
  status = s;
  if (typeof window !== "undefined") window.dispatchEvent(new Event(STATUS_EVENT));
};
const emit = () => window.dispatchEvent(new Event(EVENT));

/**
 * Called by the account provider before anything reads the profile. With a signed-in user the case is saved under that user's
 * own key. A case saved before accounts existed moves to the first user who signs in (it is moved, not copied, so a second
 * person on the same browser starts clean). Runs during render, so it only does something that is safe to repeat.
 */
export function setProfileOwner(sub: string | null) {
  owner = sub;
  if (sub !== phaseFor) {
    phaseFor = sub;
    phase = sub ? "loading" : "off";
    online = "unknown";
  }
  if (!sub || typeof window === "undefined") return;
  try {
    const old = localStorage.getItem(LEGACY_KEY);
    if (old !== null && localStorage.getItem(userKey()) === null) {
      localStorage.setItem(userKey(), old);
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch {
    // storage blocked: the profile simply starts empty
  }
}

function subscribe(cb: () => void) {
  window.addEventListener("storage", cb);
  window.addEventListener(EVENT, cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener(EVENT, cb);
  };
}

/**
 * Profiles saved by an older version can lack fields added since (e.g. medicalRecords). The API routes check the
 * full schema and answer "Bad request", so every field missing from a saved profile is filled with its empty value here.
 */
function upgrade(p: Profile): Profile {
  return { ...p, facts: { ...emptyFacts(), ...p.facts } };
}

function read(): Profile | null {
  try {
    const raw = store().getItem(key());
    return raw ? upgrade(JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

function write(p: Profile) {
  store().setItem(key(), JSON.stringify({ ...p, updatedAt: new Date().toISOString() }));
  window.dispatchEvent(new Event(EVENT));
  schedulePush();
}

// ---- account sync (D75) ----

type Saved = { profile: Profile | null; updatedAt: string };
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let pulling = false;
let started: string | null = null;

/** Sync applies to a signed-in user's own case, never to a demo, and never once the server has said it is off. */
const syncing = () => Boolean(owner) && !inDemo() && phase !== "off" && online !== "no";

/** The signed-in user's own saved copy in this browser (never the demo copy). */
function readOwn(): Profile | null {
  try {
    const raw = localStorage.getItem(userKey());
    return raw ? (JSON.parse(raw) as Profile) : null;
  } catch {
    return null;
  }
}

async function call(method: "GET" | "PUT" | "DELETE", body?: unknown): Promise<{ status: number; data: Record<string, unknown> } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const text = body === undefined ? undefined : JSON.stringify(body);
    const res = await fetch("/api/profile", {
      method,
      headers: text === undefined ? undefined : { "content-type": "application/json" },
      body: text,
      signal: ctrl.signal,
      // keepalive lets the last save survive a closing tab, but the browser refuses it above 64 KiB (the fetch throws, so a big case would never save).
      keepalive: method !== "GET" && text !== undefined && new Blob([text]).size < 60_000,
    });
    return { status: res.status, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
  } catch {
    return null; // offline, timed out
  } finally {
    clearTimeout(timer);
  }
}

/** Replace this browser's copy with the server's (a deletion on the server removes it here), keeping the server's own timestamp. */
function adopt(s: Saved) {
  try {
    if (s.profile) localStorage.setItem(userKey(), JSON.stringify({ ...s.profile, updatedAt: s.updatedAt }));
    else localStorage.removeItem(userKey());
  } catch {
    // storage blocked or full: the screens keep what they had
  }
  emit();
}

function schedulePush() {
  if (!syncing()) return;
  setStatus("saving");
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void flush(), 700);
}

/** Sends this browser's copy now. A copy the server already has a newer version of is replaced by that version. */
async function flush() {
  clearTimeout(pushTimer);
  pushTimer = undefined;
  if (!syncing()) return;
  const mine = owner;
  const p = readOwn();
  if (!p) return;
  const r = await call("PUT", { profile: p, updatedAt: p.updatedAt });
  if (owner !== mine) return;
  if (r?.data.enabled === false) {
    online = "no";
    setStatus("off");
  } else if (r?.status === 200) {
    online = "yes";
    setStatus("saved");
  } else if (r?.status === 409 && r.data.saved) {
    adopt(r.data.saved as Saved);
    setStatus("saved");
  } else {
    setStatus("error");
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => void flush(), 8000); // try again
  }
}

/** Compare this browser's copy with the server's and move the newer one to the other side. */
async function pull() {
  if (pulling || !owner || inDemo()) return;
  pulling = true;
  const mine = owner;
  try {
    const r = await call("GET");
    if (owner !== mine) return;
    if (!r || r.status !== 200) {
      if (r?.status !== 401) setStatus("error"); // keep working from this browser; try again when the tab is next opened
      return;
    }
    if (r.data.enabled === false) {
      online = "no";
      setStatus("off");
      return;
    }
    online = "yes";
    const saved = (r.data.saved ?? null) as Saved | null;
    const own = readOwn();
    if (!saved) {
      if (own) await flush();
      else setStatus("saved");
      return;
    }
    const theirs = Date.parse(saved.updatedAt);
    const ours = own ? Date.parse(own.updatedAt) : -Infinity;
    if (theirs > ours) {
      adopt(saved);
      setStatus("saved");
    } else if (ours > theirs) await flush();
    else setStatus("saved");
  } finally {
    pulling = false;
  }
}

/**
 * Started once by the account provider after the first render. Pulls the saved case, then lets the screens read. Afterwards it
 * pulls again whenever the tab is shown (so a change made on another device appears) and pushes when the tab is hidden.
 */
export async function startSync(sub: string) {
  if (typeof window === "undefined" || started === sub) return;
  started = sub;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush();
    else if (!pushTimer) void pull();
  });
  try {
    await pull();
  } finally {
    if (phaseFor === sub) {
      phase = "ready";
      emit();
    }
  }
}

/** The state of saving to the account, for a small label. "off" when accounts or the database are not set up. */
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener(STATUS_EVENT, cb);
      return () => window.removeEventListener(STATUS_EVENT, cb);
    },
    () => status,
    () => "off" as SyncStatus,
  );
}

// ---- demo mode (D75) ----

/** Loads a fictional persona for the demo. Nothing is saved to the account, and the real saved case is left alone. */
export function startDemo(facts: CaseFacts, messages: ChatMessage[], draft: Draft | null = null) {
  const now = new Date().toISOString();
  sessionStorage.setItem(DEMO_FLAG, "1");
  sessionStorage.setItem(DEMO_KEY, JSON.stringify({ facts, messages, draft, createdAt: now, updatedAt: now } satisfies Profile));
  emit();
}

export function exitDemo() {
  try {
    sessionStorage.removeItem(DEMO_KEY);
    sessionStorage.removeItem(DEMO_FLAG);
  } catch {
    // nothing to clear
  }
  emit();
}

export function useDemo(): boolean {
  return useSyncExternalStore(subscribe, inDemo, () => false);
}

export function createProfile(facts: CaseFacts, messages: ChatMessage[], draft: Draft | null = null) {
  exitDemo(); // a real case is never written into a demo copy
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

/** Demo (D60): the user skipped this step, so every milestone of it counts as done. */
export function skipStep(step: number) {
  const p = read();
  const cur = p?.progress?.skipped ?? [];
  if (p && !cur.includes(step)) write({ ...p, progress: { ...p.progress, skipped: [...cur, step] } });
}

export function setProgress(patch: NonNullable<Profile["progress"]>) {
  const p = read();
  if (p) write({ ...p, progress: { ...p.progress, ...patch } });
}

/** Add to the saved conversation (used when a step asks the user for something that was missing). */
export function addMessages(more: ChatMessage[]) {
  const p = read();
  if (p) write({ ...p, messages: [...p.messages, ...more] });
}

export function setLegalAid(patch: { funding?: Partial<Funding>; result?: Step3Result | null; sample?: boolean; selected?: string[] }) {
  const p = read();
  if (!p) return;
  const cur = p.legalAid ?? { funding: EMPTY_FUNDING };
  const funding = { ...cur.funding, ...patch.funding };
  const result = patch.result === null ? undefined : (patch.result ?? cur.result);
  const sample = patch.result === null ? undefined : (patch.sample ?? cur.sample);
  // A new run (result: null) clears the old selection: its firm ids may not exist any more.
  const selected = patch.result === null ? undefined : (patch.selected ?? cur.selected);
  write({ ...p, legalAid: { funding, result, sample, selected } });
}

export function setCaseRun(run: CaseRunRecord | null) {
  const p = read();
  if (p) write({ ...p, caseRun: run ?? undefined });
}

export function setComplaintRun(run: ComplaintRunRecord | null) {
  const p = read();
  if (p) write({ ...p, complaintRun: run ?? undefined });
}

export function setComplaintEmail(draft: ComplaintEmail) {
  const p = read();
  if (p) write({ ...p, complaintEmail: draft });
}

export function setTrack(patch: { chosen?: TrackId | null; rec?: TrackRecommendation; complaintMode?: "email" | "formal" }) {
  const p = read();
  if (!p) return;
  const cur = p.track ?? { chosen: null };
  write({ ...p, track: { chosen: patch.chosen === undefined ? cur.chosen : patch.chosen, rec: patch.rec ?? cur.rec, complaintMode: patch.complaintMode ?? (patch.chosen !== undefined ? "formal" : cur.complaintMode) } });
}

export function setEnquiry(patch: { message?: EnquiryMessage; outcomes?: EnquiryOutcome[]; runId?: string; sample?: boolean }) {
  const p = read();
  if (p) write({ ...p, enquiry: { ...p.enquiry, ...patch } });
}

/** Update one firm's outcome in place (after an approval or a send). */
export function setOutcome(o: EnquiryOutcome) {
  const p = read();
  if (!p) return;
  const outcomes = (p.enquiry?.outcomes ?? []).map((x) => (x.firmId === o.firmId ? o : x));
  write({ ...p, enquiry: { ...p.enquiry, outcomes } });
}

/** Add or update tracker rows by firm id. */
export function upsertEnquiries(records: (Partial<EnquiryRecord> & Pick<EnquiryRecord, "firmId">)[]) {
  const p = read();
  if (!p) return;
  const cur = [...(p.enquiries ?? [])];
  for (const r of records) {
    const i = cur.findIndex((x) => x.firmId === r.firmId);
    if (i >= 0) {
      const previous = cur[i];
      // Form preparation cannot undo delivery or a reply, including its dates.
      if (["sent", "replied", "not_interested"].includes(previous.status) && r.status && ["draft", "ready_to_send", "email_draft"].includes(r.status)) continue;
      cur[i] = { ...previous, ...r };
    } else cur.push({ firmName: r.firmName ?? r.firmId, status: "draft", ...r } as EnquiryRecord);
  }
  write({ ...p, enquiries: cur });
}

export function clearProfile() {
  if (inDemo()) {
    exitDemo(); // the demo copy goes; the real case is untouched
    return;
  }
  localStorage.removeItem(key());
  window.dispatchEvent(new Event(EVENT));
  if (!syncing()) return;
  // Record the deletion on the server (a copy with no case), so the user's other devices clear theirs too.
  setStatus("saving");
  clearTimeout(pushTimer);
  void call("DELETE", { updatedAt: new Date().toISOString() }).then((r) => setStatus(r?.status === 200 ? "saved" : "error"));
}

/** undefined while loading (server render), null when nothing saved, else the profile. */
export function useProfile(): Profile | null | undefined {
  const raw = useSyncExternalStore(
    subscribe,
    // Still loading while a signed-in user's saved case is being fetched (see "account sync" above).
    () => (!inDemo() && phase === "loading" ? undefined : (store().getItem(key()) ?? "")),
    () => undefined,
  );
  return useMemo(() => {
    if (raw === undefined) return undefined;
    if (raw === "") return null;
    try {
      return upgrade(JSON.parse(raw) as Profile);
    } catch {
      return null;
    }
  }, [raw]);
}
