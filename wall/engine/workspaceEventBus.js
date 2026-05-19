(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── WorkspaceEventBus (0518B_WOS_WorkspaceEventBus_v1.0.0) ────────────────
  // Synchronous, namespaced, traceable event bus. All WOS events route here.
  // The bus owns no state, queues no logic, and orchestrates nothing.
  //
  // Naming convention: "namespace:event"  e.g. "surface:created"
  // Canonical namespaces: surface:, workspace:, runtime:, viewport:
  // Payloads are stable objects; emit AFTER mutations, never before.

  var _listeners    = new Map();
  var _traceEnabled = false;

  function on(event, handler) {
    if (!_listeners.has(event)) _listeners.set(event, []);
    _listeners.get(event).push(handler);
    return function unsubscribe() { off(event, handler); };
  }

  function off(event, handler) {
    var arr = _listeners.get(event);
    if (!arr) return;
    var idx = arr.indexOf(handler);
    if (idx !== -1) arr.splice(idx, 1);
  }

  function emit(event, payload) {
    if (_traceEnabled) console.log("[EventBus]", event, payload);
    var arr = _listeners.get(event);
    if (!arr || arr.length === 0) return;
    for (var i = 0; i < arr.length; i++) {
      try { arr[i](payload); }
      catch (err) { console.error("[EventBus] listener error:", event, err); }
    }
  }

  function once(event, handler) {
    function wrapper(payload) { off(event, wrapper); handler(payload); }
    on(event, wrapper);
  }

  function clear(event) {
    if (event) { _listeners.delete(event); return; }
    _listeners.clear();
  }

  function listEvents()        { return Array.from(_listeners.keys()); }
  function listenerCount(event) {
    var arr = _listeners.get(event);
    return arr ? arr.length : 0;
  }
  function setTracing(enabled) { _traceEnabled = !!enabled; }

  SBE.WorkspaceEventBus = {
    on: on, off: off, once: once, emit: emit,
    clear: clear, listEvents: listEvents, listenerCount: listenerCount,
    setTracing: setTracing,
  };

})(window);
