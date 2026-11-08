import type { ChatMessage } from "../agent/chat";
import type { Draft } from "../agent/draft";
import type { CaseFacts } from "../agent/facts";

/** Where the persona lives, as a filter chip. */
export const GROUPS = ["UK", "Europe", "Americas", "Asia-Pacific", "Africa"] as const;
export type PersonaGroup = (typeof GROUPS)[number];

/** What kind of story it is, as a filter chip. */
export const CATEGORIES = [
  "Missed fracture",
  "Delayed cancer diagnosis",
  "Missed sepsis",
  "Misdiagnosis in emergency care",
  "Misread scan",
  "Surgical error",
  "Hospital infection",
  "Medication error",
  "Maternity injury",
  "Discharged too early",
  "Delayed treatment",
  "Mental health care",
  "Dental care",
  "Care home neglect",
  "A child's care",
  "GP misdiagnosis",
] as const;
export type StoryCategory = (typeof CATEGORIES)[number];

/**
 * A fictional patient the tester can load instead of doing onboarding. Everything about the person and the story is invented
 * (example.com emails; phone numbers in drama or 555 ranges); only the place of care is a real public hospital or trust.
 * `facts` is the same shape onboarding produces, with the country and region already confirmed so place detection uses them.
 */
export type Persona = {
  id: string;
  name: string;
  /** One line: what happened, no age. */
  blurb: string;
  /** City and country or nation for display, e.g. "Leicester, England". */
  place: string;
  group: PersonaGroup;
  category: StoryCategory;
  /** What this persona is there to test, in a few words. */
  tests: string;
  facts: CaseFacts;
  /** A ready-written complaint, only for the Scotland personas (their step 1 shows text at once). Others: the crew writes it. */
  draft: Draft | null;
  messages: ChatMessage[];
};
