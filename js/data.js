/**
 * Jacks or Betterment — Data layer
 * Pay tables, expected returns, and strategy for Jacks or Better video poker.
 */

const HAND_NAMES = [
  "Royal Flush",
  "Straight Flush",
  "4 of a Kind",
  "Full House",
  "Flush",
  "Straight",
  "3 of a Kind",
  "Two Pair",
  "Jacks or Better",
];

// Per-coin payouts for 1-4 coins. Index matches HAND_NAMES.
// Royal Flush at 5 coins pays 800/coin (4000 total) instead of 250.
const PAY_TABLES = {
  "9-6": {
    label: "9/6 Full Pay",
    payouts: [250, 50, 25, 9, 6, 4, 3, 2, 1],
    expectedReturn: 99.5439,
  },
  "9-5": {
    label: "9/5",
    payouts: [250, 50, 25, 9, 5, 4, 3, 2, 1],
    expectedReturn: 98.4498,
  },
  "8-6": {
    label: "8/6",
    payouts: [250, 50, 25, 8, 6, 4, 3, 2, 1],
    expectedReturn: 98.3927,
  },
  "8-5": {
    label: "8/5",
    payouts: [250, 50, 25, 8, 5, 4, 3, 2, 1],
    expectedReturn: 97.2984,
  },
};

const ROYAL_FLUSH_5COIN_PER = 800; // per-coin payout at max bet

/**
 * Compressed strategy — 14 lines to fit one mobile screen.
 * Adjacent obvious holds are merged; counterintuitive breaks are starred.
 * tier: "pat" | "made" | "draw" | "spec" — controls color coding.
 */
const STRATEGY = [
  { hold: "Pat Royal / Straight Flush / 4 of a Kind", tier: "pat" },
  { hold: "4 to a Royal Flush", note: "Break FH, Flush, or Straight!", tier: "made" },
  { hold: "Pat Full House / Flush / 3 of a Kind", tier: "made" },
  { hold: "Pat Straight", tier: "made" },
  { hold: "4 to a Straight Flush", note: "Break a Straight!", tier: "made" },
  { hold: "Two Pair / High Pair (J\u2013A)", tier: "made" },
  { hold: "3 to a Royal Flush", note: "Beats 4 to a Flush.", tier: "draw" },
  { hold: "4 to a Flush", tier: "draw" },
  { hold: "Low Pair (2\u201310)", note: "Beats an outside straight draw.", tier: "draw" },
  { hold: "4 to an Outside Straight", tier: "draw" },
  { hold: "2 Suited High Cards / 3 to a Straight Flush", tier: "spec" },
  { hold: "2 Unsuited High Cards", note: "Lowest 2 if 3+.", tier: "spec" },
  { hold: "Suited 10-J/Q/K / Single High Card", tier: "spec" },
  { hold: "Discard Everything", tier: "spec" },
];
