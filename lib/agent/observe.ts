import type { Page } from "playwright";

export type ElKind = "text" | "textarea" | "select" | "radio" | "checkbox" | "submit" | "button" | "link";

export type El = {
  id: number;
  kind: ElKind;
  name: string;
  label: string;
  group: string; // question text for radios, if we can find it
  required: boolean;
  value: string; // current value (selected option text for selects)
  checked: boolean;
  options: string[];
  disabled: boolean;
};

export type Observation = {
  url: string;
  title: string;
  headings: string[];
  errors: string[];
  text: string; // visible text of the main content, trimmed (questionnaire pages put the question here)
  elements: El[];
};

/**
 * Turn the live page into a short list of things the agent can act on.
 * Each element is tagged data-aid=<id> so actions can find it again.
 * Hidden, off-screen and honeypot fields are left out on purpose: filling a spam trap gets a form rejected.
 */
export async function observe(page: Page): Promise<Observation> {
  // A click can start a navigation; wait for it to settle and retry instead of crashing.
  for (let attempt = 0; ; attempt++) {
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 10000 }).catch(() => {});
      return await observeOnce(page);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (attempt >= 3 || !/Execution context was destroyed|navigation|Target closed/i.test(msg)) throw e;
      await page.waitForTimeout(500);
    }
  }
}

async function observeOnce(page: Page): Promise<Observation> {
  return page.evaluate(() => {
    document.querySelectorAll("[data-aid]").forEach((x) => x.removeAttribute("data-aid"));
    const text = (n: Element | null | undefined) => (n?.textContent ?? "").replace(/\s+/g, " ").trim();
    const visible = (e: Element) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return (
        r.width > 4 && r.height > 4 && r.right > 0 && r.left > -50 &&
        s.visibility !== "hidden" && s.display !== "none" && parseFloat(s.opacity) > 0.05 &&
        !e.closest('[aria-hidden="true"]')
      );
    };
    // Many sites hide the real radio/checkbox (opacity 0) and draw their own box on the label.
    // Count those controls as visible when their label is.
    const visibleControl = (e: HTMLInputElement) => {
      if (visible(e)) return true;
      const lab = e.labels?.[0];
      const s = getComputedStyle(e);
      return !!lab && visible(lab) && s.display !== "none" && s.visibility !== "hidden" && !e.closest('[aria-hidden="true"]');
    };
    const trap = /(^|[-_])hp$|honey|trap|bot[-_]?field/i;
    const labelOf = (e: HTMLInputElement) => {
      if (e.labels && e.labels.length) return text(e.labels[0]);
      const by = e.getAttribute("aria-labelledby");
      if (by) return by.split(" ").map((i) => text(document.getElementById(i))).join(" ").trim();
      const own = e.getAttribute("aria-label") || e.placeholder;
      if (own) return own;
      // No linked label: use the text of the row the field sits in (e.g. "* Confirm email:"), else its name.
      const row = e.closest("tr, li, p, .form-row, .row, div");
      const near = text(row).slice(0, 60);
      return near || e.name || "";
    };
    const groupOf = (e: Element) => {
      const lg = e.closest("fieldset")?.querySelector("legend");
      if (lg) return text(lg);
      const wrap = e.closest(".nf-field-container, .form-group, .field");
      return text(wrap?.querySelector(".nf-field-label, .field-label, .group-label"));
    };

    const out: El[] = [];
    let id = 0;
    const nodes = document.querySelectorAll<HTMLElement>("input:not([type=hidden]), select, textarea, button, a[href]");
    for (const e of nodes) {
      const t0 = (e as HTMLInputElement).type;
      const isChoice = e.tagName === "INPUT" && (t0 === "radio" || t0 === "checkbox");
      if (isChoice ? !visibleControl(e as HTMLInputElement) : !visible(e)) continue;
      if (e.closest("header, nav, footer, [role=navigation], [role=banner]")) continue;
      const el = e as HTMLInputElement & HTMLSelectElement;
      const name = el.name || el.id || "";
      if (trap.test(name) || trap.test(el.id) || trap.test(el.className?.toString?.() ?? "")) continue;

      const tag = e.tagName.toLowerCase();
      const type = (el.type || "").toLowerCase();
      let kind: ElKind;
      if (tag === "a") kind = "link";
      else if (tag === "select") kind = "select";
      else if (tag === "textarea") kind = "textarea";
      else if (tag === "button") kind = type === "submit" ? "submit" : "button";
      else if (type === "submit" || type === "image") kind = "submit";
      else if (type === "button" || type === "reset") kind = "button";
      else if (type === "radio") kind = "radio";
      else if (type === "checkbox") kind = "checkbox";
      else kind = "text";

      const label =
        kind === "link" || kind === "button" || kind === "submit"
          ? text(e) || el.value || el.getAttribute("aria-label") || ""
          : labelOf(el);
      if (kind === "link" && !label) continue;

      e.setAttribute("data-aid", String(id));
      out.push({
        id: id++,
        kind,
        name,
        // 240, not 140: when the agent asks the user a form's question, it shows this label (Yellow Card's 150-character "mistake in the prescription…" question was cut off).
        label: label.slice(0, kind === "checkbox" ? 500 : 240),
        group: kind === "radio" || kind === "checkbox" ? groupOf(e).slice(0, 140) : "",
        required: el.required || e.getAttribute("aria-required") === "true" || /(^\s*\*|\*\s*$)/.test(label),
        value: kind === "select" ? text(el.selectedOptions?.[0]) : kind === "radio" || kind === "checkbox" ? "" : el.value ?? "",
        checked: !!el.checked,
        options: kind === "select" ? Array.from(el.options).map((o) => text(o)) : [],
        disabled: !!el.disabled,
      });
      if (out.length >= 80) break;
    }

    const errors = Array.from(document.querySelectorAll("[role=alert], .nf-error-msg, .nf-error, .error, .field-error"))
      .filter((n) => visible(n))
      .map((n) => text(n))
      .filter(Boolean)
      .slice(0, 5);
    const headings = Array.from(document.querySelectorAll("h1, h2")).filter(visible).map((n) => text(n)).slice(0, 4);
    const main = document.querySelector("main") ?? document.body;
    const pageText = ((main as HTMLElement).innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 2500);
    return { url: location.href, title: document.title, headings, errors, text: pageText, elements: out };
  });
}

