# Project state

Last updated: 2026-11-07. Update this file when you build or verify something.

## The idea in one paragraph

Ailsa (21, student, Edinburgh) fell on her hand. A&E said sprain; weeks later a GP found a scaphoid fracture that has not healed. The agent interviews her, drafts a complaint, fills the NHS Lothian complaint form in a visible browser (she approves before anything is sent), and later checks the ombudsman and legal aid, finds solicitors, and builds one case file. The browser work is the point of the track; the legal content is just the setting.

## Flow and status

| # | Step | Status |
|---|---|---|
| 0 | Intake interview -> structured facts, saved as a profile | **Built.** Real OpenAI agent. Tested end to end |
| 1 | Complain to NHS Lothian | **Fill is built and tested on the Decisions engine** (D21). Screen is one button (D33): the draft is written in the background, missing facts are asked inline, fields the agent cannot fill are asked on the step and the fill re-runs. Stops before submit; the user reviews and submits on the real form. **Submit is not built** |
| 2 | Ombudsman (SPSO) complaint | **Built (D30, D33).** One button: the agent writes "how it affected you" and "what you want" from onboarding (returns nothing rather than inventing; then the step asks that one thing), uses defaults for the form's yes/no questions, fills the 14-page SPSO form and stops at "Review and send", where the user edits and sends. Tested: full fill (23 steps), and the ask-and-rerun loop (first name removed: run 1 asked only "Forenames", run 2 reached the review page). Benchmark 11/11. **Not built:** document upload, a real unlock (dev demo button only), submit. **Not tested:** clicking through the app with a visible browser |
| 3 | Legal aid check (SLAB) | Not built. Site verified, **and the benchmark completes it end to end** with the Decisions agent (`bench` task `slab`) |
| 4 | Find solicitors, send enquiries | Directory search built (`/dev`) and driven by the agent in the benchmark (`lawsoc`). Anderson Strathern, MFMac and Irwin Mitchell forms are filled (not submitted) in the benchmark. Not yet wired into the app. **This is where we ask about medical records** (D29) |
| 5 | Case file | Not built |

**Medical records are not a step** (D29). It is an optional field in the profile (`medicalRecords`: not requested / requested / have a copy), never asked in the intake chat, and asked only at the step that needs it (solicitors, later). Findings on how NHS Lothian takes requests are under "Records request" below. *Numbering changed on 2026-11-07: old step 2 was removed, so old 3-6 are now 2-5. Older decisions and notes may use the old numbers.*

Not in scope for now: booking an expert (solicitor chooses and instructs experts), consultation booking, England, filing with the ombudsman for real.

## What exists in the repo

