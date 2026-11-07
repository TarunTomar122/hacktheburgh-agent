# Complexity backlog

**Last updated: 2026-11-07** (refresh this date whenever you touch the file; see the rules in `AGENTS.md`).

Session verification (2026-11-07, Claude): step 2 now fills the SPSO online complaint form (14 pages) on the Decisions engine; obstacles added to item 5 below. Item 3 (searching published SPSO decisions) is still `untested`.

Session verification (2026-11-07, Codex): NHS form filling now runs from the app's Step 1 button. The fictional patient completed the live form with no missing required fields and stopped before submission. The email consent conditional field was handled. Evidence is recorded in `PROGRESS.md`; the six backlog statuses below are unchanged by this app integration.

**Purpose.** The track scores the *most complicated end-to-end browser-use workflow*. These six items are how we make the workflow genuinely complex **in the browser** instead of padding it. Each one says what is already verified, what is not, and why it counts as real browser work. Added on Tarun's go-ahead (D23); the items are proposed work, not commitments.

**Status words (use exactly these):** `tested` = we ran it against the live site and saw it work; `partly tested` = some parts verified, say which; `untested` = nobody has tried it. If you have not verified something, write `untested`. Never upgrade a status without having run it.

**Suggested order:** 1, then 5, then 2 or 3 (probe by hand for 15 minutes first to see if the site cooperates), then 4 if there is time. Item 6 can slot in whenever steps 3 (legal aid) and 4 (solicitors) are wired together.

**Avoid (reads as padding):** the GMC register (results never loaded in testing); more forms with the same shape as ones we already fill; steps that are really code with a browser opened around them.

How to update: change the item's Status/Notes/Last touched in the same commit as your code, add a line to `docs/PROGRESS.md`, and update the date above. Claim an item by putting your name in Owner and adding a row to `docs/ACTIVE_WORK.md`.

| # | Item | Status | Owner | Last touched |
|---|---|---|---|---|
| 1 | Vet law firms in depth | partly tested | unclaimed | 2026-11-07 |
| 2 | Work out where to complain | untested | unclaimed | 2026-11-07 |
| 3 | Search published SPSO decisions | untested | unclaimed | 2026-11-07 |
| 4 | A second persona with a different route | partly tested | unclaimed | 2026-11-07 |
| 5 | Show the obstacles we already handle | tested | unclaimed | 2026-11-07 |
| 6 | Feed one site's output into another site's field | partly tested (each side separately) | unclaimed | 2026-11-07 |

---

## 1. Vet law firms in depth (top priority)

**Status:** partly tested · **Owner:** unclaimed

**What it is:** Search the Law Society directory -> apply the hidden "Medical negligence" sub-filter -> page through the results -> open each firm's "View details" -> go to the firm's own site -> read its clinical negligence page -> drop firms that act for the NHS or insurers -> match each firm's legal-aid badge against the SLAB result -> find the firm's enquiry form.

**Why it is real browser complexity:** it is a long chain where each page's content decides the next action (which firms survive, where the form is), across many sites the agent has never seen, with different layouts, popups and late loading. A fixed script cannot do it; this is the "unfamiliar sites" answer to the brief.

**Verified so far (2026-11-07):**
- The directory search works and the agent drives it (`lib/directory.ts`, bench task `lawsoc`): "Edinburgh" + "Accident and injury" returns 97 firms with name, address, a **Legal aid** badge and partner count.
- Enquiry forms are found and filled (not submitted) on three firms in the benchmark: Anderson Strathern (on-page form, two required checkboxes), MFMac (form in a popup), Irwin Mitchell (the form **loads lazily on the same page** and also exists at `/contact-us`; a first snapshot taken too early missed it).

**Not verified:**
- The "Medical negligence" sub-filter: it is a hidden multi-select (`AreaOfLawAI`), and the earlier attempt to set it failed. **Untested.**
- Paging through results, and "View details" (the row has no website link; details open as an in-page collapse, contents not yet read). **Untested.**
- That Kennedys, TLT and Burges Salmon act for the NHS or insurers, and that such firms appear in the filtered list. **Unverified.** Do not claim it until a firm's own site or a credible source says so.
- Reading a firm's clinical negligence page and deciding from it. **Untested.**

