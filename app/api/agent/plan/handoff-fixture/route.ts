import { z } from "zod";
import { openSession } from "../../../../../lib/browser";
import { gateWall, performHandoff } from "../../../../../lib/agent/handoff";
import type { Note } from "../../../../../lib/agent/legalAid";
import { dropHandoffs, handoffs } from "../../../../../lib/agent/planner";
import { CREW } from "../../../../../lib/agent/plannerTypes";
import { startRun } from "../../../../../lib/agent/runRegistry";
import { detectWall } from "../../../../../lib/agent/workers/explore";
import { setPageMeta } from "../../../../../lib/liveview";

/**
 * A local-only run that stops on a fixture sign-in, so the hand-off screen can be checked without a real site.
 * Only when HANDOFF_FIXTURE=1. The judge is the local one (HANDOFF_JUDGE=local): no model, no patient data.
 */
export async function POST(req: Request) {
  if (process.env.HANDOFF_FIXTURE !== "1") return Response.json({ error: "Not available" }, { status: 404 });
  const parsed = z.object({ url: z.string().max(300), slot: z.string().max(160) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const { url, slot } = parsed.data;
  const run = await startRun("discovery", slot, async (emit) => {
    const runId = `handoff-${Date.now().toString(36)}`;
    emit({ type: "run", runId });
    handoffs.set(runId, new Map());
    const { browser, page } = await openSession();
    const tab = "Kit · Complaint form";
    const crewState = (id: import("../../../../../lib/agent/plannerTypes").CrewId, state: "idle" | "working" | "waiting" | "done", note: string) => emit({ type: "crew", id, state, note });
    try {
      emit({ type: "spotlight", crew: "kit", tab });
      crewState("kit", "working", "Opening the page");
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 15000 });
      setPageMeta(page, { label: tab, color: CREW.kit.color, state: "working", note: "Opening the page" });
      const wall = (await detectWall(page)) ?? { kind: "login" as const, detail: "It asks to sign in first", url: page.url() };
      const note = Object.assign((s: string) => crewState("kit", "working", s), { log: async () => {} }) as Note;
      await gateWall(
        {
          page,
          note,
          track: { bump() {} },
          step: { flow: "discovery", crew: "kit" },
          handoff: (w, why) => performHandoff({ runId, emit, tab, page, wall: w, why, step: { flow: "discovery", crew: "kit" }, crewState }),
        },
        wall,
        async () => (await detectWall(page)) ?? null,
      );
    } finally {
      dropHandoffs(runId);
      await browser.close().catch(() => {});
    }
  });
  return Response.json({ runId: run.runId });
}
