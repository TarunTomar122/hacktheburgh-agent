// Deterministic test for the solicitor-ready case bundle: renders the HTML from the fixture Ailsa case (real saved run data) and
// checks the sections, the sources, the quotes, and that nothing is cut short or invented. No browser, no network, no model.
//   npx tsx scripts/test-case-bundle.tsx
import assert from "node:assert/strict";
import { renderBundleHtml } from "../lib/caseBundle/render";
import type { RouteMap } from "../lib/agent/routeTypes";
import type { Profile } from "../lib/profile";
import { ailsaProfile } from "./caseBundleFixture";

const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
/** The words a reader sees: the body, with style and tags removed. */
const textOf = (html: string) => decode(html.replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<head[\s\S]*?<\/head>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const flat = (t: string) => decode(t).replace(/\s+/g, " ").trim();

let n = 0;
const ok = (cond: unknown, what: string) => {
  assert.ok(cond, what);
  n++;
  console.log(`PASS  ${what}`);
};

async function main() {
  const when = new Date("2026-11-08T12:00:00Z");
  const p = ailsaProfile();
  const html = await renderBundleHtml(p, when);
  const text = textOf(html);
  const map = (p.route as { map: RouteMap }).map;

  // The eight parts, in order.
  const order = ["Ms Ailsa Reid", "What happened, and when", "The route where Ailsa lives", "Time limits", "Paying for a solicitor", "Clinical evidence", "Solicitors", "How this was prepared"];
  let at = -1;
  for (const h of order) {
    const i = text.indexOf(h, at + 1);
    ok(i > at, `section in order: ${h}`);
    at = i;
  }

  // 1. Cover: name, place, date prepared, her own story, what she wants.
  ok(text.includes("Royal Infirmary of Edinburgh") && text.includes("Edinburgh, Scotland, United Kingdom"), "cover: the place");
  ok(text.includes("Prepared on 8 November 2026"), "cover: date prepared");
  ok(text.includes(flat(p.facts.incidentSummary!)), "cover: the patient's own story, word for word");
  ok(text.includes(flat(p.facts.desiredOutcome!)), "cover: what she wants, word for word");
  // 2. Timeline: every saved event, in the saved order.
  let pos = text.indexOf("What happened, and when");
  for (const e of p.facts.events) {
    const i = text.indexOf(flat(e.what), pos);
    ok(i >= pos, `timeline: ${e.date}: ${e.what.slice(0, 40)}`);
    pos = i;
  }
  // 3. Route: every part, with its trust label and a checked quote and its link.
  for (const s of map.steps) ok(text.includes(flat(s.body)), `route: ${s.kind} part names ${s.body}`);
  ok(/Sources differ/.test(text) && /Solid/.test(text) && /Likely/.test(text), "route: trust labels (Solid, Likely, Sources differ)");
  const checked = map.steps.flatMap((s) => s.sources.filter((x) => x.checked));
  ok(checked.length > 10, `route: the fixture has ${checked.length} checked quotes`);
  for (const q of checked) ok(text.includes(flat(q.quote).replace(/^["“]|["”]$/g, "")) && html.includes(`href="${q.url.replace(/&/g, "&amp;")}"`), `route: checked quote and its link: ${q.url.slice(-40)}`);
  // An unchecked quote is never printed as a source quote.
  const unchecked = map.steps.flatMap((s) => s.sources.filter((x) => !x.checked));
  ok(unchecked.length > 0, "route: the fixture holds unchecked quotes");
  for (const q of unchecked) ok(!html.includes(`<p>“${flat(q.quote)}”</p>`), `route: unchecked quote is not shown as a source: ${flat(q.quote).slice(0, 40)}`);
  // 4. Time limits: the deadlines the route map holds, each with its source.
  const limits = text.slice(text.indexOf("Time limits Every"), text.indexOf("Paying for a solicitor", text.indexOf("Time limits Every")));
  ok(limits.includes("6 months of the event") && limits.includes("12 months after the event itself"), "time limits: the complaint limit, in the source's words");
  ok(limits.includes("Another official page gives: 12 months"), "time limits: says when official sources differ");
  ok(limits.includes("within 3 years") && limits.includes("19th birthday"), "time limits: the compensation limit");
  ok(limits.includes("https://www.gov.scot/publications/consultation-recommendations-fault-compensation-scotland-injuries-resulting-clinical-treatment/pages/10/"), "time limits: each with its source link");
  ok(!limits.includes("not found"), "time limits: a 'not found' deadline is not listed");
  // 5. Funding: verdict, the checker's own words, the funding step's source.
  const funding = text.slice(text.indexOf("Paying for a solicitor", text.indexOf("Time limits Every")), text.indexOf("Clinical evidence", text.indexOf("Time limits Every")));
  ok(funding.includes("unlikely to qualify financially"), "funding: the verdict in words");
  ok(funding.includes(flat(p.legalAid!.result!.calculatorText)), "funding: the checker's own words");
  ok(funding.includes("https://www.slab.org.uk/new-to-legal-aid/eligibility-estimators/estimator-civil-legal-aid/"), "funding: the checker's link");
  ok(funding.includes("https://www.avma.org.uk/resource/funding-options-in-clinical-negligence-claims-scotland-only/"), "funding: the funding step's source link");
  ok(funding.includes("no win, no fee agreement looks like the most likely way"), "funding: how it would most likely be paid");
  // 6. Clinical: guideline quoted with source, gaps as questions, decisions searched for.
  const ev = p.caseRun!.evidence;
  const clinical = text.slice(text.indexOf("Clinical evidence", text.indexOf("Time limits Every")), text.indexOf("Solicitors", text.indexOf("Clinical evidence", text.indexOf("Time limits Every"))));
  ok(clinical.includes(flat(ev.guideline!.points[0].text)) && clinical.includes(ev.guideline!.url), "clinical: the guideline point, quoted with its source");
  for (const g of ev.gaps!) ok(clinical.includes(flat(g.question)), `clinical: gap as a question: ${g.question.slice(0, 40)}`);
  ok(clinical.includes("They do not say that anyone was negligent"), "clinical: gaps are questions, not a finding of negligence");
  ok(!/(was|were|is|are|been) negligent\b/.test(clinical.replace("They do not say that anyone was negligent", "")), "clinical: never says negligence happened");
  ok(clinical.includes("Published decisions: none found"), "clinical: says honestly that no published decision was found");
  // 7. Solicitors: the shortlist, what was checked on each firm's own site, the enquiry status.
  const sol = text.slice(text.indexOf("Solicitors The firms"), text.indexOf("How this was prepared", text.indexOf("Solicitors The firms")));
  for (const id of p.legalAid!.result!.shortlist) {
    const f = p.legalAid!.result!.firms.find((x) => x.id === id)!;
    ok(sol.includes(flat(f.name)) && sol.includes(f.website!), `solicitors: ${f.name} with its website`);
  }
  ok(sol.includes("Acts for patients") && sol.includes("No win, no fee") && sol.includes("Online enquiry form"), "solicitors: the three checks on each firm");
  ok(sol.includes("Read on the firm’s own website") && sol.includes("https://www.balfour-manson.co.uk/for-individuals-families/medical-negligence/"), "solicitors: the page read on the firm's own site");
  ok(sol.includes("Not stated"), "solicitors: a check that came back unknown is not shown as a yes (Digby Brown, no win no fee)");
  ok((sol.match(/stopped before Send\. Nothing has been sent/g) ?? []).length === 3, "solicitors: three enquiries stopped before Send, nothing sent");
  ok(!/\bSent on\b/.test(sol), "solicitors: nothing is called sent when nothing was");
  // 8. How prepared.
  const how = text.slice(text.indexOf("How this was prepared", text.indexOf("Solicitors The firms")));
  ok(/researched live from official sources by Elliot/.test(how) && /checked against the pages/.test(how) && /Nothing was sent without Ailsa/.test(how) && /not legal advice/.test(how), "prepared: the four statements");
  ok(how.includes("48 pages on 16 websites"), "prepared: the crew's own page and site counts");

  // Never truncated: no ellipsis character or three dots anywhere a reader sees.
  ok(!text.includes("…"), "no ellipsis character in the document");
  ok(!/\.\.\./.test(text), "no three-dot cut-off in the document");

  // A sent enquiry says so, with its date; a replied one too.
  const sent: Profile = { ...p, enquiries: [{ firmId: "digby-brown", firmName: "Digby Brown", status: "sent", sentAt: "2026-11-09T10:00:00Z" }, { firmId: "slater-gordon", firmName: "Slater + Gordon", status: "replied", sentAt: "2026-11-09T10:05:00Z" }] };
  const sentText = textOf(await renderBundleHtml(sent, when));
  ok(sentText.includes("Sent on 9 November 2026."), "a sent enquiry says Sent on its date");
  ok(sentText.includes("and the firm has replied"), "a replied enquiry says so");

  // A step with no confirmed source states no time limit and no takeaway.
  const weak: Profile = { ...p, route: { map: { ...map, steps: map.steps.map((s) => (s.kind === "compensation" ? { ...s, confidence: "unconfirmed" as const, evidence: undefined, deadlineCheck: undefined } : s)) }, sample: false } };
  const weakText = textOf(await renderBundleHtml(weak, when));
  ok(weakText.includes("Not confirmed") && !weakText.includes("19th birthday"), "an unconfirmed step shows no time limit");

  // Leaves sections out when there is no data.
  const bare: Profile = { facts: { ...p.facts, events: [] }, messages: [], draft: null, createdAt: "2026-11-08T09:00:00.000Z", updatedAt: "2026-11-08T09:00:00.000Z" };
  const bareText = textOf(await renderBundleHtml(bare, when));
  for (const gone of ["What happened, and when", "The route where", "Time limits", "Paying for a solicitor", "Clinical evidence", "Solicitors The firms"]) ok(!bareText.includes(gone), `a case with no data leaves out: ${gone}`);
  ok(bareText.includes("Ms Ailsa Reid") && bareText.includes("How this was prepared") && !bareText.includes("48 pages"), "a case with no data keeps the cover and the note, and makes up no numbers");
  const noName = textOf(await renderBundleHtml({ ...bare, facts: { ...bare.facts, firstName: null, lastName: null, title: null, incidentSummary: null, desiredOutcome: null, incidentLocation: null } }, when));
  ok(!noName.includes("What happened, in") && !noName.includes("What the patient wants"), "no story and no wish: those two paragraphs are left out");

  // A recorded sample run says so.
  const sample: Profile = { ...p, legalAid: { ...p.legalAid!, sample: true } };
  ok(textOf(await renderBundleHtml(sample, when)).includes("played back from a recorded sample run"), "a sample run says it was played back");

  // A link that is not http(s) is never made clickable.
  const evil: Profile = { ...p, route: { map: { ...map, steps: map.steps.map((s, i) => (i === 0 ? { ...s, sources: s.sources.map((x) => ({ ...x, url: "javascript:alert(1)" })) } : s)) }, sample: false } };
  ok(!(await renderBundleHtml(evil, when)).includes('href="javascript:'), "a javascript: link is not made clickable");

  // Escaping: a name with markup is shown as text.
  const tricky: Profile = { ...p, facts: { ...p.facts, lastName: "<b>Reid</b>" } };
  const trickyHtml = await renderBundleHtml(tricky, when);
  ok(!trickyHtml.includes("<b>Reid</b>") && trickyHtml.includes("&lt;b&gt;Reid"), "markup in the saved text is escaped");

  console.log(`\n${n} checks passed`);
}

main().catch((e) => {
  console.error("FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
