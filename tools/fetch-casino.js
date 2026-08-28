#!/usr/bin/env node
/**
 * Regenerate js/casinos.js from vpfree2.com casino listings.
 *
 *   node tools/fetch-casino.js silver-legacy eldorado-hotel-casino ...
 *   node tools/fetch-casino.js --promo silver-legacy eldorado-hotel-casino
 *
 * Pass either a vpfree2 casino slug or a full URL. Casinos listed after
 * --promo are flagged as running the current promotion.
 *
 * vpfree2 sends no CORS headers, so the browser can't fetch it directly —
 * this runs locally and bakes the result into a static data file.
 *
 * The listings are hand-maintained HTML with no stable markup contract, so
 * this parser is best-effort. It reports what it found; eyeball the counts
 * against the site before trusting a refresh.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", "js", "casinos.js");
const CONFIG = path.join(__dirname, "casinos.config.json");

/**
 * Payout schedules on vpfree2 are listed low hand to high, royal last.
 * Length identifies the family, which lets us name each payout tier.
 */
const FAMILIES = {
  9: ["Jacks or Better", "Two Pair", "3 of a Kind", "Straight", "Flush",
      "Full House", "4 of a Kind", "Straight Flush", "Royal Flush"],
  10: ["3 of a Kind", "Straight", "Flush", "Full House", "4 of a Kind",
       "Straight Flush", "5 of a Kind", "Wild Royal Flush", "4 Deuces",
       "Natural Royal Flush"],
  11: ["Jacks or Better", "Two Pair", "3 of a Kind", "Straight", "Flush",
       "Full House", "4 5s–Ks", "4 2s–4s", "4 Aces", "Straight Flush",
       "Royal Flush"],
  13: ["Jacks or Better", "Two Pair", "3 of a Kind", "Straight", "Flush",
       "Full House", "4 5s–Ks", "4 2s–4s", "4 Aces", "4 2s–4s + A/2/3/4",
       "4 Aces + 2/3/4", "Straight Flush", "Royal Flush"],
};

function flatten(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " | ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ");
}

function parseDenoms(text) {
  const out = [];
  const re = /(\d+(?:\.\d+)?)\s*¢|\$\s*(\d+(?:\.\d+)?)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    out.push(m[1] !== undefined ? Number(m[1]) / 100 : Number(m[2]));
  }
  // "$1–$25" denotes a range across standard denominations.
  if (/[–-]/.test(text) && out.length === 2 && out[1] > out[0]) {
    const ladder = [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 25, 100];
    return ladder.filter((d) => d >= out[0] && d <= out[1]);
  }
  return [...new Set(out)].sort((a, b) => a - b);
}

/**
 * Is this cell the denomination list, rather than prose that merely mentions
 * a dollar figure? Locations like "near 4th/Virginia entrance ($10 per point)"
 * contain a "$10" but are not denomination cells — the test is whether
 * anything survives once denominations and separators are removed.
 */
function isDenomCell(text) {
  if (!text) return false;
  const rest = text
    .replace(/(\d+(?:\.\d+)?)\s*¢/g, "")
    .replace(/\$\s*(\d+(?:\.\d+)?)/g, "")
    .replace(/[,\s–-]/g, "");
  return rest === "" && parseDenoms(text).length > 0;
}

const RE_PLAY     = /^[\d\s-]*play$/i;
const RE_MACHINES = /^\d+\s+(machine|slant|upright|bartop|round|carousel|game)/i;
const RE_COINS    = /coins?$/i;

/**
 * One game can span several machine banks, each with its own denominations,
 * location, and tier credit earn rate. The listing writes them as repeating
 * groups after the payout schedule, with no marker other than a new
 * denomination cell starting each group.
 */
function parseBanks(tokens) {
  const banks = [];
  let current = null;

  for (const t of tokens) {
    if (isDenomCell(t)) {
      current = { denoms: parseDenoms(t), perPoint: null, location: "", play: "", machines: "" };
      banks.push(current);
      continue;
    }
    if (!current) continue;

    const rate = /\$\s*(\d+(?:\.\d+)?)\s*per\s*point/i.exec(t);
    if (rate) current.perPoint = Number(rate[1]);

    if (RE_PLAY.test(t) || RE_COINS.test(t)) { current.play = current.play || t; continue; }
    if (RE_MACHINES.test(t)) { current.machines = current.machines || t; continue; }

    // Prose wins the location slot; short codes (MG, Prog, IGT) never do.
    const words = t.split(/\s+/).length;
    if ((rate || words >= 2) && t.length > current.location.length) current.location = t;
  }

  return banks.filter((b) => b.denoms.length);
}

// Site chrome that follows the last game block. Without cutting here, the
// final game absorbs footer text and renders "All rights Reserved (c) 2026
// vpFREE2" as a machine location.
const FOOTER = /all rights reserved|logos provided by|^contact us$|privacy policy|^terms\b/i;

