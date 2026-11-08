import type { Page } from "playwright";
import { decide, probOf, type DAnswer, type DQuestion } from "./decisions";
import { formatObservation, observe, PLACEHOLDER, unfilledRequired, type El, type Observation } from "./observe";
import type { OnEvent } from "./events";
import type { BrowserRun, Value } from "./browserAgent";
import { pointAt } from "../agentCursor";

/**
 * Browser agent driven by the Decisions API. The model only CHOOSES (which saved value belongs in a field,
 * which option to select, whether the user agreed, what to click next). Our code does all the typing, so
 * text can only come from the saved values and cannot be invented.
 */

const NONE = "none";
const MIN_CONFIDENCE = 0.6; // below this, a non-"none" choice is treated as unsure. "none" is not gated: it only ever means "leave it".
const AGREE_PROBABILITY = 0.8;
const MAX_NAV_CHOICES = 60;

export type DecisionRunStats = { calls: number; ms: number; inputTokens: number };
export type DecisionRun = BrowserRun & { stats: DecisionRunStats };

export async function runDecisionAgent(opts: {
  page: Page;
  goal: string;
  values: Value[];
  maxSteps?: number;
  onEvent?: OnEvent;
  allowCheckboxes?: boolean;
  allowSubmit?: boolean;
  /** Multi-page forms: submit buttons whose label matches (e.g. /^next/i) may be clicked to move between pages. Anything else that submits stays blocked. */
  advance?: RegExp;
  /** Stop as soon as the page URL matches (e.g. a final review page). The agent touches nothing there and reports ready. */
  stopAtUrl?: RegExp;
  /** Elements the agent must leave alone, e.g. a 'resume saved complaint' login box. Called with each element and the page URL. */
  ignore?: (el: { label: string; name: string; kind: string }, url: string) => boolean;
  /**
   * Privacy (night plan, Phase 4b): the model sees each saved value's key and description, never the value itself.
   * Dropdowns and radios are answered with a key too, and code matches that key's value to an option. Values already
   * typed into the page are masked in what the model sees. Off by default (the Scotland flows rely on the old behaviour).
   */
  hideValues?: boolean;
}): Promise<DecisionRun> {
  const { page, goal, values } = opts;
  const emit: OnEvent = opts.onEvent ?? (() => {});
  const maxSteps = opts.maxSteps ?? 12;
  const byKey = new Map(values.filter((v) => v.value.trim()).map((v) => [v.key, v]));
  const stats: DecisionRunStats = { calls: 0, ms: 0, inputTokens: 0 };
  const attempted = new Set<string>(); // "kind:name:label" already tried, so a stubborn field cannot loop forever
  let unsure: string[] = [];

  const hide = !!opts.hideValues;
  const valuesText = hide
    ? [...byKey.values()].map((v) => (v.public ? `- ${v.key}: ${v.description}: ${JSON.stringify(v.value.slice(0, 120))} (not personal, shown)` : `- ${v.key}: ${v.description}`)).join("\n")
    : [...byKey.values()].map((v) => `- ${v.key} (${v.description}): ${JSON.stringify(v.value.length > 120 ? v.value.slice(0, 120) + "…" : v.value)}`).join("\n");
  const result = (status: BrowserRun["status"], summary: string, step: number, extra: Partial<BrowserRun> = {}): DecisionRun => ({
    status, summary, unfilled: [], steps: step, stats, ...extra,
  });

  for (let step = 1; step <= maxSteps; step++) {
    const obs = await observe(page);
    if (opts.ignore) obs.elements = obs.elements.filter((e) => !opts.ignore!(e, obs.url));
    emit({ type: "observe", step, url: obs.url, fields: obs.elements.length });
    if (opts.stopAtUrl?.test(obs.url)) return result("ready_to_submit", "Reached the final review page. Nothing was sent.", step);

    if (hide) await labelDuplicates(page, obs);
    const plan = buildQuestions(obs, byKey, goal, !!opts.allowSubmit, attempted, opts.advance, hide);
    if (plan.questions.length === 0) {
      // Nothing to decide on this page.
      return finish(page, opts, stats, step, unsure);
    }

    const shown = hide ? redactObservation(obs, [...byKey.values()]) : obs;
    const input = [`GOAL: ${goal}`, hide ? `SAVED VALUES (names only; the user's data itself is typed by code and never shown to you):\n${valuesText}` : `SAVED VALUES (the only data the user has provided):\n${valuesText}`, `CURRENT PAGE:\n${formatObservation(shown)}`].join("\n\n");
    const { answers, usage, ms } = await decide(input, plan.questions);
    stats.calls++; stats.ms += ms; stats.inputTokens += usage.input_tokens;
    const byName = new Map<string, DAnswer>(answers.map((a) => [a.name, a]));

    // 1) Fill, select, tick what the model chose.
    let acted = 0;
    for (const f of plan.fields) {
      const a = byName.get(f.q);
      attempted.add(f.sig);
      if (!a || a.type !== "choice") { if (f.required) unsure.push(`${f.el.label} (no answer)`); continue; }
      if (a.choice === NONE) { if (f.required) unsure.push(`${f.el.label} (no saved value fits)`); continue; }
      if (a.confidence < MIN_CONFIDENCE) { if (f.required) unsure.push(`${f.el.label} (unsure, confidence ${a.confidence.toFixed(2)})`); continue; }
      const res = await applyChoice(page, f.el, a.choice, byKey, hide);
      emit({ type: "action", step, tool: f.el.kind === "text" || f.el.kind === "textarea" ? "fill" : f.el.kind === "select" ? "select" : "check", args: { id: f.el.id, label: f.el.label.slice(0, 40), choice: a.choice, confidence: +a.confidence.toFixed(2) }, result: res });
      if (res === "ok") acted++;
      else unsure.push(`${f.el.label} (${res})`);
    }
    for (const g of plan.groups) {
      const a = byName.get(g.q);
      attempted.add(g.sig);
      if (!a || a.type !== "choice" || a.choice === NONE || a.confidence < MIN_CONFIDENCE) {
        if (g.required) unsure.push(`${g.label} (${a && a.type === "choice" ? (a.choice === NONE ? "no saved value fits" : "unsure") : "no answer"})`);
        continue;
      }
      const optionLabel = hide ? matchOption(byKey.get(a.choice)?.value ?? "", g.radios.map((r) => r.label)) : a.choice;
      const el = g.radios.find((r) => r.label === optionLabel);
      if (!el) { unsure.push(`${g.label} (chosen option not found)`); continue; }
      const res = await tickRadio(page, el);
      emit({ type: "action", step, tool: "check", args: { id: el.id, label: el.label.slice(0, 40), group: g.label.slice(0, 40), confidence: +a.confidence.toFixed(2) }, result: res });
      if (res === "ok") acted++;
    }
    for (const c of plan.checks) {
      const a = byName.get(c.q);
      attempted.add(c.sig);
      const p = a && a.type === "predicate" ? a.probability : 0;
      if (p < AGREE_PROBABILITY) continue; // user has not said yes: leave unticked
      if (!opts.allowCheckboxes) { emit({ type: "blocked", step, reason: `BLOCKED: model thinks the user agreed (p=${p.toFixed(2)}) but this task does not allow ticking consent boxes` }); continue; }
      const res = await tickCheckbox(page, c.el);
      emit({ type: "action", step, tool: "check", args: { id: c.el.id, label: c.el.label.slice(0, 40), probability: +p.toFixed(2) }, result: res });
      if (res === "ok") acted++;
    }
    if (acted > 0) { await page.waitForTimeout(200); continue; } // page changed: look again

    // 2) Nothing left to fill. Follow the model's navigation choice.
    const nav = byName.get("nav");
    if (!nav || nav.type !== "choice") return finish(page, opts, stats, step, unsure);
    emit({ type: "status", message: `nav: ${nav.choice} (confidence ${nav.confidence.toFixed(2)})` });
    if (nav.choice === "finish") return finish(page, opts, stats, step, unsure);
    if (nav.choice === "ask_user") {
      // If an unticked consent box is what's missing, ask about that specifically.
      const f = await finish(page, opts, stats, step, unsure);
      if (f.status === "needs_input" && f.question) return f;
      // Multi-page forms: nothing on this page is unresolved (only optional fields we have no data for, e.g. diversity
      // monitoring), so "ask" means the model is unsure, not that data is missing. Move on with the allowed "Next" button.
      const next = opts.advance && unsure.length === 0 && f.status === "ready_to_submit" ? obs.elements.find((e) => e.kind === "submit" && !e.disabled && opts.advance!.test(e.label.trim())) : undefined;
      if (next) {
        await page.locator(`[data-aid="${next.id}"]`).click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(700);
        emit({ type: "action", step, tool: "click", args: { id: next.id, label: next.label.slice(0, 40), reason: "nothing required left on this page" }, result: "ok" });
        unsure = [];
        continue;
      }
      return result("needs_input", "The model says it needs more information.", step, { unfilled: unsure, question: `I need more information to continue: ${unsure.join("; ") || "unclear what to do next"}` });
    }
    const id = Number(nav.choice.replace("click:", ""));
    const el = obs.elements.find((e) => e.id === id);
    // Never move on to the next page while something on this one is unresolved: the site would just show an error, or worse, accept a half-filled page.
    if (el?.kind === "submit" && unsure.length > 0) {
      emit({ type: "status", message: `Not advancing: ${unsure.join("; ")}` });
      return result("needs_input", "Some fields on this page could not be filled from the saved values.", step, { unfilled: unsure, question: `I could not fill: ${unsure.join("; ")}. Can you help with these?` });
    }
    if (!el || (el.kind === "submit" && !opts.allowSubmit && !opts.advance?.test(el.label.trim()))) return finish(page, opts, stats, step, unsure);
    try {
      await pointAt(page, page.locator(`[data-aid="${el.id}"]`));
      await page.locator(`[data-aid="${el.id}"]`).click({ timeout: 5000 });
      await page.waitForTimeout(700);
      emit({ type: "action", step, tool: "click", args: { id: el.id, label: el.label.slice(0, 40), confidence: +nav.confidence.toFixed(2) }, result: "ok" });
    } catch (e) {
      emit({ type: "action", step, tool: "click", args: { id: el.id }, result: `error: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}` });
    }
    unsure = []; // new page, new slate
  }
  return result("max_steps", "Ran out of steps.", maxSteps, { unfilled: unfilledRequired(await observe(page)) });
}

