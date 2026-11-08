import type { Page } from "playwright";

/** Tabs in a hand-off: no screenshots and no event detail, so a password never lands in the recording. */
const hushed = new WeakSet<Page>();
const handed = new WeakSet<Page>();

export function hushPage(page: Page, on: boolean) {
  if (on) hushed.add(page);
  else hushed.delete(page);
}
export const isHushed = (page: Page) => hushed.has(page);

export function markHandedOff(page: Page) {
  handed.add(page);
}
export const tookHandoff = (page: Page) => handed.has(page);
