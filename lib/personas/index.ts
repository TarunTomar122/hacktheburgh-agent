// The persona library: fictional patients a tester can load instead of doing onboarding (onboarding header and Profile tab).
// One typed array, client-safe (no server imports). Scripts read the same facts through scripts/personaFacts.ts.
import { missingForOnboarding } from "../agent/facts";
import { UK_PERSONAS } from "./uk";
import { WORLD_PERSONAS } from "./world";
import type { Persona } from "./types";

export { CATEGORIES, GROUPS } from "./types";
export type { Persona, PersonaGroup, StoryCategory } from "./types";

export const PERSONAS: Persona[] = [...UK_PERSONAS, ...WORLD_PERSONAS];

export const getPersona = (id: string) => PERSONAS.find((p) => p.id === id);

/** The profile loader (dev and demo shortcut) is shown in development, or in a production build made with NEXT_PUBLIC_DEMO_SKIP=1. */
export const PERSONA_PICKER_ENABLED = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO_SKIP === "1";

/** What onboarding would still have to ask for this persona (empty = a complete profile). */
export const gapsOf = (p: Persona) => missingForOnboarding(p.facts);

/** Search across everything a person might type: name, place, country, story, category, what it tests. */
export function matchesPersona(p: Persona, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [p.name, p.place, p.facts.country, p.facts.region, p.blurb, p.category, p.tests, p.group, p.facts.incidentLocation].join(" ").toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}
