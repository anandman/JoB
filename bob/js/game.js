/**
 * Bettor or Bust — Shoe, dealing, and hand resolution
 *
 * Play mode's mechanics. Scoring lives here too, but the numbers it scores
 * against come from BJEngine — a decision is graded by the gap between the
 * action taken and the best one, never against a stored chart. A tie counts as
 * correct, and a mistake is priced at exactly what it gave up.
 *
 * One subtlety worth stating: when grading a decision the hole card is put
 * BACK into the composition. The player cannot see it, so scoring against a
 * shoe that knows where it went would grade them against information they
 * never had.
 */

var BJGame = (function () {
  "use strict";

  var E = BJEngine;

  function newShoe(rules) { return E.freshShoe(rules.decks); }

  function draw(state, rnd) {
    var rem = E.countCards(state.counts);
    var x = Math.floor(rnd() * rem), r;
    for (r = 0; r < E.RANKS; r++) {
      x -= state.counts[r];
      if (x < 0) { state.counts[r]--; return r; }
    }
    return E.TEN;   // unreachable barring float drift
  }

  function needsShuffle(state) {
    if (state.rules.csm) return true;
    var full = 52 * state.rules.decks;
    return E.countCards(state.counts) < full * 0.25;   // ~75% penetration
  }

  function create(rules) {
    return { rules: rules, counts: newShoe(rules), shuffles: 0,
             hands: [], active: 0, dealerCards: [], phase: "idle",
             stats: { hands: 0, decisions: 0, correct: 0, cost: 0, net: 0 } };
  }

  function newHand(cards, bet, fromSplit) {
    return { cards: cards, bet: bet, fromSplit: !!fromSplit,
             doubled: false, surrendered: false, done: false, result: null };
  }

  function deal(state, rnd) {
    if (needsShuffle(state)) { state.counts = newShoe(state.rules); state.shuffles++; }
    var p = [draw(state, rnd), draw(state, rnd)];
    var up = draw(state, rnd);
    var hole = draw(state, rnd);

    state.hands = [newHand(p, 1, false)];
    state.active = 0;
    state.dealerCards = [up, hole];
    state.phase = "player";
    state.result = null;
    state.stats.hands++;

    // Peek: a dealer blackjack ends the hand before the player acts.
    if (state.rules.peek && E.isBlackjack([up, hole])) {
      state.phase = "done";
      settle(state);
    } else if (E.isBlackjack(p)) {
      state.phase = "done";
      settle(state);
    }
    return state;
  }

  function hand(state) { return state.hands[state.active]; }
  function upcard(state) { return state.dealerCards[0]; }

  /**
   * The composition as the PLAYER can see it: the shoe plus the hole card,
   * which has left the shoe but not been shown.
   */
  function analysisCounts(state) {
    var c = state.counts.slice();
    c[state.dealerCards[1]]++;
    return c;
  }

  function legalActions(state) {
    var h = hand(state);
    if (!h || state.phase !== "player") return [];
    var s = E.handState(h.cards);
    if (E.totalOf(s) >= 21) return [];
    var out = ["hit", "stand"];
    var r = state.rules;
    var splitAcesLocked = h.fromSplit && h.cards[0] === E.ACE && !r.hitSplitAces;
    if (splitAcesLocked) return [];

    if (h.cards.length === 2) {
      var mayDouble = h.fromSplit ? r.das : true;
      if (mayDouble && E.canDouble(r, s, 2)) out.push("double");
      if (h.cards[0] === h.cards[1] && state.hands.length < r.resplitTo &&
          (h.cards[0] !== E.ACE || !h.fromSplit || r.resplitAces)) {
        out.push("split");
      }
      if (r.surrender === "late" && !h.fromSplit && state.hands.length === 1) {
        out.push("surrender");
      }
    }
    return out;
  }

  /** Grade a decision before applying it. */
  function grade(state, action) {
    var h = hand(state);
    var res = E.actions(h.cards, upcard(state), analysisCounts(state), state.rules,
                        { infinite: false });
    var legal = legalActions(state);
    var available = res.actions.filter(function (a) { return legal.indexOf(a.action) >= 0; });
    if (!available.length) return null;
    var best = available[0];
    var taken = available.filter(function (a) { return a.action === action; })[0];
    var cost = taken ? best.ev - taken.ev : 0;
    return { best: best.action, bestEv: best.ev, takenEv: taken ? taken.ev : null,
             cost: cost, correct: cost < 1e-9, actions: available };
  }

  function advance(state, rnd) {
    while (state.active < state.hands.length && state.hands[state.active].done) state.active++;
    if (state.active >= state.hands.length) {
      state.phase = "dealer";
      dealerPlay(state, rnd);
    }
  }

  // `opts.grade === false` skips the scoring analysis. Grading runs a full
  // depleting-shoe evaluation, which is the right cost for one decision at
  // human speed and completely wrong for a bulk simulation.
  function act(state, action, rnd, opts) {
    if (state.phase !== "player") return null;
    var h = hand(state);
    var g = (opts && opts.grade === false) ? null : grade(state, action);
    if (g) {
      state.stats.decisions++;
      if (g.correct) state.stats.correct++;
      else state.stats.cost += g.cost;
    }

    if (action === "hit") {
      h.cards.push(draw(state, rnd));
      if (E.totalOf(E.handState(h.cards)) >= 21) h.done = true;
    } else if (action === "stand") {
      h.done = true;
    } else if (action === "double") {
      h.bet = 2; h.doubled = true;
      h.cards.push(draw(state, rnd));
      h.done = true;
    } else if (action === "surrender") {
      h.surrendered = true; h.done = true;
    } else if (action === "split") {
      var moved = h.cards.pop();
      var extra = newHand([moved], 1, true);
      h.fromSplit = true;
      h.cards.push(draw(state, rnd));
      extra.cards.push(draw(state, rnd));
      state.hands.splice(state.active + 1, 0, extra);
      // Split aces normally get exactly one card each and stand.
      if (moved === E.ACE && !state.rules.hitSplitAces) {
        h.done = true; extra.done = true;
      }
    }
    advance(state, rnd);
    return g;
  }

  function dealerPlay(state, rnd) {
    var live = state.hands.some(function (h) {
      return !h.surrendered && E.totalOf(E.handState(h.cards)) <= 21;
    });
    if (live) {
      var s = E.handState(state.dealerCards);
      while (!dealerStands(E.totalOf(s), E.isSoft(s), state.rules.h17)) {
        var c = draw(state, rnd);
        state.dealerCards.push(c);
        s = E.handState(state.dealerCards);
      }
    }
    state.phase = "done";
    settle(state);
  }

  function dealerStands(total, soft, h17) {
    if (total > 21 || total > 17) return true;
    if (total < 17) return false;
    return !(h17 && soft);
  }

  function settle(state) {
    var r = state.rules;
    var dealerBJ = r.peek && E.isBlackjack(state.dealerCards);
    var dt = E.totalOf(E.handState(state.dealerCards));
    var net = 0;

    state.hands.forEach(function (h) {
      var pt = E.totalOf(E.handState(h.cards));
      var playerBJ = !h.fromSplit && E.isBlackjack(h.cards);
      var v;
      if (h.surrendered) v = -0.5;
      else if (playerBJ && dealerBJ) v = 0;
      else if (playerBJ) v = r.blackjackPays;
      else if (dealerBJ) v = -1;
      else if (pt > 21) v = -h.bet;
      else if (dt > 21) v = h.bet;
      else if (pt > dt) v = h.bet;
      else if (pt < dt) v = -h.bet;
      else v = 0;
      h.result = v;
      net += v;
    });

    state.result = { net: net, dealerTotal: dt, dealerBlackjack: dealerBJ };
    state.stats.net += net;
    return state.result;
  }

  return {
    create: create,
    deal: deal,
    act: act,
    hand: hand,
    upcard: upcard,
    analysisCounts: analysisCounts,
    legalActions: legalActions,
    grade: grade,
    settle: settle,
    needsShuffle: needsShuffle
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BJGame;
