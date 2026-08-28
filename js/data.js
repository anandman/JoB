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

/* ============================================================
 * Promo / W-2G / multi-game data
 * ============================================================ */

// IRS reporting threshold for a single slot/video-poker hand payout.
// Long-standing value; verify if you've heard of a change.
const W2G_THRESHOLD = 1200; // default; user-editable in the Promo tab

const MAX_COINS = 5;

/**
 * Hand frequencies for Jacks or Better under optimal play.
 * Index matches HAND_NAMES.
 *
 * Verified: dotted with each variant's max-bet payouts these reproduce the
 * published returns to within 0.01% (9/6 -> 99.548, 9/5 -> 98.447,
 * 8/6 -> 98.397, 8/5 -> 97.296). Strategy shifts between JoB variants are
 * small enough that one frequency table covers the whole family.
 */
const JOB_FREQUENCIES = [
  0.0000248, // Royal Flush
  0.0001093, // Straight Flush
  0.0023630, // 4 of a Kind
  0.0115120, // Full House
  0.0110150, // Flush
  0.0112290, // Straight
  0.0744490, // 3 of a Kind
  0.1292790, // Two Pair
  0.2145850, // Jacks or Better
];

/**
 * Games as flat hand lists, so games with split quad categories (Bonus Poker,
 * Double Double Bonus) fit the same shape as Jacks or Better.
 *
 *   pay    - per-coin payout at 1-4 coins
 *   maxPay - per-coin payout at 5 coins (only the royal differs)
 *   freq   - probability under optimal play; omitted where not verified
 *
 * Games without freq still support exact W-2G threshold analysis (that needs
 * only the pay table); they just can't report how *often* a handpay lands.
 */
function _jobGame(key, label, variantKey, ret) {
  var payouts = PAY_TABLES[variantKey].payouts;
  return {
    key: key,
    name: "Jacks or Better",
    label: label,
    ret: ret,
    hands: HAND_NAMES.map(function (name, i) {
      return {
        name: name,
        pay: payouts[i],
        maxPay: i === 0 ? ROYAL_FLUSH_5COIN_PER : payouts[i],
        freq: JOB_FREQUENCIES[i],
      };
    }),
  };
}

/**
 * Total weighted combinations in a full video poker cycle, the denominator
 * Wizard of Odds normalises its return tables against:
 *   C(52,5) x 5 x C(47,5) = 2,598,960 x 5 x 1,533,939
 * Storing raw combination counts rather than rounded probabilities keeps the
 * data auditable — the counts must sum to exactly this, and the payout dot
 * product must reproduce the published return.
 */
const VP_COMBOS = 19933230517200;

/** Attach freq = combos / VP_COMBOS to each hand that carries a count. */
function _withFreq(hands) {
  return hands.map(function (h) {
    if (h.combos == null) return h;
    var out = {};
    for (var k in h) out[k] = h[k];
    out.freq = h.combos / VP_COMBOS;
    return out;
  });
}

