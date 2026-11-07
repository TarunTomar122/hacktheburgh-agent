# Decision log

**Rules.** Append only. Never edit or delete an entry. To change a decision, add a new entry that says `Supersedes D<n>` and explain why. Status is `decided` (a teammate chose it) or `proposed` (an agent suggested it and nobody objected yet; challenge it freely). Newest at the bottom.

Format: `D<n> · date · who · status` then decision, then why.

---

**D1 · 2026-11-07 · Tarun · decided**
Enter the Wordsmith.AI browser-use track. Legal is a bonus, not required.
Why: the user's interest; the slide says legal is "ideally, not required".

**D2 · 2026-11-07 · Tarun · decided**
Case is a single fictional patient, Ailsa, in Scotland (NHS Lothian), with a missed scaphoid fracture.
Why: one country keeps rules simple; the case is easy to explain. All legal facts about it are unverified (see `docs/PROJECT.md`).

**D3 · 2026-11-07 · Tarun · decided**
Product shape: a local web app (Next.js) with a Node server that drives a **visible** Playwright Chromium window. Not a browser extension, not a desktop app.
Why: Playwright is already tested here; the audience can watch the browser; no login or extension permissions needed.

**D4 · 2026-11-07 · Claude, accepted by Tarun · decided**
Use a dedicated Playwright profile, not the user's real Chrome. No sign-in to any site.
Why: none of the sites in the flow need a login; a real profile exposes the user's tabs and logins to a model.

**D5 · 2026-11-07 · Tarun · decided**
Build onboarding (name, story, follow-up questions) then a main app with a steps sidebar. Step 1 is the NHS complaint. A Profile tab holds the saved information.

**D6 · 2026-11-07 · Claude · proposed**
Agent design: three separate jobs. (1) interview, structured output; (2) draft complaint text from facts only, which the user edits; (3) browser tool loop that may only type values from the approved facts and draft.
Why: free text is generated in one reviewable place, so the browser loop cannot make things up.

**D7 · 2026-11-07 · Claude · proposed**
Safety rules live in code, not prompts: the agent can never click submit; cannot tick consent checkboxes unless the user agreed; `finish` is verified against the live DOM; the model must `ask_user` instead of guessing missing data.
Why: found in testing that the agent first reported "ready" with an unticked required consent box.

**D8 · 2026-11-07 · Claude · proposed**
Models via OpenAI, set by env var: browser `gpt-5.4-mini` (reasoning `none`), interview `gpt-5.4-mini` (`low`), draft `gpt-5.4` (`low`).
Why: available on the team key; fast enough in a one-call test. Not benchmarked properly. Change freely, but log it here.

**D9 · 2026-11-07 · Claude · proposed**
Store the profile in the browser's localStorage only, for now. API routes receive facts from the client.
Why: simplest. Limit: not shared across devices, and CLI scripts cannot read it.

**D10 · 2026-11-07 · Claude, agreed by Tarun · decided**
Do not claim "everything runs locally". Honest claim: data only goes to the organisations the user chooses, plus the model provider.
Why: the agent sends the user's details to the NHS and law firms by design.

**D11 · 2026-11-07 · Claude · proposed**
Keep firm discovery in the browser (Law Society directory), not a search API like Exa. Use APIs only where a browser adds nothing (e.g. reading email, looking up a document).
Why: the track scores browser-use complexity.

**D12 · 2026-11-07 · Claude · proposed**
Drop "booking an independent medical expert" from the agent.
Why: the solicitor instructs and pays experts; booking is irreversible and not needed to prepare a case.

**D13 · 2026-11-07 · Tarun · decided**
Email connection, if added, goes through a managed-auth connector service (Composio, Arcade, Nango, Pipedream style), not hand-built OAuth. Lower priority than the browser flows. Not started.

**D14 · 2026-11-07 · Claude · proposed**
Submitting the NHS form is not implemented. It needs: a human approval path, a rule for test data (a real submit sends a real complaint), and a plan for the invisible reCAPTCHA.
Why: the safest default until the team decides.

**D15 · 2026-11-07 · Tarun · decided**
Repo is public: https://github.com/TarunTomar122/hacktheburgh-agent. Fictional data only; no secrets committed.

**D16 · 2026-11-07 · Tarun · decided (to trial) · adoption pending**
Trial OpenAI's Decisions API (`POST /v1/decisions`, `gpt-6-luna`) as the browser agent's decision engine and compare it with the existing tool-calling loop (`gpt-5.4-mini`) on a benchmark of real and practice sites. If it works, update the rules and make it the default for the browser part; otherwise keep D8.
Why: Tarun saw people use a fast decision model (Jev) for browser use. OpenAI now offers a comparable one with no waitlist. Design and plan: `docs/PROGRESS.md`.
**Adoption criteria (proposed by Claude, change if you disagree):** pass rate at least equal to the tool loop on the benchmark; no safety-rule violations (never submits, never ticks unagreed consent, never fills the honeypot, never invents data); clearly faster or cheaper; low-confidence answers lead to `ask_user`, not guesses.

