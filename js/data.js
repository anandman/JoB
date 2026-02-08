/**
 * Jacks or Betterment — Data layer
 * Pay tables, expected returns, and strategy categories for Jacks or Better video poker.
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
 * Strategy categories — ~30 entries for optimal strategy.
 * Each has representative 5-card hand, holdMask, display info, and simpleGroup for merging.
 *
 * Card encoding: rank * 4 + suit (rank: 0=2..12=A; suit: 0=c,1=d,2=h,3=s)
 * Helper: mc(rank, suit) = rank * 4 + suit
 */
var _mc = function (r, s) { return (r << 2) | s; };

const STRATEGY_CATEGORIES = [
  // --- Pat winners (simpleGroup A) ---
  {
    id: "pat_royal",
    hold: "Pat Royal Flush",
    cards: [_mc(8, 0), _mc(9, 0), _mc(10, 0), _mc(11, 0), _mc(12, 0)], // 10c Jc Qc Kc Ac
    holdMask: [0, 1, 2, 3, 4],
    tier: "pat",
    simpleGroup: "A",
  },
  {
    id: "pat_straight_flush",
    hold: "Pat Straight Flush",
    cards: [_mc(4, 2), _mc(5, 2), _mc(6, 2), _mc(7, 2), _mc(8, 2)], // 6h 7h 8h 9h 10h
    holdMask: [0, 1, 2, 3, 4],
    tier: "pat",
    simpleGroup: "A",
  },
  {
    id: "pat_four_kind",
    hold: "Pat 4 of a Kind",
    cards: [_mc(6, 0), _mc(6, 1), _mc(6, 2), _mc(6, 3), _mc(3, 1)], // 8c 8d 8h 8s 5d
    holdMask: [0, 1, 2, 3, 4],
    tier: "pat",
    simpleGroup: "A",
  },

  // --- 4 to a Royal Flush (simpleGroup B) ---
  {
    id: "4_to_royal",
    hold: "4 to a Royal Flush",
    cards: [_mc(8, 0), _mc(9, 0), _mc(10, 0), _mc(12, 0), _mc(3, 2)], // 10c Jc Qc Ac 5h
    holdMask: [0, 1, 2, 3],
    tier: "made",
    simpleGroup: "B",
  },

  // --- Pat Full House / Flush / Straight / 3 of a Kind ---
  {
    id: "pat_full_house",
    hold: "Pat Full House",
    cards: [_mc(9, 0), _mc(9, 1), _mc(9, 2), _mc(4, 0), _mc(4, 1)], // Jc Jd Jh 6c 6d
    holdMask: [0, 1, 2, 3, 4],
    tier: "made",
    simpleGroup: "C",
  },
  {
    id: "pat_flush",
    hold: "Pat Flush",
    cards: [_mc(1, 3), _mc(4, 3), _mc(6, 3), _mc(9, 3), _mc(12, 3)], // 3s 6s 8s Js As
    holdMask: [0, 1, 2, 3, 4],
    tier: "made",
    simpleGroup: "C",
  },
  {
    id: "pat_three_kind",
    hold: "Pat 3 of a Kind",
    cards: [_mc(5, 0), _mc(5, 1), _mc(5, 2), _mc(1, 3), _mc(10, 1)], // 7c 7d 7h 3s Qd
    holdMask: [0, 1, 2],
    tier: "made",
    simpleGroup: "C",
  },

  // --- Pat Straight (simpleGroup D) ---
  {
    id: "pat_straight",
    hold: "Pat Straight",
    cards: [_mc(4, 0), _mc(5, 1), _mc(6, 2), _mc(7, 3), _mc(8, 0)], // 6c 7d 8h 9s 10c
    holdMask: [0, 1, 2, 3, 4],
    tier: "made",
    simpleGroup: "D",
  },

  // --- 4 to a Straight Flush (simpleGroup E) ---
  {
    id: "4_sf_open",
    hold: "4 to a Straight Flush (open)",
    cards: [_mc(4, 2), _mc(5, 2), _mc(6, 2), _mc(7, 2), _mc(11, 0)], // 6h 7h 8h 9h Kc
    holdMask: [0, 1, 2, 3],
    tier: "made",
    simpleGroup: "E",
  },
  {
    id: "4_sf_inside",
    hold: "4 to a Straight Flush (inside)",
    cards: [_mc(4, 2), _mc(5, 2), _mc(6, 2), _mc(8, 2), _mc(11, 0)], // 6h 7h 8h 10h Kc
    holdMask: [0, 1, 2, 3],
    tier: "made",
    simpleGroup: "E",
  },

  // --- Two Pair / High Pair (simpleGroup F) ---
  {
    id: "two_pair",
    hold: "Two Pair",
    cards: [_mc(5, 0), _mc(5, 1), _mc(9, 2), _mc(9, 3), _mc(2, 0)], // 7c 7d Jh Js 4c
    holdMask: [0, 1, 2, 3],
    tier: "made",
    simpleGroup: "F",
  },
  {
    id: "high_pair",
    hold: "High Pair (J\u2013A)",
    cards: [_mc(10, 0), _mc(10, 1), _mc(3, 2), _mc(6, 3), _mc(1, 0)], // Qc Qd 5h 8s 3c
    holdMask: [0, 1],
    tier: "made",
    simpleGroup: "F",
  },

  // --- 3 to a Royal Flush (simpleGroup G) ---
  {
    id: "3_to_royal",
    hold: "3 to a Royal Flush",
    cards: [_mc(9, 0), _mc(10, 0), _mc(12, 0), _mc(3, 2), _mc(1, 3)], // Jc Qc Ac 5h 3s
    holdMask: [0, 1, 2],
    tier: "draw",
    simpleGroup: "G",
  },

  // --- 4 to a Flush (simpleGroup H) ---
  {
    id: "4_to_flush",
    hold: "4 to a Flush",
    cards: [_mc(1, 2), _mc(4, 2), _mc(6, 2), _mc(9, 2), _mc(3, 0)], // 3h 6h 8h Jh 5c
    holdMask: [0, 1, 2, 3],
    tier: "draw",
    simpleGroup: "H",
  },

  // --- Low Pair (simpleGroup I) ---
  {
    id: "low_pair",
    hold: "Low Pair (2\u201310)",
    cards: [_mc(5, 0), _mc(5, 1), _mc(2, 2), _mc(8, 3), _mc(11, 0)], // 7c 7d 4h 10s Kc
    holdMask: [0, 1],
    tier: "draw",
    simpleGroup: "I",
  },

  // --- 4 to an Outside Straight (simpleGroup J) ---
  {
    id: "4_outside_str",
    hold: "4 to an Outside Straight",
    cards: [_mc(5, 0), _mc(6, 1), _mc(7, 2), _mc(8, 3), _mc(1, 0)], // 7c 8d 9h 10s 3c
    holdMask: [0, 1, 2, 3],
    tier: "draw",
    simpleGroup: "J",
  },

  // --- 3 to a Straight Flush / 2 Suited High Cards (simpleGroup K) ---
  {
    id: "3_sf_open",
    hold: "3 to a Straight Flush (open)",
    cards: [_mc(4, 2), _mc(5, 2), _mc(6, 2), _mc(11, 0), _mc(0, 1)], // 6h 7h 8h Kc 2d
    holdMask: [0, 1, 2],
    tier: "spec",
    simpleGroup: "K",
  },
  {
    id: "3_sf_inside_1hc",
    hold: "3 to a Straight Flush (1 high card)",
    cards: [_mc(7, 2), _mc(9, 2), _mc(10, 2), _mc(0, 0), _mc(3, 1)], // 9h Jh Qh 2c 5d
    holdMask: [0, 1, 2],
    tier: "spec",
    simpleGroup: "K",
  },
  {
    id: "2_suited_high",
    hold: "2 Suited High Cards",
    cards: [_mc(10, 0), _mc(11, 0), _mc(3, 2), _mc(1, 3), _mc(6, 1)], // Qc Kc 5h 3s 8d
    holdMask: [0, 1],
    tier: "spec",
    simpleGroup: "K",
  },
  {
    id: "3_sf_inside_0hc",
    hold: "3 to a Straight Flush (no high cards)",
    cards: [_mc(3, 2), _mc(4, 2), _mc(6, 2), _mc(11, 0), _mc(0, 1)], // 5h 6h 8h Kc 2d
    holdMask: [0, 1, 2],
    tier: "spec",
    simpleGroup: "K",
  },

  // --- Unsuited High Cards / Inside Straights (simpleGroup L) ---
  {
    id: "4_inside_str_3hc",
    hold: "4 to an Inside Straight (3 high cards)",
    cards: [_mc(9, 0), _mc(10, 1), _mc(11, 2), _mc(12, 3), _mc(3, 0)], // Jc Qd Kh As 5c
    holdMask: [0, 1, 2, 3],
    tier: "spec",
    simpleGroup: "L",
  },
  {
    id: "2_unsuited_high",
    hold: "2 Unsuited High Cards",
    cards: [_mc(10, 0), _mc(11, 1), _mc(3, 2), _mc(1, 3), _mc(6, 0)], // Qc Kd 5h 3s 8c
    holdMask: [0, 1],
    tier: "spec",
    simpleGroup: "L",
  },
  {
    id: "4_inside_str_2hc",
    hold: "4 to an Inside Straight (2 high cards)",
    cards: [_mc(8, 0), _mc(9, 1), _mc(10, 2), _mc(12, 3), _mc(3, 0)], // 10c Jd Qh As 5c
    holdMask: [0, 1, 2, 3],
    tier: "spec",
    simpleGroup: "L",
  },
  {
    id: "4_inside_str_1hc",
    hold: "4 to an Inside Straight (1 high card)",
    cards: [_mc(12, 0), _mc(0, 1), _mc(1, 2), _mc(2, 3), _mc(6, 0)], // Ac 2d 3h 4s 8c — A-low inside
    holdMask: [0, 1, 2, 3],
    tier: "spec",
    simpleGroup: "L",
  },

  // --- Suited 10+High / Single High Card (simpleGroup M) ---
  {
    id: "suited_10_high",
    hold: "Suited 10\u2013J/Q/K",
    cards: [_mc(8, 0), _mc(9, 0), _mc(3, 2), _mc(1, 3), _mc(6, 1)], // 10c Jc 5h 3s 8d
    holdMask: [0, 1],
    tier: "spec",
    simpleGroup: "M",
  },
  {
    id: "single_high",
    hold: "Single High Card",
    cards: [_mc(12, 0), _mc(3, 2), _mc(1, 3), _mc(6, 1), _mc(0, 2)], // Ac 5h 3s 8d 2h
    holdMask: [0],
    tier: "spec",
    simpleGroup: "M",
  },

  // --- Discard Everything (simpleGroup N) ---
  {
    id: "discard_all",
    hold: "Discard Everything",
    cards: [_mc(0, 0), _mc(2, 1), _mc(4, 2), _mc(6, 3), _mc(8, 0)], // 2c 4d 6h 8s 10c
    holdMask: [],
    tier: "spec",
    simpleGroup: "N",
  },
];

/**
 * Note rules — conditional annotations applied after sorting by EV.
 * If the target category appears above all listed "above" categories, apply the note.
 */
const NOTE_RULES = [
  { target: "4_to_royal", above: ["pat_full_house", "pat_flush", "pat_straight"], note: "Break FH, Flush, or Straight!" },
  { target: "3_to_royal", above: ["4_to_flush"], note: "Beats 4 to a Flush." },
  { target: "low_pair", above: ["4_outside_str"], note: "Beats an outside straight draw." },
];

/**
 * Static notes — always applied to specific categories/groups regardless of ordering.
 * These are tips, not EV-dependent.
 */
const STATIC_NOTES = {
  "L": "Lowest 2 if 3+.",
};
