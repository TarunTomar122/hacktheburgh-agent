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
const MAX_ACTION_RETRIES = 2;

const OPTIONAL_TAG = /\s*\(optional\)\s*/gi;

/**
 * When the model cannot go on and nothing specific is unresolved: which fields on this page need information we do not have?
 * The model only CHOOSES from the page's own unanswered fields (D21). Returns their labels (most likely first, at most 3), or []
 * when it says nothing is missing. Replaces a vague "this page needs something" question that the user could not answer (Lea, 2026-11-08).
 */
async function whatIsMissing(input: string, obs: Observation, stats: DecisionRunStats, opts: { unmarked?: boolean } = {}): Promise<string[]> {
  const isEmpty = (e: El) => e.value.trim() === "" || PLACEHOLDER.test(e.value.trim());
  // Optional fields are never worth asking the user about. Only what the site marks as required counts. `unmarked` widens that to
  // everything not labelled "(optional)", for when the site refused to move on and did not mark which field it wanted (Lea, 2026-11-08).
  const wanted = (required: boolean, label: string) => required || (!!opts.unmarked && !/\(optional\)/i.test(label));
  const labels: string[] = [];
  const boxes = new Set<string>(); // tick boxes are asked as yes/no, so the answer can only ever tick what the user agreed to
  const tidy = (l: string) => l.replace(OPTIONAL_TAG, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  for (const e of obs.elements) {
    if (e.disabled || !e.label.trim()) continue;
    if (!wanted(e.required, e.label)) continue;
    if ((e.kind === "text" || e.kind === "textarea" || e.kind === "select") && isEmpty(e)) labels.push(e.label);
    else if (e.kind === "checkbox" && !e.checked) { labels.push(e.label); boxes.add(tidy(e.label)); }
  }
  const groups = new Map<string, El[]>();
  for (const e of obs.elements) if (e.kind === "radio" && !e.disabled) groups.set(e.name, [...(groups.get(e.name) ?? []), e]);
  for (const radios of groups.values()) {
    const label = radios[0].group || radios[0].name;
    if (!radios.some((r) => r.checked) && wanted(radios.some((r) => r.required), label)) labels.push(label);
  }
  const choices = uniq(labels.map(tidy).filter(Boolean)).slice(0, 40);
  if (choices.length === 0) return [];
  const { answers, usage, ms } = await decide(input, [
    {
      type: "choice",
      name: "missing",
      instructions:
        `The assistant could not continue on this page. Which unanswered item needs information that the SAVED VALUES do not contain, so the user must be asked? ` +
        `Answer "${NONE}" if nothing needed is missing and the page only needs its next or continue button.`,
      choices: [...choices.map((c) => ({ value: c })), { value: NONE, description: "Nothing needed is missing" }],
    },
  ]);
  stats.calls++; stats.ms += ms; stats.inputTokens += usage.input_tokens;
  const a = answers.find((x) => x.name === "missing");
  if (!a || a.type !== "choice" || a.choice === NONE) return [];
  const alsoLikely = a.probabilities.filter((p) => p.value !== NONE && p.value !== a.choice && p.probability >= 0.2).sort((x, y) => y.probability - x.probability).map((p) => p.value);
  return [a.choice, ...alsoLikely].slice(0, 3).map((l) => (boxes.has(l) ? `Do you agree to "${l}"? (yes or no)` : l));
}

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
  /** Called with each fresh look at the page, before anything is decided. Return true after doing something itself (the engine then looks again). For steps the generic engine cannot do, e.g. a form that opens in the page. */
  beforeStep?: (page: Page, obs: Observation) => Promise<boolean>;
  /** Tick boxes the USER chose, by label (case, spacing and an "(Optional)" tag ignored). Ticked by code, no model involved, because the choice is theirs, e.g. severity boxes. */
  tick?: string[];
  /** Elements the agent must leave alone, e.g. a 'resume saved complaint' login box. Called with each element and the page URL. */
  ignore?: (el: { label: string; name: string; kind: string }, url: string) => boolean;
}): Promise<DecisionRun> {
  const { page, goal, values } = opts;
  const emit: OnEvent = opts.onEvent ?? (() => {});
  const maxSteps = opts.maxSteps ?? 12;
  const byKey = new Map(values.filter((v) => v.value.trim()).map((v) => [v.key, v]));
  const stats: DecisionRunStats = { calls: 0, ms: 0, inputTokens: 0 };
  const attempted = new Set<string>(); // "kind:name:label" already tried, so a stubborn field cannot loop forever
  const failures = new Map<string, number>(); // actions that threw (field redrawn, not ready), per field
  const lookedAgain = new Set<string>(); // pages re-observed once before asking the user
  const movedOnFrom = new Set<string>(); // pages left with a next/continue control because nothing was missing (once each, so it cannot loop)
  const sameClicks = new Map<string, number>(); // page + control -> times clicked, to catch a site that keeps refusing the same click
  let unsure: string[] = [];
  /**
   * An action threw. Up to MAX_ACTION_RETRIES times, forget the attempt so the field is tried again on a fresh look; after that, give up and
   * ask the user. Returns true while it will be retried. Run 2026-11-08 00:40 (Yellow Card): a fill timed out and the same step went on to
   * click "Next step" with the field empty.
   */
  const retryLater = (sig: string, label: string, res: string): boolean => {
    const n = (failures.get(sig) ?? 0) + 1;
    failures.set(sig, n);
    if (n <= MAX_ACTION_RETRIES) { attempted.delete(sig); return true; }
    unsure.push(`${label} (${res})`);
    return false;
  };

  const valuesText = [...byKey.values()].map((v) => `- ${v.key} (${v.description}): ${JSON.stringify(v.value.length > 120 ? v.value.slice(0, 120) + "…" : v.value)}`).join("\n");
  const result = (status: BrowserRun["status"], summary: string, step: number, extra: Partial<BrowserRun> = {}): DecisionRun => ({
    status, summary, unfilled: [], steps: step, stats, ...extra,
  });

  for (let step = 1; step <= maxSteps; step++) {
    const obs = await observe(page);
    if (opts.beforeStep && (await opts.beforeStep(page, obs))) continue;
    if (opts.ignore) obs.elements = obs.elements.filter((e) => !opts.ignore!(e, obs.url));
    emit({ type: "observe", step, url: obs.url, fields: obs.elements.length });
    if (opts.stopAtUrl?.test(obs.url)) return result("ready_to_submit", "Reached the final review page. Nothing was sent.", step);

    // Boxes the user chose themselves are ticked first, without asking the model.
    if (opts.tick?.length) {
      const norm = (l: string) => l.replace(/\(optional\)/gi, " ").replace(/\s+/g, " ").trim().toLowerCase();
      const want = new Set(opts.tick.map(norm));
      const todo = obs.elements.filter((e) => e.kind === "checkbox" && !e.checked && !e.disabled && want.has(norm(e.label)) && !attempted.has(`t:${e.name}:${e.label}`));
      if (todo.length > 0) {
        for (const e of todo) {
          const tsig = `t:${e.name}:${e.label}`;
          attempted.add(tsig);
          const res = await tickCheckbox(page, e);
          emit({ type: "action", step, tool: "check", args: { id: e.id, label: e.label.slice(0, 40), reason: "the user chose this box" }, result: res });
          if (res !== "ok") retryLater(tsig, e.label, res);
        }
        await page.waitForTimeout(200);
        continue;
      }
    }

    const plan = buildQuestions(obs, byKey, goal, !!opts.allowSubmit, attempted, opts.advance);
    if (plan.questions.length === 0) {
      // Nothing to decide on this page.
      return finish(page, opts, stats, step, unsure);
    }

    const input = [`GOAL: ${goal}`, `SAVED VALUES (the only data the user has provided):\n${valuesText}`, `CURRENT PAGE:\n${formatObservation(obs)}`].join("\n\n");
    const { answers, usage, ms } = await decide(input, plan.questions);
    stats.calls++; stats.ms += ms; stats.inputTokens += usage.input_tokens;
    const byName = new Map<string, DAnswer>(answers.map((a) => [a.name, a]));

    // 1) Fill, select, tick what the model chose.
    let acted = 0;
    let failed = 0; // actions that threw and will be retried
    for (const f of plan.fields) {
      const a = byName.get(f.q);
      attempted.add(f.sig);
      if (!a || a.type !== "choice") { if (f.required) unsure.push(`${f.el.label} (no answer)`); continue; }
      if (a.choice === NONE) { if (f.required) unsure.push(`${f.el.label} (no saved value fits)`); continue; }
      if (a.confidence < MIN_CONFIDENCE) { if (f.required) unsure.push(`${f.el.label} (unsure, confidence ${a.confidence.toFixed(2)})`); continue; }
      const res = await applyChoice(page, f.el, a.choice, byKey);
      emit({ type: "action", step, tool: f.el.kind === "text" || f.el.kind === "textarea" ? "fill" : f.el.kind === "select" ? "select" : "check", args: { id: f.el.id, label: f.el.label.slice(0, 40), choice: a.choice, confidence: +a.confidence.toFixed(2) }, result: res });
      if (res === "ok") acted++;
      else if (retryLater(f.sig, f.el.label, res)) failed++;
    }
    for (const g of plan.groups) {
      const a = byName.get(g.q);
      attempted.add(g.sig);
      if (!a || a.type !== "choice" || a.choice === NONE || a.confidence < MIN_CONFIDENCE) {
        if (g.required) unsure.push(`${g.label} (${a && a.type === "choice" ? (a.choice === NONE ? "no saved value fits" : "unsure") : "no answer"})`);
        continue;
      }
      const el = g.radios.find((r) => r.label === a.choice);
      if (!el) { unsure.push(`${g.label} (chosen option not found)`); continue; }
      const res = await tickRadio(page, el);
      emit({ type: "action", step, tool: "check", args: { id: el.id, label: el.label.slice(0, 40), group: g.label.slice(0, 40), confidence: +a.confidence.toFixed(2) }, result: res });
      if (res === "ok") acted++;
      else if (retryLater(g.sig, g.label, res)) failed++;
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
      else if (retryLater(c.sig, c.el.label, res)) failed++;
    }
    if (acted > 0) { await page.waitForTimeout(200); continue; } // page changed: look again
    // Something threw and will be retried: never navigate in the same step, look at the page again first.
    if (failed > 0) {
      emit({ type: "status", message: `A field did not respond (the page may still be loading). Looking again before moving on.` });
      await page.waitForTimeout(1000);
      continue;
    }

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
      if (unsure.length) return result("needs_input", "Some fields could not be filled from the saved values.", step, { unfilled: unsure, question: `I need more information to continue: ${unsure.join("; ")}` });
      // Nothing specific is unresolved. First look again once: the page may still have been loading (run 2026-11-08 01:04 looked 9 ms
      // after the click, with the site's carried-over details already filled).
      // A page is its URL plus its headings: some sites keep one URL for every step (Yellow Card's /new-report).
      const pageKey = `${obs.url}|${obs.headings.join("|")}`;
      if (!lookedAgain.has(pageKey)) {
        lookedAgain.add(pageKey);
        emit({ type: "status", message: "Not sure yet what this page needs. Looking again once it has loaded." });
        await page.waitForTimeout(1500);
        continue;
      }
      // Then ask the model WHICH field is missing, so the user is asked about that field by name (answers come back as saved values, D33).
      const missing = await whatIsMissing(input, obs, stats);
      if (missing.length) return result("needs_input", "The form asks for something the saved values do not have.", step, { unfilled: missing, question: `The form asks for: ${missing.join("; ")}` });
      // Nothing missing after all: move on with any allowed next/continue control (some sites use a plain button, not a submit).
      const onward = opts.advance ? obs.elements.find((e) => (e.kind === "submit" || e.kind === "button" || e.kind === "link") && !e.disabled && opts.advance!.test(e.label.trim())) : undefined;
      if (onward && !movedOnFrom.has(pageKey)) {
        movedOnFrom.add(pageKey);
        await page.locator(`[data-aid="${onward.id}"]`).click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(700);
        emit({ type: "action", step, tool: "click", args: { id: onward.id, label: onward.label.slice(0, 40), reason: "nothing missing on this page" }, result: "ok" });
        continue;
      }
      // Truly stuck: say so plainly, with no question the user cannot answer (the step shows "Take control" and "Try again").
      const where = obs.headings.filter((h) => h.trim()).slice(0, 2).join(" · ") || obs.title;
      return result("needs_input", `Stuck on "${where}".`, step, { unfilled: [], question: `Elliot could not work out what the page "${where}" still needs. Use "Take control" in the browser panel to look, or try again.` });
    }
    const id = Number(nav.choice.replace("click:", ""));
    const el = obs.elements.find((e) => e.id === id);
    // Never move on to the next page while something on this one is unresolved: the site would just show an error, or worse, accept a half-filled page.
    if (el?.kind === "submit" && unsure.length > 0) {
      emit({ type: "status", message: `Not advancing: ${unsure.join("; ")}` });
      return result("needs_input", "Some fields on this page could not be filled from the saved values.", step, { unfilled: unsure, question: `I could not fill: ${unsure.join("; ")}. Can you help with these?` });
    }
    if (!el || (el.kind === "submit" && !opts.allowSubmit && !opts.advance?.test(el.label.trim()))) return finish(page, opts, stats, step, unsure);
    // The same click on the same, unchanged page a third time means the site is refusing it (a required field, an error): stop and ask what
    // is missing instead of clicking until the steps run out (run 2026-11-08 01:19 pressed "Next step" 24 times).
    const clickKey = `${obs.url}|${obs.headings.join("|")}|${el.label}`;
    const clicks = (sameClicks.get(clickKey) ?? 0) + 1;
    sameClicks.set(clickKey, clicks);
    if (clicks > 2) {
      let missing = await whatIsMissing(input, obs, stats);
      if (missing.length === 0) missing = await whatIsMissing(input, obs, stats, { unmarked: true }); // the site refused and did not say which field
      const where = obs.headings.filter((h) => h.trim()).slice(0, 2).join(" · ") || obs.title;
      if (missing.length) return result("needs_input", "The form asks for something the saved values do not have.", step, { unfilled: missing, question: `The form asks for: ${missing.join("; ")}` });
      return result("needs_input", `Stuck on "${where}".`, step, { unfilled: [], question: `The page "${where}" did not accept "${el.label.trim()}" and Elliot could not tell why. Use "Take control" in the browser panel to look, or try again.` });
    }
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

function buildQuestions(obs: Observation, byKey: Map<string, Value>, goal: string, allowSubmit: boolean, attempted: Set<string>, advance?: RegExp): Plan {
  const questions: DQuestion[] = [];
  const plan: Plan = { questions, fields: [], groups: [], checks: [] };
  const valueChoices = [...byKey.values()].map((v) => ({ value: v.key, description: v.description }));
  const sig = (kind: string, e: El) => `${kind}:${e.name}:${e.label}`;
  const isEmpty = (e: El) => e.value.trim() === "" || PLACEHOLDER.test(e.value.trim()) || /^open this select/i.test(e.value.trim());

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
      const options = e.options.filter((o) => o.trim() && !PLACEHOLDER.test(o.trim()) && !/^open this select/i.test(o.trim()));
      if (options.length === 0) continue;
      questions.push({
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
    questions.push({
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

async function applyChoice(page: Page, el: El, choice: string, byKey: Map<string, { value: string }>): Promise<string> {
  const loc = page.locator(`[data-aid="${el.id}"]`);
  await pointAt(page, loc); // show the agent's cursor on the field it is about to fill (D36)
  try {
    if (el.kind === "select") {
      await loc.selectOption({ label: choice }, { timeout: 5000 });
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
    // Last resort, only after both attempts above failed: some sites park the real box off-screen and draw their own
    // (Yellow Card privacy box, 2026-11-07: "Element is outside of the viewport"). Clicking its label is what a person does.
    const viaLabel = await loc
      .evaluate((x) => {
        const box = x as HTMLInputElement;
        box.labels?.[0]?.click();
        return box.checked;
      })
      .catch(() => false);
    if (viaLabel) return "ok";
    return `error: ${(e instanceof Error ? e.message : String(e)).split("\n")[0]}`;
  }
}
export { probOf };
