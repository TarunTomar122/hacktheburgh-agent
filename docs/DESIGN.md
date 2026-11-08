# Design system

**Last updated: 2026-11-07.** Read this before you touch any UI. The goal: one coherent look that matches Wordsmith (the track sponsor), so nothing looks bolted on.

**Where it lives in code:** tokens in `app/globals.css` (Tailwind v4 `@theme`), React components in `app/ui.tsx`, and class versions of the same components (`.btn-primary`, `.btn-ghost`, `.field`, `.card`, `.eyebrow`, `.display`, `.hl-blue`, `.hl-violet`) in `globals.css` for the onboarding widgets. Both follow the same specs. This file merges two independent passes at the same goal (Om's D26 and Tarun's D31, 2026-11-07). Build screens from those. **Do not** write raw hex values, `zinc-*`, or `dark:` classes in components. If you need something that is missing, add it to `globals.css` or `ui.tsx` and to this file in the same commit.

## Where the values come from (verified 2026-11-07)

- Wordsmith's own stylesheet at `wordsmith.ai` (CSS variables and computed styles read with a script) and a headless screenshot of their home page.
- Photos of the hackathon slides (blue "The challenge" slide, "How we judge" slide with a charcoal panel and a warm beige panel).
- **Not verifiable:** their fonts are licensed (**GT Ultra Median**, a light serif, and **Basel Grotesk**). We cannot ship them. Their own CSS falls back to Playfair Display and Inter. We use **Newsreader** (serif) and **Inter** (sans), both SIL OFL, **self-hosted in `public/fonts/`** (Om, D26) so nothing loads from the network at the venue. These are stand-ins, labelled as such.

## Colour

| Token | Hex | Wordsmith source | Use |
|---|---|---|---|
| `brand` | `#0060df` | `--color-brand-ink-500` (their primary button and links, 21 uses) | Header, primary buttons, links, active step, progress bar |
| `brand-soft` | `#e8f0ff` | `--color-brand-ink-100` | Selected row, focus ring, highlight |
| `ink` | `#181818` | `--color-foreground` | Text, headings |
| `ink-2` | `#525252` | neutral-600 | Secondary text |
| `muted` | `#737373` | neutral-500 | Labels, captions |
| `faint` | `#a1a1a1` | neutral-400 | Placeholders, disabled text |
| `fade` | `#d3d5d9` | `--color-home-phase-mute` | Inactive list items ("Coming soon") |
| `line` | `#e5e5e5` | neutral-300 / border-subtle | Hairlines, input borders |
| `line-soft` | `#ededed` | neutral-200 | Dividers inside cards |
| `rail` | `#d8d3c7` | `--color-home-rail` | The timeline rail, dividers on paper |
| `paper` | `#fcf7ee` | `--color-paper-cream` | Document panels (the draft) |
| `subtle` | `#fafaf9` | neutral-50 | Quiet backgrounds, hover |
| `night` / `night-text` / `night-meta` | `#1a1d21` / `#ededef` / `#969698` | `--color-home-card-*` | Dark panel (activity log) |
| `purple` / `purple-soft` | `#8600fa` / `#f6eeff` | brand-purple-500/100 | Second highlight (unused so far) |
| `amber` / `amber-soft` | `#e64d00` / `#fff0e8` | brand-amber-500/100 | Warnings, "still needed" |
| `teal` / `teal-soft` | `#009587` / `#ecfdfb` | brand-teal-500/100 | Success, "Done" |
| `danger` / `danger-soft` | `#dc2626` / `#fef2f2` | home-danger / red-50 | Errors, delete |

