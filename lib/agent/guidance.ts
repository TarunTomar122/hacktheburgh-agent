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
export async function checkApplicability(patient: { ageBand: string; condition: string; setting: string; place: string }, source: { body: string; title: string; url: string }, quotes: string[]): Promise<ApplicabilityVerdict[]> {
  const r = await structured({
    ...modelFor("check", ["health"]),
    instructions:
      "You check whether a quoted clinical recommendation applies to a particular patient. Judge only the quote and the page that carries it. " +
      "It does NOT apply if it is about a different population (for example children when the patient is an adult, or the reverse), a different condition, a different care setting, or a different country's system. " +
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
  const r = await kit.inTab(thought, "iona", (g?.body ?? "Guidance").slice(0, 26), async (p, note) => {
    const ctx = { page: p, note, track: kit.track };
    const found = await exploreSite(ctx, start, `the clinical guidance recommendation about ${condition}`, { want: "page" });
    // A PDF can come out with broken spacing ("f or first -line"): such quotes are not shown to the patient; look for a clean page.
    const clean = (q: { quote: string; checked: boolean }) => q.checked && q.quote.split(/\s+/).filter((w) => /^[a-z]{1,2}$/i.test(w)).length <= q.quote.split(/\s+/).length * 0.25;
    const first = await readPage(ctx, found.ok ? found.url : start, ask);
    if (first.quotes.some(clean)) return first;
    // The body's own site did not lead there: search the web for its guidance on this condition, on the same site first.
    await note.log("recover", `No recommendation on ${found.ok ? found.url : start}; searching ${new URL(start).hostname} for guidance on ${condition}`);
    const host = new URL(start).hostname.replace(/^www\./, "");
    let hits = await webSearch(p, `site:${host} ${condition} recommendation`, note, kit.track).catch(() => []);
    if (!hits.length) hits = await webSearch(p, `${g?.body ?? ""} guideline ${condition} recommendation`, note, kit.track).catch(() => []);
    for (const h of hits.slice(0, 3)) {
      const next = await readPage(ctx, h.url, ask);
      if (next.quotes.some(clean)) return next;
    }
    return first;
  }, 240_000);
  if (!r.ok) return none(`Could not find the guidance: ${r.error}`);
  const quotes = r.value.quotes.filter((q) => q.checked && q.quote.split(/\s+/).filter((w) => /^[a-z]{1,2}$/i.test(w)).length <= q.quote.split(/\s+/).length * 0.25);
  if (!quotes.length) return none(`No recommendation about ${condition} found on ${r.value.url}.`);
  // Before comparing: does each quote apply to this patient at all (age group, condition, setting, place)? Only those that do go on.
  let verdicts: ApplicabilityVerdict[];
  try {
    const band = await ageBandOf(facts);
    verdicts = await checkApplicability(
      { ageBand: band.band.replace(/_/g, " "), condition, setting: route.place.careSetting === "unknown" ? "not stated" : route.place.careSetting, place: [route.place.region, route.place.country].filter(Boolean).join(", ") || "not stated" },
      { body: g?.body ?? "", title: r.value.title, url: r.value.url },
      quotes.map((q) => q.quote),
    );
  } catch (e) {
    // Not able to check = not able to use: an unchecked recommendation never enters the complaint.
    return none(`Found guidance on ${r.value.url} but could not check that it applies to this patient (${e instanceof Error ? e.message.slice(0, 120) : "check failed"}), so it is not used.`);
  }
  const applicable = quotes.filter((_, i) => verdicts[i].verdict === "applies");
  const rejected = verdicts.filter((v) => v.verdict !== "applies");
  if (!applicable.length) {
    kit.finding(`Guidance found (${g?.body ?? r.value.title}) but it does not apply to this patient: ${rejected[0]?.reason ?? "unclear"}`, r.value.url, "iona");
    return none(`No applicable guidance found. ${g?.body ?? r.value.title} (${r.value.url}) was checked, but its recommendations are not for this patient: ${rejected.map((v) => `"${v.quote.slice(0, 100)}" (${v.verdict === "unclear" ? "unclear: " : ""}${v.reason})`).join(" | ")}`, rejected);
  }
  const guideline: GuidelineReading = { guideline: g?.body ?? r.value.title, url: r.value.url, points: applicable.map((q, i) => ({ id: `${i + 1}`, text: q.quote })) };
  proof.guideline = { name: guideline.guideline, url: guideline.url, points: guideline.points };
  const c = await compareCare(facts, guideline);
  proof.gaps = c.gaps;
  proof.caveat = c.caveat;
  kit.emit({ type: "evidence", evidence: { ...proof } });
  kit.finding(`${guideline.guideline}: "${applicable[0].quote.slice(0, 120)}"`, r.value.url, "iona");
  return { text: `${guideline.guideline}:\n${applicable.map((q) => q.quote).join("\n")}\nPossible gaps: ${c.gaps.map((x) => x.question).join(" | ") || "none"}`, guideline, notApplicable: rejected.length ? rejected : undefined };
}
