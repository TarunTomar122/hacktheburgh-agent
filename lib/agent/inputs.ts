// Which question comes next, and which kind of input answers it. Client-safe: no OpenAI imports.
//
// The order and the wording of the questions live here, in code, so they are predictable and
// testable. The model is only used to read free text (the story, or anything typed in the
// interview script) and to add one short acknowledgement. See D28.
import type { CaseFacts } from "./facts";

export type Target = "name" | "story" | "details" | "who" | "contact" | "contactMethod" | "emailRisk" | "outcome" | "done";

export const EMAIL_DISCLAIMER =
  "I request NHS Lothian to contact me via email in relation to my enquiry. I understand and accept the risk that sending clinical information by an un-secured internet address involves the risk that the information can be diverted/sent to other parties/become lost and understand that NHS Lothian takes no responsibility for this.";

export const TITLES = ["Mr", "Mrs", "Miss", "Ms", "Mx", "Dr", "Prof"] as const;

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/** Suggestions only (the field still takes anything typed). These are the main NHS Lothian hospitals. */
export const PLACE_SUGGESTIONS = [
  "Royal Infirmary of Edinburgh",
  "Western General Hospital",
  "St John's Hospital, Livingston",
  "Royal Hospital for Children and Young People",
  "Royal Edinburgh Hospital",
  "GP surgery",
];

export const OUTCOME_CHOICES = [
  "An explanation of what went wrong",
  "An apology",
  "Changes so it does not happen to someone else",
  "Treatment or support to put things right",
  "Compensation for what happened",
  "Report a prescription or side effect from a medicine",
] as const;
/** Ticking this points towards the compensation track (D42). */
export const COMPENSATION_CHOICE = "Compensation for what happened";
/** Ticking either of these points towards the Yellow Card track (proposed, feature/yellow-card). Their first 18 characters must stay distinct: goalsFrom matches on them. */
export const SIDE_EFFECT_CHOICE = "Report a prescription or side effect from a medicine";
/** The wording before the two medicine options were merged into one. Cases saved with it still count as a side effect (track.ts). */
export const LEGACY_SIDE_EFFECT_CHOICE = "Report a side effect from a medicine or vaccine";
export const FAULTY_PRODUCT_CHOICE = "Report a faulty or fake medicine, prescription item or device";

const blank = (v: string | null | undefined) => v === null || v === undefined || v.trim() === "";

/**
 * The first thing still unanswered. Pure function of the facts, so the same facts always give the same question.
 * Scope "onboarding" leaves out what only the NHS complaint needs (how NHS Lothian should reply, the email-risk consent):
 * those are asked on the complaint step, and only if the user takes that track (D42). Scope "nhs" includes them.
 */
export function nextTarget(f: CaseFacts, scope: "onboarding" | "nhs" = "onboarding"): Target {
  if (blank(f.firstName)) return "name";
  if (blank(f.incidentSummary)) return "story";
  if (f.events.length === 0 || f.events.some((e) => blank(e.date)) || blank(f.incidentLocation)) return "details";
  if (blank(f.lastName) || blank(f.address) || blank(f.postcode) || blank(f.phone) || blank(f.email)) return "contact";
  if (scope === "nhs" && f.preferredContact === null) return "contactMethod";
  if (scope === "nhs" && f.preferredContact === "Email" && f.emailRiskAccepted === null) return "emailRisk";
  if (f.desiredOutcome === null) return "outcome";
  return "done";
}

/**
 * Tidy facts after any change. Declining the email risk means we must not contact them by email,
 * so the contact method goes back to unanswered and they choose again. Consent is never kept for a
 * method they are not using.
 */
export function normaliseFacts(f: CaseFacts): CaseFacts {
  const out = { ...f };
  out.complainingFor ??= "me";
  if (out.address && blank(out.postcode)) {
    const s = splitPostcode(out.address);
    if (s) {
      out.address = s.address;
      out.postcode = s.postcode;
    }
  }
  if (out.postcode !== null) out.postcode = formatPostcode(out.postcode);
  if (out.preferredContact === "Email" && out.emailRiskAccepted === false) {
    out.preferredContact = null;
    out.emailRiskAccepted = null;
  }
  if (out.preferredContact !== null && out.preferredContact !== "Email") out.emailRiskAccepted = null;
  return out;
}

// ---------------------------------------------------------------- validation

