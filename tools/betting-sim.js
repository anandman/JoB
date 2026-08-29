#!/usr/bin/env node
/**
 * Compare betting strategies at matched average bet.
 *
 *     node tools/betting-sim.js
 *
 * No betting progression changes expected value — every one of these wagers
 * into the same house edge, and EV is linear in the amount wagered. What a
 * progression can change is the SHAPE of the outcome: how much is at risk when
 * the bankroll is low, how fat the right tail is, and therefore risk of ruin.
 *
 * The comparison is only meaningful at matched average bet. A ladder that
 * averages $69 a hand against flat $50 is not a better system, it is a bigger
 * one — it will show more ruin and more upside for that reason alone. So every
 * strategy here is also run against a flat bet at its own average.
 *
 * Every strategy walks the SAME stream of hand outcomes, so differences are
 * caused by the betting rule and not by luck.
 */

"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const src = ["bob/js/rules.js", "bob/js/engine.js", "bob/js/strategy.js", "bob/js/game.js"]
  .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("");
const { BJRules, BJEngine, BJStrategy, BJGame } =
  new Function(src + ";return {BJRules,BJEngine,BJStrategy,BJGame};")();
const E = BJEngine, S = BJStrategy, G = BJGame;

// Math.imul: a plain multiply overflows double precision and the surviving low
// bits are the corrupted ones.
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** A long stream of per-hand results, in units of that hand's nominal bet. */
function outcomeStream(rules, n, seed) {
  const rnd = lcg(seed);
  const cache = new Map();
  const decide = (cards, up, legal) => {
    const k = cards.slice().sort().join(",") + "|" + up + "|" + legal.join(",");
    let a = cache.get(k);
    if (a === undefined) {
      const c = E.freshShoe(rules.decks);
      for (const x of cards.concat([up])) c[x]--;
      const r = E.actions(cards, up, c, rules, { infinite: true });
      a = (r.actions.filter((y) => legal.indexOf(y.action) >= 0)[0] || { action: "stand" }).action;
      cache.set(k, a);
    }
    return a;
  };
  const out = new Float64Array(n);
  const st = G.create(rules);
  for (let i = 0; i < n; i++) {
    G.deal(st, rnd);
    let guard = 0;
    while (st.phase === "player" && guard++ < 40) {
      const legal = G.legalActions(st);
      if (!legal.length) { st.hands[st.active].done = true; G.act(st, "stand", rnd, { grade: false }); continue; }
      G.act(st, decide(G.hand(st).cards, G.upcard(st), legal), rnd, { grade: false });
    }
    out[i] = st.result ? st.result.net : 0;
  }
  return out;
}

/**
 * The generic betting model.
 *
 * A level counter plus one action per outcome. That single shape covers every
 * progression a real player uses: flat (hold everywhere), a positive ladder
 * (up on win, reset on loss), Martingale (up on loss, reset on win),
 * d'Alembert (up on loss, down on win). Systems carrying their own state —
 * Labouchere, Oscar's Grind — do NOT fit and are deliberately out of scope.
 */
function makeStrategy(spec) {
  const levels = [];
  for (let i = 0; ; i++) {
    const bet = spec.mode === "multiply" ? spec.base * Math.pow(spec.factor, i)
                                         : spec.base + i * spec.unit;
    if (bet > spec.cap + 1e-9) break;
    levels.push(bet);
    if (levels.length > 64) break;
  }
  const move = (lvl, act) =>
    act === "up" ? Math.min(lvl + 1, levels.length - 1)
    : act === "down" ? Math.max(lvl - 1, 0)
    : act === "reset" ? 0 : lvl;
  return {
    name: spec.name,
    levels: levels,
    bet: (lvl) => levels[lvl],
    step: (lvl, net) => move(lvl, net > 0 ? spec.onWin : net < 0 ? spec.onLoss : spec.onPush)
  };
}

function flatAt(amount, name) {
  return { name: name, levels: [amount], bet: () => amount, step: () => 0 };
}

