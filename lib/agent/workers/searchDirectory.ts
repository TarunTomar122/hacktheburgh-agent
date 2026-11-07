import type { ElementHandle, Page } from "playwright";
import { z } from "zod";
import { dismissCookies } from "../../browser";
import { pointAt } from "../../agentCursor";
import { MODELS, structured } from "../llm";
import type { Wall, WorkerCtx } from "./types";

/**
 * search_directory (night plan, generic worker). Uses a site's OWN search UI to find entries in its directory:
 * finds the right search form or tab, opens "advanced search" when a criterion needs a hidden filter, maps the
 * criteria onto its fields (free text, autocomplete boxes, dropdowns, radios, filter boxes), presses Search, reads
 * the results (opening "view details" sections when contact details are hidden), follows pagination or "load more",
 * and extracts structured entries. When the site's search fails or ignores a filter it changes approach and logs
 * the recovery.
 *
 * Knows nothing about any site: no URLs, no names, no per-site selectors. The model chooses; code acts and checks.
 * Safety in code: the only text ever typed is a piece of the given criteria (`termFromCriteria`), never anything
 * else, so pressing Search cannot send personal data. Login and CAPTCHA walls stop the worker and are reported.
 */

export type DirectoryResult = { name: string; detail: string; url?: string; fields: Record<string, string> };
export type DirectorySearch = {
  ok: boolean;
  results: DirectoryResult[];
  searchedWith: { label: string; value: string }[];
  pagesRead: number;
  wall?: Wall;
  summary: string;
  /** results: entries found; no_results: the search ran and the site said nothing matches; search_failed: the search
   *  could not be run or did not take effect; wall: login / CAPTCHA / bot check. */
  outcome: "results" | "no_results" | "search_failed" | "wall";
};
type Criterion = { label: string; value: string };

const MODEL = process.env.WORKER_MODEL ?? MODELS.browser;
const EFFORT = (process.env.WORKER_EFFORT as "none" | "low" | "medium" | "high" | undefined) ?? "low";
const MAX_RECOVERIES = 2;

/* ================================================================== page kit (shared by the generic workers) */

export type UiKind = "text" | "select" | "radio" | "checkbox" | "combo" | "submit" | "button" | "tab" | "toggle" | "option" | "link";
export type UiEl = {
  id: number;
  kind: UiKind;
  type: string; // input type ("search", "number", "email", ...)
  name: string;
  label: string;
  group: string; // the question / legend a radio or checkbox belongs to
  value: string;
  checked: boolean;
  selected: boolean; // tabs: aria-selected
  expanded: boolean | null; // toggles: aria-expanded
  options: string[]; // selects
  form: number; // index of the <form> it belongs to, -1 if none
  chrome: boolean; // sits in the site header, nav or footer
  href: string;
  newTab: boolean;
  autocomplete: boolean; // looks like an autocomplete / combobox input
  disabled: boolean;
  required: boolean;
  personal: boolean; // asks for identity or contact details (by its type or autocomplete hint)
};
export type Snapshot = {
  url: string;
  title: string;
  headings: string[];
  errors: string[];
  text: string;
  els: UiEl[];
  captchaFrames: string[];
  passwordBox: boolean;
};

/** Read the live page into a compact list of things the agent can act on. Each element gets data-wid=<id>. */
export async function snapshot(page: Page, opts: { textCap?: number; linkCap?: number } = {}): Promise<Snapshot> {
  const args = { textCap: opts.textCap ?? 6000, linkCap: opts.linkCap ?? 60 };
  for (let attempt = 0; ; attempt++) {
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
      // tsx wraps named functions in __name(), which does not exist inside the page.
      await page.evaluate("window.__name = window.__name || ((f) => f)");
      return await page.evaluate(inPageSnapshot, args);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt >= 4 || !/context was destroyed|navigat|Target closed|detached/i.test(msg)) throw e;
      await page.waitForTimeout(700);
    }
  }
}

