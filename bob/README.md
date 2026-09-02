# Bettor or Bust

Blackjack, computed for the table you are actually sitting at.

Live at **https://anandman.github.io/bettor/bob/**

Every number here comes from one dealer probability engine. The basic strategy
chart is that engine's output collapsed to its best action; the hand analyzer
is the same numbers unsummarised; play mode scores a decision by the gap
between what you did and what was best. Nothing is looked up, so changing the
rules changes the answers rather than the disclaimer.

## Running it

Open `index.html` in a browser. That is it — no build step, no dependencies,
no server. Nothing is fetched at runtime, so the filesystem works as well as
anything else.

## What it does

Five tabs.

**Rules** — decks, S17 or H17, DAS, doubling and resplitting limits, surrender,
and the blackjack payout. Six presets for the games you actually meet. The
house edge moves as you change them, which is the point: a 6:5 payout costs
more than every other rule on the screen put together.

**Strategy** — the chart for exactly those rules. Verified against the
published six-deck S17 DAS chart on all 340 cells.

**Analyze** — every action for a hand priced and ranked, with the dealer's
outcome distribution behind it. The gap between the best action and the second
is what the mistake costs, exactly.

**Risk** — what a betting strategy is worth. Flat, positive progression,
Martingale, d'Alembert, Paroli and card counting, simulated against a real
depleting shoe rather than an assumed edge.

**Count** — a counting trainer for three systems, and the index plays for your
table.

## The engine

`dealerVector(up, counts, rules)` gives the dealer's outcome distribution from
any composition, memoised on the hand state and what is left. Everything else
is built on it: `evStand`, `evHit`, `evDouble`, `evSplit`, and `actions()`
which ranks them.

Two things it gets right that are easy to get wrong.

**The peek.** In a peek game a dealer blackjack is resolved before you act, so
it is taken out of the dealer distribution and its probability renormalised
rather than folded in. The player loses one unit to it — pushing with their
own blackjack — and every other branch is conditioned on the dealer not
having it.

**Resplitting counts hands, not splits.** `resplitTo` is a limit on hands, so
the budget handed to the recursion is one less than the limit: the first split
already spent one. Getting this wrong prices a hand the table will not deal.

The shoe can be modelled two ways. Non-depleting is 125× faster and produces
an identical chart, because removing three cards from six decks does not move
a decision. Depleting is what the analyzer and the index plays use, since a
count is precisely a claim that the composition has moved.

## Card encoding

Rank index 0 = ace, 1..8 = two through nine, 9 = any ten-value card. **The
indices are off by one from the printed values**, which is a standing trap;
`BJEngine.rankOf(value)` exists so no caller has to remember it.

## Betting strategies

The risk tab simulates each strategy against a real shoe and reports the
median, the spread, and how often the bankroll is lost.

The result worth knowing is that **no progression reduces risk of ruin at a
matched average bet.** Expected loss is linear in what you wager; variance is
quadratic — the sum of the squares of the bets — and is smallest when every
bet is the same size. Ruin follows variance. A progression can only trade one
for the other, and pressing after losses trades it the wrong way: d'Alembert
ruins about half of $500 bankrolls against about a sixth for flat betting,
because it puts the most money out exactly when the bankroll is lowest.

What a positive progression does do is capture upside — a longer right tail
for the same average bet. That is a real thing to want. It is not a reduction
in risk.

## Counting

Three systems, ranked by betting correlation derived from each rank's effect
of removal rather than quoted: Red 7 (0.979), KO (0.972), Hi-Lo (0.964). The
simple level-one systems win for betting; the level-two systems are tuned for
playing deviations, which is a different job.

Counting's value is measured, not assumed. The simulation deals a real
depleting shoe, so the outcomes already carry the count's effect — nothing
estimates an edge from the composition. Measured against this engine, the
relationship is about `edge = −0.343% + 0.576 × true count`.

The simulation plays fixed basic strategy at every count, which is what a
betting-only counter does. That is deliberate: it answers what varying the bet
alone is worth, and folding deviations in would make it answer two questions
at once and neither clearly.

## Index plays

A shoe with a count on it is not average, and at some point the second-best
action becomes the best one. The count at which that happens is the index.

These are derived rather than looked up. A count is a claim about what is
left, so the shoe it implies is built by dealing cards out of a fresh one —
proportionally, then leaning the requested number of extra low cards out,
since removing a low card is worth +1 to the running count and a high card −1.
Then every cell of the chart is priced across the range and the search looks
for where the answer changes.

Three details matter.

**Whole cards.** A rank holding 14.4 cards never runs out, so the engine can
never prune that branch. Fractional shoes were arithmetically fine and ten
times slower.

**A cell can change its mind twice.** Sixteen against a ten hits at a very
negative count, surrenders through the middle, and would stand at a high one.
Comparing only the ends of the range reports one crossing where there are two,
and names the wrong pair of actions for it.

**The search is on the running count**, not the true count, because a shoe
holds a whole number of extra low cards. Bisecting the true count spends most
of its steps re-evaluating shoes it has already seen.

Because they follow your rules, they will differ from any set you have
memorised — a double deck H17 game genuinely has different numbers from a six
deck S17 one. They also differ from each other: published sets disagree by a
point or more because they assume different penetration and different rules.
Checked against the numbers in general circulation at the rules those numbers
assume, 15 of 17 land within 1.5 and several are exact, with insurance at
+3.2 against the +3 everyone quotes.

## Checks

From the repository root:

```sh
node tools/verify-blackjack.js     # the engine, the chart, and a 2M-hand simulation
node tools/verify-indices.js       # the shoe a count implies, and the indices
```

`verify-blackjack.js` checks the chart cell by cell against the published
six-deck S17 DAS chart, the house edge against its accepted value, and the
computed edge against two million simulated hands.

## Project structure

```
js/rules.js      The rule set, its key, and six presets.
js/engine.js     Dealer distribution and the EV of every action.
js/strategy.js   The chart, and the house edge over every opening deal.
js/analyzer.js   One hand, every action, ranked.
js/game.js       Play mode, scored against the engine rather than a card.
js/risk.js       Betting strategies and counting, by simulation.
js/indices.js    Index plays, derived from the engine.
js/app.js        Five tabs. One IIFE, no exports.
```

## License

MIT. See [LICENSE](../LICENSE).
