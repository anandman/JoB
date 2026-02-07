# CLAUDE.md — Project context for AI sessions

## Project: Jacks or Betterment

Video poker strategy and odds web app. Static site (HTML/CSS/JS, no framework, no build step). Designed for GitHub Pages hosting.

## Current state (MVP)

- Jacks or Better only, 4 variants: 9/6, 9/5, 8/6, 8/5
- Two tabs: Pay Tables and Strategy
- Pay table selector with per-coin payouts and expected returns
- Side-by-side variant comparison table
- Compressed 14-line simplified strategy card (fits one mobile screen)
- Mobile-first dark theme

## Architecture

```
index.html       — single page, two tabs (nav switches via data-tab attributes)
css/style.css    — mobile-first, dark theme, CSS custom properties
js/data.js       — all data: HAND_NAMES, PAY_TABLES, STRATEGY arrays/objects
js/app.js        — IIFE with tab nav, pay table rendering, strategy rendering
```

**Data is separated from UI.** Pay tables and strategy are defined as plain JS objects/arrays in `data.js`. The rendering in `app.js` is generic — it iterates over whatever data is there. This makes it straightforward to add new games or variants.

## Roadmap (owner's priorities, in rough order)

### Phase 2: More games & custom pay tables
- Add more video poker variants (Deuces Wild, Bonus Poker, Double Bonus, etc.)
- Each game needs: pay table data, expected returns, and a simplified strategy
- Allow users to enter custom pay tables and see the expected return
- May need a basic EV calculator or lookup table for custom pay tables

### Phase 3: Casino machine database
- Database of video poker machines by casino (similar to vpfree2.com)
- Location-based: which casinos have which pay tables
- Could start as a static JSON dataset, potentially move to a backend later

### Phase 4: Play simulator / trainer
- Interactive video poker simulator for learning
- Deal 5 cards, player selects holds, draw replacements
- Show whether the player's hold matches optimal strategy
- Track stats: hands played, accuracy, return achieved
- Needs a full 52-card deck, hand evaluation logic, and optimal strategy engine
- The optimal strategy engine is significantly more complex than the simplified strategy — it involves comparing expected values of all possible hold combinations (2^5 = 32 options per hand)

## Design decisions

- **No frameworks.** Keep it vanilla JS for simplicity and zero build step. This is a reference app, not a complex SPA. Reconsider if Phase 4 complexity warrants it.
- **Mobile-first.** Primary use case is checking strategy at a casino on your phone. Everything should work at 320px wide.
- **Dark theme.** Casino floors are dark. A bright screen is annoying.
- **Strategy fits one screen.** The compressed 14-line strategy card should be visible without scrolling on a phone. The definitions section is collapsible below it.

## Style notes

- The "9/6" naming convention refers to Full House / Flush payouts (the only values that differ between variants)
- Royal Flush pays 250/coin normally but 800/coin (4000 total) at max bet (5 coins) — this bonus is why you always play max bet
- Expected returns assume optimal strategy and max-coin play
