// 0511_WOS_FoundationProtocols_HumanAquarium_v1.0.0
// Comms System — sparse state-driven text communication for WOS worlds.
// Vanilla IIFE. Attaches to SBE.CommsSystem.
// Load order: universalClock.js → environmentState.js → agentNeeds.js → commsSystem.js → …
//
// ═══════════════════════════════════════════════════════════════════════════
// DESIGN PRINCIPLE
//   All messages must emerge from:
//     1. State — weather threshold crossed, need gone critical, location reached
//     2. Need  — agent requires fuel, food, rest
//     3. Timing — schedule event, arrival, departure
//
//   NOT from random AI chatter.
//
// MESSAGE TYPES
//   weather_warning  — environment threshold crossed
//   fuel_payment     — agent transaction at gas station
//   agent_message    — agent-to-agent or agent sparse thought
//   system_alert     — world event (route closed, delay, etc.)
//   arrival          — actor reached destination
//   need_critical    — need crossed critical threshold
//
// TRIGGER SYSTEM
//   checkTriggers() scans world state each frame (cheap — debounced per
//   trigger key). Only fires once per trigger-key per world event.
//
// PERSIST: messages (last 50), _firedTriggers
// NEVER PERSIST: _checkTimerSec (runtime debounce)
// ═══════════════════════════════════════════════════════════════════════════

