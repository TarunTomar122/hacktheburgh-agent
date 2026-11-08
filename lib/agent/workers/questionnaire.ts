import type { Page } from "playwright";
import { z } from "zod";
import { dismissCookies } from "../../browser";
import { gateWall } from "../handoff";
import { tookHandoff } from "../handoffQuiet";
import { MODELS, modelFor, structured } from "../llm";
import {
  AMBIGUOUS_RE,
  auditPress,
  byId,
  carriesOnlyOurs,
  CHECKER_NAV_RE,
  clickEl,
  detectWall,
  formatSnapshot,
  HARD_STOP_RE,
  hostOf,
  isPersonalField,
  matchOption,
  PLACE_FIELD_RE,
  norm,
  RESULT_STEP_RE,
  settle,
  snapshot,
  tick,
  type PressAudit,
  type Snapshot,
  type UiEl,
} from "./searchDirectory";
import type { Quote, Value, Wall, WorkerCtx } from "./types";

/**
 * run_questionnaire (night plan, generic worker). Runs an online eligibility checker or calculator page by page,
 * the way a careful person would: for each question the page actually shows, it answers from what is already known
 * when a known value clearly fits, and otherwise asks the user that one question in the page's own words (with the
 * page's own options). It never guesses money or personal answers. It presses Next / Continue between pages (these
 * checkers send nothing to anyone), stops at pages that ask for identity or contact details or a login, and reads the
 * final result, quoting it word for word (the quote and its caveats are checked against the page text by code).
 *
 * Safety in code (`checkerPress`), whatever the model chose: a control is clicked only if it is a checker's own
 * navigation (next, continue, check, calculate, see result, start, back) or one of a question's answers, the page asks
 * for no identity / contact details, and what it sends holds only the answers code typed. Send / pay / apply / sign /
 * register labels are never pressed; Submit / Confirm / Finish (in any language) only as a pure calculator's own
 * "see result" step. Otherwise the worker stops "before a final button" and says so.
 *
 * Knows nothing about any site. Models see the page and the KEYS + descriptions of known values; code types the
 * values. A choice value is shown to the model only when code cannot map it onto the page's options itself, and
 * money values are never shown to a model.
 */

export type QuestionnaireAnswer = { question: string; answer: string; source: "known" | "user" };
export type QuestionnaireRun = {
  ok: boolean;
  answers: QuestionnaireAnswer[];
  result: string;
  resultQuote?: Quote;
  /** The checker's own qualifications next to its result ("this is only an estimate", "a solicitor will decide"), quote-checked. */
  caveats: Quote[];
  wall?: Wall;
  summary: string;
  handedOff?: boolean;
};

const MODEL = process.env.WORKER_MODEL ?? MODELS.browser;
const EFFORT = (process.env.WORKER_EFFORT as "none" | "low" | "medium" | "high" | undefined) ?? "low";

const AnswerType = z.enum(["choice", "multi", "yes_no", "money", "number", "text", "date"]);
const PageRead = z.object({
  pageKind: z
    .enum(["start", "questions", "result", "identity_or_contact", "login", "other"])
    .describe("start: an intro page with a start button; questions: asks questions; result: shows the checker's outcome; identity_or_contact: asks for name, date of birth, street address, email, phone, ID numbers (a postcode, town or region on its own is not identity); login: asks to sign in"),
  reasoning: z.string().describe("one plain sentence about this page"),
  questions: z.array(
    z.object({
      question: z.string().describe("the question exactly as the page words it (its legend / heading / label, not a generic instruction like 'Please select'), including any period like 'each month'"),
      controlIds: z.array(z.number()).describe("ids of ALL the controls that answer this question: every radio option, every checkbox, the box or dropdown, or, when the page offers each answer as its own link or button, those links/buttons"),
      answerType: AnswerType.describe("money for any amount of money; multi for 'select all that apply'"),
      personal: z.boolean().describe("asks for identity/contact details (name, date of birth, street address, email, phone, NI / NHS / ID numbers, a free-text description of the person's case). A postcode, town, region or country on its own is NOT personal"),
      knownKey: z.string().nullable().describe("the KEY of a KNOWN value whose description clearly answers exactly this question (same person, same thing, same period); null if none does"),
      hint: z.string().nullable().describe("the page's own hint text for this question, if any"),
    }),
  ),
  continueId: z.number().nullable().describe("the control that moves on (Start now, Next, Continue, Check, Calculate, See results); null if none"),
  result: z
    .object({
      summary: z.string().describe("the outcome in one plain sentence, no stronger than the page"),
      quote: z.string().describe("the result sentence(s) copied EXACTLY from PAGE TEXT"),
      caveats: z.array(z.string()).describe("qualifications next to the result, copied EXACTLY (e.g. 'This is only an estimate')"),
    })
    .nullable()
    .describe("only when the page shows the checker's actual outcome; text saying a result WILL appear once fields are complete is not a result"),
});
type Q = z.infer<typeof PageRead>["questions"][number];

