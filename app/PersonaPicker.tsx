"use client";

/**
 * "Try a persona": a modal with fictional patients from many places and stories. Choosing one loads a complete profile (the
 * same shape onboarding produces) so the real crew can run on it. Used in the onboarding header and in the Profile tab.
 * Library: lib/personas. Accessible: focus is trapped, Esc closes (or steps back on a phone), arrow keys move between cards.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CATEGORIES, GROUPS, gapsOf, matchesPersona, PERSONAS, type Persona, type PersonaGroup, type StoryCategory } from "../lib/personas";
import { CrewMark } from "./case/crew/Crew";
import { ArrowLeftIcon, cx } from "./ui";

/** One colour per region group, from the crew palette (globals.css tokens). */
const GROUP_COLOR: Record<PersonaGroup, string> = {
  UK: "var(--color-brand)",
  Europe: "var(--color-purple)",
  Americas: "var(--color-amber)",
  "Asia-Pacific": "var(--color-teal)",
  Africa: "var(--color-ink-2)",
};

const FIELD_NAMES: Record<string, string> = {
  complainingFor: "who the complaint is for",
  firstName: "first name",
  lastName: "last name",
  address: "address",
  postcode: "postcode",
  phone: "telephone number",
  email: "email address",
  incidentLocation: "where it happened",
  incidentSummary: "what happened",
  events: "a timeline",
};

const initials = (name: string) => {
  const parts = name.split(/\s+/);
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
};