const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
// Email: the shape RFC 5321 allows in practice, plus a catch for the typos people actually make (D44).
const EMAIL_LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL = /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD = /^([A-Za-z]{2,24}|xn--[A-Za-z0-9-]{2,59})$/;
const EMAIL_SHAPE_MESSAGE = "That email address does not look right. It should look like name@example.com.";
/** Domains that are almost certainly a slip for a well-known one. A real address at one of these is very unlikely. */
const DOMAIN_TYPOS: Record<string, string> = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gamil.com": "gmail.com", "gmaill.com": "gmail.com", "gmail.con": "gmail.com", "gmail.cm": "gmail.com", "gmail.co": "gmail.com", "gnail.com": "gmail.com",
  "hotmial.com": "hotmail.com", "hotmai.com": "hotmail.com", "hotmal.com": "hotmail.com", "hotmail.con": "hotmail.com",
  "outlok.com": "outlook.com", "outlook.con": "outlook.com", "yaho.com": "yahoo.com", "yahooo.com": "yahoo.com", "yahoo.con": "yahoo.com",
  "iclod.com": "icloud.com", "icoud.com": "icloud.com", "icloud.con": "icloud.com",
};
const TLD_TYPOS = new Set(["con", "cmo", "vom", "comm", "cim", "ocm", "xom"]);

/** Why an email address is not acceptable, in plain words, or null if it is. Checks the shape only: we cannot know the mailbox exists. */
export function emailProblem(v: string): string | null {
  const t = v.trim();
  const at = t.indexOf("@");
  if (at < 1 || at !== t.lastIndexOf("@") || t.length > 254) return EMAIL_SHAPE_MESSAGE;
  const local = t.slice(0, at);
  const domain = t.slice(at + 1).toLowerCase();
  if (local.length > 64 || !EMAIL_LOCAL.test(local)) return EMAIL_SHAPE_MESSAGE;
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((l) => DOMAIN_LABEL.test(l)) || !TLD.test(labels[labels.length - 1])) return EMAIL_SHAPE_MESSAGE;
  const fix = DOMAIN_TYPOS[domain];
  if (fix) return `Did you mean ${local}@${fix}? "${domain}" looks like a typing slip.`;
  if (TLD_TYPOS.has(labels[labels.length - 1])) return `The ending ".${labels[labels.length - 1]}" looks like a typing slip. Please check the part after the last dot.`;
  return null;
}

export function formatPostcode(v: string): string {
  const t = v.replace(/\s+/g, "").toUpperCase();
  return POSTCODE.test(t) ? `${t.slice(0, -3)} ${t.slice(-3)}` : v.trim();
}
export const isPostcode = (v: string) => POSTCODE.test(v.trim());
export const isEmail = (v: string) => emailProblem(v) === null;

const POSTCODE_IN_TEXT = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/gi;
/**
 * A UK postcode typed inside an address ("14 Gorgie Road, Edinburgh EH11 2LA"): returns the address without it and the postcode, so we never ask for it again (D44).
 * Takes the last one that is a valid postcode. Null if there is none, or if the address would be left empty.
 */
export function splitPostcode(address: string): { address: string; postcode: string } | null {
  const hits = [...address.matchAll(POSTCODE_IN_TEXT)].filter((m) => isPostcode(m[0]));
  const hit = hits[hits.length - 1];
  if (!hit || hit.index === undefined) return null;
  const rest = (address.slice(0, hit.index) + " " + address.slice(hit.index + hit[0].length)).replace(/\s+/g, " ").trim().replace(/[\s,;.-]+$/, "").replace(/^[\s,;.-]+/, "");
  return rest ? { address: rest, postcode: formatPostcode(hit[0]) } : null;
}
/** Digits, spaces, brackets, hyphens and a leading +, with 10 to 13 digits. */
export function isPhone(v: string): boolean {
  const t = v.trim();
  return /^\+?[\d\s()-]+$/.test(t) && t.replace(/\D/g, "").length >= 10 && t.replace(/\D/g, "").length <= 13;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_YEAR = new RegExp(`^(${MONTHS.join("|")}) \\d{4}$`);
export type DateMode = "exact" | "month" | "words";
export function dateMode(v: string): DateMode {
  if (ISO_DATE.test(v)) return "exact";
  if (MONTH_YEAR.test(v)) return "month";
  return "words";
}

/** A plain-words message for the first problem found in a set of widget answers, or null if all is well. */
export function validatePatch(p: Partial<CaseFacts>): string | null {
  if (p.postcode != null && !isPostcode(p.postcode)) return "That postcode does not look right. It should look like EH1 1AA.";
  if (p.phone != null && !isPhone(p.phone)) return "That telephone number does not look right. Use digits only, for example 07700 900123.";
  if (p.email != null) {
    const problem = emailProblem(p.email);
    if (problem) return problem;
  }
  if (p.events) {
    const today = new Date().toISOString().slice(0, 10);
    for (const e of p.events) {
      if (ISO_DATE.test(e.date) && e.date > today) return "That date is in the future. Please check it.";
      if (ISO_DATE.test(e.date)) {
        const parsed = new Date(e.date);
        if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== e.date) return "That date does not exist. Please check it.";
      }
    }
  }
  return null;
}

