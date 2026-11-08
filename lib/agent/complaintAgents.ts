import type { Page } from "playwright";
import { z } from "zod";
import { dismissCookies } from "../browser";
import { pointAt } from "../agentCursor";
import type { CaseFacts } from "./facts";
import { EFFORT, MODELS, structured } from "./llm";
import { pageText, type Note, type Tracker } from "./legalAid";
import { hasSupport } from "./complaintSupport";
import { countTimeLimit, type TimeLimitStatus } from "./timeLimit";

/**
 * Robin's two reading skills for the complaint crew (D65). Both open real pages and answer only from them.
 * Sources checked 2026-11-07: NHS Lothian's "How do I make a complaint" pages and Citizens Advice Scotland's page on NHS complaints (the SPSO site was returning errors, and NHS Lothian's pages do not state the time limit).
 */

const NHS_BASE = "https://www.nhslothian.scot/yourrights/patient-experience-team-tell-us-about-your-experience/how-do-i-make-a-complaint/";
export const NHS_PROCESS_URLS = [NHS_BASE, `${NHS_BASE}what-happens-when-i-complain/`];
export const TIME_LIMIT_PAGE = "https://www.citizensadvice.org.uk/scotland/health/nhs-healthcare-s/nhs-complaints-s/";

async function open(page: Page, url: string, note: Note, track: Tracker, hover: RegExp) {
  note(`Opening ${new URL(url).hostname.replace(/^www\./, "")}`);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);
  await dismissCookies(page, 2500);
  track.bump("action");
  await note.log("open", `Opened ${page.url()}`, { shot: true });
  const hit = page.getByText(hover).first();
  if (await hit.isVisible({ timeout: 2500 }).catch(() => false)) {
    await pointAt(page, hit);
    await hit.scrollIntoViewIfNeeded().catch(() => {});
  }
  return (await pageText(page)).replace(/\s+/g, " ").slice(0, 9000);
}

const Process = z.object({
  summary: z.string().describe("Two plain sentences: how a complaint to this health board works, from the pages only"),
  steps: z.array(z.string()).describe("What happens after the complaint is sent, in order, at most 4 short steps, each as the pages describe it"),
  support: z.string().describe("Free help the pages offer for making a complaint (e.g. an advice service), one sentence. Empty string if none is mentioned."),
});
export type ProcessReading = z.infer<typeof Process> & { url: string };

/** Open NHS Lothian's own complaint pages (two, in one tab) and say how a complaint is handled. */
export async function readProcess(page: Page, note: Note, track: Tracker): Promise<ProcessReading> {
  const texts: string[] = [];
  texts.push(await open(page, NHS_PROCESS_URLS[0], note, track, /how do i make a complaint|make a complaint/i));
  texts.push(await open(page, NHS_PROCESS_URLS[1], note, track, /what happens/i));
  note("Reading how they handle complaints");
  const r = await structured({
    model: MODELS.browser,
    effort: EFFORT.browser,
    instructions: "You read an NHS health board's complaint pages for a patient's research agent. Answer only from the page text. Never invent steps, dates or services.",
    input: `Page 1:\n${texts[0]}\n\nPage 2:\n${texts[1]}`,
    schema: Process,
    name: "complaint_process",
  });
  await note.log("read", `NHS Lothian: ${r.steps.length} steps after you complain${hasSupport(r.support) ? "; free help is offered" : ""}`, { shot: true, detail: [r.summary, ...r.steps.map((s, i) => `${i + 1}. ${s}`), r.support].filter(Boolean).join("\n") });
  note(`${r.steps.length} steps`);
  return { ...r, support: hasSupport(r.support) ? r.support : "", url: NHS_PROCESS_URLS[0] };
}

const TimeLimit = z.object({
  limit: z.string().describe("The time limit for bringing a complaint, quoted from the page in one sentence"),
});
export type TimeLimitReading = { limit: string; status: TimeLimitStatus; explanation: string; url: string };

/**
 * Open Citizens Advice Scotland's page on NHS complaints and work out where the patient stands against the time limit, from their own timeline.
 * The model only quotes the limit from the page. Whether the patient is within it is counted in code (lib/agent/timeLimit.ts): date arithmetic
 * by a model is not reliable enough for a legal deadline.
 */
export async function checkTimeLimit(page: Page, facts: CaseFacts, note: Note, track: Tracker): Promise<TimeLimitReading> {
  const text = await open(page, TIME_LIMIT_PAGE, note, track, /time limit|six months/i);
  if (!/months/i.test(text)) throw new Error("The page with the time limit did not load");
  note("Counting from your dates");
  const r = await structured({
    model: MODELS.browser,
    effort: EFFORT.browser,
    instructions: "You quote a time limit from a web page for a patient's research agent. Use only the page text. Never invent a limit.",
    input: `Page: ${page.url()}\n\n${text}`,
    schema: TimeLimit,
    name: "time_limit",
  });
  // The count below assumes the usual Scottish rule (6 months, 12 at most). If the page no longer says six months, say so instead of counting.
  const count: { status: TimeLimitStatus; explanation: string } = /\b(six|6) months\b/i.test(text)
    ? countTimeLimit(facts.events.map((e) => e.date))
    : { status: "unclear", explanation: "The page no longer states the usual six-month limit, so Elliot did not count it. Please check the page." };
  await note.log("check", `${count.status === "within" ? "Within" : count.status === "close" ? "Close to" : count.status === "outside" ? "Past" : "Could not tell about"} the time limit`, { detail: `${r.limit}\n\n${count.explanation}` });
  note(count.status === "within" ? "Within the time limit" : count.status === "close" ? "Close to the limit" : count.status === "outside" ? "Past the limit" : "Dates unclear");
  return { limit: r.limit, status: count.status, explanation: count.explanation, url: TIME_LIMIT_PAGE };
}
