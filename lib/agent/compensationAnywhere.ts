import type { Funding } from "./legalAidTypes";
import type { CaseFacts } from "./facts";
import type { Emit } from "./planner";
import { searchViaApi, webSearch } from "./planner";
import { z } from "zod";
import { EFFORT, MODELS, structured } from "./llm";
import { ASK_TOOL, FINISH_TOOL, PLAN_TOOL, runCrew, short, tool, tabName } from "./crewRun";
import { score, slug, vetFirm, vetFirmQuick, type Evidence, type Vetted } from "./legalAid";
import { recordAccess } from "./access";
import type { FirmFinding, Route, Verdict } from "./legalAidTypes";
import { draftEnquiry, fillOne, keepForApproval } from "./enquiry";
import type { EnquiryMessage, EnquiryOutcome } from "./enquiryTypes";
import { findGuidance } from "./guidance";
import { describeInvestigation, describeIssue, investigate } from "./investigate";
import type { EvidenceResult, PlannerResult } from "./plannerTypes";
import { cleanRoute, type RouteMap } from "./routeTypes";
import { exploreSite, readPage } from "./workers/explore";
import { runQuestionnaire } from "./workers/questionnaire";
import { searchDirectory } from "./workers/searchDirectory";
import type { Quote, Value } from "./workers/types";

/**
 * Compensation, anywhere (night plan, "Elliot anywhere"). On the route map discovery produced:
 *  Nell runs the place's own funding checker (asking the patient only what the checker asks) or reads the funding rules;
 *  Robin searches the place's professional register with its own filters, then follows each entry to the firm's own
 *  website, matches it (name and web address) and reads whether it acts for patients and works on no win no fee,
 *  rejecting firms with evidence; Iona finds the place's own guidance; Elliot shortlists; Kit fills each shortlisted
 *  firm's enquiry form with a message that carries Nell's quoted result (as an estimate, never as eligibility) and
 *  stops before Send. The result has the same shape as step 3's, so the case file and step 4's review work unchanged.
 */

const TOOLS = [
  PLAN_TOOL,
  tool("check_funding", "Nell: find out how a claim could be paid for here: run the place's own online funding checker found by discovery (asks the patient only what it asks), or read the funding rules if there is no checker.", {}, []),
  tool("read_scheme", "Robin: when the route map's compensation part is a scheme rather than (or before) court — a redress, no-fault, conciliation or insurance scheme — read the scheme's own pages: how a claim starts (often from the complaint itself), who decides, any cap or threshold, time limits, and whether free legal advice comes with it.", {}, []),
  tool("web_search", "Robin: search the web, e.g. for another official or specialist directory of lawyers for this work when the register is blocked, or for a firm's website.", { query: { type: "string" } }, ["query"]),
  tool("find_firms", "Robin: find law firms near the patient that do this work, by web search (no register needed): names and their own websites, ready for check_firm. Use it alongside search_register in the first turn, and whenever the register is blocked or thin.", { area: { type: "string", description: "The area of law in this place's own terms, e.g. 'clinical negligence' or 'medical negligence'" } }, []),
  tool("search_register", "Robin: search a professional register or directory with its own search filters (area of law, place), and read the entries. Defaults to the one discovery found; give url to use another directory found by web_search in this run.", { area: { type: "string", description: "The area of law in this place's own terms, e.g. 'clinical negligence'" }, url: { type: "string" } }, ["area"]),
  tool("check_firm", "Robin: open a firm's own website (from its register entry, or found by search), check it is the same firm as the register entry, and read whether it acts for patients, works on no win no fee, and has an enquiry form.", { firm_id: { type: "string" } }, ["firm_id"]),
  tool("find_guidance", "Iona: find the recommendation about the patient's condition in the place's own clinical guidance, quote it, and compare it with the timeline.", { condition: { type: "string" } }, ["condition"]),
  tool("investigate", "Iona: look on the official sites of the compensation scheme or courts for published decisions or awards in cases like this one (what was decided and why), quotes checked by code. Takes up to 3.5 minutes; where nothing is found it says so.", { condition: { type: "string" }, issue: { type: "string", description: "One generic sentence on what went wrong with the care: no names, no dates, no places" } }, ["condition", "issue"]),
  tool("shortlist", "Elliot: score the checked firms and pick up to 3 for the patient.", { firm_ids: { type: "array", items: { type: "string" } }, route: { type: "string", enum: ["legal_aid", "no_win_no_fee"] } }, ["firm_ids", "route"]),
  tool("fill_enquiry", "Kit: fill a shortlisted firm's online enquiry form with the patient's message (carrying Nell's funding result and Iona's point), stopping before Send.", { firm_id: { type: "string" } }, ["firm_id"]),
  ASK_TOOL,
  FINISH_TOOL,
];

