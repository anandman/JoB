/**
 * Bettor or Bust — Betting strategies and session risk
 *
 * Three things can move your result, and only two of them move the house edge:
 *
 *   Rules      change the edge. Chosen at the table, before you sit.
 *   Counting   changes the edge, by wagering more when the shoe is good.
 *   Progressions change NOTHING about the edge. Expected loss is linear in the
 *              amount wagered, so no staking pattern touches it. What they
 *              change is the shape of the outcome — and at matched average bet
 *              they can only make it worse, because variance is quadratic
 *              (Var = sum of b_i^2 Var(X)) and that sum is minimised when every
 *              bet is equal. Flat betting is variance-minimal, and ruin follows
 *              variance. This is an inequality, not a simulation result.
 *
 * Every strategy is therefore reported beside a flat bet at its OWN average,
 * which is the only comparison that means anything.
 */

var BJRisk = (function () {
  "use strict";

  var E = BJEngine;

  /* ===== Counting systems ===== */

  // Tags by rank index: 0 = A, 1..8 = 2..9, 9 = any ten-value card.
  // Ranked by betting correlation, derived from each rank's effect of removal
  // (see tools/verify-blackjack.js). The simple level-1 systems win: the
  // level-2 systems are tuned for playing deviations, not for betting.
  var SYSTEMS = [
    {
      key: "ko", name: "KO (Knock-Out)", bc: 0.972, balanced: false,
      tags: [-1, 1, 1, 1, 1, 1, 1, 0, 0, -1],
      blurb: "2 through 7 count +1, 8 and 9 count nothing, tens and aces count −1. " +
             "Unbalanced, so there is no division: you bet off the running count " +
             "directly. The simplest system that works — no true count, no card colours.",
      irc: function (decks) { return 4 - 4 * decks; }
    },
    {
      key: "red7", name: "Red 7", bc: 0.979, balanced: false,
      tags: [-1, 1, 1, 1, 1, 1, 0.5, 0, 0, -1],
      blurb: "2 through 6 count +1, red 7s count +1 and black 7s count nothing, " +
             "tens and aces count −1. Unbalanced, so no division. Fractionally the " +
             "most accurate of these for betting, at the cost of tracking suit colour.",
      irc: function (decks) { return -2 * decks; }
    },
    {
      key: "hilo", name: "Hi-Lo", bc: 0.964, balanced: true,
      tags: [-1, 1, 1, 1, 1, 1, 0, 0, 0, -1],
      blurb: "2 through 6 count +1, 7 through 9 count nothing, tens and aces count −1. " +
             "Balanced, so the running count must be divided by the decks remaining " +
             "to get a true count. The most documented system, and the one every " +
             "published index is written for.",
      irc: function () { return 0; }
    }
  ];

  function system(key) {
    for (var i = 0; i < SYSTEMS.length; i++) if (SYSTEMS[i].key === key) return SYSTEMS[i];
    return SYSTEMS[0];
  }

  /* ===== Strategy library ===== */

  // `spell` is the strategy in words. A staking plan you cannot read is a
  // staking plan you cannot check, so every entry carries one.
  var STRATEGIES = [
    {
      key: "flat", name: "Flat betting", kind: "progression",
      spell: "Bet the same amount every hand, whatever just happened.",
      why: "Provably the lowest risk of ruin available for a given average bet. " +
           "Nothing else here beats it, and everything else here is compared to it.",
      params: ["base"],
      spec: function (p) {
        return { base: p.base, unit: 0, cap: p.base, mode: "add",
                 onWin: "hold", onPush: "hold", onLoss: "hold" };
      }
    },
    {
      key: "ladder", name: "Positive progression", kind: "progression",
      spell: "Start at the base bet. After any hand you win money on, raise your bet " +
             "by one step. After any losing hand, drop straight back to the base. " +
             "A push leaves the bet where it is.",
      why: "Presses winning streaks, so the right tail is genuinely fatter. It does " +
           "not reduce ruin: it raises your average bet, and at that same average a " +
           "flat bet is safer.",
      params: ["base", "step"],
      spec: function (p) {
        return { base: p.base, unit: p.step, cap: p.cap, mode: "add",
                 onWin: "up", onPush: "hold", onLoss: "reset" };
      }
    },
    {
      key: "martingale", name: "Martingale", kind: "progression",
      spell: "Double your bet after every loss. Go back to the base bet after any win. " +
             "Stop doubling at the cap.",
      why: "Each win recovers the whole losing streak plus one base bet, which is why " +
           "it feels safe. The cap and your bankroll are what break it, and they break " +
           "it all at once — the losses that end a streak are enormous.",
      params: ["base"],
      spec: function (p) {
        return { base: p.base, unit: 0, factor: 2, cap: p.cap, mode: "multiply",
                 onWin: "reset", onPush: "hold", onLoss: "up" };
      }
    },
    {
      key: "dalembert", name: "d'Alembert", kind: "progression",
      spell: "Raise your bet by one step after a loss. Lower it by one step after a win. " +
             "Never go below the base.",
      why: "A gentler way of chasing losses than Martingale, with the same defect: it " +
           "puts the most money at risk exactly when your bankroll is lowest.",
      params: ["base", "step"],
      spec: function (p) {
        return { base: p.base, unit: p.step, cap: p.cap, mode: "add",
                 onWin: "down", onPush: "hold", onLoss: "up" };
      }
    },
    {
      key: "paroli", name: "Paroli", kind: "progression",
      spell: "Double your bet after each win. After the cap is reached, or after any " +
             "loss, go back to the base.",
      why: "A positive progression that gives back less than the ladder on a broken " +
           "streak, because it resets itself at the top.",
      params: ["base"],
      spec: function (p) {
        return { base: p.base, unit: 0, factor: 2, cap: p.cap, mode: "multiply",
                 onWin: "up", onPush: "hold", onLoss: "reset" };
      }
    },
    {
      key: "count", name: "Card counting", kind: "counting",
      spell: "Keep a running count of the cards you have seen. Bet the minimum while " +
             "the count is low, and raise your bet as it climbs — the count tells you " +
             "when the undealt shoe is rich in tens and aces.",
      why: "The only thing on this list that changes the house edge rather than just " +
           "the shape of the outcome. It works by wagering more when you actually " +
           "have the advantage.",
      params: ["base", "spread", "threshold", "systemKey"]
    }
  ];

  function strategy(key) {
    for (var i = 0; i < STRATEGIES.length; i++) if (STRATEGIES[i].key === key) return STRATEGIES[i];
    return STRATEGIES[0];
  }

  /* ===== The generic progression model =====
   *
   * A level counter plus one action per outcome. That single shape covers flat
   * betting, positive ladders, Martingale, d'Alembert and Paroli. Systems that
   * carry their own state — Labouchere, Oscar's Grind — do NOT fit, and are
   * left out rather than approximated into something that isn't them.
   */

  function build(spec) {
    var levels = [], i, bet;
    for (i = 0; ; i++) {
      bet = spec.mode === "multiply" ? spec.base * Math.pow(spec.factor, i)
                                     : spec.base + i * spec.unit;
      if (bet > spec.cap + 1e-9 || levels.length > 64) break;
      levels.push(bet);
      if (spec.mode === "add" && !spec.unit) break;
    }
    if (!levels.length) levels = [spec.base];
    function move(lvl, act) {
      return act === "up" ? Math.min(lvl + 1, levels.length - 1)
           : act === "down" ? Math.max(lvl - 1, 0)
           : act === "reset" ? 0 : lvl;
    }
    return {
      levels: levels,
      bet: function (lvl) { return levels[lvl]; },
      step: function (lvl, net) {
        return move(lvl, net > 0 ? spec.onWin : net < 0 ? spec.onLoss : spec.onPush);
      }
    };
  }

  /** A count-driven bet ramp: flat minimum until the count clears `threshold`. */
  function buildCount(p) {
    var sys = system(p.systemKey);
    // The cap is the table limit and binds here exactly as it binds a
    // progression. Without it a 1-8 spread quietly bet eight times the base no
    // matter what maximum the player had set.
    var top = p.cap ? Math.min(p.base * p.spread, p.cap) : p.base * p.spread;
    return {
      counting: true,
      sysKey: sys.key,
      balanced: sys.balanced,
      levels: [p.base, top],
      bet: function (lvl, count) {
        var over = count - p.threshold;
        if (over <= 0) return p.base;
        return Math.min(top, p.base * (1 + over));
      },
      step: function () { return 0; }
    };
  }

  function fromParams(key, p) {
    var s = strategy(key);
    return s.kind === "counting" ? buildCount(p) : build(s.spec(p));
  }

  /* ===== Outcome stream ===== */

  /**
   * A long stream of hand results in units of that hand's nominal bet, with the
   * count as it stood BEFORE each hand — which is exactly what a counter knows
   * when the bet goes down.
   *
   * The shoe is real and depleting, so the outcomes already carry the count's
   * effect. Nothing here estimates an edge from the composition; it is measured.
   *
   * Play is fixed basic strategy at every count, which is what a betting-only
   * counter actually does. Index deviations would add roughly a fifth again to
   * counting's value and are not modelled.
   */
  function outcomeStream(rules, n, seed, onProgress) {
    var G = BJGame, S = BJStrategy;
    var s = seed >>> 0;
    // Math.imul: a plain multiply overflows double precision, and the low bits
    // that survive the mask are the corrupted ones.
    var rnd = function () { return (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };

    var cache = {};
    function decide(cards, up, legal) {
      var k = cards.slice().sort().join(",") + "|" + up + "|" + legal.join(",");
      var a = cache[k];
      if (a === undefined) {
        var c = E.freshShoe(rules.decks), i;
        for (i = 0; i < cards.length; i++) c[cards[i]]--;
        c[up]--;
        var r = E.actions(cards, up, c, rules, { infinite: true });
        var f = r.actions.filter(function (x) { return legal.indexOf(x.action) >= 0; });
        a = (f[0] || { action: "stand" }).action;
        cache[k] = a;
      }
      return a;
    }

    var full = E.freshShoe(rules.decks);
    var nets = new Float32Array(n);
    var counts = {};
    SYSTEMS.forEach(function (sy) { counts[sy.key] = new Float32Array(n); });

    var st = G.create(rules);
    for (var i = 0; i < n; i++) {
      var left = E.countCards(st.counts) / 52;
      SYSTEMS.forEach(function (sy) {
        var rc = sy.irc(rules.decks), r;
        for (r = 0; r < 10; r++) rc += (full[r] - st.counts[r]) * sy.tags[r];
        // Balanced systems need a true count; unbalanced ones are read raw.
        counts[sy.key][i] = sy.balanced ? rc / Math.max(0.5, left) : rc;
      });

      G.deal(st, rnd);
      var guard = 0;
      while (st.phase === "player" && guard++ < 40) {
        var legal = G.legalActions(st);
        if (!legal.length) { st.hands[st.active].done = true; G.act(st, "stand", rnd, { grade: false }); continue; }
        G.act(st, decide(G.hand(st).cards, G.upcard(st), legal), rnd, { grade: false });
      }
      nets[i] = st.result ? st.result.net : 0;
      if (onProgress && (i & 32767) === 0) onProgress(i / n);
    }
    return { net: nets, counts: counts, n: n };
  }

  /* ===== Sessions ===== */

  function runSessions(stream, strat, opts) {
    var bankroll = opts.bankroll, hands = opts.hands, sessions = opts.sessions;
    var counts = strat.counting ? stream.counts[strat.sysKey] : null;
    var span = stream.n - hands - 1;
    var s = (opts.seed || 12345) >>> 0;
    var rnd = function () { return (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; };

    var ruined = 0, ahead = 0, wagered = 0, betCount = 0, sum = 0;
    var finals = new Float64Array(sessions);

    for (var k = 0; k < sessions; k++) {
      var start = Math.floor(rnd() * span);
      var bank = bankroll, lvl = 0, dead = false;
      for (var h = 0; h < hands; h++) {
        var want = strat.counting ? strat.bet(0, counts[start + h]) : strat.bet(lvl);
        var bet = Math.min(want, bank);
        if (bank <= 0) { dead = true; break; }
        var net = stream.net[start + h];
        wagered += bet; betCount++;
        bank += net * bet;
        lvl = strat.step(lvl, net);
        if (bank <= 0) { dead = true; break; }
      }
      if (dead) { ruined++; bank = 0; }
      finals[k] = bank;
      sum += bank;
      if (bank > bankroll) ahead++;
    }

    var sorted = Float64Array.from(finals).sort();
    function q(p) { return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]; }
    return {
      avgBet: wagered / betCount,
      totalAction: (wagered / betCount) * hands,
      ruin: ruined / sessions,
      ahead: ahead / sessions,
      mean: sum / sessions,
      p05: q(0.05), median: q(0.5), p95: q(0.95)
    };
  }

  function flat(amount) {
    return { levels: [amount], bet: function () { return amount; }, step: function () { return 0; } };
  }

  /** Smallest bankroll holding ruin at or below `target`, by bisection. */
  function bankrollFor(stream, strat, opts, target) {
    var lo = 0, hi = strat.levels[strat.levels.length - 1] * 400;
    for (var i = 0; i < 14; i++) {
      var mid = (lo + hi) / 2;
      var r = runSessions(stream, strat, {
        bankroll: mid, hands: opts.hands, sessions: Math.min(opts.sessions, 4000), seed: opts.seed
      });
      if (r.ruin > target) lo = mid; else hi = mid;
    }
    return hi;
  }

  return {
    SYSTEMS: SYSTEMS,
    STRATEGIES: STRATEGIES,
    system: system,
    strategy: strategy,
    build: build,
    fromParams: fromParams,
    flat: flat,
    outcomeStream: outcomeStream,
    runSessions: runSessions,
    bankrollFor: bankrollFor
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BJRisk;
