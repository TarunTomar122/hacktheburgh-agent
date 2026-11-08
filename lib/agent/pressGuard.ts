import type { Page } from "playwright";

/**
 * Press guard: what code may press on a page that holds the user's answers.
 *
 * A link or button with an innocent label ("Continue", "Next", "Proceed", "Go on") can still carry a JavaScript handler
 * that sends the form. So on a page where any answer has been entered, code never presses a control just because its
 * label sounds harmless. Progression must be VERIFIED:
 *   - a link: a real `<a href>` to another same-origin page, no handler attribute (onclick, data-action, hx-*, ...), no
 *     script listener on it (read from the browser's own listener table), not in or tied to a `<form>`, not `#`,
 *     empty or `javascript:`. Such a link is then followed by NAVIGATING to its address (never by clicking it), so no
 *     click handler anywhere on the page can run.
 *   - a button (`type=button`, or a submit with a handler): not verified here; the caller needs positive evidence of a
 *     later step, and the press runs behind `withoutSends`.
 * Anything else is refused and reported as "needs your input".
 */

/** Attribute names that wire a script (or a library) to a control. */
const HANDLER_ATTR = /^(?:on[a-z]+|data-(?:action|onclick|click|handler|method|remote|turbo[a-z-]*|confirm|submit|form|target|toggle|bs-[a-z-]+)|ng-click|v-on:.*|@click.*|x-on:.*|hx-[a-z-]+|ping|download|formaction|formmethod|formtarget)$/i;
/** Script listeners that can fire when a person presses a control. */
const PRESS_EVENTS = new Set(["click", "mousedown", "mouseup", "pointerdown", "pointerup", "auxclick", "touchstart", "touchend", "keydown", "keyup", "keypress", "dblclick", "submit", "focus", "focusin"]);

export type ControlAudit = {
  tag: string;
  inputType: string;
  href: string | null;
  /** What makes this control script-driven (handler attributes, listeners, role=button, a bad href). Empty = nothing found. */
  handlers: string[];
  /** What ties it to a form (inside one, form attribute, controls one). */
  ties: string[];
  inForm: boolean;
  sameOrigin: boolean;
  /** The resolved address (links only). */
  to: string | null;
  /** A link that code may follow with page.goto: real address, same origin, no handler, no form tie. */
  plainLink: boolean;
  /** The same, but the origin may differ (for a page where nothing has been entered). */
  plainLinkAnyOrigin: boolean;
};

/** Was anything entered or chosen on this page? A filled text box, a chosen option, a ticked box. */
export async function pageHasAnswers(page: Page): Promise<boolean> {
  return page
    .evaluate(() => {
      for (const e of Array.from(document.querySelectorAll<HTMLInputElement>("input, textarea, select"))) {
        const t = (e.type || "").toLowerCase();
        if (["hidden", "submit", "button", "image", "reset", "file", "search"].includes(t) || e.disabled) continue;
        if (e.tagName === "SELECT") { if ((e as unknown as HTMLSelectElement).selectedIndex > 0 && (e.value ?? "").trim()) return true; continue; }
        if (t === "radio" || t === "checkbox") { if (e.checked) return true; continue; }
        if ((e.value ?? "").trim()) return true;
      }
      return false;
    })
    .catch(() => true); // cannot tell: assume yes
}

/** Script listeners on the element itself, from the browser's own table (Chromium). Null when it cannot be read. */
async function listenerTypes(page: Page, id: string | number): Promise<string[] | null> {
  try {
    const cdp = await page.context().newCDPSession(page);
    try {
      const { result } = await cdp.send("Runtime.evaluate", { expression: `document.querySelector('[data-aid="${String(id).replace(/[^0-9]/g, "")}"]')` });
      if (!result.objectId) return null;
      const { listeners } = await cdp.send("DOMDebugger.getEventListeners", { objectId: result.objectId });
      return listeners.map((l) => l.type).filter((t) => PRESS_EVENTS.has(t));
    } finally {
      await cdp.detach().catch(() => {});
    }
  } catch {
    return null;
  }
}

