#!/usr/bin/env node
/**
 * Audit the strategy card against exact hold EVs.
 *
 *     node tools/audit-categories.js
 *
 * Every strategy line is priced by ONE representative hand, but most lines
 * name a FAMILY: "2 Unsuited High Cards" covers J-Q through K-A. That is fine
 * while the members are worth about the same, and a bug when they are not,
 * because the line then claims a rank only its best member deserves.
 *
 * The comparison has to be made WITHIN ONE HAND. Pricing each family member on
 * its own hand and sorting the results is misleading: holding J alone scores
 * higher than holding J and A, but in a hand that actually contains both, the
 * ace is in the discard either way and holding both wins. Cross-hand numbers
 * answer a question nobody is asked at the machine.
 *
 * So: build hands that match two competing lines at once, price both holds
 * exactly, and report every case where the card's order disagrees with the
 * arithmetic.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const src = ["job/js/data.js", "job/js/poker.js", "job/js/strategy-engine.js"]
  .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("");
const { GAMES, STRATEGY_CATEGORIES, StrategyEngine, Poker } =
  new Function(src + ";return {GAMES,STRATEGY_CATEGORIES,StrategyEngine,Poker};")();

const RANK = { "2":0,"3":1,"4":2,"5":3,"6":4,"7":5,"8":6,"9":7,"T":8,"J":9,"Q":10,"K":11,"A":12 };
const SUIT = { c:0, d:1, h:2, s:3 };
const card = (t) => RANK[t.slice(0, -1)] * 4 + SUIT[t.slice(-1)];

/**
 * Filler that cannot help or hurt anything held.
 *
 * The suit rule is inviolable and the rank rule is best-effort, in that order.
 * An earlier version had it the other way round: when the rank rule excluded
 * every card, it fell through to a filler that ignored suit and dealt a third
 * club into a hand testing a club royal draw. That quietly weakened the very
 * hold under test and produced a confident, wrong bug report.
 */
function fillTo5(held) {
  const suits = held.map((h) => h % 4);
  const ranks = held.map((h) => Math.floor(h / 4));
  const out = held.slice();

  const pick = (minDistance) => {
    for (let r = 0; r < 13 && out.length < 5; r++) {
      if (ranks.indexOf(r) >= 0) continue;
      if (out.some((h) => Math.floor(h / 4) === r)) continue;
      if (ranks.some((hr) => Math.abs(hr - r) < minDistance)) continue;
      for (let s = 0; s < 4; s++) {
        if (suits.indexOf(s) >= 0) continue;            // never touch a held suit
        const c = r * 4 + s;
        if (out.indexOf(c) < 0) { out.push(c); break; }
      }
    }
  };
  // Relax how far the filler must sit from the held ranks, never the suit rule.
  for (let d = 5; d >= 0 && out.length < 5; d--) pick(d);
  if (out.length < 5) throw new Error("no neutral filler for " + held.join(","));
  return out;
}

function holdEV(handCards, holdNames, payouts, evaluate) {
  const held = holdNames.map(card);
  const deck = [];
  for (let i = 0; i < 52; i++) if (handCards.indexOf(i) < 0) deck.push(i);
  return StrategyEngine.computeHoldEV(held, deck, payouts, evaluate);
}

const HIGH = ["J", "Q", "K", "A"];

/** Which of the three suited-high-card lines a given pair belongs to. */
function suitedLine(a, b) {
  if (a === "A" || b === "A") return "Suited A-K, A-Q or A-J";
  if ((a === "J" && b === "Q") || (a === "Q" && b === "J")) return "Suited Q-J";
  return "Suited K-Q or K-J";
}

/** Which of the three unsuited-high-card lines a given pair belongs to. */
function unsuitedLine(a, b) {
  if (a === "A" || b === "A") return "2 Unsuited High Cards (with an ace)";
  if ((a === "J" && b === "Q") || (a === "Q" && b === "J")) return "Unsuited J-Q";
  return "2 Unsuited High Cards (no ace)";
}

/**
 * Each case: a hand, two competing holds, and the card line each belongs to.
 * Built so both holds are genuinely available in the same hand.
 */
