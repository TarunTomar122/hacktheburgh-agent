# Night plan: an agent that works out the system wherever you are

**Status:** agreed by Tarun + Claude, 2026-11-07 (night). Work happens on the `night` branch only; `main` is left to the team. Tarun reviews in the morning and decides what merges.
**Branch base:** `main` at the time of branching (`774222b` plus later teammate commits pulled before branching).

## Resume here (kept current; read this first after any pause or limit reset)
- **Done and pushed:** plan, design draft (`docs/plans/anywhere-design.md`), model ledger (`lib/agent/ledger.ts`, test `scripts/test-ledger.ts`), shared worker contract (`lib/agent/workers/types.ts`).
- **Running (started ~23:10):** research agents writing `docs/research/jurisdictions/*.md` (England, Wales, Northern Ireland, Ireland+NZ+Australia, US-CA+France+Germany+Sweden+India); builders for `lib/agent/workers/explore.ts` (readPage, exploreSite), `fillForm.ts` (multi-page filler), `searchDirectory.ts` + `questionnaire.ts`; Codex and Cursor design reviews.
- **Also running:** onboarding for any country (builder: facts `country`/`region`, international address/phone, place confirmation, wording).
- **Parked:** `lib/agent/discovery.ts` is in `~/night-parked/` until `workers/explore.ts` exists (it imports it); then move it back and re-enable the `DISCOVERY-HOOK` line in `app/api/agent/plan/route.ts`.
- **Built since:** `lib/agent/crewRun.ts` (reusable crew run: parallel crew, asks, skips, ledger), `routeTypes.ts`, `place.ts`; discovery events in `usePlannerRun`.
- **If a running item never reported back, it died:** check whether its files exist and pass `npx tsc --noEmit`; finish or restart it.
- **Next:** apply review changes to the design; build the discovery planner (route map) on the workers; onboarding place detection; generic complaint flow; generic escalation; generic compensation flow; UI; local models (Ollama pulling qwen3:8b and LFM2 into `~/.ollama`); runs per UK nation; countries; recordings.
- **Heartbeat:** session cron every 30 min (:13, :43) + one-shot wrap-up 06:47. It survives usage limits as long as this Claude session stays open.

## Morning summary (kept current through the night)

_Nothing done yet. This section is rewritten at every checkpoint: what works, what does not, scores from Codex and Cursor, what to look at first._

---

## The bet

Today Elliot's crew knows one system: Scotland (NHS Lothian, SPSO, SLAB, the Law Society of Scotland). We extend it so the agent **works out the system for the user's own country and case**, finds those websites itself, and does the work there. Start with all four UK nations, then try any country and see if it holds. Working half the time, with honest exceptions, is enough for the hackathon. The point to show: the agent is very smart at browser use.

Why this is real browser work, not more of the same: the *shape* of the process changes, not just the URLs.
- **UK.** England: NHS complaint, then the Parliamentary and Health Service Ombudsman; claims under a pre-action protocol. Wales: "Putting Things Right", with NHS redress up to about £25k without court. Northern Ireland: HSC complaints, then NIPSO. Scotland: what we have.
- **Elsewhere.** No-fault schemes (New Zealand ACC, Sweden patient insurance), conciliation commissions (France), doctors' chamber arbitration boards (Germany), state-by-state rules (US). All unverified until researched; see Phase 0.

## Ambition (Tarun, 2026-11-07, before sleeping)
"We can do more." Go for browser workflows that would be impossible without a very smart browser agent. Research a lot; implement the more complicated workflows where the agent really shines. Tarun trusts the night run with real power: use it.

## Live and dynamic, nothing hardcoded (Tarun, 2026-11-07)
"Do not hardcode the paths or anything, that would defeat the purpose of a complicated workflow using browser use. It has to be a live dynamic agent."
- The agent finds every body, website, page and form **itself, at run time**: live search, live navigation, reading and judging what it finds.
- No per-country URLs, routes, scripts or site flows in code or prompts.
- `docs/research/jurisdictions/` is an **answer key** for grading the agent after a run. It is never given to the agent.
- The existing Scotland site code (SLAB calculator and finder, Law Society register, NHS Lothian form) may only help **after** the agent has reached that site by itself, and the generic path must work without it. Prefer making it generic.

