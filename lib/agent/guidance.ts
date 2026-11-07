import type { CaseFacts } from "./facts";
import { compareCare, type GuidelineReading } from "./evidence";
import type { CrewKit } from "./crewRun";
import type { EvidenceResult, Thought } from "./plannerTypes";
import type { RouteMap } from "./routeTypes";
import { exploreSite, readPage } from "./workers/explore";

/**
 * Iona's guidance step for any place (night plan, "Elliot anywhere"): on the guidance body discovery found, find the
 * recommendation about the patient's condition, quote it word for word (checked by code), and compare it with the
 * patient's own timeline. Shared by the complaint and compensation flows.
 */
export async function findGuidance(kit: CrewKit, thought: Thought, route: RouteMap, facts: CaseFacts, condition: string, proof: EvidenceResult): Promise<{ text: string; guideline: GuidelineReading | null }> {
  const g = route.steps.find((s) => s.kind === "guideline");
  const start = g?.url ?? g?.sources[0]?.url;
  if (!start) return { text: "Could not find guidance: discovery found no clinical guidance body.", guideline: null };
  const r = await kit.inTab(thought, "iona", (g?.body ?? "Guidance").slice(0, 26), async (p, note) => {
    const ctx = { page: p, note, track: kit.track };
    const found = await exploreSite(ctx, start, `the clinical guidance recommendation about ${condition}`, { want: "page" });
    return readPage(ctx, found.ok ? found.url : start, `Quote, word for word, the recommendation(s) about ${condition}, with their numbers if printed.`);
  }, 150_000);
  if (!r.ok) return { text: `Could not find the guidance: ${r.error}`, guideline: null };
  const quotes = r.value.quotes.filter((q) => q.checked);
  if (!quotes.length) return { text: `No recommendation about ${condition} found on ${r.value.url}.`, guideline: null };
  const guideline: GuidelineReading = { guideline: g?.body ?? r.value.title, url: r.value.url, points: quotes.map((q, i) => ({ id: `${i + 1}`, text: q.quote })) };
  proof.guideline = { name: guideline.guideline, url: guideline.url, points: guideline.points };
  const c = await compareCare(facts, guideline);
  proof.gaps = c.gaps;
  proof.caveat = c.caveat;
  kit.emit({ type: "evidence", evidence: { ...proof } });
  kit.finding(`${guideline.guideline}: "${quotes[0].quote.slice(0, 120)}"`, r.value.url, "iona");
  return { text: `${guideline.guideline}:\n${quotes.map((q) => q.quote).join("\n")}\nPossible gaps: ${c.gaps.map((x) => x.question).join(" | ") || "none"}`, guideline };
}
