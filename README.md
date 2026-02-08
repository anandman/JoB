# Jacks or Betterment

Video poker strategy and odds reference app. Mobile-first, static site — no build step, no dependencies, works on GitHub Pages.

## What it does

**Pay Tables** — View and compare pay tables for Jacks or Better variants (9/6, 9/5, 8/6, 8/5). See per-coin payouts, expected returns, and house edge at a glance.

**Strategy Card** — A simplified strategy chart that fits on one phone screen. Scan from the top, hold the first match, discard the rest. Works for all four variants and costs only ~0.08% vs. perfect computer strategy on 9/6 full pay.

## Running locally

Open `index.html` in a browser. That's it.

Or serve it:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying

This is a static site. Push to GitHub and enable GitHub Pages on the `main` branch, or drop the files on any static host.

## Project structure

```
index.html          # Single-page app shell
css/style.css       # Mobile-first dark theme
js/data.js          # Pay tables, expected returns, strategy data
js/app.js           # Tab navigation, rendering logic
```

## Data sources

Pay table payouts and expected return percentages are standard values from video poker literature. The simplified strategy is based on the well-known Wizard of Odds simple strategy for Jacks or Better.

| Variant | Expected Return | House Edge |
|---------|----------------|------------|
| 9/6 Full Pay | 99.54% | 0.46% |
| 9/5 | 98.45% | 1.55% |
| 8/6 | 98.39% | 1.61% |
| 8/5 | 97.30% | 2.70% |

## License

MIT License. See [LICENSE](LICENSE).