function parseCasino(html, slug, promo) {
  let tokens = flatten(html)
    .split("|")
    .map((t) => t.trim())
    .filter(Boolean);

  const cut = tokens.findIndex((t) => FOOTER.test(t));
  if (cut !== -1) tokens = tokens.slice(0, cut);

  // Index every payout-return marker so each game's block has a clear end.
  const marks = [];
  for (let i = 0; i < tokens.length; i++) {
    if (/^(\d{2,3}\.\d+)%/.test(tokens[i])) marks.push(i);
  }

  const games = [];
  for (let m = 0; m < marks.length; m++) {
    const i = marks[m];
    const stop = m + 1 < marks.length ? marks[m + 1] : tokens.length;
    const pct = /^(\d{2,3}\.\d+)%/.exec(tokens[i]);

    // Walk to the payout schedule, collecting name and variant on the way.
    let payouts = null, j = i + 1;
    const between = [];
    for (; j < stop && j < i + 6; j++) {
      if (/^\d+(-\d+)+$/.test(tokens[j])) {
        payouts = tokens[j].split("-").map(Number);
        break;
      }
      between.push(tokens[j]);
    }
    if (!payouts) continue;

    const banks = parseBanks(tokens.slice(j + 1, stop));
    if (!banks.length) continue;

    games.push({
      name: between[0] || "Unknown",
      variant: between[1] || "",
      ret: Number(pct[1]),
      payouts: payouts,
      hands: FAMILIES[payouts.length] || null,
      denoms: [...new Set(banks.flatMap((b) => b.denoms))].sort((a, b) => a - b),
      banks: banks,
    });
  }

  // The same game can be listed more than once; fold those together.
  const byKey = new Map();
  for (const g of games) {
    const key = g.name + "|" + g.payouts.join("-");
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, g); continue; }
    prev.banks = prev.banks.concat(g.banks);
    prev.denoms = [...new Set([...prev.denoms, ...g.denoms])].sort((a, b) => a - b);
  }

  const merged = [...byKey.values()].sort((a, b) => b.ret - a.ret);
  return {
    key: slug,
    name: null, // filled from og:title
    promo: promo,
    source: "https://www.vpfree2.com/casino/" + slug,
    games: merged,
  };
}

function titleOf(html) {
  // The <title> is the same site-wide banner on every page; og:title carries
  // the casino, as "Silver Legacy at vpFREE2.com".
  const m = /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i.exec(html);
  if (!m) return null;
  return m[1].replace(/\s+at\s+vpFREE2\.com\s*$/i, "").trim() || null;
}

async function main() {
  const argv = process.argv.slice(2);
  const targets = [];

  if (argv.length) {
    let promoMode = false;
    for (const a of argv) {
      if (a === "--promo") { promoMode = true; continue; }
      targets.push({ slug: a.replace(/^https?:\/\/[^/]+\/casino\//, "").replace(/\/$/, ""), promo: promoMode });
    }
  } else {
    // No arguments: refresh whatever the config lists. This is what CI runs.
    if (!fs.existsSync(CONFIG)) {
      console.error("usage: node tools/fetch-casino.js [--promo] <slug|url>...");
      console.error("   or: add slugs to " + CONFIG + " and run with no arguments");
      process.exit(1);
    }
    const cfg = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
    for (const slug of cfg.promo || []) targets.push({ slug, promo: true });
    for (const slug of cfg.other || []) targets.push({ slug, promo: false });
    console.error("using " + path.basename(CONFIG) + ": " + targets.length + " casinos");
  }

  const casinos = [];
  for (const t of targets) {
    const url = "https://www.vpfree2.com/casino/" + t.slug;
    process.stderr.write("fetching " + url + " ... ");
    const res = await fetch(url, { headers: { "user-agent": "jacks-or-betterment/1.0" } });
    if (!res.ok) {
      console.error("HTTP " + res.status + " — skipped");
      continue;
    }
    const html = await res.text();
    const casino = parseCasino(html, t.slug, t.promo);
    casino.name = titleOf(html) || t.slug;
    console.error(casino.games.length + " games");
    for (const g of casino.games) {
      console.error("    " + String(g.ret).padStart(6) + "%  " + g.name.slice(0, 28).padEnd(30) +
        g.banks.length + " bank" + (g.banks.length === 1 ? " " : "s") +
        (g.hands ? "" : "   [unrecognized family: " + g.payouts.length + " tiers]"));
      for (const b of g.banks) {
        console.error("             " +
          b.denoms.map((d) => (d < 1 ? Math.round(d * 100) + "c" : "$" + d)).join(",").padEnd(22) +
          (b.perPoint ? ("$" + b.perPoint + "/pt").padEnd(9) : "".padEnd(9)) +
          b.location.slice(0, 46));
      }
    }
    casinos.push(casino);
  }

  if (!casinos.length) {
    console.error("nothing fetched; leaving " + OUT + " untouched");
    process.exit(1);
  }

  const body = "/**\n * Jacks or Betterment — Casino floor data\n" +
    " * GENERATED by tools/fetch-casino.js. Do not edit by hand.\n" +
    " * Source: vpfree2.com\n */\n\n" +
    "const CASINOS = " + JSON.stringify(casinos, null, 2) + ";\n";
  fs.writeFileSync(OUT, body);
  console.error("\nwrote " + OUT + " (" + casinos.length + " casinos)");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
