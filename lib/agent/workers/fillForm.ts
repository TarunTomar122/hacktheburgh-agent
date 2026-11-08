import type { Page } from "playwright";
import { pointAt } from "../../agentCursor";
import { dismissCookies } from "../../browser";
import { decide, type DAnswer, type DQuestion } from "../decisions";
import { ANY_PLACEHOLDER, labelDuplicates, matchOption, redactObservation, runDecisionAgent } from "../decisionAgent";
import { formatObservation, observe, PLACEHOLDER, type El, type Observation } from "../observe";
import type { Value, Wall, WorkerCtx } from "./types";

/**
 * fill_form (Kit): fill ANY form, on any site, in any country, across as many pages as it has, and stop before the
 * final Submit/Send. Nothing here knows a site: every judgement is made live from the page (code signals first, the
 * Decisions API second, and "stop" whenever the two disagree or either is unsure).
 *
 *   page loop:  walls (login / CAPTCHA / bot check / payment)  ->  what page is this (landing, form, review)?
 *               -> landing: go through "Start now"      -> review ("check your answers"): stop, report the final button
 *               -> form: fill (model picks KEYS, code types VALUES; conditional questions re-observed), consent boxes
 *                  left for the user, missing required fields asked one by one, then: final button? stop. Otherwise
 *                  "Next", and if the page answers with validation errors, read them, fix the fields, retry once.
 *
 * Privacy: the model sees value keys and descriptions only. Typed text is masked and any value that the page echoes
 * back (a review page) is replaced by its key before the model sees it (decisionAgent `hideValues`).
 */

export type FilledPage = { url: string; title: string; filled: { label: string; value: string }[]; verified: boolean };
export type FillFormResult = {
  status: "ready_to_submit" | "needs_input" | "blocked" | "failed";
  pages: FilledPage[];
  unfilled: string[];
  consents: string[];
  finalSubmitLabel?: string;
  wall?: Wall;
  summary: string;
};
export type FillFormOpts = { goal: string; values: Value[]; maxPages?: number; allowConsent?: (label: string) => boolean };

/* ------------------------------------------------------------------ generic language of forms (no site knowledge) */

