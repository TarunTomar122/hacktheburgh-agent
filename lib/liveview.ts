import type { BrowserContext, CDPSession, Page } from "playwright";

/**
 * In-app live view of the agent's browser (D32).
 *
 * Every Playwright context opened through `openSession()` is attached here. We start a CDP screencast
 * (`Page.startScreencast`) on each page in the context and publish JPEG frames from the "active" page
 * (the newest one still open) to a process-wide bus. `app/api/live/route.ts` streams that bus to the
 * browser as server-sent events and forwards input back via `liveInput()`.
 *
 * One bus per Node process: the demo has one patient and one agent run at a time. If two runs overlap,
 * the newest session wins the view. State lives on globalThis because Next.js may load this module
 * more than once (one copy per route bundle) in dev.
 */

export type LiveFrame = {
  type: "frame";
  data: string; // base64 JPEG
  url: string;
  width: number; // CSS pixels of the page viewport the frame shows
  height: number;
};
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

export type LiveEvent = LiveFrame | { type: "end" } | { type: "control"; enabled: boolean };
type Listener = (e: LiveEvent) => void;

export type LiveInput =
  | { type: "click"; x: number; y: number } // CSS pixels in the page viewport
  | { type: "move"; x: number; y: number }
  | { type: "wheel"; x: number; y: number; dx: number; dy: number }
  | { type: "key"; key: string } // a Playwright key name, e.g. "Enter", "Backspace", "a"
  | { type: "text"; text: string }
  | { type: "back" }
  | { type: "close" }
  | { type: "resize"; width: number; height: number }; // size of the panel's picture area, CSS pixels

type Attached = { page: Page; cdp: CDPSession };
type Bus = {
  listeners: Set<Listener>;
  last: LiveFrame | null;
  live: boolean;
  /** Pages of the current session, oldest first. The last one is shown. */
  pages: Attached[];
  context: BrowserContext | null;
  /** Viewport that makes the page fill the panel exactly; null until the panel reports its size. */
  viewport: { width: number; height: number } | null;
};

const g = globalThis as typeof globalThis & { __liveBus?: Bus };
const bus: Bus = (g.__liveBus ??= { listeners: new Set(), last: null, live: false, pages: [], context: null, viewport: null });
bus.viewport ??= null;

const MIN_WIDTH = 1100; // below this many sites switch to their mobile layout

/** Same shape as the panel, at least MIN_WIDTH wide, so the frame fills the panel top to bottom. */
function viewportFor(width: number, height: number) {
  const scale = Math.max(1, MIN_WIDTH / width);
  return { width: Math.round(width * scale), height: Math.min(2400, Math.round(height * scale)) };
}

const screencastOpts = () => ({
  format: "jpeg" as const,
  quality: 70,
  maxWidth: bus.viewport?.width ?? 1300,
  maxHeight: bus.viewport?.height ?? 900,
  everyNthFrame: 1,
});

function publish(e: LiveEvent) {
  if (e.type === "frame") bus.last = e;
  for (const l of bus.listeners) {
    try {
      l(e);
    } catch {
      /* a broken listener must not stop the agent */
    }
  }
}

/** Subscribe to frames. The latest frame (if a session is live) is replayed immediately. */
export function subscribeLive(listener: Listener): () => void {
  bus.listeners.add(listener);
  if (bus.live && bus.last) listener(bus.last);
  return () => bus.listeners.delete(listener);
}

export function isLive() {
  return bus.live;
}

const active = () => bus.pages.at(-1)?.page ?? null;

async function attachPage(page: Page) {
  const context = page.context();
  let cdp: CDPSession;
  try {
    cdp = await context.newCDPSession(page);
  } catch {
    return; // page closed before we could attach
  }
  const entry: Attached = { page, cdp };
  bus.pages.push(entry);

  cdp.on("Page.screencastFrame", (f: { data: string; sessionId: number; metadata: { deviceWidth: number; deviceHeight: number } }) => {
    // Always ack, or Chrome stops sending frames. Only the active page is shown.
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
    if (bus.context !== context || active() !== page) return;
    publish({ type: "frame", data: f.data, url: page.url(), width: f.metadata.deviceWidth, height: f.metadata.deviceHeight });
  });

  page.on("close", () => {
    bus.pages = bus.pages.filter((p) => p !== entry);
    // Nudge the page that is now on top to send a fresh frame.
    const next = bus.pages.at(-1);
    if (next && bus.context === context) restart(next).catch(() => {});
  });

  if (bus.viewport) await page.setViewportSize(bus.viewport).catch(() => {});
  await cdp.send("Page.startScreencast", screencastOpts()).catch(() => {});
}

async function restart({ cdp }: Attached) {
  await cdp.send("Page.stopScreencast").catch(() => {});
  await cdp.send("Page.startScreencast", screencastOpts());
}

async function resize(width: number, height: number) {
  const v = viewportFor(width, height);
  if (bus.viewport && bus.viewport.width === v.width && bus.viewport.height === v.height) return;
  bus.viewport = v;
  for (const p of bus.pages) {
    await p.page.setViewportSize(v).catch(() => {});
    await restart(p).catch(() => {});
  }
}

/** Called by `openSession()`. Streams every page of this context to the live view until the browser closes. */
export function attachLiveView(context: BrowserContext) {
  if (process.env.LIVEVIEW === "0") return;
  bus.context = context;
  bus.pages = [];
  bus.last = null;
  bus.live = true;
  publish({ type: "control", enabled: false });
  for (const p of context.pages()) void attachPage(p);
  context.on("page", (p) => void attachPage(p));
  context.on("close", () => {
    if (bus.context !== context) return; // a newer session already took over
    bus.context = null;
    bus.pages = [];
    bus.live = false;
    bus.last = null;
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
  const top = bus.pages.at(-1);
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
