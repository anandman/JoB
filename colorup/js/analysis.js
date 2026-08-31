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
    filter: filter,
    totals: totals,
    by: by,
    byMonth: byMonth,
    tax: tax
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Analysis;
