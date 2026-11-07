import type { BrowserContext, Locator, Page } from "playwright";

/**
 * A visible cursor for each browser agent (D36), drawn inside the page so it shows in the live view.
 * It follows real mouse events: before the engine types into or picks a field it moves the real mouse there
 * (`pointAt`), and Playwright's own clicks move the mouse too. So the cursor shows where the agent actually
 * acts; it is not an animation laid on top.
 *
 * The cursor lives in a closed shadow root with pointer-events off, so the agent's own page reading (observe)
 * and the page's scripts cannot see or click it.
 */

export type CursorStyle = { color: string; label: string };

const CURSOR_SCRIPT = `(() => {
  if (window.__agentCursorInstalled) return;
  window.__agentCursorInstalled = true;
  let host = null, root = null, arrow = null, pill = null, x = -100, y = -100;
  const style = () => window.__agentCursor || { color: "#0060df", label: "Agent" };
  const paint = () => {
    if (!arrow) return;
    const s = style();
    arrow.setAttribute("fill", s.color);
    pill.textContent = s.label;
    pill.style.background = s.color;
  };
  const ensure = () => {
    if (host || !document.documentElement) return;
    host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;";
    root = host.attachShadow({ mode: "closed" });
    root.innerHTML = '<div id="c" style="position:fixed;left:0;top:0;pointer-events:none;transition:transform 220ms cubic-bezier(.2,.7,.2,1);will-change:transform;">'
      + '<svg width="34" height="34" viewBox="0 0 22 22" style="display:block;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.35))"><path id="a" d="M3 2 L3 18 L7.5 13.8 L10.6 20.4 L13.4 19.1 L10.4 12.6 L16.5 12.4 Z" stroke="#fff" stroke-width="1.4" stroke-linejoin="round"/></svg>'
      + '<span id="p" style="position:absolute;left:24px;top:28px;white-space:nowrap;font:600 15px/1 ui-sans-serif,system-ui,sans-serif;color:#fff;padding:6px 10px;border-radius:999px;"></span></div>';
    arrow = root.getElementById("a");
    pill = root.getElementById("p");
    document.documentElement.appendChild(host);
    paint();
  };
  const move = (nx, ny) => {
    x = nx; y = ny; ensure();
    if (root) root.getElementById("c").style.transform = "translate(" + (x - 3) + "px," + (y - 2) + "px)";
  };
  window.addEventListener("mousemove", (e) => move(e.clientX, e.clientY), true);
  window.addEventListener("mousedown", () => { const c = root && root.getElementById("c"); if (c) { c.animate([{ scale: 1 }, { scale: 0.82 }, { scale: 1 }], { duration: 260 }); } }, true);
  window.__setAgentCursor = (s) => { window.__agentCursor = s; paint(); };
})();`;

/** Called once per browser context by openSession(). */
export async function installCursor(context: BrowserContext) {
  await context.addInitScript(CURSOR_SCRIPT);
}

/** Give this page's cursor a colour and a label ("SLAB calculator"). Survives navigation. */
export async function setCursor(page: Page, style: CursorStyle) {
  const json = JSON.stringify(style);
  await page.addInitScript(`window.__agentCursor = ${json};`).catch(() => {});
  await page.evaluate(`window.__setAgentCursor && window.__setAgentCursor(${json})`).catch(() => {});
}

/** Fast test runs (HEADLESS=1) skip the extra mouse moves. */
const enabled = () => process.env.HEADLESS !== "1" && process.env.AGENT_CURSOR !== "0";

/** Move the real mouse to the middle of an element before acting on it, so the cursor shows where the agent works. */
export async function pointAt(page: Page, loc: Locator) {
  if (!enabled()) return;
  try {
    await loc.scrollIntoViewIfNeeded({ timeout: 1500 });
    const box = await loc.boundingBox({ timeout: 1500 });
    if (!box || box.width === 0) return;
    await page.mouse.move(box.x + Math.min(box.width / 2, 40), box.y + box.height / 2, { steps: 4 });
  } catch {
    /* the cursor is cosmetic: never fail an action because of it */
  }
}
