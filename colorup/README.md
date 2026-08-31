# Color Up

A session ledger for gambling win/loss, and the record behind a tax return.
"Colouring up" is what you do when you leave a table: hand over your chips,
count what you actually have, and walk away with a number. That is the moment
this app is for.

Live at **https://anandman.github.io/bettor/colorup/**

## Your data goes where you send it, and nowhere else

There is no server, no account and no analytics. Sessions live in your
browser's own storage, on your phone. They leave only if you connect your own
Dropbox or export a file by hand.

Add it to your home screen. That is not cosmetic: an installed web app is
exempt from Safari's practice of clearing storage for sites you have not
opened in a week, and it is what lets the icon show a count of sessions you
have not backed up.

## Dropbox

Optional, and the only thing that puts the record anywhere but the phone.
Connect it once and every save is written up as `ColorUp.json`, with
`ColorUp.xlsx` beside it, into **Apps/Color Up/** — its own folder, because the
app is scoped so that it cannot see the rest of your Dropbox even in
principle.

Three things about how it works, each of which rules something out:

**The whole file, every sync.** No append, no patch, no dated snapshots.
Editing a session from three months ago therefore just works, and Dropbox's own
version history covers a bad write far better than any scheme here could.

**A sync reads before it writes.** Anything the far side has that this device
does not is pulled in, and where both have the same session the newer edit
wins — so two devices converge instead of overwriting each other. Deletions
travel as tombstones, so a session you deleted stays deleted rather than being
restored by whichever copy still had it.

**Offline is normal, not an error.** A casino floor is where a phone has no
signal. Saving always works; the app just says loudly that the record is only
on the phone, and goes up on its own when a signal returns.

To connect, you make your own Dropbox app — two minutes, and it means the
credentials are yours rather than shared with anyone else using this:

1. At **dropbox.com/developers/apps**, choose *Create app*.
2. Pick *Scoped access*, then **App folder**, and name it Color Up.
3. On *Permissions*, tick `files.content.read` and `files.content.write`,
   then *Submit*.
4. On *Settings*, copy the **App key** and paste it into the Data tab.

Dropbox then shows you a code to paste back. That is deliberate rather than a
shortcut: a home screen web app that navigates out to another site is not
reliably returned to the same storage afterwards, and losing the handshake
halfway is worse than one copy and paste. It happens once — the token that
comes back is durable, and every sync after it is silent.

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
- **The form fills itself in where it honestly can.** A new session inherits
  from the last one that finished *before it* — so a session backdated to
  Tuesday carries Tuesday's ending tier credits, not Saturday's. Venues,
  cities, machines and tables you have used before are one tap away, narrowed
  by what is already on the form: asked for a machine it offers the ones from
  the venue selected, without hiding the rest.

## Some arithmetic worth stating

**Win/(loss) is cash out less cash in less bonus.** Free play is the casino's
money and counts as money in, so a session funded by it does not read as
winnings.

**Going back to the cage is ordinary.** Money added mid-session is recorded as
its own top-up rather than folded into the opening figure, so the record keeps
both what you sat down with and what you went back for — and how many times.
Cash in, everywhere it is totalled, means all of it.

**Tier credits are a coin-in proxy, not a tier credit ledger.** Session TC
times dollars-per-TC gives roughly what went through the machine, which is the
only figure that makes two sessions comparable. TC never reconciles between
sessions — bonuses, table games and promotions all post late — so no total is
ever shown.

Where the credits came from decides what that figure is worth, so each game
says which kind of thing it is. A **machine** counts every dollar through it,
and its coin-in is a measurement. A **table** is rated by a person estimating
your average bet and your hours, so the same arithmetic gives an estimate, and
the sheet says "pit estimate" rather than pretending otherwise. A **poker room
or bingo hall** awards credits for time and not for money wagered at all, so
no rate is suggested and no coin-in is derived. Selecting a game suggests a
$/TC rate to save typing — a suggestion, never a fact, and it never overwrites
one you have set yourself.

**A bet that varies is normal.** Under a progression there is no bet size to
divide coin-in by, so counting the hands is the way in: enter hands and the
average bet is worked out from them, or enter an average bet and the hands are
worked out instead. Exactly one of the two is ever typed, and the sheet records
which. If hands, average bet and coin-in are all present and cannot all be
true, the app says so.

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
js/dropbox.js     PKCE, tokens, and the read-merge-write sync.
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
node tools/verify-colorup-sync.js     # the Dropbox client, against a Dropbox that is not there
node tools/verify-colorup-ui.js       # the whole interface, driven the way a person drives it
```

160 checks. The last two need jsdom and fake-indexeddb; this repository ships
with no dependencies, so install them anywhere and point `NODE_PATH` at it —
without them those scripts skip rather than fail.

The sync check stands up an in-memory Dropbox, which is the only way to
exercise a second device, a deletion that has to stay deleted, an expired
token and a first sync against an empty account without an account or a
network. What it cannot check is that Dropbox's API is what the code believes
it is; only a real connection shows that.

Nothing in the checks uses real data. The arithmetic was validated separately
against a real year's sheet outside the repository.
