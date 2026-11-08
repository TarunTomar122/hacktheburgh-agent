# Plan: patient insights from Elliot's own runs

**Status:** `proposed` by Lea + Claude, 2026-11-08. Not built, not committed, not pushed. Replaces the policy-maker part of `uk-compare-plan.md` (dropped, see the log).
**Based on:** `main` at `d0899a3` (Yellow Card merged, D82 checklist onboarding, D83 submit detection).

**Safety net (do this first):** all work happens on a **separate branch, `patient-insights`, made from `main` before any code changes**. `main` stays exactly as it is, so in the worst case the project still works and demos without this extension. On top of that, the new screens sit behind one switch (`NEXT_PUBLIC_INSIGHTS=1`): even after a merge, turning it off hides them. Merge into `main` only if it is finished and checked.

## The idea
Getting answers or compensation means many organisations, websites, forms and deadlines. Elliot does that work, and it already records every page it read, every field it filled and every obstacle it handled. We show the patient that record, in plain numbers, at two moments:
1. **Before:** what is ahead on their path: who is involved, what Elliot does, what only they can do, and the deadlines.
2. **After:** what Elliot did for them, and what they did: "Elliot visited 4 websites, read 23 pages, filled 61 fields and handled 3 problems. You answered 2 questions and pressed Submit."

**Pitch line:** removed for now (Lea, 2026-11-08): the wording was off. The screens use plain titles ("Insights") instead.

**The data story (for G-Research, if entered):** the hidden data is the effort the system demands from one person. Nobody records it; Elliot's run log does, with evidence. We show it to the person it matters to.

## The centrepiece: "Hurdles Elliot cleared for you"
Elliot's run logs are curated into one clear record for the patient: **every point where the process needed something handled before the case could move on, and what Elliot did about it.** It is a curated dataset of their own case, built from evidence, not a guess about what might have happened.

**Example:** *"14 hurdles cleared on your case. Found 3 forms that were not linked from the main page. Fixed 2 answers a form would not accept. Handled 4 pages that were still loading. Asked you 2 questions instead of guessing. Checked your deadline on an official page."*

**Each kind of hurdle comes from a real event in the logs:**

| Hurdle (as the patient reads it) | Comes from (already logged, or one small addition) |
|---|---|
| Found a form that was hard to find | step 4 `recover` traces: popups, embedded frames, contact links |
| Fixed an answer a form would not accept | a site error followed by a successful retry (e.g. Yellow Card "Only digits are accepted") |
| Waited for a page that was still loading | engine status "Looking again" / "A field did not respond" (D80) |
| Ticked a box the page had hidden or drawn itself | the checkbox label fallback (Yellow Card privacy box) |
| Got past a cookie wall | `dismissCookies` result (add one status event) |
| Asked you instead of guessing | `needs_input` with named fields |
| Swapped to another firm when one had no online form | step 4 `no_form` swap (D46) |
| Handed you a CAPTCHA or login rather than getting round it | CAPTCHA detection in step 4 / handovers |
| Completed a long multi-page form | pages moved through with "Next" (e.g. 14 on the ombudsman form) |
| Checked a deadline on an official page | complaint crew `timeLimit` with its link |

Every hurdle links to its evidence (the step, the page, a screenshot where one exists), so the count can be checked.

**How we talk about it (non-negotiable):**
- **Elliot is the easier path, not a rescuer from villains.** The organisations involved are not "at fault". The process simply involves many separate bodies, websites and rules, and Elliot does that legwork.
- **Never say a case "would have been dropped" without Elliot.** We cannot know what a person would have managed on their own. Say what is true: *"Each of these needed handling before your case could move on."*
- **Neutral words:** "hurdle", "step that needed handling", never "failure", "broken", "bad design".

## How it answers the G-Research prompt
The prompt: *"Choose something that's hard to observe. You could build tools to collect your own data, or dig into public data. Show us what data is hidden, how we can find it, and what we can do with it."*

| Prompt | Our answer |
|---|---|
| **Something hard to observe** | For a patient: **how much work and how much time** getting answers or compensation really takes, and when things are due. Nobody tells you at the start; it is spread across many websites and official pages. |
| **Build tools to collect your own data** | Elliot *is* the tool. Each run records every website, page, field and problem, and reads the official time limits and response times on the way. |
| **What data is hidden** | The effort the process demands from one person, and the shape of their case over time: what is due when, how long each stage is allowed to take, how close the deadlines are. |
| **How we can find it** | By doing the work: the agent walks the real route and logs it, with a link for every official fact. |
| **What we can do with it** | The patient plans their time, never misses a deadline, and knows when a reply is late and it is time to chase or go to the next stage. |

