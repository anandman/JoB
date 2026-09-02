/**
 * Bettor or Bust — index plays, derived rather than looked up.
 *
 * Basic strategy is the best play against an average shoe. A shoe with a count
 * on it is not average, and at some point the second-best action becomes the
 * best one. The count at which that happens is the index.
 *
 * Nothing here is a published table. The engine already prices every action
 * exactly for any composition, so the indices are found the same way the
 * strategy chart is: build the shoe a count implies, ask what the best action
 * is, and look for where the answer changes. That means they follow your
 * table's rules — a double-deck H17 game gets its own numbers rather than the
 * six-deck ones everybody quotes.
 *
 * Indices are quoted as Hi-Lo TRUE counts, because that is the system that has
 * a true count. KO and Red 7 are unbalanced and deviate off the running count
 * instead; their pivot is the point where the running count means what a true
 * count of about +2 means here.
 */

// Node for the checks, a browser for everything else. The require has to run
// before the closure below reads BJEngine, which a bottom-of-file shim would
// not: `var` hoists the name but not the assignment.
if (typeof require === "function" && typeof module !== "undefined") {
  var BJEngine = require("./engine.js");
}

var BJIndices = (function () {
  "use strict";

  var E = BJEngine;

  // Hi-Lo tags by rank index: 0 = A, 1..8 = 2..9, 9 = any ten-value card.
  var HILO = [-1, 1, 1, 1, 1, 1, 0, 0, 0, -1];
  var LOWS = [1, 2, 3, 4, 5];          // 2 through 6
  var HIGHS = [0, 9];                  // ace and the ten-value block

  var UPCARDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];

  /**
   * The shoe a true count implies.
   *
   * A count is a claim about what is left, so the shoe is built by dealing
   * cards out of a fresh one: proportionally, then leaning the requested
   * number of extra low cards out of it. Removing one low card is worth +1 to
   * the running count and removing one high card −1, so the lean is half the
   * running count in each direction.
   *
   * Returns null when the count asked for cannot exist at that penetration —
   * there are only so many low cards to remove — which is a real answer, not
   * an error.
   */
  function shoeAt(decks, remainingDecks, trueCount) {
    var counts = E.freshShoe(decks);
    var dealt = Math.round((decks - remainingDecks) * 52);
    var rc = Math.round(trueCount * remainingDecks);
    var i, r;

    // Whole cards, not fractions of one. Beyond being what a shoe is, it is
    // what makes this fast enough to run: the engine's recursion prunes a
    // branch when a rank runs out, and a rank holding 14.4 cards never does.
    // Fractional counts made every evaluation about ten times slower.
    var neutral = Math.round(dealt * 12 / 52);
    // Lows removed less highs removed is the running count, and the two must
    // sum with the neutrals to the cards actually dealt. That needs the parity
    // to work out, so the neutral share absorbs the odd one.
    if ((dealt - neutral + rc) % 2 !== 0) neutral += (neutral > 0 ? -1 : 1);
    var lows = (dealt - neutral + rc) / 2;
    var highs = dealt - neutral - lows;
    if (lows < 0 || highs < 0 || neutral < 0) return null;

    // Spread each group as evenly as its ranks allow, giving the remainder to
    // the first of them rather than leaving the total short.
    var spread = function (total, ranks) {
      var base = Math.floor(total / ranks.length), extra = total - base * ranks.length;
      for (var k = 0; k < ranks.length; k++) counts[ranks[k]] -= base + (k < extra ? 1 : 0);
    };
    spread(lows, LOWS);
    spread(neutral, [6, 7, 8]);
    // The high side is two ranks of unequal size: four aces to sixteen tens.
    var aces = Math.round(highs * 4 / 20);
    counts[E.ACE] -= aces;
    counts[E.TEN] -= highs - aces;

    for (r = 0; r < E.RANKS; r++) if (counts[r] < 0) return null;
    return counts;
  }

  /** The Hi-Lo running count a composition carries, for checking the above. */
  function runningCount(decks, counts) {
    var fresh = E.freshShoe(decks), rc = 0, r;
    for (r = 0; r < E.RANKS; r++) rc += (fresh[r] - counts[r]) * HILO[r];
    return rc;
  }

  function removeCards(counts, cards) {
    var c = counts.slice(), i;
    for (i = 0; i < cards.length; i++) c[cards[i]]--;
    return c;
  }

  function hardCards(total) {
    if (total <= 11) return [1, total - 3];
    return [E.TEN, total - 11];
  }
  function softCards(total) { return [E.ACE, total - 12]; }

  var NO_SPLIT = { stand: 1, hit: 1, "double": 1, surrender: 1 };

  /** Best action for one cell against one shoe, or null if the shoe cannot be. */
  function bestAt(cards, up, rules, shoe, allow) {
    if (!shoe) return null;
    var counts = removeCards(shoe, cards.concat([up]));
    for (var r = 0; r < E.RANKS; r++) if (counts[r] < 0) return null;
    var list = E.actions(cards, up, counts, rules, {}).actions;
    if (allow) list = list.filter(function (a) { return allow[a.action]; });
    return list[0];
  }

  /**
   * Every count at which one cell changes its mind, not just the outermost.
   *
   * A cell can change twice. Sixteen against a ten hits at a very negative
   * count, surrenders through the middle, and would stand at a high one — so
   * comparing only the two ends of the range reports a single crossing that
   * is really two, and names the wrong pair of actions for it.
   *
   * The search is on the RUNNING count, because a shoe can only hold a whole
   * number of extra low cards; bisecting the true count spends most of its
   * steps re-evaluating shoes it has already seen. Recursion into both halves
   * finds each edge separately, and costs nothing on the great majority of
   * cells that never change their mind at all.
   */
  function transitions(cards, up, rules, allow, pen, rcLo, rcHi, aLo, aHi, out, depth) {
    if (aLo === aHi || depth > 8) return;
    if (rcHi - rcLo <= 1) {
      out.push({ rc: rcHi, from: aLo, to: aHi });
      return;
    }
    var mid = Math.floor((rcLo + rcHi) / 2);
    var b = bestAt(cards, up, rules, shoeAt(rules.decks, pen, mid / pen), allow);
    if (!b) return;
    transitions(cards, up, rules, allow, pen, rcLo, mid, aLo, b.action, out, depth + 1);
    transitions(cards, up, rules, allow, pen, mid, rcHi, b.action, aHi, out, depth + 1);
  }

  /**
   * Insurance, which is not an action but is the most valuable index there is.
   *
   * It pays 2:1 on a bet that the hole card is a ten, so it is worth taking
   * exactly when more than a third of what remains is ten-valued. That has no
   * dependence on your hand at all, which is why "never take insurance" is
   * right until suddenly it is not.
   */
  function insuranceAt(decks, pen, trueCount) {
    var shoe = shoeAt(decks, pen, trueCount);
    if (!shoe) return null;
    // The ace showing is already out of the shoe.
    var counts = shoe.slice();
    counts[E.ACE] -= 1;
    if (counts[E.ACE] < 0) return null;
    var total = 0;
    for (var r = 0; r < E.RANKS; r++) total += counts[r];
    return counts[E.TEN] / total * 3 - 1;      // EV per unit of the side bet
  }

  function insuranceIndex(decks, pen) {
    var lo = -10, hi = 20, i;
    if (insuranceAt(decks, pen, hi) === null || insuranceAt(decks, pen, hi) < 0) return null;
    for (i = 0; i < 14; i++) {
      var mid = (lo + hi) / 2;
      var ev = insuranceAt(decks, pen, mid);
      if (ev === null || ev < 0) lo = mid; else hi = mid;
    }
    return Math.round(((lo + hi) / 2) * 10) / 10;
  }

  /**
   * Every cell of the chart, as something the caller can work through in
   * slices. The sweep takes seconds on a phone, and a page that stops
   * answering for that long looks broken rather than busy.
   */
  function cells() {
    var out = [], t, r, u;
    for (t = 5; t <= 20; t++) {
      for (u = 0; u < UPCARDS.length; u++) {
        out.push({ label: String(t), cards: hardCards(t), up: UPCARDS[u],
                   allow: NO_SPLIT, kind: "hard" });
      }
    }
    for (t = 13; t <= 20; t++) {
      for (u = 0; u < UPCARDS.length; u++) {
        out.push({ label: "A," + (t - 11), cards: softCards(t), up: UPCARDS[u],
                   allow: NO_SPLIT, kind: "soft" });
      }
    }
    for (r = 0; r < E.RANKS; r++) {
      for (u = 0; u < UPCARDS.length; u++) {
        out.push({ label: E.RANK_LABELS[r] + "," + E.RANK_LABELS[r], cards: [r, r],
                   up: UPCARDS[u], allow: null, kind: "pair" });
      }
    }
    return out;
  }

  /**
   * Every cell whose best action changes somewhere in the countable range.
   *
   * The two ends are tested first and the middle is only searched where they
   * disagree, which is what keeps this quick enough to run on a phone: most of
   * the chart never changes its mind at any count.
   */
  function generate(rules, opts) {
    opts = opts || {};
    var lo = opts.lo === undefined ? -8 : opts.lo;
    var hi = opts.hi === undefined ? 12 : opts.hi;
    // Half the shoe gone is where a count is both meaningful and still has
    // hands left to use it on. Indices drift with penetration; this is the
    // middle of the range where they matter.
    var pen = opts.pen || rules.decks / 2;

    var shoeLo = shoeAt(rules.decks, pen, lo);
    var shoeHi = shoeAt(rules.decks, pen, hi);
    var out = [];

    function consider(label, cards, up, allow, kind) {
      var a = bestAt(cards, up, rules, shoeLo, allow);
      var b = bestAt(cards, up, rules, shoeHi, allow);
      if (!a || !b) return;

      var found = [];
      transitions(cards, up, rules, allow, pen,
                  Math.round(lo * pen), Math.round(hi * pen), a.action, b.action, found, 0);

      found.forEach(function (t) {
        var index = Math.round((t.rc / pen) * 10) / 10;

        // What the deviation is worth where you would actually make it: the
        // gap between the two actions at the first count that calls for it.
        var shoe = shoeAt(rules.decks, pen, t.rc / pen);
        var counts = shoe && removeCards(shoe, cards.concat([up]));
        var gain = null;
        if (counts) {
          var list = E.actions(cards, up, counts, rules, {}).actions;
          if (allow) list = list.filter(function (x) { return allow[x.action]; });
          var was = null, now = null, i;
          for (i = 0; i < list.length; i++) {
            if (list[i].action === t.from) was = list[i];
            if (list[i].action === t.to) now = list[i];
          }
          if (was && now) gain = now.ev - was.ev;
        }

        out.push({
          kind: kind, label: label, up: up, upLabel: E.RANK_LABELS[up],
          basic: t.from, deviation: t.to, index: index, gain: gain
        });
      });
    }

    var list = opts.cells || cells();
    for (var c = 0; c < list.length; c++) {
      consider(list[c].label, list[c].cards, list[c].up, list[c].allow, list[c].kind);
    }

    // Biggest first: an index you will meet often and that pays well is worth
    // learning before one that is neither.
    out.sort(function (a, b) { return (b.gain || 0) - (a.gain || 0); });

    return {
      penetration: pen,
      range: [lo, hi],
      insurance: insuranceIndex(rules.decks, pen),
      plays: out
    };
  }

  return {
    HILO: HILO,
    cells: cells,
    shoeAt: shoeAt,
    runningCount: runningCount,
    insuranceAt: insuranceAt,
    insuranceIndex: insuranceIndex,
    generate: generate
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BJIndices;