const GAMES = {
  "job-9-6": _jobGame("job-9-6", "9/6 Full Pay", "9-6", 99.5439),
  "job-9-5": _jobGame("job-9-5", "9/5", "9-5", 98.4498),
  "job-8-6": _jobGame("job-8-6", "8/6", "8-6", 98.3927),
  "job-8-5": _jobGame("job-8-5", "8/5", "8-5", 97.2984),

  // Combination counts: Wizard of Odds, verified to sum to VP_COMBOS and to
  // reproduce 99.1660% exactly.
  "bp-8-5": {
    key: "bp-8-5",
    name: "Bonus Poker",
    label: "8/5 Full Pay",
    ret: 99.166,
    hands: _withFreq([
      { name: "Royal Flush", pay: 250, maxPay: 800, combos: 495443136 },
      { name: "Straight Flush", pay: 50, maxPay: 50, combos: 2129604264 },
      { name: "4 Aces", pay: 80, maxPay: 80, combos: 3903775812 },
      { name: "4 2s–4s", pay: 40, maxPay: 40, combos: 10509866328 },
      { name: "4 5s–Ks", pay: 25, maxPay: 25, combos: 32688417336 },
      { name: "Full House", pay: 8, maxPay: 8, combos: 229516869924 },
      { name: "Flush", pay: 5, maxPay: 5, combos: 216873645000 },
      { name: "Straight", pay: 4, maxPay: 4, combos: 223676319912 },
      { name: "3 of a Kind", pay: 3, maxPay: 3, combos: 1484391167856 },
      { name: "Two Pair", pay: 2, maxPay: 2, combos: 2577523603752 },
      { name: "Jacks or Better", pay: 1, maxPay: 1, combos: 4290810981444 },
    ]),
  },

  // Verified to sum to VP_COMBOS and reproduce 98.9808% exactly.
  "ddb-9-6": {
    key: "ddb-9-6",
    name: "Double Double Bonus",
    label: "9/6 Full Pay",
    ret: 98.981,
    hands: _withFreq([
      { name: "Royal Flush", pay: 250, maxPay: 800, combos: 488567700 },
      { name: "Straight Flush", pay: 50, maxPay: 50, combos: 2184917880 },
      { name: "4 Aces + 2/3/4", pay: 400, maxPay: 400, combos: 1227691500 },
      { name: "4 2s–4s + A/2/3/4", pay: 160, maxPay: 160, combos: 2854370052 },
      { name: "4 Aces", pay: 160, maxPay: 160, combos: 3460011120 },
      { name: "4 2s–4s", pay: 80, maxPay: 80, combos: 7662444216 },
      { name: "4 5s–Ks", pay: 50, maxPay: 50, combos: 32494582452 },
      { name: "Full House", pay: 9, maxPay: 9, combos: 216474969996 },
      { name: "Flush", pay: 6, maxPay: 6, combos: 226412247120 },
      { name: "Straight", pay: 4, maxPay: 4, combos: 254472741540 },
      { name: "3 of a Kind", pay: 3, maxPay: 3, combos: 1500277164324 },
      { name: "Two Pair", pay: 1, maxPay: 1, combos: 2453055008724 },
      { name: "Jacks or Better", pay: 1, maxPay: 1, combos: 4212339758244 },
    ]),
  },

  // Verified to sum to VP_COMBOS and reproduce 99.7283% exactly.
  "nsud": {
    key: "nsud",
    name: "Deuces Wild",
    label: "Not So Ugly Deuces",
    ret: 99.728,
    hands: _withFreq([
      { name: "Natural Royal Flush", pay: 250, maxPay: 800, combos: 458696304 },
      { name: "4 Deuces", pay: 200, maxPay: 200, combos: 3721737204 },
      { name: "Wild Royal Flush", pay: 25, maxPay: 25, combos: 38006962464 },
      { name: "5 of a Kind", pay: 16, maxPay: 16, combos: 61961233656 },
      { name: "Straight Flush", pay: 10, maxPay: 10, combos: 102392435976 },
      { name: "4 of a Kind", pay: 4, maxPay: 4, combos: 1216681289508 },
      { name: "Full House", pay: 4, maxPay: 4, combos: 520566943104 },
      { name: "Flush", pay: 3, maxPay: 3, combos: 413870908056 },
      { name: "Straight", pay: 2, maxPay: 2, combos: 1142885476800 },
      { name: "3 of a Kind", pay: 1, maxPay: 1, combos: 5325911611716 },
    ]),
  },
  // "LV Airport / Illinois Deuces" on vpfree2. Strategy computes from the pay
  // table; no verified frequency table, so variance and handpay rates are
  // unavailable for this one.
  "dw-illinois": {
    key: "dw-illinois",
    name: "Deuces Wild",
    label: "Illinois / LV Airport",
    ret: 98.913,
    hands: [
      { name: "Natural Royal Flush", pay: 250, maxPay: 800 },
      { name: "4 Deuces", pay: 200, maxPay: 200 },
      { name: "Wild Royal Flush", pay: 25, maxPay: 25 },
      { name: "5 of a Kind", pay: 15, maxPay: 15 },
      { name: "Straight Flush", pay: 9, maxPay: 9 },
      { name: "4 of a Kind", pay: 4, maxPay: 4 },
      { name: "Full House", pay: 4, maxPay: 4 },
      { name: "Flush", pay: 3, maxPay: 3 },
      { name: "Straight", pay: 2, maxPay: 2 },
      { name: "3 of a Kind", pay: 1, maxPay: 1 },
    ],
  },
};

const DENOMS = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 100];

/** Line counts commonly offered on multi-play machines. */
const LINE_COUNTS = [1, 3, 5, 10, 50, 100];

