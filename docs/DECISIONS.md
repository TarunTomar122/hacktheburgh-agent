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

**D37 · 2026-11-07 · Om (requested), built by Claude · decided**
**The product has a logo and a favicon: Om's "Elliot" monogram** (a white disc, navy ring, blue shadow stroke; Om sent a cream-filled first version and replaced it with the white one the same evening). It replaces the placeholder text wordmark "Case helper" in the shell header (`Logo` in `app/ui.tsx`, used by `app/case/Header.tsx`) and appears on the onboarding page where the text eyebrow was. Files: `public/logo.png` (header, 171x160, shown 40px tall), `app/icon.png` (512), `app/apple-icon.png` (180, on `brand` blue because iOS fills transparency with black), `app/favicon.ico` (16, 32, 48). Next.js picks up the three files in `app/` without any metadata code. The original came as an opaque black square, so the black outside the disc was made transparent with an anti-aliased ellipse mask measured from the image (the disc is 1269x1188, slightly wider than tall; it is kept at those proportions, not squashed to a circle). No colours were added: the white is `bg-white` and the blue matches `brand`, so the design system (D31) is unchanged. White stands out against the blue header better than the cream did. This is the swap that `docs/DESIGN.md` said to make when there was a real logo, so D31 stands.
Why: Om asked for the logo as the site icon and in the header, in the Wordsmith colours.
**Limits:** the page title is still "Case helper" (we have not confirmed that "Elliot" is the product name; the logo text reads "Elliot"). The original artwork is not in the repo; `public/logo.png` is the only copy. The navy ring has modest contrast against `brand` blue, so the white fill is what makes the disc stand out on the header. Not checked in Safari, on a phone or in a pinned tab.

**D38 · 2026-11-07 · Om (requested), built by Claude · decided**
**When the agent's browser closes, the live panel closes too.** On the `end` event the panel shows "The browser has closed" for 2 seconds, then removes itself, drops the last frame and gives the page its width back (`CLOSE_AFTER_MS` in `app/LiveView.tsx`). Before, it stayed as a faded copy of the last page until the user pressed Dismiss; that button is gone. If a new session starts inside the 2 seconds, the panel stays and shows the new one. If the user had hidden the panel, the "Agent's browser (closed)" button also disappears. Server side nothing changed: closing the context already closes the real browser (D32, D34).
Why: Om: "if the browser is closed, the tab should get closed for real". A frozen, faded page looked like something still open. **Limit:** this is Om's reading of "the tab"; if he meant the real Chromium process, that was not the problem seen. It touches Tarun's live view (D32, D34): Tarun, please look.

