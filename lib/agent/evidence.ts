import type { Page } from "playwright";
import { z } from "zod";
import { dismissCookies } from "../browser";
import { pointAt } from "../agentCursor";
import type { CaseFacts } from "./facts";
import { EFFORT, MODELS, modelFor, structured } from "./llm";
import { pageText, type Note, type Tracker } from "./legalAid";

/**
 * The evidence agent ("Iona", D48). Three browser skills and one reasoning step:
 *  - readGuideline: open a clinical guideline page and pull out the recommendations about the patient's condition.
 *  - searchCaseLaw: search BAILII (court judgments) and list the results.
 *  - readJudgment: open one judgment and say, honestly, how it relates (same kind of case or only a similar injury).
 *  - compareCare: compare the guideline with the patient's own timeline and list POSSIBLE gaps for a solicitor to check.
 * It never says anyone was negligent. Sources verified 2026-11-07: NICE NG38 (rec 1.2.3 on suspected scaphoid
 * fractures) and BAILII search (behind Anubis, a check a real browser passes by itself, then the page reloads).
 */

export const NICE_FRACTURES = "https://www.nice.org.uk/guidance/ng38/chapter/Recommendations";
const BAILII_SEARCH = "https://www.bailii.org/cgi-bin/lucy_search_1.cgi";

/** BAILII's Anubis check reloads the page, which aborts goto(). Wait until the page we wanted is really there. */
async function openPatiently(page: Page, url: string, ready: RegExp, note: Note) {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch {
    /* the site's own check reloaded the page */
  }
  for (let i = 0; i < 25; i++) {
    const t = await pageText(page);
    if (ready.test(t)) return t;
    if (i === 2) {
      note("Waiting for the site's bot check to clear");
      await note.log("recover", "The site runs a browser check before showing the page; waiting for it to clear by itself");
    }
    await page.waitForTimeout(1000);
  }
  return pageText(page);
}

const Guideline = z.object({
  guideline: z.string().describe("Name and number of the guideline, e.g. 'NICE NG38 Fractures (non-complex)'"),
  points: z.array(z.object({ id: z.string().describe("Recommendation number as printed, e.g. 1.2.3"), text: z.string().describe("The recommendation, quoted exactly from the page") })).describe("Only recommendations about the patient's condition. Empty if none."),
});
export type GuidelineReading = z.infer<typeof Guideline> & { url: string };

export async function readGuideline(page: Page, topic: string, note: Note, track: Tracker, url = NICE_FRACTURES): Promise<GuidelineReading> {
  note("Opening the clinical guideline");
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);
  await dismissCookies(page, 2500);
  await note.log("open", `Opened ${page.url()}`, { shot: true });
  // Scroll to the part about the topic, so the user sees where the agent is reading.
  const hit = page.getByText(new RegExp(topic.split(/\s+/)[0], "i")).first();
  if (await hit.isVisible({ timeout: 3000 }).catch(() => false)) {
    await pointAt(page, hit);
    track.bump("action");
  }
  note("Reading the recommendations");
  const text = (await pageText(page)).replace(/\s+/g, " ").slice(0, 24000);
  const r = await structured({
    model: MODELS.browser,
    effort: EFFORT.browser,
    instructions: "You read a clinical guideline page for a research agent. Quote recommendations exactly as printed. Never invent or paraphrase numbers.",
    input: `Topic: ${topic}\nPage: ${page.url()}\n\n${text}`,
    schema: Guideline,
    name: "guideline_reading",
  });
  await note.log("read", r.points.length ? `Found ${r.points.length} recommendation${r.points.length === 1 ? "" : "s"} about ${topic} in ${r.guideline}` : `No recommendation about ${topic} on this page`, {
    shot: true,
    detail: r.points.map((p) => `${p.id}: ${p.text}`).join("\n\n"),
  });
  note(r.points.length ? `Found rec ${r.points.map((p) => p.id).join(", ")}` : "Nothing about it here");
  return { ...r, url: page.url() };
}

export type CaseHit = { title: string; url: string; citation: string };