## Heartbeat
A heartbeat fires every 30 minutes (session cron, :13 and :43) and checks: on track with this plan, very high-quality UI with no clutter, everything fully integrated end to end, Codex and Cursor scores at 9/10, ambition, safety, notes pushed. A one-shot wrap-up fires at 06:47 to make the morning summary current.

## Definition of done (Tarun, 2026-11-07)
Nothing stops at a prototype or a script. Every item is **fully integrated end to end in the app UI**, works from onboarding to the last step, and is **reviewed and approved by Codex and Cursor (9/10)** on quality and on the benchmarks we keep. An item that is not done that way is reported as not done.

## Rules for the night (unchanged from the day)

- **Never submit or send anything.** Every form stops before Submit/Send. The send gate stays.
- **Fictional data only.** New personas for other nations and countries are invented, never real people.
- **Headless only** (`IN_APP_BROWSER=1`, `LIVEVIEW=0` in scripts). Full real agent runs are allowed tonight (Tarun: cost is fine, only waiting time mattered).
- **Scotland must keep working.** It stays the polished, deep path; the step 1-4 demo must not regress.
- **Only official sources** for legal facts (government, NHS/health service, ombudsman, regulator, courts, law society). Every fact is quoted and linked. "Could not confirm" beats a guess.
- **Logins and CAPTCHAs:** the agent stops and hands over to the user, like Submit.
- **Notes as we go.** This file, `docs/PROGRESS.md`, `docs/DECISIONS.md` (D66 onwards) and `docs/ACTIVE_WORK.md`. Push to `night` after every checkpoint.

## How we work

- **Builders:** Opus 5.5 at high effort for the design and the hard parts. Research before building.
- **Reviewers:** Codex and Cursor review **every** phase (design, code, results), independently. Target: both score it **9/10** for complexity of the end-to-end browser workflow and for quality, before moving on. Each round's scores and objections are logged below under "Review log".
- **Sonnet 5.5 subagents** for the side backlog at the bottom, when the main line is not blocked.

## Phases

### Phase 0: research (official sources, written down)
For each of England, Wales, Northern Ireland, Scotland: who you complain to, the ombudsman or regulator, the compensation route (court, redress scheme), funding (legal aid, no win no fee), how to find a lawyer (directory or register), clinical guidelines body, time limits, and the actual web pages and forms. Then the same, more briefly, for a contrasting set: Ireland, New Zealand, one US state, France, Germany, Sweden, India, Australia. Output: `docs/research/jurisdictions/<place>.md`, every line with a link.
This is the **answer key** to grade the agent against after runs. It is never given to the agent; the agent must find all of it itself, live.

### Phase 1: design
1. **Discovery (Robin).** New first step. From the story and the user's location, research the system and produce a **route map**: bodies, routes, deadlines, funding, directories, forms, each with an official source and a quote. Typed schema (zod), with confidence and "not found".
2. **Planning (Elliot).** The planner builds its plan from the route map instead of today's fixed story.
3. **Doing (generic workers).** `visit` reads any page. A generic "search this site" worker uses a site's own search box, filters and pagination. Kit fills unknown forms (already built for arbitrary law firm sites). Iona finds the local clinical guideline, not only NICE. The Scotland-specific code is not given to the agent; at most it helps once the agent has reached that site by itself (see "Live and dynamic").
4. **Where the place comes from.** Assumed (Tarun to confirm): the agent works it out from the story and postcode/address, and the user confirms it.

### Phase 2: all four UK nations, end to end
A fictional persona per nation (England, Wales, Northern Ireland, plus Ailsa in Scotland). Each runs the full flow: discovery, complaint form filled and stopped, ombudsman route, funding, lawyers found and checked, enquiries filled and stopped. Results table below.

### Phase 3: any country
Run the same agent on the contrasting set. Log per country: worked / partly / failed, and why (login wall, CAPTCHA, language, no online form). Fix the common failures, not one-offs.

### Phase 4: UI (onboarding and anywhere else is open to change)
Tarun: onboarding and other parts of the app may change as needed (for example asking or detecting the country early). Same crew screen and avatars. One new, quiet element: "How it works where you live" (the route map, with sources). Minimal, as before.

