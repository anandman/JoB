#!/usr/bin/env node
/**
 * Variance for multi-line (n-play) video poker, and the input risk of ruin needs.
 *
 *     node tools/variance-multiline.js [game] [samplesPerCommonClass]
 *
 * On an n-play machine one hand is dealt, the held cards are copied to every
 * line, and each line draws from its own deck. Given the hold the lines are
 * independent, so the shared hold is the only thing correlating them:
 *
 *   Var(mean of n lines) = Var(X)/n + (n-1)/n * Cov(line_i, line_j)
 *   Cov(line_i, line_j)  = Var( E[X | hold] )      <- "between-hand" variance
 *
 * Var(X) is exact from the hand frequency table. The between-hand term has to
 * be computed, and plain sampling gets it badly wrong: a dealt royal is worth
 * 800, contributes about 1.0 to the variance on its own, and appears in one
 * hand in 650,000. So the rare classes are enumerated exhaustively and only
 * the common ones are sampled — stratified by dealt hand class, whose exact
 * probabilities are known.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "job/js/data.js"), "utf8")
          + fs.readFileSync(path.join(ROOT, "job/js/poker.js"), "utf8")
          + fs.readFileSync(path.join(ROOT, "job/js/strategy-engine.js"), "utf8");
const { StrategyEngine, Poker, GAMES } = new Function(src + ";return {StrategyEngine,Poker,GAMES};")();
const { SIMPLE_CARD } = require("./verify-strategy.js");

const LINES = [1, 3, 5, 10, 50, 100];
// Dealt-hand classes. The first six are rare enough to enumerate outright.
const CLASS_NAMES = ["royal", "str flush", "quads", "full house", "flush", "straight",
                     "trips", "two pair", "jacks+", "nothing"];
const EXACT_THROUGH = 5;

function holdEV(hand, pay, evaluate) {
  const inH = {}; hand.forEach((x) => inH[x] = true);
  const deck = []; for (let i = 0; i < 52; i++) if (!inH[i]) deck.push(i);
  for (const [, test] of SIMPLE_CARD) {
    const hold = test(hand);
    if (hold) return StrategyEngine.computeHoldEV(hold.map((i) => hand[i]), deck, pay, evaluate);
  }
  return null;
}

function main() {
  const gameKey = process.argv[2] || "job-9-6";
  const SAMPLES = Number(process.argv[3] || 700);
  const game = GAMES[gameKey];
  const pay = game.hands.map((x) => x.maxPay);
  const evaluate = gameKey.indexOf("bp-") === 0 ? Poker.evaluateBonusPoker : Poker.evaluateHand;

  let ret = 0, ev2 = 0;
  for (const h of game.hands) { ret += h.freq * h.maxPay; ev2 += h.freq * h.maxPay * h.maxPay; }
  const varTotal = ev2 - ret * ret;

  // Rare classes are enumerated outright; common ones are drawn by plain
  // rejection sampling, which is obviously uniform. (Reservoir sampling would
  // do it in one pass, but "obviously correct" beats "one pass" here — a
  // subtly biased reservoir is exactly the kind of error that produces a mean
  // hold EV above the optimal return, which is impossible.)
  const counts = new Array(10).fill(0);
  const sums = new Array(10).fill(0), sumSqs = new Array(10).fill(0);
  // Math.imul keeps the multiply in 32 bits. A plain `seed * 1103515245`
  // overflows double precision, and masking the low 31 bits then keeps exactly
  // the corrupted ones — that generator repeated after ~16k distinct values.
  let seed = Number(process.env.SEED || 987654321) >>> 0;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

  process.stderr.write("pass 1: classifying all C(52,5) hands\n");
  const hand = [0, 0, 0, 0, 0];
  for (let a = 0; a < 52; a++) { hand[0] = a;
   for (let b = a+1; b < 52; b++) { hand[1] = b;
    for (let c = b+1; c < 52; c++) { hand[2] = c;
     for (let d = c+1; d < 52; d++) { hand[3] = d;
      for (let e = d+1; e < 52; e++) { hand[4] = e;
        const r = Poker.evaluateHand(a, b, c, d, e);
        const k = r === -1 ? 9 : r;
        counts[k]++;
        if (k <= EXACT_THROUGH) {
          const ev = holdEV([a,b,c,d,e], pay, evaluate);
          sums[k] += ev; sumSqs[k] += ev * ev;
        }
      }}}}}

  process.stderr.write("pass 2: rejection-sampling the common classes\n");
  const need = [0,0,0,0,0,0, SAMPLES, SAMPLES, SAMPLES, SAMPLES];
  const got = new Array(10).fill(0);
  let guard = 0;
  while (got.slice(EXACT_THROUGH + 1).some((g, i) => g < need[EXACT_THROUGH + 1 + i])) {
    if (++guard > 50e6) break;
    const h = [];
    while (h.length < 5) { const c = Math.floor(rnd() * 52); if (h.indexOf(c) === -1) h.push(c); }
    const r = Poker.evaluateHand(h[0], h[1], h[2], h[3], h[4]);
    const k = r === -1 ? 9 : r;
    if (k <= EXACT_THROUGH || got[k] >= need[k]) continue;
    const ev = holdEV(h, pay, evaluate);
    sums[k] += ev; sumSqs[k] += ev * ev; got[k]++;
    if ((got[6]+got[7]+got[8]+got[9]) % 500 === 0) process.stderr.write("  " + got.slice(6).join("/") + "\r");
  }

  const TOTAL = 2598960;
  let mean = 0, second = 0;
  console.log("\n=== " + game.name + " " + game.label + " — between-hand variance ===");
  console.log("  class         count      p        hold EV    method");
  for (let k = 0; k < 10; k++) {
    const n = k <= EXACT_THROUGH ? counts[k] : got[k];
    if (!n) continue;
    const m = sums[k] / n, m2 = sumSqs[k] / n;
    const p = counts[k] / TOTAL;
    mean += p * m; second += p * m2;
    console.log("  " + CLASS_NAMES[k].padEnd(12) + String(counts[k]).padStart(9) + "  " +
      p.toFixed(6) + "   " + m.toFixed(4).padStart(9) + "    " +
      (k <= EXACT_THROUGH ? "exact" : "sampled " + n));
  }
  const varBetween = second - mean * mean;

  console.log("\nmean hold EV: " + mean.toFixed(5) + "   (return from frequencies: " + ret.toFixed(5) +
    ")   gap " + (mean - ret).toFixed(5) + "  <- strategy cost, must be <= 0");
  console.log("single-line variance: " + varTotal.toFixed(3) + " (exact)");
  console.log("between-hand variance: " + varBetween.toFixed(3) + "  <- the n-play floor");
  console.log("\n  lines   variance      SD    SD vs 1-play");
  for (const n of LINES) {
    const v = varTotal / n + ((n - 1) / n) * varBetween;
    console.log("  " + String(n).padStart(5) + "   " + v.toFixed(3).padStart(8) + "  " +
      Math.sqrt(v).toFixed(3).padStart(6) + "        " +
      (Math.sqrt(v) / Math.sqrt(varTotal) * 100).toFixed(0) + "%");
  }
  console.log("\nVAR_BETWEEN=" + varBetween.toFixed(4));
}

main();
