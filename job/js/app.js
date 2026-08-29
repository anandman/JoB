/**
 * Jacks or Bettorment — App logic
 */

(function () {
  "use strict";

  // --- DOM refs ---
  var variantSelect = document.getElementById("variant-select");
  var strategyVariantSelect = document.getElementById("strategy-variant-select");
  var payTableBody = document.getElementById("pay-table-body");
  var returnValue = document.getElementById("return-value");
  var strategyList = document.getElementById("strategy-list");
  var strategySections = document.getElementById("strategy-sections");
  var strategyIntro = document.getElementById("strategy-intro");
  var strategyMeta = document.getElementById("strategy-meta");
  var navLinks = document.querySelectorAll(".nav-link");
  var tabContents = document.querySelectorAll(".tab-content");
  var toggleBtns = document.querySelectorAll(".toggle-btn");

  // --- State ---
  var currentVariant = "job-9-6";
  var currentMode = "simple";

  // --- Tab navigation ---
  function showTab(tab) {
    var target = document.getElementById(tab);
    if (!target) return false;
    navLinks.forEach(function (l) {
      l.classList.toggle("active", l.getAttribute("data-tab") === tab);
    });
    tabContents.forEach(function (t) { t.classList.remove("active"); });
    target.classList.add("active");
    return true;
  }

  navLinks.forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      var tab = this.getAttribute("data-tab");
      if (showTab(tab)) history.replaceState(null, "", "#" + tab);
    });
  });

  // Deep links: manifest shortcuts and bookmarks land on a specific tab.
  function tabFromHash() {
    var tab = (location.hash || "").replace(/^#/, "");
    if (tab) showTab(tab);
  }
  window.addEventListener("hashchange", tabFromHash);

  // --- Pay table rendering ---
  function renderPayTable(gameKey) {
    var game = GAMES[gameKey];
    if (!game) return;

    payTableBody.innerHTML = "";
    returnValue.textContent = game.ret.toFixed(2) + "%";

    game.hands.forEach(function (h) {
      var tr = document.createElement("tr");

      var tdName = document.createElement("td");
      tdName.textContent = h.name;
      tr.appendChild(tdName);

      for (var c = 1; c <= 4; c++) {
        var td = document.createElement("td");
        td.textContent = (h.pay * c).toLocaleString();
        tr.appendChild(td);
      }

      // The royal is the reason to play max coins; flag the jump.
      var td5 = document.createElement("td");
      td5.className = "max-bet";
      td5.textContent = (h.maxPay * 5).toLocaleString();
      if (h.maxPay !== h.pay) td5.classList.add("bonus");
      tr.appendChild(td5);

      var tdOdds = document.createElement("td");
      tdOdds.className = "odds";
      tdOdds.textContent = typeof h.freq === "number" && h.freq > 0
        ? "1 in " + fmtInt(1 / h.freq)
        : "—";
      tr.appendChild(tdOdds);

      payTableBody.appendChild(tr);
    });

    renderGameStats(game);
  }

  function renderGameStats(game) {
    var box = document.getElementById("game-stats");
    var st = Promo.stats(game);
    box.innerHTML = "";
    box.appendChild(statCard("House edge", ((1 - st.ret) * 100).toFixed(2) + "%",
      "per dollar of coin-in"));
    if (!st.known) return;
    box.appendChild(statCard("Variance", st.variance.toFixed(1),
      "SD " + st.sd.toFixed(2) + " bets/hand"));
    var royal = game.hands[0];
    box.appendChild(statCard("Royal", "1 in " + fmtInt(1 / royal.freq),
      "worth " + (royal.maxPay * royal.freq * 100).toFixed(2) + "% of return"));
    var noRoyal = st.ret - royal.freq * royal.maxPay;
    box.appendChild(statCard("Without a royal", (noRoyal * 100).toFixed(2) + "%",
      "what most sessions actually return", "warn"));
  }

  function renderGameCompare() {
    var body = document.getElementById("game-compare");
    body.innerHTML = "";
    Object.keys(GAMES).forEach(function (k) {
      var g = GAMES[k], st = Promo.stats(g);
      var tr = document.createElement("tr");
      if (k === currentVariant) tr.className = "current";
      function td(text) {
        var c = document.createElement("td");
        c.textContent = text;
        return c;
      }
      var label = document.createElement("td");
      label.className = "game-name";
      label.textContent = g.name + " " + g.label;
      tr.appendChild(label);
      tr.appendChild(td(g.ret.toFixed(2) + "%"));
      tr.appendChild(td((100 - g.ret).toFixed(2) + "%"));
      tr.appendChild(td(st.known ? st.variance.toFixed(1) : "—"));
      tr.appendChild(td(st.known ? "1 in " + fmtInt(1 / g.hands[0].freq) : "—"));
      body.appendChild(tr);
    });
  }

  // --- Selectors ---
  // The pay table tab covers every game; the strategy tab still only covers
  // the Jacks or Better family, so the two only sync when they overlap.
  var JOB_VARIANT_OF = { "job-9-6": "9-6", "job-9-5": "9-5", "job-8-6": "8-6", "job-8-5": "8-5" };
  function strategyKindOf(gameKey) {
    if (JOB_VARIANT_OF[gameKey]) return "job";
    if (DW_GAMES.indexOf(gameKey) !== -1) return "dw";
    if (gameKey.indexOf("bp-") === 0) return "bp";
    if (gameKey.indexOf("ddb-") === 0) return "ddb";
    return null;
  }

  function setVariant(gameKey) {
    currentVariant = gameKey;
    variantSelect.value = gameKey;
    renderPayTable(currentVariant);
    renderGameCompare();
    if (strategyKindOf(gameKey)) {
      strategyVariantSelect.value = gameKey;
      renderStrategy(gameKey, currentMode);
    }
  }

  variantSelect.addEventListener("change", function () {
    setVariant(this.value);
  });

  strategyVariantSelect.addEventListener("change", function () {
    setVariant(this.value);
  });

  // --- Strategy toggle ---
  toggleBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var mode = this.getAttribute("data-mode");
      if (mode === currentMode) return;
      currentMode = mode;
      toggleBtns.forEach(function (b) { b.classList.remove("active"); });
      this.classList.add("active");
      renderStrategy(currentVariant, currentMode);
    });
  });

  function formatEV(v) {
    return v >= 10 ? v.toFixed(0) : v.toFixed(2);
  }

  // --- Strategy rendering ---
  function renderStrategy(gameKey, mode) {
    var kind = strategyKindOf(gameKey);
    strategyList.innerHTML = "";
    strategySections.innerHTML = "";
    if (kind === "dw") return renderDeucesStrategy(gameKey);
    if (kind === "bp" || kind === "ddb") return renderBonusStrategy(gameKey, kind, mode);

    // Jacks or Better: one ordered list, Simple/Optimal toggle applies.
    document.querySelector(".strategy-toggle").style.display = "";
    strategyIntro.innerHTML = "Hold the <strong>first</strong> match from the top. Discard the rest.";
    return renderJobStrategy(JOB_VARIANT_OF[gameKey], mode);
  }

  /**
   * Deuces Wild: five independent lists, one per deuce count. Lines stay in
   * published order rather than EV order — the published categories overlap.
   */
  function renderDeucesStrategy(gameKey) {
    var game = GAMES[gameKey];
    document.querySelector(".strategy-toggle").style.display = "none";
    strategyIntro.innerHTML = "Count your deuces first, then hold the <strong>first</strong> match in that section.";
    strategyMeta.textContent = "Representative hands, no penalty cards — EVs are per coin at max bet";

    var strat = StrategyEngine.generateDeucesStrategy(game.hands.map(function (h) { return h.maxPay; }));
    strat.sections.forEach(function (sec) {
      var h = document.createElement("h4");
      h.className = "dw-section-title";
      h.textContent = sec.label;
      strategySections.appendChild(h);

      var ol = document.createElement("ol");
      ol.className = "strategy-list";
      sec.lines.forEach(function (line) {
        var li = document.createElement("li");
        var hold = document.createElement("span");
        hold.className = "strategy-hold";
        hold.textContent = line.hold;
        li.appendChild(hold);
        var ev = document.createElement("span");
        ev.className = "strategy-ev";
        ev.textContent = formatEV(line.ev);
        li.appendChild(ev);
        li.classList.add({ pat: "tier-pat-high", made: "tier-strong", draw: "tier-draw",
                           spec: "tier-speculative" }[line.tier] || "tier-speculative");
        ol.appendChild(li);
      });
      strategySections.appendChild(ol);
    });
  }

  /**
   * Bonus Poker and Double Double Bonus. Bonus Poker reuses the Jacks or
   * Better categories under its own payouts and sorts by EV, so it adapts to
   * any Bonus Poker pay table. Double Double Bonus keeps its published order.
   */
  function renderBonusStrategy(gameKey, kind, mode) {
    var game = GAMES[gameKey];
    var payouts = game.hands.map(function (h) { return h.maxPay; });
    document.querySelector(".strategy-toggle").style.display = "none";
    strategyIntro.innerHTML = "Hold the <strong>first</strong> match from the top. Discard the rest.";

    var strat;
    if (kind === "bp") {
      // Same hold shapes as Jacks or Better, so the same simpleGroup merge
      // yields a simple card here too — only the payouts and evaluator differ.
      document.querySelector(".strategy-toggle").style.display = "";
      strategyMeta.textContent = mode === "simple"
        ? "Merged from the full list — EV ranges show the spread inside each line"
        : "Derived by expected value from this pay table — penalty cards not included";
      var family = StrategyEngine.generateFamilyStrategy(
        "bp:" + gameKey, STRATEGY_CATEGORIES, payouts, Poker.evaluateBonusPoker);
      strat = { optimal: mode === "simple" ? family.simple : family.optimal };
    } else {
      strategyMeta.textContent = "Published order, EVs computed from this pay table";
      strat = StrategyEngine.generateListedStrategy(
        "ddb:" + gameKey, DDB_STRATEGY_CATEGORIES, payouts, Poker.evaluateDoubleDoubleBonus);
    }

    strat.optimal.forEach(function (entry) {
      var li = document.createElement("li");
      var hold = document.createElement("span");
      hold.className = "strategy-hold";
      hold.textContent = entry.hold;
      li.appendChild(hold);
      if (entry.note) {
        var noteSpan = document.createElement("span");
        noteSpan.className = "strategy-note-inline";
        noteSpan.textContent = entry.note;
        li.appendChild(noteSpan);
      }
      var ev = document.createElement("span");
      ev.className = "strategy-ev";
      if (entry.evs) {
        var lo = entry.evs[entry.evs.length - 1], hi = entry.evs[0];
        ev.textContent = formatEV(lo) === formatEV(hi)
          ? formatEV(hi) : formatEV(lo) + "\u2013" + formatEV(hi);
      } else {
        ev.textContent = formatEV(entry.ev);
      }
      li.appendChild(ev);
      li.classList.add({ pat: "tier-pat-high", made: "tier-strong", draw: "tier-draw",
                         spec: "tier-speculative" }[entry.tier] || "tier-speculative");
      strategyList.appendChild(li);
    });
  }

  function renderJobStrategy(variantKey, mode) {
    var variant = PAY_TABLES[variantKey];
    if (!variant) return;

    // Update meta text
    if (mode === "simple") {
      strategyMeta.textContent = "0.05\u20130.08% cost vs. optimal play (measured)";
    } else {
      strategyMeta.textContent = "Penalty cards not included (~0.01% effect)";
    }

    // Compute strategy
    var strat = StrategyEngine.generateStrategy(variant.payouts);
    var entries = mode === "simple" ? strat.simple : strat.optimal;

    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var li = document.createElement("li");

      var holdSpan = document.createElement("span");
      holdSpan.className = "strategy-hold";
      holdSpan.textContent = entry.hold;
      li.appendChild(holdSpan);

      if (entry.note) {
        var noteSpan = document.createElement("span");
        noteSpan.className = "strategy-note-inline";
        noteSpan.textContent = entry.note;
        li.appendChild(noteSpan);
      }

      // EV display
      if (entry.ev != null) {
        var evSpan = document.createElement("span");
        evSpan.className = "strategy-ev";
        evSpan.textContent = formatEV(entry.ev);
        li.appendChild(evSpan);
      } else if (entry.evs) {
        var evSpan = document.createElement("span");
        evSpan.className = "strategy-ev";
        var lo = entry.evs[entry.evs.length - 1];
        var hi = entry.evs[0];
        if (formatEV(lo) === formatEV(hi)) {
          evSpan.textContent = formatEV(hi);
        } else {
          evSpan.textContent = formatEV(lo) + "\u2013" + formatEV(hi);
        }
        li.appendChild(evSpan);
      }

      // Color-code by tier
      var tierClass = {
        pat: "tier-pat-high",
        made: "tier-strong",
        draw: "tier-draw",
        spec: "tier-speculative",
      }[entry.tier] || "tier-speculative";
      li.classList.add(tierClass);

      strategyList.appendChild(li);
    }
  }


  /* ---------- Promo / W-2G / casinos ---------- */

  var promoEls = {
    game: document.getElementById("promo-game"),
    denom: document.getElementById("promo-denom"),
    lines: document.getElementById("promo-lines"),
    coins: document.getElementById("promo-coins"),
    bet: document.getElementById("promo-bet"),
    bankroll: document.getElementById("promo-bankroll"),
    cap: document.getElementById("promo-cap"),
    mult: document.getElementById("promo-mult"),
    rate: document.getElementById("promo-rate"),
    hph: document.getElementById("promo-hph"),
    stats: document.getElementById("promo-stats"),
    w2g: document.getElementById("promo-w2g"),
    ladder: document.getElementById("promo-ladder"),
    threshold: document.getElementById("promo-threshold"),
    ceiling: document.getElementById("promo-ceiling"),
    casinoDenom: document.getElementById("casino-denom"),
    casinoGame: document.getElementById("casino-game-filter"),
    casinoList: document.getElementById("casino-list"),
  };

  function fmtMoney(v, dp) {
    // Sub-dollar bets need cents; everything else reads better rounded.
    if (dp == null) dp = Math.abs(v) > 0 && Math.abs(v) < 10 && v % 1 !== 0 ? 2 : 0;
    return "$" + v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
  }
  function fmtDenom(d) { return d < 1 ? Math.round(d * 100) + "¢" : "$" + d; }
  function fmtInt(v) { return Math.round(v).toLocaleString(); }
  function fmtPct(v, dp) {
    if (dp == null) dp = Math.abs(v) < 0.1 ? 2 : 1;
    return (v * 100).toFixed(dp) + "%";
  }

  function statCard(label, value, sub, cls) {
    var div = document.createElement("div");
    div.className = "stat-card" + (cls ? " " + cls : "");
    var l = document.createElement("span");
    l.className = "stat-label";
    l.textContent = label;
    var v = document.createElement("span");
    v.className = "stat-value";
    v.textContent = value;
    div.appendChild(l);
    div.appendChild(v);
    if (sub) {
      var sEl = document.createElement("span");
      sEl.className = "stat-sub";
      sEl.textContent = sub;
      div.appendChild(sEl);
    }
    return div;
  }

  function currentPromoOpts() {
    return {
      game: GAMES[promoEls.game.value],
      denom: parseFloat(promoEls.denom.value),
      coins: Math.max(1, parseInt(promoEls.coins.value, 10) || MAX_COINS),
      tcCap: Math.max(1, parseFloat(promoEls.cap.value) || 1),
      multiplier: Math.max(1, parseFloat(promoEls.mult.value) || 1),
      coinInPerTc: Math.max(0.01, parseFloat(promoEls.rate.value) || 1),
      handsPerHour: Math.max(1, parseFloat(promoEls.hph.value) || 1),
      threshold: Math.max(1, parseFloat(promoEls.threshold.value) || W2G_THRESHOLD),
      lines: Math.max(1, parseInt(promoEls.lines.value, 10) || 1),
      bankroll: Math.max(0, parseFloat(promoEls.bankroll.value) || 0),
    };
  }

  /**
   * Banks of a game that carry a given denomination, cheapest earn rate first.
   * A bank with no stated rate is treated as the standard rate, not as unknown.
   */
  function banksAt(game, denom) {
    var std = parseFloat(promoEls.rate.value) || 10;
    return (game.banks || []).filter(function (b) {
      return b.denoms.indexOf(denom) !== -1;
    }).sort(function (a, b) {
      return (a.perPoint || std) - (b.perPoint || std);
    });
  }

  /**
   * Match a scraped payout schedule to a game with verified frequencies.
   * vpfree2 lists schedules low hand to high; GAMES stores them high to low,
   * so one gets reversed before comparing. Returns null when we have no
   * frequency data for that pay table — thresholds still work, rates don't.
   */
  var knownGameCache = {};
  function knownGameFor(payouts) {
    var key = payouts.join("-");
    if (key in knownGameCache) return knownGameCache[key];
    var reversed = payouts.slice().reverse();
    var found = null;
    Object.keys(GAMES).forEach(function (k) {
      if (found) return;
      var g = GAMES[k];
      if (!Promo.hasFrequencies(g) || g.hands.length !== reversed.length) return;
      for (var i = 0; i < reversed.length; i++) {
        if (g.hands[i].maxPay !== reversed[i]) return;
      }
      found = g;
    });
    knownGameCache[key] = found;
    return found;
  }

  /**
   * Handpay exposure for one bank. At the selected denomination, name what
   * crosses the line and how often. Otherwise report the largest denomination
   * this bank offers that still stays clean — which is the useful answer when
   * you're deciding what to sit down at.
   */
  function bankW2gLine(game, bank, denom, threshold, bankHas) {
    var el = document.createElement("p");
    el.className = "casino-w2g";

    if (bankHas) {
      var w = Promo.w2gForPayouts(game.payouts, game.hands, denom, MAX_COINS, threshold);
      if (!w.triggers.length) {
        el.className += " ok";
        el.textContent = "No handpay at " + fmtDenom(denom) +
          " — top hand pays " + fmtMoney(w.largestSafe) + ".";
        return el;
      }
      var names = w.triggers.map(function (t) { return t.name + " " + fmtMoney(t.amount); });
      // Rates need verified frequencies; thresholds never do.
      var known = knownGameFor(game.payouts);
      var rate = known ? Promo.w2gAnalysis(known, denom, MAX_COINS, threshold).oneIn : null;
      var common = w.triggers.some(function (t) { return /4 of a kind|^4 [25AJQK]/i.test(t.name); });
      el.className += common ? " danger" : " warn";
      el.textContent = "Handpay at " + fmtDenom(denom) + ": " + names.join(", ") +
        (rate ? " — 1 in " + fmtInt(rate) + " hands" : "");
      return el;
    }

    // Not offered at the selected denomination: what is clean here?
    var clean = null;
    for (var i = 0; i < bank.denoms.length; i++) {
      var wi = Promo.w2gForPayouts(game.payouts, game.hands, bank.denoms[i], MAX_COINS, threshold);
      if (!wi.triggers.length) clean = bank.denoms[i];
    }
    el.className += " muted";
    el.textContent = clean === null
      ? "Every denomination here can produce a handpay."
      : "Clean up to " + fmtDenom(clean) + " on this bank.";
    return el;
  }

  /** Short description of what triggers a handpay, for compact rows. */
  function w2gSummary(w2g) {
    var nonRoyal = w2g.triggers.filter(function (t) {
      return t.name.indexOf("Royal") === -1;
    });
    if (!nonRoyal.length) return "Royal only";
    var names = nonRoyal.map(function (t) { return t.name; });
    if (names.length <= 2) return names.join(", ");
    return names[0] + ", " + names[1] + " +" + (names.length - 2) + " more";
  }

  function renderPromo() {
    var opts = currentPromoOpts();
    if (!opts.game) return;
    var plan = Promo.plan(opts);

    promoEls.bet.textContent = fmtMoney(plan.bet) +
      "  (" + fmtDenom(opts.denom) + " × " + opts.coins + " × " + opts.lines + ")";
    promoEls.bet.className = opts.coins < MAX_COINS ? "short-bet" : "";

    // --- Summary cards ---
    promoEls.stats.innerHTML = "";
    promoEls.stats.appendChild(statCard("Coin-in needed", fmtMoney(plan.coinIn),
      fmtInt(plan.baseTc) + " base TC × " + fmtMoney(opts.coinInPerTc)));
    promoEls.stats.appendChild(statCard("Hands", fmtInt(plan.hands),
      "at " + fmtMoney(plan.bet) + " per hand" + (plan.lines > 1 ? " (" + plan.lines + " lines)" : "")));
    promoEls.stats.appendChild(statCard("Time", plan.hours.toFixed(1) + " hr",
      "at " + fmtInt(opts.handsPerHour) + " hands/hr"));
    promoEls.stats.appendChild(statCard("Expected cost", fmtMoney(plan.expectedCost),
      fmtPct(1 - plan.ret) + " of coin-in", opts.coins < MAX_COINS ? "warn" : ""));
    if (opts.coins < MAX_COINS) {
      promoEls.stats.appendChild(statCard("Short bet", "−1.36%",
        "the royal drops from 800 to 250 a coin", "danger"));
    }
    if (plan.noRoyalCost !== null) {
      promoEls.stats.appendChild(statCard("Typical cost", fmtMoney(plan.noRoyalCost),
        "if no royal (" + fmtPct(1 - plan.royalChance) + " likely)", "warn"));
    }
    if (plan.swing !== null) {
      promoEls.stats.appendChild(statCard("Swing (1σ)", fmtMoney(plan.swing),
        plan.lines > 1
          ? "SD " + plan.linesVariance.sd.toFixed(2) + "/hand at " + plan.lines + " lines"
          : "SD " + plan.linesVariance.sd.toFixed(2) + " per hand"));
    }
    if (plan.ruin !== null) {
      // Chance of touching zero at any point, not just finishing down.
      var ruinCls = plan.ruin >= 0.2 ? "danger" : plan.ruin >= 0.05 ? "warn" : "";
      promoEls.stats.appendChild(statCard("Risk of ruin", fmtPct(plan.ruin),
        "going broke on " + fmtMoney(opts.bankroll) + " before finishing", ruinCls));
    }
    if (plan.bankroll !== null) {
      // Covers the downswing; ruin below asks whether you survive the path there.
      promoEls.stats.appendChild(statCard("Bankroll (2σ)", fmtMoney(plan.bankroll),
        "expected cost plus two standard deviations"));
    }
    if (plan.bankrollFor5 !== null) {
      promoEls.stats.appendChild(statCard("Bankroll for 5%", fmtMoney(plan.bankrollFor5),
        fmtMoney(plan.bankrollFor1) + " to hold it at 1%"));
    }
    if (plan.linesVariance && plan.linesVariance.estimated && plan.lines > 1) {
      promoEls.stats.appendChild(statCard("Note", "estimated",
        "no measured n-play variance for this game", "warn"));
    }

    // --- W-2G detail ---
    promoEls.w2g.innerHTML = "";
    var w2g = plan.w2g;
    var box = document.createElement("div");
    box.className = "w2g-box";

    var head = document.createElement("p");
    head.className = "w2g-head";
    if (plan.expectedW2g === null) {
      head.textContent = w2g.triggers.length + " hand" +
        (w2g.triggers.length === 1 ? "" : "s") + " pay " +
        fmtMoney(opts.threshold) + " or more at " + fmtDenom(opts.denom) + ".";
    } else if (w2g.rate === 0) {
      head.className += " ok";
      head.textContent = "No single line reaches " + fmtMoney(opts.threshold) +
        " at " + fmtDenom(opts.denom) + " — top hand pays " + fmtMoney(w2g.largestSafe) + ".";
    } else {
      head.textContent = "A handpay every " + fmtInt(w2g.oneIn) + " hands — " +
        plan.expectedW2g.toFixed(2) + " expected over the promo (" +
        fmtPct(plan.w2gChance) + " chance of at least one).";
      head.className += plan.expectedW2g >= 1 ? " danger" : " ok";
    }
    box.appendChild(head);

    var ul = document.createElement("ul");
    ul.className = "w2g-list";
    w2g.triggers.forEach(function (t) {
      var li = document.createElement("li");
      li.className = "trigger";
      li.innerHTML = "<span>" + t.name + "</span><span>" + fmtMoney(t.amount) + "</span>";
      ul.appendChild(li);
    });
    if (w2g.largestSafe !== null) {
      var li2 = document.createElement("li");
      li2.className = "safe";
      li2.innerHTML = "<span>Largest hand below the line</span><span>" +
        fmtMoney(w2g.largestSafe) + "</span>";
      ul.appendChild(li2);
    }
    box.appendChild(ul);

    // On an n-play machine the hold is copied to every line, so a hand that is
    // already made when dealt pays on all of them at once. That aggregate is
    // what crosses the reporting line, and it does so far below the
    // denomination a single line would need.
    if (opts.lines > 1) {
      var multi = document.createElement("p");
      multi.className = "casino-w2g warn";
      var dealt = [];
      opts.game.hands.forEach(function (hand) {
        var amount = Promo.handPayout(hand, opts.denom, opts.coins) * opts.lines;
        if (amount >= opts.threshold) dealt.push(hand.name + " " + fmtMoney(amount));
      });
      multi.textContent = dealt.length
        ? "Dealt pat on all " + opts.lines + " lines: " + dealt.slice(0, 4).join(", ") +
          (dealt.length > 4 ? " +" + (dealt.length - 4) + " more" : "")
        : "No dealt pat hand reaches " + fmtMoney(opts.threshold) + " across " + opts.lines + " lines.";
      box.appendChild(multi);

      var caveat = document.createElement("p");
      caveat.className = "casino-w2g muted";
      caveat.textContent = "Lines drawn separately are separate wins; whether a machine " +
        "reports them singly or as one total varies — confirm at the property.";
      box.appendChild(caveat);
    }

    promoEls.w2g.appendChild(box);

    // --- Denomination ladder ---
    promoEls.ladder.innerHTML = "";
    DENOMS.forEach(function (d) {
      var p = Promo.plan({
        game: opts.game, denom: d, coins: MAX_COINS,
        tcCap: opts.tcCap, multiplier: opts.multiplier,
        coinInPerTc: opts.coinInPerTc, handsPerHour: opts.handsPerHour,
        threshold: opts.threshold, lines: opts.lines, bankroll: opts.bankroll,
        coins: opts.coins,
      });
      var tr = document.createElement("tr");
      if (d === opts.denom) tr.className = "current";
      else if (p.expectedW2g !== null && p.expectedW2g >= 1) tr.className = "danger";

      function td(text) {
        var c = document.createElement("td");
        c.textContent = text;
        return c;
      }
      tr.appendChild(td(fmtDenom(d)));
      tr.appendChild(td(fmtMoney(p.bet)));
      tr.appendChild(td(fmtInt(p.hands)));
      tr.appendChild(td(p.hours < 10 ? p.hours.toFixed(1) : fmtInt(p.hours)));
      tr.appendChild(td(
        p.w2g.rate === null ? "—" :
        p.w2g.rate === 0 ? "never" : fmtInt(p.w2g.oneIn) + " hands"));
      tr.appendChild(td(p.expectedW2g === null ? "—" : p.expectedW2g.toFixed(2)));
      tr.appendChild(td(p.ruin === null ? "—" : fmtPct(p.ruin)));
      promoEls.ladder.appendChild(tr);
    });

    renderSpread(plan, opts);
    renderCeiling(opts);
  }

  /**
   * Hold the total bet fixed and vary how it is spread across lines.
   *
   * This is how the same stake actually gets played differently: 100 lines of
   * a nickel is the same $25 as one line of $5. Coin-in, time and expected
   * cost are identical down the column, so the only things that move are
   * variance and the size of any one line's win — which is what decides
   * whether a hand gets paid at the machine or by hand.
   */
  function renderSpread(plan, opts) {
    var body = document.getElementById("promo-spread");
    body.innerHTML = "";
    var totalBet = plan.bet;

    LINE_COUNTS.forEach(function (n) {
      var denom = totalBet / (opts.coins * n);
      // Only offer spreads that land on a denomination a machine actually has.
      var real = DENOMS.some(function (d) { return Math.abs(d - denom) < 1e-9; });

      var p = Promo.plan({
        game: opts.game, denom: denom, coins: opts.coins, lines: n,
        tcCap: opts.tcCap, multiplier: opts.multiplier,
        coinInPerTc: opts.coinInPerTc, handsPerHour: opts.handsPerHour,
        threshold: opts.threshold, bankroll: opts.bankroll,
      });

      var tr = document.createElement("tr");
      if (n === opts.lines && real) tr.className = "current";
      else if (!real) tr.className = "unavailable";
      function td(text) {
        var c = document.createElement("td");
        c.textContent = text;
        return c;
      }
      tr.appendChild(td(n === 1 ? "single" : n + "-play"));
      tr.appendChild(td(real ? fmtDenom(denom) : fmtMoney(denom, 3) + " —"));
      tr.appendChild(td(p.linesVariance.known ? p.linesVariance.sd.toFixed(2) : "—"));
      tr.appendChild(td(p.swing === null ? "—" : fmtMoney(p.swing)));
      tr.appendChild(td(p.ruin === null ? "—" : fmtPct(p.ruin)));

      // Biggest a single line can pay, then how often a handpay lands from
      // either mechanism — one line reaching the threshold alone, or the held
      // cards paying on every line at once.
      var biggest = 0;
      opts.game.hands.forEach(function (hand) {
        var one = Promo.handPayout(hand, denom, opts.coins);
        if (one > biggest) biggest = one;
      });
      var tdOne = td(fmtMoney(biggest));
      if (biggest >= opts.threshold) tdOne.className = "over";
      tr.appendChild(tdOne);

      var w = Promo.w2gLines(opts.game, denom, n, opts.coins, opts.threshold);
      var tdW = td(!w.known ? "—" : w.oneIn === null ? "never" : fmtInt(w.oneIn) + " hands");
      if (w.oneIn !== null && w.oneIn < 10000) tdW.className = "over";
      tr.appendChild(tdW);

      body.appendChild(tr);
    });
  }

  function renderCeiling(opts) {
    var c = Promo.denomCeiling(opts.game, DENOMS, opts.threshold, opts.coins, null, opts.lines);
    promoEls.ceiling.innerHTML = "";
    if (!c.known) {
      promoEls.ceiling.className = "ceiling-callout muted";
      promoEls.ceiling.textContent = opts.game.name +
        " has no verified hand frequencies, so handpay rates aren't available — " +
        "thresholds below are still exact.";
      return;
    }
    promoEls.ceiling.className = "ceiling-callout";
    var big = document.createElement("strong");
    var perHand = c.denom === null ? 0 : c.denom * opts.coins * opts.lines;
    big.textContent = c.denom === null
      ? "Every denomination triggers handpays at " + fmtMoney(opts.threshold) + "."
      : "Bet ceiling: " + fmtDenom(c.denom) + " (" + fmtMoney(perHand) + " per hand" +
        (opts.lines > 1 ? " across " + opts.lines + " lines" : "") + ")";
    promoEls.ceiling.appendChild(big);

    var sub = document.createElement("span");
    if (c.breaksAt === null) {
      sub.textContent = "Handpays stay rare at every denomination listed.";
    } else {
      sub.textContent = "At " + fmtDenom(c.breaksAt) + ", " +
        (c.hand ? c.hand.name.toLowerCase() + " pays " + fmtMoney(c.hand.amount) : "a common hand") +
        " and crosses the " + fmtMoney(opts.threshold) + " line" +
        (opts.lines > 1 ? " across " + opts.lines + " lines." : ".");
    }
    promoEls.ceiling.appendChild(sub);
  }

  function renderCasinos() {
    var denom = parseFloat(promoEls.casinoDenom.value);
    var threshold = Math.max(1, parseFloat(promoEls.threshold.value) || W2G_THRESHOLD);
    var gameFilter = promoEls.casinoGame.value;
    promoEls.casinoList.innerHTML = "";

    try {
      localStorage.setItem("job-casino-filter", gameFilter);
    } catch (e) { /* private mode — the filter just won't persist */ }

    var shown = 0;

    CASINOS.forEach(function (casino) {
      var games = gameFilter === "*"
        ? casino.games
        : casino.games.filter(function (g) { return g.name === gameFilter; });
      // A property with nothing matching is noise when you're hunting one game.
      if (!games.length) return;
      shown++;
      var card = document.createElement("div");
      card.className = "casino-card" + (casino.promo ? " promo" : "");

      var h = document.createElement("h4");
      h.textContent = casino.name;
      if (casino.promo) {
        var badge = document.createElement("span");
        badge.className = "promo-badge";
        badge.textContent = "PROMO";
        h.appendChild(badge);
      }
      card.appendChild(h);

      // Best game actually playable at the selected denomination, within
      // whatever the filter has narrowed us to.
      var atDenom = games.filter(function (g) {
        return g.denoms.indexOf(denom) !== -1;
      });
      var promoOpts = currentPromoOpts();
      var best = document.createElement("p");
      best.className = "casino-best";
      if (atDenom.length) {
        var top = atDenom[0];
        best.textContent = "Best at " + fmtDenom(denom) + ": " + top.name +
          " — " + top.ret.toFixed(2) + "%";
      } else {
        best.className += " muted";
        best.textContent = "Nothing listed at " + fmtDenom(denom) + ".";
      }
      card.appendChild(best);

      games.forEach(function (g) {
        var has = g.denoms.indexOf(denom) !== -1;
        var row = document.createElement("div");
        row.className = "casino-game" + (has ? "" : " unavailable");

        var title = document.createElement("div");
        title.className = "casino-game-title";
        var nameSpan = document.createElement("span");
        nameSpan.textContent = g.name;
        if (g.variant) {
          var em = document.createElement("em");
          em.textContent = " " + g.variant;
          nameSpan.appendChild(em);
        }
        var retSpan = document.createElement("span");
        retSpan.className = "ret";
        retSpan.textContent = g.ret.toFixed(2) + "%";
        title.appendChild(nameSpan);
        title.appendChild(retSpan);
        row.appendChild(title);

        // Every bank listed separately — the locations are the point, and the
        // game filter is what keeps the volume manageable.
        var banks = (g.banks || []).slice().sort(function (a, b) {
          var ah = a.denoms.indexOf(denom) !== -1, bh = b.denoms.indexOf(denom) !== -1;
          if (ah !== bh) return ah ? -1 : 1;              // matching banks first
          var std = promoOpts.coinInPerTc;
          return (a.perPoint || std) - (b.perPoint || std);
        });

        banks.forEach(function (b) {
          var bankHas = b.denoms.indexOf(denom) !== -1;
          var bank = document.createElement("div");
          bank.className = "casino-bank" + (bankHas ? " match" : "");

          var chips = document.createElement("div");
          chips.className = "denom-chips";
          b.denoms.forEach(function (d) {
            var w = Promo.w2gForPayouts(g.payouts, g.hands, d, MAX_COINS, threshold);
            var n = w.triggers.length;
            var chip = document.createElement("span");
            // Chips grade by how many payout tiers cross the line: a schedule
            // where only the royal does is as clean as video poker gets.
            chip.className = "chip " + (n <= 1 ? "chip-ok" : n <= 2 ? "chip-warn" : "chip-danger") +
              (d === denom ? " chip-selected" : "");
            chip.textContent = fmtDenom(d);
            chip.title = n + " payout tier" + (n === 1 ? "" : "s") + " at or above " + fmtMoney(threshold);
            chips.appendChild(chip);
          });
          bank.appendChild(chips);

          if (b.location) {
            var loc = document.createElement("p");
            loc.className = "casino-loc";
            loc.textContent = b.location;
            bank.appendChild(loc);
          }

          var bits = [];
          bits.push(b.perPoint ? fmtMoney(b.perPoint) + "/point"
                               : fmtMoney(promoOpts.coinInPerTc) + "/point (assumed)");
          if (b.machines) bits.push(b.machines);
          if (b.play) bits.push(b.play);
          if (bankHas) {
            var rate = b.perPoint || promoOpts.coinInPerTc;
            var coinIn = (promoOpts.tcCap / promoOpts.multiplier) * rate;
            var hrs = coinIn / (denom * MAX_COINS) / promoOpts.handsPerHour;
            bits.push(fmtMoney(coinIn) + " coin-in");
            bits.push(hrs.toFixed(1) + " hr to cap");
          }
          var meta = document.createElement("p");
          meta.className = "casino-earn" +
            ((b.perPoint || promoOpts.coinInPerTc) > promoOpts.coinInPerTc ? " slow" : "");
          meta.textContent = bits.join(" · ");
          bank.appendChild(meta);

          bank.appendChild(bankW2gLine(g, b, denom, threshold, bankHas));
          row.appendChild(bank);
        });

        card.appendChild(row);
      });

      var src = document.createElement("a");
      src.className = "casino-source";
      src.href = casino.source;
      src.target = "_blank";
      src.rel = "noopener";
      src.textContent = "Full listing on vpfree2";
      card.appendChild(src);

      promoEls.casinoList.appendChild(card);
    });

    if (!shown) {
      var empty = document.createElement("p");
      empty.className = "note";
      empty.textContent = "No listed machine matches that game.";
      promoEls.casinoList.appendChild(empty);
    }
  }

  /* ---------- Hand analyzer ---------- */

  var anEls = {
    game: document.getElementById("analyze-game"),
    slots: document.getElementById("hand-slots"),
    rankRow: document.getElementById("rank-row"),
    suitRow: document.getElementById("suit-row"),
    deal: document.getElementById("analyze-deal"),
    clear: document.getElementById("analyze-clear"),
    result: document.getElementById("analyze-result"),
  };
  var anHand = [];        // card integers chosen so far
  var anPendingRank = -1; // rank tapped, waiting on a suit

  function anCardEl(card, opts) {
    var el = document.createElement("span");
    el.className = "card" + (Analyzer.isRed(card) ? " red" : "") +
      (opts && opts.held ? " held" : "");
    el.innerHTML = "<span class=\"card-rank\">" + Analyzer.RANK_LABELS[Analyzer.cardRank(card)] +
      "</span><span class=\"card-suit\">" + Analyzer.SUIT_LABELS[Analyzer.cardSuit(card)] + "</span>";
    return el;
  }

  /** A card in the hand row, wrapped with its HOLD marker. */
  function anCardSlot(card, held) {
    var wrap = document.createElement("span");
    wrap.className = "card-wrap" + (held ? " is-held" : "");
    wrap.appendChild(anCardEl(card, { held: held }));
    var tag = document.createElement("span");
    tag.className = "hold-tag";
    tag.textContent = "HOLD";
    wrap.appendChild(tag);
    return wrap;
  }

  function renderHandSlots(heldIndices) {
    anEls.slots.innerHTML = "";
    var cards = sim.on && sim.phase === "drawn" ? sim.result.final : anHand;
    for (var i = 0; i < 5; i++) {
      if (i < cards.length) {
        var held = heldIndices && heldIndices.indexOf(i) !== -1;
        var el = anCardSlot(cards[i], held);
        if (sim.on) {
          // In play mode a tap is a hold, not a delete.
          if (sim.phase === "dealt") {
            el.title = "Hold";
            (function (idx) {
              el.addEventListener("click", function () {
                var at = sim.held.indexOf(idx);
                if (at === -1) sim.held.push(idx); else sim.held.splice(at, 1);
                renderAnalyze();
              });
            })(i);
          }
          anEls.slots.appendChild(el);
          continue;
        }
        el.title = "Remove";
        (function (idx) {
          el.addEventListener("click", function () {
            anHand.splice(idx, 1);
            renderAnalyze();
          });
        })(i);
        anEls.slots.appendChild(el);
      } else {
        var wrap = document.createElement("span");
        wrap.className = "card-wrap";
        var slot = document.createElement("span");
        slot.className = "card empty";
        wrap.appendChild(slot);
        var tag = document.createElement("span");
        tag.className = "hold-tag";
        tag.textContent = "HOLD";
        wrap.appendChild(tag);
        anEls.slots.appendChild(wrap);
      }
    }
  }

  function anAddCard(rank, suit) {
    var card = (rank << 2) | suit;
    if (anHand.indexOf(card) !== -1 || anHand.length >= 5) return;
    anHand.push(card);
    anPendingRank = -1;
    renderAnalyze();
  }

  function renderPicker() {
    anEls.rankRow.innerHTML = "";
    Analyzer.RANK_LABELS.forEach(function (label, r) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "pick" + (anPendingRank === r ? " active" : "");
      b.textContent = label;
      b.disabled = anHand.length >= 5;
      b.addEventListener("click", function () {
        anPendingRank = anPendingRank === r ? -1 : r;
        renderPicker();
      });
      anEls.rankRow.appendChild(b);
    });

    anEls.suitRow.innerHTML = "";
    Analyzer.SUIT_LABELS.forEach(function (label, suitIdx) {
      var b = document.createElement("button");
      b.type = "button";
      // Suits stay disabled until a rank is chosen, so the two taps read as
      // one action rather than two independent controls.
      var taken = anPendingRank >= 0 && anHand.indexOf((anPendingRank << 2) | suitIdx) !== -1;
      b.className = "pick suit" + (suitIdx === 1 || suitIdx === 2 ? " red" : "");
      b.textContent = label;
      b.disabled = anPendingRank < 0 || taken || anHand.length >= 5;
      b.addEventListener("click", function () { anAddCard(anPendingRank, suitIdx); });
      anEls.suitRow.appendChild(b);
    });
  }

  function renderAnalyze() {
    var hint = document.getElementById("play-hint");
    document.querySelector(".picker").style.display = sim.on ? "none" : "";
    anEls.clear.style.display = sim.on ? "none" : "";

    if (sim.on) {
      renderPicker();
      if (sim.phase === "idle") {
        renderHandSlots(null);
        hint.textContent = "Deal a hand, tap the cards you want to keep, then draw.";
        anEls.deal.textContent = "Deal";
        anEls.result.innerHTML = "";
        renderPlayStats();
        return;
      }
      if (sim.phase === "dealt") {
        renderHandSlots(sim.held);
        hint.textContent = sim.held.length
          ? "Holding " + sim.held.length + " — draw when ready."
          : "Tap the cards to hold. Holding none discards everything.";
        anEls.deal.textContent = "Draw";
        anEls.result.innerHTML = "";
        renderPlayStats();
        return;
      }
      renderHandSlots(sim.held);
      hint.textContent = "";
      anEls.deal.textContent = "Deal next";
      renderPlayResult();
      return;
    }

    hint.textContent = "";
    renderPicker();
    if (anHand.length < 5) {
      renderHandSlots(null);
      anEls.result.innerHTML = "";
      var hint = document.createElement("p");
      hint.className = "note";
      hint.textContent = anPendingRank >= 0
        ? "Now pick a suit."
        : "Pick a rank, then a suit. " + (5 - anHand.length) + " more card" +
          (anHand.length === 4 ? "" : "s") + " to go — or deal one.";
      anEls.result.appendChild(hint);
      return;
    }

    renderHandSlots(null);
    anEls.result.innerHTML = "";
    var busy = document.createElement("p");
    busy.className = "note";
    busy.textContent = "Pricing all 32 holds…";
    anEls.result.appendChild(busy);

    // Let the "working" state paint before a few hundred ms of arithmetic.
    setTimeout(function () {
      var game = GAMES[anEls.game.value];
      var res = Analyzer.analyze(anHand, game);
      renderHandSlots(res.best.indices);
      renderAnalyzeResult(res, game);
    }, 16);
  }

  function renderAnalyzeResult(res, game) {
    var out = anEls.result;
    out.innerHTML = "";

    var verdict = document.createElement("div");
    verdict.className = "ceiling-callout";
    var big = document.createElement("strong");
    big.textContent = "Hold: " + Analyzer.holdLabel(res.best);
    verdict.appendChild(big);
    var sub = document.createElement("span");
    var second = res.holds[1];
    sub.textContent = "Worth " + res.best.ev.toFixed(4) + " per coin" +
      (second ? " — " + second.cost.toFixed(4) + " better than the next best hold." : ".");
    verdict.appendChild(sub);
    out.appendChild(verdict);

    var h1 = document.createElement("h3");
    h1.textContent = "Every hold, ranked";
    out.appendChild(h1);
    var wrap = document.createElement("div");
    wrap.className = "table-scroll";
    var t = document.createElement("table");
    t.className = "ladder-table";
    t.innerHTML = "<thead><tr><th>Hold</th><th>EV</th><th>Cost</th></tr></thead>";
    var tb = document.createElement("tbody");
    res.holds.slice(0, 10).forEach(function (h, i) {
      var tr = document.createElement("tr");
      if (i === 0) tr.className = "current";
      var td1 = document.createElement("td");
      if (h.cards.length) {
        h.cards.forEach(function (c) { td1.appendChild(anCardEl(c)); });
      } else {
        td1.textContent = "discard everything";
      }
      tr.appendChild(td1);
      var td2 = document.createElement("td");
      td2.textContent = h.ev.toFixed(4);
      tr.appendChild(td2);
      var td3 = document.createElement("td");
      td3.textContent = i === 0 ? "—" : "−" + h.cost.toFixed(4);
      if (h.cost > 0.05) td3.className = "over";
      tr.appendChild(td3);
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    out.appendChild(wrap);

    var h2 = document.createElement("h3");
    h2.textContent = "How that hold turns out";
    out.appendChild(h2);
    var dist = Analyzer.distribution(anHand, res.best.indices, game);
    var wrap2 = document.createElement("div");
    wrap2.className = "table-scroll";
    var t2 = document.createElement("table");
    t2.className = "ladder-table";
    t2.innerHTML = "<thead><tr><th>Result</th><th>Pays</th><th>Chance</th><th>1 in</th></tr></thead>";
    var tb2 = document.createElement("tbody");
    dist.rows.forEach(function (r) {
      var tr = document.createElement("tr");
      function td(text) {
        var c = document.createElement("td");
        c.textContent = text;
        return c;
      }
      tr.appendChild(td(r.name));
      tr.appendChild(td(r.pay ? r.pay + "/coin" : "—"));
      tr.appendChild(td((r.prob * 100).toFixed(r.prob < 0.001 ? 4 : 2) + "%"));
      tr.appendChild(td(r.prob > 0 ? fmtInt(1 / r.prob) : "—"));
      tb2.appendChild(tr);
    });
    t2.appendChild(tb2);
    wrap2.appendChild(t2);
    out.appendChild(wrap2);

    var note = document.createElement("p");
    note.className = "note";
    note.textContent = dist.total.toLocaleString() + " possible draws, all enumerated — " +
      "these are exact, not estimates.";
    out.appendChild(note);
  }

  function initAnalyzer() {
    Object.keys(GAMES).forEach(function (k) {
      var g = GAMES[k];
      var opt = document.createElement("option");
      opt.value = k;
      opt.textContent = g.name + " — " + g.label;
      anEls.game.appendChild(opt);
    });
    anEls.game.value = "job-9-6";
    anEls.game.addEventListener("change", renderAnalyze);

    anEls.clear.addEventListener("click", function () {
      anHand = []; anPendingRank = -1; renderAnalyze();
    });
    anEls.deal.addEventListener("click", function () {
      if (sim.on) {
        if (sim.phase === "dealt") simDraw(); else simDeal();
        return;
      }
      anHand = [];
      while (anHand.length < 5) {
        var c = Math.floor(Math.random() * 52);
        if (anHand.indexOf(c) === -1) anHand.push(c);
      }
      anPendingRank = -1;
      renderAnalyze();
    });

    document.querySelectorAll(".analyze-mode .toggle-btn").forEach(function (b) {
      b.addEventListener("click", function () {
        var mode = this.getAttribute("data-amode");
        sim.on = mode === "play";
        document.querySelectorAll(".analyze-mode .toggle-btn").forEach(function (x) {
          x.classList.remove("active");
        });
        this.classList.add("active");
        sim.phase = "idle";
        sim.held = [];
        sim.result = null;
        anHand = [];
        anPendingRank = -1;
        anEls.deal.textContent = sim.on ? "Deal" : "Deal a hand";
        renderAnalyze();
      });
    });

    renderAnalyze();
  }

  /* ---------- Play mode: deal, hold, draw, and get scored ---------- */

  var sim = {
    on: false,
    phase: "idle",   // idle -> dealt -> drawn
    hand: [],
    held: [],
    deck: [],
    result: null,
    stats: { hands: 0, wagered: 0, returned: 0, correct: 0, coinsLost: 0 },
  };

  function shuffledDeck() {
    var d = [], i, j, t;
    for (i = 0; i < 52; i++) d.push(i);
    for (i = 51; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = d[i]; d[i] = d[j]; d[j] = t;
    }
    return d;
  }

  function simDeal() {
    var d = shuffledDeck();
    sim.hand = d.slice(0, 5);
    sim.deck = d.slice(5);
    sim.held = [];
    sim.result = null;
    sim.phase = "dealt";
    anHand = sim.hand.slice();
    renderAnalyze();
  }

  /**
   * Resolve the draw, then score the hold that was actually made.
   *
   * Scoring compares against every alternative rather than against a strategy
   * card, so a tie counts as correct and a mistake is priced at exactly what
   * it gave up — the same number the analyzer shows.
   */
  function simDraw() {
    var game = GAMES[anEls.game.value];
    var evaluate = Analyzer.evaluatorFor(game.key);
    var final = sim.hand.slice();
    var next = 0;
    for (var i = 0; i < 5; i++) {
      if (sim.held.indexOf(i) === -1) final[i] = sim.deck[next++];
    }

    var idx = evaluate(final[0], final[1], final[2], final[3], final[4]);
    var perCoin = idx === -1 ? 0 : game.hands[idx].maxPay;
    var paid = perCoin * MAX_COINS;

    var res = Analyzer.analyze(sim.hand, game);
    var mine = null;
    for (i = 0; i < res.holds.length; i++) {
      if (res.holds[i].indices.join(",") === sim.held.slice().sort(function (a, b) { return a - b; }).join(",")) {
        mine = res.holds[i];
        break;
      }
    }
    var cost = mine ? mine.cost : 0;
    var wasBest = cost < 1e-9;

    sim.stats.hands++;
    sim.stats.wagered += MAX_COINS;
    sim.stats.returned += paid;
    if (wasBest) sim.stats.correct++;
    sim.stats.coinsLost += cost * MAX_COINS;

    sim.result = {
      final: final,
      name: idx === -1 ? "Nothing" : game.hands[idx].name,
      paid: paid,
      wasBest: wasBest,
      cost: cost,
      best: res.best,
      mine: mine,
    };
    sim.phase = "drawn";
    renderAnalyze();
  }

  function renderPlayStats() {
    var box = document.getElementById("play-stats");
    box.innerHTML = "";
    if (!sim.on || !sim.stats.hands) return;
    var st = sim.stats;
    var net = st.returned - st.wagered;
    box.appendChild(statCard("Hands", fmtInt(st.hands),
      st.wagered + " coins in, " + st.returned + " back"));
    box.appendChild(statCard("Net", (net >= 0 ? "+" : "−") + Math.abs(net) + " coins",
      (st.returned / st.wagered * 100).toFixed(1) + "% returned",
      net >= 0 ? "done" : ""));
    box.appendChild(statCard("Played best", (st.correct / st.hands * 100).toFixed(0) + "%",
      st.hands - st.correct + " hand" + (st.hands - st.correct === 1 ? "" : "s") + " misplayed",
      st.correct === st.hands ? "done" : "warn"));
    box.appendChild(statCard("Cost of errors", st.coinsLost.toFixed(2) + " coins",
      (st.coinsLost / st.wagered * 100).toFixed(2) + "% of what you wagered",
      st.coinsLost > 0 ? "warn" : "done"));
  }

  function renderPlayResult() {
    var out = anEls.result;
    out.innerHTML = "";
    var r = sim.result;
    if (!r) return;

    var box = document.createElement("div");
    box.className = "ceiling-callout" + (r.paid ? "" : " muted");
    var big = document.createElement("strong");
    big.textContent = r.name + (r.paid ? "  —  " + r.paid + " coins" : "  —  no pay");
    box.appendChild(big);
    var sub = document.createElement("span");
    if (r.wasBest) {
      sub.textContent = "Best possible hold. Nothing left on the table.";
    } else {
      sub.textContent = "Optimal was " + Analyzer.holdLabel(r.best) + " — that hold was worth " +
        r.cost.toFixed(4) + " more per coin.";
    }
    box.appendChild(sub);
    out.appendChild(box);
    renderPlayStats();
  }

  function initPromoControls() {
    Object.keys(GAMES).forEach(function (key) {
      var g = GAMES[key];
      var opt = document.createElement("option");
      opt.value = key;
      opt.textContent = g.name + " — " + g.label + " (" + g.ret.toFixed(2) + "%)";
      promoEls.game.appendChild(opt);
    });
    promoEls.game.value = "job-9-6";

    [promoEls.denom, promoEls.casinoDenom].forEach(function (sel) {
      DENOMS.forEach(function (d) {
        var opt = document.createElement("option");
        opt.value = String(d);
        opt.textContent = fmtDenom(d) + "  (" + fmtMoney(d * MAX_COINS) + "/hand)";
        sel.appendChild(opt);
      });
      sel.value = "5";
    });

    // Built from the scraped data so it stays correct as listings change.
    // Commonest games first — that's what you're most likely reaching for.
    var gameCounts = {};
    CASINOS.forEach(function (c) {
      c.games.forEach(function (g) {
        gameCounts[g.name] = (gameCounts[g.name] || 0) + 1;
      });
    });
    var allOpt = document.createElement("option");
    allOpt.value = "*";
    allOpt.textContent = "All games";
    promoEls.casinoGame.appendChild(allOpt);
    Object.keys(gameCounts)
      .sort(function (a, b) { return gameCounts[b] - gameCounts[a] || a.localeCompare(b); })
      .forEach(function (name) {
        var o = document.createElement("option");
        o.value = name;
        o.textContent = name;
        promoEls.casinoGame.appendChild(o);
      });
    promoEls.casinoGame.value = "*";
    try {
      var savedFilter = localStorage.getItem("job-casino-filter");
      // Ignore a saved game that no longer appears in the refreshed listings.
      if (savedFilter && (savedFilter === "*" || gameCounts[savedFilter])) {
        promoEls.casinoGame.value = savedFilter;
      }
    } catch (e) { /* ignore */ }

    for (var c = 1; c <= MAX_COINS; c++) {
      var co = document.createElement("option");
      co.value = String(c);
      co.textContent = c + (c === MAX_COINS ? " (max bet)" : "");
      promoEls.coins.appendChild(co);
    }
    promoEls.coins.value = String(MAX_COINS);

    LINE_COUNTS.forEach(function (n) {
      var o = document.createElement("option");
      o.value = String(n);
      o.textContent = n === 1 ? "Single line" : n + "-play";
      promoEls.lines.appendChild(o);
    });
    promoEls.lines.value = "1";


    [promoEls.game, promoEls.denom, promoEls.lines, promoEls.coins, promoEls.bankroll,
     promoEls.cap, promoEls.mult,
     promoEls.rate, promoEls.hph, promoEls.threshold].forEach(function (el) {
      el.addEventListener("input", renderPromo);
      el.addEventListener("change", renderPromo);
    });
    // The threshold drives both tabs.
    promoEls.threshold.addEventListener("input", renderCasinos);
    promoEls.casinoDenom.addEventListener("change", renderCasinos);
    promoEls.casinoGame.addEventListener("change", renderCasinos);
  }

  // --- Init ---
  Object.keys(GAMES).forEach(function (k) {
    var g = GAMES[k];
    var opt = document.createElement("option");
    opt.value = k;
    opt.textContent = g.name + " — " + g.label + " (" + g.ret.toFixed(2) + "%)";
    variantSelect.appendChild(opt);
  });
  variantSelect.value = "job-9-6";

  Object.keys(GAMES).forEach(function (k) {
    if (!strategyKindOf(k)) return;
    var g = GAMES[k];
    var opt = document.createElement("option");
    opt.value = k;
    opt.textContent = g.name + " — " + g.label;
    strategyVariantSelect.appendChild(opt);
  });
  strategyVariantSelect.value = "job-9-6";

  renderPayTable("job-9-6");
  renderGameCompare();
  renderStrategy("job-9-6", "simple");
  initPromoControls();
  initAnalyzer();
  renderPromo();
  renderCasinos();
  tabFromHash();
})();
