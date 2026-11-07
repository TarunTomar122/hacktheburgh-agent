<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# hacktheburgh-agent: read this first

A browser-use agent for the Wordsmith.AI track at HackTheBurgh: "Make the most complicated end-to-end agentic AI browser-use workflow." It helps one patient (fictional "Ailsa", Edinburgh) take a missed-diagnosis case from "something went wrong" to "a solicitor has her case file". Legal angle is a bonus, not a requirement.

**Several people and their agents work in this repo at the same time.** To avoid overriding each other:

1. Read `docs/PROJECT.md` (what exists, what was verified), `docs/DECISIONS.md` (what is settled) and `docs/ACTIVE_WORK.md` (who is on what) before you change anything.
2. **Claim your area** in `docs/ACTIVE_WORK.md` before you start, and release it when you finish. If someone else holds it, talk to them first.
3. **Do not change a settled decision silently.** If you disagree, add a new entry to `docs/DECISIONS.md` that supersedes the old one, with your reason. Never edit or delete old entries.
4. **Log every decision you make** (a library, a model, a rule, a thing you ruled out) in `docs/DECISIONS.md`. Short is fine. Anything not written down will be re-decided by someone else.
5. Update `docs/PROJECT.md` when you build or verify something. Mark claims **verified** (with how and when) or **unverified**. Do not state legal or site facts you have not checked.
6. `git pull` before you start and commit small. Never force-push.

## Hard rules (also enforced in code where possible)

- **Never submit a real form** during development or tests. The agent stops at `ready_to_submit`. A real submit sends a real complaint to a real organisation.
- **Fictional data only** in tests, scripts and screenshots. The repo is public.
- **No secrets in git.** The OpenAI key lives in `.env.local` (git-ignored). Copy `.env.example`.
- The agent must not tick consent boxes the user has not agreed to, and must not invent personal data. See `AGENT.md`.
- Playwright needs a normal Chrome user-agent (SLAB returns 403 otherwise). Use `openSession()` in `lib/browser.ts`.

## Map

| Where | What |
|---|---|
| `AGENT.md` | How the agent works: interview, draft, browser loop, safety rules, entry points |
| `docs/PROJECT.md` | Status, verified site facts, gotchas, unverified claims |
| `docs/DECISIONS.md` | Append-only decision log |
| `docs/ACTIVE_WORK.md` | Who is working on what right now |
| `lib/agent/` | Agent code (facts, interview, draft, observe, browserAgent, nhsLothian) |
| `lib/browser.ts`, `lib/directory.ts` | Playwright session and the Law Society directory search |
| `app/` | UI (`/` onboarding, `/case` profile and steps, `/dev` directory search) and `app/api/agent/*` routes |
| `scripts/` | CLI runners; `scripts/probes/probe.mjs` inspects any URL (forms, CAPTCHA signals), submits nothing |

Run: `npm install && npx playwright install chromium`, add `OPENAI_API_KEY` to `.env.local`, then `npm run dev`. Only one `next dev` can run per project directory.