const ChoiceMap = z.object({ options: z.array(z.string()).describe("the page options that the answer means, exactly as listed; empty if it means none of them") });

/** Labels the worker never presses to move on, on top of HARD_STOP_RE: they leave the checker. */
const NEVER_PRESS = /\b(print|download|save (and|&) (come back|return|exit)|save for later)\b/i;
/** The words to report when the worker stops before a control it may not press. */
const STOPPED_FINAL = "stopped before a final button";

/** A text box on the page that asks for identity / contact details, or free text (the person's own words). Code, not the model. */
export function personalOnPage(snap: Snapshot): UiEl | undefined {
  return snap.els.find((e) => !e.chrome && e.kind === "text" && !e.disabled && (e.personal || e.type === "" || isPersonalField({ type: e.type, name: e.name, label: e.label, tag: e.type === "" ? "textarea" : "input" })));
}

export async function runQuestionnaire(ctx: WorkerCtx, opts: { url: string; goal: string; known: Value[]; maxPages?: number }): Promise<QuestionnaireRun> {
  const { page, note } = ctx;
  const maxPages = opts.maxPages ?? 15;
  const host = hostOf(opts.url);
  const agentName = `Checker on ${host}`;
  const known = new Map(opts.known.filter((v) => v.value.trim()).map((v) => [v.key, v]));
  const answers: QuestionnaireAnswer[] = [];
  const memo = new Map<string, { values: string[]; display: string; tries: number }>();
  const typed = new Set<string>(); // every text code typed into the checker (its answers), and nothing else may be sent
  const log = (kind: Parameters<typeof note.log>[0], text: string, extra: Parameters<typeof note.log>[2] = {}) => note.log(kind, text, extra).catch(() => {});
  const act = () => ctx.track.bump("action");
  const stop = (summary: string, wall?: Wall, extra: Partial<QuestionnaireRun> = {}): QuestionnaireRun => ({ ok: false, answers, result: "", caveats: [], summary, ...(wall ? { wall } : {}), ...(tookHandoff(page) ? { handedOff: true } : {}), ...extra });

  note(`Opening ${host}`);
  try {
    await page.goto(opts.url, { waitUntil: "domcontentloaded", timeout: 35000 });
  } catch (e) {
    return stop(`Could not open ${host}.`, { kind: "dead_end", detail: String(e).slice(0, 140), url: opts.url });
  }
  await settle(page, 600);
  await dismissCookies(page, 4000);
  await log("open", `Opened the checker on ${host}`, { shot: true, detail: `Goal: ${opts.goal}\nKnown already: ${[...known.values()].map((v) => v.description).join("; ") || "nothing"}` });

  let advances = 0;
  let stuck = 0;
  let hint = "";
  let rereads = 0;
  for (let step = 0; step < maxPages * 6 + 6; step++) {
    const snap = await snapshot(page, { textCap: 6000, linkCap: 40 });
    const wall = detectWall(snap);
    if (wall) {
      const g = await gateWall(ctx, wall, async () => detectWall(await snapshot(page)) ?? null);
      if (g.go && !g.open) {
        note("Back to work");
        step--;
        continue;
      }
      if (!g.go) {
        if (!g.quiet) await log("fail", g.wall.detail, { shot: true });
        return stop(g.quiet ? "Left this sign-in. It does not help with your complaint." : g.wall.detail, g.wall);
      }
    }
    note(advances ? `Page ${advances + 1}: reading the questions` : "Reading the questions");
    const read = await structured({
      model: MODEL,
      effort: EFFORT,
      name: "questionnaire_page",
      data: [],
      schema: PageRead,
      instructions: `You are running an online eligibility checker / calculator for a person, page by page. Read this page.
List the checker's questions on it, including ones already answered (not the site's search box, language picker, feedback widget or cookie controls), with the ids of the inputs that answer each. For each, set knownKey only if a KNOWN value's description clearly answers exactly that question (same person, same thing, same period); never stretch one. Money questions need a known value that is the same amount for the same period, otherwise null.
Some checkers show each answer as its own link or button (e.g. a list of problem areas): that is a question too, with those links/buttons as its controls.
continueId: the button or link that moves the checker on (start, next, continue, check, calculate, see result). Never a button that sends an application, pays, or signs in.
result: only when the checker's outcome is on the page. Copy its words exactly from PAGE TEXT, with the caveats next to it.`,
      input: `${hint}GOAL: ${opts.goal}\nKNOWN VALUES (key: description):\n${[...known.values()].map((v) => `- ${v.key}: ${v.description}`).join("\n") || "(none)"}\n\nCURRENT PAGE:\n${formatSnapshot(snap, { text: 3500, only: (e) => !e.chrome })}`,
    });
    // A free-text box that asks for an amount (income, outgoings, savings, capital) is a money question: asked as one, so the
    // patient gets the money input and the answer is typed as a number (seen 2026-11-08: SLAB's "Your net annual income" came as text).
    for (const q of read.questions) if (q.answerType === "text" && /\b(income|outgoings?|earnings?|salary|wages?|savings|capital|rent|mortgage|benefits? amount|how much|amount)\b|£|€|\$/i.test(q.question)) q.answerType = "money";
    // A bare instruction ("Please select from the following:") is not a question a person can answer. Use the real question
    // the page asks just above it (the line ending in "?" or ":" that comes before), so the patient knows what is being asked.
    for (const q of read.questions) {
      if (!/^\s*(please\s+)?(select|choose|tick|pick)\b.{0,40}$|^\s*(select|choose) (one|an option|from)/i.test(q.question.replace(/\*/g, "").trim())) continue;
      const text = String(snap.text ?? "");
      const at = text.toLowerCase().indexOf(q.question.replace(/\*/g, "").trim().toLowerCase().slice(0, 30));
      const before = (at > 0 ? text.slice(0, at) : text).split(/\n+/).map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
      const idx = before.map((l, i) => ({ l, i })).reverse().find(({ l }) => /[?:]\s*$/.test(l) && l.length > 12 && !/^\s*(please\s+)?(select|choose|tick)/i.test(l))?.i;
      if (idx === undefined) continue;
      // The lines between the question and the instruction are what it refers to ("the following benefits"): keep them, whole.
      const items = before.slice(idx + 1).filter((l) => l.length < 120);
      const realQ = before[idx].replace(/\*+$/, "").trim();
      q.question = items.length && items.length <= 10 ? `${realQ} ${items.join("; ")}` : realQ;
    }
    await log("decide", read.reasoning.slice(0, 200), { detail: read.questions.map((q) => `${q.question} [${q.answerType}]${q.knownKey ? ` <- known "${q.knownKey}"` : ""}`).join("\n") || undefined });

    // Identity, contact details or login: stop. The checker's result, if already shown, still counts.
    // A postcode / town / region question is place, not identity: code overrides the model's "personal" for it.
    const personalField = personalOnPage(snap);
    const personalQ = read.questions.find((q) => q.personal && !isPlaceQuestion(q, snap));
    const identityPage = read.pageKind === "identity_or_contact" && !(read.questions.length && read.questions.every((q) => isPlaceQuestion(q, snap) || !q.personal));
    if (read.pageKind === "login") {
      const w: Wall = { kind: "login", detail: "The checker asks the user to sign in", url: snap.url };
      const g = await gateWall(ctx, w, async () => detectWall(await snapshot(page)) ?? null);
      if (g.go && g.open) {
        /* The page already has something to use. */
      } else if (g.go) {
        note("Back to work");
        step--;
        continue;
      } else {
        if (read.result) return finish(read.result, snap, true);
        if (g.quiet) return stop("Left this sign-in. It does not help with your complaint.", g.wall);
        await log("check", "The checker asks the user to sign in. Stopped: this worker never signs in", { shot: true });
        return stop("The checker asks the user to sign in; stopped before it.", g.wall);
      }
    }
    if (identityPage || personalQ || personalField) {
      const detail = `This checker wants personal details (${(personalQ?.question ?? personalField?.label ?? "personal details").slice(0, 80)})`;
      await log("check", `${detail}. Stopped: this worker never enters personal details`, { shot: true });
      if (read.result) return finish(read.result, snap, true);
      return stop(`${detail}; stopped before it.`, { kind: "dead_end", detail, url: snap.url });
    }

    hint = "";
    const pending = read.questions.filter((q) => unanswered(q, snap, memo));
    // A pre-filled default that contradicts what we know is corrected (a checker's default is not the person's answer).
    for (const q of read.questions) {
      const kv = q.knownKey ? known.get(q.knownKey) : undefined;
      if (!kv || pending.includes(q) || memo.has(qKey(q, snap))) continue;
      const els = controlsOf(q, snap);
      if (!els.length || !els.every((e) => e.kind === "radio" || e.kind === "select")) continue;
      const want = await fit(q, optionsOf(q, els), kv.value, false);
      const current = els.find((e) => e.kind === "select")?.value ?? els.find((e) => e.checked)?.label;
      memo.set(qKey(q, snap), { values: want?.values ?? [], display: want?.display ?? "", tries: 1 });
      if (!want || !current || norm(current) === norm(want.values[0])) continue;
      await apply(page, q, els, want.values, typed);
      act();
      answers.push({ question: q.question, answer: want.display, source: "known" });
      await log("pick", `${q.question.slice(0, 80)}: the page had "${current}" pre-selected; changed it to the known answer`, { detail: `Answer: ${want.display}` });
    }
    if (pending.length) {
      for (const q of pending) {
        const key = qKey(q, snap);
        const els = controlsOf(q, snap);
        if (!els.length) continue;
        const prev = memo.get(key);
        let got: { values: string[]; display: string; source: "known" | "user" } | null | "stop";
        if (prev) {
          if (prev.tries >= 2) {
            await log("fail", `The checker does not accept the answer to "${q.question.slice(0, 80)}"`, { shot: true, detail: snap.errors.join("\n") || undefined });
            return stop(`The checker would not accept the answer to "${q.question.slice(0, 80)}"${snap.errors.length ? `: ${snap.errors[0]}` : ""}.`);
          }
          prev.tries++;
          got = { values: prev.values, display: prev.display, source: "known" };
          await log("recover", `"${q.question.slice(0, 70)}" was cleared; answering it again`);
        } else got = await resolve(q, els, snap.errors);
        if (got === "stop") return stop(`Stopped at "${q.question.slice(0, 100)}": no known answer and nobody to ask.`);
        if (got === null) {
          await log("check", `You chose not to answer "${q.question.slice(0, 80)}". Stopped there`);
          return stop(`Stopped: no answer to "${q.question.slice(0, 100)}".`);
        }
        // An answer offered as a link / button is a press: code checks it like any other (it may submit the page's form).
        const target = els.every((e) => CLICK_KINDS.has(e.kind)) ? clickTarget(els, got.values[0]) : undefined;
        if (target) {
          const v = await checkerPress(target, snap, "answer");
          if (!v.ok) return refuse(v, target, snap, read.result);
        }
        const ok = await apply(page, q, els, got.values, typed);
        act();
        if (!prev) {
          memo.set(key, { values: got.values, display: got.display, tries: 1 });
          answers.push({ question: q.question, answer: got.display, source: got.source });
        }
        await log(CLICK_KINDS.has(els[0].kind) ? "click" : els[0].kind === "text" ? "type" : els[0].kind === "select" ? "pick" : "click", `${q.question.slice(0, 80)}: ${q.answerType === "money" || q.answerType === "number" ? "entered" : "chose"} ${got.source === "known" ? "the known answer" : "your answer"}${ok ? "" : " (the page did not take it)"}`, {
          // Money stays out of the trace text shown to other agents; the answer list carries it for the user.
          detail: q.answerType === "money" ? undefined : `Answer: ${got.display}`,
        });
        if (els.every((e) => CLICK_KINDS.has(e.kind))) break; // that click moved the checker on: read the new page
        await page.waitForTimeout(500); // progressive checkers reveal the next question as you answer
      }
      continue;
    }

    if (read.result && (read.pageKind === "result" || read.continueId === null)) return finish(read.result, snap, false);

    const next = read.continueId === null ? undefined : snap.els.find((e) => e.id === read.continueId);
    if (next) {
      // Code decides whether the model's "continue" may be pressed; the model's choice never overrides it.
      const v = await checkerPress(next, snap, "continue");
      if (!v.ok) return refuse(v, next, snap, read.result);
      if (advances >= maxPages) return stop(`Stopped after ${advances} pages without a result.`, { kind: "dead_end", detail: "Too many pages", url: snap.url });
      const before = sig(snap);
      note(`Pressing "${next.label.slice(0, 30)}"`);
      await clickEl(page, next);
      act();
      await settle(page, 900);
      const after = await snapshot(page, { textCap: 6000, linkCap: 0 });
      if (sig(after) === before) {
        stuck++;
        await log("recover", `"${next.label.slice(0, 30)}" did not move the checker on${after.errors.length ? `: ${after.errors[0].slice(0, 100)}` : ""}`, { shot: true });
        if (stuck >= 2) return stop(`The checker did not move on from "${snap.headings[0] ?? snap.title}"${after.errors.length ? `: ${after.errors[0]}` : ""}.`);
        continue;
      }
      stuck = 0;
      advances++;
      await log("click", `Pressed "${next.label.slice(0, 40)}"`, { shot: true });
      continue;
    }
    if (read.result) return finish(read.result, snap, false);
    // Before giving up, look again, pointing at inputs that still look unanswered.
    const covered = new Set(read.questions.flatMap((q) => q.controlIds));
    const loose = snap.els.filter((e) => !e.chrome && !covered.has(e.id) && ((e.kind === "radio" && !e.checked) || (e.kind === "text" && !e.value.trim() && !e.personal) || e.kind === "select"));
    if (rereads < 2) {
      rereads++;
      hint = `NOTE: the previous reading of this page found no question to answer and no way on. Look again carefully${loose.length ? `; these inputs look unanswered: ${loose.slice(0, 20).map((e) => `[${e.id}] ${e.label.slice(0, 40)}`).join(", ")}` : ""}; answers offered as links or buttons count as a question.\n\n`;
      await log("recover", "Found nothing to answer and no way on; reading the page again more carefully");
      continue;
    }
    await log("fail", "Nothing left to answer and no way on, but no result either", { shot: true });
    return stop(`The checker on ${host} showed no result and no way on (${read.reasoning}).`, { kind: "dead_end", detail: read.reasoning, url: snap.url });
  }
  return stop(`Ran out of steps on ${host}.`);

  /* ---------------------------------------------------------------- helpers that close over the run */

  /** Code's verdict on pressing a control (see checkerPressVerdict), read from the live page. */
  async function checkerPress(el: UiEl, snap: Snapshot, role: "continue" | "answer") {
    return checkerPressVerdict(await auditPress(page, el.id), el, snap, typed, role);
  }

  /** Stop at a control code refused. Personal details are reported as such; anything else as a final button. */
  async function refuse(v: { why: string; personal?: boolean }, el: UiEl, snap: Snapshot, result: z.infer<typeof PageRead>["result"]): Promise<QuestionnaireRun> {
    if (v.personal) {
      const detail = `This checker wants personal details (${v.why})`;
      await log("check", `${detail}. Stopped: this worker never enters personal details`, { shot: true });
      return result ? finish(result, snap, true) : stop(`${detail}; stopped before it.`, { kind: "dead_end", detail, url: snap.url });
    }
    await log("check", `Did not press "${el.label.slice(0, 40)}": ${v.why}. ${STOPPED_FINAL[0].toUpperCase()}${STOPPED_FINAL.slice(1)}`, { shot: true });
    if (result) return finish(result, snap, true);
    return stop(`Stopped before "${el.label.slice(0, 60)}": ${v.why}.`, { kind: "dead_end", detail: `${STOPPED_FINAL}: ${v.why}`, url: snap.url }, { result: STOPPED_FINAL });
  }

  async function finish(r: NonNullable<z.infer<typeof PageRead>["result"]>, snap: Snapshot, stoppedEarly: boolean): Promise<QuestionnaireRun> {
    const resultQuote = checkQuote(r.quote, snap);
    const caveats = r.caveats.map((c) => checkQuote(c, snap)).filter((c) => c.checked);
    note(r.summary.slice(0, 60));
    await log("result", `The checker's result: ${r.summary}`, {
      shot: true,
      detail: `${resultQuote.checked ? "Its own words" : "Its words (NOT found verbatim on the page)"}: "${resultQuote.quote}"${caveats.length ? `\nCaveats: ${caveats.map((c) => `"${c.quote}"`).join(" ")}` : ""}`,
    });
    const asked = answers.filter((a) => a.source === "user").length;
    return {
      ok: resultQuote.checked,
      answers,
      result: r.summary,
      resultQuote,
      caveats,
      summary: `Ran the checker on ${host}: ${answers.length} question(s) answered (${answers.length - asked} from what we knew, ${asked} asked). Result: ${r.summary}${stoppedEarly ? " (stopped before a page asking for personal details)" : ""}`,
      ...(tookHandoff(page) ? { handedOff: true } : {}),
    };
  }

  /** Answer from a known value when one clearly fits, else ask the user. */
  async function resolve(q: Q, els: UiEl[], errors: string[]): Promise<{ values: string[]; display: string; source: "known" | "user" } | null | "stop"> {
    const options = optionsOf(q, els);
    const kv = q.knownKey ? known.get(q.knownKey) : undefined;
    if (kv) {
      const fromKnown = await fit(q, options, kv.value, false);
      if (fromKnown) return { ...fromKnown, source: "known" };
      await log("check", `The known "${kv.key}" did not fit "${q.question.slice(0, 60)}"; asking instead`);
    }
    if (!ctx.ask) return "stop";
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      note("Waiting for your answer");
      const kind = q.answerType === "money" ? "money" : q.answerType === "number" ? "number" : q.answerType === "yes_no" || (options.length === 2 && options.every((o) => /^(yes|no)\b/i.test(o))) ? "yes_no" : options.length ? "choice" : "text";
      const raw = await ctx.ask({
        agent: agentName,
        question: `${q.question}${q.answerType === "multi" ? " (choose all that apply)" : ""}${tryNo ? " (please answer with one of the options or a number)" : ""}`,
        why: `The checker on ${host} asks this${q.hint ? ` (${q.hint.slice(0, 120)})` : ""}. Your answer is typed into the checker only, to get its result; nothing is sent to anyone.${errors.length ? ` The page says: ${errors[0].slice(0, 100)}` : ""}`,
        kind,
        ...(options.length ? { options } : {}),
      });
      if (raw === null || !raw.trim()) return null;
      const got = await fit(q, options, raw, true);
      if (got) return { ...got, source: "user" };
    }
    return null;
  }

  /** Turn an answer into what the page takes: page options for choices, plain digits for money and numbers. */
  async function fit(q: Q, options: string[], value: string, fromUser: boolean): Promise<{ values: string[]; display: string } | null> {
    if (q.answerType === "money" || q.answerType === "number") {
      const n = parseAmount(value);
      return n === null ? null : { values: [n], display: q.answerType === "money" ? `£${Number(n).toLocaleString("en-GB")}` : n };
    }
    if (!options.length) {
      // A postcode question gets only the postcode (or its first part when that is all it asks), never the rest of an address.
      if (/post ?code|postal code|outward code/i.test(q.question)) {
        const pc = postcodeOf(value, /first (?:part|half)|outward|first \d|district/i.test(`${q.question} ${q.hint ?? ""}`));
        return pc ? { values: [pc], display: pc } : null;
      }
      return { values: [value.trim()], display: value.trim() };
    }
    const parts = q.answerType === "multi" ? value.split(/\s*(?:,|;|\band\b)\s*/i).filter(Boolean) : [value];
    const mapped = parts.map((p) => matchChoice(options, p));
    if (mapped.every(Boolean)) {
      const values = [...new Set(mapped as string[])];
      return { values, display: values.join(", ") };
    }
    // Code could not map it; a model maps the words onto the page's options (never money, see above).
    // The person's own answer (benefits, savings, work: their money) is seen here, so it runs on this Mac by default.
    // Amounts never reach a model (parseAmount above); page reading sees only the descriptions of known values.
    const m = await structured({
      ...modelFor("check", ["money"]),
      name: "questionnaire_choice",
      data: ["money"],
      schema: ChoiceMap,
      instructions: `Map an answer onto a checker's options. Choose ${q.answerType === "multi" ? "every option" : "the one option"} the answer clearly means, copied exactly. Empty if it means none of them or is unclear. Do not guess.`,
      input: `QUESTION: ${q.question}\nOPTIONS:\n${options.map((o) => `- ${o}`).join("\n")}\n${fromUser ? "THE USER ANSWERED" : "KNOWN VALUE"}: ${value}`,
    });
    const values = m.options.map((o) => matchChoice(options, o)).filter((o): o is string => !!o);
    if (!values.length || (q.answerType !== "multi" && values.length > 1)) return null;
    return { values, display: values.join(", ") };
  }
}

