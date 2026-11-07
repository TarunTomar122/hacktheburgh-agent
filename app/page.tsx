"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { getNextQuestion } from "../lib/onboarding";
import { saveProfile, type Answer } from "../lib/profile";

type Msg = { role: "agent" | "user"; text: string };
type Phase = "name" | "story" | "followup" | "review";

export default function Onboarding() {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>([
    { role: "agent", text: "Hi, I'm here to help you work out what to do next. First, what should I call you?" },
  ]);
  const [phase, setPhase] = useState<Phase>("name");
  const [name, setName] = useState("");
  const [story, setStory] = useState("");
  const [followUps, setFollowUps] = useState<Answer[]>([]);
  const [current, setCurrent] = useState<{ id: string; label: string; question: string } | null>(null);
  const [thinking, setThinking] = useState(false);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, thinking, phase]);

  async function askNext(nextFollowUps: Answer[], n = name, s = story) {
    setThinking(true);
    const next = await getNextQuestion({ name: n, story: s, followUps: nextFollowUps });
    setThinking(false);
    if (next.done) {
      setCurrent(null);
      setMsgs((m) => [...m, { role: "agent", text: "Thanks, I think I have what I need. Here's what I've got. Have a look and correct anything that's wrong." }]);
      setPhase("review");
    } else {
      setCurrent(next);
      setMsgs((m) => [...m, { role: "agent", text: next.question }]);
      setPhase("followup");
    }
  }

  async function submit() {
    const text = input.trim();
    if (!text || thinking) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", text }]);

    if (phase === "name") {
      setName(text);
      setMsgs((m) => [...m, { role: "agent", text: `Nice to meet you, ${text}. In simple words, what happened?` }]);
      setPhase("story");
    } else if (phase === "story") {
      setStory(text);
      await askNext([], name, text);
    } else if (phase === "followup" && current) {
      const next = [...followUps, { ...current, answer: text }];
      setFollowUps(next);
      await askNext(next);
    }
  }

  function start() {
    saveProfile({ name, story, followUps, createdAt: new Date().toISOString() });
    router.push("/case");
  }

  return (
    <main className="mx-auto flex h-screen max-w-2xl flex-col">
      <header className="px-6 pt-8 pb-4">
        <h1 className="text-lg font-semibold">Let&apos;s start with you</h1>
        <p className="text-sm text-zinc-500">A few questions so we can prepare your case. Nothing is sent anywhere.</p>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-6 py-2">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm " +
                (m.role === "user"
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "bg-zinc-100 dark:bg-zinc-900")
              }
            >
              {m.text}
            </div>
          </div>
        ))}

        {thinking && (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-zinc-100 px-4 py-2 text-sm text-zinc-500 dark:bg-zinc-900">Thinking…</div>
          </div>
        )}

        {phase === "review" && (
          <div className="space-y-3 rounded-2xl border border-zinc-200 p-4 text-sm dark:border-zinc-800">
            <div>
              <div className="text-xs uppercase text-zinc-500">Name</div>
              <div>{name}</div>
            </div>
            <div>
              <div className="text-xs uppercase text-zinc-500">What happened</div>
              <div className="whitespace-pre-wrap">{story}</div>
            </div>
            {followUps.map((a) => (
              <div key={a.id}>
                <div className="text-xs uppercase text-zinc-500">{a.label}</div>
                <div className="whitespace-pre-wrap">{a.answer}</div>
              </div>
            ))}
            <button
              onClick={start}
              className="mt-2 rounded-md bg-black px-4 py-2 text-white dark:bg-white dark:text-black"
            >
              Looks right, start my case
            </button>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {phase !== "review" && (
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
            rows={phase === "name" ? 1 : 3}
            placeholder={phase === "name" ? "Your name" : "Type your answer…"}
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
