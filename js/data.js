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
 * Strategy list — ordered by priority (highest first).
 * Each entry: { hold, note? }
 * "note" is an optional short clarification.
 */
const STRATEGY = [
  { hold: "Royal Flush" },
  { hold: "Straight Flush" },
  { hold: "4 of a Kind" },
  { hold: "4 to a Royal Flush", note: "Break a Full House, Flush, or Straight for this." },
  { hold: "Full House" },
  { hold: "Flush" },
  { hold: "3 of a Kind" },
  { hold: "Straight" },
  { hold: "4 to a Straight Flush", note: "Break a Straight for this." },
  { hold: "Two Pair" },
  { hold: "High Pair (J\u2013A)" },
  { hold: "3 to a Royal Flush", note: "Hold over 4 to a Flush." },
  { hold: "4 to a Flush" },
  { hold: "Low Pair (2\u201310)" },
  { hold: "4 to an Outside Straight" },
  { hold: "2 Suited High Cards" },
  { hold: "3 to a Straight Flush" },
  { hold: "2 Unsuited High Cards", note: "If 3+, keep the lowest 2." },
  { hold: "Suited 10 + High Card", note: "10-J, 10-Q, or 10-K suited." },
  { hold: "1 High Card" },
  { hold: "Draw 5 New Cards", note: "Nothing worth holding." },
];
