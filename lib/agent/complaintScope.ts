import type { CaseFacts } from "./facts";
import type { Draft } from "./draft";

/** Conservative routing: a location outside these supported names needs manual checking. */
export function supportsLothian(facts: CaseFacts): boolean {
  const place = facts.incidentLocation ?? "";
  if (/mater dei|malta|gozo/i.test(place)) return false;
  return /\bNHS Lothian\b|\bRoyal Infirmary of Edinburgh\b|\bWestern General Hospital\b|\bRoyal Edinburgh Hospital\b|\bRoyal Hospital for Children and Young People\b|\bSt[ .']*John'?s Hospital\b/i.test(place);
}

export const SCOPE_NOTE = "This treatment location is not confirmed as part of the supported NHS Lothian route. The correct complaints service, local deadlines and applicable clinical guidance have not been verified. No NHS Lothian form will be filled.";

/** User-supplied facts only, for unsupported cases and older drafts containing unverified guidance. */
export function factualComplaint(facts: CaseFacts): Draft {
  return {
    details: [facts.incidentSummary, ...facts.events.map((e) => [e.date, e.what].filter(Boolean).join(": "))].filter(Boolean).join("\n\n"),
    location: facts.incidentLocation ?? "",
    outcome: facts.desiredOutcome ?? "",
  };
}

export function hasFractureContext(facts: CaseFacts): boolean {
  const story = [facts.incidentSummary, ...facts.events.map((e) => e.what)].join(" ");
  return /\bfractur\w*\b|\bbroken (?:bone|wrist|arm|leg|ankle|hip)\b|\bscaphoid\b/i.test(story);
}