function inPageSnapshot(args: { textCap: number; linkCap: number }): Snapshot {
  const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
  const visible = (e: Element) => {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(e);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05 && !e.closest('[aria-hidden="true"]');
  };
  // Many sites hide the real radio/checkbox and draw their own on the label.
  const choiceVisible = (e: HTMLInputElement) => visible(e) || (!!e.labels && e.labels.length > 0 && visible(e.labels[0]));
  const cookieRe = /cookie|consent|onetrust|gdpr|^ccc/i;
  const inCookieBanner = (e: Element) => {
    for (let n: Element | null = e; n && n !== document.body; n = n.parentElement) {
      if (cookieRe.test(n.id) || cookieRe.test(typeof n.className === "string" ? n.className : "")) return true;
    }
    return false;
  };
  const byIds = (ids: string | null) => clean((ids ?? "").split(/\s+/).filter(Boolean).map((i) => document.getElementById(i)?.textContent ?? "").join(" "));
  const nearText = (e: HTMLElement) => {
    let n: HTMLElement | null = e;
    for (let i = 0; i < 3 && n; i++) {
      const p = n.previousElementSibling as HTMLElement | null;
      if (p && clean(p.innerText)) return clean(p.innerText).slice(0, 120);
      n = n.parentElement;
    }
    return "";
  };
  const labelOfField = (e: HTMLElement) => {
    const inp = e as HTMLInputElement;
    if (inp.labels && inp.labels.length) return clean(Array.from(inp.labels).map((l) => l.innerText).join(" "));
    return byIds(e.getAttribute("aria-labelledby")) || clean(e.getAttribute("aria-label")) || clean(inp.placeholder) || clean(e.getAttribute("title")) || nearText(e) || inp.name || "";
  };
  const groupOf = (e: HTMLInputElement) => {
    const lg = e.closest("fieldset")?.querySelector("legend");
    if (lg && clean(lg.textContent)) return clean(lg.textContent);
    const rg = e.closest("[role=radiogroup], [role=group]");
    if (rg) {
      const t = byIds(rg.getAttribute("aria-labelledby")) || clean(rg.getAttribute("aria-label"));
      if (t) return t;
    }
    // Climb until the container holds every choice of this question; its text minus the options' labels is the question.
    const same = e.name ? Array.from(document.getElementsByName(e.name)) : [e];
    let n: HTMLElement | null = e.parentElement;
    for (let i = 0; i < (same.length > 1 ? 6 : 3) && n; i++, n = n.parentElement) {
      const box: HTMLElement = n;
      if (!same.every((s) => box.contains(s))) continue;
      let t = box.innerText || "";
      for (const s of same) {
        const l = (s as HTMLInputElement).labels?.[0]?.innerText;
        if (l) t = t.replace(l, " ");
      }
      t = clean(t);
      if (t.length > 3) return t.slice(0, 260);
    }
    return "";
  };

  document.querySelectorAll("[data-wid]").forEach((x) => x.removeAttribute("data-wid"));
  const forms = Array.from(document.forms);
  const sel =
    "input:not([type=hidden]), select, textarea, button, a[href], summary, [role=button], [role=tab], [role=option], [role=combobox], [role=radio], [role=checkbox], [role=switch], [role=menuitem], [aria-expanded]";
  const seen = new Set<Element>();
  const controls: { e: HTMLElement; el: Omit<UiEl, "id"> }[] = [];
  const buttons: typeof controls = [];
  const links: typeof controls = [];
  const personalAuto = /^(name|given-name|family-name|additional-name|honorific|email|tel|tel-|street-address|address-line|address-level|postal-code|bday|sex|username|current-password|new-password|cc-)/i;
  for (const e of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
    if (seen.has(e)) continue;
    seen.add(e);
    const tag = e.tagName.toLowerCase();
    const inp = e as HTMLInputElement;
    const type = (tag === "input" || tag === "button" ? inp.type || "" : "").toLowerCase();
    const role = (e.getAttribute("role") || "").toLowerCase();
    const isChoice = tag === "input" && (type === "radio" || type === "checkbox");
    // A native dropdown hidden behind a custom widget (the widget's button is visible next to it) still counts.
    const widgetSelect = tag === "select" && !visible(e) && !!e.parentElement && visible(e.parentElement) && (e as HTMLSelectElement).options.length > 1;
    if (!widgetSelect && (isChoice ? !choiceVisible(inp) : !visible(e))) continue;
    if (inCookieBanner(e)) continue;
    let kind: UiKind | null;
    if (tag === "select") kind = "select";
    else if (tag === "textarea") kind = "text";
    else if (tag === "input") {
      if (type === "radio") kind = "radio";
      else if (type === "checkbox") kind = "checkbox";
      else if (type === "submit" || type === "image") kind = "submit";
      else if (type === "button" || type === "reset") kind = "button";
      else if (type === "file" || type === "color" || type === "range") kind = null;
      else kind = "text";
    } else if (role === "tab") kind = "tab";
    else if (role === "option" || role === "menuitem") kind = "option";
    else if (role === "combobox" || (tag === "button" && /^(true|listbox|menu)$/i.test(e.getAttribute("aria-haspopup") || ""))) kind = "combo";
    else if (role === "radio") kind = "radio";
    else if (role === "checkbox" || role === "switch") kind = "checkbox";
    else if (tag === "summary") kind = "toggle";
    else if (tag === "a") kind = e.hasAttribute("aria-expanded") ? "toggle" : "link";
    else if (tag === "button") kind = e.hasAttribute("aria-expanded") ? "toggle" : type === "submit" && (e as HTMLButtonElement).form ? "submit" : "button";
    else kind = e.hasAttribute("aria-expanded") ? "toggle" : "button";
    if (!kind) continue;
    const isField = kind === "text" || kind === "select" || kind === "radio" || kind === "checkbox";
    const label = isField
      ? kind === "radio" || kind === "checkbox"
        ? clean(inp.labels?.[0]?.innerText) || clean(e.getAttribute("aria-label")) || byIds(e.getAttribute("aria-labelledby")) || clean(e.innerText) || inp.value || ""
        : labelOfField(e)
      : clean(e.innerText) || clean(inp.value) || clean(e.getAttribute("aria-label")) || clean(e.getAttribute("title")) || clean(e.querySelector("img")?.getAttribute("alt"));
    if (!label && (kind === "link" || kind === "button")) continue;
    const ac = (e.getAttribute("autocomplete") || "").toLowerCase();
    const formEl = (inp.form as HTMLFormElement | null) ?? e.closest("form");
    const el: Omit<UiEl, "id"> = {
      kind,
      type,
      name: inp.name || e.id || "",
      label: label.slice(0, kind === "checkbox" || kind === "radio" ? 300 : 140),
      group: kind === "radio" || kind === "checkbox" ? (role ? clean(e.closest("[role=radiogroup], [role=group], fieldset")?.getAttribute("aria-label")) : groupOf(inp)) : "",
      value: kind === "select" ? clean((e as HTMLSelectElement).selectedOptions?.[0]?.textContent) : kind === "text" ? inp.value ?? "" : "",
      checked: role ? e.getAttribute("aria-checked") === "true" : !!inp.checked,
      selected: e.getAttribute("aria-selected") === "true",
      expanded: e.hasAttribute("aria-expanded") ? e.getAttribute("aria-expanded") === "true" : tag === "summary" ? !!e.closest("details")?.open : null,
      options: kind === "select" ? Array.from((e as HTMLSelectElement).options).map((o) => clean(o.textContent)).slice(0, 400) : [],
      form: formEl ? forms.indexOf(formEl as HTMLFormElement) : -1,
      chrome: !!e.closest("header, nav, footer, [role=navigation], [role=banner], [role=contentinfo]"),
      href: tag === "a" ? (e as HTMLAnchorElement).href : "",
      newTab: tag === "a" && (e as HTMLAnchorElement).target === "_blank",
      autocomplete: kind === "text" && (role === "combobox" || e.hasAttribute("aria-autocomplete") || !!inp.getAttribute("list") || e.hasAttribute("aria-owns") || /autocomplete|typeahead|suggest/i.test(e.className)),
      disabled: !!(inp.disabled || e.getAttribute("aria-disabled") === "true"),
      required: !!inp.required || e.getAttribute("aria-required") === "true",
      personal: kind === "text" && (type === "email" || type === "tel" || type === "password" || personalAuto.test(ac)),
    };
    (isField || kind === "combo" ? controls : kind === "link" ? links : buttons).push({ e, el });
  }
  const mainFirst = <T extends { el: { chrome: boolean } }>(xs: T[]) => [...xs.filter((x) => !x.el.chrome), ...xs.filter((x) => x.el.chrome)];
  const picked = [...mainFirst(controls).slice(0, 160), ...mainFirst(buttons).slice(0, 80), ...mainFirst(links).slice(0, args.linkCap)];
  const els: UiEl[] = picked.map((p, id) => {
    p.e.setAttribute("data-wid", String(id));
    return { id, ...p.el };
  });

  const errors = Array.from(document.querySelectorAll('[role=alert], [aria-live=assertive], [class*="error" i]'))
    .filter((n) => visible(n) && !inCookieBanner(n))
    .map((n) => clean((n as HTMLElement).innerText))
    .filter((t) => t.length > 2 && t.length < 300);
  const main = (document.querySelector("main, [role=main]") as HTMLElement | null) ?? document.body;
  let text = (main.innerText || "").length > 300 ? main.innerText : document.body.innerText;
  text = text.replace(/[ \t ]+/g, " ").replace(/\s*\n\s*/g, "\n").trim().slice(0, args.textCap);
  return {
    url: location.href,
    title: document.title,
    headings: Array.from(document.querySelectorAll("h1, h2, h3")).filter(visible).map((h) => clean(h.textContent)).filter(Boolean).slice(0, 8),
    errors: Array.from(new Set(errors)).slice(0, 6),
    text,
    els,
    // Only a challenge the user would have to solve: visible, real size, not an invisible score badge.
    captchaFrames: Array.from(document.querySelectorAll("iframe"))
      .filter((f) => /captcha|turnstile|challenge/i.test(f.src) && !/size=invisible/i.test(f.src) && visible(f) && f.getBoundingClientRect().width > 120 && f.getBoundingClientRect().height > 50)
      .map((f) => f.src),
    passwordBox: Array.from(document.querySelectorAll("input[type=password]")).some(visible),
  };
}

/** A login, CAPTCHA or bot check on the page, found by code. Never bypassed. */
export function detectWall(s: Snapshot): Wall | undefined {
  const head = `${s.title}\n${s.text.slice(0, 1500)}`;
  let path = "";
  try {
    path = new URL(s.url).pathname + new URL(s.url).search;
  } catch {
    /* about:blank */
  }
  if (s.captchaFrames.length || /captcha|bot-?check|challenge-?platform/i.test(path) || /verify (that )?you are (a )?human|are you a robot|complete the (security )?(captcha|check)|i'?m not a robot/i.test(head)) {
    return { kind: "captcha", detail: "The page shows a CAPTCHA / human check. Stopped: the user has to do this themselves.", url: s.url };
  }
  if (/^(just a moment|attention required|access denied|request blocked|forbidden|service unavailable|blocked)\b/i.test(s.title) || /checking your browser|verify(ing)? your browser|enable javascript and cookies to continue|(request|access) (is|was|has been) (blocked|denied)|unusual traffic|automated (queries|requests|access)/i.test(head.slice(0, 600))) {
    return { kind: "bot_check", detail: `The site blocked automated access ("${s.title.slice(0, 60)}").`, url: s.url };
  }
  const fields = s.els.filter((e) => e.kind === "text" && !e.chrome);
  if (s.passwordBox && fields.length <= 4) return { kind: "login", detail: "The page asks the user to sign in. Stopped: the agent never signs in.", url: s.url };
  return undefined;
}

