import type { CaseFacts } from "./facts";
import type { Emit } from "./planner";
import { webSearch } from "./planner";
import { ASK_TOOL, FINISH_TOOL, PLAN_TOOL, runCrew, short, tool } from "./crewRun";
import { score, slug, vetFirm, type Evidence } from "./legalAid";
import type { FirmFinding, Route, Verdict } from "./legalAidTypes";
import { draftEnquiry, fillOne, keepForApproval } from "./enquiry";
import type { EnquiryMessage, EnquiryOutcome } from "./enquiryTypes";
import { findGuidance } from "./guidance";
import { describeInvestigation, describeIssue, investigate } from "./investigate";
import type { EvidenceResult, PlannerResult } from "./plannerTypes";
import type { RouteMap } from "./routeTypes";
import { readPage } from "./workers/explore";
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
  tool("search_register", "Robin: search a professional register or directory with its own search filters (area of law, place), and read the entries. Defaults to the one discovery found; give url to use another directory found by web_search in this run.", { area: { type: "string", description: "The area of law in this place's own terms, e.g. 'clinical negligence'" }, url: { type: "string" } }, ["area"]),
  tool("check_firm", "Robin: open a firm's own website (from its register entry, or found by search), check it is the same firm as the register entry, and read whether it acts for patients, works on no win no fee, and has an enquiry form.", { firm_id: { type: "string" } }, ["firm_id"]),
  tool("find_guidance", "Iona: find the recommendation about the patient's condition in the place's own clinical guidance, quote it, and compare it with the timeline.", { condition: { type: "string" } }, ["condition"]),
  tool("investigate", "Iona: look on the official sites of the compensation scheme or courts for published decisions or awards in cases like this one (what was decided and why), quotes checked by code. Takes up to 3.5 minutes; where nothing is found it says so.", { condition: { type: "string" }, issue: { type: "string", description: "One generic sentence on what went wrong with the care: no names, no dates, no places" } }, ["condition", "issue"]),
  tool("shortlist", "Elliot: score the checked firms and pick up to 3 for the patient.", { firm_ids: { type: "array", items: { type: "string" } }, route: { type: "string", enum: ["legal_aid", "no_win_no_fee"] } }, ["firm_ids", "route"]),
  tool("fill_enquiry", "Kit: fill a shortlisted firm's online enquiry form with the patient's message (carrying Nell's funding result and Iona's point), stopping before Send.", { firm_id: { type: "string" } }, ["firm_id"]),
  ASK_TOOL,
  FINISH_TOOL,
];

