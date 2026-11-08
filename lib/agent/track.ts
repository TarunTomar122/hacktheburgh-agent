import type { CaseFacts } from "./facts";
import { COMPENSATION_CHOICE, OUTCOME_CHOICES } from "./inputs";
import type { Tri } from "./legalAidTypes";

/**
 * Which way to go after onboarding. Two tracks, one recommended, each with a fit % and the reasons for it.
 * Client-safe: the story signals come from the server (lib/agent/trackSignals.ts, /api/agent/track).
 *
 * Fit = how well the track matches what the user told us. It is NOT a chance of success: we have no outcome data,
 * and the weights below are our judgement.
 */

export type TrackId = "complaint" | "compensation";

export const TRACKS: Record<TrackId, { title: string; short: string; what: string; gets: string; steps: number[] }> = {
  complaint: {
    title: "Make a complaint",
    short: "Complaint",
    what: "We write your complaint and fill in the complaint form of whoever ran your care. If their final reply doesn't put things right, we take it to the ombudsman.",
    gets: "An explanation, an apology, changes to how things are done. Not money.",
    steps: [1, 2],
  },
  compensation: {
    title: "Claim compensation",
    short: "Compensation",
    what: "We check whether legal aid could pay for a solicitor, find medical negligence solicitors who act for patients, and help you contact them.",
    gets: "Money for what happened, if a solicitor takes your case and it succeeds.",
    steps: [3, 4],
  },
};

/** What the AI read in the story: probabilities 0-1, or null if it could not be asked. */
export type TrackSignals = { lasting: number | null; costs: number | null };

export type TrackReason = { label: string; points: number; max: number; status: Tri; evidence: string };
export type TrackFit = { fit: number; reasons: TrackReason[] };
export type TrackRecommendation = { recommended: TrackId; tracks: Record<TrackId, TrackFit>; at: string };

const [EXPLANATION, APOLOGY, CHANGES, SUPPORT] = OUTCOME_CHOICES;

/** Which outcome boxes they ticked, read back from the saved sentence (the checklist stores a sentence). */
export function goalsFrom(desiredOutcome: string | null) {
  const t = (desiredOutcome ?? "").toLowerCase();
  const has = (choice: string) => t.includes(choice.toLowerCase().slice(0, 18));
  return { explanation: has(EXPLANATION), apology: has(APOLOGY), changes: has(CHANGES), support: has(SUPPORT), money: has(COMPENSATION_CHOICE) || /\bcompensation\b|\bmoney\b/.test(t) };
}

const ticked = (yes: boolean, label: string, max: number): TrackReason => ({
  label,
  points: yes ? max : 0,
  max,
  status: yes ? "yes" : "no",
  evidence: yes ? `You ticked "${label}" as something you want.` : `You did not tick "${label}".`,
});

const fromStory = (p: number | null, label: string, max: number, invert = false): TrackReason => {
  if (p === null) return { label, points: 0, max, status: "unknown", evidence: "We could not read this from your story." };
  const q = invert ? 1 - p : p;
  return {
    label,
    points: Math.round(max * q),
    max,
    status: q >= 0.6 ? "yes" : q <= 0.4 ? "no" : "unknown",
    evidence: `The AI read your story and gave this a likelihood of ${Math.round(q * 100)}%. Points are scaled by that.`,
  };
};

const total = (rs: TrackReason[]): TrackFit => {
  const points = rs.reduce((n, r) => n + r.points, 0);
  const max = rs.reduce((n, r) => n + r.max, 0);
  return { fit: Math.round((points / max) * 100), reasons: rs };
};

export function recommendTrack(f: CaseFacts, s: TrackSignals): TrackRecommendation {
  const g = goalsFrom(f.desiredOutcome);
  const complaint = total([
    ticked(g.explanation, EXPLANATION, 15),
    ticked(g.apology, APOLOGY, 15),
    ticked(g.changes, CHANGES, 15),
    ticked(g.support, SUPPORT, 15),
    { label: "You are not asking for money", points: g.money ? 0 : 20, max: 20, status: g.money ? "no" : "yes", evidence: g.money ? "You ticked compensation. A complaint can't get you money." : "You did not tick compensation, and a complaint can't get money anyway." },
    fromStory(s.lasting, "The harm looks short-lived", 20, true),
  ]);
  const compensation = total([
    ticked(g.money, COMPENSATION_CHOICE, 40),
    fromStory(s.lasting, "The harm is lasting or still going on", 30),
    fromStory(s.costs, "It has cost you money, work or study", 20),
    ticked(g.support, SUPPORT, 10),
  ]);
  return {
    recommended: compensation.fit > complaint.fit ? "compensation" : "complaint",
    tracks: { complaint, compensation },
    at: new Date().toISOString(),
  };
}
