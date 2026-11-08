import type { Page } from "playwright";
import type { FormField } from "./enquiryTypes";

/**
 * When may an enquiry be called "filled and ready" (Codex round 5, blocker 2)?
 * An empty enquiry was once reported "filled and ready" (Enable Law: filled [], fields []). Now `ready_to_send` needs ALL of:
 *   (a) the enquiry form is verified on the page: it has fields we can read, and at least one is a message or contact box;
 *   (b) every message/contact box the form asks for holds, read back from the DOM, the value we meant to put there
 *       (code compares; no model ever sees the values), and at least one such box is filled;
 *   (c) the final control (the Send button) is identified on the page, and the page is still the form (nothing pressed);
 *   (d) no required field is still empty.
 * Otherwise an honest status with the reason: `could_not_fill` (nothing was filled, or no recognisable fields),
 * `needs_input` (a required field we have no value for), or `partial` (some filled, something not verified).
 * Pure functions plus one page read; no model.
 */

export type Slot = "message" | "email" | "phone" | "first" | "last" | "full" | "subject" | "postcode";
export type Expect = Partial<Record<Slot, string>>;
/** Boxes that must be filled when the form asks for them and we have a value. Phone, subject and postcode may stay empty. */
const CORE: Slot[] = ["message", "email", "first", "last", "full"];

/** Which of our values a form box is for, from its label and name alone. Null: not a box we verify. */
export function classifyField(f: { name: string; label: string; kind: string }): Slot | null {
  if (f.kind === "select") return null;
  const t = `${f.name} ${f.label}`.toLowerCase().replace(/\s+/g, " ");
  if (/post ?code|zip|\bplz\b|postal/.test(t)) return "postcode";
  if (/e-?mail|courriel|correo/.test(t)) return "email";
  if (/phone|telephone|mobile|\btel\b|telefon|téléphone|teléfono|cell/.test(t)) return "phone";
  if (/first[ _-]?name|forename|given name|vorname|prénom|prenom/.test(t)) return "first";
  if (/last[ _-]?name|surname|family name|nachname|nom de famille|apellido/.test(t)) return "last";
  if (/subject|betreff|\btopic\b|\bobjet\b/.test(t)) return "subject";
  if (f.kind === "textarea" || /message|enquiry|inquiry|how can we help|nachricht|tell us|your case|details/.test(t)) return "message";
  if (/(^|[^a-z])(full |your )?name([^a-z]|$)/.test(t) && !/company|firm|organi[sz]ation|business|user ?name/.test(t)) return "full";
  return null;
}

const squash = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
/** The DOM holds what we meant to type: same letters and digits (masks add spaces; maxlength may cut a long text). */
export const sameValue = (got: string, want: string) => {
  const g = squash(got), w = squash(want);
  return g === w || (g.length >= 20 && w.startsWith(g)) || (w.length > 0 && g.replace(/^0+/, "") === w.replace(/^0+/, ""));
};

export type ReadyInput = {
  fields: Pick<FormField, "name" | "label" | "value" | "kind" | "required">[];
  expect: Expect;
  /** Label of the identified Send control, or null when none was found. */
  finalControl: string | null;
  /** The page is still the unsent form (it shows no confirmation and the form is still there). */
  stillOnForm: boolean;
  /** Required fields still empty (consent boxes excluded by the caller). */
  missingRequired: string[];
};
export type ReadyVerdict = {
  status: "ready_to_send" | "needs_input" | "partial" | "could_not_fill";
  /** One plain sentence, no values. */
  reason: string;
  verified: string[];
  problems: string[];
};