export async function runCompensationAnywhere(facts: CaseFacts, route: RouteMap, opts: { onEvent?: Emit; keepOpen?: boolean; runId?: string } = {}): Promise<PlannerResult> {
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
  let areaOfLaw = "clinical negligence";
  let scheme: { body: string; text: string; quote?: Quote; url: string } | undefined;
  const found = new Set<string>(); // hosts this run found by search (provenance for search_register's url)
  const host = (u?: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : ""; } catch { return ""; } };
  const firmLine = (f: FirmFinding) => `${f.id}: ${f.name}${f.town ? `, ${f.town}` : ""}${f.website ? `, ${host(f.website)}` : ", no website listed"}${f.sources.includes("website") ? `; patients ${f.actsForPatients}, no win no fee ${f.noWinNoFee}, form ${f.enquiryUrl ? "yes" : "not found"}` : ""}${f.excluded ? `; RULED OUT: ${f.excluded}` : ""}`;

  return runCrew<PlannerResult>(
    {
      prefix: "step3",
      system: `You lead a crew helping a patient in ${placeName} find out how a compensation claim could be paid for, and contact the right lawyers. Discovery already worked out the route (below); use its pages and register. Work in this order, adapting when results call for it (say why with update_plan):
1. Nell: check_funding, and Robin: read_scheme if the compensation part is a scheme (same turn). Decide from them whether lawyers are needed at all (some schemes bar suing or give free legal advice through their own panel) and say so with update_plan. 2. Robin: search_register with the area of law in this place's own terms. 3. Robin: check_firm for the 3-4 most promising firms (one call each, same turn), replacing any ruled out. 4. Iona: find_guidance (skip if not relevant), and investigate (once, same turn: published decisions or awards in similar cases). 5. shortlist up to 3 with the route that fits Nell's result (legal_aid only if the checker said likely). 6. Kit: fill_enquiry for each shortlisted firm (same turn). 7. finish.
If the register is blocked (CAPTCHA, login), web_search for another official or specialist directory of lawyers who do this work in this place, then search_register with its url. Never ask the patient to do browsing or searching for you: the crew does the web work, or reports honestly what it could not reach. Prefer firms based in or near the patient's own place when checking and shortlisting (a regional directory can list firms far away). Rules: never say anyone was negligent; never send anything; firms that defend health bodies or insurers are ruled out; a register entry and a website count as the same firm only if check_firm matched them. Ask the user only for what no page can tell.
ROUTE MAP:\n${JSON.stringify(route.steps.map((s) => ({ kind: s.kind, body: s.body, what: s.what, how: s.how, url: s.url, points: s.points })), null, 1).slice(0, 6000)}`,
      tools: TOOLS,
      firstInput: `Patient: (name withheld from the planner), ${route.place.city || ""}.\nWhat happened:\n${[facts.incidentSummary, ...facts.events.map((e) => `${e.date}: ${e.what}`)].filter(Boolean).join("\n")}`,
      maxTurns: 16,
      // Funding and the scheme first: they decide whether lawyers are needed at all (Cursor round 3).
      stage: { check_funding: 1, read_scheme: 1, web_search: 2, search_register: 2, find_guidance: 2, investigate: 2, check_firm: 3, shortlist: 4, fill_enquiry: 5 },
      who: (name) => (name === "check_funding" ? "nell" : name === "search_register" || name === "check_firm" || name === "read_scheme" || name === "web_search" ? "robin" : name === "find_guidance" || name === "investigate" ? "iona" : name === "fill_enquiry" ? "kit" : "elliot"),
      doing: (name, a) => {
        const f = firms.get(String(a.firm_id ?? ""));
        return ({ check_funding: `Checking funding with ${step("funding")?.body ?? "the official checker"}`, read_scheme: `Reading how ${step("compensation")?.body ?? "the scheme"} works`, search_register: `Searching ${step("lawyers")?.body ?? "the register"}`, check_firm: f ? `Checking ${f.name}'s website` : "Checking a firm", find_guidance: "Finding the clinical guidance", investigate: "Looking for published decisions and awards", shortlist: "Choosing the best fits", fill_enquiry: f ? `Filling ${f.name}'s enquiry form` : "Filling an enquiry form" } as Record<string, string>)[name] ?? "Working";
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
              { key: "case_type", description: "What the problem is about (area of law)", value: "Clinical negligence: harm from hospital care" },
              { key: "country", description: "Where the patient lives", value: placeName, public: true },
              // Place, not identity: the checker may use it to find local help (questionnaire types only the postcode or its first part).
              ...(facts.postcode ? [{ key: "postcode", description: "The patient's postcode (place only)", value: facts.postcode }] : []),
            ];
            if (f?.how === "online_form") {
              const r = await kit.inTab(thought, "nell", short(f.body, 26), (p, note) => runQuestionnaire({ page: p, note, track: kit.track, ask: (spec) => kit.ask({ ...spec, crew: "nell" }) }, { url, goal: "Find out whether the patient could get legal aid or other funded help for a clinical negligence claim", known }), 8 * 60 * 1000);
              if (!r.ok) return `Could not run the checker: ${r.error}`;
              if (r.value.wall) return `Blocked: ${r.value.wall.kind} (${r.value.wall.detail})`;
              fundingQuote = r.value.resultQuote;
              fundingSource = f.body;
              calculatorText = r.value.result;
              verdict = /\b(not (likely|eligible)|unlikely|ineligible|disqualif\w*|do(es)? not qualify|not qualify|cannot get|can't get|won't get)\b/i.test(r.value.result) ? "unlikely" : /\b(likely to (qualify|get)|you (may|could|can) (qualify|get)|eligible|qualify)\b/i.test(r.value.result) ? "likely" : "unknown";
              kit.finding(`${f.body}: ${r.value.result}`, url, "nell");
              return `Checker result (${verdict}): ${r.value.result}${r.value.caveats.length ? `\nCaveats: ${r.value.caveats.map((c) => c.quote).join(" | ")}` : ""}\nThe checker asked ${r.value.answers.length} question(s); the patient's answers stay on their device.`;
            }
            const r = await kit.inTab(thought, "nell", short(f?.body ?? "Funding", 26), (p, note) => readPage({ page: p, note, track: kit.track }, url, "Can an adult get legal aid for a clinical negligence (medical negligence) claim here? Is no win no fee allowed, with any cap? Is there free legal advice in any scheme?"), 90_000);
            if (!r.ok) return `Could not read the funding rules: ${r.error}`;
            fundingQuote = r.value.quotes.find((q) => q.checked);
            fundingSource = f?.body ?? r.value.title;
            calculatorText = r.value.answer;
            verdict = /not (available|in scope|covered)|no longer|unlikely/i.test(r.value.answer) ? "unlikely" : "unknown";
            kit.finding(`${fundingSource}: ${r.value.answer}`, r.value.url, "nell");
            return `${r.value.answer}\nQuotes: ${r.value.quotes.filter((q) => q.checked).map((q) => `"${q.quote}"`).join(" | ")}`;
          }
          case "read_scheme": {
            const c = step("compensation");
            // Try the scheme's page, then each of its sources, until one really describes the scheme (not a general complaints page).
            const urls = [...new Set([c?.url, ...(c?.sources.map((x) => x.url) ?? [])].filter((u): u is string => !!u))].slice(0, 4);
            if (!urls.length) return "Could not read the scheme: discovery found no compensation page.";
            const question = "How does a patient get compensation through this scheme: how does a claim start, who decides, is there a cap or threshold, what are the time limits, does the patient get free legal advice, and does using it stop them going to court?";
            const r = await kit.inTab(thought, "robin", short(c?.body ?? "Scheme", 26), async (p, note) => {
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
          case "search_register": {
            const l = step("lawyers");
            if (s("url") && !found.has(host(s("url"))) && host(s("url")) !== host(l?.url)) return `Blocked: ${s("url")} was not found in this run. Use web_search first.`;
            const url = s("url") || (l?.url ?? l?.sources[0]?.url);
            if (!url) return "Could not search: discovery found no register or directory.";
            const where = route.place.city || facts.postcode || route.place.region;
            if (s("area")) areaOfLaw = s("area");
            const r = await kit.inTab(thought, "robin", short(l?.body ?? "Register", 26), (p, note) => searchDirectory({ page: p, note, track: kit.track }, { url, goal: `Find lawyers or firms who do ${s("area") || "clinical negligence"} near ${where}`, criteria: [{ label: "area of law", value: s("area") || "clinical negligence / medical negligence" }, { label: "location", value: where }], maxResults: 12 }), 4 * 60 * 1000);
            if (!r.ok) return `Could not search the register: ${r.error}`;
            const d = r.value;
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
            const r = await kit.inTab(thought, "robin", short(firm.name.replace(/\s+(LLP|Ltd|Limited|Solicitors)\b.*$/i, ""), 26), async (p, note) => {
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
              const v = await vetFirm(p, f, note, kit.track);
              const landed = host(p.url());
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
            routeKind = s("route") === "legal_aid" && verdict === "likely" ? "legal_aid" : "no_win_no_fee";
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
            if (!message) {
              // Nell -> Kit: the funding checker's own words travel into the message, as an estimate, never as eligibility.
              const funding = fundingQuote?.checked ? `On funding: ${fundingSource}'s online checker says "${short(fundingQuote.quote, 220)}". I understand this is only an estimate.` : "I would also like to know how a case like this could be funded.";
              message = await draftEnquiry(facts, undefined, g && proof.gaps?.[0] ? { guideline: proof.guideline!.name, point: g.text, question: proof.gaps[0].question } : undefined, { place: placeName, funding });
            }
            const msg = message;
            const r = await kit.inTab(thought, "kit", short(firm.name.replace(/\s+(LLP|Ltd|Limited|Solicitors)\b.*$/i, ""), 24), async (p, note) => {
              const o = await fillOne(p, firm, { facts, message: msg, area: areaOfLaw }, note, kit.track, (x) => kit.emit({ type: "enquiry", enquiry: x }));
              if (o.status === "ready_to_send" || o.status === "needs_input") {
                keepForApproval(firm.id, { page: p, firm, email: facts.email, runId: kit.runId, tracer: kit.tracer, note });
                kit.keep(p);
              }
              return o;
            }, 150_000);
            const o: EnquiryOutcome = r.ok ? r.value : { firmId: firm.id, firmName: firm.name, status: "failed", formUrl: null, filled: [], unfilled: [], consents: [], note: `Stopped: ${r.error}` };
            enquiries.set(firm.id, o);
            kit.emit({ type: "enquiry", enquiry: o });
            if (o.status === "ready_to_send" && o.formUrl) firms.set(firm.id, { ...firms.get(firm.id)!, enquiryUrl: o.formUrl });
            kit.finding(`${firm.name}: ${o.status === "ready_to_send" ? "enquiry form filled, waiting for your OK" : o.note}`, o.formUrl ?? undefined, "kit");
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
