import type { Page } from "playwright";
import type { HandoffKind, HandoffStep } from "../handoffCopy";
import type { Note, Tracker } from "../legalAid";
import type { AskSpec } from "../plannerTypes";

/**
 * Shared contract for the generic browser workers ("Elliot anywhere"). Workers know NOTHING about any
 * country or site: no URLs, no site names, no per-site selectors. They get a page, a goal in words, and the
 * patient's values; everything else they find and judge live. Safety lives here, in code:
 *  - never click a final Submit/Send/Pay/Confirm on a form that carries the patient's data
 *  - stop at login walls and CAPTCHAs and report them (never bypass)
 *  - only official or relevant pages are trusted for facts; every fact carries a quote that is checked against the page text
 */

export type Ask = (spec: Omit<AskSpec, "id">) => Promise<string | null>;

export type WorkerCtx = {
  page: Page;
  note: Note; // tile note + note.log(kind, text, {shot, detail, url}) for the trace
  track: Pick<Tracker, "bump">;
  ask?: Ask; // ask the user one question (only for things no page can tell)
  /** Which step this tab belongs to, so a hand-off only promises what that step does. */
  step?: HandoffStep;
  /** Offer a login or human check to the patient and wait. Bound on the page by the crew; tests may set it directly. */
  handoff?: (wall: Wall, why: string) => Promise<"continued" | "skipped" | "timeout">;
  /** Judge from title, address and headings only. Tests set this so the suite never calls a model. */
  judge?: (snap: { url: string; title: string; headings: string; kind: HandoffKind; step?: HandoffStep }) => Promise<{ relevant: boolean; why: string }>;
};

/** Something that stops a worker and is reported honestly. */
export type Wall = { kind: "login" | "captcha" | "bot_check" | "phone_or_post_only" | "payment" | "not_found" | "dead_end"; detail: string; url: string };

/** A quoted fact from a page. `checked` = the quote was found in the page's own text by code (not by the model). */
export type Quote = { url: string; quote: string; checked: boolean };

/** A value the patient has given, offered to a form by key. Models see key + description; the value is typed by code. */
export type Value = { key: string; description: string; value: string; public?: boolean }; // public: not personal, may be shown to the model
