# Project state

Last updated: 2026-11-07. Update this file when you build or verify something.

## The idea in one paragraph

Ailsa (21, student, Edinburgh) fell on her hand. A&E said sprain; weeks later a GP found a scaphoid fracture that has not healed. The agent interviews her, drafts a complaint, fills the NHS Lothian complaint form in a visible browser (she approves before anything is sent), and later checks the ombudsman and legal aid, finds solicitors, and builds one case file. The browser work is the point of the track; the legal content is just the setting.

## Flow and status

| # | Step | Status |
|---|---|---|
| 0 | Intake interview -> structured facts, saved as a profile | **Built.** Real OpenAI agent. Tested end to end |
| 1 | Complain to NHS Lothian | **Fill is built and tested on the Decisions engine** (D21). Stops before submit. **Submit is not built** (needs approval path, test-data decision, reCAPTCHA handling) |
| 2 | Medical records request | Not built. Plan: code fills a PDF. Whether Lothian has an online route is **unverified** |
| 3 | Ombudsman (SPSO) check | Not built. Site verified up to question 5 (see below) |
| 4 | Legal aid check (SLAB) | Not built. Site verified, **and the benchmark completes it end to end** with the Decisions agent (`bench` task `slab`) |
| 5 | Find solicitors, send enquiries | Directory search built (`/dev`) and driven by the agent in the benchmark (`lawsoc`). Anderson Strathern, MFMac and Irwin Mitchell forms are filled (not submitted) in the benchmark. Not yet wired into the app |
| 6 | Case file | Not built |

Not in scope for now: booking an expert (solicitor chooses and instructs experts), consultation booking, England, filing with the ombudsman for real.

## What exists in the repo

