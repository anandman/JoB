/**
 * Bettor or Bust — Hand analyzer
 *
 * The engine's numbers, unsummarised. Where the strategy chart tells you what
 * to do, this tells you what the alternatives cost — which is the part that
 * turns a memorised rule into a decision you understand. 16 vs 10 and 8,8 vs
 * 10 are famously close; the chart cannot show you that, and this can.
 *
 * Deliberately thin: every expectation comes from BJEngine. If a number here
 * disagreed with the chart, one of them would be lying.
 */

var BJAnalyzer = (function () {
  "use strict";

  var E = BJEngine;

  var ACTION_LABELS = {
    stand: "Stand",
    hit: "Hit",
    "double": "Double",
    split: "Split",
    surrender: "Surrender"
  };

  // Analysis uses the depleting shoe model: the player's own cards are gone
  // from it, and for a borderline hand that is exactly the information the
  // total-only chart throws away.
  function analyze(playerCards, upcard, rules, removed) {
    var counts = E.freshShoe(rules.decks);
    var i, all = playerCards.concat([upcard], removed || []);
    for (i = 0; i < all.length; i++) {
      if (counts[all[i]] <= 0) return { error: "No " + E.RANK_LABELS[all[i]] + " left in the shoe." };
      counts[all[i]]--;
    }

    var res = E.actions(playerCards, upcard, counts, rules, { infinite: false });
    var best = res.best;

    var ranked = res.actions.map(function (a) {
      return {
        action: a.action,
        label: ACTION_LABELS[a.action],
        ev: a.ev,
        cost: best.ev - a.ev,          // 0 for the best action, positive for the rest
        best: a.action === best.action
      };
    });

    // How close is this call? A runner-up within a hundredth of a unit is a
    // coin flip that the chart has to round one way.
    var margin = ranked.length > 1 ? ranked[0].ev - ranked[1].ev : Infinity;

    return {
      state: res.state,
      total: E.totalOf(res.state),
      soft: E.isSoft(res.state),
      blackjack: E.isBlackjack(playerCards),
      dealer: res.dealer,
      dealerBust: res.dealer[E.BUST],
      actions: ranked,
      best: ranked[0],
      margin: margin,
      close: margin < 0.01
    };
  }

  // Dealer outcome distribution as display rows.
  function dealerRows(dv) {
    var rows = [], t;
    for (t = 17; t <= 21; t++) rows.push({ label: String(t), p: dv[t - 17] });
    rows.push({ label: "Bust", p: dv[E.BUST] });
    return rows;
  }

  function handLabel(cards) {
    var s = E.handState(cards);
    var t = E.totalOf(s);
    if (E.isBlackjack(cards)) return "Blackjack";
    if (t > 21) return "Bust (" + t + ")";
    return (E.isSoft(s) ? "Soft " : "") + t;
  }

  return {
    ACTION_LABELS: ACTION_LABELS,
    analyze: analyze,
    dealerRows: dealerRows,
    handLabel: handLabel
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BJAnalyzer;
