// Fictional demo patients. Safe to use anywhere: scripts, benchmark, and the onboarding page's demo buttons.
// Every detail is made up (example.com email, Ofcom drama-range phone number).
import type { ChatMessage } from "./chat";
import type { Draft } from "./draft";
import type { CaseFacts } from "./facts";
import { COMPENSATION_CHOICE, OUTCOME_CHOICES, outcomeSentence, SIDE_EFFECT_CHOICE } from "./inputs";

export const SAMPLE_FACTS: CaseFacts = {
  complainingFor: "me",
  title: "Ms",
  firstName: "Ailsa",
  lastName: "Reid",
  address: "14 Example Street, Edinburgh",
  postcode: "EH1 1AA",
  phone: "07700 900123",
  email: "ailsa.reid@example.com",
  preferredContact: "Email",
  incidentLocation: "Royal Infirmary of Edinburgh, Accident & Emergency department",
  incidentSummary: "I fell on my outstretched hand. A&E X-rayed my wrist and told me it was a sprain. The pain did not go away.",
  events: [
    { date: "early July 2026", what: "Fell on outstretched hand and attended A&E at the Royal Infirmary. X-rayed, told it was a sprain, sent home." },
    { date: "mid August 2026", what: "Pain continued. My GP sent me back and a second X-ray showed a scaphoid fracture." },
    { date: "November 2026", what: "The fracture has not healed and I now need surgery." },
  ],
  desiredOutcome: "An explanation of why the fracture was missed, and an apology.",
  emailRiskAccepted: true,
  medicalRecords: null,
};

/** A ready-written draft so step 1 shows text immediately (no model call). "Write it again" still works. */
export const SAMPLE_DRAFT: Draft = {
  details:
    "I am complaining about the care I received at the Royal Infirmary of Edinburgh, Accident & Emergency department.\n\nIn early July 2026, I fell on my outstretched hand and attended A&E. My wrist was X-rayed, I was told it was a sprain, and I was sent home.\n\nThe pain did not go away. In mid August 2026, my GP sent me back and a second X-ray showed a scaphoid fracture.\n\nIn November 2026, the fracture has not healed and I now need surgery.\n\nI would like to understand why the fracture was missed when I first attended A&E.",
  location: "Royal Infirmary of Edinburgh, Accident & Emergency department",
  outcome: "An explanation of why the fracture was missed, and an apology.",
};

export const SAMPLE_MESSAGES: ChatMessage[] = [
  { role: "agent", content: "Demo patient loaded (Ailsa Reid, fictional). No interview took place, so there is no conversation to show." },
];

/** Demo answers for the ombudsman step (things only known after the NHS replies). Fictional. */
export const SAMPLE_SPSO = {
  readConfirmed: true,
  nhsReference: "DEMO-0001",
  childAffected: false,
  courtAction: false,
  letterMentionsSpso: true,
  documents: { finalResponse: "post" as const, stage1Response: "none" as const, ownComplaint: "post" as const, other: "none" as const },
  otherReviews: "no" as const,
  reportedToRegulator: false,
  impact: "The fracture has not healed and I am in pain every day. I now need surgery, I have missed lectures and shifts at my part-time job, and I am worried about whether I will get full use of my wrist back.",
  outcome: "I would like NHS Lothian to explain in writing why the fracture was missed at A&E, to apologise to me, and to review how wrist X-rays are checked so the same mistake does not happen to other patients.",
};

/* ------------------------------------------------------------------ demo personas (D24 rules: fictional, example.com, Ofcom drama numbers) */


const [EXPLANATION, APOLOGY, CHANGES, SUPPORT] = OUTCOME_CHOICES;

export type DemoPersona = { id: "complaint" | "compensation" | "yellowcard"; name: string; label: string; blurb: string; facts: CaseFacts; draft: Draft; messages: ChatMessage[] };

/** Persona A: short-lived harm, wants answers not money. Should be recommended "Make a complaint" (D42). */
const CALLUM: CaseFacts = {
  complainingFor: "me",
  title: "Mr",
  firstName: "Callum",
  lastName: "Fraser",
  address: "22 Sample Road, Edinburgh",
  postcode: "EH3 6AA",
  phone: "07700 900456",
  email: "callum.fraser@example.com",
  preferredContact: "Letter",
  incidentLocation: "Western General Hospital, day surgery unit",
  incidentSummary:
    "After a minor operation in day surgery I was given twice the right dose of an anti-sickness medicine. I was dizzy and very sick for the rest of the day and was kept in overnight. I was back to normal two days later, but nobody explained what had happened.",
  events: [
    { date: "3 October 2026", what: "Day surgery at the Western General. Given a double dose of anti-sickness medicine afterwards, felt very unwell and was kept in overnight." },
    { date: "5 October 2026", what: "Felt back to normal. Asked the ward what had happened and did not get a clear answer." },
  ],
  desiredOutcome: outcomeSentence([EXPLANATION, APOLOGY, CHANGES], ""),
  emailRiskAccepted: null,
  medicalRecords: null,
};

