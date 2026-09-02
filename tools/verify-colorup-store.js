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

console.log("\nTrips, which are the unit you actually went and did");
{
  const Analysis = require(path.join(__dirname, "..", "colorup", "js", "analysis.js"));
  const on = (d) => session({ date: d, venue: "Eldorado", cashIn: 100, cashOut: 50 });
  // Two clusters a month apart, one of them spanning an overnight.
  const rows = ["2026-01-02", "2026-01-03", "2026-01-03", "2026-01-04",
                "2026-02-07", "2026-02-07"].map(on);
  const t = Analysis.trips(rows);
  t.length === 2 ? ok("a month's gap makes two trips, not one") : bad(t.length + " trips");
  t[1].sessions.length === 4 && t[1].days === 3
    ? ok("and an overnight carries on rather than starting another")
    : bad("first trip: " + t[1].sessions.length + " sessions over " + t[1].days + " days");
  t[0].start === "2026-02-07" ? ok("newest first, which is the end you look at")
                              : bad("ordered " + t[0].start);

  Analysis.trips(rows, 40).length === 1
    ? ok("a wider gap folds them into one, so the rule is a setting not a law")
    : bad("gap setting ignored");
  Analysis.trips([]).length === 0 ? ok("and nothing makes no trips") : bad("empty made a trip");
}