- `lib/agent/*`: see `AGENT.md`. Interview (structured output), draft (text from facts only), browser tool loop (`fill`, `select`, `check`, `click`, `ask_user`, `finish`), NHS Lothian runner.
- UI: **redesigned 2026-11-07 (D31, see `docs/DESIGN.md`).** Onboarding chat, `/case` with a Profile tab (view and edit every fact, saved in the browser's localStorage) and a steps sidebar. Step 1 now has a draft approval and form-fill button, streamed browser activity, and results with missing fields/questions. Verified through the app on 2026-11-07 with fictional Ailsa data. The filled browser stays open up to 10 minutes for review. Submission remains manual and untested.
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
| SPSO complaint checker | https://www.spso.org.uk/form/complaint-checker | Multi-step radio questions: Scottish public service? -> final written response received? -> when (under or over 1 year) -> when did you first know (under or over 1 year) -> desired outcomes (Money, Disciplinary action, Decision overturned, None). Answering "No" to the final-response question stops with "SPSO can only consider a complaint once you have completed the organisation's process". **Verdict seen 2026-11-07:** after question 5 it asks "health or social work decision?", then which organisation type, then a "read the leaflets" confirmation, then ends with "You have reached the end of our complaints checker. If you would like to submit a new complaint, please complete our online form" linking to `forms.spso.org.uk/spso/form/delay/` |
| SPSO online complaint form | https://forms.spso.org.uk/spso/form/delay/ | **Verified 2026-11-07 by filling it with the fictional patient; nothing sent.** 14 pages (progress list): Delays in complaints handling, Making a complaint (tick "I have read this page"), Type of complaint (health? education? children under 18?), Common areas, Court action, Organisation (typed, "NHS Lothian" is recognised), Organisation's final response (complained directly? final response? does it refer you to the SPSO?), Date of complaint (month and year of the problem), Your contact details (title, forenames, surname, postcode, address lines, **email typed twice**), About your complaint (reference, what went wrong 20-500 words, how affected, outcome 15-500 words, other reviews, regulators), Upload complaint documents (four dropdowns: upload below / do not have / post), Diversity monitoring (sensitive, optional, left blank), **Review and send** (a confirmation box "I confirm I have uploaded the documents indicated above" and "Send complaint"). **Traps:** the first two pages carry a "resume a saved complaint" login (email and password); every page has **Save for later**; dropdown placeholder is `--`; some option lists repeat a label. A banner says the SPSO case system had a major outage and replies may take 3-4 weeks (as of 2026-11-06). The page text also says the SPSO **rarely recommends financial payment** and **cannot have someone dismissed or force disciplinary action** |
| SLAB civil legal aid estimator | https://www.slab.org.uk/new-to-legal-aid/eligibility-estimators/estimator-civil-legal-aid/ | 5-step branching form; result calculates on the page as you type. Dummy student figures returned "likely to qualify for civil legal aid". **403 without a normal Chrome user-agent** |
| Law Society "Find a Solicitor" | https://www.lawscot.org.uk/find-a-solicitor/ | Search by postcode/city, area of law, legal aid checkbox. "Edinburgh" + "Accident and injury" returns 97 firms with name, address, legal-aid badge, partner count. Cookie banner blocks clicks until dismissed. The "Medical negligence" sub-category is a hidden multi-select; **setting it did not work yet**, so results are not filtered to clinical negligence. Result rows show **no website link**; "View details" not yet opened. The list appears to include defender-side firms (e.g. insurer-side) - **unverified** |
| Law Society "Find an individual" | https://www.lawscot.org.uk/find-a-solicitor/?type=sol | **Verified 2026-11-07 (in-app browser, search only).** Fields `LastName`, `FirstName`, `IndividualName` (firm), `IndividualPostcode`, `AreaOfWork`; advanced `SolicitorAdvocate` and `Specialism` (36 options, incl. `Medicalneg` "Medical Negligence Law Specialisation" and `Medicalnegdo` "Medical Negligence (Defender Only)"). Edinburgh + `Medicalneg` returned 9 solicitors at 5 firms; + `Medicalnegdo` returned none. "View details" expands in place (address, phone, email, website, areas of law). Loading the results URL directly showed nothing; filling the form and pressing Search worked. Details: `docs/plans/browser-complexity-plan.md` |
| Firm people pages and clinical negligence forms | see the plan file | **Verified 2026-11-07, nothing submitted.** **Drummond Miller** has a dedicated clinical negligence intake form (`/contact-us/medical-clinical-negligence/`, about 38 fields: someone-else section with date of death, Yes/No "written complaint made?" and "investigation by Health Board / SPSO?", 8 narrative questions, invisible reCAPTCHA, possibly multi-page) and a filterable "Our People" page. **Anderson Strathern** has a per-person "Contact <name>" form on each profile (routing unverified). **Balfour + Manson** has a general form at `/contact-us/` (see Discrepancy 10 in `PROGRESS.md`). **Irwin Mitchell**'s people search did not find either register specialist. Two firms list specialists under a nickname of their registered first name |
| PASS contact form | https://pass-scotland.org.uk/contact/ | **Verified 2026-11-07, not submitted.** Privacy checkbox*, Name*, Postcode*, Phone*, Email* twice, "Any other information"; invisible reCAPTCHA. The Citizens Advice Scotland bureau finder (`cas.org.uk/get-advice`) returns a local bureau whose site has no online form |
| Firm enquiry forms | [Anderson Strathern](https://www.andersonstrathern.co.uk/legal-expertise/medical-negligence/), [MFMac](https://mfmac.com/legal-expertise/individuals-and-families/personal-injury/medical-negligence-compensation), [Irwin Mitchell contact form](https://www.irwinmitchell.com/contact-us) | **Anderson Strathern:** on-page form; First/Last name, Email*, Phone*, City, Company, "How can we help?"*, Yes/No radio (meaning unknown), "how did you hear" dropdown, **two required checkboxes** (one says you are not eligible for legal aid unless seeking help with medical negligence and links to SLAB; one is Terms/Privacy). **MFMac:** enquiry form in a popup; Your Name*, Telephone, Email*, urgency dropdown (Urgent / General enquiry), summary*, optional "send me a copy". **Irwin Mitchell:** the Scotland page has **no form**; the form is at `/contact-us` (First*, Last*, Email*, Phone*, Description; "Request a callback" is disabled until required fields are filled). Invisible reCAPTCHA reported on submit for the firms (not tested by us). Slater & Gordon gave a certificate error from one machine. Corrected 2026-11-07, see Discrepancy 1 in `docs/PROGRESS.md` |
| GMC register | https://www.gmc-uk.org/registration-and-licensing/our-registers | Search box exists and no CAPTCHA seen. **Search results never loaded** in testing. Several GMC URLs we guessed returned 404 |

## Records request (not a step; see D29) - probed 2026-11-07

Page: https://www.nhslothian.scot/yourrights/data-protection-privacy/requests-for-personal-information-including-medical-records-subject-access-requests/ (checked with `scripts/probes/observe.ts`, nothing submitted).
- **Verified:** the page offers (1) an online **Request for Records Portal** at https://lothian.ams-sar.com/ (a separate site run by a supplier, "ams-cloud"); its landing page shows only **Login** and **Sign up**, so a request needs an account (nothing beyond the landing page was seen); (2) a **Subject Access Request form** in Word and PDF; (3) email contacts `Loth.sarteam@nhs.scot` and a data-protection-officer address; (4) a separate **Access to Health Records Act (1990) form** for deceased patients.
- **Verified:** the PDF (`NHSL-SAR-form.pdf`, July 2026 upload) is **11 pages with 0 fillable fields**, so "code fills a PDF" would mean overlaying text at coordinates or writing our own letter, not filling form fields.
- **Unverified (from a search-result summary, not read on the page):** requests must be in writing, signed and dated; usually free of charge; someone applying for another person needs signed consent; NHS Lothian does not hold GP records, so GP records must be requested from the GP practice; the internal guidance lists a different email address from the public page. Check before relying on any of it.
- **Not tested:** whether the portal sign-up needs identity checks or email confirmation; whether a request written in our own words (not their form) is accepted.

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

Built D54: new crew runs ask permission then patient postcode before research; no hospital-derived proximity. Live SLAB approved Glasgow and declined-location paths verified on 2026-11-07. Full crew run not retested.

2026-11-07 review: crew failure recovery and input fixes verified with deterministic regression scripts and fictional data. Outstanding sending, cancellation, concurrent runs, stale drafts, evidence scope and retention issues are in BUG_REVIEW.md. No live submissions tested.

2026-11-07 review follow-up: enforced shortlisted/non-excluded planner fills with a three-attempt limit, draft retry, honest failed-progress states and approved-location summaries. Verified with deterministic guard tests and a mocked browser draft failure/retry. No live enquiries sent.
