"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "./ui";

/**
 * Right-hand dock that shows the agent's browser live (D32). Mounted once in app/layout.tsx.
 * Hidden until a browser session starts; frames arrive as server-sent events from /api/live.
 * "Take control" forwards the user's clicks, scrolling and typing to the real page.
 */

type Frame = { type: "frame"; data: string; url: string; width: number; height: number };
type LiveMsg = Frame | { type: "end" } | { type: "idle" } | { type: "control"; enabled: boolean };
type Mode = "hidden" | "live" | "ended";

const DOCK_W = "min(46vw, 760px)";
const KEYS = new Set(["Enter", "Backspace", "Tab", "Escape", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", " "]);

const send = (body: unknown) =>
  fetch("/api/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});

export default function LiveView() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [open, setOpen] = useState(true);
  const [url, setUrl] = useState("");
  const [control, setControl] = useState(false);
  const [fps, setFps] = useState(0);
  const img = useRef<HTMLImageElement>(null);
  const size = useRef({ width: 1300, height: 900 });
  const frames = useRef(0);
  const lastSrc = useRef("");
  const modeRef = useRef<Mode>("hidden");

  useEffect(() => {
    const es = new EventSource("/api/live");
    es.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as LiveMsg;
      if (msg.type === "frame") {
        // Set the image directly instead of through state: 10-20 frames a second should not re-render React.
        lastSrc.current = `data:image/jpeg;base64,${msg.data}`;
        if (img.current) img.current.src = lastSrc.current;
        size.current = { width: msg.width, height: msg.height };
        frames.current++;
        setUrl((u) => (u === msg.url ? u : msg.url));
        if (modeRef.current !== "live") {
          modeRef.current = "live";
          setMode("live");
          setOpen(true);
        }
      } else if (msg.type === "end") {
        if (modeRef.current === "live") {
          modeRef.current = "ended";
          setMode("ended");
        }
        setControl(false);
      } else if (msg.type === "control") {
        setControl(msg.enabled);
      }
    };
    const t = setInterval(() => {
      setFps(frames.current);
      frames.current = 0;
    }, 1000);
    return () => {
      es.close();
      clearInterval(t);
    };
  }, []);

  // The <img> is not mounted while hidden: show the latest frame as soon as it is.
  useEffect(() => {
    if (img.current && lastSrc.current) img.current.src = lastSrc.current;
  }, [mode, open]);

  // Make room on the right so the dock does not cover the page.
  const docked = mode !== "hidden" && open;
  useEffect(() => {
    document.body.style.paddingRight = docked ? DOCK_W : "";
    return () => {
      document.body.style.paddingRight = "";
    };
  }, [docked]);

  /** Map a point on the image to CSS pixels in the remote page. */
  const toPage = useCallback((clientX: number, clientY: number) => {
    const r = img.current!.getBoundingClientRect();
    return {
      x: Math.round(((clientX - r.left) / r.width) * size.current.width),
      y: Math.round(((clientY - r.top) / r.height) * size.current.height),
    };
  }, []);

  // Wheel needs a non-passive listener so the app page does not scroll at the same time.
  useEffect(() => {
    const el = img.current;
    if (!el || !control || mode !== "live") return;
    let pending = { dx: 0, dy: 0, x: 0, y: 0 };
    let raf = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toPage(e.clientX, e.clientY);
      pending = { dx: pending.dx + e.deltaX, dy: pending.dy + e.deltaY, ...p };
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        void send({ type: "wheel", ...pending });
        pending = { dx: 0, dy: 0, x: 0, y: 0 };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(raf);
    };
  }, [control, mode, toPage]);

  const takeControl = () => {
    if (control) return setControl(false);
    const ok = window.confirm(
      "You will be clicking and typing in the real website.\n\nIf you press a Submit or Send button, it is sent for real. Only do that when you mean to.",
    );
    if (ok) {
      setControl(true);
      img.current?.focus();
    }
  };

  if (mode === "hidden") return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-ctl bg-night px-3 py-2 text-[13px] text-night-text"
      >
        <Dot live={mode === "live"} />
        {mode === "live" ? "Agent's browser is live" : "Agent's browser (closed)"}
      </button>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex flex-col border-l border-line bg-night text-night-text"
      style={{ width: DOCK_W }}
      aria-label="The agent's browser, live"
    >
      <div className="flex items-center gap-3 px-4 pt-3 pb-2">
        <Dot live={mode === "live"} />
        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-night-meta">
          {mode === "live" ? "Agent's browser · live" : "Browser closed"}
        </span>
        {mode === "live" && <span className="font-mono text-[11px] text-night-meta">{fps} fps</span>}
        <span className="flex-1" />
        <DockButton onClick={() => setOpen(false)} title="Hide the panel (the browser keeps running)">
          Hide
        </DockButton>
        {mode === "ended" && (
          <DockButton
            onClick={() => {
              modeRef.current = "hidden";
              setMode("hidden");
            }}
            title="Remove the panel"
          >
            Dismiss
          </DockButton>
        )}
      </div>

      <div className="mx-4 mb-3 flex items-center gap-2 rounded-ctl bg-white/5 px-3 py-1.5 font-mono text-[12px] text-night-text">
        <span className="truncate" title={url}>{url.replace(/^https?:\/\//, "") || "about:blank"}</span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-auto px-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- frames are data URLs replaced many times a second */}
        <img
          ref={img}
          alt="Live view of the page the agent is working on"
          tabIndex={control ? 0 : -1}
          draggable={false}
          className={cx(
            "block h-auto w-full select-none rounded-card bg-white outline-none",
            control ? "cursor-pointer ring-2 ring-brand" : "cursor-default",
            mode === "ended" && "opacity-50",
          )}
          onClick={(e) => {
            if (!control || mode !== "live") return;
            img.current?.focus();
            void send({ type: "click", ...toPage(e.clientX, e.clientY) });
          }}
          onKeyDown={(e) => {
            if (!control || mode !== "live" || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key.length === 1 && e.key !== " ") void send({ type: "text", text: e.key });
            else if (KEYS.has(e.key)) void send({ type: "key", key: e.key === " " ? "Space" : e.key });
            else return;
            e.preventDefault();
          }}
        />
      </div>

      <div className="flex items-center gap-2 border-t border-white/10 px-4 py-3">
        {mode === "live" ? (
          <>
            <DockButton onClick={takeControl} active={control}>
              {control ? "Stop controlling" : "Take control"}
            </DockButton>
            {control && <DockButton onClick={() => void send({ type: "back" })}>Back</DockButton>}
            <span className="flex-1 text-[12px] leading-5 text-night-meta">
              {control ? "Your clicks and typing go to the real page." : "Watching. The agent never presses Submit."}
            </span>
            <DockButton
              onClick={() => {
                if (window.confirm("Close the agent's browser? Anything not submitted is lost.")) void send({ type: "close" });
              }}
            >
              Close browser
            </DockButton>
          </>
        ) : (
          <span className="text-[12px] text-night-meta">The browser has closed. This is the last thing it showed.</span>
        )}
      </div>
    </aside>
  );
}

function Dot({ live }: { live: boolean }) {
  return (
    <span className="relative flex size-2">
      {live && <span className="absolute inline-flex size-full animate-ping rounded-full bg-teal opacity-75" />}
      <span className={cx("relative inline-flex size-2 rounded-full", live ? "bg-teal" : "bg-night-meta")} />
    </span>
  );
}

function DockButton({ active, className, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...rest}
      className={cx(
        "rounded-ctl border px-2.5 py-1 text-[12px] font-medium transition-colors",
        active ? "border-brand bg-brand text-white" : "border-white/15 text-night-text hover:bg-white/10",
        className,
      )}
    />
  );
}
