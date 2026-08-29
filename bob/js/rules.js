/**
 * Bettor or Bust — Rule sets
 *
 * Blackjack has no pay table; it has a rule set, and the rule set plays the
 * same role. Every number the app reports — basic strategy, house edge, the
 * cost of a decision — is a function of these fields, so they are the single
 * input everything else reads.
 */

var BJRules = (function () {
  "use strict";

  // Doubling restrictions, narrowest last.
  var DOUBLE_ANY = "any";        // any two cards
  var DOUBLE_9_11 = "9-11";
  var DOUBLE_10_11 = "10-11";

  var DEFAULTS = {
    decks: 6,
    csm: false,          // continuous shuffler: every hand sees a full shoe
    h17: false,          // dealer hits soft 17
    das: true,           // double after split
    doubleOn: DOUBLE_ANY,
    resplitTo: 4,        // maximum hands from one split
    resplitAces: false,
    hitSplitAces: false, // split aces normally get exactly one card
    surrender: "none",   // "none" | "late"
    blackjackPays: 1.5,  // 1.5 = 3:2, 1.2 = 6:5
    peek: true           // dealer checks for blackjack before the player acts
  };

  function make(overrides) {
    var r = {}, k;
    for (k in DEFAULTS) if (DEFAULTS.hasOwnProperty(k)) r[k] = DEFAULTS[k];
    for (k in (overrides || {})) if (overrides.hasOwnProperty(k)) r[k] = overrides[k];
    return r;
  }

  // A rule set's identity for caching. Only fields that change a computed
  // number belong here.
  function key(r) {
    return [r.decks, r.csm ? "csm" : "shoe", r.h17 ? "h17" : "s17",
            r.das ? "das" : "ndas", r.doubleOn, r.resplitTo,
            r.resplitAces ? "rsa" : "nrsa", r.hitSplitAces ? "hsa" : "nhsa",
            r.surrender, r.blackjackPays, r.peek ? "peek" : "enhc"].join("/");
  }

  // Presets. The Reno ones are what's actually on the floor at the properties
  // in the video poker app's casino list; verify at the table before sitting.
  var PRESETS = [
    { key: "vegas-6-s17", name: "6 deck, S17, DAS, LS",
      note: "The common Strip game. Best widely available shoe rules.",
      rules: make({ decks: 6, h17: false, das: true, surrender: "late" }) },
    { key: "vegas-6-h17", name: "6 deck, H17, DAS, LS",
      note: "Same but the dealer hits soft 17 — costs about 0.2%.",
      rules: make({ decks: 6, h17: true, das: true, surrender: "late" }) },
    { key: "reno-2-h17", name: "2 deck, H17, DAS",
      note: "Typical northern Nevada double deck.",
      rules: make({ decks: 2, h17: true, das: true }) },
    { key: "single-h17", name: "1 deck, H17, no DAS",
      note: "Fewer decks is worth less than it looks once H17 and no DAS land.",
      rules: make({ decks: 1, h17: true, das: false }) },
    { key: "six-five", name: "6 deck, H17, DAS — blackjack pays 6:5",
      note: "The 6:5 payout costs about 1.4%. Included to show the damage.",
      rules: make({ decks: 6, h17: true, das: true, blackjackPays: 1.2 }) },
    { key: "csm-6-h17", name: "6 deck CSM, H17, DAS",
      note: "A continuous shuffler deals every hand from a full shoe.",
      rules: make({ decks: 6, csm: true, h17: true, das: true }) }
  ];

  function preset(k) {
    for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].key === k) return PRESETS[i];
    return null;
  }

  return {
    DEFAULTS: DEFAULTS,
    DOUBLE_ANY: DOUBLE_ANY,
    DOUBLE_9_11: DOUBLE_9_11,
    DOUBLE_10_11: DOUBLE_10_11,
    PRESETS: PRESETS,
    make: make,
    key: key,
    preset: preset
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = BJRules;