/**
 * Between-hand variance: the variance of the chosen hold's expected value
 * across dealt hands. On an n-play machine the held cards are shared by every
 * line, so this is the covariance between lines and the floor that no number
 * of lines drives variance below.
 *
 * Measured by tools/variance-multiline.js — rare dealt classes enumerated
 * exhaustively (a dealt royal alone contributes about 1.0), common ones
 * rejection-sampled. Values are +/- 0.1 or so.
 *
 * Where a game has no measured value the app falls back to
 * VAR_BETWEEN_RATIO x total variance. That ratio held at 0.105 for 9/6 Jacks
 * or Better and 0.107 for Bonus Poker, but both are the same strategy family;
 * treat it as an estimate elsewhere and label it as one.
 */
const VAR_BETWEEN = {
  "job-9-6": 2.05,
  "bp-8-5": 2.23,
};
const VAR_BETWEEN_RATIO = 0.106;

/* ============================================================
 * Deuces Wild strategy
 * ============================================================ */

/**
 * Deuces Wild strategy is organised by how many deuces you hold, not as one
 * ordered list — a hand with two deuces can never match a no-deuce line. Each
 * section is its own priority list.
 *
 * Order here is the published Wizard of Odds NSUD ordering rather than a
 * computed EV sort. The published categories have deliberately overlapping EV
 * ranges ("3 of a kind through straight flush" spans 1.888 to 10, straddling
 * "4 to a straight flush"), so sorting single representative hands by EV
 * cannot reproduce it. Computed EVs are shown alongside each line.
 *
 * Every EV below was checked against the published range. Representative hands
 * discard neutral cards, so each EV is the no-penalty case — the top of the
 * published range. Adding one suited penalty card reproduces the published
 * minimum exactly (verified for 3-to-a-royal A-high: 1.060130).
 */
const DW_SECTIONS = [
  { key: "4d", label: "Four Deuces" },
  { key: "3d", label: "Three Deuces" },
  { key: "2d", label: "Two Deuces" },
  { key: "1d", label: "One Deuce" },
  { key: "0d", label: "No Deuces" },
];

