import type { Tri } from "./legalAidTypes";
import type { Profile } from "../profile";
import { fmtDate, spsoClock } from "./complaintClock";
import type { SpsoAnswers } from "./spsoAnswers";

/** One line of a checklist: a claim that is true (yes), false (no) or not clear (unknown), and the evidence for it. Computed in code, never by the model. */
export type CheckRowData = { label: string; status: Tri; evidence: string };

/** Can the ombudsman look at this? The yes/no answers are the ones we will give on the form, so the user can see and change them. */
export function spsoChecks(profile: Pick<Profile, "facts" | "progress" | "ombudsman">, answers: Pick<SpsoAnswers, "courtAction" | "letterMentionsSpso">, today: Date = new Date()): CheckRowData[] {
  const progress = profile.progress ?? {};
  const skipped = progress.skipped?.includes(1) === true;
  const received = profile.ombudsman?.receivedOn ? new Date(profile.ombudsman.receivedOn) : null;
  const clock = spsoClock(profile.facts, today);
  return [
    {
      label: "NHS Lothian has sent its final reply",
      status: profile.ombudsman?.unlocked ? "yes" : "unknown",
      evidence: profile.ombudsman?.unlocked ? (received && !Number.isNaN(received.getTime()) ? `You told us it arrived on ${fmtDate(received)}.` : "You told us it has arrived.") : "Not yet. This step opens when you tell us it has arrived.",
    },
    {
      label: "You went through NHS Lothian's complaints process first",
      status: progress.nhsSent || skipped ? "yes" : "unknown",
      evidence: progress.nhsSent
        ? "You marked your complaint as sent in step 1."
        : skipped
          ? "Step 1 was skipped in the demo."
          : "We have no record of step 1. The ombudsman's form is for people who have completed the organisation's own process.",
    },
    {
      label: "Is inside 12 months of when you first knew",
      status: clock.state === "inside" ? "yes" : clock.state === "outside" ? "no" : "unknown",
      evidence: clock.headline + ".",
    },
    {
      label: "Has not been considered in court",
      status: answers.courtAction ? "no" : "yes",
      evidence: answers.courtAction ? "You said it is in court or may go there. The ombudsman usually cannot look at a complaint that has been considered in court." : "We will answer No on the form. Change it below if a court case is under way or planned.",
    },
    {
      label: "NHS Lothian's reply points you to the ombudsman",
      status: answers.letterMentionsSpso ? "yes" : "unknown",
      evidence: answers.letterMentionsSpso ? "We will answer Yes on the form." : "The ombudsman's form asks whether it does. We will answer No.",
    },
  ];
}

/** "4 of 6" for a header chip. */
export const tally = (rows: CheckRowData[]) => ({ yes: rows.filter((r) => r.status === "yes").length, total: rows.length });