/** Ends the run, verifying against the live page (code decides, not the model). */
async function finish(page: Page, opts: { allowCheckboxes?: boolean }, stats: DecisionRunStats, step: number, unsure: string[]): Promise<DecisionRun> {
  const after = await observe(page);
  const unfilled = unfilledRequired(after);
  const pending = after.elements.filter((e) => e.kind === "checkbox" && !e.checked && !e.disabled && e.required);
  if (pending.length > 0 && !opts.allowCheckboxes) {
    return { status: "needs_input", summary: "The form needs the user's consent.", unfilled: [], steps: step, stats, question: `The form asks you to confirm: "${pending[0].label}". Do you agree?` };
  }
  if (unfilled.length > 0 || pending.length > 0) {
    return { status: "incomplete", summary: "Required fields are still empty.", unfilled: [...unfilled, ...pending.map((p) => p.label)], steps: step, stats };
  }
  return { status: "ready_to_submit", summary: unsure.length ? `Done. Left alone: ${unsure.join("; ")}` : "Done.", unfilled: [], steps: step, stats };
}

type Plan = {
  questions: DQuestion[];
  fields: { q: string; el: El; sig: string; required: boolean }[];
  groups: { q: string; label: string; radios: El[]; sig: string; required: boolean }[];
  checks: { q: string; el: El; sig: string }[];
};

