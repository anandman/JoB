#!/usr/bin/env node
/**
 * Drive the whole interface the way a person does.
 *
 *     NODE_PATH=/path/to/node_modules node tools/verify-colorup-ui.js
 *
 * Needs jsdom and fake-indexeddb, which are not vendored — this repository ships
 * with no dependencies and is not going to acquire any for a test. Install them
 * anywhere and point NODE_PATH at it; without them the script skips rather
 * than fails, so the other checks still run on a bare checkout.
 *
 * The two paths that matter are the two you use: adding a session you already
 * played, and running one live from the first tap to the cash out. Everything
 * else here is on the way to those.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { TextEncoder } = require("util");

let JSDOM, fakeIndexedDB, FDBKeyRange;
try {
  ({ JSDOM } = require("jsdom"));
  fakeIndexedDB = require("fake-indexeddb").default || require("fake-indexeddb");
  FDBKeyRange = require("fake-indexeddb/lib/FDBKeyRange");
} catch (e) {
  console.log("\nSkipped: needs jsdom and fake-indexeddb on NODE_PATH.\n");
  process.exit(0);
}

const ROOT = path.join(__dirname, "..", "colorup");

let fails = 0;
const pass = (m) => console.log("  ok   " + m);
const fail = (m) => { fails++; console.log("  FAIL " + m); };
const yes = (cond, m, detail) => (cond ? pass(m) : fail(m + (detail ? " — " + detail : "")));
const is = (got, want, m) => yes(got === want, m, "got " + JSON.stringify(got));
const near = (got, want, m) => yes(Math.abs(got - want) < 0.005, m, "got " + got);

/* ===== a browser, more or less ===== */

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const css = fs.readFileSync(path.join(ROOT, "css/style.css"), "utf8");

// Take the script list from the page rather than keeping a copy of it here.
// A hand-maintained list silently stops covering a file the moment one is
// added, which is exactly what happened when Dropbox sync arrived.
const SCRIPTS = Array.from(html.matchAll(/<script src="([^"?]+)/g)).map((m) => m[1]);

// runScripts lets the app's own files be evaluated inside the window, which is
// the only way a top-level `var Store = ...` becomes a global the next file can
// see — exactly what a <script> tag does.
const dom = new JSDOM(html.replace(/<script[\s\S]*?<\/script>/g, ""), {
  url: "https://example.test/colorup/",
  pretendToBeVisual: true,
  runScripts: "dangerously",
});
const w = dom.window;
const doc = w.document;

let confirmAnswer = true;
let downloads = [];

w.indexedDB = fakeIndexedDB;
w.IDBKeyRange = FDBKeyRange;
w.TextEncoder = TextEncoder;
w.structuredClone = structuredClone;
w.confirm = () => confirmAnswer;
w.scrollTo = () => {};
w.URL.createObjectURL = () => "blob:test";
w.URL.revokeObjectURL = () => {};
// jsdom's window.crypto is a getter, so it has to be redefined rather than
// assigned. Its subtle is missing, and PKCE needs a digest.
Object.defineProperty(w, "crypto", { value: crypto, configurable: true });
// Nothing here should reach the network. Anything that tries is a bug, and
// failing loudly is better than a check quietly passing against a real server.
w.fetch = () => Promise.reject(new Error("the interface reached the network"));
w.open = () => null;

for (const f of SCRIPTS) w.eval(fs.readFileSync(path.join(ROOT, f), "utf8"));
// A jsdom anchor cannot navigate, so record the click instead of following it.
w.HTMLAnchorElement.prototype.click = function () {
  downloads.push({ name: this.getAttribute("download"), href: this.getAttribute("href") });
};

/** Let the store's promises, and the renders that follow them, run out. */
const settle = async (n = 12) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

const $ = (sel) => doc.querySelector(sel);
const $$ = (sel) => Array.from(doc.querySelectorAll(sel));
const click = (node) => node.dispatchEvent(new w.MouseEvent("click", { bubbles: true }));
const fire = (node, name) => node.dispatchEvent(new w.Event(name, { bubbles: true }));

/** Type into a field of the open sheet, exactly as a person would. */
function type(key, value) {
  const node = $(`#sheet-body [data-key="${key}"]`);
  if (!node) throw new Error("no field " + key + " in the open sheet");
  node.value = value;
  fire(node, "input");
  fire(node, "change");
}
const footBtn = (label) => $$("#sheet-foot .btn").find((b) => b.textContent === label);
const sheetOpen = () => !$("#sheet-backdrop").hidden;

