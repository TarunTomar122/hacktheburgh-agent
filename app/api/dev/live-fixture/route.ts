import { openSession } from "../../../../lib/browser";
import { CREW } from "../../../../lib/agent/plannerTypes";
import { setPageMeta } from "../../../../lib/liveview";

/**
 * Development only: three browser tabs on this app's own pages, closed one by one, so the browser tiles can be checked
 * without a crew run or any outside site (scripts/check-tiles-persist.ts). Not available in production builds.
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "Not available" }, { status: 404 });
  const base = `http://localhost:${process.env.PORT ?? 3001}`;
  void (async () => {
    const { browser, context } = await openSession();
    try {
      const tabs = [
        { path: "/", label: "Robin · Fixture home", crew: "robin" as const },
        { path: "/insights", label: "Iona · Fixture insights", crew: "iona" as const },
        { path: "/start", label: "Kit · Fixture start", crew: "kit" as const },
      ];
      const pages = [];
      for (const t of tabs) {
        const p = await context.newPage();
        await p.goto(base + t.path, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
        setPageMeta(p, { label: t.label, color: CREW[t.crew].color, state: "working", note: "Fixture" });
        pages.push(p);
      }
      await new Promise((r) => setTimeout(r, 4000));
      for (const p of pages) {
        await p.close().catch(() => {});
        await new Promise((r) => setTimeout(r, 1500));
      }
    } finally {
      await browser.close().catch(() => {});
    }
  })();
  return Response.json({ ok: true });
}
