import { z } from "zod";

/** Everything we need to know about the user's case. Null = not known yet. */
export const CaseFacts = z.object({
  complainingFor: z.enum(["me", "someone_else"]).nullable(),
  title: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  address: z.string().nullable(),
  postcode: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  preferredContact: z.enum(["Letter", "Email", "Phone Call"]).nullable(),
  incidentLocation: z.string().nullable().describe("Where the care happened: hospital, ward, clinic, GP surgery"),
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
  incidentLocation: null,
  incidentSummary: null,
  events: [],
  desiredOutcome: null,
  emailRiskAccepted: null,
});

/** Fields the NHS Lothian form (and later steps) cannot proceed without. Checked in code, not by the model. */
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

export function missingRequired(f: CaseFacts): (keyof CaseFacts)[] {
  const required = f.preferredContact === "Email" ? [...REQUIRED, "emailRiskAccepted" as const] : REQUIRED;
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
