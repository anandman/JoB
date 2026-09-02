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

## How the strategy is derived

Everything below is computed from the pay table, not looked up. Change a
payout and the card changes with it.

### Strategy pipeline

Each category carries a representative 5-card hand, a `holdMask`, a `tier`
(drives color), and a `simpleGroup` letter (A–N, the merge key). The engine
computes an exact EV for that one representative hand. `NOTE_RULES` then adds
conditional annotations (e.g. "Break FH, Flush, or Straight!") based on the
resulting group ordering; `STATIC_NOTES` adds unconditional tips.

Result: 27 optimal entries, 14 simple entries, ~50 ms first call, 0 ms cached.

### Bonus Poker and Double Double Bonus strategy

Bonus Poker reuses `STRATEGY_CATEGORIES` — its hold shapes are identical to
Jacks or Better, only the quad payouts differ — so sorting the same categories
under Bonus Poker payouts *derives* its strategy and adapts to any BP pay
table. The derived order matches the published 8/5 list. Because those
categories already carry `simpleGroup` letters, Bonus Poker gets the merged
14-line simple card from the same code path; `generateFamilyStrategy` is the
shared entry point and `generateStrategy` is now a thin Jacks or Better wrapper
around it. Neither Deuces Wild nor Double Double Bonus has a simple card —
see below.

Double Double Bonus needs `DDB_STRATEGY_CATEGORIES`: two pair pays 1 instead of
2 and quad aces with a low kicker pay 400, so aces split out of the generic
pair and trips lines and the high pairs separate by rank. It renders in
published order rather than EV-sorted, because the published sequence puts
"pair of Kings" between the JQK and TJQ royal draws — a pair of Jacks or Queens
overlaps the royal draw itself, a penalty-card interaction representative hands
cannot see, and one a player reading top-down would act on. Computed EVs sit
alongside, so some rows show a lower EV above a higher one; that is the
published order, not a sorting bug.

The EV sort does independently reproduce both signature DDB inversions: three
aces above a full house, and a pair of aces above two pair.

### Multi-line and risk of ruin

On an n-play machine one hand is dealt, the hold is copied to every line, and
each line draws from its own deck. Given the hold the lines are independent, so
the shared hold is the only thing correlating them:

    Var(mean of n lines) = Var(X)/n + (n-1)/n * VarBetween

`VarBetween` is the variance of the chosen hold's expected value across dealt
hands, and it is the floor — no number of lines goes below it. Plain sampling
estimates it badly: a dealt royal is worth 800 and contributes about 1.0 on its
own, but appears once in 650,000 hands. `tools/variance-multiline.js` therefore
enumerates the rare dealt classes exhaustively and rejection-samples only the
common ones. **The check that catches a broken estimate is the mean hold EV: it
must come out at or below the game's optimal return.** A value above it means
the sampling is biased, not that the strategy is good.

Variance per unit *wagered* falls with more lines, but an n-play hand wagers n
times as much, so dollar swing per hand still rises — unless the stake is held
constant and the denomination dropped to match, which is how a player actually
compares them. That is what the spread table does: every row wagers the same
amount per hand, so coin-in, time and expected cost are identical and only
variance and payout size move.

Handpay exposure under multi-line has two mechanisms, partitioned in
`w2gLines` so nothing is double-counted. A single line can reach the threshold
by itself, which scales with the line count and uses final-hand frequencies.
Or the held cards already pay, in which case they land on every line at once
and the aggregate reaches the threshold even when no single line comes close —
that one uses `dealt` probabilities and covers only hands that don't already
qualify alone.

The consequence is not monotonic, which is the point of showing it. At a
constant $25 a hand on 9/6 against the $2,000 threshold: one line of $5 is a
handpay every 40,323 hands, ten lines of 50c is every 4,032 — ten times worse,
because a royal pays exactly $2,000 on any one line and there are ten shots at
it — and fifty or a hundred lines is every 649,740, because no single line can
reach $2,000 at all and only a dealt royal replicating across every line does.

Note the knife edge at ten lines of 50c: a royal there pays $2,000 exactly, and
the rule is "or more", so it reports. One cent less a line and it would not.

`riskOfRuin` is a first-passage probability over a finite number of hands, not
the textbook infinite-horizon figure — at a house edge that one is always 1,
which says nothing. It answers "will the bankroll touch zero at any point
before the session ends", which is strictly worse than "will it finish down".

### Why only two games have a simple card

The simple card is a merge of adjacent categories via `simpleGroup`, and those
letters encode the canonical published simple ordering. Jacks or Better and
Bonus Poker share one category set, so one set of letters serves both.

There is no published simple strategy for 8/5 Bonus Poker, 9/6 Double Double
Bonus, or NSUD Deuces — published cards only tier simple/intermediate/optimal
for 9/6 Jacks or Better and full-pay Deuces. Authoring `simpleGroup` letters
for the other two would mean inventing the merge, and merging is only safe for
categories a hand cannot match simultaneously. Double Double Bonus is the worst
case: its ace and kicker splits are the whole game, so merging them is exactly
where the cost lands. **EV spread inside a group is the wrong safety metric.** Group A spans 25 to
800 and is perfectly safe: its members are mutually exclusive, so no hand ever
has to choose between them. The risk is narrower — a merge only costs anything
when two members can occur in the *same* hand and the label names the weaker
one first. Validate a new merge that way: for each group, find a hand matching
two members and check the label leads with the better hold.

