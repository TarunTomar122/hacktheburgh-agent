# Project state

Last updated: 2026-11-07. Update this file when you build or verify something.

## The idea in one paragraph

Ailsa (21, student, Edinburgh) fell on her hand. A&E said sprain; weeks later a GP found a scaphoid fracture that has not healed. The agent interviews her, drafts a complaint, fills the NHS Lothian complaint form in a visible browser (she approves before anything is sent), and later checks the ombudsman and legal aid, finds solicitors, and builds one case file. The browser work is the point of the track; the legal content is just the setting.

## Flow and status

| # | Step | Status |
|---|---|---|
| 0 | Intake interview -> structured facts, saved as a profile | **Built.** Real OpenAI agent. Tested end to end |
| 1 | Complain to NHS Lothian | **Fill is built and tested.** Stops before submit. **Submit is not built** (needs approval path, test-data decision, reCAPTCHA handling) |
| 2 | Medical records request | Not built. Plan: code fills a PDF. Whether Lothian has an online route is **unverified** |
| 3 | Ombudsman (SPSO) check | Not built. Site verified up to question 5 (see below) |
| 4 | Legal aid check (SLAB) | Not built. Site verified |
| 5 | Find solicitors, send enquiries | Directory search built (`/dev`). Firm enquiry forms exist but are not automated yet |
| 6 | Case file | Not built |

Not in scope for now: booking an expert (solicitor chooses and instructs experts), consultation booking, England, filing with the ombudsman for real.

## What exists in the repo

- `lib/agent/*`: see `AGENT.md`. Interview (structured output), draft (text from facts only), browser tool loop (`fill`, `select`, `check`, `click`, `ask_user`, `finish`), NHS Lothian runner.
- UI: onboarding chat, `/case` with a Profile tab (view and edit every fact, saved in the browser's localStorage) and a steps sidebar. Step 1 shows the draft complaint; the "fill the form" button is disabled.
- `/dev`: button that searches the Law Society directory in a headed browser.

## Verified site facts

All checked on 2026-11-07 with headless Playwright, a Chrome user-agent, **nothing submitted**.

| Site | URL | Finding |
|---|---|---|
| NHS Lothian online feedback form | https://www.nhslothian.scot/yourrights/online-feedback-form/ | One page. **Required:** details, location, who it is about (Me/Someone Else, "Me" preselected), first name, last name, address, postcode, telephone, email, how to communicate. Optional: outcome wanted, title, date of birth. **No file upload.** Choosing Email reveals a **required consent checkbox** (email-risk disclaimer). Contains a **honeypot field** (`nf-field-hp`) that must stay empty. Radios and checkboxes are `opacity:0` with custom-drawn boxes. reCAPTCHA scripts present; no visible CAPTCHA |
| SPSO complaint checker | https://www.spso.org.uk/form/complaint-checker | Multi-step radio questions: Scottish public service? -> final written response received? -> when (under or over 1 year) -> when did you first know (under or over 1 year) -> desired outcomes (Money, Disciplinary action, Decision overturned, None). Answering "No" to the final-response question stops with "SPSO can only consider a complaint once you have completed the organisation's process". Verdict screen after question 5 **not seen** |
| SLAB civil legal aid estimator | https://www.slab.org.uk/new-to-legal-aid/eligibility-estimators/estimator-civil-legal-aid/ | 5-step branching form; result calculates on the page as you type. Dummy student figures returned "likely to qualify for civil legal aid". **403 without a normal Chrome user-agent** |
| Law Society "Find a Solicitor" | https://www.lawscot.org.uk/find-a-solicitor/ | Search by postcode/city, area of law, legal aid checkbox. "Edinburgh" + "Accident and injury" returns 97 firms with name, address, legal-aid badge, partner count. Cookie banner blocks clicks until dismissed. The "Medical negligence" sub-category is a hidden multi-select; **setting it did not work yet**, so results are not filtered to clinical negligence. Result rows show **no website link**; "View details" not yet opened. The list appears to include defender-side firms (e.g. insurer-side) - **unverified** |
| Firm enquiry forms | [Anderson Strathern](https://www.andersonstrathern.co.uk/legal-expertise/medical-negligence/), [MFMac](https://mfmac.com/legal-expertise/individuals-and-families/personal-injury/medical-negligence-compensation), [Irwin Mitchell](https://www.irwinmitchell.com/personal-injury-claims/scotland) | Forms exist and load. Invisible reCAPTCHA fires on submit. Anderson Strathern has a required tick box saying you are not eligible for legal aid unless seeking help with medical negligence, linking to SLAB (a real cross-site dependency). MFMac has an Urgent/General option (effect on the form untested). Slater & Gordon gave a certificate error from one machine |
| GMC register | https://www.gmc-uk.org/registration-and-licensing/our-registers | Search box exists and no CAPTCHA seen. **Search results never loaded** in testing. Several GMC URLs we guessed returned 404 |

## Gotchas we hit

- SLAB blocks Playwright's default user-agent (403). Use `openSession()`.
- Cookie banners appear late and intercept clicks. `dismissCookies()` waits for them.
- Honeypot fields look visible to scripts. `observe.ts` skips them.
- Styled radios/checkboxes are invisible to naive visibility checks. `observe.ts` counts them if their label is visible.
- tsx/esbuild injects `__name` into code sent to the page. `openSession()` defines it via an init script.
- Next.js 16 here rejects `export const runtime` in route handlers when `cacheComponents` is on. Read `node_modules/next/dist/docs/` before relying on older Next knowledge.
- Only one `next dev` per project directory.

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
