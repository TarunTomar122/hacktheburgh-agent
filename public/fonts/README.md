# Fonts

| File | Font | Used for | Licence |
|---|---|---|---|
| `newsreader-latin-wght-normal.woff2` | Newsreader (variable, weight 200-800) | Headlines (`.display`) | SIL OFL 1.1, `LICENSE-Newsreader.txt` |
| `inter-latin-wght-normal.woff2`, `inter-latin-ext-wght-normal.woff2` | Inter (variable, weight 100-900) | Everything else | SIL OFL 1.1, `LICENSE-Inter.txt` |

Source: the `@fontsource-variable/inter` and `@fontsource-variable/newsreader` npm packages (version 5.3.0), files copied unchanged.

## Why not Wordsmith's own fonts

wordsmith.ai serves Basel Grotesk (Regular, Medium) for text and GT Ultra Median (Light) for headlines. Both are commercial typefaces. This repo is public, and we have no licence to redistribute them, so they are **not** included.
Inter is the fallback Wordsmith itself lists after Basel Grotesk; Newsreader Light is the closest free match for the headline serif that we found (a visual judgement, not a measured match).

If the team obtains a licence, drop the `.woff2` files in this folder and change the `--font-sans` and `--font-serif` values in `app/globals.css`.