Merge labels are therefore ordered at render time by each component's best
member EV (`mergeLabelParts`), not written in a fixed order, so they stay
correct when the pay table changes the ranking.

`tools/verify-strategy.js` closes this: it makes the card executable, one
predicate per printed line, then for each dealt hand takes the first matching
line, prices its hold exactly, and compares against the best of all 32 holds.
The mean gap is the card's real cost. Roughly 61 ms per hand, so a few thousand
hands is a several-minute run; the seed is fixed (override with `SEED=`) so two
readings can be compared on identical hands.

Measured cost of the simple card, 3–4k hands per cell:

| pay table | flush pays | line 11 tight | line 11 loose |
|---|---|---|---|
| JoB 9/6 | 6 | 0.081% / 0.069% | **0.049%** |
| JoB 8/5 | 5 | **0.053%** | 0.075% |
| Bonus Poker 8/5 | 5 | **0.047% / 0.048%** | 0.074% / 0.075% |

Two things fall out. The long-quoted "~0.08%" is about right for 9/6 read
strictly, but the true figure is 0.05–0.08% depending on variant and reading.
And how loosely you read "3 to a Straight Flush" *flips with the flush payout*:
where a flush pays 6, holding any three suited cards that could still complete a
straight flush beats restricting to one-gap draws; where a flush pays 5 it is
the other way round. The category set has no line at all for a two-gap draw, so
those hands currently fall through to a single high card or to discarding.

Both tools seed a small LCG. It must use `Math.imul`: a plain
`seed * 1103515245` overflows double precision, and masking the low 31 bits
then keeps exactly the corrupted ones. That generator repeated after about
16,000 distinct values and skewed the deciles, which quietly invalidated a
first round of measurements here.

Before changing strategy content on a result like this, replicate it on a
second seed — the comparison is paired on identical hands, so the direction is
trustworthy well before the absolute number settles.

### Deuces Wild strategy

Structurally different and deliberately so. Strategy is grouped by how many
deuces are held — a two-deuce hand can never match a no-deuce line — so
`generateDeucesStrategy` returns five independent sections instead of one list.
Lines stay in the published order rather than being EV-sorted,
because the published categories overlap on purpose ("3 of a kind through
straight flush" spans 1.888 to 10, straddling "4 to a straight flush" at
1.638–1.915). Sorting single representative hands by EV cannot reproduce that,
and pretending otherwise would silently reorder a correct strategy.

Computed EVs sit beside each line. All 38 were checked against the published
ranges; ~290 ms first call, cached thereafter.

### Promo pipeline

`JOB_FREQUENCIES` holds per-hand probabilities under optimal play. Dotted with
a variant's max-bet payouts it reproduces every published JoB return to within
0.005%, and the same table yields variance (19.54, matching the published
19.51). That makes return, variance, bankroll, royal odds, and handpay rates
all fall out of one nine-element array — no simulation.

W-2G analysis needs only the pay table: a hand triggers when
`perCoin × coins × denom >= threshold`. The bet ceiling is the highest
denomination whose handpay rate stays under 1-in-2000 hands — judged per hand
rather than per promo so the answer doesn't move when the promo length does,
and judged through `w2gLines` so it accounts for the line count. That matters:
at 100-play the held cards pay on every line at once, so the ceiling falls from
$10 a coin to 25c, broken by a full house replicating to $2,250 rather than by
quads.

## Domain vocabulary

- **9/6, 9/5, 8/6, 8/5** — Full House / Flush per-coin payouts. Those two values
  are the only difference between Jacks or Better variants.
- **Max bet** — 5 coins. Royal Flush pays 250/coin normally but 800/coin (4000
  total) at max bet; that bonus is the whole reason to always play max coins.
  Expected returns assume optimal play at max coins.
- **Hold / draw** — the cards kept vs. replaced. A `holdMask` marks which of the
  five representative cards are held.
- **Pat hand** — a dealt hand already paying; draw count 0.
- **Penalty card** — a discarded card that would have improved another hold.
  Deliberately ignored here (see design decisions).
- **Tier** — display grouping for color (`pat`, `made`, …), not a strategy concept.

## Gotchas around the analyzer

Analysing a hand is ~100 ms in Node and several hundred on a phone, because a
full five-card draw enumerates 1,533,939 outcomes. The UI paints a working
state and defers the arithmetic by a tick; do not make it synchronous on input.

## Gotchas

- `job/js/data.js` mixes `const` (top-level tables) and `var` (helpers). It is
  loaded as a classic script, so those `const`s are still page globals — but
  they will NOT leak out of an `eval()`. Use `new Function(src + '; return {...}')`
  when driving the engine from Node (see Commands).

