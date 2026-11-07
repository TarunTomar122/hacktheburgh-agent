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
export type LiveEvent = LiveFrame | { type: "end" } | { type: "control"; enabled: boolean };
type Listener = (e: LiveEvent) => void;

export type LiveInput =
  | { type: "click"; x: number; y: number } // CSS pixels in the page viewport
  | { type: "wheel"; x: number; y: number; dx: number; dy: number }
  | { type: "key"; key: string } // a Playwright key name, e.g. "Enter", "Backspace", "a"
  | { type: "text"; text: string }
  | { type: "back" }
  | { type: "close" };

type Attached = { page: Page; cdp: CDPSession };
type Bus = {
  listeners: Set<Listener>;
  last: LiveFrame | null;
  live: boolean;
  /** Pages of the current session, oldest first. The last one is shown. */
  pages: Attached[];
  context: BrowserContext | null;
};

const g = globalThis as typeof globalThis & { __liveBus?: Bus };
const bus: Bus = (g.__liveBus ??= { listeners: new Set(), last: null, live: false, pages: [], context: null });

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

  await cdp
    .send("Page.startScreencast", { format: "jpeg", quality: 70, maxWidth: 1300, maxHeight: 900, everyNthFrame: 1 })
    .catch(() => {});
}

async function restart({ cdp }: Attached) {
  await cdp.send("Page.stopScreencast").catch(() => {});
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 70, maxWidth: 1300, maxHeight: 900, everyNthFrame: 1 });
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
  const page = active();
  if (!page || page.isClosed()) return "no live page";
  switch (input.type) {
    case "click":
      await page.mouse.click(input.x, input.y);
      return "ok";
    case "wheel":
      await page.mouse.move(input.x, input.y);
      await page.mouse.wheel(input.dx, input.dy);
      return "ok";
    case "key":
      await page.keyboard.press(input.key);
      return "ok";
    case "text":
      await page.keyboard.insertText(input.text);
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
