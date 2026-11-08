import type { CaseFacts } from "./facts";
import { decide } from "./decisions";
import type { TrackSignals } from "./track";

/**
 * Three typed questions about the user's story, answered by the Decisions API (D42). Server only.
 * The model only gives probabilities; the scoring is in lib/agent/track.ts.
 */
export async function trackSignals(f: CaseFacts): Promise<TrackSignals> {
  const story = [f.incidentSummary ?? "", ...f.events.map((e) => `${e.date}: ${e.what}`)].filter(Boolean).join("\n");
  if (!story.trim()) return { lasting: null, costs: null, medicine: null };
  try {
    const { answers } = await decide(`The user's account of what happened with their medical care:\n${story}`, [
      { type: "predicate", name: "lasting", instructions: "Does the account describe harm that is lasting, permanent or still going on (the person has not fully recovered)?" },
      { type: "predicate", name: "costs", instructions: "Does the account say the harm cost the person money, time off work or study, or seriously affected their daily life?" },
      { type: "predicate", name: "medicine", instructions: "Is the problem mainly about a medicine, vaccine, prescription item or medical device: a side effect or reaction, or a product that was faulty, fake or not what was prescribed?" },
    ]);
    const p = (name: string) => {
      const a = answers.find((x) => x.name === name);
      return a && a.type === "predicate" ? a.probability : null;
    };
    return { lasting: p("lasting"), costs: p("costs"), medicine: p("medicine") };
  } catch {
    return { lasting: null, costs: null, medicine: null };
  }
}
