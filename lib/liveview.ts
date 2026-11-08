import type { BrowserContext, CDPSession, Page } from "playwright";

/**
 * In-app live view of the agent's browser (D32), several tabs at once (D36).
 *
 * Every Playwright context opened through `openSession()` is attached here. We start a CDP screencast
 * (`Page.startScreencast`) on each tab and publish its JPEG frames, tagged with a `pageId`, to a process-wide
 * bus. With several tabs, each streams as a small tile except the focused one. `app/api/live/route.ts` streams that bus to the
 * browser as server-sent events and forwards input back via `liveInput()`.
 *
 * One bus per Node process: the demo has one patient and one agent run at a time. If two runs overlap,
 * the newest session wins the view. State lives on globalThis because Next.js may load this module
 * more than once (one copy per route bundle) in dev.
 */

export type LiveFrame = {
  type: "frame";
  pageId: string;
  data: string; // base64 JPEG
  url: string;
  width: number; // CSS pixels of the page viewport the frame shows
  height: number;
};

/** One tab of the current session, as shown in the grid (D36). */
export type LivePage = {
  pageId: string;
  label: string;
  color: string;
  url: string;
  state: "starting" | "working" | "done" | "failed";
  note: string;
};
export type LiveStats = { agents: number; sites: number; pages: number; actions: number };

/** Keys the panel forwards, with what Chrome needs to treat them as real key presses. */
const KEYMAP: Record<string, { key: string; code: string; vk: number; text?: string }> = {
  Enter: { key: "Enter", code: "Enter", vk: 13, text: "\r" },
  Backspace: { key: "Backspace", code: "Backspace", vk: 8 },
  Tab: { key: "Tab", code: "Tab", vk: 9 },
  Escape: { key: "Escape", code: "Escape", vk: 27 },
  Delete: { key: "Delete", code: "Delete", vk: 46 },
  Space: { key: " ", code: "Space", vk: 32, text: " " },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", vk: 38 },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
  Home: { key: "Home", code: "Home", vk: 36 },
  End: { key: "End", code: "End", vk: 35 },
  PageUp: { key: "PageUp", code: "PageUp", vk: 33 },
  PageDown: { key: "PageDown", code: "PageDown", vk: 34 },
};

export type LiveEvent =
  | LiveFrame
  | { type: "pages"; pages: LivePage[] }
  | { type: "stats"; stats: LiveStats }
  | { type: "end" }
  | { type: "control"; enabled: boolean }
  | { type: "submitted"; flow: string }; // the user pressed Submit on a form the agent filled (see closeWhenSubmitted in lib/browser.ts)
type Listener = (e: LiveEvent) => void;

/** Every input may name the tab it is for; without `pageId` it goes to the focused tab, else the newest. */
type Target = { pageId?: string };
export type LiveInput =
  | ({ type: "click"; x: number; y: number } & Target) // CSS pixels in the page viewport
  | ({ type: "move"; x: number; y: number } & Target)
  | ({ type: "wheel"; x: number; y: number; dx: number; dy: number } & Target)
  | ({ type: "key"; key: string } & Target) // a key name from KEYMAP, e.g. "Enter"
  | ({ type: "text"; text: string } & Target)
  | ({ type: "back" } & Target)
  | { type: "close" }
  | { type: "focus"; pageId: string | null } // the focused tab streams at full quality, the rest as small tiles
  | { type: "resize"; width: number; height: number }; // size of the panel's picture area, CSS pixels

type Attached = { page: Page; cdp: CDPSession; meta: LivePage; hi: boolean | null };
type Bus = {
  listeners: Set<Listener>;
  frames: Map<string, LiveFrame>;
  live: boolean;
  /** Pages of the current session, oldest first. */
  pages: Attached[];
  context: BrowserContext | null;
  /** Viewport that makes the page fill the panel exactly; null until the panel reports its size. */
  viewport: { width: number; height: number } | null;
  focus: string | null;
  stats: LiveStats | null;
  nextId: number;
};

const g = globalThis as typeof globalThis & { __liveBus2?: Bus };
const bus: Bus = (g.__liveBus2 ??= { listeners: new Set(), frames: new Map(), live: false, pages: [], context: null, viewport: null, focus: null, stats: null, nextId: 1 });

const MIN_WIDTH = 1100; // below this many sites switch to their mobile layout
const TILE_WIDTH = 640;