const DW_STRATEGY_CATEGORIES = [
  // --- 4 deuces ---
  { id: "dw_4d", section: "4d", hold: "Four Deuces", tier: "pat",
    cards: [_mc(0,0), _mc(0,1), _mc(0,2), _mc(0,3), _mc(6,1)], holdMask: [0,1,2,3] },

  // --- 3 deuces ---
  { id: "dw_3d_wroyal", section: "3d", hold: "Wild Royal Flush", tier: "pat",
    cards: [_mc(0,0), _mc(0,1), _mc(0,2), _mc(10,3), _mc(11,3)], holdMask: [0,1,2,3,4] },
  { id: "dw_3d_5kind", section: "3d", hold: "Five of a Kind", tier: "pat",
    cards: [_mc(0,0), _mc(0,1), _mc(0,2), _mc(5,0), _mc(5,1)], holdMask: [0,1,2,3,4] },
  { id: "dw_3d_only", section: "3d", hold: "Three Deuces", tier: "made",
    cards: [_mc(0,0), _mc(0,1), _mc(0,2), _mc(6,1), _mc(9,2)], holdMask: [0,1,2] },

  // --- 2 deuces ---
  { id: "dw_2d_pat", section: "2d", hold: "Pat 4 of a Kind or better", tier: "pat",
    cards: [_mc(0,0), _mc(0,1), _mc(5,0), _mc(5,1), _mc(9,3)], holdMask: [0,1,2,3] },
  { id: "dw_2d_4royal", section: "2d", hold: "4 to a Royal Flush", tier: "made",
    cards: [_mc(0,0), _mc(0,1), _mc(10,3), _mc(11,3), _mc(3,0)], holdMask: [0,1,2,3] },
  { id: "dw_2d_4sf", section: "2d", hold: "4 to a Straight Flush (0–1 gap)", tier: "made",
    cards: [_mc(0,0), _mc(0,1), _mc(5,2), _mc(6,2), _mc(11,0)], holdMask: [0,1,2,3] },
  { id: "dw_2d_only", section: "2d", hold: "Two Deuces", tier: "draw",
    cards: [_mc(0,0), _mc(0,1), _mc(6,1), _mc(9,2), _mc(3,3)], holdMask: [0,1] },

  // --- 1 deuce ---
  { id: "dw_1d_sf", section: "1d", hold: "Straight Flush to Wild Royal", tier: "pat",
    cards: [_mc(0,0), _mc(4,2), _mc(5,2), _mc(6,2), _mc(7,2)], holdMask: [0,1,2,3,4] },
  { id: "dw_1d_4royal", section: "1d", hold: "4 to a Royal Flush", tier: "made",
    cards: [_mc(0,0), _mc(10,3), _mc(11,3), _mc(12,3), _mc(3,0)], holdMask: [0,1,2,3] },
  { id: "dw_1d_flush4k", section: "1d", hold: "Flush through 4 of a Kind", tier: "made",
    cards: [_mc(0,0), _mc(1,3), _mc(4,3), _mc(7,3), _mc(9,3)], holdMask: [0,1,2,3,4] },
  { id: "dw_1d_4sf01", section: "1d", hold: "4 to a Straight Flush (0–1 gap)", tier: "made",
    cards: [_mc(0,0), _mc(5,2), _mc(6,2), _mc(7,2), _mc(11,0)], holdMask: [0,1,2,3] },
  { id: "dw_1d_straight", section: "1d", hold: "Straight", tier: "made",
    cards: [_mc(0,0), _mc(4,0), _mc(5,1), _mc(6,2), _mc(7,3)], holdMask: [0,1,2,3,4] },
  { id: "dw_1d_4sf2", section: "1d", hold: "4 to a Straight Flush (2 gaps)", tier: "draw",
    cards: [_mc(0,0), _mc(3,2), _mc(6,2), _mc(7,2), _mc(11,0)], holdMask: [0,1,2,3] },
  { id: "dw_1d_3kind", section: "1d", hold: "Three of a Kind", tier: "draw",
    cards: [_mc(0,0), _mc(5,0), _mc(5,1), _mc(3,2), _mc(11,3)], holdMask: [0,1,2] },
  { id: "dw_1d_4sfa", section: "1d", hold: "4 to a Straight Flush (ace low)", tier: "draw",
    cards: [_mc(0,0), _mc(12,2), _mc(1,2), _mc(2,2), _mc(11,0)], holdMask: [0,1,2,3] },
  { id: "dw_1d_3rjk", section: "1d", hold: "3 to a Royal Flush (J–K high)", tier: "draw",
    cards: [_mc(0,0), _mc(10,3), _mc(11,3), _mc(3,0), _mc(6,1)], holdMask: [0,1,2] },
  { id: "dw_1d_3sf0", section: "1d", hold: "3 to a Straight Flush (0 gaps)", tier: "spec",
    cards: [_mc(0,0), _mc(6,2), _mc(7,2), _mc(3,0), _mc(11,1)], holdMask: [0,1,2] },
  { id: "dw_1d_3ra", section: "1d", hold: "3 to a Royal Flush (ace high)", tier: "spec",
    cards: [_mc(0,0), _mc(12,3), _mc(10,3), _mc(3,0), _mc(6,1)], holdMask: [0,1,2] },
  { id: "dw_1d_3sf1", section: "1d", hold: "3 to a Straight Flush (1 gap)", tier: "spec",
    cards: [_mc(0,0), _mc(5,2), _mc(7,2), _mc(3,0), _mc(11,1)], holdMask: [0,1,2] },
  { id: "dw_1d_4str", section: "1d", hold: "4 to a Straight (0 gaps)", tier: "spec",
    cards: [_mc(0,0), _mc(5,0), _mc(6,1), _mc(7,2), _mc(11,3)], holdMask: [0,1,2,3] },
  { id: "dw_1d_only", section: "1d", hold: "One Deuce", tier: "spec",
    cards: [_mc(0,0), _mc(6,1), _mc(9,2), _mc(3,3), _mc(11,0)], holdMask: [0] },

  // --- 0 deuces ---
  { id: "dw_0d_royal", section: "0d", hold: "Royal Flush", tier: "pat",
    cards: [_mc(8,3), _mc(9,3), _mc(10,3), _mc(11,3), _mc(12,3)], holdMask: [0,1,2,3,4] },
  { id: "dw_0d_4royal", section: "0d", hold: "4 to a Royal Flush", tier: "pat",
    cards: [_mc(8,3), _mc(9,3), _mc(10,3), _mc(11,3), _mc(4,0)], holdMask: [0,1,2,3] },
  { id: "dw_0d_made", section: "0d", hold: "3 of a Kind through Straight Flush", tier: "made",
    cards: [_mc(5,0), _mc(5,1), _mc(5,2), _mc(3,3), _mc(11,1)], holdMask: [0,1,2] },
  { id: "dw_0d_4sf", section: "0d", hold: "4 to a Straight Flush", tier: "made",
    cards: [_mc(4,2), _mc(5,2), _mc(6,2), _mc(7,2), _mc(11,0)], holdMask: [0,1,2,3] },
  { id: "dw_0d_3royal", section: "0d", hold: "3 to a Royal Flush", tier: "draw",
    cards: [_mc(10,3), _mc(11,3), _mc(12,3), _mc(3,0), _mc(6,1)], holdMask: [0,1,2] },
  { id: "dw_0d_4flush", section: "0d", hold: "4 to a Flush", tier: "draw",
    cards: [_mc(1,3), _mc(4,3), _mc(7,3), _mc(9,3), _mc(3,0)], holdMask: [0,1,2,3] },
  { id: "dw_0d_2pair", section: "0d", hold: "Two Pair", tier: "draw",
    cards: [_mc(5,0), _mc(5,1), _mc(9,2), _mc(9,3), _mc(2,0)], holdMask: [0,1,2,3] },
  { id: "dw_0d_3sf0", section: "0d", hold: "3 to a Straight Flush (0 gaps)", tier: "spec",
    cards: [_mc(4,2), _mc(5,2), _mc(6,2), _mc(11,0), _mc(2,1)], holdMask: [0,1,2] },
  { id: "dw_0d_pair", section: "0d", hold: "One Pair", tier: "draw",
    cards: [_mc(5,0), _mc(5,1), _mc(2,2), _mc(8,3), _mc(11,0)], holdMask: [0,1] },
  { id: "dw_0d_4str", section: "0d", hold: "4 to a Straight (0 gaps)", tier: "spec",
    cards: [_mc(5,0), _mc(6,1), _mc(7,2), _mc(8,3), _mc(1,0)], holdMask: [0,1,2,3] },
  { id: "dw_0d_3sf12", section: "0d", hold: "3 to a Straight Flush (1–2 gaps)", tier: "spec",
    cards: [_mc(3,2), _mc(4,2), _mc(6,2), _mc(11,0), _mc(1,1)], holdMask: [0,1,2] },
  { id: "dw_0d_2rjq", section: "0d", hold: "2 to a Royal Flush (J or Q high)", tier: "spec",
    cards: [_mc(9,3), _mc(10,3), _mc(3,2), _mc(1,1), _mc(6,0)], holdMask: [0,1] },
  { id: "dw_0d_3sfa", section: "0d", hold: "3 to a Straight Flush (ace low)", tier: "spec",
    cards: [_mc(12,2), _mc(1,2), _mc(2,2), _mc(11,0), _mc(6,1)], holdMask: [0,1,2] },
  { id: "dw_0d_4str1", section: "0d", hold: "4 to a Straight (1 gap)", tier: "spec",
    cards: [_mc(5,0), _mc(6,1), _mc(7,2), _mc(9,3), _mc(1,0)], holdMask: [0,1,2,3] },
  { id: "dw_0d_2rk", section: "0d", hold: "2 to a Royal Flush (K high)", tier: "spec",
    cards: [_mc(11,3), _mc(9,3), _mc(3,2), _mc(1,1), _mc(6,0)], holdMask: [0,1] },
  { id: "dw_0d_toss", section: "0d", hold: "Toss Everything", tier: "spec",
    cards: [_mc(1,0), _mc(4,1), _mc(6,2), _mc(11,3), _mc(7,0)], holdMask: [] },
];

