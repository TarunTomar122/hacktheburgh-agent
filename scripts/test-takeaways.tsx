// Deterministic check of the "what to know" route view (no network, no model): npx tsx scripts/test-takeaways.tsx
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import RouteMapCard from "../app/case/RouteMap";
import { trustOf, type RouteMap } from "../lib/agent/routeTypes";

Object.assign(globalThis, { React });
const route = JSON.parse(readFileSync("scripts/fixtures/route-takeaways.json", "utf8")) as RouteMap;
const html = renderToStaticMarkup(<RouteMapCard route={route} />);
const ok = (name: string, c: boolean) => { assert.ok(c, name); console.log(`PASS ${name}`); };

ok("headline shown", html.includes("Complain to the health board first, within 12 months"));
ok("inferred headline marked Probably", /Probably/.test(html));
ok("a stated one is Likely (one official site)", /Likely/.test(html));
ok("quotes are one click away (hidden until opened)", !html.includes("You can take up to 12 months to raise"));
ok("rows are buttons", /aria-expanded="false"/.test(html));
ok("missing parts listed on one quiet line", /Not found in this research/.test(html) && /Compensation/.test(html.split("Not found in this research")[1] ?? ""));
ok("no per-row 'Not found yet' clutter", !/Not found yet/.test(html));
const plain = renderToStaticMarkup(<RouteMapCard route={{ ...route, steps: route.steps.map((s) => ({ ...s, takeaway: undefined })) }} />);
ok("routes without takeaways (saved or demo) still use the old rows", /Details/.test(plain));
ok("trust: confirmed + stated = Solid", trustOf({ confidence: "confirmed" }).label === "Solid");
ok("trust: inferred beats confirmed", trustOf({ confidence: "confirmed", takeaway: { headline: "x", why: "y", inferred: true } }).label === "Probably");
ok("trust: differing sources", trustOf({ confidence: "likely", deadlineCheck: "sources_differ" }).label === "Sources differ");
ok("trust: unconfirmed", trustOf({ confidence: "unconfirmed" }).label === "Not confirmed");
