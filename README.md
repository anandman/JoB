# Bettor Edge

Casino math you can check at the machine, and a ledger for what it actually
cost. Mobile-first static sites with no build step and no dependencies.

Live at **https://anandman.github.io/bettor/**

## Apps

| App | Game | Status |
|-----|------|--------|
| [**Jacks or Bettor**](job/) (`/job/`) | Video poker | Live |
| [**Bettor or Bust**](bob/) (`/bob/`) | Blackjack | Live |
| [**Color Up**](colorup/) (`/colorup/`) | Session ledger | Live |

**Jacks or Bettor** covers eight pay tables across Jacks or Better, Bonus
Poker, Double Double Bonus and Deuces Wild: returns, strategy cards derived
from the pay table itself, a hand analyzer that prices all 32 holds, a play
mode scored against perfect play, bankroll and risk-of-ruin math, W-2G handpay
exposure, and scraped Reno floor data. See [job/README.md](job/README.md).

**Bettor or Bust** does the same for blackjack. See [bob/README.md](bob/README.md). A dealer probability engine
feeds everything else: the basic strategy chart is that grid collapsed to its
best action, the hand analyzer is the same numbers unsummarised, and play mode
scores each decision by the gap between what you did and the best action. Dial
in decks, S17/H17, DAS, doubling and splitting limits, surrender and the
blackjack payout, and the chart and house edge both move. Verified against the
published 6-deck S17 DAS chart on all 340 cells. Index plays — the counts at
which the second-best action becomes the best one — are derived the same way,
for your table's rules rather than looked up from a published set.

**Color Up** is the other half of the same question: not what the math says a
session should cost, but what it did. One row per session — what went in, what
came out, the tier credits, any W-2G handpays, and how long it took, which is
the number a spreadsheet of totals cannot give you. It stores everything in
your own browser and sends nothing anywhere; a backup leaves the device only
when you export one. See [colorup/README.md](colorup/README.md).

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
colorup/            # Color Up — session ledger
tools/              # Shared tooling (scrapers, checks, icon and cache-stamp scripts)
```

## Running it

Clone the repo and open `index.html` in a browser. That is the whole
procedure — these are static pages with no build step, no dependencies and
nothing to install. Every app works the same way:

```
index.html          the landing page
job/index.html      video poker
bob/index.html      blackjack
```

**Color Up is the exception**, and only because it stores your sessions:
browsers restrict local databases for pages opened straight off the
filesystem, so use the hosted copy at
https://anandman.github.io/bettor/colorup/ — or, if you want to run your own,
serve the folder over HTTP:

```sh
python3 -m http.server 8000     # then http://localhost:8000/colorup/
```

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