**Next step:** make the sub-filter work (try clicking the widget's visible control instead of setting the hidden select), then open "View details" for three firms and see whether a website link appears.

**Dependencies:** the engine in `lib/agent/decisionAgent.ts` (D21); add a bench task for each new site (D22).

## 2. Work out where to complain

**Status:** untested · **Owner:** unclaimed

**What it is:** For a GP complaint, find the practice's own website and its complaints process. For a hospital complaint, identify the health board from the postcode and find that board's complaint route (a form, an email address or a PDF).

**Why it is real browser complexity:** the target is not known in advance. The agent starts from a postcode or a practice name and has to find, read and act on a site it has never seen, in whatever form the complaint route takes. This is the cleanest demonstration of "works on sites it has never seen".

**Verified so far:** nothing by us. The claim that GP complaints go to the practice itself, via a Lothian page titled "Complaining about your GP...", came from the parent thread and is **unverified by us**. NHS Lothian's own feedback form (the hospital route for Lothian) is tested.

**Not verified:** how any specific GP practice or other health board takes complaints; whether the routes are automatable; whether PDFs are the only route for some. **Untested.**

**Next step:** probe by hand for 15 minutes: pick three Edinburgh GP practices and one other health board and record, for each, what the complaints route looks like. If most are PDFs or phone-only, record that here and downgrade the item.

## 3. Search published SPSO decisions

**Status:** untested · **Owner:** unclaimed

**What it is:** Search the SPSO's published decisions for similar cases (missed fracture, NHS Lothian), open the reports, and pull out what was upheld so it can be quoted in the complaint.

**Why it is real browser complexity:** it is a search UI plus pagination plus opening and reading long documents, then using what was found to change the next action (what to say in the complaint). Output of one site feeds the text of another.

**Verified so far:** nothing. We have only seen SPSO's *complaint checker* (`https://www.spso.org.uk/form/complaint-checker`), not its decisions search; whether a searchable decisions archive exists and loads in an automated browser is **unknown**.

**Risk to check first:** quoting upheld findings in a complaint is a content decision with legal-looking weight. Any text we generate must come only from the report, quote it exactly, cite it, and be reviewed by the user. Do not paraphrase findings into claims.

**Next step:** 15-minute manual probe: find the decisions search, try one query, open one report, note whether it is HTML or PDF.

## 4. A second persona with a different route

**Status:** partly tested · **Owner:** unclaimed

**What it is:** For example, a parent complaining on behalf of a child: Lothian's "Someone Else" branch plus its child-friendly complaints process.

**Why it is real browser complexity:** it exercises a *different path through the same sites*: a branch in the form, possibly a different page or process, and different required details. Branching on the user's situation is part of what the brief asks for.

**Verified so far:** the NHS Lothian form has a "This feedback is about: Me / Someone Else" radio (observed 2026-11-07); the interview and form runner support `complainingFor: someone_else` in code. We have **never run** the "Someone Else" path against the live form, so we do not know what extra fields appear.

**Not verified:** what the "Someone Else" branch asks for; whether a child-friendly complaints process exists on Lothian's site and where. **Untested.**

**Next step:** run the NHS task with `complainingFor: "someone_else"` and `scripts/probes/observe.ts` and record the new fields; then look for the child-friendly page.

## 5. Show the obstacles we already handle

**Status:** tested · **Owner:** unclaimed

**What it is:** Surface each obstacle the agent already deals with on the live graph or log, so judges can *see* the recovery instead of taking our word for it.

**Why it is real browser complexity:** this is the "recovering from failures" half of the brief, and every item below is something that really broke us during development.

**Obstacles handled and verified (2026-11-07):**
- Hidden radio and checkbox inputs (`opacity: 0`, custom-drawn boxes) on the NHS Lothian form: counted as visible when their label is (`observe.ts`).
- The honeypot field `nf-field-hp`: skipped, and the benchmark asserts it stays empty.
- The consent checkbox that only appears after choosing Email: ticked only if the user agreed; otherwise the run stops with the exact consent question.
- Late cookie banners that intercept clicks: waited for and dismissed generically (`dismissCookies`).
- Lazy-loaded forms (Irwin Mitchell): found on the next observation.
- Pages that navigate mid-action (Law Society search): `observe()` waits and retries.
- SLAB's firewall returning 403 to Playwright's default user-agent: a normal Chrome user-agent is set in `openSession()`.
- **SPSO online complaint form (14 pages, tested 2026-11-07, benchmark task `spso-form`):** multi-page navigation where only "Next" may be clicked (never "Save for later" or "Send complaint"); a "resume saved complaint" login box on the first pages that must never be typed into; dropdowns whose empty state is `--`; option lists with duplicate labels; required fields marked only by a leading `*`; fields with no linked label; word limits (outcome 15-500 words) checked in code before the browser opens; the agent stops with a specific question when a required field cannot be filled, and halts on the final review page.

**Not done:** the UI/log display. The events exist (`lib/agent/events.ts`, `.runs/<time>/events.jsonl`), but nothing renders "obstacle hit, recovered" yet. That is the work here.

**Next step:** emit a typed `obstacle` event at each point above (what was hit, what the agent did) and render it in the step view.

## 6. Feed one site's output into another site's field

**Status:** partly tested (each side separately) · **Owner:** unclaimed

**What it is:** The result of SLAB's legal aid estimator fills Anderson Strathern's required legal aid checkbox.

**Why it is real browser complexity:** it is a genuine cross-site dependency: a value computed in one browser session changes what the agent does on a different site. This is the clearest "output of one site is input to another" example we have.

**Verified so far:**
- SLAB's estimator completes end to end with the Decisions agent (bench task `slab`); it computes the result on the page as you type, so the Estimate button is never pressed; dummy student figures returned "likely to qualify for civil legal aid".
- Anderson Strathern's form has a required checkbox saying you are not eligible for legal aid unless seeking help with medical negligence, linking to slab.org.uk; the benchmark ticks it when a saved value says the user agrees.

**Not verified:** the link between them. Nothing reads the SLAB result and feeds it into the firm's form yet. Also unclear what the correct behaviour is if the user *is* eligible: the checkbox text says "you agree that you are not eligible for legal aid, unless seeking assistance with Medical Negligence", so ticking it is a statement the user must agree to themselves, not something the agent should infer. Treat the SLAB result as an input to *which firms to contact* and as a prompt to the user, not as automatic consent.

**Next step:** pass the SLAB verdict into the saved values for the firm step, and make the agent ask the user before ticking that box.
