# Decision log

**Rules.** Append only. Never edit or delete an entry. To change a decision, add a new entry that says `Supersedes D<n>` and explain why. Status is `decided` (a teammate chose it) or `proposed` (an agent suggested it and nobody objected yet; challenge it freely). Newest at the bottom.

Format: `D<n> · date · who · status` then decision, then why.

---

**D1 · 2026-11-07 · Tarun · decided**
Enter the Wordsmith.AI browser-use track. Legal is a bonus, not required.
Why: the user's interest; the slide says legal is "ideally, not required".

**D2 · 2026-11-07 · Tarun · decided**
Case is a single fictional patient, Ailsa, in Scotland (NHS Lothian), with a missed scaphoid fracture.
Why: one country keeps rules simple; the case is easy to explain. All legal facts about it are unverified (see `docs/PROJECT.md`).

**D3 · 2026-11-07 · Tarun · decided**
Product shape: a local web app (Next.js) with a Node server that drives a **visible** Playwright Chromium window. Not a browser extension, not a desktop app.
Why: Playwright is already tested here; the audience can watch the browser; no login or extension permissions needed.

**D4 · 2026-11-07 · Claude, accepted by Tarun · decided**
Use a dedicated Playwright profile, not the user's real Chrome. No sign-in to any site.
Why: none of the sites in the flow need a login; a real profile exposes the user's tabs and logins to a model.

**D5 · 2026-11-07 · Tarun · decided**
Build onboarding (name, story, follow-up questions) then a main app with a steps sidebar. Step 1 is the NHS complaint. A Profile tab holds the saved information.

**D6 · 2026-11-07 · Claude · proposed**
Agent design: three separate jobs. (1) interview, structured output; (2) draft complaint text from facts only, which the user edits; (3) browser tool loop that may only type values from the approved facts and draft.
Why: free text is generated in one reviewable place, so the browser loop cannot make things up.

**D7 · 2026-11-07 · Claude · proposed**
Safety rules live in code, not prompts: the agent can never click submit; cannot tick consent checkboxes unless the user agreed; `finish` is verified against the live DOM; the model must `ask_user` instead of guessing missing data.
Why: found in testing that the agent first reported "ready" with an unticked required consent box.

**D8 · 2026-11-07 · Claude · proposed**
Models via OpenAI, set by env var: browser `gpt-5.4-mini` (reasoning `none`), interview `gpt-5.4-mini` (`low`), draft `gpt-5.4` (`low`).
Why: available on the team key; fast enough in a one-call test. Not benchmarked properly. Change freely, but log it here.

**D9 · 2026-11-07 · Claude · proposed**
Store the profile in the browser's localStorage only, for now. API routes receive facts from the client.
Why: simplest. Limit: not shared across devices, and CLI scripts cannot read it.

**D10 · 2026-11-07 · Claude, agreed by Tarun · decided**
Do not claim "everything runs locally". Honest claim: data only goes to the organisations the user chooses, plus the model provider.
Why: the agent sends the user's details to the NHS and law firms by design.

**D11 · 2026-11-07 · Claude · proposed**
Keep firm discovery in the browser (Law Society directory), not a search API like Exa. Use APIs only where a browser adds nothing (e.g. reading email, looking up a document).
Why: the track scores browser-use complexity.

**D12 · 2026-11-07 · Claude · proposed**
Drop "booking an independent medical expert" from the agent.
Why: the solicitor instructs and pays experts; booking is irreversible and not needed to prepare a case.

**D13 · 2026-11-07 · Tarun · decided**
Email connection, if added, goes through a managed-auth connector service (Composio, Arcade, Nango, Pipedream style), not hand-built OAuth. Lower priority than the browser flows. Not started.

**D14 · 2026-11-07 · Claude · proposed**
Submitting the NHS form is not implemented. It needs: a human approval path, a rule for test data (a real submit sends a real complaint), and a plan for the invisible reCAPTCHA.
Why: the safest default until the team decides.

**D15 · 2026-11-07 · Tarun · decided**
Repo is public: https://github.com/TarunTomar122/hacktheburgh-agent. Fictional data only; no secrets committed.

<!-- Add new entries above this line. Next number: D16 -->