/** The Decisions API rejects duplicate choice values (e.g. two options both called "Prefer not to say"). */
const uniq = (xs: string[]) => [...new Set(xs)];

function buildQuestions(obs: Observation, byKey: Map<string, Value>, goal: string, allowSubmit: boolean, attempted: Set<string>, advance?: RegExp, hide = false): Plan {
  const questions: DQuestion[] = [];
  const plan: Plan = { questions, fields: [], groups: [], checks: [] };
  // Values that are not personal (e.g. the organisation's name) are shown to the model, so it can pick the matching dropdown option.
  const valueChoices = [...byKey.values()].map((v) => ({ value: v.key, description: v.public ? `${v.description}: "${v.value.slice(0, 120)}"` : v.description }));
  const publicVals = [...byKey.values()].filter((v) => v.public);
  const sig = (kind: string, e: El) => `${kind}:${e.name}:${e.label}`;
  const isEmpty = (e: El) => e.value.trim() === "" || PLACEHOLDER.test(e.value.trim()) || /^open this select/i.test(e.value.trim()) || (hide && ANY_PLACEHOLDER.test(e.value.trim()));

  for (const e of obs.elements) {
    if (e.disabled) continue;
    if ((e.kind === "text" || e.kind === "textarea") && isEmpty(e) && !attempted.has(sig("f", e))) {
      const q = `f${e.id}`;
      questions.push({
        type: "choice", name: q,
        instructions: `Which saved value belongs in the ${e.kind === "textarea" ? "text area" : "text box"} [${e.id}] "${e.label}"? Answer "${NONE}" if none of the saved values fits it.`,
        choices: [...valueChoices, { value: NONE, description: "No saved value fits this field" }],
      });
      plan.fields.push({ q, el: e, sig: sig("f", e), required: e.required });
    } else if (e.kind === "select" && isEmpty(e) && !attempted.has(sig("s", e))) {
      const q = `s${e.id}`;
      const options = e.options.filter((o) => o.trim() && !PLACEHOLDER.test(o.trim()) && !/^open this select/i.test(o.trim()) && !(hide && ANY_PLACEHOLDER.test(o.trim())));
      if (options.length === 0) continue;
      questions.push(hide
        ? {
            type: "choice", name: q,
            instructions: `Which saved value answers the dropdown [${e.id}] "${e.label}" (options: ${JSON.stringify(uniq(options).slice(0, 30))})? ${publicVals.length ? "If a value shown in full matches one of the options, answer that option itself (prefixed option:). " : ""}Answer "${NONE}" if no saved value answers it.`,
            choices: [...valueChoices, ...(publicVals.length ? uniq(options).slice(0, 150).map((o) => ({ value: `option:${o}` })) : []), { value: NONE, description: "No saved value answers this" }],
          }
        : {
            type: "choice", name: q,
            instructions: `Which option of the dropdown [${e.id}] "${e.label}" should be selected, based on the saved values? Answer "${NONE}" if the saved values do not say.`,
            choices: [...uniq(options).map((o) => ({ value: o })), { value: NONE, description: "The saved values do not say" }],
          });
      plan.fields.push({ q, el: e, sig: sig("s", e), required: e.required });
    } else if (e.kind === "checkbox" && !e.checked && !attempted.has(sig("c", e))) {
      const q = `c${e.id}`;
      questions.push({
        type: "predicate", name: q,
        instructions: `Do the saved values say the user explicitly agreed to, or wants, this: "${e.label.slice(0, 300)}"? Only answer yes if the saved values clearly say so.`,
      });
      plan.checks.push({ q, el: e, sig: sig("c", e) });
    }
  }

  // Radio groups with nothing selected.
  const groups = new Map<string, El[]>();
  for (const e of obs.elements) if (e.kind === "radio" && !e.disabled) groups.set(e.name, [...(groups.get(e.name) ?? []), e]);
  let gi = 0;
  for (const [name, radios] of groups) {
    if (radios.some((r) => r.checked)) continue;
    const label = radios[0].group || name;
    const gsig = `g:${name}:${label}`;
    if (attempted.has(gsig)) continue;
    const q = `g${gi++}`;
    questions.push(hide
      ? {
          type: "choice", name: q,
          instructions: `Which saved value answers the question "${label}" (options: ${JSON.stringify(uniq(radios.map((r) => r.label)))})? Use the question text on the page. Answer "${NONE}" if no saved value answers it.`,
          choices: [...valueChoices, { value: NONE, description: "No saved value answers this" }],
        }
      : {
          type: "choice", name: q,
          instructions: `Which option should be selected for the question "${label}"? Use the saved values and the question text on the page. Answer "${NONE}" if the saved values do not answer it.`,
          choices: [...uniq(radios.map((r) => r.label)).map((l) => ({ value: l })), { value: NONE, description: "The saved values do not answer this" }],
        });
    plan.groups.push({ q, label, radios, sig: gsig, required: radios.some((r) => r.required) });
  }

  // What to do once the fields are handled.
  const navTargets = obs.elements.filter((e) => (e.kind === "button" || e.kind === "link" || (e.kind === "submit" && (allowSubmit || !!advance?.test(e.label.trim())))) && !e.disabled && e.label.trim()).slice(0, MAX_NAV_CHOICES);
  if (questions.length > 0 || navTargets.length > 0) {
    questions.push({
      type: "choice", name: "nav",
      instructions: `The fields on this page are being handled. To achieve the goal ("${goal}"), what should happen next? Choose the element to click, "finish" if the goal is already complete on this page, or "ask_user" if required information is missing from the saved values. Only click something that moves toward the goal.`,
      choices: [
        ...navTargets.map((e) => ({ value: `click:${e.id}`, description: `${e.kind}: ${e.label.slice(0, 80)}` })),
        { value: "finish", description: "The goal is complete on this page" },
        { value: "ask_user", description: "Information is missing" },
      ],
    });
  }
  // If the only question is nav and it has no real targets, there is nothing to decide.
  if (questions.length === 1 && navTargets.length === 0) questions.length = 0;
  return plan;
}

