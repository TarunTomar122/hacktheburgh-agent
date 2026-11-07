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

**D24 · 2026-11-07 · Tarun (requested), Claude (built) · decided**
Add a dev-only "Skip: use demo patient" button on the onboarding page that loads the fictional patient in `lib/agent/sample.ts` (with a ready-made draft) and opens `/case`. Visible when `NODE_ENV !== "production"` or `NEXT_PUBLIC_DEMO_SKIP=1`. The demo patient must stay fictional (example.com email, Ofcom drama-range phone) and is the single source for scripts, the benchmark and this button.
Why: saves a minute or more per reload while developing steps. It is a developer shortcut, not a product feature; do not present it as part of the user journey.

**D25 · 2026-11-07 · Luigi + Codex · decided**
Connect the existing NHS browser agent to the Step 1 approval/fill button. Keep the visible filled browser open for review until the user closes it or 10 minutes elapse, then clean up. The API returns completion immediately. The fictional demo still ends before submission, consistent with D14 and D21.
Why: Luigi requested the NHS form browser workflow, and the backend existed while its UI entry point was disabled.

**D26 · 2026-11-07 · Om, built by Claude · proposed (needs Tarun to confirm; see Discrepancy 6)**
Restyle the UI with Wordsmith's colour scheme (the track sponsor's site). Light theme only; the old dark-mode variants are removed. Tokens are in `app/globals.css` under `@theme`: white page, `#181818` text, `#0A0A0A` headings, `#737373` secondary text, `#0060DF` primary blue, `#9333EA` violet accent, `#FCF7EE` cream (sidebar, summary card), `#F5F5F5` and `#E5E5E5` neutrals, `#0B1221` navy (defined, unused), teal and orange for status. Verified: colours and font names were read from wordsmith.ai's computed styles and stylesheet on 2026-11-07 across 14 pages. Derived by us, not measured: the violet highlight tint and the button hover darkening.
Why: match the sponsor's look for the demo.
**Fonts:** wordsmith.ai uses Basel Grotesk and GT Ultra Median, which we believe are commercial (licences not read). This repo is public and we have no licence to redistribute them, so we ship Inter (body) and Newsreader (headlines, weight 300), both SIL OFL, self-hosted in `public/fonts/` (no network needed at the venue). Newsreader as the closest free match is a visual judgement. How to swap in licensed files: `public/fonts/README.md`.
Also: Geist (Google Fonts) removed from `app/layout.tsx`. Alert text uses the body colour on the orange and teal tints, because the brand colours on those tints measured about 3.4:1 contrast. The dev-only demo-patient button (D24) keeps its behaviour and is restyled as a dashed ghost button.

**D27 · 2026-11-07 · Om (requested), built by Claude · proposed**
The intake interview speaks in plain words with a slight professional manner that depends on the stage: a GP taking a history while the user tells the story, a solicitor at a first meeting for dates, places and what was in writing, a courteous clerk for contact details, a solicitor asking about goals for the desired outcome, then a short plain wrap-up. **No jargon at all**: no medical term the user has not used first, no legal term ever. At most one short acknowledgement, then one question; British spelling; no lists. Implemented only as prompt text in `lib/agent/interview.ts` plus a new opening line in `lib/agent/chat.ts`. All data and safety rules are unchanged: one question at a time, story before contact details, the email-risk wording and explicit-yes rule, only record what the user said, code decides "done" (D6, D7).
Why: the replies read as generic. Tone is the only thing changed.
**Limits:** the stage is inferred by the model from the facts it holds, using rules written in the prompt. It is not computed in code, so it can drift. If it does, compute the stage in code from `missingRequired` and pass it in as input. Not yet tried against the model (see `docs/PROGRESS.md`).

**D28 · 2026-11-07 · Om (requested), built by Claude · proposed**
The interview picks each question and its input type in code (`lib/agent/inputs.ts`), instead of the model choosing the next question in free text. Free text only where the answer is really free text (first name, the story). Everything else uses a suited input: date picker with exact / month and year / own words, text fields for place, `tel` and `email` fields, a postcode check, a title dropdown, buttons for who the complaint is about, the contact method and the email consent, and a checklist for the desired outcome. Widget answers skip the model. Supersedes the "stage is worked out by the model" part of D27: the stage is now computed by `nextTarget`, and the question wording is in `questionFor`.
Why: Om asked that not everything be a text box. It also makes the order predictable, removes a model call from most turns, and stops consent being inferred from loose text.
**Rules kept:** consent (`emailRiskAccepted`) and `desiredOutcome` are only read from their own question; declining the email risk clears the contact method; code, not the model, decides "done".
**Limits:** the title list (Mr, Mrs, Miss, Ms, Mx, Dr, Prof) and the hospital suggestions are our own and not checked against the NHS form. The model path (free text) is still not tried live.