/** Same shape as the panel, at least MIN_WIDTH wide, so the frame fills the panel top to bottom. */
function viewportFor(width: number, height: number) {
  const scale = Math.max(1, MIN_WIDTH / width);
  return { width: Math.round(width * scale), height: Math.min(2400, Math.round(height * scale)) };
}

/** Full quality for the tab being looked at (or the only tab); small and light for grid tiles. */
const isHi = (a: Attached) => bus.pages.length <= 1 || bus.focus === a.meta.pageId;
function screencastOpts(hi: boolean) {
  const vw = bus.viewport?.width ?? 1300;
  const vh = bus.viewport?.height ?? 900;
  return hi
    ? { format: "jpeg" as const, quality: 70, maxWidth: vw, maxHeight: vh, everyNthFrame: 1 }
    : { format: "jpeg" as const, quality: 50, maxWidth: TILE_WIDTH, maxHeight: Math.round((TILE_WIDTH * vh) / vw), everyNthFrame: 1 };
}

function publish(e: LiveEvent) {
  if (e.type === "frame") bus.frames.set(e.pageId, e);
  for (const l of bus.listeners) {
    try {
      l(e);
    } catch {
      /* a broken listener must not stop the agent */
    }
  }
}
const publishPages = () => publish({ type: "pages", pages: bus.pages.map((p) => p.meta) });

/** Tell the app that the user sent a form the agent filled. `flow` names the step: "nhs", "spso" or "yellowcard". */
export function announceSubmitted(flow: string) {
  publish({ type: "submitted", flow });
}

/** Subscribe. If a session is live, the tab list, the latest frame of each tab and the stats are replayed immediately. */
export function subscribeLive(listener: Listener): () => void {
  bus.listeners.add(listener);
  if (bus.live) {
    listener({ type: "pages", pages: bus.pages.map((p) => p.meta) });
    for (const f of bus.frames.values()) listener(f);
    if (bus.stats) listener({ type: "stats", stats: bus.stats });
  }
  return () => bus.listeners.delete(listener);
}

export function isLive() {
  return bus.live;
}

const host = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "New tab";
  }
};

/** Start or restart the screencast at the right quality for this tab. */
async function stream(a: Attached, force = false) {
  const hi = isHi(a);
  if (!force && a.hi === hi) return;
  a.hi = hi;
  await a.cdp.send("Page.stopScreencast").catch(() => {});
  await a.cdp.send("Page.startScreencast", screencastOpts(hi)).catch(() => {});
}
const restreamAll = (force = false) => Promise.all(bus.pages.map((p) => stream(p, force)));

async function attachPage(page: Page) {
  const context = page.context();
  let cdp: CDPSession;
  try {
    cdp = await context.newCDPSession(page);
  } catch {
    return; // page closed before we could attach
  }
  const pageId = `p${bus.nextId++}`;
  const entry: Attached = { page, cdp, hi: null, meta: { pageId, label: host(page.url()), color: "#0060df", url: page.url(), state: "starting", note: "" } };
  bus.pages.push(entry);
  publishPages();

  cdp.on("Page.screencastFrame", (f: { data: string; sessionId: number; metadata: { deviceWidth: number; deviceHeight: number } }) => {
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {}); // always ack, or Chrome stops sending
    if (bus.context !== context) return;
    publish({ type: "frame", pageId, data: f.data, url: page.url(), width: f.metadata.deviceWidth, height: f.metadata.deviceHeight });
  });
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    entry.meta = { ...entry.meta, url: frame.url(), label: entry.meta.label === host(entry.meta.url) || entry.meta.label === "New tab" ? host(frame.url()) : entry.meta.label };
    publishPages();
  });
  page.on("close", () => {
    bus.pages = bus.pages.filter((p) => p !== entry);
    bus.frames.delete(pageId);
    if (bus.focus === pageId) bus.focus = null;
    if (bus.context !== context) return;
    publishPages();
    void restreamAll(); // the last remaining tab goes back to full quality
  });

  if (bus.viewport) await page.setViewportSize(bus.viewport).catch(() => {});
  await restreamAll(); // a second tab turns the first into a tile
  await stream(entry, true);
}

const entryOf = (page: Page) => bus.pages.find((p) => p.page === page);

