// Demo fill: one fictional answer per onboarding question, taken from the default demo persona (Ailsa Reid, Scotland).
// The presenter goes through every step and presses "Demo fill" instead of typing; the answer still goes through the normal OK.
// Client-safe. Every detail is invented (example.com email, Ofcom drama-range phone number).
import type { CaseFacts } from "../agent/facts";
import { OUTCOME_CHOICES, type FormField } from "../agent/inputs";
import { getPersona } from "./index";

export const DEMO_PERSONA_ID = "scotland-ailsa-wrist";

const demoFacts = (): CaseFacts => {
  const p = getPersona(DEMO_PERSONA_ID);
  if (!p) throw new Error(`Demo persona ${DEMO_PERSONA_ID} is missing from lib/personas.`);
  return p.facts;
};

/** The first question: a first name. */
export const demoName = () => demoFacts().firstName ?? "Ailsa";

/**
 * The story, in Ailsa's own words and the same facts as her persona summary, with the words that name a time or a place left out
 * ("Weeks later", "A&E"). The interview then still has to ask when it happened and where she was treated (the "details" step), so the
 * demo shows every step. The when and where come from the persona's facts in that step.
 */
export const demoStory = () =>
  "My wrist was X-rayed and I was told it was only a sprain. The painkillers I was given, co-codamol, made me very sick and dizzy, so I stopped them after three days. The pain did not go away. In the end a scaphoid fracture was found. It has not healed, I now need surgery, and I have missed my second-year exams and shifts at my part-time job.";

/** The month and year of the persona's first event, in the shape the date field stores ("July 2026"). */
function demoDate(): string {
  const first = demoFacts().events[0]?.date ?? "";
  return first.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December) (\d{4})\b/)?.[0] ?? first;
}

/** What goes into one field of a form (the details form or the contact form). */
export function demoFieldValue(f: FormField): string {
  const facts = demoFacts();
  switch (f.key) {
    case "eventDate":
      return demoDate();
    case "eventWhat":
      // The field is "in a few words", and a long answer would scroll out of sight in the one-line box.
      return "Told at A&E it was a sprain";
    case "incidentLocation":
      // The hospital's name, without the department, so the whole answer fits on one line of the big field.
      return (facts.incidentLocation ?? "").split(",")[0].trim();
    case "title":
      return facts.title && f.options?.includes(facts.title) ? facts.title : (f.options?.[0] ?? "");
    case "lastName":
      return facts.lastName ?? "";
    case "address":
      return facts.address ?? "";
    case "postcode":
      return facts.postcode ?? "";
    case "phone":
      return facts.phone ?? "";
    case "email":
      return facts.email ?? "";
  }
}

/** Which option of a one-choice question the persona would pick: for "who", their own care. Unknown questions get the first option. */
export function demoChoiceValue(target: string, options: { label: string; value: string }[]): string | null {
  const facts = demoFacts();
  const wanted = target === "who" ? facts.complainingFor : target === "contactMethod" ? facts.preferredContact : target === "emailRisk" ? (facts.emailRiskAccepted ? "yes" : "no") : null;
  return (options.find((o) => o.value === wanted) ?? options[0])?.value ?? null;
}

/** The outcomes the persona asked for, in list order, matched against the sentence in the persona's facts. */
export function demoOutcomes(options: readonly string[]): string[] {
  const sentence = (demoFacts().desiredOutcome ?? "").toLowerCase();
  const picked = options.filter((o) => sentence.includes(o.toLowerCase().replace(/^an? /, "")));
  return picked.length > 0 ? picked : [OUTCOME_CHOICES[0]];
}
