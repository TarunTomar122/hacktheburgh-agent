export type StepState = "ready" | "locked" | "soon";

/** Which path a step belongs to. D42 shows one track at a time ("answers" = complaint track); see lib/agent/track.ts. */
export type Track = "answers" | "compensation" | "end";

export type Step = { n: number; title: string; blurb: string; state: StepState; track: Track; help: string };

/** The paths. Step 2's state is overridden at runtime once the NHS has replied (see TrackBar). */
export const STEPS: Step[] = [
  { n: 1, title: "Complain to NHS Lothian", blurb: "We prepare and fill the form", state: "ready", track: "answers", help: "We write your complaint from what you told us and fill in NHS Lothian's online form. You check it there and press Submit." },
  { n: 2, title: "Ombudsman", blurb: "After the NHS replies", state: "locked", track: "answers", help: "If NHS Lothian's final reply does not put things right, we fill in the ombudsman's form. You check it and press Send." },
  { n: 3, title: "Prepare your case", blurb: "Legal aid, solicitors, evidence", state: "ready", track: "compensation", help: "Elliot's crew checks legal aid, finds and checks solicitors who act for patients, gathers the medical evidence and fills the firms' enquiry forms, one step at a time. Nothing is sent without your OK." },
  { n: 4, title: "Contact lawyers", blurb: "Send your enquiry", state: "ready", track: "compensation", help: "We send a short enquiry to the solicitors you picked, on their own websites. You check each one before it goes." },
  { n: 5, title: "Your case file", blurb: "Coming soon", state: "soon", track: "end", help: "Everything about your case in one place." },
];

/**
 * The steps for this patient's place (night plan, "Elliot anywhere"): once the crew has worked out the route, the
 * titles and help name the bodies it found, not NHS Lothian. Without a route, the original steps.
 */
export function stepsFor(route?: { steps: { kind: string; body: string; what: string }[] }): Step[] {
  if (!route) return STEPS;
  const by = (k: string) => route.steps.find((s) => s.kind === k);
  const complaint = by("complaint");
  const escalation = by("escalation");
  return STEPS.map((s) => {
    if (s.n === 1 && complaint) return { ...s, title: "Make your complaint", blurb: complaint.body, help: `We write your complaint and fill in ${complaint.body}'s own form, found live. You check it and submit it yourself. ${complaint.what}` };
    if (s.n === 2 && escalation) return { ...s, title: "Independent review", blurb: escalation.body, help: `If the reply does not put things right: ${escalation.what}` };
    return s;
  });
}
