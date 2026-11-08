<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Elliot

A crew of five browser agents (Elliot, Nell, Robin, Iona, Kit) that helps a patient after medical harm, in any country. It works out how complaints, compensation and legal aid work where the patient lives, runs the official checkers, checks law firms on their own sites, finds the clinical guidance, and fills each firm's own enquiry form, stopping before Send.

- [README.md](README.md): what it does, one journey end to end, the models, how to run it
- [docs/WORKFLOW.md](docs/WORKFLOW.md): the demo patient's case, step by step
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): the crew runtime, the browser workers, safety, privacy, live view, recordings
- [docs/DESIGN.md](docs/DESIGN.md): the design system

## Map

| Where | What |
|---|---|
| `lib/agent/crewRun.ts` | The crew runtime: planner turns, parallel lanes, background jobs, questions, skips |
| `lib/agent/discovery.ts` | Research: how the system works in this place |
| `lib/agent/compensationAnywhere.ts` | Prepare your case |
| `lib/agent/complaintAnywhere.ts`, `escalationAnywhere.ts`, `medicineReport.ts` | Complaint, independent review, medicine report |
| `lib/agent/workers/` | Site-agnostic browser workers: `quickRead`, `explore`, `questionnaire`, `searchDirectory`, `fillForm`, `formKind` |
| `lib/agent/decisionAgent.ts`, `pressGuard.ts` | Form filling with the Decisions API; what code may press |
| `lib/agent/llm.ts`, `ledger.ts`, `access.ts` | Model routing by data kind; the model ledger; the web access log |
| `lib/agent/runRegistry.ts` | Server-side runs that survive reloads |
| `lib/liveview.ts`, `app/LiveView.tsx`, `app/api/live` | Live view of every agent's browser tab |
| `lib/insights.ts`, `lib/journey.ts`, `app/insights` | The judges' page, built from the run logs |
| `app/case/` | The case screens: research, path choice, each step's crew, the case file |
| `app/compare` | The same story in four countries |
| `demo/` | Recorded runs (events and screenshots) for playback |
| `scripts/` | End-to-end runs, safety suites, headless UI checks |

## Commands

```bash
npm install && npx playwright install chromium
cp .env.example .env.local        # OPENAI_API_KEY, LINKUP_API_KEY
npm run dev                       # http://localhost:3000
npx tsc --noEmit && npx eslint .  # before every commit
HEADLESS=1 npx tsx --env-file=.env.local scripts/e2e-case.ts scotland-ailsa-wrist   # one case end to end
npx tsx --env-file=.env.local scripts/test-send-trap.ts                             # the never-send suite
npx tsx scripts/save-demo.ts <runId>                                                # keep a run as a recording
```

## Conventions

- **Never send.** Agents stop before every final Submit or Send. What may be pressed is decided in code (`pressGuard.ts`), not in prompts.
- **Discover, don't assume.** In the route-map workflow, places, sites and facts come from the patient's words, live search and the pages themselves.
- **Quotes, not claims.** A fact shown to the patient carries a quote that code found on its page, and the link.
- **Private data on the local model.** Writing and reasoning over health, money or identity goes through `modelFor()`, which picks the local model.
- **Fictional data only** in tests, scripts, recordings and screenshots.
- **No secrets in git.** Keys live in `.env.local`.
- **UI uses the design system:** tokens from `app/globals.css`, components from `app/ui.tsx`. Short plain copy, whole sentences, no truncated text, no small uppercase labels above headings.
- Playwright sessions come from `openSession()` in `lib/browser.ts` (a normal Chrome user agent, cookie handling, live view).
