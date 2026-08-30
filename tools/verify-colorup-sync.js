#!/usr/bin/env node
/**
 * Verify the Dropbox client against a Dropbox that is not there.
 *
 *     NODE_PATH=/path/to/node_modules node tools/verify-colorup-sync.js
 *
 * Needs fake-indexeddb. The far side is a few dozen lines of in-memory server
 * standing in for the real one, which is the only way to exercise the paths
 * that matter — a second device, a deletion that has to stay deleted, an
 * expired token, a first sync against an empty account — without an account,
 * a network, or the patience to reproduce them by hand.
 *
 * What this cannot check is that Dropbox's API is what the code believes it
 * is. Only a real connection shows that.
 */
"use strict";

const path = require("path");

try { require("fake-indexeddb/auto"); }
catch (e) {
  console.log("\nSkipped: needs fake-indexeddb on NODE_PATH.\n");
  process.exit(0);
}

const APP = path.join(__dirname, "..", "colorup", "js");
const Store = require(path.join(APP, "store.js"));
const Backup = require(path.join(APP, "export.js"));
const Dropbox = require(path.join(APP, "dropbox.js"));

let fails = 0;
const pass = (m) => console.log("  ok   " + m);
const fail = (m) => { fails++; console.log("  FAIL " + m); };
const yes = (c, m, d) => (c ? pass(m) : fail(m + (d ? " — " + d : "")));
const is = (got, want, m) => yes(got === want, m, "got " + JSON.stringify(got));

/* ===== a Dropbox, more or less ===== */

const far = {
  files: {},                 // path -> string
  refresh: "refresh-token-1",
  issued: 0,
  calls: [],
  fail: null,                // { status, body } to return from the next call
};

function reply(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
    json: () => Promise.resolve(typeof body === "string" ? JSON.parse(body) : body),
  });
}

global.fetch = function (url, opts) {
  far.calls.push(url);
  if (far.fail) { const f = far.fail; far.fail = null; return reply(f.status, f.body); }

  const arg = () => JSON.parse(opts.headers["Dropbox-API-Arg"]);
  const form = () => Object.fromEntries(new URLSearchParams(opts.body));

  if (url.indexOf("/oauth2/token") >= 0) {
    const f = form();
    if (f.grant_type === "authorization_code") {
      if (f.code !== "THE-CODE") return reply(400, { error: "invalid_grant" });
      if (!f.code_verifier) return reply(400, { error_summary: "missing code_verifier" });
      return reply(200, { refresh_token: far.refresh, access_token: "access-0", expires_in: 14400 });
    }
    if (f.grant_type === "refresh_token") {
      if (f.refresh_token !== far.refresh) return reply(400, { error: "invalid_grant" });
      far.issued++;
      return reply(200, { access_token: "access-" + far.issued, expires_in: 14400 });
    }
  }
  if (url.indexOf("/files/upload") >= 0) {
    const a = arg();
    return Promise.resolve(opts.body).then((b) => (b && b.text ? b.text() : String(b)))
      .then((text) => { far.files[a.path] = text; return reply(200, { name: a.path }); });
  }
  if (url.indexOf("/files/download") >= 0) {
    const a = arg();
    if (!(a.path in far.files)) {
      return reply(409, { error_summary: "path/not_found/..." });
    }
    return reply(200, far.files[a.path]);
  }
  return reply(404, { error_summary: "unexpected: " + url });
};

/* ===== helpers ===== */

const mk = (over) => Object.assign(Store.blank(), over);
const wipe = () => Store.replaceAll([]).then(() => Store.meta("deleted", {}));