**Aliases** (kept for the onboarding widgets, D26): `body` = ink, `cream` = paper, `stone` = subtle, `brand-50` (#e8f2ff), `orange` = amber, `orange-50` (#ffeee5), `teal-50` = teal-soft, plus `mist` (#f5f5f5), `navy` (#0b1221), `hairline` (8% navy), `violet` (#9333ea) and `violet-50`. New code uses the names in the table. **Careful:** in D26 `paper` meant white; here `paper` is cream. White is `bg-white`.

Rules: **one primary colour (`brand`) for every primary button.** Tints (`*-soft`) are backgrounds only; text on them stays `ink` or `ink-2`. Disabled primary buttons use `fade`. Hover on primary is `brand` at 90% (no extra shade invented).

## Type

| Role | Font | Spec |
|---|---|---|
| Display (page titles, section titles, big numbers) | Newsreader (stand-in for GT Ultra Median) | weight 300, tracking -0.03em, line-height 1.08. Class `.display`. Wordsmith H1 is 40px / 300 / -1.2px |
| Body and UI | Inter (Wordsmith: Basel Grotesk, falling back to Inter) | 16/24 base; 14/24 for controls and card text; 15/24 for ledes |
| Eyebrow label | Inter | 11px, weight 500, uppercase, tracking 0.1em, `muted` (matches the "MAIN CRITERION" labels on the slides) |
| Draft text ("the document") | Newsreader | 17/28, `ink` |
| Activity log | system monospace | 12/20 |

Sizes in use: page title 40px, profile title 48px, section title 22px, progress number 44px, step title 17px.

## Spacing, radius, layout

- 4px base grid. Page content is a single column, **max 768px** (`max-w-3xl`) with 48px side padding; vertical rhythm between sections 40px (`space-y-10`) or 48px.
- Radius: **5px** controls and buttons (`rounded-ctl`; Wordsmith buttons are 4-5px), **8px** cards and panels (`rounded-card`). Progress bar is fully rounded.
- No shadows (Wordsmith buttons and cards are flat). Separation comes from hairlines and the cream/white contrast.
- Light only. Dark mode is deliberately disabled (`dark:` never applies).

## Shell

- **Header (64px, `brand`):** the Elliot logo left (`Logo` in `app/ui.tsx`, 40px tall, from `public/logo.png`; `LogoLink` makes it a link, D43), a hairline divider, then "CASE FOR / name". **Profile icon on the right**; it opens the profile page. An amber dot means details are missing.
- **Stripes:** directly under the header, one thick line (4px) then thinner and fainter ones (2px at 60%, 1px at 30%). Component `Stripes` in `app/case/Header.tsx`.
- **Profile page:** the header's blue **continues** into a taller title band, then **stops** with the same stripes. No left rail on this page.
- **Superseded by D35 (fork map, `app/case/PathMap.tsx`).** Old: **Left rail ("Your path"), 320px:** progress block on top, then the steps as a timeline on a 1px `rail` line. **No circles.** The active step lights its stretch of the rail in `brand`, gets a `brand-soft` wash, and lists its milestones as small square ticks. Inactive future steps are `fade`. A locked step shows a lock icon and is still clickable (it explains itself).
- **Path map (D35, look refined 2026-11-07):** a cream (`paper`) band under the header: progress (serif %, thin bar, "Next", milestones count), then "Your story" forks into two lanes (**Get answers**: steps 1-2; **Get compensation**: steps 3-4) that join at **Your case file**. Each lane is one column of a two-column grid with no gap, so every connector is drawn inside its own column and the lines meet exactly in the middle (`Branch`, `Down` in `app/case/PathMap.tsx`). Lines are 1.5px `rail`; the path to the step being viewed is `brand`. Boxes: white cards with a "STEP n" eyebrow; active = brand border and a 4px `brand-soft` halo; done = teal check; locked = dashed `rail` with a lock; not built = dashed, faded. The active step's milestones (square ticks) sit under the map.
- **Track bar and step pages (D42, layout 2026-11-07):** one slim sticky bar under the header: the chosen track and its fit, the steps as tabs (number square, title, lock or "soon"), and a small progress meter whose milestones open in a popover. Switching tracks is only in the profile ("Your path"). Step pages: `max-w-6xl`, the step in a main column and a sticky "This step" panel on the right (help line, checklist, what the path gets you). Step 3 results use the full width.
- **Shopping-style results (step 3):** filters on the left built from the actual result, each with a live count; sort by best fit or nearest; a grid of compact cards (select box, "Top pick", fit ring, name, place, up to 3 badges); details in a modal; the full trace one click further. A sticky dark bar appears when firms are selected.
- **Live grid (D36):** with several agent tabs, the right-hand live panel shows one tile per agent (2 columns, 3 when the panel is wide). **A tile is only the live picture** (no border, header or label; the agent's name and colour are in its cursor pill inside the page); a failed agent gets a thin red wash with its note; the counter "N agents · N sites · N pages · N actions" sits under the panel header. Clicking a tile focuses it (full size, take control); "Back to grid" returns.
- **Progress:** big serif percentage, thin bar, "N of M milestones", and "Next: ...". Milestones are defined in `app/case/progress.ts`. Honest rules: only things we can know (profile data, the agent reaching the review page) plus self-reported "I've pressed Send". Steps not built count as milestones that cannot be done yet, so the percentage cannot reach 100% early.

## Case navigation (2026-11-08)

One sticky bar (`app/case/TrackBar.tsx`) is on every case screen: Research, Choose a path, then the chosen path's steps. Done stages are ticked and reopen; stages not open yet say why inside the tab ("after the research", "pick solicitors first"). There is no Back/Next footer on pages: Wordsmith's own site has none, and the bar does the job. Where you are lives in the address (`/case?step=3`, with `&view=firms` for step 3's list of all firms), kept by `app/case/stage.ts`, so reload and the browser Back button keep your place. The logo always goes to the landing page; the landing page's button reads "Continue your case" when a case is saved. The profile page keeps its blue band and has "Back to your case" in it.

## Onboarding screens (D41)
Contact form (D44): a postcode found in the address skips the postcode screen and the next screen carries a small brand-coloured note saying so.

Each interview question is a full screen under the header: heading in `.display` (32-40 px, 26-30 px if the question is long), input below, `OK` + "or press Enter" (`OkRow`), errors as a red line under the input. Inputs: `.big-input` (serif light, 2px underline, brand on focus), `.choice-row` with `.keycap` (A, B, C) or `.check`. A 4 px brand progress bar sits under the stripes. Components: `app/StageInputs.tsx`, `app/StageControls.tsx`; `DateField` takes `big`.

## Marketing landing page (`/`, 2026-11-08)

`app/page.tsx` is a server component: blue header with a white "Start consultation" button (links to `/start`), serif hero with the `hl-blue` highlight, a mock of the route plus live log, "how it works" on cream, the crew cards (`public/crew/*-256.png`), a charcoal "every claim has a source" panel, and a closing blue band. Same tokens as everywhere else, no shadows or gradients. The onboarding moved to `/start` (`app/start/page.tsx` renders `app/Onboarding.tsx`); the logo on the onboarding screen links back to `/`. The route list, log lines and the quoted time limit on the landing page are illustrations, not real results.

## Onboarding name screen (D40, now at `/start`)

- **Shell:** the same blue 64px header and stripes as the case page (`Stripes` from `app/case/Header.tsx`), with the logo left and, from the `sm` breakpoint up, "Getting started / Preparing your case" (becomes "Case for / <first name>" once the name is known). Below `sm` only the logo shows. The dev-only "Skip: use demo patient" button sits on the right as a dashed white outline.
- **Name screen (`app/NameStep.tsx`), in the manner of Typeform:** one question in the display serif ("First, what should I *call you*?", with the `hl-blue` highlight), one lede in `ink-2`, then a large field: borderless, serif 34/40px light, underlined with `line`, the underline turns `brand` on focus. Big `OK` button and an "or press Enter" hint. The field is focused on load, Enter submits, `OK` is disabled while empty. The typed text lives in the page, so a failed request returns here with the text kept and the error shown under the field. Footer line: "Nothing is sent to the NHS yet."
- **After the name** the page becomes the chat (`app/page.tsx`) under the same header.
- **Motion:** `.fade-up` (450 ms, 8px rise) in `app/globals.css`; off under `prefers-reduced-motion`.

## Steps (D33)

- **No forms in our app.** A step is a title, one sentence about what will happen, and one primary button. The agent prepares everything from onboarding and earlier steps.
- **Never show or ask again** anything agreed in an earlier step.
- **The user reviews on the real form** in the other window (the agent stops before Submit/Send). Do not mirror the form's questions on our screen.
- **Ask only what is missing, on the step:** `AskMissing` (profile facts, using the onboarding inputs) before the run; `AgentAsk` (the exact field the agent could not fill) after it, then the fill runs again.
- After a successful run: one `ok` callout ("It is waiting for you in the other window") and a self-reported "I've pressed Submit/Send".

## Components (`app/ui.tsx`)

| Component | Use |
|---|---|
| `Button` | `primary` (brand, flat), `secondary` (hairline), `ghost` (brand text). Sizes `md`, `sm`. **Never put a primary button in the same row as the paragraph that explains it.** |
| `ActionCard` | Title, explanation, then the button **underneath**. Currently unused (steps are one button, D33) |
| `PageTitle` | Light serif title and lede (no eyebrow above it) |
| `SectionTitle` | Serif heading with a hairline; optional right-hand action |
| `Field` + `control` / `selectControl` | Label above (eyebrow style), 5px radius, `line` border, brand border plus a 4px `brand-soft` ring on focus. Selects have a custom chevron |
| `Paper` | Cream document panel. (The draft panel was removed by D33: the user reviews on the real form) |
| `Card` | White, hairline border |
| `Callout` | `info` / `warn` / `ok` / `danger` tints |
| `Console` | Dark mono activity log; the newest line is white |
| `Eyebrow`, `LockIcon`, `UserIcon`, `ArrowLeftIcon`, `Logo` | Small pieces |

## Do / don't

- **No small label above a headline** ("COMPENSATION · STEP 1" over the title was a headline over a headline). The track bar already says where you are (Tarun, 2026-11-07). Small uppercase labels are only for labelling a group of content, never sitting on top of a title.
- **Headlines are never questions.** Page and section titles are statements or helpful instructions ("Check legal aid and find lawyers", not "Can I get legal aid?"). Questions are only for prompts the user answers (Tarun, 2026-11-07).
- **No back links inside page headers.** The header's profile icon opens and closes the profile; a page does not add its own "Back to …" link at the top (Tarun, 2026-11-07).
- **Never truncate text** (no `truncate`, ellipsis or line clamps). Let it wrap, or change the layout so it fits; long URLs use `break-all` (Tarun, 2026-11-07).
- **Progressive disclosure:** a little up front, details on click (Tarun, 2026-11-07).

- Do use serif only for headings, big numbers and the user's own draft text. Everything else is sans.
- Do keep copy plain and short. No jargon, no exclamation marks.
- Don't use circles for steps or avatars other than the profile button. Don't add shadows, gradients or a second primary colour.
- Don't hard-code colours. Don't add `dark:` classes.

## Not done yet

- `InputPanel` (compact widgets on the case page, D33) still uses the class versions and aliases. The onboarding interview itself uses the stage screens (D41).
- Two component systems (classes and `app/ui.tsx`) with the same specs. Consolidate into one when there is time.
- The logo and the favicon (`app/favicon.ico`, `app/icon.png`, `app/apple-icon.png`) come from Om's Elliot monogram (D37, replaced by the round version in D43). Not done: the page title still says "Case helper"; no web manifest or social-share image.
- Wordsmith's licensed fonts are not used.
- Mobile layout is not designed (the rail is fixed at 320px).
