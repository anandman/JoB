/**
 * Jacks or Betterment — Promo, bankroll, and W-2G math
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
  function stats(game) {
    if (!hasFrequencies(game)) {
      return { known: false, ret: game.ret / 100, variance: null, sd: null };
    }
    var ret = 0, ev2 = 0;
    for (var i = 0; i < game.hands.length; i++) {
      var h = game.hands[i];
      ret += h.freq * h.maxPay;
      ev2 += h.freq * h.maxPay * h.maxPay;
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
    var st = stats(game);

    var baseTc = opts.tcCap / opts.multiplier;
    var coinIn = baseTc * opts.coinInPerTc;
    var bet = coins * denom;
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

    // Swing over the full run, in dollars.
    var swing = st.sd === null ? null : st.sd * Math.sqrt(hands) * bet;

    var w2g = w2gAnalysis(game, denom, coins, opts.threshold);
    var expectedW2g = w2g.rate === null ? null : hands * w2g.rate;
    var w2gChance = expectedW2g === null ? null : 1 - Math.exp(-expectedW2g);

    return {
      baseTc: baseTc,
      coinIn: coinIn,
      bet: bet,
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
  function denomCeiling(game, denoms, threshold, coins, rareRate) {
    rareRate = rareRate || 1 / 2000;
    coins = coins || MAX_COINS;
    var ceiling = null, breaks = null;

    for (var i = 0; i < denoms.length; i++) {
      var w = w2gAnalysis(game, denoms[i], coins, threshold);
      if (w.rate === null) return { known: false, denom: null, breaksAt: null, hand: null };
      if (w.rate <= rareRate) {
        ceiling = denoms[i];
      } else {
        breaks = { denom: denoms[i], w2g: w };
        break;
      }
    }

    // Which hand newly crossed the line at the breaking denomination.
    var hand = null;
    if (breaks && ceiling !== null) {
      var below = w2gAnalysis(game, ceiling, coins, threshold);
      var seen = {};
      below.triggers.forEach(function (t) { seen[t.name] = true; });
      breaks.w2g.triggers.forEach(function (t) {
        if (!seen[t.name] && (hand === null || (t.freq || 0) > (hand.freq || 0))) hand = t;
      });
    }

    return {
      known: true,
      denom: ceiling,
      breaksAt: breaks ? breaks.denom : null,
      hand: hand,
      rareRate: rareRate,
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
   * Split a trip window into gaming days.
   *
   * Casino gaming days roll over at a set hour (Caesars uses 6am), not at
   * midnight, so a trip that looks like one day of play can straddle two
   * earning periods — which matters when a promo cap or a daily bonus
   * resets on that boundary.
   */
  function gamingDays(start, end, resetHour) {
    if (!(start instanceof Date) || !(end instanceof Date)) return [];
    if (isNaN(start) || isNaN(end) || end <= start) return [];

    var days = [];
    var cursor = new Date(start.getTime());

    while (cursor < end) {
      // Start of the gaming day containing `cursor`.
      var dayStart = new Date(cursor.getTime());
      dayStart.setHours(resetHour, 0, 0, 0);
      if (dayStart > cursor) dayStart.setDate(dayStart.getDate() - 1);

      var dayEnd = new Date(dayStart.getTime());
      dayEnd.setDate(dayEnd.getDate() + 1);

      var from = cursor > dayStart ? cursor : dayStart;
      var to = end < dayEnd ? end : dayEnd;
      var hours = (to - from) / 3600000;

      days.push({
        label: dayStart.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
        start: from,
        end: to,
        hours: hours,
        partial: hours < 24,
      });

      cursor = dayEnd;
    }
    return days;
  }

  /**
   * Can the promo be finished inside the trip window?
   *
   * perDay = the cap resets each gaming day (so each day needs a full run);
   * otherwise the requirement is spread across the whole window.
   */
  function schedule(plan, days, perDay) {
    var totalHours = days.reduce(function (a, d) { return a + d.hours; }, 0);
    var needed = perDay ? plan.hours * days.length : plan.hours;

    var rows = days.map(function (d) {
      var need = perDay ? plan.hours : null;
      return {
        label: d.label,
        hours: d.hours,
        need: need,
        feasible: need === null ? null : d.hours >= need,
        start: d.start,
        end: d.end,
      };
    });

    if (!perDay) {
      // Spend the requirement across days, filling each in order.
      var left = plan.hours;
      rows.forEach(function (r) {
        r.need = Math.min(left, r.hours);
        left -= r.need;
        r.feasible = true;
      });
      if (left > 0.001) rows[rows.length - 1].feasible = false;
    }

    return {
      days: rows,
      totalHours: totalHours,
      neededHours: needed,
      slack: totalHours - needed,
      feasible: totalHours >= needed,
      totalCoinIn: perDay ? plan.coinIn * days.length : plan.coinIn,
      totalCost: perDay ? plan.expectedCost * days.length : plan.expectedCost,
    };
  }

  /** Progress through a promo given tier credits earned so far. */
  function progress(plan, tcEarned, tcCap) {
    var pct = Math.min(1, tcEarned / tcCap);
    var handsDone = plan.hands * pct;
    return {
      pct: pct,
      done: tcEarned >= tcCap,
      handsDone: handsDone,
      handsLeft: Math.max(0, plan.hands - handsDone),
      coinInLeft: Math.max(0, plan.coinIn * (1 - pct)),
      hoursLeft: Math.max(0, plan.hours * (1 - pct)),
      costLeft: Math.max(0, plan.expectedCost * (1 - pct)),
    };
  }

  return {
    handPayout: handPayout,
    hasFrequencies: hasFrequencies,
    stats: stats,
    w2gAnalysis: w2gAnalysis,
    denomCeiling: denomCeiling,
    w2gForPayouts: w2gForPayouts,
    gamingDays: gamingDays,
    schedule: schedule,
    plan: plan,
    progress: progress,
  };
})();
