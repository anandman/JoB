#!/usr/bin/env node
/**
 * Verify the derivations and the warnings.
 *
 *     node tools/verify-colorup-store.js
 *
 * Synthetic rows only. The real record is never copied into this repository,
 * so this exercises the shapes rather than the data — the arithmetic was
 * separately checked against every row of the 2026 sheet and reproduced all 47
 * win/loss figures and all 28 session tier-credit figures.
 */
"use strict";
const path = require("path");
const Store = require(path.join(__dirname, "..", "colorup", "js", "store.js"));

let fails = 0;
const ok = (m) => console.log("  ok   " + m);
const bad = (m) => { fails++; console.log("  FAIL " + m); };
const near = (a, b, e) => a !== null && b !== null && Math.abs(a - b) < (e || 0.005);

function session(over) {
  return Object.assign(Store.blank(), over);
}
// Add the hours in milliseconds. Passing a fractional hour to the Date
// constructor truncates it, which silently built a 2-hour session from H(2.5).
const H = (h) => {
  const start = new Date(2026, 7, 30, 10, 0);
  return { start: start.toISOString(), end: new Date(start.getTime() + h * 3600000).toISOString() };
};

console.log("\nWin/(loss) = cash out - cash in - bonus");
{
  let d = Store.derive(session({ cashIn: 2000, bonus: 75, cashOut: 0 }));
  near(d.winLoss, -2075) ? ok("casino money counts as money in: -2075") : bad("got " + d.winLoss);

  d = Store.derive(session({ cashIn: 1000, bonus: 0, cashOut: 0.7 }));
  near(d.winLoss, -999.3) ? ok("cents survive: -999.30") : bad("got " + d.winLoss);

  d = Store.derive(session({ cashIn: 500, bonus: 130, cashOut: 1007 }));
  near(d.winLoss, 377) ? ok("a winning session with a bonus: +377") : bad("got " + d.winLoss);

  d = Store.derive(session({ cashIn: 100, cashOut: 50, winLossOverride: -25 }));
  near(d.winLoss, -25) ? ok("an override wins over the arithmetic") : bad("got " + d.winLoss);
}

console.log("\nTier credits as coin-in, not as a tier credit ledger");
{
  let d = Store.derive(session({ startTC: 1200, endTC: 1400, tcRate: 10 }));
  near(d.sessionTC, 200) && near(d.coinIn, 2000)
    ? ok("200 TC at $10 = $2,000 of coin-in") : bad("TC " + d.sessionTC + " coin-in " + d.coinIn);

  d = Store.derive(session({ startTC: 0, endTC: 400, tcRate: 5 }));
  near(d.coinIn, 2000) ? ok("400 TC at the $5 high-limit rate = $2,000") : bad("got " + d.coinIn);

  d = Store.derive(session({ startTC: 0, endTC: 100, tcRate: 0 }));
  d.coinIn === null ? ok("an unknown rate yields no coin-in rather than a wrong one")
                    : bad("got " + d.coinIn);

  d = Store.derive(session({ game: "Blackjack", startTC: 0, endTC: 40, tcRate: 25 }));
  d.coinInIsEstimate ? ok("table coin-in is flagged as the pit's estimate")
                     : bad("blackjack coin-in was not flagged");
  d = Store.derive(session({ game: "Video Poker", startTC: 0, endTC: 40, tcRate: 10 }));
  !d.coinInIsEstimate ? ok("machine coin-in is not flagged") : bad("video poker was flagged");
}

console.log("\nRates, which are the reason for recording the time");
{
  const s = session(Object.assign({ cashIn: 1000, cashOut: 1250, startTC: 0, endTC: 500,
                                    tcRate: 10, perHand: 25 }, H(2.5)));
  const d = Store.derive(s);
  near(d.hours, 2.5) ? ok("2.5 hours from the timestamps") : bad("hours " + d.hours);
  near(d.perHour, 100) ? ok("+$100 an hour") : bad("perHour " + d.perHour);
  near(d.coinIn, 5000) ? ok("$5,000 of coin-in") : bad("coinIn " + d.coinIn);
  near(d.realizedReturn, 1.05) ? ok("realised return 105% — what the pay table actually paid you")
                               : bad("return " + d.realizedReturn);
  near(d.hands, 200) ? ok("200 hands at $25 a hand") : bad("hands " + d.hands);
  near(d.handsPerHour, 80) ? ok("80 hands an hour") : bad("handsPerHour " + d.handsPerHour);
}

