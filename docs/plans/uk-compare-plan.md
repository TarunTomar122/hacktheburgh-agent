# Plan: "The cost of getting in" across the four UK nations (G-Research), 4 hours

**Status:** **dropped** 2026-11-08 (Lea): the policy-maker view and the four-nation comparison are not feasible in the time and matter less than the patient. Replaced by `patient-insights-plan.md`. Kept for the record.
**Builds on:** Tarun's `night` branch (any-place discovery), which is not merged into `main`. Work goes on a **new local branch from `night`**. Nothing goes to `main`.

## The idea in one paragraph
Health systems publish data on the complaints they receive. Nobody measures the people who never get that far: how many organisations, steps, offline-only routes, logins and deadlines stand between "something went wrong" and "my complaint is filed". That cost of getting in is the hidden data. Elliot already walks the whole route for a case, like a mystery shopper, with evidence for every fact. We run **the same fictional case in Scotland, Wales, England and Northern Ireland** and show, side by side, what the system demands in each. The patient sees what is ahead; put together, the runs show where each system makes access hardest.

**Pitch line:** *"Health systems publish data on the complaints they receive, but nobody measures the people who never get that far. Elliot walks the whole route for every case, so we can show, nation by nation, what getting answers or compensation actually costs."*

## Rules for this feature
- **Measure the system, not the agent.** Only facts about the route count: organisations, channels, deadlines, barriers, prerequisites. "Where the agent failed" is not a headline number. Agent misses appear only as "not established".
- **A fact only counts if it is backed:** route-map confidence `confirmed` or `likely` (checked quotes on official pages, D-night), **and** graded right against the nation's research file (`docs/research/jurisdictions/<nation>.md`). Everything else shows as "not established", never as zero.
- **Northern Ireland, not the Republic of Ireland** (the UK's four nations).
- **Precomputed for the demo:** four runs made before judging. The user's own case highlights its nation's column.
- **Fictional personas only** (`scripts/personas/<nation>.json`). Only public, official information goes in the data file.
- Never submit anything, as everywhere else.

## What already exists on `night` (no need to build)
| Need | Where |
|---|---|
| Run discovery for a nation, save the route map | `npx tsx --env-file=.env.local scripts/agent-discovery.ts <nation>` writes `.runs/<runId>/route.json` |
| Route map with organisation, channel, deadline, barrier, prerequisites, confidence | `lib/agent/routeTypes.ts` (`RouteStep`: `body`, `how`, `deadline`, `deadlineCheck`, `wall`, `requires`, `confidence`, `sources`) |
| Grade a route map against the research file | `scripts/grade-route.ts <route.json> docs/research/jurisdictions/<nation>.md` writes `grade.json` (per part: `body`, `facts`, `page` right/partly/wrong/missing) |
| Fictional personas | `scripts/personas/{scotland,wales,england,northern-ireland}.json` |
| Route map UI to reuse | `app/case/RouteMap.tsx` |

## The measures (system facts only)
Per nation, from its graded route map:

| Measure | From | Shown as |
|---|---|---|
| Organisations involved | distinct `step.body` | number, with names |
| Stages before an independent review | `requires` chain from complaint to escalation | "2 stages" |
| Steps that cannot be done online | `how` in `post`, `phone`, `court`, `login_required` | "2 of 6 steps" |
| Barriers met | `wall` (login, CAPTCHA, phone or post only) | list |
| Deadlines | `deadline` per step | timeline: shortest first |
| Deadlines official sites disagree on | `deadlineCheck = sources_differ` | warning badge |
| What must happen first | `requires` | checklist |
| Routes outside court | `alternatives`, `appliesIf` (e.g. a redress scheme) | yes/no, with the scheme's name |
| Not established | parts graded `missing` or `wrong`, or `unconfirmed` | "not established", greyed |

## Timeline (4 hours)

| Time | Work | Done when |
|---|---|---|
| **0:00-0:20** Setup | Ask Tarun if building on `night` is fine. `git switch -c uk-compare origin/night`, then `npm install`. Put the OpenAI key in **`.env.local`** (the scripts read only that file, not `.env`). Set `LOCAL_MODELS=0` unless Ollama runs. Next.js type generation, then `tsc`. | `night` builds and runs locally |
| **0:20-0:40** Start the data runs | In the background, run discovery **one nation at a time** (parallel searches trigger bot checks, per `night`): Scotland, Wales, England, Northern Ireland. Then `grade-route.ts` on each. Keep the run IDs. | 4 `route.json` + 4 `grade.json` (they keep running while 0:40-2:30 happens) |
| **0:40-1:30** Measure | `lib/compare/measure.ts`: `(route, grade) -> NationMeasures` using the table above, counting only backed facts. `scripts/compare-uk.ts`: read the 4 run folders and write `data/uk-compare.json` (public facts plus their sources). Small unit test with a hand-made route map. | JSON for whatever runs have finished |
| **1:30-2:30** Comparison view | `/compare`: four columns (one per nation), one row per measure, a deadline timeline, sources one click away, "not established" greyed, a short "how we measured" box. Design system only (`docs/DESIGN.md`). | Page renders from the JSON |
| **2:30-3:00** End of every case | In the case file (all paths), a compact panel: "What getting in costs where you are", with the user's nation highlighted and a link to `/compare`. It reads only the route map and the precomputed JSON, so it works on any path. | Panel shows for the Scotland persona |
| **3:00-3:30** Check | Sanity-check every number against the research files by hand (each nation, 10 minutes). Fix anything wrong. `tsc`, `eslint .`, look in the browser at desktop and phone width. | Numbers match the research files |
| **3:30-4:00** Story and docs | Pitch slide text (below). Docs: a decision entry (reopens G-Research, which `NOT_DOING.md` rejected), `PROGRESS.md`, `ACTIVE_WORK.md` claim, discrepancy rows. Commit locally; **push only when Lea says**. | Ready to demo |

## If time runs short (cut in this order)
1. Drop the end-of-case panel; keep `/compare` only.
2. Drop the deadline timeline; keep the table.
3. If a nation's discovery run fails or grades badly (below 5/10): show its column as "not established" with the reason. Never fill it from the research file, which would stop being agent-collected data.

## Risks
- **Discovery is slow or flaky.** `night` scored nations 5 to 7.3 out of 10, and each run takes minutes. Start the runs first and build while they go. Budget one rerun per nation.
- **Differences caused by our agent rather than the system.** Handled by counting only graded, confirmed facts; everything else is "not established".
- **The research files have unverified parts** (their own notes say so). The view says "checked against our research, 2026-11-07/08", not "official statistics".
- **Merge pain later:** `night` and `feature/yellow-card` both change `lib/agent/decisionAgent.ts`.

## Must settle before starting (10 minutes)
1. **Tarun:** fine to build on `night`? It is his unmerged branch and plan.
2. **Organisers:** can one project enter both the Wordsmith and G-Research tracks? (Open question in `PROGRESS.md`.)
3. **The team:** reopening G-Research, which `NOT_DOING.md` records as rejected ("Tarun: not interested"), needs a decision entry and Tarun's OK.

## Pitch slide (draft)
- **Hidden:** official data counts complaints received, not the people the process stopped. The cost of getting in is never measured.
- **How we find it:** Elliot walks the real route, site by site, with a checked source for every fact: a mystery shopper on every case.
- **What it shows:** the same missed fracture in Edinburgh, Cardiff, Manchester and Belfast. Different organisations, offline-only steps, barriers and deadlines.
- **What to do with it:** patients see what is ahead before they start; put together, the runs show where each system makes access hardest.
- **Honest:** only checked facts count; anything we could not establish is shown as such.