/** What the patient has already told us about their money, as known values (the same period and unit as said), so the checker is not asked what we know. */
function fundingKnown(f?: Partial<Funding>): Value[] {
  if (!f || f.skipped) return [];
  const yn = (b: boolean) => (b ? "Yes" : "No");
  const out: Value[] = [];
  if (typeof f.onBenefits === "boolean") out.push({ key: "on_benefits", description: "Whether the patient gets Income Support, income-based JSA, income-related ESA or Universal Credit", value: yn(f.onBenefits) });
  if (typeof f.partner === "boolean") out.push({ key: "partner", description: "Whether the patient has a partner (spouse or civil partner) they live with", value: yn(f.partner) });
  if (typeof f.dependants === "number") out.push({ key: "dependants", description: "How many children or other people depend on the patient financially", value: String(f.dependants) });
  if (typeof f.netIncomeYearly === "number") out.push({ key: "net_income_yearly", description: "The patient's income after tax for a whole YEAR", value: String(f.netIncomeYearly) });
  if (typeof f.outgoingsYearly === "number") out.push({ key: "outgoings_yearly", description: "The patient's essential outgoings for a whole YEAR", value: String(f.outgoingsYearly) });
  if (typeof f.savings === "number") out.push({ key: "savings", description: "The patient's total savings and capital", value: String(f.savings) });
  return out;
}

