import type { Profile } from "../profile";
import type { EnquiryOutcome, EnquiryRecord } from "../agent/enquiryTypes";
import type { FirmFinding, Tri } from "../agent/legalAidTypes";
import type { EvidenceResult, InvestigationLane, PlannerResult } from "../agent/plannerTypes";
import { cleanRoute, evidenceOf, ROUTE_KINDS, trustOf, type RouteMap, type RouteStep, type Source } from "../agent/routeTypes";

/**
 * The solicitor-ready case bundle. One document built ONLY from what the app already saved for this case:
 * nothing is invented, and a section with no saved data is left out. Server-rendered (renderToStaticMarkup) and printed to A4 by
 * lib/caseBundle/render.ts. Plain words, every fact with its source link and, where the data has them, the quoted words.
 */

export type BundleInput = { profile: Profile; preparedAt: Date };

/* ------------------------------------------------------------------ helpers */

const safeUrl = (u?: string | null): string | null => (u && /^https?:\/\//i.test(u.trim()) ? u.trim() : null);
const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
};
const clean = (t?: string | null) => (t ?? "").replace(/\s+/g, " ").trim();
const has = (t?: string | null) => clean(t).length > 0;
/** A saved sentence cut short by an ellipsis is never printed as it is: the checked quote that backs it is used instead. */
const hasEllipsis = (t: string) => /…|\.{2,}/.test(t);

