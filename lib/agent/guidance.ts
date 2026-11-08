import { tabName } from "./crewRun";
import type { CaseFacts } from "./facts";
import { compareCare, type GuidelineReading } from "./evidence";
import type { CrewKit } from "./crewRun";
import type { EvidenceResult, Thought } from "./plannerTypes";
import type { RouteMap } from "./routeTypes";
import { exploreSite, readPage } from "./workers/explore";
import { webSearch } from "./planner";
import { structured, modelFor } from "./llm";
import { z } from "zod";

/** Empty the draft inputs that come from clinical guidance. Call it whenever guidance is dropped (no applicable guidance, or replanning drops the guidance step), so a stale or irrelevant quote can never reach the draft. */
export function clearGuidance(proof: EvidenceResult): void {
  delete proof.guideline;
  delete proof.gaps;
  delete proof.caveat;
}

// ---------- does a quoted recommendation apply to THIS patient? ----------

const AgeBand = z.object({
  band: z.enum(["infant_or_child_under_12", "adolescent_12_to_17", "adult_18_to_64", "older_adult_65_plus", "unknown"]),
  basis: z.string().describe("The words from the account that show the age or life stage, or 'not stated'."),
});
const Applicability = z.object({
  verdicts: z.array(
    z.object({
      id: z.string().describe("The quote's id, exactly as given."),
      verdict: z.enum(["applies", "does_not_apply", "unclear"]),
      reason: z.string().describe("One short sentence: which of age group / population, condition, care setting or place decides it."),
    }),
  ),
});
export type ApplicabilityVerdict = z.infer<typeof Applicability>["verdicts"][number] & { quote: string };

/**
 * Age group of the patient, from the account (private health story: on this Mac by default). Only the band leaves this
 * function; the applicability call below sees that band, never the story.
 */
export async function ageBandOf(facts: CaseFacts): Promise<z.infer<typeof AgeBand>> {
  const account = [facts.incidentSummary, ...facts.events.map((e) => e.what)].filter(Boolean).join("\n");
  return structured({
    ...modelFor("check", ["health"]),
    instructions: "From the patient's own account, say which age group the patient is in. Use only what the account shows (stated age, life stage such as school, exams, work, retirement, 'my son'). If the account does not show it, answer unknown. Do not guess.",
    input: `Account:\n${account}\nThe account is written by: ${facts.complainingFor === "someone_else" ? "someone on behalf of the patient (the patient may be a child or an adult)" : "the patient"}.`,
    schema: AgeBand,
    name: "patient_age_band",
    data: ["health"],
  });
}

/**
 * For each quoted recommendation: does it apply to this patient (age group or population, condition, care setting,
 * jurisdiction)? The model sees only the minimal facts: age band, condition, care setting, place (country and region), who
 * published the page and the quotes. The patient's name, address and story are not in this call. Health facts (age band,
 * condition) make it a local call unless LOCAL_MODELS=0 (modelFor).
 */
export async function checkApplicability(patient: { ageBand: string; condition: string; setting: string; place: string }, source: { body: string; title: string; url: string }, quotes: string[], opts: { otherPlaceOk?: boolean } = {}): Promise<ApplicabilityVerdict[]> {
  const r = await structured({
    ...modelFor("check", ["health"]),
    instructions:
      "You check whether a quoted clinical recommendation applies to a particular patient. Judge only the quote and the page that carries it. " +
      "It does NOT apply if it is about a different population (for example children when the patient is an adult, or the reverse), a different condition, or a different care setting" + (opts.otherPlaceOk ? ". It MAY apply even if another country published it, when it is general clinical practice for this condition (how to examine, image or treat it) and not about that country's own services, funding or law; the patient is told where it comes from. " : ", or a different country's system. ") + " " +
      "If the page or its publisher is for another population (for example a children's service) and the quote does not say otherwise, that counts. " +
      "'applies' needs positive reasons on age group, condition and setting; if you cannot tell, answer unclear. Give every quote a verdict.",
    input: `Patient: age group ${patient.ageBand}; condition: ${patient.condition}; care setting: ${patient.setting}; place: ${patient.place}.\nPage: ${source.title} (${source.body}, ${source.url})\nQuotes:\n${quotes.map((q, i) => `${i + 1}: ${q}`).join("\n")}`,
    schema: Applicability,
    name: "guidance_applicability",
    data: ["health"],
  });
  return quotes.map((quote, i) => {
    const v = r.verdicts.find((x) => x.id === `${i + 1}`);
    return v ? { ...v, quote } : { id: `${i + 1}`, verdict: "unclear" as const, reason: "The check gave no answer for this quote.", quote };
  });
}

