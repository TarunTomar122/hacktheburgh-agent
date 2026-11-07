export type StepState = "ready" | "locked" | "soon";

/** Which path a step belongs to (D35): two paths run side by side and join at the case file. */
export type Track = "answers" | "compensation" | "end";

export type Step = { n: number; title: string; blurb: string; state: StepState; track: Track };

/** The paths. Step 2's state is overridden at runtime once the NHS has replied (see PathMap). */
export const STEPS: Step[] = [
  { n: 1, title: "Complain to NHS Lothian", blurb: "We prepare and fill the form", state: "ready", track: "answers" },
  { n: 2, title: "Ombudsman", blurb: "After the NHS replies", state: "locked", track: "answers" },
  { n: 3, title: "Can I get legal aid?", blurb: "Check and find lawyers", state: "ready", track: "compensation" },
  { n: 4, title: "Contact lawyers", blurb: "Coming soon", state: "soon", track: "compensation" },
  { n: 5, title: "Your case file", blurb: "Coming soon", state: "soon", track: "end" },
];
