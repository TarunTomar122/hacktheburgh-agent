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
3. **Browser agent**: loop of observe -> model picks actions -> code executes -> observe again. It may only type data from a `VALUES` list built from the facts and the approved draft. When it calls `finish`, code re-reads the DOM and checks required fields itself.

## Rules enforced in code (not by prompt)

- **Never submits.** Clicking a submit button returns `BLOCKED`. The run ends at `ready_to_submit` and a human approves.
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

Models are set by env var: `INTERVIEW_MODEL`, `DRAFT_MODEL`, `BROWSER_MODEL` (defaults `gpt-5.4-mini`, `gpt-5.4`, `gpt-5.4-mini`), and `*_EFFORT`. Key goes in `.env.local`.

## Not built yet

- **Submitting.** Needs a human approval path, a decision about test data (a real submit sends a real complaint to the NHS), and handling of the invisible reCAPTCHA.
- **Steps 2-6** (records request, ombudsman, legal aid, solicitors, case file).
- **Reading replies** (email) to detect the acknowledgement and final response.
- **Recovery from validation errors after a submit attempt**, because we have never submitted.
- Facts live only in the caller. There is no server-side storage.
