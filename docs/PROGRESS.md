# Progress log

Living log. Newest first. Every entry: what we did, what we tried, what happened, why. Failures count. Update it in the same commit as your code.

**Current focus (2026-11-07):** step 1 (NHS complaint) is implemented on the **Decisions API engine** (`gpt-6-luna`). Next: submit path (needs a decision, D14), steps 2-6, deeper firm-search work.

---

## Log

### 2026-11-07 · Luigi + Codex · DONE · Connect NHS fill to the app
Connected the disabled Step 1 button to the existing NDJSON API and Decisions agent. The UI handles split stream chunks, errors, missing information and completion, and blocks draft edits/repeated clicks while filling. The API rejects incomplete profiles/empty required draft text and tolerates disconnected stream readers. Added an optional browser review period with cleanup after window close or 10 minutes; CLI behavior is preserved.

Verified through localhost:3000: clicked the demo shortcut and approval/fill button, filled the actual NHS form in a separate visible browser, and received `ready_to_submit` with no unfilled required fields. Screenshot visually inspected. Evidence in ignored `.runs/2026-11-07T16-18-56-428Z/` and `.runs/nhs-ui-result.png`. Nothing submitted. TypeScript and ESLint passed. Node initially failed under the filesystem sandbox; checks succeeded with approved elevated execution. Starting another dev server failed because the user's server was already running; used that server for the test. Submission and reCAPTCHA remain untested.

### 2026-11-07 · Om + Claude · IN PROGRESS (pushed on a branch) · Interview uses the right input for each question (D28)
Om asked that not everything be a text box. Questions and input types are now chosen in code (`lib/agent/inputs.ts`): free text for the first name and the story; a date picker (exact, month and year, own words) and text fields for when and where; buttons for who it is about, the contact method and the email consent; a form with title dropdown, tel, email and postcode fields; a checklist for the outcome. Widget answers send `answer` and make no model call. The profile tab got the same input types (title dropdown, tel, email, postcode format, date picker on the timeline).
**Checked:** `tsc --noEmit` and `eslint .` pass; a script over the pure functions (order of questions, validation, outcome sentence, decline clears the method, consent cannot be set from another question); `interviewTurn` run through the whole widget path without a model; `next build`; a Playwright run of the whole onboarding in Chrome with only the story turn mocked, asserting each step's input types, the postcode error, the decline path and the final summary.
**Not checked (do not claim otherwise):** the free-text model path with the new extraction prompt (no OpenAI key available to the agent); the profile tab's input types by assertion (the last assertion of the browser script was not re-run after a test-helper fix); mobile layout; keyboard-only use; the title list and hospital suggestions against the real NHS form.
**Not done yet:** a README line for the script, `npm run agent:interview -- --sim` check, Tarun's review of the touched files.

### 2026-11-07 · Om + Claude · DONE (uncommitted), NOT YET TRIED LIVE · Interview wording tuned (D27)
Om said the intake replies felt generic and asked for a medical-and-legal manner with no jargon, leaning slightly towards a doctor or a lawyer depending on the stage. Rewrote the prompt in `lib/agent/interview.ts`: a "How you sound" block (plain words, no medical term the user has not used first, no legal term ever, one short acknowledgement then one question, British spelling) and five stages (story as a GP; details as a solicitor; practical details as a clerk; goals as a solicitor; wrap-up). New opening line in `lib/agent/chat.ts`. Every earlier rule is kept word for word (order, one question, consent text, "done" criteria, required facts). One small addition: if the user says they do not want to add an outcome, accept that and move on.
**Checked:** `tsc --noEmit` and `eslint .` pass; a text check confirms the safety and data rules are still in the prompt and there are no em-dashes.
**Not checked (do not claim otherwise):** how the model behaves with it. No OpenAI key was available to the agent doing this work, so the interview was not run. To check: `npm run agent:interview -- --sim` and read the whole conversation for jargon, repeated sympathy and questions asked out of order.
**Known weakness:** the stage is worked out by the model, not by code, so it may drift. Fix if it does: compute the stage in code and pass it in.
**Not changed:** the draft complaint text (`draft.ts`) and the onboarding summary card; the request was about the interview's replies.