/* ------------------------------------------------------------------ pure helpers */

const sig = (s: Snapshot) => `${s.url}|${s.headings.join("|")}|${s.text.slice(0, 300)}`;
const ZEROISH = /^\s*[£$€]?\s*0+(?:[.,]0+)?\s*$/;

/** Stable key for a question: its inputs' names, else its wording. */
function qKey(q: Q, snap: Snapshot): string {
  const names = q.controlIds.map((id) => snap.els.find((e) => e.id === id)?.name ?? "").filter(Boolean);
  return names.length ? `${new URL(snap.url).pathname}|${[...new Set(names)].sort().join("|")}` : norm(q.question).slice(0, 80);
}

/** Does the page still need an answer to this question? Decided by code from the live controls. */
function unanswered(q: Q, snap: Snapshot, memo: Map<string, unknown>): boolean {
  const els = q.controlIds.map((id) => snap.els.find((e) => e.id === id)).filter((e): e is UiEl => !!e && !e.disabled);
  if (!els.length) return false;
  const answeredByUs = memo.has(qKey(q, snap));
  const kinds = new Set(els.map((e) => e.kind));
  if (els.every((e) => CLICK_KINDS.has(e.kind))) return true; // answers offered as links/buttons: clicking one moves on
  if (kinds.has("radio")) return !els.some((e) => e.checked);
  if (kinds.has("checkbox")) return !els.some((e) => e.checked) && !answeredByUs; // "none of these" can mean all unticked
  if (kinds.has("select")) return els.every((e) => !e.value.trim() || /^(?:[-–—]+|(?:please\s+)?(?:choose|select)\b)/i.test(e.value.trim()));
  if (kinds.has("text")) return els.some((e) => !e.value.trim() || (ZEROISH.test(e.value) && !answeredByUs));
  return false;
}

