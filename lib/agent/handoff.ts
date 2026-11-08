import type { Page } from "playwright";
import { z } from "zod";
import { setPageMeta } from "../liveview";
import { MODELS, structured } from "./llm";
import { concreteBenefit, handoffHost, handoffLine, isHandoffKind, isStaffConsole, type HandoffKind, type HandoffStep } from "./handoffCopy";
import { hushPage, markHandedOff } from "./handoffQuiet";
import { resolveHandoff, waitHandoff, type Emit } from "./planner";
import { CREW, type CrewId } from "./plannerTypes";
import type { Wall, WorkerCtx } from "./workers/types";

/**
 * One hand-off for every worker. A login, CAPTCHA or bot check is offered to the patient only when it plausibly
 * helps them (a complaint portal, records, a public form). A staff or admin console is a dead end: the crew tries
 * another route and says nothing. The patient signs in themselves, in the same tab; the agent never types a password.
 */

export type HandoffOutcome = "continued" | "skipped" | "timeout";
export type HandoffOffer = (wall: Wall, why: string) => Promise<HandoffOutcome>;

const offers = new WeakMap<Page, HandoffOffer>();
const steps = new WeakMap<Page, HandoffStep>();
export function bindHandoff(page: Page, offer: HandoffOffer, step?: HandoffStep) {
  offers.set(page, offer);
  if (step) steps.set(page, step);
}
export function boundHandoff(page: Page): HandoffOffer | undefined {
  return offers.get(page);
}
export function boundStep(page: Page): HandoffStep | undefined {
  return steps.get(page);
}

/**
 * A form the crew can already use: three or more fields, or a textarea, and not a login (no password).
 * A login link in the header is not a wall. Fields in the header, nav or footer do not count.
 */
export async function pageHasUsableForm(page: Page): Promise<boolean> {
  return page
    .evaluate(() => {
      const vis = (e: Element) => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return r.width > 2 && r.height > 2 && cs.visibility !== "hidden" && cs.display !== "none";
      };
      const fields = [...document.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=image]):not([type=reset]), textarea, select")].filter(
        (e) => vis(e) && !e.closest("header, nav, footer, [role=navigation], [role=banner]") && !(e as HTMLInputElement).disabled,
      );
      if (fields.some((e) => (e as HTMLInputElement).type === "password")) return false;
      const fillable = fields.filter((e) => (e as HTMLInputElement).type !== "checkbox" && (e as HTMLInputElement).type !== "radio");
      return fillable.some((e) => e.tagName === "TEXTAREA") || fillable.length >= 3;
    })
    .catch(() => false);
}

/** How long a hand-off waits. 0 means do not ask (overnight scripts, and anything that is not the app). */
export function handoffWaitMs(): number {
  const raw = process.env.HANDOFF_WAIT_MS;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  return process.env.NEXT_RUNTIME ? 20 * 60 * 1000 : 0;
}

const ids = globalThis as typeof globalThis & { __handoffIds?: number };
const nextId = () => `h${(ids.__handoffIds = (ids.__handoffIds ?? 0) + 1)}`;

function crewOf(tab: string): CrewId {
  const name = tab.split(" · ")[0]?.trim().toLowerCase();
  return (Object.keys(CREW) as CrewId[]).includes(name as CrewId) ? (name as CrewId) : "elliot";
}

