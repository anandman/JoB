# Color Up

A session ledger for gambling win/loss, and the record behind a tax return.
"Colouring up" is what you do when you leave a table: hand over your chips,
count what you actually have, and walk away with a number. That is the moment
this app is for.

Live at **https://anandman.github.io/bettor/colorup/**

## Your data never leaves your device

There is no server, no account and no analytics. Sessions live in your
browser's own storage, on your phone. The only way anything leaves is if you
export a backup or a spreadsheet, which you do by hand.

Add it to your home screen. That is not cosmetic: an installed web app is
exempt from Safari's practice of clearing storage for sites you have not
opened in a week, and it is what lets the icon show a count of sessions you
have not backed up.

## What it records

One row per session: when, where, what you played, what you put in, what you
walked out with, the tier credits it earned, any W-2G handpays, and — the
reason this exists rather than a spreadsheet — **how long it took**. Win rate
per hour is the number a column of totals cannot give you.

Three things follow from where it is used, which is a casino floor at the end
of a session:

- **One button.** Start, or color up. Everything else is behind it.
- **Nothing derivable is ever typed.** Win/loss, hours, session tier credits,
  coin-in and every rate are computed in one place, so the form, the list, the
  stats and the spreadsheet cannot disagree.
- **Everything is editable, always.** The timer is a convenience, never a
  constraint. Forgetting to color up until the next morning is the expected
  case: the app asks, and lets you set the time you actually left.

## Some arithmetic worth stating

**Win/(loss) is cash out less cash in less bonus.** Free play is the casino's
money and counts as money in, so a session funded by it does not read as
winnings.

**Tier credits are a coin-in proxy, not a tier credit ledger.** Session TC
times dollars-per-TC gives roughly what went through the machine, which is the
only figure that makes two sessions comparable. TC never reconciles between
sessions — bonuses, table games and promotions all post late — so no total is
ever shown. Table games are rated by a human watching your average bet, and
their coin-in says "pit estimate" in the sheet rather than pretending to be a
measurement.

**Winnings and losses do not net.** Winning sessions are income and losing
sessions are an itemised deduction, so the two gross figures are reported
separately and their sum is not a number to file.

**A handpay does not change what a session was worth** — the cash is already
in the cash out. W-2Gs are recorded one by one rather than as a total, because
at tax time they have to reconcile against a stack of forms.

## Shape

```
index.html        The app shell. Four tabs: Now, Log, Stats, Data.
js/store.js       IndexedDB, and the one function that derives every figure.
js/xlsx.js        Writes a real .xlsx in the browser. No dependencies.
js/export.js      Sessions to a spreadsheet, and to a backup that restores.
js/analysis.js    What the sessions add up to, for a player and for a return.
js/app.js         The interface: one form renderer over different field lists.
sw.js             Offline. A casino floor is where a phone has no signal.
```

The `.xlsx` writer needs no dependency because zip entries may be stored
rather than deflated — valid, and Excel opens it — which removes the only
reason it would have needed a compression library.

## Checks

From the repository root:

```sh
node tools/verify-colorup-store.js    # the derivations and the warnings
node tools/verify-colorup-xlsx.js     # the zip byte by byte, and a LibreOffice round trip
node tools/verify-colorup-ui.js       # the whole interface, driven the way a person drives it
```

`verify-colorup-ui.js` needs jsdom and fake-indexeddb. This repository ships
with no dependencies, so install them anywhere and point `NODE_PATH` at it;
without them the script skips rather than fails.

Nothing in the checks uses real data. The arithmetic was validated separately
against a real year's sheet outside the repository.
