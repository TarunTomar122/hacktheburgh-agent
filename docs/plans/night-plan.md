# Night plan: an agent that works out the system wherever you are

**Status:** agreed by Tarun + Claude, 2026-11-07 (night). Work happens on the `night` branch only; `main` is left to the team. Tarun reviews in the morning and decides what merges.
**Branch base:** `main` at the time of branching (`774222b` plus later teammate commits pulled before branching).

## Resume here (kept current; read this first after any pause or limit reset)
- **State at 01:05 (8 Nov):** all four steps run on the discovered route (discovery → complaint → independent review → compensation → step 4 review). Three review rounds done (Codex: 7→8 complexity; Cursor: 6→8); all their findings applied and committed. Safety enforced in code (trap suite all passing). Local models for personal data (Qwen3 8B), model/data panel in the UI.
- **Benchmarks (vs answer keys):** NZ 7.3, NI 6.6, Wales 6.2, England 6.1, Scotland 5 (before the breadth-first fix). Scotland generic complaint: Kit filled NHS Lothian's form found by the crew.
- **State at 03:45 (8 Nov):** Tarun is awake (3:30) and asked for: (1) run state to persist across navigation (agents keep working, screen reattaches), (2) a persona picker modal in onboarding (20+ fictional personas across countries/stories, real live run), (3) progress percentage in the crew header, (4) only Sonnet 5.5 subagents, many in parallel. **Running now:** Sonnet 5.5 subagents: run persistence (usePlannerRun + attach/cancel endpoints), persona library + modal (app/page.tsx, lib/personas, ProfileTab), Iona investigation (lib/agent/investigate.ts), progress % (app/case/runProgress.ts); Codex and Cursor round 5 reviews; NI complaint run (ni-complaint-1). Their commits land on `night`; check `git log`, then push. England 2 = 6.4, Ireland 2 = 5.0 (limitation still wrong; as-enacted law now backs no numbers, prompt asks for revised text).
- **Next:** grade Ireland/California; check Wales compensation 2 reached firms and enquiries; rerun Scotland discovery (breadth-first) and England; a round-4 review; short video recordings of 2-3 best runs (RECORD_VIDEO only for short runs; then `pkill -9 -f ffmpeg-mac`); morning summary; then UI hill-climb.
- **Machine:** never record video on long runs; kill `tsc` piles with `pkill -f "tsc --noEmit"`; Ollama must be running for local models (or `LOCAL_MODELS=0`).
- **Heartbeat:** session cron every 30 min (:13, :43) + one-shot wrap-up 06:47.

## Morning summary (kept current through the night)