const CLICK_KINDS = new Set<UiEl["kind"]>(["link", "button", "submit", "option", "tab", "toggle"]);
const controlsOf = (q: Q, snap: Snapshot) => q.controlIds.map((id) => snap.els.find((e) => e.id === id)).filter((e): e is UiEl => !!e && !e.disabled);

/** The page's own options for a question. */
function optionsOf(q: Q, els: UiEl[]): string[] {
  if (els.every((e) => CLICK_KINDS.has(e.kind))) return [...new Set(els.map((e) => e.label))].filter(Boolean);
  const sel = els.find((e) => e.kind === "select");
  if (sel) return sel.options.filter((o) => o.trim() && !/^(?:[-–—]+|(?:please\s+)?(?:choose|select)\b)/i.test(o.trim()));
  if (q.answerType === "multi" || els.some((e) => e.kind === "radio") || els.length > 1) return [...new Set(els.filter((e) => e.kind === "radio" || e.kind === "checkbox").map((e) => e.label))].filter(Boolean);
  if (els[0]?.kind === "checkbox") return ["Yes", "No"]; // a single box: ticked or not
  return [];
}

const YES = /^(y|yes|yeah|yep|true|i do|i am|i have|correct)\b/i;
const NO = /^(n|no|nope|false|i do not|i don'?t|i am not|i'?m not|i have not|none)\b/i;

