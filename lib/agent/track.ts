import type { CaseFacts } from "./facts";
import { COMPENSATION_CHOICE, FAULTY_PRODUCT_CHOICE, OUTCOME_CHOICES, SIDE_EFFECT_CHOICE } from "./inputs";
import type { Tri } from "./legalAidTypes";

/**
 * Which way to go after onboarding (D42). Three tracks (the Yellow Card one is proposed, feature/yellow-card), one recommended, each with a fit % and the reasons for it.
 * Client-safe: the story signals come from the server (lib/agent/trackSignals.ts, /api/agent/track).
 *
 * Fit = how well the track matches what the user told us. It is NOT a chance of success: we have no outcome data,
 * and the weights below are our judgement.
 */

export type TrackId = "complaint" | "compensation" | "yellowcard";

/** In the order they are shown and tie-broken. */
export const TRACK_IDS: TrackId[] = ["complaint", "compensation", "yellowcard"];

export const TRACKS: Record<TrackId, { title: string; short: string; what: string; gets: string; steps: number[] }> = {
  complaint: {
    title: "Make a complaint",
    short: "Complaint",
    what: "We write your complaint and fill in NHS Lothian's form. If their final reply doesn't put things right, we take it to the ombudsman.",
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
  yellowcard: {
    title: "Report a medicine problem",
    short: "Yellow Card",
    what: "We fill in a Yellow Card report for you: the UK scheme where anyone can report a side effect, or a faulty or fake medicine or medical device, to the medicines regulator (MHRA). You check it on their form and send it yourself.",
    gets: "The regulator learns about the problem, so it can spot safety issues and protect others. Not money, and not a reply about your own care.",
    steps: [6],
  },
};

/** What the AI read in the story: probabilities 0-1, or null if it could not be asked. `medicine` is missing in recommendations saved before the Yellow Card track. */
export type TrackSignals = { lasting: number | null; costs: number | null; medicine?: number | null };

export type TrackReason = { label: string; points: number; max: number; status: Tri; evidence: string };
export type TrackFit = { fit: number; reasons: TrackReason[] };
export type TrackRecommendation = { recommended: TrackId; tracks: Record<TrackId, TrackFit>; at: string };

const [EXPLANATION, APOLOGY, CHANGES, SUPPORT] = OUTCOME_CHOICES;

/** Which outcome boxes they ticked, read back from the saved sentence (the checklist stores a sentence). */
export function goalsFrom(desiredOutcome: string | null) {
  const t = (desiredOutcome ?? "").toLowerCase();
  const has = (choice: string) => t.includes(choice.toLowerCase().slice(0, 18));
  return {
    explanation: has(EXPLANATION),
    apology: has(APOLOGY),
    changes: has(CHANGES),
    support: has(SUPPORT),
    money: has(COMPENSATION_CHOICE) || /\bcompensation\b|\bmoney\b/.test(t),
    sideEffect: has(SIDE_EFFECT_CHOICE),
    faultyProduct: has(FAULTY_PRODUCT_CHOICE),
  };
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
  // Either Yellow Card box counts once: a report covers side effects and faulty or fake products alike.
  const report = g.sideEffect || g.faultyProduct;
  const yellowcard = total([
    {
      label: "You want to report a medicine or device problem",
      points: report ? 60 : 0,
      max: 60,
      status: report ? "yes" : "no",
      evidence: report
        ? `You ticked "${g.sideEffect ? SIDE_EFFECT_CHOICE : FAULTY_PRODUCT_CHOICE}".`
        : `You did not tick "${SIDE_EFFECT_CHOICE}" or "${FAULTY_PRODUCT_CHOICE}".`,
    },
    fromStory(s.medicine ?? null, "Your story is about a medicine, vaccine or device", 40),
  ]);
  const tracks = { complaint, compensation, yellowcard };
  // Highest fit wins; a tie keeps the earlier track in TRACK_IDS.
  const recommended = TRACK_IDS.reduce((best, id) => (tracks[id].fit > tracks[best].fit ? id : best), TRACK_IDS[0]);
  return { recommended, tracks, at: new Date().toISOString() };
}

/** Recommendations saved before the Yellow Card track have no score for it; treat them as missing so a new one is fetched. */
export function isCurrentRecommendation(rec: TrackRecommendation | undefined): rec is TrackRecommendation {
  return !!rec && TRACK_IDS.every((id) => rec.tracks[id] !== undefined);
}
