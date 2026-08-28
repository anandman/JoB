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
  var strategyMeta = document.getElementById("strategy-meta");
  var navLinks = document.querySelectorAll(".nav-link");
  var tabContents = document.querySelectorAll(".tab-content");
  var toggleBtns = document.querySelectorAll(".toggle-btn");

  // --- State ---
  var currentVariant = "9-6";
  var currentMode = "simple";

  // --- Tab navigation ---
  navLinks.forEach(function (link) {
    link.addEventListener("click", function (e) {
      e.preventDefault();
      var tab = this.getAttribute("data-tab");
      navLinks.forEach(function (l) { l.classList.remove("active"); });
      tabContents.forEach(function (t) { t.classList.remove("active"); });
      this.classList.add("active");
      document.getElementById(tab).classList.add("active");
    });
  });

  // --- Pay table rendering ---
  function renderPayTable(variantKey) {
    var variant = PAY_TABLES[variantKey];
    if (!variant) return;

    payTableBody.innerHTML = "";
    returnValue.textContent = variant.expectedReturn.toFixed(2) + "%";

    for (var i = 0; i < HAND_NAMES.length; i++) {
      var basePay = variant.payouts[i];
      var tr = document.createElement("tr");

      // Hand name
      var tdName = document.createElement("td");
      tdName.textContent = HAND_NAMES[i];
      tr.appendChild(tdName);

      // Coins 1-4
      for (var c = 1; c <= 4; c++) {
        var td = document.createElement("td");
        td.textContent = (basePay * c).toLocaleString();
        tr.appendChild(td);
      }

      // Coin 5 (Royal Flush gets bonus)
      var td5 = document.createElement("td");
      td5.className = "max-bet";
      if (i === 0) {
        td5.textContent = (ROYAL_FLUSH_5COIN_PER * 5).toLocaleString();
        td5.classList.add("bonus");
      } else {
        td5.textContent = (basePay * 5).toLocaleString();
      }
      tr.appendChild(td5);

      payTableBody.appendChild(tr);
    }
  }

  // --- Variant selectors: keep both in sync ---
  function setVariant(variantKey) {
    currentVariant = variantKey;
    variantSelect.value = variantKey;
    strategyVariantSelect.value = variantKey;
    renderPayTable(currentVariant);
    renderStrategy(currentVariant, currentMode);
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
  function renderStrategy(variantKey, mode) {
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

    strategyList.innerHTML = "";
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
    promoEls.casinoList.innerHTML = "";

    CASINOS.forEach(function (casino) {
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

      // Best game actually playable at the selected denomination.
      var atDenom = casino.games.filter(function (g) {
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

      casino.games.forEach(function (g) {
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

        var chips = document.createElement("div");
        chips.className = "denom-chips";
        g.denoms.forEach(function (d) {
          var w = Promo.w2gForPayouts(g.payouts, g.hands, d, MAX_COINS, threshold);
          var chip = document.createElement("span");
          // Chips grade by how many payout tiers cross the line: a schedule
          // where only the royal does is as clean as video poker gets.
          var n = w.triggers.length;
          chip.className = "chip " + (n === 0 ? "chip-ok" : n === 1 ? "chip-ok" : n <= 2 ? "chip-warn" : "chip-danger") +
            (d === denom ? " chip-selected" : "");
          chip.textContent = fmtDenom(d);
          chip.title = n + " payout tier" + (n === 1 ? "" : "s") + " at or above " + fmtMoney(threshold);
          chips.appendChild(chip);
        });
        row.appendChild(chips);

        if (has) {
          // Earn rates are per machine bank; a $20/point bank needs twice the
          // coin-in for the same tier credits.
          var rate = g.perPoint || promoOpts.coinInPerTc;
          var coinIn = (promoOpts.tcCap / promoOpts.multiplier) * rate;
          var hrs = coinIn / (denom * MAX_COINS) / promoOpts.handsPerHour;
          var earn = document.createElement("p");
          earn.className = "casino-earn" + (g.perPoint && g.perPoint > promoOpts.coinInPerTc ? " slow" : "");
          earn.textContent = (g.perPoint ? fmtMoney(g.perPoint) + "/point" : fmtMoney(promoOpts.coinInPerTc) + "/point (assumed)") +
            " — " + fmtMoney(coinIn) + " coin-in, " + hrs.toFixed(1) + " hr to cap";
          row.appendChild(earn);

          var w2 = Promo.w2gForPayouts(g.payouts, g.hands, denom, MAX_COINS, threshold);
          var note = document.createElement("p");
          note.className = "casino-note";
          if (!w2.triggers.length) {
            note.textContent = "Nothing hits " + fmtMoney(threshold) + " at " + fmtDenom(denom) + ".";
          } else {
            note.textContent = "Over " + fmtMoney(threshold) + " at " + fmtDenom(denom) + ": " +
              w2.triggers.map(function (t) { return t.name; }).join(", ");
          }
          row.appendChild(note);
          if (g.location) {
            var loc = document.createElement("p");
            loc.className = "casino-loc";
            loc.textContent = g.location;
            row.appendChild(loc);
          }
        }

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
  }

  // --- Init ---
  renderPayTable("9-6");
  renderStrategy("9-6", "simple");
  initPromoControls();
  renderPromo();
  renderCasinos();
})();
