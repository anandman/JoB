/**
 * Jacks or Bettorment — Card representation + hand evaluator
 * Card = integer 0-51: rank * 4 + suit
 * Rank: 0=2, 1=3, ..., 8=10, 9=J, 10=Q, 11=K, 12=A
 * Suit: 0-3 (clubs, diamonds, hearts, spades — order doesn't matter)
 */

var Poker = (function () {
  "use strict";

  function cardRank(c) { return (c >> 2); }
  function cardSuit(c) { return (c & 3); }
  function makeCard(rank, suit) { return (rank << 2) | suit; }

  // Build full deck [0..51]
  var DECK = [];
  for (var i = 0; i < 52; i++) DECK.push(i);

  // Rank indices for named ranks
  var RANK_J = 9;
  var RANK_A = 12;
  var RANK_10 = 8;
  var RANK_2 = 0; // wild in Deuces Wild
  var RANK_4 = 2; // ranks 0..2 are the 2s, 3s and 4s that pay a bonus

  /**
   * Evaluate a 5-card hand. Returns hand type index matching HAND_NAMES:
   *   0 = Royal Flush, 1 = Straight Flush, 2 = Four of a Kind,
   *   3 = Full House, 4 = Flush, 5 = Straight,
   *   6 = Three of a Kind, 7 = Two Pair, 8 = Jacks or Better
   * Returns -1 for nothing (no paying hand).
   */
  function evaluateHand(c0, c1, c2, c3, c4) {
    // Extract ranks and suits
    var r0 = c0 >> 2, r1 = c1 >> 2, r2 = c2 >> 2, r3 = c3 >> 2, r4 = c4 >> 2;
    var s0 = c0 & 3, s1 = c1 & 3, s2 = c2 & 3, s3 = c3 & 3, s4 = c4 & 3;

    // Count rank frequencies using a small array
    // Ranks 0-12, use a 13-element array
    var counts = evalCounts;
    counts[0] = 0; counts[1] = 0; counts[2] = 0; counts[3] = 0;
    counts[4] = 0; counts[5] = 0; counts[6] = 0; counts[7] = 0;
    counts[8] = 0; counts[9] = 0; counts[10] = 0; counts[11] = 0; counts[12] = 0;
    counts[r0]++;
    counts[r1]++;
    counts[r2]++;
    counts[r3]++;
    counts[r4]++;

    // Determine frequency pattern
    var maxFreq = 0, secondFreq = 0, pairRank = -1, pairs = 0;
    for (var r = 0; r < 13; r++) {
      var f = counts[r];
      if (f > maxFreq) {
        secondFreq = maxFreq;
        maxFreq = f;
      } else if (f > secondFreq) {
        secondFreq = f;
      }
      if (f === 2) { pairs++; pairRank = r; }
    }

    // Four of a Kind
    if (maxFreq === 4) return 2;

    // Full House
    if (maxFreq === 3 && secondFreq === 2) return 3;

    // Three of a Kind
    if (maxFreq === 3) return 6;

    // Two Pair
    if (pairs === 2) return 7;

    // Check flush and straight
    var isFlush = (s0 === s1 && s1 === s2 && s2 === s3 && s3 === s4);

    // Find min and max rank for straight check
    var minR = r0, maxR = r0;
    if (r1 < minR) minR = r1; if (r1 > maxR) maxR = r1;
    if (r2 < minR) minR = r2; if (r2 > maxR) maxR = r2;
    if (r3 < minR) minR = r3; if (r3 > maxR) maxR = r3;
    if (r4 < minR) minR = r4; if (r4 > maxR) maxR = r4;

    // Straight: 5 unique ranks with span of 4 (maxR - minR === 4)
    // OR wheel: A-2-3-4-5 (ranks 12,0,1,2,3)
    var isStraight = false;
    if (maxFreq === 1) {
      if (maxR - minR === 4) {
        isStraight = true;
      } else if (counts[12] && counts[0] && counts[1] && counts[2] && counts[3]) {
        isStraight = true;
        minR = 0; // wheel — lowest card is 2
      }
    }

    if (isFlush && isStraight) {
      // Royal Flush: flush + straight + 10-J-Q-K-A
      if (minR === RANK_10) return 0;
      return 1; // Straight Flush
    }

    if (isFlush) return 4;
    if (isStraight) return 5;

    // One pair — check if Jacks or Better
    if (pairs === 1) {
      return pairRank >= RANK_J ? 8 : -1;
    }

    return -1; // nothing
  }

  // Pre-allocated array for evaluateHand — avoids GC in hot loop
  var evalCounts = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

  /**
   * Shared shape of a natural (non-wild) five-card hand, written into module
   * scratch so the bonus evaluators stay allocation-free in the hot path.
   *
   * bqQuad   - rank of the four of a kind, or -1
   * bqKicker - rank of the odd card alongside a quad, or -1
   * bqClass  - 0 royal, 1 straight flush, 2 quads, 3 full house, 4 flush,
   *            5 straight, 6 trips, 7 two pair, 8 high pair, -1 nothing
   */
  var bqQuad = -1, bqKicker = -1, bqClass = -1;
  var bonusCounts = new Array(13);

  function classifyBonus(c0, c1, c2, c3, c4) {
    var r0 = c0 >> 2, r1 = c1 >> 2, r2 = c2 >> 2, r3 = c3 >> 2, r4 = c4 >> 2;
    var s0 = c0 & 3, s1 = c1 & 3, s2 = c2 & 3, s3 = c3 & 3, s4 = c4 & 3;
    var counts = bonusCounts, r;
    for (r = 0; r < 13; r++) counts[r] = 0;
    counts[r0]++; counts[r1]++; counts[r2]++; counts[r3]++; counts[r4]++;

    bqQuad = -1; bqKicker = -1;
    var maxFreq = 0, secondFreq = 0, pairs = 0, tripRank = -1, highPair = false;
    for (r = 0; r < 13; r++) {
      var f = counts[r];
      if (f === 0) continue;
      if (f > maxFreq) { secondFreq = maxFreq; maxFreq = f; }
      else if (f > secondFreq) { secondFreq = f; }
      if (f === 4) bqQuad = r;
      else if (f === 1 && bqQuad !== -1) bqKicker = r;
      if (f === 3) tripRank = r;
      if (f === 2) { pairs++; if (r >= RANK_J || r === RANK_A) highPair = true; }
    }
    // The kicker may have been seen before the quad; sweep once more if so.
    if (bqQuad !== -1 && bqKicker === -1) {
      for (r = 0; r < 13; r++) if (counts[r] === 1) { bqKicker = r; break; }
    }

    if (maxFreq === 4) { bqClass = 2; return; }
    if (maxFreq === 3 && secondFreq === 2) { bqClass = 3; return; }
    if (maxFreq === 3) { bqClass = 6; return; }
    if (pairs === 2) { bqClass = 7; return; }

    var isFlush = (s0 === s1 && s1 === s2 && s2 === s3 && s3 === s4);
    var minR = r0, maxR = r0;
    if (r1 < minR) minR = r1; if (r1 > maxR) maxR = r1;
    if (r2 < minR) minR = r2; if (r2 > maxR) maxR = r2;
    if (r3 < minR) minR = r3; if (r3 > maxR) maxR = r3;
    if (r4 < minR) minR = r4; if (r4 > maxR) maxR = r4;

    var isStraight = false;
    if (maxFreq === 1) {
      if (maxR - minR === 4) isStraight = true;
      else if (counts[12] && counts[0] && counts[1] && counts[2] && counts[3]) {
        isStraight = true; minR = 0;
      }
    }

    if (isFlush && isStraight) { bqClass = minR === RANK_10 ? 0 : 1; return; }
    if (isFlush) { bqClass = 4; return; }
    if (isStraight) { bqClass = 5; return; }
    bqClass = highPair ? 8 : -1;
    if (tripRank === -1 && pairs === 1 && !highPair) bqClass = -1;
  }

  /**
   * Bonus Poker. Same hands as Jacks or Better except four of a kind splits
   * three ways by rank. Returns an index into the Bonus Poker payout order:
   *   0 royal, 1 straight flush, 2 four aces, 3 four 2s-4s, 4 four 5s-Ks,
   *   5 full house, 6 flush, 7 straight, 8 trips, 9 two pair, 10 jacks+
   * Returns -1 for nothing.
   */
  function evaluateBonusPoker(c0, c1, c2, c3, c4) {
    classifyBonus(c0, c1, c2, c3, c4);
    switch (bqClass) {
      case 0: return 0;
      case 1: return 1;
      case 2:
        if (bqQuad === RANK_A) return 2;
        return bqQuad <= RANK_4 ? 3 : 4;
      case 3: return 5;
      case 4: return 6;
      case 5: return 7;
      case 6: return 8;
      case 7: return 9;
      case 8: return 10;
      default: return -1;
    }
  }

  /**
   * Double Double Bonus. Quads split by rank as in Bonus Poker, and the two
   * bonus quad ranks pay more again with the right kicker — aces with a 2, 3
   * or 4, and 2s-4s with an ace, 2, 3 or 4. Returns an index into the DDB
   * payout order:
   *   0 royal, 1 straight flush, 2 four aces + kicker, 3 four 2s-4s + kicker,
   *   4 four aces, 5 four 2s-4s, 6 four 5s-Ks, 7 full house, 8 flush,
   *   9 straight, 10 trips, 11 two pair, 12 jacks+
   * Returns -1 for nothing.
   */
  function evaluateDoubleDoubleBonus(c0, c1, c2, c3, c4) {
    classifyBonus(c0, c1, c2, c3, c4);
    switch (bqClass) {
      case 0: return 0;
      case 1: return 1;
      case 2:
        if (bqQuad === RANK_A) return bqKicker <= RANK_4 ? 2 : 4;
        if (bqQuad <= RANK_4) {
          return (bqKicker <= RANK_4 || bqKicker === RANK_A) ? 3 : 5;
        }
        return 6;
      case 3: return 7;
      case 4: return 8;
      case 5: return 9;
      case 6: return 10;
      case 7: return 11;
      case 8: return 12;
      default: return -1;
    }
  }

  /**
   * Can these distinct natural ranks all sit inside one five-rank window,
   * with wilds filling the gaps? Deuces are wild so a natural 2 never appears,
   * and the wheel is A-3-4-5 plus a wild standing in for the 2 — which is why
   * the ace is retried as rank -1.
   */
  function fitsStraightWindow(ranks) {
    var i, lo = 99, hi = -99, hasAce = false;
    if (ranks.length === 0) return true;
    for (i = 0; i < ranks.length; i++) {
      if (ranks[i] < lo) lo = ranks[i];
      if (ranks[i] > hi) hi = ranks[i];
      if (ranks[i] === RANK_A) hasAce = true;
    }
    if (hi - lo <= 4) return true;
    if (!hasAce) return false;
    lo = 99; hi = -99;
    for (i = 0; i < ranks.length; i++) {
      var r = ranks[i] === RANK_A ? -1 : ranks[i];
      if (r < lo) lo = r;
      if (r > hi) hi = r;
    }
    return hi - lo <= 4;
  }

  /**
   * Evaluate a 5-card hand with deuces wild. Returns the hand index matching
   * the Deuces Wild payout order:
   *   0 = Natural Royal, 1 = 4 Deuces, 2 = Wild Royal, 3 = 5 of a Kind,
   *   4 = Straight Flush, 5 = 4 of a Kind, 6 = Full House, 7 = Flush,
   *   8 = Straight, 9 = 3 of a Kind
   * Returns -1 for nothing. Note a pair pays nothing here — three of a kind
   * is the minimum paying hand.
   *
   * Checks run in payout order, not poker order, so a hand that could be read
   * two ways takes the better one (three wilds plus two suited royal cards is
   * a wild royal at 25, not five of a kind at 16).
   */
  function evaluateDeucesWild(a, b, c, d, e) {
    var cards = [a, b, c, d, e];
    var wilds = 0, i, r;
    var rc = [0,0,0,0,0,0,0,0,0,0,0,0,0];
    var sc = [0, 0, 0, 0];
    var natRanks = [];

    for (i = 0; i < 5; i++) {
      r = cards[i] >> 2;
      if (r === RANK_2) { wilds++; continue; }
      rc[r]++;
      sc[cards[i] & 3]++;
      if (rc[r] === 1) natRanks.push(r);
    }

    if (wilds === 4) return 1;

    var n = 5 - wilds;
    var maxOfRank = 0;
    for (i = 0; i < 13; i++) if (rc[i] > maxOfRank) maxOfRank = rc[i];

    var distinct = natRanks.length;
    var flush = false;
    for (i = 0; i < 4; i++) if (sc[i] === n) { flush = true; break; }

    // A straight needs every natural rank distinct; a pair rules it out.
    var straight = distinct === n && fitsStraightWindow(natRanks);

    if (flush && straight) {
      var royal = true;
      for (i = 0; i < distinct; i++) if (natRanks[i] < RANK_10) { royal = false; break; }
      if (royal) return wilds === 0 ? 0 : 2;
    }

    if (maxOfRank + wilds >= 5) return 3;
    if (flush && straight) return 4;
    if (maxOfRank + wilds >= 4) return 5;
    // Exactly two natural ranks always makes a full house once four of a kind
    // has been ruled out above.
    if (distinct === 2) return 6;
    if (flush) return 7;
    if (straight) return 8;
    if (maxOfRank + wilds >= 3) return 9;
    return -1;
  }

  return {
    cardRank: cardRank,
    cardSuit: cardSuit,
    makeCard: makeCard,
    evaluateHand: evaluateHand,
    evaluateDeucesWild: evaluateDeucesWild,
    evaluateBonusPoker: evaluateBonusPoker,
    evaluateDoubleDoubleBonus: evaluateDoubleDoubleBonus,
    DECK: DECK,
    RANK_J: RANK_J,
    RANK_A: RANK_A,
    RANK_10: RANK_10
  };
})();