/** Word-start / word-end that also works for accented letters. */
const words = (alts: string, end = true) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts})${end ? "(?![\\p{L}\\p{N}])" : ""}`, "iu");
/** A button that sends the form for good. Stems on purpose ("submission", "payment", "confirmation" all count): when unsure, stop. */
export const FINAL_RE = words(
  "submit|send|confirm|pay|finish|complete|lodge|file (?:my|the|this|your)|place (?:the )?order|apply(?![\\p{L}])|sign and|declare and|" +
    "absend|abschick|einreich|senden|bestätig|envoy|soumet|soumettre|valider|confirmer|enviar|confirmar|finalizar|invia|conferm|verzend|verstuur|bevestig|indsend|skicka|send inn|lähetä|wyślij|potwierdź|odeslat|odoslať|trimite|küldés|gönder|送信|提交",
  false,
);
/** A button that moves to the next page without sending anything. */
export const NEXT_RE = words(
  "next|continue|save and continue|save & continue|proceed|start|start now|begin|get started|go on|forward|" +
    "weiter|nächste|fortfahren|suivant|continuer|siguiente|continuar|avanti|continua|prossimo|volgende|verder|doorgaan|nästa|fortsätt|neste|fortsett|næste|fortsæt|seuraava|jatka|dalej|następn|další|pokračovat|próximo|seguinte|tovább|devam|次へ|下一步",
  false,
);
/** Never click these to move forward: they save drafts (often behind a login), go back, leave, or are cookie banners. */
const AVOID_RE = /save (?:for|and (?:come back|return|finish|exit|close)|as draft|draft|progress)|later|resume|sign ?in|log ?in|sign ?up|register|create (?:an )?account|cancel|^back\b|go back|previous|^prev\b|zurück|retour|précédent|atrás|anterior|indietro|terug|tillbaka|reset|clear|delete|remove|print|download|upload|browse|add another|search|help|skip to|cookie|language|^(?:accept|reject|decline|allow|deny|manage)\b.*|^×$|^close$/i;
/** "Check your answers" pages, in several languages. */
const REVIEW_RE = /check (?:your|the) (?:answers|details|complaint|application|information|form)|review (?:your|the|and)|summary of (?:your|the)|confirm (?:your )?(?:answers|details)|before you (?:submit|send)|überprüf|zusammenfassung|récapitulatif|vérifi(?:ez|er) vos|revis(?:e|a|ar) (?:sus|tus|los|su|tu)|resumen de|riepilogo|controlla (?:i|le)|controleer|sammanfattning|granska|tarkista/i;
const CHANGE_RE = /^(?:change|edit|modify|amend|ändern|bearbeiten|modifier|cambiar|editar|modifica|wijzig|ändra|muokkaa|zmień)\b/i;
/** Consent, declaration and terms boxes. Never ticked unless the caller's allowConsent says so. */
export const CONSENT_RE = /(?<![\p{L}])(?:agree|consent|accept|acknowledg|understand|confirm|declare|certify|authori[sz]|give (?:my )?permission|privacy|terms (?:and|&) conditions|terms of (?:use|service)|data protection|gdpr|true (?:and|&) (?:correct|accurate|complete)|best of my knowledge|(?:have|i've) read|einverstanden|zustimm|datenschutz|akzeptier|bestätige|j'accepte|consens|accepte|acepto|consiento|autorizo|privacidad|accetto|acconsento|akkoord|godkänn|samtycke|hyväksy|zgadzam|souhlasím)/iu;
const REQUIRED_HINT = /\(required\)|\brequired\b|\bmandatory\b|pflicht|obligatoire|obligatorio|obbligatori|verplicht|obligatorisk|pakollinen|wymagane/i;
const STEPPER_RE = /(?:step|page|stage|part|section|question|schritt|seite|étape|paso|página|passo|pagina|stap|steg|vaihe|krok|krok)\s*(\d{1,2})\s*(?:of|\/|von|sur|de|di|van|av|af|z|ze|из)\s*(\d{1,2})/iu;

const fillable = (e: El) => !e.disabled && (e.kind === "text" || e.kind === "textarea" || e.kind === "select" || e.kind === "radio" || e.kind === "checkbox");
const isEmpty = (e: El) => {
  const v = e.value.trim();
  return v === "" || (e.kind === "select" && (PLACEHOLDER.test(v) || ANY_PLACEHOLDER.test(v)));
};
const isRequired = (e: El) => e.required || REQUIRED_HINT.test(e.label) || REQUIRED_HINT.test(e.group);
const cleanLabel = (s: string) => s.replace(/\s+/g, " ").replace(/\s*\*\s*$/, "").replace(/^\s*\*\s*/, "").trim();
const short = (s: string, n = 60) => (s.length > n ? s.slice(0, n - 1) + "…" : s);
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 160);

/** Checkboxes that are answers to a question ("Which services? [ ] GP [ ] A&E"), not a consent of their own. */
function optionCheckboxes(obs: Observation): Set<string> {
  const byName = new Map<string, number>();
  const byGroup = new Map<string, number>();
  for (const e of obs.elements) if (e.kind === "checkbox") {
    byName.set(e.name, (byName.get(e.name) ?? 0) + 1);
    if (e.group) byGroup.set(e.group, (byGroup.get(e.group) ?? 0) + 1);
  }
  const out = new Set<string>();
  // In a group, a box is an answer ("Learning disability (… affects the way you understand …)") unless it speaks as the user: "I agree…", "We consent…".
  const speaks = /^\s*(?:i|we|yes,? i)\b|^\s*(?:agree|accept|consent|confirm|declare)/i;
  for (const e of obs.elements) if (e.kind === "checkbox" && !speaks.test(e.label) && ((byName.get(e.name) ?? 0) >= 2 || (e.group && (byGroup.get(e.group) ?? 0) >= 2))) out.add(`${e.name}|${e.label}`);
  return out;
}
const isConsent = (e: { kind: string; label: string; name: string }, options: Set<string>) =>
  e.kind === "checkbox" && !options.has(`${e.name}|${e.label}`) && (CONSENT_RE.test(e.label) || isRequired(e as El));

/* ------------------------------------------------------------------ values: derived parts, format fixes */

type ParsedDate = { y: number; m: number; d: number };
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
function parseDate(s: string): ParsedDate | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (m) return +m[2] > 12 ? ok(+m[3], +m[1], +m[2]) : ok(+m[3], +m[2], +m[1]); // day first unless impossible
  m = t.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)\.?,?\s+(\d{4})$/i);
  if (m) return ok(+m[3], monthOf(m[2]), +m[1]);
  m = t.match(/^([a-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i);
  if (m) return ok(+m[3], monthOf(m[1]), +m[2]);
  return null;
  function monthOf(w: string) { return MONTHS.findIndex((x) => x.startsWith(w.toLowerCase().slice(0, 3))) + 1; }
  function ok(y: number, mo: number, d: number) { return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && y > 1800 ? { y, m: mo, d } : null; }
}
const pad = (n: number) => String(n).padStart(2, "0");

/** A date value also offered as day / month / year, for forms that split dates into three boxes. */
function deriveValues(values: Value[]): Value[] {
  const out: Value[] = [];
  for (const v of values) {
    const d = parseDate(v.value);
    if (!d) continue;
    out.push(
      { key: `${v.key}.day`, description: `Day of the month only (1-31) of: ${v.description}`, value: String(d.d) },
      { key: `${v.key}.month`, description: `Month number only (1-12) of: ${v.description}`, value: String(d.m) },
      { key: `${v.key}.year`, description: `Year only (4 digits) of: ${v.description}`, value: String(d.y) },
    );
  }
  return out;
}

/** Rewrite a value the way the field (its hint, placeholder, error message or input type) asks. Null when no rule applies. */
export function fixValue(value: string, hint: string, inputType = ""): string | null {
  const d = parseDate(value);
  if (d) {
    if (inputType === "date") return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
    const f = hint.match(/\b(dd|mm|yyyy)([/.\- ])(dd|mm|yyyy)\2(dd|mm|yyyy)\b/i);
    if (f) {
      const part = (p: string) => (/^dd$/i.test(p) ? pad(d.d) : /^mm$/i.test(p) ? pad(d.m) : String(d.y));
      return [f[1], f[3], f[4]].map(part).join(f[2]);
    }
    const ex = hint.match(/\b(\d{1,2})([/.\-])(\d{1,2})\2(\d{4})\b/); // "for example, 27/3/2007"
    if (ex) return +ex[3] > 12 ? [pad(d.m), pad(d.d), d.y].join(ex[2]) : [pad(d.d), pad(d.m), d.y].join(ex[2]);
    if (/\bdate\b/i.test(hint)) return `${pad(d.d)}/${pad(d.m)}/${d.y}`;
  }
  if (/number|digit|numeric|phone|telephone|mobile|ziffer|telefon|nummer|chiffre|téléphone|dígito|teléfono|número|cifr|numer/i.test(hint) && /\d/.test(value) && /[^\d]/.test(value)) {
    const digits = value.replace(/[^\d+]/g, "");
    return /only|digits|numeric|numbers|without|\+|nur|ziffern|ohne|uniquement|sans|solo|sólo|sin|alleen|endast|tylko/i.test(hint) ? digits.replace(/\+/g, "") : digits;
  }
  if (/capital|upper ?case|postcode|post code|zip/i.test(hint) && value !== value.toUpperCase()) return value.toUpperCase().replace(/\s+/g, " ").trim();
  return null;
}

/* ------------------------------------------------------------------ page scan (code signals) */

type Scan = {
  login: boolean; loginDetail: string; sideLogins: number;
  captcha: boolean; captchaDetail: string;
  botCheck: boolean;
  payment: boolean; paymentDetail: string;
  fields: number;
  stepper: { n: number; total: number } | null;
  iframeForms: string[];
};

/** Walls, side login boxes (hidden from the model so it never types into them), steppers and forms inside iframes. */
async function scanPage(page: Page): Promise<Scan> {
  const s = await page.evaluate(({ nextSrc }) => {
    const nextRe = new RegExp(nextSrc, "iu");
    const vis = (e: Element) => {
      const r = e.getBoundingClientRect();
      const st = getComputedStyle(e);
      return r.width > 2 && r.height > 2 && st.visibility !== "hidden" && st.display !== "none" && parseFloat(st.opacity) > 0.05;
    };
    const FIELD = "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]):not([type=reset]):not([type=search]), select, textarea";
    const fields = Array.from(document.querySelectorAll<HTMLInputElement>(FIELD)).filter((e) => vis(e) && !e.closest("header, nav, footer, [role=navigation], [role=banner]"));
    // Login boxes: the largest box around a password field that holds at most 4 fields.
    const pw = fields.filter((e) => e.type === "password");
    const boxes: Element[] = [];
    const BUTTON = "button, input[type=submit], input[type=button], input[type=image], [role=button]";
    for (const p of pw) {
      // The sign-in box: the password's own small <form>, else the largest box around it with at most 4 fields and 1 button.
      const own = p.form && p.form.querySelectorAll(FIELD).length <= 4 && p.form.querySelectorAll(BUTTON).length <= 2 ? p.form : null;
      let box: Element = own ?? p;
      if (!own) for (let a = p.parentElement; a && a !== document.body; a = a.parentElement) {
        if (a.querySelectorAll(FIELD).length > 4 || a.querySelectorAll(BUTTON).length > 1) break;
        box = a;
      }
      boxes.push(box);
    }
    const others = fields.filter((e) => !boxes.some((b) => b.contains(e)) && e.type !== "checkbox");
    // A way forward that is not the sign-in ("Next", "Start a new complaint") makes the password box a side door, not a wall.
    const outsideForward = Array.from(document.querySelectorAll<HTMLElement>("button, input[type=submit], input[type=button], a[href], [role=button]"))
      .filter((b) => vis(b) && !boxes.some((x) => x.contains(b)) && !b.closest("header, nav, footer"))
      .some((b) => { const t = ((b as HTMLInputElement).value && b.tagName === "INPUT" ? (b as HTMLInputElement).value : b.innerText || "").trim(); return t.length < 60 && nextRe.test(t) && !/sign|log ?in|register|account|password/i.test(t); });
    const login = pw.length > 0 && others.length < 2 && !outsideForward;
    let sideLogins = 0;
    if (pw.length && !login) for (const b of boxes) { b.setAttribute("aria-hidden", "true"); b.setAttribute("data-ff-side-login", "1"); sideLogins++; }

    const frames = Array.from(document.querySelectorAll("iframe")).filter(vis);
    const capFrame = frames.find((f) => /captcha|turnstile|challenge/i.test(`${f.src} ${f.title}`) && !/size=invisible/.test(f.src) && !f.closest(".grecaptcha-badge"));
    const capEl = Array.from(document.querySelectorAll('[class*="captcha" i], [id*="captcha" i], .cf-turnstile, [data-sitekey]')).find((e) => vis(e) && !e.closest(".grecaptcha-badge") && !(e as HTMLElement).dataset.size?.includes("invisible"));
    const body = (document.body?.innerText ?? "").slice(0, 5000);
    const botCheck = /verify (?:that )?you are (?:a )?human|checking (?:if the site connection is secure|your browser)|are you a robot|unusual traffic|just a moment\.{0,3}$|enable javascript and cookies to continue|access denied/im.test(body) && fields.length < 2;
    const pay = fields.find((e) => /^cc-/.test(e.autocomplete || "") || /card.?number|cardnumber|\bcvv\b|\bcvc\b|security code|name on card|expiry|expiration/i.test(`${e.name} ${e.id} ${e.placeholder} ${e.getAttribute("aria-label") ?? ""} ${e.labels?.[0]?.textContent ?? ""}`));
    const payFrame = frames.find((f) => /stripe|paypal|braintree|adyen|worldpay|squareup|checkout\.com|card/i.test(`${f.src} ${f.title}`));
    // Stepper from the DOM: aria-current="step" inside a list.
    let stepper: { n: number; total: number } | null = null;
    const cur = document.querySelector('[aria-current="step"]');
    const li = cur?.closest("li");
    if (li?.parentElement) {
      const items = Array.from(li.parentElement.children).filter((x) => x.tagName === "LI");
      if (items.length >= 2) stepper = { n: items.indexOf(li) + 1, total: items.length };
    }
    const iframeForms: string[] = [];
    for (const f of frames) {
      try {
        const n = f.contentDocument?.querySelectorAll(FIELD).length ?? 0;
        if (n >= 2) iframeForms.push(f.src);
      } catch {
        if (f.src && /form|survey|feedback|complain|contact/i.test(f.src) && f.getBoundingClientRect().height > 250) iframeForms.push(f.src); // cross-origin: judge by its size and address
      }
    }
    return {
      login, loginDetail: login ? "A password box is the only way in (sign-in or create an account)" : "", sideLogins,
      captcha: !!(capFrame || capEl), captchaDetail: capFrame ? `CAPTCHA widget (${capFrame.title || "iframe"})` : capEl ? "CAPTCHA widget" : "",
      botCheck,
      payment: !!(pay || payFrame), paymentDetail: pay ? "Card payment fields" : payFrame ? "Payment widget" : "",
      fields: fields.length, stepper, iframeForms,
    };
  }, { nextSrc: NEXT_RE.source });
  return s;
}

function stepperOf(obs: Observation, scan: Scan): { n: number; total: number } | null {
  const m = `${obs.headings.join(" ")} ${obs.text.slice(0, 600)}`.match(STEPPER_RE);
  if (m && +m[2] >= 2 && +m[1] <= +m[2]) return { n: +m[1], total: +m[2] };
  return scan.stepper;
}

/* ------------------------------------------------------------------ errors after "Next" */

type FieldError = { name: string; label: string; message: string; empty: boolean; type: string; placeholder: string };
async function readErrors(page: Page): Promise<{ summary: string[]; fields: FieldError[] }> {
  return page.evaluate(() => {
    const t = (n: Element | null | undefined) => (n?.textContent ?? "").replace(/\s+/g, " ").trim();
    const vis = (e: Element) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    const FIELDS = "input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea";
    // Error blocks: the usual summary patterns, plus any visible error-classed block that holds no field (outermost only).
    const cands = Array.from(document.querySelectorAll('[role=alert], [class*="error-summary" i], [class*="errorsummary" i], [class*="validation-summary" i], [class*="alert-danger" i], [class*="form-errors" i], [class*="error" i], [class*="invalid" i], [class*="warning" i][class*="form" i]'))
      .filter((e) => vis(e) && !e.matches(FIELDS) && !e.querySelector(FIELDS) && !e.closest("header, nav, footer, [data-ff-side-login]") && t(e).length > 3 && t(e).length < 600);
    const summaryEls = cands.filter((e) => !cands.some((o) => o !== e && o.contains(e)));
    const summary = [...new Set(summaryEls.map(t))].slice(0, 6);
    const FIELD = "input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea";
    const bad = new Set<HTMLInputElement>();
    for (const a of summaryEls.flatMap((s) => Array.from(s.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')))) {
      const id = decodeURIComponent(a.getAttribute("href")!.slice(1));
      const target = id ? document.getElementById(id) : null;
      const f = target?.matches(FIELD) ? target : target?.querySelector(FIELD);
      if (f) bad.add(f as HTMLInputElement);
    }
    for (const f of Array.from(document.querySelectorAll<HTMLInputElement>(FIELD))) {
      const choice = f.type === "radio" || f.type === "checkbox";
      if (!vis(f) && !(choice && f.labels?.[0] && vis(f.labels[0]))) continue;
      if (f.closest("[data-ff-side-login]")) continue;
      if (f.getAttribute("aria-invalid") === "true" || f.matches(":invalid") || f.closest('[class*="error" i]:not(form):not(body), [class*="invalid" i]:not(form):not(body), .has-error')) bad.add(f);
    }
    const out: { name: string; label: string; message: string; empty: boolean; type: string; placeholder: string }[] = [];
    const seen = new Set<string>();
    for (const f of bad) {
      const name = f.name || f.id || "";
      if (seen.has(name)) continue;
      seen.add(name);
      const desc = (f.getAttribute("aria-describedby") ?? "").split(/\s+/).map((i) => t(document.getElementById(i))).filter(Boolean).join(" ");
      const group = f.closest('[class*="error" i]:not(form):not(body), .has-error, fieldset, .form-group, .field');
      const inline = t(group?.querySelector('[class*="error" i]:not(input):not(select):not(textarea), [class*="invalid-feedback" i], [role=alert]'));
      const label = t(f.labels?.[0]) || f.getAttribute("aria-label") || t(f.closest("fieldset")?.querySelector("legend")) || f.placeholder || name;
      const empty = f.type === "radio" || f.type === "checkbox"
        ? !Array.from(document.querySelectorAll<HTMLInputElement>(`input[name="${CSS.escape(f.name)}"]`)).some((x) => x.checked)
        : !(f.value ?? "").trim();
      out.push({ name, label: label.slice(0, 140), message: (desc || inline || f.validationMessage || "").slice(0, 240), empty, type: f.type, placeholder: f.placeholder ?? "" });
    }
    return { summary, fields: out.slice(0, 12) };
  });
}

/* ------------------------------------------------------------------ the worker */

export async function fillForm(ctx: WorkerCtx, opts: FillFormOpts): Promise<FillFormResult> {
  const { page, note } = ctx;
  const maxPages = opts.maxPages ?? 10;
  const values: Value[] = opts.values.filter((v) => v.value.trim());
  values.push(...deriveValues(values));
  const keyOf = new Map<string, string>(); // field identity (its DOM name, else its label) -> the value key the model put there
  const naming: Promise<unknown>[] = []; // field identities being read from the DOM for this page's actions
  const variants: Value[] = []; // reformatted values (a date as DD/MM/YYYY): also hidden from the model when a page echoes them
  let expected = new Map<string, { label: string; want: string }>(); // this page: field identity -> the text code typed (read back before leaving)
  const pages: FilledPage[] = [];
  const consents = new Set<string>();
  const unfilled: string[] = [];
  const asked = new Set<string>();
  const visits = new Map<string, number>();
  let pageNo = 0;
  let lastClicked = "";
  let stuckWhy = "";

  const log = (kind: Parameters<WorkerCtx["note"]["log"]>[0], text: string, extra?: Parameters<WorkerCtx["note"]["log"]>[2]) => note.log(kind, text, extra).catch(() => {});
  const done = async (r: Omit<FillFormResult, "pages" | "consents" | "unfilled"> & { unfilled?: string[] }): Promise<FillFormResult> => {
    const out: FillFormResult = { ...r, pages, consents: [...consents], unfilled: [...new Set(r.unfilled ?? unfilled)] };
    await log(r.status === "ready_to_submit" ? "check" : "recover", r.summary, { shot: true, detail: out.unfilled.length ? `Still needed: ${out.unfilled.join("; ")}` : out.consents.length ? `Left for you to tick: ${out.consents.join("; ")}` : undefined });
    note(r.status === "ready_to_submit" ? `Stopped before "${r.finalSubmitLabel ?? "Submit"}"` : r.status === "needs_input" ? "Needs an answer from you" : r.status === "blocked" ? `Stopped: ${r.wall?.kind ?? "wall"}` : "Could not finish the form");
    return out;
  };

  try {
    await dismissCookies(page, 1500);
    for (; pageNo < maxPages; pageNo++) {
      await settle(page);
      let scan = await scanPage(page);
      if (scan.botCheck) {
        note("Waiting for the site's bot check");
        await page.waitForTimeout(8000);
        await settle(page);
        scan = await scanPage(page);
        if (scan.botCheck) return done({ status: "blocked", wall: { kind: "bot_check", detail: "The site shows a human-verification page", url: page.url() }, summary: "The site asks to verify a human before showing the form. Handing over to you." });
      }
      if (scan.login) return done({ status: "blocked", wall: { kind: "login", detail: scan.loginDetail, url: page.url() }, summary: "The form needs you to sign in or create an account. Handing over to you; nothing was typed." });
      if (scan.payment) return done({ status: "blocked", wall: { kind: "payment", detail: scan.paymentDetail, url: page.url() }, summary: "The form asks for a payment. Stopped; payments are yours to make." });
      if (scan.sideLogins) await log("check", `Left the "sign in to resume" box alone (${scan.sideLogins}); filling the form as a new complaint`);

      let obs = await observe(page);
      const sig = pageSig(obs);
      visits.set(sig, (visits.get(sig) ?? 0) + 1);
      if ((visits.get(sig) ?? 0) > 2) return done({ status: "failed", wall: { kind: "dead_end", detail: "The form keeps returning to the same page", url: page.url() }, summary: "The form keeps coming back to the same page; stopped so it does not loop." });

      // A form inside a frame: open the frame's own address, where every field can be reached.
      if (!obs.elements.some(fillable) && scan.iframeForms.length) {
        await log("recover", "The form sits inside a frame; opening it on its own page", { url: scan.iframeForms[0] });
        await page.goto(scan.iframeForms[0], { waitUntil: "domcontentloaded" });
        continue;
      }
      if (scan.captcha && !obs.elements.some(fillable)) return done({ status: "blocked", wall: { kind: "captcha", detail: scan.captchaDetail, url: page.url() }, summary: "A CAPTCHA stands before the form. Handing over to you; it is never bypassed." });

      const options = optionCheckboxes(obs);
      const view = await classify(page, obs, opts.goal, [...values, ...variants], options, scan);
      const where = `${view.kind === "form" || view.kind === "review" ? `Page ${pages.length + 1}` : "This page"}${obs.headings[0] ? `: "${short(obs.headings[0])}"` : ""}`;
      await log("decide", `${where} looks like ${KIND_TEXT[view.kind]}${view.stepper ? ` (step ${view.stepper.n} of ${view.stepper.total})` : ""}`, {
        shot: true, confidence: view.confidence,
        detail: [view.forward ? `Way forward: "${view.forward.label}"${view.final ? ` (final: ${view.finalWhy})` : ""}` : "No way forward found", `Signals: ${view.why.join("; ")}`].join("\n"),
      });

      if (view.kind === "sent") return done({ status: "failed", summary: "This page says something was already sent. Stopped and touched nothing." });

      if (view.kind === "review") {
        note("Reached the check-your-answers page");
        await handleConsents(obs, options);
        pages.push(await readPage(page));
        return stopAtFinal(view, view.forward && FINAL_RE.test(view.forward.label) ? view.forward.label : undefined, "Reached the review page", scan);
      }

      if (view.kind !== "form" || !obs.elements.some((e) => fillable(e) && !isConsent(e, options))) {
        // Landing or information page: go through "Start now", never through a final button.
        if (!view.forward) return done({ status: "failed", wall: { kind: "not_found", detail: "No form and no way into one on this page", url: page.url() }, summary: "This page has no form and no button or link that leads into one." });
        if (view.final && !view.forwardIsPlainLink) {
          if (obs.elements.some(fillable)) await handleConsents(obs, options);
          pages.push(await readPage(page));
          return stopAtFinal(view, view.forward.label, "Nothing left to fill", scan);
        }
        const pending = await handleConsents(obs, options);
        if (pending.length) return done({ status: "needs_input", unfilled: [...unfilled, ...pending.map((p) => `Your agreement: ${p}`)], summary: `To start the form you must agree to: "${short(pending[0], 120)}". That is your decision.` });
        note(`Opening "${short(view.forward.label, 40)}"`);
        await clickForward(page, view.forward, "start");
        continue;
      }

      // A page of the form: fill it.
      note(`Filling ${where.toLowerCase()}`);
      const before = new Set(unfilled);
      const pending = await fillPage(obs, options);
      obs = await observe(page);
      const view2 = await refreshForward(page, obs, view, opts.goal, [...values, ...variants], options, scan);
      pages.push(await readPage(page));
      const missingHere = unfilled.filter((u) => !before.has(u));

      if (view2.final || !view2.forward) {
        if (!view2.forward && !(await finalControls(page)).length) return done({ status: missingHere.length || unfilled.length ? "needs_input" : "failed", wall: { kind: "dead_end", detail: "No button moves this form on", url: page.url() }, summary: "Filled this page but found no button that moves the form on." });
        return stopAtFinal(view2, view2.forward?.label, unfilled.length ? "Filled what we could" : "Filled the form", scan);
      }
      if (missingHere.length) return done({ status: "needs_input", summary: `Page ${pages.length} needs ${missingHere.length} answer${missingHere.length === 1 ? "" : "s"} we do not have; stopped before moving on.` });
      if (pending.length) return done({ status: "needs_input", unfilled: [...unfilled, ...pending.map((p) => `Your agreement: ${p}`)], summary: `Page ${pages.length} needs your agreement ("${short(pending[0], 100)}") before the form can move on. That box is yours to tick.` });
      if (scan.captcha) return done({ status: "blocked", wall: { kind: "captcha", detail: scan.captchaDetail, url: page.url() }, summary: "This page has a CAPTCHA before the next step. Filled what was there and handed over to you." });

      // The verdict again, on the live page, immediately before the click: never one from before the page was filled.
      const live = await liveForwardVerdict(page, view2.forward);
      if (!live.ok) {
        await log("check", `Not pressing "${short(view2.forward.label, 40)}": ${live.final}`);
        return stopAtFinal({ ...view2, final: true, finalWhy: live.final }, live.fwd?.label ?? view2.forward.label, unfilled.length ? "Filled what we could" : "Filled the form", scan);
      }
      // Move on, then check the page did not answer with validation errors.
      note(`Clicking "${short(live.fwd.label, 40)}"`);
      const sigBefore = fieldSig(obs);
      await clickForward(page, live.fwd, "next");
      const fixed = await recoverErrors(sigBefore, live.fwd);
      if (fixed === "stuck") return done({ status: "needs_input", summary: stuckWhy });
    }
    return done({ status: "failed", summary: `The form went on for more than ${maxPages} pages; stopped.` });
  } catch (e) {
    return done({ status: "failed", summary: `Stopped on an error: ${errMsg(e)}` });
  }

  /* ---------------------------------------------------------------- helpers that share the run's state */

  /**
   * The verifiable stopping point. ready_to_submit only when ALL hold: this is the intended form (model, with the
   * goal), every typed value was read back from the DOM, no required field is unresolved, and the final control is
   * identified on the page (submit inputs, buttons, links, and JavaScript controls with role=button or onclick).
   */
  async function stopAtFinal(view: View, label: string | undefined, what: string, scan: Scan): Promise<FillFormResult> {
    const controls = await finalControls(page);
    const finalLabel = label && FINAL_RE.test(label) ? label : controls[0] ?? label;
    const checks: string[] = [];
    if (view.intended < 0.3) checks.push(`This may not be the form the goal asks for (the page reads as unrelated, ${view.intended.toFixed(2)}). Please check it is the right one.`);
    if (!finalLabel) checks.push("Could not identify the final send button on this page.");
    else if (!controls.length && !FINAL_RE.test(finalLabel)) checks.push(`The last button reads "${finalLabel}"; it is not clearly a send button, so it was not pressed. Please check what it does.`);
    const verified = pages.every((p) => p.verified);
    await log("check", `Stopping point: ${[
      view.intended >= 0.3 ? "the intended form" : "form unconfirmed",
      verified ? "every typed value read back" : "some values did not stick",
      unfilled.length ? `${unfilled.length} required answer${unfilled.length === 1 ? "" : "s"} missing` : "no required field left",
      finalLabel ? `final control "${short(finalLabel, 40)}" found and NOT pressed` : "final control not found",
    ].join("; ")}`, { detail: controls.length ? `Send controls on the page: ${controls.join(" | ")}` : undefined });
    const status = unfilled.length || checks.length ? "needs_input" : "ready_to_submit";
    const cap = scan.captcha ? { wall: { kind: "captcha" as const, detail: `${scan.captchaDetail}: you solve it when you submit`, url: page.url() } } : {};
    return done({
      status, finalSubmitLabel: finalLabel, ...cap,
      unfilled: [...unfilled, ...checks],
      summary: `${what} and stopped before "${finalLabel ?? "the final button"}"${view.finalWhy ? ` (${view.finalWhy})` : ""}. Nothing was sent.${scan.captcha ? " It has a CAPTCHA for you to solve when you submit." : ""}${checks.length ? ` ${checks[0]}` : ""}`,
    });
  }

  async function fillPage(first: Observation, options: Set<string>): Promise<string[]> {
    let obs = first;
    let pending: string[] = [];
    await checkDefaults(first);
    for (let round = 0; round < 3; round++) {
      const emptyBefore = new Set(obs.elements.filter((e) => fillable(e) && isEmpty(e) && e.kind !== "checkbox").map((e) => `${e.name}|${e.label}`));
      const fixes: { label: string; key: string }[] = [];
      await runDecisionAgent({
        page,
        goal: `${opts.goal} Fill in the fields on this page from the saved values; leave a field empty when no saved value fits it. Buttons and consent boxes are handled separately.`,
        values,
        hideValues: true,
        allowCheckboxes: true, // only non-consent boxes reach the model (consents are filtered out below)
        allowSubmit: false,
        maxSteps: 8,
        ignore: (el) => el.kind === "submit" || el.kind === "button" || el.kind === "link" || isConsent(el, options),
        onEvent: (ev) => {
          if (ev.type !== "action") return;
          const a = ev.args as { label?: string; choice?: string; group?: string; confidence?: number };
          const label = cleanLabel(String(a.label ?? ""));
          ctx.track.bump("action");
          const failed = typeof ev.result === "string" && ev.result !== "ok";
          // The element's DOM name, read now while the engine's data-aid tag is still on it (two "First name" boxes stay apart).
          const id = (ev.args as { id?: number }).id;
          const named = (fn: (fid: string) => void) => naming.push(page.locator(`[data-aid="${id}"]`).evaluate((e) => (e as HTMLInputElement).name || e.id || "", undefined, { timeout: 2000 }).catch(() => "").then((n) => fn(n ? `n:${n}` : `l:${label.slice(0, 40)}`)));
          if (ev.tool === "fill" && a.choice) {
            const key = a.choice;
            const v = values.find((x) => x.key === key);
            named((fid) => { keyOf.set(fid, key); if (!failed && v) expected.set(fid, { label, want: v.value }); });
            if (failed) fixes.push({ label, key });
            void log(failed ? "recover" : "type", failed ? `Could not type ${a.choice} into "${short(label)}" as is; reformatting` : `Typed ${a.choice} into "${short(label)}"`, { confidence: a.confidence });
          } else if (ev.tool === "select") {
            const key = a.choice;
            if (key) named((fid) => keyOf.set(fid, key));
            void log("pick", failed ? `Could not match ${a.choice} to an option of "${short(label)}"` : `Picked ${a.choice} for "${short(label)}"`, { confidence: a.confidence });
          } else if (ev.tool === "check") {
            void log(a.group ? "pick" : "check", a.group ? `Chose "${short(label, 40)}" for "${short(cleanLabel(a.group))}"` : `Ticked "${short(label)}" (the saved values say so)`, { confidence: a.confidence });
          }
        },
      });
      // Typing that failed (e.g. a date box that wants another format): code reformats the value and retries.
      await Promise.all(naming.splice(0));
      obs = await observe(page);
      for (const f of fixes) {
        const el = obs.elements.find((e) => cleanLabel(e.label).slice(0, 40) === f.label.slice(0, 40) && (e.kind === "text" || e.kind === "textarea") && isEmpty(e));
        const v = values.find((x) => x.key === f.key);
        if (!el || !v) continue;
        const type = await page.locator(`[data-aid="${el.id}"]`).getAttribute("type").catch(() => "") ?? "";
        const ph = await page.locator(`[data-aid="${el.id}"]`).getAttribute("placeholder").catch(() => "") ?? "";
        const fixedV = fixValue(v.value, `${el.label} ${ph}`, type);
        if (fixedV && (await typeInto(page, el, fixedV))) {
          expected.set(fid(el), { label: cleanLabel(el.label), want: fixedV });
          variants.push({ key: f.key, description: "", value: fixedV });
          await log("recover", `Reformatted ${f.key} for "${short(cleanLabel(el.label))}" and typed it`);
        }
      }
      obs = await observe(page);
      pending = await handleConsents(obs, options);
      await labelDuplicates(page, obs); // "Telephone (section "Details of the person…")" so the user knows which one is asked
      await askMissing(obs, options);
      obs = await observe(page);
      // Conditional questions: anything new and empty that appeared since this round started gets another round.
      const fresh = obs.elements.filter((e) => fillable(e) && isEmpty(e) && e.kind !== "checkbox" && !emptyBefore.has(`${e.name}|${e.label}`) && !asked.has(fieldKey(e)));
      if (fresh.length === 0) break;
      await log("decide", `${fresh.length} new question${fresh.length === 1 ? "" : "s"} appeared after the answers: ${fresh.slice(0, 3).map((e) => `"${short(cleanLabel(e.group || e.label), 40)}"`).join(", ")}`);
    }
    return pending;
  }

  /**
   * Forms often arrive with an answer already chosen ("This feedback is about: (•) Me", a country dropdown). The
   * engine leaves answered questions alone, so check those defaults once against the saved values (keys only to the
   * model; code matches the value to an option) and change the ones the patient's own answers contradict.
   */
  async function checkDefaults(obs: Observation) {
    type D = { q: string; label: string; options: string[]; current: string; apply: (opt: string) => Promise<boolean> };
    const ds: D[] = [];
    const groups = new Map<string, El[]>();
    for (const e of obs.elements) if (e.kind === "radio" && !e.disabled) groups.set(e.name, [...(groups.get(e.name) ?? []), e]);
    for (const [name, radios] of groups) {
      const on = radios.find((r) => r.checked);
      if (!on || radios.length < 2) continue;
      ds.push({ q: `d${ds.length}`, label: cleanLabel(radios[0].group || name), options: radios.map((r) => r.label), current: on.label, apply: async (opt) => {
        const r = radios.find((x) => x.label === opt);
        if (!r) return false;
        const loc = page.locator(`[data-aid="${r.id}"]`);
        await pointAt(page, loc);
        try { await loc.check({ timeout: 4000 }); } catch { await loc.check({ force: true, timeout: 4000 }).catch(() => {}); }
        return true;
      } });
    }
    for (const e of obs.elements) if (e.kind === "select" && !e.disabled && !isEmpty(e) && e.options.length > 1) {
      ds.push({ q: `d${ds.length}`, label: cleanLabel(e.label), options: e.options.filter((o) => o.trim() && !PLACEHOLDER.test(o.trim()) && !ANY_PLACEHOLDER.test(o.trim())), current: e.value, apply: async (opt) => {
        const loc = page.locator(`[data-aid="${e.id}"]`);
        await pointAt(page, loc);
        return loc.selectOption({ label: opt }, { timeout: 5000 }).then(() => true, () => false);
      } });
    }
    if (!ds.length) return;
    const keys = values.map((v) => ({ value: v.key, description: v.description }));
    const shown = redactObservation(obs, [...values, ...variants]);
    let answers: DAnswer[] = [];
    try {
      answers = (await decide([`GOAL: ${opts.goal}`, `SAVED VALUES (names only):\n${values.map((v) => `- ${v.key}: ${v.description}`).join("\n")}`, `CURRENT PAGE:\n${formatObservation(shown)}`].join("\n\n"),
        ds.slice(0, 20).map((d) => ({ type: "choice", name: d.q, instructions: `The question "${d.label}" (options: ${JSON.stringify(d.options.slice(0, 30))}) already has an answer chosen by the form itself. Which saved value answers this question? "none" if no saved value does.`, choices: [...keys, { value: "none", description: "No saved value answers this" }] }) as DQuestion))).answers;
    } catch { return; }
    for (const d of ds) {
      const a = answers.find((x) => x.name === d.q);
      if (!a || a.type !== "choice" || a.choice === "none" || a.confidence < 0.7) continue;
      const v = values.find((x) => x.key === a.choice);
      const opt = v && matchOption(v.value, d.options);
      if (!opt || opt === d.current) continue;
      if (await d.apply(opt)) {
        ctx.track.bump("action");
        await log("recover", `The form had "${short(d.current, 30)}" pre-selected for "${short(d.label)}"; changed it to "${short(opt, 30)}" from ${a.choice}`, { confidence: a.confidence });
      }
    }
  }

  /** Consent boxes: ticked only when the caller allows that exact label; otherwise listed for the user. Returns required ones still unticked. */
  async function handleConsents(obs: Observation, options: Set<string>): Promise<string[]> {
    const pendingRequired: string[] = [];
    for (const e of obs.elements) {
      if (!isConsent(e, options) || e.checked || e.disabled) continue;
      const label = cleanLabel(e.label) || cleanLabel(e.group) || e.name;
      if (opts.allowConsent?.(label)) {
        const loc = page.locator(`[data-aid="${e.id}"]`);
        await pointAt(page, loc);
        try { await loc.check({ timeout: 4000 }); } catch { await loc.check({ force: true, timeout: 4000 }).catch(() => {}); }
        ctx.track.bump("action");
        await log("check", `Ticked "${short(label, 90)}" (you agreed to this)`);
        continue;
      }
      if (!consents.has(label)) await log("check", `Left "${short(label, 90)}" unticked: that is your decision`);
      consents.add(label);
      if (isRequired(e)) pendingRequired.push(label);
    }
    return pendingRequired;
  }

  /** Required fields still empty: one question to the user per field, then code types the answer. */
  async function askMissing(obs: Observation, options: Set<string>) {
    for (const m of missingRequired(obs, options)) {
      const k = fieldKey(m.el);
      if (asked.has(k)) continue;
      asked.add(k);
      const label = cleanLabel(m.label);
      if (!ctx.ask) { unfilled.push(label); await log("check", `"${short(label)}" is required and we have no answer for it`); continue; }
      note(`Asking you: ${short(label, 50)}`);
      await log("decide", `"${short(label)}" is required and none of your saved answers fits; asking you`);
      const answer = await ctx.ask({
        agent: "Kit", crew: "kit",
        question: m.options.length ? `The form asks: "${label}". Which one applies?` : `The form asks: "${label}". What should I put?`,
        why: "The form requires it and it is not in what you have told us",
        kind: m.options.length ? "choice" : "text",
        options: m.options.length ? m.options : undefined,
      });
      if (!answer?.trim()) { unfilled.push(label); continue; }
      values.push({ key: `answer.${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)}`, description: `The user's own answer to "${label}"`, value: answer.trim() });
      const ok = await answerField(m.el, m.options, answer.trim(), m.radios);
      if (ok) await log(m.options.length ? "pick" : "type", `Filled "${short(label)}" with your answer`);
      else unfilled.push(label);
    }
  }

  async function answerField(el: El, options: string[], answer: string, radios: El[]): Promise<boolean> {
    const fresh = await observe(page);
    if (radios.length) {
      const pick = matchOption(answer, radios.map((r) => r.label));
      const r = fresh.elements.find((x) => x.kind === "radio" && x.name === el.name && x.label === pick);
      if (!r) return false;
      const loc = page.locator(`[data-aid="${r.id}"]`);
      await pointAt(page, loc);
      try { await loc.check({ timeout: 4000 }); } catch { await loc.check({ force: true, timeout: 4000 }).catch(() => {}); }
      ctx.track.bump("action");
      return true;
    }
    const target = fresh.elements.find((x) => x.kind === el.kind && (el.name ? x.name === el.name : x.label === el.label));
    if (!target) return false;
    if (target.kind === "select") {
      const pick = matchOption(answer, options) ?? options.find((o) => o === answer);
      if (!pick) return false;
      const loc = page.locator(`[data-aid="${target.id}"]`);
      await pointAt(page, loc);
      await loc.selectOption({ label: pick }, { timeout: 5000 }).catch(() => {});
      ctx.track.bump("action");
      return true;
    }
    const typed = await typeInto(page, target, answer);
    if (typed) expected.set(fid(target), { label: cleanLabel(target.label), want: answer });
    return typed;
  }

  /**
   * After "Next": if the same form came back with errors, fix each named field ONCE and click again. Another round only
   * when the form now names fields it did not name before (a form that reveals its rules one at a time); max 3.
   */
  async function recoverErrors(sigBefore: string, forward: Fwd): Promise<"ok" | "fixed" | "stuck"> {
    const fixedOnce = new Set<string>();
    for (let attempt = 0; attempt < 4; attempt++) {
      const obs = await observe(page);
      if (fieldSig(obs) !== sigBefore) return attempt ? "fixed" : "ok"; // moved on
      const errs = await readErrors(page);
      if (errs.fields.length === 0 && errs.summary.length === 0) {
        if (attempt === 0 && await page.waitForTimeout(1500).then(async () => fieldSig(await observe(page)) !== sigBefore)) return "ok";
        const empty = (await observe(page)).elements.filter((e) => fillable(e) && e.kind !== "checkbox" && isEmpty(e) && !(e.kind === "radio" && obs.elements.some((r) => r.kind === "radio" && r.name === e.name && r.checked)));
        const labels = [...new Set(empty.map((e) => cleanLabel(e.kind === "radio" ? e.group || e.name : e.label)))];
        unfilled.push(...(labels.length ? labels.map((l) => `${l}: the form would not move on, probably because this is empty`) : [`"${forward.label}" did not move the form on and the page gives no reason`]));
        await log("recover", `"${short(forward.label, 30)}" did not move the form on and no error is shown${labels.length ? `; still empty: ${labels.slice(0, 4).map((l) => `"${short(l, 30)}"`).join(", ")}` : ""}`, { shot: true });
        stuckWhy = "The form would not move on and shows no error; the likely cause is listed. Stopped so you can check.";
        return "stuck";
      }
      if (!errs.fields.length) errs.fields = await errorsToFields(obs, errs.summary);
      let fresh = errs.fields.filter((f) => !fixedOnce.has(f.name || f.label));
      if (!fresh.length && errs.summary.length) {
        // "Please complete all document fields": the error names no new field, so the questions still empty are its subject.
        const seen = new Set<string>();
        fresh = obs.elements
          .filter((e) => fillable(e) && e.kind !== "checkbox" && !isConsent(e, new Set()) && (e.kind === "radio" ? !obs.elements.some((r) => r.kind === "radio" && r.name === e.name && r.checked) : isEmpty(e)))
          .filter((e) => { const k = e.name || e.label; if (seen.has(k) || fixedOnce.has(k)) return false; seen.add(k); return true; })
          .slice(0, 6)
          .map((e) => ({ name: e.name, label: cleanLabel(e.kind === "radio" ? e.group || e.label : e.label), message: short(errs.summary.join(" "), 200), empty: true, type: "", placeholder: "" }));
      }
      if (attempt > 0 && (fresh.length === 0 || attempt === 3)) {
        stuckWhy = "The form still shows errors after one fix; stopped so you can check the answers it rejected.";
        unfilled.push(...errs.fields.map((f) => `${cleanLabel(f.label)}: ${f.message || "rejected by the form"}`), ...(errs.fields.length ? [] : errs.summary));
        await log("recover", "The form still shows errors after the fix", { shot: true, detail: [...errs.summary, ...errs.fields.map((f) => `${f.label}: ${f.message}`)].join("\n") });
        return "stuck";
      }
      errs.fields = fresh;
      fresh.forEach((f) => fixedOnce.add(f.name || f.label));
      await log("recover", `The form answered with ${errs.fields.length || errs.summary.length} error${(errs.fields.length || errs.summary.length) === 1 ? "" : "s"}; reading and fixing them`, { shot: true, detail: [...errs.summary, ...errs.fields.map((f) => `${f.label}: ${f.message}`)].join("\n") });
      note("Fixing what the form rejected");
      for (const f of errs.fields) {
        const label = cleanLabel(f.label);
        const el = obs.elements.find((e) => (e.name === f.name || (!f.name && cleanLabel(e.label) === label)) && fillable(e));
        if (!el) continue;
        if (f.empty) {
          const key = keyOf.get(fid(el));
          const v = key && values.find((x) => x.key === key);
          if (v && el.kind !== "radio" && await typeInto(page, el, v.value)) { await log("recover", `Typed ${key} into "${short(label)}" again`); continue; }
          if (ctx.ask && !asked.has(fieldKey(el))) {
            asked.add(fieldKey(el));
            const radios = el.kind === "radio" ? obs.elements.filter((r) => r.kind === "radio" && r.name === el.name) : [];
            const opt = el.kind === "select" ? el.options.filter((o) => o.trim() && !PLACEHOLDER.test(o.trim()) && !ANY_PLACEHOLDER.test(o.trim())) : radios.map((r) => r.label);
            const answer = await ctx.ask({ agent: "Kit", crew: "kit", question: `The form needs "${label}"${f.message ? ` (it says: "${f.message}")` : ""}. What should I put?`, why: "The form will not move on without it", kind: opt.length ? "choice" : "text", options: opt.length ? opt : undefined });
            if (answer?.trim() && await answerField(el, opt, answer.trim(), radios)) { await log("recover", `Filled "${short(label)}" with your answer`); continue; }
          }
          unfilled.push(`${label}${f.message ? `: ${f.message}` : ""}`);
          continue;
        }
        if (el.kind !== "text" && el.kind !== "textarea") { unfilled.push(`${label}: ${f.message}`); continue; }
        const key = keyOf.get(fid(el));
        const v = key ? values.find((x) => x.key === key) : undefined;
        const fixedV = v ? fixValue(v.value, `${f.message} ${label} ${f.placeholder}`, f.type) : null;
        if (v && fixedV && fixedV !== v.value && await typeInto(page, el, fixedV)) {
          expected.set(fid(el), { label, want: fixedV });
          variants.push({ key: key!, description: "", value: fixedV });
          await log("recover", `"${short(label)}": the form said "${short(f.message || "invalid", 80)}"; retyped ${key} in that format`);
          continue;
        }
        if (ctx.ask && !asked.has(fieldKey(el))) {
          asked.add(fieldKey(el));
          const answer = await ctx.ask({ agent: "Kit", crew: "kit", question: `The form rejected "${label}"${f.message ? `: "${f.message}"` : ""}. What should I put instead?`, why: "The form will not move on until this is fixed", kind: "text" });
          if (answer?.trim() && await typeInto(page, el, answer.trim())) { await log("recover", `Retyped "${short(label)}" with your answer`); continue; }
        }
        unfilled.push(`${label}: ${f.message || "rejected by the form"}`);
      }
      if (unfilled.length) { stuckWhy = "The form rejected answers we cannot fix without you; stopped before moving on."; return "stuck"; }
      // The fixes may have changed a conditional answer: the verdict again, on the live page, before pressing once more.
      const live = await liveForwardVerdict(page, forward);
      if (!live.ok) { stuckWhy = `After fixing what the form rejected, "${short(forward.label, 40)}" may now send the form (${live.final}); stopped before pressing it.`; return "stuck"; }
      await clickForward(page, live.fwd, "retry");
    }
    return "stuck";
  }

  /** An error that names no field ("Please enter at least 15 words about the outcome"): the model maps it to a field. */
  async function errorsToFields(obs: Observation, messages: string[]): Promise<FieldError[]> {
    const targets = obs.elements.filter((e) => fillable(e) && e.kind !== "checkbox");
    if (!targets.length || !messages.length) return [];
    const seen = new Set<string>();
    const radioOnce = targets.filter((e) => e.kind !== "radio" || (!seen.has(e.name) && seen.add(e.name)));
    const shown = redactObservation({ ...obs, elements: [], text: messages.join("\n") }, [...values, ...variants]).text.split("\n");
    try {
      const { answers } = await decide(`ERROR MESSAGES THE FORM SHOWED:\n${shown.map((m, i) => `${i + 1}. ${m}`).join("\n")}`, shown.slice(0, 4).map((m, i) => ({
        type: "choice", name: `e${i}`,
        instructions: `Which field is error message ${i + 1} ("${short(m, 160)}") about?`,
        choices: [...radioOnce.map((e) => ({ value: `f:${e.id}`, description: `${e.kind}: ${short(cleanLabel(e.kind === "radio" ? e.group || e.label : e.label), 90)}` })), { value: "none", description: "None of these fields" }],
      }) as DQuestion));
      const out: FieldError[] = [];
      answers.forEach((a, i) => {
        if (a.type !== "choice" || a.choice === "none" || a.confidence < 0.5) return;
        const el = radioOnce.find((e) => `f:${e.id}` === a.choice);
        if (el) out.push({ name: el.name, label: cleanLabel(el.kind === "radio" ? el.group || el.label : el.label), message: messages[i], empty: isEmpty(el) && !(el.kind === "radio" && obs.elements.some((r) => r.kind === "radio" && r.name === el.name && r.checked)), type: "", placeholder: "" });
      });
      if (out.length) await log("decide", `Matched the error${out.length === 1 ? "" : "s"} to ${out.map((f) => `"${short(f.label, 40)}"`).join(", ")}`);
      return out;
    } catch {
      return [];
    }
  }

  async function clickForward(p: Page, given: Fwd, why: "start" | "next" | "retry") {
    let f = given;
    // Backstop for every click on a filled form page: the final/not-final verdict, recomputed on the live page now.
    if (why !== "start") {
      const live = await liveForwardVerdict(p, f);
      if (!live.ok) throw new Error(`refused to click "${short(f.label, 40)}": ${live.final}`);
      f = live.fwd;
    }
    const loc = p.locator(`[data-aid="${f.id}"]`);
    const href = f.kind === "link" ? await loc.getAttribute("href").catch(() => null) : null;
    const target = f.kind === "link" ? await loc.getAttribute("target").catch(() => null) : null;
    // Safety in code: whatever the page or the model says, a control whose label means "send" is never clicked,
    // except a plain link that only opens the form from a start page (it carries no data).
    const plainLink = !!href && !/^\s*(javascript:|#)/i.test(href);
    const live = ((await loc.innerText({ timeout: 2000 }).catch(() => "")) || (await loc.getAttribute("value").catch(() => "")) || f.label).trim();
    if ((FINAL_RE.test(f.label) || FINAL_RE.test(live)) && !(why === "start" && plainLink)) throw new Error(`refused to click "${short(live || f.label, 40)}": it would send the form`);
    await pointAt(p, loc);
    if (href && target === "_blank" && /^https?:|^\//i.test(href)) {
      await p.goto(new URL(href, p.url()).toString(), { waitUntil: "domcontentloaded" });
    } else {
      // Sticky footers and cookie bars can cover the button: centre it and retry, then click it through the DOM.
      await loc.click({ timeout: 6000 }).catch(async () => {
        await loc.evaluate((e) => e.scrollIntoView({ block: "center" })).catch(() => {});
        await loc.click({ timeout: 3000 }).catch(() => loc.evaluate((e) => (e as HTMLElement).click(), undefined, { timeout: 3000 }));
      });
    }
    ctx.track.bump("action");
    lastClicked = f.label;
    await settle(p);
    await log("click", `${why === "retry" ? "Tried again: clicked" : "Clicked"} "${short(f.label, 50)}"${why === "start" ? " to open the form" : ""}`, { url: p.url() });
  }

  /**
   * Read back, from the DOM, every value code typed on this page. A value that did not stick (a script cleared it,
   * an input mask mangled it) is typed once more; if it still does not match, it is reported, never assumed.
   */
  async function verifyTyped(p: Page): Promise<string[]> {
    await Promise.all(naming.splice(0));
    const find = (o: Observation, id: string) => o.elements.find((e) => (e.kind === "text" || e.kind === "textarea") && fid(e) === id);
    const bad: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const o = await observe(p);
      const wrong = [...expected].filter(([id, x]) => { const el = find(o, id); return el && !sameText(el.value, x.want); }); // a missing field: a conditional one since hidden
      if (!wrong.length) break;
      if (attempt === 1) { bad.push(...wrong.map(([, x]) => x.label)); break; }
      for (const [id, x] of wrong) { const el = find(o, id); if (el) await typeInto(p, el, x.want); }
    }
    return bad;
  }

  async function readPage(p: Page): Promise<FilledPage> {
    const bad = await verifyTyped(p);
    if (bad.length) {
      unfilled.push(...bad.map((b) => `${b}: the form did not keep the typed value`));
      await log("recover", `Read back the page: ${bad.length} field${bad.length === 1 ? "" : "s"} did not keep what was typed`, { detail: bad.join("\n") });
    } else if (expected.size) await log("check", `Read back all ${expected.size} typed value${expected.size === 1 ? "" : "s"} from the page: every one is in place`);
    expected = new Map();
    const o = await observe(p);
    const filled: { label: string; value: string }[] = [];
    for (const e of o.elements) {
      const label = cleanLabel(e.label) || e.name;
      if ((e.kind === "text" || e.kind === "textarea") && e.value.trim()) filled.push({ label, value: e.value });
      else if (e.kind === "select" && !isEmpty(e)) filled.push({ label, value: e.value });
      else if (e.kind === "radio" && e.checked) filled.push({ label: cleanLabel(e.group) || e.name, value: label });
      else if (e.kind === "checkbox" && e.checked) filled.push({ label, value: "ticked" });
    }
    void lastClicked;
    return { url: o.url, title: o.headings[0] || o.title, filled, verified: bad.length === 0 };
  }
}