async function applyChoice(page: Page, el: El, choice: string, byKey: Map<string, { value: string }>, hide = false): Promise<string> {
  const loc = page.locator(`[data-aid="${el.id}"]`);
  await pointAt(page, loc); // show the agent's cursor on the field it is about to fill (D36)
  try {
    if (el.kind === "select") {
      const label = choice.startsWith("option:") && el.options.includes(choice.slice(7)) ? choice.slice(7) : hide ? matchOption(byKey.get(choice)?.value ?? "", el.options) : choice;
      if (!label) return `error: the saved value "${choice}" matches none of the options`;
      await loc.selectOption({ label }, { timeout: 5000 });
      return "ok";
    }
    const v = byKey.get(choice);
    if (!v) return `error: no saved value "${choice}"`;
    await loc.fill(v.value, { timeout: 5000 });
    return "ok";
  } catch (e) {
    return `error: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`;
  }
}

async function tickRadio(page: Page, el: El): Promise<string> { return tickCheckbox(page, el); }
async function tickCheckbox(page: Page, el: El): Promise<string> {
  const loc = page.locator(`[data-aid="${el.id}"]`);
  await pointAt(page, loc);
  try {
    try { await loc.check({ timeout: 4000 }); } catch { await loc.check({ force: true, timeout: 4000 }); }
    return "ok";
  } catch (e) {
    return `error: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`;
  }
}
export { probOf };

