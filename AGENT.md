# The agent

Three jobs, each with a different kind of model call, wired through one shared set of facts.

```
interview (chat)  ->  CaseFacts  ->  draft (text)  ->  user edits  ->  browser agent (tool loop)  ->  ready_to_submit
```

## What the agent needs

**Facts** (`lib/agent/facts.ts`). The NHS Lothian form needs: who it's about, first and last name, address, postcode, phone, email, how to be contacted, where it happened, what happened. We also keep a dated timeline (`events`) for the later deadline step, plus `desiredOutcome`. If the user picks Email, the form shows a consent checkbox, so we also need `emailRiskAccepted`. Missing facts are computed in code (`missingRequired`), never trusted from the model.

**A browser it can see and act in** (`lib/agent/observe.ts`). The page becomes a numbered list of elements (text boxes, dropdowns, radios, checkboxes, buttons). Hidden, off-screen and honeypot fields are left out, because filling a spam-trap field gets a form rejected. Radios and checkboxes that sites hide with `opacity: 0` and draw themselves are still included.

**A small action set** (`lib/agent/browserAgent.ts`): `fill`, `select`, `check`, `click`, `ask_user`, `finish`. The model can call several per turn, so a whole form is usually filled in one or two model calls.

## How it works

1. **Interview** (`interview.ts`): one structured-output call per user message. Returns updated facts and the next question. The model says "done"; code overrules it if required facts are missing.
2. **Draft** (`draft.ts`): writes the complaint text from facts only. The user reviews and edits it. This is the only place free text is generated, so the browser agent never has to write anything.
3. **Browser agent** (`decisionAgent.ts`, **the default engine, D21**): loop of observe -> **one Decisions API call** (`gpt-6-luna`) with a typed question per field -> code applies the answers -> observe again. The model only *chooses* (which saved value goes in a field, which option, whether the user agreed, what to click next); our code does the typing. It may only type data from the `VALUES` list built from the facts and the approved draft. When it finishes, code re-reads the DOM and checks required fields and consent boxes itself. The older tool-calling loop (`browserAgent.ts`) is a fallback: `AGENT_ENGINE=tools`.

## Rules enforced in code (not by prompt)

- **Never submits to an organisation.** Submit buttons are excluded from the agent's choices (and blocked in the tool loop). The run ends at `ready_to_submit` and a human approves. Exception (D17): a task author can set `allowSubmit` for read-only pages (search, calculators, "next" in a checker), never for forms that send data to someone.
- **Never ticks consent boxes unless the user agreed.** Without agreement the run ends at `needs_input` with the question to show the user.
- **Never trusts "I filled everything".** `finish` is checked against the live page.
- **Never guesses missing data.** The model must `ask_user`.
- Step cap (12) and a JSONL log of every action in `.runs/<time>/events.jsonl` with a final screenshot.

## Entry points

| What | Where |
|---|---|
| Interview turn | `POST /api/agent/interview` `{ messages, facts? }` -> `{ facts, reply, done, missing }` |
| Draft | `POST /api/agent/draft` `{ facts }` -> `{ details, location, outcome }` |
| Fill NHS form | `POST /api/agent/step1` `{ facts, draft }` -> streamed NDJSON events; last is `done` |
| CLI | `npm run agent:interview -- --sim` (an LLM plays the user), `npm run agent:nhs` |

Models are set by env var: `INTERVIEW_MODEL`, `DRAFT_MODEL` (defaults `gpt-5.4-mini`, `gpt-5.4`), `DECISION_MODEL` (default `gpt-6-luna`), and `*_EFFORT`. `BROWSER_MODEL` is used only by the fallback tool loop. Key goes in `.env.local`.

## Building a new step (read before you write code)

1. Use `runDecisionAgent` (see `lib/agent/nhsLothian.ts` for the pattern: open session, go to the URL, `dismissCookies`, build `Value[]` from the facts, run, check). Do **not** write a new loop.
2. Give the agent a clear `goal` and a `Value[]` list with a plain-English `description` for every value. The descriptions are what the model matches against labels.
3. Add a task for your site to `scripts/bench.ts` with a code check that reads the live page, then run `npm run bench -- --only <id>`. Run the whole suite before and after touching `observe.ts` or the engine.
4. Set `allowCheckboxes` only when the user has actually agreed to the boxes. Set `allowSubmit` only for read-only pages.
5. Log what you did in `docs/PROGRESS.md` and anything you chose in `docs/DECISIONS.md`.

**Benchmark** (`npm run bench`, headless, never submits): 10/10 on the last full run. Details and limits in `docs/PROGRESS.md`.

## Not built yet

- **Submitting.** Needs a human approval path, a decision about test data (a real submit sends a real complaint to the NHS), and handling of the invisible reCAPTCHA.
- **Head-to-head of the two engines** (only the Decisions engine was benchmarked).
- **Steps 2-6** (records request, ombudsman, legal aid, solicitors, case file).
- **Reading replies** (email) to detect the acknowledgement and final response.
- **Recovery from validation errors after a submit attempt**, because we have never submitted.
- Facts live only in the caller. There is no server-side storage.