const isWide = () => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function PersonaPicker({ onClose, onChoose, replacing }: { onClose: () => void; onChoose: (p: Persona) => void; replacing?: string }) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<PersonaGroup | null>(null);
  const [category, setCategory] = useState<StoryCategory | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const grid = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => PERSONAS.filter((p) => (!group || p.group === group) && (!category || p.category === category) && matchesPersona(p, query)), [query, group, category]);
  // A persona the filters have hidden is not kept in the preview: the button would name someone not in the list.
  const selected = shown.find((p) => p.id === selectedId) ?? null;
  const filtered = !!(query || group || category);
  // Only categories that exist, in the library's order.
  const categories = useMemo(() => CATEGORIES.filter((c) => PERSONAS.some((p) => p.category === c)), []);

  // Focus in on open, back to the opener on close; the page behind does not scroll.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    (isWide() ? search.current : panel.current)?.focus();
    return () => {
      document.body.style.overflow = overflow;
      opener?.focus?.();
    };
  }, []);

  function back() {
    const id = selectedId;
    setSelectedId(null);
    if (id) requestAnimationFrame(() => grid.current?.querySelector<HTMLElement>(`[data-persona="${id}"]`)?.focus());
  }

  function pick(p: Persona) {
    setSelectedId(p.id);
    // On a phone the preview replaces the list: move focus into it so the screen reader follows.
    if (!isWide()) requestAnimationFrame(() => previewRef.current?.focus());
  }

  function onPanelKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (selectedId && !isWide()) back();
      else onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const items = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  /** Arrow keys move between cards (up and down by a row, as many cards as there are columns). */
  function onGridKey(e: KeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(e.key) || !grid.current) return;
    const cards = [...grid.current.querySelectorAll<HTMLElement>("[data-persona]")];
    const at = cards.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    const cols = getComputedStyle(grid.current).gridTemplateColumns.split(" ").length || 1;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols, Home: -at, End: cards.length }[e.key] ?? 0;
    const to = e.key === "End" ? cards.length - 1 : Math.min(cards.length - 1, Math.max(0, at + step));
    e.preventDefault();
    cards[to]?.focus();
  }

  const surprise = () => {
    const pool = shown.length ? shown : PERSONAS;
    pick(pool[crypto.getRandomValues(new Uint32Array(1))[0] % pool.length]);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-ink/45 backdrop-blur-[2px] sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="persona-title"
        tabIndex={-1}
        onKeyDown={onPanelKey}
        className="fade-up flex h-full w-full max-w-[1120px] flex-col overflow-hidden bg-white outline-none sm:h-[min(780px,100%)] sm:rounded-card sm:shadow-[0_24px_80px_-12px_rgb(0_0_0/0.35)]"
      >
        {/* Title: always on a wide screen; on a phone it gives way to the preview. */}
        <header className={cx("flex shrink-0 items-start justify-between gap-6 border-b border-line px-5 pb-4 pt-4 sm:px-8 sm:pt-5", selected && "max-lg:hidden")}>
          <div className="space-y-1">
            <h2 id="persona-title" className="display text-[28px] sm:text-[30px]">
              Try a persona
            </h2>
            <p className="max-w-[90ch] text-sm leading-6 text-ink-2">Fictional patients from different places and stories. Pick one and the real crew works on their case, live.</p>
          </div>
          <CloseButton onClick={onClose} />
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Browse */}
          <section aria-label="Personas" className={cx("flex min-h-0 min-w-0 flex-1 flex-col", selected && "max-lg:hidden")}>
            <div className="shrink-0 space-y-3 px-5 pb-3 pt-4 sm:px-8">
              <label className="relative block">
                <span className="sr-only">Search personas</span>
                <SearchIcon />
                <input
                  ref={search}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      grid.current?.querySelector<HTMLElement>("[data-persona]")?.focus();
                    }
                  }}
                  placeholder="Search by name, place or story"
                  className="field !pl-10"
                  autoComplete="off"
                />
              </label>
              <ChipRow label="Where">
                <Chip active={!group} onClick={() => setGroup(null)}>
                  All
                </Chip>
                {GROUPS.map((g) => (
                  <Chip key={g} active={group === g} onClick={() => setGroup(group === g ? null : g)}>
                    {g}
                  </Chip>
                ))}
              </ChipRow>
              <ChipRow label="Story">
                <Chip active={!category} onClick={() => setCategory(null)}>
                  All
                </Chip>
                {categories.map((c) => (
                  <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>
                    {c}
                  </Chip>
                ))}
              </ChipRow>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-1 sm:px-8">
              <p aria-live="polite" className="mb-3 flex items-center gap-3 text-[13px] text-muted">
                {shown.length} {shown.length === 1 ? "persona" : "personas"}
                {filtered && (
                  <button
                    onClick={() => {
                      setQuery("");
                      setGroup(null);
                      setCategory(null);
                    }}
                    className="font-medium text-brand hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </p>
              {shown.length === 0 ? (
                <div className="rounded-card border border-dashed border-line px-6 py-14 text-center text-sm text-ink-2">No persona matches that. Try another word, or clear the filters.</div>
              ) : (
                <div ref={grid} role="group" aria-label="Personas" onKeyDown={onGridKey} className="grid gap-3 sm:grid-cols-2">
                  {shown.map((p, i) => (
                    <PersonaCard key={p.id} p={p} selected={p.id === selectedId} tabbable={selectedId ? p.id === selectedId : i === 0} onPick={() => pick(p)} />
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Preview */}
          <aside
            aria-label="Persona preview"
            className={cx("flex min-h-0 w-full shrink-0 flex-col bg-paper lg:w-[380px] lg:border-l lg:border-line", !selected && "max-lg:hidden")}
          >
            {selected ? (
              <Preview key={selected.id} p={selected} replacing={replacing} previewRef={previewRef} onBack={back} onClose={onClose} onStart={() => onChoose(selected)} />
            ) : (
              <div className="m-auto max-w-[260px] space-y-4 px-6 text-center">
                <CrewMark id="elliot" size={48} className="mx-auto" />
                <p className="text-sm leading-6 text-ink-2">Pick someone to see their story, then start as them.</p>
                <button onClick={surprise} className="text-sm font-medium text-brand hover:underline">
                  Pick one for me
                </button>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ---------- pieces ---------- */

function PersonaCard({ p, selected, tabbable, onPick }: { p: Persona; selected: boolean; tabbable: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      data-persona={p.id}
      aria-pressed={selected}
      tabIndex={tabbable ? 0 : -1}
      onClick={onPick}
      className={cx(
        "group flex flex-col gap-3 rounded-card border bg-white p-4 text-left transition-[border-color,box-shadow] outline-none",
        selected ? "border-brand shadow-[0_0_0_4px_var(--color-brand-soft)]" : "border-line hover:border-faint focus-visible:border-brand focus-visible:shadow-[0_0_0_4px_var(--color-brand-soft)]",
      )}
    >
      <span className="flex items-center gap-3">
        <Tile p={p} />
        <span className="min-w-0">
          <span className="block text-[15px] font-medium text-ink">{p.name}</span>
          <span className="block text-[13px] text-muted">{p.place}</span>
        </span>
      </span>
      <span className="text-[13px] leading-5 text-ink-2">{p.blurb}</span>
      <span className="mt-auto text-[12px] font-medium leading-4" style={{ color: GROUP_COLOR[p.group] }}>
        {p.tests}
      </span>
    </button>
  );
}

function Tile({ p, size = 40 }: { p: Persona; size?: number }) {
  const c = GROUP_COLOR[p.group];
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center rounded-[5px] text-[13px] font-semibold"
      style={{ width: size, height: size, background: `color-mix(in srgb, ${c} 12%, white)`, color: c, fontSize: size > 44 ? 16 : 13 }}
    >
      {initials(p.name)}
    </span>
  );
}

function Preview({ p, replacing, previewRef, onBack, onClose, onStart }: { p: Persona; replacing?: string; previewRef: React.RefObject<HTMLDivElement | null>; onBack: () => void; onClose: () => void; onStart: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const f = p.facts;
  const gaps = gapsOf(p).map((k) => FIELD_NAMES[k] ?? k);

  return (
    <>
      <div className="flex shrink-0 items-center justify-between px-4 pt-3 lg:hidden">
        <button onClick={onBack} className="inline-flex items-center gap-2 rounded-ctl px-2 py-2 text-sm font-medium text-brand hover:bg-brand-soft">
          <ArrowLeftIcon /> All personas
        </button>
        <CloseButton onClick={onClose} />
      </div>

      <div ref={previewRef} tabIndex={-1} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-4 pt-5 outline-none lg:pt-8">
        <div className="flex items-center gap-4">
          <Tile p={p} size={52} />
          <div className="min-w-0">
            <h3 className="display text-[26px] leading-tight">{p.name}</h3>
            <p className="text-[13px] text-muted">{p.place}</p>
          </div>
        </div>

        <p className="text-[15px] leading-6 text-ink">{p.blurb}</p>

        <div className="flex flex-wrap gap-2">
          <Pill>{p.category}</Pill>
          <Pill color={GROUP_COLOR[p.group]}>{p.tests}</Pill>
        </div>

        <dl className="space-y-4 text-sm">
          <Item label="Treated at">{f.incidentLocation}</Item>
          <Item label="Timeline">
            <ul className="space-y-2">
              {f.events.map((e, i) => (
                <li key={i} className="leading-5">
                  <span className="font-medium text-ink">{e.date}</span> <span className="text-ink-2">{e.what}</span>
                </li>
              ))}
            </ul>
          </Item>
          <Item label="Would like">
            <span className="text-ink-2">{f.desiredOutcome}</span>
          </Item>
        </dl>

        {gaps.length > 0 && (
          <p className="rounded-card border border-amber/30 bg-amber-soft px-4 py-3 text-[13px] leading-5 text-ink">
            <span className="font-medium">Left out on purpose:</span> {gaps.join(", ")}. The crew will have to ask for it.
          </p>
        )}
        {f.complainingFor === "someone_else" && <p className="text-[13px] leading-5 text-ink-2">The complaint is made on behalf of someone else.</p>}
      </div>

      <div className="shrink-0 space-y-3 border-t border-line bg-white px-6 py-4">
        {confirming ? (
          <div role="alertdialog" aria-label="Replace your case" className="space-y-3">
            <p className="text-[13px] leading-5 text-ink">
              This replaces the case for <span className="font-medium">{replacing}</span> on this device, including its progress. It cannot be undone.
            </p>
            <div className="flex gap-2">
              <button onClick={onStart} autoFocus className="btn-primary flex-1 !px-4 !py-2.5">
                Replace and start as {p.facts.firstName}
              </button>
              <button onClick={() => setConfirming(false)} className="rounded-ctl border border-line px-4 text-sm font-medium text-ink hover:border-faint">
                Keep mine
              </button>
            </div>
          </div>
        ) : (
          <>
            <button onClick={replacing ? () => setConfirming(true) : onStart} className="btn-primary w-full !py-3">
              Start as {p.name}
            </button>
            <p className="flex items-center gap-2 text-[12px] leading-4 text-muted">
              <CrewMark id="elliot" size={20} />
              {replacing ? `Replaces ${replacing}'s case.` : "Opens a case on this device."} The real crew runs, live. Nothing is sent.
            </p>
          </>
        )}
      </div>
    </>
  );
}

function Pill({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="rounded-full border px-2.5 py-1 text-[12px] font-medium leading-4"
      style={color ? { color, borderColor: `color-mix(in srgb, ${color} 30%, white)`, background: `color-mix(in srgb, ${color} 8%, white)` } : { color: "var(--color-ink-2)", borderColor: "var(--color-line)", background: "white" }}
    >
      {children}
    </span>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  if (!children) return null;
  return (
    <div className="space-y-1">
      <dt className="eyebrow">{label}</dt>
      <dd className="text-ink">{children}</dd>
    </div>
  );
}

function ChipRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-3">
      <span className="eyebrow w-11 shrink-0">{label}</span>
      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto px-1 py-1 [mask-image:linear-gradient(to_right,transparent,#000_8px,#000_calc(100%-28px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[13px] font-medium transition-colors outline-none focus-visible:ring-4 focus-visible:ring-brand-soft",
        active ? "border-brand bg-brand text-white" : "border-line bg-white text-ink-2 hover:border-faint hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Close" className="-mr-2 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-brand">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
      </svg>
    </button>
  );
}

function SearchIcon() {
  return (
    <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}
