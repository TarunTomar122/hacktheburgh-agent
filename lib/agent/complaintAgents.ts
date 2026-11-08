import type { Page } from "playwright";
import { z } from "zod";
import { dismissCookies } from "../browser";
import { pointAt } from "../agentCursor";
import type { CaseFacts } from "./facts";
import { EFFORT, MODELS, modelFor, structured } from "./llm";
import { pageText, type Note, type Tracker } from "./legalAid";
import { hasSupport } from "./complaintSupport";

/**
 * Robin's two reading skills for the complaint crew. Both open real pages and answer only from them.
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
  status: z.enum(["within", "close", "outside", "unclear"]).describe("Is the patient's complaint within that limit today? 'close' = fewer than 8 weeks left. 'unclear' if the dates are too vague to tell."),
  explanation: z.string().describe("Two plain sentences for the patient: which date you counted from, how long ago it was, and what that means. If outside the limit, say that the page allows exceptions only if it does."),
});
export type TimeLimitReading = z.infer<typeof TimeLimit> & { url: string };

/** No browser: the patient's timeline against a time limit stated on a page. Health data, so local by default. */
export async function judgeTimeLimit(text: string, url: string, facts: CaseFacts, today = new Date().toISOString().slice(0, 10)): Promise<z.infer<typeof TimeLimit>> {
  const timeline = facts.events.map((e) => `${e.date}: ${e.what}`).join("\n") || facts.incidentSummary || "no dates given";
  return structured({
    ...modelFor("reason", ["health"]), // the patient's timeline: on this Mac by default (the page itself is public)
    instructions: "You check a patient's complaint against a time limit for a research agent. Use only the page text for the limit and only the patient's timeline for the dates. Never guess a date. The limit counts from the event or from when the patient found out they had a reason to complain, and never more than 12 months after the event, unless the page says it can be waived.",
    input: `Today: ${today}\nPage: ${url}\n\n${text}\n\nPatient's timeline:\n${timeline}`,
    schema: TimeLimit,
    name: "time_limit",
    data: ["health"],
  });
}

/** Open Citizens Advice Scotland's page on NHS complaints and work out where the patient stands against the time limit, from their own timeline. */
export async function checkTimeLimit(page: Page, facts: CaseFacts, note: Note, track: Tracker): Promise<TimeLimitReading> {
  const text = await open(page, TIME_LIMIT_PAGE, note, track, /time limit|six months/i);
  if (!/months/i.test(text)) throw new Error("The page with the time limit did not load");
  note("Counting from your dates");
  const r = await judgeTimeLimit(text, page.url(), facts);
  await note.log("check", `${r.status === "within" ? "Within" : r.status === "close" ? "Close to" : r.status === "outside" ? "Past" : "Could not tell about"} the time limit`, { detail: `${r.limit}\n\n${r.explanation}` });
  note(r.status === "within" ? "Within the time limit" : r.status === "close" ? "Close to the limit" : r.status === "outside" ? "Past the limit" : "Dates unclear");
  return { ...r, url: TIME_LIMIT_PAGE };
}
