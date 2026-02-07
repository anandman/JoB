/**
 * Jacks or Betterment — App logic
 */

(function () {
  "use strict";

  // --- DOM refs ---
  const variantSelect = document.getElementById("variant-select");
  const payTableBody = document.getElementById("pay-table-body");
  const returnValue = document.getElementById("return-value");
  const strategyList = document.getElementById("strategy-list");
  const navLinks = document.querySelectorAll(".nav-link");
  const tabContents = document.querySelectorAll(".tab-content");

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

  variantSelect.addEventListener("change", function () {
    renderPayTable(this.value);
  });

  // --- Strategy rendering ---
  function renderStrategy() {
    strategyList.innerHTML = "";
    for (var i = 0; i < STRATEGY.length; i++) {
      var entry = STRATEGY[i];
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

      // Color-code by tier
      if (i <= 2) {
        li.classList.add("tier-pat-high");
      } else if (i <= 10) {
        li.classList.add("tier-strong");
      } else if (i <= 14) {
        li.classList.add("tier-draw");
      } else {
        li.classList.add("tier-speculative");
      }

      strategyList.appendChild(li);
    }
  }

  // --- Init ---
  renderPayTable("9-6");
  renderStrategy();
})();