const opt = (o: string) => o.replace(/\s+/g, " ").trim();
const PLACEHOLDER_OPTION = /^(?:[-–—]+|(?:please\s+)?(?:choose|select|pick)\b|any\b|all\b|none selected)/i;

/** Compact text view of the page for the model. `focus` words float matching dropdown options to the top. */
export function formatSnapshot(s: Snapshot, o: { focus?: string[]; text?: number; only?: (e: UiEl) => boolean; maxOptions?: number } = {}): string {
  const focus = (o.focus ?? []).map((w) => w.toLowerCase()).filter((w) => w.length > 2);
  const maxOptions = o.maxOptions ?? 70;
  const lines = [`PAGE: ${s.title} (${s.url})`];
  if (s.headings.length) lines.push(`HEADINGS: ${s.headings.join(" | ")}`);
  if (s.errors.length) lines.push(`ERRORS SHOWN: ${s.errors.join(" | ")}`);
  if (o.text !== 0) lines.push(`PAGE TEXT:\n${s.text.slice(0, o.text ?? 1800)}`);
  lines.push("ELEMENTS (id, kind, label ...):");
  for (const e of s.els) {
    if (o.only && !o.only(e)) continue;
    const bits: string[] = [`[${e.id}] ${e.kind}`];
    if (e.type && e.kind === "text" && e.type !== "text") bits.push(`(${e.type})`);
    bits.push(JSON.stringify(e.label));
    if (e.group) bits.push(`question=${JSON.stringify(e.group.slice(0, 200))}`);
    if (e.kind === "text") bits.push(`value=${JSON.stringify(e.value.slice(0, 60))}`);
    if (e.kind === "select") {
      let opts = e.options;
      if (opts.length > maxOptions) {
        const hit = opts.filter((x) => focus.some((w) => x.toLowerCase().includes(w)));
        opts = [...new Set([...hit, ...opts])].slice(0, maxOptions);
      }
      bits.push(`selected=${JSON.stringify(e.value)} options=${JSON.stringify(opts)}${e.options.length > opts.length ? ` (+${e.options.length - opts.length} more)` : ""}`);
    }
    if (e.kind === "radio" || e.kind === "checkbox") bits.push(e.checked ? "[checked]" : "[unchecked]");
    if (e.kind === "tab" && e.selected) bits.push("[selected]");
    if (e.expanded !== null) bits.push(e.expanded ? "[expanded]" : "[collapsed]");
    if (e.autocomplete) bits.push("[autocomplete]");
    if (e.form >= 0) bits.push(`form#${e.form}`);
    if (e.chrome) bits.push("(site header/nav/footer)");
    if (e.disabled) bits.push("(disabled)");
    if (e.href && e.kind === "link") bits.push(`-> ${e.href.slice(0, 110)}`);
    lines.push(bits.join(" "));
  }
  return lines.join("\n");
}

export const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};
const say = (e: unknown) => (e instanceof Error ? e.message : String(e)).split("\n")[0].slice(0, 140);

/** The element tagged by the last snapshot. */
export const byId = (page: Page, id: number) => page.locator(`[data-wid="${id}"]`).first();