/** Non-negative money/number answer, including decimal thousands such as 2.5k. Blank is unknown, never zero. */
export function parseFundingNumber(answer: string | null): number | null {
  if (answer === null) return null;
  const match = answer.replace(/[£,\s]/g, "").match(/^(\d+(?:\.\d+)?|\.\d+)(k)?$/i);
  if (!match) return null;
  const value = Number(match[1]) * (match[2] ? 1000 : 1);
  return Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------- what the user sees

export type FieldKind = "text" | "textarea" | "tel" | "email" | "postcode" | "date" | "select";
export type FormField = {
  key: "title" | "lastName" | "address" | "postcode" | "phone" | "email" | "incidentLocation" | "eventDate" | "eventWhat";
  label: string;
  kind: FieldKind;
  required: boolean;
  options?: readonly string[];
  suggestions?: readonly string[];
  autoComplete?: string;
  hint?: string;
};

export type InputSpec =
  | { kind: "text"; target: "name"; label: string; placeholder: string; autoComplete: string }
  | { kind: "textarea"; target: "story"; label: string; placeholder: string }
  | { kind: "form"; target: "details" | "contact"; fields: FormField[]; submit: string }
  | { kind: "choice"; target: "who" | "contactMethod" | "emailRisk" | "outcome"; options: { label: string; value: string }[]; disclaimer?: string }
  | { kind: "checklist"; target: "outcome"; options: readonly string[]; otherLabel: string; noneLabel: string }
  | { kind: "none"; target: "done" };

export function inputFor(target: Target, f: CaseFacts, opts: { emailDeclined?: boolean } = {}): InputSpec {
  switch (target) {
    case "name":
      return { kind: "text", target, label: "First name", placeholder: "For example, Ailsa", autoComplete: "given-name" };
    case "story":
      return { kind: "textarea", target, label: "What happened", placeholder: "Take your time. Write it the way you would tell a friend." };
    case "details": {
      const fields: FormField[] = [];
      if (f.events.length === 0 || f.events.some((e) => blank(e.date))) {
        fields.push({ key: "eventDate", label: "When did it happen?", kind: "date", required: true, hint: "A rough date is fine." });
      }
      // Only when the story did not give us anything to use: the story is always asked first, so this is a fallback, not a second question.
      if (f.events.length === 0 && blank(f.incidentSummary)) {
        fields.push({ key: "eventWhat", label: "What happened on the date you just entered?", kind: "text", required: true, hint: "Describe the event you are dating, such as the accident or a medical appointment. For example: ‘I went to A&E and was advised to use ice.’" });
      }
      if (blank(f.incidentLocation)) {
        fields.push({ key: "incidentLocation", label: "Where did you receive the medical care you're concerned about?", kind: "text", required: true, suggestions: PLACE_SUGGESTIONS, hint: "Name the hospital, ward, clinic or GP surgery. If you had an accident, tell us where you were treated, rather than where the accident happened." });
      }
      return { kind: "form", target, fields, submit: "Continue" };
    }
    case "who":
      return {
        kind: "choice",
        target,
        options: [
          { label: "My own care", value: "me" },
          { label: "Someone else's care", value: "someone_else" },
        ],
      };
    case "contact": {
      // Never ask again for something we already have (D33): the optional title only shows if it is still blank.
      const fields: FormField[] = blank(f.title) ? [{ key: "title", label: "Title (optional)", kind: "select", required: false, options: TITLES, autoComplete: "honorific-prefix" }] : [];
      if (blank(f.lastName)) fields.push({ key: "lastName", label: "Last name", kind: "text", required: true, autoComplete: "family-name" });
      if (blank(f.address)) fields.push({ key: "address", label: "Address", kind: "text", required: true, autoComplete: "street-address" });
      if (blank(f.postcode)) fields.push({ key: "postcode", label: "Postcode", kind: "postcode", required: true, autoComplete: "postal-code" });
      if (blank(f.phone)) fields.push({ key: "phone", label: "Telephone", kind: "tel", required: true, autoComplete: "tel" });
      if (blank(f.email)) fields.push({ key: "email", label: "Email", kind: "email", required: true, autoComplete: "email" });
      return { kind: "form", target, fields, submit: "Continue" };
    }
    case "contactMethod": {
      const all = [
        { label: "Letter", value: "Letter" },
        { label: "Email", value: "Email" },
        { label: "Phone call", value: "Phone Call" },
      ];
      return { kind: "choice", target, options: opts.emailDeclined ? all.filter((o) => o.value !== "Email") : all };
    }
    case "emailRisk":
      return {
        kind: "choice",
        target,
        options: [
          { label: "Yes, email is fine", value: "yes" },
          { label: "No, I would rather not", value: "no" },
        ],
        disclaimer: EMAIL_DISCLAIMER,
      };
    case "outcome":
      // The outcome checklist (D42): what they would like to come out of this. The ticks feed the recommended path (track.ts).
      return { kind: "checklist", target, options: OUTCOME_CHOICES, otherLabel: "Anything else you would like to add (optional)", noneLabel: "I have nothing to add" };
    case "done":
      return { kind: "none", target };
  }
}

/** The question for a target, in the manner of the stage it belongs to: a GP for the story, a solicitor for dates and goals, a clerk for contact details. */
export function questionFor(target: Target, f: CaseFacts, opts: { emailDeclined?: boolean } = {}): string {
  const name = f.firstName?.trim();
  switch (target) {
    case "name":
      return "I didn't catch a name. What should I call you?";
    case "story":
      return `Thank you${name ? `, ${name}` : ""}. Whenever you are ready, tell me what happened, in your own words and starting wherever feels natural.`;
    case "details": {
      const needDate = f.events.length === 0 || f.events.some((e) => blank(e.date));
      const needPlace = blank(f.incidentLocation);
      if (needDate && needPlace) return "Roughly when did the events you described happen, and where did you receive the medical care you're concerned about?";
      if (needDate) return "So that I can put things in order, roughly when did this happen?";
      return "Where did you receive the medical care you're concerned about? Please name the hospital, ward, clinic or GP surgery.";
    }
    case "who":
      return "Is this about your own care, or someone else's?";
    case "contact":
      return "Now a few practical details, so that Elliot can fill in forms for you.";
    case "contactMethod":
      return opts.emailDeclined ? "That is fine. Would you prefer a letter or a phone call?" : "How should NHS Lothian reply to your complaint?";
    case "emailRisk":
      return "Email is quick, but it is not completely private. A message could, rarely, reach the wrong person or go missing, and NHS Lothian cannot take responsibility if that happens. Are you happy to be contacted by email on that basis?";
    case "outcome":
      return "Last question. What would you most like to come out of this? Tick all that apply.";
    case "done":
      return `Thank you${name ? `, ${name}` : ""}. I have what I need. Please check everything below. You can change any of it later in your profile. Nothing has been sent to the NHS yet.`;
  }
}

/**
 * The agent's reply: the model's short acknowledgement (may be empty) followed by the next question. Some questions open with "Thank you, <name>.";
 * if the acknowledgement already thanks them, that second thanks is dropped so they are not thanked twice in a row.
 */
export function joinReply(acknowledgement: string, question: string): string {
  const ack = acknowledgement.trim();
  const q = /^(thanks|thank you)\b/i.test(ack) ? question.replace(/^Thank you(, [^.]*)?\.\s+/, "") : question;
  return [ack, q].filter(Boolean).join(" ");
}

/** "An explanation, an apology and changes so it does not happen again." from ticked choices plus anything typed. */
export function outcomeSentence(chosen: string[], other: string): string {
  const items = chosen.map((c, i) => (i > 0 && /^[A-Z][a-z]/.test(c) ? c[0].toLowerCase() + c.slice(1) : c));
  let out = "";
  if (items.length === 1) out = items[0];
  else if (items.length > 1) out = `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  if (out) out += ".";
  const extra = other.trim();
  if (extra) out = out ? `${out} ${/[.!?]$/.test(extra) ? extra : extra + "."}` : /[.!?]$/.test(extra) ? extra : extra + ".";
  return out;
}

/** Turn the answers from a form or choice into facts. Returns what changed, ready to merge. */
export function patchFromAnswer(
  target: Target,
  f: CaseFacts,
  answer: Record<string, string | string[] | boolean>,
): Partial<CaseFacts> {
  const s = (k: string) => (typeof answer[k] === "string" ? (answer[k] as string).trim() : "");
  switch (target) {
    case "who":
      return { complainingFor: s("value") === "someone_else" ? "someone_else" : "me" };
    case "contactMethod": {
      const v = s("value");
      return { preferredContact: v === "Email" || v === "Phone Call" ? v : "Letter" };
    }
    case "emailRisk":
      return { emailRiskAccepted: s("value") === "yes" };
    case "details": {
      const p: Partial<CaseFacts> = {};
      if (s("incidentLocation")) p.incidentLocation = s("incidentLocation");
      if (s("eventDate")) {
        if (f.events.length === 0) p.events = [{ date: s("eventDate"), what: s("eventWhat") || shortStory(f.incidentSummary) || "Care was received" }];
        else p.events = f.events.map((e) => (blank(e.date) ? { ...e, date: s("eventDate") } : e));
      }
      return p;
    }
    case "contact": {
      const p: Partial<CaseFacts> = {};
      for (const k of ["title", "lastName", "address", "postcode", "phone", "email"] as const) if (s(k)) p[k] = s(k);
      return p;
    }
    case "outcome": {
      if (answer.none === true) return { desiredOutcome: "" };
      const chosen = Array.isArray(answer.chosen) ? answer.chosen : [];
      return { desiredOutcome: outcomeSentence(chosen, s("other")) };
    }
    default:
      return {};
  }
}

/** The first sentence of the story, cut to a timeline-sized line: used as the event's description so the person is not asked what happened twice. */
export function shortStory(summary: string | null | undefined): string {
  const t = (summary ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const first = t.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? t;
  return first.length <= 140 ? first : first.slice(0, 137).trimEnd() + "...";
}

/** The line shown in the chat as the user's own message after they use a widget. */
export function echoFor(target: Target, patch: Partial<CaseFacts>): string {
  switch (target) {
    case "who":
      return patch.complainingFor === "someone_else" ? "Someone else's care" : "My own care";
    case "contactMethod":
      return patch.preferredContact === "Phone Call" ? "Phone call" : (patch.preferredContact ?? "");
    case "emailRisk":
      return patch.emailRiskAccepted ? "Yes, email is fine" : "No, I would rather not";
    case "details": {
      const bits: string[] = [];
      if (patch.events?.[0]?.date) bits.push(`When: ${patch.events[0].date}`);
      if (patch.events?.[0]?.what && patch.events[0].what !== "Care was received") bits.push(`What: ${patch.events[0].what}`);
      if (patch.incidentLocation) bits.push(`Where: ${patch.incidentLocation}`);
      return bits.join("\n");
    }
    case "contact": {
      const bits: string[] = [];
      if (patch.lastName) bits.push(`Last name: ${patch.lastName}`);
      if (patch.address) bits.push(`Address: ${patch.address}`);
      if (patch.postcode) bits.push(`Postcode: ${patch.postcode}`);
      if (patch.phone) bits.push(`Telephone: ${patch.phone}`);
      if (patch.email) bits.push(`Email: ${patch.email}`);
      return bits.join("\n");
    }
    case "outcome":
      return patch.desiredOutcome ? patch.desiredOutcome : "Nothing to add";
    default:
      return "";
  }
}

/**
 * Reads a first name from a one-word reply such as "Ailsa" or "I'm Ailsa". Returns null for anything
 * else (a full name, a sentence, digits), which then goes to the model.
 */
export function parseName(text: string): string | null {
  const t = text
    .trim()
    .replace(/^(hi|hello|hey)[,!.\s]+/i, "")
    .replace(/^(my name is|my name's|i am|i'm|im|call me|it is|it's|this is)\s+/i, "")
    .replace(/[.!]+$/, "")
    .trim();
  if (/^(hi|hello|hey|yes|no|ok|okay|sure|thanks|thank|please)$/i.test(t)) return null;
  return /^[\p{L}][\p{L}'’-]*$/u.test(t) && t.length <= 40 ? t : null;
}
