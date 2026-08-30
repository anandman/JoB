/**
 * Color Up — turning the record into files you can keep.
 *
 * Two shapes, for two different jobs:
 *
 *   .xlsx  is the human artefact. It is what an accountant opens, and it is a
 *          rendering: every derived column is computed here, never stored, so
 *          the sheet cannot drift from the app.
 *   .json  is the machine artefact. It round-trips exactly, including fields a
 *          future version adds, which is what makes it a backup rather than a
 *          report. Until Dropbox sync exists this is the only copy off the
 *          phone, so import has to be forgiving of anything but nonsense.
 */

// Node for the tests, a browser for everything else. The globals are the same
// names either way, so nothing below has to know which it is running in.
if (typeof require === "function" && typeof module !== "undefined") {
  var Store = require("./store.js");
  var Xlsx = require("./xlsx.js");
}

var Backup = (function () {
  "use strict";

  // Wide is fine in a spreadsheet — you can hide a column, but you cannot
  // recover one that was never written. Ordered so the columns that answer
  // "what happened" come before the ones that answer "how did it go".
  var COLUMNS = [
    { header: "Date",         key: "date",        type: "date",     width: 11 },
    { header: "Start",        key: "start",       type: "datetime", width: 17 },
    { header: "End",          key: "end",         type: "datetime", width: 17 },
    { header: "Hours",        key: "hours",       type: "duration", width: 9 },
    { header: "Venue",        key: "venue",       type: "text",     width: 18 },
    { header: "Location",     key: "location",    type: "text",     width: 14 },
    { header: "Game",         key: "game",        type: "text",     width: 14 },
    { header: "Machine",      key: "detail",      type: "text",     width: 20 },
    { header: "Cash In",      key: "cashIn",      type: "money",    width: 12 },
    { header: "Bonus",        key: "bonus",       type: "money",    width: 11 },
    { header: "Cash Out",     key: "cashOut",     type: "money",    width: 12 },
    { header: "Win/(Loss)",   key: "winLoss",     type: "money",    width: 13 },
    { header: "$/Hour",       key: "perHour",     type: "money",    width: 12 },
    { header: "Start TC",     key: "startTC",     type: "integer",  width: 10 },
    { header: "End TC",       key: "endTC",       type: "integer",  width: 10 },
    { header: "Session TC",   key: "sessionTC",   type: "integer",  width: 11 },
    { header: "$/TC",         key: "tcRate",      type: "money",    width: 9 },
    { header: "Coin In",      key: "coinIn",      type: "money",    width: 13 },
    { header: "Coin In From", key: "coinInFrom",  type: "text",     width: 13 },
    { header: "Return",       key: "realized",    type: "percent",  width: 10 },
    { header: "Avg Bet",      key: "avgBet",      type: "money",    width: 10 },
    { header: "Hands",        key: "hands",       type: "integer",  width: 10 },
    { header: "Hands From",   key: "handsFrom",   type: "text",     width: 11 },
    { header: "Hands/Hour",   key: "handsPerHour", type: "integer", width: 11 },
    { header: "System",       key: "system",      type: "text",     width: 18 },
    { header: "W-2G",         key: "handpayCount", type: "integer", width: 8 },
    { header: "W-2G Total",   key: "handpayTotal", type: "money",   width: 13 },
    { header: "W-2G Withheld", key: "handpayWithheld", type: "money", width: 14 },
    { header: "W-2G Detail",  key: "handpayDetail", type: "text",   width: 26 },
    { header: "Comment",      key: "comment",     type: "text",     width: 34 }
  ];

  function when(iso) { return iso ? new Date(iso) : null; }

  // A zero that was entered is a fact; a zero that stands in for "no handpays
  // at all" is not. Only the latter is left out of the sheet, so a blank in the
  // withheld column always means "not applicable", never "nothing was withheld".
  function orNull(n, applicable) { return applicable ? n : null; }

  function row(s) {
    var d = Store.derive(s);
    return {
      date: s.date ? new Date(s.date + "T00:00:00") : null,
      start: when(s.start),
      end: when(s.end),
      hours: d.hours,
      venue: s.venue,
      location: s.location,
      game: s.game,
      detail: s.detail,
      cashIn: s.cashIn,
      bonus: s.bonus,
      cashOut: s.cashOut,
      winLoss: d.winLoss,
      perHour: d.perHour,
      startTC: s.startTC,
      endTC: s.endTC,
      sessionTC: d.sessionTC,
      tcRate: s.tcRate || null,
      coinIn: d.coinIn,
      // Named rather than flagged: "estimated" in a cell explains itself six
      // months later, where a TRUE in a column called "rated" does not.
      coinInFrom: d.coinInBasis,
      realized: d.realizedReturn,
      avgBet: d.avgBet,
      hands: d.hands === null ? null : Math.round(d.hands),
      // Which number was typed and which was worked out. Under a progression
      // the average bet is a result, not an input, and the sheet should not
      // read as though someone flat bet it.
      handsFrom: d.hands === null ? null : (d.handsCounted ? "counted" : "coin in"),
      system: s.system,
      handsPerHour: d.handsPerHour === null ? null : Math.round(d.handsPerHour),
      handpayCount: orNull(d.handpayCount, d.handpayCount),
      handpayTotal: orNull(d.handpayTotal, d.handpayCount),
      handpayWithheld: orNull(d.handpayWithheld, d.handpayCount),
      handpayDetail: (s.handpays || []).map(function (h) {
        return "$" + (h.amount || 0) + (h.note ? " " + h.note : "");
      }).join("; "),
      comment: s.comment
    };
  }

  /** The workbook, as bytes. */
  function workbook(sessions, now) {
    return Xlsx.build({
      sheetName: "Sessions",
      columns: COLUMNS,
      rows: sessions.map(row),
      now: now || new Date()
    });
  }

  /* ===== the machine copy ===== */

  var FORMAT = "colorup/1";

  function json(sessions, deleted, now) {
    return JSON.stringify({
      format: FORMAT,
      exported: (now || new Date()).toISOString(),
      count: sessions.length,
      sessions: sessions,
      // Ids of sessions that were deleted, and when. Without these a merge
      // would restore anything another copy still holds.
      deleted: deleted || {}
    }, null, 2);
  }

  /**
   * Read a backup. Returns { sessions, note } or throws with a sentence a
   * person can act on — this runs when someone is restoring a lost record.
   */
  function parse(text) {
    var data;
    try { data = JSON.parse(text); }
    catch (e) { throw new Error("That is not a JSON file — it did not parse."); }

    // Accept a bare array too: it is what you get if someone pulls the
    // sessions key out by hand, and refusing it would be pedantry.
    var rows = Array.isArray(data) ? data : data && data.sessions;
    if (!Array.isArray(rows)) throw new Error("No sessions in that file.");

    var kept = rows.filter(function (r) { return r && typeof r === "object" && r.id; });
    if (!kept.length) throw new Error("That file has no sessions with an id.");

    kept.forEach(function (r) {
      // Anything the exporting version knew and this one does not is left
      // alone. Only the fields this version relies on are defaulted.
      if (r.handpays === undefined) r.handpays = [];
      if (r.updated === undefined) r.updated = Date.now();
      r.synced = 0;                    // an imported row has not reached Dropbox
    });

    return {
      sessions: kept,
      deleted: (data && data.deleted) || {},
      note: kept.length === rows.length ? null
          : (rows.length - kept.length) + " row(s) had no id and were skipped."
    };
  }

  /**
   * Merge rather than replace. Two devices that have both been used offline
   * should union, and the newer edit of a shared id should win — replacing
   * outright would silently destroy whichever side imported second.
   */
  function merge(existing, incoming, deleted) {
    var by = {}, added = 0, updated = 0, i;
    for (i = 0; i < existing.length; i++) by[existing[i].id] = existing[i];
    for (i = 0; i < incoming.length; i++) {
      var inc = incoming[i], have = by[inc.id];
      if (!have) { by[inc.id] = inc; added++; }
      else if ((inc.updated || 0) > (have.updated || 0)) { by[inc.id] = inc; updated++; }
    }
    var out = Object.keys(by).map(function (k) { return by[k]; });
    // A tombstone newer than the row it names wins; an older one loses, so a
    // session deleted and then deliberately re-entered stays.
    var kept = Store.applyDeletions(out, deleted);
    return { sessions: kept, added: added, updated: updated, removed: out.length - kept.length };
  }

  /** The later timestamp wins, so a tombstone can never be forgotten. */
  function mergeDeletions(a, b) {
    var out = {}, k;
    for (k in (a || {})) out[k] = a[k];
    for (k in (b || {})) if (!out[k] || b[k] > out[k]) out[k] = b[k];
    return out;
  }

  function filename(sessions, ext) {
    var years = {}, i;
    for (i = 0; i < sessions.length; i++) {
      if (sessions[i].date) years[sessions[i].date.slice(0, 4)] = 1;
    }
    var keys = Object.keys(years).sort();
    var span = !keys.length ? "" : "-" + (keys.length === 1 ? keys[0] : keys[0] + "-" + keys[keys.length - 1]);
    return "ColorUp" + span + "." + ext;
  }

  return {
    COLUMNS: COLUMNS,
    row: row,
    workbook: workbook,
    json: json,
    parse: parse,
    merge: merge,
    mergeDeletions: mergeDeletions,
    filename: filename,
    FORMAT: FORMAT
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Backup;
