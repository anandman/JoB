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
const ASSETS = [
  "css/style.css",
  "js/data.js",
  "js/poker.js",
  "js/strategy-engine.js",
  "js/casinos.js",
  "js/promo.js",
  "js/analyzer.js",
  "js/app.js",
];

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const write = (p, s) => fs.writeFileSync(path.join(ROOT, p), s);

function main() {
  const h = crypto.createHash("sha256");
  for (const a of ASSETS) h.update(read(a));
  const version = h.digest("hex").slice(0, 8);

  // index.html: (re)stamp every asset reference.
  let html = read("index.html");
  for (const a of ASSETS) {
    const esc = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp('(src|href)="' + esc + '(\\?v=[a-f0-9]+)?"', "g"),
                        '$1="' + a + "?v=" + version + '"');
  }
  write("index.html", html);

  // sw.js: same version for the cache name, and stamp the precache list so it
  // matches what the page actually requests.
  let sw = read("sw.js");
  sw = sw.replace(/const VERSION = "[^"]*";/, 'const VERSION = "' + version + '";');
  for (const a of ASSETS) {
    const esc = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    sw = sw.replace(new RegExp('"\\./' + esc + '(\\?v=[a-f0-9]+)?"', "g"),
                    '"./' + a + "?v=" + version + '"');
  }
  write("sw.js", sw);

  console.log("stamped " + ASSETS.length + " assets with v=" + version);
}

main();