### 2026-11-07 · Om + Claude · DONE (uncommitted) · UI re-skinned with Wordsmith colours (D26)
Crawled 14 wordsmith.ai pages in a real browser (computed styles of text, backgrounds and buttons, plus the shared stylesheet) and rebuilt the UI styling from that palette. Replaced the zinc/black-white styling and the Geist fonts with tokens in `app/globals.css` and shared classes. **Did not copy Wordsmith's font files** (Basel Grotesk, GT Ultra Median): commercial, and this repo is public. Shipped Inter and Newsreader (OFL) in `public/fonts/` instead. No logic changed.
**Merge:** the work was first done on 86ea0d0, held in a git stash, re-applied after the pull of 13d99cc, then merged by hand with Tarun's 87664a7, which changed `app/page.tsx` (the dev-only "Skip: use demo patient" button, D24). His logic is kept as is; only its classes changed. My decision is D26 because D24 was taken.
**Tried and fixed:** orange and teal alert text on their tints was about 3.4:1 contrast; switched to body-colour text with a coloured border. A first verification attempt in the VM failed (its `node_modules` is the Mac install, so there is no Linux SWC binary); verified in a clean clone with `npm ci` instead.
**Checked on 87664a7 plus the theme:** `tsc --noEmit`, `eslint .`, `next build` pass; pages screenshotted with fictional data (onboarding, summary card, step 1 with and without a draft, missing-facts alert, profile, `/dev`, and the skip button landing on `/case`); both fonts confirmed loaded from `/fonts`.
**Not checked:** a real `next dev` session (cloud build only); any non-Chrome browser; keyboard focus order.

### 2026-11-07 · Claude · DONE · Dev shortcut: "Skip: use demo patient" button (D24)
Tarun asked for a way to skip onboarding while developing. The onboarding page (`/`) now has a dashed "Skip: use demo patient" button that saves a fictional patient (Ailsa Reid) with a ready-written draft and goes straight to `/case`, so step 1 shows a draft with no model call. Shown in dev; hidden in production builds unless `NEXT_PUBLIC_DEMO_SKIP=1`. The demo data now lives in one place, `lib/agent/sample.ts`, shared by the button, `scripts/agent-nhs.ts` and the benchmark (the NHS benchmark task still passes after the refactor). Tested in a real browser: the skip lands on `/case` with the draft filled, the Profile tab is complete with consent ticked, the data survives a reload, no console errors. The demo conversation is a single note saying no interview took place. The draft text is static and was not written by the model on this run.

### 2026-11-07 · Claude (from the parent thread, with Tarun's go-ahead) · DONE · Complexity backlog recorded (D23)
Added `docs/COMPLEXITY_BACKLOG.md` (six items with status, owner and why each is real browser complexity), three rules in `AGENTS.md` (read at session start; update with every site test or status change, marking unverified items `untested`; refresh statuses and the date daily or at session end), an `ACTIVE_WORK.md` row for backlog upkeep, and D23. Statuses were set from what we have actually run; anything that came only from the parent thread's text is labelled unverified in the backlog (for example, the GP-complaints page, the claim that Kennedys/TLT/Burges Salmon act for the NHS or insurers, and whether SPSO has a searchable decisions archive).

### 2026-11-07 · Tarun + Claude · DONE · Decisions API (Luna) adopted as the browser engine (D16, D21)
**Why we tried it:** Tarun wanted to know if a fast decision model can drive the browser agent. The inspiration was TypeSafe's Jev; OpenAI's Decisions API is a comparable model with no waitlist. Tarun's bar: "as long as it's good enough, use it" - so we kept the test lean and did **not** run a full head-to-head against the tool loop.

