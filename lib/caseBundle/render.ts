import React from "react";
import { chromium } from "playwright";
import type { Profile } from "../profile";
import CaseBundle, { longDate } from "./CaseBundle";
import { bundleCss } from "./styles";

/** The bundle as one standalone HTML page (print CSS and fonts inside it). */
export async function renderBundleHtml(profile: Profile, preparedAt: Date = new Date()): Promise<string> {
  // Next refuses a static import of react-dom/server inside a route handler (it runs as a server component), and one failing import
  // takes every page of the dev server down. Loaded at run time instead, by Node itself, which is allowed: the bundle has no hooks, so
  // it renders the same with this copy of react-dom.
  const { renderToStaticMarkup } = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ "react-dom/server")) as typeof import("react-dom/server");
  const markup = renderToStaticMarkup(React.createElement(CaseBundle, { profile, preparedAt }));
  return "<!doctype html>" + markup.replace("</head>", `<style>${bundleCss()}</style></head>`);
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The patient's name for the page footer and the file name, from what was saved. */
export function bundleName(profile: Profile): string {
  return [profile.facts.title, profile.facts.firstName, profile.facts.lastName].filter((x) => x && x.trim()).join(" ") || "The patient";
}

/**
 * Prints the bundle to an A4 PDF with Playwright's Chromium (headless, its own short-lived browser: this is not a crew run, so
 * it does not go through the live view). Page numbers are in the footer.
 */
export async function renderBundlePdf(profile: Profile, preparedAt: Date = new Date()): Promise<Buffer> {
  const html = await renderBundleHtml(profile, preparedAt);
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || undefined });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: "print" });
    const footer = `<div style="width:100%;padding:0 18mm;font-family:Helvetica,Arial,sans-serif;font-size:7.5pt;color:#737373;display:flex;justify-content:space-between;-webkit-print-color-adjust:exact;"><span>Case bundle · ${esc(bundleName(profile))} · prepared ${esc(longDate(preparedAt))} · not legal advice</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`;
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, displayHeaderFooter: true, headerTemplate: "<span></span>", footerTemplate: footer });
    return Buffer.from(pdf);
  } finally {
    await browser.close().catch(() => {});
  }
}
