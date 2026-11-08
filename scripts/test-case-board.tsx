// Deterministic check of the "Prepare your case" board (no network, no model): npx tsx scripts/test-case-board.tsx
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { boardParts, type BoardInput } from "../app/case/boardParts";
import CaseBoard from "../app/case/CaseBoard";

Object.assign(globalThis, { React });
let fail = 0;
const ok = (n: string, c: boolean) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n}`); };
const idle = { elliot: { state: "idle", note: "" }, nell: { state: "idle", note: "" }, robin: { state: "idle", note: "" }, iona: { state: "idle", note: "" }, kit: { state: "idle", note: "" } } as BoardInput["crew"];
const base: BoardInput = { says: [], crew: idle, firms: [], evidence: {}, enquiries: [], skipped: [] };
const say = (from: string, text: string, i = 0) => ({ i, t: 0, from, kind: "report", text }) as BoardInput["says"][number];

let p = boardParts(base);
ok("four parts in story order", p.map((x) => x.id).join() === "funding,lawyers,evidence,enquiries");
ok("before anything runs every part is waiting", p.every((x) => x.status === "waiting" && /Not started/.test(x.headline)));

p = boardParts({ ...base, crew: { ...idle, robin: { state: "working", note: "" } }, firms: [{ id: "a", sources: ["website"] }, { id: "b", sources: ["website"] }, { id: "c", sources: ["register"] }] as never });
ok("robin working shows a live count of firms checked on their own site (register entries do not count)", p[1].status === "working" && p[1].headline === "2 firms checked so far");

p = boardParts({ ...base, crew: { ...idle, nell: { state: "working", note: "" } }, findings: [{ crew: "nell", text: "Some Board: Adults can apply if the case is covered by the law here, but it does not mention medical claims." }], verdict: "unlikely" });
ok("live funding: verdict headline and a one-line summary without the publisher lead-in", p[0].headline === "Legal aid looks unlikely" && !!p[0].summary?.startsWith("Adults can apply"));
p = boardParts({ ...base, crew: { ...idle, nell: { state: "working", note: "" } } });
ok("funding mid-run says what is happening, not 'Checked funding with X'", p[0].headline === "Checking if legal aid could pay");

const result = { verdict: "unlikely", calculatorText: "You may not qualify", shortlist: ["a"], firms: [{ id: "a", name: "Firm A", website: "https://a.example", town: "Town", sources: ["website"] }, { id: "b", name: "B", sources: ["website"] }, { id: "c", name: "C", sources: ["register"] }], evidence: { guideline: { name: "NICE NG1: x", url: "https://n.example", points: [{ id: "1.1", text: "Do the thing" }] }, gaps: [{ guideline: "g", timeline: "t", question: "q" }] }, enquiries: [{ firmId: "a", firmName: "Firm A", status: "ready_to_send", filled: [{ label: "Name", value: "x" }, { label: "Email", value: "y" }] }] } as never;
const done: BoardInput = { ...base, result, crew: { ...idle, nell: { state: "done", note: "" } }, says: [say("nell", "Checked.")] };
p = boardParts(done);
ok("funding verdict in plain words with its source", p[0].headline === "Legal aid looks unlikely" && /Quoted from/.test(p[0].chip ?? ""));
ok("solicitors: shortlist and how many were checked", p[1].headline === "1 solicitor who could take your case" && /2 checked/.test(p[1].chip ?? ""));
ok("evidence: gap becomes the question headline", p[2].headline === "One question worth asking");
ok("enquiries say how many details were entered and nothing sent", /1 enquiry ready/.test(p[3].headline) && /2 details filled, nothing sent/.test(p[3].chip ?? ""));

p = boardParts({ ...base, skipped: ["iona"] });
ok("a skipped part says so", p[2].status === "skipped" && /Not checked/.test(p[2].headline));

const html = renderToStaticMarkup(<CaseBoard input={done} next={{ label: "Check and send 1 enquiry", note: "n", run: () => {} }} onFile={() => {}} onAgain={() => {}} />);
ok("board renders the headlines", html.includes("Legal aid looks unlikely") && html.includes("Ready for you to check"));
ok("the one-line summary shows, the quote stays hidden until a row is opened", html.includes("You may not qualify") && !html.includes("<blockquote"));
ok("next step and full case file offered when done", html.includes("Review and send") && html.includes("Open the full case file"));
ok("no Scotland-specific text", !/SLAB|Scotland|NHS Lothian/.test(html));
process.exit(fail ? 1 : 0);