/** Wait for a click's consequences: navigation, XHR results, re-render. */
export async function settle(page: Page, ms = 900) {
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

/** Click an element the way a person would; links that open a new tab are followed in this tab instead. */
export async function clickEl(page: Page, el: UiEl): Promise<string> {
  const loc = byId(page, el.id);
  try {
    if (el.kind === "link" && el.newTab && el.href && /^https?:/.test(el.href)) {
      await page.goto(el.href, { waitUntil: "domcontentloaded", timeout: 30000 });
      return "ok";
    }
    await pointAt(page, loc);
    try {
      await loc.click({ timeout: 5000 });
    } catch {
      // Overlays (sticky headers, chat widgets) can sit on top: a real click on what is visible, then a DOM click.
      if (el.kind === "radio" || el.kind === "checkbox") await loc.check({ force: true, timeout: 3000 });
      else await loc.evaluate((n) => (n as HTMLElement).click());
    }
    return "ok";
  } catch (e) {
    return `error: ${say(e)}`;
  }
}

/** Tick a radio or checkbox, including custom-drawn ones whose input is hidden. */
export async function tick(page: Page, el: UiEl, on = true): Promise<string> {
  const loc = byId(page, el.id);
  await pointAt(page, loc);
  try {
    if (["checkbox", "radio"].includes(el.type)) {
      try {
        await loc.setChecked(on, { timeout: 4000 });
      } catch {
        await loc.setChecked(on, { force: true, timeout: 4000 });
      }
    } else if (el.checked !== on) await loc.click({ timeout: 4000 });
    return "ok";
  } catch (e) {
    return `error: ${say(e)}`;
  }
}

/** The best option of a native dropdown for a wanted label: exact, then case-insensitive, then containment. */
export function matchOption(options: string[], want: string): string | undefined {
  const w = norm(want);
  if (!w) return undefined;
  return (
    options.find((o) => opt(o) === opt(want)) ??
    options.find((o) => norm(o) === w) ??
    options.find((o) => norm(o).startsWith(w) || w.startsWith(norm(o)) && norm(o).length > 2) ??
    options.find((o) => norm(o).includes(w) || (norm(o).length > 3 && w.includes(norm(o))))
  );
}

/** Suggestions a page shows under a box after typing (autocomplete lists, custom dropdown menus), tagged data-wopt. */
export async function popupOptions(page: Page): Promise<{ i: number; text: string }[]> {
  await page.evaluate("window.__name = window.__name || ((f) => f)").catch(() => {});
  return page
    .evaluate(() => {
      document.querySelectorAll("[data-wopt]").forEach((x) => x.removeAttribute("data-wopt"));
      // Common autocomplete patterns (ARIA listboxes, suggestion lists of popular widgets), not any one site.
      const sel =
        '[role=listbox] [role=option], [role=option], [role=menu] [role=menuitem], [class*="autocomplete" i] li, [class*="suggest" i] li, [class*="typeahead" i] li, [class*="suggestion" i], [class*="autocomplete-item" i], .pac-item, [class*="dropdown-menu" i] li, [class*="results" i][class*="auto" i] li';
      const out: { i: number; text: string }[] = [];
      const seen = new Set<string>();
      for (const n of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
        const r = n.getBoundingClientRect();
        const s = getComputedStyle(n);
        if (r.width < 2 || r.height < 2 || s.visibility === "hidden" || s.display === "none") continue;
        if (n.closest("select")) continue;
        const t = (n.innerText || n.textContent || "").replace(/\s+/g, " ").trim();
        if (!t || t.length > 160 || seen.has(t)) continue;
        // Skip a container whose child options are listed too.
        if (n.querySelector("[role=option], li")) continue;
        seen.add(t);
        n.setAttribute("data-wopt", String(out.length));
        out.push({ i: out.length, text: t });
        if (out.length >= 25) break;
      }
      return out;
    })
    .catch(() => []);
}

/* ================================================================== criteria whitelist (safety, in code) */

const tokens = (s: string) => norm(s).split(" ").filter(Boolean);
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The text that may be typed for `wanted`: the exact piece of one criterion value whose words are `wanted`'s words
 * in order (the whole value, one of its "/"-separated alternatives, or a shorter run of its words, e.g. a broader
 * term). Anything else returns null and is not typed. This is what lets search_directory press Search safely.
 */
export function termFromCriteria(wanted: string, criteria: Criterion[]): { text: string; criterion: Criterion } | null {
  const t = tokens(wanted);
  if (!t.length) return null;
  // Each alternative of a criterion ("Cardiff / CF10") is typed on its own, never two glued together.
  const alts = criteria.flatMap((c) =>
    c.value
      .split(/\s*(?:\/|;|\||,|\bor\b)\s*/i)
      .filter((a) => tokens(a).length)
      .map((a) => ({ value: a.trim(), criterion: c })),
  );
  const run = (needle: string[], hay: string[]) => {
    for (let i = 0; i + needle.length <= hay.length; i++) if (needle.every((x, j) => x === hay[i + j])) return true;
    return false;
  };
  for (const a of alts) {
    if (!run(t, tokens(a.value))) continue;
    // Recover the original spelling from the criterion itself (case, punctuation inside the run).
    const re = new RegExp(t.map((x) => escapeRe(x)).join("[^\\p{L}\\p{N}]+"), "iu");
    const m = a.value.match(re);
    return { text: m ? m[0] : t.join(" "), criterion: a.criterion };
  }
  // Wanted text spanning several alternatives: type the first alternative it contains.
  const inside = alts.find((a) => run(tokens(a.value), t));
  return inside ? { text: inside.value, criterion: inside.criterion } : null;
}

/** Labels of boxes the search worker must never tick, whatever the model says. */
const NEVER_TICK = /agree|consent|terms|privacy|subscribe|newsletter|marketing|remember me|keep me signed/i;

/* ================================================================== model calls */

const FormPlan = z.object({
  state: z.enum(["search_form", "results", "wrong_page"]).describe("search_form: a directory search form is on screen; results: this already lists directory results; wrong_page: the search is elsewhere"),
  reasoning: z.string().describe("one or two plain sentences: which form/tab you use and why"),
  reveal: z.array(z.number()).describe("ids of tabs, links or toggles to click BEFORE filling (the right search tab, 'advanced search', 'more filters'); empty if the visible form can already take the criteria"),
  fills: z.array(
    z.object({
      id: z.number(),
      criterion: z.number().describe("index into CRITERIA"),
      text: z.string().nullable().describe("text boxes only: the search term, a piece of the criterion's value"),
      option: z.string().nullable().describe("dropdowns, custom dropdowns, radios, checkboxes: the option exactly as listed (the closest one)"),
    }),
  ),
  unmapped: z.array(z.number()).describe("criteria indexes this form has no field for"),
  submitId: z.number().nullable().describe("the button that runs THIS form's search; null if the form searches by itself or none exists"),
});

const SuggestionPick = z.object({ index: z.number().describe("-1 if none fits"), why: z.string() });

const Extracted = z.object({
  pageKind: z.enum(["results", "no_results", "search_form", "error", "other"]).describe("no_results: the site itself says nothing matched; search_form: the search did not run (still the empty form); error: the site reported an error"),
  searchTookEffect: z.boolean().describe("does the page show that THIS search ran (the criteria echoed back, a results heading, or a 'no results for' message)? false for stale or unrelated listings"),
  why: z.string().describe("one sentence: what this page shows (e.g. 'Showing 1-10 of 84 firms near Cardiff')"),
  total: z.string().nullable().describe("the page's own count of results, if shown"),
  results: z.array(
    z.object({
      name: z.string().describe("exactly as on the page"),
      address: z.string().nullable(),
      town: z.string().nullable(),
      postcode: z.string().nullable(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
      registration: z.string().nullable().describe("registration / membership / ID number shown for the entry, with its label (e.g. 'SRA ID: 123456')"),
      website: z.string().nullable().describe("the entry's own website (a full URL from LINKS when possible), not the directory's"),
      specialisms: z.string().nullable().describe("areas of law / specialisms / services, as listed"),
      distance: z.string().nullable(),
      detailLinkId: z.number().nullable().describe("id from LINKS of this entry's own 'view details'/profile page on the directory"),
      other: z.array(z.object({ key: z.string(), value: z.string() })).describe("other useful labelled facts (accreditations, legal aid, offices)"),
      fits: z.boolean().describe("does the page's own text for this entry match ALL criteria (e.g. right area and specialism)? false if it visibly does not"),
    }),
  ),
  criteria: z.array(z.object({ index: z.number(), honoured: z.enum(["yes", "no", "unclear"]), evidence: z.string() })).describe("for each criterion: did the results respect it?"),
  expandIds: z.array(z.number()).describe("ids of collapsed in-page toggles/buttons that reveal hidden details OF THE RESULTS (e.g. 'view details', 'show contact details'); not navigation"),
  nextId: z.number().nullable().describe("id of the control to the NEXT page of results or 'load more'/'show more results'; null if none"),
});

const Details = z.object({
  isEntryPage: z.boolean().describe("is this page about the entry named in ENTRY?"),
  address: z.string().nullable(),
  town: z.string().nullable(),
  postcode: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  registration: z.string().nullable(),
  website: z.string().nullable(),
  specialisms: z.string().nullable(),
  other: z.array(z.object({ key: z.string(), value: z.string() })),
});

const RULES_TEXT =
  "You drive a website's own search UI for a person. Work only from what the page shows. You never invent facts. You never type anything except search terms taken from the given criteria.";

/* ================================================================== the worker */

type Used = { label: string; value: string };
type Attempt = { used: Used[]; outcome: string };
type Entry = DirectoryResult & { fits: boolean; key: string };

export async function searchDirectory(
  ctx: WorkerCtx,
  opts: { url: string; goal: string; criteria: Criterion[]; maxResults?: number; maxPages?: number; detailPages?: number },
): Promise<DirectorySearch> {
  const { page, note } = ctx;
  const maxResults = opts.maxResults ?? 15;
  const maxPages = opts.maxPages ?? 3;
  const criteria = opts.criteria.filter((c) => c.value.trim());
  const host = hostOf(opts.url);
  const log = (kind: Parameters<typeof note.log>[0], text: string, extra: Parameters<typeof note.log>[2] = {}) => note.log(kind, text, extra).catch(() => {});
  const act = () => ctx.track.bump("action");
  let pagesRead = 0;
  let recoveries = 0;
  const done = (r: Omit<DirectorySearch, "pagesRead" | "outcome">, outcome?: DirectorySearch["outcome"]): DirectorySearch => ({
    ...r,
    pagesRead,
    outcome: outcome ?? (r.ok ? "results" : r.wall && ["login", "captcha", "bot_check", "payment"].includes(r.wall.kind) ? "wall" : "search_failed"),
  });
  let sawNoResults = false;

  note(`Opening ${host}`);
  try {
    await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: 35000 });
  } catch (e) {
    return done({ ok: false, results: [], searchedWith: [], wall: { kind: "dead_end", detail: `Could not open the page: ${say(e)}`, url: opts.url }, summary: `Could not open ${host}.` });
  }
  await settle(page, 600);
  if ((await dismissCookies(page, 4000)) !== "none") await settle(page, 300);
  const first = await snapshot(page);
  const wall0 = detectWall(first);
  if (wall0) {
    await log("fail", `Stopped at ${host}: ${wall0.detail}`, { shot: true });
    return done({ ok: false, results: [], searchedWith: [], wall: wall0, summary: wall0.detail });
  }
  await log("open", `Opened ${host} to use its own search`, { shot: true, detail: `Goal: ${opts.goal}\nCriteria: ${criteria.map((c) => `${c.label} = ${c.value}`).join("; ")}` });

  const attempts: Attempt[] = [];
  let best: { entries: Entry[]; used: Used[]; ignored: string[] } | null = null;
  let final: { entries: Entry[]; used: Used[] } | null = null;

  for (let attempt = 0; attempt <= MAX_RECOVERIES; attempt++) {
    if (attempt > 0) {
      recoveries++;
      await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: 35000 }).catch(() => {});
      await settle(page, 500);
      await dismissCookies(page, 1500);
    }
    const form = await runSearchForm(ctx, criteria, opts.goal, attempts, log, act);
    if (form.wall) return done({ ok: false, results: [], searchedWith: form.used, wall: form.wall, summary: form.wall.detail });
    if (!form.searched) {
      attempts.push({ used: form.used, outcome: `could not run the search: ${form.problem}` });
      await log("recover", `The search did not run (${form.problem}). Trying another way`, { shot: true });
      continue;
    }
    const read = await readResults(ctx, criteria, opts.goal, maxResults, maxPages, log, act);
    pagesRead += read.pages;
    if (read.wall) return done({ ok: false, results: [], searchedWith: form.used, wall: read.wall, summary: read.wall.detail });
    if (read.entries.length === 0) {
      if (read.kind === "no_results") sawNoResults = true;
      attempts.push({ used: form.used, outcome: `no results (${read.why})` });
      if (attempt < MAX_RECOVERIES)
        await log("recover", `No results for ${describe(form.used)}: ${read.why}. Changing the search (another form of the place, a broader term, or one filter fewer)`, { shot: true });
      continue;
    }
    if (read.ignored.length && attempt < MAX_RECOVERIES && (!best || best.entries.length < read.entries.length)) {
      best = { entries: read.entries, used: form.used, ignored: read.ignored };
      attempts.push({ used: form.used, outcome: `results came back but the site ignored: ${read.ignored.join(", ")}` });
      await log("recover", `The site ignored ${read.ignored.join(" and ")} (${read.entries.length} results that do not all match). Searching again another way`, { shot: true });
      continue;
    }
    final = { entries: read.entries, used: form.used };
    if (read.ignored.length) best = { entries: read.entries, used: form.used, ignored: read.ignored };
    break;
  }

  if (!final && best) final = { entries: best.entries, used: best.used };
  if (final && best && final.entries === best.entries && best.ignored.length) {
    // The site would not apply a filter: keep the entries whose own text matches all criteria (judged per entry).
    const fitting = final.entries.filter((e) => e.fits);
    if (fitting.length && fitting.length < final.entries.length) {
      recoveries++;
      await log("recover", `The site would not filter by ${best.ignored.join(" and ")}, so the agent kept the ${fitting.length} of ${final.entries.length} results whose own listing matches`, {
        detail: final.entries.filter((e) => !e.fits).map((e) => `dropped: ${e.name} (${e.detail})`).join("\n"),
      });
      final = { ...final, entries: fitting };
    }
  }
  if (!final || final.entries.length === 0) {
    const summary = `Searched ${host} ${attempts.length} way(s), no results: ${attempts.map((a) => `${describe(a.used)} -> ${a.outcome}`).join("; ")}`;
    await log("fail", summary, { shot: true });
    return done({ ok: false, results: [], searchedWith: attempts.at(-1)?.used ?? [], wall: { kind: "not_found", detail: summary, url: page.url() }, summary }, sawNoResults ? "no_results" : "search_failed");
  }

  let entries = final.entries.slice(0, maxResults);
  entries = await openDetailPages(ctx, entries, opts.detailPages ?? 3, log, act);
  const results: DirectoryResult[] = entries.map(({ name, detail, url, fields }) => ({ name, detail, ...(url ? { url } : {}), fields }));
  const summary = `Found ${results.length} on ${host} using its own search (${describe(final.used)}), ${pagesRead} result page(s) read${recoveries ? `, ${recoveries} recovery step(s)` : ""}.`;
  note(`Found ${results.length} on ${host}`);
  await log("result", summary, { detail: results.map((r, i) => `${i + 1}. ${r.name}: ${r.detail}`).join("\n") });
  return done({ ok: true, results, searchedWith: final.used, summary });
}