/** Dropdown text that means "nothing chosen": "Please select...", "Choose", or just dashes ("--"). */
export const PLACEHOLDER = /^(?:[-–—]+|(?:please\s+choose|please\s+select|select|choose)\b)/i;

/** Required fields that are still empty. Done in code from the DOM so we never trust the model's "I filled it all". */
export function unfilledRequired(o: Observation): string[] {
  const missing: string[] = [];
  const radioGroups = new Map<string, { label: string; any: boolean; required: boolean }>();
  for (const e of o.elements) {
    if (e.kind === "text" || e.kind === "textarea") {
      if (e.required && e.value.trim() === "") missing.push(e.label || e.name);
    } else if (e.kind === "select") {
      if (e.required && (e.value.trim() === "" || PLACEHOLDER.test(e.value.trim()))) missing.push(e.label || e.name);
    } else if (e.kind === "radio") {
      const g = radioGroups.get(e.name) ?? { label: e.group || e.name, any: false, required: false };
      g.any ||= e.checked;
      g.required ||= e.required;
      radioGroups.set(e.name, g);
    }
  }
  for (const g of radioGroups.values()) if (g.required && !g.any) missing.push(g.label);
  return missing;
}

/** Compact text view for the model. */
export function formatObservation(o: Observation): string {
  const lines = [`PAGE: ${o.title} (${o.url})`];
  if (o.headings.length) lines.push(`HEADINGS: ${o.headings.join(" | ")}`);
  if (o.errors.length) lines.push(`ERRORS ON PAGE: ${o.errors.join(" | ")}`);
  if (o.text) lines.push(`PAGE TEXT (start): ${o.text.slice(0, 1200)}`);
  lines.push("ELEMENTS:");
  for (const e of o.elements) {
    const req = e.required ? " *required*" : "";
    const dis = e.disabled ? " (disabled)" : "";
    let desc: string;
    if (e.kind === "radio" || e.kind === "checkbox") {
      desc = `${e.kind} "${e.label}"${e.group ? ` in group "${e.group}"` : ""} [${e.checked ? "checked" : "unchecked"}]`;
    } else if (e.kind === "select") {
      desc = `select "${e.label}" value="${e.value}" options=${JSON.stringify(e.options)}`;
    } else if (e.kind === "text" || e.kind === "textarea") {
      desc = `${e.kind} "${e.label}" value=${JSON.stringify(e.value.length > 80 ? e.value.slice(0, 80) + "…" : e.value)}`;
    } else {
      desc = `${e.kind} "${e.label}"`;
    }
    lines.push(`[${e.id}] ${desc}${req}${dis}`);
  }
  return lines.join("\n");
}
