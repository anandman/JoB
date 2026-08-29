# Jacks or Bettor

Video poker strategy and odds reference app. Mobile-first, static site — no build step, no dependencies, works on GitHub Pages.

## What it does

**Pay Tables** — View and compare pay tables for Jacks or Better variants (9/6, 9/5, 8/6, 8/5). See per-coin payouts, expected returns, and house edge at a glance.

**Risk** — What a session costs and what can go wrong. Set a coin-in goal, denomination, line count and coins per line, and it works out the hands, the time, the expected and typical cost, the swing, the risk of ruin against your bankroll, and the bankroll needed to hold ruin to 5% or 1%. A configurable W-2G handpay threshold (default $2,000) reports which hands cross it, how often, and the highest denomination that keeps handpays rare — compared both across denominations and across line counts at a fixed total bet.

**Casinos** — Per-property game lists with returns, denominations, per-machine tier credit earn rates, and handpay exposure, scraped from vpfree2.com. Filter by game to cut a 15-game floor listing down to the one you actually play; the choice persists.

**Analyzer** — Enter or deal a hand and see all 32 ways to hold it, ranked by expected value, with the exact cost of every alternative and the full outcome distribution for the best one. Works for any of the eight games. Switch to **Play** and it deals, you hold, you draw, and every hand is scored against perfect play — tracking how often you found the best hold and what the misses cost.

**Strategy Card** — Dynamically computed strategy charts for each pay table variant. Toggle between Simple (~14 lines, fits one phone screen) and Optimal (~27 lines, near-perfect play). Strategy updates automatically when you switch variants.

## Install it

The site is a PWA: open it on your phone and use Add to Home Screen (iOS) or
Install app (Android). It runs standalone, respects notches and the home
indicator, and works fully offline — useful on a casino floor with no signal.

Live at **https://anandman.github.io/bettor/job/**

## Running locally

Open `index.html` in a browser. That's it.

Or serve it:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying

Run `node tools/stamp-assets.js` from the repo root, then push to `main`.
GitHub Pages rebuilds automatically. See the [root README](../README.md#deploying)
for why the stamp step is not optional.

A weekly GitHub Actions workflow re-scrapes vpfree2 and commits any changes,
which redeploys the site. Casinos to track live in `tools/casinos.config.json`.

## Project structure

Everything below is relative to `job/`, the app's directory in the
[Bettor Edge](../README.md) repo. Tooling is shared and lives at the repo root.

```
index.html                # Single-page app shell
css/style.css             # Mobile-first dark theme
js/data.js                # Pay tables, strategy categories, note rules
js/poker.js               # Card encoding + hand evaluators (4 games)
js/strategy-engine.js     # EV calculator + strategy generator
js/casinos.js             # GENERATED casino floor data
js/promo.js               # Coin-in, W-2G, variance, risk of ruin
js/analyzer.js            # Per-hand hold analysis
js/app.js                 # Tab navigation, rendering, toggle logic
manifest.webmanifest      # PWA manifest
sw.js                     # Service worker (offline support)
icons/                    # GENERATED app icons

../tools/fetch-casino.js  # Scrapes vpfree2.com -> job/js/casinos.js
../tools/make-icons.py    # Regenerates job/icons/
../tools/stamp-assets.js  # Cache-busting stamp; run before every push
```

## How strategy computation works

Each strategy category (e.g., "Low Pair", "4 to a Flush") has a representative 5-card hand. The engine exhaustively enumerates all possible draw outcomes for the held cards, evaluates each resulting hand, and computes the exact expected value (EV). Categories are then sorted by EV to produce the optimal strategy, or grouped into ~14 merged entries for the simple strategy.

Computation takes ~60ms on desktop and results are cached per pay table.

## Data sources

Pay table payouts and expected return percentages are standard values from video poker literature. Strategy ordering is computed from the pay tables and verified against the well-known Wizard of Odds strategy for Jacks or Better.

| Variant | Expected Return | House Edge |
|---------|----------------|------------|
| 9/6 Full Pay | 99.54% | 0.46% |
| 9/5 | 98.45% | 1.55% |
| 8/6 | 98.39% | 1.61% |
| 8/5 | 97.30% | 2.70% |

## Development

No build step, no dependencies. Edit the files and reload.

```sh
python3 -m http.server 8000   # or just open index.html
```

Scripts load in order: `data.js` → `poker.js` → `strategy-engine.js` →
`casinos.js` → `promo.js` → `analyzer.js` → `app.js`. Each exposes one global; load order matters.

`js/casinos.js` is generated — refresh it from the repo root with:

```sh
node tools/fetch-casino.js --promo silver-legacy eldorado-hotel-casino
```

There are no tests, no linter, and no CI. Verify by opening the page, switching
variants, and toggling Simple/Optimal.

## License

MIT License. See [LICENSE](LICENSE).
