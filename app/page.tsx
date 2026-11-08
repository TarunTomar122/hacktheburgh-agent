"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { OPENER, type ChatMessage } from "../lib/agent/chat";
import { emptyFacts, type CaseFacts } from "../lib/agent/facts";
import { echoFor, HELP_ROUTES, inputFor, nextTarget, normaliseFacts, questionFor, patchFromAnswer, type HelpRoute, type InputSpec, type Target } from "../lib/agent/inputs";
import type { WidgetAnswer } from "../lib/agent/interview";
import { DEMO_PERSONAS, SAMPLE_FACTS, type DemoPersona } from "../lib/agent/sample";
import { createProfile, setTrack, startDemo } from "../lib/profile";
import { Stripes } from "./case/Header";
import AccountMenu, { useAccount } from "./AccountMenu";
import NameStep from "./NameStep";
import StageInput from "./StageInputs";
import ReviewEditor from "./ReviewEditor";
import { LogoLink } from "./ui";

// Dev shortcut. Hidden in production builds unless NEXT_PUBLIC_DEMO_SKIP=1.
// The order the questions come in (nextTarget in lib/agent/inputs.ts), for the progress bar.
const STEPS: Target[] = ["name", "story", "details", "contact", "outcome", "done"];

const SHOW_SKIP = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO_SKIP === "1";

export default function Onboarding() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([OPENER]);
  const account = useAccount();
  // The email they signed in with is the contact email, so it is not asked again (they can change it on the Profile tab).
  const [facts, setFacts] = useState<CaseFacts>(() => ({ ...emptyFacts(), email: account.email }));
  const [done, setDone] = useState(false);
  const [helpRoute, setHelpRoute] = useState<HelpRoute>();
  const [editing, setEditing] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSpec, setSpec] = useState<InputSpec>(() => inputFor("name", emptyFacts()));
  // Advance existing interviews past the removed question after a hot reload.
  const spec = savedSpec.target === "who" ? inputFor(nextTarget(normaliseFacts(facts)), normaliseFacts(facts)) : savedSpec;
  const [nameDraft, setNameDraft] = useState("");
  // It stays up while the first reply is on its way, so the opening question never flashes back as a second name question.
  const naming = !done && (messages.length === 1 || (thinking && spec.target === "name" && messages.length === 2));

  // The screen shows the latest question; while the next one loads, the old one stays up with the OK button busy.
  const question = savedSpec.target === "who" ? questionFor(spec.target, normaliseFacts(facts)) : [...messages].reverse().find((m) => m.role === "agent")?.content ?? OPENER.content;
  const agentCount = messages.filter((m) => m.role === "agent").length;
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
        body: JSON.stringify({ messages: next, facts, answer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setFacts(data.facts);
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

  /** Free text: the story, or a name typed as a sentence. The model reads it. */
  function onFree(text: string) {
    return run([...messages, { role: "user", content: text }]);
  }

  /** A form, button or checklist answered the open question. No model call; the user's choice is shown in the chat. */
  function onAnswer(answer: WidgetAnswer) {
    const route = spec.target === "outcome" && HELP_ROUTES.find((option) => option.value === answer.value);
    if (route) {
      return run([...messages, { role: "user", content: route.label }], answer).then((ok) => {
        if (ok) setHelpRoute(route.value);
        return ok;
      });
    }
    const echo = echoFor(spec.target, patchFromAnswer(spec.target, facts, answer));
    return run([...messages, { role: "user", content: echo }], answer);
  }

  /** Dev shortcut (D24): load a fictional persona with onboarding complete and go to the recommendation. It runs as a demo (D75): nothing is saved to the account. */
  function skipWith(p: DemoPersona) {
    startDemo(p.facts, p.messages, p.draft);
    router.push("/case");
  }

  function skipToOutcome() {
    const demoFacts = { ...SAMPLE_FACTS, desiredOutcome: null };
    setFacts(demoFacts);
    setSpec(inputFor("outcome", demoFacts));
    setError(null);
    setMessages([
      { role: "agent", content: "Fictional demo details loaded." },
      { role: "agent", content: questionFor("outcome", demoFacts) },
    ]);
  }

  function start() {
    createProfile(facts, messages);
    if (helpRoute === "formal") {
      setTrack({ chosen: "complaint", complaintMode: helpRoute });
    } else if (helpRoute === "compensation") {
      setTrack({ chosen: "compensation" });
    }
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
            {SHOW_SKIP && (
              <div className="flex shrink-0 items-center gap-2" aria-label="Developer shortcut: load a fictional demo patient">
                <span className="hidden text-[11px] text-white/70 md:inline">Try a demo:</span>
                {DEMO_PERSONAS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => skipWith(p)}
                    title={`Dev shortcut, fictional: ${p.name}. ${p.blurb}`}
                    className="rounded-ctl border border-dashed border-white/50 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:border-white hover:bg-white/10"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
            <AccountMenu />
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
            <>
              <NameStep value={nameDraft} onChange={setNameDraft} busy={thinking} error={error} onSubmit={onFree} />
              {SHOW_SKIP && (
                <button type="button" disabled={thinking} onClick={skipToOutcome} className="btn-ghost mb-6 self-start">
                  Demo: skip to final question
                </button>
              )}
            </>
          ) : done ? (
            <div className="fade-up my-auto space-y-5 py-10">
              <p className="eyebrow">Review your details</p>
              <h1 className="display text-[34px] sm:text-[42px]">
                {editing ? "Edit your details" : "Here is what I have."} <span className="text-muted">Check and correct anything before starting your case.</span>
              </h1>
              {editing ? <ReviewEditor facts={facts} onSave={(updated) => { setFacts(updated); setEditing(false); }} onCancel={() => setEditing(false)} /> : <>
              <div className="space-y-4 rounded-card border border-line bg-paper p-6 text-sm">
                <Row label="Name" value={[facts.title, facts.firstName, facts.lastName].filter(Boolean).join(" ")} />
                <Row label="Where you received care" value={facts.incidentLocation} />
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
                <Row label="How we can help" value={HELP_ROUTES.find((option) => option.value === helpRoute)?.label ?? null} />
                <Row label="Contact" value={[facts.address, facts.postcode, facts.phone, facts.email].filter(Boolean).join(" · ")} />
                <Row label="Prefer to be contacted by" value={facts.preferredContact} />
              </div>
              <div className="flex flex-wrap gap-3">
              <button onClick={() => setEditing(true)} className="btn-ghost !px-7 !py-3 !text-[15px]">Edit details</button>
              <button onClick={start} className="btn-primary !px-7 !py-3 !text-[15px]">
                Looks right, start my case
              </button>
              </div>
              </>}
            </div>
          ) : (
            <div key={`${spec.target}-${agentCount}`} className="fade-up my-auto py-10">
              {spec.kind !== "form" && <h1 className={"display mb-8 whitespace-pre-wrap " + (question.length > 110 ? "text-[26px] sm:text-[30px]" : "text-[32px] sm:text-[40px]")}>{question}</h1>}
              <StageInput spec={spec} busy={thinking} error={error} onFree={onFree} onAnswer={onAnswer} />
            </div>
          )}
        </div>
      </main>
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