**D17 · 2026-11-07 · Claude · proposed, implemented and in use (supersedes part of D7)**
Per-task `allowSubmit` flag. Submit-type buttons are clickable **only** on read-only pages (search, calculators, "next" in a checker). It is set by the task author in code, never by the model, and is **never** set for forms that send data to an organisation (NHS, law firms). D7's "never submit" still holds for those.
Why: the SPSO checker, SLAB estimator and Law Society search move forward with submit-type buttons, so a blanket ban makes them untestable.

**D18 · 2026-11-07 · Claude · proposed**
Cookie banners are handled by code, not the model: prefer "reject / necessary only"; click "accept" only if the banner offers no way to refuse and blocks the page. The outcome is logged.
Why: banners appear late, intercept clicks, and differ per site; handling them deterministically removes a whole class of flaky failures.

**D19 · 2026-11-07 · Tarun · decided**
Before any commit or push, every agent and person pulls the latest work, re-reads the docs, checks their change against settled decisions and other people's work, and **flags discrepancies** in `docs/PROGRESS.md` and to the human. Full procedure in `AGENTS.md`. Docs are updated in the same commit as the code.
Why: several people and agents work in one repo; without this they override each other.

**D20 · 2026-11-07 · Claude · proposed**
The benchmark mixes our real target sites (NHS Lothian, three firms, SLAB, SPSO, Law Society) with two public practice forms (httpbin.org/forms/post, selenium.dev web-form). Nothing is ever submitted. Pass/fail is checked from the live page by code.
Why: the real sites are what we need to work; the practice forms add breadth and a "do not invent data" test (the password field has no saved value and must stay empty).

**D21 · 2026-11-07 · Tarun + Claude · decided**
**The browser agent's engine is the Decisions API (`gpt-6-luna`)** via `lib/agent/decisionAgent.ts`. `fillNhsComplaint` uses it by default. The tool-calling loop (`browserAgent.ts`, `gpt-5.4-mini`) stays as a fallback: set `AGENT_ENGINE=tools`. **Supersedes D8 for the browser engine only**; D8 still applies to the interview (`gpt-5.4-mini`) and the draft (`gpt-5.4`).
Why: 10/10 on the benchmark on the second run (7/10 on the first, with one real bug fixed), 0.3-2.8 s of model time per task, and structurally safer: the model only chooses and our code types, so it cannot invent text. Tarun's bar was "good enough". The adoption criteria in D16 were met except "at least equal to the tool loop", which was **not measured**. If someone runs the benchmark with `--engine both` and the tool loop is clearly better, supersede this.
**Everyone implementing a step must use this engine** (call `runDecisionAgent`, or `fillNhsComplaint`-style wrappers). Do not write a new browser loop.

**D22 · 2026-11-07 · Claude · proposed**
Keep `scripts/bench.ts` as the regression suite for the browser agent. Run `npm run bench` before changing `observe.ts`, `decisionAgent.ts`, `browser.ts` or the values/goal wording, and log any drop in `docs/PROGRESS.md`. Add a task for each new site you automate.
Why: it caught a real navigation crash and two bad checks within minutes.

**D23 · 2026-11-07 · Tarun (go-ahead via the parent thread), recorded by Claude · decided**
Adopt `docs/COMPLEXITY_BACKLOG.md` as the shared plan for making the workflow complex **in the browser**, not padded. Six items, in suggested order: (1) vet law firms in depth, (5) show the obstacles we already handle, (2) work out where to complain or (3) search SPSO decisions (probe by hand for 15 minutes first), (4) a second persona. Item 6 (SLAB result feeds a firm form) slots in when steps 4 and 5 are wired together. **Avoid** the GMC register (results never loaded), more same-shape forms, and steps that are just code with a browser opened around them. Every agent follows three rules in `AGENTS.md`: read the backlog at session start, update it in the same commit whenever a site is tested or an item changes, and refresh statuses and the date daily or at session end. The items are proposed work, not commitments; owners start unclaimed.
Why: the track scores browser-use complexity, and our honest assessment is that the NHS form and the ombudsman checker are easy. These items are where the real difficulty is, and a shared, honest status list stops people duplicating or overstating it.

<!-- Add new entries above this line. Next number: D24 -->