/** Map an answer onto one of the options by code: exact, yes/no, or unambiguous containment. */
function matchChoice(options: string[], answer: string): string | undefined {
  const a = answer.trim();
  const direct = options.find((o) => o.trim().toLowerCase() === a.toLowerCase()) ?? options.find((o) => norm(o) === norm(a));
  if (direct) return direct;
  if (YES.test(a) && !NO.test(a)) {
    const y = options.filter((o) => /^yes\b/i.test(o.trim()));
    if (y.length === 1) return y[0];
  }
  if (NO.test(a)) {
    const n = options.filter((o) => /^no\b/i.test(o.trim()));
    if (n.length === 1) return n[0];
  }
  const hits = options.filter((o) => norm(o).length > 2 && (norm(o).includes(norm(a)) || norm(a).includes(norm(o))));
  if (hits.length === 1) return hits[0];
  return norm(a).length > 3 && hits.length === 0 ? matchOption(options, a) : undefined;
}

/** "£19,800 a year" -> "19800". Null when there is no single clear amount. */
export function parseAmount(s: string): string | null {
  const nums = s.replace(/(\d),(\d{3})/g, "$1$2").match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length !== 1) return /^\s*(none|nothing|zero|no)\b/i.test(s) ? "0" : null;
  let n = Number(nums[0]);
  if (/\d\s*k\b/i.test(s)) n *= 1000;
  return String(Number.isInteger(n) ? n : Math.round(n * 100) / 100);
}

