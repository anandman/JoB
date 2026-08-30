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

  var GAMES = ["Video Poker", "Blackjack", "Slots", "Sports Betting", "Craps", "Other"];

  // Dollars of coin-in per tier credit. Machine rates are exact; a table rate is
  // the pit's estimate of your average bet and hours, which is a different and
  // much softer number.
  var TC_RATES = [
    { value: 5,  label: "$5 per TC",  note: "high limit video poker" },
    { value: 10, label: "$10 per TC", note: "usual Caesars machine rate" },
    { value: 20, label: "$20 per TC", note: "some Caesars machines" },
    { value: 25, label: "$25 per TC", note: "Caesars table games — pit estimated" },
    { value: 0,  label: "Not known",  note: "coin-in cannot be derived" }
  ];

  // Tier credits at a table are rated by a human watching your average bet, so
  // coin-in derived from them is an estimate, not a measurement.
  var RATED_GAMES = ["Blackjack", "Craps"];

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
    d.coinInIsEstimate = RATED_GAMES.indexOf(s.game) >= 0;

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
    d.hands = (d.coinIn && num(s.perHand) > 0) ? d.coinIn / num(s.perHand) : null;
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

  /** Values seen before, most recent first — what the pickers offer. */
  function seen(rows, field) {
    var out = [], i;
    for (i = rows.length - 1; i >= 0; i--) {
      var v = rows[i][field];
      if (v && out.indexOf(v) < 0) out.push(v);
    }
    return out;
  }

  return {
    today: today,
    deletions: deletions,
    applyDeletions: applyDeletions,
    W2G_THRESHOLD: W2G_THRESHOLD,
    running: running,
    seen: seen,
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
