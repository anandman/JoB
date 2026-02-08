/**
 * Jacks or Betterment — Strategy engine
 * Computes per-category EVs via exhaustive draw enumeration,
 * then produces optimal (~30 entry) and simple (~14 entry) strategies.
 */

var StrategyEngine = (function () {
  "use strict";

  var evaluateHand = Poker.evaluateHand;

  // Cache: payouts key → { optimal: [...], simple: [...] }
  var cache = {};

  /**
   * Compute expected value of holding specific cards and drawing the rest.
   * @param {number[]} held - card integers to hold
   * @param {number[]} deck - remaining deck (52 minus the 5 dealt cards)
   * @param {number[]} payouts - 9-element payout array (index matches HAND_NAMES)
   * @returns {number} average payout per coin wagered
   */
  function computeHoldEV(held, deck, payouts) {
    var numDraw = 5 - held.length;
    var n = deck.length;
    var totalPayout = 0;
    var combos = 0;

    if (numDraw === 0) {
      // Pat hand — just evaluate once
      var result = evaluateHand(held[0], held[1], held[2], held[3], held[4]);
      return result >= 0 ? payouts[result] : 0;
    }

    if (numDraw === 1) {
      // Hold 4, draw 1: C(47,1) = 47
      for (var a = 0; a < n; a++) {
        var r = evaluateHand(held[0], held[1], held[2], held[3], deck[a]);
        if (r >= 0) totalPayout += payouts[r];
      }
      combos = n;
    } else if (numDraw === 2) {
      // Hold 3, draw 2: C(47,2) = 1081
      for (var a = 0; a < n - 1; a++) {
        for (var b = a + 1; b < n; b++) {
          var r = evaluateHand(held[0], held[1], held[2], deck[a], deck[b]);
          if (r >= 0) totalPayout += payouts[r];
        }
      }
      combos = n * (n - 1) / 2;
    } else if (numDraw === 3) {
      // Hold 2, draw 3: C(47,3) = 16215
      for (var a = 0; a < n - 2; a++) {
        for (var b = a + 1; b < n - 1; b++) {
          for (var c = b + 1; c < n; c++) {
            var r = evaluateHand(held[0], held[1], deck[a], deck[b], deck[c]);
            if (r >= 0) totalPayout += payouts[r];
          }
        }
      }
      combos = n * (n - 1) * (n - 2) / 6;
    } else if (numDraw === 4) {
      // Hold 1, draw 4: C(47,4) = 178365
      for (var a = 0; a < n - 3; a++) {
        for (var b = a + 1; b < n - 2; b++) {
          for (var c = b + 1; c < n - 1; c++) {
            for (var d = c + 1; d < n; d++) {
              var r = evaluateHand(held[0], deck[a], deck[b], deck[c], deck[d]);
              if (r >= 0) totalPayout += payouts[r];
            }
          }
        }
      }
      combos = n * (n - 1) * (n - 2) * (n - 3) / 24;
    } else {
      // Hold 0, draw 5: C(47,5) = 1533939
      for (var a = 0; a < n - 4; a++) {
        for (var b = a + 1; b < n - 3; b++) {
          for (var c = b + 1; c < n - 2; c++) {
            for (var d = c + 1; d < n - 1; d++) {
              for (var e = d + 1; e < n; e++) {
                var r = evaluateHand(deck[a], deck[b], deck[c], deck[d], deck[e]);
                if (r >= 0) totalPayout += payouts[r];
              }
            }
          }
        }
      }
      combos = n * (n - 1) * (n - 2) * (n - 3) * (n - 4) / 120;
    }

    return totalPayout / combos;
  }

  /**
   * Generate strategy for given payouts.
   * @param {number[]} payouts - 9-element payout array
   * @returns {{ optimal: Array, simple: Array }}
   */
  function generateStrategy(payouts) {
    var key = payouts.join(",");
    if (cache[key]) return cache[key];

    // Build a set of dealt cards for each category, compute EV
    var entries = [];
    for (var i = 0; i < STRATEGY_CATEGORIES.length; i++) {
      var cat = STRATEGY_CATEGORIES[i];
      var cards = cat.cards;

      // Build remaining deck: 52 cards minus the 5 dealt
      var inHand = {};
      for (var j = 0; j < 5; j++) inHand[cards[j]] = true;
      var remaining = [];
      for (var c = 0; c < 52; c++) {
        if (!inHand[c]) remaining.push(c);
      }

      // Extract held cards via holdMask
      var held = [];
      for (var j = 0; j < cat.holdMask.length; j++) {
        held.push(cards[cat.holdMask[j]]);
      }

      var ev = computeHoldEV(held, remaining, payouts);

      entries.push({
        id: cat.id,
        hold: cat.hold,
        tier: cat.tier,
        simpleGroup: cat.simpleGroup,
        ev: ev,
        note: null,
      });
    }

    // Sort by descending EV
    entries.sort(function (a, b) { return b.ev - a.ev; });

    // Apply note rules
    for (var i = 0; i < NOTE_RULES.length; i++) {
      var rule = NOTE_RULES[i];
      var targetIdx = -1;
      for (var j = 0; j < entries.length; j++) {
        if (entries[j].id === rule.target) { targetIdx = j; break; }
      }
      if (targetIdx < 0) continue;

      // Check if target is above ALL of the "above" entries
      var allAbove = true;
      for (var k = 0; k < rule.above.length; k++) {
        var aboveIdx = -1;
        for (var j = 0; j < entries.length; j++) {
          if (entries[j].id === rule.above[k]) { aboveIdx = j; break; }
        }
        if (aboveIdx >= 0 && aboveIdx <= targetIdx) {
          allAbove = false;
          break;
        }
      }
      if (allAbove) {
        entries[targetIdx].note = rule.note;
      }
    }

    // Optimal strategy: the sorted entries
    var optimal = [];
    for (var i = 0; i < entries.length; i++) {
      optimal.push({
        hold: entries[i].hold,
        tier: entries[i].tier,
        note: entries[i].note,
        ev: entries[i].ev,
      });
    }

    // Build id→ev lookup from computed entries
    var evById = {};
    for (var i = 0; i < entries.length; i++) {
      evById[entries[i].id] = entries[i].ev;
    }

    // Simple strategy: group by simpleGroup in definition order (A, B, C, ...)
    // The simpleGroup letters encode the canonical simple-strategy ordering.
    var groupMap = {};  // simpleGroup → { group, tier, ids[], evs[] }
    var groupOrder = []; // first-seen order from STRATEGY_CATEGORIES (alphabetical)
    for (var i = 0; i < STRATEGY_CATEGORIES.length; i++) {
      var cat = STRATEGY_CATEGORIES[i];
      var g = cat.simpleGroup;
      var catEV = evById[cat.id] || 0;
      if (!groupMap[g]) {
        groupMap[g] = { group: g, tier: cat.tier, ids: [cat.id], note: null, evs: [catEV] };
        groupOrder.push(g);
      } else {
        groupMap[g].ids.push(cat.id);
        groupMap[g].evs.push(catEV);
      }
    }
    // Sort each group's EVs descending and deduplicate
    for (var i = 0; i < groupOrder.length; i++) {
      var evs = groupMap[groupOrder[i]].evs;
      evs.sort(function (a, b) { return b - a; });
      // Deduplicate values that display identically (within 0.01)
      var unique = [evs[0]];
      for (var j = 1; j < evs.length; j++) {
        if (Math.abs(evs[j] - unique[unique.length - 1]) > 0.01) unique.push(evs[j]);
      }
      groupMap[groupOrder[i]].evs = unique;
    }

    // Apply note rules on group level: check if target group is above all "above" groups
    for (var i = 0; i < NOTE_RULES.length; i++) {
      var rule = NOTE_RULES[i];
      var targetGroup = null;
      for (var j = 0; j < STRATEGY_CATEGORIES.length; j++) {
        if (STRATEGY_CATEGORIES[j].id === rule.target) { targetGroup = STRATEGY_CATEGORIES[j].simpleGroup; break; }
      }
      if (!targetGroup || !groupMap[targetGroup]) continue;
      var targetIdx = groupOrder.indexOf(targetGroup);

      var allAbove = true;
      for (var k = 0; k < rule.above.length; k++) {
        var aboveGroup = null;
        for (var j = 0; j < STRATEGY_CATEGORIES.length; j++) {
          if (STRATEGY_CATEGORIES[j].id === rule.above[k]) { aboveGroup = STRATEGY_CATEGORIES[j].simpleGroup; break; }
        }
        if (!aboveGroup) continue;
        var aboveIdx = groupOrder.indexOf(aboveGroup);
        if (aboveIdx >= 0 && aboveIdx <= targetIdx) {
          allAbove = false;
          break;
        }
      }
      if (allAbove) {
        groupMap[targetGroup].note = rule.note;
      }
    }

    // Build simple strategy from groups in definition order
    var simple = [];
    for (var i = 0; i < groupOrder.length; i++) {
      var g = groupOrder[i];
      var gInfo = groupMap[g];
      var note = gInfo.note;
      // Apply static notes if no computed note
      if (!note && typeof STATIC_NOTES !== "undefined" && STATIC_NOTES[g]) {
        note = STATIC_NOTES[g];
      }
      simple.push({
        hold: mergeHoldNames(gInfo.ids, g),
        tier: gInfo.tier,
        note: note,
        evs: gInfo.evs,
      });
    }

    var result = { optimal: optimal, simple: simple };
    cache[key] = result;
    return result;
  }

  /**
   * Get display label for a simpleGroup. If the group has only one member,
   * returns that member's hold name; otherwise returns a predefined merge label.
   */
  function mergeHoldNames(ids, group) {
    // Predefined merge labels for multi-member groups
    var mergeLabels = {
      "A": "Pat Royal / Straight Flush / 4 of a Kind",
      "C": "Pat Full House / Flush / 3 of a Kind",
      "E": "4 to a Straight Flush",
      "F": "Two Pair / High Pair (J\u2013A)",
      "K": "2 Suited High Cards / 3 to a Straight Flush",
      "L": "2 Unsuited High Cards",
      "M": "Suited 10\u2013J/Q/K / Single High Card",
    };

    if (ids.length === 1) {
      // Single member: look up its hold name from STRATEGY_CATEGORIES
      for (var i = 0; i < STRATEGY_CATEGORIES.length; i++) {
        if (STRATEGY_CATEGORIES[i].id === ids[0]) return STRATEGY_CATEGORIES[i].hold;
      }
    }

    if (mergeLabels[group]) return mergeLabels[group];

    // Fallback: look up hold names and join
    var names = [];
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < STRATEGY_CATEGORIES.length; j++) {
        if (STRATEGY_CATEGORIES[j].id === ids[i]) { names.push(STRATEGY_CATEGORIES[j].hold); break; }
      }
    }
    return names.join(" / ");
  }

  return {
    computeHoldEV: computeHoldEV,
    generateStrategy: generateStrategy,
  };
})();
