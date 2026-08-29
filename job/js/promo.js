/**
 * Jacks or Bettor — Promo, bankroll, and W-2G math
 *
 * Everything here is derived from a game's pay table plus (where available)
 * its hand frequencies under optimal play. Returns and variance are exact
 * dot products against those frequencies — see JOB_FREQUENCIES in data.js.
 */

var Promo = (function () {
  "use strict";

  /** Dollar payout for one hand at a given denom and coins bet. */
  function handPayout(hand, denom, coins) {
    var perCoin = coins === MAX_COINS ? hand.maxPay : hand.pay;
    return perCoin * coins * denom;
  }

  /** True if every hand in the game carries a verified frequency. */
  function hasFrequencies(game) {
    for (var i = 0; i < game.hands.length; i++) {
      if (typeof game.hands[i].freq !== "number") return false;
    }
    return true;
  }

  /**
   * Return, variance and per-hand standard deviation, in units of amount
   * wagered. Only meaningful when the game has frequencies.
   */
  function stats(game, coins) {
    coins = coins || MAX_COINS;
    if (!hasFrequencies(game)) {
      return { known: false, ret: game.ret / 100, variance: null, sd: null };
    }
    var ret = 0, ev2 = 0;
    for (var i = 0; i < game.hands.length; i++) {
      var h = game.hands[i];
      // Short of max bet the royal pays its base rate, which costs about 1.5%
      // of return — the whole reason to play max coins.
      var pay = coins === MAX_COINS ? h.maxPay : h.pay;
      ret += h.freq * pay;
      ev2 += h.freq * pay * pay;
    }
    var variance = ev2 - ret * ret;
    return { known: true, ret: ret, variance: variance, sd: Math.sqrt(variance) };
  }

  /**
   * Which hands cross the W-2G reporting threshold at this denom, and how
   * often. Thresholds are exact from the pay table; the rate needs frequencies.
   */
  function w2gAnalysis(game, denom, coins, threshold) {
    coins = coins || MAX_COINS;
    threshold = threshold || W2G_THRESHOLD;
    var triggers = [], safe = [], rate = 0, rateKnown = true;

    for (var i = 0; i < game.hands.length; i++) {
      var h = game.hands[i];
      var amount = handPayout(h, denom, coins);
      var row = { name: h.name, amount: amount, freq: h.freq };
      if (amount >= threshold) {
        triggers.push(row);
        if (typeof h.freq === "number") rate += h.freq;
        else rateKnown = false;
      } else {
        safe.push(row);
      }
    }

    // Largest payout that still clears the threshold — shows how much headroom
    // is left before the next denom up starts triggering.
    var headroom = null;
    for (var j = 0; j < safe.length; j++) {
      if (headroom === null || safe[j].amount > headroom) headroom = safe[j].amount;
    }

    return {
      triggers: triggers,
      safe: safe,
      rate: rateKnown ? rate : null,
      oneIn: rateKnown && rate > 0 ? 1 / rate : null,
      largestSafe: headroom,
      threshold: threshold,
    };
  }

  /**
   * Coin-in required to max a capped tier-credit multiplier, and what it
   * costs to generate it on a given game at a given denom.
   *
   * opts: { game, denom, coins, tcCap, multiplier, coinInPerTc, handsPerHour }
   */
  function plan(opts) {
    var game = opts.game;
    var denom = opts.denom;
    var coins = opts.coins || MAX_COINS;
    var lines = Math.max(1, opts.lines || 1);
    var st = stats(game, coins);

    var baseTc = opts.tcCap / opts.multiplier;
    var coinIn = baseTc * opts.coinInPerTc;
    var bet = coins * denom * lines;
    var hands = coinIn / bet;
    var hours = hands / opts.handsPerHour;

    var expectedCost = coinIn * (1 - st.ret);

    // The royal is a large slice of return that you almost never collect.
    // Split it out so the typical trip is visible next to the average one.
    var royal = game.hands[0];
    var royalFreq = typeof royal.freq === "number" ? royal.freq : null;
    var royalValue = handPayout(royal, denom, coins);
    var royalChance = royalFreq === null ? null : 1 - Math.exp(-hands * royalFreq);
    var noRoyalCost = royalFreq === null
      ? null
      : coinIn * (1 - (st.ret - royalFreq * royal.maxPay));

    // Swing over the full run, in dollars, at this line count.
    var lv = linesVariance(game, lines, coins);
    var swing = lv.known ? lv.sd * Math.sqrt(hands) * bet : null;

    var w2g = w2gAnalysis(game, denom, coins, opts.threshold);
    var expectedW2g = w2g.rate === null ? null : hands * w2g.rate;
    var w2gChance = expectedW2g === null ? null : 1 - Math.exp(-expectedW2g);

    var ruin = lv.known
      ? riskOfRuin(opts.bankroll || 0, bet, hands, st.ret, lv.variance) : null;

    return {
      baseTc: baseTc,
      coinIn: coinIn,
      bet: bet,
      lines: lines,
      linesVariance: lv,
      ruin: ruin,
      bankrollFor5: lv.known ? bankrollFor(0.05, bet, hands, st.ret, lv.variance) : null,
      bankrollFor1: lv.known ? bankrollFor(0.01, bet, hands, st.ret, lv.variance) : null,
      hands: hands,
      hours: hours,
      ret: st.ret,
      expectedCost: expectedCost,
      noRoyalCost: noRoyalCost,
      royalChance: royalChance,
      royalValue: royalValue,
      swing: swing,
      bankroll: swing === null ? null : expectedCost + 2 * swing,
      w2g: w2g,
      expectedW2g: expectedW2g,
      w2gChance: w2gChance,
    };
  }

  /**
   * Highest denomination at which handpays stay rare, plus the hand that
   * breaks it at the next step up.
   *
   * "Rare" is judged per hand dealt, not per promo, so the answer doesn't
   * move when the promo gets longer or shorter. Default is one handpay per
   * 2000 hands — roughly once every three hours at normal speed.
   */
  function denomCeiling(game, denoms, threshold, coins, rareRate, lines) {
    rareRate = rareRate || 1 / 2000;
    coins = coins || MAX_COINS;
    lines = Math.max(1, lines || 1);
    var ceiling = null, breaks = null;

    // Judged through w2gLines, so the line count counts: on a multi-play
    // machine the held cards pay on every line at once, which reaches the
    // threshold at a far lower denomination than a single line would.
    for (var i = 0; i < denoms.length; i++) {
      var w = w2gLines(game, denoms[i], lines, coins, threshold);
      if (!w.known) return { known: false, denom: null, breaksAt: null, hand: null, lines: lines };
      if (w.rate <= rareRate) {
        ceiling = denoms[i];
      } else {
        breaks = { denom: denoms[i], w2g: w };
        break;
      }
    }

    // Which hand newly crossed at the breaking denomination.
    var hand = null;
    if (breaks) {
      var seen = {};
      if (ceiling !== null) {
        var below = w2gLines(game, ceiling, lines, coins, threshold);
        below.perLineHands.concat(below.replicatedHands)
          .forEach(function (t) { seen[t.name] = true; });
      }
      var fresh = breaks.w2g.perLineHands.concat(breaks.w2g.replicatedHands)
        .filter(function (t) { return !seen[t.name]; });
      // Report the most frequent newcomer — the one that will actually bite.
      fresh.forEach(function (t) {
        var g = null;
        for (var k = 0; k < game.hands.length; k++) if (game.hands[k].name === t.name) g = game.hands[k];
        var f = g ? Math.max(g.freq || 0, g.dealt || 0) : 0;
        if (hand === null || f > hand._f) hand = { name: t.name, amount: t.amount, _f: f };
      });
    }

    return {
      known: true,
      denom: ceiling,
      breaksAt: breaks ? breaks.denom : null,
      hand: hand,
      rareRate: rareRate,
      lines: lines,
    };
  }

  /**
   * W-2G analysis straight off a payout schedule, for scraped games that
   * aren't in GAMES. Payouts are per-coin, royal already at its max-bet
   * value, ordered low hand to high. Names are optional.
   */
  function w2gForPayouts(payouts, names, denom, coins, threshold) {
    coins = coins || MAX_COINS;
    threshold = threshold || W2G_THRESHOLD;
    var triggers = [], largestSafe = null;
    for (var i = 0; i < payouts.length; i++) {
      var amount = payouts[i] * coins * denom;
      var name = names && names[i] ? names[i] : "Tier " + (i + 1);
      if (amount >= threshold) triggers.push({ name: name, amount: amount });
      else if (largestSafe === null || amount > largestSafe) largestSafe = amount;
    }
    return { triggers: triggers, largestSafe: largestSafe, threshold: threshold };
  }



  /**
   * Expected handpays per deal on an n-play machine.
   *
   * Two mechanisms, partitioned so nothing is counted twice:
   *
   *  - a single line reaching the threshold on its own. Each line draws
   *    independently, so this scales with the line count and uses final-hand
   *    frequencies.
   *  - the held cards already paying. They are copied to every line, so the
   *    hand lands on all of them at once and the aggregate can reach the
   *    threshold even when no single line comes close. This one uses *dealt*
   *    probabilities, and applies only to hands that don't already qualify
   *    on a single line.
   *
   * The second mechanism is why more lines is not automatically safer: at ten
   * lines of 50c a royal pays $2,000 on any one line and you have ten shots at
   * it, while at a hundred lines of a nickel no single line can reach $1,200
   * at all.
   */
  function w2gLines(game, denom, lines, coins, threshold) {
    coins = coins || MAX_COINS;
    threshold = threshold || W2G_THRESHOLD;
    lines = Math.max(1, lines || 1);

    var perLine = 0, replicated = 0, known = true;
    var perLineHands = [], replicatedHands = [];

    for (var i = 0; i < game.hands.length; i++) {
      var h = game.hands[i];
      var one = handPayout(h, denom, coins);
      if (one >= threshold) {
        if (typeof h.freq !== "number") { known = false; continue; }
        perLine += lines * h.freq;
        perLineHands.push({ name: h.name, amount: one });
      } else if (one * lines >= threshold) {
        if (typeof h.dealt !== "number") { known = false; continue; }
        replicated += h.dealt;
        replicatedHands.push({ name: h.name, amount: one * lines });
      }
    }

    var rate = perLine + replicated;
    return {
      known: known,
      rate: rate,
      oneIn: rate > 0 ? 1 / rate : null,
      perLine: perLine,
      replicated: replicated,
      perLineHands: perLineHands,
      replicatedHands: replicatedHands,
    };
  }

  /**
   * Variance per unit wagered on an n-play machine.
   *
   * One hand is dealt, the hold is copied to every line, and each line draws
   * from its own deck — so given the hold the lines are independent, and the
   * shared hold is the only thing correlating them:
   *
   *   Var(mean of n lines) = Var(X)/n + (n-1)/n * Cov(line_i, line_j)
   *
   * with Cov equal to the between-hand variance. Note this is variance per
   * unit *wagered*: an n-play hand also wagers n times as much, so the swing
   * in dollars per hand still grows with n — it just grows slower than n.
   */
  function linesVariance(game, lines, coins) {
    var st = stats(game, coins);
    if (!st.known) return { known: false, variance: null, sd: null, estimated: false };
    var measured = typeof VAR_BETWEEN[game.key] === "number";
    var between = measured ? VAR_BETWEEN[game.key] : VAR_BETWEEN_RATIO * st.variance;
    var n = Math.max(1, lines || 1);
    var v = st.variance / n + ((n - 1) / n) * between;
    return { known: true, variance: v, sd: Math.sqrt(v), between: between, estimated: !measured };
  }

  /** Standard normal CDF (Zelen & Severo); accurate to about 7.5e-8. */
  function normalCdf(z) {
    var t = 1 / (1 + 0.2316419 * Math.abs(z));
    var d = 0.3989422804014327 * Math.exp(-z * z / 2);
    var p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
            t * (-1.821255978 + t * 1.330274429))));
    return z > 0 ? 1 - p : p;
  }

  /**
   * Probability of going broke at some point during a finite session.
   *
   * Not the textbook risk of ruin, which assumes unlimited play — at a
   * negative edge that answer is always 1, which tells you nothing. This is
   * the first-passage probability for a random walk with drift over a fixed
   * number of hands: the chance the bankroll touches zero at any point before
   * the session ends, not merely that it finishes down.
   *
   * @param {number} bankroll - dollars available
   * @param {number} bet      - dollars per hand
   * @param {number} hands    - hands to be played
   * @param {number} ret      - return per unit wagered (0.9954 etc.)
   * @param {number} variance - variance per unit wagered
   */
  function riskOfRuin(bankroll, bet, hands, ret, variance) {
    if (!(bankroll > 0) || !(bet > 0) || !(hands > 0) || !(variance > 0)) return null;
    var B = bankroll / bet;              // bankroll in bet units
    var mu = ret - 1;                    // drift per hand, negative at a house edge
    var sd = Math.sqrt(variance);
    var root = sd * Math.sqrt(hands);
    var first = normalCdf((-B - mu * hands) / root);
    // exp() can overflow for a deep bankroll at a steep edge; it is a
    // probability either way, so clamp rather than return Infinity.
    var expTerm = Math.exp(-2 * mu * B / variance);
    var second = normalCdf((-B + mu * hands) / root);
    var p = first + (isFinite(expTerm) ? expTerm * second : 0);
    return Math.max(0, Math.min(1, p));
  }

  /** Bankroll needed to hold ruin probability at or under `target`. */
  function bankrollFor(target, bet, hands, ret, variance) {
    if (!(bet > 0) || !(hands > 0) || !(variance > 0)) return null;
    var lo = 0, hi = bet * Math.sqrt(variance * hands) * 12;
    for (var i = 0; i < 60; i++) {
      var mid = (lo + hi) / 2;
      if (riskOfRuin(mid, bet, hands, ret, variance) > target) lo = mid; else hi = mid;
    }
    return hi;
  }


  return {
    handPayout: handPayout,
    hasFrequencies: hasFrequencies,
    stats: stats,
    linesVariance: linesVariance,
    w2gLines: w2gLines,
    riskOfRuin: riskOfRuin,
    bankrollFor: bankrollFor,
    w2gAnalysis: w2gAnalysis,
    denomCeiling: denomCeiling,
    w2gForPayouts: w2gForPayouts,
    plan: plan,
  };
})();