(async function run() {
  console.log("\nReading a key that was never written");
  {
    // This looked like nothing and broke the first thing a new user does. An
    // absent key used to resolve to the IDBRequest itself — a truthy object,
    // so every `if (value)` guard downstream passed, and it got written back
    // into the database. A fresh install would have built an authorize URL
    // reading client_id=[object IDBRequest].
    const missing = await Store.meta("no-such-key");
    is(missing, undefined, "resolves to undefined, not to the request object");

    await Store.meta("dropboxKey", null);
    const url = await Dropbox.beginUrl().then(() => null, (e) => e.message);
    yes(/No Dropbox app key/.test(url || ""),
        "so an unconfigured app says so instead of building a broken URL", url);
  }

  console.log("\nPKCE, which is what lets a page with no secret hold a login");
  {
    const v = Dropbox._internals.verifier();
    yes(/^[A-Za-z0-9_-]+$/.test(v) && v.length >= 43 && v.length <= 128,
        "the verifier is base64url and inside the length the spec allows", v.length + " chars");

    const ch = await Dropbox._internals.challenge("abc123");
    // Known-answer: base64url(SHA-256("abc123")), so a broken digest or a
    // stray "=" cannot pass by agreeing with itself.
    is(ch, "bKE9UspwyIPg8LsQHkJaiehiTeUdstI5JZOvaoQRgJA",
       "and the challenge is a real S256 digest, checked against a known answer");
  }

  console.log("\nConnecting");
  {
    await wipe();
    await Dropbox.forget();
    await Dropbox.setAppKey("  app-key-123  ");
    is(await Dropbox.appKey(), "app-key-123", "the app key is trimmed, since it arrives pasted");

    const url = await Dropbox.beginUrl();
    yes(url.indexOf("code_challenge_method=S256") > 0, "the authorize URL asks for S256");
    yes(url.indexOf("token_access_type=offline") > 0,
        "and for offline access, without which it would ask to reconnect every four hours");
    yes(url.indexOf("redirect_uri") < 0,
        "with no redirect URI, which is what makes Dropbox show the code instead");

    yes(await Dropbox.pending(),
        "starting leaves a record that it started, so the step can be resumed");
    const again = await Dropbox.resumeUrl();
    is(again, url, "and resuming rebuilds the same URL rather than storing it twice");

    let err = null;
    try { await Dropbox.finish("WRONG"); } catch (e) { err = e.message; }
    yes(/already used or has expired/.test(err || ""),
        "a bad code says what to do about it", err);
    is(await Dropbox.connected(), false, "and leaves the app disconnected");
    yes(await Dropbox.pending(),
        "with the step still open, because a mistyped code is not a reason to start again");

    await Dropbox.finish("THE-CODE");
    is(await Dropbox.connected(), true, "the right one connects");
    is((await Store.meta("dropboxVerifier")) || null, null,
       "and the verifier is cleared, because it is single use");
    is(await Dropbox.pending(), null, "so nothing is left half-finished");

    await Dropbox.beginUrl();
    is(await Dropbox.pending(), null,
       "and once connected, a stray verifier is not mistaken for an unfinished connection");
    await Dropbox.cancel();
  }

  console.log("\nThe first sync of an empty account");
  {
    await wipe();
    await Store.put(mk({ venue: "Eldorado", cashIn: 2000, cashOut: 2650, date: "2026-08-30" }));
    const r = await Dropbox.sync();

    is(r.pulled, 0, "nothing to pull");
    is(r.pushed, 1, "one session pushed");
    yes(Dropbox.RECORD in far.files, "the record is written");
    yes(Dropbox.SHEET in far.files, "and the spreadsheet beside it");
    is((await Store.unsynced()).length, 0, "and nothing is left flagged as unsaved");

    const parsed = Backup.parse(far.files[Dropbox.RECORD]);
    is(parsed.sessions.length, 1, "the file round trips");
    is(parsed.sessions[0].venue, "Eldorado", "with the session in it");
  }

  console.log("\nA second device");
  {
    // The far side gains a session this one has never seen.
    const theirs = mk({ id: "other-1", venue: "Peppermill", cashIn: 500, cashOut: 900,
                        date: "2026-08-28", updated: Date.now() });
    const mine = await Store.all();
    far.files[Dropbox.RECORD] = Backup.json(mine.concat([theirs]), {});

    const r = await Dropbox.sync();
    is(r.pulled, 1, "the unseen session comes down");
    is((await Store.all()).length, 2, "and is stored");
    is(Backup.parse(far.files[Dropbox.RECORD]).sessions.length, 2,
       "and the merged pair goes back up, so neither device loses the other's work");
  }

  console.log("\nA deletion has to stay deleted");
  {
    await Store.remove("other-1");
    const tomb = await Store.deletions();
    yes(tomb["other-1"], "deleting leaves a tombstone");

    await Dropbox.sync();
    const remote = Backup.parse(far.files[Dropbox.RECORD]);
    is(remote.sessions.length, 1, "the far side drops it too");
    yes(remote.deleted["other-1"], "and carries the tombstone, so another device will drop it");

    // The classic failure: the other device still has the row and pushes it back.
    const stale = mk({ id: "other-1", venue: "Peppermill", updated: 1 });
    far.files[Dropbox.RECORD] = Backup.json(
      Backup.parse(far.files[Dropbox.RECORD]).sessions.concat([stale]), remote.deleted);

    await Dropbox.sync();
    is((await Store.all()).filter((s) => s.id === "other-1").length, 0,
       "a copy that still holds it does not bring it back");
  }

  console.log("\nA deletion that was a mistake is not permanent");
  {
    // Re-entering the same session by hand writes a newer row than the
    // tombstone, so the tombstone loses. Nothing has to be un-deleted.
    const again = mk({ id: "other-1", venue: "Peppermill", updated: Date.now() + 1000 });
    const merged = Backup.merge(await Store.all(), [again], await Store.deletions());
    is(merged.sessions.filter((s) => s.id === "other-1").length, 1,
       "a row newer than the tombstone that names it survives");
  }

  console.log("\nTokens");
  {
    const before = far.issued;
    const a = await Store.meta("dropboxAuth");
    a.expires = Date.now() - 1000;                       // expired
    await Store.meta("dropboxAuth", a);
    await Dropbox.sync();
    is(far.issued, before + 1, "an expired token is refreshed without asking anyone");

    const b = await Store.meta("dropboxAuth");
    yes(b.expires > Date.now() + 3600000, "and the new expiry is stored");

    const spent = far.issued;
    await Dropbox.sync();
    is(far.issued, spent, "a live token is not refreshed for the sake of it");
  }

  console.log("\nWhat a failure says");
  {
    is(Dropbox.readable(401, ""), "Dropbox rejected the login. Disconnect and connect again.",
       "401 tells you the one thing that fixes it");
    yes(/rate limiting/.test(Dropbox.readable(429, "")), "429 says to wait");
    yes(/Nothing was lost/.test(Dropbox.readable(503, "")),
        "a server error says the record is safe, which is the actual worry");
    yes(/files.content.read/.test(Dropbox.readable(400, '{"error_summary":"missing_scope/..."}')),
        "a missing permission names the permission");

    far.fail = { status: 500, body: "boom" };
    let err = null;
    try { await Dropbox.sync(); } catch (e) { err = e.message; }
    yes(/Nothing was lost/.test(err || ""), "and a failed sync surfaces that, not a stack trace", err);
    is((await Store.all()).length, 1, "with the local record untouched");
  }

  console.log("\nDisconnecting");
  {
    await Dropbox.forget();
    is(await Dropbox.connected(), false, "the login is gone");
    is(await Dropbox.appKey(), "app-key-123", "the app key is kept, so reconnecting is one tap");
    let err = null;
    try { await Dropbox.sync(); } catch (e) { err = e.message; }
    yes(/Not connected/.test(err || ""), "and syncing says so plainly", err);
    yes(Dropbox.RECORD in far.files, "the file in Dropbox is left exactly where it was");
  }

  console.log(fails ? `\n${fails} FAILED\n` : "\nall checks passed\n");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
