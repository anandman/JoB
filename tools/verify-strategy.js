#!/usr/bin/env node
/**
 * Measure what the simple strategy card actually costs against perfect play.
 *
 *     node tools/verify-strategy.js [hands] [game]
 *
 * The card is a human-readable list, so the only way to test it is to make it
 * executable: one predicate per line that answers "does this hand match, and
 * what does it tell me to hold". For each dealt hand we take the first line
 * that matches, price its hold exactly, and compare against the best of all 32
 * holds. The average gap is the card's cost.
 *
 * This is a validation tool. It is not shipped to the browser.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "job/js/data.js"), "utf8")
          + fs.readFileSync(path.join(ROOT, "job/js/poker.js"), "utf8")
          + fs.readFileSync(path.join(ROOT, "job/js/strategy-engine.js"), "utf8");
const { StrategyEngine, Poker, PAY_TABLES, GAMES, ROYAL_FLUSH_5COIN_PER } =
  new Function(src + ";return {StrategyEngine,Poker,PAY_TABLES,GAMES,ROYAL_FLUSH_5COIN_PER};")();

const rank = (c) => c >> 2;
const suit = (c) => c & 3;
const HIGH = 9;                      // J and above
const ROYALS = [8, 9, 10, 11, 12];   // 10 J Q K A

/** All index subsets of a 5-card hand, by size. */
let SF3_SPAN = 3;
let EXTRA_LINE = false;
const SUBSETS = [[], [], [], [], [], []];
for (let m = 1; m < 32; m++) {
  const idx = [];
  for (let i = 0; i < 5; i++) if (m & (1 << i)) idx.push(i);
  SUBSETS[idx.length].push(idx);
}

function ranksOf(hand, idx) { return idx.map((i) => rank(hand[i])); }
function sameSuit(hand, idx) {
  const s = suit(hand[idx[0]]);
  return idx.every((i) => suit(hand[i]) === s);
}
function distinct(rs) { return new Set(rs).size === rs.length; }

/** Ranks that would complete a 5-card straight, given distinct ranks. */
function straightOuts(rs) {
  if (!distinct(rs)) return [];
  const outs = [];
  for (let x = 0; x <= 12; x++) {
    if (rs.includes(x)) continue;
    const all = rs.concat([x]);
    if (all.length !== 5) continue;
    const sorted = [...all].sort((a, b) => a - b);
    if (sorted[4] - sorted[0] === 4) { outs.push(x); continue; }
    // Wheel: A-2-3-4-5.
    if (sorted.join() === "0,1,2,3,12") outs.push(x);
  }
  return outs;
}

/**
 * Can these suited ranks still become a straight flush within `maxSpan`?
 *
 * Gaps = span - (count - 1). Four cards spanning 4 have one gap; three cards
 * spanning 4 have two, which is a draw the strategy categories do not cover —
 * so three-card draws are held to a span of 3.
 */
function canMakeStraight(rs, maxSpan) {
  if (!distinct(rs)) return false;
  if (maxSpan === undefined) maxSpan = 4;
  const span = (a) => Math.max(...a) - Math.min(...a);
  const alt = rs.map((r) => (r === 12 ? -1 : r));
  return span(rs) <= maxSpan || (rs.includes(12) && span(alt) <= maxSpan);
}

function counts(hand) {
  const c = new Array(13).fill(0);
  hand.forEach((x) => c[rank(x)]++);
  return c;
}
function idxOfRank(hand, r) {
  const out = [];
  hand.forEach((x, i) => { if (rank(x) === r) out.push(i); });
  return out;
}

/** Best subset matching a test, largest first, or null. */
function findSubset(hand, size, test) {
  for (const idx of SUBSETS[size]) if (test(idx)) return idx;
  return null;
}

/**
 * The simple card, in the order it is printed. Each entry returns the indices
 * to hold, or null when the line does not apply.
 */
