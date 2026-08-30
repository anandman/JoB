/**
 * Color Up — the session record.
 *
 * IndexedDB holds everything; the .xlsx in Dropbox is a rendering of it. That
 * split is deliberate: a store you can read and write a field at a time
 * survives a half-finished edit, and a zip of XML does not.
 *
 * The governing rule is that nothing derivable is ever typed. Win/loss, session
 * tier credits, hours and coin-in are all computed. This is a record kept on a
 * phone, on a casino floor, at the end of a session, and every field that has
 * to be worked out by hand is a field that will eventually be wrong.
 */

var Store = (function () {
  "use strict";

  var DB = "colorup";
  var VERSION = 1;

  // A W-2G is issued at $2,000 in 2026, not the $1,200 everyone remembers.
  // Nothing here enforces it; it is the number the prompt quotes.
  var W2G_THRESHOLD = 2000;

  /**
   * Every game, and what kind of thing it is — which decides two questions the
   * app cannot answer any other way.
   *
   * **Where tier credits come from.** A machine counts every dollar through it,
   * so coin-in derived from TC is a measurement. A table is rated by a person
   * estimating your average bet and your hours, so the same arithmetic gives an
   * estimate. A poker room or a bingo hall awards credits for time at the table
   * and not for money wagered at all, so coin-in cannot be derived from them
   * and the default rate is left unknown rather than invented.
   *
   * **A starting $/TC.** These are suggestions to save typing, not facts:
   * rates vary by property, by denomination and by promotion. Confirm at the
   * players club; the field is always editable and never inferred twice.
   */
  var GAMES = [
    { name: "Video Poker",           group: "Machines",  kind: "machine", tcRate: 10 },
    { name: "Slots",                 group: "Machines",  kind: "machine", tcRate: 5 },
    { name: "Video Keno",            group: "Machines",  kind: "machine", tcRate: 5 },
    { name: "Blackjack",             group: "Tables",    kind: "table",   tcRate: 25 },
    { name: "Craps",                 group: "Tables",    kind: "table",   tcRate: 25 },
    { name: "Baccarat",              group: "Tables",    kind: "table",   tcRate: 25 },
    { name: "Roulette",              group: "Tables",    kind: "table",   tcRate: 25 },
    { name: "Pai Gow Poker",         group: "Tables",    kind: "table",   tcRate: 25 },
    { name: "Pai Gow Tiles",         group: "Tables",    kind: "table",   tcRate: 25 },
    { name: "Three Card Poker",      group: "Tables",    kind: "table",   tcRate: 25 },
    { name: "Ultimate Texas Hold'em", group: "Tables",   kind: "table",   tcRate: 25 },
    { name: "Mississippi Stud",      group: "Tables",    kind: "table",   tcRate: 25 },
    { name: "Let It Ride",           group: "Tables",    kind: "table",   tcRate: 25 },
    { name: "Caribbean Stud",        group: "Tables",    kind: "table",   tcRate: 25 },
    { name: "Casino War",            group: "Tables",    kind: "table",   tcRate: 25 },
    { name: "Sic Bo",                group: "Tables",    kind: "table",   tcRate: 25 },
    { name: "Big Six",               group: "Tables",    kind: "table",   tcRate: 25 },
    { name: "Poker Room",            group: "Elsewhere", kind: "time",    tcRate: 0 },
    { name: "Keno",                  group: "Elsewhere", kind: "time",    tcRate: 0 },
    { name: "Bingo",                 group: "Elsewhere", kind: "time",    tcRate: 0 },
    { name: "Sports Betting",        group: "Elsewhere", kind: "book",    tcRate: 0 },
    { name: "Horse Racing",          group: "Elsewhere", kind: "book",    tcRate: 0 },
    { name: "Other",                 group: "Elsewhere", kind: "other",   tcRate: 0 }
  ];

  var BY_NAME = {};
  GAMES.forEach(function (g) { BY_NAME[g.name] = g; });

  function gameInfo(name) {
    return BY_NAME[name] || { name: name, group: "Elsewhere", kind: "other", tcRate: 0 };
  }

  // Kept as a list of names because that is how a person reads it back.
  var RATED_GAMES = GAMES.filter(function (g) { return g.kind === "table"; })
                         .map(function (g) { return g.name; });

  // Dollars of coin-in per tier credit. Machine rates are exact; a table rate is
  // the pit's estimate of your average bet and hours, which is a different and
  // much softer number.
  var TC_RATES = [
    { value: 5,  label: "$5 per TC",  note: "slots, high limit video poker" },
    { value: 10, label: "$10 per TC", note: "usual Caesars video poker rate" },
    { value: 20, label: "$20 per TC", note: "some Caesars machines" },
    { value: 25, label: "$25 per TC", note: "Caesars table games — pit estimated" },
    { value: 0,  label: "Not known",  note: "coin-in cannot be derived" }
  ];

  var db = null;

  function open() {
    return new Promise(function (resolve, reject) {
      if (db) return resolve(db);
      var req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains("sessions")) {
          var s = d.createObjectStore("sessions", { keyPath: "id" });
          s.createIndex("date", "date");
          s.createIndex("synced", "synced");
        }
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta");
      };
      req.onsuccess = function () { db = req.result; resolve(db); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function isRequest(x) {
    return !!x && typeof x === "object" && "readyState" in x && "onsuccess" in x;
  }

  function tx(names, mode, fn) {
    return open().then(function (d) {
      return new Promise(function (resolve, reject) {
        var t = d.transaction(names, mode);
        var out = fn(t);
        // Resolve with the request's result, whatever it is. Testing
        // `result !== undefined` instead handed the caller the IDBRequest
        // itself whenever a key was absent — a truthy object that then passed
        // every `if (x)` guard downstream and got stored back verbatim.
        t.oncomplete = function () { resolve(isRequest(out) ? out.result : out); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error); };
      });
    });
  }

  /**
   * Today, where the phone is standing. toISOString() would give the UTC date,
   * which after 5pm in Nevada is tomorrow — so an evening session would be
   * filed on the wrong day, and a tax year could lose or gain one at its edge.
   */
  function today(when) {
    var d = when || new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
  }

  function id() {
    // Sortable and unique without a server: time first, then randomness.
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  /* ===== derived values ===== */

  var num = function (x) { return typeof x === "number" && isFinite(x) ? x : 0; };

  /**
   * Everything computed from what was typed. Kept as one function so the form,
   * the list, the analysis and the spreadsheet cannot disagree about what a
   * session is worth.
   */
  function derive(s) {
    var cashIn = num(s.cashIn), bonus = num(s.bonus), cashOut = num(s.cashOut);
    var d = {};

    // The whole point of a session: what you walked out with, less everything
    // that went in — your money and the casino's.
    d.winLoss = s.winLossOverride !== null && s.winLossOverride !== undefined
      ? num(s.winLossOverride)
      : cashOut - cashIn - bonus;

    d.hours = (s.start && s.end) ? Math.max(0, (new Date(s.end) - new Date(s.start)) / 3600000) : null;

    d.sessionTC = s.sessionTCOverride !== null && s.sessionTCOverride !== undefined
      ? num(s.sessionTCOverride)
      : (s.startTC !== null && s.startTC !== undefined &&
         s.endTC !== null && s.endTC !== undefined ? num(s.endTC) - num(s.startTC) : null);

    // Coin-in is the number that makes a session comparable to any other. It is
    // NOT a tier credit total: TC posts late, promotions multiply it, and a
    // session's starting TC will not match the last one's ending TC. It is used
    // here only as a proxy for how much money went through the machine.
    d.coinIn = (d.sessionTC !== null && num(s.tcRate) > 0) ? d.sessionTC * num(s.tcRate) : null;

    var kind = gameInfo(s.game).kind;
    d.coinInIsEstimate = kind === "table";
    // Said in words rather than as a flag, because six months later "estimate"
    // explains itself and a boolean called `rated` does not.
    d.coinInBasis = d.coinIn === null ? null
                  : kind === "machine" ? "measured"
                  : kind === "table" ? "pit estimate"
                  : "not from coin-in";

    // What you actually got back per dollar wagered, against the pay table's
    // theoretical return. Meaningless without real coin-in.
    d.realizedReturn = (d.coinIn && d.coinIn > 0) ? 1 + d.winLoss / d.coinIn : null;

    // W-2G handpays. Not arithmetic — the casino already withheld or reported
    // these — but the totals belong on the same row, because at tax time the
    // forms have to reconcile against the sessions that produced them.
    var hp = s.handpays || [];
    d.handpayCount = hp.length;
    d.handpayTotal = hp.reduce(function (t, h) { return t + num(h && h.amount); }, 0);
    d.handpayWithheld = hp.reduce(function (t, h) { return t + num(h && h.withheld); }, 0);

    d.perHour = (d.hours && d.hours > 0) ? d.winLoss / d.hours : null;
    d.coinInPerHour = (d.coinIn && d.hours && d.hours > 0) ? d.coinIn / d.hours : null;

    // Hands, from whichever end you actually know.
    //
    // A flat bet gives hands from coin-in. A progression does not — under
    // Martingale or d'Alembert there is no bet size to divide by, and picking
    // one would silently invent the answer. So a counted number of hands wins
    // when there is one, and the average bet is then derived from it rather
    // than assumed. Either way exactly one of the two is typed.
    d.hands = (s.handsOverride !== null && s.handsOverride !== undefined)
      ? num(s.handsOverride)
      : ((d.coinIn && num(s.perHand) > 0) ? d.coinIn / num(s.perHand) : null);
    d.handsCounted = s.handsOverride !== null && s.handsOverride !== undefined;
    d.avgBet = (d.coinIn && d.hands > 0) ? d.coinIn / d.hands
             : (num(s.perHand) > 0 ? num(s.perHand) : null);
    d.handsPerHour = (d.hands && d.hours && d.hours > 0) ? d.hands / d.hours : null;
    return d;
  }

  /**
   * Things worth a second look before they become a tax record.
   *
   * These are warnings, never blocks. A session logged on a casino floor at 2am
   * should always be savable; it just should not be saved silently when the
   * numbers look unlike anything you have entered before.
   */
  function warnings(s) {
    var d = derive(s);
    var w = [];
    if (!s.venue) w.push("No venue.");
    if (num(s.cashIn) === 0 && num(s.bonus) === 0) w.push("Nothing went in — cash in and bonus are both zero.");
    if (d.hours === null) w.push("No duration, so this session has no rate per hour.");
    else if (d.hours > 12) w.push("Over twelve hours. Check the start time.");
    else if (d.hours < 0.05) w.push("Under three minutes.");
    if (d.sessionTC !== null && d.sessionTC < 0) {
      w.push("Tier credits went down. Starting and ending are probably swapped.");
    }
    if (d.realizedReturn !== null && !d.coinInIsEstimate) {
      // Losing more than the coin-in is arithmetically impossible on a machine.
      if (d.realizedReturn < 0) w.push("You lost more than the coin-in, which cannot happen. Check the tier credits or the $/TC.");
      if (d.realizedReturn > 3) w.push("Return over 300%. Possible on a jackpot, worth confirming otherwise.");
    }
    // Hands, average bet and coin-in are three views of one quantity. If all
    // three were typed and they disagree, one of them is wrong, and it is
    // cheaper to notice now than at the end of a year.
    if (d.handsCounted && num(s.perHand) > 0 && d.coinIn) {
      var implied = num(s.handsOverride) * num(s.perHand);
      if (implied > 0 && Math.abs(implied - d.coinIn) / d.coinIn > 0.25) {
        w.push(Math.round(num(s.handsOverride)) + " hands at " + num(s.perHand) +
               " is about " + Math.round(implied) + ", but the tier credits work out to " +
               Math.round(d.coinIn) + ".");
      }
    }
    (s.handpays || []).forEach(function (h) {
      if (!(num(h && h.amount) > 0)) w.push("A handpay with no amount on it.");
    });
    return w;
  }

  /* ===== reads and writes ===== */

  function blank(previous) {
    // A new session inherits where you were and what you were playing, because
    // that is almost always still true, and the cash you just walked away with.
    var p = previous || {};
    return {
      id: id(),
      date: today(),
      game: p.game || "Video Poker",
      detail: p.detail || "",
      venue: p.venue || "",
      location: p.location || "",
      start: null, end: null,
      cashIn: p.cashOut !== undefined && p.cashOut !== null ? p.cashOut : null,
      bonus: null, cashOut: null,
      winLossOverride: null,
      startTC: p.endTC !== undefined ? p.endTC : null,
      endTC: null,
      sessionTCOverride: null,
      tcRate: p.tcRate !== undefined && p.tcRate !== null ? p.tcRate : 10,
      perHand: p.perHand !== undefined ? p.perHand : null,
      handsOverride: null,
      system: p.system || "",
      handpays: [],
      comment: "",
      synced: 0,
      updated: Date.now()
    };
  }

  /** The one session with a start and no end, if there is one. */
  function running(rows) {
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].start && !rows[i].end) return rows[i];
    }
    return null;
  }

  /**
   * Every session, oldest first, each with its derived values attached. The UI
   * never calls derive() itself, so a list row and a form can never disagree.
   */
  function all() {
    return tx(["sessions"], "readonly", function (t) {
      return t.objectStore("sessions").getAll();
    }).then(function (rows) {
      return (rows || []).sort(function (a, b) {
        return (a.date === b.date) ? (a.updated - b.updated) : (a.date < b.date ? -1 : 1);
      });
    });
  }

  function put(s) {
    s.updated = Date.now();
    s.synced = 0;                       // any edit makes it unsynced again
    return tx(["sessions"], "readwrite", function (t) {
      t.objectStore("sessions").put(s);
    }).then(function () { return s; });
  }

  /**
   * Deleting records a tombstone as well as removing the row.
   *
   * Sync merges rather than replaces, so without one a session deleted here
   * comes straight back from any copy that still has it. The tombstone is the
   * only record that the deletion ever happened, so it is kept forever — they
   * are a few bytes each, and losing one silently undoes a deletion.
   */
  function remove(sid) {
    return deletions().then(function (d) {
      d[sid] = Date.now();
      return meta("deleted", d);
    }).then(function () {
      return tx(["sessions"], "readwrite", function (t) {
        t.objectStore("sessions").delete(sid);
      });
    });
  }

  function deletions() {
    return meta("deleted").then(function (d) { return d || {}; });
  }

  /** Drop anything deleted after the copy in hand was last written. */
  function applyDeletions(rows, deleted) {
    if (!deleted) return rows;
    return rows.filter(function (r) {
      var at = deleted[r.id];
      return !(at && at >= (r.updated || 0));
    });
  }

  function markSynced(ids) {
    return tx(["sessions"], "readwrite", function (t) {
      var os = t.objectStore("sessions");
      ids.forEach(function (i) {
        var g = os.get(i);
        g.onsuccess = function () {
          var row = g.result;
          if (row) { row.synced = 1; os.put(row); }
        };
      });
    });
  }

  function unsynced() {
    return all().then(function (rows) {
      return rows.filter(function (r) { return !r.synced; });
    });
  }

  function meta(key, value) {
    if (value === undefined) {
      return tx(["meta"], "readonly", function (t) { return t.objectStore("meta").get(key); });
    }
    return tx(["meta"], "readwrite", function (t) { t.objectStore("meta").put(value, key); });
  }

  function replaceAll(rows) {
    return tx(["sessions"], "readwrite", function (t) {
      var os = t.objectStore("sessions");
      os.clear();
      rows.forEach(function (r) { os.put(r); });
    });
  }

  /**
   * Values seen before, most recent first — what the quick pickers offer.
   *
   * `where` narrows without hiding: rows matching it come first, then the
   * rest. Asked for a machine, that puts the ones from this venue at the front
   * without pretending you have never played anywhere else.
   */
  function seen(rows, field, where) {
    var near = [], far = [], i, k, matches;
    for (i = rows.length - 1; i >= 0; i--) {
      var v = rows[i][field];
      if (!v) continue;
      matches = true;
      for (k in (where || {})) if (where[k] && rows[i][k] !== where[k]) matches = false;
      var into = matches ? near : far;
      if (near.indexOf(v) < 0 && far.indexOf(v) < 0) into.push(v);
    }
    return near.concat(far);
  }

  /** The most recent value of `field` on a row where `match` holds. */
  function lastWith(rows, match, field) {
    for (var i = rows.length - 1; i >= 0; i--) {
      var ok = true, k;
      for (k in match) if (rows[i][k] !== match[k]) ok = false;
      if (ok && rows[i][field]) return rows[i][field];
    }
    return null;
  }

  /**
   * The session a new one should inherit from: the last finished one on or
   * before the given date.
   *
   * Not simply the newest row. A session being reconstructed for last Tuesday
   * should carry Tuesday's ending tier credits forward, not Saturday's — and
   * carrying the wrong ones is worse than carrying none, because the number
   * looks entered rather than guessed.
   */
  function previousFor(rows, date, exceptId) {
    var best = null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.id === exceptId) continue;
      if (r.start && !r.end) continue;
      if (date && r.date && r.date > date) continue;
      if (!best || (r.date || "") > (best.date || "") ||
          ((r.date || "") === (best.date || "") && r.updated > best.updated)) best = r;
    }
    return best;
  }

  return {
    today: today,
    gameInfo: gameInfo,
    deletions: deletions,
    applyDeletions: applyDeletions,
    W2G_THRESHOLD: W2G_THRESHOLD,
    running: running,
    seen: seen,
    lastWith: lastWith,
    previousFor: previousFor,
    GAMES: GAMES,
    TC_RATES: TC_RATES,
    RATED_GAMES: RATED_GAMES,
    open: open,
    blank: blank,
    derive: derive,
    warnings: warnings,
    all: all,
    put: put,
    remove: remove,
    unsynced: unsynced,
    markSynced: markSynced,
    replaceAll: replaceAll,
    meta: meta,
    newId: id
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Store;