const CALLUM_DRAFT: Draft = {
  details:
    "I am complaining about the care I received at the Western General Hospital day surgery unit.\n\nOn 3 October 2026, after a minor operation, I was given twice the correct dose of an anti-sickness medicine. I was dizzy and very sick for the rest of the day and was kept in overnight.\n\nI was back to normal by 5 October 2026. When I asked the ward what had happened, I did not get a clear answer.",
  location: "Western General Hospital, day surgery unit",
  outcome: CALLUM.desiredOutcome ?? "",
};

/** Persona B: Ailsa, with lasting harm that has cost her study and work, and who asks for compensation. Should be recommended "Claim compensation". */
const AILSA_B: CaseFacts = {
  ...SAMPLE_FACTS,
  incidentSummary:
    "I fell on my outstretched hand. A&E X-rayed my wrist and told me it was a sprain. The pain did not go away. Weeks later a scaphoid fracture was found. It has not healed, I now need surgery, and I have missed my second-year exams and shifts at my part-time job.",
  events: [
    ...SAMPLE_FACTS.events,
    { date: "October 2026", what: "Missed my second-year exams and had to stop shifts at my part-time job because I cannot use my wrist." },
  ],
  desiredOutcome: outcomeSentence([EXPLANATION, SUPPORT, COMPENSATION_CHOICE], ""),
};

/** Persona C (proposed, feature/yellow-card): a reaction to a prescribed antibiotic, wants it reported. Should be recommended "Report a medicine problem". */
const ISLA: CaseFacts = {
  complainingFor: "me",
  title: "Ms",
  firstName: "Isla",
  lastName: "Grant",
  address: "7 Demo Lane, Edinburgh",
  postcode: "EH1 1AA",
  phone: "07700 900789",
  email: "isla.grant@example.com",
  preferredContact: "Email",
  incidentLocation: "GP surgery",
  incidentSummary:
    "My GP prescribed amoxicillin capsules for a chest infection. On the third day I came out in an itchy rash all over my body and my lips swelled. The pharmacist told me to stop taking them and it cleared up after a week.",
  events: [
    { date: "10 October 2026", what: "Started amoxicillin capsules prescribed by my GP for a chest infection." },
    { date: "12 October 2026", what: "Itchy rash all over my body and swollen lips. Stopped the capsules on the pharmacist's advice." },
    { date: "19 October 2026", what: "The rash had cleared." },
  ],
  desiredOutcome: outcomeSentence([CHANGES, SIDE_EFFECT_CHOICE], ""),
  emailRiskAccepted: null,
  medicalRecords: null,
};

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    id: "complaint",
    name: "Callum Fraser",
    label: "Demo: complaint",
    blurb: "Wrong medicine dose, recovered in two days. Wants an explanation, an apology and changes.",
    facts: CALLUM,
    draft: CALLUM_DRAFT,
    messages: [{ role: "agent", content: "Demo patient loaded (Callum Fraser, fictional). No interview took place, so there is no conversation to show." }],
  },
  {
    id: "compensation",
    name: "Ailsa Reid",
    label: "Demo: compensation",
    blurb: "Missed wrist fracture that has not healed; missed exams and work. Wants compensation.",
    facts: AILSA_B,
    draft: SAMPLE_DRAFT,
    messages: SAMPLE_MESSAGES,
  },
  {
    id: "yellowcard",
    name: "Isla Grant",
    label: "Demo: Yellow Card",
    blurb: "Rash and swollen lips from a prescribed antibiotic, now recovered. Wants it reported so it is looked into.",
    facts: ISLA,
    // No complaint is written on this track; the draft is only here because every persona carries one.
    draft: { details: ISLA.incidentSummary ?? "", location: "GP surgery", outcome: ISLA.desiredOutcome ?? "" },
    messages: [{ role: "agent", content: "Demo patient loaded (Isla Grant, fictional). No interview took place, so there is no conversation to show." }],
  },
];
