#!/usr/bin/env node
/**
 * Stamp a content hash onto every local asset URL.
 *
 *     node tools/stamp-assets.js
 *
 * GitHub Pages serves everything with `Cache-Control: max-age=600`, so for ten
 * minutes after a deploy a browser can pair the new index.html with cached old
 * JS. That combination throws on load and leaves the page half-rendered.
 * Stamping `?v=<hash>` makes the HTML and its assets version together, so the
 * two can never disagree.
 *
 * The site still runs unstamped straight from source — this is a deploy step,
 * not a build step. Re-running it is safe and idempotent.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "..");

// One entry per app. Each app owns its index.html and service worker and gets
// its own hash, so a video poker change doesn't invalidate the blackjack cache
// and send everyone a pointless re-download. Apps not built yet are skipped.
const APPS = [
  {
    dir: "job",
    assets: [
      "css/style.css",
      "js/data.js",
      "js/poker.js",
      "js/strategy-engine.js",
      "js/casinos.js",
      "js/promo.js",
      "js/analyzer.js",
      "js/app.js",
    ],
  },
  {
    dir: "colorup",
    assets: [
      "css/style.css",
      "js/xlsx.js",
      "js/store.js",
      "js/export.js",
      "js/analysis.js",
      "js/dropbox.js",
      "js/app.js",
    ],
  },
  {
    dir: "bob",
    assets: [
      "css/style.css",
      "js/rules.js",
      "js/engine.js",
      "js/strategy.js",
      "js/analyzer.js",
      "js/game.js",
      "js/risk.js",
      "js/indices.js",
      "js/app.js",
    ],
  },
];

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const write = (p, s) => fs.writeFileSync(path.join(ROOT, p), s);
const exists = (p) => fs.existsSync(path.join(ROOT, p));
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function stamp(app) {
  const html = path.join(app.dir, "index.html");
  if (!app.assets.length || !exists(html)) {
    console.log(app.dir + ": nothing to stamp");
    return;
  }

  const h = crypto.createHash("sha256");
  for (const a of app.assets) h.update(read(path.join(app.dir, a)));
  const version = h.digest("hex").slice(0, 8);

  // index.html: (re)stamp every asset reference.
  let doc = read(html);
  for (const a of app.assets) {
    doc = doc.replace(new RegExp('(src|href)="' + escape(a) + '(\\?v=[a-f0-9]+)?"', "g"),
                      '$1="' + a + "?v=" + version + '"');
  }
  // A build stamp the app can show. "Is the fix on my phone?" should be
  // answerable from the phone, not from a shell with curl.
  doc = doc.replace(/<meta name="build" content="[^"]*">/,
                    '<meta name="build" content="' + version + '">');
  write(html, doc);

  // sw.js: same version for the cache name, and stamp the precache list so it
  // matches what the page actually requests.
  const swPath = path.join(app.dir, "sw.js");
  if (exists(swPath)) {
    let sw = read(swPath);
    sw = sw.replace(/const VERSION = "[^"]*";/, 'const VERSION = "' + version + '";');
    for (const a of app.assets) {
      sw = sw.replace(new RegExp('"\\./' + escape(a) + '(\\?v=[a-f0-9]+)?"', "g"),
                      '"./' + a + "?v=" + version + '"');
    }
    write(swPath, sw);
  }

  console.log(app.dir + ": stamped " + app.assets.length + " assets with v=" + version);
}

for (const app of APPS) stamp(app);
