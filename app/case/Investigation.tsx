import type { Investigation, InvestigationLane } from "../../lib/agent/plannerTypes";

/**
 * Iona's pre-action investigation (night plan, side backlog 2), shown small: each item is a quote in the body's own
 * words with the page it came from, grouped by what kind of material it is; what was not found is said in one line,
 * with the searches behind it one click away. Every quote here was checked against the page's text by code.
 */

const LANE: Record<InvestigationLane, { title: string; none: string }> = {
  decision: { title: "Decisions on similar cases", none: "published decisions on similar cases" },
  policy: { title: "The provider's own guidance", none: "the provider's own policies and guidance" },
  inspection: { title: "Inspection reports", none: "inspection reports" },
  public_record: { title: "Public records", none: "public records and freedom of information answers" },
};
const ORDER: InvestigationLane[] = ["decision", "policy", "inspection", "public_record"];

export default function InvestigationList({ inv, claim }: { inv: Investigation; /** A claim, not a complaint: the footer must not say "your complaint". */ claim?: boolean }) {
  const lanes = ORDER.filter((l) => inv.items.some((x) => x.lane === l));
  return (
    <div className="space-y-5">
      {lanes.map((l) => (
        <div key={l}>
          <p className="text-[13px] font-medium text-ink-2">{LANE[l].title}</p>
          <ul className="mt-1 space-y-4">
            {inv.items
              .filter((x) => x.lane === l)
              .map((x) => (
                <li key={x.url + x.quote.slice(0, 30)}>
                  {x.why && <p className="text-[15px] leading-6 text-ink">{x.why}</p>}
                  <figure className="mt-1 border-l-2 border-line pl-4">
                    <blockquote className="font-serif text-[15px] leading-6 text-ink">&ldquo;{x.quote}&rdquo;</blockquote>
                    <figcaption className="mt-1 text-[12px] text-muted">
                      <a className="text-brand hover:underline" href={x.url} target="_blank" rel="noreferrer">
                        {x.publisher}
                        {x.title && x.title !== x.publisher ? `, ${x.title}` : ""} ↗
                      </a>
                      {x.fit === "partial" && <span> · related, not the same case</span>}
                      {x.stance === "against" && <span> · this went against the complainant</span>}
                    </figcaption>
                  </figure>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {inv.nothing.length > 0 && (
        <details open={!inv.items.length} className="text-[13px] leading-5 text-muted">
          <summary className="cursor-pointer">{inv.items.length ? "Not found: " : "Iona looked for "}{inv.nothing.map((n) => LANE[n.lane].none).join(", ")}</summary>
          <ul className="mt-2 space-y-1">
            {inv.nothing.map((n) => (
              <li key={n.lane}>
                <span className="text-ink-2">{LANE[n.lane].title}:</span> {n.note}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-[13px] leading-5 text-muted">
        {claim
          ? "Official pages only, each opened by Iona and checked word for word. Only your records and a solicitor can say how they apply to you."
          : "Official pages only, each opened by Iona and checked word for word. Your complaint cites at most two, and only those that back your side; only your records and the body itself can say how they apply to you."}
      </p>
    </div>
  );
}
