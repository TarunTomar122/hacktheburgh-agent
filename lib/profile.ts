"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { ChatMessage } from "./agent/chat";
import type { Draft } from "./agent/draft";
import { emptyFacts, type CaseFacts } from "./agent/facts";
import type { SpsoAnswers } from "./agent/spsoAnswers";
import { EMPTY_FUNDING, type Funding, type Step3Result } from "./agent/legalAidTypes";
import type { EnquiryMessage, EnquiryOutcome, EnquiryRecord } from "./agent/enquiryTypes";
import type { TrackId, TrackRecommendation } from "./agent/track";
import type { EvidenceResult, PlanStep, Say } from "./agent/plannerTypes";

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

/** Everything we keep about the user's case. Stored in this browser only (localStorage). */
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
  /** Step 4: the message (editable), the last run's outcome per firm (`sample` = fixture), and the tracker (updated by hand for now). */
  enquiry?: { message?: EnquiryMessage; outcomes?: EnquiryOutcome[]; runId?: string; sample?: boolean };
  enquiries?: EnquiryRecord[];
  /** D42: the recommendation shown after onboarding, and the track the user chose (null until they choose). */
  track?: { chosen: TrackId | null; rec?: TrackRecommendation };
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

/**
 * Profiles saved by an older version can lack fields added since (e.g. medicalRecords). The API routes check the
 * full schema and answer "Bad request", so every field missing from a saved profile is filled with its empty value here.
 */
function upgrade(p: Profile): Profile {
  return { ...p, facts: { ...emptyFacts(), ...p.facts } };
}

function read(): Profile | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? upgrade(JSON.parse(raw) as Profile) : null;
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

export function setTrack(patch: { chosen?: TrackId | null; rec?: TrackRecommendation }) {
  const p = read();
  if (!p) return;
  const cur = p.track ?? { chosen: null };
  write({ ...p, track: { chosen: patch.chosen === undefined ? cur.chosen : patch.chosen, rec: patch.rec ?? cur.rec } });
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
      return upgrade(JSON.parse(raw) as Profile);
    } catch {
      return null;
    }
  }, [raw]);
}
