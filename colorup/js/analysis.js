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
      cashIn: 0, bonus: 0, cashOut: 0,
      coinIn: 0, coinInKnown: 0, coinInEstimated: 0,
      hands: 0,
      handpayCount: 0, handpayTotal: 0, handpayWithheld: 0,
      best: null, worst: null, longest: null
    };

    sessions.forEach(function (s) {
      var d = Store.derive(s);
      t.winLoss += d.winLoss;
      if (d.winLoss > 0) { t.grossWin += d.winLoss; t.winners++; }
      else if (d.winLoss < 0) { t.grossLoss += -d.winLoss; t.losers++; }
      else t.evens++;

      t.cashIn += s.cashIn || 0;
      t.bonus += s.bonus || 0;
      t.cashOut += s.cashOut || 0;

      if (d.hours !== null) { t.hours += d.hours; t.hoursKnown++; }
      if (d.coinIn !== null) {
        t.coinIn += d.coinIn;
        t.coinInKnown++;
        if (d.coinInIsEstimate) t.coinInEstimated += d.coinIn;
      }
      if (d.hands !== null) t.hands += d.hands;

      t.handpayCount += d.handpayCount;
      t.handpayTotal += d.handpayTotal;
      t.handpayWithheld += d.handpayWithheld;

      if (!t.best || d.winLoss > Store.derive(t.best).winLoss) t.best = s;
      if (!t.worst || d.winLoss < Store.derive(t.worst).winLoss) t.worst = s;
      if (d.hours !== null && (!t.longest || d.hours > Store.derive(t.longest).hours)) t.longest = s;
    });

    // Rates use only the sessions that can supply them. Dividing the whole
    // year's win by the hours of the half of it that was timed would overstate
    // the rate by exactly the proportion that was not.
    t.perHour = t.hours > 0 ? t.winLoss / t.hours : null;
    t.coinInPerHour = (t.hours > 0 && t.coinIn > 0) ? t.coinIn / t.hours : null;
    t.handsPerHour = (t.hours > 0 && t.hands > 0) ? t.hands / t.hours : null;
    t.avgHours = t.hoursKnown ? t.hours / t.hoursKnown : null;

    // Hold: the share of everything wagered that the house kept. This is the
    // one figure comparable across games, denominations and session lengths.
    t.hold = t.coinIn > 0 ? -t.winLoss / t.coinIn : null;
    t.realizedReturn = t.coinIn > 0 ? 1 + t.winLoss / t.coinIn : null;
    t.winRate = sessions.length ? t.winners / sessions.length : null;

    // Every rate above is silent about how much of the record it covers.
    t.coverage = {
      hours: sessions.length ? t.hoursKnown / sessions.length : 0,
      coinIn: sessions.length ? t.coinInKnown / sessions.length : 0
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
