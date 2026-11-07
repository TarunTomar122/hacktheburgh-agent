"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, cx } from "./ui";

/**
 * Right-hand panel that shows the agent's browser live (D32). Mounted once in app/layout.tsx.
 * Hidden until a browser session starts; frames arrive as server-sent events from /api/live.
 * The panel reports its size, and the server sizes the remote page to match, so the page fills it edge to edge.
 * "Take control" forwards the user's clicks, scrolling and typing to the real page.
 */

type Frame = { type: "frame"; data: string; url: string; width: number; height: number };
type LiveMsg = Frame | { type: "end" } | { type: "idle" } | { type: "control"; enabled: boolean };
type Mode = "hidden" | "live" | "ended";

const MIN_W = 360;
const defaultWidth = () => Math.round(Math.min(window.innerWidth * 0.48, 820));
const clampWidth = (w: number) => Math.round(Math.max(MIN_W, Math.min(w, window.innerWidth - MIN_W)));
const KEYS = new Set(["Enter", "Backspace", "Tab", "Escape", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", " "]);

const send = (body: unknown) =>
  fetch("/api/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});

/** Clicks and keys must reach the page in the order they happened, so they are chained. */
let chain: Promise<unknown> = Promise.resolve();
const sendOrdered = (body: unknown) => {
  chain = chain.then(() => send(body));
};

/**
 * Scrolling and hovering fire dozens of events a second. Keep at most one request in flight and merge
 * everything that happens meanwhile (wheel deltas add up, the newest mouse position wins), so input
 * never queues up behind itself.
 */
function wheelSender() {
  let busy = false;
  let pending: { x: number; y: number; dx: number; dy: number } | null = null;
  const flush = async () => {
    while (pending) {
      const body = { type: "wheel", ...pending };
      pending = null;
      busy = true;
      await send(body);
      busy = false;
    }
  };
  return (x: number, y: number, dx: number, dy: number) => {
    pending = { x, y, dx: (pending?.dx ?? 0) + dx, dy: (pending?.dy ?? 0) + dy };
    if (!busy) void flush();
  };
}
function moveSender() {
  let busy = false;
  let pending: { x: number; y: number } | null = null;
  const flush = async () => {
    while (pending) {
      const body = { type: "move", ...pending };
      pending = null;
      busy = true;
      await send(body);
      busy = false;
    }
  };
  return (x: number, y: number) => {
    pending = { x, y };
    if (!busy) void flush();
  };
}
const sendWheel = wheelSender();
const sendMove = moveSender();

export default function LiveView() {
  const [mode, setMode] = useState<Mode>("hidden");
  const [open, setOpen] = useState(true);
  const [url, setUrl] = useState("");
  const [control, setControl] = useState(false);
  // Panel width, remembered between reloads. 0 on the server (the panel renders nothing there anyway).
  const [width, setWidth] = useState(() => {
    if (typeof window === "undefined") return 0;
    const saved = Number(localStorage.getItem("liveview.width"));
    return clampWidth(saved > 0 ? saved : defaultWidth());
  });
  const [dragging, setDragging] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const size = useRef({ width: 1300, height: 900 });
  const lastSrc = useRef("");
  const modeRef = useRef<Mode>("hidden");

  useEffect(() => {
    const es = new EventSource("/api/live");
    es.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as LiveMsg;
      if (msg.type === "frame") {
        // Set the image directly instead of through state: many frames a second should not re-render React.
        lastSrc.current = `data:image/jpeg;base64,${msg.data}`;
        if (img.current) img.current.src = lastSrc.current;
        size.current = { width: msg.width, height: msg.height };
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
    return () => es.close();
  }, []);

  // Keep the panel inside the window when the window is resized.
  useEffect(() => {
    const onResize = () => setWidth((w) => clampWidth(w));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  /** Drag the panel's left edge to resize it. */
  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    setDragging(true);
    const move = (ev: PointerEvent) => setWidth(clampWidth(window.innerWidth - ev.clientX));
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      setDragging(false);
      setWidth((w) => {
        localStorage.setItem("liveview.width", String(w));
        return w;
      });
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  // The <img> is not mounted while hidden: show the latest frame as soon as it is.
  useEffect(() => {
    if (img.current && lastSrc.current) img.current.src = lastSrc.current;
  }, [mode, open]);

  // Make room on the right so the panel does not cover the page.
  const docked = mode !== "hidden" && open && width > 0;
  useEffect(() => {
    document.body.style.paddingRight = docked ? `${width}px` : "";
    document.body.style.userSelect = dragging ? "none" : "";
    document.body.style.cursor = dragging ? "col-resize" : "";
    return () => {
      document.body.style.paddingRight = "";
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [docked, width, dragging]);

  // Tell the server the picture area's size so the remote page is the same shape and fills it.
  useEffect(() => {
    const el = stage.current;
    if (!el || mode !== "live" || !open) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const report = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const r = el.getBoundingClientRect();
        if (r.width > 200 && r.height > 200) void send({ type: "resize", width: Math.round(r.width), height: Math.round(r.height) });
      }, 250);
    };
    const ro = new ResizeObserver(report);
    ro.observe(el);
    report();
    return () => {
      ro.disconnect();
      clearTimeout(t);
    };
  }, [mode, open]);

  /** Map a point on the image to CSS pixels in the remote page (the image may be letterboxed by object-contain). */
  const toPage = useCallback((clientX: number, clientY: number) => {
    const r = img.current!.getBoundingClientRect();
    const { width, height } = size.current;
    const scale = Math.min(r.width / width, r.height / height);
    const left = r.left + (r.width - width * scale) / 2;
    const top = r.top + (r.height - height * scale) / 2;
    return { x: Math.round((clientX - left) / scale), y: Math.round((clientY - top) / scale) };
  }, []);

  // Wheel needs a non-passive listener so the app page does not scroll at the same time.
  useEffect(() => {
    const el = img.current;
    if (!el || !control || mode !== "live") return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = toPage(e.clientX, e.clientY);
      // deltaMode 1 = lines (some mice): roughly 40px a line.
      const k = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
      sendWheel(p.x, p.y, e.deltaX * k, e.deltaY * k);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
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

  if (mode === "hidden" || width === 0) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand/90"
      >
        <Dot live={mode === "live"} light />
        {mode === "live" ? "Watch the agent's browser" : "Agent's browser (closed)"}
      </button>
    );
  }

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 flex flex-col gap-3 bg-subtle p-4"
      style={{ width }}
      aria-label="The agent's browser, live"
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Drag to resize the browser panel"
        title="Drag to resize"
        onPointerDown={startDrag}
        onDoubleClick={() => {
          const w = clampWidth(defaultWidth());
          setWidth(w);
          localStorage.setItem("liveview.width", String(w));
        }}
        className="group absolute inset-y-0 -left-1.5 z-10 flex w-3 cursor-col-resize justify-center"
      >
        <span className={cx("h-full w-0.5 transition-colors", dragging ? "bg-brand" : "bg-transparent group-hover:bg-brand/60")} />
        <span
          className={cx(
            "absolute top-1/2 h-10 w-1.5 -translate-y-1/2 rounded-full transition-colors",
            dragging ? "bg-brand" : "bg-line group-hover:bg-brand/60",
          )}
        />
      </div>
      <div className="flex items-center gap-3">
        <Dot live={mode === "live"} />
        <span className="text-[11px] font-medium uppercase tracking-[0.1em] text-muted">
          {mode === "live" ? "Live" : "Closed"}
        </span>
        <div className="flex min-w-0 flex-1 items-center rounded-full bg-white px-4 py-1.5 text-[13px] text-ink-2">
          <span className="truncate" title={url}>
            {url.replace(/^https?:\/\/(www\.)?/, "") || "about:blank"}
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} title="Hide the panel (the browser keeps running)">
          Hide
        </Button>
        {mode === "ended" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              modeRef.current = "hidden";
              setMode("hidden");
            }}
          >
            Dismiss
          </Button>
        )}
      </div>

      <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden rounded-card bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- frames are data URLs replaced many times a second */}
        <img
          ref={img}
          alt="Live view of the page the agent is working on"
          tabIndex={control ? 0 : -1}
          draggable={false}
          className={cx(
            "absolute inset-0 size-full select-none object-contain object-top outline-none transition-opacity",
            control ? "cursor-pointer" : "cursor-default",
            mode === "ended" && "opacity-40",
            dragging && "pointer-events-none",
          )}
          onClick={(e) => {
            if (!control || mode !== "live") return;
            img.current?.focus();
            sendOrdered({ type: "click", ...toPage(e.clientX, e.clientY) });
          }}
          onPointerMove={(e) => {
            if (!control || mode !== "live" || dragging) return;
            const p = toPage(e.clientX, e.clientY);
            sendMove(p.x, p.y);
          }}
          onKeyDown={(e) => {
            if (!control || mode !== "live" || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key.length === 1 && e.key !== " ") sendOrdered({ type: "text", text: e.key });
            else if (KEYS.has(e.key)) sendOrdered({ type: "key", key: e.key === " " ? "Space" : e.key });
            else return;
            e.preventDefault();
          }}
        />
        {control && <div className="pointer-events-none absolute inset-0 rounded-card ring-2 ring-inset ring-brand" />}
        {mode === "ended" && (
          <div className="absolute inset-x-0 bottom-6 flex justify-center">
            <span className="rounded-full bg-ink px-4 py-2 text-[13px] text-white">The browser has closed</span>
          </div>
        )}
      </div>

      {mode === "live" && (
        <div className="flex items-center gap-2">
          <Button variant={control ? "primary" : "secondary"} size="sm" onClick={takeControl}>
            {control ? "Stop controlling" : "Take control"}
          </Button>
          {control && (
            <Button variant="secondary" size="sm" onClick={() => void send({ type: "back" })}>
              Back
            </Button>
          )}
          <span className="flex-1 truncate text-[12px] text-muted">
            {control ? "Your clicks and typing go to the real page." : "The agent never presses Submit."}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm("Close the agent's browser? Anything not submitted is lost.")) void send({ type: "close" });
            }}
          >
            Close browser
          </Button>
        </div>
      )}
    </aside>
  );
}

function Dot({ live, light }: { live: boolean; light?: boolean }) {
  const on = light ? "bg-white" : "bg-teal";
  return (
    <span className="relative flex size-2">
      {live && <span className={cx("absolute inline-flex size-full animate-ping rounded-full opacity-75", on)} />}
      <span className={cx("relative inline-flex size-2 rounded-full", live ? on : "bg-faint")} />
    </span>
  );
}
