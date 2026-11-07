import type { AgentTile, Stats, TraceStep } from "./legalAidTypes";

/**
 * Step 4 contract (D45): contact up to 3 shortlisted firms. Client-safe.
 * Backend: lib/agent/enquiry.ts + /api/agent/step4/*. Frontend: the step 4 screen and the tracker.
 *
 * Flow: draft one message -> agents find and fill each firm's enquiry form in parallel tabs (stop before Send)
 * -> the user approves each firm -> the agent presses Send. Firms with no form found after a harder look get an
 * email draft instead. Replies are tracked by hand for now (reading the inbox comes later).
 *
 * SEND GATE: /api/agent/step4/send refuses unless ALLOW_REAL_SEND=1 on the server AND the profile is not a demo
 * persona (example.com email). A fictional patient must never reach a real law firm.
 */

export const MAX_ENQUIRIES = 3;

/** The one message sent to every selected firm. Written from the profile; the user can edit it before filling. */
export type EnquiryMessage = { subject: string; body: string };

export type EnquiryStatus =
  | "queued"
  | "finding_form" // looking harder for a form (contact page, popups, footer)
  | "filling"
  | "ready_to_send" // form filled, waiting for the user's approval
  | "needs_input" // the form asks something we do not know; see `question`
  | "no_form" // no online form found even after a harder look; the run swaps in the next best firm (D46)
  | "email_draft" // legacy (D45): no longer produced
  | "sending"
  | "sent"
  | "send_blocked" // approval given but the send gate refused (demo persona, or sending not enabled)
  | "failed";

export type EnquiryOutcome = {
  firmId: string;
  firmName: string;
  status: EnquiryStatus;
  formUrl: string | null;
  filled: { label: string; value: string }[]; // what the agent typed or picked, for the review
  unfilled: string[]; // required fields left empty
  consents: string[]; // checkbox texts the user must agree to before we can send (never ticked without approval)
  question?: string; // for needs_input
  email?: { to: string | null; subject: string; body: string; mailto: string }; // for email_draft
  note: string; // one plain line: "Form filled on their contact page", "Blocked: demo persona"
  sentAt?: string;
  confirmation?: string; // what the firm's page said after Send
  swappedFor?: string; // this firm was brought in because <firm name> had no online form (D46)
  attempts?: number; // how many times the agent tried (it retries once by itself after a failure)
};

export type Step4Result = { enquiries: EnquiryOutcome[]; stats: Stats; runId: string; trace: TraceStep[] };

/**
 * POST /api/agent/step4 { facts, message, firms: FirmFinding[] (max 3), legalAid?: { verdict, route } }
 * -> newline-delimited JSON Step4Event. Ends with one "result" or "error". The browser stays open for review and send.
 */
export type Step4Event =
  | { type: "status"; message: string }
  | { type: "agent"; tile: AgentTile }
  | { type: "stats"; stats: Stats }
  | { type: "trace"; step: TraceStep }
  | { type: "enquiry"; enquiry: EnquiryOutcome }
  | { type: "result"; result: Step4Result }
  | { type: "error"; message: string };

/**
 * POST /api/agent/step4/draft { facts, legalAid?: { verdict, route } } -> EnquiryMessage
 * POST /api/agent/step4/send  { firmId, consents: string[] } -> { enquiry: EnquiryOutcome }
 *   `consents` = the checkbox texts the user explicitly agreed to in our app; only those are ticked.
 *   Status comes back as sent | send_blocked | needs_input | failed.
 */

/** What the app keeps per firm for tracking (profile.enquiries). Updated by hand until inbox reading exists. */
export type EnquiryRecord = {
  firmId: string;
  firmName: string;
  status: "draft" | "ready_to_send" | "email_draft" | "sent" | "replied" | "not_interested";
  sentAt?: string;
  followUpOn?: string; // YYYY-MM-DD, 3 working days after sending (our rule of thumb, not a legal deadline)
  notes?: string;
};
