"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, cx } from "./ui";
import { CREW, type CrewId } from "../lib/agent/plannerTypes";

/**
 * Right-hand panel that shows the agent's browser live (D32). Mounted once in app/layout.tsx.
 * Hidden until a browser session starts; frames arrive as server-sent events from /api/live.
 * One tab: the page fills the panel. Several tabs (D36, step 3's parallel agents): a grid of tiles, one per agent,
 * each with the agent's colour, state and note; clicking a tile focuses it (full quality, take control) until "Back to grid".
 * The panel reports its size, and the server sizes the focused page to match, so it fills the panel edge to edge.
 * "Take control" forwards the user's clicks, scrolling and typing to the page being shown.
 * When the browser closes, the panel shows a short notice and then closes itself (D38).
 */

type Frame = { type: "frame"; pageId?: string; data: string; url: string; width: number; height: number };
type LivePage = { pageId: string; label: string; color: string; url: string; state: "starting" | "working" | "done" | "failed"; note: string };
type LiveStats = { agents: number; sites: number; pages: number; actions: number };
type LiveMsg =
  | Frame
  | { type: "pages"; pages: LivePage[] }
  | { type: "stats"; stats: LiveStats }
  | { type: "end" }
  | { type: "idle" }
  | { type: "control"; enabled: boolean }
  | { type: "submitted"; flow: string };
type Mode = "hidden" | "live" | "ended";
const SINGLE = "_single"; // frames from a server that does not tag pages