export function longDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
}
/** "2026-07-04" becomes "4 July 2026"; anything else (the patient's own wording, e.g. "early July 2026") is kept as said. */
function eventDate(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return clean(s);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return Number.isNaN(d.getTime()) ? clean(s) : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
function savedDate(iso?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : longDate(d);
}

function Url({ url }: { url?: string | null }) {
  const u = safeUrl(url);
  return u ? (
    <a className="url" href={u}>
      {u}
    </a>
  ) : null;
}

/** A quote as the page words it: the checked text, without quote marks that were saved around it (we add our own). */
const unquote = (t: string) => clean(t).replace(/^["“]\s*/, "").replace(/\s*["”]$/, "");

function Quote({ quote, publisher, url, note, badge }: { quote: string | string[]; publisher?: string; url?: string | null; note?: string; badge?: string }) {
  const quotes = Array.isArray(quote) ? quote : [quote];
  return (
    <blockquote className="quote">
      {quotes.map((q, i) => (
        <p key={i}>“{unquote(q)}”</p>
      ))}
      <footer>
        {has(publisher) && <span className="by">{clean(publisher)}</span>}
        {note && <span>{has(publisher) ? ", " : ""}{note}</span>}
        {badge && <span className="badge">{badge}</span>}
        <Url url={url} />
      </footer>
    </blockquote>
  );
}

/** Quotes from the same page sit together under that page's link, so a link is printed once per page, not once per quote. */
function Sources({ items, badges = true }: { items: { source: Source; official: boolean }[]; badges?: boolean }) {
  const groups: { url: string; publisher: string; official: boolean; quotes: string[] }[] = [];
  for (const { source, official } of items) {
    const g = groups.find((x) => x.url === source.url && x.official === official);
    if (g) g.quotes.push(source.quote);
    else groups.push({ url: source.url, publisher: source.publisher, official, quotes: [source.quote] });
  }
  return (
    <>
      {groups.map((g, i) => (
        <Quote key={i} quote={g.quotes} publisher={g.publisher} url={g.url} badge={badges ? (g.official ? "Official" : "Background, not official") : undefined} />
      ))}
    </>
  );
}

/** What a saved point says once the quote marks around it are taken off, for telling whether a quote below already holds it. */
const plain = (t: string) => clean(t).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The step's quotes that code found in the page: official ones first, then the checked ones that are not official (marked as background). Never an unchecked quote. */
function stepSources(step: RouteStep): { source: Source; official: boolean }[] {
  const ev = evidenceOf(step);
  const seen = new Set<string>();
  const out: { source: Source; official: boolean }[] = [];
  const add = (indexes: number[], official: boolean) => {
    for (const i of indexes) {
      const s = step.sources[i];
      if (!s || !has(s.quote)) continue;
      const k = `${s.url}|${clean(s.quote)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ source: s, official });
    }
  };
  add(ev.official, true);
  add(ev.checkedOnly, false);
  return out;
}

/** The time limit as the step saves it. A saved sentence with an ellipsis is replaced by the full checked quote that backs it. */
function deadlineText(step: RouteStep): string | null {
  const d = clean(step.deadline);
  if (!d || /^(not found|none|unknown|n\/a)\b/i.test(d)) return null;
  if (!hasEllipsis(d)) return d;
  const ev = evidenceOf(step);
  const backing = (ev.claims?.deadline ?? []).map((i) => step.sources[i]).find((s) => s && s.checked && has(s.quote));
  return backing ? clean(backing.quote) : null;
}

function deadlineSources(step: RouteStep): { source: Source }[] {
  const ev = evidenceOf(step);
  const idx = ev.claims?.deadline?.length ? ev.claims.deadline : ev.official;
  const seen = new Set<string>();
  const out: { source: Source }[] = [];
  for (const i of idx) {
    const s = step.sources[i];
    if (!s || !s.checked || !has(s.quote)) continue;
    const k = `${s.url}|${clean(s.quote)}`;
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ source: s });
    }
  }
  return out;
}

/** A step's key points, leaving out any that is just a quote already printed under its sources. */
function points(step: RouteStep, sources: { source: Source }[]): string[] {
  const quoted = sources.map((x) => plain(x.source.quote));
  return (step.points ?? []).filter(has).filter((p) => !quoted.some((q) => q.includes(plain(p))));
}

const kindLabel = (kind: RouteStep["kind"]) => ROUTE_KINDS.find((k) => k.kind === kind)?.label ?? kind;
const trustClass = (label: string) => (label === "Solid" ? "solid" : label === "Likely" ? "likely" : label === "Probably" ? "probably" : label === "Sources differ" ? "differ" : "none");

function Trust({ step }: { step: Pick<RouteStep, "confidence" | "deadlineCheck" | "takeaway"> }) {
  const t = trustOf(step);
  return <span className={`trust ${trustClass(t.label)}`}>{t.label}</span>;
}

const triWord = (t: Tri | undefined, yes: string, no: string, unknown: string) => (t === "yes" ? yes : t === "no" ? no : unknown);
const triClass = (t: Tri | undefined) => (t === "yes" ? "yes" : t === "no" ? "no" : "unk");

const VERDICT_LINE: Record<string, string> = {
  likely: "The legal aid checker says you may qualify financially for legal aid.",
  unlikely: "The legal aid checker says you are unlikely to qualify financially for legal aid.",
  unknown: "The legal aid checker did not give a clear answer.",
  skipped: "You chose not to give money details, so the legal aid checker was not used. The crew assumed a no win, no fee route.",
};
const ROUTE_LINE: Record<string, string> = {
  legal_aid: "Legal aid looks like the most likely way to pay for a solicitor.",
  no_win_no_fee: "A no win, no fee agreement looks like the most likely way to pay for a solicitor.",
};

const LANE: Record<InvestigationLane, string> = { decision: "Published decision", policy: "Published policy", inspection: "Inspection report", public_record: "Public record" };
const STANCE: Record<string, string> = { supports: "Points towards your case", neutral: "Neutral", against: "Points against your case" };

/** Plain words for one firm's enquiry, from the last run's outcome and the tracker. Only "sent" ever says it was sent. */
function enquiryStatus(o?: EnquiryOutcome, rec?: EnquiryRecord): { line: string; detail?: string } {
  if (rec && (rec.status === "sent" || rec.status === "replied" || rec.status === "not_interested")) {
    const when = rec.sentAt ? savedDate(rec.sentAt) : null;
    if (rec.status === "replied") return { line: `Sent${when ? ` on ${when}` : ""}, and the firm has replied.` };
    if (rec.status === "not_interested") return { line: `Sent${when ? ` on ${when}` : ""}. You marked this firm as not going ahead.` };
    return { line: `Sent${when ? ` on ${when}` : ""}.`, detail: o?.confirmation && has(o.confirmation) ? clean(o.confirmation) : undefined };
  }
  if (!o) return { line: "No enquiry has been prepared for this firm yet. Nothing has been sent." };
  switch (o.status) {
    case "sent": {
      const when = o.sentAt ? savedDate(o.sentAt) : null;
      return { line: `Sent${when ? ` on ${when}` : ""}.`, detail: has(o.confirmation) ? clean(o.confirmation) : undefined };
    }
    case "ready_to_send":
      return { line: "Form filled in and stopped before Send. Nothing has been sent; it goes only when you approve it." };
    case "needs_input":
      return { line: "Form filled in as far as it could be, and it needs a detail only you have. Nothing has been sent.", detail: has(o.question) ? clean(o.question) : undefined };
    case "partial":
      return { line: "Form only partly filled in. Nothing has been sent.", detail: has(o.note) ? clean(o.note) : undefined };
    case "could_not_fill":
      return { line: "The form could not be filled in. Nothing has been sent.", detail: has(o.note) ? clean(o.note) : undefined };
    case "no_form":
      return { line: "No online enquiry form was found. Nothing has been sent." };
    case "send_blocked":
      return { line: "Approved but not sent: sending was blocked. Nothing has been sent." };
    case "failed":
      return { line: "The form could not be completed. Nothing has been sent.", detail: has(o.note) ? clean(o.note) : undefined };
    case "email_draft":
      return { line: "An email draft was prepared. Nothing has been sent." };
    default:
      return { line: "Being prepared. Nothing has been sent yet." };
  }
}

const dedupe = (xs: string[]) => [...new Set(xs.map((x) => clean(x).replace(/\*$/, "")).filter(Boolean))];

/** The page a firm's check was read from, taken from the check's own saved evidence line (it names the page it opened). */
function evidenceUrl(f: FirmFinding, key: string): string | null {
  const text = f.breakdown?.find((b) => b.key === key)?.evidence ?? "";
  return safeUrl(/https?:\/\/[^\s)]+/.exec(text)?.[0]?.replace(/[.,;:]+$/, ""));
}

/* ------------------------------------------------------------------ the document */

export default function CaseBundle({ profile, preparedAt }: BundleInput) {
  const facts = profile.facts;
  const route: RouteMap | undefined = profile.route && "map" in profile.route ? cleanRoute(profile.route.map) : undefined;
  const result = profile.legalAid?.result as (Partial<PlannerResult> & NonNullable<NonNullable<Profile["legalAid"]>["result"]>) | undefined;
  const evidence: EvidenceResult | undefined = result?.evidence ?? profile.caseRun?.evidence;
  const name = [facts.title, facts.firstName, facts.lastName].filter(has).map(clean).join(" ") || "The patient";
  const first = clean(facts.firstName) || "The patient";
  const place = route?.place;
  const where = [place?.city, place?.region, place?.country].filter(has).map(clean).filter((x, i, a) => a.indexOf(x) === i).join(", ") || [facts.region, facts.country].filter(has).map(clean).join(", ");
  const hospital = clean(place?.hospital) || clean(facts.incidentLocation);

  const events = (facts.events ?? []).filter((e) => has(e.what));
  const doneAt = (["nhsFilled", "nhsSent", "spsoFilled", "spsoSent"] as const)
    .map((k) => ({ k, at: profile.progress?.at?.[k] }))
    .filter((x) => !!x.at && savedDate(x.at));
  const DONE_LABEL: Record<string, string> = {
    nhsFilled: "NHS complaint form filled in",
    nhsSent: "NHS complaint sent (as you told us)",
    spsoFilled: "Ombudsman form filled in",
    spsoSent: "Ombudsman complaint sent (as you told us)",
  };

  const steps = route?.steps ?? [];
  const limitRows = steps.filter((s) => s.confidence !== "unconfirmed" && deadlineText(s));
  const fundingStep = steps.find((s) => s.kind === "funding");
  const checkerUrl = safeUrl(result?.trace?.find((t) => t.kind === "result" && t.url)?.url) ?? safeUrl(fundingStep?.url);
  const checkerName = clean(fundingStep?.body) || "The legal aid checker";

  const shortlist = (result?.shortlist ?? []).map((id) => result?.firms.find((f) => f.id === id)).filter((f): f is FirmFinding => !!f);
  const outcomes: EnquiryOutcome[] = profile.enquiry?.outcomes ?? result?.enquiries ?? [];
  const records = profile.enquiries ?? [];
  const firmIds = [...shortlist.map((f) => f.id), ...outcomes.map((o) => o.firmId).filter((id) => !shortlist.some((f) => f.id === id))];
  const firmRows = firmIds.map((id) => ({ id, firm: result?.firms.find((f) => f.id === id), outcome: outcomes.find((o) => o.firmId === id), rec: records.find((r) => r.firmId === id) }));

  const guideline = evidence?.guideline && evidence.guideline.points?.length ? evidence.guideline : undefined;
  const gaps = (evidence?.gaps ?? []).filter((g) => has(g.question));
  const inv = evidence?.investigation;
  const cases = evidence?.cases ?? [];
  const hasClinical = !!guideline || gaps.length > 0 || !!inv?.items.length || !!inv?.nothing.length || cases.length > 0;

  const sample = Boolean((profile.route && "map" in profile.route && profile.route.sample) || profile.legalAid?.sample || profile.enquiry?.sample);

  // Sections that have data, numbered in order.
  const parts: { id: string; title: string }[] = [];
  if (events.length || doneAt.length) parts.push({ id: "timeline", title: "What happened, and when" });
  if (steps.length) parts.push({ id: "route", title: `The route where ${first === "The patient" ? "the patient" : first} lives` });
  if (limitRows.length) parts.push({ id: "limits", title: "Time limits" });
  if (result) parts.push({ id: "funding", title: "Paying for a solicitor" });
  if (hasClinical) parts.push({ id: "clinical", title: "Clinical evidence" });
  if (firmRows.length) parts.push({ id: "solicitors", title: "Solicitors" });
  parts.push({ id: "prepared", title: "How this was prepared" });
  const num = (id: string) => parts.findIndex((p) => p.id === id) + 2; // the cover is 1
  const title = (id: string) => parts.find((p) => p.id === id)?.title ?? "";
  const heading = (id: string) => (
    <h2>
      <span className="n">{num(id)}</span>
      {title(id)}
    </h2>
  );

  return (
    <html lang="en-GB">
      {/* eslint-disable-next-line @next/next/no-head-element -- a standalone print page, not a Next page */}
      <head>
        <meta charSet="utf-8" />
        <title>{`Case bundle: ${name}`}</title>
      </head>
      <body>
        {/* 1. Cover */}
        <section className="cover" id="cover">
          <p className="eyebrow">Case bundle for a solicitor</p>
          <h1>{name}</h1>
          <p className="sub">{[hospital, where].filter(has).filter((x, i, a) => a.indexOf(x) === i).join(", ") || "Care that went wrong"}</p>
          <hr className="rule" />
          <table className="facts">
            <tbody>
              <tr>
                <th>Patient</th>
                <td>{name}</td>
              </tr>
              {has(hospital) && (
                <tr>
                  <th>Where the care happened</th>
                  <td>{hospital}</td>
                </tr>
              )}
              {has(where) && (
                <tr>
                  <th>Place</th>
                  <td>{where}</td>
                </tr>
              )}
              {(place?.careSetting === "public" || place?.careSetting === "private") && (
                <tr>
                  <th>Kind of care</th>
                  <td>{place.careSetting === "public" ? "Public (state-funded) care" : "Private care"}</td>
                </tr>
              )}
              <tr>
                <th>Prepared on</th>
                <td>{longDate(preparedAt)}</td>
              </tr>
            </tbody>
          </table>

          {has(facts.incidentSummary) && (
            <>
              <p className="label">What happened, in {first === "The patient" ? "the patient" : first}’s own words</p>
              <p className="own">{clean(facts.incidentSummary)}</p>
            </>
          )}
          {has(facts.desiredOutcome) && (
            <>
              <p className="label">What {first === "The patient" ? "the patient" : first} wants</p>
              <p className="own">{clean(facts.desiredOutcome)}</p>
            </>
          )}

          <div className="contents">
            <p className="label">In this bundle</p>
            <ol>
              {parts.map((p, i) => (
                <li key={p.id}>
                  <span className="n">{i + 2}</span>
                  {p.title}
                </li>
              ))}
            </ol>
          </div>
          <p className="notice">
            Prepared from what Elliot saved for this case. Every fact below has its source beside it; where a section had nothing saved, it has been left out. This is not legal advice.
          </p>
        </section>

        {/* 2. Timeline */}
        {parts.some((p) => p.id === "timeline") && (
          <section className="part" id="timeline">
            {heading("timeline")}
            {events.length > 0 && (
              <ul className="timeline">
                {events.map((e, i) => (
                  <li key={i}>
                    <span className="when">{eventDate(e.date)}</span>
                    {clean(e.what)}
                  </li>
                ))}
              </ul>
            )}
            {doneAt.length > 0 && (
              <>
                <h4>Steps taken since</h4>
                <ul>
                  {doneAt.map((x) => (
                    <li key={x.k}>
                      <b>{savedDate(x.at)}:</b> {DONE_LABEL[x.k]}
                    </li>
                  ))}
                </ul>
              </>
            )}
            <p className="small muted">Dates are as {first === "The patient" ? "the patient" : first} gave them. Where only a month was given, only a month is shown.</p>
          </section>
        )}

        {/* 3. Route */}
        {parts.some((p) => p.id === "route") && route && (
          <section className="part" id="route">
            {heading("route")}
            {has(route.summary) && <p className="intro">{clean(route.summary)}</p>}
            {steps.map((s, i) => {
              const sources = stepSources(s);
              const solid = s.confidence !== "unconfirmed";
              const t = trustOf(s);
              return (
                <article className="step" key={i}>
                  <div className="step-head">
                    <div className="who">
                      <p className="label">{kindLabel(s.kind)}</p>
                      <h3>{clean(s.body)}</h3>
                    </div>
                    <Trust step={s} />
                  </div>
                  <p className="small muted">{t.why}</p>
                  {solid && s.takeaway && (
                    <p className="take">
                      <strong>{clean(s.takeaway.headline)}.</strong> {clean(s.takeaway.why)}
                    </p>
                  )}
                  {solid && has(s.what) && <p>{clean(s.what)}</p>}
                  <dl className="kv">
                    {solid && deadlineText(s) && (
                      <>
                        <dt>Time limit</dt>
                        <dd>{deadlineText(s)}</dd>
                      </>
                    )}
                    {solid && has(s.appliesIf) && (
                      <>
                        <dt>Applies if</dt>
                        <dd>{clean(s.appliesIf)}</dd>
                      </>
                    )}
                    {solid && !!s.requires?.length && (
                      <>
                        <dt>First</dt>
                        <dd>
                          <ul>{s.requires.filter(has).map((r, j) => <li key={j}>{clean(r)}</li>)}</ul>
                        </dd>
                      </>
                    )}
                    {solid && !!s.alternatives?.length && (
                      <>
                        <dt>Other routes</dt>
                        <dd>
                          <ul>{s.alternatives.filter(has).map((r, j) => <li key={j}>{clean(r)}</li>)}</ul>
                        </dd>
                      </>
                    )}
                    {solid && points(s, sources).length > 0 && (
                      <>
                        <dt>Key points</dt>
                        <dd>
                          <ul>{points(s, sources).map((r, j) => <li key={j}>{clean(r)}</li>)}</ul>
                        </dd>
                      </>
                    )}
                    {!!s.missing?.length && (
                      <>
                        <dt>Still needed</dt>
                        <dd>
                          <ul>{s.missing.filter(has).map((r, j) => <li key={j}>{clean(r)}</li>)}</ul>
                        </dd>
                      </>
                    )}
                  </dl>
                  {sources.length > 0 ? (
                    <>
                      <h4>Sources, quoted and checked against the page</h4>
                      <Sources items={sources} />
                    </>
                  ) : (
                    safeUrl(s.url) && (
                      <>
                        <h4>Page the crew found (no quote was confirmed from it)</h4>
                        <Url url={s.url} />
                      </>
                    )
                  )}
                </article>
              );
            })}
          </section>
        )}

        {/* 4. Time limits */}
        {parts.some((p) => p.id === "limits") && (
          <section className="part" id="limits">
            {heading("limits")}
            <p className="intro">Every time limit the research found, as the official page words it. A solicitor should confirm which one applies and when it starts to run.</p>
            <table className="grid">
              <thead>
                <tr>
                  <th style={{ width: "30mm" }}>For</th>
                  <th>Time limit, as the source says it</th>
                  <th style={{ width: "36mm" }}>How well checked</th>
                </tr>
              </thead>
              <tbody>
                {limitRows.map((s, i) => {
                  const ev = evidenceOf(s);
                  const srcs = deadlineSources(s);
                  const check =
                    ev.deadlineCheck === "two_sites" ? "Two official sites give it." : ev.deadlineCheck === "one_site" ? "One official site gives it." : ev.deadlineCheck === "sources_differ" ? "Official pages differ." : trustOf(s).why;
                  return (
                    <tr key={i}>
                      <td>
                        <b>{kindLabel(s.kind)}</b>
                        <br />
                        <span className="small muted">{clean(s.body)}</span>
                      </td>
                      <td>
                        <p className="big">{deadlineText(s)}</p>
                        {ev.deadlineCheck === "sources_differ" && !!ev.deadlineOthers?.length && <p className="small">Another official page gives: {ev.deadlineOthers.map(clean).join("; ")}.</p>}
                        <Sources items={srcs.map(({ source }) => ({ source, official: true }))} badges={false} />
                        {srcs.length === 0 && <Url url={s.url} />}
                      </td>
                      <td>
                        <Trust step={s} />
                        <p className="small muted" style={{ marginTop: "3pt" }}>{check}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* 5. Funding */}
        {parts.some((p) => p.id === "funding") && result && (
          <section className="part" id="funding">
            {heading("funding")}
            <p className="verdict">{VERDICT_LINE[result.verdict] ?? VERDICT_LINE.unknown}</p>
            {ROUTE_LINE[result.route] && <p>{ROUTE_LINE[result.route]}</p>}
            {result.verdict === "likely" && <p className="small muted">A solicitor applies for legal aid for you, and the legal aid body also checks that the case has merit.</p>}
            {has(result.calculatorText) && result.verdict !== "skipped" && (
              <>
                <h4>The checker’s own words</h4>
                <Quote quote={result.calculatorText} publisher={checkerName} note="legal aid checker" url={checkerUrl} />
              </>
            )}
            {fundingStep && fundingStep.confidence !== "unconfirmed" && (
              <>
                <h4>What the research found about paying for help</h4>
                {fundingStep.takeaway && (
                  <p className="take">
                    <strong>{clean(fundingStep.takeaway.headline)}.</strong> {clean(fundingStep.takeaway.why)}
                  </p>
                )}
                {has(fundingStep.what) && <p>{clean(fundingStep.what)}</p>}
                <Sources items={stepSources(fundingStep)} />
              </>
            )}
          </section>
        )}

        {/* 6. Clinical evidence */}
        {parts.some((p) => p.id === "clinical") && evidence && (
          <section className="part" id="clinical">
            {heading("clinical")}
            {guideline && (
              <>
                <h4>Clinical guidance found</h4>
                {guideline.points.map((p, i) => (
                  <Quote key={i} quote={p.text} publisher={clean(guideline.name)} url={guideline.url} />
                ))}
              </>
            )}
            {gaps.length > 0 && (
              <>
                <h4>Possible gaps, as questions</h4>
                <p className="small muted">These are questions for the medical records and a solicitor to answer. They do not say that anyone was negligent.</p>
                {gaps.map((g, i) => (
                  <div className="gap" key={i}>
                    <p className="q">{clean(g.question)}</p>
                    {has(g.guideline) && <p className="small"><span className="muted">Guidance point:</span> {clean(g.guideline).replace(/^\d+:\s*/, "")}</p>}
                    {has(g.timeline) && <p className="small"><span className="muted">From the timeline:</span> {clean(g.timeline)}</p>}
                  </div>
                ))}
              </>
            )}
            {has(evidence.caveat) && <p className="caution">{clean(evidence.caveat)}</p>}
            {inv && (
              <>
                <h4>Published decisions and records searched for</h4>
                {inv.items.map((it, i) => (
                  <div className="gap" key={i}>
                    <p className="small muted">
                      {LANE[it.lane]} · {STANCE[it.stance] ?? it.stance} · {it.fit === "close" ? "close fit" : "partial fit"}
                    </p>
                    <p className="q">{clean(it.title)}</p>
                    <Quote quote={it.quote} publisher={it.publisher} url={it.url} />
                    {has(it.why) && <p className="small">{clean(it.why)}</p>}
                  </div>
                ))}
                {inv.items.length === 0 && inv.nothing.map((n, i) => (
                  <p key={i} className="small">
                    <b>{LANE[n.lane]}s:</b> none found. {clean(n.note)}
                  </p>
                ))}
                {inv.items.length === 0 && inv.nothing.length === 0 && <p className="small">Nothing published was found that fits this case.</p>}
              </>
            )}
            {cases.length > 0 && (
              <>
                <h4>Cases found</h4>
                {cases.map((c, i) => (
                  <div className="gap" key={i}>
                    <p className="q">{clean(c.title)}</p>
                    <p className="small muted">{[c.year, c.court, c.kind].filter(has).map(clean).join(" · ")}</p>
                    {has(c.summary) && <p>{clean(c.summary)}</p>}
                    {has(c.award) && <p className="small">Award: {clean(c.award)}</p>}
                    <Url url={c.url} />
                  </div>
                ))}
              </>
            )}
          </section>
        )}

        {/* 7. Solicitors */}
        {parts.some((p) => p.id === "solicitors") && (
          <section className="part" id="solicitors">
            {heading("solicitors")}
            <p className="intro">The firms the crew shortlisted. What was checked on each firm’s own website is shown for each, with the page that was read.</p>
            {firmRows.map(({ id, firm, outcome, rec }) => {
              const st = enquiryStatus(outcome, rec);
              const filled = dedupe((outcome?.filled ?? []).map((f) => f.label));
              const formUrl = safeUrl(outcome?.formUrl) ?? safeUrl(firm?.enquiryUrl);
              const pageFor = (k: string) => evidenceUrl(firm as FirmFinding, k);
              const ownSite = (u: string | null) => (u && firm?.website && hostOf(u) === hostOf(firm.website) ? "Read on the firm’s own website" : u ? "Page read" : "");
              return (
                <div className="firm" key={id}>
                  <div className="head">
                    <h3>{clean(firm?.name ?? outcome?.firmName ?? id)}</h3>
                    {firm && has(firm.town) && <span className="town">{clean(firm.town)}</span>}
                  </div>
                  {firm && <Url url={firm.website} />}
                  {firm && (
                    <table className="checks">
                      <tbody>
                        <tr>
                          <td>Acts for patients</td>
                          <td className={`res ${triClass(firm.actsForPatients)}`}>{triWord(firm.actsForPatients, "Yes", "No", "Not clear")}</td>
                          <td className="small muted">
                            {ownSite(pageFor("patients"))}
                            <Url url={pageFor("patients")} />
                          </td>
                        </tr>
                        <tr>
                          <td>No win, no fee</td>
                          <td className={`res ${triClass(firm.noWinNoFee)}`}>{triWord(firm.noWinNoFee, "Yes", "No", "Not stated")}</td>
                          <td className="small muted">
                            {ownSite(pageFor("nwnf"))}
                            <Url url={pageFor("nwnf")} />
                          </td>
                        </tr>
                        <tr>
                          <td>Online enquiry form</td>
                          <td className={`res ${formUrl ? "yes" : "no"}`}>{formUrl ? "Yes" : "None found"}</td>
                          <td className="small muted">
                            <Url url={formUrl} />
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                  <div className="status">
                    <b>Enquiry:</b> {st.line}
                    {st.detail && <span className="muted"> {st.detail}</span>}
                    {filled.length > 0 && <div className="small muted">Details filled in on their form: {filled.length}.</div>}
                  </div>
                </div>
              );
            })}
            {profile.enquiry?.message && has(profile.enquiry.message.subject) && (
              <p className="small">
                <span className="muted">Subject line of the enquiry:</span> {clean(profile.enquiry.message.subject)}
              </p>
            )}
          </section>
        )}

        {/* 8. How this was prepared */}
        <section className="part note" id="prepared">
          {heading("prepared")}
          <p>
            This bundle was researched live from official sources by Elliot’s crew: one agent looked at how the system works where the care happened, one checked funding, one found and checked law firms, one read clinical guidance and one filled in enquiry forms.
            Quotes were checked against the pages they came from, and only quotes found in the page text are shown.
          </p>
          {result?.stats && (
            <p>
              Across the run the crew opened {result.stats.pages} {result.stats.pages === 1 ? "page" : "pages"} on {result.stats.sites} {result.stats.sites === 1 ? "website" : "websites"}.
            </p>
          )}
          <p>Nothing was sent without {first === "The patient" ? "the patient" : first}. Enquiry forms were filled in and stopped before Send; the status of each is shown in the Solicitors section.</p>
          {sample && <p>Part of this case was played back from a recorded sample run, not researched live.</p>}
          <p>This is not legal advice. It is a summary of what was found, so that a solicitor can start with the facts and the sources.</p>
          <p className="refs">
            {[route?.runId && `Route research ${route.runId}`, result?.runId && `Case run ${result.runId}`, `Prepared ${longDate(preparedAt)}`].filter(Boolean).join(" · ")}
          </p>
        </section>
      </body>
    </html>
  );
}
