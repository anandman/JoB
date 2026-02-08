# AI.md — Project context for AI sessions

## Project: Jacks or Betterment

Video poker strategy and odds web app. Static site (HTML/CSS/JS, no framework, no build step). Designed for GitHub Pages hosting.

## Current state (Phase 1.5 complete)

- Jacks or Better only, 4 variants: 9/6, 9/5, 8/6, 8/5
- Two tabs: Pay Tables and Strategy
- Pay table selector with per-coin payouts and expected returns
- Side-by-side variant comparison table
- **Dynamic strategy computation from pay tables** — strategies are computed, not hardcoded
- Simple (~14 entry) and Optimal (~27 entry) strategy modes via toggle
- Strategy updates when variant selector changes
- Mobile-first dark theme

## Architecture

```
index.html              — single page, two tabs (nav switches via data-tab attributes)
css/style.css           — mobile-first, dark theme, CSS custom properties
js/data.js              — HAND_NAMES, PAY_TABLES, STRATEGY_CATEGORIES, NOTE_RULES, STATIC_NOTES
js/poker.js             — card representation (0-51 integers) + hand evaluator
js/strategy-engine.js   — EV calculator (exhaustive draw enumeration) + strategy generator
js/app.js               — IIFE with tab nav, pay table rendering, strategy rendering, toggle
```

### Strategy computation pipeline

1. **`STRATEGY_CATEGORIES`** (data.js) — ~27 hold categories, each with a representative 5-card hand, holdMask (which cards to hold), tier (color), and simpleGroup (merge key A-N)
2. **`Poker.evaluateHand()`** (poker.js) — returns hand type index 0-8 or -1 (nothing). All integer math, no allocation in hot path
3. **`StrategyEngine.computeHoldEV()`** (strategy-engine.js) — for given held cards + remaining deck + payouts, exhaustively enumerates all draw combinations and averages the payout. Unrolled nested loops by draw count (0-5)
4. **`StrategyEngine.generateStrategy()`** (strategy-engine.js) — computes EV for each category, sorts for optimal strategy, groups by simpleGroup for simple strategy. Results cached by payout key
5. **Note rules** (data.js) — conditional annotations like "Break FH, Flush, or Straight!" applied to simple strategy based on group ordering
6. **Static notes** (data.js) — unconditional tips like "Lowest 2 if 3+."

### Key design decisions

- **Representative hands, not brute-force all 2.6M deals.** Each category uses one representative hand. EV is exact for that hand (exhaustive draw enumeration) but ignores penalty card effects. Same simplification as published strategies.
- **Expected returns stay hardcoded** for the 4 known variants. Computing exact total returns requires evaluating all 2.6M deals × 32 holds each — too slow for browser. Phase 2 will add approximate computation for custom tables.
- **Simple strategy uses definition order** (simpleGroup A-N), not EV sort. The letter codes encode the canonical ~14-line ordering that matches published simple strategies. The optimal strategy sorts by computed EV.
- **~60ms computation** on desktop (first call), 0ms thereafter (cached). Should be <500ms on mobile.

## Roadmap (owner's priorities, in rough order)

### Phase 2: Custom pay tables + more games
- Allow users to enter custom pay tables and see computed strategy
- Approximate expected return computation for custom tables (sampling-based)
- Add more video poker variants (Deuces Wild, Bonus Poker, Double Bonus, etc.)
- Each game needs: pay table data, expected returns, and strategy categories

### Phase 3: Casino machine database
- Database of video poker machines by casino (similar to vpfree2.com)
- Location-based: which casinos have which pay tables
- Could start as a static JSON dataset, potentially move to a backend later

### Phase 4: Play simulator / trainer
- Interactive video poker simulator for learning
- Deal 5 cards, player selects holds, draw replacements
- Show whether the player's hold matches optimal strategy
- Track stats: hands played, accuracy, return achieved
- poker.js hand evaluator is already available; needs full optimal hold analysis (compare all 32 hold options per hand)

## Design decisions

- **No frameworks.** Keep it vanilla JS for simplicity and zero build step. This is a reference app, not a complex SPA. Reconsider if Phase 4 complexity warrants it.
- **Mobile-first.** Primary use case is checking strategy at a casino on your phone. Everything should work at 320px wide.
- **Dark theme.** Casino floors are dark. A bright screen is annoying.
- **Strategy fits one screen.** The simple 14-line strategy card should be visible without scrolling on a phone. Optimal strategy (~27 lines) scrolls.

## Style notes

- The "9/6" naming convention refers to Full House / Flush payouts (the only values that differ between variants)
- Royal Flush pays 250/coin normally but 800/coin (4000 total) at max bet (5 coins) — this bonus is why you always play max bet
- Expected returns assume optimal strategy and max-coin play
- Card encoding: rank * 4 + suit (rank: 0=2..12=A; suit: 0-3)
