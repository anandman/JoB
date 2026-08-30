/**
 * Color Up — Dropbox, which is where the record actually lives.
 *
 * IndexedDB is a working cache. This is the copy that survives a lost phone,
 * a cleared browser, or a new device, and the copy you point an accountant at.
 *
 * Three choices worth stating, because each rules something out.
 *
 * **PKCE with the code pasted back by hand, not a redirect.** A standalone
 * home-screen web app that navigates out to dropbox.com hands the browser to
 * iOS, and whether you are returned to the app — with the same storage — is
 * not something to bet a tax record on. Dropbox will show the authorisation
 * code on screen when no redirect URI is given, so the flow never leaves the
 * user's hands. It costs one copy and paste, once, ever: the refresh token
 * that comes back is durable, and everything after that is silent.
 *
 * **App folder scope.** The app cannot read the rest of the Dropbox even in
 * principle, which seems right for something that lives on a phone. The file
 * lands in Apps/Color Up/ rather than beside the tax documents.
 *
 * **The whole file, written every sync.** No append, no patch, no dated
 * snapshots. Editing a session from three months ago therefore just works,
 * and Dropbox's own version history covers a bad write far better than any
 * scheme this code could implement.
 */

// Node for the checks, a browser for everything else.
if (typeof require === "function" && typeof module !== "undefined") {
  var Store = require("./store.js");
  var Backup = require("./export.js");
}

