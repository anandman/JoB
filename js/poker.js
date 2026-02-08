/**
 * Jacks or Betterment — Card representation + hand evaluator
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

  return {
    cardRank: cardRank,
    cardSuit: cardSuit,
    makeCard: makeCard,
    evaluateHand: evaluateHand,
    DECK: DECK,
    RANK_J: RANK_J,
    RANK_A: RANK_A,
    RANK_10: RANK_10
  };
})();
