// Iona's pre-action investigation on its own (night plan, side backlog 2), headless, on a fictional persona and a saved route map:
//   npx tsx --env-file=.env.local scripts/test-investigate.ts <persona> <route.json> [complaint|compensation] [--no-draft] [--lanes=decision,policy,inspection,public_record]
//   INVESTIGATE_DEBUG=1 prints how the judge rated every passage.
//   e.g. scripts/test-investigate.ts scotland docs/night-runs/scotland-discovery-2/route.json
// 1. offline checks (number backing, the draft's support paragraph); 2. the live investigation in real headless tabs;
// 3. an independent re-check: every item's URL was opened in the run and its quote is found again in a fresh load of the page;
// 4. the complaint drafted with the findings (local model for the story). Nothing is submitted or sent. Test scripts may
// name personas and files; the investigation itself names no place or site.
process.env.IN_APP_BROWSER = "1";
process.env.LIVEVIEW = "0";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { openSession } from "../lib/browser";
import { agent, Tracer, Tracker } from "../lib/agent/legalAid";
import { enterLedger, withLedger } from "../lib/agent/ledger";
import { CREW, type PlannerEvent, type Thought } from "../lib/agent/plannerTypes";
import { limiter } from "../lib/agent/planner";
import type { CrewKit } from "../lib/agent/crewRun";
import { draftComplaintTo, ensureSupport, type Draft } from "../lib/agent/draft";
import { describeInvestigation, describeIssue, investigate, numbersBacked, supportFor } from "../lib/agent/investigate";
import type { EvidenceResult } from "../lib/agent/plannerTypes";
import { normText, normalisedPageText, quoteInText } from "../lib/agent/workers/explore";
import { missingRequired } from "../lib/agent/facts";

let failures = 0;
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"} ${what}`);
  if (!ok) failures++;
};

function offline() {
  check(numbersBacked("The body upheld it after 12 weeks", "The ombudsman upheld the complaint after 12 weeks of delay."), "numbers: 12 weeks is in the quote");
  check(!numbersBacked("The body upheld it after 2 weeks", "The ombudsman upheld the complaint after 12 weeks of delay."), "numbers: 2 is not a whole token of 12");
  check(!numbersBacked("Decided within six months", "Decided within the usual time."), "numbers: a number word the quote lacks is rejected");
  check(numbersBacked("Plain words only", "Anything"), "numbers: no numbers, nothing to back");
  const d: Draft = { details: "I fell and my wrist was X-rayed.", location: "A&E", outcome: "" };
  const sup = [{ source: "example.org", title: "Decision 1", quote: "The board did not arrange a repeat X-ray when the pain continued.", url: "https://example.org/d1" }];
  const e = ensureSupport(d, sup, "the Board");
  check(e.details.includes(sup[0].quote) && e.details.includes("example.org"), "draft: a missing quote is added word for word with its source");
  check(ensureSupport(e, sup, "the Board").details === e.details, "draft: a quote already in the letter is not added twice");
  check(ensureSupport(d, sup, "la Junta", "Spanish") === d, "draft: not English, left to the model (no English template)");
}