/** How long the "browser has closed" notice stays before the panel closes itself. */
const CLOSE_AFTER_MS = 2000;
const MIN_W = 360;
const defaultWidth = () => Math.round(Math.min(window.innerWidth * 0.48, 820));
const clampWidth = (w: number) => Math.round(Math.max(MIN_W, Math.min(w, window.innerWidth - MIN_W)));
const KEYS = new Set(["Enter", "Backspace", "Tab", "Escape", "Delete", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown", " "]);

const send = (body: unknown) =>
  fetch("/api/live", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => {});

/** Clicks and keys must reach the page in the order they happened, so they are chained. */
let chain: Promise<unknown> = Promise.resolve();
/** Inline mode: the picture area of the browser modal, in CSS pixels (the window minus the modal's margins and header). */
const inlineSize = () => ({ width: Math.max(640, window.innerWidth - 90), height: Math.max(360, window.innerHeight - 140) });
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
  let pending: { x: number; y: number; dx: number; dy: number; pageId?: string } | null = null;
  const flush = async () => {
    while (pending) {
      const body = { type: "wheel", ...pending };
      pending = null;
      busy = true;
      await send(body);
      busy = false;
    }
  };
  return (x: number, y: number, dx: number, dy: number, pageId?: string) => {
    const prev = pending && pending.pageId === pageId ? pending : null;
    pending = { x, y, dx: (prev?.dx ?? 0) + dx, dy: (prev?.dy ?? 0) + dy, pageId };
    if (!busy) void flush();
  };
}
function moveSender() {
  let busy = false;
  let pending: { x: number; y: number; pageId?: string } | null = null;
  const flush = async () => {
    while (pending) {
      const body = { type: "move", ...pending };
      pending = null;
      busy = true;
      await send(body);
      busy = false;
    }
  };
  return (x: number, y: number, pageId?: string) => {
    pending = { x, y, pageId };
    if (!busy) void flush();
  };
}
const sendWheel = wheelSender();
const sendMove = moveSender();

export default function LiveView() {
  const [mode, setMode] = useState<Mode>("hidden");
  // Closed until the user clicks the floating button: the agents work in the background (Tarun, 2026-11-07).
  const [open, setOpen] = useState(false);
  const [questionPending, setQuestionPending] = useState(false);
  useEffect(() => {
    const onQuestion = (event: Event) => setQuestionPending((event as CustomEvent<boolean>).detail);
    window.addEventListener("live-question", onQuestion);
    return () => window.removeEventListener("live-question", onQuestion);
  }, []);
  // True when a page opened the panel for the user (the "live-open" event) rather than the user clicking the button.
  const autoOpened = useRef(false);
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
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // Several tabs (D36)
  const [pages, setPages] = useState<LivePage[]>([]);
  const [, setStats] = useState<LiveStats | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const srcs = useRef(new Map<string, string>()); // latest frame per tab
  const sizes = useRef(new Map<string, { width: number; height: number }>());
  const urls = useRef(new Map<string, string>());
  const tileImgs = useRef(new Map<string, HTMLImageElement>());
  const [singleId, setSingleId] = useState<string | null>(null); // the tab shown when there is only one
  const singleRef = useRef<string | null>(null);
  // Which tab the big view shows: the focused one, or the only one. null = the grid.
  // Inline mode (D52): a page that wants the browsers inside it renders <div id="live-slot">. While it exists, the
  // panel lives there (no floating button, no dock), so the crew's browsers sit right next to their work.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const find = () => setSlot((cur) => {
      const el = document.getElementById("live-slot");
      return cur === el ? cur : el;
    });
    find();
    const mo = new MutationObserver(find);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, []);
  const [highlight, setHighlight] = useState<string | null>(null); // inline: the tab the crew is working on now
  // Inline (D62, Tarun): small tiles of every browser; the tab the crew is on is highlighted, not enlarged.
  // A tile opens big only when the user clicks it.
  const grid = (!!slot && pages.length > 0) || (pages.length > 1 && focused === null);
  const bigId = focused ?? (pages.length === 1 ? pages[0].pageId : singleId);
  const focusedPage = !grid && pages.length > 1 ? pages.find((p) => p.pageId === bigId) : undefined;
  // Event handlers read the shown tab from a ref (they are created once); keep it in sync after each render.
  const bigRef = useRef<string | null>(null);
  useEffect(() => {
    bigRef.current = slot ? focused : grid ? null : bigId;
  }, [grid, bigId, slot, focused]);

  const pagesRef = useRef<LivePage[]>([]);
  useEffect(() => {
    pagesRef.current = pages;
  }, [pages]);

  useEffect(() => {
    const es = new EventSource("/api/live");
    es.onmessage = (ev) => {
      const msg = JSON.parse(ev.data) as LiveMsg;
      if (msg.type === "frame") {
        clearTimeout(closeTimer.current); // a new session started while the old notice was still showing
        // Set the images directly instead of through state: many frames a second should not re-render React.
        const id = msg.pageId ?? SINGLE;
        const src = `data:image/jpeg;base64,${msg.data}`;
        srcs.current.set(id, src);
        sizes.current.set(id, { width: msg.width, height: msg.height });
        urls.current.set(id, msg.url);
        if (singleRef.current === null) {
          singleRef.current = id;
          setSingleId(id);
        }
        const tile = tileImgs.current.get(id);
        if (tile) tile.src = src;
        const shown = bigRef.current ?? (singleRef.current === id ? id : null);
        if (shown === id) {
          lastSrc.current = src;
          if (img.current) img.current.src = src;
          size.current = { width: msg.width, height: msg.height };
          setUrl((u) => (u === msg.url ? u : msg.url));
        }
        if (modeRef.current !== "live") {
          modeRef.current = "live";
          setMode("live");
        }
      } else if (msg.type === "pages") {
        if (msg.pages.length > 0) clearTimeout(closeTimer.current);
        setPages(msg.pages);
        if (msg.pages.length > 0) {
          singleRef.current = msg.pages[msg.pages.length - 1].pageId;
          setSingleId(singleRef.current);
        }
        // A focused tab that went away: back to the grid.
        setFocused((f) => (f && !msg.pages.some((p) => p.pageId === f) ? null : f));
        if (msg.pages.length > 0 && modeRef.current !== "live") {
          modeRef.current = "live";
          setMode("live");
        }
      } else if (msg.type === "stats") {
        setStats(msg.stats);
      } else if (msg.type === "end") {
        if (modeRef.current === "live") {
          modeRef.current = "ended";
          setMode("ended");
          // The browser is really gone, so the panel goes too: show the notice briefly, then close it and drop the old frame.
          closeTimer.current = setTimeout(() => {
            if (modeRef.current !== "ended") return;
            modeRef.current = "hidden";
            lastSrc.current = "";
            setMode("hidden");
            if (autoOpened.current) {
              autoOpened.current = false;
              setOpen(false);
            }
            // Forget the old session's tabs so the next run starts clean.
            srcs.current.clear();
            sizes.current.clear();
            urls.current.clear();
            singleRef.current = null;
            setSingleId(null);
            setPages([]);
            setStats(null);
            setFocused(null);
          }, CLOSE_AFTER_MS);
        }
        setControl(false);
      } else if (msg.type === "control") {
        setControl(msg.enabled);
      } else if (msg.type === "submitted") {
        // The user sent a form the agent filled. The case page listens and marks that step as sent.
        window.dispatchEvent(new CustomEvent("agent-submitted", { detail: msg.flow }));
      }
    };
    return () => {
      es.close();
      clearTimeout(closeTimer.current);
    };
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

  // The <img> is not mounted while hidden or in the grid: show the latest frame as soon as it is.
  useEffect(() => {
    const id = slot ? focused : grid ? null : bigId;
    const src = (id && srcs.current.get(id)) || lastSrc.current;
    if (id) {
      size.current = sizes.current.get(id) ?? size.current;
      setUrl(urls.current.get(id) ?? "");
    }
    if (img.current && src) img.current.src = src;
  }, [mode, open, grid, bigId, slot, focused]);

  const focus = useCallback((pageId: string | null) => {
    setFocused(pageId);
    setControl(false);
    void send({ type: "focus", pageId });
  }, []);

  // Inline: the remote pages get exactly the size of the modal's picture, so a clicked tile shows at 1:1, not zoomed.
  useEffect(() => {
    if (!slot) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const report = () => {
      clearTimeout(t);
      t = setTimeout(() => void send({ type: "resize", ...inlineSize() }), 300);
    };
    report();
    window.addEventListener("resize", report);
    return () => {
      window.removeEventListener("resize", report);
      clearTimeout(t);
    };
  }, [slot]);

  // Inline: Escape closes the browser modal (not while the user is typing into the page).
  useEffect(() => {
    if (!slot || !focused || control) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") focus(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slot, focused, control, focus]);

  // A page that runs one browser the user is meant to watch (step 1, the NHS Lothian form) opens the panel by itself:
  // window.dispatchEvent(new Event("live-open")). NHS and ombudsman form filling both request this panel.
  useEffect(() => {
    const onOpen = () => {
      setOpen((o) => {
        if (!o) autoOpened.current = true;
        return true;
      });
    };
    window.addEventListener("live-open", onOpen);
    return () => window.removeEventListener("live-open", onOpen);
  }, []);

  // The run screen can ask to show one crew member's browser: window.dispatchEvent(new CustomEvent("live-focus", { detail: "Robin" })).
  useEffect(() => {
    // detail: a crew name ("Robin"), an exact tab label ("Robin · Drummond Miller"), or { tab, auto: true } from the
    // run screen following the spotlight (ignored once the user has pinned a tab).
    const onFocus = (e: Event) => {
      const d = (e as CustomEvent<string | null | { tab: string; auto?: boolean }>).detail;
      if (!d) return;
      if (d === "follow") return; // (kept for callers; the highlight always follows the crew)
      const auto = typeof d === "object" && d.auto;
      const key = typeof d === "object" ? d.tab : d;
      const exact = pagesRef.current.find((p) => p.label === key);
      const mine = pagesRef.current.filter((p) => p.label.startsWith(`${key.split(" · ")[0]} ·`));
      const pick = exact ?? mine.find((p) => p.state === "working") ?? mine.at(-1);
      if (!pick) return;
      if (auto) setHighlight(pick.pageId);
      else focus(pick.pageId);
    };
    window.addEventListener("live-focus", onFocus);
    return () => window.removeEventListener("live-focus", onFocus);
  }, [focus]);


  // Make room on the right so the panel does not cover the page.
  const docked = !slot && mode !== "hidden" && open && width > 0;
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
    if (!el || mode !== "live" || !open || slot || grid) return;
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
  }, [mode, open, grid, slot]);

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
      sendWheel(p.x, p.y, e.deltaX * k, e.deltaY * k, bigRef.current ?? undefined);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [control, mode, toPage, grid]);

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

  if (slot) {
    if (mode === "hidden") return null; // nothing to show until a browser is working
    return (
      <>
        {createPortal(panel(true), slot)}
        {focused && createPortal(watchModal(), document.body)}
      </>
    );
  }

  if (mode === "hidden" || width === 0) return null;

  // The floating button only while an agent is actually working (not for tabs left over from an earlier run).
  if (!open && !pages.some((p) => p.state === "working") && pages.length > 0) return null;

  if (!open) {
    return (
      <button
        onClick={() => { autoOpened.current = false; setOpen(true); }}
        className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-[13px] font-medium text-white hover:bg-brand/90"
      >
        <Dot live={mode === "live"} light />
        {mode === "live" ? (pages.filter((p) => p.state === "working").length > 1 ? "Watch Elliot's crew live" : "Watch Elliot live") : "Elliot's browser (closed)"}
      </button>
    );
  }

  return panel(false);

  /** The one large browser (the focused tab, or the only one). Used by the dock and by the inline stage. */
  function bigView() {
    return (
      <div ref={stage} className="relative min-h-0 flex-1 overflow-hidden rounded-card border border-line bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- frames are data URLs replaced many times a second */}
        <img
          ref={img}
          alt="Live view of the page Elliot is working on"
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
            sendOrdered({ type: "click", ...toPage(e.clientX, e.clientY), pageId: bigRef.current ?? undefined });
          }}
          onPointerMove={(e) => {
            if (!control || mode !== "live" || dragging) return;
            const p = toPage(e.clientX, e.clientY);
            sendMove(p.x, p.y, bigRef.current ?? undefined);
          }}
          onKeyDown={(e) => {
            if (!control || mode !== "live" || e.metaKey || e.ctrlKey || e.altKey) return;
            const pageId = bigRef.current ?? undefined;
            if (e.key.length === 1 && e.key !== " ") sendOrdered({ type: "text", text: e.key, pageId });
            else if (KEYS.has(e.key)) sendOrdered({ type: "key", key: e.key === " " ? "Space" : e.key, pageId });
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
    );
  }

  function questionNotice(close: () => void) {
    if (!questionPending) return null;
    return (
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-card border border-amber/30 bg-amber-soft p-3">
        <p role="status" className="text-sm text-ink">Elliot needs your answer. Return to the case screen to continue.</p>
        <Button size="sm" onClick={() => {
          close();
          requestAnimationFrame(() => {
            const question = document.querySelector<HTMLElement>("[data-agent-question]");
            question?.focus({ preventScroll: true });
            question?.scrollIntoView({ block: "center" });
          });
        }}>Return to question</Button>
      </div>
    );
  }

  /** Inline mode: a clicked tile opens here, centred, at a normal scale. */
  function watchModal() {
    const page = pages.find((p) => p.pageId === focused);
    const who = page ? crewId(page.label) : null;
    const size = inlineSize();
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label={page?.label ?? "Browser"}>
        <button aria-label="Close" className="absolute inset-0 bg-ink/30" onClick={() => focus(null)} />
        <div className="rise relative flex max-h-full flex-col gap-3 overflow-y-auto rounded-card bg-white p-5">
          <div className="flex items-center gap-3">
            {who && (
              // eslint-disable-next-line @next/next/no-img-element -- tiny static avatar
              <img src={`/crew/${who}-256.png`} alt="" aria-hidden className="size-9 object-contain" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-medium text-ink">{page?.label.replace(" · ", ": ") ?? "Browser"}</div>
              {url && url !== "about:blank" && <div className="text-[12px] text-muted">{crumbs(url)}</div>}
            </div>
            <Button variant={control ? "primary" : "secondary"} size="sm" onClick={takeControl}>
              {control ? "Stop controlling" : "Take control"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => focus(null)}>
              Close
            </Button>
          </div>
          {questionNotice(() => focus(null))}
          <div className="flex min-h-0" style={{ width: size.width, height: size.height }}>
            {bigView()}
          </div>
        </div>
      </div>
    );
  }

  function panel(inline: boolean) {
  return (
    <aside
      className={cx("flex flex-col gap-3", inline ? "@container h-full min-h-0" : "fixed inset-y-0 right-0 z-40 bg-subtle p-4")}
      style={inline ? undefined : { width }}
      aria-label="Elliot's browser, live"
    >
      {!inline && questionNotice(() => {
        autoOpened.current = false;
        setOpen(false);
      })}
      {!inline && (
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
      )}
      {/* Two quiet lines: who you are watching (and Hide), then where it is. Inline grids have no header at all. */}
      {!(inline && grid) && (
      <div>
        <div className="flex items-center gap-3">
          {focused && (pages.length > 1 || inline) ? (
            <button onClick={() => focus(null)} title="Back to all agents" aria-label="Back to all agents" className="flex size-8 shrink-0 items-center justify-center rounded-ctl border border-line bg-white text-ink-2 hover:border-faint hover:text-ink">
              ←
            </button>
          ) : (
            <Dot live={mode === "live"} />
          )}
          <div className="min-w-0 flex-1 text-[15px] font-medium text-ink">
            {grid ? (
              `${pages.filter((p) => p.state === "working").length} working · ${pages.length} browsers open`
            ) : focusedPage ? (
              <span className="inline-flex items-center gap-2">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: focusedPage.color }} />
                {focusedPage.label}
              </span>
            ) : mode === "live" ? (
              "Elliot's browser"
            ) : (
              "Browser closed"
            )}
          </div>
          {!inline && (
            <Button variant="ghost" size="sm" onClick={() => { autoOpened.current = false; setOpen(false); }} title="Hide the panel (Elliot keeps working)">
              Hide
            </Button>
          )}
        </div>
        <div className="mt-1 pl-11 text-[12px] leading-5 text-muted">{grid ? "" : crumbs(url)}</div>
      </div>
      )}

      {grid ? (
        <div className={cx("grid min-h-0 flex-1 content-start gap-3 overflow-y-auto", inline ? "grid-cols-2 @2xl:grid-cols-4 @5xl:grid-cols-6" : width >= 980 ? "grid-cols-3" : "grid-cols-2")}>
          {pages.filter((p) => !inline || (p.url && p.url !== "about:blank" && (p.state === "working" || p.state === "starting"))).map((p) => (
            <Tile
              key={p.pageId}
              page={p}
              ended={mode === "ended"}
              onImg={(el) => {
                if (el) {
                  tileImgs.current.set(p.pageId, el);
                  const src = srcs.current.get(p.pageId);
                  if (src) el.src = src;
                } else tileImgs.current.delete(p.pageId);
              }}
              onOpen={() => focus(p.pageId)}
              caption={inline}
              small={inline}
              active={inline && p.pageId === highlight}
            />
          ))}
        </div>
      ) : (
      bigView()
      )}


      {mode === "live" && !grid && (
        <div className="flex items-center gap-2">
          <Button variant={control ? "primary" : "secondary"} size="sm" onClick={takeControl}>
            {control ? "Stop controlling" : "Take control"}
          </Button>
          {control && (
            <Button variant="secondary" size="sm" onClick={() => void send({ type: "back", pageId: bigRef.current ?? undefined })}>
              Back
            </Button>
          )}
          <span className="flex-1 text-[12px] text-muted">
            {control ? "Your clicks and typing go to the real page." : "Elliot always stops before Send."}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm("Close Elliot's browser? Anything not submitted is lost.")) void send({ type: "close" });
            }}
          >
            Close browser
          </Button>
        </div>
      )}
    </aside>
  );
  }
}

