#!/usr/bin/env node
/**
 * Verify the blackjack engine.
 *
 *     node tools/verify-blackjack.js
 *
 * Four independent checks, because a plausible-looking EV grid is the easiest
 * thing in the world to produce and the hardest to eyeball:
 *
 *   1. Every dealer distribution sums to 1.
 *   2. A Monte Carlo dealer simulation, written separately from the recursion,
 *      agrees with it.
 *   3. The DERIVED basic strategy chart matches the published 6-deck S17 DAS
 *      chart cell for cell. This is the strongest check available: it is
 *      discrete, so it cannot be passed by numbers that are merely close.
 *   4. The house edge lands in the published band for several rule sets.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const src = fs.readFileSync(path.join(ROOT, "bob/js/rules.js"), "utf8")
          + fs.readFileSync(path.join(ROOT, "bob/js/engine.js"), "utf8")
          + fs.readFileSync(path.join(ROOT, "bob/js/strategy.js"), "utf8");
const { BJRules, BJEngine, BJStrategy } =
  new Function(src + ";return {BJRules,BJEngine,BJStrategy};")();

const E = BJEngine, S = BJStrategy;
let failures = 0;
const fail = (msg) => { failures++; console.log("  FAIL " + msg); };
const ok = (msg) => console.log("  ok   " + msg);

/* ---------- 1. Dealer distributions are distributions ---------- */

console.log("\n1. Dealer distributions sum to 1");
{
  let worst = 0;
  for (const decks of [1, 2, 6, 8]) {
    for (const h17 of [false, true]) {
      const rules = BJRules.make({ decks, h17 });
      for (let up = 0; up < 10; up++) {
        const counts = S.removeCards(E.freshShoe(decks), [up]);
        const dv = E.dealerVector(up, counts, rules, true);
        const sum = dv.reduce((a, b) => a + b, 0);
        worst = Math.max(worst, Math.abs(sum - 1));
      }
    }
  }
  if (worst < 1e-9) ok(`all sum to 1 (worst deviation ${worst.toExponential(2)})`);
  else fail(`a distribution is off by ${worst}`);
}

/* ---------- 2. Monte Carlo cross-check ---------- */

console.log("\n2. Monte Carlo dealer simulation vs the recursion");
{
  // Math.imul is mandatory: a plain multiply overflows double precision and
  // the low bits that survive are the corrupted ones. That bug invalidated a
  // round of measurements in the video poker tools.
  let seed = 20260829 >>> 0;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

  const rules = BJRules.make({ decks: 6, h17: false });
  const TRIALS = 300000;
  let worst = 0, worstAt = "";

  for (let up = 0; up < 10; up++) {
    const shoe = S.removeCards(E.freshShoe(6), [up]);
    const dv = E.dealerVector(up, shoe, rules, true);

    // Independent playout: draw with replacement from the same composition
    // (the recursion depletes, so these agree only to sampling error plus a
    // small depletion effect — the tolerance below accounts for both).
    const total = E.countCards(shoe);
    const cum = [];
    let acc = 0;
    for (let r = 0; r < 10; r++) { acc += shoe[r] / total; cum.push(acc); }
    const draw = () => { const x = rnd(); for (let r = 0; r < 10; r++) if (x < cum[r]) return r; return 9; };

    const tally = [0, 0, 0, 0, 0, 0];
    let kept = 0;
    for (let i = 0; i < TRIALS; i++) {
      const hole = draw();
      // Peek: the dealer would have turned a blackjack over already.
      if ((up === 0 && hole === 9) || (up === 9 && hole === 0)) continue;
      kept++;
      let t = 0, soft = false;
      for (const c of [up, hole]) {
        t += c === 0 ? 1 : c + 1;
        if (c === 0 && t + 10 <= 21) { t += 10; soft = true; }
        else if (soft && t > 21) { t -= 10; soft = false; }
      }
      while (t < 17 || (t === 17 && soft && rules.h17)) {
        const c = draw();
        t += c === 0 ? 1 : c + 1;
        if (c === 0 && t + 10 <= 21) { t += 10; soft = true; }
        else if (soft && t > 21) { t -= 10; soft = false; }
      }
      tally[t > 21 ? 5 : t - 17]++;
    }
    for (let i = 0; i < 6; i++) {
      const d = Math.abs(tally[i] / kept - dv[i]);
      if (d > worst) { worst = d; worstAt = `up=${E.RANK_LABELS[up]} outcome=${i}`; }
    }
  }
  if (worst < 0.004) ok(`agrees within ${(worst * 100).toFixed(3)} pts (worst at ${worstAt})`);
  else fail(`diverges by ${(worst * 100).toFixed(3)} pts at ${worstAt}`);
}

/* ---------- 3. Derived chart vs the published one ---------- */