## Plots over time (yes, they fit)
Time is natural here, because a case unfolds over weeks and months. Three plots, best first:

1. **"Your case over time" (the main one).** A timeline from the incident to today and beyond:
   - **Past:** what happened (their own timeline), when each step was done (complaint sent, report sent).
   - **Future:** each deadline (e.g. the complaint time limit) and each **allowed response time** the organisation states on its own pages ("we aim to reply within N working days"), drawn from the date the step was sent.
   - **A "today" line**, so they see how much time is left and whether a reply is overdue.
   - **Expected vs actual:** when a reply arrives (they press "They replied"), the plot shows it against the allowed time. Over a case, this is the patient's own data on how the system actually behaved.
   - Only periods quoted from an official page Elliot read are drawn; others say "not checked yet".
2. **"What Elliot did, as it happened."** For each run, a cumulative line: pages read and fields filled against seconds, with a marker at each problem it handled (cookie wall, page still loading, a field that needed your answer). It shows the effort on one screen.
3. **"Across your case."** Bars per step (complaint, ombudsman, compensation, Yellow Card): websites, pages, fields. Simple, the same for every path.

**Not doing:** trends across many users over time. We have no real users, and a few days of test runs would show a trend that is not real.

## Rules
- **Counts, not guesses.** Only things the run log recorded: websites, pages, fields, clicks, problems handled, questions asked, time taken. **No "you saved 3 hours"** unless measured: we have no data on how long a person takes.
- **Deadlines only from official pages the agent read,** with the link and how sure we are (D-night style: two sites agree / one site / differ). If not checked: "not checked yet", never a guessed date.
- **Every path:** complaint, ombudsman, compensation (steps 3-4), Yellow Card. Nothing Yellow-Card-only.
- Design system only (`docs/DESIGN.md`). Fictional personas for testing. Never submit anything.

## What already exists (no need to build)
| Need | Where |
|---|---|
| Every form agent's events (page observed, field filled/selected/ticked, click, blocked, status, done) | `lib/agent/events.ts` `makeLogger`, used by NHS (`nhsLothian.ts`), ombudsman (`spso.ts`), Yellow Card (`yellowCard.ts`) |
| The step 3 crew's trace (open, click, type, pick, read, found, recover, fail…) | `TraceStep` in `lib/agent/legalAidTypes.ts`, `CaseRunRecord` in `lib/profile.ts` (`recoveries`, `asks`, `turns`, `durationMs`) |
| Complaint time limit checked on an official page | `ComplaintResult.timeLimit` (`limit`, `status`, `explanation`, `url`) in `lib/agent/plannerTypes.ts` |
| Step 4 enquiries per firm (filled, sent, attempts) | `lib/agent/enquiryTypes.ts`, `profile.enquiries` |
| What the patient answered | `profile.messages`, `AgentAsk` answers |

## What to build
1. **`lib/agent/effort.ts`: one summary shape for every path, including the hurdles.**
   `Effort = { sites, pages, fields, clicks, hurdles: Hurdle[], questionsForYou, ms }`, where `Hurdle = { kind, text, step, at, evidence? }` uses the kinds in the hurdle table above.
   - `fromEvents(AgentEvent[])`: hosts and distinct URLs from `observe`, ok `action`s by tool, problems from retries / "Looking again" / cookie banners / blocked, `needs_input` as questions.
   - `fromTrace(TraceStep[])`: the same shape from the step 3 crew.
   - Unit test with a hand-made log.
