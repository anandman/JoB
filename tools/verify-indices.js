#!/usr/bin/env node
/**
 * Verify the index plays.
 *
 *     node tools/verify-indices.js
 *
 * Two things are being checked, and they are different in kind.
 *
 * The first is internal: the shoe a count implies must actually carry that
 * count, hold whole cards, and hold the right number of them. That is exact
 * and any failure is a bug.
 *
 * The second is external: the indices for the rules that the widely circulated
 * numbers assume should land near those numbers. That one is a sanity check,
 * not a specification — index sets in circulation differ from each other by a
 * point or more because they assume different penetration and different rules,
 * so the test is agreement within a tolerance, not equality.
 */
"use strict";

const path = require("path");
const E = require(path.join(__dirname, "..", "bob", "js", "engine.js"));
const R = require(path.join(__dirname, "..", "bob", "js", "rules.js"));
const I = require(path.join(__dirname, "..", "bob", "js", "indices.js"));

let fails = 0;
const pass = (m) => console.log("  ok   " + m);
const fail = (m) => { fails++; console.log("  FAIL " + m); };
const yes = (c, m, d) => (c ? pass(m) : fail(m + (d ? " — " + d : "")));

console.log("\nThe shoe a count implies");
{
  let exact = true, whole = true, sized = true;
  for (const decks of [1, 2, 6, 8]) {
    for (const pen of [decks / 2, decks / 3]) {
      for (let tc = -8; tc <= 12; tc++) {
        const shoe = I.shoeAt(decks, pen, tc);
        if (!shoe) continue;
        const rc = I.runningCount(decks, shoe);
        if (Math.abs(rc - Math.round(tc * pen)) > 0.001) {
          exact = false;
          fail(`${decks} decks, ${pen} left, TC ${tc}: running count ${rc}, wanted ${Math.round(tc * pen)}`);
        }
        if (shoe.some((n) => n !== Math.round(n))) whole = false;
        const total = shoe.reduce((a, b) => a + b, 0);
        if (Math.abs(total - pen * 52) > 0.5) {
          sized = false;
          fail(`${decks} decks, ${pen} left: ${total} cards, wanted ${pen * 52}`);
        }
      }
    }
  }
  yes(exact, "carries exactly the running count asked for, at every deck count and penetration");
  yes(whole, "and holds whole cards — a rank at 14.4 never runs out, which stops the engine pruning");
  yes(sized, "with the number of cards the penetration says are left");

  // There are only 120 low cards in six decks, so a count that would need
  // more than that removed cannot exist. Found rather than assumed, because
  // the first guess at where that boundary sits was wrong.
  let highest = -1;
  for (let tc = 0; tc <= 80; tc++) if (I.shoeAt(6, 3, tc)) highest = tc;
  yes(highest > 12 && I.shoeAt(6, 3, highest + 1) === null,
      "counts past what the shoe can hold return nothing rather than a negative rank",
      "reachable up to +" + highest);
  const edge = I.shoeAt(6, 3, highest);
  yes(edge.every((n) => n >= 0) && edge.reduce((a, b) => a + b, 0) === 156,
      "and the last reachable one is still a whole, correctly sized shoe");
  const neg = I.shoeAt(6, 3, -8);
  yes(neg && neg.every((n) => n >= 0), "and a deeply negative count is still a real shoe");
}

console.log("\nInsurance, which is arithmetic rather than a search");
{
  // Pays 2:1 on the hole card being a ten, so it wins above one third.
  const shoe = I.shoeAt(6, 3, 0);
  const counts = shoe.slice();
  counts[E.ACE] -= 1;
  const total = counts.reduce((a, b) => a + b, 0);
  const direct = (counts[E.TEN] / total) * 3 - 1;
  yes(Math.abs(I.insuranceAt(6, 3, 0) - direct) < 1e-9,
      "the EV is the ten fraction against a third, computed straight from the shoe");
  yes(I.insuranceAt(6, 3, 0) < 0, "and is a losing bet on a neutral shoe");

  const idx = I.insuranceIndex(6, 3);
  yes(Math.abs(idx - 3) <= 1,
      "the six-deck index lands near the +3 in general circulation", "got " + idx);
  yes(I.insuranceAt(6, 3, idx + 0.5) > 0 && I.insuranceAt(6, 3, idx - 1) < 0,
      "and it is the edge: losing below, winning above");
}

