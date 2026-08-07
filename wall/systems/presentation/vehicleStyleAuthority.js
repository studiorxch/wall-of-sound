// ── VehicleStyleAuthority v1.0.0 ──────────────────────────────────────────────
// 0729D_MAPS_Vehicle_Overlay_Libraries_Foundation
// Status: active | Classification: presentation-authority / vehicle-style-authority
//
// Single source of truth for the Vehicles library: real vehicle records
// (today: Hero Car), their live property values, edits, and cross-tab sync.
//
// Unlike Geographic Styles, Vehicles have no Default/Episode-2-style variant
// concept — there is nothing to duplicate, activate, or preview. Each real
// vehicle object IS its own record; editing a field edits that vehicle
// directly and persists so the edit survives a reload. getRegistry() always
// returns record-shaped data (grouped at the source, in
// vehicleStyleRegistry.js) — never a flat property list a caller must
// group itself.
//
// Authority boundary:
//   OWNS: applying an edited field value to its real source object (via
//         VehicleStyleApplyAdapters) and persisting it for reload/cross-tab.
//   READS: VehicleStyleRegistry (record + field discovery).
//   WRITES: localStorage (wos:vehicleStyle:records) for cross-tab sync —
//           same 'storage' event pattern as MapsGeographicStyleAuthority.
//   MUST NOT: touch Geographic Style records — Vehicles moved OUT of
//             Geographic in this build; nothing here reads/writes
//             wos:geographicStyle:*.
//
// Placement: wall/systems/presentation/vehicleStyleAuthority.js
// Load: AFTER vehicleStyleRegistry.js and vehicleStyleApplyAdapters.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var STORAGE_VALUES_KEY = 'wos:vehicleStyle:values';

  var _initialized = false;
  var _listeners   = [];

  function _notify() {
    _listeners.slice().forEach(function (fn) {
      try { fn(); } catch (e) { console.warn('[VehicleStyleAuthority] subscriber threw:', e && e.message || e); }
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
    catch (e) { console.warn('[VehicleStyleAuthority] _saveValues failed:', e && e.message || e); }
  }

  // Applies any previously-saved values (from a prior session/tab) to their
  // real source objects — the one-time "restore last edit" step a fresh
  // page load needs, since real objects like HeroVehicleRenderer boot with
  // their own hardcoded defaults, not this authority's storage.
  function _applyStoredValues() {
    var stored = _loadValues();
    var adapters = SBE.VehicleStyleApplyAdapters;
    var registry = SBE.VehicleStyleRegistry;
    if (!adapters || !registry) return;
    registry.discoverVehicles().forEach(function (record) {
      record.fields.forEach(function (field) {
        if (!Object.prototype.hasOwnProperty.call(stored, field.propId)) return;
        try { adapters.apply(field, stored[field.propId]); }
        catch (e) { console.warn('[VehicleStyleAuthority] apply failed for', field.propId, ':', e && e.message || e); }
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
    var registry = SBE.VehicleStyleRegistry;
    return registry ? registry.discoverVehicles() : [];
  }

  function setPropertyValue(propId, value) {
    if (value === undefined || value === null) return { ok: false, reason: 'invalid_value' };
    var registry = SBE.VehicleStyleRegistry;
    var adapters = SBE.VehicleStyleApplyAdapters;
    if (!registry || !adapters) return { ok: false, reason: 'not_loaded' };
    var field = null;
    registry.discoverVehicles().some(function (record) {
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

  SBE.VehicleStyleAuthority = Object.freeze({
    VERSION: VERSION,
    init: init,
    isInitialized: isInitialized,
    getRegistry: getRegistry,
    setPropertyValue: setPropertyValue,
    subscribe: subscribe,
  });

  // ── Self-wiring — no map dependency, unlike Geographic Styles ─────────────
  // Vehicle records (Hero Car today) are DOM/SVG-backed, not Mapbox paint
  // properties, so there is no map-readiness gate to wait for — init() only
  // needs HeroVehicleRenderer to already be defined, guaranteed by this
  // file's own script-order placement (AFTER heroVehicleRenderer.js).
  init();

  console.log('[VehicleStyleAuthority] v' + VERSION + ' loaded');

})(window);