/* ------------------------------------------------------------------ page classification */

type Fwd = { id: number; label: string; kind: El["kind"] };
type View = {
  kind: "form" | "landing" | "review" | "sent" | "other";
  forward?: Fwd;
  forwardIsPlainLink: boolean;
  final: boolean;
  finalWhy: string;
  stepper: { n: number; total: number } | null;
  confidence: number;
  intended: number; // probability this is the form the goal describes
  why: string[];
};
const KIND_TEXT: Record<View["kind"], string> = { form: "a page of the form", landing: "a start page before the form", review: "a check-your-answers page", sent: "a 'sent' confirmation", other: "a page that is not the form itself" };

function candidates(obs: Observation): El[] {
  const c = obs.elements.filter((e) => (e.kind === "submit" || e.kind === "button" || e.kind === "link") && !e.disabled && e.label.trim() && e.label.length < 120 && !AVOID_RE.test(e.label.trim()));
  const rank = (e: El) => (FINAL_RE.test(e.label) || NEXT_RE.test(e.label) ? 0 : e.kind === "link" ? 2 : 1);
  return c.sort((a, b) => rank(a) - rank(b)).slice(0, 40);
}

async function classify(page: Page, obs: Observation, goal: string, values: Value[], options: Set<string>, scan: Scan): Promise<View> {
  const why: string[] = [];
  const stepper = stepperOf(obs, scan);
  const cands = candidates(obs);
  const empties = obs.elements.filter((e) => fillable(e) && isEmpty(e) && !isConsent(e, options) && e.kind !== "checkbox").length;
  const anyFields = obs.elements.some((e) => fillable(e) && !isConsent(e, options));
  const changeLinks = obs.elements.filter((e) => (e.kind === "link" || e.kind === "button") && CHANGE_RE.test(e.label.trim())).length;
  const codeReview = (REVIEW_RE.test(`${obs.title} ${obs.headings.join(" ")}`) && empties <= 1) || (changeLinks >= 3 && empties === 0);
  if (codeReview) why.push(changeLinks >= 3 ? `${changeLinks} "Change" links` : "heading reads like a review page");
  if (stepper) why.push(`stepper ${stepper.n}/${stepper.total}`);

  const shown = redactObservation(obs, values);
  const questions: DQuestion[] = [
    {
      type: "choice", name: "kind",
      instructions: `What is this page, in the journey toward the goal ("${goal}")?`,
      choices: [
        { value: "form", description: "A page of the form itself, with questions to answer" },
        { value: "landing", description: "An information or start page before the form, with a button or link to start it" },
        { value: "review", description: "A summary of the answers to check before sending (check your answers / review / declaration and send)" },
        { value: "sent", description: "A confirmation that the form has already been submitted" },
        { value: "other", description: "Some other page (the form is elsewhere)" },
      ],
    },
    {
      type: "predicate", name: "intended",
      instructions: `Is this page part of the form (or the way into the form) that the goal describes: the right organisation and the right purpose? Goal: "${goal}"`,
    },
    {
      type: "predicate", name: "last",
      instructions: "Is this the last page of the form, so that its main button sends the form to the organisation (there is no further page of questions and no review page after it)? Judge from the page text, step indicators and button labels.",
    },
  ];
  if (cands.length) questions.push({
    type: "choice", name: "forward",
    instructions: "Which element moves forward through the form: on a start page the one that starts the form, on a form page the one that goes to the next page or step. Never a back, cancel, save-for-later, sign-in or unrelated link. Choose the sending/submit button only if there is no other way forward. 'none' if nothing moves forward.",
    choices: [...cands.map((e) => ({ value: `el:${e.id}`, description: `${e.kind}: ${short(e.label, 80)}` })), { value: "none", description: "Nothing on this page moves the form forward" }],
  });

  let answers: DAnswer[] = [];
  try {
    answers = (await decide([`GOAL: ${goal}`, `CURRENT PAGE:\n${formatObservation(shown)}`].join("\n\n"), questions)).answers;
  } catch (e) {
    why.push(`model unavailable (${errMsg(e).slice(0, 60)}); code signals only`);
  }
  const get = (n: string) => answers.find((a) => a.name === n);
  const kindA = get("kind");
  const lastA = get("last");
  const fwdA = get("forward");
  const intendedA = get("intended");
  const intended = intendedA?.type === "predicate" ? intendedA.probability : 0.5;
  why.push(`intended form ${intended.toFixed(2)}`);
  let kind: View["kind"] = kindA?.type === "choice" ? (kindA.choice as View["kind"]) : anyFields ? "form" : "landing";
  const confidence = kindA?.type === "choice" ? kindA.confidence : 0.5;
  if (kindA?.type === "choice") why.push(`model: ${kindA.choice} (${kindA.confidence.toFixed(2)})`);
  // Code overrides: empty fields mean a form page whatever the model says; a review page must not have empty questions.
  if (codeReview) kind = "review";
  else if (kind === "review" && empties > 1) { kind = "form"; why.push("model said review, but there are empty questions"); }
  else if ((kind === "landing" || kind === "other") && empties >= 2) { kind = "form"; why.push("empty questions on the page"); }
  else if (kind === "form" && !anyFields) kind = "landing";
  if (kind === "sent" && anyFields) kind = "form";

  let forward: El | undefined;
  if (fwdA?.type === "choice" && fwdA.choice.startsWith("el:")) forward = cands.find((e) => `el:${e.id}` === fwdA.choice);
  if (!forward) forward = cands.find((e) => NEXT_RE.test(e.label) && !FINAL_RE.test(e.label) && e.kind !== "link") ?? cands.find((e) => (e.kind === "submit" || e.kind === "button") && FINAL_RE.test(e.label)) ?? (kind !== "form" ? cands.find((e) => NEXT_RE.test(e.label)) : undefined);
  const href = forward?.kind === "link" ? await page.locator(`[data-aid="${forward.id}"]`).getAttribute("href").catch(() => null) : null;
  const forwardIsPlainLink = !!href && !/^\s*(javascript:|#)/i.test(href);

  // Final, decided in code. When unsure, it is final.
  const lastP = lastA?.type === "predicate" ? lastA.probability : 0.5;
  let final = false;
  let finalWhy = "";
  if (forward) {
    const label = forward.label.trim();
    const nextish = NEXT_RE.test(label) && !FINAL_RE.test(label);
    if (FINAL_RE.test(label) && !(forwardIsPlainLink && kind !== "form")) { final = true; finalWhy = `its label "${short(label, 30)}" sends`; }
    else if (kind === "review") { final = true; finalWhy = "this is the review page"; }
    else if (stepper && stepper.n >= stepper.total && kind === "form") { final = true; finalWhy = `last step (${stepper.n} of ${stepper.total})`; }
    else if (kind === "form" && !forwardIsPlainLink && (lastP >= 0.85 || (!nextish && lastP >= 0.4))) { final = true; finalWhy = `the model thinks this is the last page (${lastP.toFixed(2)})`; }
    else if (kind === "form" && !nextish && !answers.length) { final = true; finalWhy = "could not tell, so treated as final"; }
    // A form page carries the patient's answers. Whatever its label ("Continue", "Next", "Proceed"), the button that
    // sends this form is FINAL unless code sees positive evidence of a later step in THIS form: its stepper or "step 1
    // of 4" short of the end, its progress bar short of full, or (for a script button that submits nothing) its own
    // further questions waiting hidden on this page. Recomputed on the live page before every click. When unsure: final.
    if (!final && kind === "form" && anyFields && !forwardIsPlainLink) {
      const later = await laterStepEvidence(page, forward.id);
      if (later) why.push(`later step: ${later}`);
      else { final = true; finalWhy = `"${short(label, 30)}" may send this form: nothing on the page shows a later step`; }
    }
  }
  return { kind, forward: forward && { id: forward.id, label: forward.label.trim(), kind: forward.kind }, forwardIsPlainLink, final, finalWhy, stepper, confidence, intended, why };
}

/**
 * Positive evidence, found by code on the LIVE page, that pressing the forward control leads to another page of the
 * same form rather than sending it. Only indicators that belong to the active form count: inside its <form> (or, for a
 * script wizard, the smallest box around the control that holds its questions), or elsewhere in the same main content
 * when they are a stepper (aria-current="step", "step n of N") or a progress bar labelled as the form's steps. Anything
 * in a sidebar, banner, footer, dialog, cookie bar or another <form> is ignored, as are spinners (no value), empty bars
 * and bars labelled as uploads, profiles and the like. An indicator at its end (last step, full bar), or a bar that
 * disagrees with the stepper, means no evidence. When the control submits no <form> (a script wizard's own button),
 * further questions of the same form hidden on the page also count. Null when there is no evidence: then it is final.
 */
export async function laterStepEvidence(page: Page, id: string | number): Promise<string | null> {
  return page
    .locator(`[data-aid="${id}"]`)
    .evaluate((node, { stepSrc }) => {
      const STEP = new RegExp(stepSrc, "iu");
      const STEPISH = /\b(?:steps?|stages?|pages?|sections?|parts?|questions?)\b|form progress|progress (?:through|of|in) (?:the |this |your )?(?:form|application|complaint|claim)|wizard|schritt|étape|paso|passo|stap|steg/iu;
      const UNRELATED = /upload|download|\bfiles?\b|attach|loading|profile|account|password|strength|cookie|storage|quota|video|audio|media|playback|reading|scroll|install|sync|battery/iu;
      const FIELD = "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]):not([type=reset]):not([type=search]), select, textarea";
      const vis = (e: Element) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
      const txt = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
      const el = node as HTMLButtonElement;
      const form: HTMLFormElement | null = el.form ?? el.closest("form");

      // The active form: its <form>, else the smallest box around the control holding a visible question of no other form.
      let box: Element | null = form;
      if (!box) for (let a = el.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
        if (Array.from(a.querySelectorAll(FIELD)).some((f) => vis(f) && !f.closest("form"))) { box = a; break; }
      }
      if (!box) box = el.parentElement ?? el;
      const active = box;
      // Its main content: <main> around it, else the largest box around it holding no other visible questions.
      let region: Element = active.closest("main, [role=main]") ?? active;
      if (region === active) for (let a = active.parentElement; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
        if (Array.from(a.querySelectorAll(FIELD)).some((f) => vis(f) && !active.contains(f))) break;
        region = a;
      }
      const OFF = "aside, [role=complementary], [role=banner], [role=contentinfo], [role=navigation]:not([aria-label*=step i]):not([aria-label*=progress i]), dialog, [role=dialog], [role=alertdialog], [aria-modal=true], [id*=cookie i], [class*=cookie i], [data-ff-side-login]";
      const foreign = (e: Element) => {
        const off = e.closest(OFF);
        if (off && !off.contains(active)) return true;
        const hf = e.closest("header, footer");
        if (hf && !hf.contains(active) && !hf.parentElement?.closest("main, [role=main], article, section, form")) return true;
        const f = e.closest("form");
        return !!f && f !== form;
      };

      const steps: { n: number; total: number }[] = [];
      for (const cur of Array.from(region.querySelectorAll('[aria-current="step"]'))) {
        const li = cur.closest("li");
        if (!li?.parentElement || foreign(cur) || !vis(li)) continue;
        const items = Array.from(li.parentElement.children).filter((x) => x.tagName === "LI" && vis(x));
        if (items.length >= 2) steps.push({ n: items.indexOf(li) + 1, total: items.length });
      }
      for (const t of Array.from(region.querySelectorAll("*"))) {
        const s = txt(t);
        if (s.length > 120 || /^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT)$/.test(t.tagName) || !STEP.test(s)) continue;
        if (Array.from(t.children).some((c) => STEP.test(txt(c))) || foreign(t) || !vis(t)) continue; // the innermost element only
        const m = s.match(STEP);
        if (m && +m[2] >= 2 && +m[1] >= 1 && +m[1] <= +m[2]) steps.push({ n: +m[1], total: +m[2] });
      }
      const bars: number[] = [];
      for (const p of Array.from(region.querySelectorAll("progress, [role=progressbar]"))) {
        if (foreign(p) || !vis(p)) continue;
        const isP = p.tagName === "PROGRESS";
        if (isP ? !p.hasAttribute("value") : p.getAttribute("aria-valuenow") === null) continue; // a spinner: no value
        const now = isP ? (p as HTMLProgressElement).value : Number(p.getAttribute("aria-valuenow"));
        const max = isP ? (p as HTMLProgressElement).max : Number(p.getAttribute("aria-valuemax") || 100);
        const min = isP ? 0 : Number(p.getAttribute("aria-valuemin") || 0);
        if (!Number.isFinite(now) || !Number.isFinite(max) || !Number.isFinite(min) || max <= min) continue;
        const by = (p.getAttribute("aria-labelledby") ?? "").split(/\s+/).map((i) => txt(document.getElementById(i))).join(" ");
        const near = txt(p.parentElement);
        const name = [p.getAttribute("aria-label"), by, p.getAttribute("aria-valuetext"), p.getAttribute("title"), p.id, p.className.toString(), ...Array.from((p as HTMLProgressElement).labels ?? []).map(txt), near.length <= 200 ? near : ""].join(" ");
        if (UNRELATED.test(name)) continue;
        if (!active.contains(p) && !STEPISH.test(name)) continue; // outside the form: only a bar that says it counts the form's steps
        bars.push((now - min) / (max - min));
      }

      // The form says this is its last step: no evidence. Signals that disagree: unsure, so no evidence.
      if (steps.some((s) => s.n >= s.total) || bars.some((b) => b >= 0.999)) return null;
      const started = bars.filter((b) => b > 0);
      if (steps.length && started.some((b) => steps.some((s) => b < (s.n - 1) / s.total - 0.2 || b > s.n / s.total + 0.2))) return null;
      if (steps.length) return `step ${steps[0].n} of ${steps[0].total} of this form`;
      if (started.length) return `this form's progress bar at ${Math.round(started[0] * 100)}%`;

      const t = (el.getAttribute("type") || "").toLowerCase();
      const submits = !!form && ((el.tagName === "INPUT" && (t === "submit" || t === "image")) || (el.tagName === "BUTTON" && (t === "" || t === "submit")));
      if (submits) return null; // a submit button sends everything in its form: hidden questions are no evidence
      const hidden = Array.from(active.querySelectorAll(FIELD)).filter((f) => !foreign(f) && !vis(f) && !(f as HTMLInputElement).disabled && !((f as HTMLInputElement).labels?.[0] && vis((f as HTMLInputElement).labels![0])));
      return hidden.length >= 1 ? `${hidden.length} more question(s) of this form wait hidden on the page` : null;
    }, { stepSrc: STEPPER_RE.source })
    .catch(() => null);
}