console.log("\nThe indices themselves, against the numbers in circulation");
{
  // The rules those numbers assume. Surrender is deliberately off: with it
  // available, sixteen against a ten is a surrender at every count, and the
  // famous stand index never arises — which is correct for that table and a
  // different question from the one these numbers answer.
  const rules = R.make({ decks: 6, h17: false, das: true, surrender: "none" });
  const res = I.generate(rules);
  const find = (label, up, to) =>
    res.plays.find((p) => p.label === label && p.upLabel === up && p.deviation === to);

  const known = [
    ["16", "10", "stand", 0], ["15", "10", "stand", 4], ["10", "10", "double", 4],
    ["10", "A", "double", 4], ["11", "A", "double", 1], ["9", "2", "double", 1],
    ["9", "7", "double", 3], ["12", "2", "stand", 3], ["12", "3", "stand", 2],
    ["12", "4", "stand", 0], ["12", "5", "stand", -2], ["12", "6", "stand", -1],
    ["13", "2", "stand", -1], ["13", "3", "stand", -2], ["16", "9", "stand", 5],
    ["10,10", "5", "split", 5], ["10,10", "6", "split", 4]
  ];

  let found = 0, near = 0;
  const off = [];
  for (const [label, up, to, quoted] of known) {
    const p = find(label, up, to);
    if (!p) { off.push(`${label} v ${up} -> ${to} not produced`); continue; }
    found++;
    if (Math.abs(p.index - quoted) <= 1.5) near++;
    else off.push(`${label} v ${up}: ${p.index} against ${quoted}`);
  }
  yes(found === known.length, `all ${known.length} of the well-known cells are produced`,
      off.join("; "));
  yes(near >= known.length - 2,
      `${near} of ${known.length} land within 1.5 of the quoted value`, off.join("; "));

  // Sixteen against a ten is the one everybody knows, and the one that broke
  // when only the ends of the range were compared.
  const sixteen = find("16", "10", "stand");
  yes(sixteen && sixteen.basic === "hit",
      "sixteen against a ten reads hit -> stand, the deviation it is famous for");
}

console.log("\nA cell that changes its mind twice");
{
  // With late surrender on the table the same cell goes hit, then surrender.
  // Comparing only the two ends of the range reported one crossing where
  // there are two, and named the wrong pair of actions for it.
  const rules = R.make({ decks: 6, h17: false, das: true, surrender: "late" });
  const res = I.generate(rules);
  const both = res.plays.filter((p) => p.label === "16" && p.upLabel === "10");
  yes(both.length >= 1, "the surrender table produces its own answer for 16 v 10",
      both.map((p) => `${p.basic}->${p.deviation}@${p.index}`).join(" "));
  yes(both.every((p) => p.index >= res.range[0] && p.index <= res.range[1]),
      "with every crossing inside the range searched");
}

console.log("\nThe rules move the answer, which is the whole point");
{
  const six = I.generate(R.make({ decks: 6, h17: false, das: true, surrender: "none" }));
  const two = I.generate(R.make({ decks: 2, h17: true, das: true, surrender: "none" }));
  yes(six.insurance !== two.insurance,
      "a double deck H17 game gets its own insurance index, not the six-deck one",
      `${six.insurance} against ${two.insurance}`);
  yes(six.plays.length > 40 && two.plays.length > 40,
      "and both produce a full set rather than collapsing");
}

console.log("\nSliced the way the interface slices it");
{
  const rules = R.make({ decks: 6, h17: false, das: true, surrender: "none" });
  const all = I.cells();
  yes(all.length === 340, "340 cells: sixteen hard rows, eight soft, ten pairs, ten upcards",
      String(all.length));
  let sliced = [];
  for (let i = 0; i < all.length; i += 40) {
    sliced = sliced.concat(I.generate(rules, { cells: all.slice(i, i + 40) }).plays);
  }
  const whole = I.generate(rules).plays;
  yes(sliced.length === whole.length,
      "and working through them in slices finds exactly what one pass does",
      `${sliced.length} against ${whole.length}`);
}

console.log(fails ? `\n${fails} FAILED\n` : "\nall checks passed\n");
process.exit(fails ? 1 : 0);
