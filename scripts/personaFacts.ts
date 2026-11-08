// Facts for a persona name given to a script: the original scripts/personas/<name>.json if there is one (unchanged),
// otherwise a persona from the shared library (lib/personas) by its id, e.g. "au-nsw-jack-allergy".
import { existsSync, readFileSync } from "node:fs";
import type { CaseFacts } from "../lib/agent/facts";
import { getPersona, PERSONAS } from "../lib/personas";

export function personaFacts(who: string): CaseFacts {
  const file = `scripts/personas/${who}.json`;
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8")) as CaseFacts;
  const p = getPersona(who);
  if (!p) throw new Error(`No persona "${who}". Files in scripts/personas, or a library id: ${PERSONAS.map((x) => x.id).join(", ")}`);
  return p.facts;
}
