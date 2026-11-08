"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { OPENER, type ChatMessage } from "../lib/agent/chat";
import { emptyFacts, type CaseFacts } from "../lib/agent/facts";
import { echoFor, inputFor, patchFromAnswer, placeLine, type InputSpec, type Target } from "../lib/agent/inputs";
import type { Place } from "../lib/agent/routeTypes";
import type { WidgetAnswer } from "../lib/agent/interview";
import { PERSONA_PICKER_ENABLED, type Persona } from "../lib/personas";
import { createProfile } from "../lib/profile";
import { Stripes } from "./case/Header";
import NameStep from "./NameStep";
import PersonaPicker from "./PersonaPicker";
import StageInput from "./StageInputs";
import { ArrowLeftIcon, LogoLink } from "./ui";

// The order the questions come in (nextTarget in lib/agent/inputs.ts), for the progress bar.
const STEPS: Target[] = ["name", "story", "details", "who", "contact", "outcome", "done"];

/** Where the care was, as far as onboarding knows it. Detected by the model, or typed by the user to correct it. */
type Where = { city: string; country: string; region: string; fixed: boolean };

// Dev and demo shortcut: the persona picker. Hidden in production builds unless NEXT_PUBLIC_DEMO_SKIP=1 (see lib/personas).
const SHOW_SKIP = PERSONA_PICKER_ENABLED;

