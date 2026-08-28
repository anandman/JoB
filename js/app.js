/**
 * Jacks or Betterment — App logic
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
      strategyMeta.textContent = "~0.08% cost vs. optimal play";
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
    cap: document.getElementById("promo-cap"),
    mult: document.getElementById("promo-mult"),
    rate: document.getElementById("promo-rate"),
    hph: document.getElementById("promo-hph"),
    stats: document.getElementById("promo-stats"),
    w2g: document.getElementById("promo-w2g"),
    ladder: document.getElementById("promo-ladder"),
    trackerTc: document.getElementById("tracker-tc"),
    trackerFill: document.getElementById("tracker-fill"),
    trackerStats: document.getElementById("tracker-stats"),
    threshold: document.getElementById("promo-threshold"),
    ceiling: document.getElementById("promo-ceiling"),
    tripStart: document.getElementById("trip-start"),
    tripEnd: document.getElementById("trip-end"),
    tripReset: document.getElementById("trip-reset"),
    tripPerDay: document.getElementById("trip-perday"),
    tripSummary: document.getElementById("trip-summary"),
    tripDays: document.getElementById("trip-days"),
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
      coins: MAX_COINS,
      tcCap: Math.max(1, parseFloat(promoEls.cap.value) || 1),
      multiplier: Math.max(1, parseFloat(promoEls.mult.value) || 1),
      coinInPerTc: Math.max(0.01, parseFloat(promoEls.rate.value) || 1),
      handsPerHour: Math.max(1, parseFloat(promoEls.hph.value) || 1),
      threshold: Math.max(1, parseFloat(promoEls.threshold.value) || W2G_THRESHOLD),
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

    // --- Summary cards ---
    promoEls.stats.innerHTML = "";
    promoEls.stats.appendChild(statCard("Coin-in needed", fmtMoney(plan.coinIn),
      fmtInt(plan.baseTc) + " base TC × " + fmtMoney(opts.coinInPerTc)));
    promoEls.stats.appendChild(statCard("Hands", fmtInt(plan.hands),
      "at " + fmtMoney(plan.bet) + " per hand"));
    promoEls.stats.appendChild(statCard("Time", plan.hours.toFixed(1) + " hr",
      "at " + fmtInt(opts.handsPerHour) + " hands/hr"));
    promoEls.stats.appendChild(statCard("Expected cost", fmtMoney(plan.expectedCost),
      fmtPct(1 - plan.ret) + " of coin-in"));
    if (plan.noRoyalCost !== null) {
      promoEls.stats.appendChild(statCard("Typical cost", fmtMoney(plan.noRoyalCost),
        "if no royal (" + fmtPct(1 - plan.royalChance) + " likely)", "warn"));
    }
    if (plan.bankroll !== null) {
      promoEls.stats.appendChild(statCard("Bankroll", fmtMoney(plan.bankroll),
        "covers a 2σ downswing"));
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
    promoEls.w2g.appendChild(box);

    // --- Denomination ladder ---
    promoEls.ladder.innerHTML = "";
    DENOMS.forEach(function (d) {
      var p = Promo.plan({
        game: opts.game, denom: d, coins: MAX_COINS,
        tcCap: opts.tcCap, multiplier: opts.multiplier,
        coinInPerTc: opts.coinInPerTc, handsPerHour: opts.handsPerHour,
        threshold: opts.threshold,
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
      promoEls.ladder.appendChild(tr);
    });

    renderCeiling(opts);
    renderTrip(plan, opts);
    renderTracker(plan, opts);
  }

  function renderCeiling(opts) {
    var c = Promo.denomCeiling(opts.game, DENOMS, opts.threshold, MAX_COINS);
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
    big.textContent = c.denom === null
      ? "Every denomination triggers handpays at " + fmtMoney(opts.threshold) + "."
      : "Bet ceiling: " + fmtDenom(c.denom) + " (" + fmtMoney(c.denom * MAX_COINS) + " per hand)";
    promoEls.ceiling.appendChild(big);

    var sub = document.createElement("span");
    if (c.breaksAt === null) {
      sub.textContent = "Handpays stay rare at every denomination listed.";
    } else {
      sub.textContent = "At " + fmtDenom(c.breaksAt) + ", " +
        (c.hand ? c.hand.name.toLowerCase() + " pays " + fmtMoney(c.hand.amount) : "a common hand") +
        " and crosses the " + fmtMoney(opts.threshold) + " line.";
    }
    promoEls.ceiling.appendChild(sub);
  }

  function renderTrip(plan, opts) {
    var start = new Date(promoEls.tripStart.value);
    var end = new Date(promoEls.tripEnd.value);
    var reset = parseInt(promoEls.tripReset.value, 10) || 0;
    var perDay = promoEls.tripPerDay.checked;

    var days = Promo.gamingDays(start, end, reset);
    promoEls.tripSummary.innerHTML = "";
    promoEls.tripDays.innerHTML = "";
    if (!days.length) {
      promoEls.tripSummary.className = "note warn";
      promoEls.tripSummary.textContent = "Set an arrival before departure to see the gaming-day split.";
      return;
    }

    var sched = Promo.schedule(plan, days, perDay);
    promoEls.tripSummary.className = "stat-grid compact";
    promoEls.tripSummary.appendChild(statCard("Gaming days", String(days.length),
      "reset at " + (reset % 12 === 0 ? 12 : reset % 12) + (reset < 12 ? "am" : "pm")));
    promoEls.tripSummary.appendChild(statCard("Play needed", sched.neededHours.toFixed(1) + " hr",
      "of " + sched.totalHours.toFixed(1) + " hr on the floor",
      sched.feasible ? "" : "danger"));
    promoEls.tripSummary.appendChild(statCard("Total coin-in", fmtMoney(sched.totalCoinIn),
      fmtMoney(sched.totalCost) + " expected cost"));
    promoEls.tripSummary.appendChild(statCard("Slack", sched.slack.toFixed(1) + " hr",
      sched.feasible ? "spare time" : "short", sched.feasible ? "" : "danger"));

    days.forEach(function (d, i) {
      var row = sched.days[i];
      var tr = document.createElement("tr");
      if (row.feasible === false) tr.className = "danger";
      function td(text) {
        var c = document.createElement("td");
        c.textContent = text;
        return c;
      }
      function hhmm(dt) {
        return dt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      }
      tr.appendChild(td(d.label));
      tr.appendChild(td(hhmm(d.start) + " – " + hhmm(d.end)));
      tr.appendChild(td(d.hours.toFixed(1) + " hr"));
      tr.appendChild(td(row.need === null ? "—" : row.need.toFixed(1) + " hr"));
      tr.appendChild(td(row.feasible === false ? "short" : (row.need > 0.01 ? "ok" : "—")));
      promoEls.tripDays.appendChild(tr);
    });
  }

  function renderTracker(plan, opts) {
    var tc = Math.max(0, parseFloat(promoEls.trackerTc.value) || 0);
    var prog = Promo.progress(plan, tc, opts.tcCap);

    promoEls.trackerFill.style.width = (prog.pct * 100).toFixed(1) + "%";
    promoEls.trackerFill.className = "progress-fill" + (prog.done ? " done" : "");

    promoEls.trackerStats.innerHTML = "";
    if (prog.done) {
      promoEls.trackerStats.appendChild(statCard("Cap reached", "Stop",
        "further play earns no multiplier", "done"));
      return;
    }
    promoEls.trackerStats.appendChild(statCard("Remaining", fmtPct(1 - prog.pct), "of the cap"));
    promoEls.trackerStats.appendChild(statCard("Hands left", fmtInt(prog.handsLeft),
      fmtMoney(prog.coinInLeft) + " coin-in"));
    promoEls.trackerStats.appendChild(statCard("Time left", prog.hoursLeft.toFixed(1) + " hr",
      fmtMoney(prog.costLeft) + " expected cost"));

    try {
      localStorage.setItem("job-tracker-tc", String(tc));
    } catch (e) { /* private mode — progress just won't persist */ }
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

    for (var hr = 0; hr < 24; hr++) {
      var o = document.createElement("option");
      o.value = String(hr);
      o.textContent = (hr % 12 === 0 ? 12 : hr % 12) + ":00 " + (hr < 12 ? "am" : "pm");
      promoEls.tripReset.appendChild(o);
    }
    promoEls.tripReset.value = "6";

    // Default the window to a 4pm-to-4pm overnight starting tomorrow.
    function localISO(d) {
      var pad = function (n) { return (n < 10 ? "0" : "") + n; };
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
        "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }
    var t0 = new Date();
    t0.setDate(t0.getDate() + 1);
    t0.setHours(16, 0, 0, 0);
    var t1 = new Date(t0.getTime());
    t1.setDate(t1.getDate() + 1);
    promoEls.tripStart.value = localISO(t0);
    promoEls.tripEnd.value = localISO(t1);

    try {
      var saved = localStorage.getItem("job-tracker-tc");
      if (saved !== null) promoEls.trackerTc.value = saved;
    } catch (e) { /* ignore */ }

    [promoEls.game, promoEls.denom, promoEls.cap, promoEls.mult,
     promoEls.rate, promoEls.hph, promoEls.threshold, promoEls.trackerTc,
     promoEls.tripStart, promoEls.tripEnd, promoEls.tripReset,
     promoEls.tripPerDay].forEach(function (el) {
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
  renderPromo();
  renderCasinos();
  tabFromHash();
})();
