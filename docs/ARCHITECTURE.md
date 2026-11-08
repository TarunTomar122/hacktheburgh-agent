# How Elliot works

Elliot is a Next.js app with a Node server that drives Playwright Chromium. Each step of a case is one **crew run**. A planning model (Elliot) calls tools, and each tool belongs to a crew member who works in their own browser tab. The patient watches every tab live in the app and answers questions when the crew needs them.

## The crew runtime (`lib/agent/crewRun.ts`)

Each step brings its own tools, prompt and result shape:
- research (`discovery.ts`)
- the complaint (`complaintAnywhere.ts`)
- the independent review (`escalationAnywhere.ts`)
- preparing the case (`compensationAnywhere.ts`)
- the medicine report (`medicineReport.ts`)

`runCrew` runs them all the same way:

- **Planner turns.** Elliot (`gpt-5.4`) sees the plan, the reports so far and the tool results, then calls tools. He can update the plan at any time, and the screen shows each change as "changed the plan".
- **Parallel lanes.** Calls in one turn that belong to different crew members run at the same time. One member's calls run in order. `lane()` maps each call to a lane (for example `robin:<firm>` and `kit:<firm>`), so Robin checks four firms while Kit fills three forms.
- **Background jobs.** Long jobs, like Nell's funding checker, the register search and Iona's evidence, start in the background. The planner gets "Started" straight away and the result arrives as a message on a later turn. `afterBackground` makes a step wait for the jobs it depends on. For example, the shortlist waits for Nell, because the funding result changes which firms fit.
- **Questions to the patient.** Any worker can ask. The question appears in the app in the site's own words, and the worker's browser comes to the front so the patient can see the page.
- **Skips and recordings.** The demo bar can skip a crew member, finish now, or switch to a recorded run (see below).

Runs live on the server (`runRegistry.ts`), not in the request that started them. They keep going across reloads, navigation and dropped connections, and a client can attach at any time to get everything so far and then the live tail.

## Site-agnostic browser workers (`lib/agent/workers/`)

The workers know nothing about any site or country. The place comes from the patient's words, and the sites come from live search and exploration.

| Worker | What it does |
|---|---|
| `quickRead` | Reads a page or PDF with a plain request. It hands over to the browser when a page needs one: a bot check, a login, a page that scripts build, an error or a page too thin to read |
| `explore` | `readPage` answers a question from a page with quotes that code checks against the page text. `exploreSite` finds the page or form that meets a goal by best-first exploration of links, menus, accordions, "Start now" buttons, embedded forms and the site's own search |
| `questionnaire` | Runs an online eligibility checker page by page. It answers from known facts when they clearly fit, asks the patient the rest in the page's own words, and reads the result word for word |
| `searchDirectory` | Uses a register's own search UI: the right form or tab, advanced filters, autocomplete boxes, dropdowns, pagination, "view details". It extracts structured entries and changes approach when a filter is ignored |
| `fillForm` | Fills any form across as many pages as it has. It tells landing pages, form pages and review pages apart, re-reads conditional questions, fixes validation errors and stops before the final Submit or Send |
| `formKind` | Tells a real enquiry form from a newsletter sign-up, in the browser and in raw HTML |

