// 0512_WOS_DrawerContentSystem_v1.0.0
// SBE.Events — minimal synchronous event bus for WOS drawer systems.
// Vanilla IIFE. Attaches to window.SBE.Events.
//
// Distinct from engine/eventBus.js (SBE.EventBus — audio collision events).
// SBE.Events is for UI/system event routing:
//   drawer → world, glyph:insert, sampler:bank-selected, etc.
//
// No dependencies. No framework. No async abstractions.
// Load order: events.js → drawer registrations → controls.js

(function initEvents(global) {
  "use strict";

  const SBE = (global.SBE = global.SBE || {});

  var _listeners = {};

  function on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
  }

  function off(event, fn) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(function (x) { return x !== fn; });
  }

  function emit(event, payload) {
    var fns = _listeners[event];
    if (!fns || !fns.length) return;
    fns.forEach(function (fn) {
      try {
        fn(payload);
      } catch (e) {
        console.error("[SBE.Events] handler error on '" + event + "':", e);
      }
    });
  }

  SBE.Events = { on: on, off: off, emit: emit };

  console.log("[WOS Events] Loaded — SBE.Events bus v1.0.0");

})(window);