/** Everything code can read about how a control is wired, from the live DOM. */
export async function auditControl(page: Page, id: string | number): Promise<ControlAudit | null> {
  const raw = await page
    .locator(`[data-aid="${id}"]`)
    .evaluate((el, { attrSrc }) => {
      const A = new RegExp(attrSrc, "i");
      const handlers: string[] = [];
      for (const a of Array.from(el.attributes)) if (A.test(a.name)) handlers.push(`attribute ${a.name}`);
      const role = (el.getAttribute("role") ?? "").toLowerCase();
      // role=button on a real <a href> is only styling (GOV.UK start buttons); on anything else it is a script control.
      if ((role === "button" || role === "menuitem" || role === "tab") && el.tagName !== "A") handlers.push(`role=${role}`);
      const ties: string[] = [];
      if (el.hasAttribute("form")) ties.push("tied to a form (form attribute)");
      const inForm = !!el.closest("form");
      if (inForm) ties.push("inside a <form>");
      const ctl = el.getAttribute("aria-controls");
      if (ctl && document.getElementById(ctl)?.closest("form, form *")) ties.push("controls a form");
      const tag = el.tagName.toLowerCase();
      const href = tag === "a" ? el.getAttribute("href") : null;
      let to: string | null = null;
      let sameOrigin = false;
      if (href !== null) {
        const h = href.trim();
        if (!h || h.startsWith("#") || /^javascript:/i.test(h)) handlers.push("href is empty, # or javascript:");
        else {
          try {
            const u = new URL(h, location.href);
            if (!/^https?:$/.test(u.protocol)) handlers.push(`not a web address (${u.protocol})`);
            else {
              to = u.toString();
              sameOrigin = u.origin === location.origin;
              const here = new URL(location.href); here.hash = ""; const there = new URL(u.toString()); there.hash = "";
              if (here.toString() === there.toString()) handlers.push("points at this same page");
            }
          } catch { handlers.push("unreadable address"); }
        }
        // A link's own target: _blank etc. are fine (followed by address); a form-targeting data attribute was caught above.
      }
      return { tag, inputType: ((el as HTMLInputElement).type ?? "").toLowerCase(), href, handlers, ties, inForm, sameOrigin, to };
    }, { attrSrc: HANDLER_ATTR.source })
    .catch(() => null);
  if (!raw) return null;
  const listeners = await listenerTypes(page, id);
  const handlers = [...raw.handlers, ...(listeners && listeners.length ? [`script listener (${[...new Set(listeners)].join(", ")})`] : [])];
  const isLink = raw.tag === "a" && raw.to !== null;
  const clean = handlers.length === 0 && raw.ties.length === 0;
  return { ...raw, handlers, plainLink: isLink && clean && raw.sameOrigin, plainLinkAnyOrigin: isLink && clean };
}

/**
 * Whether code may press a link on this page, and why not. `answers`: something has been entered, so a link must be
 * same-origin and verifiably plain. With nothing entered, a plain link to anywhere is fine (it carries nothing).
 */
export async function linkVerdict(page: Page, id: string | number, answers: boolean): Promise<{ ok: true; to: string; why: string } | { ok: false; why: string }> {
  const a = await auditControl(page, id);
  if (!a) return { ok: false, why: "the link could not be read on the live page" };
  if (a.tag !== "a") return { ok: false, why: "it is not a plain link" };
  if (a.plainLink || (!answers && a.plainLinkAnyOrigin)) return { ok: true, to: a.to!, why: `a plain link to ${new URL(a.to!).pathname}: no script, no form` };
  const reasons = [...a.handlers, ...a.ties];
  if (!reasons.length) reasons.push(a.to && !a.sameOrigin ? "it leaves this site" : "no safe address");
  return { ok: false, why: `${reasons.slice(0, 3).join("; ")}; it could send the form` };
}

/** Follow a verified link by its address. A click is never used, so no click handler on the page can run. */
export async function followLink(page: Page, to: string): Promise<void> {
  await page.goto(to, { waitUntil: "domcontentloaded" });
}

/**
 * Run a press on a script-driven control with every write blocked: any request that is not a plain GET or HEAD (fetch,
 * XHR, form post, beacon) is aborted while it runs. Returns what it blocked, so the caller can report it.
 */
export async function withoutSends<T>(page: Page, run: () => Promise<T>, settleMs = 600): Promise<{ value: T; blocked: string[] }> {
  const blocked: string[] = [];
  const handler = async (route: import("playwright").Route) => {
    const m = route.request().method();
    if (m === "GET" || m === "HEAD") return route.fallback();
    blocked.push(`${m} ${route.request().url()}`);
    return route.abort();
  };
  await page.route("**/*", handler);
  try {
    const value = await run();
    await page.waitForTimeout(settleMs);
    return { value, blocked };
  } finally {
    await page.unroute("**/*", handler).catch(() => {});
  }
}
