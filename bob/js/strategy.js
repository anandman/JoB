/**
 * Bettor or Bust — Basic strategy chart and house edge
 *
 * Both are derived, never tabulated. The chart is the engine's action grid
 * collapsed to its best action per cell; the house edge is the same EVs
 * weighted by how often each deal happens. Change a rule and both move,
 * because neither is a stored answer.
 */

var BJStrategy = (function () {
  "use strict";

  var E = BJEngine;
  var ACE = E.ACE, TEN = E.TEN;

  var UPCARDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0];   // rank indices, 2..10 then A
  var UP_LABELS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "A"];

  var CODE = { stand: "S", hit: "H", double: "D", split: "P", surrender: "R" };

  /**
   * A representative two-card hand for a chart row.
   *
   * Hard 20 can only be made from two ten-value cards, so that row's hand is a
   * pair — the split option is filtered out of the hard chart, which is where
   * published charts put it too.
   */
  function hardCards(total) {
    if (total <= 11) return [1, total - 3];       // 2 + (total-2)
    return [TEN, total - 11];                     // 10 + (total-10)
  }
  function softCards(total) { return [ACE, total - 12]; }   // A + (total-11)

  function removeCards(counts, cards) {
    var c = counts.slice(), i;
    for (i = 0; i < cards.length; i++) c[cards[i]]--;
    return c;
  }

  // `opts.shoe` lets a caller price a DEPLETED composition rather than a fresh
  // shoe — which is what a count is: a claim about what is left.
  function shoeFor(rules, opts) {
    return (opts && opts.shoe) ? opts.shoe.slice() : E.freshShoe(rules.decks);
  }

  /**
   * Best action for one cell. `allow` filters the action list — the hard and
   * soft charts drop split, which only the pairs chart decides.
   */
  function cell(cards, up, rules, opts, allow) {
    var counts = removeCards(shoeFor(rules, opts), cards.concat([up]));
    var res = E.actions(cards, up, counts, rules, opts);
    var list = res.actions;
    if (allow) {
      list = list.filter(function (a) { return allow[a.action]; });
    }
    // Doubling and surrender are only offered when they beat the alternative
    // you would fall back to, so record that fallback for display.
    return { action: list[0].action, ev: list[0].ev, actions: list };
  }

  var NO_SPLIT = { stand: 1, hit: 1, "double": 1, surrender: 1 };
  var ALL = null;

  function chart(rules, opts) {
    opts = opts || {};
    var hard = [], soft = [], pairs = [], t, r, row, u;

    for (t = 5; t <= 20; t++) {
      row = { label: String(t), total: t, cells: [] };
      for (u = 0; u < UPCARDS.length; u++) {
        row.cells.push(cell(hardCards(t), UPCARDS[u], rules, opts, NO_SPLIT));
      }
      hard.push(row);
    }

    for (t = 13; t <= 20; t++) {
      row = { label: "A," + (t - 11), total: t, cells: [] };
      for (u = 0; u < UPCARDS.length; u++) {
        row.cells.push(cell(softCards(t), UPCARDS[u], rules, opts, NO_SPLIT));
      }
      soft.push(row);
    }

    for (r = 0; r < E.RANKS; r++) {
      row = { label: E.RANK_LABELS[r] + "," + E.RANK_LABELS[r], rank: r, cells: [] };
      for (u = 0; u < UPCARDS.length; u++) {
        row.cells.push(cell([r, r], UPCARDS[u], rules, opts, ALL));
      }
      pairs.push(row);
    }

    return { hard: hard, soft: soft, pairs: pairs,
             upcards: UPCARDS, upLabels: UP_LABELS };
  }

  /**
   * Expected value per unit wagered, over every opening deal.
   *
   * Peek games resolve a dealer blackjack before the player acts, so it is
   * split out here rather than folded into the dealer distribution: the player
   * loses one unit (pushes with a blackjack of their own), and every other
   * branch is conditioned on the dealer NOT having it — which is exactly what
   * `dealerVector` returns.
   */
  function houseEdge(rules, opts) {
    opts = opts || {};
    var shoe = shoeFor(rules, opts);
    var N = E.countCards(shoe);
    var ev = 0, a, b, u;

    for (a = 0; a < E.RANKS; a++) {
      for (b = a; b < E.RANKS; b++) {
        var pPair = (a === b)
          ? (shoe[a] / N) * ((shoe[a] - 1) / (N - 1))
          : 2 * (shoe[a] / N) * (shoe[b] / (N - 1));
        if (pPair <= 0) continue;

        var afterPlayer = removeCards(shoe, [a, b]);
        var remA = N - 2;

        for (u = 0; u < E.RANKS; u++) {
          if (!afterPlayer[u]) continue;
          var pUp = afterPlayer[u] / remA;
          var counts = removeCards(afterPlayer, [u]);
          var rem = remA - 1;

          var pDealerBJ = 0;
          if (rules.peek) {
            if (u === ACE) pDealerBJ = counts[TEN] / rem;
            else if (u === TEN) pDealerBJ = counts[ACE] / rem;
          }

          var cellEv;
          if (E.isBlackjack([a, b])) {
            cellEv = pDealerBJ * 0 + (1 - pDealerBJ) * rules.blackjackPays;
          } else {
            var best = E.actions([a, b], u, counts, rules, opts).best.ev;
            cellEv = pDealerBJ * -1 + (1 - pDealerBJ) * best;
          }
          ev += pPair * pUp * cellEv;
        }
      }
    }
    return ev;
  }

  return {
    UPCARDS: UPCARDS,
    UP_LABELS: UP_LABELS,
    CODE: CODE,
    hardCards: hardCards,
    softCards: softCards,
    removeCards: removeCards,
    cell: cell,
    chart: chart,
    houseEdge: houseEdge
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BJStrategy;
