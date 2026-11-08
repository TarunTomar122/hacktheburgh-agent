import type { CaseFacts } from "../agent/facts";
import type { Draft } from "../agent/draft";
import type { Persona, PersonaGroup, StoryCategory } from "./types";

type Input = {
  id: string;
  blurb: string;
  city: string;
  group: PersonaGroup;
  category: StoryCategory;
  tests: string;
  draft?: Draft | null;
  /** Anything not given is empty (null), which is how a persona with gaps makes the crew ask. */
  facts: Partial<CaseFacts> & Pick<CaseFacts, "firstName" | "lastName" | "country" | "incidentLocation" | "incidentSummary" | "events">;
};

/** Builds a persona; the name and transcript follow from the facts so they cannot drift apart. */
export function persona(i: Input): Persona {
  const facts: CaseFacts = {
    complainingFor: "me",
    title: null,
    address: null,
    postcode: null,
    phone: null,
    email: null,
    preferredContact: null,
    region: null,
    desiredOutcome: null,
    emailRiskAccepted: null,
    medicalRecords: null,
    ...i.facts,
  };
  const name = `${facts.firstName} ${facts.lastName}`;
  return {
    id: i.id,
    name,
    blurb: i.blurb,
    place: i.city,
    group: i.group,
    category: i.category,
    tests: i.tests,
    facts,
    draft: i.draft ?? null,
    messages: [{ role: "agent", content: `Persona loaded (${name}, fictional). No interview took place, so there is no conversation to show.` }],
  };
}