var Dropbox = (function () {
  "use strict";

  var AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
  var TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
  var UPLOAD_URL = "https://content.dropboxapi.com/2/files/upload";
  var DOWNLOAD_URL = "https://content.dropboxapi.com/2/files/download";

  // Fixed names, because the point is one file that is always current. The
  // JSON is the record; the workbook is a rendering of it for a human.
  var RECORD = "/ColorUp.json";
  var SHEET = "/ColorUp.xlsx";

  // Refresh a little early: a token that expires mid-upload fails a sync that
  // would otherwise have worked.
  var EARLY = 5 * 60 * 1000;

  /* ===== PKCE ===== */

  function base64url(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function verifier() {
    var b = new Uint8Array(64);
    crypto.getRandomValues(b);
    return base64url(b);
  }

  function challenge(v) {
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(v))
      .then(function (buf) { return base64url(new Uint8Array(buf)); });
  }

  /* ===== stored state ===== */

  function appKey() { return Store.meta("dropboxKey"); }
  function setAppKey(k) { return Store.meta("dropboxKey", (k || "").trim()); }
  function auth() { return Store.meta("dropboxAuth"); }
  function connected() { return auth().then(function (a) { return !!(a && a.refresh); }); }

  function forget() {
    return Store.meta("dropboxAuth", null)
      .then(function () { return Store.meta("dropboxVerifier", null); });
  }

  /* ===== the connect flow ===== */

  function urlFor(key, v) {
    return challenge(v).then(function (ch) {
      return AUTH_URL +
        "?client_id=" + encodeURIComponent(key) +
        "&response_type=code" +
        "&code_challenge=" + ch +
        "&code_challenge_method=S256" +
        // Without this Dropbox issues a short-lived token only, and the app
        // would ask to be reconnected every four hours.
        "&token_access_type=offline";
    });
  }

  /** Step one: a URL to open, with the verifier stashed for step two. */
  function beginUrl() {
    return appKey().then(function (key) {
      if (!key) throw new Error("No Dropbox app key yet.");
      var v = verifier();
      return Store.meta("dropboxVerifier", v).then(function () { return urlFor(key, v); });
    });
  }

  /**
   * A connection that was started and not finished.
   *
   * Fetching the code means leaving the app, and a home screen app that is
   * left may well be reloaded before you get back — so the half-finished
   * state cannot live in a variable or in the DOM. The stashed verifier is
   * the record that step one happened, which makes it the thing to ask.
   */
  function pending() {
    return Promise.all([auth(), Store.meta("dropboxVerifier")]).then(function (r) {
      var live = r[0] && r[0].refresh;
      return (!live && r[1]) ? r[1] : null;
    });
  }

  /** The same authorize URL again, rebuilt rather than stored twice. */
  function resumeUrl() {
    return Promise.all([appKey(), pending()]).then(function (r) {
      if (!r[0] || !r[1]) throw new Error("Nothing to resume.");
      return urlFor(r[0], r[1]);
    });
  }

  function cancel() { return Store.meta("dropboxVerifier", null); }

  /** Step two: trade the pasted code for a durable refresh token. */
  function finish(code) {
    return Promise.all([appKey(), Store.meta("dropboxVerifier")]).then(function (r) {
      var key = r[0], v = r[1];
      if (!v) throw new Error("Start the connection again — the browser lost the handshake.");
      return post(TOKEN_URL, {
        code: (code || "").trim(),
        grant_type: "authorization_code",
        client_id: key,
        code_verifier: v
      });
    }).then(function (tok) {
      if (!tok.refresh_token) {
        throw new Error("Dropbox returned no refresh token. Check that the app key is right.");
      }
      return Store.meta("dropboxAuth", {
        refresh: tok.refresh_token,
        access: tok.access_token,
        expires: Date.now() + (tok.expires_in || 14400) * 1000
      });
    }).then(function () { return Store.meta("dropboxVerifier", null); });
  }

  function post(url, fields) {
    var body = Object.keys(fields).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(fields[k]);
    }).join("&");
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body
    }).then(function (res) {
      return res.text().then(function (text) {
        if (!res.ok) throw new Error(readable(res.status, text));
        return JSON.parse(text);
      });
    });
  }

  /** A usable access token, refreshed if it is close to expiring. */
  function token() {
    return Promise.all([auth(), appKey()]).then(function (r) {
      var a = r[0], key = r[1];
      if (!a || !a.refresh) throw new Error("Not connected to Dropbox.");
      if (a.access && a.expires - EARLY > Date.now()) return a.access;
      return post(TOKEN_URL, {
        grant_type: "refresh_token",
        refresh_token: a.refresh,
        client_id: key
      }).then(function (tok) {
        a.access = tok.access_token;
        a.expires = Date.now() + (tok.expires_in || 14400) * 1000;
        return Store.meta("dropboxAuth", a).then(function () { return a.access; });
      });
    });
  }

  /* ===== files ===== */

  function upload(path, bytes, mime) {
    return token().then(function (t) {
      return fetch(UPLOAD_URL, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + t,
          // Overwrite unconditionally. The local store is the whole truth at
          // the moment of writing, because a sync always reads and merges
          // first — so there is nothing on the far side left to preserve.
          "Dropbox-API-Arg": JSON.stringify({ path: path, mode: "overwrite", mute: true }),
          "Content-Type": mime || "application/octet-stream"
        },
        body: bytes
      });
    }).then(function (res) {
      if (res.ok) return res.json();
      return res.text().then(function (t) { throw new Error(readable(res.status, t)); });
    });
  }

  /** The file's text, or null if it is not there yet — which is not an error. */
  function download(path) {
    return token().then(function (t) {
      return fetch(DOWNLOAD_URL, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + t,
          "Dropbox-API-Arg": JSON.stringify({ path: path })
        }
      });
    }).then(function (res) {
      if (res.ok) return res.text();
      return res.text().then(function (t) {
        // The first sync of a new account has nothing to read.
        if (res.status === 409 && /not_found/.test(t)) return null;
        throw new Error(readable(res.status, t));
      });
    });
  }

  /**
   * Dropbox's errors are JSON blobs with a summary buried in them. Anything
   * that reaches a person here reaches them mid-session, so it has to say what
   * to do rather than what went wrong.
   */
  function readable(status, text) {
    if (status === 401) return "Dropbox rejected the login. Disconnect and connect again.";
    if (status === 429) return "Dropbox is rate limiting. Try again in a minute.";
    if (status >= 500) return "Dropbox is having trouble. Nothing was lost; try again.";
    var summary = "";
    try {
      var j = JSON.parse(text);
      summary = j.error_summary || j.error_description || j.error || "";
    } catch (e) { summary = String(text).slice(0, 140); }
    if (/invalid_grant/.test(summary)) return "That code was already used or has expired. Start again.";
    if (/missing_scope/.test(summary)) {
      return "The Dropbox app is missing a permission. Enable files.content.read and files.content.write, then reconnect.";
    }
    return "Dropbox said: " + (summary || status);
  }

  /* ===== sync ===== */

  /**
   * Read the far side, merge, write both files back, and mark everything safe.
   *
   * Merging before writing is what makes the unconditional overwrite above
   * sound, and what lets a second device work at all. Nothing here deletes:
   * removals travel as tombstones, so a session that was deleted stays
   * deleted instead of being restored by whichever copy still had it.
   */
  function sync() {
    var result = { pulled: 0, updated: 0, removed: 0, pushed: 0 };

    return download(RECORD).then(function (text) {
      return Promise.all([Store.all(), Store.deletions()]).then(function (r) {
        var local = r[0], deleted = r[1];
        if (!text) return { sessions: local, deleted: deleted, changed: false };

        var remote;
        try { remote = Backup.parse(text); }
        catch (e) { throw new Error("The file in Dropbox could not be read: " + e.message); }

        var all = Backup.mergeDeletions(deleted, remote.deleted);
        var merged = Backup.merge(local, remote.sessions, all);
        result.pulled = merged.added;
        result.updated = merged.updated;
        result.removed = merged.removed;
        return {
          sessions: merged.sessions,
          deleted: all,
          changed: merged.added > 0 || merged.updated > 0 || merged.removed > 0
        };
      });
    }).then(function (state) {
      if (!state.changed) return state;
      return Store.replaceAll(state.sessions)
        .then(function () { return Store.meta("deleted", state.deleted); })
        .then(function () { return state; });
    }).then(function (state) {
      var text = Backup.json(state.sessions, state.deleted);
      result.pushed = state.sessions.length;
      return upload(RECORD, new Blob([text], { type: "application/json" }), "application/octet-stream")
        .then(function () {
          // The workbook is written second and on purpose: if it ever fails,
          // the record is already safe and only the readable copy is stale.
          return upload(SHEET, Backup.workbook(state.sessions));
        })
        .then(function () {
          return Store.markSynced(state.sessions.map(function (s) { return s.id; }));
        })
        .then(function () { return Store.meta("lastSync", Date.now()); })
        .then(function () { return result; });
    });
  }

  return {
    RECORD: RECORD,
    SHEET: SHEET,
    appKey: appKey,
    setAppKey: setAppKey,
    connected: connected,
    beginUrl: beginUrl,
    pending: pending,
    resumeUrl: resumeUrl,
    cancel: cancel,
    finish: finish,
    forget: forget,
    sync: sync,
    readable: readable,
    // For the checks, which have no network.
    _internals: { base64url: base64url, verifier: verifier, challenge: challenge }
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = Dropbox;