**D39 · 2026-11-07 · Tarun (requested), Claude (built backend) · decided**
**Every step 3 result can be traced and every score explained.** The runner records each agent action as a `TraceStep` (what, where, the model's confidence, the longer detail such as the links it chose between or the page text it read, and a screenshot at key moments), streamed live and returned in `Step3Result.trace`. Screenshots: `GET /api/agent/step3/shot?run=&file=` (strict name checks, only `.runs/step3-*`). Each firm has `breakdown` rows (takes legal aid, active, distance, Law Society, acts for patients, no win no fee, enquiry form, website read), each with points, max, status and evidence, and `fit` = points / max for the route. **Fit is shown as "how well this firm fits what you need", never as a chance of winning**: we have no data to estimate case outcomes, and an invented number on a legal tool would mislead. Weights are our judgement (legal aid route: legal aid 30, distance 20, patients 20, website read 15, active 10, no win no fee 10, form 10, Law Society 5; no-win-no-fee route raises no win no fee to 30 and lowers legal aid to 5).
Why: Tarun wants to see why each firm scored what it did and exactly how the agents found and checked it.

**D40 · 2026-11-07 · Om (requested), built by Claude · decided**
**The landing page is the big name question; the chat starts after it.** `app/NameStep.tsx` is a full-width, one-question screen in the manner of Typeform (large serif question, a large borderless field with an underline, `OK` and Enter to submit), under the same blue header and stripes as the case shell, with the logo (D37). When the first answer is sent, the page switches to the existing chat (`InputPanel` and its widgets, unchanged) under the same header. The name still goes through the normal free-text path, so "Om" and "Om Prabhu" both work (D28); `parseName` and `interviewTurn` are untouched. The header shows "Case for <first name>" once the name is known. The old title block ("Let's start with you") is gone. Details in `docs/DESIGN.md`, "Landing screen".
Why: Om asked for a more professional landing page and for the name to be a big field to type into.
**Limits:** only the name step has the big-field treatment; later questions still use the chat widgets (the free-text story box, forms, buttons, checklist). Making every question a full screen is possible with the same widgets but was not asked for. The opening sentence is duplicated: the screen has its own hero text and the chat still shows `OPENER` from `lib/agent/chat.ts` as its first bubble.

**D41 · 2026-11-07 · Om (requested), built by Claude · decided**
**Every onboarding question is its own full screen, one at a time (Typeform style).** The agent's question is a large serif heading, with one input below, `OK` or Enter to go on, and a thin progress bar under the stripes. New `app/StageInputs.tsx` and `app/StageControls.tsx` replace `InputPanel` in `app/page.tsx` only. Text and story: a big underlined field. Forms (details, contact): one field per screen with "n of m", a back link and per-field validation (same messages as before), sent to the server as ONE answer at the end, so the API is unchanged. Choices: lettered rows, press A, B, C. Outcome: tick rows plus a big "other" field and a "nothing to add" row. The summary is a card on its own screen. `DateField` gets an opt-in `big` prop.
Why: the name screen (D40) set the look; a chat with a form under it felt like two products. One question at a time is calmer for someone describing a bad experience, and it works on a phone.
**Not changed:** `InputPanel.tsx` stays for the case page (`AskMissing`, D33). Interview logic, API shape and `lib/agent/inputs.ts` are untouched. No back navigation between questions, except inside a form (mistakes are fixed in the Profile). A multi-field form as one long scrolling page was rejected: the opposite of one question at a time.

**D42 · 2026-11-07 · Tarun · decided, built by Claude**
**After onboarding we recommend one track and the user follows only that one.** Two tracks: **Make a complaint** (NHS Lothian complaint, then the ombudsman; gets an explanation, an apology, changes, not money) and **Claim compensation** (legal aid check and firm shortlist, then contacting lawyers; gets money if a solicitor takes the case and it succeeds). `/case` first shows "Your next step" (`app/case/TrackChoice.tsx`): the recommended track with a **fit %**, its reasons as scored rows with evidence, what happens next, and one Continue button; the other track sits underneath with its own fit and "Choose this instead". After choosing, `app/case/TrackBar.tsx` shows only that track's steps, its progress, and a "Switch to …" link. **Supersedes D35** (fork map; `PathMap.tsx` deleted).
**Fit** (`lib/agent/track.ts`): how well the track matches what the user told us, **never a chance of success** (we have no outcome data; Tarun chose this over a "chance of success" figure). Complaint: explanation 15, apology 15, changes 15, treatment or support 15, not asking for money 20, harm looks short-lived 20. Compensation: wants compensation 40, harm lasting or ongoing 30, cost money, work or study 20, treatment or support 10. The two story signals come from the Decisions API as probabilities (`lib/agent/trackSignals.ts`, `/api/agent/track`) and scale the points. Weights are our judgement.
**Onboarding changes:** the last question is neutral ("What would you most like to come out of this? Tick all that apply.") and has a new option, "Compensation for what happened". The NHS-only questions (how NHS Lothian should reply, the email-risk consent) are no longer asked in onboarding; step 1 asks them (`nextTarget(f, "nhs")`, `AskMissing scope="nhs"`, interview API `scope`), worded "How should NHS Lothian reply to your complaint?". Onboarding is complete when `missingForOnboarding` is empty. The contact-details lead-in no longer names NHS Lothian. Step pages are labelled by track ("Complaint · step 1", "Compensation · step 1").
Why: the old flow assumed everyone makes an NHS complaint; someone who wants money would go the legal route instead. Tarun: suggest the direction, then help them do that one thing.
**Not done:** the NHS complaint draft can include "compensation" in its outcome if the user ticked it (the NHS complaint process does not pay money); the case file (old step 5) has no place in either track yet.

**D43 · 2026-11-07 · Om (requested), built by Claude · decided**
**New logo, a logo that links, and the full name in the onboarding header.** The logo and favicons are replaced by Om's new Elliot monogram (round, with the ring broken at the top right; `public/logo.png` is now square, 192 x 192, shown 40 px tall). `LogoLink` in `app/ui.tsx` wraps it in both headers: with no saved case it goes to `/` (the landing page); with a saved case it goes to `/case#profile`, and on the case page it opens the profile in place. `app/case/page.tsx` reads `#profile` after mount to open the profile. The onboarding header shows first name plus last name once both are known (the case page already did).
Why: Om asked for the new icon, for the header name to be the full name, and for the logo to take the user to the right place for their stage.
**Limits:** the logo on the landing page does nothing while an interview is in progress and no case is saved (it is already the landing page); the interview's answers are held in memory, so a reload from elsewhere still starts again. The old logo (D37) is superseded, its generation script is not in the repo.

**D44 · 2026-11-07 · Om (requested), built by Claude · decided**
**Email is checked harder, and a postcode typed in the address is not asked for again.** `emailProblem` in `lib/agent/inputs.ts` replaces the old "has an @ and a dot" test: one `@`, local part at most 64 characters with no leading, trailing or double dots, domain labels of letters, digits and inner hyphens, a letters-only ending of 2 to 24 characters, at most 254 characters overall, and a catch for typing slips (`gmial.com`, `gmail.con`, an ending of `.con`, `.comm`, `.cmo` and similar) that says what it suspects. Used by the interview screens, the compact widgets, the profile and the server (`validatePatch`). `splitPostcode` finds a valid UK postcode inside an address; the onboarding stepper then skips the postcode question and shows "Postcode ... taken from your address"; the compact form, the profile (on leaving the address field) and `normaliseFacts` (server, including the model path) do the same. The postcode is removed from the address text so it is not stored twice.
Why: Om wanted a harder email check and no second question for a postcode he had already typed.
**Limits:** the email check is about shape and slips only. It does not prove the mailbox exists; a DNS (MX) lookup was left out because it would fail on bad venue Wi-Fi and `example.com` has no mail server, which would break demo data. A postcode typed in the address is only used when the postcode field is empty (or was filled by us). A valid-looking pattern inside an address that is not a postcode (for example a flat code) could be mistaken for one; the person sees the note and can go Back.

**D45 · 2026-11-07 · Tarun (decided), Claude (built) · decided**
**Step 4: contact up to 3 firms, and the agent presses Send only after the user approves each one.** Contract `lib/agent/enquiryTypes.ts` (`MAX_ENQUIRIES` = 3). One message is drafted from the profile (facts only, first person, no claim of negligence) and can be edited. Agents fill each firm's enquiry form in parallel tabs and stop before Send; the tabs stay open so the approval can be acted on. The approval shows what was filled and lists every consent checkbox text; **only boxes the user ticks in our app are ticked on the firm's form.** No form after a harder look (contact links, popups, footer, iframes; about 5 hops) -> an email draft with a `mailto`. **Send gate:** the server refuses (`send_blocked`, with the reason) unless `ALLOW_REAL_SEND=1` **and** the profile email is not an example.com address, so a fictional patient can never reach a real firm. Invisible reCAPTCHA on submit is reported, not worked around. Replies are tracked by hand (`profile.enquiries`; follow-up 3 working days after sending, a rule of thumb, not a deadline) until inbox reading exists. Step 3's selection stops at 3. Ownership: the frontend agent built the UI, and owns the backend from 2026-11-07 (parent thread moved to the evidence agent). Numbered D45 because Om's D43 and D44 landed first (the contract draft said D43).
Why: Tarun wants the agent to do the sending, but never without the user seeing exactly what goes and agreeing to each consent; and a demo must never contact a real law firm.

**D46 · 2026-11-07 · Tarun (asked), Claude (built) · decided**
**Step 4 asks as little as possible of the user and recovers by itself.**
- **One card per firm, side by side.** Each card shows a 4-stage track (Form found, Filled, Your OK, Sent) and **exactly one** next action, which changes with the state: "Review and send", "Try again" (only after the agent's own retry failed), "Call them" (no form and nothing to swap) or "They replied". The card itself opens the agent's steps for that firm, and one quiet "Agent log" shows the whole run.
- **Replies are tracked on the card.** The separate tracker list is gone.
- **No email drafts.** We cannot send email for the user, so a draft was a dead end. When a firm has no online form even after a harder look, the run **swaps in the next best checked firm** (`reserves`, best first, sent by the client). This is shown as one line on the screen and as a `recover` trace step.
- **Recovery:**
  - Each firm is retried once automatically after a failure.
  - If the Decisions API fails (e.g. 503), filling switches to the backup tool-calling engine (`runBrowserAgent`) and logs it.
  - New status `no_form` and fields `swappedFor` and `attempts` in `lib/agent/enquiryTypes.ts`. `email_draft` is legacy.
- **Layout:** step 4 uses the full width (no side panel). Step layouts use container queries, so the content adapts to the space it really has when the live panel takes half the window.
- **Live panel:** it no longer opens by itself. It starts as the floating "Watch N agents live" button. Its header is two plain lines: who you are watching and Hide, then the address as "site › section › page".

Why: Tarun found the old screen confusing (three buttons per firm, a duplicate replies list, a dead-end email draft, a failure with no way out) and the auto-opening panel unhelpful.

**D49 · 2026-11-07 · Om (requested), built by Claude · decided**
**Step 1 has a "Skip and continue to step 2 (demo)" button.** It sits next to "Fill in NHS Lothian's form" in `app/case/page.tsx`, is always shown (not hidden in production builds, unlike the other demo shortcuts), and is disabled while the browser agent is filling the form. It sets `ombudsman.unlocked` (as if NHS Lothian had replied) and opens step 2.
Why: the demo does not file a real complaint, so the demo needs a way past step 1 without the agent run, and without waiting for a reply that will never come.
**Limits:** it does NOT mark "NHS form filled in" or "Complaint sent to NHS Lothian" as done, because neither happened; the checklist and the progress figure stay honest. The button should be removed or gated behind `NEXT_PUBLIC_DEMO_SKIP` before any real use.

**D50 · 2026-11-07 · Om (requested), built by Claude · decided**
**The suggestion page comes first; how NHS Lothian should reply is asked only on the complaint path.** The profile page no longer says "Still needed for the NHS form: How to contact you" before the user has chosen the complaint path: `ProfileTab` checks `missingForOnboarding` until `track.chosen` is "complaint", then `missingRequired`. The logo (`LogoLink`, refines D43) now goes by stage: no case -> `/`; a case but no path chosen -> `/case`, the suggestion page; a path chosen -> the profile. `/case#profile` is cleared from the address once it has opened the profile, so a reload or Back does not reopen it.
Why: Om saw the profile page with a missing contact method, with no path chosen; after the interview the user should see the suggestion, and only someone who takes the complaint path is asked how NHS Lothian should reply (that question was already moved to step 1 in D42).
**Limits:** the profile page itself still has the contact-method field; it is reachable from the header's profile button at any time and is not asked for until step 1. `progress.ts` still counts "Your details are complete" with `missingRequired`, so that checklist line on the compensation path waits for a contact method it does not need (not changed here).

**D51 · 2026-11-07 · Om (requested), built by Claude · decided**
**"Why we suggest it" shows tick boxes, not points.** On the suggestion page (`app/case/TrackChoice.tsx`) each reason is a plain row, ticked (teal) when it fits what the user told us and an empty box when it does not (`CheckRow` in `app/case/scoreParts.tsx`). No "15/15", no bar. A reason the AI could not judge is an empty box with "Not clear from your story." The sentence that used to open on click is now the tooltip. The fit % ring stays.
Why: Om: the points looked exact and told the user nothing more than a tick; four of the six rows were already yes or no (a ticked outcome box gets full points, an unticked one gets zero), and the other two come from an AI estimate, so a "16/20" suggested more precision than there is.
**Not changed:** the scoring in `lib/agent/track.ts` (the points still make the fit %, and the recommendation still goes to the higher fit), and the step 3 firm score rows (`ScoreRow`), which still show points and bars. The fit % can no longer be added up from what is on screen; if that is a problem, the next step is to drop the % as well.

**D47 · 2026-11-07 · Tarun (asked), Claude (built) · decided**
**The planner agent decides the route (D47 was the first version).** A reasoning model (`MODELS.draft`) with tool calls plans and replans its own route through the compensation work, in `lib/agent/planner.ts`.
- **Tools:** funding calculator, SLAB's solicitor list, web search (Brave; Google blocks headless browsers and DuckDuckGo returned nothing), any page, firm website checks, Law Society register, clinical guideline, care comparison, BAILII judgments, enquiry forms, asking the user, shortlist, finish.
- **Parallel work:** tools called in the same turn run at the same time in separate tabs (at most 4).
- **Asking the user:** workers ask only when a site needs it. The calculator asks each money question when the page shows it.
- **Budgets:** per-tool limits are set in the system prompt. Errors are returned to the planner so it can change course.
- **Routes:** `POST /api/agent/plan` streams `PlannerEvent`s; `POST /api/agent/plan/answer` delivers answers.
- **Safety:** nothing is ever submitted. Enquiry forms stop before Send and stay open for the approve-and-send in step 4 (`keepForApproval`).

**D48 · 2026-11-07 · Tarun (asked), Claude (built) · decided**
**The evidence agent (Iona)** is in `lib/agent/evidence.ts`.
- **Guideline:** reads NICE NG38's recommendations. Verified 2026-11-07: 1.2.3 "Consider MRI for first-line imaging in people with suspected scaphoid fractures following a thorough clinical examination".
- **Comparison:** compares them with the patient's own timeline and lists **possible** gaps as questions for a solicitor, plus a caveat. It never says negligence happened.
- **Judgments:** searches BAILII for Scottish judgments and reads up to 2, labelling honestly whether a case is medical negligence or only a similar injury from another cause.
- **Bot check:** BAILII is behind Anubis, a proof-of-work check that a real browser passes by itself. The agent waits for it to clear; it does not evade anything.
- **Caveat:** NICE is an England guideline; the caveat says so.

**D52 · 2026-11-07 · Tarun (asked); design critique by Codex; built by Claude · decided**
**Step 3 is "Preparing your case": a named crew working live** (`app/case/CaseRun.tsx`).
- **Crew:** Elliot (leads), Nell (funding), Robin (finds solicitors), Vera (checks firms), Iona (clinical evidence), Kit (enquiries). Every planner tool belongs to one of them (`TOOL_CREW`). Each worker's tab, cursor and tile carry its name and colour.
- **Before the run:** one sentence, one button, the crew.
- **During the run:**
  - the plan as workstreams that change live;
  - the crew strip (pick one to follow their work and browser);
  - a decision timeline of real events only: assignments, plain-English reports with "N browser steps with screenshots", decisions and the final summary;
  - one calm question card;
  - on the right, the crew's real browsers, rendered inline through `LiveView`'s new `#live-slot` mode, with a small name tag per tile.
- **After the run:** a case file covering funding (SLAB's words), the top 3 firms, the medical evidence and the enquiries waiting for approval, plus "Review the run" (the read-only timeline) and run totals.
- Codex's critique (human names, no chatter, square status marks, no pulsing questions, show the transferred object, real events only) is adopted.

**D53 · 2026-11-07 · Tarun (chose option A) · decided, built by Claude**
**Plush crew avatars and a 4-step strip.**
- **Avatars:** the crew's avatars are plush felt characters (`public/crew/<id>.png` and `-256.png`, generated by Codex with the OpenAI Images API; prompts in `public/crew/prompts.md`). They are original designs in the spirit of ChatGPT Dots, not copies. The geometric marks remain only for very small sizes.
- **Intro:** the intro paragraph is replaced by a 4-step strip on a thin line: 1 Check legal aid (Nell), 2 Find solicitors (Robin and Vera), 3 Gather evidence (Iona), 4 Fill enquiries (Kit). Then one button, then "Asks you only when needed · Nothing sent without your OK · ≈ 3 min".
- **During the run:** the same strip is the progress bar (`app/case/crew/StepStrip.tsx`): waiting, working, needs you or done, worked out only from the crew's real states and reports.
- **Tiles:** each tile's name tag in the live grid shows the avatar.

**D54 - 2026-11-07 - Luigi + Codex - decided**
The latest crew flow asks location permission before research, then asks for the patient's search postcode. Never derive proximity from the hospital or treatment location. Decline, skip or timeout means no distance ranking or proximity score. SLAB must confirm the approved Scottish postcode; retries reuse it. Permission is asked afresh for each run. This supersedes the default Edinburgh proximity assumption in D39. Other stashed UI/scoring changes are not restored.

**D55 - 2026-11-07 - Luigi + Codex - decided**
User authorized straightforward bug fixes and pushing them. Failed answers and terminal crew runs allow retry; unknown financial inputs remain unknown during fallback; exact dates must exist. Keep broader run lifecycle, approval isolation, evidence scope and retention choices for validation (BUG_REVIEW.md). Correct storage wording; no retention policy or real-send behavior changed.

**D56 - 2026-11-07 - Luigi + Codex - decided**
User requested fixes for review items 2, 3, 4 and 5. Enforce the planner's existing three-fill-attempt budget in code and permit filling only shortlisted, non-excluded firms. Report failed work as Needs attention, offer drafting retries, and describe proximity only with a verified approved location. Item 1 is unchanged. Real sending and browser engines are untouched.

<!-- Add new entries above this line. Next number: D57 -->

**D55 · 2026-11-07 · Om (asked), Claude (built) · decided**

**D56 · 2026-11-07 · Om (asked), Claude (built) · decided**
**The agent's browser closes by itself when its job is done**, so the live panel never sits on a stale page.
- **Legal aid crawl (step 3):** closes the moment the result is emitted. `runStep3` no longer has `keepOpen`.
- **Research plan (`runPlanner`):** closes every tab when the research ends. Only filled enquiry forms waiting for the user's OK stay (`keepOnlyTabs` in `lib/browser.ts`); the browser closes with its last tab, or after 15 minutes.
- **Law-firm enquiries (step 4):** each form's tab closes once it is sent or refused by the send gate (`releaseTab` in `lib/agent/enquiry.ts`). Other tabs close when the run ends.
- **NHS and SPSO complaint forms:** still left open so the user can check them and press Submit; the agent never submits. `closeWhenSubmitted` (`lib/browser.ts`) closes the browser 5 s after the page made a POST and now shows a confirmation it did not show before. It also closes when the user closes the tab, after 10 minutes, and from the buttons "Skip and continue to step 2 (demo)", "Mark as sent" and "I've pressed Send".
- **Not verified:** the confirmation-text check on the real NHS Lothian and SPSO sites (we never submit there). If it misses, the browser still closes on any of the other signals above.
- **Tested** with a local fixture form (submit closes it; closing the tab closes it; only the approval tab survives and closes the browser with it).

**D57 · 2026-11-07 · Om (asked), Claude (built) · decided**
**Demo skip on step 3 ("Preparing your case").** The intro screen has "Skip and continue to step 4 (demo)" beside the start button (`app/case/CaseRun.tsx`). It saves the step 3 sample result (`FIXTURE_RESULT`: three sample firms) as the profile's legal aid result, marks it as sample data and selects the three shortlisted firms, then opens step 4. No research runs. Step 4 then works on those firms' real websites (fills forms; the send gate stays closed). Same idea as D49.

**D58 · 2026-11-07 · Om (asked), Claude (built) · decided**
**Demo skip on step 4 ("Contact lawyers").** "Skip and mark as sent (demo)" sits beside "Fill their enquiry forms" and above the firm cards (`app/case/ContactLawyersStep.tsx`). It closes the agent's browser, marks every firm that has a form (or every picked firm, if nothing was filled yet) as sent with the note "Skipped in the demo: nothing was actually sent", and starts the three-day follow-up clock, so the demo can go on to "A firm replied". Nothing is sent. The button hides once every firm is marked. Same idea as D49 and D57.

<!-- Add new entries above this line. Next number: D59 -->
