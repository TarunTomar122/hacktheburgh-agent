import type { CaseFacts } from "./facts";

/** Offer the shorter route only when no additional goal is present. */
export function emailOnlyGoals(outcome: string | null): boolean {
  const text = (outcome ?? "").trim().toLowerCase();
  if (!/an apology|an explanation of what went wrong/.test(text)) return false;
  return !text.replace(/an explanation of what went wrong|an apology/g, "").replace(/\band\b|[.,\s]/g, "");
}

export type ComplaintEmail = { subject: string; body: string; source: string; requests?: ReturnType<typeof complaintEmailGoals> };
export const emailSource = (facts: CaseFacts) => JSON.stringify(facts);

export function complaintEmailGoals(facts: CaseFacts) {
  const wants = (facts.desiredOutcome ?? "").toLowerCase();
  return { explanation: wants.includes("explanation"), apology: wants.includes("apology") };
}

export function buildComplaintEmail(facts: CaseFacts, requests = complaintEmailGoals(facts)): ComplaintEmail {
  const goals = [requests.explanation ? "an explanation" : "", requests.apology ? "an apology" : ""].filter(Boolean).join(" and ") || "a response";
  const request = [
    requests.explanation && "Please explain what happened and why.",
    requests.apology && "I would appreciate an apology that acknowledges what happened and its impact on me.",
  ].filter(Boolean).join(" ") || "I would appreciate a response about the care described above.";
  const name = [facts.firstName, facts.lastName].filter(Boolean).join(" ");
  const timeline = facts.events.map((e) => `- ${e.date}: ${e.what}`).join("\n");
  return {
    subject: `Request for ${goals} about my care`,
    body: ["Dear complaints team,", `I am writing about the care I received${facts.incidentLocation ? ` at ${facts.incidentLocation}` : ""}.`, facts.incidentSummary, timeline ? `My timeline:\n${timeline}` : "", request, "Please let me know how you will look into this and when I can expect a response.", `Kind regards,${name ? `\n${name}` : ""}`].filter(Boolean).join("\n\n"),
    source: emailSource(facts),
    requests,
  };
}
