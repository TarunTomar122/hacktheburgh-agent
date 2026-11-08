"use client";

import { useEffect, useRef } from "react";
import type { CrewId } from "../../lib/agent/plannerTypes";
import { CrewMark } from "./crew/Crew";

/**
 * A step that starts by itself the first time the patient reaches it: a short "Starting" screen with the crew, then the
 * run. Once per case and step (`id`): coming back later, or a reload, shows the step's own start screen instead.
 */
export const autoStarted = (id: string) => typeof window !== "undefined" && !!localStorage.getItem(`autostart:${id}`);

export default function AutoStart({ id, title, line, crew, onStart, delayMs = 1800 }: { id: string; title: string; line: string; crew: CrewId[]; onStart: () => void; delayMs?: number }) {
  const mounted = useRef(false);
  const begun = useRef(false);
  const go = useRef(onStart);
  useEffect(() => {
    go.current = onStart;
  });
  useEffect(() => {
    mounted.current = true;
    if (!begun.current) {
      begun.current = true;
      localStorage.setItem(`autostart:${id}`, "1");
      // Not cleared by React's development double mount: once begun, the start happens unless the screen has gone.
      setTimeout(() => {
        if (mounted.current) go.current();
      }, delayMs);
    }
    return () => {
      mounted.current = false;
    };
  }, [id, delayMs]);
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center gap-6 py-10 text-center" role="status" aria-live="polite">
      <div className="flex items-end gap-4">
        {crew.map((c, i) => (
          <span key={c} className="animate-bounce" style={{ animationDelay: `${i * 120}ms`, animationDuration: "1.2s" }}>
            <CrewMark id={c} size={c === "elliot" ? 72 : 56} />
          </span>
        ))}
      </div>
      <h1 className="display text-[36px] text-ink">{title}</h1>
      <p className="text-[15px] text-ink-2">{line}</p>
    </div>
  );
}
