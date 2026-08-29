# Bettor Edge

Casino math you can check at the machine. Strategy charts, hand analyzers, and
risk models for the games I actually play — mobile-first static sites with no
build step and no dependencies.

Live at **https://anandman.github.io/bettor/**

## Apps

| App | Game | Status |
|-----|------|--------|
| [**Jacks or Bettor**](job/) (`/job/`) | Video poker | Live |
| [**Bettor or Bust**](bob/) (`/bob/`) | Blackjack | Live |

**Jacks or Bettor** covers eight pay tables across Jacks or Better, Bonus
Poker, Double Double Bonus and Deuces Wild: returns, strategy cards derived
from the pay table itself, a hand analyzer that prices all 32 holds, a play
mode scored against perfect play, bankroll and risk-of-ruin math, W-2G handpay
exposure, and scraped Reno floor data. See [job/README.md](job/README.md).

**Bettor or Bust** does the same for blackjack. A dealer probability engine
feeds everything else: the basic strategy chart is that grid collapsed to its
best action, the hand analyzer is the same numbers unsummarised, and play mode
scores each decision by the gap between what you did and the best action. Dial
in decks, S17/H17, DAS, doubling and splitting limits, surrender and the
blackjack payout, and the chart and house edge both move. Verified against the
published 6-deck S17 DAS chart on all 340 cells. Still to come: risk of ruin
for a progressive betting ladder.

## Repo layout

One repo means one GitHub Pages site and one base path, so each app is a
subdirectory rather than a separate site. Each owns its own HTML, CSS, JS,
manifest, icons and service worker, which keeps their PWA scopes and offline
caches independent — installing one doesn't drag in the other.

```
index.html          # Bettor Edge landing page (self-contained)
icons/favicon.svg   # Landing page mark
job/                # Jacks or Bettor — video poker
bob/                # Bettor or Bust — blackjack
tools/              # Shared tooling (scrapers, icon and cache-stamp scripts)
```

## Running locally

```sh
python3 -m http.server 8000
# http://localhost:8000/          landing
# http://localhost:8000/job/      video poker
# http://localhost:8000/bob/      blackjack
```

Opening an app's `index.html` directly from the filesystem also works.

## Deploying

```sh
node tools/stamp-assets.js
git push
```

Pages rebuilds from `main` automatically. **The stamp step is not optional.**
Pages serves everything with `Cache-Control: max-age=600`, so for ten minutes
after a deploy a browser can pair a new `index.html` with cached old JS — which
throws on load and leaves the page half-rendered. `stamp-assets.js` writes a
content hash into every asset URL so the HTML and its scripts can never
disagree. It hashes each app separately, so a video poker change doesn't
invalidate the blackjack cache.

## License

MIT License. See [LICENSE](LICENSE).