/**
 * May a checker control be pressed? Only (a) a checker's own navigation (next, continue, check, calculate, see result,
 * start, back) or one of a question's answers, (b) on a page that asks for no identity / contact details, (c) when
 * what it sends holds only the answers code typed (`typed`; no free text, no file, no password, no ticked consent).
 * Send / pay / apply / sign / register: never. Submit / Confirm / Finish (any language): only when it is also the
 * checker's own "see result" step on such a pure calculator. When unsure: refuse.
 */
export function checkerPressVerdict(a: PressAudit, el: UiEl, snap: Snapshot, typed: Iterable<string>, role: "continue" | "answer"): { ok: true } | { ok: false; why: string; personal?: boolean } {
  const label = (a.label || el.label).trim();
  const labels = [el.label, a.label].filter(Boolean);
  if (labels.some((l) => HARD_STOP_RE.test(l) || NEVER_PRESS.test(l))) return { ok: false, why: `"${label.slice(0, 40)}" would send, pay, apply, sign or create an account` };
  const pf = personalOnPage(snap) ?? a.fields.find((f) => (f.visible || f.value.trim()) && isPersonalField(f));
  if (pf) return { ok: false, personal: true, why: `it asks for "${(pf.label || pf.name || "personal details").slice(0, 60)}"` };
  if (!a.found) return { ok: false, why: `"${label.slice(0, 40)}" could not be read on the live page` };
  const plainLink = el.kind === "link" && !a.inForm && !!el.href && !/^\s*javascript:/i.test(el.href);
  const carried = plainLink ? ({ ok: true } as const) : carriesOnlyOurs(a, typed);
  if (!carried.ok) return { ok: false, why: carried.why };
  const ambiguous = labels.some((l) => AMBIGUOUS_RE.test(l));
  if (role === "answer") return ambiguous ? { ok: false, why: `the answer "${label.slice(0, 40)}" reads like a final button` } : { ok: true };
  // Ambiguous: only a pure calculator's own "see result" step (everything it sends was typed by code, checked above).
  if (ambiguous) return RESULT_STEP_RE.test(label) ? { ok: true } : { ok: false, why: `"${label.slice(0, 40)}" may send the answers for good, and it is not a "see result" step` };
  if (CHECKER_NAV_RE.test(label)) return { ok: true };
  return { ok: false, why: `"${label.slice(0, 40) || "an unnamed button"}" is not a next / continue / see-result step` };
}

