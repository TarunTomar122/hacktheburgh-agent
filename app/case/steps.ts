export type StepState = "ready" | "locked" | "soon";

/** Which path a step belongs to. D42 shows one track at a time ("answers" = complaint track); see lib/agent/track.ts. */
export type Track = "answers" | "compensation" | "end";

export type Step = { n: number; title: string; blurb: string; state: StepState; track: Track; help: string };

/** The paths. Step 2's state is overridden at runtime once the NHS has replied (see TrackBar). */
export const STEPS: Step[] = [
  { n: 1, title: "Complain to NHS Lothian", blurb: "We prepare and fill the form", state: "ready", track: "answers", help: "We write your complaint from what you told us and fill in NHS Lothian's online form. You check it there and press Submit." },
  { n: 2, title: "Ombudsman", blurb: "After the NHS replies", state: "locked", track: "answers", help: "If NHS Lothian's final reply does not put things right, we fill in the ombudsman's form. You check it and press Send." },
  { n: 3, title: "Legal aid and lawyers", blurb: "Check and find lawyers", state: "ready", track: "compensation", help: "We check the Scottish Legal Aid Board's calculator and look for solicitors who act for patients, on several sites at once." },
  { n: 4, title: "Contact lawyers", blurb: "Send your enquiry", state: "ready", track: "compensation", help: "We send a short enquiry to the solicitors you picked, on their own websites. You check each one before it goes." },
  { n: 5, title: "Your case file", blurb: "Coming soon", state: "soon", track: "end", help: "Everything about your case in one place." },
];
