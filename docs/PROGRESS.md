# Progress log

Living log. Newest first. Every entry: what we did, what we tried, what happened, why. Failures count. Update it in the same commit as your code.

**Current focus (2026-11-07):** step 1 (NHS complaint) and step 2 (SPSO form, stops at review) run on the **Decisions API engine** (`gpt-6-luna`); the case UI follows the design system in `docs/DESIGN.md`. Next: submit path (needs a decision, D14), steps 2-5 (see D29 for the new numbering), deeper firm-search work.

---

## Log

### 2026-11-08 - Om + Claude - DONE - Timeouts on model calls

A stuck model call could freeze a run for up to 10 minutes with no message (the OpenAI SDK's defaults are a 10-minute timeout and 2 retries; `decide()` used a plain `fetch` with no timeout).
- `lib/agent/llm.ts`: the OpenAI client now gives up after 90 s, with 1 retry (`OPENAI_TIMEOUT_MS` overrides). All calls use low or no reasoning effort.
- `lib/agent/decisions.ts`: each Decisions API try gives up after 20 s (`DECISION_TIMEOUT_MS`); a timeout or network error is retried like a 5xx, up to 3 tries, then fails as before (the NHS step then switches to the backup engine).
- Not run against the live API from here (the sandbox cannot reach it). `tsc` and eslint clean on both files.

### 2026-11-08 - Om + Claude - DONE - NHS Submit detection confirmed; new fills reset "sent" (D84)

- **Found:** the 03:58 "no POST" was not the site. Clicks in the live panel only reach the page in Take control mode; without it the click is dropped. With Take control, a real Submit at 05:25 was detected end to end (see D84 for the log). This sent a real complaint to NHS Lothian.
- **Fixed:** a new fill clears the step's filled/sent marks (`app/case/page.tsx`, `ComplaintRun.tsx`, `OmbudsmanStep.tsx`, `YellowCardStep.tsx`); done boxes say "browser panel" and tell the user to Take control first.
- **Diagnostics kept** (dev terminal): `[submit-watch]` start line, clicks and form submit events that reach the page, every POST (separate caps for captcha/analytics so they cannot crowd out the form's POST), form messages; `[live-input]` lines for each panel click (with the element hit), Close and Back. Files: `lib/browser.ts`, `lib/liveview.ts`.
- **Still unverified:** SPSO and Yellow Card confirmation wording (never submitted).
- `tsc --noEmit` clean except the known `scripts/test-restart-logout.ts` error; eslint clean on `app/case`, `lib/browser.ts`, `lib/liveview.ts`. UI checked by Om on the Mac.

### 2026-11-08 - Om + Claude - DONE - Yellow Card only reports "ready" on Step 4 of 4

Run 2026-11-08 04:09 ended `ready_to_submit` on `/new-report` while the page was still a loading spinner: an empty page has no required fields, so the engine called it done, and the app would have marked step 6 filled. The old guard only caught `/`, `/report-guide` and `/about-you`.
- `fillYellowCard` now accepts "ready" only when "Step 4 of 4" is visible on the page. Otherwise it looks again twice (on `/new-report` it first waits up to 10 s for "Step n of 4"), then ends `incomplete` with the browser parked, so "Try again" carries on from that page. File: `lib/agent/yellowCard.ts`.
- Verified on the Mac: `npm run agent:yellowcard` (04:56) ended `ready_to_submit` on Step 4 of 4. `-- --someone-else` stops at Step 1 asking for the patient's initials, as designed (D82); the answer-and-resume path was not run from the CLI.
- `tsc --noEmit` clean except the known `scripts/test-restart-logout.ts` error; eslint clean on the file.

### 2026-11-07 - Om + Claude - DONE (not yet tried on Tiger) - Cases saved to the account in Tiger Data (D75)

Signed-in people's cases are stored in Postgres (Tiger Data) keyed by their Auth0 id and show on any device; the browser keeps an instant copy. Onboarding demo personas run in a per-tab sandbox and write nothing. Files: `lib/db.ts`, `app/api/profile/route.ts`, `lib/profile.ts`, `app/AccountMenu.tsx`, `app/page.tsx`, `app/welcome/page.tsx`, `app/case/ProfileTab.tsx`, `scripts/db-check.ts`, `.env.example`, `package.json`. 22 checks pass against a local Postgres. **Unverified:** the real Tiger connection (`npm run db:check`), real Auth0 email-code login.

### 2026-11-07 - Luigi + Codex - Email option for explanation/apology (D73)
Added an explicit email-draft route for explanation-only, apology-only and both together, with formal complaint and compensation alternatives. Mixed/additional goals keep the existing route choice. Email drafts contain saved facts and a request, editable subject/body persisted locally, copy/download, no unverified recipient or automatic sending/escalation. Profile can switch existing eligible cases to email mode. A facts-change warning preserves edits until explicitly rebuilt.
Verified scripts/test-complaint-email.ts: goal combinations and mixed-goal exclusion, isolated browser enters email mode without agent requests, edits survive reload, formal complaint switch works and no browser errors. TypeScript/lint passed; production build checked. Fictional data only; no external submissions. Changes remain local.

### 2026-11-07 - Luigi + Codex - UI refinements sync for push
User authorized pushing the welcome spacing, removal of the NHS/SPSO debug consoles and automatic opening of the SPSO browser panel. Main was already up to date with no conflicts. Remote night updates were fetched but not merged into main. TypeScript, lint and diff checks passed; welcome desktop/mobile screenshots were inspected in the preceding turn.

### 2026-11-07 - Luigi + Codex - Open the ombudsman live browser automatically
The ombudsman fill action now dispatches the same live-open event as the NHS fill action. The existing live-view lifecycle opens the panel when a browser becomes available, with the same hide/close behaviour. No form filling or submission logic changed.

### 2026-11-07 - Luigi + Codex - Remove the NHS debug console
Removed the black technical activity log from the NHS Lothian step too, as requested. The live browser panel, filling indicator, errors, requests for missing information and completion message remain available. Server logging is unchanged.

### 2026-11-07 - Luigi + Codex - Remove the ombudsman debug console
Removed the black technical activity log from the ombudsman screen at the user's request. The filling indicator, errors, missing-information questions and final result remain. Other steps and server logging are unchanged.

### 2026-11-07 - Luigi + Codex - Tighten welcome-screen spacing
Reduced the gaps before the name input, submit button and reassurance text, and balanced the form's top/bottom padding. Retained existing typography and design tokens. Checked desktop (1280x800) and mobile (390x844) screenshots in an isolated browser; no mobile horizontal overflow. TypeScript and lint passed. Local change, not pushed.
### 2026-11-07 · Lea + Claude · IN PROGRESS (branch `feature/yellow-card`, pushed 2026-11-08, not merged) · Yellow Card track (D79, proposed)
Added a third track and step 6, which fills the MHRA Yellow Card report and stops before it is sent (see D79).
- **Probed by hand (in-app browser, nothing sent):**
  - **Home page:** a product search whose suggestions are `role=option` items (e.g. 10+ amoxicillin products), then a "Start report" button.
  - **`/report-guide`:** two dropdowns. "Member of the public / Healthcare professional", then "A suspected side effect / fake product / defective product".
  - **`/about-you`:**
    - who it relates to (You / Consumer / Your child / Someone else)
    - title, first and last name, email (required)
    - an address search and optional address lines
    - postcode (required)
    - an optional phone number with a long country-code list
    - a contact-method checkbox
    - a required privacy checkbox
    - an optional "Set Password" with a Register button, and "Continue without registering"
  - Not seen beyond `/about-you`.
- **Tried and failed:**
  - `node` is not on the PATH and there is no `node_modules` in this checkout, so `tsc`, `eslint`, `npm run bench -- --only yellowcard` and the app could not be run here.
  - The first scripted probe was blocked for the same reason; I used the in-app browser instead.
- **Not checked:** anything at runtime. The code follows the step 2 (SPSO) pattern line for line where it can.
- **First runs by Lea (WSL), 2026-11-07:**
  - The Chromium launch failed on missing `libnspr4.so`; fixed with `npx playwright install-deps chromium`.
  - Then "OPENAI_API_KEY is not set"; fixed by adding `.env.local`.
  - Then the product pick worked (the model chose "PEPTO-BISMOL" from 4 suggestions, confidence 1). But the engine looked at `/report-guide` 46 ms after the address changed, before the app had drawn the dropdown. It saw nothing to do and reported a false "ready".
  - **Fix:** wait for a dropdown with options before starting. When the engine "finishes" on an early page (home, `/report-guide`, `/about-you`), look again up to twice, then report `incomplete` instead of ready.
  - Also removed the "open the Yellow Card site yourself" link (Lea).
- **Runs by Claude, 2026-11-08 00:00-00:11** (dev server in WSL, Isla demo patient, in-app browser; nothing sent):
  - **Stale code found:** edits made from Windows were not picked up by `next dev` running in WSL on `/mnt/c`, even with polling. The compiled chunk in `.next/` still had the old engine. **After every edit: stop the server, delete `.next`, start again.** This probably explains Lea's "asks again / sent back to the profile" run, which used code older than described. That run was not reproduced with the demo patient.
  - **Product pick:** "amoxicillin" gave 19 maker-specific entries, and the model said "none". Fixed: an exact match is taken first. Otherwise the model is asked for the plainest entry, accepted unless "none" is at least 0.5 likely. It now picks e.g. "GENERICS UK AMOXICILLIN".
  - **`/report-guide`:** both dropdowns answered, Next step pressed.
  - **`/about-you`:**
    - All fields filled.
    - **The privacy box** is a 0x0, opacity-0 input inside a styled label, so `check()` and `check({force})` fail ("outside of the viewport"). **Engine change in `decisionAgent.ts` `tickCheckbox`:** after both attempts fail, click the box's label and confirm it is ticked. Existing forms are unaffected; this only runs where they used to fail. Tarun's area: bench not rerun.
    - The safety filter hid "Continue without registering"; fixed with a negative lookbehind.
    - The site rejects phone numbers with spaces ("Only digits are accepted"), and the engine pressed Continue 26 times without reading the error (plan gap A). Fixed for this site by sending digits only.
  - **`/new-report` step 1 of 4, "Whose side effect":** at least one of initials, sex or age is required. Initials are now derived in code. The first fill timed out (the app redraws the form after loading); the runner now looks again, at most twice.
  - **`/new-report` step 2 of 4, "Side effects" (reached, not done):**
    - reactions are added one at a time via an "Add" button (opens something not yet seen)
    - 10 severity checkboxes, from "Not serious" to "Life threatening"
    - an optional description box ("do not add identifiable patient information")
    - a dropdown "Do you think this reaction occurred as a result of a mistake … prescription, dosing, dispensing or administration?"
    - The agent stopped here and asked what to do. Steps 3 and 4 are still unseen.
- **2026-11-08 00:40-00:52, after Lea's report "it fills in something random after an error instead of asking":**
  - **Merged `main`** (11 commits: Auth0, Tiger Data D75, onboarding routes D76, email route D73).
    - Conflicts resolved in `ProfileTab.tsx`, `TrackChoice.tsx`, `DECISIONS.md` and `PROGRESS.md`. Both sides were kept.
    - **Our decision was renumbered D79** (first D77; Luigi took D73, then Om took D77 and D78).
    - **D76 replaced the outcome checklist with a single "What would you like help with?" choice.** The two Yellow Card options are now two more `HELP_ROUTES` ("Report a side effect from a medicine", "Report a faulty or fake medicine or device"). Like D76's routes, they choose the track directly, and they store the matching outcome sentence so `track.ts` agrees.
    - `package-lock.json` had only WSL npm noise (`libc` fields dropped), so it was restored.
  - **Cause, from Lea's run log:** the "Patient initials" fill timed out (the app redraws the form), and **in the same step the engine clicked "Next step"**. Its guard against advancing with unresolved fields only covered `submit` buttons. Then on step 2 it ended with "unclear what to do next" and a dead-end "Try again".
  - **Engine changes (`decisionAgent.ts`, Tarun's area; bench not rerun):**
    1. An action that throws is retried on a fresh look, at most twice per field, and the engine never navigates in the same step. After that, the field is asked about.
    2. When the model says "ask the user" and nothing specific is unresolved, the engine asks for the page's empty fields not marked "(Optional)", or one plain question naming the page, instead of an empty question.
  - `observe.ts`: labels are kept to 240 characters, not 140, so a long form question shown to the user is not cut off.
  - **Verified live (Isla demo, nothing sent):**
    - Step 1 retried the initials and filled them before pressing Next.
    - Step 2 asked "Do you think this reaction occurred as a result of a mistake…?". Answered "No"; the next run set that dropdown (confidence 1), then asked about the rest of the "Side effects" page (the reactions, entered through "Add").
  - `tsc` passes after `npx next typegen` (the generated route types were older than `main`'s new `/welcome` page). `eslint .` is clean.
  - **Not done:** the "Add" reaction dialog, report steps 3-4, and the final check page.
- **2026-11-08 01:00-01:24, Lea:** "can only pick one option" and "it never says what it does not have" (D80). Pulled first: `main` had no new commits.
  - **Lea's run (01:04):** the faulty-product branch looked at "Step 1 of 2 · Personal Details" 9 ms after the click. The site had already carried the details over, so nothing looked empty, and the engine fell back to the vague page-level question added the night before.
  - **Fixed** as in D80:
    - a tick-list in onboarding
    - the engine looks again, then asks for named fields, then moves on or says where it is stuck
    - a limit on repeated clicks
    - a yes to a tick-box question counts as agreement
  - **Verified live** (in-app browser, WSL dev server, fictional data, nothing sent):
    - **Onboarding:** with three options ticked, the review lists all three, and the suggestion page says "You asked for help with 3 things" and offers only those.
    - **Faulty product, "covid 19":**
      - The agent looked again, then asked 'Do you agree to "Terms and conditions"? (yes or no)'. The page really does require it: "Field is required" in the screenshot.
      - Before the `extra.ts` change, the "yes" did not tick the box, and the agent pressed "Next step" 24 times (the reason for the repeat limit). After it: ticked (probability 1), moved to "Step 2 of 2", filled the defect details from the story.
      - Then it asked "Is sample available for MHRA arranged testing?" and "Has the supplier been contacted?".
  - `tsc` and `eslint .` are clean.
  - **Not checked:** the NHS, SPSO and step 4 forms with the engine changes (`npm run bench` not rerun); the full report up to its final page.


### 2026-11-07 - Luigi + Codex - Edit the final onboarding summary
Added Edit details before starting the case: names, treatment location, story, desired outcome, contact details and dated timeline events can be corrected, added or removed. Changes stay in a local editor until Save changes; Cancel discards them. Required fields, dates and contact formats are validated; the start button is hidden during editing. Verified in an isolated browser using a mocked interview and fictional data: cancel, rejected empty first name, corrected story/timeline, and persisted facts after starting the case. The first test found textarea accessible labels included content; explicit labels fixed this. A test selector also matched Next's route announcer and was narrowed. TypeScript and lint passed. No real model calls or submissions in the editor test. User subsequently authorized push; final fetch/pull found main up to date and no conflicts.

### 2026-11-07 - Luigi + Codex - Give the event question its date context
The event-description screen now shows the date just entered, including rough dates in the user's own words, and asks what happened at that time. Added a hint distinguishing the accident from a medical appointment, with an example. Exact dates display in readable UK format. No answer-processing changes.

### 2026-11-07 - Luigi + Codex - Retry unintelligible story answers
The existing extraction call now separately judges whether the latest free-text answer is understandable. Unintelligible text raises the existing InputError before any facts are merged, keeping the current question and entered text for correction. The prompt explicitly accepts short answers, typos, uncertainty and other languages. This does not add dictionary-based restrictions to personal names or structured form fields. Verified with live extraction on fictional text: both random-letter examples rejected; "I fell" and a misspelled arm-injury account accepted; caller facts unchanged. TypeScript and lint passed. This remains model judgment, not a guarantee for every possible input.

### 2026-11-07 - Luigi + Codex - Assume own care in onboarding
User requested removing the own-care question. New facts and missing values in older profiles default to me; onboarding skips the who stage and its progress slot. Explicit someone_else values remain intact. Already-open interviews on that question advance to the next missing detail after hot reload.

### 2026-11-07 - Luigi + Codex - One question per onboarding field
The shared interview reply stayed above every field in a grouped answer, so the date question remained visible above the later event-description input. Hide that group-level heading for form inputs and promote the current field's label to the screen heading. Other question types keep their existing heading. Field order, validation and submitted answers are unchanged.
### 2026-11-07 - Om + Claude - DONE - Auth0 sign-up, log-in and log-out (D74)
Om asked for user sign-ups and log-ins with Auth0. Built with `@auth0/nextjs-auth0` 4.33.0 (peer ranges allow Next 16 and React 19.2+; checked with `npm view`). New: `lib/auth0.ts`, `proxy.ts`, `app/welcome/page.tsx`, `app/AccountMenu.tsx`; changed: `app/layout.tsx`, `app/page.tsx` and `app/case/Header.tsx` (header controls), `lib/profile.ts` (per-user key), `.env.example`, `package.json` and the lock file. **What went wrong on the way:** (1) the SDK rejects a domain with a port and `localhost`, so the local test tenant had to sit on port 443 under a fake hostname; (2) reading the session in the layout failed Cache Components' rule (runtime data outside `<Suspense>`), which also breaks `next build`: fixed with Suspense in the layout and on `/welcome`; (3) `npm install` on the Linux VM stripped `libc` fields from 38 unrelated lock entries, so the lock file was rebuilt by hand: only the 9 new packages added, nothing removed. Tested against a local stand-in tenant, not a real one (details and the 17 checks in D72). **Om still has to** create the tenant and put four settings in `.env.local` (steps in D72), then `npm install`. Until then the app runs without accounts, as before.

### 2026-11-07 - Luigi + Codex - Unsupported complaint route (D71)
Pulled a48cc49: D69 restored the old step 1 page, so the screenshot's crew flow was no longer the default. Fixed both screens and the server runners. Unconfirmed treatment locations now get a facts-only editable draft, copy/download, and explicit unverified recipient/deadlines/guidance; no retry or NHS/SPSO continuation is offered there. Server tests prove Mater Dei returns before browser/model work with no time-limit or guideline result. Added a fracture-context gate for the complaint evidence tool and draft evidence injection. The allowlist is intentionally limited, so unrecognised NHS clinics require manual checking. Existing saved summaries containing unsupported guidance are replaced in this view with saved-story/timeline text, without changing saved facts.
Verification: scripts/test-complaint-scope.tsx passes (including both NHS entry points rejecting before page use, draft-only crew result and rendered export actions). TypeScript/lint passed; no real sites or submissions used. Production build passed. User authorized push after review; final pull was up to date with no conflicts, and the regression, TypeScript and lint checks passed again.

### 2026-11-07 · Om + Claude · DONE · Step 1 opens the split-screen browser panel again (D70)
Om: the NHS complaint website no longer opened in a split-screen window. The panel only opens on a click since D46, and the restored step 1 page never asked for it. `LiveView` now has a `live-open` event; step 1 sends it when "Fill in NHS Lothian's form" starts, and an auto-opened panel closes again with the browser. Checked in headless Chrome with a control run (no event, no panel). Not seen with a real NHS form, because the cloud workspace cannot reach the site. tsc and eslint clean.

### 2026-11-07 · Om + Claude · DONE · Step 1 back to the earlier page (D69)
Om asked for the previous version of the step 1 screen. `app/case/page.tsx` restored to its version before D65, so step 1 is the old fill-in-the-form page again and the complaint crew is not shown. Its files stay in the tree unused (list in D69). Not run in a browser; tsc and eslint clean. To bring the crew back, restore `app/case/page.tsx` from `bbe5df3`.

### 2026-11-07 · Om + Claude · DONE · Step 2 back to the version before D66 (D68)
Om asked for the previous version of the complaint route and to keep the story-box change. Restored the pre-D66 files and removed the four files D66 added (list in D68). A new commit, not a rewrite: `79db341` stays in history. `app/StageInputs.tsx` (D67) is untouched. The failed-text retry loop that D66 fixed is back with the old version.

### 2026-11-07 · Om + Claude · DONE · Onboarding story box grows as you type (D67)
Om: the box was too big and should grow with the text. `app/StageInputs.tsx` now sizes the textarea from its content (two lines to start, capped at 60% of the window height). Tested in headless Chrome on a clean clone of origin/main through a temporary page: 84 px empty, 192 px for two sentences, 540 px capped (it scrolls inside), 84 px again when cleared, 192 px for five typed lines. Not tested on a phone, and not tested through the full onboarding because the name step calls the model and there was no key in the test workspace. tsc and eslint clean.

### 2026-11-07 · Om + Claude · DONE · Step 2 checks, dates, visible answers and a real unlock (D66)
Om asked for more depth and polish on the complaint route, like the legal aid pages. I built a step 1 screen first (editable draft, readiness checks, time-limit bar, timeline), then Tarun's complaint crew (D65) landed on origin and covered step 1, so I dropped mine and kept step 2. Added `lib/agent/complaintClock.ts` (12-month limit, working-day reply dates), `lib/agent/complaintChecks.ts` (five eligibility rows), `app/case/ComplaintParts.tsx` and a rewritten `OmbudsmanStep.tsx`; `nhsSentAt` and `ombudsman.receivedOn` in `lib/profile.ts`. Time-limit and timing rules were checked against the SPSO Act, SPSO's pages and Citizens Advice Scotland (sources in D66). Tested: `npx tsx scripts/test-complaint-clock.ts` (dates, working days, clock states, check rows), and in headless Chrome on a clean clone of origin/main: locked page, the reply gate (button disabled until the Yes/No choice), unlocked page with all five checks, a court-action toggle flipping its check, and a 420 px wide layout with no sideways scroll. **Not tested:** a real run of the ombudsman form agent from the new screen, and what the SPSO form does for a complaint older than 12 months. Found and fixed: the ombudsman-text request retried in a loop when it failed. tsc and eslint clean.

### 2026-11-07 · Tarun + Claude · DONE · Complaint crew for step 1 (D65)
Tarun: the complaint flow was boring; he wanted the same flow, avatars and an actual agent. Built `lib/agent/complaintPlanner.ts` (planner loop with tools read_process, check_time_limit, read_guideline, compare_care, draft_complaint, fill_complaint_form, ask_user, finish), Robin's readers in `complaintAgents.ts`, `fillNhsForm` extracted from `nhsLothian.ts`, `ComplaintRun.tsx` on the shared Workspace (now takes a crew kit) and StepStrip (takes steps). One real headless run on the fictional Ailsa profile worked (12 fields filled, stopped before Submit) and is recorded in `demo/`. First run showed the SPSO time-limits page 404s (the whole SPSO site was erroring), so Robin reads Citizens Advice Scotland instead; the time check now fails loudly if the page does not load. Also restacked the profile timeline editor. Not tried: a real run with a question to the user, the demo with a Callum (non-fracture) profile.
### 2026-11-07 - Luigi + Codex - Clarify the treatment-location question
User requested a clearer distinction between the accident location and the medical-care location. Updated the details question, field label and hint to ask where the patient received the care they are concerned about. The extraction schema now explicitly distinguishes treatment location from accident location. This is a narrow wording correction to the existing interview fields; no input flow changes or live model calls.

### 2026-11-07 - Luigi + Codex - Case continuity fixes
Saved validated planner money answers incrementally and in the completed result; recorded demos do not overwrite personal funding. Contact cards now follow the selection, retain historical outcomes, offer filling for newly selected firms, and keep automatic replacements selected. Preparation cannot overwrite sent/replied/not-interested tracker status or dates, and those firms cannot reopen the send review. Starting another form preserves unrelated approval tabs.
Verified offline: test-case-continuity.tsx (storage and rendered selection/action checks), test-funding-skip.ts (mock calculator, immutable answer snapshots), TypeScript, lint and production build. An initial test-edit syntax error was caught and corrected. No live model run or external submissions. Pulled 24d6592 without conflicts before edits. User authorized pushing after review; final fetch and pull were up to date with no conflicts.


### 2026-11-07 · Tarun + Claude · DONE · Editable review and missing details before sending (D64)
Tarun: we cannot edit what we send to lawyers, and a firm with missing information blocks us. Built: editable fields in the review (including the message), a "Needed to send" section for required fields we have no answer for, `POST /api/agent/step4/edit`, edits applied inside `/send`, and tabs kept open for forms that need a detail. Verified headless against a local fake form (no real firms, no agents): the form started as needing a phone, an edit changed the message and a dropdown in the real page, adding the phone made it ready, send refused with the phone missing and again without consent, then sent after approval; the demo-persona gate still blocks. UI checked on the recorded demo with one firm switched to needs-detail. Not verified: a live run against a real firm's form that is missing a detail (Tarun asked not to run the crew just to test).

### 2026-11-07 · Om + Claude · DONE · Step 3 demo buttons count in the progress meter (D60)
After merging Tarun's D63 rework the step 3 skip was gone and the new demo buttons did not tick the meter. "Play a recorded run", "Jump to the finished case" and the in-run skips now call `skipStep(3)`. `tsc` and `eslint` clean; not clicked through in a browser yet.

### 2026-11-07 · Tarun + Claude · DONE · Crew story, one focus, plain case file, firm info modal, demo playback and skips (D62, D63)
Tarun's notes and the Codex/Cursor review: one agent in focus with a plain status line, the found list instead of big browsers, browser and history modals, the case file rewritten for "what does this mean, what do I do", "why it matters" on every firm check, a clickable firm card in Contact lawyers, and "Run again" when there are no enquiries. Fixed: the Law Society search did not submit in a short window (found 0 of 3; now retries on a fresh form and the tab gets room; headless repro: 3 of 3), "null miles", and "2 more to go" as a status. Merged with Luigi's and Om's work: their fill guards, honest Kit ticks, money parser and demo skips are kept; their postcode question is replaced by the automatic postcode (Tarun). Verified: tsc, eslint, `scripts/test-planner-guards.ts` (updated: Vera is now Robin), date, funding-skip and search-location tests, and a headless demo-playback run through playback, skip, case file and firm modal. Not verified: a fresh full live run after the merge (Tarun asked not to run the crew just to test).

### 2026-11-07 · Om + Claude · DONE · Demo: skip step 2 (ombudsman) (D61)
Om: no skip on the ombudsman page. Added "Skip and mark as sent (demo)" beside the fill button in `app/case/OmbudsmanStep.tsx`; it closes the browser and marks step 2 skipped, so the complaint track's meter can reach full. `tsc` and `eslint` clean; not clicked through in a browser yet.

### 2026-11-07 · Om + Claude · DONE · Skipping a step completes it in the progress meter (D60)
Om: after skipping, the top-right meter still said "1 of 6 done". Added `skipStep` and `progress.skipped`; the three demo skips call it and `milestones()` counts a skipped step's milestones as done. `tsc` and `eslint` clean; not clicked through in a browser yet.

### 2026-11-07 - Luigi + Codex - Fix review items 2, 3, 4 and 5
Enquiry filling now requires a current shortlisted, non-excluded firm and reserves one of three attempt slots synchronously before any model/browser call. Duplicate active/ready fills are blocked; failed attempts can retry within the remaining budget. Draft failures are shown before forms are filled and offer a retry. Worker reports carry an explicit success flag; the step strip shows Needs attention for failures, including legacy error reports, and successful retries replace failures for that same worker/task/tab. Search summaries use confirmed approved-postcode distances only; declining permission never produces a nearest/null-miles claim.
Verified: planner-guards regression (including concurrent slot claims and mixed failed/successful firm checks) and mocked browser drafting failure/retry. Fictional data only, no external submissions. Item 1 (medical comparison message) remains unchanged as requested. TypeScript, lint and production build passed. Final pull was already up to date with no conflicts. No live-site engine changes.


### 2026-11-07 · Lea + Claude · PROPOSED · Extra browser work: follow the specialist, intake form, demo inbox
Docs only, no code. Wrote `docs/plans/browser-complexity-plan.md` (proposed, not decided).
- **Probed (in-app browser, searches and reads only, nothing submitted):**
  - the Law Society individual search and its `Specialism` filter
  - four firms' people pages and forms
  - PASS and the Citizens Advice bureau finder
- **Strongest find:** Drummond Miller's clinical negligence intake form. Its Yes/No questions are answered by our own steps 1 and 2, it has a someone-else branch, and it has 8 narrative questions the agent must ask the user about rather than invent.
- Two firms list the specialist under a nickname, and Irwin Mitchell's search found neither register specialist. Name matching and fallbacks are therefore real requirements.
- **Considered and dropped:**
  - search-only ideas (FCA register, Wayback Machine, court judgments), because they are reading, not acting
  - Konfuzio for email (an API, see `NOT_DOING.md`)
  - Mailpit for real users (fine for a demo inbox only)
- **Tried and failed:**
  - `node` is not on the PATH in this Windows shell, so the Playwright probe script could not run; used the in-app browser instead.
  - A guessed Irwin Mitchell profile URL returned 404.
- **Not checked:** `tsc` and `eslint` (no code changed; `node` unavailable here).

### 2026-11-07 - Luigi + Codex - Bug review and targeted fixes
Reviewed application flows, routes, persistence, planner/browser workers, funding, evidence, enquiries and live view. Fixed question-answer failure recovery, terminal-run retry, final stream line handling and obsolete-stream guards, stale fixture flag, impossible dates, repeated date-mode reset, decimal-thousands parsing and skipped-finances fallback. Corrected server-storage wording. Regression scripts for dates/money, location, mocked calculator and mocked crew UI pass. UI setup initially lacked __name; fixed and blocked real planner requests in the test. Build caught an edit-induced encoding error; affected files normalized to UTF-8. Outstanding validation/decisions: BUG_REVIEW.md. No browser engine or real-send behavior changed. Production build, TypeScript, lint and all four regression scripts passed. Final sync pulled 247eded (documentation only); preserved both progress entries and renumbered our discrepancy to 11.

### 2026-11-07 · Om + Claude · DONE · Demo: skip step 4 and mark enquiries as sent (D59)
Om: the skip has to be on the Contact lawyers page too. Added "Skip and mark as sent (demo)" before and after the forms are filled; it closes the agent's browser and marks the enquiries as sent without sending anything. `tsc` and `eslint` clean; not clicked through in a browser yet.

### 2026-11-07 · Om + Claude · DONE · Demo: skip step 3 and continue to step 4 (D58)
Om: no skip on the legal aid page. Added "Skip and continue to step 4 (demo)" to the step 3 intro in `app/case/CaseRun.tsx`; it loads the three sample firms and opens step 4. `tsc` and `eslint` clean; not clicked through in a browser yet.

### 2026-11-07 - Luigi + Codex - Upstream sync
Pulled 3d3072b. Code merged cleanly. Both branches assigned D53 to different decisions; preserved upstream D53 and renumbered patient location to D54. Documentation conflict resolved by keeping both entries. The user subsequently authorized pushing small conflict resolutions.


### 2026-11-07 - Luigi + Codex - DONE - Patient search location (D54)
Integrated explicit permission into the latest crew question stream before planner research. Ask for the patient's postcode only after Yes; decline, skip and timeout omit location. No hospital-derived proximity. SLAB manual selection is verified and reapplied during direct-click recovery. Distance evidence names the approved postcode; absent origins earn no points and are excluded from the denominator.
Verified: permission-first, decline, skip, postcode validation/retry regression script; TypeScript and lint; live finder G1 1XW returned Glasgow offices (nearest 0.12 miles), declined path returned no distances. Both live runs exercised recovery. Whole planner/UI run not rerun. An initial broad edit also inserted a location call into the calculator; TypeScript caught it and it was removed. Prior stashes remain intact.

### 2026-11-07 · Om + Claude · DONE · The agent's browser closes when its job is done (D57)
Om: after the forms are filled or the legal aid crawl ends, the browser stayed open and the live panel looked odd. Step 3 now closes straight after its result; the planner and step 4 keep only the filled enquiry forms awaiting approval and close with the last one; the NHS and SPSO forms stay up for the user to submit and close after a detected submission, a closed tab, 10 minutes, or the skip / "sent" buttons. Checked with a local fixture form, `tsc` and `eslint`. Not checked against the real NHS Lothian and SPSO confirmation pages.

### 2026-11-07 · Om + Claude · DONE · Suggestion reasons as tick boxes (D51)
Om asked why the track page shows scores at all and wanted a check mark or an empty box. New `CheckRow` in `app/case/scoreParts.tsx`, used by `app/case/TrackChoice.tsx`; the scoring itself and the step 3 rows are untouched. Checked: `tsc` and `eslint` clean; Playwright in Chrome with the complaint demo patient: five rows ticked or empty as before, the AI-estimate row shows an empty box with "Not clear from your story.", no numbers left in the list, no page errors. NOT checked: the compensation track's list in a browser (same component).

### 2026-11-07 · Om + Claude · DONE · Suggestion page first; contact method only on the complaint path (D50)
Om sent a screenshot of the profile page with "Still needed for the NHS form: How to contact you" and no path chosen, and asked for the suggestion page first and the contact question only for someone who picks complaint. Found: the profile banner used `missingRequired` (which includes the NHS-only questions) whatever the path, and the logo (D43) sent a user with a case but no path straight to the profile. Fixed both (see D50); also clears `#profile` from the address after use. Checked: `tsc` and `eslint` clean; Playwright in Chrome with the complaint demo patient: lands on the suggestion page; the logo there stays on it (profile not opened); the profile before choosing says "Everything we need so far is here"; after choosing complaint the logo opens the profile with the NHS banner; from the landing page the logo goes to `/case` or `/case#profile` by stage; a reload does not reopen the profile; with the contact method blanked, choosing complaint shows "How should NHS Lothian reply to your complaint?" on step 1 and not before. NOT checked: a full real interview with the live model; `next build`.

### 2026-11-07 · Om + Claude · DONE · Demo: skip step 1 and continue to step 2 (D49)
Om: the demo does not file the NHS complaint, so step 1 needs a skip. Added "Skip and continue to step 2 (demo)" beside the fill button in `app/case/page.tsx` (always visible; disabled while the agent runs). It unlocks step 2 and opens it; the "filled in" and "sent" milestones stay unticked. Checked: `tsc` and `eslint` clean; Playwright in Chrome with the Callum demo patient: button present and enabled on step 1, click opens step 2 unlocked, no sent flag written, no page errors. NOT checked: the button during an agent run (it is disabled by `filling`; not exercised); `next build`.

### 2026-11-07 · Tarun + Claude · DONE · Step 4 redesign and recovery (D46); planner backend started (D47)
**Step 4:**
- **Real run in the app:** compensation persona, 3 sample firms (step 3 fixture), real firm websites, about 40 s, filling only (the send gate stays closed).
- **Outcome:** Drummond Miller and Anderson Strathern were filled and left at "Review and send". Balfour + Manson had no online form, and there was nothing to swap in (the fixture has no other firm with a website), so its card says so; there is no phone number in the fixture.
- **Screenshots checked:** 3 cards side by side, the live panel closed with the "Watch 3 agents live" button.
- **Not verified:** the swap with a real step 3 result, and the backup-engine path (needs the Decisions API to fail).

**Planner (D47, backend only, `lib/agent/planner.ts`):** a reasoning model with tools plans its own route through the compensation research. One CLI run with scripted answers took 141 s, 9 turns, 8 agents and 7 sites:
- It planned, then ran SLAB's calculator and lawyer list in parallel.
- The calculator asked its 6 questions one at a time, mid-run.
- It replanned when the estimate was unclear.
- It searched the web with Brave (Google blocks headless browsers; DuckDuckGo returned nothing), found Thompsons Scotland, which is not on SLAB's list, and checked it.
- It ran the Law Society check, shortlisted and finished.

Fixed since that run: the calculator's radios are now found by page order (verdict "likely" re-tested), the Law Society searches each start from a fresh form (3 of 3 in 25 s, before: 1 of 3 in 55 s), and the shortlist is sorted by fit. **Not built yet:** the planner's routes and its left-hand panel.

### 2026-11-07 · Claude (frontend agent) · DONE · No labels above headlines; step 4 locked until firms are picked
Tarun: "a headline over a headline". `PageTitle` no longer draws the small label (callers that still pass `eyebrow` are ignored), and the hand-made ones are gone (step 3 results header, "Your next step", the profile banner's "Profile", the trace modal's "How we found this"). Rule in `docs/DESIGN.md`. Step 4 ("Contact lawyers") is disabled in the track bar, with a lock and the tooltip "Pick up to 3 solicitors in the previous step first", until at least one firm is ticked in step 3. Checked headlessly (tab disabled with the tooltip before picking, enabled after; no labels above titles).

### 2026-11-07 · Claude (frontend agent) · DONE · Modals not side sheets; no question headlines; no header back link; verdict as a chip
Tarun's feedback. The trace view (`TraceSheet`) is now a centred modal like the firm details window (no slide-in side sheets anywhere). Step 3's headline is a statement ("Check legal aid and find lawyers"; the tab and map title is "Legal aid and lawyers"). The profile's "Back to your case" link is gone (the header's profile icon opens and closes it). The step 3 verdict card is replaced by one small chip at the start of the results line ("May qualify for legal aid", "Legal aid unlikely", "Legal aid not checked", "No win no fee search"): the honest detail is in its tooltip, and clicking opens the calculator's steps; the header link is actionable ("Change money answers", or "Check legal aid instead" after skipping). Rules added to `docs/DESIGN.md`. Checked with headless screenshots in fixture mode.
**Note:** someone else is editing step 4 in this working tree (D46: `no_form`, swap in the next best firm, one retry; `lib/agent/enquiry*.ts`, the step 4 route, `app/case/enquiryRun.ts`, `app/case/ContactLawyersStep.tsx`). Those files are not in this commit.

### 2026-11-07 · Claude (frontend agent) · DONE · Step 4 screen: message, fill, approve and send, email drafts, reply tracker (step 4 contract UI)
Built against `lib/agent/enquiryTypes.ts` with a client fixture (`app/case/enquiryRun.ts`, `?fixture=1`; outcomes built from the firms actually picked: form with a consent box, no form -> email draft, form without consents; a fixture "send" always comes back `send_blocked`). Step 3 selection stops at `MAX_ENQUIRIES` (3): unticked boxes disable and the bar says "N of 3 selected". **Step 4** (`app/case/ContactLawyersStep.tsx`, D33 pattern): the picked firms as chips ("Change" goes back), the message from `/api/agent/step4/draft` as an editable document (saved as `profile.enquiry.message`), one button "Fill their enquiry forms" streaming `/api/agent/step4` (agent rows, counter, live trace lines; the live grid is the shared panel), then one row per firm with a status chip and the note: "Review and approve" opens what was filled, required fields still empty, and each consent text as a checkbox; **"Approve and send" stays disabled until every consent is ticked in our app**, and only those texts are sent to `/api/agent/step4/send`. `send_blocked` is shown plainly ("Not sent: … we never send fictional enquiries to real firms"). "Open email draft" shows to, subject and message with a `mailto` link, copy, and "I've sent it". Per-firm and whole-run traces open the existing `TraceSheet`. **Replies tracker:** `profile.enquiries` rows with a status you set by hand (not sent yet, ready to send, email to send, sent, replied, not interested); sending sets `followUpOn` to 3 working days later (our rule of thumb, labelled as such); an overdue follow-up shows a nudge. Milestones: "Lawyers selected", "Enquiries sent" (sent by the agent or marked sent by the user), "A firm replied". Outcomes are saved in `profile.enquiry` so a reload keeps them.
**Checked** (headless, Ailsa persona, fixture): 4th selection disabled after 3; message drafted; three rows with the expected statuses; Send disabled before the consent tick and enabled after; fixture send -> "Not sent"; email draft `mailto`; "I've sent it" -> follow-up 2026-11-11 (3 working days after Saturday 7 Nov); overdue nudge shown. **Not checked:** the real routes (not merged yet), a real send (never, by design in development).

### 2026-11-07 · Claude (frontend agent) · DONE · Track switch in profile, compact track bar, step 3 as a shopping page, selection for step 4
Tarun's fixes 4-8. **Switching tracks** moved off the step pages into the profile ("Your path": current track, its fit, the suggested one marked, "Switch to … (n% fit)"). **Layout:** `TrackBar` is now one slim sticky bar (track and fit, the steps as tabs, a small progress meter whose milestones open in a popover); step pages use `max-w-6xl` with the step in a main column and a sticky "This step" panel on the right (what the step does, its checklist, what the path gets you; `app/case/StepAside.tsx`, step help in `steps.ts`). Step 3 uses the full width. **Step 3 results** (`app/case/FirmResults.tsx`): one-line verdict (calculator trace on click; the calculator's words are only quoted when there is a real verdict); left filters built from the result with live counts that respect the other filters (fit ranges, distance within 1/5/15 miles, must-have: legal aid, no win no fee, acts for patients, enquiry form, Law Society register, website checked; "Show firms we ruled out"); sort best fit or nearest; a responsive grid of compact cards (select box, "Top pick", fit ring, name, town and distance, up to 3 badges); a card opens a detail window (contacts, website, enquiry form, fit breakdown with evidence, "Contact this firm in the next step", "See how we found them" opens the trace sheet). With results on screen the step header shrinks to one row. Shared pieces moved to `app/case/scoreParts.tsx`. **Step 4 prep:** selected firms are saved as `legalAid.selected` (cleared by a new run); a sticky "N selected · Send enquiry to selected →" bar goes to step 4, which is now `ready` and is a placeholder listing the selected firms (nothing is sent); step 4 milestones are "Lawyers selected" and "Enquiries sent".
**Checked** (headless, fixture data): filters and counts (4 of 5 shown, "No win no fee" narrows to 2, ruled-out toggle shows 5), nearest sort order, selection bar, modal with 8 score rows, trace sheet over the modal, step 4 lists the selected firms; complaint persona: track bar popover and side panel; profile switch moves to the other track. **Not checked:** a real step 3 run with this layout, phone widths.

### 2026-11-07 · Om + Claude · DONE · Stricter email check; postcode inside the address is not asked for again (D44)
Om asked for a harder email check and to stop asking for the postcode when it is already in the address. `emailProblem` and `splitPostcode` (both in `lib/agent/inputs.ts`) are used by `app/StageInputs.tsx` (the stepper skips the postcode step and says so; Back returns to the address with the postcode put back in it), `app/InputPanel.tsx`, `app/case/ProfileTab.tsx` and the server (`validatePatch`, `normaliseFacts`). Checked: `tsc` and `eslint` clean; 31 email cases and 8 address cases in a script (all as expected); Playwright in Chrome through the contact form (postcode skipped, Back, typo messages for `gmial.com`, `.con`, `@@`, `a@b.c`); the real API route with a postcode in the address (stored apart, interview moves on) and with a typo email (400 with the message). NOT checked: the model path with the real key (it goes through the same `normaliseFacts`); the profile tab in a browser; `next build`.

### 2026-11-07 · Om + Claude · DONE · New logo, logo links to landing or profile, full name in the header (D43)
Om sent a new Elliot logo, asked for "Case for" to show the full name and for a click on the logo to go to the landing page or profile depending on stage. Icons regenerated from the new image (ellipse mask on the measured circle, 1 px inside the edge; `public/logo.png` 192 x 192, `app/icon.png` 512, `app/apple-icon.png` on brand blue, `app/favicon.ico`). `LogoLink` (in `app/ui.tsx`) is used by `app/page.tsx` and `app/case/Header.tsx`. Checked: `tsc` and `eslint` clean; Playwright in Chrome: link target with and without a saved case, click mid-interview (stays), on `/case` (opens the profile, stays open on a second click), from the landing page with a saved case (`/case#profile` opens the profile), plain `/case` (profile closed), header reads "Om Prabhu" once the last name is known; no console errors. NOT checked: `next build`; Safari.

### 2026-11-07 · Om + Claude · DONE · Fix: the name was asked twice (D41)
Om: after entering the name, the page asked for it again, and an empty submit then jumped to the next question. Cause: as soon as the name was sent, `app/page.tsx` left the name screen and showed the generic question screen with the opening line and a name box while the first reply was still loading; the reply then replaced it. Now the name screen stays up (button "One moment…") until the first reply arrives; if the reply asks for the name again (the text was not a name) the normal screen shows that question, and if the request fails the name screen returns with the text kept. Checked with Playwright and a slow mocked API for all three cases. NOT checked: the real model reply.

### 2026-11-07 · Claude (frontend agent) · DONE · Fit ring centred, no truncation, two demo personas
Tarun's fixes 1-3. **Fit ring:** the number and "FIT" are now drawn inside the ring's own SVG coordinates (`text-anchor: middle`, `dominant-baseline: central`), so they are centred and scale with the ring at every size (checked at 56 and 104 px). **No truncation anywhere:** every `truncate` in `app/` removed (live panel, agent rows, trace lines, score labels, trace URLs); URLs use `break-all`; score rows put the bar under the label so long labels wrap instead of squeezing; "Coming soon" sits on its own line. Rule added to `docs/DESIGN.md`. **Two demo personas** replace "Skip: use demo patient" (`DEMO_PERSONAS` in `lib/agent/sample.ts`, D24 rules): **Callum Fraser** (wrong medicine dose after day surgery, recovered in two days; wants an explanation, an apology and changes) and **Ailsa Reid** extended (fracture not healed, needs surgery, missed exams and shifts; ticks "Compensation for what happened"). Outcome sentences are built with onboarding's `outcomeSentence()`. **Verified via `/api/agent/track`:** Callum -> complaint 85% vs compensation 0%; Ailsa -> compensation 100% vs complaint 30%. Both pass `missingForOnboarding` and land on the recommendation page (checked in a headless browser). `SAMPLE_FACTS` (used by scripts and the benchmark) is unchanged.

### 2026-11-07 · Tarun + Claude · DONE · Recommend one track after onboarding (D42)
Built `lib/agent/track.ts`, `lib/agent/trackSignals.ts`, `/api/agent/track`, `app/case/TrackChoice.tsx` and `app/case/TrackBar.tsx`, and deleted `PathMap.tsx`. NHS-only questions moved from onboarding to step 1. The outcome question is now neutral and has a compensation option. **Verified** in the app with the demo patient, using headless screenshots:
- **Recommendation:** "We suggest you make a complaint", 50% fit (explanation and apology ticked, not asking for money; the AI read the harm as lasting, so "short-lived" scored 0). Compensation came out at 30%.
- **Continue:** shows the complaint track only.
- **Switch:** shows the compensation track (legal aid, then lawyers, coming soon).

`tsc` and `eslint` are clean. **Not verified:** a full onboarding run through the new outcome question and step 1 asking the reply method (only code paths checked); a profile that ticks compensation (should recommend compensation).

### 2026-11-07 · Om + Claude · DONE · Whole interview as one-question screens (D41)
Om asked for the rest of the form to behave like the name screen. `app/page.tsx` now shows the latest agent question as a heading with `StageInput` below (new `app/StageInputs.tsx`, `app/StageControls.tsx`), with a progress bar from the question order. Details and contact are asked one field at a time and sent as one answer, so the API is unchanged; choices are lettered rows with A/B/C keys; the outcome checklist is tick rows. `DateField` has an opt-in `big` prop; the case page keeps `InputPanel`. Checked: `tsc` and `eslint` clean; Playwright (Chrome, interview API mocked) through all nine steps at 1280 px and a 390 px phone width: validation messages, Back, keys, answers sent as before, no console errors. NOT checked: the live model path with the real key; `next build`.

### 2026-11-07 · Om + Claude · DONE · Landing page: big one-question name screen, shared blue header (D40)
Om asked for a more professional landing page, with the name as a big field to type into, like Typeform. New `app/NameStep.tsx` (large serif question, borderless 34/40px field with an underline, `OK` and Enter); `app/page.tsx` now has the blue header with stripes and the logo above both the name screen and the chat, shows the name screen while only the opening line exists, and keeps the typed name if the request fails. Chat area gets top padding; below the `sm` breakpoint the header shows only the logo and the dev skip button. `.fade-up` added to `app/globals.css`; `docs/DESIGN.md` has a "Landing screen" section.
**Checked:** `tsc --noEmit` and `eslint` pass. Playwright in Chrome on `next dev`, with the interview API mocked: the field is focused on load; `OK` is disabled while empty and enabled after typing; Enter sends; a 500 returns to the name screen with "Om Prabhu" still in the field and the error shown; a good reply switches to the chat with the header "Case for Om", the user's bubble and the story box; no horizontal overflow at 390px wide; screenshots at 1280 and 390 px looked right.
**Not checked (do not claim otherwise):** `next build` on this change; the real model reply (mocked); Safari; keyboard-only use beyond Enter; screen readers (the field has a label and `aria-describedby` for the error, not tested with one); a very long name; how the later questions look next to the new header on a phone.

### 2026-11-07 · Tarun + Claude · DONE (backend) · Step 3 runner, traces and score breakdown (D36, D39)
`lib/agent/legalAid.ts` + `POST /api/agent/step3` run 6–7 browser agents in tabs of one browser, each with its own cursor and grid tile:
- **SLAB calculator:** the Decisions engine fills it. If it stops early, the remaining fields are filled directly.
- **SLAB lawyer list:** Civil > Medical negligence > active only. The engine tries first. When the hidden radio buttons defeat it, direct clicks take over (recovery, logged).
- **Law Society register:** each of the top firms is searched by name.
- **4 firm websites:** the model picks the medical negligence link, reads the page and answers three typed questions (acts for patients, mainly defends, no win no fee), then looks for an enquiry form.

Every step is recorded as a `TraceStep` (streamed live and returned) with screenshots served by `GET /api/agent/step3/shot`. Each firm gets a `breakdown` (8 rows: points / max / status / evidence) and a `fit` % (points / max for the route). Fit is how well a firm matches what the user needs; it is not a chance of winning. The weights are our judgement.

**Verified 2026-11-07, fictional student (£9k income), 3 full runs from the CLI:**
- **Verdict:** "You are likely to qualify for civil legal aid. You may not have to pay a contribution." (SLAB's own words).
- **Run size:** 7 agents, 6 sites, about 15 pages, about 22 actions, 41–100 s.
- **Shortlist:** Balfour and Manson 92%, Drummond Miller 83%, Lindsays 63%.
- **Trace:** 71 steps and 20 screenshots in one run.

**Bugs found and fixed:**
1. The verdict was first read from SLAB's general guidance text ("…whether you are likely to qualify…"), which gave a false "likely". It now reads only the "Step 5: Estimate" block, checked against a low income ("likely to qualify"), a high income ("It is likely you do NOT qualify") and an unfilled form.
2. SLAB has no `<main>`, and a locator waited 30 s for it.
3. The Law Society results page repeats the search form, and a hidden copy was being typed into.
4. "Balfour + Manson" did not match "Balfour and Manson".

**Not verified:**
- The run through the app UI. The frontend agent owns the screen.
- The high-income route end to end. Only the verdict reading was checked.
- Lindsays shows two "done" events (probably two SLAB names mapping to one short label).
- Balfour and Manson's contact form was not detected (it may load late).
- A Law Society match landed on "Balfour & Manson (Nominees) Limited", the same group but a different entity.

### 2026-11-07 · Claude (frontend agent) · DONE · Step 3 results: fit ring, score breakdown, full trace (D39 UI)
Firm cards show a **fit** ring ("how well this firm fits what you need"; the tooltip says it is not a chance of winning) and the score breakdown as small bars per criterion (points/max, teal = met, red = not met, grey = could not tell; click a row for its evidence). **Traceability:** "See how we found them" on any firm (also on the "we also checked" rows), "See how we checked" on the verdict (steps of the "SLAB calculator" agent) and "See the whole run" open a side sheet (`app/case/TraceSheet.tsx`): a "How we found them" line of chips (found, check, decide, recover, fail, result steps, with confidence), then every step in time order with time, agent colour, kind tag, text, confidence meter, URL, expandable detail and screenshot thumbnails that enlarge on click (`/api/agent/step3/shot?run=&file=`). The whole-run sheet can hide agents. Live `trace` events show as the last few lines under the agent rows while it runs. The fixture got made-up breakdowns, fit and a 28-step trace (no screenshots) for building this.
**Checked** in fixture mode (headless): fit ring and breakdown with evidence, firm sheet (6 summary chips, 8 steps), calculator sheet (7 steps), whole run (28 steps, 22 with one agent hidden), details expand, Escape closes; no console errors. **Not checked:** screenshots (the fixture has none) and the real run.

### 2026-11-07 · Claude (frontend agent) · DONE · Live grid tiles are only the picture
Tarun: "remove top borders and borders and header and all these things from these agent browsers". Each tile is now just the live page (rounded corners, 8px gaps); the agent's name and colour come from its cursor pill inside the page. State is shown only when an agent fails: a thin red wash with its note along the bottom. The counter line above the grid stays. Checked with a screenshot (4 local test tabs, one failed; temporary route deleted).

### 2026-11-07 · Claude (frontend agent) · DONE · Live grid client (F1) and path map look (F5) (D35, D36)
**F1:** `app/LiveView.tsx` now speaks live v2: keeps the latest frame per `pageId` and writes it straight into each tile's image (no React re-render per frame); one tab = the old panel; several = a grid of tiles (agent colour, label, state chip, note, URL) with the "N agents · N sites · N pages · N actions" counter; clicking a tile POSTs `{type:"focus", pageId}` and shows it full size with take control; "Back to grid" POSTs `focus: null`; every input (click, move, wheel, key, text, back) carries the shown tab's `pageId`; resize is only reported when one page is shown. The draggable panel is unchanged. **Tested against the real stream** with a temporary in-process route (3 local `setContent` pages, no sites visited; deleted before commit): 3 tiles, counter, a state change arriving live, focus and back (both POSTs seen), no console errors. Not tested: take control on a focused tile in a grid, and the real step 3 run.
**F5:** `app/case/PathMap.tsx` keeps D35's structure but fixes the look: the fork lines did not meet the boxes (bars at fixed quarters while the lanes had a gap). Each lane is now one grid column with no gap and draws its own connectors, so the lines meet exactly in the middle; cream band, "STEP n" eyebrows, a halo on the active box, the active path in blue. Checked with screenshots (step 1 and step 3 active).

### 2026-11-07 · Om + Claude · DONE · The live panel closes itself when the browser closes (D38)
Om sent a screenshot of the panel after the run: a faded last frame, "CLOSED" and a badge "The browser has closed", and asked for the tab to close for real. `app/LiveView.tsx`: on `end` the panel shows the notice for 2 s, then hides itself and clears the last frame; a new frame inside that window cancels the hide; the Dismiss button is removed. **Checked** (Playwright in Chrome on `next dev`, with `EventSource` replaced by a fake that the test drives): (A) frame, end, panel visible with "Closed" and the notice at 0.3 s, gone at 2.6 s with the page padding back to none; (B) a new frame 1 s after end keeps the panel live 3 s later; (C) panel hidden by the user, then end: the corner button goes away after 2 s. `tsc` and `eslint` pass. **Not checked:** against a real agent run that ends the browser (only the `end` event was simulated); the 10-minute keep-open path in the step runners; when the browser closes by crashing rather than by "Close browser".

### 2026-11-07 · Om + Claude · DONE, prompt change untried live · Fixed a double "Thanks" after the name (free-text path)
Om's first live run of the free-text path (a screenshot) showed: "Thanks, Om Prabhu. Thank you, Om. Whenever you are ready, ..." The model's acknowledgement thanked them, and the code-owned story question (`questionFor`, `inputs.ts`) opens with "Thank you, <name>." too. A full name goes to the model by design (`parseName` takes one word only), so this path is the normal one for "Om Prabhu". Fix in code: `joinReply(acknowledgement, question)` in `lib/agent/inputs.ts` drops the question's leading "Thank you[, name]." when the acknowledgement already starts with thanks (also covers the "done" question). Fix in the prompt (`interview.ts`): leave the acknowledgement empty for a bare name, and never open it with thanks. **Checked:** six cases on `joinReply` through `tsx` in the cloud clone (the screenshot case, no acknowledgement, a non-thanks acknowledgement, the done question, a question without thanks, a missing name with extra spaces); `tsc --noEmit` passes. **Not checked:** the prompt wording against the live model (no key in the cloud clone); run `npm run agent:interview -- --sim` and read the whole conversation. The code guard does not depend on the prompt. **Seen but not changed:** the name is stored as first name "Om" and last name "Prabhu" by the model, but the question afterwards says "Om" only, which is intended.

### 2026-11-07 · Om + Claude · DONE · Elliot logo as favicon and header logo (D37)
Om gave a PNG (1600x1600, opaque, black outside the disc; first a cream-filled version, then replaced by a white-filled one, which is what ships) and asked for it as the site icon and in the header, in the Wordsmith colours. Measured the disc (an ellipse 1269x1188, x 144-1413, y 159-1347), made the outside transparent with an anti-aliased mask (4x supersampled, 1px inside the edge to drop the black fringe), and exported `public/logo.png`, `app/icon.png`, `app/apple-icon.png` (on `brand` blue) and `app/favicon.ico` (16/32/48). `Logo` in `app/ui.tsx` is now an image (`next/image`, `unoptimized`); the onboarding page shows it instead of the "Case helper" eyebrow. Touches Tarun's shell (D31) only through the `Logo` component that `docs/DESIGN.md` marked as a placeholder to swap: Tarun, please look at the header.
**Checked:** a composite of the logo on `#0060df` at header size (the E and T are legible at 40px; the white disc stands out) and the icon at 16, 32, 48 and 64px on white and dark (legible from 32px up; at 16px it reads as a white dot with a dark ring).
**Also checked:** `tsc --noEmit`, `eslint .` and `next build` pass; on `next start` all of `/logo.png`, `/icon.png`, `/apple-icon.png` and `/favicon.ico` return 200 with the right bytes, and the page head carries the three icon links; Playwright in Chrome (1280x800): the logo loads at 42.75x40px in both the onboarding page and the blue case header, with no console errors; screenshots looked right.
**Not checked (do not claim otherwise):** Safari, mobile layout, a pinned tab, the real iOS home-screen icon, how the tab icon looks at 16px in a real browser tab.

### 2026-11-07 · Tarun + Claude · IN PROGRESS · Step 3 backend part 1: several live tabs and agent cursors (D36)
`lib/liveview.ts` now streams every tab of a session, tagged with `pageId`, and sends the tab list (`pages`), running `stats`, and per-tab frames. The focused tab (or the only tab) streams at full quality; others stream at 640px, quality 50, as grid tiles. `POST /api/live` accepts `pageId` on every input plus `{type:"focus"}`. The SSE route keeps the newest frame per tab when the client is slow, so tiles never freeze. Runners name tabs with `setPageMeta(page, {label, color, state, note})` and send totals with `publishStats`. `lib/agentCursor.ts` draws each agent's cursor (colour and label) inside the page, in a closed shadow root that the agent and the page cannot see. The engine moves the real mouse onto a field before filling, selecting, ticking or clicking it (`pointAt`), so the cursor shows where the agent really acts. This is skipped with `HEADLESS=1`. Cookie banners whose only button is "Allow" (SLAB) are now dismissed.
**Verified:** 3 tabs (SLAB calculator, SLAB finder, Law Society) streamed at the same time: about 100 frames each at about 18 KB. Focusing a tab raised its stream. A screenshot shows the labelled cursor. Benchmark with cursors on (`IN_APP_BROWSER=1`): nhs, slab and lawsoc all PASS. **Not verified:** the grid UI (the frontend agent is building it), more than 3 tabs, CPU load with 6 tabs.

### 2026-11-07 · Claude (frontend agent) · DONE · Step 3 screen, results, profile field, milestones (D36, F2-F4)
Built the step 3 UI against the contract (`lib/agent/legalAidTypes.ts`) and the fixture, before the backend route exists. `app/case/LegalAidStep.tsx`: one sentence and one button (D33); asks only `fundingMissing(funding)`, one question at a time in the calculator's order (benefits with the four named benefits, then partner, dependants 0-10, then income/outgoings/savings together in £ fields), with "Skip, I'd rather not say" on every question (sets `skipped`, wording switches to no win no fee). While running: the agents as rows (colour dot, label, note, state chip) and the counter "N agents · N sites · N pages · N actions". Results: verdict in honest words (never "you qualify"; the calculator's own words quoted), route, 3 firm cards (reasons, distance, legal aid / no win no fee / acts for patients badges, website), and "We also checked N other firms" with each reason. Saved as `profile.legalAid = { funding, result, sample }` (`setLegalAid` in `lib/profile.ts`). `app/case/legalAidRun.ts` streams `/api/agent/step3`; `?fixture=1` replays the fixture on timers; without it and without the route, the step says plainly that the agents are not connected (no silent fallback to sample data). Sample results show a "Sample data, not a real result" banner and **do not count toward progress**. Milestones: "Money questions answered", "Legal aid checked", "Lawyers shortlisted"; step 3 is `ready`, step 4 stays "soon".
**Checked:** `tsc`, `eslint`; headless walk-through with the demo patient in fixture mode (questions in order, "14,000" and "£9000" parsed, answers saved, results rendered, skip path, no-fixture message). **Not checked:** the real route (not built yet), the live grid (F1, next), the map look (F5, next).

### 2026-11-07 · Tarun + Claude · DONE · Live view: no extra window, light full-height panel, draggable, fast input (D34)
**Lag cause found and measured:** take-control input went through Playwright's `page.mouse`/`keyboard`, which applies the session's `slowMo: 250` to every call (wheel = move + wheel = about 520 ms per request; the panel sent one per animation frame, so a scroll gesture queued many seconds of work). Now sent over CDP directly: in-process 1-10 ms per input and 11-24 ms to the next frame; over HTTP on a fresh dev server 12-50 ms from request to new frame. Scroll after a click verified (scrollY 0 -> 400 -> 513). **No separate window:** a fresh dev server with no env launched `chrome-headless-shell` (no window). Tarun's already-running server kept launching the headed Chrome until restarted, because it was serving an older compiled copy of `lib/browser.ts`; restart `npm run dev` after pulling. **Drag:** a scripted drag set the panel to 1012px, saved it and padded the page. **Not verified:** typing through the UI (keys were tested via the API only), hover menus on a real site, the panel on `/case`.

### 2026-11-07 · Tarun + Claude · DONE · The agent's browser shows inside the app (D32)
Tarun asked whether the headed Chrome could appear inside the web app, e.g. as an iframe on the right. **Iframe ruled out first** (curl, 2026-11-07): NHS Lothian `frame-ancestors 'self' *.scot.nhs.uk ...`, SLAB and SPSO `X-Frame-Options: SAMEORIGIN`; and an iframe would be another copy of the page, not the agent's. Built a CDP screencast instead (`lib/liveview.ts`, `GET/POST /api/live`, `app/LiveView.tsx`, hook in `openSession`). Worked in a separate git worktree (branch `liveview`) because the main checkout had someone's uncommitted step-2 and case-page changes; the panel is mounted in `app/layout.tsx` so `app/case/*` was not touched.
**Verified:** with `IN_APP_BROWSER=1` on a dev server, a curl subscriber received 150 frames (1300x900) across three URLs during the Law Society search, then `end` when the browser closed. Headless Playwright screenshots of `/dev`: the panel opened by itself, showed the agent typing "Edinburgh" and choosing "Accident and injury" live (45 fps while busy), a forwarded `wheel` scrolled the real page, and after the run the panel greyed out with "Browser closed". `tsc` and `eslint` clean.
**Not verified:** clicking and typing in "Take control" through the UI (only the wheel was sent, via the API); a headed run (default mode) mirrored at the same time; the case page layout with the dock open (it was checked on `/dev` only); popups opening a new tab (code switches to the newest page, not run). Frames are ~90 KB each, fine on localhost; over a slow network lower `quality` in `lib/liveview.ts`.
**First attempt failed:** a symlinked `node_modules` in the worktree; Turbopack refuses packages outside the project root. Fixed with a real `npm ci`.

### 2026-11-07 · Luigi + Codex · DONE · Connect NHS fill to the app
Connected the disabled Step 1 button to the existing NDJSON API and Decisions agent. The UI handles split stream chunks, errors, missing information and completion, and blocks draft edits/repeated clicks while filling. The API rejects incomplete profiles/empty required draft text and tolerates disconnected stream readers. Added an optional browser review period with cleanup after window close or 10 minutes; CLI behavior is preserved.

Verified through localhost:3000: clicked the demo shortcut and approval/fill button, filled the actual NHS form in a separate visible browser, and received `ready_to_submit` with no unfilled required fields. Screenshot visually inspected. Evidence in ignored `.runs/2026-11-07T16-18-56-428Z/` and `.runs/nhs-ui-result.png`. Nothing submitted. TypeScript and ESLint passed. Node initially failed under the filesystem sandbox; checks succeeded with approved elevated execution. Starting another dev server failed because the user's server was already running; used that server for the test. Submission and reCAPTCHA remain untested.

### 2026-11-07 · Claude · DONE · Steps 1 and 2 are one button; ask only what is missing, on the step (D33)
Tarun: our screens were copying the form ("too dumb"), repeating step 1 in step 2, and showing too much. Now each step is one sentence and one button. Step 1 writes the draft in the background; step 2 writes the ombudsman's two text answers from onboarding (`lib/agent/spsoDraft.ts`, `POST /api/agent/step2-draft`) and uses defaults for its yes/no questions. Missing facts are asked inline with Om's inputs (`AskMissing`, reusing `/api/agent/interview`); Om's contact question no longer shows "Title" when we already have it. If the agent stops on a field, the step asks exactly that (`AgentAsk`) and runs the fill again with the answer (`extra`, `lib/agent/extra.ts`); it restarts the fill, it does not resume mid-form. Engine: on multi-page forms, when the model says "ask" but nothing on the page is unresolved (optional-only pages such as diversity monitoring), it clicks Next instead of stopping (this broke the second run of the loop test). **Bug found and fixed:** profiles saved before `medicalRecords` existed made every agent route answer "Bad request"; saved profiles are now upgraded on load (`lib/profile.ts`).
**Checked:** `tsc`, `eslint`; benchmark 11/11; draft test (demo patient: impact written from her story; a patient who never mentioned effects: impact null, outcome restated without new demands); ask-and-rerun on the live SPSO form (run 1 asked only "Forenames", run 2 reached review); UI in a headless browser (step 1 asked only the phone number, then wrote the draft itself; old-style profile no longer fails). **Not checked:** clicking the fill buttons in the app with a visible browser.

### 2026-11-07 · Claude · DONE · Step 2 fills the SPSO form; design system; progress (D30, D31)
**Step 2 (D30).** Probed the SPSO checker to its end (it links to the online form) and the 14-page form (details in `docs/PROJECT.md`). Built `lib/agent/spso.ts` (+ `spsoAnswers.ts`, client-safe), `POST /api/agent/step2`, `npm run agent:spso`, and the step screen. Run on the fictional patient: 23 agent steps, ends on "Review and send" with every answer correct on the review page (checked from a screenshot) and the confirmation box unticked. Things that broke and the fixes: the engine did not treat the `--` dropdown placeholder as empty (so nothing was selected and Next was clicked 25 times); the agent typed the patient's email into the "resume saved complaint" login box (now ignored); it clicked Next with required fields unresolved (now stops and asks); a required field was invisible to us because the asterisk came first in the label (`observe.ts` now handles a leading `*`) and one field had no label (falls back to its row text); the Decisions API rejected a question with two options of the same text (duplicates merged); the model skipped "Forenames" at confidence 0.58 because my description said "First name" (descriptions now carry the site's wording). The outcome box needs 15+ words and our draft outcome had 11, so the step asks the user and checks in code. **Benchmark (D22): full suite, 11/11**, including the new `spso-form` task. **Not tested:** the app route end to end with a visible browser (the dev server would open a window on Tarun's screen), uploading documents, and whether a real submit works (never done).
**Design (D31).** Read Wordsmith's real CSS and a screenshot of their site, wrote `docs/DESIGN.md`, tokens and components, and rebuilt the case shell (header, stripes, profile page, timeline rail, draft as a document, buttons under their text). Checked with headless screenshots of step 1, step 2 locked and unlocked, and the profile. **Progress** in the rail: 10 milestones, honest rules in `app/case/progress.ts`; the demo patient starts at 20%. Not done: onboarding page restyle, a real logo, mobile layout.
**Merged with Om's 27eb911** (same palette and fonts, found independently): one token set, Om's self-hosted fonts and widget classes kept and aligned to `app/ui.tsx`, his profile-tab input logic (title list, postcode check, tel/email, place suggestions, date picker) ported into the new profile layout, his interview kept with our medical-records rule added. Tarun said "keep ours" for layout. Decisions renumbered D29-D31 because Om's D26-D28 landed first.
**Discrepancies:** (7) Luigi's D25 and my records decision both claimed D25, then Om's D26-D28 took the next numbers; mine are D29-D31 (resolved). (8) `PROJECT.md` said the SPSO checker verdict was unseen; now seen (resolved). (9) `PROGRESS` earlier "recommendation only" for records still stands; step 2 is now the ombudsman, not records (resolved by D29/D30).

### 2026-11-07 · Claude · DONE · Records moved to the profile; ombudsman step is a locked screen (D29)
Tarun's call: medical records are an optional profile field, asked only at the step that needs it (solicitors); the ombudsman step should be clickable but explain it only opens after the NHS gives its final reply. Done: added `medicalRecords` to `CaseFacts` (not required, interview told not to ask), a "Medical records (optional)" section in the Profile tab, removed the records step so the UI steps are now 1-5, and added the locked Ombudsman screen. Checked headlessly on the demo patient: sidebar shows "Locked", hover text and screen render, profile select present; `tsc` and `eslint` clean. The simulated interview (`npm run agent:interview -- --sim`) still completes after the schema change and leaves `medicalRecords` null (never asked). Not tested: old saved profiles that lack the field (the UI treats a missing value as "not decided"). **Discrepancy noted:** the step numbering changed (old 3-6 are now 2-5); D23 and older entries use the old numbers. The earlier probe of NHS Lothian's records process is kept below as reference, nothing was automated.

#### Earlier today: records request probed
Tarun asked what to do for step 2. Probed how NHS Lothian takes records requests (details in `docs/PROJECT.md`, "Records request"). Findings: an online portal that needs an account, a flat 11-page PDF with no fillable fields, and email routes; the earlier assumption "Lothian has no online route" was **wrong** (the portal exists). **Recommendation (proposed, not a decision):** do not automate the portal (it needs a real account, which conflicts with D4 and would create a real account with whatever data we give it); build step 2 as "prepare the request" (generated letter/email from the profile, sign-and-date checklist, where to send, a reminder date); treat it as a code step, not browser complexity (see the backlog's "avoid" list); put the browser effort into finding the GP practice's own records route, which is backlog item 2. Awaiting Tarun's choice.

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
| 15 | 2026-11-08 | Lea + Claude | Branch `feature/yellow-card` changes the shared browser engine (`lib/agent/decisionAgent.ts`, `observe.ts`, `extra.ts`; Tarun's area, D80): retries, "ask by field name", the repeat-click limit, longer labels. `AGENTS.md` asks for `npm run bench` before such changes; it was **not rerun**, so the NHS, SPSO and step 4 forms are unchecked with them. | open: run `npm run bench` before merging into `main` |
| 14 | 2026-11-08 | Lea + Claude | D80 (branch `feature/yellow-card`) makes the onboarding "What would you like help with?" question a tick-list again, reversing D76's single choice (Om). | open: Om to agree before merging |
| 13 | 2026-11-07 | Claude | D74 said a case is stored in the browser only. D75 now also stores it in Tiger Data for signed-in people; `docs/PROJECT.md` and the Profile tab copy updated. In-case demo shortcuts still write sample data to a real saved case. | open |
| 12 | 2026-11-07 | Claude | `AGENTS.md` item 7 says "No logins". That was written for the agent (it signs in to no site, D4) but reads as if the app has none. D74 adds accounts for the people using the app. `AGENTS.md` not edited (shared file). | open |
| 10 | 2026-11-07 | Lea + Claude | The step 4 run (Tarun + Claude, D46 entry above) reports "Balfour + Manson had no online form". A manual probe the same day found a general enquiry form at `https://www.balfour-manson.co.uk/contact-us/` (name, phone, email, "Nature of Enquiry", location, consent checkbox, invisible reCAPTCHA v3), linked from its medical negligence page as "Fill in our enquiry form". Possibly the agent's harder look did not reach it, or the fixture's website URL differs. Not investigated. | open |

| 11 | 2026-11-07 | Codex | Profile claimed nothing was stored on server, but runners write logs/screenshots. Copy fixed; retention/deletion policy undefined. | open: BUG_REVIEW.md |
| 9 | 2026-11-07 | Claude | `PROGRESS.md` earlier said step 2 was "records request"; step 2 is now the ombudsman form (D29, D30). | **resolved** 2026-11-07 |
| 8 | 2026-11-07 | Claude | `PROJECT.md` said the SPSO checker's verdict screen was unseen. It was seen and links to the online form. | **resolved** 2026-11-07 |
| 7 | 2026-11-07 | Claude | Luigi's decision and mine were both numbered D25. | **resolved** 2026-11-07: mine is D29 (Om's D26-D28 landed first); next free is D33 |
| 5 | 2026-11-07 | Codex | Backend NHS filling existed, but the app button was disabled and the browser closed after four seconds. | **resolved**: connected button and stream, added review period, verified through app |
| 1 | 2026-11-07 | Claude | I logged "Irwin Mitchell Scotland page has no form". Wrong: the form loads lazily and is on that page. The original claim (form exists) was right. | **resolved** 2026-11-07: docs corrected, benchmark confirms the form is found and filled |
| 2 | 2026-11-07 | Claude | `DECISIONS.md` D7 and `AGENT.md` say the agent can **never** click submit. The benchmark needs "Next"/search buttons on read-only pages, which are submit-type. | **resolved** 2026-11-07: D17 `allowSubmit` implemented and used by the SLAB, SPSO and Law Society benchmark tasks only |
| 3 | 2026-11-07 | Claude | Guide says Decisions output tokens are free; model page lists output at $0.5/M. | open: unresolved, cost numbers in benchmark use measured token counts |
| 4 | 2026-11-07 | Claude | The handoff text for backlog item 1 said Irwin Mitchell's enquiry form "sits on a separate contact page". The benchmark shows the form loads **lazily on the same page** and also exists at `/contact-us`. | **resolved** 2026-11-07: the backlog uses the corrected wording |
| 6 | 2026-11-07 | Claude (Om's session) | `ACTIVE_WORK.md` says the UI is Tarun's ("Do not restyle without asking"). The UI was restyled at Om's request before Tarun confirmed. Only classes and fonts changed. | **resolved** 2026-11-07: Tarun directed the redesign (D31) and said "keep ours and fix Om's". Om's palette, self-hosted fonts, widget classes and input logic are kept and merged |

## Open questions

- Can one project be entered in more than one sponsor track? (unknown)
- How exactly do the Wordsmith judges weigh "complicated"? We use Tarun's reading: steps, sites, branching, failure recovery.
- Does the invisible reCAPTCHA on the law-firm forms block an automated real submit? Never tested (and we do not submit).
- Does a clinical guidance page exist that fits Ailsa's case? Not checked.
- Which firms in the Law Society results act for patients rather than for the NHS/insurers? Partly answered 2026-11-07: the register's individual search has a "Medical Negligence (Defender Only)" specialism, with 0 results in Edinburgh. Firm-level sides are still not checked.