/**
 * Iona's guidance step for any place (night plan, "Elliot anywhere"): on the guidance body discovery found, find the
 * recommendation about the patient's condition, quote it word for word (checked by code), and compare it with the
 * patient's own timeline. Shared by the complaint and compensation flows.
 */
export async function findGuidance(kit: CrewKit, thought: Thought, route: RouteMap, facts: CaseFacts, condition: string, proof: EvidenceResult): Promise<{ text: string; guideline: GuidelineReading | null; notApplicable?: ApplicabilityVerdict[] }> {
  /** Whatever this returns, the draft inputs match it: no guidance means no `proof.guideline`, `proof.gaps` or `proof.caveat`. */
  const none = (text: string, notApplicable?: ApplicabilityVerdict[]) => {
    clearGuidance(proof);
    kit.emit({ type: "evidence", evidence: { ...proof } });
    return { text, guideline: null, notApplicable };
  };
  const g = route.steps.find((s) => s.kind === "guideline");
  const start = g?.url ?? g?.sources[0]?.url;
  if (!start) return none("Could not find guidance: discovery found no clinical guidance body.");
  const ask = `Quote, word for word, the recommendation(s) about ${condition}, with their numbers if printed.`;
  const where = [route.place.region, route.place.country].filter(Boolean).join(", ");
  const setting = route.place.careSetting === "unknown" ? "not stated" : route.place.careSetting;
  // A PDF can come out with broken spacing ("f or first -line"): such quotes are not shown to the patient; look for a clean page.
  const clean = (q: { quote: string; checked: boolean }) => q.checked && q.quote.split(/\s+/).filter((w) => /^[a-z]{1,2}$/i.test(w)).length <= q.quote.split(/\s+/).length * 0.25;
  const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  /** Who published a page: the guidance body when it is on the body's own site, otherwise the page's own title or site (never the body by default). */
  const publisherOf = (url: string, title: string) => (g?.body && hostOf(url) && hostOf(start) && (hostOf(url) === hostOf(start) || hostOf(url).endsWith(`.${hostOf(start)}`)) ? g.body : title || hostOf(url));
  type Cand = { url: string; title: string; quotes: string[] };
  type Judged = { cand: Cand; verdicts: ApplicabilityVerdict[]; applicable: string[]; rejected: ApplicabilityVerdict[]; foreign: boolean };
  /** Does this page's recommendation apply to this patient (age group, condition, setting, place)? A page that does not is not the end of the search. */
  const judge = async (cand: Cand, foreign = false): Promise<Judged | { error: string }> => {
    try {
      const band = await ageBandOf(facts);
      const verdicts = await checkApplicability({ ageBand: band.band.replace(/_/g, " "), condition, setting, place: where || "not stated" }, { body: publisherOf(cand.url, cand.title), title: cand.title, url: cand.url }, cand.quotes, { otherPlaceOk: foreign });
      return { cand, verdicts, applicable: cand.quotes.filter((_, i) => verdicts[i].verdict === "applies"), rejected: verdicts.filter((v) => v.verdict !== "applies"), foreign };
    } catch (e) {
      // Not able to check = not able to use: an unchecked recommendation never enters the complaint.
      return { error: `Found guidance on ${cand.url} but could not check that it applies to this patient (${e instanceof Error ? e.message.slice(0, 120) : "check failed"}), so it is not used.` };
    }
  };
  const r = await kit.inTab(thought, "iona", tabName(g?.body ?? "Guidance"), async (p, note) => {
    const ctx = { page: p, note, track: kit.track };
    const tried: Judged[] = [];
    const seen = new Set<string>();
    /** Read a page; if it has clean quotes, judge them. Returns the judgement when something applies. */
    const tryPage = async (url: string, foreign = false): Promise<Judged | { error: string } | null> => {
      if (seen.has(url)) return null;
      seen.add(url);
      const page = await readPage(ctx, url, ask);
      const quotes = page.quotes.filter(clean).map((q) => q.quote);
      if (!quotes.length) return null;
      const j = await judge({ url: page.url, title: page.title, quotes }, foreign);
      if ("error" in j) return j;
      tried.push(j);
      return j.applicable.length ? j : null;
    };
    const found = await exploreSite(ctx, start, `the clinical guidance recommendation about ${condition}`, { want: "page" });
    const hit1 = await tryPage(found.ok ? found.url : start);
    if (hit1) return { best: hit1, tried };
    // The body's own site did not lead there (or what it had is not for this patient): search for its guidance on this condition, its own site first, then anywhere.
    await note.log("recover", `Nothing that applies on ${found.ok ? found.url : start}; searching for guidance on ${condition}`);
    const host = new URL(start).hostname.replace(/^www\./, "");
    const queries = [`site:${host} ${condition} recommendation`, `${g?.body ?? ""} guideline ${condition} recommendation ${where}`, `${condition} clinical guideline recommendation ${where}`];
    let reads = 0;
    for (const q of queries) {
      if (reads >= 5) break;
      const hits = await webSearch(p, q, note, kit.track).catch(() => []);
      for (const h of hits.slice(0, 3)) {
        if (reads >= 5) break;
        if (seen.has(h.url)) continue;
        reads++;
        const j = await tryPage(h.url);
        if (j) return { best: j, tried };
      }
    }
    // Nothing from this place's own bodies fits: general clinical practice for the condition from anywhere reputable, clearly labelled as not from here.
    await note.log("recover", `Nothing from ${where || "this place"} fits; looking for general clinical guidance on ${condition}`);
    const general = await webSearch(p, `${condition} clinical guideline management recommendation`, note, kit.track).catch(() => []);
    let more = 0;
    for (const h of general) {
      if (more >= 3) break;
      if (seen.has(h.url)) continue;
      more++;
      const j = await tryPage(h.url, true);
      if (j) return { best: j, tried };
    }
    return { best: null, tried };
  }, 360_000);
  if (!r.ok) return none(`Could not find the guidance: ${r.error}`);
  const best = r.value.best;
  if (best && "error" in best) return none(best.error);
  if (!best) {
    const last = r.value.tried[r.value.tried.length - 1];
    if (!last) return none(`No recommendation about ${condition} found.`);
    const rejected = last.rejected;
    kit.finding(`Guidance found (${publisherOf(last.cand.url, last.cand.title)}) but it does not apply to this patient: ${rejected[0]?.reason ?? "unclear"}`, last.cand.url, "iona");
    return none(`No applicable guidance found. ${publisherOf(last.cand.url, last.cand.title)} (${last.cand.url}) was checked, but its recommendations are not for this patient: ${rejected.map((v) => `"${v.quote.slice(0, 100)}" (${v.verdict === "unclear" ? "unclear: " : ""}${v.reason})`).join(" | ")}`, rejected);
  }
  const applicable = best.applicable.map((quote) => ({ quote }));
  const rejected = best.rejected;
  const src = best.cand;
  const guideline: GuidelineReading = { guideline: best.foreign ? `${publisherOf(src.url, src.title)} (published outside ${where || "your place"})` : publisherOf(src.url, src.title), url: src.url, points: applicable.map((q, i) => ({ id: `${i + 1}`, text: q.quote })) };
  proof.guideline = { name: guideline.guideline, url: guideline.url, points: guideline.points };
  const c = await compareCare(facts, guideline);
  proof.gaps = c.gaps;
  proof.caveat = c.caveat;
  kit.emit({ type: "evidence", evidence: { ...proof } });
  kit.finding(`${guideline.guideline}: "${applicable[0].quote.slice(0, 120)}"`, src.url, "iona");
  return { text: `${guideline.guideline}:\n${applicable.map((q) => q.quote).join("\n")}\nPossible gaps: ${c.gaps.map((x) => x.question).join(" | ") || "none"}`, guideline, notApplicable: rejected.length ? rejected : undefined };
}