- `lib/agent/*`: see `AGENT.md`. Interview (structured output), draft (text from facts only), browser tool loop (`fill`, `select`, `check`, `click`, `ask_user`, `finish`), NHS Lothian runner.
- UI: onboarding chat, `/case` with a Profile tab (view and edit every fact, saved in the browser's localStorage) and a steps sidebar. Step 1 now has a draft approval and form-fill button, streamed browser activity, and results with missing fields/questions. Verified through the app on 2026-11-07 with fictional Ailsa data. The filled browser stays open up to 10 minutes for review. Submission remains manual and untested.
- `/dev`: button that searches the Law Society directory in a headed browser.
- Dev shortcut: the onboarding page has a **"Skip: use demo patient"** button (dev builds only) that loads the fictional Ailsa Reid from `lib/agent/sample.ts` with a ready-made draft and opens `/case` (D24).
- Interview inputs (D28): code picks each question and its input type (date picker, dropdown, buttons, checklist, tel/email fields); free text only for the first name and the story. **Unverified:** the free-text model path; title list and place suggestions against the real NHS form.
- Interview manner (D27): plain words, GP-like then solicitor-like by stage, no jargon. **Unverified:** how the model actually behaves with the new prompt; not run yet.
- Theme (D26): Wordsmith palette plus self-hosted Inter and Newsreader. Tokens in `app/globals.css`; shared classes `.display`, `.eyebrow`, `.btn-primary`, `.btn-ghost`, `.field`, `.card`, `.hl-blue`, `.hl-violet`. **Verified** (2026-11-07): colours and font names read from wordsmith.ai; typecheck, lint and a production build pass; pages screenshotted with fictional data. **Unverified:** that Newsreader is the closest free match to GT Ultra Median; that the commercial fonts are not redistributable (we did not read their licences).

## Verified site facts

All checked on 2026-11-07 with headless Playwright, a Chrome user-agent, **nothing submitted**.

| Site | URL | Finding |
|---|---|---|
| NHS Lothian online feedback form | https://www.nhslothian.scot/yourrights/online-feedback-form/ | One page. **Required:** details, location, who it is about (Me/Someone Else, "Me" preselected), first name, last name, address, postcode, telephone, email, how to communicate. Optional: outcome wanted, title, date of birth. **No file upload.** Choosing Email reveals a **required consent checkbox** (email-risk disclaimer). Contains a **honeypot field** (`nf-field-hp`) that must stay empty. Radios and checkboxes are `opacity:0` with custom-drawn boxes. reCAPTCHA scripts present; no visible CAPTCHA |
| SPSO complaint checker | https://www.spso.org.uk/form/complaint-checker | Multi-step radio questions: Scottish public service? -> final written response received? -> when (under or over 1 year) -> when did you first know (under or over 1 year) -> desired outcomes (Money, Disciplinary action, Decision overturned, None). Answering "No" to the final-response question stops with "SPSO can only consider a complaint once you have completed the organisation's process". Verdict screen after question 5 **not seen** |
| SLAB civil legal aid estimator | https://www.slab.org.uk/new-to-legal-aid/eligibility-estimators/estimator-civil-legal-aid/ | 5-step branching form; result calculates on the page as you type. Dummy student figures returned "likely to qualify for civil legal aid". **403 without a normal Chrome user-agent** |
| Law Society "Find a Solicitor" | https://www.lawscot.org.uk/find-a-solicitor/ | Search by postcode/city, area of law, legal aid checkbox. "Edinburgh" + "Accident and injury" returns 97 firms with name, address, legal-aid badge, partner count. Cookie banner blocks clicks until dismissed. The "Medical negligence" sub-category is a hidden multi-select; **setting it did not work yet**, so results are not filtered to clinical negligence. Result rows show **no website link**; "View details" not yet opened. The list appears to include defender-side firms (e.g. insurer-side) - **unverified** |
| Firm enquiry forms | [Anderson Strathern](https://www.andersonstrathern.co.uk/legal-expertise/medical-negligence/), [MFMac](https://mfmac.com/legal-expertise/individuals-and-families/personal-injury/medical-negligence-compensation), [Irwin Mitchell contact form](https://www.irwinmitchell.com/contact-us) | **Anderson Strathern:** on-page form; First/Last name, Email*, Phone*, City, Company, "How can we help?"*, Yes/No radio (meaning unknown), "how did you hear" dropdown, **two required checkboxes** (one says you are not eligible for legal aid unless seeking help with medical negligence and links to SLAB; one is Terms/Privacy). **MFMac:** enquiry form in a popup; Your Name*, Telephone, Email*, urgency dropdown (Urgent / General enquiry), summary*, optional "send me a copy". **Irwin Mitchell:** the Scotland page has **no form**; the form is at `/contact-us` (First*, Last*, Email*, Phone*, Description; "Request a callback" is disabled until required fields are filled). Invisible reCAPTCHA reported on submit for the firms (not tested by us). Slater & Gordon gave a certificate error from one machine. Corrected 2026-11-07, see Discrepancy 1 in `docs/PROGRESS.md` |
| GMC register | https://www.gmc-uk.org/registration-and-licensing/our-registers | Search box exists and no CAPTCHA seen. **Search results never loaded** in testing. Several GMC URLs we guessed returned 404 |

## Decisions API (Luna) facts

Verified 2026-11-07 against our key and OpenAI's official pages (see `docs/PROGRESS.md` for how). `POST /v1/decisions`, only model `gpt-6-luna`, generally available. Body: `model`, `input` (string/array of text, image, JSON), `questions` (1-400, types `predicate`, `choice`, `score`). Answers come back in question order with probabilities and, for choice/score, `confidence`. No free-text output, no DOM input type (send your own text snapshot). Observed: one call mapping 5 fields in 163-853 ms. Benchmark (2026-11-07): 10/10 on 10 sites on the second run, 0.3-2.8 s model time per task; see `docs/PROGRESS.md`. Unverified: OpenAI's "10x faster than Responses" claim, cost per call, comparison with the tool loop, flakiness beyond 2 runs. `gpt-5.6-luna` is a different, cheaper chat model, not the Decisions API.

## Gotchas we hit

- SLAB blocks Playwright's default user-agent (403). Use `openSession()`.
- Cookie banners appear late and intercept clicks. `dismissCookies()` waits for them.
- Honeypot fields look visible to scripts. `observe.ts` skips them.
- Styled radios/checkboxes are invisible to naive visibility checks. `observe.ts` counts them if their label is visible.
- tsx/esbuild injects `__name` into code sent to the page. `openSession()` defines it via an init script.
- Next.js 16 here rejects `export const runtime` in route handlers when `cacheComponents` is on. Read `node_modules/next/dist/docs/` before relying on older Next knowledge.
- Only one `next dev` per project directory.
- Forms can load lazily: wait before concluding a form is absent (Irwin Mitchell).
- Pages can navigate under you; `observe()` retries after a navigation.
- Cookie banners differ per site; `dismissCookies()` now finds reject/necessary buttons generically.
- SLAB shows only one radio question on first load; later steps appear after answering.

## Unverified claims (do not present as fact)

- Complaint and court deadlines (about 2 months and about 2 years 8 months were illustrative), the 3-year court limit, the SPSO 12-month rule (the SPSO checker itself asks about 1-year limits, which is the only part confirmed).
- NHS Scotland complaint timeframes (acknowledge in about 3 working days, respond in about 20).
- How much the ombudsman can pay; how legal aid applies to clinical negligence cases.
- Whether a clinical guidance page exists that matches Ailsa's case (step 3 of the original plan; no URL checked).
- How the invisible reCAPTCHA behaves on a real submit.
- Which models perform best: only a single-call latency check was done.

## Honest weak points for the pitch

- The track scores browser-use complexity. NHS form (one page) and SPSO (5 questions) are easy. Strongest browser difficulty is finding firms and filling many different firm forms.
- A general coding agent with a browser could do this once. The defensible claims are reliability, speed, safety gates, and recovery from failures.
- "Everything stays local" is **not** true: data goes to OpenAI and to the organisations the user chooses. Do not claim it.
- Ideas to deepen complexity (not built, not decided): run the firm search on 8-10 unseen firms; a second complaint route (GP vs hospital); email replies and account-creation flows.
