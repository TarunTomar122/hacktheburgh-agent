/**
 * Discovery speed levers (night plan, "discovery in about a minute"). Each lever is independent so a run can be timed
 * with any mix; "classic" is how discovery worked before, "fast" turns all five on.
 *   fastmodel   the planner's turns after the first use the small model at low effort.
 *   batch       the planner is told to issue every independent call in one turn; more tabs run at once.
 *   autorecord  after a page is read, code asks the small model to write the route step from the checked quotes
 *               (code still checks them), so the planner does not spend turns on record_step.
 *   selfrecover when a page cannot be read or a site has no such page, code searches for another page by itself.
 *   workers     the planner plans once and hands each crew member a job; members run their own short loops at the
 *               same time on the small model; the planner only merges.
 */
export type Speed = { fastmodel: boolean; batch: boolean; autorecord: boolean; selfrecover: boolean; workers: boolean };
export const LEVERS = ["fastmodel", "batch", "autorecord", "selfrecover", "workers"] as const;
export type Lever = (typeof LEVERS)[number];

const OFF: Speed = { fastmodel: false, batch: false, autorecord: false, selfrecover: false, workers: false };
export const PRESETS: Record<string, Speed> = {
  classic: OFF,
  fast: { fastmodel: true, batch: true, autorecord: true, selfrecover: true, workers: true },
  /** Everything except the workers rewrite: the safest mix. */
  quick: { ...OFF, fastmodel: true, batch: true, autorecord: true, selfrecover: true },
};

/** "fast", "classic", or a list such as "fastmodel,batch" or "quick,workers". Unknown words are ignored. */
export function parseSpeed(spec?: string | null): Speed {
  const out: Speed = { ...OFF };
  for (const w of String(spec ?? "classic").toLowerCase().split(/[\s,+]+/).filter(Boolean)) {
    if (PRESETS[w]) Object.assign(out, Object.fromEntries(Object.entries(PRESETS[w]).filter(([, v]) => v)));
    else if ((LEVERS as readonly string[]).includes(w)) out[w as Lever] = true;
  }
  return out;
}

/** The speed as a short label for a footer or a table: "classic", "fast", or the levers on. */
export function speedLabel(s: Speed): string {
  const on = LEVERS.filter((l) => s[l]);
  if (!on.length) return "classic";
  if (on.length === LEVERS.length) return "fast";
  return on.join("+");
}
