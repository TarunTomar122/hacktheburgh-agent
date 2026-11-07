# Active work

Claim an area before you start, release it when you finish. One row per area. Keep the table current; stale claims block people. If a claim is more than a day old and the person is not answering, ask in chat before taking it.

**Before editing:** `git pull`, read `docs/DECISIONS.md`. **After:** update this table and `docs/PROJECT.md`.

| Area | Owner (human + agent) | Status | Files | Notes |
|---|---|---|---|---|
| Agent core: interview, draft, NHS form fill | Tarun + Claude | **Done, idle** (submit not built) | `lib/agent/*`, `app/api/agent/*` | Next: step 2 onward, or submit (needs D14 decision) |
| UI: onboarding, profile tab, case view | Tarun | Basic version done; Tarun will rework | `app/page.tsx`, `app/case/*` | Do not restyle without asking |
| Law Society directory search | Tarun + Claude | Basic search works; sub-category filter and "View details" not done | `lib/directory.ts`, `app/dev/page.tsx` | Needed for step 5 |
| Step 2: records request | unclaimed | Not started | | |
| Step 3: ombudsman check | unclaimed | Not started | | Site verified to question 5 |
| Step 4: legal aid check | unclaimed | Not started | | Site verified |
| Step 5: solicitor enquiries | unclaimed | Not started | | Three firm forms confirmed to exist |
| Step 6: case file | unclaimed | Not started | | |
| Email reading (connector) | unclaimed | Not started | | See D13 |
| Demo prep: backup video, seeded inbox | unclaimed | Not started | | |

## Handoff notes

Leave short notes here when you stop mid-task. Newest first. Remove them once resolved.

- _(none yet)_