/** Name a tab and its agent for the grid ("SLAB calculator", colour, state, note). Safe to call often. */
export function setPageMeta(page: Page, meta: Partial<Omit<LivePage, "pageId" | "url">>) {
  const e = entryOf(page);
  if (!e) return;
  e.meta = { ...e.meta, ...meta };
  publishPages();
}

/** Running totals for the grid header ("5 agents · 9 sites · 41 pages · 163 actions"). */
export function publishStats(stats: LiveStats) {
  bus.stats = stats;
  publish({ type: "stats", stats });
}

async function resize(width: number, height: number) {
  const v = viewportFor(width, height);
  if (bus.viewport && bus.viewport.width === v.width && bus.viewport.height === v.height) return;
  bus.viewport = v;
  for (const p of bus.pages) await p.page.setViewportSize(v).catch(() => {});
  await restreamAll(true);
}

/** Called by `openSession()`. Streams every tab of this context to the live view until the browser closes. */
export function attachLiveView(context: BrowserContext) {
  if (process.env.LIVEVIEW === "0") return;
  bus.context = context;
  bus.pages = [];
  bus.frames.clear();
  bus.focus = null;
  bus.stats = null;
  bus.live = true;
  publish({ type: "control", enabled: false });
  publishPages();
  for (const p of context.pages()) void attachPage(p);
  context.on("page", (p) => void attachPage(p));
  context.on("close", () => {
    if (bus.context !== context) return; // a newer session already took over
    bus.context = null;
    bus.pages = [];
    bus.frames.clear();
    bus.live = false;
    bus.focus = null;
    publish({ type: "end" });
  });
}

/**
 * Forward a user action from the live view to the visible page. The route only calls this when the
 * user has switched on "Take control" in the panel. This is the user's own hand, not the agent's, so
 * the agent's never-submit rule does not apply to it; the panel warns before the user takes control.
 */
export async function liveInput(input: LiveInput): Promise<string> {
  if (input.type === "resize") {
    await resize(input.width, input.height);
    return "ok";
  }
  if (input.type === "focus") {
    bus.focus = input.pageId && bus.pages.some((p) => p.meta.pageId === input.pageId) ? input.pageId : null;
    await restreamAll();
    return "ok";
  }
  const wanted = "pageId" in input ? input.pageId : undefined;
  const top = bus.pages.find((p) => p.meta.pageId === (wanted ?? bus.focus)) ?? bus.pages.at(-1);
  const page = top?.page;
  if (!top || !page || page.isClosed()) return "no live page";
  // User input goes straight to Chrome over CDP. Playwright's page.mouse / page.keyboard would add the
  // session's slowMo (250 ms per call, there so the *agent* is watchable) to every click and scroll.
  const cdp = top.cdp;
  type MouseExtra = { button?: "left"; buttons?: number; clickCount?: number; deltaX?: number; deltaY?: number };
  const mouse = (type: "mouseMoved" | "mousePressed" | "mouseReleased" | "mouseWheel", x: number, y: number, extra: MouseExtra = {}) =>
    cdp.send("Input.dispatchMouseEvent", { type, x, y, ...extra });
  switch (input.type) {
    case "move":
      await mouse("mouseMoved", input.x, input.y);
      return "ok";
    case "click":
      await mouse("mouseMoved", input.x, input.y);
      await mouse("mousePressed", input.x, input.y, { button: "left", buttons: 1, clickCount: 1 });
      await mouse("mouseReleased", input.x, input.y, { button: "left", buttons: 0, clickCount: 1 });
      return "ok";
    case "wheel":
      await mouse("mouseWheel", input.x, input.y, { deltaX: input.dx, deltaY: input.dy });
      return "ok";
    case "key": {
      const k = KEYMAP[input.key];
      if (!k) return "unknown key";
      const base = { key: k.key, code: k.code, windowsVirtualKeyCode: k.vk, nativeVirtualKeyCode: k.vk };
      await cdp.send("Input.dispatchKeyEvent", { type: k.text ? "keyDown" : "rawKeyDown", ...base, ...(k.text ? { text: k.text, unmodifiedText: k.text } : {}) });
      await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
      return "ok";
    }
    case "text":
      await cdp.send("Input.insertText", { text: input.text });
      return "ok";
    case "back":
      await page.goBack({ timeout: 10000 }).catch(() => {});
      return "ok";
    case "close":
      // Closing the last page ends the review wait in the step runners, which then close the browser.
      await bus.context?.close().catch(() => {});
      return "ok";
  }
}
