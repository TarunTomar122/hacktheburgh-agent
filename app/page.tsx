"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { OPENER, type ChatMessage } from "../lib/agent/chat";
import { emptyFacts, type CaseFacts } from "../lib/agent/facts";
import { createProfile } from "../lib/profile";

export default function Onboarding() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([OPENER]);
  const [facts, setFacts] = useState<CaseFacts>(emptyFacts());
  const [done, setDone] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking, done]);

  async function submit() {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    setError(null);
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setThinking(true);
    try {
      const res = await fetch("/api/agent/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next, facts }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setFacts(data.facts);
      setMessages([...next, { role: "agent", content: data.reply }]);
      setDone(data.done);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setMessages(messages); // roll back so they can resend
      setInput(text);
    } finally {
      setThinking(false);
    }
  }

  function start() {
    createProfile(facts, messages);
    router.push("/case");
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col">
      <header className="px-6 pt-8 pb-4">
        <h1 className="text-lg font-semibold">Let&apos;s start with you</h1>
        <p className="text-sm text-zinc-500">A few questions so we can prepare your case. Nothing is sent to the NHS yet.</p>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-2">
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm " +
                (m.role === "user" ? "bg-black text-white dark:bg-white dark:text-black" : "bg-zinc-100 dark:bg-zinc-900")
              }
            >
              {m.content}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-zinc-100 px-4 py-2 text-sm text-zinc-500 dark:bg-zinc-900">Thinking…</div>
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {done && (
          <div className="space-y-3 rounded-2xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <p className="font-medium">Here&apos;s what I have. You can change any of it later in your Profile.</p>
            <Row label="Name" value={[facts.title, facts.firstName, facts.lastName].filter(Boolean).join(" ")} />
            <Row label="Where it happened" value={facts.incidentLocation} />
            <Row label="What happened" value={facts.incidentSummary} />
            {facts.events.length > 0 && (
              <div>
                <div className="text-xs uppercase text-zinc-500">Timeline</div>
                <ul className="list-disc pl-5">
                  {facts.events.map((e, i) => (
                    <li key={i}>
                      <span className="font-medium">{e.date}:</span> {e.what}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Row label="What you'd like" value={facts.desiredOutcome} />
            <Row label="Contact" value={[facts.address, facts.postcode, facts.phone, facts.email].filter(Boolean).join(" · ")} />
            <Row label="Prefer to be contacted by" value={facts.preferredContact} />
            <button onClick={start} className="mt-2 rounded-md bg-black px-4 py-2 text-white dark:bg-white dark:text-black">
              Looks right, start my case
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!done && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
          className="flex gap-2 border-t border-zinc-200 p-4 dark:border-zinc-800"
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit();
              }
            }}
            rows={3}
            placeholder="Type your answer…"
            className="flex-1 resize-none rounded-md border border-zinc-300 bg-transparent p-2 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700"
          />
          <button
            type="submit"
            disabled={!input.trim() || thinking}
            className="self-end rounded-md bg-black px-4 py-2 text-sm text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            Send
          </button>
        </form>
      )}
    </main>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div>
      <div className="text-xs uppercase text-zinc-500">{label}</div>
      <div className="whitespace-pre-wrap">{value}</div>
    </div>
  );
}
