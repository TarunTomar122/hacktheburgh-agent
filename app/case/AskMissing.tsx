"use client";

import { useState } from "react";
import { echoFor, inputFor, nextTarget, patchFromAnswer, questionFor } from "../../lib/agent/inputs";
import type { WidgetAnswer } from "../../lib/agent/interview";
import { addMessages, updateFacts, type Profile } from "../../lib/profile";
import InputPanel from "../InputPanel";
import { Eyebrow } from "../ui";

/**
 * Asks only what onboarding did not capture, one thing at a time, with the same inputs as onboarding (Om's InputPanel).
 * Renders nothing when everything is known. Used by every step instead of a form (D33).
 */
export default function AskMissing({ profile, why }: { profile: Profile; why: string }) {
  const f = profile.facts;
  const target = nextTarget(f);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (target === "done") return null;
  const spec = inputFor(target, f);

  async function send(userText: string, answer?: WidgetAnswer): Promise<boolean> {
    setBusy(true);
    setError(null);
    const messages = [...profile.messages, { role: "agent" as const, content: questionFor(target, f) }, { role: "user" as const, content: userText }];
    try {
      const res = await fetch("/api/agent/interview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages, facts: f, answer }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      addMessages(messages.slice(profile.messages.length));
      updateFacts(data.facts);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-card border border-brand/30 bg-white">
      <div className="space-y-1 bg-brand-soft/60 px-6 py-4">
        <Eyebrow className="text-brand">One thing we still need</Eyebrow>
        <p className="text-[15px] leading-6 text-ink">{questionFor(target, f)}</p>
        <p className="text-xs text-muted">{why}</p>
      </div>
      <InputPanel
        key={target}
        spec={spec}
        busy={busy}
        error={error}
        onFree={(text) => send(text)}
        onAnswer={(answer) => send(echoFor(target, patchFromAnswer(target, f, answer)), answer)}
      />
    </section>
  );
}