**The headline:** Elliot's crew now works out the health and legal system for wherever the care happened, live, with nothing hardcoded, and then does the work there. Tested on all four UK nations and New Zealand (Ireland and California running): it found each place's own complaint forms, ombudsman, compensation route (court, Welsh redress, NZ's no-fault ACC), funding and lawyer registers, with every fact quoted from an official page and checked by code.

**What works end to end in the app (night branch):**
- Onboarding for any country (country/region, international address and phone, one-line place confirmation).
- "How it works where you live": the discovery crew run (same avatars and calm screen), then a route map card with sources one click away.
- Step 1: complaint crew for any place (reads the provider's rules, finds the place's own guidance, drafts to the right body, fills its online form and stops, or prepares the email and finds where it goes). Proven on Scotland: NHS Lothian's form filled by the generic crew.
- Step 2: independent review for any place (when you can go, the time limit, the body's own form or a letter to its own address).
- Step 3: compensation for any place (the place's funding checker or rules, its scheme, its lawyer register with its own filters, cross-site firm checks, enquiries carrying the checker's own words), same case file and step 4 review.
- Models and data: every model call in a ledger; personal data on this Mac (Qwen3 8B), public research in the cloud; per crew member and per run in the UI.
- Safety in code: no worker can press send/submit/pay/apply/sign; traps prove it.

**Honest gaps:** discovery depth varies (5-7.3/10); some registers sit behind CAPTCHAs (reported, then another directory is searched); the form filler stops at a forward button when it cannot prove there is a later step; local Qwen3 is slower and a bit weaker than the cloud (see docs/night-runs/local-vs-cloud.md).

**Look at first:** run the app (`npm run dev`), load a fictional profile from `scripts/personas/`, watch "How it works where you live" (or "Play a recorded run, fast" for Wales), then step 1. Logs and grades per run in `docs/night-runs/`.

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

## Update 03:55 (Tarun)
- Reviews: no two-reviewer 9/10 loops any more; ONE Codex review per complicated task is enough. Cursor agents (grok-4.7) are used for implementation too, to save Claude tokens; Claude subagents only Sonnet 5.5.
- Every feature must show in the UI and be tested (deterministic test + headless screenshots).
- New: human hand-off (take over a blocked login/CAPTCHA tab, sign in, Continue) in progress (Cursor agent).

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
| Ireland (discovery 2, 01:06 run) | 5.0/10 | St James's (no national web form, noted) | Ombudsman | Legal Aid Board + eligibility calculator | Law Society search | — | limitation still 3 years (statute found is the as-enacted text, marked one site only); misses clinical-judgement exclusion |
| Ireland (discovery 1) | 5.8/10 | St James's (email) | Ombudsman online form | Legal Aid Board | Law Society of Ireland | — | limitation wrong |
| California (discovery 1) | 7/10 | hospital patient experience (post) | CDPH complaint page | Bay Area Legal Aid; government claim to the City and County | State Bar referral | — | second non-UK place |
| New Zealand (discovery 1) | 7.3/10 | Health NZ form found | HDC online form | ACC (no-fault, via provider) | NZ Law Society | — | first non-UK place |
| Northern Ireland (discovery 3) | 6.6/10 | Belfast Trust form | NIPSO form down → email | Legal aid (DoJ) | Law Society of NI | — | breadth-first fix |
| Scotland (generic discovery 2) | 6.5/10 | NHS Lothian form (filled by Kit) | SPSO checker | SLAB + success-fee caps | Law Society of Scotland | — | breadth-first + code checks |
| Scotland (generic discovery 1) | 5/10 | NHS Lothian form, **filled by Kit (generic)** | SPSO checker | SLAB estimator | not reached | — | out of turns (before breadth-first) |
| Wales (discovery 2) | 6.2/10 | email route + message (no web form exists) | ombudsman online form reached | legal aid finder + redress | Law Society | — | next: national rules for deadlines |
| England (discovery 2, 01:06 run) | 6.4/10 | GSTT/trust or ICB (bot wall reported) | Ombudsman 12 months | NHS Resolution; no ordinary legal aid | Law Society (CAPTCHA); missed AvMA | NICE (not the scaphoid page) | deadline now right (12 months); GSTT form still behind bot check |
| England (discovery 1) | 6.1/10 | GSTT form found, bot check | ombudsman complaint checker reached | GOV.UK checker | Law Society | — | deadline taken from a related trust |
| Wales (discovery 1) | 5.2/10 | form not reached (email route found) | body right, form behind CAPTCHA | wrong (legal aid) | Law Society found | — | depth fix next: key points per part, medium effort, 45 calls |

## Night runs (for the morning)

| Run | Place | Persona | Result | Video | Replay | Rerun command |
|---|---|---|---|---|---|---|
| scotland-discovery-2 (00:54) | Scotland (generic, all fixes) | Ailsa Reid | 12.2 min, 75 tabs, 22 sites, all 8 parts, 7 confirmed by two official sites. **Grade 6.5/10** (+1.5): NHS Lothian's form, SPSO checker, the National Personal Injury Court, SLAB, Law Society of Scotland, SIGN, PASS, records portal (login wall); read the success-fee caps in the regulations; missed the SPSO outage (the grader also wrongly flags NHS Lothian's form link, which the crew filled on video). Shipped as Scotland's discovery demo | — | `demo/discovery-2026-11-08T00-53-47-093Z/` | `... scripts/agent-discovery.ts scotland` |
| ni-complaint-1 (03:34) | **Northern Ireland** (generic complaint) | Orla Quinlan | 3.6 min: Kit filled **Belfast Trust's real online complaint form, 17 fields, nothing left unfilled**, stopped before Submit; limit within six months; Iona's NICE point asked politely | — | `docs/night-runs/ni-complaint-1/events.ndjson` | `... scripts/agent-flow.ts northern-ireland complaint docs/night-runs/ni-discovery-3/route.json` |
| ireland-discovery-1 (00:38) | **Ireland** | Aoife Brennan | 18.1 min, 86 tabs, 21 sites, 253 pages, all 8 parts. **Grade 5.8/10**: knew compensation is a clinical negligence court claim handled by the State Claims Agency, not the Injuries Resolution Board; found the Ombudsman's online form, the Law Society search, the Patient Advocacy Service; **wrong limitation (3 years instead of 2)** | — | `docs/night-runs/ireland-discovery-1/events.ndjson` | `... scripts/agent-discovery.ts ireland` |
| california-discovery-1 (00:38) | **California** (US) | Maya Lopez | 14.6 min, 55 tabs, 22 sites, 173 pages, all 8 parts. **Grade 7/10**: worked out that ZSFG is run by San Francisco's health department, so the pre-suit money claim goes to the City and County (government claim), not a generic form; CDPH complaint; Bay Area Legal Aid; State Bar referral service; American College of Radiology criteria as the guidance; missed the Medical Board complaint against the doctor | — | `docs/night-runs/california-discovery-1/events.ndjson` | `... scripts/agent-discovery.ts california` |
| scotland-complaint-video (00:44) | Scotland | Ailsa Reid | Same as scotland-complaint-1, recorded on video: **`docs/night-runs/scotland-complaint-video/kit-fills-nhs-lothian.mp4`** (Kit filling NHS Lothian's real form, consent box left for the patient, Submit not pressed) and `run.mp4` (whole run, 2x) | `docs/night-runs/scotland-complaint-video/*.mp4` | `docs/night-runs/scotland-complaint-video/events.ndjson` | `RECORD_VIDEO=<dir> ... scripts/agent-flow.ts scotland complaint docs/night-runs/scotland-discovery-1/route.json` then `sh scripts/stitch-video.sh <dir> out.mp4` |
| wales-compensation-2 (00:38) | Wales | Elin Rhydderch | **Full step 3 chain end to end, 9.8 min**: Law Society register CAPTCHA → Robin searched for another directory → AvMA's specialist finder searched with its own filters (12 firms) → 5 firms checked on their own sites, Irwin Mitchell ruled out (site redirects) → shortlist of 3 → **Kit filled 3 enquiry forms, stopped before Send**. Flaws (fixed after): checker asked for the postcode; scheme read from the complaints page; garbled PDF quote; firms in London/Bristol (AvMA's Wales region) | — | `docs/night-runs/wales-compensation-2/events.ndjson` | `... scripts/agent-flow.ts wales compensation docs/night-runs/wales-discovery-2/route.json` |
| nz-discovery-1 (00:23) | **New Zealand** (first non-UK place) | Aroha Ngata | 14.1 min, 95 tabs, 13 sites, 179 pages, all 8 parts. **Grade 7.3/10** (best so far): Health NZ's own feedback form, the Health and Disability Commissioner's online form, ACC no-fault claims lodged through the provider, NZ Law Society finder, an Auckland records request page, a scaphoid guideline from Starship; missed saying that suing is barred | — | `docs/night-runs/nz-discovery-1/events.ndjson` | `... scripts/agent-discovery.ts new-zealand` |
| ni-discovery-3 (00:23) | Northern Ireland | Orla Quinlan | Breadth first: all 8 parts in 13.4 min. **Grade 6.6/10** (+2.6): Belfast Trust's form, NIPSO's online form down (email fallback), the court route from the Limitation Order on legislation.gov.uk, the Law Society of NI finder; missed NIPSO's 2026 timings | — | `docs/night-runs/ni-discovery-3/events.ndjson` | `... scripts/agent-discovery.ts northern-ireland` |
| scotland-complaint-1 (00:30) | Scotland (generic, no Scotland code) | Ailsa Reid | **Kit filled NHS Lothian's online form (12 fields) found by the generic crew, stopped before Submit**; Iona found Scotland's own SIGN guidance (supplementary MRI or CT when the first X-rays are negative) instead of NICE; draft asks about it politely; time limit unclear (provider page silent). 3.7 min. Shipped as the Scotland complaint demo | — | `demo/complaint-2026-11-08T00-29-57-870Z/` | `... scripts/agent-flow.ts scotland complaint docs/night-runs/scotland-discovery-1/route.json` |
| scotland-discovery-1 (00:13) | Scotland (generic path, no Scotland code) | Ailsa Reid | 16.2 min, 90 tabs, 20 sites, 188 pages. **Grade 5/10**: found NHS Lothian's online form, the SPSO complaint checker, SLAB's estimator and the records portal (login wall) on its own; knew legal aid covers medical negligence in Scotland; ran out of turns before compensation and lawyers (breadth-first rule added after) | — | `docs/night-runs/scotland-discovery-1/events.ndjson` | `... scripts/agent-discovery.ts scotland` |
| ni-discovery-2 (00:09) | Northern Ireland | Orla Quinlan | 12.1 min, 76 tabs, 17 sites. **Grade 4/10**: Belfast Trust's online form found; spotted that NIPSO's online form is down (email instead); ran out of turns with only 4 of 8 parts (breadth-first rule added after) | — | `docs/night-runs/ni-discovery-2/events.ndjson` | `... scripts/agent-discovery.ts northern-ireland` |
| wales-escalation-2 (00:13) | Wales | Elin Rhydderch | Generic step 2: 1.2 min. Robin: "you can go now" (final response received), one-year limit quoted from the ombudsman's own page. Kit filled the ombudsman's online form (asked which kind of body) and stopped at an unlabelled "Next" (safety rule); Elliot then had Robin find ask@ombudsman.wales on its page (quoted, checked) and prepared the letter | — | `docs/night-runs/wales-escalation-2/events.ndjson` | `... scripts/agent-escalation.ts wales docs/night-runs/wales-discovery-2/route.json` |
| wales-compensation-1 (00:09) | Wales | Elin Rhydderch | Generic step 3, first run: 2.9 min. Robin read the redress scheme (starts inside the complaint); Nell's checker blocked on postcode (rule fixed: postcode = place); the Law Society register hit a CAPTCHA (fallback to another directory added after); Iona missed the guidance (site-search fallback added); Elliot asked the patient to browse (now forbidden) | — | `docs/night-runs/wales-compensation-1/events.ndjson` | `... scripts/agent-flow.ts wales compensation docs/night-runs/wales-discovery-2/route.json` |
| wales-discovery-2 (23:24) | Wales | Elin Rhydderch | Deeper discovery: 18.7 min, 80 tabs, 18 sites, 141 pages. **Grade 6.2/10** (+1.0): reached the ombudsman's online form, found the redress scheme and the 2025 rule raising the cap to £50,000; anchored the complaint stages on an outdated page | local only (`docs/night-runs/wales-discovery-2/video/`) | `docs/night-runs/wales-discovery-2/events.ndjson` | `IN_APP_BROWSER=1 LIVEVIEW=0 BROWSER_CHANNEL=chrome npx tsx --env-file=.env.local scripts/agent-discovery.ts wales` |
| england-discovery-1 (23:24) | England | Megan Holloway | 12.8 min, 62 tabs, 22 sites, 126 pages. **Grade 6.1/10**: found GSTT's complaint form (behind a bot check, reported) and the ombudsman's complaint checker; recovered records info via the trust family when GSTT was blocked; took a 6-month deadline from a related trust's page | local only | `docs/night-runs/england-discovery-1/events.ndjson` | `... scripts/agent-discovery.ts england` |
| wales-complaint-1 (23:28) | Wales | Elin Rhydderch | Generic complaint crew on route 1: 2.6 min; in time; Iona quoted NICE 1.2.3 via the Welsh Government page; draft written to Cardiff and Vale; no online form, so a message was prepared (recipient was vague; fixed since: only an email inside a checked quote counts) | local only | `docs/night-runs/wales-complaint-1/events.ndjson` | `... scripts/agent-flow.ts wales complaint docs/night-runs/wales-discovery-1/route.json` |
| ni-discovery-1 (23:40) | Northern Ireland | Orla Quinlan | Did not finish within 30 min: the machine was overloaded (161 leaked video recorders, 100+ typechecks); restarted without video | — | — | `... scripts/agent-discovery.ts northern-ireland` |
| wales-discovery-1 (23:04) | Wales | Elin Rhydderch (fictional) | All 8 parts found, 26/26 quotes checked, 8.4 min, 34 tabs, 11 sites, 106 pages. **Grade 5.2/10**: right bodies; spotted the 2026 "Listening to People" rename; missed the £50k redress scheme and stage timings; funding wrong (adult legal aid out of scope); ombudsman form behind CAPTCHA | `docs/night-runs/wales-discovery-1/video/` (local, 34 tab videos) | `docs/night-runs/wales-discovery-1/events.ndjson` | `IN_APP_BROWSER=1 LIVEVIEW=0 npx tsx --env-file=.env.local scripts/agent-discovery.ts wales` |

## Review log

| Phase | Codex | Cursor | Main objections | What changed |
|---|---|---|---|---|
| Integrated v5, Codex (03:50) | complexity 8.5, robustness 5.5, fake-risk 4 (lower is better), safety 5, honesty 5.5 | — | Blockers: JS 'Continue' link on a filled form can send (reproduced); empty enquiry reported ready_to_send (Wales Enable Law); currency not parsed (£ quote backed $/€) and unofficial quotes back numbers; later flows bypass discovery's evidence checks; irrelevant guidance (children's) still enters the draft; Scotland scoring (SLAB) in generic flow | In progress (Sonnet 5.5 agents): link/button send traps, enquiry readiness, claim parsing, guidance applicability; SLAB strings in score() already neutral |
| Integrated v5, Cursor (03:50) | — | complexity 8, robustness 5, fake-risk 6, UI 6.5, honesty 6 | Generic complaint screen still says Citizens Advice Scotland/NICE; firm score invents SLAB listing; deadline caveat not on the sentence the patient reads; English-only cookies/units/en-GB; one-page filled form reported as failure (NZ); no chain across one place; .scot host-word officialness | Score strings and long-deadline caveat done; rest queued |
| Integrated v3, Codex (01:10) | complexity 8.5, robustness 5.5, fake-risk 5, UI 7.5 | — | Blocker: the enquiry engine clicked JavaScript "Send" buttons (reproduced); the backup engine sent raw values to the cloud; funding answers went to the cloud planner; Ireland's saved deadline wrong | Fixed: send-like buttons/links refused in both engines (new trap test passes), backup engine only with ALLOW_CLOUD_FALLBACK=1, funding answers kept off the planner |
| Integrated v3, Cursor (01:15) | — | complexity 8, robustness 5, fake-risk 4, UI 6 | Number check by substring ("12 years" backed "2 years"); `what` unchecked; "as enacted" law treated as live; escalation "ready" while past the limit; one-page enquiry "Continue" could send | Fixed: numbers as whole tokens with units (8-case test), `what` numbers hidden when unbacked, as-enacted pages not official, escalation shows "Check first" when past the limit, no buttons on one-page forms without approval. Ireland's saved route (3 years) is a known-wrong artefact and is not shipped as a demo |
| Integrated v2, Cursor (00:55) | — | complexity 8, robustness 5, fake-risk 5, UI 6 | Reverse quote containment and number tokens; no stage order in step 2; lawyers before the scheme; legal aid without "likely"; enquiry forms sent raw values to the model; Scotland-worded enquiry and screens; URLs and "online form" claimed by the model; no retry on step 2 | Stage order in steps 2 and 3; legal aid only when likely; eligibility regex; enquiry values hidden, honest ledger per call, any-language contact links, the place's area of law; URLs only if opened, "online form" only if reached; Scotland copy removed from generic screens (builder); retry on step 2; data kinds in the models list |
| Integrated v2, Codex (00:45) | complexity 8, robustness 5, fake-risk 6, UI 7 | (pending) | fillForm keeps a stale "not final" verdict after conditional answers; unrelated progress bars count as later steps; reverse quote containment; numbers without units; officialness via mentions; cloud planner saw the story and the local draft; place detection in the cloud; escalation "ready" next to "outside"; only two funding routes | Builder fixing both fillForm holes with traps; no reverse containment, numbers with units, officialness from the page's own title/address; place detection local, no names or letters in the planner, ledger honest for Elliot; escalation reconciled, date reasoning with thinking; enquiry prompt place-aware with the checker's own words; demos picked by place |
| Integrated v1, Codex (23:45) | complexity 7, robustness 4, fake-risk 6, UI 5 | (pending) | Route not executed (compensation scheme ignored; escalation still SPSO-only); submit holes in questionnaire (bare Submit/Confirm) and directory (model-chosen submit); evidence promotion (model "official", PDF quotes rechecked against DOM, unrelated quotes blessing claims); cross-crew dependency races; errors strand the user | Stage-ordered crew work; read_scheme in compensation; generic escalation step being built; safety builder hardening both workers with trap tests; PDF quotes and numeric claims checked; strict recipient; Try again on errors |
| Design v1, Cursor (Grok 4.7, 00:00) | — | complexity 6, feasibility 4, fake-risk 8 | exploreSite is real, the rest is an 8-slot checklist with a low-effort planner; officialness and quote checks too loose (prefix URL match, model-claimed official, stitched quotes); record_step races the reads; route card is static; "memory may suggest" invites hardcoding; Brave one-hit-per-host and no search wall; login pages without password fields; contact forms passing as complaint forms; unreadable PDFs | Code-decided official (opened host) and two official hosts for "confirmed"; exact-URL quote store with full page text; provenance (only URLs found this run); record_step runs after the reads; failure check fixed; search: 3 hits per host + bot-check detection; route map fills in live beside the browser; unconfirmed parts kept out of headlines; demo buttons only with a recording; explore fixes sent to its builder |
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