### Phase 4b: local and cloud models by what each agent may see
Why we split into agents: each one sees only the data it needs, and its model follows from that.
- Elliot (plans): summary with names and address replaced by placeholders: cloud, strong model.
- Robin (discovery, lawyers): public pages plus country or region only: cloud.
- Iona (evidence, health story): **local** (on device).
- Nell (funding, money): **local**.
- Kit (forms): the model sees form labels and the *names* of values, never the values; code types the real values. Cloud or local.
- The complaint draft: local mid-size model by default; cloud only with the user's OK; quality compared.
Machine: M1 Max, 32 GB, Ollama and llama-server installed, no models pulled yet. Candidates: Liquid LFM2 (1-3B), Qwen3 8B, gpt-oss-20b. Local tasks are narrow with forced JSON; the planner stays in the cloud. Local failure falls back to cloud only for non-sensitive data, and says so.
Build: **one ledger for every model call** (agent, model, local or cloud, tokens in and out, time, kinds of data sent), shown per crew member in the UI ("on your device, 0 bytes left your machine") and per run; plus one local-vs-cloud comparison on the same tasks (accuracy, time, tokens). The ledger comes first (it gives numbers for everything else); routing after the UK nations work.

### Phase 5: recordings for the morning (and later the demo)
Tarun wants to see real runs in the morning: **at least 3 or 4, successes and failures both**. For each run, keep:
- a **video** of the browser (Playwright `recordVideo`, headless), in `docs/night-runs/<run>/`
- the **replayable event stream** (`events.ndjson` + screenshots), playable in the app like the step 3 demo
- a short line in the "Night runs" table below: place, persona, what worked, where it failed, and how to rerun it (one command).

**Open for Tarun (morning):** which pair to show next to Scotland in the demo. Claude's suggestion: England (close but different) and New Zealand (no-fault, completely different).

### Phase 6 (only if everything above is done before 07:00): UI hill-climb, end to end
Improve the UI at every step, in loops. Each loop: research the best UI patterns and example UIs on the internet; ask Codex and Cursor for feedback against them; fix; re-score. Target 10/10 on every factor: spacing, layout, amount of text (no walls), readability, visuals, ease of access and navigation, and showing clearly what the agent is doing. Log each loop's scores below.

## Results

| Place | Discovery | Complaint form | Ombudsman / regulator | Funding | Lawyers | Enquiries | Notes |
|---|---|---|---|---|---|---|---|
| Scotland | (fixed today) | yes | yes | yes | yes | yes | baseline |

## Night runs (for the morning)

| Run | Place | Persona | Result | Video | Replay | Rerun command |
|---|---|---|---|---|---|---|

## Review log

| Phase | Codex | Cursor | Main objections | What changed |
|---|---|---|---|---|
| Design v1 (23:30) | complexity 7, feasibility 4 (full) / 7 (focused), fake-risk 7 | Gemini not in plan; rerun on Grok 4.7 | Risk of "new URLs, Scotland's workflow"; routes must have dependencies; explore_site is the main investment; lawyer suitability across sites; Nell→Kit handoff of funding evidence; Kit must prove its stopping point; existing Scotland code (planner SYSTEM/STAGE, supportsLothian, findForm English words, decisionAgent submit guard and values in prompts) fights the design | Route steps gain requires/appliesIf/alternatives/missing; discovery proves who runs the hospital and replans on contradictions; points forwarded to the three worker builders; order: workers → discovery → generic complaint → lawyers chain with funding handoff → UK nations → countries → local models |

## Not doing (discussed and dropped, 2026-11-07)
Whole-case single run, a complexity view, reliability bench, medical records request, reply loop, deadline tracker, Care Opinion, PASS, consultation booking, benefits calculator. Reason: not browser-heavy enough, or not what makes the workflow more complex. A checker agent (re-read every filled form) is possible later but does not add workflow complexity.

## Side backlog (Sonnet 5.5 subagents, when the main line allows)

1. **SPSO form: attach documents.** Upload the complaint we wrote and NHS Lothian's reply to the ombudsman form (file upload is browser-only; today we skip it).
2. **Pre-action investigation for Iona** (makes the Luna engine's work more interesting; does not solve the main goal):
   - SPSO decision reports for similar complaints (e.g. missed scaphoid fractures; decision 201508011 exists)
   - NHS Lothian's own guidance on Policy Online and RightDecisions (scaphoid leaflets found)
   - NHS Lothian's FOI disclosure log (searchable, has scaphoid hits)
   - Healthcare Improvement Scotland inspection reports
   - Scottish awards for scaphoid nonunion (BAILII, Scottish Courts)
3. See also Lea's `docs/plans/browser-complexity-plan.md` (X2: follow the specialist, not the firm).