async function main() {
  const [who, routePath, flowArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!who || !routePath) throw new Error("usage: test-investigate.ts <persona> <route.json> [complaint|compensation] [--no-draft]");
  const focus = flowArg === "compensation" ? "compensation" : "complaint";
  const facts = JSON.parse(readFileSync(`scripts/personas/${who}.json`, "utf8"));
  const route = JSON.parse(readFileSync(routePath, "utf8"));
  if (process.env.SHOW_BROWSER_WINDOW === "1") throw new Error("headless only: unset SHOW_BROWSER_WINDOW");
  offline();

  const runId = `investigate-${who}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  const runDir = path.join(process.cwd(), ".runs", runId);
  mkdirSync(runDir, { recursive: true });
  const t0 = Date.now();
  const stamp = () => `[${((Date.now() - t0) / 1000).toFixed(0)}s]`;
  const emit = (e: PlannerEvent) => {
    if (e.type === "finding") console.log(`${stamp()} FINDING (${e.crew}) ${e.text}${e.source ? `\n          ${e.source}` : ""}`);
    if (e.type === "trace") console.log(`${stamp()}   · ${e.step.agent}: ${e.step.kind} ${e.step.text.slice(0, 150)}`);
    if (e.type === "model") console.log(`${stamp()} model ${e.entry.agent} ${e.entry.where} ${e.entry.model} ${e.entry.task} data=[${e.entry.data.join(",")}]`);
  };
  enterLedger({ runId, runDir, agent: "iona", t0, emit: emit as never });
  const track = new Tracker(emit);
  const tracer = new Tracer(emit, runDir);
  const { browser, context, page } = await openSession();
  const actx = { context, emit, track, tracer, first: page };
  const tabs = limiter(4);
  const kit = {
    runId, runDir, emit, track, tracer, browser, context,
    say: () => {}, crewState: () => {}, ask: async () => null, keep: () => {},
    finding: (text: string, source?: string, crew?: string) => emit({ type: "finding", text, source, crew: crew as never }),
    inTab: (th: Thought, id: keyof typeof CREW, task: string, work: Parameters<CrewKit["inTab"]>[3], timeoutMs: number) => {
      th.tab = `${CREW[id].name} · ${task}`;
      console.log(`${stamp()} TAB ${th.tab}`);
      return tabs(() => agent(actx, th.tab!, (p, note) => withLedger({ agent: id }, () => work(p, note)), timeoutMs, undefined, { color: CREW[id].color, cursor: th.tab }));
    },
  } as unknown as CrewKit;

  let result: unknown = null;
  try {
    const brief = await describeIssue(facts);
    console.log(`${stamp()} BRIEF (de-identified, made on this Mac): ${JSON.stringify(brief)}`);
    const proof: EvidenceResult = {};
    const thought: Thought = { i: 0, t: 0, text: "investigate", tool: "investigate" };
    const inv = await investigate(kit, thought, route, brief, proof, { focus, lanes: process.argv.find((a) => a.startsWith("--lanes="))?.slice(8).split(",") as never });
    console.log(`\n${describeInvestigation(inv)}\n`);
    console.log(`searched: ${inv.searched.map((q) => JSON.stringify(q)).join(" | ")}\nopened: ${inv.opened.join(" | ")}`);

    // Provenance: every item's page was opened in this run, and its quote is found again in a fresh load of the page.
    const openedKeys = new Set(inv.opened.map((u) => u.replace(/#.*$/, "").replace(/\/$/, "")));
    for (const x of inv.items) {
      check(openedKeys.has(x.url.replace(/#.*$/, "").replace(/\/$/, "")), `opened in this run: ${x.url}`);
      check(!x.why || numbersBacked(x.why, x.quote), `numbers in "why" are in the quote: ${x.why.slice(0, 60)}`);
      if (/\.pdf($|[?#])/i.test(x.url)) {
        console.log(`NOTE  ${x.url} is a PDF: its quote was checked by the reader against the extracted text, not re-loaded here`);
        continue;
      }
      const p = await context.newPage();
      try {
        await p.goto(x.url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await p.waitForTimeout(2500);
        check(quoteInText(x.quote, await normalisedPageText(p)), `quote found again on a fresh load: ${x.url}`);
      } catch (e) {
        console.log(`NOTE  could not re-load ${x.url}: ${String(e).split("\n")[0]}`);
      } finally {
        await p.close().catch(() => {});
      }
    }
    check(inv.items.length + inv.nothing.length >= 1, "every lane either has items or an honest 'nothing found' note");
    check(inv.tookMs < 4 * 60_000 + 15_000, `time-boxed: ${(inv.tookMs / 1000).toFixed(0)}s`);

    let draft: Draft | undefined;
    const sup = supportFor(inv);
    if (!process.argv.includes("--no-draft") && sup.length && missingRequired(facts).length === 0) {
      const b = route.steps.find((s: { kind: string }) => s.kind === "complaint")?.body ?? "the provider";
      draft = await draftComplaintTo(facts, { body: b, place: [route.place.region, route.place.country].filter(Boolean).join(", ") }, undefined, sup);
      check(sup.every((x) => draft!.details.includes(x.quote.slice(0, 40))), "the drafted complaint carries each supporting quote word for word");
      console.log(`\n--- DRAFT (supporting evidence is the last paragraph) ---\n${draft.details}\n`);
    }
    result = { runId, focus, brief, investigation: inv, support: sup, draft };
  } finally {
    await browser.close().catch(() => {});
  }
  const out = process.env.OUT_DIR;
  if (out) {
    mkdirSync(out, { recursive: true });
    writeFileSync(path.join(out, "result.json"), JSON.stringify(result, null, 2));
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : "\nall checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