/** A question about place only (postcode, town, region, country), judged by code from its words and its boxes' labels. */
function isPlaceQuestion(q: Q, snap: Snapshot): boolean {
  const els = q.controlIds.map((id) => snap.els.find((e) => e.id === id)).filter((e): e is UiEl => !!e);
  const words = [q.question, ...els.map((e) => `${e.label} ${e.name}`)];
  if (words.some((w) => /\b(?:name|e-?mail|phone|telephone|mobile|date of birth|birth|street|house|address line|full address|national insurance|nhs number|passport)\b/i.test(w))) return false;
  return PLACE_FIELD_RE.test(q.question) && els.every((e) => e.kind !== "text" || e.type !== "" ) && els.every((e) => e.kind !== "text" || !isPersonalField({ type: e.type, name: e.name, label: e.label }));
}

/** A UK postcode in the text ("CF10 1AB"), or its outward code ("CF10") when `outward`; null when there is none. */
export function postcodeOf(text: string, outward: boolean): string | null {
  const m = text.toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/) ?? text.toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\b(?!\s*\d[A-Z]{2})/);
  if (!m) return null;
  if (outward || !m[2]) return m[1];
  return `${m[1]} ${m[2]}`;
}

/** The link / button that carries this answer. */
const clickTarget = (els: UiEl[], value: string) => els.find((e) => e.label === value) ?? els.find((e) => norm(e.label) === norm(value));

