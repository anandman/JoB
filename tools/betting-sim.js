#!/usr/bin/env node
/**
 * Compare betting strategies at matched average bet.
 *
 *     node tools/betting-sim.js
 *     STREAM=4000000 SESSIONS=40000 node tools/betting-sim.js
 *
 * Loads bob/js/risk.js, the same module the app's Risk tab uses, so the tool
 * and the app cannot disagree about what a strategy is or what it is worth.
 *
 * Every strategy walks the same stream of hand outcomes, so differences come
 * from the betting rule rather than from luck, and every one is reported beside
 * a flat bet at its OWN average — the only comparison that means anything.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const src = ["bob/js/rules.js", "bob/js/engine.js", "bob/js/strategy.js",
             "bob/js/game.js", "bob/js/risk.js"]
  .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("");
const { BJRules, BJRisk } = new Function(src + ";return {BJRules,BJRisk};")();

function main() {
  const rules = BJRules.make({ decks: 6, h17: false, das: true, surrender: "late" });
  const BANKROLL = Number(process.env.BANKROLL || 2000);
  const HANDS = Number(process.env.HANDS || 300);
  const SESSIONS = Number(process.env.SESSIONS || 30000);
  const STREAM = Number(process.env.STREAM || 2000000);

  process.stdout.write("generating hand outcomes with counts… ");
  const t0 = Date.now();
  const stream = BJRisk.outcomeStream(rules, STREAM, 20260829);
  let m = 0;
  for (let i = 0; i < STREAM; i++) m += stream.net[i];
  console.log(`${STREAM / 1e6}M hands in ${((Date.now() - t0) / 1000).toFixed(1)}s ` +
              `(measured house edge ${(-m / STREAM * 100).toFixed(3)}%)`);

  const cases = [
    ["flat",       { base: 50 }],
    ["ladder",     { base: 50, step: 25, cap: 150 }],
    ["paroli",     { base: 50, cap: 200 }],
    ["dalembert",  { base: 50, step: 25, cap: 300 }],
    ["martingale", { base: 50, cap: 400 }],
    ["count",      { base: 25, spread: 8, threshold: 1, systemKey: "hilo" }],
    ["count",      { base: 25, spread: 8, threshold: 1, systemKey: "ko" }],
    ["count",      { base: 25, spread: 8, threshold: 1, systemKey: "red7" }],
    ["count",      { base: 25, spread: 16, threshold: 1, systemKey: "hilo" }],
  ];

  console.log(`\nbankroll $${BANKROLL}, ${HANDS} hands a session, ${SESSIONS / 1000}k sessions\n`);
  const head = "strategy".padEnd(34) + "avg bet    ruin    ahead    median      5th       95th";
  console.log(head);
  console.log("-".repeat(head.length));

  const opts = { bankroll: BANKROLL, hands: HANDS, sessions: SESSIONS, seed: 777 };
  const show = (label, r) => console.log(
    label.padEnd(34) +
    ("$" + r.avgBet.toFixed(2)).padStart(8) +
    (r.ruin * 100).toFixed(2).padStart(8) + "%" +
    (r.ahead * 100).toFixed(1).padStart(8) + "%" +
    ("$" + r.median.toFixed(0)).padStart(10) +
    ("$" + r.p05.toFixed(0)).padStart(9) +
    ("$" + r.p95.toFixed(0)).padStart(10));

  for (const [key, params] of cases) {
    const def = BJRisk.strategy(key);
    const strat = BJRisk.fromParams(key, params);
    const label = def.kind === "counting"
      ? `${BJRisk.system(params.systemKey).name}, 1-${params.spread} spread`
      : def.name;
    const r = BJRisk.runSessions(stream, strat, opts);
    show(label, r);
    const fr = BJRisk.runSessions(stream, BJRisk.flat(r.avgBet), opts);
    show("   flat at the same avg bet", fr);
    console.log("");
  }
}

main();