console.log("\nWarnings — always advisory, never blocking");
{
  const w = (o) => Store.warnings(session(o));
  w({ venue: "", cashIn: 100 }).some((x) => /venue/i.test(x)) ? ok("missing venue") : bad("no venue warning");
  w({ venue: "X", cashIn: 0, bonus: 0 }).some((x) => /Nothing went in/.test(x))
    ? ok("nothing wagered") : bad("no zero-stake warning");
  w({ venue: "X", cashIn: 100, startTC: 500, endTC: 300 }).some((x) => /swapped/.test(x))
    ? ok("tier credits going backwards") : bad("no swapped-TC warning");
  w({ venue: "X", cashIn: 100, cashOut: 0, startTC: 0, endTC: 5, tcRate: 10 })
    .some((x) => /cannot happen/.test(x))
    ? ok("losing more than the coin-in") : bad("no impossible-loss warning");
  w(Object.assign({ venue: "X", cashIn: 100 }, H(20))).some((x) => /twelve hours/.test(x))
    ? ok("a twenty hour session") : bad("no long-session warning");
  const clean = w(Object.assign({ venue: "Eldorado", cashIn: 1000, cashOut: 1100,
                                  startTC: 0, endTC: 200, tcRate: 10 }, H(3)));
  clean.length === 0 ? ok("an ordinary session warns about nothing") : bad("spurious: " + clean.join(" "));
}

console.log("\nDates are local, because a casino is somewhere in particular");
{
  // 11pm on the 30th in Nevada is already the 31st in UTC. Filing the session
  // on the wrong day would put a New Year's Eve session in the wrong tax year.
  const evening = new Date(2026, 7, 30, 23, 30);
  Store.today(evening) === "2026-08-30"
    ? ok("a late evening still belongs to that evening's date") : bad("got " + Store.today(evening));
  /^\d{4}-\d{2}-\d{2}$/.test(Store.blank().date)
    ? ok("and a new session gets one") : bad("blank date " + Store.blank().date);
}

console.log("\nW-2G handpays");
{
  let d = Store.derive(session({ cashIn: 2000, cashOut: 2650,
                                 handpays: [{ amount: 4000, withheld: 0 }, { amount: 2500, withheld: 600 }] }));
  d.handpayCount === 2 && near(d.handpayTotal, 6500) && near(d.handpayWithheld, 600)
    ? ok("counted, totalled, and the withholding kept apart") : bad("got " + JSON.stringify(d));

  d = Store.derive(session({ cashIn: 2000, cashOut: 2650, handpays: [{ amount: 4000 }] }));
  // A handpay is not income on top of the session — the cash it paid is already
  // in the cash out. Adding it would double count every jackpot.
  near(d.winLoss, 650) ? ok("a handpay does not change what the session was worth")
                       : bad("winLoss " + d.winLoss);

  Store.warnings(session({ venue: "X", cashIn: 100, handpays: [{ withheld: 50 }] }))
    .some((x) => /no amount/.test(x))
    ? ok("a handpay with no amount is flagged") : bad("no handpay warning");
  Store.W2G_THRESHOLD === 2000
    ? ok("the reporting line is $2,000, which is the 2026 figure") : bad("threshold " + Store.W2G_THRESHOLD);
}

console.log("\nA new session inherits what is still true");
{
  const prev = session({ venue: "Eldorado", location: "Reno, NV", game: "Video Poker",
                         detail: "9-6 HL $5 JoB", cashOut: 2155, endTC: 1400, tcRate: 5, perHand: 25 });
  const next = Store.blank(prev);
  next.cashIn === 2155 ? ok("cash out carries forward as the next cash in — the number you kept retyping")
                       : bad("cashIn " + next.cashIn);
  next.startTC === 1400 ? ok("ending tier credits become the next starting figure") : bad("startTC " + next.startTC);
  next.venue === "Eldorado" && next.detail === "9-6 HL $5 JoB" && next.tcRate === 5
    ? ok("venue, machine and $/TC carry over") : bad("context not carried");
  next.cashOut === null && next.bonus === null && next.endTC === null
    ? ok("but nothing about the new session is guessed") : bad("carried a result forward");
  next.id !== prev.id ? ok("new id") : bad("id reused");
}

console.log(fails ? `\n${fails} FAILED\n` : "\nall checks passed\n");
process.exit(fails ? 1 : 0);