function buildCases() {
  const out = [];
  // suited 10-X against the two unsuited high cards it competes with
  for (const x of ["J", "Q", "K"]) {
    for (const y of HIGH) {
      if (y === x) continue;
      out.push({
        label: `suited ${x}-10 vs ${x},${y}`,
        cards: [x + "c", "Tc", y + "d"],
        a: { hold: [x + "c", "Tc"], line: `Suited 10–${x}` },
        b: { hold: [x + "c", y + "d"], line: unsuitedLine(x, y) },
      });
    }
  }
  // suited 10-X against two SUITED high cards (all one suit)
  for (const x of ["J", "Q", "K"]) {
    for (const y of HIGH) {
      if (y === x) continue;
      out.push({
        label: `suited ${x}-10 vs suited ${x},${y}`,
        cards: [x + "c", "Tc", y + "c"],
        a: { hold: [x + "c", "Tc"], line: `Suited 10–${x}` },
        b: { hold: [x + "c", y + "c"], line: suitedLine(x, y) },
      });
    }
  }
  // two high cards against keeping only one of them
  for (let i = 0; i < HIGH.length; i++) {
    for (let j = i + 1; j < HIGH.length; j++) {
      out.push({
        label: `${HIGH[i]},${HIGH[j]} unsuited vs ${HIGH[i]} alone`,
        cards: [HIGH[i] + "c", HIGH[j] + "d"],
        a: { hold: [HIGH[i] + "c", HIGH[j] + "d"], line: unsuitedLine(HIGH[i], HIGH[j]) },
        b: { hold: [HIGH[i] + "c"], line: HIGH[i] === "A" ? "Single Ace" : "Single High Card (J/Q/K)" },
      });
    }
  }
  // low pair against a competing draw that lives just below it
  for (const r of ["2", "5", "9", "T"]) {
    out.push({
      label: `low pair ${r}${r} vs 2 suited high`,
      cards: [r + "c", r + "d", "Jh", "Qh"],
      a: { hold: [r + "c", r + "d"], line: "Low Pair (2–10)" },
      b: { hold: ["Jh", "Qh"], line: "Suited Q-J" },
    });
  }
  // 3 to a royal against the high pair / high cards inside it
  const R3 = [["T","J","Q"],["T","J","K"],["T","Q","K"],["T","K","A"],["J","Q","K"],["J","Q","A"],["Q","K","A"]];
  for (const t of R3) {
    const highs = t.filter((r) => r !== "T");
    if (highs.length < 2) continue;
    out.push({
      label: `3 to royal ${t.join("")} vs suited ${highs[0]},${highs[1]}`,
      cards: t.map((r) => r + "c"),
      a: { hold: t.map((r) => r + "c"), line: "3 to a Royal Flush" },
      b: { hold: [highs[0] + "c", highs[1] + "c"], line: suitedLine(highs[0], highs[1]) },
    });
  }
  return out;
}

const CASES = buildCases();
const GAMES_TO_AUDIT = ["job-9-6", "job-9-5", "job-8-6", "job-8-5", "bp-8-5"];
let bad = 0, checked = 0;

for (const key of GAMES_TO_AUDIT) {
  const g = GAMES[key];
  const payouts = g.hands.map((h) => h.maxPay);
  const evaluate = key.indexOf("bp-") === 0 ? Poker.evaluateBonusPoker : Poker.evaluateHand;
  const list = StrategyEngine.generateFamilyStrategy(
    "audit:" + key, STRATEGY_CATEGORIES, payouts, evaluate).optimal;
  const lineOf = {};
  list.forEach((e, i) => { lineOf[e.hold] = i + 1; });

  const fails = [];
  for (const c of CASES) {
    const hand = fillTo5(c.cards.map(card));
    const evA = holdEV(hand, c.a.hold, payouts, evaluate);
    const evB = holdEV(hand, c.b.hold, payouts, evaluate);
    const lineA = lineOf[c.a.line], lineB = lineOf[c.b.line];
    if (lineA === undefined || lineB === undefined) continue;
    checked++;
    // The card prefers whichever line comes first. Does the arithmetic agree?
    const cardPrefersA = lineA < lineB;
    const truthPrefersA = evA > evB;
    if (cardPrefersA !== truthPrefersA && Math.abs(evA - evB) > 1e-9) {
      fails.push({ c, evA, evB, lineA, lineB, gap: Math.abs(evA - evB) });
    }
  }
  fails.sort((x, y) => y.gap - x.gap);
  bad += fails.length;

  console.log(`\n${g.name} ${g.label} — ${fails.length} of ${CASES.length} comparisons wrong`);
  for (const f of fails) {
    const winner = f.evA > f.evB ? f.c.a : f.c.b;
    const loser  = f.evA > f.evB ? f.c.b : f.c.a;
    console.log(`  ${f.c.label.padEnd(34)} card says line ${Math.min(f.lineA,f.lineB)} ` +
                `"${(f.lineA < f.lineB ? f.c.a : f.c.b).line}", ` +
                `truth says "${winner.line}" by ${f.gap.toFixed(4)}`);
  }
}

console.log(`\n${bad} wrong of ${checked} within-hand comparisons across ${GAMES_TO_AUDIT.length} pay tables.\n`);
process.exit(bad ? 1 : 0);