console.log("\nHow much of a result is luck");
{
  const Analysis = require(path.join(__dirname, "..", "colorup", "js", "analysis.js"));
  // $50,000 through a max-bet $25 video poker machine.
  const vp = session({ game: "Video Poker", startTC: 0, endTC: 5000, tcRate: 10,
                       perHand: 25, cashIn: 2000, cashOut: 1500 });
  const s = Analysis.swing([vp]);
  const want = Math.sqrt(50000 * 25 * 19.5);
  near(s.sd, want, 0.01)
    ? ok("the standard deviation is sqrt(coin-in x bet x variance): $" + Math.round(s.sd))
    : bad("sd " + s.sd + ", wanted " + want);
  near(s.band, 1.96 * want, 0.01)
    ? ok("and the band is close to two of them either way")
    : bad("band " + s.band);
  s.winLoss === -500
    ? ok("carrying the result of the very sessions it is built from")
    : bad("winLoss " + s.winLoss);

  // The trap this exists to avoid: a band over one session held up against
  // fifty sessions of losses, which is the per-hour mistake wearing a hat.
  const blind = session({ game: "Slots", cashIn: 900, cashOut: 0 });
  const mixed = Analysis.swing([vp, blind]);
  mixed.sessions === 1 && mixed.winLoss === -500
    ? ok("a session with nothing to measure is left out of both halves")
    : bad("sessions " + mixed.sessions + " winLoss " + mixed.winLoss);

  Analysis.swing([blind]) === null
    ? ok("and nothing measurable gives no band rather than a meaningless one")
    : bad("produced a band from nothing");
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

console.log("\nGoing back to the cage mid-session");
{
  // The opening figure and the top-ups are each typed once and never overwrite
  // each other, so the record keeps both what you sat down with and what you
  // went back for.
  let d = Store.derive(session({ cashIn: 2000, bonus: 100, cashOut: 2650,
                                 buyIns: [{ amount: 500, kind: "cash" }] }));
  near(d.cashIn, 2500) && near(d.moneyIn, 2600) && near(d.winLoss, 50)
    ? ok("a $500 top-up turns +$550 into +$50, which is the truth")
    : bad("in " + d.moneyIn + " net " + d.winLoss);

  d = Store.derive(session({ cashIn: 1000, cashOut: 900,
                             buyIns: [{ amount: 200, kind: "bonus" }] }));
  near(d.bonus, 200) && near(d.winLoss, -300)
    ? ok("free play handed over mid-session is still the casino's money")
    : bad("bonus " + d.bonus + " net " + d.winLoss);

  d = Store.derive(session({ cashIn: 500, cashOut: 0,
                             buyIns: [{ amount: 500 }, { amount: 500 }] }));
  d.topUpCount === 2 && near(d.topUps, 1000) && near(d.winLoss, -1500)
    ? ok("and three buy-ins of $500 are three buy-ins, not one of $1,500")
    : bad("count " + d.topUpCount + " net " + d.winLoss);

  d = Store.derive(session({ cashIn: 1000, cashOut: 1000 }));
  d.topUpCount === 0 && near(d.cashIn, 1000)
    ? ok("a session with none behaves exactly as before") : bad("regressed without top-ups");

  Store.warnings(session({ venue: "X", cashIn: 100, buyIns: [{ kind: "cash" }] }))
    .some((x) => /top-up with no amount/.test(x))
    ? ok("an empty top-up row is flagged") : bad("no empty top-up warning");
  Store.warnings(session({ venue: "X", cashIn: 0, bonus: 0, buyIns: [{ amount: 400 }] }))
    .some((x) => /Nothing went in/.test(x))
    ? bad("said nothing went in when $400 did") : ok("and money that arrived late still counts as money in");
}

console.log("\nGames, and what kind of thing each one is");
{
  const kinds = {};
  Store.GAMES.forEach((g) => { kinds[g.kind] = (kinds[g.kind] || 0) + 1; });
  Store.GAMES.length >= 20 ? ok(`${Store.GAMES.length} games across ${Object.keys(kinds).length} kinds`)
                           : bad("only " + Store.GAMES.length + " games");
  ["Video Poker", "Blackjack", "Baccarat", "Roulette", "Pai Gow Poker", "Craps",
   "Three Card Poker", "Poker Room", "Sports Betting"].every((n) => Store.gameInfo(n).kind !== "other")
    ? ok("the usual ones are all named, so nothing common lands in Other") : bad("a common game is missing");

  Store.gameInfo("Video Poker").kind === "machine" && Store.gameInfo("Blackjack").kind === "table"
    ? ok("a machine counts, a table is rated") : bad("kinds wrong");
  Store.gameInfo("Poker Room").tcRate === 0
    ? ok("a poker room earns credits for time, so it suggests no $/TC rather than a wrong one")
    : bad("poker room rate " + Store.gameInfo("Poker Room").tcRate);
  Store.gameInfo("Nonesuch").kind === "other"
    ? ok("and an unknown game degrades rather than throwing") : bad("unknown game threw");

  let d = Store.derive(session({ game: "Roulette", startTC: 0, endTC: 100, tcRate: 25 }));
  d.coinInBasis === "pit estimate" ? ok("roulette coin-in says it is the pit's estimate")
                                   : bad("basis " + d.coinInBasis);
  d = Store.derive(session({ game: "Slots", startTC: 0, endTC: 100, tcRate: 5 }));
  d.coinInBasis === "measured" ? ok("a slot machine's is measured") : bad("basis " + d.coinInBasis);
}

console.log("\nA bet that varies, which is what a progression is");
{
  // Under Martingale or d'Alembert there is no bet size to divide coin-in by.
  // Counting the hands instead gives the average bet, rather than assuming it.
  let d = Store.derive(session({ game: "Blackjack", startTC: 0, endTC: 60, tcRate: 25,
                                 handsOverride: 180 }));
  near(d.hands, 180) && d.handsCounted ? ok("counted hands are used as counted")
                                       : bad("hands " + d.hands);
  near(d.avgBet, 1500 / 180) ? ok("and the average bet falls out of them: $8.33")
                             : bad("avgBet " + d.avgBet);

  d = Store.derive(session({ game: "Video Poker", startTC: 0, endTC: 500, tcRate: 10, perHand: 25 }));
  near(d.hands, 200) && !d.handsCounted ? ok("a flat bet still gives hands from coin-in")
                                        : bad("hands " + d.hands);
  near(d.avgBet, 25) ? ok("with the average bet being the bet") : bad("avgBet " + d.avgBet);

  d = Store.derive(session({ handsOverride: 300 }));
  near(d.hands, 300) && d.avgBet === null
    ? ok("hands without coin-in give no average bet rather than a made-up one")
    : bad("avgBet " + d.avgBet);

  Store.warnings(session({ venue: "X", cashIn: 100, game: "Blackjack", startTC: 0, endTC: 60,
                           tcRate: 25, handsOverride: 180, perHand: 50 }))
    .some((x) => /but the tier credits work out to/.test(x))
    ? ok("three numbers that cannot all be true say so") : bad("no mismatch warning");
}

console.log("\nThree ways to know how many hands, in order of authority");
{
  const play = (over) => Store.derive(session(Object.assign({}, H(2), over)));

  let d = play({ game: "Blackjack", startTC: 0, endTC: 60, tcRate: 25,
                 perHand: 25, handsOverride: 150 });
  d.handsBasis === "counted" && near(d.hands, 150)
    ? ok("counting beats everything, because you were there") : bad("basis " + d.handsBasis);

  d = play({ game: "Video Poker", startTC: 0, endTC: 1312, tcRate: 10, perHand: 50 });
  d.handsBasis === "coin in" && near(d.hands, 262.4)
    ? ok("otherwise coin-in over the bet, which is arithmetic and not an average")
    : bad("basis " + d.handsBasis + " hands " + d.hands);

  d = play({ game: "Blackjack" });
  d.handsBasis === "typical pace" && near(d.hands, 160)
    ? ok("and failing both, a typical pace for the game — 80 an hour at blackjack")
    : bad("basis " + d.handsBasis + " hands " + d.hands);
  d.handsPerHour === null
    ? ok("which reports no hands per hour, since that would be the pace handed back")
    : bad("handsPerHour " + d.handsPerHour);

  d = play({ game: "Pai Gow Poker" });
  near(d.hands, 60) ? ok("pai gow is the slowest game on the floor and is priced that way")
                    : bad("pai gow hands " + d.hands);
  d = play({ game: "Sports Betting" });
  d.hands === null ? ok("and a sports bet has no pace at all, so it gets no number")
                   : bad("hands " + d.hands);

  d = Store.derive(session({ game: "Blackjack" }));
  d.hands === null ? ok("a pace needs a duration; without one it stays silent") : bad("hands " + d.hands);
}

console.log("\nSuggestions, narrowed by what else is on the form");
{
  const rows = [
    session({ date: "2026-08-01", venue: "Eldorado", location: "Reno, NV", game: "Video Poker",
              detail: "9/6 $5", endTC: 100 }),
    session({ date: "2026-08-10", venue: "Peppermill", location: "Reno, NV", game: "Blackjack",
              detail: "$25 shoe", endTC: 400 }),
    session({ date: "2026-08-20", venue: "Eldorado", location: "Reno, NV", game: "Video Poker",
              detail: "9/5 HL $5", endTC: 900 })
  ];
  const d = Store.seen(rows, "detail", { venue: "Eldorado", game: "Video Poker" });
  d[0] === "9/5 HL $5" && d[1] === "9/6 $5"
    ? ok("machines from this venue come first") : bad("got " + JSON.stringify(d));
  d.indexOf("$25 shoe") >= 0
    ? ok("but nothing is hidden — you have played elsewhere") : bad("narrowing hid a value");
  Store.lastWith(rows, { venue: "Peppermill" }, "location") === "Reno, NV"
    ? ok("a venue you have been to knows what city it is in") : bad("no city");

  Store.previousFor(rows, "2026-08-15").endTC === 400
    ? ok("a session backdated to the 15th inherits the 10th's ending credits, not the 20th's")
    : bad("got " + Store.previousFor(rows, "2026-08-15").endTC);
  Store.previousFor(rows, "2026-08-30").endTC === 900
    ? ok("and one today inherits the most recent") : bad("wrong predecessor");
  const running = session({ date: "2026-08-25", start: "2026-08-25T20:00:00Z", endTC: null });
  Store.previousFor(rows.concat([running]), "2026-08-30").endTC === 900
    ? ok("a session still on the clock is never the one inherited from") : bad("inherited an open session");
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
