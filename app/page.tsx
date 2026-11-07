"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { OPENER, type ChatMessage } from "../lib/agent/chat";
import { emptyFacts, type CaseFacts } from "../lib/agent/facts";
import { echoFor, inputFor, patchFromAnswer, type InputSpec } from "../lib/agent/inputs";
import type { WidgetAnswer } from "../lib/agent/interview";
import { SAMPLE_DRAFT, SAMPLE_FACTS, SAMPLE_MESSAGES } from "../lib/agent/sample";
import { createProfile } from "../lib/profile";
import InputPanel from "./InputPanel";

// Dev shortcut. Hidden in production builds unless NEXT_PUBLIC_DEMO_SKIP=1.
const SHOW_SKIP = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_DEMO_SKIP === "1";

export default function Onboarding() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([OPENER]);
  const [facts, setFacts] = useState<CaseFacts>(emptyFacts());
  const [done, setDone] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spec, setSpec] = useState<InputSpec>(() => inputFor("name", emptyFacts()));
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking, done]);

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
    const echo = echoFor(spec.target, patchFromAnswer(spec.target, facts, answer));
    return run([...messages, { role: "user", content: echo }], answer);
  }

  function skipWithDemoPatient() {
    createProfile(SAMPLE_FACTS, SAMPLE_MESSAGES, SAMPLE_DRAFT);
    router.push("/case");
  }

  function start() {
    createProfile(facts, messages);
    router.push("/case");
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col">
      <header className="flex items-start justify-between gap-4 px-6 pt-8 pb-4">
        <div>
          <div className="eyebrow mb-3">Case helper</div>
          <h1 className="display text-4xl">
            Let&apos;s start with <span className="hl-blue">you</span>
          </h1>
          <p className="mt-3 text-sm text-muted">A few questions so we can prepare your case. Nothing is sent to the NHS yet.</p>
        </div>
        {SHOW_SKIP && (
          <button
            onClick={skipWithDemoPatient}
            title="Dev shortcut: skips the interview and loads a fictional patient with a ready-made draft"
            className="btn-ghost shrink-0 border-dashed !px-3 !py-1.5 !text-xs"
          >
            Skip: use demo patient
          </button>
        )}
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm " +
                (m.role === "user" ? "bg-brand text-white" : "bg-mist text-body")
              }
            >
              {m.content}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-mist px-4 py-2 text-sm text-muted">Thinking…</div>
          </div>
        )}
        {error && spec.kind !== "form" && <p className="text-sm text-danger">{error}</p>}

        {done && (
          <div className="space-y-3 rounded-2xl border border-hairline bg-cream p-5 text-sm">
            <p className="display text-xl">
              Here&apos;s what I have. <span className="text-muted">You can change any of it later in your Profile.</span>
            </p>
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
            <button onClick={start} className="btn-primary mt-2">
              Looks right, start my case
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!done && (
        <InputPanel
          key={`${spec.target}-${messages.filter((m) => m.role === "agent").length}`}
          spec={spec}
          busy={thinking}
          error={error}
          onFree={onFree}
          onAnswer={onAnswer}
        />
      )}
    </main>
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