export async function pageSnap(page: Page): Promise<{ url: string; title: string; headings: string }> {
  const url = page.url();
  const got = await page
    .evaluate(() => ({
      title: (document.title || "").replace(/\s+/g, " ").trim().slice(0, 180),
      headings: [...document.querySelectorAll("h1, h2")]
        .map((h) => (h.textContent || "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 6)
        .join(" | ")
        .slice(0, 300),
    }))
    .catch(() => ({ title: "", headings: "" }));
  return { url, title: got.title, headings: got.headings };
}

const Verdict = z.object({
  relevant: z.boolean().describe("true only when signing in or solving the check helps the patient"),
  why: z.string().describe("one plain sentence of what the patient gets, or empty when not relevant"),
});

function localJudge(snap: { url: string; title: string; headings: string; kind: HandoffKind; step?: HandoffStep }): { relevant: boolean; why: string } {
  if (isStaffConsole(snap.url, snap.title, snap.headings)) return { relevant: false, why: "" };
  const blob = `${snap.title} ${snap.headings} ${snap.url}`;
  const step = snap.step ?? { flow: "discovery" as const, crew: "kit" as const };
  if (snap.kind !== "login" || /captcha|human check|verify you are|patient|complaint|record|portal|feedback|form|rules|register|directory/i.test(blob)) {
    return { relevant: true, why: handoffLine(step, snap.kind) };
  }
  return { relevant: false, why: "" };
}

/** Title, address and headings only. No page body, no field values, no patient data. */
export async function judgeRelevance(snap: { url: string; title: string; headings: string; kind: HandoffKind; step?: HandoffStep }): Promise<{ relevant: boolean; why: string }> {
  if (isStaffConsole(snap.url, snap.title, snap.headings)) return { relevant: false, why: "" };
  if (process.env.HANDOFF_JUDGE === "local") return localJudge(snap);
  const step = snap.step ?? { flow: "discovery" as const, crew: "kit" as const };
  const line = handoffLine(step, snap.kind);
  try {
    const v = await structured({
      model: MODELS.browser,
      effort: "low",
      name: "handoff_relevance",
      data: [],
      schema: Verdict,
      instructions: `Decide whether the person should be asked to sign in or solve a check so this step can continue. relevant is true only for a public or patient page (a portal, a complaint form, records, a register, or a human check in front of one). relevant is false for staff, admin, intranet or back-office logins, and when you cannot name this step's next action.
This step is "${step.flow}". The sentence may only promise what this step does, and must be written to the person as "you". Never say "the patient". Never say the crew sends, files or submits anything.
If relevant, why is exactly: "${line}"
If not relevant, why is empty. You see only the address, title and headings.`,
      input: `kind: ${snap.kind}\nflow: ${step.flow}\ncrew: ${step.crew}\nurl: ${snap.url}\ntitle: ${snap.title}\nheadings: ${snap.headings}`,
    });
    return { relevant: !!v.relevant, why: v.why ?? "" };
  } catch {
    return { relevant: false, why: "" };
  }
}

const QUIET: Wall = { kind: "dead_end", detail: "This sign-in does not help the patient, so it was left.", url: "" };

export type Gate = { go: true; open?: boolean } | { go: false; wall: Wall; quiet?: boolean };

/**
 * Offer a wall at most twice. A cleared wall lets the worker carry on in the same tab. Skip, timeout, or a wall
 * that is still there is reported as the wall. A staff console, or a benefit the judge cannot name, is a quiet dead end.
 */
export async function gateWall(ctx: WorkerCtx, wall: Wall, recheck: () => Promise<Wall | null>): Promise<Gate> {
  if (!isHandoffKind(wall.kind)) return { go: false, wall };
  // A form already on the page is not blocked by a header login. Do not ask, and do not call the model.
  if (await pageHasUsableForm(ctx.page)) return { go: true, open: true };
  // Research never stops for you: a wall is noted on the route and the crew moves on. You are asked only when there is a case to work on (complaint, review, compensation).
  if ((ctx.step ?? boundStep(ctx.page))?.flow === "discovery") return { go: false, wall };
  const offer = ctx.handoff ?? boundHandoff(ctx.page);
  if (!offer) return { go: false, wall };
  if (handoffWaitMs() <= 0 && !ctx.judge) return { go: false, wall };

  const step = ctx.step ?? boundStep(ctx.page);
  let current = wall;
  for (let attempt = 0; attempt < 2; attempt++) {
    const snap = await pageSnap(ctx.page);
    const verdict = await (ctx.judge ?? judgeRelevance)({ ...snap, kind: current.kind as HandoffKind, step });
    const why = verdict.relevant ? concreteBenefit(verdict.why, step) : null;
    if (!why) return { go: false, quiet: true, wall: { ...QUIET, url: current.url || snap.url } };
    const outcome = await offer(current, why);
    if (outcome !== "continued") return { go: false, wall: current };
    const again = await recheck().catch(() => current);
    if (!again || !isHandoffKind(again.kind)) {
      markHandedOff(ctx.page);
      return { go: true };
    }
    current = again;
  }
  return { go: false, wall: current };
}

/** Ask the patient, keep this tab (and its cookies), and wait. Nothing here is typed, logged or screenshotted. */
export async function performHandoff(opts: {
  runId: string;
  emit: Emit;
  tab: string;
  page: Page;
  wall: Wall;
  why: string;
  step?: HandoffStep;
  crewState: (id: CrewId, state: "idle" | "working" | "waiting" | "done", note: string) => void;
}): Promise<HandoffOutcome> {
  const why = concreteBenefit(opts.why, opts.step);
  if (!why || !isHandoffKind(opts.wall.kind) || handoffWaitMs() <= 0) return "skipped";
  const id = nextId();
  const crew = crewOf(opts.tab);
  const url = opts.page.url();
  hushPage(opts.page, true);
  const onClose = () => resolveHandoff(opts.runId, id, "skip");
  opts.page.once("close", onClose);
  opts.emit({ type: "handoff", id, crew, tab: opts.tab, url, kind: opts.wall.kind, why });
  opts.crewState(crew, "waiting", "Needs you");
  setPageMeta(opts.page, { note: "Needs you", state: "working" });
  try {
    const outcome = await waitHandoff(opts.runId, id, handoffWaitMs());
    opts.emit({ type: "handoff_done", id, outcome });
    if (outcome === "continued") {
      opts.crewState(crew, "working", "Back to work");
      setPageMeta(opts.page, { note: "Back to work", state: "working" });
    }
    return outcome;
  } finally {
    hushPage(opts.page, false);
    opts.page.off("close", onClose);
  }
}

export { handoffHost };