2. **Attach it to every form run:** `makeLogger` keeps the run's events and adds `effort` to the `done` event. One change covers NHS, ombudsman and Yellow Card.
3. **Save it per step:** `profile.effort[step]`, set when a run finishes (`streamAgent` `DoneEvent`); step 3 from `caseRun`, step 4 summed from the firms' runs.
4. **"What Elliot did" card** at the end of each step (one shared component): Elliot's numbers next to "what you did" (questions answered, Submit pressed).
5. **Periods from official pages:** from what the agents already read (the complaint crew's `process` and `timeLimit`, the ombudsman's page), pull out stated periods ("within 20 working days", "within 12 months") **only with the exact quote and its link**; code checks the number is in the quote (as `night` does). Save as `profile.periods`.
6. **"Your case over time" plot (main plot):** past events, steps sent, deadlines and allowed response windows, a "today" line, expected vs actual replies. Also covers "what's ahead" (the future part of the line). Inline SVG with design-system colours, no new chart library.
7. **"What Elliot did, as it happened" plot:** per run, cumulative pages and fields against time, problem markers. From the same events as the effort summary (the `t` timestamps are already logged).
8. **"Hurdles Elliot cleared" + "Your case in numbers":** the curated hurdle list for the whole case (count by kind, each with its evidence), totals across the steps done, bars per step. Hurdles also appear as markers on the case timeline and the run plot.
9. **The switch:** everything above only shows when `NEXT_PUBLIC_INSIGHTS=1`.

## Timeline (4 hours)
| Time | Work | Done when |
|---|---|---|
| 0:00-0:15 | **Create branch `patient-insights` from `main` first**; `npm install`; key in `.env.local` (scripts) and `.env` (app); clear `.next`, generate route types; add the `NEXT_PUBLIC_INSIGHTS` switch | App runs; `main` untouched |
| 0:15-1:00 | `effort.ts` with hurdle classification + test; `makeLogger` adds `effort` (and the timestamps for the run plot) to `done`; one status event for cookie walls | Test passes; a Yellow Card run's `done` event carries effort and hurdles |
| 1:00-1:30 | Save per step; step 3 and 4 summaries | `profile.effort` filled for each path |
| 1:30-2:10 | "What Elliot did" card + run plot on every step | Shows on NHS, ombudsman, steps 3-4, Yellow Card |
| 2:10-2:30 | Periods from official pages, quote-checked | `profile.periods` filled for the complaint path |
| 2:30-3:20 | "Your case over time" plot + "Your case in numbers" | Shows with the demo personas |
| 3:20-4:00 | Check with Callum, Ailsa and Isla (fictional); switch off and on; `tsc`, `eslint .`; phone width; docs and log | Numbers match the run logs; the app is unchanged with the switch off |

**If time runs short (cut in this order):** the run plot → expected-vs-actual replies → "Your case in numbers" bars. **Keep the hurdle list, the "What Elliot did" card and the case timeline;** they carry the idea.

## Must settle first
- **Wording:** settled: no catchphrase for now (see the log).
- **Organisers / Tarun:** only if this is entered for G-Research too (open question in `PROGRESS.md`; `NOT_DOING.md` lists G-Research as rejected). For Wordsmith alone it is just a product feature and needs no track decision.
- **Om and Tarun:** the cards touch their screens (`app/case/*`).

---

## Log
Newest first. What we did, decided and why, as we go.

- **2026-11-08 (build, about 06:00-06:30), Lea's three changes:**
  1. **A lightbulb "Insights" button** in the sticky step bar (every path, every step), styled like the step tabs, with the hurdle count once there is one. It opens the insights in a **centred pop-up** (same style as the trace view; Escape, Close or the backdrop closes it), so nothing needs scrolling. The in-page panel under the steps is gone. The pop-up is rendered on `<body>` (a React portal): the bar's backdrop blur otherwise trapped it inside the bar (found while testing).
  2. **The catchphrase is removed** everywhere it showed (the title is now "Insights", with one neutral line). It is also removed from the plan title and D87; earlier log entries keep it as history.
  3. **Works for the three demos and for normal use.**
     - "answers from you" (interview messages, 0 for the demo patients) became **"questions Elliot asked you"** (counted from the runs).
     - The pop-up always has content: the case timeline shows from the start, and the empty state explains what will appear.
     - **Verified live**, fictional patients, nothing sent:
       - **Yellow Card (Isla):** 5 hurdles, 6 pages, 19 fields.
       - **Compensation (Ailsa)**, via "Play a recorded run, fast": 3 hurdles, 10 websites, 15 pages, 13 fields. Steps 3 and 4 are marked "recorded demo run". Real recoveries are listed, e.g. waiting out a site's browser check.
       - **Complaint (Callum):** a real NHS Lothian fill, stopped before Submit: 1 hurdle (cookie banner), 11 fields in 14 s.
     - **Normal use** runs the same code. The case is kept in the browser and saved to the account; the save route keeps the new fields (`passthrough`). **Not run end to end with a real interview.**
  - `tsc`, `eslint .` and `scripts/test-effort.ts` pass.

