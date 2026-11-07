import { z } from "zod";

/** Everything we need to know about the user's case. Null = not known yet. */
export const CaseFacts = z.object({
  complainingFor: z.enum(["me", "someone_else"]).nullable(),
  title: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  address: z.string().nullable(),
  postcode: z.string().nullable().describe("Postcode or postal code, if the country has one."),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  preferredContact: z.enum(["Letter", "Email", "Phone Call"]).nullable(),
  country: z
    .string()
    .nullable()
    .describe("Country where the care happened, in English, e.g. 'United Kingdom', 'New Zealand'. Worked out by the program from the story and address and confirmed by the user; null until then."),
  region: z
    .string()
    .nullable()
    .describe("The part of the country whose health and legal system applies, if the country has several (e.g. 'Wales', 'Scotland', a US state). null if none applies or not known yet."),
  incidentLocation: z.string().nullable().describe("Where the medical care being questioned took place: hospital, ward, clinic or GP surgery. This is the treatment location, not the location of the original accident or injury."),
  incidentSummary: z.string().nullable().describe("What went wrong, in the user's own words"),
  events: z
    .array(
      z.object({
        date: z.string().describe("YYYY-MM-DD if the user gave a full date, otherwise their wording, e.g. 'early July 2026'"),
        what: z.string(),
      }),
    )
    .describe("Timeline of what happened, oldest first"),
  desiredOutcome: z
    .string()
    .nullable()
    .describe("What they want to happen, e.g. explanation, apology, changes. null until they have been asked; an empty string if they were asked and had nothing to add."),
  emailRiskAccepted: z
    .boolean()
    .nullable()
    .describe("Only relevant if preferredContact is Email: did the user explicitly agree to the NHS email-risk disclaimer? null until asked."),
  medicalRecords: z
    .enum(["not_requested", "requested", "have_copy"])
    .nullable()
    .describe("Optional. Has the user asked for / received a copy of their medical records? Do NOT ask about this in the intake chat; leave null unless they volunteer it. A later step asks if it needs it."),
});
export type CaseFacts = z.infer<typeof CaseFacts>;

export const emptyFacts = (): CaseFacts => ({
  complainingFor: null,
  title: null,
  firstName: null,
  lastName: null,
  address: null,
  postcode: null,
  phone: null,
  email: null,
  preferredContact: null,
  country: null,
  region: null,
  incidentLocation: null,
  incidentSummary: null,
  events: [],
  desiredOutcome: null,
  emailRiskAccepted: null,
  medicalRecords: null,
});

/** Fields the complaint form (and later steps) cannot proceed without. Checked in code, not by the model. */
const REQUIRED: (keyof CaseFacts)[] = [
  "complainingFor",
  "firstName",
  "lastName",
  "address",
  "postcode",
  "phone",
  "email",
  "preferredContact",
  "incidentLocation",
  "incidentSummary",
  "events", // needed later for deadlines
];

/** Only the NHS complaint needs these, so onboarding does not ask them (D42); the complaint step does. */
export const NHS_ONLY: (keyof CaseFacts)[] = ["preferredContact", "emailRiskAccepted"];
export const missingForOnboarding = (f: CaseFacts) => missingRequired(f).filter((k) => !NHS_ONLY.includes(k));

/**
 * Is the care in the United Kingdom? true / false once the place is known, null before. Read from the facts (the country the
 * program worked out and the user confirmed), never from a table of countries: only the UK's own postcode and phone rules are in code.
 */
export function placeIsUK(f: Pick<CaseFacts, "country">): boolean | null {
  const c = (f.country ?? "").trim();
  if (!c) return null;
  return /^(the\s+)?(united\s+kingdom|uk|u\.k\.|great\s+britain|britain|england|scotland|wales|northern\s+ireland)$/i.test(c);
}

export function missingRequired(f: CaseFacts): (keyof CaseFacts)[] {
  let required = f.preferredContact === "Email" ? [...REQUIRED, "emailRiskAccepted" as const] : REQUIRED;
  // Not every country has postcodes: only a UK place must have one (before the place is known it is optional too).
  if (placeIsUK(f) !== true) required = required.filter((k) => k !== "postcode");
  return required.filter((k) => {
    const v = f[k];
    return Array.isArray(v) ? v.length === 0 : v === null || String(v).trim() === "";
  });
}

/** The model may add or fix facts, but must never silently erase one. */
export function mergeFacts(old: CaseFacts, next: CaseFacts): CaseFacts {
  const out = { ...next } as Record<string, unknown>;
  for (const k of Object.keys(old) as (keyof CaseFacts)[]) {
    const o = old[k];
    const n = next[k];
    if (Array.isArray(o)) {
      if (Array.isArray(n) && n.length < o.length) out[k] = o;
    } else if ((n === null || String(n).trim() === "") && o !== null) {
      out[k] = o;
    }
  }
  return out as CaseFacts;
}
