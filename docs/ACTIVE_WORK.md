# Active work

Claim an area before you start, release it when you finish. One row per area. Keep the table current; stale claims block people. If a claim is more than a day old and the person is not answering, ask in chat before taking it.

**Before editing:** `git pull`, read `docs/DECISIONS.md`. **After:** update this table and `docs/PROJECT.md`.

| Area | Owner (human + agent) | Status | Files | Notes |
|---|---|---|---|---|
| Agent core: interview, draft, NHS form fill (step 1) | Tarun + Claude | **Done, idle** (submit not built) | `lib/agent/*`, `app/api/agent/*` | Step 1 runs on the Decisions engine. Next: steps 2+, or submit (needs D14) |
| UI: onboarding, profile tab, case view | Tarun | Basic version done; Tarun will rework | `app/page.tsx`, `app/case/*` | Do not restyle without asking |
| Law Society directory search | Tarun + Claude | Basic search works; sub-category filter and "View details" not done | `lib/directory.ts`, `app/dev/page.tsx` | Needed for step 5 |
| Decisions API (Luna) engine + benchmark | Tarun + Claude | **Done, idle** | `lib/agent/decisions.ts`, `lib/agent/decisionAgent.ts`, `scripts/bench.ts` | Adopted (D21). Implementers of any step: use this engine; do not write a new loop. Run `npm run bench` before changing `observe.ts` or the engine |
| Step 2: records request | unclaimed | Not started | | |
| Step 3: ombudsman check | unclaimed | Not started | | Site verified to question 5 |
| Step 4: legal aid check | unclaimed | Not started | | Site verified |
| Step 5: solicitor enquiries | unclaimed | Not started | | Three firm forms confirmed to exist |
| Step 6: case file | unclaimed | Not started | | |
| Complexity backlog upkeep | unclaimed (everyone updates; someone refreshes statuses and the date daily or at session end) | Ongoing | `docs/COMPLEXITY_BACKLOG.md` | See D23 and the three rules in `AGENTS.md`. Items 1-6 are each unclaimed; claim one by naming yourself in its Owner field and adding a row here |
| Email reading (connector) | unclaimed | Not started | | See D13 |
| Demo prep: backup video, seeded inbox | unclaimed | Not started | | |

## Handoff notes

Leave short notes here when you stop mid-task. Newest first. Remove them once resolved.

- _(none yet)_
