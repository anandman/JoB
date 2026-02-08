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

  // --- Init ---
  renderPayTable("9-6");
  renderStrategy("9-6", "simple");
})();