- Strategy results are cached by payout key. Editing payouts at runtime without
  changing the key returns stale results.

- Changing `STRATEGY_CATEGORIES` order does not affect the optimal list (it
  sorts by EV) but does affect the simple list (definition order wins).

- Bonus Poker and Double Double Bonus are validated against the Jacks or Better
  evaluator: every one of the 2,598,960 dealt hands must collapse back onto the
  same JoB category, and the quad splits must match combinatorics (4 aces = 48,
  4 2s-4s = 144, 4 5s-Ks = 432; DDB kickers 12/36/36/108). Run
  `scratch/bp-verify.js`-style checks before touching `classifyBonus`.

- `classifyBonus` finds the quad rank and the kicker in one pass, but the
  kicker can appear before the quad in rank order, so it sweeps again when the
  kicker is still unset. Removing that second sweep silently misgrades every
  DDB hand whose kicker outranks nothing — quad aces with a low kicker pay 400
  against 160, so the error is worth 240 coins a hand.

- The Deuces Wild evaluator checks hands in *payout* order, not poker order, so
  a hand readable two ways takes the better reading (three wilds plus two suited
  royal cards is a wild royal at 25, not five of a kind at 16). It is validated
  three ways: 18 spot checks, exhaustive classification of all C(52,5) dealt
  hands summing correctly, and independent combinatorial counts (4 deuces = 48,
  natural royals = 4, five of a kind = 624, wild royals = 480).

- Four deuces plus a fifth card is five of a kind, but pays as Four Deuces (200
  vs 16), so the evaluator classifies those 48 hands there. Combinatorial checks
  must exclude them or they look 48 short.

- Representative hands discard neutral cards, so every computed EV is the
  no-penalty case — the top of the published range. Discarding one suited
  penalty card reproduces the published minimum exactly (verified: 3-to-a-royal
  ace-high lands on 1.060130). If a computed EV sits just above a published
  range, suspect the representative hand, not the engine.

- `computeHoldEV` takes the evaluator as a parameter. Don't reintroduce a
  module-level `evaluateHand` alias — it shadowed the parameter and silently
  scored every wild-card hand with Jacks or Better rules.

- Royal Flush EV must use the 800/coin max-bet value (`ROYAL_FLUSH_5COIN_PER`),
  not the 250/coin base — this was a real bug, fixed in c14b6fa.

- Payout schedules on vpfree2 run low hand to high with the royal last, and the
  royal figure is already the max-bet 800. `FAMILIES` in the scraper maps
  schedule length to hand names; an unrecognized length still parses and the
  script says so, it just shows "Tier N" instead of hand names.

- The scraper reads hand-maintained HTML with no markup contract. It prints
  every game it found — check that against the site after a refresh rather than
  trusting it silently. It is also strictly more reliable than asking a model to
  summarize the page: summaries conflated denominations across machine banks.

- The W-2G threshold is user-editable and it moves: $1,200 for decades, $2,000
  from 2026 and indexed for inflation after. `W2G_THRESHOLD` in data.js is only
  the default; never read it directly in analysis code, take the parameter.
  The change is not cosmetic — at $5 denomination it drops the straight flush
  below the line and takes single-line handpays from 1 in 7,457 to 1 in 40,323,
  and it lifts the bet ceiling from $5 to $10.

- Comparisons are ">= threshold": a hand paying the threshold exactly reports.

- **A game spans multiple machine banks.** vpfree2 lists a game once, then
  repeats a group of cells per bank — denominations, play count, manufacturer,
  location, machine count — with no delimiter other than a new denomination
  cell starting each group. Eldorado's 9/6 JoB has four banks; Peppermill's has
  twenty-three. An early version of the parser read only the first bank and
  concluded Eldorado topped out at 50¢ when it goes to $25. `parseBanks` walks
  to the next return-percentage marker and splits on `isDenomCell`.

- Truncate the token stream at `FOOTER` before parsing. Site chrome follows
  the last game block, and the location heuristic picks the longest prose cell
  — so without the cut, the final game renders "All rights Reserved © 2026
  vpFREE2" as a machine location.

- `isDenomCell` exists because locations contain dollar figures too — "near
  4th/Virginia entrance ($10 per point)" is prose, not a denomination cell. The
  test is whether anything survives stripping denominations and separators.

- Earn rates are per bank, not per property: the same 9/6 JoB at Eldorado is
  $20/point in the high limit room and $10/point near the 4th/Virginia
  entrance. `perPoint` null means the listing didn't state a rate, which in
  practice means the standard rate — the UI labels that "(assumed)".

- Prefer the scraper over asking a model to summarize the page, but verify
  both. A summarizer once conflated denominations across banks; the scraper
  later dropped banks entirely. Each caught the other's error only because the
  output was checked against the rendered page.

## Data sources

Pay table payouts and expected return percentages are standard values from video poker literature. Strategy ordering is computed from the pay tables, then checked hand by hand against exact hold expectations with `tools/audit-categories.js`.

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
