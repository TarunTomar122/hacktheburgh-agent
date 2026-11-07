export type StepState = "ready" | "locked" | "soon";

export type Step = { n: number; title: string; blurb: string; state: StepState };

/** The path. Step 2's state is overridden at runtime once the NHS has replied (see Timeline). */
export const STEPS: Step[] = [
  { n: 1, title: "Complain to NHS Lothian", blurb: "We prepare and fill the form", state: "ready" },
  { n: 2, title: "Ombudsman", blurb: "Opens after the NHS final reply", state: "locked" },
  { n: 3, title: "Legal aid check", blurb: "Coming soon", state: "soon" },
  { n: 4, title: "Find a solicitor", blurb: "Coming soon", state: "soon" },
  { n: 5, title: "Your case file", blurb: "Coming soon", state: "soon" },
];
