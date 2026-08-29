/**
 * Jacks or Bettorment — Hand analyzer
 *
 * Prices all 32 ways to hold a dealt hand and ranks them. Nothing here is an
 * approximation: each hold's expected value comes from enumerating every draw
 * that can follow it, the same computation the strategy engine uses, so the
 * top-ranked hold is the correct play and the gap to any other hold is exactly
 * what that mistake costs.
 */

var Analyzer = (function () {
  "use strict";

  var RANK_LABELS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
  var SUIT_LABELS = ["♣", "♦", "♥", "♠"]; // clubs diamonds hearts spades

  function cardRank(c) { return c >> 2; }
  function cardSuit(c) { return c & 3; }
  function cardLabel(c) { return RANK_LABELS[cardRank(c)] + SUIT_LABELS[cardSuit(c)]; }
  function isRed(c) { var s = cardSuit(c); return s === 1 || s === 2; }

  /** Which evaluator a game needs. Wild-card games score nothing like the rest. */
  function evaluatorFor(gameKey) {
    if (gameKey.indexOf("bp-") === 0) return Poker.evaluateBonusPoker;
    if (gameKey.indexOf("ddb-") === 0) return Poker.evaluateDoubleDoubleBonus;
    if (gameKey === "nsud" || gameKey.indexOf("dw-") === 0) return Poker.evaluateDeucesWild;
    return Poker.evaluateHand;
  }

  function remainingDeck(cards) {
    var inHand = {}, deck = [], i;
    for (i = 0; i < cards.length; i++) inHand[cards[i]] = true;
    for (i = 0; i < 52; i++) if (!inHand[i]) deck.push(i);
    return deck;
  }

  /**
   * Every hold ranked by expected value, best first.
   * @param {number[]} cards - five card integers
   * @param {object} game - a GAMES entry
   */
  function analyze(cards, game) {
    var evaluate = evaluatorFor(game.key);
    var payouts = game.hands.map(function (h) { return h.maxPay; });
    var deck = remainingDeck(cards);
    var holds = [];

    for (var mask = 0; mask < 32; mask++) {
      var idx = [], held = [];
      for (var i = 0; i < 5; i++) {
        if (mask & (1 << i)) { idx.push(i); held.push(cards[i]); }
      }
      holds.push({
        mask: mask,
        indices: idx,
        cards: held,
        ev: StrategyEngine.computeHoldEV(held, deck, payouts, evaluate),
      });
    }

    holds.sort(function (a, b) { return b.ev - a.ev; });
    var best = holds[0].ev;
    holds.forEach(function (h) { h.cost = best - h.ev; });
    return { holds: holds, best: holds[0], deck: deck };
  }

  /**
   * How a given hold actually turns out: the chance of each paying hand, and
   * of nothing. Walks every draw combination once.
   */
  function distribution(cards, indices, game) {
    var evaluate = evaluatorFor(game.key);
    var deck = remainingDeck(cards);
    var held = indices.map(function (i) { return cards[i]; });
    var numDraw = 5 - held.length;
    var counts = new Array(game.hands.length + 1);
    for (var i = 0; i <= game.hands.length; i++) counts[i] = 0;
    var total = 0;

    var pick = [0, 0, 0, 0, 0];
    function walk(depth, start) {
      if (depth === numDraw) {
        var h = held.concat(pick.slice(0, numDraw));
        var r = evaluate(h[0], h[1], h[2], h[3], h[4]);
        counts[r === -1 ? game.hands.length : r]++;
        total++;
        return;
      }
      for (var d = start; d < deck.length; d++) {
        pick[depth] = deck[d];
        walk(depth + 1, d + 1);
      }
    }
    walk(0, 0);

    var rows = [];
    for (i = 0; i < game.hands.length; i++) {
      if (!counts[i]) continue;
      rows.push({
        name: game.hands[i].name,
        pay: game.hands[i].maxPay,
        count: counts[i],
        prob: counts[i] / total,
      });
    }
    rows.push({ name: "Nothing", pay: 0, count: counts[game.hands.length],
                prob: counts[game.hands.length] / total });
    return { rows: rows, total: total };
  }

  /** Label for a hold, e.g. "10♠ J♠ Q♠" or "discard everything". */
  function holdLabel(hold) {
    if (!hold.cards.length) return "Discard everything";
    return hold.cards.map(cardLabel).join(" ");
  }

  return {
    RANK_LABELS: RANK_LABELS,
    SUIT_LABELS: SUIT_LABELS,
    cardRank: cardRank,
    cardSuit: cardSuit,
    cardLabel: cardLabel,
    isRed: isRed,
    evaluatorFor: evaluatorFor,
    analyze: analyze,
    distribution: distribution,
    holdLabel: holdLabel,
  };
})();
