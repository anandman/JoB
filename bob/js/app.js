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
    [["Hands", String(st.hands)],
     ["Correct", st.decisions ? pct(acc, 0) + " (" + st.correct + "/" + st.decisions + ")" : "—"],
     ["Errors cost", st.decisions ? "−" + st.cost.toFixed(3) : "—"]].forEach(function (p) {
      var s = el("div", "stat");
      s.appendChild(el("div", "k", p[0]));
      s.appendChild(el("div", "v", p[1]));
      box.appendChild(s);
    });
  }

  /* ===== Boot ===== */

  function init() {
    initTabs();
    renderRules();
    renderEdge();
    initAnalyzer();
    resetAnalyzer();
    resetPlay();
    if (location.hash) {
      var t = location.hash.slice(1);
      if (document.getElementById(t)) show(t);
    }
  }

  init();
})();
