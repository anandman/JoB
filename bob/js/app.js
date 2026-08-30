/**
 * Bettor or Bust — App logic
 *
 * Tab navigation and rendering. Every expectation shown here comes from
 * BJEngine via BJStrategy, BJAnalyzer or BJGame; this file computes nothing.
 */

(function () {
  "use strict";

  var E = BJEngine, S = BJStrategy, A = BJAnalyzer, G = BJGame, R = BJRules;

  // Both apps are served from one origin, so localStorage is shared. Prefix.
  var STORE = "bob.rules";

  var SUITS = ["♣", "♦", "♥", "♠"];
  var TEN_FACES = ["10", "J", "Q", "K"];

  var rules = load();
  var chartCache = null, chartKey = null;

  /* ===== Persistence ===== */

  function load() {
    try {
      var raw = localStorage.getItem(STORE);
      if (raw) return R.make(JSON.parse(raw));
    } catch (e) { /* private mode, cleared storage — fall through to defaults */ }
    return R.make(R.preset("vegas-6-s17").rules);
  }

  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(rules)); } catch (e) { /* ignore */ }
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function pct(x, dp) { return (x * 100).toFixed(dp === undefined ? 2 : dp) + "%"; }
  function signed(x, dp) { return (x >= 0 ? "+" : "") + x.toFixed(dp === undefined ? 4 : dp); }

  /* ===== Cards ===== */

  function cardEl(rank, opts) {
    opts = opts || {};
    var suit = opts.suit === undefined ? 3 : opts.suit;
    var c = el("span", "card" + (opts.small ? " small" : "") +
                       (suit === 1 || suit === 2 ? " red" : "") +
                       (opts.down ? " down" : ""));
    var face = rank === E.TEN ? (opts.face || "10") : E.RANK_LABELS[rank];
    c.appendChild(el("span", "card-rank", opts.down ? "?" : face));
    c.appendChild(el("span", "card-suit", opts.down ? "?" : SUITS[suit]));
    return c;
  }

  // Display only — the engine treats every ten-value card identically, so the
  // face and suit are cosmetic and chosen when a card is first shown.
  function dress(rank) {
    return { suit: Math.floor(Math.random() * 4),
             face: rank === E.TEN ? TEN_FACES[Math.floor(Math.random() * 4)] : null };
  }

  /* ===== Tabs ===== */

  function initTabs() {
    var links = document.querySelectorAll(".nav-link");
    Array.prototype.forEach.call(links, function (a) {
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        show(a.getAttribute("data-tab"));
      });
    });
  }

  function show(tab) {
    Array.prototype.forEach.call(document.querySelectorAll(".nav-link"), function (a) {
      a.classList.toggle("active", a.getAttribute("data-tab") === tab);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".tab-content"), function (s) {
      s.classList.toggle("active", s.id === tab);
    });
    if (tab === "strategy") renderChart();
    if (tab === "risk") { renderRiskPrimer(); renderRiskControls(); }
    if (tab === "count") { renderCountPrimer(); renderCountTags(); renderCount(); }
    if (tab !== "count") ctStop();
    window.scrollTo(0, 0);
  }

  /* ===== Rules form ===== */

  var FIELDS = [
    { key: "decks", label: "Decks", type: "select",
      options: [[1, "1"], [2, "2"], [4, "4"], [6, "6"], [8, "8"]], cast: Number },
    { key: "csm", label: "Continuous shuffler", type: "check",
      hint: "Every hand comes off a full shoe." },
    { key: "h17", label: "Dealer hits soft 17", type: "check",
      hint: "Costs you about 0.2%." },
    { key: "das", label: "Double after split", type: "check" },
    { key: "doubleOn", label: "Double on", type: "select",
      options: [["any", "Any two"], ["9-11", "9–11"], ["10-11", "10–11"]] },
    { key: "resplitTo", label: "Split to", type: "select",
      options: [[2, "2 hands"], [3, "3 hands"], [4, "4 hands"]], cast: Number },
    { key: "resplitAces", label: "Resplit aces", type: "check" },
    { key: "hitSplitAces", label: "Hit split aces", type: "check",
      hint: "Rare. Normally split aces get one card each." },
    { key: "surrender", label: "Surrender", type: "select",
      options: [["none", "None"], ["late", "Late"]] },
    { key: "blackjackPays", label: "Blackjack pays", type: "select",
      options: [[1.5, "3:2"], [1.2, "6:5"]], cast: Number,
      hint: "6:5 costs about 1.4%. It is the worst rule on the floor." }
  ];

  function renderRules() {
    var grid = document.getElementById("rules-grid");
    grid.innerHTML = "";

    FIELDS.forEach(function (f) {
      var row = el("div", "rule-row");
      var lab = el("label", null);
      lab.appendChild(document.createTextNode(f.label));
      if (f.hint) lab.appendChild(el("span", "hint", f.hint));
      lab.setAttribute("for", "rf-" + f.key);
      row.appendChild(lab);

      var input;
      if (f.type === "check") {
        input = el("input");
        input.type = "checkbox";
        input.checked = !!rules[f.key];
        input.addEventListener("change", function () {
          rules[f.key] = input.checked;
          onRulesChanged();
        });
      } else {
        input = el("select");
        f.options.forEach(function (o) {
          var opt = el("option", null, o[1]);
          opt.value = String(o[0]);
          input.appendChild(opt);
        });
        input.value = String(rules[f.key]);
        input.addEventListener("change", function () {
          rules[f.key] = f.cast ? f.cast(input.value) : input.value;
          onRulesChanged();
        });
      }
      input.id = "rf-" + f.key;
      row.appendChild(input);
      grid.appendChild(row);
    });

    var sel = document.getElementById("preset-select");
    sel.innerHTML = "";
    var custom = el("option", null, "Custom");
    custom.value = "";
    sel.appendChild(custom);
    R.PRESETS.forEach(function (p) {
      var o = el("option", null, p.name);
      o.value = p.key;
      sel.appendChild(o);
    });
    sel.value = matchingPreset() || "";
    sel.onchange = function () {
      var p = R.preset(sel.value);
      if (!p) return;
      rules = R.make(p.rules);
      renderRules();
      onRulesChanged();
    };
  }

  function matchingPreset() {
    var k = R.key(rules);
    for (var i = 0; i < R.PRESETS.length; i++) {
      if (R.key(R.PRESETS[i].rules) === k) return R.PRESETS[i].key;
    }
    return null;
  }

  function onRulesChanged() {
    save();
    chartCache = null;
    document.getElementById("preset-select").value = matchingPreset() || "";
    renderEdge();
    if (document.getElementById("strategy").classList.contains("active")) renderChart();
    resetAnalyzer();
    resetPlay();
    rkStream = null;
    ctStop();
    ct = null;
  }

  function renderEdge() {
    var v = document.getElementById("edge-value");
    v.textContent = "…";
    // Non-depleting: identical decisions, ~125x faster, so this can run on
    // every toggle without the UI stalling.
    setTimeout(function () {
      var edge = -S.houseEdge(rules, { infinite: true });
      v.textContent = pct(edge, 3);
      v.className = "edge-value" + (edge < 0.005 ? " good" : edge > 0.01 ? " bad" : "");
      // Edge x bet x hands per hour. 80 is a realistic shoe-game pace; say so
      // rather than quoting a rate whose assumptions are invisible.
      var perHour = edge * 100 * 80;
      document.getElementById("edge-sub").textContent =
        edge < 0
          ? "a player advantage of " + pct(-edge, 3) + " with perfect basic strategy"
          : "with perfect basic strategy — about $" + Math.abs(perHour).toFixed(0) +
            " an hour at $100 a hand, 80 hands an hour";
    }, 10);
  }

  /* ===== Strategy chart ===== */

  function chart() {
    var k = R.key(rules);
    if (chartCache && chartKey === k) return chartCache;
    chartCache = S.chart(rules, { infinite: true });
    chartKey = k;
    return chartCache;
  }

  function renderChart() {
    var ch = chart();
    document.getElementById("strategy-sub").textContent =
      rules.decks + " deck" + (rules.decks > 1 ? "s" : "") + ", " +
      (rules.h17 ? "H17" : "S17") + ", " + (rules.das ? "DAS" : "no DAS") +
      (rules.surrender === "late" ? ", late surrender" : "") +
      ", blackjack pays " + (rules.blackjackPays === 1.5 ? "3:2" : "6:5") + ".";

    drawTable("chart-hard", ch.hard, ch.upLabels);
    drawTable("chart-soft", ch.soft, ch.upLabels);
    drawTable("chart-pairs", ch.pairs, ch.upLabels);

    var legend = document.getElementById("chart-legend");
    legend.innerHTML = "";
    [["stand", "Stand"], ["hit", "Hit"], ["double", "Double"],
     ["split", "Split"], ["surrender", "Surrender"]].forEach(function (p) {
      var s = el("span");
      var i = el("i");
      i.style.background = "var(--act-" + p[0] + ")";
      s.appendChild(i);
      s.appendChild(document.createTextNode(p[1]));
      legend.appendChild(s);
    });
  }

  function drawTable(id, rows, upLabels) {
    var t = document.getElementById(id);
    t.innerHTML = "";
    var head = el("tr");
    head.appendChild(el("th", "row-label", ""));
    upLabels.forEach(function (u) { head.appendChild(el("th", null, u)); });
    t.appendChild(head);

    rows.forEach(function (row) {
      var tr = el("tr");
      tr.appendChild(el("th", "row-label", row.label));
      row.cells.forEach(function (c, i) {
        var margin = c.actions.length > 1 ? c.actions[0].ev - c.actions[1].ev : Infinity;
        var td = el("td", "act act-" + c.action + (margin < 0.01 ? " close" : ""),
                    S.CODE[c.action]);
        td.title = A.ACTION_LABELS[c.action] + "  EV " + signed(c.ev, 3) +
                   (margin < Infinity ? "  (next best costs " + margin.toFixed(4) + ")" : "");
        td.addEventListener("click", function () {
          var cards = row.rank !== undefined ? [row.rank, row.rank]
                    : (row.label.charAt(0) === "A" ? S.softCards(row.total) : S.hardCards(row.total));
          openInAnalyzer(cards, S.UPCARDS[i]);
        });
        tr.appendChild(td);
      });
      t.appendChild(tr);
    });
  }

  /* ===== Analyzer ===== */

  var anPlayer = [], anDealer = null, anTarget = "player";

  function resetAnalyzer() { anPlayer = []; anDealer = null; renderAnalyzer(); }

  function openInAnalyzer(cards, up) {
    anPlayer = cards.slice();
    anDealer = up;
    anTarget = "player";
    show("analyze");
    setMode("analyze");
    renderAnalyzer();
  }

  function renderAnalyzer() {
    var d = document.getElementById("an-dealer");
    var p = document.getElementById("an-player");
    d.innerHTML = ""; p.innerHTML = "";

    if (anDealer === null) d.appendChild(el("span", "note", "Pick the dealer's upcard."));
    else d.appendChild(cardEl(anDealer, { suit: 3 }));

    anPlayer.forEach(function (r, i) { p.appendChild(cardEl(r, { suit: i % 4 })); });
    if (!anPlayer.length) p.appendChild(el("span", "note", "Pick your cards."));

    document.getElementById("an-total").textContent =
      anPlayer.length ? A.handLabel(anPlayer) : "";

    document.getElementById("an-target-player").className =
      anTarget === "player" ? "primary" : "";
    document.getElementById("an-target-dealer").className =
      anTarget === "dealer" ? "primary" : "";

    renderPicker();
    renderAnalysis();
  }

  function renderPicker() {
    var box = document.getElementById("an-picker");
    box.innerHTML = "";
    // Order the picker the way a chart reads: 2..10 then A.
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].forEach(function (r) {
      var b = el("button", null, E.RANK_LABELS[r]);
      b.addEventListener("click", function () {
        if (anTarget === "dealer") anDealer = r;
        else if (anPlayer.length < 8) anPlayer.push(r);
        if (anTarget === "dealer") anTarget = "player";
        renderAnalyzer();
      });
      box.appendChild(b);
    });
  }

  function renderAnalysis() {
    var out = document.getElementById("an-result");
    out.innerHTML = "";
    if (anDealer === null || anPlayer.length < 2) return;

    var total = E.totalOf(E.handState(anPlayer));
    if (total > 21) {
      out.appendChild(banner("bad", "Bust at " + total + " — nothing left to decide."));
      return;
    }
    if (E.isBlackjack(anPlayer)) {
      out.appendChild(banner("good", "Blackjack. Pays " +
        (rules.blackjackPays === 1.5 ? "3:2" : "6:5") + "; there is no decision to make."));
      return;
    }

    out.appendChild(el("p", "note", "Working…"));
    // A full depleting-shoe analysis with splits can take a moment on a phone.
    setTimeout(function () {
      var res = A.analyze(anPlayer, anDealer, rules, []);
      out.innerHTML = "";
      if (res.error) { out.appendChild(banner("warn", res.error)); return; }

      var head = el("h3", null, "Every action, priced");
      out.appendChild(head);

      var list = el("div", "actions-list");
      res.actions.forEach(function (a, i) {
        var row = el("div", "action-row" + (a.best ? " is-best" : ""));
        row.style.borderLeftColor = "var(--act-" + a.action + ")";
        row.appendChild(el("span", "rank-num", String(i + 1)));
        row.appendChild(el("span", null, a.label));
        row.appendChild(el("span", "ev " + (a.best ? "cost" : "cost"),
          a.best ? signed(a.ev, 4) : "−" + a.cost.toFixed(4)));
        list.appendChild(row);
      });
      out.appendChild(list);
      out.appendChild(el("p", "note",
        "The best action shows its expected value per unit bet; the rest show what " +
        "choosing them gives up."));

      if (res.close) {
        out.appendChild(banner("warn",
          "This one is close — the runner-up costs only " +
          res.margin.toFixed(4) + " of a bet. Getting it wrong barely matters."));
      }

      out.appendChild(el("h3", null, "What the dealer does"));
      var dist = el("div", "dealer-dist");
      A.dealerRows(res.dealer).forEach(function (r) {
        var c = el("div", "dist-cell" + (r.label === "Bust" ? " bust" : ""));
        c.appendChild(el("div", "k", r.label));
        c.appendChild(el("div", "v", pct(r.p, 1)));
        dist.appendChild(c);
      });
      out.appendChild(dist);
      out.appendChild(el("p", "note",
        "Conditioned on the dealer not already having blackjack — in a peek " +
        "game that hand is over before you act."));
    }, 20);
  }

  function banner(kind, text) { return el("div", "banner " + kind, text); }

  function initAnalyzer() {
    document.getElementById("an-target-player").onclick = function () {
      anTarget = "player"; renderAnalyzer();
    };
    document.getElementById("an-target-dealer").onclick = function () {
      anTarget = "dealer"; renderAnalyzer();
    };
    document.getElementById("an-clear").onclick = resetAnalyzer;

    document.getElementById("mode-analyze").onclick = function () { setMode("analyze"); };
    document.getElementById("mode-play").onclick = function () { setMode("play"); };
  }

  function setMode(mode) {
    document.getElementById("mode-analyze").classList.toggle("active", mode === "analyze");
    document.getElementById("mode-play").classList.toggle("active", mode === "play");
    document.getElementById("analyze-pane").style.display = mode === "analyze" ? "" : "none";
    document.getElementById("play-pane").style.display = mode === "play" ? "" : "none";
    if (mode === "play" && !play) resetPlay();
  }

  /* ===== Play mode ===== */

  var play = null, lastGrade = null, dressing = null;

  function resetPlay() {
    play = G.create(rules);
    lastGrade = null;
    dressing = {};
    renderPlay();
  }

  function dressed(key, rank) {
    if (!dressing[key]) dressing[key] = dress(rank);
    return dressing[key];
  }

  function renderPlay() {
    var table = document.getElementById("play-table");
    table.innerHTML = "";
    if (!play) return;

    if (play.phase === "idle") {
      table.appendChild(el("p", "note", "Deal a hand and play it out. Every decision " +
        "is scored against the exact best action for your rules — a tie counts as correct."));
    } else {
      var hidden = play.phase === "player";
      var dSeat = el("div", "seat");
      var dLab = el("div", "seat-label");
      dLab.appendChild(el("span", null, "Dealer"));
      dLab.appendChild(el("span", "seat-total",
        hidden ? "showing " + E.RANK_LABELS[play.dealerCards[0]]
               : A.handLabel(play.dealerCards)));
      dSeat.appendChild(dLab);
      var dHand = el("div", "hand");
      play.dealerCards.forEach(function (c, i) {
        var d = dressed("d" + i, c);
        dHand.appendChild(cardEl(c, { suit: d.suit, face: d.face, down: hidden && i === 1 }));
      });
      dSeat.appendChild(dHand);
      table.appendChild(dSeat);

      play.hands.forEach(function (h, i) {
        var seat = el("div", "seat" + (play.phase === "player" && i === play.active ? " active" : ""));
        var lab = el("div", "seat-label");
        lab.appendChild(el("span", null, play.hands.length > 1 ? "Hand " + (i + 1) : "You"));
        lab.appendChild(el("span", "seat-total",
          A.handLabel(h.cards) + (h.doubled ? " · doubled" : "") +
          (h.surrendered ? " · surrendered" : "") +
          (h.result !== null ? " · " + signed(h.result, 2) : "")));
        seat.appendChild(lab);
        var hand = el("div", "hand");
        h.cards.forEach(function (c, j) {
          var d = dressed("p" + i + "_" + j, c);
          hand.appendChild(cardEl(c, { suit: d.suit, face: d.face }));
        });
        seat.appendChild(hand);
        table.appendChild(seat);
      });
    }

    renderPlayActions();
    renderPlayFeedback();
    renderPlayStats();
  }

  function renderPlayActions() {
    var box = document.getElementById("play-actions");
    box.innerHTML = "";
    if (!play || play.phase !== "player") {
      var b = el("button", "primary", play && play.phase === "done" ? "Deal again" : "Deal");
      b.onclick = function () {
        lastGrade = null;
        dressing = {};
        G.deal(play, Math.random);
        renderPlay();
      };
      box.appendChild(b);
      return;
    }
    G.legalActions(play).forEach(function (a) {
      var btn = el("button", "act-" + a, A.ACTION_LABELS[a]);
      btn.onclick = function () {
        lastGrade = G.act(play, a, Math.random);
        if (lastGrade) lastGrade.taken = a;
        renderPlay();
      };
      box.appendChild(btn);
    });
  }

  function renderPlayFeedback() {
    var box = document.getElementById("play-feedback");
    box.innerHTML = "";
    if (!play) return;

    if (lastGrade) {
      if (lastGrade.correct) {
        box.appendChild(banner("good", "✓ " + A.ACTION_LABELS[lastGrade.taken] +
          " was right."));
      } else {
        box.appendChild(banner("bad", "✗ " + A.ACTION_LABELS[lastGrade.taken] +
          " cost " + lastGrade.cost.toFixed(4) + " of a bet. Best was " +
          A.ACTION_LABELS[lastGrade.best] + "."));
      }
    }

    if (play.phase === "done" && play.result) {
      var net = play.result.net;
      box.appendChild(banner(net > 0 ? "good" : net < 0 ? "bad" : "warn",
        (play.result.dealerBlackjack ? "Dealer blackjack. " : "") +
        "Dealer " + (play.result.dealerTotal > 21 ? "busts" : "has " + play.result.dealerTotal) +
        ". You " + (net > 0 ? "win " : net < 0 ? "lose " : "push") +
        (net === 0 ? "" : Math.abs(net).toFixed(2) + " bets") + "."));
    }
  }

  function renderPlayStats() {
    var box = document.getElementById("play-stats");
    box.innerHTML = "";
    if (!play) return;
    var st = play.stats;
    var acc = st.decisions ? st.correct / st.decisions : 0;
    // Net is kept in bets, which is the unit the whole app thinks in, and shown
    // in money at the Risk tab's base bet so it reads like a session.
    var stake = rkNum("rk-base", 25);
    var money = st.net * stake;
    [["Hands", String(st.hands), ""],
     ["Net", (st.net >= 0 ? "+" : "−") + Math.abs(st.net).toFixed(1) + " bets",
      (money >= 0 ? "+$" : "−$") + Math.abs(money).toFixed(0) + " at $" + stake + " a hand",
      st.net > 0 ? "good" : st.net < 0 ? "bad" : ""],
     ["Correct", st.decisions ? pct(acc, 0) : "—",
      st.decisions ? st.correct + " of " + st.decisions + " decisions" : ""],
     ["Errors cost", st.decisions ? "−" + st.cost.toFixed(2) : "—",
      st.decisions && st.cost > 0 ? "−$" + (st.cost * stake).toFixed(0) + " given up" : ""]
    ].forEach(function (p) {
      var s = el("div", "stat");
      s.appendChild(el("div", "k", p[0]));
      var v = el("div", "v" + (p[3] ? " " + p[3] : ""), p[1]);
      s.appendChild(v);
      if (p[2]) s.appendChild(el("div", "sub", p[2]));
      box.appendChild(s);
    });
  }

  /* ===== Risk ===== */

  var RK = BJRisk;
  var rkStream = null, rkStreamKey = null, rkParams = {};
  var RK_STREAM_HANDS = 400000;

  var RK_FIELDS = {
    step: { label: "Step size", hint: "How much each level adds.", def: 25, min: 5, stepBy: 5 },
    threshold: { label: "Start raising at", hint: "The count at which you leave the minimum.",
                 def: 1, min: -4, stepBy: 1 },
    spread: { label: "Bet spread", hint: "Top bet as a multiple of the base.",
              select: [[2, "1 to 2"], [4, "1 to 4"], [8, "1 to 8"], [12, "1 to 12"], [16, "1 to 16"]], def: 8 },
    systemKey: { label: "Counting system", select: null, def: "ko" }
  };

  function rkNum(id, dflt) {
    var el = document.getElementById(id);
    var v = el ? Number(el.value) : dflt;
    return isFinite(v) && v > 0 ? v : dflt;
  }

  function rkSession() {
    return { bankroll: rkNum("rk-bankroll", 2000), hands: Math.round(rkNum("rk-hands", 300)),
             base: rkNum("rk-base", 50), cap: rkNum("rk-cap", 150) };
  }

  function rkParamsFor(key) {
    var sess = rkSession();
    var p = { base: sess.base, cap: Math.max(sess.cap, sess.base) };
    RK.strategy(key).params.forEach(function (name) {
      if (name === "base") return;
      var f = RK_FIELDS[name];
      p[name] = rkParams[name] !== undefined ? rkParams[name] : f.def;
    });
    // A cap below the base bet would build an empty ladder.
    if (p.cap !== undefined && p.cap < p.base) p.cap = p.base;
    return p;
  }

  function renderRiskPrimer() {
    var b = document.getElementById("risk-primer");
    b.className = "banner warn";
    b.innerHTML = "";
    b.appendChild(el("strong", null, "Only two of these move the house edge."));
    b.appendChild(el("p", "note",
      "Your table's rules move it, and counting moves it. A betting progression " +
      "does not: expected loss is linear in what you wager, so no staking pattern " +
      "touches it. At the same average bet a progression can only widen the swing, " +
      "which is why every strategy below is shown beside a flat bet at its own " +
      "average — the only comparison that means anything."));
  }

  function renderRiskControls() {
    var sel = document.getElementById("rk-strategy");
    if (!sel.options.length) {
      RK.STRATEGIES.forEach(function (st) {
        var o = el("option", null, st.name);
        o.value = st.key;
        sel.appendChild(o);
      });
      sel.value = "ladder";
      sel.onchange = function () { rkParams = {}; renderRiskControls(); };
      ["rk-bankroll", "rk-hands", "rk-base", "rk-cap"].forEach(function (id) {
        document.getElementById(id).addEventListener("change", function () {
          renderRiskControls();
          document.getElementById("rk-result").innerHTML = "";
        });
      });
      document.getElementById("rk-run").onclick = runRisk;
      document.getElementById("rk-compare").onclick = compareRisk;
    }

    var def = RK.strategy(sel.value);
    var spell = document.getElementById("rk-spell");
    spell.className = "banner";
    spell.innerHTML = "";
    spell.appendChild(el("p", null, def.spell));
    spell.appendChild(el("p", "note", def.why));

    var grid = document.getElementById("rk-params");
    grid.innerHTML = "";
    def.params.forEach(function (name) {
      if (name === "base") return;
      var f = RK_FIELDS[name];
      var row = el("div", "rule-row");
      var lab = el("label", null);
      lab.appendChild(document.createTextNode(f.label));
      if (f.hint) lab.appendChild(el("span", "hint", f.hint));
      row.appendChild(lab);

      var input, opts = f.select;
      if (name === "systemKey") {
        opts = RK.SYSTEMS.map(function (sy) { return [sy.key, sy.name]; });
      }
      if (opts) {
        input = el("select");
        opts.forEach(function (o) {
          var opt = el("option", null, o[1]);
          opt.value = String(o[0]);
          input.appendChild(opt);
        });
        input.value = String(rkParams[name] !== undefined ? rkParams[name] : f.def);
        input.onchange = function () {
          rkParams[name] = name === "systemKey" ? input.value : Number(input.value);
          renderRiskControls();
        };
      } else {
        input = el("input");
        input.type = "number";
        input.min = f.min;
        input.step = f.stepBy;
        input.value = String(rkParams[name] !== undefined ? rkParams[name] : f.def);
        input.onchange = function () { rkParams[name] = Number(input.value); renderRiskControls(); };
      }
      row.appendChild(input);
      grid.appendChild(row);
    });

    // Spell the counting system out in full — a system you cannot read is a
    // system you cannot check at the table.
    if (def.kind === "counting") {
      var sy = RK.system(rkParamsFor("count").systemKey);
      var card = el("div", "banner");
      card.appendChild(el("strong", null, sy.name));
      card.appendChild(el("p", "note", sy.blurb));
      var t = el("table", "chart");
      var h = el("tr"), r2 = el("tr");
      h.appendChild(el("th", "row-label", "card"));
      r2.appendChild(el("th", "row-label", "count"));
      [1, 2, 3, 4, 5, 6, 7, 8, 0, 9].forEach(function (rk) {
        h.appendChild(el("th", null, E.RANK_LABELS[rk]));
        var tag = sy.tags[rk];
        var td = el("td", "act " + (tag > 0 ? "act-hit" : tag < 0 ? "act-stand" : "act-surrender"),
                    tag === 0.5 ? "+½" : (tag > 0 ? "+" : "") + tag);
        r2.appendChild(td);
      });
      t.appendChild(h); t.appendChild(r2);
      var scroll = el("div", "chart-scroll");
      scroll.appendChild(t);
      card.appendChild(scroll);
      card.appendChild(el("p", "note", "Betting correlation " + sy.bc.toFixed(3) +
        " — how closely those tags track each card's real effect on the edge, " +
        "derived from the engine rather than quoted." +
        (sy.balanced
          ? " Balanced: divide the running count by the decks left to get a true count."
          : " Unbalanced: start the count at " + sy.irc(rules.decks) +
            " for " + rules.decks + " deck" + (rules.decks > 1 ? "s" : "") +
            " and bet straight off the running count — no division.")));
      grid.appendChild(card);
    }
  }

  /** Generating the stream is the expensive part, so it is cached per rule set. */
  function withStream(then) {
    var key = R.key(rules);
    if (rkStream && rkStreamKey === key) { then(rkStream); return; }
    var out = document.getElementById("rk-result");
    out.innerHTML = "";
    out.appendChild(banner("warn", "Dealing " + (RK_STREAM_HANDS / 1000) +
      "k hands to measure against…"));
    setTimeout(function () {
      rkStream = RK.outcomeStream(rules, RK_STREAM_HANDS, 20260829);
      rkStreamKey = key;
      then(rkStream);
    }, 30);
  }

  function betRange(strat) {
    var lv = strat.levels;
    var lo = lv[0], hi = lv[lv.length - 1];
    return lo === hi ? "$" + lo.toFixed(0) : "$" + lo.toFixed(0) + "–" + hi.toFixed(0);
  }

  function rkRow(label, r, isFlat, strat) {
    var tr = el("tr");
    tr.appendChild(el("th", "row-label", label));
    [[strat ? betRange(strat) : "—", "muted"],
     ["$" + r.avgBet.toFixed(0), ""],
     [r.vsFlat === undefined ? "—" : (r.vsFlat >= 0 ? "+" : "") + (r.vsFlat * 100).toFixed(1),
      r.vsFlat === undefined ? "muted" : r.vsFlat > 0.005 ? "good" : r.vsFlat < -0.005 ? "bad" : "muted"],
     [(r.ruin * 100).toFixed(2) + "%", r.ruin > 0.2 ? "bad" : r.ruin < 0.05 ? "good" : ""],
     [(r.ahead * 100).toFixed(1) + "%", r.ahead > 0.5 ? "good" : ""],
     ["$" + r.median.toFixed(0), ""],
     ["$" + r.p05.toFixed(0), ""],
     ["$" + r.p95.toFixed(0), ""]].forEach(function (c) {
      var td = el("td", "num " + c[1] + (isFlat ? " muted" : ""), c[0]);
      tr.appendChild(td);
    });
    return tr;
  }

  function rkTable(rows) {
    var t = el("table", "chart rk-table");
    var h = el("tr");
    ["", "bets", "avg bet", "vs flat", "ruin", "ahead", "median", "5th", "95th"].forEach(function (c, i) {
      h.appendChild(el("th", i === 0 ? "row-label" : null, c));
    });
    t.appendChild(h);
    rows.forEach(function (r) { t.appendChild(r); });
    var wrap = el("div", "chart-scroll");
    wrap.appendChild(t);
    return wrap;
  }

  function runRisk() {
    var key = document.getElementById("rk-strategy").value;
    withStream(function (stream) {
      var sess = rkSession();
      var opts = { bankroll: sess.bankroll, hands: sess.hands, sessions: 20000, seed: 777 };
      var p = rkParamsFor(key);
      var strat = RK.fromParams(key, p);
      var r = RK.runSessions(stream, strat, opts);
      var fr = RK.runSessions(stream, RK.flat(r.avgBet), opts);
      r.vsFlat = r.ahead - fr.ahead;
      var need = RK.bankrollFor(stream, strat, opts, 0.05);

      var out = document.getElementById("rk-result");
      out.innerHTML = "";
      out.appendChild(el("h3", null, "Over " + sess.hands + " hands, 20k sessions"));
      out.appendChild(rkTable([
        rkRow(RK.strategy(key).name, r, false, strat),
        rkRow("flat at $" + r.avgBet.toFixed(0), fr, true, RK.flat(r.avgBet))
      ]));

      var verdict, kind;
      if (RK.strategy(key).kind === "counting") {
        var top = strat.levels[strat.levels.length - 1];
        // An edge you cannot survive is not an edge. Counting only counts as
        // working if it beats flat by a real margin AND has not blown the
        // bankroll up doing it.
        var realGain = r.ahead - fr.ahead > 0.005;
        var survivable = r.ruin < 0.10 && r.ruin < fr.ruin * 1.8;
        if (realGain && survivable) {
          kind = "good";
          verdict = "Counting finishes ahead " + (r.ahead * 100).toFixed(1) + "% of sessions " +
            "against " + (fr.ahead * 100).toFixed(1) + "% for a flat bet of the same size. " +
            "That gap is a real edge, not a reshaped one — it is the only thing here that " +
            "earns money rather than moving it around.";
        } else {
          kind = "bad";
          // Size the top bet at about 1/20th of the bankroll, then actually
          // simulate that rather than asserting it.
          var spread = top / sess.base;
          var suggest = Math.max(5, Math.round(sess.bankroll / 20 / spread / 5) * 5);
          var sp = rkParamsFor(key);
          sp.base = suggest;
          var sug = RK.runSessions(stream, RK.fromParams(key, sp), opts);
          var sugFlat = RK.runSessions(stream, RK.flat(sug.avgBet), opts);
          verdict = "The edge is real but you are overbetting it. " +
            (spread === 8 || spread === 11 || spread === 18 ? "An " : "A ") + spread.toFixed(0) +
            "x spread off a $" + sess.base + " base tops out at $" + top.toFixed(0) +
            " a hand, and against a $" + sess.bankroll + " bankroll that ruins " +
            (r.ruin * 100).toFixed(1) + "% of sessions — which swamps the advantage. " +
            "A spread has to be sized to the bankroll, not the other way round. " +
            "At a $" + suggest + " base the same system ruins " +
            (sug.ruin * 100).toFixed(1) + "% and finishes ahead " +
            (sug.ahead * 100).toFixed(1) + "% against " + (sugFlat.ahead * 100).toFixed(1) +
            "% for a flat bet of the same size.";
        }
      } else if (r.ruin <= fr.ruin + 0.0005) {
        kind = "good";
        verdict = "This is flat betting, or close enough to it. Nothing here beats it on ruin.";
      } else {
        kind = "bad";
        verdict = "Ruin is " + (r.ruin * 100).toFixed(2) + "% against " +
          (fr.ruin * 100).toFixed(2) + "% for a flat bet at the same $" +
          r.avgBet.toFixed(0) + " average. This progression is not buying you safety — " +
          "it is raising your average bet from $" + sess.base + " to $" + r.avgBet.toFixed(0) +
          ", and a flat bet of that size would be safer.";
      }
      out.appendChild(banner(kind, verdict));
      out.appendChild(banner("", "To hold ruin at 5% over " + sess.hands +
        " hands you would need a bankroll of about $" + (Math.round(need / 50) * 50) + "."));
    });
  }

  function compareRisk() {
    withStream(function (stream) {
      var sess = rkSession();
      var opts = { bankroll: sess.bankroll, hands: sess.hands, sessions: 20000, seed: 777 };
      var cases = [
        ["flat", {}, "Flat"],
        ["ladder", {}, "Positive progression"],
        ["paroli", {}, "Paroli"],
        ["dalembert", {}, "d'Alembert"],
        ["martingale", {}, "Martingale"],
        ["count", { systemKey: "ko" }, "KO, 1–8"],
        ["count", { systemKey: "red7" }, "Red 7, 1–8"],
        ["count", { systemKey: "hilo" }, "Hi-Lo, 1–8"]
      ];
      var rows = [], results = [];
      cases.forEach(function (c) {
        var def = RK.strategy(c[0]);
        var p = { base: sess.base, cap: Math.max(sess.cap, sess.base) };
        def.params.forEach(function (n) {
          if (n === "base") return;
          p[n] = c[1][n] !== undefined ? c[1][n] : RK_FIELDS[n].def;
        });
        if (p.cap !== undefined && p.cap < p.base) p.cap = p.base;
        var st2 = RK.fromParams(c[0], p);
        // Name the spread the player actually gets. The cap can truncate a
        // 1-8 ramp to 1-3, and labelling it 1-8 would describe bets the table
        // will not take.
        var label = c[2];
        if (def.kind === "counting") {
          var mult = st2.levels[st2.levels.length - 1] / p.base;
          label = RK.system(p.systemKey).name.replace(/ \(.*\)/, "") +
                  ", 1–" + (Math.round(mult * 10) / 10);
        }
        var r = RK.runSessions(stream, st2, opts);
        var fr = RK.runSessions(stream, RK.flat(r.avgBet), opts);
        r.vsFlat = r.ahead - fr.ahead;
        results.push({ label: label, r: r, strat: st2, kind: def.kind });
        rows.push(rkRow(label, r, false, st2));
      });
      var out = document.getElementById("rk-result");
      out.innerHTML = "";
      out.appendChild(el("h3", null, "Every strategy, same hands, $" + sess.base + " base"));
      out.appendChild(rkTable(rows));
      out.appendChild(rkAssumptions(results, sess));
      out.appendChild(rkVerdict(results, sess, stream, opts));
    });
  }

  /**
   * Every input the comparison used.
   *
   * The strategy panel only ever shows the parameters of the ONE strategy you
   * have selected, so a comparison across all of them necessarily fills the
   * rest in from defaults. Printing them is the difference between a table you
   * can check and a table you have to trust.
   */
  function rkAssumptions(results, sess) {
    var counting = results.filter(function (x) { return x.kind === "counting"; });
    var nominal = RK_FIELDS.spread.def;
    var effective = counting.length
      ? counting[0].strat.levels[counting[0].strat.levels.length - 1] / sess.base : nominal;

    var box = el("div", "banner");
    box.appendChild(el("strong", null, "What this comparison assumed"));
    var ul = el("ul", "assume");
    [["Session", "$" + sess.bankroll + " bankroll, " + sess.hands + " hands, $" +
                 sess.base + " base bet, never more than $" + sess.cap + " on a hand."],
     ["Progressions", "$" + RK_FIELDS.step.def + " a step, which is the default — " +
                      "the panel above only shows the settings of the strategy you have selected."],
     ["Counting", "ramp starts at a count of +" + RK_FIELDS.threshold.def +
                  ", nominal spread 1–" + nominal +
                  (effective < nominal - 0.05
                    ? ", cut to 1–" + (Math.round(effective * 10) / 10) +
                      " by your $" + sess.cap + " ceiling."
                    : ".")]
    ].forEach(function (pair) {
      var li = el("li");
      li.appendChild(el("strong", null, pair[0] + ": "));
      li.appendChild(document.createTextNode(pair[1]));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    box.appendChild(el("p", "note",
      "Pick a strategy above and use Run simulation to change any of these."));
    return box;
  }

  /**
   * What the comparison actually showed. This used to be a fixed sentence
   * claiming the counting rows clear 50%, which is false whenever the bankroll
   * cannot carry the spread — the table then contradicted its own caption.
   */
  function rkVerdict(results, sess, stream, opts) {
    var counting = results.filter(function (x) { return x.kind === "counting"; });
    var beating = counting.filter(function (x) { return x.r.vsFlat > 0.005; });
    var topBet = 0;
    counting.forEach(function (x) {
      topBet = Math.max(topBet, x.strat.levels[x.strat.levels.length - 1]);
    });
    var share = topBet / sess.bankroll;

    if (beating.length) {
      var text = "Read the 'vs flat' column: it compares each row against a flat bet of " +
        "its own average size, which is the only fair comparison. The counting rows are " +
        "ahead of it, because they change the edge rather than just reshaping the outcome. ";
      // A negative progression can beat flat on "ahead" while being strictly
      // worse, because it wins small very often and loses everything rarely —
      // which is the shape "ahead" is blind to. Say so rather than claim every
      // progression sits at or below zero, which is not always true.
      var oddOnes = results.filter(function (x) {
        return x.kind !== "counting" && x.r.vsFlat > 0.005;
      });
      if (oddOnes.length) {
        var worst = oddOnes.slice().sort(function (a, b) { return b.r.ruin - a.r.ruin; })[0];
        text += "Do not read " + worst.label + "'s positive figure as an edge. A " +
          "progression that presses losses wins a little very often and loses " +
          "everything rarely, and 'ahead' cannot see the difference — look at its " +
          "ruin (" + (worst.r.ruin * 100).toFixed(1) + "% against " +
          (results[0].r.ruin * 100).toFixed(1) + "% for flat) and its 5th percentile " +
          "instead. Its expected loss is identical.";
      } else {
        text += "Every progression sits at or below zero there, and their ruin follows " +
          "their average bet and nothing else.";
      }
      return banner("warn", text);
    }

    var msg = "Nothing here beats a flat bet of its own size — the 'vs flat' column " +
      "is zero or negative for every row, counting included. ";
    var effSpread = topBet / sess.base;
    if (share > 0.2 || effSpread < 4) {
      msg += "That is a sizing problem, not a verdict on counting. ";
      if (effSpread < 4) {
        msg += "Your $" + sess.cap + " ceiling over a $" + sess.base + " base leaves a " +
          "spread of only 1–" + (Math.round(effSpread * 10) / 10) + ", and a counter's " +
          "whole edge is in betting far more when the shoe is good. ";
      }
      if (share > 0.2) {
        msg += "The top bet is $" + topBet.toFixed(0) + " against a $" + sess.bankroll +
          " bankroll — " + Math.round(share * 100) + "% of it on one hand — so you are " +
          "ruined before the count can pay. ";
      }
      // Two ways out, and the bankroll figure is measured rather than asserted:
      // keep the stake and bring more money, or keep the money and stake less.
      var best = counting.slice().sort(function (a, b) { return b.r.vsFlat - a.r.vsFlat; })[0];
      var need = best ? RK.bankrollFor(stream, best.strat, opts, 0.05) : 0;
      // A ramp needs roughly 1-15 to earn its keep inside a tight ceiling;
      // 1-10 measured no better than flat at this bankroll.
      var smaller = Math.max(5, Math.round(sess.cap / 15 / 5) * 5);
      msg += "Two ways out. Keep the $" + sess.base + " base and the $" + sess.cap +
        " ceiling but bring about $" + (Math.round(need / 250) * 250) +
        ", which is what holds ruin at 5% here. Or keep the $" + sess.bankroll +
        " and drop the base to about $" + smaller + ", which buys back the spread " +
        "inside the same ceiling.";
    } else {
      msg += "With " + sess.hands + " hands the result is mostly noise: the house edge " +
        "moves the total by a fraction of one bet while the swing is several bets, so " +
        "no strategy can separate itself. Lengthen the session to compare them.";
    }
    return banner("bad", msg);
  }

  /* ===== Counting trainer ===== */

  /**
   * Drills the running count against a real shoe.
   *
   * The shoe carries between rounds rather than resetting, because that is the
   * thing that is actually hard at a table: holding a number across hundreds of
   * cards while doing something else. A drill that restarts at zero every ten
   * cards trains the tags and not the task.
   */
  var ct = null, ctTimer = null;

  var CT_SPEEDS = [[0.75, "Slow — 0.75/s"], [1.5, "1.5 a second"],
                   [2, "Dealer pace — 2/s"], [3, "Fast — 3/s"], [4.5, "Brutal — 4.5/s"]];
  var CT_BATCHES = [5, 10, 20, 52];

  function ctCreate() {
    var sysKey = (document.getElementById("ct-system") || {}).value || "ko";
    var sys = RK.system(sysKey);
    return {
      sysKey: sysKey,
      shoe: E.freshShoe(rules.decks),
      rc: sys.irc(rules.decks),
      seen: [],
      phase: "idle",          // idle | dealing | asking | graded
      last: null,
      stats: { rounds: 0, correct: 0, drift: 0, cards: 0 }
    };
  }

  function ctSys() { return RK.system(ct.sysKey); }

  function ctStop() {
    if (ctTimer) { clearInterval(ctTimer); ctTimer = null; }
  }

  function ctDraw() {
    var rem = E.countCards(ct.shoe);
    if (rem <= 0) return -1;
    var x = Math.floor(Math.random() * rem);
    for (var r = 0; r < E.RANKS; r++) {
      x -= ct.shoe[r];
      if (x < 0) { ct.shoe[r]--; return r; }
    }
    return E.TEN;
  }

  function ctStart() {
    ctStop();
    var speed = Number(document.getElementById("ct-speed").value);
    var batch = Number(document.getElementById("ct-batch").value);
    ct.seen = [];
    ct.phase = "dealing";
    ct.last = null;
    var dealt = 0;
    renderCount();
    ctTimer = setInterval(function () {
      var r = ctDraw();
      if (r < 0) {                       // shoe exhausted mid-round
        ctStop();
        ct.phase = "asking";
        renderCount();
        return;
      }
      ct.rc += ctSys().tags[r];
      ct.stats.cards++;
      ct.seen.push({ rank: r, dress: dress(r) });
      dealt++;
      if (dealt >= batch) { ctStop(); ct.phase = "asking"; }
      renderCount();
    }, 1000 / speed);
  }

  function ctDecksLeft() { return E.countCards(ct.shoe) / 52; }
  function ctTrue() { return ct.rc / Math.max(0.5, ctDecksLeft()); }

  function ctGrade() {
    var rcGuess = Number(document.getElementById("ct-rc").value);
    var askTrue = document.getElementById("ct-truecount").checked && ctSys().balanced;
    var tcGuess = askTrue ? Number(document.getElementById("ct-tc").value) : null;
    var rcOk = rcGuess === ct.rc;
    var tcOk = !askTrue || Math.abs(tcGuess - ctTrue()) < 0.75;
    ct.stats.rounds++;
    if (rcOk && tcOk) ct.stats.correct++;
    ct.stats.drift += Math.abs(rcGuess - ct.rc);
    ct.last = { rcGuess: rcGuess, rcOk: rcOk, askTrue: askTrue, tcGuess: tcGuess, tcOk: tcOk,
                rc: ct.rc, tc: ctTrue(), decks: ctDecksLeft() };
    // Once you have seen the answer the count is no longer yours to keep, so a
    // wrong answer resyncs rather than compounding into every later round.
    ct.phase = "graded";
    renderCount();
  }

  function renderCountPrimer() {
    var b = document.getElementById("ct-primer");
    b.className = "banner warn";
    b.innerHTML = "";
    b.appendChild(el("strong", null, "Keep the running count."));
    b.appendChild(el("p", "note",
      "Cards come one at a time at the speed you pick. Add up the tags in your " +
      "head, and when it stops, type the total. The shoe keeps going between " +
      "rounds — the number it wants is the count since the last shuffle."));
  }

  function renderCountTags() {
    if (!ct) ct = ctCreate();
    var box = document.getElementById("ct-tags");
    box.innerHTML = "";
    var sy = ctSys();
    var card = el("div", "banner");
    card.appendChild(el("strong", null, sy.name));
    card.appendChild(el("p", "note", sy.blurb));
    var t = el("table", "chart"), h = el("tr"), r2 = el("tr");
    h.appendChild(el("th", "row-label", "card"));
    r2.appendChild(el("th", "row-label", "count"));
    [1, 2, 3, 4, 5, 6, 7, 8, 0, 9].forEach(function (rk) {
      h.appendChild(el("th", null, E.RANK_LABELS[rk]));
      var tag = sy.tags[rk];
      r2.appendChild(el("td", "act " + (tag > 0 ? "act-hit" : tag < 0 ? "act-stand" : "act-surrender"),
        tag === 0.5 ? "+½" : (tag > 0 ? "+" : "") + tag));
    });
    t.appendChild(h); t.appendChild(r2);
    var sc = el("div", "chart-scroll"); sc.appendChild(t); card.appendChild(sc);
    if (sy.howto) {
      var ol = el("ol", "howto");
      sy.howto(rules.decks).forEach(function (step) { ol.appendChild(el("li", null, step)); });
      card.appendChild(ol);
    }
    card.appendChild(el("p", "note", sy.balanced
      ? "Balanced, so the running count must be divided by the decks remaining before it means anything."
      : "Unbalanced, so the running count is read as it stands — no division."));
    box.appendChild(card);
  }

  function renderCount() {
    if (!ct) ct = ctCreate();
    var cur = document.getElementById("ct-current");
    var seen = document.getElementById("ct-seen");
    cur.innerHTML = ""; seen.innerHTML = "";

    var last = ct.seen[ct.seen.length - 1];
    if (ct.phase === "dealing" && last) {
      var wrap = el("div");
      wrap.appendChild(cardEl(last.rank, { suit: last.dress.suit, face: last.dress.face }));
      cur.appendChild(wrap);
    } else if (ct.phase === "idle") {
      cur.appendChild(el("span", "note", "Press Deal to start a round."));
    } else {
      cur.appendChild(el("span", "note", ct.seen.length + " cards this round."));
    }

    // The cards just dealt, shown only once the round is over.
    if (ct.phase !== "dealing") {
      ct.seen.forEach(function (c) {
        seen.appendChild(cardEl(c.rank, { suit: c.dress.suit, face: c.dress.face, small: true }));
      });
    }

    document.getElementById("ct-status").textContent =
      ct.phase === "dealing" ? "Watch…" : ct.phase === "asking" ? "What is the count?" :
      ct.phase === "graded" ? "Round " + ct.stats.rounds : "Ready";
    document.getElementById("ct-shoe").textContent =
      ctDecksLeft().toFixed(1) + " decks left · count started at " + ctSys().irc(rules.decks);

    renderCountActions();
    renderCountAnswer();
    renderCountStats();
  }

  function renderCountActions() {
    var box = document.getElementById("ct-actions");
    box.innerHTML = "";

    if (ct.phase === "dealing") {
      var stop = el("button", null, "Stop and answer");
      stop.onclick = function () { ctStop(); ct.phase = "asking"; renderCount(); };
      box.appendChild(stop);
    } else if (ct.phase !== "asking") {   // the answer form carries its own button
      var deal = el("button", "primary", ct.stats.rounds ? "Next round" : "Deal");
      deal.onclick = ctStart;
      box.appendChild(deal);
    }

    // Always offered, whatever the round is doing. Losing the count is the
    // commonest reason to want it, and that happens mid-round.
    var sy = ctSys();
    var reset = el("button", null, "Reset shoe");
    reset.title = "New shoe, count back to " + sy.irc(rules.decks) +
                  ". Your score so far is kept.";
    reset.onclick = function () {
      ctStop();
      var keep = ct.stats;
      ct = ctCreate();
      ct.stats = keep;                    // the drill record survives a reshuffle
      renderCount();
    };
    box.appendChild(reset);

    if (ct.stats.rounds || ct.stats.cards) {
      var clear = el("button", null, "Clear score");
      clear.onclick = function () { ctStop(); ct = ctCreate(); renderCount(); };
      box.appendChild(clear);
    }
  }

  function renderCountAnswer() {
    var box = document.getElementById("ct-answer");
    box.innerHTML = "";

    if (ct.phase === "asking") {
      var askTrue = document.getElementById("ct-truecount").checked && ctSys().balanced;
      var row = el("div", "ct-answer-row");
      var lab = el("label", null, "Running count");
      lab.setAttribute("for", "ct-rc");
      var inp = el("input"); inp.type = "number"; inp.id = "ct-rc"; inp.value = "";
      row.appendChild(lab); row.appendChild(inp);
      box.appendChild(row);

      if (askTrue) {
        var row2 = el("div", "ct-answer-row");
        var lab2 = el("label", null, "True count (" + ctDecksLeft().toFixed(1) + " decks left)");
        lab2.setAttribute("for", "ct-tc");
        var inp2 = el("input"); inp2.type = "number"; inp2.step = "0.5"; inp2.id = "ct-tc";
        row2.appendChild(lab2); row2.appendChild(inp2);
        box.appendChild(row2);
      }
      var br = el("div", "btn-row");
      var check = el("button", "primary", "Check");
      check.onclick = ctGrade;
      br.appendChild(check);
      box.appendChild(br);
      inp.focus();
      inp.onkeydown = function (e) { if (e.key === "Enter" && !askTrue) ctGrade(); };
      return;
    }

    if (ct.phase === "graded" && ct.last) {
      var L = ct.last;
      var ok = L.rcOk && L.tcOk;
      var msg = L.rcOk
        ? "✓ Running count " + L.rc + "."
        : "✗ You said " + L.rcGuess + "; it was " + L.rc +
          " (off by " + Math.abs(L.rcGuess - L.rc) + ").";
      if (L.askTrue) {
        msg += L.tcOk
          ? "  True count " + L.tc.toFixed(1) + " — near enough."
          : "  True count was " + L.tc.toFixed(1) + " over " + L.decks.toFixed(1) +
            " decks, you said " + L.tcGuess + ".";
      } else if (ctSys().balanced) {
        msg += "  That is a true count of " + L.tc.toFixed(1) + " over " +
               L.decks.toFixed(1) + " decks.";
      }
      box.appendChild(banner(ok ? "good" : "bad", msg));
    }
  }

  function renderCountStats() {
    var box = document.getElementById("ct-stats");
    box.innerHTML = "";
    var st = ct.stats;
    if (!st.rounds && !st.cards) return;
    var acc = st.rounds ? st.correct / st.rounds : 0;
    [["Rounds", String(st.rounds), ""],
     ["Correct", st.rounds ? pct(acc, 0) : "—", st.correct + " of " + st.rounds,
      st.rounds && acc === 1 ? "good" : acc < 0.6 && st.rounds > 2 ? "bad" : ""],
     ["Average miss", st.rounds ? (st.drift / st.rounds).toFixed(1) : "—", "counts off per round"],
     ["Cards seen", String(st.cards), ""]
    ].forEach(function (p) {
      var s = el("div", "stat");
      s.appendChild(el("div", "k", p[0]));
      s.appendChild(el("div", "v" + (p[3] ? " " + p[3] : ""), p[1]));
      if (p[2]) s.appendChild(el("div", "sub", p[2]));
      box.appendChild(s);
    });
  }

  function initCount() {
    var sel = document.getElementById("ct-system");
    RK.SYSTEMS.forEach(function (sy) {
      var o = el("option", null, sy.name);
      o.value = sy.key;
      sel.appendChild(o);
    });
    sel.value = "ko";
    sel.onchange = function () { ctStop(); ct = ctCreate(); renderCountTags(); renderCount(); };

    var sp = document.getElementById("ct-speed");
    CT_SPEEDS.forEach(function (p) {
      var o = el("option", null, p[1]); o.value = String(p[0]); sp.appendChild(o);
    });
    sp.value = "2";

    var ba = document.getElementById("ct-batch");
    CT_BATCHES.forEach(function (n) {
      var o = el("option", null, n === 52 ? "52 — a whole deck" : String(n));
      o.value = String(n); ba.appendChild(o);
    });
    ba.value = "10";

    document.getElementById("ct-truecount").onchange = function () { renderCount(); };
  }

  /* ===== Boot ===== */

  function init() {
    initTabs();
    renderRules();
    renderEdge();
    initAnalyzer();
    initCount();
    resetAnalyzer();
    resetPlay();
    rkStream = null;
    if (location.hash) {
      var t = location.hash.slice(1);
      if (document.getElementById(t)) show(t);
    }
  }

  init();
})();
