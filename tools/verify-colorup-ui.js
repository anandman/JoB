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

  console.log("\nThe page can say which build it is");
  {
    // "Did it deploy?" should be answerable from the phone rather than from a
    // shell with curl, so the stamper writes the build into the page.
    const meta = /<meta name="build" content="([^"]*)">/.exec(html);
    yes(meta, "index.html carries a build stamp");
    yes(meta && /^[a-f0-9]{8}$|^dev$/.test(meta[1]),
        "which is either a content hash or the unstamped source", meta && meta[1]);
    yes(/controllerchange/.test(html) && /reg\.update\(\)/.test(html),
        "and asks for a new worker on every return to the foreground");
    yes(/sheet-backdrop/.test(html.split("controllerchange")[1] || ""),
        "but never reloads over an open form");
  }

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

  console.log("\nThe form fills itself in where it can");
  {
    click($("#log-add"));
    const games = $('#sheet-body [data-key="game"]');
    yes(games.querySelectorAll("optgroup").length >= 3,
        "twenty-odd games are grouped, not one long list");
    yes(Array.from(games.options).some((o) => o.value === "Baccarat") &&
        Array.from(games.options).some((o) => o.value === "Pai Gow Poker"),
        "with the games nobody plays often still there when they do");

    type("game", "Blackjack");
    is($('#sheet-body [data-key="tcRate"]').value, "25",
       "picking a table game suggests the table rate");
    type("game", "Slots");
    is($('#sheet-body [data-key="tcRate"]').value, "5", "and a machine suggests the machine rate");

    // A suggestion that overwrites your own answer is worse than no suggestion.
    type("tcRate", "20");
    type("game", "Video Poker");
    is($('#sheet-body [data-key="tcRate"]').value, "20",
       "but once you have set it yourself, changing the game leaves it alone");

    type("venue", "Silver Legacy");
    is($('#sheet-body [data-key="location"]').value, "Reno, NV",
       "a venue you have been to before knows what city it is in");

    const shownFor = () => Array.from($('#sheet-body [data-key="detail"]')
      .parentNode.querySelectorAll(".pick")).map((b) => b.textContent);

    type("game", "Blackjack");
    yes(shownFor().indexOf("$25 table, 6 deck S17") < 0,
        "what the field already says is not offered back as a suggestion", shownFor().join(" | "));

    type("detail", "");
    is(shownFor()[0], "$25 table, 6 deck S17",
       "and cleared, the table you played at this venue is the first thing offered");

    type("game", "Video Poker");
    const other = shownFor();
    yes(other.indexOf("$25 table, 6 deck S17") >= 0 && other.indexOf("9/5 JoB $5 high limit") >= 0,
        "a game you have not played there yet still offers everything, rather than nothing",
        other.join(" | "));

    click(footBtn("Cancel"));
    await settle();
  }

  console.log("\nAdding money without leaving the session");
  {
    click($$("#now-card .btn").find((b) => b.textContent === "Add money"));
    is($("#sheet-title").textContent, "Add money", "the running card offers it directly");
    const amount = $("#sheet-body .field.hero input");
    yes(amount, "with one number to type");

    amount.value = "500";
    fire(amount, "input");
    const shown = $("#sheet-body .derived").textContent.replace(/\s+/g, "");
    yes(/Insofar\$2,100/.test(shown) && /Then\$2,600/.test(shown),
        "and the running total shown before and after, so the tap is checkable", shown);

    click(footBtn("Add"));
    await settle();

    const open = w.Store.running(await w.Store.all());
    is((open.buyIns || []).length, 1, "it is recorded as a top-up");
    is(open.cashIn, 2000, "and the opening figure is left alone, because that is a different fact");
    is(w.Store.derive(open).moneyIn, 2600, "while the money in is the total");
    yes(/1 top-up/.test($("#now-card .since").textContent),
        "the card says so", $("#now-card .since").textContent);
  }

  console.log("\nColoring up");
  {
    click($("#now-card .big-btn"));
    is($("#sheet-title").textContent, "Color up", "the short form asks only for the end of it");
    yes($("#sheet-body .field.hero"), "cash out is the field it puts in front of you");

    type("end", localStamp(2026, 8, 30, 13, 30));
    type("cashOut", "2650");
    type("endTC", "4600");
    type("handsOverride", "");
    click($('#sheet-body [data-key="handpays"] .btn'));      // + Add a handpay
    const amount = $('#sheet-body [data-hp="amount"]');
    const withheld = $('#sheet-body [data-hp="withheld"]');
    amount.value = "4000"; fire(amount, "input");
    withheld.value = "0";  fire(withheld, "input");
    type("comment", "Quad aces, hit the tier.");

    const shown = $("#sheet-body .derived").textContent;
    yes(/\+\$50\.00/.test(shown),
        "and the $500 gone back for is money in too, so +$550 is really +$50", shown);

    click(footBtn("Save"));
    await settle();
  }

  const rows = await w.Store.all();
  is(rows.length, 2, "two sessions");
  {
    const s = rows[1], d = w.Store.derive(s);
    near(d.winLoss, 50, "casino money and money fetched later both count as money in");
    near(d.cashIn, 2500, "cash in is the total, not the opening figure");
    yes(/\$500/.test(w.Backup.row(s).topUps),
        "and the sheet keeps the top-up as its own column", w.Backup.row(s).topUps);
    near(d.hours, 4.5, "four and a half hours");
    near(d.sessionTC, 1440, "1,440 tier credits earned");
    near(d.coinIn, 7200, "$7,200 through the machine at the $5 rate");
    near(d.perHour, 11.11, "$11.11 an hour");
    near(d.handsPerHour, 64, "64 hands an hour at $25 a hand");
    is(d.handpayCount, 1, "one W-2G");
    near(d.handpayTotal, 4000, "for $4,000");
    is(w.Store.running(rows), null, "and nothing is left running");
  }

  console.log("\nA bet that varied");
  {
    // The session above was flat, so hands came from coin-in. Counting them
    // instead is what a progression needs, and the average bet then follows.
    const vp = (await w.Store.all()).find((s) => s.venue === "Eldorado");
    click($$("#log-list .session")[0]);
    type("handsOverride", "1200");
    type("system", "d'Alembert");
    const shown = $("#sheet-body .derived").textContent.replace(/\s+/g, "");
    yes(/Hands1,200·counted/.test(shown),
        "counted hands are used, and the panel says that is where the number came from", shown);
    yes(/\$6\.00workedout/.test(shown),
        "and the average bet is worked out from them rather than assumed", shown);
    click(footBtn("Save"));
    await settle();

    const saved = (await w.Store.all()).find((s) => s.id === vp.id);
    const d = w.Store.derive(saved);
    is(d.hands, 1200, "which is what gets stored");
    is(d.handsCounted, true, "flagged as counted, so the sheet does not read as a flat bet");
    is(saved.system, "d'Alembert", "with the system recorded beside it");
    is(w.Backup.row(saved).handsFrom, "counted", "and the column says which number was typed");
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
    near(t.winLoss, 475, "which are +$475");
    near(t.grossWin, 475, "gross winnings");
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

    yes($('#sheet-body [data-key="buyIns"]'),
        "with the top-ups listed for editing, not just for reading");
    is($('#sheet-body [data-bi="amount"]').value, "500", "showing what was added");

    type("cashOut", "2700");
    click(footBtn("Save"));
    await settle();
    const edited = (await w.Store.all()).find((s) => s.venue === "Eldorado");
    near(w.Store.derive(edited).winLoss, 100, "the change takes");

    // Removing a top-up subtracts it, which is the only sane meaning of the ×.
    click($$("#log-list .session")[0]);
    click($('#sheet-body [data-key="buyIns"] .drop'));
    click(footBtn("Save"));
    await settle();
    const pruned = (await w.Store.all()).find((s) => s.venue === "Eldorado");
    is((pruned.buyIns || []).length, 0, "removing a top-up removes it");
    near(w.Store.derive(pruned).cashIn, 2000, "and gives the money back");

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

  console.log("\nA half-finished connection survives leaving the app");
  {
    // Fetching the code means going to dropbox.com, and a home screen app that
    // is left may be reloaded before you get back. Coming back to a Connect
    // button with a code in hand and nowhere to put it is how this is lost.
    $('#dropbox-box input').value = "app-key-123";
    fire($('#dropbox-box input'), "input");
    click($$("#dropbox-box .btn").find((b) => b.textContent === "Connect"));
    await settle();
    yes($("#dropbox-box .code-input"), "connecting offers somewhere to paste the code");

    // The app is reloaded from scratch, exactly as iOS may do behind you.
    w.App.show("now");
    await w.App.refresh();
    await settle();
    const banner = $$("#banners .banner").find((b) => /Finish connecting/.test(b.textContent));
    yes(banner, "and a banner says so from wherever you land");

    click(banner);
    await settle();
    yes($("#dropbox-box .code-input"),
        "which leads straight back to the box, still waiting");

    click($$("#dropbox-box .btn").find((b) => b.textContent === "Start over"));
    await settle();
    yes(!$("#dropbox-box .code-input"), "and starting over puts it away");
  }

  console.log("\nStats");
  {
    w.App.show("stats");
    await settle();
    yes($("#stats-body .stat-grid"), "the tab renders from whatever is there");

    // One session is its own best, worst and longest. Printing it three times
    // said nothing three times, and said it without labels.
    const only = await w.Store.all();
    if (only.length === 1) {
      yes(!/Extremes/.test($("#stats-body").textContent),
          "with no Extremes section, because one session is not extreme against anything");
    }
    const sel = $$("#stats-filters select")[0];
    sel.value = "2026";
    fire(sel, "change");
    await settle();
    yes(/For the return/.test($("#stats-body").textContent),
        "and picking a year adds the figures a return asks for");
    yes(/do not net/.test($("#stats-body").textContent),
        "with the warning that they do not net");

    // Two sessions with the same result would still repeat a row without the
    // deduplication, so check the rows are distinct rather than just counted.
    await w.Store.put(Object.assign(w.Store.blank(), {
      date: "2026-07-04", venue: "Peppermill", game: "Craps", cashIn: 300, cashOut: 900,
      start: "2026-07-04T18:00:00Z", end: "2026-07-04T21:00:00Z"
    }));
    await w.App.refresh();
    w.App.show("stats");
    await settle();
    const labels = $$("#stats-body .extreme-label").map((n) => n.textContent);
    yes(labels.length >= 2, "with more than one session the extremes appear", labels.join(","));
    yes(labels.indexOf("Best") >= 0 && labels.indexOf("Worst") >= 0,
        "and each says which extreme it is");
    const ids = $$("#stats-body .extreme .session").length;
    is(ids, labels.length, "one row per label, never the same session twice");
  }

  console.log(fails ? `\n${fails} FAILED\n` : "\nall checks passed\n");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