/** Run many independent sessions of a strategy over the shared stream. */
function run(stream, strat, opts) {
  const { bankroll, hands, sessions } = opts;
  let ruined = 0, ahead = 0, wagered = 0, betCount = 0;
  const finals = new Float64Array(sessions);

  for (let s = 0; s < sessions; s++) {
    const start = (s * hands) % (stream.length - hands);
    let bank = bankroll, lvl = 0, dead = false;
    for (let h = 0; h < hands; h++) {
      let bet = strat.bet(lvl);
      // You cannot wager more than you are holding.
      if (bet > bank) bet = bank;
      if (bank <= 0) { dead = true; break; }
      const net = stream[start + h];
      wagered += bet; betCount++;
      bank += net * bet;
      lvl = strat.step(lvl, net);
      if (bank <= 0) { dead = true; break; }
    }
    if (dead) ruined++;
    finals[s] = Math.max(0, bank);
    if (finals[s] > bankroll) ahead++;
  }

  const sorted = Float64Array.from(finals).sort();
  const q = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  let sum = 0;
  for (let i = 0; i < sessions; i++) sum += finals[i];
  return {
    name: strat.name,
    avgBet: wagered / betCount,
    ruin: ruined / sessions,
    ahead: ahead / sessions,
    mean: sum / sessions,
    p05: q(0.05), median: q(0.5), p95: q(0.95)
  };
}

function main() {
  const rules = BJRules.make({ decks: 6, h17: false, das: true, surrender: "late" });
  const BANKROLL = Number(process.env.BANKROLL || 2000);
  const HANDS = Number(process.env.HANDS || 300);
  const SESSIONS = Number(process.env.SESSIONS || 40000);
  const STREAM = Number(process.env.STREAM || 4000000);

  process.stdout.write("generating hand outcomes… ");
  const t0 = Date.now();
  const stream = outcomeStream(rules, STREAM, 20260829);
  let m = 0, v = 0;
  for (let i = 0; i < stream.length; i++) m += stream[i];
  m /= stream.length;
  for (let i = 0; i < stream.length; i++) v += (stream[i] - m) * (stream[i] - m);
  v /= stream.length;
  console.log(`${(STREAM / 1e6)}M hands in ${((Date.now() - t0) / 1000).toFixed(1)}s ` +
              `(edge ${(-m * 100).toFixed(3)}%, variance ${v.toFixed(3)})`);

  const specs = [
    { name: "Anand's ladder ($50 +$25/win, reset)", base: 50, unit: 25, cap: 150,
      mode: "add", onWin: "up", onPush: "hold", onLoss: "reset" },
    { name: "  ...uncapped", base: 50, unit: 25, cap: 1e9,
      mode: "add", onWin: "up", onPush: "hold", onLoss: "reset" },
    { name: "  ...cap $100 (2 steps)", base: 50, unit: 25, cap: 100,
      mode: "add", onWin: "up", onPush: "hold", onLoss: "reset" },
    { name: "  ...step down on loss", base: 50, unit: 25, cap: 150,
      mode: "add", onWin: "up", onPush: "hold", onLoss: "down" },
    { name: "Martingale (x2 on loss, cap $400)", base: 50, unit: 0, cap: 400,
      factor: 2, mode: "multiply", onWin: "reset", onPush: "hold", onLoss: "up" },
    { name: "d'Alembert (+$25 loss, -$25 win)", base: 50, unit: 25, cap: 300,
      mode: "add", onWin: "down", onPush: "hold", onLoss: "up" }
  ];

  console.log(`\nbankroll $${BANKROLL}, ${HANDS} hands a session, ${(SESSIONS/1000)}k sessions, ` +
              `same hand stream for every strategy\n`);
  const head = "strategy".padEnd(38) + "avg bet   ruin    ahead   median      5th       95th";
  console.log(head);
  console.log("-".repeat(head.length));

  const rows = [];
  for (const spec of specs) {
    const strat = makeStrategy(spec);
    const r = run(stream, strat, { bankroll: BANKROLL, hands: HANDS, sessions: SESSIONS });
    rows.push(r);
    // The only fair comparator: a flat bet at this strategy's own average.
    const fr = run(stream, flatAt(r.avgBet, "   flat at same avg bet"),
                   { bankroll: BANKROLL, hands: HANDS, sessions: SESSIONS });
    for (const x of [r, fr]) {
      console.log(x.name.padEnd(38) +
        ("$" + x.avgBet.toFixed(2)).padStart(8) +
        (x.ruin * 100).toFixed(2).padStart(8) + "%" +
        (x.ahead * 100).toFixed(1).padStart(8) + "%" +
        ("$" + x.median.toFixed(0)).padStart(9) +
        ("$" + x.p05.toFixed(0)).padStart(10) +
        ("$" + x.p95.toFixed(0)).padStart(10));
    }
    console.log("");
  }
}

main();