const SIMPLE_CARD = [
  ["Pat Royal / Straight Flush / 4 of a Kind", (h) => {
    const c = counts(h);
    const quad = c.findIndex((n) => n === 4);
    if (quad >= 0) return idxOfRank(h, quad);
    const all = [0, 1, 2, 3, 4];
    if (sameSuit(h, all) && canMakeStraight(ranksOf(h, all)) && distinct(ranksOf(h, all))) return all;
    return null;
  }],
  ["4 to a Royal Flush", (h) =>
    findSubset(h, 4, (i) => sameSuit(h, i) && ranksOf(h, i).every((r) => ROYALS.includes(r)) && distinct(ranksOf(h, i)))],
  ["Pat Full House / Flush / 3 of a Kind", (h) => {
    const c = counts(h);
    const trip = c.findIndex((n) => n === 3);
    const pair = c.findIndex((n) => n === 2);
    if (trip >= 0 && pair >= 0) return [0, 1, 2, 3, 4];          // full house
    if (sameSuit(h, [0, 1, 2, 3, 4])) return [0, 1, 2, 3, 4];     // flush
    if (trip >= 0) return idxOfRank(h, trip);
    return null;
  }],
  ["Pat Straight", (h) => {
    const rs = ranksOf(h, [0, 1, 2, 3, 4]);
    return distinct(rs) && straightOuts(rs.slice(0, 4)).length >= 0 && isStraight(rs) ? [0, 1, 2, 3, 4] : null;
  }],
  ["4 to a Straight Flush", (h) =>
    findSubset(h, 4, (i) => sameSuit(h, i) && canMakeStraight(ranksOf(h, i)))],
  ["Two Pair / High Pair (J–A)", (h) => {
    const c = counts(h);
    const pairs = [];
    c.forEach((n, r) => { if (n === 2) pairs.push(r); });
    if (pairs.length === 2) return idxOfRank(h, pairs[0]).concat(idxOfRank(h, pairs[1]));
    if (pairs.length === 1 && pairs[0] >= HIGH) return idxOfRank(h, pairs[0]);
    return null;
  }],
  ["3 to a Royal Flush", (h) =>
    findSubset(h, 3, (i) => sameSuit(h, i) && ranksOf(h, i).every((r) => ROYALS.includes(r)) && distinct(ranksOf(h, i)))],
  ["4 to a Flush", (h) => findSubset(h, 4, (i) => sameSuit(h, i))],
  ["Low Pair (2–10)", (h) => {
    const c = counts(h);
    const p = c.findIndex((n, r) => n === 2 && r < HIGH);
    return p >= 0 ? idxOfRank(h, p) : null;
  }],
  ["4 to an Outside Straight", (h) =>
    findSubset(h, 4, (i) => straightOuts(ranksOf(h, i)).length >= 2)],
  ["3 to a Straight Flush / 2 Suited High Cards", (h) => {
    const sf = findSubset(h, 3, (i) => sameSuit(h, i) && canMakeStraight(ranksOf(h, i), SF3_SPAN));
    if (sf) return sf;
    return findSubset(h, 2, (i) => sameSuit(h, i) && ranksOf(h, i).every((r) => r >= HIGH));
  }],
  ["4 to an Inside Straight (3 high) / 2 Unsuited High Cards", (h) => {
    const ins = findSubset(h, 4, (i) =>
      straightOuts(ranksOf(h, i)).length === 1 && ranksOf(h, i).filter((r) => r >= HIGH).length >= 3);
    if (ins) return ins;
    // "Lowest 2 if 3+" — the card's own note.
    const highs = [0, 1, 2, 3, 4].filter((i) => rank(h[i]) >= HIGH);
    if (highs.length >= 2) {
      highs.sort((a, b) => rank(h[a]) - rank(h[b]));
      return [highs[0], highs[1]];
    }
    return null;
  }],
  ["Suited 10–J/Q/K / Single High Card", (h) => {
    const t = findSubset(h, 2, (i) => {
      const rs = ranksOf(h, i);
      return sameSuit(h, i) && rs.includes(8) && rs.some((r) => r >= HIGH && r <= 11);
    });
    if (t) return t;
    const hi = [0, 1, 2, 3, 4].filter((i) => rank(h[i]) >= HIGH);
    return hi.length ? [hi[0]] : null;
  }],
  // Candidate line: a three-card straight-flush draw with two gaps. The
  // category set has no line for it, so it currently falls through to a single
  // high card or to discarding everything. Ranked here — below a high card,
  // above tossing the hand — on the evidence of hands like 6d 8d Td.
  ["3 to a Straight Flush (2 gaps)", (h) => EXTRA_LINE
    ? findSubset(h, 3, (i) => sameSuit(h, i) && canMakeStraight(ranksOf(h, i), 4))
    : null],
  ["Discard Everything", () => []],
];