/** Deuces Wild pay tables at or above the useful-return threshold. */
const DW_GAMES = ["nsud", "dw-illinois"];

/* ============================================================
 * Double Double Bonus strategy
 * ============================================================ */

/**
 * Double Double Bonus needs its own category set rather than reusing the Jacks
 * or Better one. Two pair pays 1 instead of 2, and quad aces with a low kicker
 * pay 400, so aces get split out of the generic pair and trips categories and
 * the high pairs separate by rank — all of which the JoB shapes cannot express.
 *
 * Bonus Poker needs no such set: its hold shapes are identical to Jacks or
 * Better, so it reuses STRATEGY_CATEGORIES under Bonus Poker payouts.
 */
const DDB_STRATEGY_CATEGORIES = [
  { id: "ddb_pat_royal", hold: "Pat Royal Flush", tier: "pat",
    cards: [_mc(8,3), _mc(9,3), _mc(10,3), _mc(11,3), _mc(12,3)], holdMask: [0,1,2,3,4] },
  { id: "ddb_quad_kicker", hold: "4 Aces with 2/3/4 Kicker", tier: "pat",
    cards: [_mc(12,0), _mc(12,1), _mc(12,2), _mc(12,3), _mc(1,1)], holdMask: [0,1,2,3,4] },
  { id: "ddb_quad_aces", hold: "4 Aces (draw for kicker)", tier: "pat",
    cards: [_mc(12,0), _mc(12,1), _mc(12,2), _mc(12,3), _mc(11,1)], holdMask: [0,1,2,3] },
  { id: "ddb_pat_quad", hold: "Pat 4 of a Kind", tier: "pat",
    cards: [_mc(6,0), _mc(6,1), _mc(6,2), _mc(6,3), _mc(11,1)], holdMask: [0,1,2,3] },
  { id: "ddb_pat_sf", hold: "Pat Straight Flush", tier: "pat",
    cards: [_mc(4,2), _mc(5,2), _mc(6,2), _mc(7,2), _mc(8,2)], holdMask: [0,1,2,3,4] },
  { id: "ddb_4_royal", hold: "4 to a Royal Flush", tier: "made",
    cards: [_mc(8,0), _mc(9,0), _mc(10,0), _mc(12,0), _mc(3,2)], holdMask: [0,1,2,3] },
  { id: "ddb_3_aces", hold: "3 Aces", tier: "made",
    cards: [_mc(12,0), _mc(12,1), _mc(12,2), _mc(3,3), _mc(6,1)], holdMask: [0,1,2] },
  { id: "ddb_pat_fh", hold: "Pat Full House", tier: "made",
    cards: [_mc(9,0), _mc(9,1), _mc(9,2), _mc(4,0), _mc(4,1)], holdMask: [0,1,2,3,4] },
  { id: "ddb_pat_flush", hold: "Pat Flush", tier: "made",
    cards: [_mc(1,3), _mc(4,3), _mc(6,3), _mc(9,3), _mc(12,3)], holdMask: [0,1,2,3,4] },
  { id: "ddb_pat_straight", hold: "Pat Straight", tier: "made",
    cards: [_mc(4,0), _mc(5,1), _mc(6,2), _mc(7,3), _mc(8,0)], holdMask: [0,1,2,3,4] },
  { id: "ddb_3_kind", hold: "3 of a Kind (2s–Ks)", tier: "made",
    cards: [_mc(5,0), _mc(5,1), _mc(5,2), _mc(1,3), _mc(10,1)], holdMask: [0,1,2] },
  { id: "ddb_4_sf_open", hold: "4 to a Straight Flush (open)", tier: "made",
    cards: [_mc(4,2), _mc(5,2), _mc(6,2), _mc(7,2), _mc(11,0)], holdMask: [0,1,2,3] },
  { id: "ddb_4_sf_inside", hold: "4 to a Straight Flush (inside)", tier: "made",
    cards: [_mc(4,2), _mc(5,2), _mc(6,2), _mc(8,2), _mc(11,0)], holdMask: [0,1,2,3] },
  { id: "ddb_pair_aces", hold: "Pair of Aces", tier: "made",
    cards: [_mc(12,0), _mc(12,1), _mc(3,2), _mc(6,3), _mc(1,0)], holdMask: [0,1] },
  { id: "ddb_two_pair", hold: "Two Pair", tier: "draw",
    cards: [_mc(5,0), _mc(5,1), _mc(9,2), _mc(9,3), _mc(2,0)], holdMask: [0,1,2,3] },
  { id: "ddb_3_royal_jqk", hold: "3 to a Royal Flush (JQK)", tier: "draw",
    cards: [_mc(9,0), _mc(10,0), _mc(11,0), _mc(3,2), _mc(1,3)], holdMask: [0,1,2] },
  { id: "ddb_pair_kings", hold: "Pair of Kings", tier: "draw",
    cards: [_mc(11,0), _mc(11,1), _mc(3,2), _mc(6,3), _mc(1,0)], holdMask: [0,1] },
  { id: "ddb_3_royal_tjq", hold: "3 to a Royal Flush (TJQ)", tier: "draw",
    cards: [_mc(8,0), _mc(9,0), _mc(10,0), _mc(3,2), _mc(1,3)], holdMask: [0,1,2] },
  { id: "ddb_pair_jq", hold: "Pair of Jacks or Queens", tier: "draw",
    cards: [_mc(10,0), _mc(10,1), _mc(3,2), _mc(6,3), _mc(1,0)], holdMask: [0,1] },
  { id: "ddb_4_flush", hold: "4 to a Flush", tier: "draw",
    cards: [_mc(1,2), _mc(4,2), _mc(6,2), _mc(9,2), _mc(3,0)], holdMask: [0,1,2,3] },
  { id: "ddb_3_royal_other", hold: "3 to a Royal Flush (other)", tier: "draw",
    cards: [_mc(8,0), _mc(9,0), _mc(11,0), _mc(3,2), _mc(1,3)], holdMask: [0,1,2] },
  { id: "ddb_4_str_high", hold: "4 to a Straight (9TJQ, TJQK)", tier: "spec",
    cards: [_mc(7,0), _mc(8,1), _mc(9,2), _mc(10,3), _mc(1,0)], holdMask: [0,1,2,3] },
  { id: "ddb_low_pair", hold: "Low Pair (2s–10s)", tier: "draw",
    cards: [_mc(5,0), _mc(5,1), _mc(2,2), _mc(8,3), _mc(11,0)], holdMask: [0,1] },
  { id: "ddb_4_str_low", hold: "4 to a Straight (low, 0 gaps)", tier: "spec",
    cards: [_mc(3,0), _mc(4,1), _mc(5,2), _mc(6,3), _mc(11,0)], holdMask: [0,1,2,3] },
  { id: "ddb_3_sf_1", hold: "3 to a Straight Flush (0 gaps)", tier: "spec",
    cards: [_mc(3,2), _mc(4,2), _mc(5,2), _mc(11,0), _mc(0,1)], holdMask: [0,1,2] },
  { id: "ddb_4_str_jqka", hold: "4 to a Straight (JQKA)", tier: "spec",
    cards: [_mc(9,0), _mc(10,1), _mc(11,2), _mc(12,3), _mc(3,0)], holdMask: [0,1,2,3] },
  { id: "ddb_2_royal_jq", hold: "2 to a Royal Flush (JQ, JK, QK)", tier: "spec",
    cards: [_mc(9,0), _mc(10,0), _mc(3,2), _mc(1,3), _mc(6,1)], holdMask: [0,1] },
  { id: "ddb_3_sf_2", hold: "3 to a Straight Flush (1 gap)", tier: "spec",
    cards: [_mc(3,2), _mc(5,2), _mc(6,2), _mc(11,0), _mc(0,1)], holdMask: [0,1,2] },
  { id: "ddb_3_str_jqk", hold: "3 to a Straight (JQK)", tier: "spec",
    cards: [_mc(9,0), _mc(10,1), _mc(11,2), _mc(3,3), _mc(1,0)], holdMask: [0,1,2] },
  { id: "ddb_2_str_jq", hold: "2 Unsuited High Cards (JQ)", tier: "spec",
    cards: [_mc(9,0), _mc(10,1), _mc(3,2), _mc(1,3), _mc(6,0)], holdMask: [0,1] },
  { id: "ddb_high_ace", hold: "Single Ace", tier: "spec",
    cards: [_mc(12,0), _mc(3,2), _mc(1,3), _mc(6,1), _mc(0,2)], holdMask: [0] },
  { id: "ddb_2_royal_tj", hold: "2 to a Royal Flush (TJ)", tier: "spec",
    cards: [_mc(8,0), _mc(9,0), _mc(3,2), _mc(1,3), _mc(6,1)], holdMask: [0,1] },
  { id: "ddb_high_jqk", hold: "Single J, Q or K", tier: "spec",
    cards: [_mc(11,0), _mc(3,2), _mc(1,3), _mc(6,1), _mc(0,2)], holdMask: [0] },
  { id: "ddb_discard", hold: "Discard Everything", tier: "spec",
    cards: [_mc(0,0), _mc(2,1), _mc(4,2), _mc(6,3), _mc(8,0)], holdMask: [] },
];
