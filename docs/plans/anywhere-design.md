# Design: Elliot, anywhere (night branch, D66 draft)

Goal: the crew goes in cold, works out the health and legal system for the patient's own place, **live**, and does the work there. Nothing per-country is hardcoded (see `night-plan.md`, "Live and dynamic"). Scotland is just one more place it must work out by itself.

## 1. Shape of a run

```
Onboarding: story + address  ->  Place (country, region, hospital, public/private), confirmed by the user
        |
Discovery (Robin leads, Iona and Nell help)  ->  Route map (every fact sourced, quote-checked)
        |
Elliot plans the work from the route map (not a fixed story)
        |
Complaint track:     Robin reads the provider's process -> Iona finds the local guideline and compares -> Elliot drafts -> Kit fills the provider's form (stops)
Escalation:          Kit prepares the ombudsman/regulator form for later (stops)
Compensation track:  Nell runs the place's own funding checker (asks as it goes) -> Robin searches the place's lawyer register with its own filters -> checks firms -> Kit fills enquiries (stops)
```

## 2. Generic workers (the skills; no site knowledge in code)

| Worker | Crew | What it does | Hard parts it must handle |
|---|---|---|---|
| `web_search` | Robin | Search the web (exists) | official vs commercial results |
| `read_page` | anyone | Read a page, answer a question, return **quotes** and links (extends `visit`) | long pages, PDFs, cookie walls |
| `explore_site` | Robin, Kit | From a start URL, follow links and buttons (model-chosen, up to N hops) until a page meets a goal ("the online complaint form for this hospital's health board"). Returns the path, the final page, whether it is a form, its fields, and any wall (login, CAPTCHA, phone/post only) | menus, accordions, iframes, "start now" pages, dead ends, backtracking |
| `fill_form` | Kit | Fill any form from saved values, across pages ("Next", "Continue", "Save and continue"), stopping before the final Submit/Send (generalises `runDecisionAgent` + `advance`) | multi-page wizards, conditional questions, radios, date pickers, consent boxes left for the user, unknown fields asked to the user |
| `search_directory` | Robin | Use a site's **own** search UI (location, specialism, filters, "load more", pages) and extract the results. May press Search because only whitelisted, non-personal values are typed (a place name, an area of law) | autocomplete boxes, filters behind "advanced", results that need "view details", pagination |
| `run_questionnaire` | Nell | Run an online checker or calculator page by page, asking the user only the questions the page actually shows, never guessing money answers (generalises the SLAB calculator) | branching questions, answers revealing new questions, reading the final result |
| `check_firm` | Robin | Read a firm's site: represents patients, no win no fee, enquiry form (exists, `vetFirm`) | |
| `fill_enquiry` | Kit | Find and fill a firm's enquiry form (exists, `fillOne`) | |
| `read_guideline`, `compare_care` | Iona | Find the place's own guideline body live, quote the recommendation, compare with the timeline (generalise `readGuideline`, no fixed URL) | |

Safety in code, not prompts: `fill_form` and `fill_enquiry` never click a final submit; `search_directory` only types whitelisted values; login and CAPTCHA walls stop the worker and are reported, never bypassed.

## 3. The route map (discovery output)

```ts
type Source = { url: string; quote: string; checked: boolean }; // checked = the quote really appears in that page's text (code check)
type RouteStep = {
  id: string;
  kind: "complaint" | "escalation" | "compensation" | "funding" | "lawyers" | "advice" | "guideline" | "records";
  body: string;            // "Guy's and St Thomas' NHS Foundation Trust", "Parliamentary and Health Service Ombudsman"
  what: string;            // one plain sentence
  deadline?: string;       // quoted
  how: "online_form" | "email" | "post" | "phone" | "login_required" | "unknown";
  url?: string;            // the page or form the agent found
  wall?: string;           // "needs NHS login", "CAPTCHA", ...
  sources: Source[];
  confidence: "confirmed" | "likely" | "unconfirmed"; // confirmed = 2 independent official sources, or 1 official + quote checked
};
type RouteMap = { place: Place; system: string; steps: RouteStep[]; foundAt: string };
```

Rules: a fact without a checked quote from an official page is "unconfirmed" and shown as such. The planner sees the route map; the user sees it as "How it works where you live" (one quiet card, sources one click away).

## 4. Data and models (Phase 4b)

Every model call goes through one ledger: agent, model, local or cloud, tokens in and out, ms, kinds of data sent (none, place, health, money, identity). Routing: Robin and Elliot cloud (public data, pseudonymised summary); Iona, Nell, the draft local; Kit's model sees value names, never values.

## 5. Where it lands in the app

- Onboarding: place detection and confirmation; the track choice uses the route map's routes.
- Step titles become dynamic ("Complain to <provider>", "<ombudsman short name>").
- Steps 1 to 4 run on the generic workers for every place, Scotland included.
- Same crew screen, avatars and case files; plus the route map card.

## 6. How we know it works

Answer key: `docs/research/jurisdictions/*.md` (never shown to the agent). After each run, a grader compares the route map with the answer key (body, ombudsman, limits, forms found) and logs a score per place in `night-plan.md`.
