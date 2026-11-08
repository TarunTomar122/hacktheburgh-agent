// Deterministic check of the browser tiles' info (what each browser did): npx tsx scripts/test-browser-info.ts
import { KEPT, summarize } from "../app/browserInfo";
let fail = 0;
const ok = (n: string, c: boolean) => { if (!c) fail++; console.log(`${c ? "PASS" : "FAIL"} ${n}`); };
const trace = [
  { agent: "Nell · Legal aid", kind: "open", text: "Opened the legal aid checker" },
  { agent: "Nell · Legal aid", kind: "type", text: "Typed your income" },
  { agent: "Nell · Legal aid", kind: "pick", text: "Chose \"No\" for savings" },
  { agent: "Nell · Legal aid", kind: "click", text: "Clicked Next" },
  { agent: "Nell · Legal aid", kind: "click", text: "Clicked See result" },
  { agent: "Robin · Register", kind: "read", text: "Read the register" },
  { agent: "Nell · Legal aid", kind: "learned", text: "You probably do not qualify." },
];
const n = summarize(trace, "Nell · Legal aid");
ok("counts pages, clicks and answers entered", n.pages === 1 && n.clicks === 2 && n.entered.length === 2);
ok("lists what was entered", n.entered[0] === "Typed your income");
const r = summarize(trace, "Robin · Register");
ok("what we learned comes from the crew member's report", n.learned[0] === "You probably do not qualify." && summarize(trace, "Robin · Register").learned.length === 0);
ok("a read-only browser enters nothing", r.entered.length === 0 && r.pages === 1);
ok("an unknown browser is all zeros", summarize(trace, "Iona · x").pages === 0);
ok("kept browsers have their own id prefix", `${KEPT}1-a2`.startsWith(KEPT) && !"a2".startsWith(KEPT));
process.exit(fail ? 1 : 0);