/** Put the answer into the page's own controls. Text typed is remembered in `typed` (the only text a press may send). */
async function apply(page: Page, q: Q, els: UiEl[], values: string[], typed: Set<string>): Promise<boolean> {
  if (els.every((e) => CLICK_KINDS.has(e.kind))) {
    const el = clickTarget(els, values[0]);
    if (!el || NEVER_PRESS.test(el.label) || HARD_STOP_RE.test(el.label)) return false;
    const ok = (await clickEl(page, el)) === "ok";
    await settle(page, 700);
    return ok;
  }
  const sel = els.find((e) => e.kind === "select");
  if (sel) {
    const loc = byId(page, sel.id);
    return loc.selectOption({ label: values[0] }, { timeout: 5000 }).then(
      () => true,
      () => false,
    );
  }
  const choices = els.filter((e) => e.kind === "radio" || e.kind === "checkbox");
  if (choices.length > 1 || (choices.length === 1 && choices[0].kind === "radio")) {
    let ok = true;
    for (const v of values) {
      const el = choices.find((e) => e.label === v) ?? choices.find((e) => norm(e.label) === norm(v));
      if (!el) {
        ok = false;
        continue;
      }
      if ((await tick(page, el)) !== "ok") ok = false;
      await page.waitForTimeout(250);
    }
    return ok;
  }
  if (choices.length === 1) return (await tick(page, choices[0], /^yes/i.test(values[0]))) === "ok";
  const boxes = els.filter((e) => e.kind === "text");
  if (!boxes.length) return false;
  // A date split over day / month / year boxes.
  const parts = boxes.length === 3 && q.answerType === "date" ? values[0].split(/[\s/.-]+/) : [values[0]];
  let ok = true;
  for (let i = 0; i < Math.min(boxes.length, parts.length); i++) {
    const loc = byId(page, boxes[i].id);
    try {
      typed.add(parts[i]);
      await loc.fill(parts[i], { timeout: 5000 });
      await loc.press("Tab", { timeout: 2000 }).catch(() => {}); // many calculators recompute on change/blur
    } catch {
      ok = false;
    }
  }
  return ok;
}

const flat = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * A quote counts as checked only if it is on the page. When the model's quote is not verbatim, keep the sentences
 * of it that are (the page's own words), so what is reported never says more than the page.
 */
export function checkQuote(quote: string, snap: Snapshot): Quote {
  const page = flat(snap.text);
  const q = flat(quote);
  if (q && page.includes(q)) return { url: snap.url, quote: quote.replace(/\s+/g, " ").trim(), checked: true };
  const sentences = quote.replace(/([.!?])\s+/g, "$1\n").split(/\n+/).map((x) => x.trim()).filter((x) => x.length > 8);
  const found = sentences.filter((x) => page.includes(flat(x)));
  if (found.length) return { url: snap.url, quote: found.join(" "), checked: true };
  return { url: snap.url, quote: quote.replace(/\s+/g, " ").trim(), checked: false };
}