const describe = (used: Used[]) => (used.length ? used.map((u) => `${u.label} "${u.value}"`).join(", ") : "no criteria set");

type Log = (kind: "open" | "click" | "type" | "pick" | "decide" | "read" | "found" | "check" | "recover" | "fail" | "result", text: string, extra?: { shot?: boolean; detail?: string; confidence?: number }) => Promise<void>;

/** Find the right search form, fill it from the criteria, press its Search. */
async function runSearchForm(
  ctx: WorkerCtx,
  criteria: Criterion[],
  goal: string,
  attempts: Attempt[],
  log: Log,
  act: () => void,
): Promise<{ searched: boolean; used: Used[]; problem?: string; wall?: Wall }> {
  const { page, note } = ctx;
  const revealed = new Set<string>();
  const used: Used[] = [];
  const focus = criteria.flatMap((c) => tokens(c.value));
  for (let step = 0; step < 6; step++) {
    const snap = await snapshot(page, { linkCap: 50 });
    const wall = detectWall(snap);
    if (wall) {
      await log("fail", wall.detail, { shot: true });
      return { searched: false, used, wall };
    }
    note(step === 0 ? "Reading the search form" : "Looking at the form again");
    const input = [
      `GOAL: ${goal}`,
      `CRITERIA:\n${criteria.map((c, i) => `${i}. ${c.label}: ${c.value}`).join("\n")}`,
      attempts.length
        ? `EARLIER ATTEMPTS THAT FAILED (change approach: try the location in another form it is given in, e.g. postcode instead of town or the reverse; a broader term (fewer words of the criterion); a different but close dropdown option; or leave one filter out):\n${attempts.map((a, i) => `${i + 1}. ${describe(a.used)} -> ${a.outcome}`).join("\n")}`
        : "",
      revealed.size ? `ALREADY CLICKED (do not click again): ${[...revealed].join(" | ")}` : "",
      `CURRENT PAGE:\n${formatSnapshot(snap, { focus, text: 1500 })}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const plan = await structured({
      model: MODEL,
      effort: EFFORT,
      name: "directory_search_form",
      data: ["place"],
      schema: FormPlan,
      instructions: `${RULES_TEXT}
Decide how to run the directory search that meets the GOAL on this page:
- Use the directory's own search form, not the site-wide search box in the header. If the page has several search forms or tabs (e.g. for firms, for individual people, for organisations), choose the one that matches the GOAL; if it is not the active one, put its tab in reveal.
- If a criterion has no field in the visible form but an "advanced search" / "more options" / "filters" control exists, put that control in reveal (once).
- If the search is on another page, set state wrong_page and put the link to it in reveal.
- Map each criterion onto the best field. Text boxes: text must be a piece of the criterion value (the whole value, one alternative of it, or fewer of its words). Dropdowns / radios / checkboxes: option = the closest listed option for the criterion (a broader category is fine, e.g. an injury category for a negligence specialism); never pick an option that only matches by accident.
- Do not fill fields for names of people or firms. Leave fields with no matching criterion alone.
- submitId: this form's search button.`,
      input,
    });
    await log("decide", plan.reasoning.slice(0, 220), {
      detail: [
        plan.reveal.length ? `Open first: ${plan.reveal.map((id) => snap.els.find((e) => e.id === id)?.label ?? id).join(", ")}` : "",
        ...plan.fills.map((f) => `${criteria[f.criterion]?.label ?? "?"} -> [${f.id}] ${snap.els.find((e) => e.id === f.id)?.label ?? "?"}: ${f.text ?? f.option ?? "(tick)"}`),
        plan.unmapped.length ? `No field for: ${plan.unmapped.map((i) => criteria[i]?.label).join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    });
    if (plan.state === "results" && step === 0 && attempts.length === 0 && plan.fills.length === 0) return { searched: true, used };

    // 1) Reveal the right tab / advanced filters first, then look again.
    let revealedNow = 0;
    for (const id of plan.reveal.slice(0, 3)) {
      const el = snap.els.find((e) => e.id === id);
      if (!el || revealed.has(el.label)) continue;
      revealed.add(el.label);
      note(`Opening "${el.label.slice(0, 40)}"`);
      const r = await clickEl(page, el);
      act();
      await log("click", `Opened "${el.label.slice(0, 60)}"${r === "ok" ? "" : ` (${r})`}`, { shot: true });
      revealedNow++;
      await settle(page, 600);
    }
    if (revealedNow) continue;

    // 2) Fill the fields.
    const urlBefore = page.url();
    let lastTyped: UiEl | null = null;
    for (const f of plan.fills) {
      const el = snap.els.find((e) => e.id === f.id);
      const c = criteria[f.criterion];
      if (!el || !c || el.disabled) continue;
      if (el.personal) {
        await log("check", `Left "${el.label}" alone: it asks for personal details`);
        continue;
      }
      const r = await applyFill(page, el, f, c, criteria, log, act, note);
      if (r) {
        used.push(r);
        if (el.kind === "text") lastTyped = el;
      }
      if (page.url() !== urlBefore) break; // picking a suggestion ran the search by itself
    }
    if (page.url() !== urlBefore) {
      await settle(page);
      return { searched: true, used };
    }
    if (used.length === 0 && plan.fills.length > 0) return { searched: false, used, problem: "none of the chosen fields could be set" };
    if (used.length === 0 && criteria.length > 0) return { searched: false, used, problem: plan.reasoning };

    // 3) Press this form's Search (or Enter in the last box typed).
    const submit = plan.submitId === null ? undefined : snap.els.find((e) => e.id === plan.submitId);
    let handle: ElementHandle | null = null;
    if (submit) handle = await byId(page, submit.id).elementHandle({ timeout: 2000 }).catch(() => null);
    note("Searching");
    const formSig = sigOf(await snapshot(page, { linkCap: 0 }));
    if (handle && submit) {
      await dismissCookies(page, 600); // a banner that comes back can swallow the click
      await pointAt(page, byId(page, submit.id)).catch(() => {});
      await handle.click({ timeout: 6000 }).catch(async () => handle!.evaluate((n) => (n as HTMLElement).click()).catch(() => {}));
      act();
      await log("click", `Pressed "${(submit.label || "the search button").slice(0, 40)}"`);
      await settle(page, 1200);
      if (sigOf(await snapshot(page, { linkCap: 0 })) === formSig) {
        // The button did not respond (overlays, script not ready). Submit the same form the way a keyboard user would.
        const box = lastTyped ? await byId(page, lastTyped.id).elementHandle({ timeout: 1500 }).catch(() => null) : null;
        if (box) await box.press("Enter").catch(() => {});
        else await handle.evaluate((n) => (n as HTMLButtonElement).form?.requestSubmit()).catch(() => {});
        act();
        await log("recover", `"${(submit.label || "Search").slice(0, 30)}" did not respond; submitted the same search with ${box ? "Enter" : "the form itself"}`);
        await settle(page, 1200);
        if (sigOf(await snapshot(page, { linkCap: 0 })) === formSig) {
          await handle.evaluate((n) => (n as HTMLButtonElement).form?.requestSubmit()).catch(() => {});
          await settle(page, 1200);
        }
      }
      return { searched: true, used };
    } else if (lastTyped) {
      await byId(page, lastTyped.id).press("Enter").catch(() => {});
      act();
      await log("click", `Pressed Enter in "${lastTyped.label.slice(0, 40)}"`);
    } else if (used.length) {
      await log("check", "Set the filters; the page searches by itself");
    }
    await settle(page, 1200);
    return { searched: true, used };
  }
  return { searched: false, used, problem: "could not find the search form" };
}

/** Set one field from one criterion. Returns what was used, or null. */
async function applyFill(
  page: Page,
  el: UiEl,
  f: { text: string | null; option: string | null },
  c: Criterion,
  criteria: Criterion[],
  log: Log,
  act: () => void,
  note: (s: string) => void,
): Promise<Used | null> {
  const loc = byId(page, el.id);
  if (el.kind === "text") {
    const term = termFromCriteria(f.text ?? c.value, criteria);
    if (!term) {
      await log("check", `BLOCKED: "${(f.text ?? "").slice(0, 40)}" is not part of the search criteria, so it was not typed`);
      return null;
    }
    note(`Typing "${term.text}"`);
    await pointAt(page, loc);
    try {
      await loc.click({ timeout: 4000 }).catch(() => {});
      await loc.fill("", { timeout: 4000 });
      await loc.pressSequentially(term.text, { delay: 45, timeout: 5000 });
    } catch {
      // The page re-rendered the form under us: find the same box again by its name and label, and type once more.
      const again = (await snapshot(page)).els.find((x) => x.kind === "text" && x.name === el.name && x.label === el.label);
      el.id = again?.id ?? el.id;
    }
    try {
      const box = byId(page, el.id);
      if ((await box.inputValue({ timeout: 3000 })) !== term.text) {
        // Key-by-key typing can stall in a background tab (timers are throttled); set the value with input events instead.
        await box.fill(term.text, { timeout: 5000 });
        await box.dispatchEvent("keyup").catch(() => {});
      }
    } catch (e) {
      await log("check", `Could not type into "${el.label}": ${say(e)}`);
      return null;
    }
    act();
    await page.waitForTimeout(1300);
    const sug = await popupOptions(page);
    if (sug.length === 0) {
      await log("type", `Typed "${term.text}" into "${el.label.slice(0, 50)}"`);
      return { label: c.label, value: term.text };
    }
    // Autocomplete: pick the suggestion that best means this criterion.
    let pick = sug.find((s) => norm(s.text) === norm(term.text));
    let why = "exact match";
    if (!pick) {
      const r = await structured({
        model: MODEL,
        effort: EFFORT,
        name: "directory_suggestion",
        data: ["place"],
        schema: SuggestionPick,
        instructions: "A search box shows autocomplete suggestions. Pick the one that best means the criterion (same place / same specialism). -1 if none does.",
        input: `CRITERION: ${c.label} = ${c.value}\nTYPED: ${term.text}\nSUGGESTIONS:\n${sug.map((s) => `${s.i}. ${s.text}`).join("\n")}`,
      });
      pick = sug.find((s) => s.i === r.index);
      why = r.why;
    }
    if (!pick) {
      await page.keyboard.press("Escape").catch(() => {});
      await log("type", `Typed "${term.text}" into "${el.label.slice(0, 50)}"; none of the ${sug.length} suggestions fit, kept the typed text`, { detail: sug.map((s) => s.text).join("\n") });
      return { label: c.label, value: term.text };
    }
    const optLoc = page.locator(`[data-wopt="${pick.i}"]`).first();
    await pointAt(page, optLoc);
    await optLoc.click({ timeout: 4000 }).catch(() => optLoc.evaluate((n) => (n as HTMLElement).click()).catch(() => {}));
    act();
    await page.waitForTimeout(500);
    await log("pick", `Typed "${term.text}" and picked the suggestion "${pick.text.slice(0, 60)}"`, { detail: `Suggestions: ${sug.map((s) => s.text).join(" | ")}\nWhy: ${why}` });
    return { label: c.label, value: pick.text };
  }
  if (el.kind === "select") {
    const choice = matchOption(el.options, f.option ?? c.value);
    if (!choice || PLACEHOLDER_OPTION.test(choice)) {
      await log("check", `No option of "${el.label}" fits ${c.label}`);
      return null;
    }
    await pointAt(page, loc);
    try {
      await loc.selectOption({ label: choice }, { timeout: 5000, force: true });
    } catch {
      const value = await loc.evaluate((s, want) => Array.from((s as HTMLSelectElement).options).find((o) => o.textContent?.replace(/\s+/g, " ").trim() === want)?.value ?? null, choice).catch(() => null);
      // force: a native dropdown hidden behind a custom widget; the page's own change handler updates the widget.
      if (value === null || !(await loc.selectOption(value, { timeout: 4000, force: true }).then(() => true, () => false))) return null;
    }
    act();
    note(`Chose "${choice}"`);
    await log("pick", `Chose "${choice}" in "${el.label.slice(0, 40)}" for ${c.label} "${c.value}"`);
    await page.waitForTimeout(500);
    return { label: c.label, value: choice };
  }
  if (el.kind === "radio" || el.kind === "checkbox") {
    if (NEVER_TICK.test(el.label)) {
      await log("check", `Left "${el.label.slice(0, 50)}" unticked: it is a consent box`);
      return null;
    }
    const r = await tick(page, el);
    act();
    await log("click", `Ticked "${el.label.slice(0, 60)}" for ${c.label}${r === "ok" ? "" : ` (${r})`}`);
    return r === "ok" ? { label: c.label, value: el.label } : null;
  }
  const isDropdownButton = (el.kind === "button" || el.kind === "toggle") && !!f.option && norm(f.option) !== norm(el.label);
  if (el.kind === "combo" || isDropdownButton) {
    // A custom dropdown: open it, then pick from its own list.
    await clickEl(page, el);
    act();
    await page.waitForTimeout(700);
    const sug = await popupOptions(page);
    const want = f.option ?? c.value;
    const hit = sug.find((s) => norm(s.text) === norm(want)) ?? sug.find((s) => norm(s.text).includes(norm(want)) || norm(want).includes(norm(s.text)));
    if (!hit) {
      await page.keyboard.press("Escape").catch(() => {});
      await log("check", `The list "${el.label}" has no option like "${want}"`, { detail: sug.map((s) => s.text).join(" | ") });
      return null;
    }
    const optLoc = page.locator(`[data-wopt="${hit.i}"]`).first();
    await pointAt(page, optLoc);
    await optLoc.click({ timeout: 4000 }).catch(() => {});
    act();
    await log("pick", `Chose "${hit.text}" in "${el.label.slice(0, 40)}"`);
    return { label: c.label, value: hit.text };
  }
  if (el.kind === "button" || el.kind === "toggle" || el.kind === "option" || el.kind === "tab") {
    // Filter chips and toggle buttons.
    const r = await clickEl(page, el);
    act();
    await log("click", `Chose the filter "${el.label.slice(0, 50)}" for ${c.label}`);
    await page.waitForTimeout(500);
    return r === "ok" ? { label: c.label, value: el.label } : null;
  }
  return null;
}

/** Read the results, opening hidden details and following pagination. Entries are checked against the page text. */
async function readResults(
  ctx: WorkerCtx,
  criteria: Criterion[],
  goal: string,
  maxResults: number,
  maxPages: number,
  log: Log,
  act: () => void,
): Promise<{ entries: Entry[]; pages: number; ignored: string[]; why: string; kind: string; wall?: Wall }> {
  const { page, note } = ctx;
  const out = new Map<string, Entry>();
  const ignored = new Set<string>();
  let pages = 0;
  let why = "";
  let kind = "other";
  let lastSig = "";
  while (pages < maxPages) {
    let snap = await snapshot(page, { textCap: 15000, linkCap: 160 });
    const wall = detectWall(snap);
    if (wall) {
      await log("fail", wall.detail, { shot: true });
      return { entries: [...out.values()], pages, ignored: [...ignored], why: wall.detail, kind: "wall", wall };
    }
    note(`Reading results page ${pages + 1}`);
    let ex = await extract(snap, criteria, goal);
    if (ex.expandIds.length) {
      const toOpen = ex.expandIds.map((id) => snap.els.find((e) => e.id === id)).filter((e): e is UiEl => !!e && e.kind !== "submit" && (e.kind !== "link" || samePage(e.href, snap.url)) && e.expanded !== true).slice(0, 25);
      // Accordions often close one section when the next opens, so keep what each one revealed as it opens.
      const seenLines = new Set(snap.text.split("\n"));
      const revealed: string[] = [];
      for (const el of toOpen) {
        await clickEl(page, el);
        act();
        await page.waitForTimeout(350);
        const fresh = (await mainText(page)).split("\n").filter((l) => l.trim() && !seenLines.has(l));
        fresh.forEach((l) => seenLines.add(l));
        if (fresh.length) revealed.push(`[details opened under "${el.label.slice(0, 60)}"]\n${fresh.join("\n").slice(0, 1200)}`);
      }
      if (toOpen.length) {
        await settle(page, 500);
        await log("click", `Opened ${toOpen.length} "${toOpen[0].label.slice(0, 30)}" section(s) to see the hidden details`);
        snap = await snapshot(page, { textCap: 15000, linkCap: 160 });
        if (revealed.length) snap.text = `${snap.text}\n\nDETAILS REVEALED ONE BY ONE:\n${revealed.join("\n").slice(0, 16000)}`;
        ex = await extract(snap, criteria, goal);
      }
    }
    pages++;
    why = ex.why;
    kind = ex.searchTookEffect || ex.pageKind === "no_results" ? ex.pageKind : "search_form";
    if (!ex.searchTookEffect && ex.pageKind === "results" && pages === 1) {
      // A listing that does not reflect this search (stale or default results) is not an answer.
      await log("check", `The page lists entries but does not show that this search ran (${ex.why}); not trusting them`, { shot: true });
      why = `the search did not take effect: ${ex.why}`;
      break;
    }
    const before = out.size;
    const { kept, dropped } = verify(ex, snap);
    for (const e of kept) {
      const prev = out.get(e.key);
      if (prev) Object.assign(prev.fields, { ...e.fields, ...prev.fields });
      else out.set(e.key, e);
    }
    for (const c of ex.criteria) if (c.honoured === "no" && criteria[c.index]) ignored.add(criteria[c.index].label);
    await log(ex.pageKind === "results" ? "found" : "read", `Results page ${pages}: ${ex.why}${kept.length ? `. Read ${out.size - before} new entr${out.size - before === 1 ? "y" : "ies"}` : ""}`, {
      shot: true,
      detail: [
        ...kept.map((e) => `${e.name}: ${e.detail}`),
        dropped.length ? `Not kept (not found in the page text): ${dropped.join(", ")}` : "",
        ...ex.criteria.map((c) => `${criteria[c.index]?.label ?? "?"}: ${c.honoured} (${c.evidence})`),
      ]
        .filter(Boolean)
        .join("\n"),
    });
    if (ex.pageKind !== "results" || out.size >= maxResults || ex.nextId === null) break;
    const next = snap.els.find((e) => e.id === ex.nextId);
    if (!next) break;
    lastSig = sigOf(snap);
    note(`Next page of results`);
    await clickEl(page, next);
    act();
    await settle(page, 1000);
    const after = await snapshot(page, { textCap: 15000, linkCap: 0 });
    if (sigOf(after) === lastSig) {
      await log("check", `"${next.label.slice(0, 30)}" did not change the results; stopping at ${pages} page(s)`);
      break;
    }
    await log("click", `Went to the next results ("${next.label.slice(0, 30)}")`);
  }
  return { entries: [...out.values()], pages, ignored: [...ignored], why, kind };
}

/** Visible text of the main content, one line per block. */
async function mainText(page: Page): Promise<string> {
  return page
    .evaluate(() => {
      const main = (document.querySelector("main, [role=main]") as HTMLElement | null) ?? document.body;
      const t = (main.innerText || "").length > 300 ? main.innerText : document.body.innerText;
      return t.replace(/[ \t\u00a0]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
    })
    .catch(() => "");
}

/** Same document, only the #fragment differs (in-page anchors and accordions). */
export const samePage = (href: string, url: string) => {
  try {
    const a = new URL(href, url);
    const b = new URL(url);
    return a.origin === b.origin && a.pathname === b.pathname && a.search === b.search;
  } catch {
    return false;
  }
};

const sigOf = (s: Snapshot) => `${s.url}|${s.text.length}|${s.text.slice(0, 400)}|${s.text.slice(-400)}`;

async function extract(snap: Snapshot, criteria: Criterion[], goal: string) {
  const controls = formatSnapshot(snap, { text: 0, only: (e) => !e.chrome && ["button", "toggle", "submit", "link", "tab"].includes(e.kind) });
  return structured({
    model: MODEL,
    effort: EFFORT,
    name: "directory_extract",
    data: ["place"],
    schema: Extracted,
    instructions: `${RULES_TEXT}
Read a directory's results page. Extract every entry in the results list (not adverts, navigation, or the directory's own contact details). Copy names, addresses, phone numbers and emails exactly as the page shows them; null when the page does not show them. For website and detailLinkId use LINKS (ELEMENTS of kind link). Judge each criterion: was it honoured by the results (e.g. are the entries near the requested place)? List in expandIds only collapsed toggles (buttons, or links to an anchor on this page) that hide details of the listed entries. nextId: the next page / load more control of the results, never a page number already shown.`,
    input: `GOAL: ${goal}\nCRITERIA:\n${criteria.map((c, i) => `${i}. ${c.label}: ${c.value}`).join("\n")}\n\nPAGE: ${snap.title} (${snap.url})\n${snap.errors.length ? `ERRORS SHOWN: ${snap.errors.join(" | ")}\n` : ""}PAGE TEXT:\n${snap.text}\n\n${controls}`,
  });
}

const digits = (s: string) => s.replace(/\D+/g, "");
const bareUrl = (u: string) => u.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");

/** Keep only what the page really shows: names, phones and emails are checked against the page text by code. */
function verify(ex: z.infer<typeof Extracted>, snap: Snapshot): { kept: Entry[]; dropped: string[] } {
  const text = norm(snap.text);
  const textDigits = digits(snap.text);
  const hrefs = snap.els.filter((e) => e.href).map((e) => e.href);
  const dirHost = hostOf(snap.url);
  const kept: Entry[] = [];
  const dropped: string[] = [];
  for (const r of ex.results) {
    const name = r.name.replace(/\s+/g, " ").trim();
    if (!name || !text.includes(norm(name))) {
      dropped.push(name || "(no name)");
      continue;
    }
    const fields: Record<string, string> = {};
    const put = (k: string, v: string | null | undefined) => {
      const t = (v ?? "").replace(/\s+/g, " ").trim();
      if (t) fields[k] = t.slice(0, 300);
    };
    put("address", r.address);
    put("town", r.town);
    put("postcode", r.postcode);
    if (r.phone && digits(r.phone).length >= 6 && textDigits.includes(digits(r.phone))) put("phone", r.phone);
    if (r.email && (snap.text.toLowerCase().includes(r.email.toLowerCase()) || hrefs.some((h) => h.toLowerCase() === `mailto:${r.email!.toLowerCase()}`))) put("email", r.email);
    if (r.website) {
      const w = bareUrl(r.website);
      const href = hrefs.find((h) => /^https?:/.test(h) && bareUrl(h) === w) ?? hrefs.find((h) => /^https?:/.test(h) && w.length > 4 && bareUrl(h).startsWith(w));
      if (href && hostOf(href) !== dirHost) put("website", href);
      else if (!href && snap.text.toLowerCase().includes(w)) put("website", /^https?:/.test(r.website) ? r.website : `https://${w}`);
      if (fields.website) fields.domain = hostOf(fields.website);
    }
    put("registration", r.registration);
    // A registration number counts only if its digits are really on the page.
    if (fields.registration && (!digits(fields.registration).length || !textDigits.includes(digits(fields.registration)))) delete fields.registration;
    put("specialisms", r.specialisms);
    put("distance", r.distance);
    for (const o of r.other.slice(0, 6)) put(o.key.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 30), o.value);
    const link = r.detailLinkId === null ? undefined : snap.els.find((e) => e.id === r.detailLinkId && e.href);
    // A link to an anchor on this same page is an expander, not the entry's own page.
    const url = link && /^https?:/.test(link.href) && !samePage(link.href, snap.url) ? link.href : undefined;
    const detail = [fields.town ?? fields.address, fields.phone, fields.email, fields.website ? hostOf(fields.website) : "", fields.specialisms?.slice(0, 80), fields.distance].filter(Boolean).join(" · ");
    kept.push({ name, detail, url, fields, fits: r.fits, key: `${norm(name)}|${norm(fields.postcode ?? fields.town ?? fields.address ?? "").slice(0, 24)}` });
  }
  return { kept, dropped };
}