**What it is (verified today against our key and OpenAI's official pages):**
- `POST /v1/decisions`, only model `gpt-6-luna`, generally available. You send `input` plus up to 400 typed `questions` (`predicate` = yes/no probability, `choice` = pick one of 2-255 with probabilities and `confidence`, `score`). It returns typed answers only. **No free text comes back.** There is no DOM input type; we send our own text snapshot of the page.
- `gpt-5.6-luna` is a **different** model (cheapest chat model in the GPT-5.6 family, Responses API). Do not confuse them.
- Official guide: input $0.10/M tokens, output not charged; model page lists output at $0.5/M (unreconciled, Discrepancy 3). "About 10x faster than Responses" is OpenAI's claim; we did not verify it, but our own timings below are fast.

**How our agent uses it** (`lib/agent/decisions.ts`, `lib/agent/decisionAgent.ts`): the model only *chooses*; our code *types*. Per page: observe, then **one** Decisions call with a `choice` question per empty field ("which saved value belongs here?", or which dropdown option), a `choice` per unselected radio group, a `predicate` per unticked checkbox ("do the saved values say the user agreed?"), and a `choice` for what to do next (click element N / finish / ask user). Code applies the answers, re-observes, and ends by verifying the live page itself. Text can only come from the saved values, so it cannot be invented.

**Results** (`npm run bench`, headless, nothing submitted to any organisation, pass/fail checked from the live page by code):
- Run 1: 7/10. Run 2 after fixes: **10/10**. Sites: NHS Lothian form, Anderson Strathern, MFMac, Irwin Mitchell, SLAB estimator, SPSO checker (yes path and "no final response" path), Law Society directory search, plus two public practice forms (httpbin pizza, selenium web-form).
- Per task: 1-11 Decisions calls, **0.3-2.8 s total model time**, 4-19 s wall clock (mostly the browser), about 2.3k-10.8k input tokens.
- The three run-1 failures: (a) Anderson: the site's phone box strips spaces, so **my check** was too strict; (b) Irwin Mitchell: **my check** expected a navigation that was not needed (see below); (c) Law Society: a **real bug**: a click reloaded the page during observation and crashed `observe`; fixed by waiting for load and retrying (`observe.ts`).
- **Safety behaviour observed:** the NHS honeypot field stayed empty; the selenium password, date, "default checkbox", Anderson "Company" and pizza "delivery time" (no saved value) stayed empty; the consent checkbox was ticked only when a saved value said the user agreed; with no consent saved, the NHS run ended `needs_input` with the exact consent text. SPSO "no final response" correctly stopped on the "too early" message instead of inventing a "Yes".
- Typical confidence was 1.0 on field mappings and about 0.8 on the navigation choice. A correct `none` can come with low confidence (0.34 seen), so we never gate `none` on confidence; only non-`none` answers below 0.6 are treated as unsure.

**Not tested (do not claim these):** a head-to-head against the tool loop (never benchmarked, so "better than" is **unverified**); more than 2 runs per task (flakiness unknown); sites with iframes, logins or heavy anti-bot; free-text-heavy tasks (the decision model cannot write text, which is why the draft step exists); actual cost per task; rate limits under load; real submission.

**Where the tool loop stands:** kept as a fallback (`AGENT_ENGINE=tools`, `lib/agent/browserAgent.ts`) for tasks that need free-form reasoning. It passes the NHS form (tested earlier) but was not run on the benchmark.

### 2026-11-07 · Claude · Probes of sites for the benchmark (done)
Built `scripts/probes/observe.ts` (prints what the agent sees) and generalised cookie handling (`dismissCookies` now finds reject/necessary buttons on any banner; accepts only if no reject exists). Findings:
- **Anderson Strathern:** form has First/Last name, Email*, Phone*, City, Company, "How can we help?"*, a Yes/No radio of unknown meaning, **two required checkboxes** (one says you are not eligible for legal aid unless seeking help with medical negligence; one is Terms/Privacy), a "how did you hear" dropdown, then Submit.
- **MFMac:** enquiry form in a popup: Your Name*, Telephone, Email*, urgency dropdown (Urgent / General enquiry), summary*, optional "send me a copy" checkbox.
- **Irwin Mitchell:** my first snapshot (about 2.5 s after load) showed only links and I wrongly logged "no form on that page". **The form is on the Scotland page and loads lazily**; the agent found and filled it. `/contact-us` has the same form (First*, Last*, Email*, Phone*, Description, "Request a callback", disabled until required fields are filled). Lesson: wait for lazy content before concluding a form is absent (Discrepancy 1, resolved).
- **SLAB estimator:** first screen is only a Yes/No radio ("Do you automatically qualify financially?"); later steps appear after answering.
- **httpbin pizza form** and **selenium web-form** are safe public practice forms used for breadth.

### 2026-11-07 · Claude · Collaboration docs and rules (done)
Added `AGENTS.md`, `CLAUDE.md`, `docs/PROJECT.md`, `docs/DECISIONS.md`, `docs/ACTIVE_WORK.md`; then (this entry) `docs/PROGRESS.md`, `docs/NOT_DOING.md` and the **pre-commit sync check** in `AGENTS.md` that Tarun asked for: before committing or pushing, pull, re-read the docs, compare your change with settled decisions, flag discrepancies. Why: several people and agents will edit the same repo, and without a shared record they would re-decide or override each other.

### 2026-11-07 · Claude · Profile tab, onboarding on the real agent (done, pushed)
Onboarding now calls `/api/agent/interview`. `/case` has a Profile tab to view and edit every fact (saved in localStorage), with a warning for missing required fields, and Step 1 reads from it. Tested end to end in a real browser: onboarding finished in 6 answers, edits survive reload, delete returns to onboarding. Facts live in the browser only (D9), so scripts cannot read them.

### 2026-11-07 · Claude · Agent core: interview, draft, browser loop (done, pushed)
Built `lib/agent/*` (see `AGENT.md`). Tested: interview with an LLM playing Ailsa (11 turns, ~2 s each, all facts captured); NHS Lothian form filled in 3 model steps; with consent withheld the run correctly stops and asks. **Bugs found by testing and fixed:**
- The form hides its real radios/checkboxes with `opacity:0` and draws its own, so the first version never saw "Me/Someone Else" or the consent box. Fixed in `observe.ts`.
- Choosing Email reveals a **required consent checkbox**; the agent first reported "ready" with it unticked. Now: checkboxes can only be ticked if the user explicitly agreed, and `finish` is verified against the live page (D7).
- A honeypot field (`nf-field-hp`) looks visible to scripts; now skipped.
- tsx/esbuild injects a `__name` helper that breaks code run inside the page; fixed with an init script.
- Next.js 16 rejects `export const runtime` in route handlers when `cacheComponents` is on.
- The interview asked for contact details before the story; reordered by prompt.
Not tested: the streamed `/api/agent/step1` route (it opens a visible browser), and submitting (not built, D14).

### 2026-11-07 · Claude · Repo, scaffold, first browser search (done, pushed)
Public repo `TarunTomar122/hacktheburgh-agent`. Next.js scaffold; a button that opens a visible Chromium and searches the Law Society directory for Edinburgh "Accident and injury" firms (97 results). The cookie banner blocked the first attempt because it appears late; fixed by waiting for it.

### 2026-11-07 · Main thread + Claude · "Hour-one" site checks (done)
Headless Playwright, nothing submitted. Legal aid estimator, NHS Lothian form and three law-firm forms were reported as working; SPSO's complaint checker and the Law Society directory were checked afterwards and work; GMC register search box exists but **results never loaded**. Details and URLs in `docs/PROJECT.md`. SLAB returned 403 to Playwright's default user-agent; fixed with a normal Chrome user-agent.

### 2026-11-07 · Tarun + Claude · Brainstorm and planning (done)
The story of how we got to the current plan is in `docs/NOT_DOING.md` (what we dropped and why) and in the earlier chat threads. Short version: started from "local fast decision model + browser use" (tax filing, medical portals), found the privacy and local-model pitch weak for this brief, dropped data/prediction tracks, and converged on one fictional patient in Scotland so the browser work is concrete. Tarun trimmed the agent to six steps (timeline, deadlines, NHS complaint, records request, ombudsman check, solicitor enquiries and case file). We then agreed the browser difficulty is thin, and that depth has to come from unfamiliar sites and failure handling.

---

## Discrepancies

Add a row whenever docs, code, reality or two people's work disagree. Keep rows until resolved.

| # | Date | Found by | What disagrees | Status |
|---|---|---|---|---|
| 5 | 2026-11-07 | Codex | Backend NHS filling existed, but the app button was disabled and the browser closed after four seconds. | **resolved**: connected button and stream, added review period, verified through app |
| 1 | 2026-11-07 | Claude | I logged "Irwin Mitchell Scotland page has no form". Wrong: the form loads lazily and is on that page. The original claim (form exists) was right. | **resolved** 2026-11-07: docs corrected, benchmark confirms the form is found and filled |
| 2 | 2026-11-07 | Claude | `DECISIONS.md` D7 and `AGENT.md` say the agent can **never** click submit. The benchmark needs "Next"/search buttons on read-only pages, which are submit-type. | **resolved** 2026-11-07: D17 `allowSubmit` implemented and used by the SLAB, SPSO and Law Society benchmark tasks only |
| 3 | 2026-11-07 | Claude | Guide says Decisions output tokens are free; model page lists output at $0.5/M. | open: unresolved, cost numbers in benchmark use measured token counts |
| 4 | 2026-11-07 | Claude | The handoff text for backlog item 1 said Irwin Mitchell's enquiry form "sits on a separate contact page". The benchmark shows the form loads **lazily on the same page** and also exists at `/contact-us`. | **resolved** 2026-11-07: the backlog uses the corrected wording |
| 5 | 2026-11-07 | Claude | `ACTIVE_WORK.md` says the UI is Tarun's ("Do not restyle without asking"). The UI was restyled at Om's request before Tarun confirmed. Only classes and fonts changed. | open: Tarun to confirm, supersede D25 or ask for it to be dropped |

## Open questions

- Can one project be entered in more than one sponsor track? (unknown)
- How exactly do the Wordsmith judges weigh "complicated"? We use Tarun's reading: steps, sites, branching, failure recovery.
- Does the invisible reCAPTCHA on the law-firm forms block an automated real submit? Never tested (and we do not submit).
- Does a clinical guidance page exist that fits Ailsa's case? Not checked.
- Which firms in the Law Society results act for patients rather than for the NHS/insurers? Not checked.