export function assessForm(i: ReadyInput): ReadyVerdict {
  const verified: string[] = [];
  const problems: string[] = [];
  const asked = i.fields.map((f) => ({ f, slot: classifyField(f) })).filter((x): x is { f: (typeof i.fields)[number]; slot: Slot } => !!x.slot);
  const anyValue = i.fields.some((f) => f.value.trim());

  if (i.fields.length === 0) return { status: "could_not_fill", reason: "We found a page for their enquiry, but no box on it that we could read or fill.", verified, problems: ["no fields"] };
  if (asked.length === 0) return { status: "could_not_fill", reason: "None of the boxes on their form looked like a message or contact detail, so nothing was filled in.", verified, problems: ["no recognisable message or contact box"] };

  for (const { f, slot } of asked) {
    const want = i.expect[slot];
    if (!want) continue; // we hold no value for this box; a required one is reported as missing below
    const label = f.label.replace(/\s+/g, " ").trim().slice(0, 50) || f.name;
    if (!f.value.trim()) {
      if (CORE.includes(slot) || f.required) problems.push(`"${label}" is empty`);
    } else if (sameValue(f.value, want)) verified.push(label);
    else problems.push(`"${label}" does not hold what we meant to put there`);
  }
  const hasMessageBox = asked.some((a) => a.slot === "message");
  const messageOk = !hasMessageBox || !i.expect.message || asked.some((a) => a.slot === "message" && !!a.f.value.trim() && sameValue(a.f.value, i.expect.message!));

  if (verified.length === 0) {
    return { status: "could_not_fill", reason: anyValue ? "Nothing we meant to enter could be read back from their form, so we do not treat it as filled." : "Their form is still empty: nothing was filled in.", verified, problems };
  }
  if (!messageOk) problems.push("the message box does not hold our message");
  // A required box we HOLD a value for but that stayed empty is our failure to fill it (partial), not something only the user has.
  const norm = (l: string) => squash(l);
  const ours = (l: string) => { const fld = i.fields.find((x) => norm(x.label) === norm(l) || (x.name && norm(x.name) === norm(l))); const slot = fld && classifyField(fld); return !!slot && !!i.expect[slot]; };
  const theirs = i.missingRequired.filter((l) => !ours(l));
  if (theirs.length) {
    return { status: "needs_input", reason: `Their form asks for ${theirs.join(", ")}, which we do not have.`, verified, problems };
  }
  if (!i.stillOnForm) problems.push("the page no longer shows the unsent form");
  if (!i.finalControl) problems.push("we could not identify their Send button");
  if (problems.length) return { status: "partial", reason: `Only partly filled: ${problems.slice(0, 3).join("; ")}.`, verified, problems };
  return { status: "ready_to_send", reason: `Filled and read back (${verified.length} box${verified.length === 1 ? "" : "es"}); their Send button "${i.finalControl}" found and left unpressed.`, verified, problems };
}

/** The values we mean to type, by slot, from the saved values (key -> value). */
export function expectFrom(values: { key: string; value: string }[]): Expect {
  const by = new Map(values.map((v) => [v.key, v.value]));
  const slots: [Slot, string][] = [["message", "message"], ["email", "email"], ["phone", "phone"], ["first", "first_name"], ["last", "last_name"], ["full", "full_name"], ["subject", "subject"], ["postcode", "postcode"]];
  const out: Expect = {};
  for (const [slot, key] of slots) { const v = (by.get(key) ?? "").trim(); if (v) out[slot] = v; }
  return out;
}

/** The label of the control that would send this form: a visible submit input/button, or a button that says so. Never clicked. */
export async function findFinalControl(page: Page): Promise<string | null> {
  return page
    .evaluate(() => {
      const vis = (e: Element) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none"; };
      const label = (e: Element) => ((e as HTMLInputElement).value && e.tagName === "INPUT" ? (e as HTMLInputElement).value : (e as HTMLElement).innerText || e.getAttribute("aria-label") || e.getAttribute("title") || "").replace(/\s+/g, " ").trim();
      const SENDISH = /send|submit|enquir|inquir|request|call ?back|contact|get in touch|ask|book|absend|senden|envoy|enviar|invia|verzend|skicka/i;
      const all = Array.from(document.querySelectorAll<HTMLElement>('button, input[type=submit], input[type=button], input[type=image], [role=button]')).filter(vis);
      const named = all.find((e) => SENDISH.test(label(e)));
      if (named) return label(named) || "Send";
      const sub = all.find((e) => (e.tagName === "BUTTON" && ((e as HTMLButtonElement).type || "submit") === "submit" && !!e.closest("form")) || ((e as HTMLInputElement).type === "submit" || (e as HTMLInputElement).type === "image"));
      return sub ? label(sub) || "Send" : null;
    })
    .catch(() => null);
}

/** Does the page still show the unsent form (no "thank you" page, its message box still there)? */
export async function stillOnUnsentForm(page: Page): Promise<boolean> {
  return page
    .evaluate(() => {
      const t = (document.body?.innerText ?? "").replace(/\s+/g, " ");
      const sent = /\b(thank you for (?:your )?(?:enquiry|inquiry|message|contacting)|your (?:enquiry|message) has been (?:sent|received|submitted)|has been sent)\b/i.test(t);
      return !sent && !!document.querySelector("textarea, input[type=email], input[type=text]");
    })
    .catch(() => false);
}