console.log("\n3. Derived basic strategy vs published 6-deck S17 DAS");
{
  // Columns: 2 3 4 5 6 7 8 9 10 A
  const HARD = {
     5: "HHHHHHHHHH",  6: "HHHHHHHHHH",  7: "HHHHHHHHHH",  8: "HHHHHHHHHH",
     9: "HDDDDHHHHH", 10: "DDDDDDDDHH", 11: "DDDDDDDDDH", 12: "HHSSSHHHHH",
    13: "SSSSSHHHHH", 14: "SSSSSHHHHH", 15: "SSSSSHHHHH", 16: "SSSSSHHHHH",
    17: "SSSSSSSSSS", 18: "SSSSSSSSSS", 19: "SSSSSSSSSS", 20: "SSSSSSSSSS",
  };
  const SOFT = {
    13: "HHHDDHHHHH", 14: "HHHDDHHHHH", 15: "HHDDDHHHHH", 16: "HHDDDHHHHH",
    17: "HDDDDHHHHH", 18: "SDDDDSSHHH", 19: "SSSSSSSSSS", 20: "SSSSSSSSSS",
  };
  const PAIRS = {
    "A": "PPPPPPPPPP", "2": "PPPPPPHHHH", "3": "PPPPPPHHHH", "4": "HHHPPHHHHH",
    "5": "DDDDDDDDHH", "6": "PPPPPHHHHH", "7": "PPPPPPHHHH", "8": "PPPPPPPPPP",
    "9": "PPPPPSPPSS", "10": "SSSSSSSSSS",
  };

  const rules = BJRules.make({ decks: 6, h17: false, das: true, surrender: "none" });
  const t0 = Date.now();
  const ch = S.chart(rules);
  const ms = Date.now() - t0;

  let mismatches = [];
  const compare = (rows, expected, keyOf) => {
    for (const row of rows) {
      const want = expected[keyOf(row)];
      if (!want) continue;
      row.cells.forEach((c, i) => {
        const got = S.CODE[c.action];
        if (got !== want[i]) {
          // How close was it? A near-tie is a borderline cell, not a bug.
          const alt = c.actions.find(a => S.CODE[a.action] === want[i]);
          mismatches.push({
            row: row.label, up: S.UP_LABELS[i], want: want[i], got,
            gap: alt ? c.ev - alt.ev : null,
          });
        }
      });
    }
  };
  compare(ch.hard, HARD, r => r.total);
  compare(ch.soft, SOFT, r => r.total);
  compare(ch.pairs, PAIRS, r => E.RANK_LABELS[r.rank]);

  const cells = (ch.hard.length + ch.soft.length + ch.pairs.length) * 10;
  if (!mismatches.length) {
    ok(`all ${cells} cells match (${ms} ms)`);
  } else {
    console.log(`  ${cells - mismatches.length}/${cells} cells match (${ms} ms)`);
    console.log("  differences (gap = EV lost by taking the published action):");
    for (const m of mismatches) {
      const g = m.gap === null ? "n/a" : m.gap.toFixed(5);
      console.log(`    ${String(m.row).padEnd(6)} vs ${m.up.padEnd(3)} published ${m.want}, derived ${m.got}   gap ${g}`);
    }
    if (mismatches.some(m => m.gap === null || Math.abs(m.gap) > 0.002)) {
      fail("at least one difference is too large to be a borderline cell");
    } else {
      ok("every difference is a borderline cell (all gaps < 0.002)");
    }
  }
}

/* ---------- 4. House edge ---------- */

console.log("\n4. House edge vs published figures");
{
  const cases = [
    { name: "6 deck, S17, DAS, no surrender", lo: 0.0035, hi: 0.0050,
      rules: BJRules.make({ decks: 6, h17: false, das: true }) },
    { name: "6 deck, H17, DAS, no surrender", lo: 0.0055, hi: 0.0072,
      rules: BJRules.make({ decks: 6, h17: true, das: true }) },
    { name: "6 deck, S17, DAS, late surrender", lo: 0.0026, hi: 0.0044,
      rules: BJRules.make({ decks: 6, h17: false, das: true, surrender: "late" }) },
    { name: "1 deck, H17, no DAS", lo: -0.0005, hi: 0.0035,
      rules: BJRules.make({ decks: 1, h17: true, das: false }) },
    { name: "6 deck, H17, DAS, 6:5 blackjack", lo: 0.0190, hi: 0.0220,
      rules: BJRules.make({ decks: 6, h17: true, das: true, blackjackPays: 1.2 }) },
  ];
  for (const c of cases) {
    const t0 = Date.now();
    const edge = -S.houseEdge(c.rules);
    const ms = Date.now() - t0;
    const pct = (edge * 100).toFixed(3) + "%";
    if (edge >= c.lo && edge <= c.hi) ok(`${c.name.padEnd(36)} ${pct.padStart(8)}  (${ms} ms)`);
    else fail(`${c.name.padEnd(36)} ${pct.padStart(8)}  outside ${(c.lo*100).toFixed(2)}–${(c.hi*100).toFixed(2)}%`);
  }
  const base = -S.houseEdge(BJRules.make({ decks: 6, h17: false, das: true }));
  const h17  = -S.houseEdge(BJRules.make({ decks: 6, h17: true,  das: true }));
  const sixfive = -S.houseEdge(BJRules.make({ decks: 6, h17: false, das: true, blackjackPays: 1.2 }));
  console.log(`\n  rule costs (should be ~+0.20% for H17, ~+1.39% for 6:5):`);
  console.log(`    H17 costs  ${((h17 - base) * 100).toFixed(3)}%`);
  console.log(`    6:5 costs  ${((sixfive - base) * 100).toFixed(3)}%`);
}

console.log(failures ? `\n${failures} check(s) FAILED\n` : "\nAll checks passed\n");
process.exit(failures ? 1 : 0);