/**
 * One agent's tab in the grid: only the live picture (Tarun, 2026-11-07). The agent's name and colour are already
 * drawn inside the page by its cursor pill, so there is no header, border or label here. A failed agent gets a thin red wash with its note.
 */
function Tile({ page, ended, onImg, onOpen, caption, small, active }: { page: LivePage; ended: boolean; onImg: (el: HTMLImageElement | null) => void; onOpen: () => void; caption?: boolean; small?: boolean; active?: boolean }) {
  const failed = page.state === "failed";
  return (
    <button
      onClick={onOpen}
      aria-label={`${page.label}: ${page.note || page.state}. Watch up close`}
      title={`Watch ${page.label} up close`}
      className={cx(
        "relative block w-full shrink-0 overflow-hidden rounded-card border bg-white outline-none transition-[opacity,border-color] hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand",
        small ? "aspect-[4/3]" : "aspect-[16/10]",
        active ? "border-brand ring-2 ring-brand-soft" : "border-line",
        page.state === "done" && !active && "opacity-60",
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- frames are data URLs replaced many times a second */}
      <img ref={onImg} alt="" draggable={false} className={cx("absolute inset-0 size-full object-cover object-top", ended && "opacity-50")} />
      {/* Inline (D52): a small name tag inside the picture, so you know whose tab it is even when their cursor is off screen. */}
      {caption && !failed && (
        <span className="absolute bottom-2 left-2 inline-flex max-w-[calc(100%-1rem)] items-center gap-1.5 rounded-[4px] bg-white/92 px-1.5 py-0.5 text-[11px] font-medium text-ink">
          {crewId(page.label) ? (
            // eslint-disable-next-line @next/next/no-img-element -- tiny static avatar
            <img src={`/crew/${crewId(page.label)}-256.png`} alt="" aria-hidden className="size-4 shrink-0 object-contain" />
          ) : (
            <span aria-hidden className="size-1.5 shrink-0 rounded-[1px]" style={{ background: page.color }} />
          )}
          {page.label.split(" · ")[0]}
          {page.state === "done" ? <span className="font-normal text-teal">✓</span> : page.state === "working" ? <span aria-label="working" className="size-1.5 animate-pulse rounded-full bg-brand" /> : null}
        </span>
      )}
      {failed && (
        <span className="absolute inset-0 flex items-end bg-danger/10 ring-1 ring-inset ring-danger/40">
          <span className="w-full bg-danger/85 px-2 py-1 text-left text-[11px] leading-4 text-white">{page.note || "Failed"}</span>
        </span>
      )}
    </button>
  );
}

/** The crew member whose tab this is, from its label ("Robin · SLAB lawyer list"), for the avatar on the tile. */
function crewId(label: string): CrewId | null {
  const name = label.split(" · ")[0];
  return (Object.keys(CREW) as CrewId[]).find((id) => CREW[id].name === name) ?? null;
}

/** "andersonstrathern.co.uk › legal-expertise › medical-negligence": readable, wraps between parts, never mid-word. */
function crumbs(url: string) {
  if (!url || url === "about:blank") return "";
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p).replace(/[-_]+/g, " "));
    return [u.hostname.replace(/^www\./, ""), ...parts].join(" › ");
  } catch {
    return url;
  }
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