/** For entries whose contact details the list hides, open their own directory page and read them there. */
async function openDetailPages(ctx: WorkerCtx, entries: Entry[], limit: number, log: Log, act: () => void): Promise<Entry[]> {
  const { page, note } = ctx;
  const need = entries.filter((e) => e.url && (!e.fields.phone || !e.fields.email || !e.fields.website)).slice(0, limit);
  for (const e of need) {
    note(`Opening ${e.name.slice(0, 30)}`);
    try {
      await page.goto(e.url!, { waitUntil: "domcontentloaded", timeout: 25000 });
      await settle(page, 500);
      act();
      const snap = await snapshot(page, { textCap: 8000, linkCap: 80 });
      if (detectWall(snap)) break;
      const d = await structured({
        model: MODEL,
        effort: EFFORT,
        name: "directory_details",
        data: ["place"],
        schema: Details,
        instructions: `${RULES_TEXT}\nRead this directory entry's own page and copy its contact details and specialisms exactly as shown. null for anything not shown. For website use the entry's own site from LINKS, not the directory's.`,
        input: `ENTRY: ${e.name}\nPAGE TEXT:\n${snap.text}\n\n${formatSnapshot(snap, { text: 0, only: (x) => x.kind === "link" && !x.chrome })}`,
      });
      if (!d.isEntryPage) continue;
      const ex = { pageKind: "results" as const, searchTookEffect: true, why: "", total: null, criteria: [], expandIds: [], nextId: null, results: [{ name: e.name, ...d, distance: null, detailLinkId: null, fits: e.fits }] };
      const [v] = verify(ex, snap).kept;
      if (!v) continue;
      const added = Object.keys(v.fields).filter((k) => !e.fields[k]);
      e.fields = { ...v.fields, ...e.fields };
      e.detail = [e.fields.town ?? e.fields.address, e.fields.phone, e.fields.email, e.fields.website ? hostOf(e.fields.website) : "", e.fields.specialisms?.slice(0, 80), e.fields.distance].filter(Boolean).join(" · ");
      await log("read", `Opened ${e.name}'s own entry${added.length ? ` and read its ${added.join(", ")}` : ""}`, { shot: true, detail: e.detail });
    } catch (err) {
      await log("check", `Could not open ${e.name}'s entry: ${say(err)}`);
    }
  }
  return entries;
}