export default function Onboarding() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([OPENER]);
  const [facts, setFacts] = useState<CaseFacts>(emptyFacts());
  const [done, setDone] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<InputSpec>(() => inputFor("name", emptyFacts()));
  const [nameDraft, setNameDraft] = useState("");
  // The place lives here, not in `facts`, so a reply that was on its way while it was found cannot wipe it.
  const [where, setWhere] = useState<Where | null>(null);
  const [placeBusy, setPlaceBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const whereRef = useRef<Where | null>(null);
  const detected = useRef(new Set<string>());
  const withPlace = (f: CaseFacts): CaseFacts => (where ? { ...f, country: where.country || null, region: where.region || null } : f);
  const full = withPlace(facts);
  // It stays up while the first reply is on its way, so the opening question never flashes back as a second name question.
  const naming = !done && (messages.length === 1 || (thinking && spec.target === "name" && messages.length === 2));

  // The screen shows the latest question; while the next one loads, the old one stays up with the OK button busy.
  const question = [...messages].reverse().find((m) => m.role === "agent")?.content ?? OPENER.content;
  const agentCount = messages.filter((m) => m.role === "agent").length;
  // The contact form follows the place even if it was found after the form arrived (UK postcode and phone rules only for the UK).
  const view = spec.kind === "form" && spec.target === "contact" ? inputFor("contact", full) : spec;
  const pct = Math.round(((STEPS.indexOf(spec.target) + 1) / STEPS.length) * 100);

  /** Sends the conversation (and, for a form or button, the widget's answer). Returns false if it failed, so the panel keeps what was typed. */
  async function run(next: ChatMessage[], answer?: WidgetAnswer): Promise<boolean> {
    if (thinking) return false;
    setError(null);
    setMessages(next);
    setThinking(true);
    try {
      const res = await fetch("/api/agent/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next, facts: full, answer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setFacts(data.facts);
      detectPlace(data.facts);
      setSpec(data.input);
      setMessages([...next, { role: "agent", content: data.reply }]);
      setDone(data.done);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages(messages); // roll back so they can resend
      return false;
    } finally {
      setThinking(false);
    }
  }

  /**
   * Works out the place in the background (no waiting on screen): once from the story and where the care was, so the contact
   * questions know whether UK postcode and phone rules apply, and again once the address is known. A place the user corrected is kept.
   */
  function detectPlace(f: CaseFacts) {
    const key = f.address ? "address" : f.incidentSummary && f.incidentLocation ? "story" : null;
    if (!key || detected.current.has(key) || whereRef.current?.fixed) return;
    detected.current.add(key);
    setPlaceBusy(true);
    fetch("/api/agent/place", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ facts: f }) })
      .then(async (r) => {
        const p = (await r.json()) as Place & { error?: string };
        if (!r.ok || whereRef.current?.fixed) return;
        // An empty answer never replaces one we already have.
        if (p.country || !whereRef.current) savePlace({ city: p.city, country: p.country, region: p.region, fixed: false });
      })
      .catch(() => {})
      .finally(() => setPlaceBusy(false));
  }

  function savePlace(w: Where) {
    whereRef.current = w;
    setWhere(w);
  }

  /** Free text: the story, or a name typed as a sentence. The model reads it. */
  function onFree(text: string) {
    return run([...messages, { role: "user", content: text }]);
  }

  /** A form, button or checklist answered the open question. No model call; the user's choice is shown in the chat. */
  function onAnswer(answer: WidgetAnswer) {
    const echo = echoFor(spec.target, patchFromAnswer(spec.target, facts, answer));
    return run([...messages, { role: "user", content: echo }], answer);
  }

  /** Dev shortcut (D24): load a fictional persona with onboarding complete and go to the case, where the real crew runs. */
  function skipWith(p: Persona) {
    createProfile(p.facts, p.messages, p.draft);
    router.push("/case");
  }

  function start() {
    createProfile(full, messages);
    router.push("/case");
  }

  return (
    <div className="flex h-dvh flex-col">
      <div className="shrink-0">
        <header className="flex h-16 items-center justify-between bg-brand px-6 text-white sm:px-8">
          <div className="flex items-center gap-6">
            <LogoLink />
            <span className="hidden h-7 w-px bg-white/30 sm:block" aria-hidden />
            <div className="hidden leading-tight sm:block">
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-white/70">{facts.firstName ? "Case for" : "Getting started"}</div>
              <div className="text-sm font-medium">{[facts.firstName, facts.lastName].filter(Boolean).join(" ") || "Preparing your case"}</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-white/85 transition-colors hover:text-white">
              <ArrowLeftIcon />
              Home
            </Link>
          {SHOW_SKIP && (
            <button
              onClick={() => setPicking(true)}
              aria-haspopup="dialog"
              title="Dev shortcut: load a fictional patient from another place and story"
              className="inline-flex shrink-0 items-center gap-2 rounded-ctl border border-dashed border-white/50 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white hover:bg-white/10"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="8" cy="5.5" r="2.7" />
                <path d="M2.5 14c.6-2.7 2.6-4 5.5-4s4.9 1.3 5.5 4" />
              </svg>
              Try a persona
            </button>
          )}
          </div>
        </header>
        <Stripes />
      </div>

      {!naming && !done && (
        <div className="h-1 shrink-0 bg-line-soft" role="progressbar" aria-label="Progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="h-full bg-brand transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>
      )}

      <main className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col px-6">
          {naming ? (
            <NameStep value={nameDraft} onChange={setNameDraft} busy={thinking} error={error} onSubmit={onFree} />
          ) : done ? (
            <div className="fade-up my-auto space-y-5 py-10">
              <p className="eyebrow">All done</p>
              <h1 className="display text-[34px] sm:text-[42px]">
                Here is what I have. <span className="text-muted">You can change any of it later in your Profile.</span>
              </h1>
              <PlaceConfirm where={where} busy={placeBusy} onSave={savePlace} />
              <div className="space-y-4 rounded-card border border-line bg-paper p-6 text-sm">
                <Row label="Name" value={[facts.title, facts.firstName, facts.lastName].filter(Boolean).join(" ")} />
                <Row label="Where it happened" value={facts.incidentLocation} />
                <Row label="What happened" value={facts.incidentSummary} />
                {facts.events.length > 0 && (
                  <div>
                    <div className="eyebrow">Timeline</div>
                    <ul className="list-disc pl-5">
                      {facts.events.map((e, i) => (
                        <li key={i}>
                          <span className="font-medium text-ink">{e.date}:</span> {e.what}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <Row label="What you'd like" value={facts.desiredOutcome} />
                <Row label="Contact" value={[facts.address, facts.postcode, facts.phone, facts.email].filter(Boolean).join(" · ")} />
                <Row label="Prefer to be contacted by" value={facts.preferredContact} />
              </div>
              <button onClick={start} disabled={placeBusy} className="btn-primary !px-7 !py-3 !text-[15px]">
                {placeBusy ? "One moment…" : "Looks right, start my case"}
              </button>
            </div>
          ) : (
            <div key={`${spec.target}-${agentCount}`} className="fade-up my-auto py-10">
              <h1 className={"display mb-8 whitespace-pre-wrap " + (question.length > 110 ? "text-[26px] sm:text-[30px]" : "text-[32px] sm:text-[40px]")}>{question}</h1>
              <StageInput spec={view} busy={thinking} error={error} onFree={onFree} onAnswer={onAnswer} />
            </div>
          )}
        </div>
      </main>
      {picking && <PersonaPicker onClose={() => setPicking(false)} onChoose={skipWith} />}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="whitespace-pre-wrap">{value}</div>
    </div>
  );
}

/** One calm line saying where the care was and whose rules apply, with a way to correct it (country and region, both free text). */
function PlaceConfirm({ where, busy, onSave }: { where: Where | null; busy: boolean; onSave: (w: Where) => void }) {
  const [editing, setEditing] = useState(false);
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");
  const line = where ? placeLine(where) : null;

  if (busy && !editing) return <p className="text-[15px] text-muted">Working out where your care was…</p>;
  if (!editing) {
    return (
      <p className="text-[15px] leading-6 text-ink-2">
        {line ?? "I could not tell which country your care was in."}{" "}
        <button
          type="button"
          className="font-medium text-brand hover:underline"
          onClick={() => {
            setCountry(where?.country ?? "");
            setRegion(where?.region ?? "");
            setEditing(true);
          }}
        >
          {line ? "Not right?" : "Add it"}
        </button>
      </p>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!country.trim()) return;
        const sameCountry = country.trim().toLowerCase() === (where?.country ?? "").toLowerCase();
        // A different country makes the detected city meaningless, so it is dropped.
        onSave({ city: sameCountry ? (where?.city ?? "") : "", country: country.trim(), region: region.trim(), fixed: true });
        setEditing(false);
      }}
    >
      <p className="text-[15px] text-ink-2">Where was your care?</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="eyebrow block">Country</span>
          <input autoFocus className="field" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="For example, Ireland" />
        </label>
        <label className="space-y-1">
          <span className="eyebrow block">Region or state (if it matters)</span>
          <input className="field" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="For example, Wales" />
        </label>
      </div>
      <div className="flex items-center gap-4">
        <button type="submit" disabled={!country.trim()} className="btn-primary">
          Save
        </button>
        <button type="button" onClick={() => setEditing(false)} className="text-[13px] font-medium text-brand hover:underline">
          Cancel
        </button>
      </div>
    </form>
  );
}
