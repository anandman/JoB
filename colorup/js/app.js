/**
 * Color Up — the interface.
 *
 * Three ideas hold this together.
 *
 * One button. On a casino floor, at the end of a session, with a drink in you,
 * the app should present exactly one thing to do: start, or color up. Every
 * other affordance is behind that.
 *
 * One form renderer. Start, color up and full edit are the same code over
 * different field lists, so "everything is editable, always" is a list rather
 * than a feature — a field cannot be reachable in one place and stranded in
 * another.
 *
 * One place values are derived. Nothing computed is ever typed or stored; the
 * live panel, the list row, the stats and the spreadsheet all call
 * Store.derive(), so they cannot disagree about what a session was worth.
 */

var App = (function () {
  "use strict";

  var state = { sessions: [], filters: {}, tab: "now", tick: null };

  /* ===== small helpers ===== */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag), k;
    if (attrs) for (k in attrs) {
      if (k === "class") n.className = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined && attrs[k] !== false) n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function money(n, opts) {
    if (n === null || n === undefined || !isFinite(n)) return "—";
    var o = opts || {};
    var neg = n < 0, v = Math.abs(n);
    var s = "$" + v.toLocaleString("en-US", {
      minimumFractionDigits: o.cents ? 2 : 0,
      maximumFractionDigits: o.cents ? 2 : 0
    });
    if (neg) return "(" + s + ")";
    return (o.sign && n > 0 ? "+" : "") + s;
  }
  function pct(x, dp) {
    return (x === null || x === undefined || !isFinite(x)) ? "—" : (x * 100).toFixed(dp === undefined ? 1 : dp) + "%";
  }
  function count(n) {
    return (n === null || n === undefined || !isFinite(n)) ? "—" : Math.round(n).toLocaleString("en-US");
  }
  function hoursText(h) {
    if (h === null || h === undefined || !isFinite(h)) return "—";
    var m = Math.round(h * 60);
    return Math.floor(m / 60) + "h " + (m % 60) + "m";
  }
  function clockText(ms) {
    var t = Math.max(0, Math.floor(ms / 1000));
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return Math.floor(t / 3600) + ":" + p(Math.floor(t / 60) % 60) + ":" + p(t % 60);
  }
  function dayText(iso) {
    if (!iso) return "—";
    var d = new Date(iso + "T00:00:00");
    return MONTHS[d.getMonth()] + " " + d.getDate();
  }
  function timeText(iso) {
    if (!iso) return "—";
    var d = new Date(iso), h = d.getHours(), m = d.getMinutes();
    var p = (m < 10 ? "0" : "") + m;
    return ((h % 12) || 12) + ":" + p + (h < 12 ? " am" : " pm");
  }
  function netClass(n) { return n > 0 ? "up" : (n < 0 ? "down" : "muted"); }

  /** datetime-local speaks local wall time; the store speaks ISO instants. */
  function toLocalInput(iso) {
    if (!iso) return "";
    var d = new Date(iso), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
           "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function fromLocalInput(v) { return v ? new Date(v).toISOString() : null; }
  function localDate(iso) { return Store.today(iso ? new Date(iso) : null); }

  function toast(msg, bad) {
    var t = el("div", { class: "toast" + (bad ? " bad" : ""), text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, bad ? 5000 : 2600);
  }

  function download(name, bytes, mime) {
    var blob = new Blob([bytes], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 2000);
  }

  /* ===== fields ===== */

  // Every field the app knows about, in one place. A form is a list of these
  // keys, which is what makes "editable everywhere" structural rather than
  // something to remember.
  var FIELDS = {
    date:     { label: "Date", kind: "date" },
    venue:    { label: "Venue", kind: "text", list: "venues", placeholder: "Eldorado" },
    location: { label: "City", kind: "text", list: "locations", placeholder: "Reno, NV" },
    game:     { label: "Game", kind: "select", options: function () {
                  return Store.GAMES.map(function (g) { return { value: g, label: g }; }); } },
    detail:   { label: "Machine or table", kind: "text", list: "details",
                placeholder: "9/5 JoB $5 high limit" },
    start:    { label: "Started", kind: "datetime" },
    end:      { label: "Ended", kind: "datetime" },
    cashIn:   { label: "Cash in", kind: "money" },
    bonus:    { label: "Free play / bonus", kind: "money",
                hint: "Casino money. It counts as money in, so it does not read as winnings." },
    cashOut:  { label: "Cash out", kind: "money" },
    startTC:  { label: "Tier credits — start", kind: "int" },
    endTC:    { label: "Tier credits — end", kind: "int" },
    tcRate:   { label: "$ per tier credit", kind: "select", options: function () {
                  return Store.TC_RATES.map(function (r) {
                    return { value: r.value, label: r.label + " · " + r.note };
                  }); },
                hint: "Only used to work out coin-in. Tier credits are never totalled here." },
    perHand:  { label: "$ per hand", kind: "money",
                hint: "Bet size, for hands per hour. $25 is five coins at $5." },
    handpays: { label: "W-2G handpays", kind: "handpays" },
    comment:  { label: "Comment", kind: "textarea" },
    winLossOverride:   { label: "Win/(loss) override", kind: "money",
                         hint: "Only when the cash cannot be made to add up." },
    sessionTCOverride: { label: "Session TC override", kind: "int" }
  };

  // Layout: a string is a full-width row, an array is a row of fields sharing it.
  var FORM_START = ["venue", "location", "game", "detail",
                    ["cashIn", "bonus"], ["startTC", "perHand"], "tcRate", "start"];
  var FORM_COLOR = ["cashOut", "end", "endTC", "handpays", "comment"];
  var FORM_FULL  = ["date", "venue", "location", "game", "detail",
                    ["start", "end"], ["cashIn", "bonus"], "cashOut",
                    ["startTC", "endTC"], ["tcRate", "perHand"], "handpays", "comment"];
  var FORM_OVERRIDES = ["winLossOverride", "sessionTCOverride"];

  function numOrNull(v) {
    if (v === null || v === undefined) return null;
    var s = String(v).replace(/[$,\s]/g, "");
    if (s === "") return null;
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  function fieldNode(key, session, onChange) {
    var f = FIELDS[key];
    var id = "f-" + key;
    var wrap = el("div", { class: "field" + (key === "cashOut" ? " hero" : "") });
    wrap.appendChild(el("label", { for: id, text: f.label }));

    var input;
    if (f.kind === "select") {
      input = el("select", { id: id, "data-key": key });
      f.options().forEach(function (o) {
        var opt = el("option", { value: o.value, text: o.label });
        if (String(session[key]) === String(o.value)) opt.selected = true;
        input.appendChild(opt);
      });
    } else if (f.kind === "textarea") {
      input = el("textarea", { id: id, "data-key": key, rows: 2 });
      input.value = session[key] || "";
    } else if (f.kind === "handpays") {
      return handpayNode(session, onChange);
    } else {
      var attrs = { id: id, "data-key": key, type: "text" };
      if (f.kind === "money") { attrs.type = "number"; attrs.inputmode = "decimal"; attrs.step = "0.01"; }
      if (f.kind === "int") { attrs.type = "number"; attrs.inputmode = "numeric"; attrs.step = "1"; }
      if (f.kind === "date") attrs.type = "date";
      if (f.kind === "datetime") attrs.type = "datetime-local";
      if (f.list) attrs.list = f.list;
      if (f.placeholder) attrs.placeholder = f.placeholder;
      input = el("input", attrs);
      input.value = f.kind === "datetime" ? toLocalInput(session[key])
                  : (session[key] === null || session[key] === undefined ? "" : session[key]);
    }

    input.addEventListener("input", onChange);
    input.addEventListener("change", onChange);
    wrap.appendChild(input);

    // Safari's datalist support is unreliable, and a venue name is a tedious
    // thing to type standing up. The last few values are offered as buttons,
    // which work everywhere.
    if (f.list) {
      var recent = Store.seen(state.sessions, key).slice(0, 3).filter(function (v) {
        return v !== session[key];
      });
      if (recent.length) {
        wrap.appendChild(el("div", { class: "row-actions picks" }, recent.map(function (v) {
          return el("button", { type: "button", class: "btn pick", text: v, onclick: function () {
            input.value = v;
            onChange();
          } });
        })));
      }
    }

    if (f.hint) wrap.appendChild(el("p", { class: "hint", text: f.hint }));
    return wrap;
  }

  /**
   * Handpays are a list, not a field. Each one is a form the casino already
   * filed, so the amounts have to be individually recoverable at tax time —
   * a single total would not reconcile against a stack of W-2Gs.
   */
  function handpayNode(session, onChange) {
    var wrap = el("div", { class: "field", "data-key": "handpays" });
    wrap.appendChild(el("label", { text: FIELDS.handpays.label }));
    var rows = el("div");

    function addRow(hp) {
      var amount = el("input", { type: "number", inputmode: "decimal", step: "1",
                                 placeholder: "Amount", "data-hp": "amount" });
      var withheld = el("input", { type: "number", inputmode: "decimal", step: "1",
                                   placeholder: "Withheld", "data-hp": "withheld" });
      amount.value = hp && hp.amount !== undefined && hp.amount !== null ? hp.amount : "";
      withheld.value = hp && hp.withheld !== undefined && hp.withheld !== null ? hp.withheld : "";
      var row = el("div", { class: "handpay-row" }, [
        el("div", { class: "field" }, [amount]),
        el("div", { class: "field" }, [withheld]),
        el("button", { type: "button", class: "btn drop", text: "×",
                       onclick: function () { row.remove(); onChange(); } })
      ]);
      amount.addEventListener("input", onChange);
      withheld.addEventListener("input", onChange);
      rows.appendChild(row);
    }

    (session.handpays || []).forEach(addRow);
    wrap.appendChild(rows);
    wrap.appendChild(el("button", {
      type: "button", class: "btn", text: "+ Add a handpay",
      onclick: function () { addRow(null); onChange(); }
    }));
    wrap.appendChild(el("p", { class: "hint",
      text: "A W-2G is issued at $" + Store.W2G_THRESHOLD.toLocaleString("en-US") +
            " in 2026. Amount, then anything withheld." }));
    return wrap;
  }

  /** Read the open form back into a session object. */
  function readForm(base) {
    var s = Object.assign({}, base);
    var body = $("#sheet-body");

    Array.prototype.forEach.call(body.querySelectorAll("[data-key]"), function (node) {
      var key = node.getAttribute("data-key");
      var f = FIELDS[key];
      if (!f || f.kind === "handpays") return;
      var v = node.value;
      if (f.kind === "money" || f.kind === "int") s[key] = numOrNull(v);
      else if (f.kind === "select") s[key] = key === "tcRate" ? numOrNull(v) : v;
      else if (f.kind === "datetime") s[key] = fromLocalInput(v);
      else s[key] = v === "" ? (f.kind === "date" ? null : "") : v;
    });

    var hp = body.querySelector('[data-key="handpays"]');
    if (hp) {
      s.handpays = Array.prototype.map.call(hp.querySelectorAll(".handpay-row"), function (row) {
        return {
          amount: numOrNull(row.querySelector('[data-hp="amount"]').value),
          withheld: numOrNull(row.querySelector('[data-hp="withheld"]').value)
        };
      }).filter(function (h) { return h.amount !== null || h.withheld !== null; });
    }

    // The start time is the more specific statement, so it settles the date.
    if (s.start) s.date = localDate(s.start);
    return s;
  }

  /* ===== the sheet ===== */

  var sheet = { base: null, onSave: null };

  function openSheet(opts) {
    sheet.base = opts.session;
    var body = clear($("#sheet-body"));
    var foot = clear($("#sheet-foot"));
    $("#sheet-title").textContent = opts.title;

    var derived = el("div", { class: "derived" });
    var warnBox = el("div");

    function refreshDerived() {
      var s = readForm(sheet.base);
      var d = Store.derive(s);
      clear(derived);
      // Before there is a cash out there is no result, only money on the table.
      // Showing win/(loss) at the start of a session would greet you with the
      // whole buy-in as a loss, which is both alarming and untrue.
      var settled = s.cashOut !== null && s.cashOut !== undefined;
      var lines = [
        ["Money in", money((numOrNull(s.cashIn) || 0) + (numOrNull(s.bonus) || 0)), ""]
      ];
      if (settled) lines.push(["Win / (loss)", money(d.winLoss, { sign: true, cents: true }), netClass(d.winLoss)]);
      lines = lines.concat([
        ["Time", hoursText(d.hours), ""],
        ["Session tier credits", d.sessionTC === null ? "—" : count(d.sessionTC), ""],
        ["Coin in", d.coinIn === null ? "—" : money(d.coinIn) + (d.coinInIsEstimate ? " est." : ""), ""],
        ["Per hour", d.perHour === null ? "—" : money(d.perHour, { sign: true }), netClass(d.perHour)]
      ]);
      if (d.handpayCount) lines.push(["Handpays", d.handpayCount + " · " + money(d.handpayTotal), ""]);
      lines.forEach(function (l) {
        derived.appendChild(el("div", {}, [
          el("span", { class: "muted", text: l[0] }),
          el("b", { class: l[2], text: l[1] })
        ]));
      });

      clear(warnBox);
      var w = Store.warnings(s);
      if (w.length && opts.showWarnings) {
        var ul = el("ul");
        w.forEach(function (x) { ul.appendChild(el("li", { text: x })); });
        warnBox.appendChild(el("div", { class: "warnings" }, [ul]));
      }
    }

    (opts.layout || []).forEach(function (rowSpec) {
      var keys = typeof rowSpec === "string" ? [rowSpec] : rowSpec;
      if (keys.length === 1) body.appendChild(fieldNode(keys[0], opts.session, refreshDerived));
      else {
        body.appendChild(el("div", { class: "field-pair" }, keys.map(function (k) {
          return fieldNode(k, opts.session, refreshDerived);
        })));
      }
    });

    if (opts.overrides) {
      var det = el("details");
      det.appendChild(el("summary", { class: "muted", text: "Overrides" }));
      det.appendChild(el("p", { class: "note",
        text: "Everything above is arithmetic. Use these only when the cash genuinely will not add up — a chip left in a pocket, a marker, a comp posted as cash." }));
      FORM_OVERRIDES.forEach(function (k) { det.appendChild(fieldNode(k, opts.session, refreshDerived)); });
      body.appendChild(det);
    }

    body.appendChild(derived);
    body.appendChild(warnBox);
    refreshDerived();

    (opts.buttons || []).forEach(function (b) {
      foot.appendChild(el("button", {
        type: "button", class: "btn wide " + (b.class || ""), text: b.label,
        onclick: function () { b.run(readForm(sheet.base)); }
      }));
    });

    $("#sheet-backdrop").hidden = false;
    // Focus what the form is for, but never on a touch keyboard the user did
    // not ask for: autofocus a hero field only, and only after paint.
    var hero = body.querySelector(".field.hero input");
    if (hero && opts.focusHero) setTimeout(function () { hero.focus(); }, 60);
  }

  function closeSheet() { $("#sheet-backdrop").hidden = true; }

  /* ===== the Now tab ===== */

  function startSession() {
    var previous = state.sessions.length ? state.sessions[state.sessions.length - 1] : null;
    var s = Store.blank(previous);
    s.start = new Date().toISOString();
    s.date = localDate(s.start);
    openSheet({
      title: "Start a session",
      session: s,
      layout: FORM_START,
      buttons: [
        { label: "Cancel", run: closeSheet },
        { label: "Start", class: "primary", run: function (next) {
            Store.put(next).then(function () { closeSheet(); toast("Session started."); refresh(); });
          } }
      ]
    });
  }

  function colorUp(s) {
    var draft = Object.assign({}, s);
    draft.end = new Date().toISOString();
    openSheet({
      title: "Color up",
      session: draft,
      layout: FORM_COLOR,
      showWarnings: true,
      focusHero: true,
      buttons: [
        { label: "Not yet", run: closeSheet },
        { label: "Save", class: "gold", run: function (next) {
            Store.put(next).then(function () { closeSheet(); toast("Session closed."); refresh(); });
          } }
      ]
    });
  }

  function editSession(s, opts) {
    openSheet({
      title: (opts && opts.title) || "Edit session",
      session: Object.assign({}, s),
      layout: FORM_FULL,
      overrides: true,
      showWarnings: true,
      buttons: [
        { label: "Delete", class: "danger", run: function () {
            if (!confirm("Delete this session? This cannot be undone.")) return;
            Store.remove(s.id).then(function () { closeSheet(); toast("Deleted."); refresh(); });
          } },
        { label: "Cancel", run: closeSheet },
        { label: "Save", class: "primary", run: function (next) {
            Store.put(next).then(function () { closeSheet(); toast("Saved."); refresh(); });
          } }
      ]
    });
  }

  function addPastSession() {
    var previous = state.sessions.length ? state.sessions[state.sessions.length - 1] : null;
    var s = Store.blank(previous);
    // Inheriting the last cash out is right for the next session of a trip and
    // wrong for one being reconstructed days later, when it is a guess wearing
    // the clothes of a fact.
    s.cashIn = null;
    s.startTC = null;
    editSession(s, { title: "Add a past session" });
  }

  function renderNow() {
    var card = clear($("#now-card"));
    var open = Store.running(state.sessions);

    if (open) {
      var live = el("div", { class: "live" }, [
        el("div", { class: "where", text: open.venue || "Session in progress" }),
        el("div", { class: "what", text: [open.game, open.detail].filter(Boolean).join(" · ") }),
        el("div", { class: "clock", id: "live-clock", text: "0:00:00" }),
        el("div", { class: "since", text: "Started " + timeText(open.start) + " · " +
                                          money(open.cashIn) + " in" +
                                          (open.bonus ? " plus " + money(open.bonus) + " free play" : "") })
      ]);
      card.appendChild(live);
      card.appendChild(el("button", { class: "big-btn cashout", text: "Color up",
                                      onclick: function () { colorUp(open); } }));
      card.appendChild(el("div", { class: "row-actions" }, [
        el("button", { class: "btn wide", text: "Edit this session",
                       onclick: function () { editSession(open); } })
      ]));
      startClock(open);
    } else {
      stopClock();
      card.appendChild(el("button", { class: "big-btn", text: "Start a session",
                                      onclick: startSession }));
      card.appendChild(el("div", { class: "row-actions" }, [
        el("button", { class: "btn wide", text: "Add a past session", onclick: addPastSession })
      ]));
    }

    var recent = clear($("#now-recent"));
    var closed = state.sessions.filter(function (s) { return !(s.start && !s.end); });
    if (!closed.length) {
      recent.appendChild(el("p", { class: "empty",
        text: "No sessions yet. Start one when you sit down, or add a past one." }));
      return;
    }
    var t = Analysis.totals(closed);
    var year = Analysis.totals(Analysis.filter(closed, { year: String(new Date().getFullYear()) }));
    recent.appendChild(el("h3", { text: "Where you stand" }));
    recent.appendChild(el("div", { class: "stat-grid" }, [
      stat("This year", money(year.winLoss, { sign: true }), year.sessions + " sessions", netClass(year.winLoss)),
      stat("Per hour", year.perHour === null ? "—" : money(year.perHour, { sign: true }),
           hoursText(year.hours) + " played", netClass(year.perHour)),
      stat("All time", money(t.winLoss, { sign: true }), t.sessions + " sessions", netClass(t.winLoss)),
      stat("Last session", (function () {
        var last = closed[closed.length - 1];
        return money(Store.derive(last).winLoss, { sign: true });
      })(), (function () {
        var last = closed[closed.length - 1];
        return dayText(last.date) + " · " + (last.venue || "—");
      })(), netClass(Store.derive(closed[closed.length - 1]).winLoss))
    ]));
  }

  function stat(label, value, sub, cls) {
    return el("div", { class: "stat" }, [
      el("div", { class: "label", text: label }),
      el("div", { class: "value " + (cls || ""), text: value }),
      sub ? el("div", { class: "sub", text: sub }) : null
    ]);
  }

  function startClock(open) {
    stopClock();
    var began = new Date(open.start).getTime();
    var paint = function () {
      var node = document.getElementById("live-clock");
      if (!node) return stopClock();
      node.textContent = clockText(Date.now() - began);
    };
    paint();
    state.tick = setInterval(paint, 1000);
  }
  function stopClock() { if (state.tick) { clearInterval(state.tick); state.tick = null; } }

  /* ===== banners ===== */

  function renderBanners() {
    var box = clear($("#banners"));
    var open = Store.running(state.sessions);

    // The forgotten color-up is the expected case, not the exception. It asks;
    // it never closes the session behind your back.
    if (open) {
      var hrs = (Date.now() - new Date(open.start).getTime()) / 3600000;
      if (hrs > 6) {
        box.appendChild(el("button", { class: "banner loud", onclick: function () { colorUp(open); } }, [
          el("strong", { text: "Still running after " + hoursText(hrs) + "." }),
          el("span", { text: "Started " + timeText(open.start) + " on " + dayText(open.date) +
                             ". If you already finished, color up and set the time you actually left." })
        ]));
      }
    }

    var un = state.sessions.filter(function (s) { return !s.synced && !(s.start && !s.end); });
    if (un.length) {
      var oldest = un.reduce(function (a, b) { return (a.updated < b.updated) ? a : b; });
      var days = (Date.now() - oldest.updated) / 86400000;
      box.appendChild(el("button", {
        class: "banner " + (days > 1 ? "loud" : "warn"),
        onclick: function () { show("data"); }
      }, [
        el("strong", { text: un.length + (un.length === 1 ? " session" : " sessions") + " not backed up." }),
        el("span", { text: days > 1
          ? "The oldest has been on this phone alone for " + Math.floor(days) + " days. Export a backup."
          : "Export a backup when you have a signal." })
      ]));
    }

    // A number on the app icon is the only reminder that survives the app being
    // closed for six months, which is exactly the gap this has to cover.
    try {
      if (navigator.setAppBadge) {
        if (un.length) navigator.setAppBadge(un.length);
        else if (navigator.clearAppBadge) navigator.clearAppBadge();
      }
    } catch (e) { /* not supported, or permission never granted */ }
  }

  /* ===== the Log tab ===== */

  function sessionRow(s) {
    var d = Store.derive(s);
    var openNow = s.start && !s.end;
    var date = s.date ? new Date(s.date + "T00:00:00") : null;
    return el("button", { class: "session" + (openNow ? " open" : ""),
                          onclick: function () { editSession(s); } }, [
      el("div", { class: "day" }, [
        el("b", { text: date ? String(date.getDate()) : "?" }),
        date ? MONTHS[date.getMonth()] : ""
      ]),
      el("div", { class: "mid" }, [
        el("div", { class: "top", text: s.venue || "No venue" }),
        el("div", { class: "bot", text: [
          s.detail || s.game,
          d.hours !== null ? hoursText(d.hours) : null,
          d.coinIn !== null ? money(d.coinIn) + " in play" : null
        ].filter(Boolean).join(" · ") }),
        d.handpayCount ? el("div", { class: "flag",
          text: d.handpayCount + " W-2G · " + money(d.handpayTotal) }) : null
      ]),
      openNow
        ? el("div", { class: "net muted", text: "open" })
        : el("div", { class: "net " + netClass(d.winLoss), text: money(d.winLoss, { sign: true }) }, [
            d.perHour !== null ? el("small", { text: money(d.perHour, { sign: true }) + "/h" }) : null
          ])
    ]);
  }

  function renderLog() {
    var list = clear($("#log-list"));
    if (!state.sessions.length) {
      list.appendChild(el("p", { class: "empty", text: "Nothing logged yet." }));
      return;
    }
    // Newest first: the row you want is almost always the one you just closed.
    var byMonth = {};
    state.sessions.forEach(function (s) {
      var k = (s.date || "0000-00").slice(0, 7);
      (byMonth[k] = byMonth[k] || []).push(s);
    });
    Object.keys(byMonth).sort().reverse().forEach(function (k) {
      var rows = byMonth[k].slice().reverse();
      var t = Analysis.totals(rows.filter(function (s) { return !(s.start && !s.end); }));
      var parts = k.split("-");
      list.appendChild(el("div", { class: "month-head" }, [
        el("span", { text: (MONTHS[parseInt(parts[1], 10) - 1] || "?") + " " + parts[0] }),
        el("span", { class: netClass(t.winLoss),
                     text: money(t.winLoss, { sign: true }) + " · " + hoursText(t.hours) })
      ]));
      rows.forEach(function (s) { list.appendChild(sessionRow(s)); });
    });
  }

  /* ===== the Stats tab ===== */

  function renderStats() {
    var box = clear($("#stats-filters"));
    var closed = state.sessions.filter(function (s) { return !(s.start && !s.end); });

    function picker(key, label, values) {
      var sel = el("select", { onchange: function () {
        state.filters[key] = sel.value || null;
        renderStats();
      } });
      sel.appendChild(el("option", { value: "", text: label }));
      values.forEach(function (v) {
        var o = el("option", { value: v, text: v });
        if (state.filters[key] === v) o.selected = true;
        sel.appendChild(o);
      });
      return sel;
    }
    var uniq = function (field) {
      var seen = {};
      closed.forEach(function (s) { if (s[field]) seen[s[field]] = 1; });
      return Object.keys(seen).sort();
    };
    box.appendChild(picker("year", "All years", Analysis.years(closed)));
    box.appendChild(picker("game", "All games", uniq("game")));
    box.appendChild(picker("venue", "All venues", uniq("venue")));

    var rows = Analysis.filter(closed, state.filters);
    var body = clear($("#stats-body"));
    if (!rows.length) {
      body.appendChild(el("p", { class: "empty", text: "Nothing matches that." }));
      return;
    }
    var t = Analysis.totals(rows);

    body.appendChild(el("div", { class: "stat-grid" }, [
      stat("Win / (loss)", money(t.winLoss, { sign: true }), t.sessions + " sessions", netClass(t.winLoss)),
      stat("Per hour", t.perHour === null ? "—" : money(t.perHour, { sign: true }),
           hoursText(t.hours), netClass(t.perHour)),
      stat("Coin in", money(t.coinIn), t.coinInEstimated ? money(t.coinInEstimated) + " pit estimated" : "measured"),
      stat("Hold", t.hold === null ? "—" : pct(t.hold, 2),
           t.hold === null ? "" : "house kept " + pct(t.hold, 2) + " of coin in",
           t.hold === null ? "" : (t.hold > 0 ? "down" : "up")),
      stat("Sessions won", t.winners + " of " + t.sessions,
           t.winRate === null ? "" : pct(t.winRate, 0)),
      stat("Hands / hour", t.handsPerHour === null ? "—" : count(t.handsPerHour),
           t.coinInPerHour === null ? "" : money(t.coinInPerHour) + " through the machine")
    ]));

    if (t.coverage.hours < 1 || t.coverage.coinIn < 1) {
      body.appendChild(el("p", { class: "note",
        text: "Rates use only the sessions that can supply them: " +
              pct(t.coverage.hours, 0) + " of these are timed and " +
              pct(t.coverage.coinIn, 0) + " have a coin-in figure." }));
    }

    // Not netted, because winnings and losses are not netted on a return.
    var year = state.filters.year;
    if (year) {
      var tax = Analysis.tax(closed, year);
      body.appendChild(el("h3", { text: "For the return — " + year }));
      body.appendChild(el("div", { class: "stat-grid" }, [
        stat("Winning sessions", money(tax.grossWin), "reported as income"),
        stat("Losing sessions", money(tax.grossLoss), "itemised deduction, capped at winnings"),
        stat("W-2G handpays", money(tax.handpayTotal), tax.handpayCount + " forms to reconcile"),
        stat("Withheld", money(tax.handpayWithheld), "already paid in")
      ]));
      body.appendChild(el("p", { class: "note",
        text: "These do not net. The two totals are reported separately, so " +
              money(tax.net, { sign: true }) + " is a figure to check the record against, not one to file." }));
    }

    [["game", "By game"], ["venue", "By venue"]].forEach(function (pair) {
      var groups = Analysis.by(rows, pair[0]);
      if (groups.length < 2) return;
      body.appendChild(el("h3", { text: pair[1] }));
      body.appendChild(breakdown(groups));
    });

    var months = Analysis.byMonth(rows);
    if (months.length > 1) {
      body.appendChild(el("h3", { text: "By month" }));
      body.appendChild(breakdown(months.slice().reverse(), true));
    }

    if (t.best) {
      body.appendChild(el("h3", { text: "Extremes" }));
      body.appendChild(sessionRow(t.best));
      body.appendChild(sessionRow(t.worst));
      if (t.longest && t.longest.id !== t.best.id && t.longest.id !== t.worst.id) {
        body.appendChild(sessionRow(t.longest));
      }
    }
  }

  function breakdown(groups, isMonth) {
    var table = el("table");
    table.appendChild(el("thead", {}, [el("tr", {}, [
      el("th", { text: isMonth ? "Month" : "" }),
      el("th", { text: "N" }), el("th", { text: "Hours" }),
      el("th", { text: "Win/(loss)" }), el("th", { text: "$/h" })
    ])]));
    var tb = el("tbody");
    groups.forEach(function (g) {
      var t = g.totals;
      var name = g.key;
      if (isMonth && /^\d{4}-\d{2}$/.test(g.key)) {
        var p = g.key.split("-");
        name = MONTHS[parseInt(p[1], 10) - 1] + " " + p[0];
      }
      tb.appendChild(el("tr", {}, [
        el("td", { text: name }),
        el("td", { class: "num", text: String(t.sessions) }),
        el("td", { class: "num", text: t.hours ? t.hours.toFixed(1) : "—" }),
        el("td", { class: "num " + netClass(t.winLoss), text: money(t.winLoss, { sign: true }) }),
        el("td", { class: "num " + netClass(t.perHour),
                   text: t.perHour === null ? "—" : money(t.perHour, { sign: true }) })
      ]));
    });
    table.appendChild(tb);
    return el("div", { class: "table-scroll" }, [table]);
  }

  /* ===== the Data tab ===== */

  function renderData() {
    var box = clear($("#data-body"));
    var un = state.sessions.filter(function (s) { return !s.synced; });

    box.appendChild(el("div", { class: "stat-grid" }, [
      stat("Sessions", String(state.sessions.length), "on this device"),
      stat("Not backed up", String(un.length), un.length ? "export to clear" : "all safe",
           un.length ? "down" : "up")
    ]));

    box.appendChild(el("h3", { text: "Take a copy" }));
    box.appendChild(el("p", { class: "note",
      text: "The JSON file is the backup: it restores exactly, and exporting it marks these sessions as safe. The spreadsheet is the readable version — it is generated from the same data and is not read back in." }));
    box.appendChild(el("div", { class: "row-actions" }, [
      el("button", { class: "btn primary wide", text: "Back up (.json)", onclick: exportJson }),
      el("button", { class: "btn wide", text: "Spreadsheet (.xlsx)", onclick: exportXlsx })
    ]));

    box.appendChild(el("h3", { text: "Restore or merge" }));
    box.appendChild(el("p", { class: "note",
      text: "Reads a backup and merges it in: sessions this device has never seen are added, and where both have the same session the newer edit wins. Nothing is deleted." }));
    var file = el("input", { type: "file", accept: ".json,application/json", style: "display:none" });
    file.addEventListener("change", function () {
      if (file.files && file.files[0]) importJson(file.files[0]);
      file.value = "";
    });
    box.appendChild(file);
    box.appendChild(el("div", { class: "row-actions" }, [
      el("button", { class: "btn wide", text: "Import a backup", onclick: function () { file.click(); } })
    ]));

    if (navigator.setAppBadge && typeof Notification !== "undefined") {
      box.appendChild(el("h3", { text: "Reminder" }));
      box.appendChild(el("p", { class: "note",
        text: "iOS will show a count on the app icon for sessions that are not backed up, but only once notifications are allowed. Nothing is ever sent anywhere — the number is drawn locally." }));
      box.appendChild(el("div", { class: "row-actions" }, [
        el("button", { class: "btn wide", text: "Allow the badge", onclick: askForBadge })
      ]));
    }

    box.appendChild(el("h3", { text: "Where this lives" }));
    box.appendChild(el("p", { class: "note",
      text: "Everything is stored in this browser, on this device, and is never sent anywhere. Adding the app to your home screen is what keeps the data from being cleared out after a week of not opening it." }));
  }

  // Older Safari passes the answer to a callback and returns nothing, so the
  // promise form has to be treated as the optional one.
  function askForBadge() {
    var done = function () { refresh(); };
    try {
      var p = Notification.requestPermission(done);
      if (p && p.then) p.then(done);
    } catch (e) { done(); }
  }

  function exportJson() {
    var text = Backup.json(state.sessions);
    download(Backup.filename(state.sessions, "json"), text, "application/json");
    Store.markSynced(state.sessions.map(function (s) { return s.id; }))
      .then(function () { return Store.meta("lastBackup", Date.now()); })
      .then(function () { toast("Backed up."); refresh(); });
  }

  function exportXlsx() {
    var bytes = Backup.workbook(state.sessions);
    download(Backup.filename(state.sessions, "xlsx"), bytes,
             "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    toast("Spreadsheet written. It is a copy, not a backup.");
  }

  function importJson(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var parsed;
      try { parsed = Backup.parse(String(reader.result)); }
      catch (e) { return toast(e.message, true); }

      var merged = Backup.merge(state.sessions, parsed.sessions);
      if (!merged.added && !merged.updated) return toast("Nothing new in that file.");
      if (!confirm("Add " + merged.added + " session(s) and update " + merged.updated + "?")) return;

      Store.replaceAll(merged.sessions).then(function () {
        toast("Imported " + merged.added + " new, updated " + merged.updated + "." +
              (parsed.note ? " " + parsed.note : ""));
        refresh();
      });
    };
    reader.onerror = function () { toast("Could not read that file.", true); };
    reader.readAsText(file);
  }

  /* ===== wiring ===== */

  function fillList(id, values) {
    var box = clear(document.getElementById(id));
    values.forEach(function (v) { box.appendChild(el("option", { value: v })); });
  }

  function show(tab) {
    state.tab = tab;
    Array.prototype.forEach.call(document.querySelectorAll(".nav-link"), function (a) {
      a.classList.toggle("active", a.getAttribute("data-tab") === tab);
    });
    Array.prototype.forEach.call(document.querySelectorAll(".tab-content"), function (s) {
      s.classList.toggle("active", s.id === tab);
    });
    if (tab === "stats") renderStats();
    if (tab === "data") renderData();
    window.scrollTo(0, 0);
  }

  function refresh() {
    return Store.all().then(function (rows) {
      state.sessions = rows;
      fillList("venues", Store.seen(rows, "venue"));
      fillList("details", Store.seen(rows, "detail"));
      fillList("locations", Store.seen(rows, "location"));
      renderBanners();
      renderNow();
      renderLog();
      if (state.tab === "stats") renderStats();
      if (state.tab === "data") renderData();
    });
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll(".nav-link"), function (a) {
      a.addEventListener("click", function (e) { e.preventDefault(); show(a.getAttribute("data-tab")); });
    });
    $("#sheet-close").addEventListener("click", closeSheet);
    $("#sheet-backdrop").addEventListener("click", function (e) {
      // Only a tap on the backdrop itself closes: losing a half-typed session
      // to a stray touch inside the form would be unforgivable.
      if (e.target === $("#sheet-backdrop")) closeSheet();
    });
    $("#log-add").addEventListener("click", addPastSession);
    $("#sheet-body").addEventListener("submit", function (e) { e.preventDefault(); });

    if (location.hash && document.getElementById(location.hash.slice(1))) show(location.hash.slice(1));

    // Coming back after hours in a pocket: the clock and the banners are stale.
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) refresh();
    });

    refresh().catch(function (e) {
      document.getElementById("now-card").appendChild(
        el("p", { class: "empty", text: "Could not open the local database: " + e.message })
      );
    });
  }

  return { init: init, refresh: refresh, show: show };
})();

document.addEventListener("DOMContentLoaded", App.init);