/**
 * The final/not-final verdict, recomputed from the LIVE page immediately before a forward click on a form page (one that
 * holds the patient's answers): never a verdict from before the page was filled, since a conditional answer can remove
 * the later steps while "Continue" stays. Re-finds the control (ids change on every observe), then: a label that sends
 * is final; a plain link carries no answers; otherwise final unless laterStepEvidence finds a later step now.
 */
export async function liveForwardVerdict(page: Page, f: { label: string; kind: El["kind"] }): Promise<{ ok: true; fwd: Fwd; why: string } | { ok: false; fwd?: Fwd; final: string }> {
  const obs = await observe(page);
  const el = obs.elements.find((e) => e.label.trim() === f.label.trim() && e.kind === f.kind && !e.disabled);
  if (!el) return { ok: false, final: `"${short(f.label, 30)}" is no longer on the page as it was` };
  const fwd: Fwd = { id: el.id, label: el.label.trim(), kind: el.kind };
  const loc = page.locator(`[data-aid="${el.id}"]`);
  const live = ((await loc.innerText({ timeout: 2000 }).catch(() => "")) || (await loc.getAttribute("value").catch(() => "")) || fwd.label).trim();
  if (FINAL_RE.test(fwd.label) || FINAL_RE.test(live)) return { ok: false, fwd, final: `its label "${short(live || fwd.label, 30)}" sends` };
  const href = el.kind === "link" ? await loc.getAttribute("href").catch(() => null) : null;
  if (href && !/^\s*(javascript:|#)/i.test(href)) return { ok: true, fwd, why: "a plain link: it carries no answers" };
  const later = await laterStepEvidence(page, el.id);
  if (!later) return { ok: false, fwd, final: `"${short(fwd.label, 30)}" may send this form: on the page as filled, nothing of this form shows a later step` };
  return { ok: true, fwd, why: later };
}

/**
 * After filling, buttons can change (a conditional question reveals or removes a step). A changed button: classify
 * again. The same button: its verdict is recomputed on the live page (a pre-fill "not final" is never reused).
 */
async function refreshForward(page: Page, obs: Observation, view: View, goal: string, values: Value[], options: Set<string>, scan: Scan): Promise<View> {
  const same = view.forward && obs.elements.find((e) => e.label.trim() === view.forward!.label && e.kind === view.forward!.kind && !e.disabled);
  if (!same) return classify(page, obs, goal, values, options, scan);
  const fwd: Fwd = { id: same.id, label: view.forward!.label, kind: same.kind };
  if (view.final) return { ...view, forward: fwd };
  const live = await liveForwardVerdict(page, fwd);
  if (!live.ok) return { ...view, forward: live.fwd ?? fwd, final: true, finalWhy: live.final, why: [...view.why, `after filling: ${live.final}`] };
  return { ...view, forward: live.fwd, why: [...view.why, `after filling, later step: ${live.why}`] };
}

/* ------------------------------------------------------------------ small helpers */

type Missing = { el: El; label: string; options: string[]; radios: El[] };
function missingRequired(obs: Observation, options: Set<string>): Missing[] {
  const out: Missing[] = [];
  const groups = new Map<string, El[]>();
  for (const e of obs.elements) {
    if (e.disabled || isConsent(e, options)) continue;
    if ((e.kind === "text" || e.kind === "textarea" || e.kind === "select") && isRequired(e) && isEmpty(e)) {
      out.push({ el: e, label: e.label || e.name, options: e.kind === "select" ? [...new Set(e.options.filter((o) => o.trim() && !PLACEHOLDER.test(o.trim()) && !ANY_PLACEHOLDER.test(o.trim())))] : [], radios: [] });
    } else if (e.kind === "radio") groups.set(e.name, [...(groups.get(e.name) ?? []), e]);
  }
  for (const radios of groups.values()) {
    if (radios.some((r) => r.checked) || !radios.some(isRequired)) continue;
    out.push({ el: radios[0], label: radios[0].group || radios[0].name, options: [...new Set(radios.map((r) => r.label))], radios });
  }
  return out;
}

/** A field's identity across observations: its DOM name (unique even when two boxes share a label), else its label. */
const fid = (e: El) => (e.name ? `n:${e.name}` : `l:${cleanLabel(e.label).slice(0, 40)}`);
const fieldKey = (e: El) => `${e.kind}|${e.name || (e.kind === "radio" ? e.group : cleanLabel(e.label))}`;
/** Which questions are on screen: changes when a wizard moves on, even without a new URL. */
const fieldSig = (o: Observation) => `${o.url.split("#")[0]}|${[...new Set(o.elements.filter(fillable).map((e) => e.name || e.label))].sort().join(",")}`;
/** For loop detection only: the questions, how many are answered, and the headings (minus an error summary's own heading). */
const pageSig = (o: Observation) => `${fieldSig(o)}|${o.elements.filter(fillable).map((e) => (isEmpty(e) && !e.checked ? 0 : 1)).join("")}|${o.headings.filter((h) => !/problem|error|fehler|erreur|errore|fout|fel\b|virhe|błąd/i.test(h)).join("|")}`;

const squash = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
/** The DOM holds what was typed: same letters and digits (input masks may add spaces or dashes; maxlength may cut). */
const sameText = (got: string, want: string) => { const g = squash(got), w = squash(want); return g === w || (g.length >= 20 && w.startsWith(g)) || (w.length > 0 && g.replace(/^0+/, "") === w.replace(/^0+/, "")); };

/** Every control on the page whose label means "send": submit inputs, buttons, links and JavaScript controls (role=button, onclick). */
async function finalControls(page: Page): Promise<string[]> {
  const labels = await page.evaluate(() => {
    const vis = (e: Element) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 2 && r.height > 2 && s.visibility !== "hidden" && s.display !== "none"; };
    const els = Array.from(document.querySelectorAll<HTMLElement>('button, input[type=submit], input[type=button], input[type=image], a, [role=button], [onclick], [tabindex="0"]'))
      .filter((e) => vis(e) && !e.closest("header, nav, footer, [data-ff-side-login]"));
    return els.map((e) => ((e as HTMLInputElement).value && e.tagName === "INPUT" ? (e as HTMLInputElement).value : e.innerText || e.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim()).filter((t) => t && t.length < 80);
  }).catch(() => [] as string[]);
  return [...new Set(labels.filter((l) => FINAL_RE.test(l) && !AVOID_RE.test(l)))];
}

async function typeInto(page: Page, el: El, text: string): Promise<boolean> {
  const loc = page.locator(`[data-aid="${el.id}"]`);
  await pointAt(page, loc);
  try {
    await loc.fill(text, { timeout: 5000 });
    await loc.dispatchEvent("change").catch(() => {});
    await loc.blur().catch(() => {});
    return true;
  } catch {
    try { await loc.click({ timeout: 3000 }); await loc.pressSequentially(text, { delay: 5, timeout: 15000 }); return true; } catch { return false; }
  }
}

async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 3500 }).catch(() => {});
  await page.waitForTimeout(300);
}