Each worker reports what it did as a trace (each action, the page, the model's confidence, a screenshot at key moments). The case file shows that trace, so every result can be followed back to the page it came from.

## Fetch first, browser when it matters

Most official pages need no browser. `quickRead` reads them in a fraction of a second, and search goes through the Linkup search API (with a per-run cache) instead of opening a search engine. The browser opens for the jobs that need one: script-built pages, bot checks, eligibility checkers, register searches and forms.

Every page, search and browser job is logged with how it was reached and why (`lib/agent/access.ts`). The live view shows the tally, and `/insights` shows it per run.

## Forms: the model chooses, code types

Form filling uses OpenAI's Decisions API (`gpt-6-luna`) through `decisionAgent.ts`. The model picks which saved value goes in which field and which control to use. Code does the typing, checks every value by reading the form back, and decides what may be pressed:

- `pressGuard.ts`: on a page that holds the patient's answers, a control is pressed only when code can verify it moves forward without sending. A real same-origin link is followed by its address, so no click handler can run.
- `withoutSends`: a press that is allowed still runs with outgoing form submissions blocked.
- Consent boxes stay unticked until the patient agrees in the app. Only the boxes they tick are ticked on the real form.
- The final Submit or Send is never pressed by the crew. The patient presses it.

On the enquiry forms and in the generic form worker, the model sees value names and descriptions, never the values themselves. Typed text is masked, and anything the page echoes back is replaced by its name before the model sees the page.

## Private by routing (`lib/agent/llm.ts`)

`modelFor(task, data)` chooses the model from the kind of data a call carries. The steps that write or reason over the patient's health story, money or identity run on a local model (`qwen3:8b` through Ollama). These include the complaint and enquiry drafts, the comparison of her care with the guideline, her age band for guideline checks, and reading the medicine from her story. Public pages, search results and planning go to the cloud models. The model ledger (`ledger.ts`) records for every call which agent made it, which model, local or cloud, tokens in and out, time, and which kinds of data went in.

## Evidence that can be checked

- Every fact on the route map is a quote that code finds in the page it came from, with the link.
- Clinical guidance comes from a credible source, is checked to apply to someone like the patient, and is quoted word for word.
- Iona's investigation (`investigate.ts`) only keeps official, public material from sites the route map found official, each with a quote and a link opened in the same run.

## Live view (`lib/liveview.ts`, `app/LiveView.tsx`)

Every browser context is attached to a CDP screencast (`Page.startScreencast`). JPEG frames from each tab go to a process-wide bus and stream to the app as server-sent events (`/api/live`). The app shows one tile per agent tab, with each agent's name and colour on its cursor. A tile opens big on click, and the patient can take control. Finished tabs stay as tiles showing their last picture and what was done there.

## Recordings and replay

Every run writes its full event stream and screenshots to `.runs/<run>/`. `scripts/save-demo.ts` keeps a run as a recording in `demo/`, tagged with its place. A recording replays through the real screens: the plan, the reports, the browser tabs and their screenshots, and the final case file. During a live step, **Use the recorded run** stops the live run and plays the recording for that place in about 20 seconds.

## The judges' page (`/insights`)

`lib/insights.ts` reads every run folder, and `lib/journey.ts` puts the latest Research run and the case run after it on one clock. The page shows:
- each agent's working spans and what they found
- the counts of pages, browser jobs, hand-offs, forms and questions
- the four models with their calls
- the cost from the ledger and list prices (`lib/pricing.ts`)
- the filled forms

Every figure comes from the logs.

## Accounts

Sign-in uses Auth0 (`lib/auth0.ts`, `proxy.ts`). With a signed-in user, the case is saved to Postgres on Tiger Data (`lib/db.ts`, `/api/profile`), so it follows them across devices.

## Tests

- `scripts/test-send-trap.ts`: forms whose Send hides behind a JavaScript button, a "Submit" link or a "Continue" link wired to a sender. Nothing is ever sent.
- `scripts/test-fill-form.ts`: fixture forms covering multi-page forms, conditional questions, consent boxes and payment walls.
- `scripts/test-worker-safety.ts`, `test-enquiry-ready.ts`, `test-questionnaire.ts`, `test-handoff.ts` and more: each worker's rules.
- `scripts/check-*.ts`: headless UI checks (autostart, persistent tiles, the question window, recordings, the case bundle, auth).
- `scripts/e2e-case.ts`: one case end to end on the live web, timed, with a summary of how each page was reached.
- `scripts/bench-discovery.ts` and `grade-route.ts`: research runs in many places, each route graded against hand-checked references for 12 places (`docs/research/jurisdictions/`). The crew never reads those references.
