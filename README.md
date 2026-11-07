# hacktheburgh-agent

A browser-use agent that runs a multi-site workflow in a **visible Chromium window** driven by a local Next.js server.

Current state: one button. It opens the Law Society of Scotland "Find a Solicitor" directory, searches for Edinburgh firms under "Accident and injury", and lists the results. Nothing is submitted anywhere.

See [AGENT.md](AGENT.md) for how the agent works. Working on this repo? Read [AGENTS.md](AGENTS.md) first, then `docs/PROJECT.md`, `docs/DECISIONS.md` and `docs/ACTIVE_WORK.md`.

## Run

```bash
npm install
npx playwright install chromium
npm run dev          # http://localhost:3000, click "Search for something"
```

Or without the UI:

```bash
npx tsx scripts/search.ts
```

Set `HEADLESS=1` for a hidden browser (faster, for tests).

## Layout

- `app/` – Next.js UI and the `/api/search` route handler
- `lib/browser.ts` – launches Chromium with a normal Chrome user-agent (some sites 403 Playwright's default) and dismisses cookie banners
- `lib/directory.ts` – the directory search
- `scripts/` – run the same logic from the command line

## Notes

- Playwright runs on the server, so this only works locally (`next dev` / `next start`), not on serverless hosts.
- Never submit real forms during development. Stop before any submit button.