(function initCommsSystem(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── Constants ─────────────────────────────────────────────────────────────
  var MAX_HISTORY   = 200;   // in-memory cap
  var PERSIST_COUNT = 50;    // serialized cap
  var CHECK_INTERVAL = 2.0;  // real-seconds between trigger evaluations

  // ── Message factory ───────────────────────────────────────────────────────
  var _nextId = 1;
  function _makeId() { return "msg_" + (_nextId++); }

  function _makeMessage(source, text, type, worldSec) {
    return {
      id:       _makeId(),
      source:   source || "system",
      text:     text   || "",
      type:     type   || "system_alert",
      worldSec: typeof worldSec === "number" ? worldSec : 0,
      readAt:   null,   // null = unread
    };
  }

  // ── Comms store factory ───────────────────────────────────────────────────
  function makeCommsStore() {
    return {
      // ── Persistent ──────────────────────────────────────────────────────
      messages:      [],          // [Message], newest at end
      _firedTriggers: {},         // { triggerKey: true } — prevents re-firing

      // ── Runtime ─────────────────────────────────────────────────────────
      _checkTimerSec: 0,
    };
  }

  // ── Add message ───────────────────────────────────────────────────────────
  function addMessage(store, source, text, type, clock) {
    var worldSec = clock && SBE.UniversalClock ? SBE.UniversalClock.getWorldSec(clock) : 0;
    var msg = _makeMessage(source, text, type, worldSec);
    store.messages.push(msg);
    if (store.messages.length > MAX_HISTORY) {
      store.messages.splice(0, store.messages.length - MAX_HISTORY);
    }
    return msg;
  }

  // ── Query ─────────────────────────────────────────────────────────────────
  function getRecent(store, n) {
    var msgs = store.messages;
    return msgs.slice(Math.max(0, msgs.length - (n || 10)));
  }

  function getUnread(store) {
    return store.messages.filter(function (m) { return m.readAt === null; });
  }

  function markRead(store, msgId) {
    var msg = store.messages.find(function (m) { return m.id === msgId; });
    if (msg) msg.readAt = Date.now();
  }

  function markAllRead(store) {
    var now = Date.now();
    store.messages.forEach(function (m) { if (!m.readAt) m.readAt = now; });
  }

  // ── Trigger system ────────────────────────────────────────────────────────
  // Checks world state and auto-generates messages when conditions are met.
  // Debounced: only runs at most every CHECK_INTERVAL real-seconds.
  // dt: real-time delta seconds
  function checkTriggers(store, world, env, clock, actors, dt) {
    store._checkTimerSec = (store._checkTimerSec || 0) + dt;
    if (store._checkTimerSec < CHECK_INTERVAL) return;
    store._checkTimerSec = 0;

    var AN = SBE.AgentNeeds;
    var ES = SBE.EnvironmentState;

    // ── Weather triggers ──────────────────────────────────────────────────
    if (env) {
      // Heavy rain onset
      if (env.weatherType === "heavy_rain" && !store._firedTriggers["weather:heavy_rain"]) {
        store._firedTriggers["weather:heavy_rain"] = true;
        delete store._firedTriggers["weather:clear"];  // allow re-fire if it clears
        addMessage(store, "radio", "Heavy rain northbound. Reduce speed.", "weather_warning", clock);
      }
      // Fog onset
      if (env.weatherType === "fog" && !store._firedTriggers["weather:fog"]) {
        store._firedTriggers["weather:fog"] = true;
        addMessage(store, "radio", "Dense fog advisory. Headlights on.", "weather_warning", clock);
      }
      // Snow onset
      if (env.weatherType === "snow" && !store._firedTriggers["weather:snow"]) {
        store._firedTriggers["weather:snow"] = true;
        addMessage(store, "radio", "Snow conditions. Chain control in effect.", "weather_warning", clock);
      }
      // Clear recovery
      if (env.weatherType === "clear" && !store._firedTriggers["weather:clear"] &&
          (store._firedTriggers["weather:heavy_rain"] || store._firedTriggers["weather:fog"])) {
        store._firedTriggers["weather:clear"] = true;
        delete store._firedTriggers["weather:heavy_rain"];
        delete store._firedTriggers["weather:fog"];
        addMessage(store, "radio", "Weather clearing. Conditions improving.", "weather_warning", clock);
      }
    }

    // ── Agent need triggers ────────────────────────────────────────────────
    if (actors && AN) {
      actors.forEach(function (actor) {
        if (!actor || !actor.needs) return;
        var id = actor.id || "agent";

        // Fuel critical
        var fuelKey = "need_critical:fuel:" + id;
        if (!store._firedTriggers[fuelKey] && AN.isNeedCritical(actor, "fuel")) {
          store._firedTriggers[fuelKey] = true;
          addMessage(store, id, "Low fuel. Finding next station.", "need_critical", clock);
        } else if (actor.needs.fuel > AN.THRESHOLD.warning + 0.1) {
          delete store._firedTriggers[fuelKey];  // reset so it can fire again after refuel
        }

        // Hunger critical
        var hungerKey = "need_critical:hunger:" + id;
        if (!store._firedTriggers[hungerKey] && AN.isNeedCritical(actor, "hunger")) {
          store._firedTriggers[hungerKey] = true;
          addMessage(store, id, "Need food.", "need_critical", clock);
        } else if (actor.needs.hunger > AN.THRESHOLD.warning + 0.1) {
          delete store._firedTriggers[hungerKey];
        }

        // Energy critical
        var energyKey = "need_critical:energy:" + id;
        if (!store._firedTriggers[energyKey] && AN.isNeedCritical(actor, "energy")) {
          store._firedTriggers[energyKey] = true;
          addMessage(store, id, "Pulling over to rest.", "need_critical", clock);
        } else if (actor.needs.energy > AN.THRESHOLD.warning + 0.1) {
          delete store._firedTriggers[energyKey];
        }
      });
    }

    // ── Time-of-day triggers ───────────────────────────────────────────────
    if (clock && SBE.UniversalClock) {
      var d = SBE.UniversalClock.getDerived(clock);
      var h = d.hour;

      var dawnKey = "time:dawn:" + Math.floor(d.totalDay);
      if (h >= 6 && h < 6.5 && !store._firedTriggers[dawnKey]) {
        store._firedTriggers[dawnKey] = true;
        addMessage(store, "world", "Dawn.", "system_alert", clock);
      }
      var duskKey = "time:dusk:" + Math.floor(d.totalDay);
      if (h >= 19 && h < 19.5 && !store._firedTriggers[duskKey]) {
        store._firedTriggers[duskKey] = true;
        addMessage(store, "world", "Dusk.", "system_alert", clock);
      }
    }
  }

  // ── Manual event helpers ──────────────────────────────────────────────────
  function logFuelPayment(store, actorId, amount, clock) {
    var text = "$" + (Math.round(amount * 100) / 100).toFixed(2) + " on pump.";
    return addMessage(store, actorId || "pump", text, "fuel_payment", clock);
  }

  function logArrival(store, actorId, destinationName, clock) {
    var text = "Arrived: " + (destinationName || "destination") + ".";
    return addMessage(store, actorId || "agent", text, "arrival", clock);
  }

  // ── Serialization ─────────────────────────────────────────────────────────
  function serializeComms(store) {
    var recent = store.messages.slice(-PERSIST_COUNT);
    return {
      messages:       recent,
      _firedTriggers: Object.assign({}, store._firedTriggers),
    };
  }

  function rehydrateComms(saved) {
    var s = makeCommsStore();
    if (saved) {
      s.messages        = Array.isArray(saved.messages) ? saved.messages.slice() : [];
      s._firedTriggers  = saved._firedTriggers ? Object.assign({}, saved._firedTriggers) : {};
      // Re-sync _nextId so new IDs don't collide with loaded ones
      s.messages.forEach(function (m) {
        if (m.id) {
          var n = parseInt(m.id.replace("msg_", ""), 10);
          if (n >= _nextId) _nextId = n + 1;
        }
      });
    }
    return s;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  SBE.CommsSystem = {
    makeCommsStore:  makeCommsStore,
    addMessage:      addMessage,
    getRecent:       getRecent,
    getUnread:       getUnread,
    markRead:        markRead,
    markAllRead:     markAllRead,
    checkTriggers:   checkTriggers,
    logFuelPayment:  logFuelPayment,
    logArrival:      logArrival,
    serializeComms:  serializeComms,
    rehydrateComms:  rehydrateComms,
    // Constants
    CHECK_INTERVAL:  CHECK_INTERVAL,
    PERSIST_COUNT:   PERSIST_COUNT,
  };

  console.log("[WOS CommsSystem] Loaded — Foundation Protocols v1.0.0");
})(window);
