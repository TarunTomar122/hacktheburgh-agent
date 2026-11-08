# Considered and not doing

Read this before proposing something. Each row says what it was, why we dropped it, and what evidence would make us reconsider. To reopen one, add a superseding entry to `docs/DECISIONS.md`.

| Idea | Why not | Reconsider if |
|---|---|---|
| **Tax-filing agent** (Tarun's first idea) | Mostly one government portal, so it fails "lots of sites". Government Gateway has 2FA. You cannot submit a real return live on stage. Liability question if wrong. | We find a multi-site tax flow that needs no login and has a safe demo |
| **Medical portal agent behind NHS login** | 2FA and identity checks make the login unautomatable or fake. Undercuts "end to end". | A test environment with no real identity checks |
| **"Everything runs locally" as the headline** | Not true. The agent sends the user's details to the NHS and law firms on purpose, and to the model provider. A judge will spot it in 10 seconds. (D10) | We run a fully local model **and** state exactly who still sees what |
| **Local copy of Jev (TypeSafe)** | Jev is a decision model, text-only, waitlist at typesafe.ai or via Vercel/Cloudflare (cloud). We found no local version. Speed numbers on X are from TypeSafe and users, with no independent benchmark. | TypeSafe ships weights or a local runtime |
| **Small local model for the whole workflow** | Small models are weakest at long multi-step tasks, which is what the brief rewards. Costs complexity points to buy a privacy claim that is narrow. | A local model passes our benchmark as well as a cloud one |
| **G-Research track** ("make the invisible visible", collect data and find insights) | Tarun: not interested in data/prediction. It is also not browser use. | n/a |
| **A policy-maker view: comparing the four UK nations' complaint and compensation routes from agent runs** (2026-11-08, Lea + Claude) | Not feasible in the time (needs Tarun's unmerged `night` branch, four slow discovery runs and grading), and less important than the patient. Plan kept in `docs/plans/uk-compare-plan.md`. The patient-facing version is planned instead: `docs/plans/patient-insights-plan.md`. | `night` is merged and the route maps are reliable (graded 8/10 or better) |
| **HRT track** (data prediction) | Same: not interested. | n/a |
| **JetBrains, Bank of Scotland, InstaLily, Viridien tracks** | Listed to Tarun and not chosen. JetBrains is crowded with coding helpers; InstaLily is crowded with coding agents; Viridien is niche computer vision; Bank of Scotland has the lowest prizes. | Tarun changes his mind |
| **Generic multi-site web chores** (university applications, general form filling) | Tarun: these are already doable with Claude Code, so they do not look distinctive. Distinctiveness must come from reliability, safety gates and failure recovery. | We can show a clear reliability advantage |
| **Court-case automation or acting as a lawyer** | The agent prepares a case file for a solicitor. It does not run a case or give legal advice. | n/a |
| **Booking an independent medical expert** (D12) | The solicitor instructs and pays experts. Booking is irreversible and not needed. We can only list candidates for the solicitor. | n/a |
| **Consultation booking with firms** | Picking a slot can reserve a real slot. Adds little. | We have a safe test calendar |
| **England and the English ombudsman** | A second rule set for no extra demo value. | n/a |
| **Filing with the ombudsman for real** | Ailsa is not eligible yet; the agent deciding **not** to file is the stronger demonstration of reasoning. | n/a |
| **Browser extension / desktop app** (D3) | Extension is harder to debug and control across tabs; desktop adds packaging time. A local web app driving a visible Playwright browser is enough and demos well. | We need the user's real logged-in sessions |
| **User's real Chrome profile, Google sign-in** (D4) | None of our sites need a login; a real profile exposes tabs and logins to a model; Google may block sign-in in automated browsers. | A target site requires a login |
| **Headless as the demo default** | Audience cannot watch; no human handoff for a CAPTCHA. Kept as `HEADLESS=1` for tests. | n/a |
| **Exa (search API) to find law firms** (D11) | It would replace the browser work the track scores. Allowed only for non-browser lookups, e.g. a guidance document. | The directory proves unusable |
| **Hand-built OAuth for email** (D13) | A managed connector (Composio, Arcade, Nango, Pipedream style) avoids OAuth setup. Email is lower priority than the browser flows. | No connector works within 30 minutes |
| **Konfuzio for reading email** (2026-11-07, Lea + Claude) | A document-AI API that extracts fields from emails and attachments. It would do the reading for us, which removes the browser work, and it sends case data to a third party. It is not an inbox. | We need document extraction where no browser step is involved |
| **Mailpit (local mail catcher) for real users** (2026-11-07) | Fine as a demo inbox (`docs/plans/browser-complexity-plan.md`, X1), but a customer would never run it. Real email stays with D13's connector. | n/a |
| **Search-only "extra sites"** (FCA register, Wayback Machine, court judgments, Care Opinion) (2026-11-07) | They read pages but do not act; that adds little browser complexity. The register is kept only as the first link of a chain that ends in filling a form. | One of them feeds a field on another site |
| **Auto-submitting forms** (D14) | A real submit sends a real complaint. Needs an approval path and a test-data rule first. | Team agrees a safe target |
| **Storing the profile on a server** (D9) | Simplest to keep it in localStorage for now. | Scripts or other devices need it |
| **Claiming deadlines, SPSO rules, NHS timeframes as fact** | Unverified. See the unverified list in `docs/PROJECT.md`. | Someone checks the official sources and logs them |
| **Making the tool-calling loop the main engine** (D21) | Kept as fallback only. The Decisions engine is faster and safer by construction (the model never writes text). | A head-to-head shows the tool loop is clearly more reliable |
| **Letting the decision model write form text** | It cannot: the API returns choices only. Text comes from the saved values and the reviewed draft. | n/a |
| **Pitching "no one else could build this"** | A general coding agent with a browser could run this once. The defensible claims are reliability, speed, safety gates and recovery. | n/a |
| **Automating NHS Lothian's records portal** (D29) | It needs a real account on a supplier's site; not testable with fake data. Records are an optional profile field instead. | Tarun wants it and we have a safe way to test |
| **Uploading documents to the SPSO form** (D30) | Needs a real file from the user; the demo has none. The step offers "post" or "don't have it". | We have a sample file and a decision on file handling |
| **Showing the form's questions or a review screen in our app** (D33) | It copies the real form onto our site and makes the user type twice. The user reviews and edits on the real form instead. | A form has no review page and the user cannot fix things there |
| **Dark mode** (D31) | Wordsmith's look is light; two themes double the design work. `dark:` never applies. | Someone designs it |
| **Pressing "Send complaint" or "Save for later" on any real form** | Hard rule: never submit real forms; "Save for later" may create a saved record. Only "Next" is allowed on the SPSO form. | n/a |

## What we dropped from the original 10-step plan, and why

The first plan had 10 steps. Tarun cut it to six. Removed or merged: deriving "possible gap in care" from clinical guidance (no verified source), expert search and GMC check (GMC results never loaded; experts are the solicitor's job), separate legal-aid and ombudsman steps are kept but as checks that feed other steps.
