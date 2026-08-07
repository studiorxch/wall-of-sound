// ── OverlayStyleAuthority v1.0.0 ──────────────────────────────────────────────
// 0729D_MAPS_Vehicle_Overlay_Libraries_Foundation
// Status: active | Classification: presentation-authority / overlay-style-authority
//
// Single source of truth for the Overlays library: 4 real, separately-named
// records (Atmosphere Composite, Environmental Telemetry HUD, Now Playing
// HUD, Flight Data HUD), their live field values, edits, and cross-tab sync.
//
// No Default/variant concept, same as VehicleStyleAuthority — each overlay
// object IS its own record; editing a field edits that overlay directly and
// persists so the edit survives a reload. getRegistry() always returns
// record-shaped data from overlayStyleRegistry.js.
//
// Authority boundary:
//   OWNS: applying an edited field value to its real source object (via
//         OverlayStyleApplyAdapters) and persisting it for reload/cross-tab.
//   READS: OverlayStyleRegistry (record + field discovery).
//   WRITES: localStorage (wos:overlayStyle:values) for cross-tab sync.
//   MUST NOT: touch Geographic Style or Vehicle Style records/storage, or
//             create a second control surface for traversalHUD.js's own
//             setDisplayMode/getDisplayMode (Flight Data HUD stays read-only
//             here by design, per Canonical Runtime Ownership).
//
// Placement: wall/systems/presentation/overlayStyleAuthority.js
// Load: AFTER overlayStyleRegistry.js and overlayStyleApplyAdapters.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var STORAGE_VALUES_KEY = 'wos:overlayStyle:values';

  var _initialized = false;
  var _listeners   = [];

  function _notify() {
    _listeners.slice().forEach(function (fn) {
      try { fn(); } catch (e) { console.warn('[OverlayStyleAuthority] subscriber threw:', e && e.message || e); }
    });
  }

  function _loadValues() {
    try {
      var raw = global.localStorage.getItem(STORAGE_VALUES_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return (parsed && typeof parsed === 'object') ? parsed : {};
    } catch (e) { return {}; }
  }

  function _saveValues(values) {
    try { global.localStorage.setItem(STORAGE_VALUES_KEY, JSON.stringify(values)); }
    catch (e) { console.warn('[OverlayStyleAuthority] _saveValues failed:', e && e.message || e); }
  }

  function _applyStoredValues() {
    var stored = _loadValues();
    var adapters = SBE.OverlayStyleApplyAdapters;
    var registry = SBE.OverlayStyleRegistry;
    if (!adapters || !registry) return;
    registry.discoverOverlays().forEach(function (record) {
      record.fields.forEach(function (field) {
        if (!Object.prototype.hasOwnProperty.call(stored, field.propId)) return;
        try { adapters.apply(field, stored[field.propId]); }
        catch (e) { console.warn('[OverlayStyleAuthority] apply failed for', field.propId, ':', e && e.message || e); }
      });
    });
  }

  function _onStorageEvent(e) {
    if (e.key !== STORAGE_VALUES_KEY) return;
    _applyStoredValues();
    _notify();
  }

  function init() {
    if (_initialized) return { ok: true };
    _applyStoredValues();
    _initialized = true;
    try { global.addEventListener('storage', _onStorageEvent); } catch (e) {}
    return { ok: true };
  }

  function isInitialized() { return _initialized; }

  function getRegistry() {
    var registry = SBE.OverlayStyleRegistry;
    return registry ? registry.discoverOverlays() : [];
  }

  function setPropertyValue(propId, value) {
    if (value === undefined || value === null) return { ok: false, reason: 'invalid_value' };
    var registry = SBE.OverlayStyleRegistry;
    var adapters = SBE.OverlayStyleApplyAdapters;
    if (!registry || !adapters) return { ok: false, reason: 'not_loaded' };
    var field = null;
    registry.discoverOverlays().some(function (record) {
      var match = record.fields.filter(function (f) { return f.propId === propId; })[0];
      if (match) { field = match; return true; }
      return false;
    });
    if (!field) return { ok: false, reason: 'not_found' };
    adapters.apply(field, value);
    var stored = _loadValues();
    stored[propId] = value;
    _saveValues(stored);
    _notify();
    return { ok: true };
  }

  function subscribe(fn) {
    _listeners.push(fn);
    return function unsubscribe() {
      var i = _listeners.indexOf(fn);
      if (i !== -1) _listeners.splice(i, 1);
    };
  }

  SBE.OverlayStyleAuthority = Object.freeze({
    VERSION: VERSION,
    init: init,
    isInitialized: isInitialized,
    getRegistry: getRegistry,
    setPropertyValue: setPropertyValue,
    subscribe: subscribe,
  });

  // ── Self-wiring — no map dependency ───────────────────────────────────────
  // Overlay records (Atmosphere Composite, HUDs) are DOM/canvas-backed, not
  // Mapbox paint properties, so there is no map-readiness gate to wait for —
  // init() only needs its source modules to already be defined, guaranteed
  // by this file's own script-order placement.
  init();

  console.log('[OverlayStyleAuthority] v' + VERSION + ' loaded');

})(window);