export async function searchCaseLaw(page: Page, query: string, note: Note, track: Tracker): Promise<CaseHit[]> {
  note(`Searching judgments: ${query}`);
  const url = `${BAILII_SEARCH}?method=boolean&query=${encodeURIComponent(query)}&mask_path=scot&sort=rank`;
  const text = await openPatiently(page, url, /documents found|Total results|No documents/i, note);
  track.bump("action");
  const hits = await page.$$eval("a", (as) =>
    as
      .filter((a) => /\/scot\/cases\//.test((a as HTMLAnchorElement).href) && (a.textContent ?? "").trim().length > 8)
      .map((a) => ({ title: (a.textContent ?? "").replace(/\s+/g, " ").trim(), url: (a as HTMLAnchorElement).href, citation: ((a.parentElement?.textContent ?? "").match(/\[\d{4}\][^;)]*/) ?? [""])[0].trim() }))
      .slice(0, 8),
  );
  if (hits.length) await pointAt(page, page.locator("a", { hasText: hits[0].title.slice(0, 30) }).first());
  await note.log("read", `BAILII: ${hits.length} Scottish judgment${hits.length === 1 ? "" : "s"} for "${query}"`, { shot: true, detail: hits.map((h, i) => `${i + 1}. ${h.title}`).join("\n") || text.slice(0, 300) });
  note(`${hits.length} judgments`);
  return hits;
}

const Judgment = z.object({
  title: z.string(),
  court: z.string(),
  year: z.string(),
  kind: z.enum(["medical_negligence", "similar_injury_other_cause", "not_relevant"]).describe("Is this a medical negligence case, a case about a similar injury from another cause (e.g. an accident), or not relevant?"),
  summary: z.string().describe("Two plain sentences on what happened and what the court decided. Only from the text."),
  award: z.string().describe("Damages awarded for the injury if the text states a figure, quoted with the amount; empty string if not stated"),
});
export type JudgmentReading = z.infer<typeof Judgment> & { url: string };

export async function readJudgment(page: Page, url: string, about: string, note: Note, track: Tracker): Promise<JudgmentReading> {
  note("Opening the judgment");
  const text = await openPatiently(page, url, /\b(opinion|pursuer|defender|judgment|lord)\b/i, note);
  track.bump("action");
  await note.log("open", `Opened ${page.url()}`, { shot: true });
  const at = page.getByText(new RegExp(about.split(/\s+/)[0], "i")).first();
  if (await at.isVisible({ timeout: 2000 }).catch(() => false)) {
    await pointAt(page, at);
    await at.scrollIntoViewIfNeeded().catch(() => {});
  }
  note(`Reading ${Math.round(text.length / 1000)}k characters`);
  const r = await structured({
    model: MODELS.browser,
    effort: EFFORT.browser,
    instructions: "You read a court judgment for a patient's research agent. Be honest about relevance: a car accident case is NOT a medical negligence case even if the injury is similar. Never invent amounts.",
    input: `What the patient's case is about: ${about}\nJudgment: ${page.url()}\n\n${text.replace(/\s+/g, " ").slice(0, 30000)}`,
    schema: Judgment,
    name: "judgment_reading",
  });
  const kind = r.kind === "medical_negligence" ? "a medical negligence case" : r.kind === "similar_injury_other_cause" ? "a similar injury from another cause" : "not relevant";
  await note.log("read", `${r.title} (${r.year}): ${kind}${r.award ? `; award: ${r.award}` : ""}`, { detail: r.summary });
  note(r.kind === "not_relevant" ? "Not relevant" : r.award ? `Award: ${r.award.slice(0, 40)}` : "Read");
  return { ...r, url: page.url() };
}

const Comparison = z.object({
  gaps: z.array(
    z.object({
      guideline: z.string().describe("The recommendation id and short quote"),
      timeline: z.string().describe("What the patient's own account says happened instead, quoted or closely paraphrased"),
      question: z.string().describe("The plain question a solicitor or medical expert would need to check. Never say negligence happened."),
    }),
  ),
  caveat: z.string().describe("One sentence: what this comparison cannot tell (e.g. guideline is for England; only the medical records show what was done)."),
});
export type CareComparison = z.infer<typeof Comparison>;

/** No browser: compare what the guideline recommends with the patient's own account. Possible gaps only. */
export async function compareCare(facts: CaseFacts, g: GuidelineReading): Promise<CareComparison> {
  const story = [facts.incidentSummary, ...facts.events.map((e) => `${e.date}: ${e.what}`)].filter(Boolean).join("\n");
  return structured({
    ...modelFor("draft", ["health"]), // the patient's health story: on this Mac by default
    instructions:
      "Compare a clinical guideline with a patient's own account. List only POSSIBLE gaps between what the guideline recommends and what the patient says happened, as questions for a solicitor or medical expert. Never say anyone was negligent or that care was wrong. If nothing differs, return no gaps.",
    input: `Guideline (${g.guideline}, ${g.url}):\n${g.points.map((p) => `${p.id}: ${p.text}`).join("\n")}\n\nPatient's account:\n${story}`,
    schema: Comparison,
    name: "care_comparison",
    data: ["health"],
  });
}
