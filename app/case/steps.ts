export type StepState = "ready" | "locked" | "soon";

/** Which path a step belongs to. D42 shows one track at a time ("answers" = complaint track); see lib/agent/track.ts. */
export type Track = "answers" | "compensation" | "yellowcard" | "end";

export type Step = { n: number; title: string; blurb: string; state: StepState; track: Track; help: string };

/** The paths. Step 2's state is overridden at runtime once the NHS has replied (see TrackBar). */
export const STEPS: Step[] = [
  { n: 1, title: "Complain to NHS Lothian", blurb: "Elliot prepares and fills the form", state: "ready", track: "answers", help: "Elliot writes your complaint from what you told him and fills in NHS Lothian's online form. You check it there and press Submit." },
  { n: 2, title: "Ombudsman", blurb: "After the NHS replies", state: "locked", track: "answers", help: "If NHS Lothian's final reply does not put things right, Elliot fills in the ombudsman's form. You check it and press Send." },
  { n: 3, title: "Prepare your case", blurb: "Legal aid, solicitors, evidence", state: "ready", track: "compensation", help: "Elliot's crew checks legal aid, finds and checks solicitors who act for patients, gathers the medical evidence and fills the firms' enquiry forms, one step at a time. Nothing is sent without your OK." },
  { n: 4, title: "Contact lawyers", blurb: "Send your enquiry", state: "ready", track: "compensation", help: "Elliot sends a short enquiry to the solicitors you picked, on their own websites. You check each one before it goes." },
  { n: 5, title: "Your case file", blurb: "Coming soon", state: "soon", track: "end", help: "Everything about your case in one place." },
  // Numbered 6 so steps 1-5 keep their numbers (saved progress and D-entries refer to them).
  { n: 6, title: "Yellow Card report", blurb: "Report a medicine or device problem", state: "ready", track: "yellowcard", help: "Elliot fills in the Yellow Card form, the UK scheme for reporting side effects and faulty or fake medicines and medical devices to the regulator (MHRA). You check it there and send it yourself." },
];
