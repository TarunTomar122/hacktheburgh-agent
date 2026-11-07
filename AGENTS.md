<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# hacktheburgh-agent: read this first

## What we are doing and why (the 10-line version)

1. **Event:** HackTheBurgh, Wordsmith.AI track. The brief, verbatim: "Make the most complicated end-to-end agentic AI browser-use workflow." The slide adds: legal is "ideally, not required. Creativity required."
2. **What is judged** (our reading, confirmed by Tarun): lots of steps, lots of sites, branching decisions, recovering from failures. Complexity must be in the **browser work**, not in the code or AI around it.
3. **Our project:** an agent that helps one fictional patient, **Ailsa** (Edinburgh), whose broken wrist bone was missed at A&E. It interviews her, drafts a complaint, fills the NHS Lothian form in a visible browser, and later checks the ombudsman and legal aid, finds solicitors, sends enquiries and builds one case file.
4. **Why a legal case:** it gives real multi-site dependencies (the legal aid result feeds a field on a law firm's form) and a bonus for the "legal" hint. It is not a legal product and none of its legal facts are verified.
5. **Honest weakness:** the NHS form (one page) and the ombudsman checker (5 questions) are easy for a browser agent. The hard part is unfamiliar sites: searching a directory, finding and filling many different law-firm forms. See `docs/PROJECT.md`.
6. **Never goes live:** the agent stops before submitting. A real submit sends a real complaint to a real organisation.
7. **Stack:** Next.js app + Node server driving a visible Playwright Chromium. OpenAI models. No logins, no extension, no desktop app.
8. **Browser engine (settled, D21):** OpenAI's Decisions API (`gpt-6-luna`). The model only chooses; our code types. Anyone implementing a step uses `runDecisionAgent` and adds a task to `scripts/bench.ts`. See `AGENT.md`. The older tool-calling loop is a fallback only.
9. **Everything we tried and rejected, and why:** `docs/NOT_DOING.md`. Do not re-propose these without new evidence.
10. **Everything we decided:** `docs/DECISIONS.md`. Do not override these silently.

## Rules for every agent and every person

**Source of truth, in order:** `docs/DECISIONS.md` > `docs/ACTIVE_WORK.md` > `docs/PROGRESS.md` > `docs/PROJECT.md` > `docs/NOT_DOING.md` > code comments > your own memory. If your memory or a chat message disagrees with the docs, the docs win until a new decision entry says otherwise.

### Start of every session
1. `git pull`. Then read `docs/COMPLEXITY_BACKLOG.md` (including its "Last updated" date), `docs/DECISIONS.md`, `docs/ACTIVE_WORK.md`, the top of `docs/PROGRESS.md` and the Discrepancies table.
2. **Claim your area** in `docs/ACTIVE_WORK.md`. If someone else holds it, talk to them first.
3. Tell the human what you understood the current state to be, in a few lines, before you change anything.

### Before every commit or push (the sync check - do not skip)
1. `git fetch`, then `git pull --rebase`. If there are conflicts, resolve them without discarding the other person's work.
2. **Re-read what changed while you worked:** `git diff <your-last-pulled-commit>..HEAD -- AGENTS.md AGENT.md docs/` and skim new commits touching `lib/`, `app/`.
3. **Compare your change against the docs.** Ask: does it contradict a settled decision? Duplicate or collide with something in `ACTIVE_WORK.md` or someone's new code? Rely on a claim `PROJECT.md` marks unverified? Change a file someone else has claimed?
4. **Flag every discrepancy.** A discrepancy is any difference between: docs and reality; two docs; your change and a decision; two people's in-flight work. Add a row to the Discrepancies table in `docs/PROGRESS.md` (status `open`), **and** state it plainly in your message to the human. Do not quietly fix someone else's work, and do not quietly override a decision. If you must deviate, add a superseding entry to `docs/DECISIONS.md` first.
5. **Update the docs in the same commit as the code:** `PROGRESS.md` (what you did, tried, learned, and why), `DECISIONS.md` (anything you chose), `PROJECT.md` (anything you built or verified), `ACTIVE_WORK.md` (release or hand off your area), and `COMPLEXITY_BACKLOG.md` if you tested a site, hit an obstacle or changed an item (see below).
6. Run `npx tsc --noEmit` and `npx eslint .`.
7. Push. If the push is rejected, go back to step 1. **Never force-push.**

### The complexity backlog (D23)
`docs/COMPLEXITY_BACKLOG.md` is the shared plan for making the workflow genuinely complex **in the browser**. Three rules:
1. **Read it at the start of every session**, with `git pull` first, alongside `docs/DECISIONS.md` and `docs/ACTIVE_WORK.md`.
2. **Whenever you test a site, hit an obstacle or change an item's status, update the backlog in the same commit.** Mark anything you have not verified as `untested`. Never upgrade a status you have not run.
3. **At least once a day, or when a work session ends, refresh the statuses and the "Last updated" date** at the top of the file.

### Writing things down
- **Log what you tried, including failures, and why.** A failed attempt that is not written down will be repeated by someone else.
- **Log why you did NOT do something** in `docs/NOT_DOING.md`.
- Mark every claim **verified** (say how and when) or **unverified**. Do not state legal facts, site behaviour or benchmark results you have not checked. Label an agent's suggestion as `proposed`, not `decided`.
- Dates are absolute (`2026-11-07`), never "yesterday".

### Hard rules (also enforced in code where possible)
- **Never submit a real form** in development or tests. The agent stops at `ready_to_submit`.
- **Fictional data only** in tests, scripts and screenshots. The repo is public.
- **No secrets in git.** The OpenAI key lives in `.env.local` (git-ignored). Copy `.env.example`. Never paste a key in chat or a doc.
- The agent must not tick consent boxes the user has not agreed to, and must not invent personal data. See `AGENT.md`.
- Playwright needs a normal Chrome user-agent (SLAB returns 403 otherwise). Use `openSession()` in `lib/browser.ts`.

## Map

| Where | What |
|---|---|
| `AGENT.md` | How the agent works: interview, draft, browser loop, safety rules, entry points |
| `docs/PROGRESS.md` | Living log of what was done, tried and learned; open discrepancies; open questions |
| `docs/DECISIONS.md` | Append-only decision log |
| `docs/COMPLEXITY_BACKLOG.md` | The six items that make the workflow genuinely complex in the browser, with honest status and owners |
| `docs/NOT_DOING.md` | Ideas considered and rejected, with reasons |
| `docs/PROJECT.md` | Status, verified site facts, gotchas, unverified claims |
| `docs/ACTIVE_WORK.md` | Who is working on what right now |
| `lib/agent/` | Agent code: facts, interview, draft, observe, **decisions + decisionAgent (default engine)**, browserAgent (fallback), nhsLothian |
| `lib/browser.ts`, `lib/directory.ts` | Playwright session, cookie handling, Law Society directory search |
| `app/` | UI (`/` onboarding, `/case` profile and steps, `/dev` directory search) and `app/api/agent/*` |
| `scripts/` | CLI runners; **`bench.ts` is the browser-agent regression suite (`npm run bench`)**. `scripts/probes/probe.mjs` inspects any URL; `scripts/probes/observe.ts` prints exactly what the agent sees. Neither submits anything |

Run: `npm install && npx playwright install chromium`, add `OPENAI_API_KEY` to `.env.local`, then `npm run dev`. Only one `next dev` can run per project directory. **Dev shortcut:** on the home page click "Skip: use demo patient" to jump to `/case` with a fictional patient (`lib/agent/sample.ts`) instead of doing the interview.