- **2026-11-08 (build, about 05:00-06:00):** Built on branch `patient-insights` (made from `main` at `7e1c64a` before any code change; nothing committed or pushed).
  - **Counting:** `lib/agent/effort.ts` counts websites, pages, fields, clicks, questions, time and hurdles from logged events (`fromEvents`) or a crew trace (`fromTrace`); `scripts/test-effort.ts` checks it with a hand-made log.
  - **Attached to every form run:** `makeLogger` (`lib/agent/events.ts`) adds `effort` to the `done` event for NHS (step 1), ombudsman (2) and Yellow Card (6). Two small log lines feed the hurdles: a cleared cookie banner (all three runners) and a hidden box ticked through its label (engine). Nothing else in the engine changed.
  - **Saved per step:** `profile.effort[step]`, added across re-runs; websites counted once. `setProgress` now records when each milestone happened (`progress.at`), for the timeline. Steps 3 and 4 use what they already save (the crew trace, the firms' outcomes).
  - **Screens** (`app/case/insights.tsx`), hidden unless `NEXT_PUBLIC_INSIGHTS=1`:
    - "What Elliot did here" in each step's side panel
    - under every step, "The process is long. Elliot isn't.": headline numbers, "Hurdles Elliot cleared for you" (count by kind, each with its examples and page links), a step-by-step table, the "as it happened" curve (fields over time, a ring per hurdle) and "Your case over time" (the patient's dates, Elliot's milestones, today, and the complaint time limit only when the crew read it on an official page)
  - **Verified live** (Isla, fictional; dev server in WSL; Yellow Card site; nothing sent): the agent reached step 4 of 4 and stopped before Submit. The run logged 1 website, 6 pages, 19 fields and 61 s, and 5 real hurdles: cookie banner, product matched among 19 suggestions, hidden privacy box ticked, a page wait, a 6-page form. The case page showed them all; phone width has no sideways scroll. `tsc`, `eslint .` and the test pass.
  - **Not done:** expected-vs-actual reply times (no official response times are captured on this branch yet); the run plot for steps 3-4 (they show in the table and hurdle list only); live runs of NHS, ombudsman and steps 3-4 with the counts; checking the app with the switch off (the code renders nothing without it, not run).

- **2026-11-08 (planning):** Lea brought the focus back to the data insight: a **curated count of the hurdles Elliot cleared** on a case, drawn only from what the run logs recorded, each with its evidence. It is the centrepiece of the feature. **Framing agreed:** public bodies are never cast as at fault. Health and legal processes involve many separate organisations, websites and rules, and Elliot offers a simpler, more efficient way through them. We do not claim a case "would have been dropped" without Elliot, because we cannot know that; we say each hurdle needed handling before the case could move on.

- **2026-11-08 (planning):** Read the G-Research prompt closely ("hard to observe; build tools to collect your own data; show what is hidden, how to find it, what to do with it") and mapped the idea to it (table above). Added **plots over time**:
  - the patient's case timeline, with deadlines, allowed response times and expected vs actual replies
  - each run's progress curve
  - per-step bars

  Ruled out trends across users: no real users, and test runs would show fake trends.
- **2026-11-08 (planning):** Lea: build it on a **separate branch first**, so the project still works without the extension. Added that as step one, plus a `NEXT_PUBLIC_INSIGHTS` switch so it can be hidden even after a merge.
- **2026-11-08 (planning):** Pitch line settled on *"The process is long. Elliot isn't."*: it claims only what the data shows.

- **2026-11-08 (planning):** Dropped the policy-maker / government view and the four-nation comparison (`uk-compare-plan.md`). **Why (Lea):** not feasible in the time and not as important as the patient. Focus: show the patient the insights Elliot already gathers. Recorded in `NOT_DOING.md`.
- **2026-11-08 (planning):** Pulled `main` at `d0899a3`. Our Yellow Card branch was merged (PR #1). Om followed up with `767592c` (the agent fills the live form end to end), D82 (onboarding back to the outcome checklist, one medicine option, always the suggestion page; supersedes our D80 routes, keeps the engine changes) and D83 (Submit in the agent's browser marks the step as sent). This plan is based on that state.
- **2026-11-08 (planning):** Checked what Elliot already records. `makeLogger` is the single place every form agent logs through, so effort can be added once for NHS, ombudsman and Yellow Card. Step 3 has traces and `CaseRunRecord`; the complaint crew has a checked `timeLimit`.