/** Local wall time in the form a datetime-local input speaks. */
function localStamp(y, mo, d, h, mi) {
  const p = (n) => (n < 10 ? "0" : "") + n;
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(mi)}`;
}

(async function run() {
  w.App.init();
  await settle();

  console.log("\nEvery script the page loads is exercised");
  yes(SCRIPTS.length >= 6, "the list comes from index.html, so it cannot fall behind",
      SCRIPTS.join(" "));
  yes(SCRIPTS.indexOf("js/dropbox.js") >= 0, "including the Dropbox client");

  console.log("\nThe sheet is closed until something opens it");
  {
    // An author `display` beats the user agent's [hidden] rule no matter how
    // specific that rule is, so anything hidden by the attribute and given a
    // display by a class needs the guard written out. Nothing in the app's
    // behaviour would show this: the element is flagged hidden and still
    // covers the screen. jsdom does not model the cascade closely enough to
    // catch it either, so this reads the stylesheet directly.
    const classesOfHidden = [];
    for (const m of html.matchAll(/<[^>]*\bhidden\b[^>]*>/g)) {
      const cls = /class="([^"]*)"/.exec(m[0]);
      if (cls) classesOfHidden.push(...cls[1].split(/\s+/).filter(Boolean));
    }
    yes(classesOfHidden.length, "something in the page is hidden by the attribute",
        "nothing found, so this check has stopped checking anything");
    for (const c of classesOfHidden) {
      const sets = new RegExp("\\." + c + "\\s*\\{[^}]*display\\s*:").test(css);
      if (!sets) { pass("." + c + " leaves display to the user agent"); continue; }
      yes(new RegExp("\\." + c + "\\[hidden\\]\\s*\\{[^}]*display\\s*:\\s*none").test(css),
          "." + c + " sets a display, and says what [hidden] means alongside it",
          "add `." + c + "[hidden] { display: none; }` or the element never hides");
    }
  }
  is($("#sheet-backdrop").hidden, true, "and the sheet starts closed");

  console.log("\nAn empty ledger");
  is($("#now-card .big-btn").textContent, "Start a session", "the one button offers the one thing to do");
  yes($("#now-recent .empty"), "and says plainly that there is nothing yet");

  console.log("\nPath one: a session you already played");
  {
    click($("#log-add"));
    is(sheetOpen(), true, "the full form opens");
    is($("#sheet-title").textContent, "Add a past session", "titled as what it is");

    type("date", "2026-08-29");
    type("venue", "Silver Legacy");
    type("location", "Reno, NV");
    type("game", "Blackjack");
    type("detail", "$25 table, 6 deck S17");
    type("start", localStamp(2026, 8, 29, 21, 30));
    type("end", localStamp(2026, 8, 30, 0, 15));
    type("cashIn", "1000");
    type("cashOut", "1425");
    type("startTC", "3100");
    type("endTC", "3160");
    type("tcRate", "25");
    type("perHand", "50");
    type("comment", "Ran the count for two shoes.");

    const shown = $("#sheet-body .derived").textContent;
    yes(/\+\$425\.00/.test(shown), "the panel shows +$425.00 before you commit to it", shown);
    yes(/2h 45m/.test(shown), "and 2h 45m, across midnight", shown);

    click(footBtn("Save"));
    await settle();
    is(sheetOpen(), false, "the sheet closes");
  }

  const afterOne = await w.Store.all();
  is(afterOne.length, 1, "one session stored");
  {
    const s = afterOne[0], d = w.Store.derive(s);
    near(d.winLoss, 425, "win/(loss) is cash out less cash in");
    near(d.hours, 2.75, "the clock crossed midnight without losing a day");
    is(s.date, "2026-08-29", "and the date follows the start, not the end");
    near(d.sessionTC, 60, "60 tier credits");
    near(d.coinIn, 1500, "$1,500 of coin-in at the $25 table rate");
    is(d.coinInIsEstimate, true, "flagged as the pit's estimate, because a table is rated by eye");
  }
  is($$("#log-list .session").length, 1, "and it appears in the log");

  console.log("\nPath two: a session run live");
  {
    click($("#now-card .big-btn"));
    is(sheetOpen(), true, "start opens the short form");
    is($('#sheet-body [data-key="venue"]').value, "Silver Legacy",
       "prefilled with where you were, because it usually still is");
    is($('#sheet-body [data-key="cashIn"]').value, "1425",
       "and the cash you walked away with is the cash you sit down with");

    type("venue", "Eldorado");
    type("game", "Video Poker");
    type("detail", "9/5 JoB $5 high limit");
    type("cashIn", "2000");
    type("bonus", "100");
    type("startTC", "3160");
    type("tcRate", "5");
    type("perHand", "25");
    type("start", localStamp(2026, 8, 30, 9, 0));

    const opening = $("#sheet-body .derived").textContent;
    yes(/Moneyin\$2,100/.test(opening.replace(/\s+/g, "")),
        "the panel shows $2,100 on the table, not a $2,100 loss", opening);
    yes(!/Win/.test(opening), "there is no win or loss to show until there is a cash out", opening);

    click(footBtn("Start"));
    await settle();

    is(sheetOpen(), false, "the sheet closes");
    yes($("#now-card .clock"), "the button becomes a running clock");
    is($("#now-card .big-btn").textContent, "Color up", "and the one thing to do is now to color up");
  }

  console.log("\nColoring up");
  {
    click($("#now-card .big-btn"));
    is($("#sheet-title").textContent, "Color up", "the short form asks only for the end of it");
    yes($("#sheet-body .field.hero"), "cash out is the field it puts in front of you");

    type("end", localStamp(2026, 8, 30, 13, 30));
    type("cashOut", "2650");
    type("endTC", "4600");
    click($('#sheet-body [data-key="handpays"] .btn'));      // + Add a handpay
    const amount = $('#sheet-body [data-hp="amount"]');
    const withheld = $('#sheet-body [data-hp="withheld"]');
    amount.value = "4000"; fire(amount, "input");
    withheld.value = "0";  fire(withheld, "input");
    type("comment", "Quad aces, hit the tier.");

    const shown = $("#sheet-body .derived").textContent;
    yes(/\+\$550\.00/.test(shown),
        "free play is money in, so this reads +$550.00 rather than +$650.00", shown);

    click(footBtn("Save"));
    await settle();
  }

  const rows = await w.Store.all();
  is(rows.length, 2, "two sessions");
  {
    const s = rows[1], d = w.Store.derive(s);
    near(d.winLoss, 550, "casino money counts as money in");
    near(d.hours, 4.5, "four and a half hours");
    near(d.sessionTC, 1440, "1,440 tier credits earned");
    near(d.coinIn, 7200, "$7,200 through the machine at the $5 rate");
    near(d.perHour, 122.22, "$122.22 an hour");
    near(d.handsPerHour, 64, "64 hands an hour at $25 a hand");
    is(d.handpayCount, 1, "one W-2G");
    near(d.handpayTotal, 4000, "for $4,000");
    is(w.Store.running(rows), null, "and nothing is left running");
  }

  console.log("\nThe forgotten color-up asks rather than assuming");
  {
    const stale = w.Store.blank(rows[1]);
    stale.venue = "Peppermill";
    stale.start = new Date(Date.now() - 14 * 3600000).toISOString();
    stale.date = stale.start.slice(0, 10);
    await w.Store.put(stale);
    await w.App.refresh();
    await settle();

    const banner = $("#banners .banner.loud");
    yes(banner && /Still running after 14h/.test(banner.textContent),
        "a loud banner, with how long it has been", banner && banner.textContent);
    yes(banner && /set the time you actually left/.test(banner.textContent),
        "and it offers to close it at the time you really left");

    click(banner);
    is($("#sheet-title").textContent, "Color up", "tapping it opens the color up form");
    const endField = $('#sheet-body [data-key="end"]');
    yes(endField && endField.value, "with an end time filled in and editable");

    click(footBtn("Not yet"));
    await settle();
    yes(w.Store.running(await w.Store.all()), "declining leaves the session running");
  }

  console.log("\nAn open session never counts as a loss");
  {
    const t = w.Analysis.totals(w.Analysis.filter(await w.Store.all(), {}));
    is(t.sessions, 2, "the running session is left out of the totals");
    near(t.winLoss, 975, "which are +$975");
    near(t.grossWin, 975, "gross winnings");
    near(t.grossLoss, 0, "gross losses, kept separate and never netted against them");
  }

  console.log("\nEditing and deleting");
  {
    const running = w.Store.running(await w.Store.all());
    await w.Store.remove(running.id);
    await w.App.refresh();
    await settle();

    click($$("#log-list .session")[0]);                        // newest first
    is($("#sheet-title").textContent, "Edit session", "any row opens for editing");
    yes($('#sheet-body [data-key="date"]') && $('#sheet-body [data-key="cashIn"]') &&
        $('#sheet-body [data-key="handpays"]'),
        "with every field present, including the ones the short forms hide");

    type("cashOut", "2700");
    click(footBtn("Save"));
    await settle();
    const edited = (await w.Store.all()).find((s) => s.venue === "Eldorado");
    near(w.Store.derive(edited).winLoss, 600, "the change takes");

    click($$("#log-list .session")[0]);
    confirmAnswer = false;
    click(footBtn("Delete"));
    await settle();
    is((await w.Store.all()).length, 2, "declining the confirmation deletes nothing");
    confirmAnswer = true;
    click(footBtn("Delete"));
    await settle();
    is((await w.Store.all()).length, 1, "confirming does");
  }

  console.log("\nBacking up, and getting it back");
  {
    const before = await w.Store.all();
    downloads = [];
    w.App.show("data");
    await settle();

    click($$("#data-body .btn").find((b) => /Back up/.test(b.textContent)));
    await settle();
    is(downloads.length, 1, "the backup downloads");
    is(downloads[0].name, "ColorUp-2026.json", "named for the year it covers");
    is((await w.Store.unsynced()).length, 0, "and the sessions stop being flagged as unsaved");

    const parsed = w.Backup.parse(w.Backup.json(before));
    is(parsed.sessions.length, before.length, "the file parses back to the same count");
    is(w.Backup.merge([], parsed.sessions).added, before.length,
       "and merges into an empty device as new sessions");
    is(w.Backup.merge(before, parsed.sessions).added, 0, "merging it back over itself adds nothing");

    // The newer edit of a shared session wins, so two offline devices converge.
    const newer = JSON.parse(JSON.stringify(before[0]));
    newer.cashOut = 9999;
    newer.updated = before[0].updated + 1000;
    const won = w.Backup.merge(before, [newer]);
    is(won.updated, 1, "a newer edit of the same session wins");
    is(won.sessions.find((s) => s.id === newer.id).cashOut, 9999, "and it is the one that survives");

    downloads = [];
    click($$("#data-body .btn").find((b) => /Spreadsheet/.test(b.textContent)));
    await settle();
    is(downloads[0].name, "ColorUp-2026.xlsx", "the spreadsheet writes too");
  }

  console.log("\nThe spreadsheet is a rendering, not a second copy of the truth");
  {
    const stored = await w.Store.all();
    const r = w.Backup.row(stored[0]);
    const d = w.Store.derive(stored[0]);
    is(r.winLoss, d.winLoss, "every derived column comes from the function the app shows you");
    is(r.coinInFrom, d.coinInIsEstimate ? "pit estimate" : "measured",
       "and an estimate says so in words, not as a flag to decode");
    const bytes = w.Backup.workbook(stored, new Date(2026, 7, 30, 12, 0, 0));
    yes(bytes.length > 2000 && bytes[0] === 0x50 && bytes[1] === 0x4b,
        "the workbook is a zip with something in it");
  }

  console.log("\nThe Dropbox panel, with nothing connected");
  {
    // The backup above marked everything safe, so give it something to be
    // loud about again — which is itself the behaviour: any edit un-saves.
    const rows = await w.Store.all();
    await w.Store.put(rows[0]);
    await w.App.refresh();
    w.App.show("data");
    await settle();
    const text = $("#data-body").textContent;
    yes(/Dropbox/.test(text), "the tab offers it");
    yes(/cannot see the rest of your Dropbox/.test(text),
        "and says what it can and cannot reach before asking for anything");
    yes(/files\.content\.read/.test(text), "with the setup steps spelled out, permissions included");

    const banner = $$("#banners .banner").find((b) => /not saved to Dropbox/.test(b.textContent));
    yes(banner, "and the banner names what is missing rather than saying \"unsynced\"");
    yes(banner && /this phone is the only copy/.test(banner.textContent),
        "in terms of what is actually at stake");

    const before = $("#data-body").textContent;
    click($$("#data-body .btn").find((b) => b.textContent === "Connect"));
    await settle();
    yes($("#data-body").textContent === before || !/Paste the code/.test($("#data-body").textContent),
        "connecting without an app key does not pretend to have started");
  }

  console.log("\nStats");
  {
    w.App.show("stats");
    await settle();
    yes($("#stats-body .stat-grid"), "the tab renders from whatever is there");
    const sel = $$("#stats-filters select")[0];
    sel.value = "2026";
    fire(sel, "change");
    await settle();
    yes(/For the return/.test($("#stats-body").textContent),
        "and picking a year adds the figures a return asks for");
    yes(/do not net/.test($("#stats-body").textContent),
        "with the warning that they do not net");
  }

  console.log(fails ? `\n${fails} FAILED\n` : "\nall checks passed\n");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
