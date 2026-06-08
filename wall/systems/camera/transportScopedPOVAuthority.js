// ── TransportScopedPOVAuthority v1.0.0 ────────────────────────────────────────
// 0605N_WOS_TransportScopedPOVAuthority_v1.0.0
// Status: active | Classification: presentation-camera-ui-runtime
//
// Untangles transport mode / actor class / view family / look direction so each
// transport mode exposes ONLY valid viewpoints while sharing one direction
// vocabulary. Hierarchy:
//
//   Transport Mode → Actor Class → View Family (internal|external)
//                  → Anchor / External Rig → Look Direction (front|left|right|rear)
//
// Internal views compose 0605L anchors + 0605M (applyView/applyInternalView) +
// 0605K terrain. External views use legacy camera presets (explicitly "external
// legacy", NOT POV). UI must never show impossible views. READ-ONLY to the world:
// mutates no actor truth, anchors, or Mapbox style. Load after occupantCameraModes.js.
// Never throws out of a public call.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var LOOKS = ['front', 'left', 'right', 'rear'];
  // Internal view ids that have a real 0605L anchor (cockpit not yet supported).
  var SUPPORTED_INTERNAL = { driver: 1, passenger: 1, rear_seat: 1, bus_front: 1, bus_passenger: 1, walker_head: 1, bike_rider: 1, ferry_passenger: 1 };
  // External rig id → legacy HeroVehicleRuntime preset (real rigs deferred to 0605P).
  var EXTERNAL_LEGACY = { follow: 'follow', lead: 'lead', side: 'side', high: 'high', rear_chase: 'follow', drone: 'high', orbit: 'high' };

  function _prof(id, actorClass, defInt, internalViews, externalViews, speed) {
    return Object.freeze({ id: id, label: id.charAt(0).toUpperCase() + id.slice(1), actorClass: actorClass,
      defaultInternalView: defInt, defaultExternalView: 'follow', defaultLookDirection: 'front',
      speedProfile: Object.freeze(speed), internalViews: Object.freeze(internalViews),
      externalViews: Object.freeze(externalViews), lookDirections: Object.freeze(LOOKS.slice()) });
  }
  var PROFILES = {
    flight:  _prof('flight', 'aircraft', 'cockpit', ['cockpit'], ['follow', 'lead', 'side', 'rear_chase', 'drone', 'orbit'], { id: 'aerial', defaultSpeedMult: 1, minSpeedMult: 0.05, maxSpeedMult: 80 }),
    drive:   _prof('drive', 'car', 'driver', ['driver', 'passenger', 'rear_seat'], ['follow', 'lead', 'side', 'rear_chase', 'drone'], { id: 'road_fast', defaultSpeedMult: 0.5, minSpeedMult: 0.05, maxSpeedMult: 10 }),
    walk:    _prof('walk', 'walker', 'walker_head', ['walker_head'], ['follow', 'lead', 'side', 'drone'], { id: 'foot', defaultSpeedMult: 0.15, minSpeedMult: 0.05, maxSpeedMult: 3 }),
    bike:    _prof('bike', 'bike', 'bike_rider', ['bike_rider'], ['follow', 'lead', 'side', 'rear_chase', 'drone'], { id: 'agile', defaultSpeedMult: 0.3, minSpeedMult: 0.05, maxSpeedMult: 6 }),
    transit: _prof('transit', 'bus', 'bus_front', ['bus_front', 'bus_passenger'], ['follow', 'lead', 'side', 'rear_chase', 'drone'], { id: 'road_heavy', defaultSpeedMult: 0.4, minSpeedMult: 0.05, maxSpeedMult: 8 }),
    ferry:   _prof('ferry', 'ferry', 'ferry_passenger', ['ferry_passenger'], ['follow', 'lead', 'side', 'rear_chase', 'drone'], { id: 'water_wide', defaultSpeedMult: 0.3, minSpeedMult: 0.05, maxSpeedMult: 5 }),
  };

  function _occ() { return SBE.OccupantCameraModes; }
  function _hv() { return SBE.HeroVehicleRuntime; }

  var _enabled = true, _debug = false;
  var _transport = 'drive', _family = 'internal', _look = 'front';
  var _internalView = 'driver', _externalView = 'follow';   // remembered separately (Rule 4)
  var _lastError = null;
  var _stats = { applies: 0, internalApplies: 0, externalApplies: 0, transportSwitches: 0, invalidResets: 0, unsupported: 0 };

  function _supportedInternal(modeId, viewId) {
    var p = PROFILES[modeId]; if (!p) return [];
    return p.internalViews.filter(function (v) { return SUPPORTED_INTERNAL[v]; });
  }
  function _isUnsupportedInternal(viewId) { return !SUPPORTED_INTERNAL[viewId]; }

  // ── Selectors / availability ────────────────────────────────────────────────
  function getAvailableInternalViews(modeId) { return _supportedInternal(modeId || _transport); }
  function getAvailableExternalViews(modeId) { var p = PROFILES[modeId || _transport]; return p ? p.externalViews.slice() : []; }
  function getAvailableLookDirections(modeId, family) {
    if (family === 'external') return [];   // external rigs ignore occupant look in v1
    var p = PROFILES[modeId || _transport]; return p ? p.lookDirections.slice() : LOOKS.slice();
  }

  // ── Setters (with scoping rules) ────────────────────────────────────────────
  function setTransportMode(modeId) {
    if (!PROFILES[modeId]) { _lastError = 'invalid_transport'; return false; }
    if (modeId !== _transport) _stats.transportSwitches++;
    _transport = modeId;
    var p = PROFILES[modeId];
    // Rule 2: reset invalid internal/external selections to defaults.
    var validInt = _supportedInternal(modeId);
    if (validInt.indexOf(_internalView) === -1) { _internalView = (validInt.indexOf(p.defaultInternalView) >= 0 ? p.defaultInternalView : (validInt[0] || p.defaultInternalView)); _stats.invalidResets++; }
    if (p.externalViews.indexOf(_externalView) === -1) { _externalView = p.defaultExternalView; _stats.invalidResets++; }
    // Rule 3: look persists when valid, else reset.
    if (p.lookDirections.indexOf(_look) === -1) _look = p.defaultLookDirection;
    return _transport;
  }
  function getTransportMode() { return _transport; }
  function setViewFamily(family) { if (family !== 'internal' && family !== 'external') { _lastError = 'invalid_family'; return false; } _family = family; return _family; }
  function getViewFamily() { return _family; }
  function setLookDirection(dir) { if (LOOKS.indexOf(dir) === -1) { _lastError = 'invalid_look'; return false; } _look = dir; return _look; }
  function getLookDirection() { return _look; }
  function setInternalView(viewId) { var v = _supportedInternal(_transport); if (v.indexOf(viewId) === -1) { _lastError = 'unsupported_internal_view'; return false; } _internalView = viewId; return _internalView; }
  function getInternalView() { return _internalView; }
  function setExternalView(viewId) { var p = PROFILES[_transport]; if (!p || p.externalViews.indexOf(viewId) === -1) { _lastError = 'unsupported_external_view'; return false; } _externalView = viewId; return _externalView; }
  function getExternalView() { return _externalView; }

  // ── Apply ───────────────────────────────────────────────────────────────────
  function _applyInternal() {
    _stats.internalApplies++;
    if (_isUnsupportedInternal(_internalView)) { _stats.unsupported++; _lastError = 'unsupported_internal_view'; return { ok: false, reason: 'unsupported_internal_view', view: _internalView }; }
    var occ = _occ();
    if (!occ) { _lastError = 'occupant_modes_unavailable'; return { ok: false, reason: 'occupant_modes_unavailable' }; }
    var r;
    if (typeof occ.applyView === 'function') r = occ.applyView({ internalViewId: _internalView, lookDirection: _look, transportMode: _transport });
    else if (typeof occ.applyMode === 'function') r = occ.applyMode(_legacyModeFor(_internalView, _look));   // temporary fallback
    else { _lastError = 'occupant_modes_unavailable'; return { ok: false, reason: 'occupant_modes_unavailable' }; }
    _lastError = (r && !r.ok) ? (r.reason || r.lastError || 'unknown') : null;
    return { ok: !!(r && r.ok), family: 'internal', transportMode: _transport, internalViewId: _internalView, lookDirection: _look,
      anchorId: r && r.anchorId, vehicleClass: r && r.vehicleClass, request: r && r.request, reason: r && r.reason, occupant: r };
  }
  // Temporary mapping when applyView is absent (mirrors 0605N spec table).
  function _legacyModeFor(viewId, look) {
    if ((viewId === 'driver' || viewId === 'passenger' || viewId === 'rear_seat') && look !== 'front') {
      return look === 'left' ? 'left_window' : look === 'right' ? 'right_window' : 'rear_window';
    }
    return viewId;
  }
  function _applyExternal() {
    _stats.externalApplies++;
    // External must NOT use occupant anchors — disengage occupant + use legacy preset.
    var occ = _occ();
    if (occ && typeof occ.disengage === 'function') { try { occ.disengage(); } catch (e) {} }
    var preset = EXTERNAL_LEGACY[_externalView] || 'follow';
    var supportedRig = !!EXTERNAL_LEGACY.hasOwnProperty(_externalView);
    var hv = _hv();
    if (hv && typeof hv.setCameraPreset === 'function') { try { hv.setCameraPreset(preset); } catch (e) {} }
    _lastError = null;
    return { ok: true, family: 'external', transportMode: _transport, externalViewId: _externalView,
      legacyPreset: preset, classification: 'external_legacy', realRig: false, usedOccupantAnchor: false };
  }
  function applyCurrentView() {
    _stats.applies++;
    if (!_enabled) { _lastError = 'disabled'; return { ok: false, reason: 'disabled' }; }
    if (!PROFILES[_transport]) { _lastError = 'invalid_transport'; return { ok: false, reason: 'invalid_transport' }; }
    var r = (_family === 'internal') ? _applyInternal() : _applyExternal();
    if (_debug) console.log('[TransportPOV]', _transport, _family, (_family === 'internal' ? _internalView + '/' + _look : _externalView), '→', r.ok ? 'ok' : r.reason);
    return r;
  }
  function applyView(opts) {
    opts = opts || {};
    if (opts.transportMode != null) setTransportMode(opts.transportMode);
    if (opts.family != null) setViewFamily(opts.family);
    if (opts.internalViewId != null) setInternalView(opts.internalViewId);
    if (opts.externalViewId != null) setExternalView(opts.externalViewId);
    if (opts.lookDirection != null) setLookDirection(opts.lookDirection);
    return applyCurrentView();
  }

  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }

  function getProfiles() { var o = {}; for (var k in PROFILES) if (PROFILES.hasOwnProperty(k)) o[k] = PROFILES[k]; return o; }
  function getProfile(modeId) { return PROFILES[modeId] || null; }
  function getState() {
    return { version: VERSION, enabled: _enabled, debug: _debug,
      transportMode: _transport, viewFamily: _family, lookDirection: _look,
      internalView: _internalView, externalView: _externalView,
      availableInternalViews: getAvailableInternalViews(), availableExternalViews: getAvailableExternalViews(),
      availableLookDirections: getAvailableLookDirections(_transport, _family),
      actorClass: PROFILES[_transport] ? PROFILES[_transport].actorClass : null, lastError: _lastError };
  }
  function getStats() { var o = {}; for (var k in _stats) o[k] = _stats[k]; return o; }

  SBE.TransportScopedPOVAuthority = Object.freeze({
    VERSION:                    VERSION,
    setTransportMode:           setTransportMode,
    getTransportMode:           getTransportMode,
    setViewFamily:              setViewFamily,
    getViewFamily:              getViewFamily,
    setLookDirection:           setLookDirection,
    getLookDirection:           getLookDirection,
    setInternalView:            setInternalView,
    getInternalView:            getInternalView,
    setExternalView:            setExternalView,
    getExternalView:            getExternalView,
    getAvailableInternalViews:  getAvailableInternalViews,
    getAvailableExternalViews:  getAvailableExternalViews,
    getAvailableLookDirections: getAvailableLookDirections,
    applyCurrentView:           applyCurrentView,
    applyView:                  applyView,
    getProfiles:                getProfiles,
    getProfile:                 getProfile,
    getState:                   getState,
    getStats:                   getStats,
    setEnabled:                 setEnabled,
    setDebug:                   setDebug,
  });

  console.log('[TransportScopedPOVAuthority] v' + VERSION + ' loaded — ' + Object.keys(PROFILES).length + ' transport profiles');
})(window);