**D29 · 2026-11-07 · Tarun · decided, built by Claude**
(1) **Medical records are not a step.** They are an optional profile field (`medicalRecords`), never asked during intake, asked only at the step that needs it (solicitors). We do not automate NHS Lothian's records portal (it needs a real account). (2) **The ombudsman step stays visible and clickable but locked:** it explains that the SPSO only considers a complaint after the organisation's final written response, and why we have the step. (3) Steps are renumbered: 1 NHS complaint, 2 ombudsman, 3 legal aid, 4 solicitors, 5 case file. Older entries (D23 mentions "steps 4 and 5") use the old numbering (old 3-6 = new 2-5).
Why: records are not needed to complain; the user's mental model is "NHS first, then escalate depending on how it goes", and a locked-but-explained step teaches the order instead of hiding it.

**D30 · 2026-11-07 · Tarun (requested), Claude (built) · decided**
Step 2 fills the **real SPSO online complaint form** (`forms.spso.org.uk/spso/form/delay/`, 14 pages) with the Decisions engine and **stops on the "Review and send" page**; it never presses "Send complaint" and never clicks "Save for later". Answers only the user knows (does the NHS letter refer to the SPSO, court action, children, other reviews, regulators, impact, outcome, how documents will be provided) are asked **at this step**, not at onboarding, and are checked in code (the form needs an outcome of 15+ words) before the browser opens. Engine additions: `advance` (only "Next" buttons may be clicked), `stopAtUrl`, `ignore` (never type into the "resume saved complaint" login box on the first pages), no advancing while a required field is unresolved, `--` counts as a dropdown placeholder, duplicate choice labels are merged. The step opens only after the NHS final reply; a dev-only "Demo: pretend NHS Lothian has replied" button opens it (same rule as D24). **Uploading documents is not automated** (the form's upload needs a real file); the UI offers "post" or "don't have it". Supersedes the "recommendation only" note about records in `PROGRESS.md` (see D29 for records).
Why: Tarun asked for step 2 to fill the form and ask the user to submit. It is also the most complex flow we have (14 pages, validation, a trap box, two word limits).

**D31 · 2026-11-07 · Tarun (requested), Claude (built) · decided**
Adopt a **design system matched to Wordsmith**, documented in `docs/DESIGN.md`, with tokens in `app/globals.css` and components in `app/ui.tsx`. New shell: blue header (logo, "Case for <name>", profile icon on the right), stepped stripes under it, the profile as its own page where the blue continues then stops, a left "Your path" timeline with no circles, the draft shown as a cream document with edit-in-place, call-to-action buttons **under** their text. Dark mode is off. **Progress** (percent and milestones) is shown in the rail; milestones are only things we can know plus self-reported "I've pressed Send", and unbuilt steps count toward the total so it cannot reach 100% early. Fonts: Newsreader and Inter as stand-ins for Wordsmith's licensed GT Ultra Median and Basel Grotesk. The logo is a placeholder.
**Relation to D26 (Om):** same palette and the same fonts, found independently. Merged on 2026-11-07 into **one token set** in `app/globals.css`: the names in D31 are canonical; Om's names (`cream`, `mist`, `body`, `hairline`, `brand-50`, `orange` ...) stay as aliases for the onboarding widgets, and his `.btn-*`, `.field`, `.card`, `.eyebrow` classes now follow the same specs as `app/ui.tsx`. Om's **self-hosted** fonts replace the Google-loaded ones (works offline at the venue). **Changed meaning:** in D26 `paper` was white; in D31 `paper` is the cream document colour (white is `bg-white`). Where D26 and D31 differ (layout, component specs), D31 applies.
Why: the track is sponsored by Wordsmith and Tarun wants it to look polished and coherent, not like a prototype.

**D32 · 2026-11-07 · Tarun (requested), Claude (built) · decided**
**The agent's browser is shown inside the app**, in a dark panel docked on the right, instead of only in a separate Chromium window. How: `openSession()` attaches every context to `lib/liveview.ts`, which starts a CDP screencast (`Page.startScreencast`, JPEG q70, max 1300x900) on each page and publishes frames from the newest open page to a process-wide bus; `GET /api/live` streams it as server-sent events (frames are dropped, not queued, when the client is slow); `app/LiveView.tsx` is mounted once in `app/layout.tsx`, appears by itself when a session starts, pads the page so it does not cover content, and shows the URL and frame rate. **Take control** (behind a confirm warning that Submit is real) forwards clicks, scrolling, typing, Back and Close to the page via `POST /api/live`. Env: `IN_APP_BROWSER=1` runs Chromium headless but otherwise exactly like a visible run (slowMo, kept open 10 minutes for review), so the browser exists only in the app; `LIVEVIEW=0` turns the stream off. Default is unchanged: a visible window, now mirrored in the app too.
Why: a plain iframe is impossible (NHS Lothian sends `frame-ancestors` limited to NHS domains; SLAB and SPSO send `X-Frame-Options: SAMEORIGIN`, checked 2026-11-07 with curl), and an iframe would be a second copy of the page, not the one the agent controls. Showing the real page next to the case looks far better in the demo and also works when the server is not the presenter's laptop.
**Limits:** one view per Node process (the newest session wins if two overlap). Typing in control mode sends single characters and common keys only (no shortcuts, no paste, no IME). The user's own clicks are not subject to the agent's never-submit rule; the confirm dialog is the only guard.

**D33 · 2026-11-07 · Tarun · decided, built by Claude**
**No forms in our app. A step is: one sentence about what will happen, one button.** The agent prepares everything from onboarding and from earlier steps (the complaint text is written in the background; the ombudsman's "how it affected you" and "what you want" are written from what the user already said; the SPSO yes/no questions use defaults such as "Don't know"). **Anything agreed in an earlier step is never shown again or re-asked.** The review happens **on the real form**: the agent stops before Submit/Send and the user checks and edits there (the SPSO review page has an edit link per section). **Ask only what is missing, on the step itself:** missing profile facts are asked inline with Om's onboarding inputs (`app/case/AskMissing.tsx`); if the agent meets a field it cannot fill, the step asks exactly that field (`app/case/AgentAsk.tsx`) and runs the fill again with the answer (it restarts the fill; it does not resume mid-form). The SPSO "I have read this page" box is covered by one line next to the button. Supersedes the review screens in D30/D31 (draft-as-document panel, assumptions list); the design tokens and shell in D31 stand.
Why: Tarun: showing the form's questions in our app "is just copying the form onto our website"; the user already did onboarding and should not type again.

**D34 · 2026-11-07 · Tarun (requested), Claude (built) · decided**
Changes to the live view (D32), after Tarun tried it: (1) **Inside the web app there is no separate Chromium window by default**; the browser is only seen in the panel. `openSession()` launches headless when running in the Next.js server; `SHOW_BROWSER_WINDOW=1` brings the window back. CLI scripts are unchanged (window, unless `IN_APP_BROWSER=1`). In-app runs keep slowMo and the 10-minute review wait. Supersedes D32's "default is unchanged" and D25's separate review window. (2) **Light panel** (`subtle` background, no border, no dark colours) where the page **fills the panel top to bottom**: the panel reports its size and the server sets the page's viewport to the same shape, at least 1100px wide so sites keep their desktop layout. (3) **The left edge is draggable** (double-click resets); the width is remembered in localStorage. (4) **User input goes over CDP** (`Input.dispatchMouseEvent` / `dispatchKeyEvent` / `insertText`), not Playwright's `page.mouse`, because Playwright adds the session's 250 ms slowMo to every call; scroll and hover are merged so only one request is in flight; clicks and keys are sent in order. Hover is now forwarded too.
Why: Tarun found the separate window confusing, the dark panel ugly, and scrolling "super laggy". Measured: a scroll took about 520 ms per request before and queued up during a gesture; after, 1-10 ms in process and 12-50 ms from request to the new frame over HTTP on a dev server.

**D35 · 2026-11-07 · Tarun (chose option A), Claude (built) · decided**
**The case page shows two paths, not one line.** `app/case/PathMap.tsx` replaces the left timeline (`Timeline.tsx` deleted): "Your story" at the top splits into **Get answers** (1 NHS complaint, 2 ombudsman) and **Get compensation** (3 legal aid, 4 lawyers), which join at **Your case file**. Each step has a `track` in `app/case/steps.ts`. The path you are on is drawn in `brand`; dashed boxes are waiting (locked) or not built; the progress line and the active step's milestones sit above and below the map. The step page is full width under the map. Supersedes the left rail in D31 and `docs/DESIGN.md` ("Left rail").
Why: the two routes are independent in reality (a compensation claim does not wait for the ombudsman, and the court time limit keeps running), and the straight list made them look like one queue. Tarun called the first version ugly; the look is open for the frontend agent to improve, the structure (fork, two lanes, join) is the decision.

**D36 · 2026-11-07 · Tarun (requested), Claude (plan) · decided**
**Step 3 is "Can I get legal aid?" plus "who could take my case", run as several browser agents at once, shown as a live grid.** Contract in `lib/agent/legalAidTypes.ts` (client-safe), sample data in `lib/agent/legalAidFixture.ts`. The step asks only the calculator's questions (benefits first; if yes, nothing else; otherwise partner, dependants, yearly income, outgoings, savings; or "skip, assume no win no fee"), then in parallel tabs: SLAB's civil legal aid calculator, SLAB's solicitor finder (Civil > Medical negligence > active in the last 12 months), the Law Society directory as a cross-check, and the websites of the top firms (do they act for patients, no win no fee, where is the enquiry form). Output: a verdict in honest words ("you may qualify financially; a solicitor applies and SLAB also checks the case has merit"), a route (legal aid or no win no fee) and a shortlist of 3 firms with plain reasons, which step 4 uses. Each agent has its own coloured cursor drawn in the page and a tile in the live grid. Split: backend and browser work by Claude in the parent thread (`lib/liveview.ts` multi-page streams, cursor, `lib/agent/legalAid.ts`, `/api/agent/step3`, bench tasks); UI by the frontend agent (live grid client, step 3 screen, results, profile field, progress, PathMap look).
Why: the legal aid calculator alone is 5 fields that the benchmark already passes; the value and the browser complexity are in turning one answer into a different set of firms across many sites, and showing that live.

<!-- Add new entries above this line. Next number: D37 -->
