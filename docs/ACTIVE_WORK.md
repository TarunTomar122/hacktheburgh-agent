# Active work

Claim an area before you start, release it when you finish. One row per area. Keep the table current; stale claims block people. If a claim is more than a day old and the person is not answering, ask in chat before taking it.

**Before editing:** `git pull`, read `docs/DECISIONS.md`. **After:** update this table and `docs/PROJECT.md`.

| Area | Owner (human + agent) | Status | Files | Notes |
|---|---|---|---|---|
| NHS app integration | Luigi + Codex | Done, idle | `app/case/page.tsx`, `app/api/agent/step1/route.ts`, `lib/agent/nhsLothian.ts` | App button verified with fictional patient. Browser remains open up to 10 minutes for review. |
| Agent core: interview, draft, NHS form fill (step 1) | Tarun + Claude | **Done, idle** (submit not built) | `lib/agent/*`, `app/api/agent/*` | Step 1 runs on the Decisions engine. Next: steps 2+, or submit (needs D14) |
| UI: onboarding, profile tab, case view | Tarun + Claude | **Case shell redesigned 2026-11-07 (D31).** Onboarding and `/dev` restyled by Om (D26); the case shell, profile page and timeline follow D31 | `app/ui.tsx`, `app/globals.css`, `app/page.tsx`, `app/case/*`, `docs/DESIGN.md` | Follow `docs/DESIGN.md`. Tarun directs the look; ask before changing it |
| Interview wording: plain GP-then-solicitor manner | Om + Claude | **Done in the working tree, not committed.** Not yet tried against the model | `lib/agent/interview.ts` (prompt text only), `lib/agent/chat.ts` (opening line) | D27. Touches the "Agent core" area, which is marked done and idle. Superseded in part by D28 |
| UI theme: Wordsmith colours and fonts | Om + Claude | **Pushed (27eb911).** Merged with D31 on 2026-11-07: one token set, Om's self-hosted fonts and widget classes kept. Tarun to confirm (Discrepancy 6) | `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `app/case/*`, `app/dev/page.tsx`, `public/fonts/*` | Styling only: class names and the font setup, no logic. D26. Re-skin of the UI Tarun owns, including his demo-patient button: take it, change it or tell us to drop it |
| Interview inputs: date, dropdown, buttons, checklist | Om + Claude | **In progress, pushed on a branch.** Core, widgets and onboarding done; profile tab done | `lib/agent/inputs.ts`, `lib/agent/interview.ts`, `lib/agent/facts.ts` (one description), `app/api/agent/interview/route.ts`, `app/InputPanel.tsx`, `app/DateField.tsx`, `app/page.tsx`, `app/case/ProfileTab.tsx` | D28. Touches the "Agent core" and "UI" rows: please tell Om before editing these files |
| Landing page and name screen | Om + Claude | **Done, idle (D40).** | `app/NameStep.tsx`, `app/page.tsx` (layout and header only), `app/globals.css` (`.fade-up`) | Name step as a full screen |
| Onboarding as one-question screens | Om + Claude | **Done, idle (D41).** | `app/page.tsx`, `app/StageInputs.tsx`, `app/StageControls.tsx`, `app/DateField.tsx` (`big`), `app/globals.css` | `InputPanel` and interview logic untouched |
| Logo and favicon | Om + Claude | **Done, idle (D37).** | `public/logo.png`, `app/icon.png`, `app/apple-icon.png`, `app/favicon.ico`, `Logo` in `app/ui.tsx`, `app/page.tsx` (one line) | Replaces the placeholder wordmark in Tarun's shell header. Tarun to confirm |
| Law Society directory search | Tarun + Claude | Basic search works; sub-category filter and "View details" not done | `lib/directory.ts`, `app/dev/page.tsx` | Needed for step 4 |
| Decisions API (Luna) engine + benchmark | Tarun + Claude | **Done, idle** | `lib/agent/decisions.ts`, `lib/agent/decisionAgent.ts`, `scripts/bench.ts` | Adopted (D21). Implementers of any step: use this engine; do not write a new loop. Run `npm run bench` before changing `observe.ts` or the engine |
| Step 2: ombudsman complaint | Tarun + Claude | **Built (D30): fills the SPSO form, stops at review.** Idle | `lib/agent/spso*.ts`, `app/api/agent/step2`, `app/case/OmbudsmanStep.tsx` | Not built: document upload, real unlock (needs email reading, D13). Dev-only demo button opens it |
| Step 3: legal aid check + firm shortlist (D36) | **Backend:** Tarun + Claude (parent thread). **UI:** frontend agent (child thread) | **In progress 2026-11-07** | Backend: `lib/liveview.ts`, `lib/browser.ts`, `lib/agent/legalAid*.ts` (except the UI-only parts), `lib/agent/decisionAgent.ts` (cursor only), `app/api/live`, `app/api/agent/step3`, `scripts/bench.ts`. UI: `app/LiveView.tsx` (and any new grid component), `app/case/*` incl. `PathMap.tsx`, `lib/profile.ts`, `app/case/progress.ts`, `app/case/steps.ts` | Contract: `lib/agent/legalAidTypes.ts` (change only by agreement). Sample data: `lib/agent/legalAidFixture.ts` |
| Step 4: solicitor enquiries | unclaimed | Not started | | Three firm forms confirmed to exist. Asks the optional medical-records question (D29) |
| Step 5: case file | unclaimed | Not started | | |
| Complexity backlog upkeep | unclaimed (everyone updates; someone refreshes statuses and the date daily or at session end) | Ongoing | `docs/COMPLEXITY_BACKLOG.md` | See D23 and the three rules in `AGENTS.md`. Items 1-6 are each unclaimed; claim one by naming yourself in its Owner field and adding a row here |
| In-app live browser view (D32, D34) | Tarun + Claude | **Done, idle.** No separate window in the app, light draggable panel, CDP input (fast) | `lib/liveview.ts`, `app/api/live/route.ts`, `app/LiveView.tsx`, `lib/browser.ts` (`openSession` hook, `IN_APP_BROWSER`), `app/layout.tsx` (mount only) | Built in a separate worktree so the uncommitted step-2/case work in the main checkout was not touched |
| Email reading (connector) | unclaimed | Not started | | See D13 |
| Demo prep: backup video, seeded inbox | unclaimed | Not started | | |

## Handoff notes

Leave short notes here when you stop mid-task. Newest first. Remove them once resolved.

- _(none yet)_
