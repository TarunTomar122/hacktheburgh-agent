// Fictional demo patient "Ailsa Reid". Safe to use anywhere: scripts, benchmark, and the UI's skip button.
// Every detail is made up (example.com email, Ofcom drama-range phone number).
import type { ChatMessage } from "./chat";
import type { Draft } from "./draft";
import type { CaseFacts } from "./facts";

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
