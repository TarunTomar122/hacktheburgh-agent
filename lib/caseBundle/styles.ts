import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Print styles for the solicitor-ready case bundle. Calm legal-document look: A4, serif headings (Newsreader), a quiet sans body
 * (Inter), hairline rules, sources shown as visible links. The two fonts are embedded as data URLs so the PDF looks the same on any
 * machine and needs no network. Colours are the app's tokens (app/globals.css) written out, because this page lives outside Tailwind.
 */

const font = (file: string) => {
  try {
    return readFileSync(join(process.cwd(), "public", "fonts", file)).toString("base64");
  } catch {
    return "";
  }
};

function fontFaces(): string {
  const newsreader = font("newsreader-latin-wght-normal.woff2");
  const inter = font("inter-latin-wght-normal.woff2");
  const face = (family: string, data: string) => (data ? `@font-face{font-family:"${family}";font-style:normal;font-weight:200 800;src:url(data:font/woff2;base64,${data}) format("woff2");}` : "");
  return face("Newsreader Bundle", newsreader) + face("Inter Bundle", inter);
}

export function bundleCss(): string {
  return `${fontFaces()}
@page { size: A4; margin: 18mm 18mm 20mm 18mm; }
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; background: #fff; color: #181818; font-family: "Inter Bundle", "Helvetica Neue", Arial, sans-serif; font-size: 9.6pt; line-height: 1.5; font-feature-settings: "kern", "liga"; }
.serif, h1, h2, h3, blockquote p { font-family: "Newsreader Bundle", Georgia, "Times New Roman", serif; }
a { color: #0b4fb3; text-decoration: none; }
p { margin: 0 0 6pt; orphans: 3; widows: 3; }
ul, ol { margin: 0 0 6pt; padding-left: 14pt; }
li { margin: 0 0 3pt; }
.url { display: block; font-size: 8pt; line-height: 1.35; color: #0b4fb3; overflow-wrap: anywhere; word-break: break-all; }
.muted { color: #737373; }
.small { font-size: 8.4pt; }
.label { font-size: 7.6pt; letter-spacing: 0.08em; text-transform: uppercase; color: #737373; font-weight: 600; margin: 0 0 2pt; }

/* cover */
.cover { break-after: page; padding-top: 14mm; }
.cover .eyebrow { font-size: 8.4pt; letter-spacing: 0.14em; text-transform: uppercase; color: #737373; margin: 0 0 10pt; }
.cover h1 { font-size: 34pt; line-height: 1.08; font-weight: 400; letter-spacing: -0.01em; margin: 0 0 6pt; }
.cover .sub { font-family: "Newsreader Bundle", Georgia, serif; font-size: 14pt; color: #525252; margin: 0 0 18pt; }
.cover .rule { border: 0; border-top: 1.2pt solid #181818; margin: 0 0 12pt; }
.facts { width: 100%; border-collapse: collapse; margin: 0 0 16pt; }
.facts th { width: 34mm; text-align: left; vertical-align: top; font-size: 7.6pt; letter-spacing: 0.08em; text-transform: uppercase; color: #737373; font-weight: 600; padding: 4pt 8pt 4pt 0; border-top: 0.6pt solid #e5e5e5; }
.facts td { vertical-align: top; padding: 3.5pt 0; border-top: 0.6pt solid #e5e5e5; }
.facts tr:last-child th, .facts tr:last-child td { border-bottom: 0.6pt solid #e5e5e5; }
.own { font-family: "Newsreader Bundle", Georgia, serif; font-size: 12pt; line-height: 1.5; border-left: 2pt solid #d8d3c7; padding: 2pt 0 2pt 12pt; margin: 4pt 0 14pt; }
.contents { margin-top: 14pt; }
.contents ol { list-style: none; padding: 0; margin: 4pt 0 0; columns: 2; column-gap: 10mm; }
.contents li { break-inside: avoid; font-family: "Newsreader Bundle", Georgia, serif; font-size: 11pt; color: #181818; margin-bottom: 3pt; }
.contents .n { display: inline-block; width: 16pt; color: #737373; }
.notice { background: #fcf7ee; border: 0.6pt solid #d8d3c7; padding: 7pt 10pt; margin: 12pt 0 0; font-size: 8.6pt; line-height: 1.45; color: #3a3a3a; }

/* sections */
section.part { margin: 0 0 16pt; }
#limits, #solicitors { break-before: page; }
h2 { font-size: 17pt; font-weight: 500; line-height: 1.2; margin: 18pt 0 8pt; padding-bottom: 4pt; border-bottom: 0.9pt solid #181818; break-after: avoid; }
h2 .n { color: #737373; font-weight: 400; margin-right: 6pt; }
h3 { font-size: 12.5pt; font-weight: 600; line-height: 1.25; margin: 0; break-after: avoid; }
h4 { font-size: 8pt; letter-spacing: 0.08em; text-transform: uppercase; color: #737373; font-weight: 600; margin: 8pt 0 3pt; break-after: avoid; }
.intro { color: #525252; margin-bottom: 8pt; }

/* timeline */
.timeline { list-style: none; padding: 0; margin: 0; border-left: 2pt solid #d8d3c7; }
.timeline li { padding: 0 0 8pt 12pt; margin: 0; break-inside: avoid; }
.timeline .when { font-weight: 600; display: block; }

/* route steps */
.step { border-top: 0.6pt solid #e5e5e5; padding: 9pt 0 4pt; }
.step:first-of-type { border-top: 0; }
.step-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10pt; break-after: avoid; }
.step-head .who { min-width: 0; }
.trust { flex: none; font-size: 7.6pt; letter-spacing: 0.04em; font-weight: 600; padding: 1.5pt 6pt; border-radius: 3pt; background: #f5f5f5; color: #525252; white-space: nowrap; }
.trust.solid { background: #ecfdfb; color: #00695f; }
.trust.likely { background: #e8f0ff; color: #0b4fb3; }
.trust.probably { background: #f6eeff; color: #6a00c4; }
.trust.differ { background: #fff0e8; color: #b53a00; }
.trust.none { background: #f5f5f5; color: #525252; }
.take { font-family: "Newsreader Bundle", Georgia, serif; font-size: 11pt; line-height: 1.45; margin: 5pt 0 4pt; }
.take strong { font-weight: 600; }
.kv { margin: 4pt 0; display: grid; grid-template-columns: 28mm 1fr; column-gap: 8pt; row-gap: 2pt; }
.kv dt { font-size: 7.6pt; letter-spacing: 0.08em; text-transform: uppercase; color: #737373; font-weight: 600; padding-top: 1.5pt; }
.kv dd { margin: 0; }
.kv dd ul { margin: 0; padding-left: 12pt; }
.points { margin: 4pt 0; }

blockquote.quote { margin: 4pt 0 6pt; padding: 3pt 0 3pt 10pt; border-left: 2pt solid #d8d3c7; break-inside: avoid; }
blockquote.quote p { font-size: 10.4pt; line-height: 1.45; margin: 0 0 3pt; }
blockquote.quote footer { margin-top: 2pt; }
blockquote.quote footer { font-size: 8pt; color: #525252; line-height: 1.35; }
blockquote.quote .by { font-weight: 600; color: #3a3a3a; }
.badge { display: inline-block; font-size: 7pt; letter-spacing: 0.04em; font-weight: 600; text-transform: uppercase; padding: 0 4pt; border-radius: 2pt; background: #f5f5f5; color: #525252; margin-left: 4pt; }

/* time limits table */
table.grid { width: 100%; border-collapse: collapse; margin: 2pt 0 8pt; }
table.grid th { text-align: left; font-size: 7.6pt; letter-spacing: 0.08em; text-transform: uppercase; color: #737373; font-weight: 600; padding: 3pt 8pt 3pt 0; border-bottom: 0.9pt solid #181818; }
table.grid td { vertical-align: top; padding: 6pt 8pt 6pt 0; border-bottom: 0.6pt solid #e5e5e5; }
table.grid tr { break-inside: avoid; }
.big { font-family: "Newsreader Bundle", Georgia, serif; font-size: 11pt; line-height: 1.4; }

/* funding / clinical */
.verdict { font-family: "Newsreader Bundle", Georgia, serif; font-size: 12.5pt; line-height: 1.35; margin: 0 0 6pt; }
.gap { border-top: 0.6pt solid #e5e5e5; padding: 6pt 0; break-inside: avoid; }
.gap:first-of-type { border-top: 0; }
.gap .q { font-family: "Newsreader Bundle", Georgia, serif; font-size: 11.2pt; line-height: 1.4; margin: 0 0 3pt; font-weight: 500; }
.caution { background: #fcf7ee; border: 0.6pt solid #d8d3c7; padding: 6pt 10pt; margin: 6pt 0; font-size: 8.8pt; }

/* firms */
.firm { border: 0.6pt solid #e5e5e5; border-radius: 3pt; padding: 8pt 10pt 4pt; margin: 0 0 9pt; break-inside: avoid; }
.firm .head { display: flex; justify-content: space-between; align-items: baseline; gap: 10pt; margin-bottom: 4pt; }
.firm .town { color: #737373; font-size: 8.6pt; }
table.checks { width: 100%; border-collapse: collapse; margin: 2pt 0 4pt; }
table.checks td { vertical-align: top; padding: 3pt 8pt 3pt 0; border-top: 0.6pt solid #ededed; }
table.checks td:first-child { width: 36mm; color: #525252; }
table.checks td.res { width: 22mm; font-weight: 600; }
.yes { color: #00695f; }
.no { color: #b53a00; }
.unk { color: #737373; }
.status { background: #fafaf9; border: 0.6pt solid #ededed; padding: 5pt 8pt; margin: 4pt 0 4pt; font-size: 9pt; }
.status b { font-weight: 600; }

.note p { margin-bottom: 5pt; }
.refs { font-size: 7.8pt; color: #737373; margin-top: 8pt; overflow-wrap: anywhere; }
`;
}
