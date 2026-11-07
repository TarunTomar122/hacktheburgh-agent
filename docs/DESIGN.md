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

- **Header (64px, `brand`):** the Elliot logo left (`Logo` in `app/ui.tsx`, 40px tall, from `public/logo.png`), a hairline divider, then "CASE FOR / name". **Profile icon on the right**; it opens the profile page. An amber dot means details are missing.
- **Stripes:** directly under the header, one thick line (4px) then thinner and fainter ones (2px at 60%, 1px at 30%). Component `Stripes` in `app/case/Header.tsx`.
- **Profile page:** the header's blue **continues** into a taller title band, then **stops** with the same stripes. No left rail on this page.
- **Superseded by D35 (fork map, `app/case/PathMap.tsx`).** Old: **Left rail ("Your path"), 320px:** progress block on top, then the steps as a timeline on a 1px `rail` line. **No circles.** The active step lights its stretch of the rail in `brand`, gets a `brand-soft` wash, and lists its milestones as small square ticks. Inactive future steps are `fade`. A locked step shows a lock icon and is still clickable (it explains itself).
- **Path map (D35, look refined 2026-11-07):** a cream (`paper`) band under the header: progress (serif %, thin bar, "Next", milestones count), then "Your story" forks into two lanes (**Get answers**: steps 1-2; **Get compensation**: steps 3-4) that join at **Your case file**. Each lane is one column of a two-column grid with no gap, so every connector is drawn inside its own column and the lines meet exactly in the middle (`Branch`, `Down` in `app/case/PathMap.tsx`). Lines are 1.5px `rail`; the path to the step being viewed is `brand`. Boxes: white cards with a "STEP n" eyebrow; active = brand border and a 4px `brand-soft` halo; done = teal check; locked = dashed `rail` with a lock; not built = dashed, faded. The active step's milestones (square ticks) sit under the map.
- **Live grid (D36):** with several agent tabs, the right-hand live panel shows one tile per agent (2 columns, 3 when the panel is wide). **A tile is only the live picture** (no border, header or label; the agent's name and colour are in its cursor pill inside the page); a failed agent gets a thin red wash with its note; the counter "N agents · N sites · N pages · N actions" sits under the panel header. Clicking a tile focuses it (full size, take control); "Back to grid" returns.
- **Progress:** big serif percentage, thin bar, "N of M milestones", and "Next: ...". Milestones are defined in `app/case/progress.ts`. Honest rules: only things we can know (profile data, the agent reaching the review page) plus self-reported "I've pressed Send". Steps not built count as milestones that cannot be done yet, so the percentage cannot reach 100% early.

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
| `PageTitle` | Eyebrow, light serif title, lede |
| `SectionTitle` | Serif heading with a hairline; optional right-hand action |
| `Field` + `control` / `selectControl` | Label above (eyebrow style), 5px radius, `line` border, brand border plus a 4px `brand-soft` ring on focus. Selects have a custom chevron |
| `Paper` | Cream document panel. (The draft panel was removed by D33: the user reviews on the real form) |
| `Card` | White, hairline border |
| `Callout` | `info` / `warn` / `ok` / `danger` tints |
| `Console` | Dark mono activity log; the newest line is white |
| `Eyebrow`, `LockIcon`, `UserIcon`, `ArrowLeftIcon`, `Logo` | Small pieces |

## Do / don't

- Do use serif only for headings, big numbers and the user's own draft text. Everything else is sans.
- Do keep copy plain and short. No jargon, no exclamation marks.
- Don't use circles for steps or avatars other than the profile button. Don't add shadows, gradients or a second primary colour.
- Don't hard-code colours. Don't add `dark:` classes.

## Not done yet

- The onboarding page (`app/page.tsx`, Om's widgets) uses the class versions and aliases; it has not been redesigned to the D31 shell (no blue header there yet).
- Two component systems (classes and `app/ui.tsx`) with the same specs. Consolidate into one when there is time.
- The logo and the favicon (`app/favicon.ico`, `app/icon.png`, `app/apple-icon.png`) come from Om's Elliot monogram (D37). Not done: the page title still says "Case helper"; no web manifest or social-share image.
- Wordsmith's licensed fonts are not used.
- Mobile layout is not designed (the rail is fixed at 320px).