/**
 * Two boxes both called "First name" (your details, the patient's details) cannot be told apart from labels alone.
 * Give each duplicate the nearest section heading before it: `First name (section "Patient details")`.
 */
export async function labelDuplicates(page: Page, obs: Observation) {
  const count = new Map<string, number>();
  const keyOf = (e: El) => (e.kind === "radio" ? `r:${e.group}|${e.label}` : `${e.kind}:${e.label}`);
  for (const e of obs.elements) if (e.kind !== "link" && e.kind !== "button" && e.kind !== "submit") count.set(keyOf(e), (count.get(keyOf(e)) ?? 0) + 1);
  const dup = obs.elements.filter((e) => (count.get(keyOf(e)) ?? 0) > 1);
  if (!dup.length) return;
  const sections = await page.evaluate((ids) => ids.map((id) => {
    const el = document.querySelector(`[data-aid="${id}"]`);
    if (!el) return "";
    const r = document.evaluate("preceding::*[self::h1 or self::h2 or self::h3 or self::h4 or self::h5 or self::h6 or self::legend or @role='heading' or ((self::strong or self::b) and string-length(normalize-space(.)) < 60)][1]", el, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    return (r?.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  }), dup.map((e) => e.id)).catch(() => [] as string[]);
  dup.forEach((e, i) => { if (sections[i]) e.label = `${e.label} (section "${sections[i]}")`; });
}

/** "Nothing chosen" in a dropdown, in many languages (used with hideValues, i.e. by the generic workers). */
export const ANY_PLACEHOLDER = /^(?:[-–—]+|please\s+(?:choose|select)|select|choose|open this select|(?:bitte\s+)?(?:aus)?wählen|bitte\s+auswählen|veuillez\s+(?:choisir|sélectionner)|choisi(?:r|ssez)|sélectionne(?:r|z)|seleccion[ae]|selecciona(?:r)?|elija|elige|seleziona(?:re)?|scegli|selecteer|kies|maak een keuze|välj|velg|vælg|valitse|wybierz|vyberte|selecione|escolha|seçiniz|seçin|выберите|選択|请选择)\b/iu;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * What the model may see of a page when values are hidden: typed text is masked as "(filled)", and any saved value
 * that shows up in the page's own text (a "check your answers" page, a greeting, an error) is replaced by its key.
 */
export function redactObservation(obs: Observation, values: { key: string; value: string }[]): Observation {
  const pats: [RegExp, string][] = [];
  for (const v of values) {
    const val = v.value.trim();
    if (val.length < 3) continue; // "Yes", "No", "Ms": not personal, and replacing them would garble the page
    const parts = new Set([val, ...(val.length > 60 ? [val.slice(0, 60), ...val.split(/\n+|(?<=[.!?])\s+/).filter((x) => x.trim().length >= 12)] : [])]);
    for (const p of parts) pats.push([new RegExp(escapeRe(p.trim()).replace(/\s+/g, "\\s+"), "gi"), `[${v.key}]`]);
  }
  pats.sort((a, b) => b[0].source.length - a[0].source.length);
  const clean = (s: string) => pats.reduce((t, [re, k]) => t.replace(re, k), s);
  return {
    ...obs,
    url: clean(obs.url),
    title: clean(obs.title),
    headings: obs.headings.map(clean),
    errors: obs.errors.map(clean),
    text: clean(obs.text),
    elements: obs.elements.map((e) => ({
      ...e,
      label: clean(e.label),
      group: clean(e.group),
      value: e.kind === "text" || e.kind === "textarea" ? (e.value.trim() ? "(filled)" : "") : clean(e.value),
    })),
  };
}

const norm = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const YES = /^(yes|y|true|ja|oui|si|sí|da|tak|kyllä|igen|evet|sim|はい|是)$/i;
const NO = /^(no|n|false|nein|non|nej|nei|nee|nie|ei|nem|hayır|não|nao|いいえ|否)$/i;

/** The option whose text best matches a saved value, in code (exact, yes/no in any common language, prefix, word overlap). Undefined when unsure. */
export function matchOption(value: string, options: string[]): string | undefined {
  const v = norm(value);
  if (!v) return undefined;
  const opts = options.filter((o) => o.trim() && !PLACEHOLDER.test(o.trim()));
  const exact = opts.filter((o) => norm(o) === v);
  if (exact.length) return exact[0];
  // A number against a list of exactly 12 (months) or 31 (days) options: its position, whatever the language ("7" -> "July", "Juli").
  if (/^\d{1,2}$/.test(v) && (opts.length === 12 || opts.length === 31) && +v >= 1 && +v <= opts.length) return opts[+v - 1];
  const first = (o: string) => norm(o).split(" ")[0] ?? "";
  if (YES.test(v) || NO.test(v)) {
    const want = YES.test(v) ? YES : NO;
    const hits = opts.filter((o) => want.test(norm(o)) || want.test(first(o)));
    return hits.length === 1 ? hits[0] : undefined;
  }
  const pre = opts.filter((o) => { const n = norm(o); return n.length >= 2 && (n.startsWith(v) || v.startsWith(n)); });
  if (pre.length === 1) return pre[0];
  const words = new Set(v.split(" ").filter((w) => w.length > 1));
  let best: string | undefined, bestScore = 0, second = 0;
  for (const o of opts) {
    const ow = new Set(norm(o).split(" ").filter((w) => w.length > 1));
    const inter = [...ow].filter((w) => words.has(w)).length;
    const score = inter / Math.max(1, Math.min(ow.size, words.size)) * (inter / Math.max(ow.size, words.size)) ** 0.25;
    if (score > bestScore) { second = bestScore; bestScore = score; best = o; } else if (score > second) second = score;
  }
  return bestScore >= 0.6 && bestScore - second > 0.15 ? best : undefined;
}