export async function runCompensationAnywhere(facts: CaseFacts, routeIn: RouteMap, opts: { onEvent?: Emit; keepOpen?: boolean; runId?: string; /** What the patient already told us about their money (from an earlier answer): the checker is answered from it, not asked again. */ funding?: Partial<Funding> } = {}): Promise<PlannerResult> {
  const route = cleanRoute(routeIn); // a sentence saved as a name becomes a short name
  const step = (k: RouteMap["steps"][number]["kind"]) => route.steps.find((s) => s.kind === k);
  const placeName = [route.place.region, route.place.country].filter(Boolean).join(", ");
  const firms = new Map<string, FirmFinding>();
  const evidence = new Map<string, Evidence>();
  const registerSite = new Map<string, string>(); // firm id -> web address the register gave
  const proof: EvidenceResult = {};
  const enquiries = new Map<string, EnquiryOutcome>();
  let verdict: Verdict = "unknown";
  let fundingQuote: Quote | undefined;
  let fundingSource = "";
  let calculatorText = "";
  let routeKind: Route = "no_win_no_fee";
  let shortlistIds: string[] = [];
  let message: EnquiryMessage | null = null;
  let drafting: Promise<EnquiryMessage> | null = null; // the forms are filled at the same time: one message for all of them
  let areaOfLaw = "clinical negligence";
  let scheme: { body: string; text: string; quote?: Quote; url: string } | undefined;
  const found = new Set<string>(); // hosts this run found by search (provenance for search_register's url)
  const host = (u?: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : ""; } catch { return ""; } };
  const firmLine = (f: FirmFinding) => `${f.id}: ${f.name}${f.town ? `, ${f.town}` : ""}${f.website ? `, ${host(f.website)}` : ", no website listed"}${f.sources.includes("website") ? `; patients ${f.actsForPatients}, no win no fee ${f.noWinNoFee}, form ${f.enquiryUrl ? "yes" : "not found"}` : ""}${f.excluded ? `; RULED OUT: ${f.excluded}` : ""}`;

  return runCrew<PlannerResult>(
    {
      prefix: "step3",
      system: `You lead a crew helping a patient in ${placeName} find out how a compensation claim could be paid for, and contact the right lawyers. Discovery already worked out the route (below); use its pages and register. Work in this order, adapting when results call for it (say why with update_plan). Be quick: put every call that does not depend on another in the SAME turn, because the crew works at the same time.
1. FIRST TURN, all together: Nell: check_funding; Robin: read_scheme if the compensation part is a scheme, search_register AND find_firms (both: the register can be blocked or thin); Iona: find_guidance (skip if not relevant) and investigate (once: published decisions or awards in similar cases). Nell's checker, the register search and Iona's work run in the background: you get "Started" back at once and their results arrive in a later message. In your second turn, check_firm the most promising firms find_firms gave you (do not wait for the register); check register firms when they arrive. The shortlist automatically waits for Nell (not for the register: use its firms if they have arrived). Decide from them whether lawyers are needed at all (some schemes bar suing or give free legal advice through their own panel) and say so with update_plan. Use the area of law in this place's own terms for search_register. 2. Robin: check_firm for the 3-4 most promising firms (one call each, same turn: they run at the same time), replacing any ruled out. 3. shortlist up to 3 with the route that fits Nell's result (legal_aid only if the checker said likely). 4. Kit: fill_enquiry for each shortlisted firm (same turn: they run at the same time). 5. finish.
If the register is blocked (CAPTCHA, login), use the firms find_firms found, or web_search for another official or specialist directory of lawyers who do this work in this place, then search_register with its url. Never ask the patient to do browsing or searching for you: the crew does the web work, or reports honestly what it could not reach. Prefer firms based in or near the patient's own place when checking and shortlisting (a regional directory can list firms far away). Rules: never say anyone was negligent; never send anything; firms that defend health bodies or insurers are ruled out; a register entry and a website count as the same firm only if check_firm matched them. Ask the user only for what no page can tell.
ROUTE MAP:\n${JSON.stringify(route.steps.map((s) => ({ kind: s.kind, body: s.body, what: s.what, how: s.how, url: s.url, points: s.points })), null, 1).slice(0, 6000)}`,
      tools: TOOLS,
      // Iona's reading depends on nothing the others find: it runs alongside the whole chain. Each firm gets its own lane (its own tab).
      // Nell's checker (it may wait for the patient's answers) and Iona's reading run alongside everything else; the shortlist and the forms wait for them.
      // The register can be slow (a real search form, page after page): it runs in the background too, and the firms found by
      // search are checked meanwhile. Each later step waits only for what it needs.
      background: ["check_funding", "find_guidance", "investigate", "search_register"],
      afterBackground: { shortlist: ["check_funding"], fill_enquiry: ["check_funding", "find_guidance"] }, // the register is a bonus: its firms count if they arrive in time
      lane: (name, a) => (name === "check_firm" || name === "fill_enquiry" ? `${name === "check_firm" ? "robin" : "kit"}:${String(a.firm_id ?? "")}` : name === "find_guidance" || name === "investigate" ? `iona:${name}` : name === "read_scheme" ? "robin:scheme" : name === "find_firms" ? "robin:find" : `crew:${name === "check_funding" ? "nell" : name === "update_plan" || name === "shortlist" || name === "ask_user" || name === "finish" ? "elliot" : name === "read_scheme" || name === "search_register" || name === "web_search" ? "robin" : name}`),
      firstInput: `Patient: (name withheld from the planner), ${route.place.city || ""}.\nWhat happened:\n${[facts.incidentSummary, ...facts.events.map((e) => `${e.date}: ${e.what}`)].filter(Boolean).join("\n")}`,
      maxTurns: 16,
      // Everything independent starts at once (stage 1); firm checks need the register, the shortlist needs the checks.
      stage: { check_funding: 1, read_scheme: 1, web_search: 1, search_register: 1, find_firms: 1, find_guidance: 1, investigate: 1, check_firm: 3, shortlist: 4, fill_enquiry: 5 },
      who: (name) => (name === "check_funding" ? "nell" : name === "search_register" || name === "check_firm" || name === "read_scheme" || name === "web_search" || name === "find_firms" ? "robin" : name === "find_guidance" || name === "investigate" ? "iona" : name === "fill_enquiry" ? "kit" : "elliot"),
      doing: (name, a) => {
        const f = firms.get(String(a.firm_id ?? ""));
        return ({ check_funding: `Checking funding with ${step("funding")?.body ?? "the official checker"}`, read_scheme: `Reading how ${step("compensation")?.body ?? "the scheme"} works`, search_register: `Searching ${step("lawyers")?.body ?? "the register"}`, find_firms: "Finding law firms near you", check_firm: f ? `Checking ${f.name}'s website` : "Checking a firm", find_guidance: "Finding the clinical guidance", investigate: "Looking for published decisions and awards", shortlist: "Choosing the best fits", fill_enquiry: f ? `Filling ${f.name}'s enquiry form` : "Filling an enquiry form" } as Record<string, string>)[name] ?? "Working";
      },
      describe: (name, a, out) => {
        const f = firms.get(String(a.firm_id ?? ""));
        if (name === "check_funding") return fundingQuote ? `${fundingSource}: "${fundingQuote.quote}"` : out;
        if (name === "search_register") return out.split("\n")[0];
        if (name === "web_search") {
          const hits = [...out.matchAll(/^\d+\. (.*?) — (\S+)/gm)];
          return hits.length ? `${hits.length} results for "${String(a.query ?? "")}". Top: ${host(hits[0][2])}.` : "No useful results.";
        }
        if (name === "read_scheme" && scheme) return `${scheme.body}: ${scheme.text}`;
        if (name === "check_firm" && f) return f.excluded ? `Ruled out ${f.name}: ${f.excluded}.` : `Checked ${f.name} on its own website.`;
        if (name === "fill_enquiry") {
          const e = enquiries.get(String(a.firm_id ?? ""));
          return e ? (e.status === "ready_to_send" ? `${e.firmName}: enquiry filled. Waiting for your OK before anything is sent.` : `${e.firmName}: ${e.note}`) : out;
        }
        if (name === "investigate" && proof.investigation) return proof.investigation.items.length ? `Found ${proof.investigation.items.length} official ${proof.investigation.items.length === 1 ? "item" : "items"}. ${proof.investigation.items[0].publisher}: "${proof.investigation.items[0].quote}"` : "I looked on the official sites and found no published decisions to cite.";
        if (name === "find_guidance" && proof.guideline?.points.length) return `${proof.guideline.name}: "${proof.guideline.points[0].text}"`;
        return out.split("\n")[0];
      },
      exec: async (call, a, thought, kit) => {
        const s = (k: string) => (typeof a[k] === "string" ? (a[k] as string) : "");
        switch (call.name) {
          case "check_funding": {
            const f = step("funding");
            const url = f?.url ?? f?.sources[0]?.url;
            if (!url) return "Could not check funding: discovery found no funding page.";
            const known: Value[] = [
              { key: "case_type", description: "What the legal problem is: a CIVIL claim about harm from medical care (clinical negligence, also called medical negligence; not criminal, not family). Fits questions like 'what type of case', 'what is your problem about', 'choose the problem you need help with'", value: "Civil: clinical negligence (harm from medical treatment)" },
              ...(facts.complainingFor === "me" ? [{ key: "who_for", description: "Who needs the help: the patient themself, an adult", value: "Myself" }] : []),
              ...fundingKnown(opts.funding),
              { key: "country", description: "Where the patient lives", value: placeName, public: true },
              // Place, not identity: the checker may use it to find local help (questionnaire types only the postcode or its first part).
              ...(facts.postcode ? [{ key: "postcode", description: "The patient's postcode (place only)", value: facts.postcode }] : []),
            ];
            // The research no longer hunts for forms, so Nell looks for the place's own checker here: from the funding page she finds its online checker or calculator and answers it, asking the patient for what only they know (income, savings).
            const attempt = await kit.inTab(thought, "nell", tabName(f?.body ?? "Funding"), async (p, note) => {
              let target: string | null = f?.how === "online_form" ? url : null;
              if (!target) {
                const found = await exploreSite({ page: p, note, track: kit.track }, url, "the official online eligibility checker or calculator for legal aid or other funded legal help", { want: "form", maxHops: 4 });
                target = found.ok ? found.url : null;
              }
              if (!target) return null;
              return { target, q: await runQuestionnaire({ page: p, note, track: kit.track, ask: (spec) => kit.ask({ ...spec, crew: "nell" }) }, { url: target, goal: "Find out whether the patient could get legal aid or other funded help for a clinical negligence claim", known }) };
            }, 8 * 60 * 1000);
            if (attempt.ok && attempt.value) {
              const r = { ok: true as const, value: attempt.value.q };
              const checkerUrl = attempt.value.target;
              recordAccess({ via: "browser", kind: "task", reason: `answered the place's own eligibility checker (${r.value.answers.length} question${r.value.answers.length === 1 ? "" : "s"}; each answer changes the next question)`, url: checkerUrl });
              if (r.value.wall) return `Blocked: ${r.value.wall.kind} (${r.value.wall.detail})`;
              fundingQuote = r.value.resultQuote;
              fundingSource = f?.body ?? "The legal aid checker";
              calculatorText = r.value.result;
              verdict = /\b(not (likely|eligible)|unlikely|ineligible|disqualif\w*|do(es)? not qualify|not qualify|cannot get|can't get|won't get)\b/i.test(r.value.result) ? "unlikely" : /\b(likely to (qualify|get)|you (may|could|can) (qualify|get)|eligible|qualify)\b/i.test(r.value.result) ? "likely" : "unknown";
              if (!r.value.result.trim() && !r.value.answers.length) verdict = "skipped"; // the checker got no answers (skipped), so there is no estimate to read
              kit.finding(`${fundingSource}: ${r.value.result}`, checkerUrl, "nell");
              kit.emit({ type: "verdict", verdict });
              return `Checker result (${verdict}): ${r.value.result}${r.value.caveats.length ? `\nCaveats: ${r.value.caveats.map((c) => c.quote).join(" | ")}` : ""}\nThe checker asked ${r.value.answers.length} question(s); the patient's answers stay on their device.`;
            }
            const r = await kit.inTab(thought, "nell", tabName(f?.body ?? "Funding"), (p, note) => readPage({ page: p, note, track: kit.track }, url, "Can an adult get legal aid for a clinical negligence (medical negligence) claim here? Is no win no fee allowed, with any cap? Is there free legal advice in any scheme?"), 90_000);
            if (!r.ok) return `Could not read the funding rules: ${r.error}`;
            fundingQuote = r.value.quotes.find((q) => q.checked);
            fundingSource = f?.body ?? r.value.title;
            calculatorText = r.value.answer;
            // A page that does not say is not a "no": only a clear statement that legal aid is not available counts.
            verdict = /does not (say|mention|state|specify)|doesn't say|not clear|unclear/i.test(r.value.answer) ? "unknown" : /\b(legal aid|it) is not (available|in scope|covered)|no longer (available|covered|funded)|not (eligible|available) for (clinical|medical)/i.test(r.value.answer) ? "unlikely" : "unknown";
            kit.finding(`${fundingSource}: ${r.value.answer}`, r.value.url, "nell");
            kit.emit({ type: "verdict", verdict });
            return `${r.value.answer}\nQuotes: ${r.value.quotes.filter((q) => q.checked).map((q) => `"${q.quote}"`).join(" | ")}`;
          }
          case "read_scheme": {
            const c = step("compensation");
            // Try the scheme's page, then each of its sources, until one really describes the scheme (not a general complaints page).
            const urls = [...new Set([c?.url, ...(c?.sources.map((x) => x.url) ?? [])].filter((u): u is string => !!u))].slice(0, 4);
            if (!urls.length) return "Could not read the scheme: discovery found no compensation page.";
            const question = "How does a patient get compensation through this scheme: how does a claim start, who decides, is there a cap or threshold, what are the time limits, does the patient get free legal advice, and does using it stop them going to court?";
            const r = await kit.inTab(thought, "robin", tabName(c?.body ?? "Scheme"), async (p, note) => {
              let best: Awaited<ReturnType<typeof readPage>> | null = null;
              for (const u of urls) {
                const v = await readPage({ page: p, note, track: kit.track }, u, question);
                const checked = v.quotes.filter((x) => x.checked).length;
                if (!best || checked > best.quotes.filter((x) => x.checked).length) best = v;
                if (checked >= 2 && !/does not (describe|say|mention)/i.test(v.answer)) return v;
              }
              return best!;
            }, 180_000);
            if (!r.ok) return `Could not read the scheme: ${r.error}`;
            const q = r.value.quotes.find((x) => x.checked);
            scheme = { body: c?.body ?? r.value.title, text: r.value.answer, quote: q, url: r.value.url };
            kit.finding(`${scheme.body}: ${r.value.answer}`, r.value.url, "robin");
            return `${r.value.answer}\nQuotes: ${r.value.quotes.filter((x) => x.checked).map((x) => `"${x.quote}"`).join(" | ")}`;
          }
          case "web_search": {
            const r = await kit.inTab(thought, "robin", "Search", (p, note) => webSearch(p, s("query"), note, kit.track), 150_000);
            if (!r.ok) return `Could not search: ${r.error}`;
            r.value.forEach((x) => found.add(host(x.url)));
            return r.value.map((x, i) => `${i + 1}. ${x.title} — ${x.url}\n   ${x.snippet}`).join("\n") || "No results.";
          }
          case "find_firms": {
            // Firms by search, no browser: two aimed searches through the search API, then a model picks out the law firms
            // (not directories, not news) and their own websites from the results. Their sites are still checked by check_firm.
            const area = s("area") || areaOfLaw;
            const near = route.place.city || route.place.region || route.place.country;
            const queries = [`${area} solicitors ${near}`, `${area} claims lawyers ${[route.place.region, route.place.country].filter(Boolean).join(" ")} no win no fee`];
            const hits = (await Promise.all(queries.map((q) => searchViaApi(q, kit.track)))).flat();
            const seen = new Set<string>();
            const list = hits.filter((h) => (seen.has(host(h.url)) ? false : (seen.add(host(h.url)), true))).slice(0, 18);
            if (!list.length) return "No search results (the search limit may be reached). Use search_register or web_search.";
            const Found = z.object({ firms: z.array(z.object({ name: z.string(), result: z.number().describe("The number of the search result that is this firm's OWN website"), town: z.string().describe("Where the firm or office is, if the result says; empty if not") })) });
            const r = await structured({
              model: MODELS.browser,
              effort: EFFORT.browser,
              instructions: `From web search results, list the law firms that act for people in ${area} claims in or near ${near}. Only a firm's OWN website counts (not a directory, review site, news article, government page or charity). At most 8, nearest first. Never invent a firm or a result number.`,
              input: list.map((h, i) => `${i}. ${h.title} | ${h.url}\n   ${h.snippet.slice(0, 220)}`).join("\n"),
              schema: Found,
              name: "find_firms",
              data: [],
            });
            let added = 0;
            for (const f of r.firms) {
              const hit = list[f.result];
              if (!hit || !f.name.trim()) continue;
              const id = slug(f.name);
              if (firms.has(id)) continue;
              const web = `https://${new URL(hit.url).hostname}`;
              firms.set(id, { id, name: f.name.trim(), town: f.town, distanceMiles: null, website: web, email: null, phone: null, sources: ["search"], legalAid: false, activeRecently: false, actsForPatients: "unknown", noWinNoFee: "unknown", enquiryUrl: null, score: 0, reasons: [], excluded: null });
              evidence.set(id, { lawsoc: `Found by web search: "${hit.title}" (${host(hit.url)})` });
              added++;
            }
            recordAccess({ via: "api", kind: "search", reason: `found ${added} law firms by search, no browser`, url: queries[0] });
            kit.finding(`Found ${added} firms that do ${area} near ${near} by search`, undefined, "robin");
            return `${added} firms found by search.\n${[...firms.values()].slice(0, 16).map(firmLine).join("\n")}`;
          }
          case "search_register": {
            const l = step("lawyers");
            if (s("url") && !found.has(host(s("url"))) && host(s("url")) !== host(l?.url)) return `Blocked: ${s("url")} was not found in this run. Use web_search first.`;
            const rawUrl = s("url") || (l?.url ?? l?.sources[0]?.url);
            if (!rawUrl) return "Could not search: discovery found no register or directory.";
            const url = /^[a-z][a-z0-9+.-]*:/i.test(rawUrl) ? rawUrl : `https://${rawUrl.replace(/^\/+/, "")}`; // old routes may hold an address without https://
            const where = route.place.city || facts.postcode || route.place.region;
            if (s("area")) areaOfLaw = s("area");
            const r = await kit.inTab(thought, "robin", tabName(l?.body ?? "Register"), (p, note) => searchDirectory({ page: p, note, track: kit.track }, { url, goal: `Find lawyers or firms who do ${s("area") || "clinical negligence"} near ${where}`, criteria: [{ label: "area of law", value: s("area") || "clinical negligence / medical negligence" }, { label: "location", value: where }], maxResults: 12 }), 150_000); // a slow register must not hold the case up: it runs in the background, and stops at 2.5 minutes
            if (!r.ok) return `Could not search the register: ${r.error}`;
            const d = r.value;
            recordAccess({ via: "browser", kind: "task", reason: `searched the lawyer register with its own search filters (${d.searchedWith.map((c) => c.label).join(", ") || "its search box"})`, url });
            if (d.outcome === "wall") return `Blocked: ${d.wall?.kind ?? "wall"} on ${host(url)} (${d.wall?.detail ?? d.summary}). Try another official directory from the route map, or web search for firms.`;
            for (const x of d.results) {
              const id = slug(x.name);
              if (firms.has(id)) continue;
              const site = x.fields.website ?? x.fields.Website ?? (x.url && host(x.url) !== host(url) ? x.url : undefined);
              const web = site ? (/^https?:/.test(site) ? site : `https://${site}`) : null;
              if (web) registerSite.set(id, host(web));
              firms.set(id, { id, name: x.name, town: x.fields.town ?? x.fields.address ?? "", distanceMiles: null, website: web, email: x.fields.email ?? null, phone: x.fields.phone ?? null, sources: ["lawsoc"], legalAid: false, activeRecently: false, actsForPatients: "unknown", noWinNoFee: "unknown", enquiryUrl: null, score: 0, reasons: [], excluded: null });
              evidence.set(id, { lawsoc: `Listed on ${l?.body ?? host(url)} (searched by ${d.searchedWith.map((c) => `${c.label}: ${c.value}`).join(", ")})` });
            }
            kit.finding(`${l?.body ?? "The register"}: ${d.results.length} firms for ${s("area") || "clinical negligence"} near ${where}`, url, "robin");
            return `${d.results.length} entries (${d.outcome}). ${d.summary}\n${[...firms.values()].slice(0, 14).map(firmLine).join("\n")}`;
          }
          case "check_firm": {
            const firm = firms.get(s("firm_id"));
            if (!firm) return "Could not check: unknown firm id. Use one from search_register.";
            const r = await kit.inTab(thought, "robin", tabName(firm.name.replace(/\s+(LLP|Ltd|Limited|Solicitors)\b.*$/i, "")), async (p, note) => {
              let f = firm;
              let how = "the register gave its web address";
              if (!f.website) {
                // No web address on the register: find it by search, and accept it only if the name matches the page.
                const hits = await webSearch(p, `${f.name} ${f.town || route.place.city} solicitors`, note, kit.track);
                const token = f.name.split(/\s+/)[0].toLowerCase();
                const hit = hits.find((h) => h.title.toLowerCase().includes(token) || host(h.url).includes(token));
                if (!hit) throw new Error("No website found for this firm");
                f = { ...f, website: hit.url };
                how = `found by search ("${short(hit.title, 50)}")`;
              }
              // Fetch first: a plain read of their site confirms most firms in seconds. Only the browser may rule a firm out.
              const t0 = Date.now();
              const q = await vetFirmQuick(f, note, kit.track);
              let v: Vetted;
              let landed: string;
              if (q.ok) {
                v = q.v;
                landed = host(q.landed);
                recordAccess({ via: "fetch", kind: "firm", reason: `checked ${q.pages.length} page${q.pages.length === 1 ? "" : "s"} of their site without a browser`, url: f.website ?? undefined, ms: Date.now() - t0 });
              } else {
                await note.log("recover", `Opening their site in the browser: ${q.why}`, {});
                v = await vetFirm(p, f, note, kit.track);
                landed = host(p.url());
                recordAccess({ via: "browser", kind: "firm", reason: q.why, url: f.website ?? undefined, ms: Date.now() - t0 });
              }
              const reg = registerSite.get(f.id);
              const same = !reg || landed === reg || landed.endsWith(`.${reg}`) || reg.endsWith(`.${landed}`);
              await note.log(same ? "check" : "recover", same ? `Same firm as the register entry (${how}; site ${landed})` : `The register says ${reg} but the site is ${landed}: not counted as the same firm`, {});
              return { f, v, same, landed, how };
            }, 120_000);
            if (!r.ok) {
              evidence.set(firm.id, { ...evidence.get(firm.id), checked: `Tried: ${r.error}` });
              return `Could not check ${firm.name}: ${r.error}`;
            }
            const { f, v, same, landed, how } = r.value;
            const { evidence: ev, ...found } = v;
            const updated: FirmFinding = { ...f, ...found, excluded: !same ? `its website (${landed}) does not match the register's (${registerSite.get(f.id)})` : (found.excluded ?? f.excluded), sources: [...new Set([...f.sources, "website" as const])] };
            firms.set(f.id, updated);
            evidence.set(f.id, { ...evidence.get(f.id), ...ev, checked: `${ev.checked ?? ""} Website ${how}.`.trim() });
            kit.emit({ type: "firm", firm: updated });
            return firmLine(updated);
          }
          case "find_guidance":
            return (await findGuidance(kit, thought, route, facts, s("condition") || "the patient's condition", proof)).text;
          case "investigate": {
            if (proof.investigation) return "Already investigated.";
            const brief = s("issue") ? { condition: s("condition") || "the patient's condition", issue: s("issue") } : await describeIssue(facts);
            return describeInvestigation(await investigate(kit, thought, route, brief, proof, { focus: "compensation" }));
          }
          case "shortlist": {
            // Legal aid only when Nell's checker actually said likely; the model's choice cannot override that.
            // Nell's checker decides (it has finished by now: the shortlist waits for it). The model's guess cannot override it.
            routeKind = verdict === "likely" ? "legal_aid" : "no_win_no_fee";
            for (const [id, f] of firms) firms.set(id, score(f, routeKind, evidence.get(id)));
            shortlistIds = ((a.firm_ids as string[]) ?? []).filter((id) => firms.has(id) && !firms.get(id)!.excluded && firms.get(id)!.sources.includes("website")).sort((x, y) => firms.get(y)!.score - firms.get(x)!.score).slice(0, 3);
            kit.finding(`Shortlisted ${shortlistIds.length}: ${shortlistIds.map((id) => firms.get(id)!.name).join(", ")}`, undefined, "elliot");
            return shortlistIds.map((id) => `${firms.get(id)!.name}: fit ${firms.get(id)!.fit}%`).join("\n") || "Nothing shortlisted (only firms checked on their own website can be).";
          }
          case "fill_enquiry": {
            const firm = firms.get(s("firm_id"));
            if (!firm || !shortlistIds.includes(firm.id)) return "Blocked: only shortlisted firms get an enquiry.";
            if (enquiries.get(firm.id)?.status === "ready_to_send") return `${firm.name}: already filled.`;
            const g = proof.guideline?.points[0];
            drafting ??= (async () => {
              // Nell -> Kit: the funding checker's own words travel into the message, as an estimate, never as eligibility.
              const funding = fundingQuote?.checked ? `On funding: ${fundingSource}'s online checker says "${(fundingQuote.quote.replace(/\s+/g, " ").trim().match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? fundingQuote.quote)}". I understand this is only an estimate.` : "I would also like to know how a case like this could be funded.";
              return (message = await draftEnquiry(facts, undefined, g && proof.gaps?.[0] ? { guideline: proof.guideline!.name, point: g.text, question: proof.gaps[0].question } : undefined, { place: placeName, funding }));
            })().catch((e) => {
              drafting = null; // a failed draft is tried again by the next firm
              throw e;
            });
            const msg = await drafting;
            const r = await kit.inTab(thought, "kit", tabName(firm.name.replace(/\s+(LLP|Ltd|Limited|Solicitors)\b.*$/i, "")), async (p, note) => {
              const o = await fillOne(p, firm, { facts, message: msg, area: areaOfLaw }, note, kit.track, (x) => kit.emit({ type: "enquiry", enquiry: x }));
              if (o.status === "ready_to_send" || o.status === "needs_input") {
                keepForApproval(firm.id, { page: p, firm, email: facts.email, runId: kit.runId, tracer: kit.tracer, note });
                kit.keep(p);
              }
              return o;
            }, 150_000);
            const o: EnquiryOutcome = r.ok ? r.value : { firmId: firm.id, firmName: firm.name, status: "failed", formUrl: null, filled: [], unfilled: [], consents: [], note: `Stopped: ${r.error}` };
            recordAccess({ via: "browser", kind: "task", reason: `filled ${firm.name}'s enquiry form (${o.filled.length} field${o.filled.length === 1 ? "" : "s"}) and stopped before Send`, url: o.formUrl ?? firm.website ?? undefined });
            enquiries.set(firm.id, o);
            kit.emit({ type: "enquiry", enquiry: o });
            if (o.status === "ready_to_send" && o.formUrl) firms.set(firm.id, { ...firms.get(firm.id)!, enquiryUrl: o.formUrl });
            kit.finding(`${firm.name}: ${o.status === "ready_to_send" ? "enquiry form filled, waiting for your OK" : o.note}`, o.formUrl ?? undefined, "kit");
            if (o.status === "no_form" || o.status === "could_not_fill") {
              // No usable online form: the next best firm checked on its own site takes its place on the shortlist (D46).
              const next = [...firms.values()].filter((x) => !x.excluded && x.sources.includes("website") && !shortlistIds.includes(x.id) && !enquiries.has(x.id)).sort((x, y) => score(y, routeKind, evidence.get(y.id)).score - score(x, routeKind, evidence.get(x.id)).score)[0];
              if (next) {
                shortlistIds = [...shortlistIds.filter((id) => id !== firm.id), next.id];
                kit.finding(`${firm.name}'s form could not be used, so ${next.name} takes its place`, undefined, "kit");
                return `${firm.name}: ${o.status === "no_form" ? "no online form" : "the form could not be filled"}. ${next.name} (${next.id}) is now on the shortlist instead: call fill_enquiry for ${next.id}.`;
              }
            }
            return `${firm.name}: ${o.status}. ${o.note}`;
          }
          default:
            return `Unknown tool ${call.name}`;
        }
      },
      finish: (kit, x) => {
        for (const [id, f] of firms) firms.set(id, score(f, routeKind, evidence.get(id)));
        const all = [...firms.values()].sort((p, q) => q.score - p.score);
        const result: PlannerResult = {
          verdict,
          route: routeKind,
          calculatorText,
          firms: all,
          shortlist: shortlistIds,
          stats: kit.track.stats,
          runDir: kit.runDir,
          runId: kit.runId,
          trace: kit.tracer.steps,
          plan: x.plan,
          thoughts: x.thoughts,
          turns: x.turns,
          says: x.says,
          evidence: proof,
          scheme: scheme ? { body: scheme.body, text: scheme.text, quote: scheme.quote?.quote, url: scheme.url } : undefined,
          enquiries: [...enquiries.values()],
          message: message ?? undefined,
          asks: x.asks,
          recoveries: kit.tracer.steps.filter((t) => t.kind === "recover").length,
        };
        kit.emit({ type: "result", result });
        kit.emit({ type: "planner_result", result });
        return result;
      },
    },
    opts,
  );
}
