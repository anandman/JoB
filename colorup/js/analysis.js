/**
 * Color Up — what the sessions add up to.
 *
 * Two audiences, and they want different arithmetic:
 *
 *   The player wants rates. Win or lose per hour, coin-in per hour, hands per
 *   hour — the numbers a column of totals cannot give you, and the reason this
 *   app records the clock at all.
 *
 *   The return wants gross. Gambling winnings and losses do not net: winning
 *   sessions are income and losing sessions are an itemised deduction, so the
 *   two totals are reported separately and their sum is not the tax figure.
 *   Netting them here would produce a number that looks right and is wrong.
 */

if (typeof require === "function" && typeof module !== "undefined") {
  var Store = require("./store.js");
}

var Analysis = (function () {
  "use strict";

  function years(sessions) {
    var y = {}, i;
    for (i = 0; i < sessions.length; i++) if (sessions[i].date) y[sessions[i].date.slice(0, 4)] = 1;
    return Object.keys(y).sort().reverse();
  }

  function filter(sessions, f) {
    f = f || {};
    return sessions.filter(function (s) {
      if (f.year && (!s.date || s.date.slice(0, 4) !== f.year)) return false;
      if (f.game && s.game !== f.game) return false;
      if (f.venue && s.venue !== f.venue) return false;
      // A session still on the clock has no result yet. Including it would
      // count its cash in as a loss for as long as you are sitting there.
      if (!f.includeOpen && s.start && !s.end) return false;
      return true;
    });
  }

  function totals(sessions) {
    var t = {
      sessions: sessions.length,
      hours: 0, hoursKnown: 0,
      winLoss: 0,
      grossWin: 0, grossLoss: 0, winners: 0, losers: 0, evens: 0,
      cashIn: 0, bonus: 0, cashOut: 0, topUps: 0,
      coinIn: 0, coinInKnown: 0, coinInEstimated: 0,
      hands: 0, handsEstimated: 0,
      handpayCount: 0, handpayTotal: 0, handpayWithheld: 0,
      best: null, worst: null, longest: null,

      // A rate needs its numerator and its denominator to describe the same
      // sessions. These carry the subsets that can answer each question: the
      // sessions that were timed, and the ones that have a coin-in figure.
      timed: { sessions: 0, hours: 0, winLoss: 0, coinIn: 0, hands: 0 },
      priced: { sessions: 0, winLoss: 0, coinIn: 0, estimated: 0 }
    };

    sessions.forEach(function (s) {
      var d = Store.derive(s);
      t.winLoss += d.winLoss;
      if (d.winLoss > 0) { t.grossWin += d.winLoss; t.winners++; }
      else if (d.winLoss < 0) { t.grossLoss += -d.winLoss; t.losers++; }
      else t.evens++;

      // The derived totals, so a session topped up mid-play counts what was
      // actually put in rather than what was put in first.
      t.cashIn += d.cashIn;
      t.bonus += d.bonus;
      t.topUps += d.topUps;
      t.cashOut += s.cashOut || 0;

      if (d.hours !== null) {
        t.hours += d.hours;
        t.hoursKnown++;
        t.timed.sessions++;
        t.timed.hours += d.hours;
        t.timed.winLoss += d.winLoss;
        if (d.coinIn !== null) t.timed.coinIn += d.coinIn;
        // Hands from a typical pace are that pace multiplied by these hours,
        // so counting them here would hand the assumption back as a finding.
        if (d.hands !== null && !d.handsEstimated) t.timed.hands += d.hands;
      }
      if (d.coinIn !== null) {
        t.coinIn += d.coinIn;
        t.coinInKnown++;
        t.priced.sessions++;
        t.priced.coinIn += d.coinIn;
        t.priced.winLoss += d.winLoss;
        if (d.coinInIsEstimate) {
          t.coinInEstimated += d.coinIn;
          t.priced.estimated += d.coinIn;
        }
      }
      if (d.hands !== null) {
        t.hands += d.hands;
        if (d.handsEstimated) t.handsEstimated += d.hands;
      }

      t.handpayCount += d.handpayCount;
      t.handpayTotal += d.handpayTotal;
      t.handpayWithheld += d.handpayWithheld;

      if (!t.best || d.winLoss > Store.derive(t.best).winLoss) t.best = s;
      if (!t.worst || d.winLoss < Store.derive(t.worst).winLoss) t.worst = s;
      if (d.hours !== null && (!t.longest || d.hours > Store.derive(t.longest).hours)) t.longest = s;
    });

    // Every rate is computed from the subset that can supply both halves of
    // it. Dividing a whole year's result by the hours of the fraction that was
    // timed overstates the rate by exactly the proportion that was not — with
    // 2 sessions timed out of 50 it read as losing $4,788 an hour.
    t.perHour = t.timed.hours > 0 ? t.timed.winLoss / t.timed.hours : null;
    t.coinInPerHour = (t.timed.hours > 0 && t.timed.coinIn > 0)
      ? t.timed.coinIn / t.timed.hours : null;
    t.handsPerHour = (t.timed.hours > 0 && t.timed.hands > 0)
      ? t.timed.hands / t.timed.hours : null;
    t.avgHours = t.hoursKnown ? t.hours / t.hoursKnown : null;

    // Hold: the share of everything wagered that the house kept, over the
    // sessions that recorded what was wagered. Same trap as the rate above —
    // a year's losses over one session's coin-in is not a hold.
    t.hold = t.priced.coinIn > 0 ? -t.priced.winLoss / t.priced.coinIn : null;
    t.realizedReturn = t.priced.coinIn > 0 ? 1 + t.priced.winLoss / t.priced.coinIn : null;
    t.winRate = sessions.length ? t.winners / sessions.length : null;

    // What share of the record each rate actually speaks for, so the display
    // can say so rather than presenting a partial figure as a whole one.
    t.coverage = {
      hours: sessions.length ? t.hoursKnown / sessions.length : 0,
      coinIn: sessions.length ? t.coinInKnown / sessions.length : 0,
      partialHours: t.hoursKnown > 0 && t.hoursKnown < sessions.length,
      partialCoinIn: t.coinInKnown > 0 && t.coinInKnown < sessions.length
    };
    return t;
  }

  /** Totals per distinct value of a field, largest by absolute result first. */
  function by(sessions, field) {
    var groups = {};
    sessions.forEach(function (s) {
      var k = s[field] || "—";
      (groups[k] = groups[k] || []).push(s);
    });
    return Object.keys(groups).map(function (k) {
      return { key: k, sessions: groups[k].length, totals: totals(groups[k]) };
    }).sort(function (a, b) {
      return Math.abs(b.totals.winLoss) - Math.abs(a.totals.winLoss);
    });
  }

  function byMonth(sessions) {
    var groups = {};
    sessions.forEach(function (s) {
      var k = (s.date || "").slice(0, 7) || "—";
      (groups[k] = groups[k] || []).push(s);
    });
    return Object.keys(groups).sort().map(function (k) {
      return { key: k, sessions: groups[k].length, totals: totals(groups[k]) };
    });
  }

  /**
   * Sessions grouped into trips, by the gaps between them.
   *
   * A trip is the unit that answers "did this pay for itself". Sessions
   * cluster — five in a day, six a month later — and neither a single session
   * nor a whole year is the thing you actually went and did.
   *
   * The gap is what separates them: consecutive days are one trip, a week
   * apart is two. Default of one day means an overnight counts as continuing,
   * which is what it is.
   */
  function trips(sessions, maxGapDays) {
    var gap = (maxGapDays === undefined ? 1 : maxGapDays);
    var dated = sessions.filter(function (s) { return s.date; })
      .slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var out = [], current = null;

    dated.forEach(function (s) {
      var day = new Date(s.date + "T00:00:00");
      if (current) {
        var last = new Date(current.end + "T00:00:00");
        var days = Math.round((day - last) / 86400000);
        if (days > gap) current = null;
      }
      if (!current) {
        current = { start: s.date, end: s.date, sessions: [] };
        out.push(current);
      }
      current.sessions.push(s);
      current.end = s.date;
    });

    return out.map(function (t) {
      var venues = {};
      t.sessions.forEach(function (s) { if (s.venue) venues[s.venue] = 1; });
      return {
        start: t.start, end: t.end,
        days: Math.round((new Date(t.end + "T00:00:00") -
                          new Date(t.start + "T00:00:00")) / 86400000) + 1,
        venues: Object.keys(venues).sort(),
        sessions: t.sessions,
        totals: totals(t.sessions.filter(function (s) { return !(s.start && !s.end); }))
      };
    }).reverse();
  }

  /**
   * How far a result of this size could reasonably have drifted from its own
   * expectation, by chance alone.
   *
   * Variance per unit wagered is roughly a property of the game, not of the
   * pay table: about 19.5 for max-bet video poker, about 1.3 for blackjack.
   * Over N hands of size b the variance of the total is N·b²·v, and N·b is the
   * coin-in, so the standard deviation is sqrt(coin-in × average bet × v).
   * That needs no pay table and no strategy assumption — only how much went
   * through and how big the bets were.
   *
   * It is deliberately conservative. Multi-line video poker has far lower
   * variance per dollar wagered than a single line, so the interval on a fifty
   * play session is wider than the truth rather than narrower.
   */
  var VARIANCE = { "Video Poker": 19.5, "Video Keno": 25, Slots: 20, Blackjack: 1.3,
                   Baccarat: 0.95, Craps: 1.2, Roulette: 1.25, "Pai Gow Poker": 0.6,
                   "Three Card Poker": 3.0, "Let It Ride": 5.0, "Caribbean Stud": 5.5,
                   "Ultimate Texas Hold'em": 4.5, "Mississippi Stud": 5.0,
                   "Casino War": 1.0, "Sic Bo": 3.0, "Big Six": 2.5 };

  function swing(sessions) {
    var variance = 0, priced = 0, coinIn = 0, winLoss = 0;
    sessions.forEach(function (s) {
      var d = Store.derive(s);
      var v = VARIANCE[s.game];
      if (!v || !d.coinIn || !d.avgBet) return;
      variance += d.coinIn * d.avgBet * v;
      coinIn += d.coinIn;
      // The result of the same sessions the band is built from. A band over
      // nine sessions held up against fifty sessions' losses would be the
      // per-hour mistake again: a numerator and a denominator describing
      // different things.
      winLoss += d.winLoss;
      priced++;
    });
    if (!priced) return null;
    var sd = Math.sqrt(variance);
    return {
      sessions: priced,
      coinIn: coinIn,
      winLoss: winLoss,
      sd: sd,
      // Two standard deviations either way: the range a result of this size
      // sits inside about nineteen times in twenty, before any edge.
      band: 1.96 * sd
    };
  }

  /**
   * The figures a return actually asks for. Deliberately not netted, and
   * deliberately not advice: it is the record, arranged the way the form is.
   */
  function tax(sessions, year) {
    var rows = filter(sessions, { year: year });
    var t = totals(rows);
    return {
      year: year,
      sessions: rows.length,
      grossWin: t.grossWin,          // winning sessions, summed — income
      grossLoss: t.grossLoss,        // losing sessions, summed — the deduction
      net: t.winLoss,                // not a tax figure; here to be reconciled against
      handpayCount: t.handpayCount,
      handpayTotal: t.handpayTotal,  // should reconcile against the W-2G forms
      handpayWithheld: t.handpayWithheld
    };
  }

  return {
    years: years,
    trips: trips,
    swing: swing,
    VARIANCE: VARIANCE,
    filter: filter,
    totals: totals,
    by: by,
    byMonth: byMonth,
    tax: tax
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Analysis;
