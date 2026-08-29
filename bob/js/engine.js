/**
 * Bettor or Bust — Dealer probability engine and action EVs
 *
 * The one place blackjack expectations are computed. The basic strategy chart
 * is this grid collapsed to its best action, the hand analyzer is these same
 * numbers unsummarised, and play mode scores a decision by the gap between the
 * action taken and the best one. None of those three computes its own EVs —
 * exactly as `computeHoldEV` backs the card, analyzer and scoring alike in the
 * video poker app.
 *
 * Two shoe models, both exact within their own assumption:
 *
 *   infinite: true   draws do not deplete. Memoises on hand state alone, so
 *                    it is fast enough to redraw a whole strategy chart while
 *                    the user drags a rule toggle. This is also the model
 *                    published basic strategy charts are derived from.
 *   infinite: false  draws deplete a real composition. Used by the analyzer,
 *                    where the player's actual cards matter.
 *
 * One documented simplification: the dealer's outcome distribution is computed
 * once at the decision point and held fixed while the player's draw tree is
 * explored. Letting it drift with the player's own draws moves EVs by well
 * under 0.01% and would multiply the cost by the size of the dealer recursion.
 */

var BJEngine = (function () {
  "use strict";

  // Ranks indexed by value: 0 = ace, 1..8 = 2..9, 9 = any ten-value card.
  // Collapsing T/J/Q/K into one rank is exact — they are interchangeable in
  // blackjack — and cuts the branching factor by a quarter.
  var RANKS = 10;
  var ACE = 0, TEN = 9;

  // Dealer outcome vector: [17, 18, 19, 20, 21, bust].
  var BUST = 5;

  var RANK_LABELS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

  function cardValue(r) { return r === ACE ? 1 : r + 1; }

  function freshShoe(decks) {
    var c = [], r;
    for (r = 0; r < RANKS; r++) c[r] = 4 * decks;
    c[TEN] = 16 * decks;
    return c;
  }

  function countCards(counts) {
    var n = 0, r;
    for (r = 0; r < RANKS; r++) n += counts[r];
    return n;
  }

  /* ===== Hand state =====
   *
   * Encoded as (total << 1) | soft, where `soft` means one ace is currently
   * counted as 11. Promoting on the way in and demoting on bust handles any
   * number of aces: A,A,A reaches 13 soft (11 + 1 + 1), and drawing a 9 there
   * demotes once to 12 hard.
   */

  function step(state, r) {
    var total = (state >> 1) + cardValue(r);
    var soft = state & 1;
    if (r === ACE && total + 10 <= 21) { total += 10; soft = 1; }
    else if (soft && total > 21) { total -= 10; soft = 0; }
    return (total << 1) | soft;
  }

  function handState(cards) {
    var s = 0;
    for (var i = 0; i < cards.length; i++) s = step(s, cards[i]);
    return s;
  }

  function totalOf(state) { return state >> 1; }
  function isSoft(state) { return (state & 1) === 1; }
  function isBlackjack(cards) {
    return cards.length === 2 &&
           ((cards[0] === ACE && cards[1] === TEN) || (cards[0] === TEN && cards[1] === ACE));
  }

  /* ===== Dealer ===== */

  function dealerStands(total, soft, h17) {
    if (total > 21) return true;
    if (total > 17) return true;
    if (total < 17) return false;
    return !(h17 && soft);   // hard 17 always stands; soft 17 depends on the rule
  }

  function dealerFrom(state, counts, rem, h17, deplete, memo) {
    var total = state >> 1, soft = state & 1, i, out;

    if (total > 21) { out = [0, 0, 0, 0, 0, 1]; return out; }
    if (dealerStands(total, soft, h17)) {
      out = [0, 0, 0, 0, 0, 0];
      out[total - 17] = 1;
      return out;
    }

    var key = deplete ? state + "|" + counts.join(",") : state;
    var hit = memo[key];
    if (hit) return hit;

    out = [0, 0, 0, 0, 0, 0];
    for (var r = 0; r < RANKS; r++) {
      if (!counts[r]) continue;
      var p = counts[r] / rem;
      var sub;
      if (deplete) {
        counts[r]--;
        sub = dealerFrom(step(state, r), counts, rem - 1, h17, deplete, memo);
        counts[r]++;
      } else {
        sub = dealerFrom(step(state, r), counts, rem, h17, deplete, memo);
      }
      for (i = 0; i < 6; i++) out[i] += p * sub[i];
    }
    memo[key] = out;
    return out;
  }

  /**
   * Dealer outcome distribution given the upcard, over a composition that has
   * already had the upcard and the player's cards removed.
   *
   * In a peek game the dealer has checked the hole card before the player
   * acts, so by the time these numbers are used we know it is not the card
   * that would make blackjack. That branch is excluded and the rest
   * renormalised — omitting this is the classic way to get soft-18-vs-ace and
   * every insurance-adjacent number wrong.
   */
  function dealerVector(up, counts, rules, deplete) {
    var memo = {};
    var rem = countCards(counts);
    var forbidden = -1;
    if (rules.peek) {
      if (up === ACE) forbidden = TEN;
      else if (up === TEN) forbidden = ACE;
    }
    var denom = rem - (forbidden >= 0 ? counts[forbidden] : 0);
    var upState = step(0, up);
    var out = [0, 0, 0, 0, 0, 0], r, i;

    for (r = 0; r < RANKS; r++) {
      if (!counts[r] || r === forbidden) continue;
      var p = counts[r] / denom;
      var sub;
      if (deplete) {
        counts[r]--;
        sub = dealerFrom(step(upState, r), counts, rem - 1, rules.h17, deplete, memo);
        counts[r]++;
      } else {
        sub = dealerFrom(step(upState, r), counts, rem, rules.h17, deplete, memo);
      }
      for (i = 0; i < 6; i++) out[i] += p * sub[i];
    }
    return out;
  }

  /* ===== Player actions ===== */

  function evStand(state, dv) {
    var total = state >> 1;
    if (total > 21) return -1;
    var ev = dv[BUST], t;
    for (t = 17; t <= 21; t++) {
      if (total > t) ev += dv[t - 17];
      else if (total < t) ev -= dv[t - 17];
    }
    return ev;
  }

  // Hitting forfeits doubling and splitting, so from here the only choice is
  // stand or hit again.
  function evHit(state, counts, rem, dv, deplete, memo) {
    var key = deplete ? state + "|" + counts.join(",") : state;
    var hit = memo[key];
    if (hit !== undefined) return hit;

    var ev = 0;
    for (var r = 0; r < RANKS; r++) {
      if (!counts[r]) continue;
      var p = counts[r] / rem;
      var ns = step(state, r);
      var v;
      if ((ns >> 1) > 21) {
        v = -1;
      } else if (deplete) {
        counts[r]--;
        v = Math.max(evStand(ns, dv), evHit(ns, counts, rem - 1, dv, deplete, memo));
        counts[r]++;
      } else {
        v = Math.max(evStand(ns, dv), evHit(ns, counts, rem, dv, deplete, memo));
      }
      ev += p * v;
    }
    memo[key] = ev;
    return ev;
  }

  // Doubling buys exactly one card at twice the stake, then stands.
  function evDouble(state, counts, rem, dv, deplete) {
    var ev = 0;
    for (var r = 0; r < RANKS; r++) {
      if (!counts[r]) continue;
      var p = counts[r] / rem;
      var ns = step(state, r);
      var v;
      if ((ns >> 1) > 21) {
        v = -1;
      } else if (deplete) {
        counts[r]--;
        v = evStand(ns, dv);
        counts[r]++;
      } else {
        v = evStand(ns, dv);
      }
      ev += p * 2 * v;
    }
    return ev;
  }

  function canDouble(rules, state, nCards) {
    if (nCards !== 2) return false;
    if (rules.doubleOn === "any") return true;
    if (isSoft(state)) return false;   // restricted rules mean hard totals
    var t = totalOf(state);
    if (rules.doubleOn === "9-11") return t >= 9 && t <= 11;
    if (rules.doubleOn === "10-11") return t >= 10 && t <= 11;
    return true;
  }

  /**
   * EV of ONE of the hands produced by splitting `rank`.
   *
   * Resplitting is handled the standard way: when the drawn card matches and
   * a hand is still available, that branch is worth twice a further split
   * hand. It is an approximation — the two hands of a split are not truly
   * independent, since they draw from one shoe — but the error is on the
   * order of 0.01% and the exact treatment is a substantially harder
   * combinatorial problem.
   */
  function evSplitHand(rank, dv, counts, rules, handsLeft, deplete) {
    var rem = countCards(counts);
    var ev = 0;
    var acesOneCard = (rank === ACE && !rules.hitSplitAces);

    for (var r = 0; r < RANKS; r++) {
      if (!counts[r]) continue;
      var p = counts[r] / rem;
      var v;

      var mayResplit = handsLeft > 1 && r === rank &&
                       (rank !== ACE || rules.resplitAces);

      if (deplete) counts[r]--;

      if (mayResplit) {
        v = 2 * evSplitHand(rank, dv, counts, rules, handsLeft - 1, deplete);
      } else {
        var ns = step(step(0, rank), r);
        if (acesOneCard) {
          // One card only, and a 21 here is not a blackjack.
          v = evStand(ns, dv);
        } else {
          var sub = countCards(counts);
          var memo = {};
          v = Math.max(evStand(ns, dv), evHit(ns, counts, sub, dv, deplete, memo));
          // Doubling after a split needs the rule, and still obeys any
          // restriction on which totals may double.
          if (rules.das && canDouble(rules, ns, 2)) {
            v = Math.max(v, evDouble(ns, counts, sub, dv, deplete));
          }
        }
      }

      if (deplete) counts[r]++;
      ev += p * v;
    }
    return ev;
  }

  function evSplit(rank, dv, counts, rules, deplete) {
    return 2 * evSplitHand(rank, dv, counts, rules, rules.resplitTo, deplete);
  }

  /* ===== The decision ===== */

  /**
   * Every legal action for a hand, priced and ranked.
   *
   * `counts` must be the composition remaining AFTER the player's cards and
   * the dealer upcard are removed. Returns actions sorted best first; the gap
   * between the first and any other is exactly what choosing that other costs.
   */
  function actions(cards, up, counts, rules, opts) {
    opts = opts || {};
    var deplete = !opts.infinite;
    var state = handState(cards);
    var rem = countCards(counts);
    var dv = opts.dealerVector || dealerVector(up, counts, rules, deplete);

    var out = [];
    out.push({ action: "stand", ev: evStand(state, dv) });

    if (totalOf(state) < 21) {
      out.push({ action: "hit", ev: evHit(state, counts, rem, dv, deplete, {}) });
    }
    if (canDouble(rules, state, cards.length)) {
      out.push({ action: "double", ev: evDouble(state, counts, rem, dv, deplete) });
    }
    if (cards.length === 2 && cards[0] === cards[1]) {
      out.push({ action: "split", ev: evSplit(cards[0], dv, counts, rules, deplete) });
    }
    if (rules.surrender === "late" && cards.length === 2) {
      out.push({ action: "surrender", ev: -0.5 });
    }

    out.sort(function (a, b) { return b.ev - a.ev; });
    return { best: out[0], actions: out, dealer: dv, state: state };
  }

  return {
    RANKS: RANKS,
    ACE: ACE,
    TEN: TEN,
    RANK_LABELS: RANK_LABELS,
    BUST: BUST,
    cardValue: cardValue,
    freshShoe: freshShoe,
    countCards: countCards,
    step: step,
    handState: handState,
    totalOf: totalOf,
    isSoft: isSoft,
    isBlackjack: isBlackjack,
    dealerVector: dealerVector,
    evStand: evStand,
    evHit: evHit,
    evDouble: evDouble,
    evSplit: evSplit,
    canDouble: canDouble,
    actions: actions
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BJEngine;