function isStraight(rs) {
  if (!distinct(rs) || rs.length !== 5) return false;
  const s = [...rs].sort((a, b) => a - b);
  if (s[4] - s[0] === 4) return true;
  return s.join() === "0,1,2,3,12";
}

function main() {
  const N = Number(process.argv[2] || 2000);
  const gameKey = process.argv[3] || "job-9-6";
  // How loosely to read "3 to a Straight Flush" on line 11. 3 = at most one
  // gap (matches the strategy categories); 4 = any three suited cards that
  // could still make a straight flush, which is how the printed line reads.
  SF3_SPAN = Number(process.argv[4] || 3);
  EXTRA_LINE = process.argv[5] === "extra";
  const game = GAMES[gameKey];
  const pay = game.hands.map((x) => x.maxPay);
  const evaluate = gameKey.indexOf("bp-") === 0 ? Poker.evaluateBonusPoker : Poker.evaluateHand;

  // Math.imul keeps the multiply in 32 bits. A plain `seed * 1103515245`
  // overflows double precision, and masking the low 31 bits then keeps exactly
  // the corrupted ones — that generator repeated after ~16k distinct values.
  let seed = Number(process.env.SEED || 987654321) >>> 0;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

  let totalCost = 0, worst = [], mismatches = 0;
  const byLine = SIMPLE_CARD.map(([name]) => ({ name, hits: 0, cost: 0, misplays: 0 }));

  for (let n = 0; n < N; n++) {
    const hand = [];
    while (hand.length < 5) { const c = Math.floor(rnd() * 52); if (!hand.includes(c)) hand.push(c); }
    const inH = {}; hand.forEach((x) => inH[x] = true);
    const deck = []; for (let i = 0; i < 52; i++) if (!inH[i]) deck.push(i);

    let line = -1, hold = null;
    for (let i = 0; i < SIMPLE_CARD.length; i++) {
      const got = SIMPLE_CARD[i][1](hand);
      if (got) { line = i; hold = got; break; }
    }
    if (!hold) { mismatches++; continue; }

    const cardEV = StrategyEngine.computeHoldEV(hold.map((i) => hand[i]), deck, pay, evaluate);
    let best = -1;
    for (let mask = 0; mask < 32; mask++) {
      const held = [];
      for (let i = 0; i < 5; i++) if (mask & (1 << i)) held.push(hand[i]);
      const ev = StrategyEngine.computeHoldEV(held, deck, pay, evaluate);
      if (ev > best) best = ev;
    }
    const cost = best - cardEV;
    totalCost += cost;
    byLine[line].hits++;
    byLine[line].cost += cost;
    if (cost > 1e-9) byLine[line].misplays++;
    if (cost > 1e-9) worst.push({ cost, hand: hand.slice(), line });

    if ((n + 1) % 500 === 0) process.stderr.write("  " + (n + 1) + "/" + N + "\r");
  }

  const RN = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"], SN = ["c","d","h","s"];
  const nm = (c) => RN[rank(c)] + SN[suit(c)];

  console.log("\n=== " + game.name + " " + game.label + " — simple card vs perfect play ===");
  console.log("hands sampled: " + N + "   line-11 reading: 3-card SF draws up to span " + SF3_SPAN +
    (SF3_SPAN === 3 ? " (at most one gap)" : " (any completable draw)") +
    (EXTRA_LINE ? "   + late 2-gap line" : "") +
    (mismatches ? "   UNMATCHED: " + mismatches : ""));
  console.log("mean cost: " + (totalCost / N).toFixed(5) + " per hand wagered = " +
    ((totalCost / N) * 100).toFixed(3) + "% of return");
  console.log("\nper line:");
  console.log("  line                                                    hits  misplays   total cost");
  byLine.forEach((l) => {
    if (!l.hits) return;
    console.log("  " + l.name.slice(0, 52).padEnd(54) + String(l.hits).padStart(5) +
      String(l.misplays).padStart(10) + l.cost.toFixed(4).padStart(13));
  });
  worst.sort((a, b) => b.cost - a.cost);
  console.log("\nworst individual decisions:");
  worst.slice(0, 8).forEach((w) => console.log("  -" + w.cost.toFixed(4) + "  " +
    w.hand.map(nm).join(" ") + "   (line " + (w.line + 1) + ": " + SIMPLE_CARD[w.line][0] + ")"));
}

if (require.main === module) main();

module.exports = { SIMPLE_CARD, setSF3Span: (v) => { SF3_SPAN = v; }, rank, suit };
