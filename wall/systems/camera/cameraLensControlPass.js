// ── CameraLensControlPass v1.0.0 ──────────────────────────────────────────────
// 0605O_WOS_CameraLensControlPass_v1.0.0
// Status: active | Classification: presentation-camera-runtime
//
// Answers "HOW does the camera see?" — lens + framing adjustments layered onto a
// resolved camera request. Anchor (0605L) = where you sit; look (0605N) = where you
// face; LENS (here) = how you see. PURE TRANSFORM: request in → profile + trims →
// adjusted request out. Resolves no actors/anchors, submits nothing (except debug
// proofs). Never fix anchor problems with lens or vice-versa. READ-ONLY: mutates no
// actor truth, anchors, transport selection, terrain, or Mapbox style. Recommended
// order: anchor → look → LENS → terrain → submit. Load after
// transportScopedPOVAuthority.js. Never throws out of a public call.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  function _p(id, label, zd, pd, bd, roll, comp, fov, clamp) {
    return Object.freeze({ id: id, label: label, zoomDelta: zd, pitchDelta: pd, bearingDelta: bd, rollDeg: roll,
      compositionBias: comp, fovHint: fov, clamp: Object.freeze(clamp || { minZoom: 10, maxZoom: 20, minPitch: 0, maxPitch: 85 }) });
  }
  // 10 required lens profiles.
  var PROFILES = {
    wide:           _p('wide', 'Wide', -0.8, 0, 0, 0, 0, 'wide', { minZoom: 10, maxZoom: 19, minPitch: 0, maxPitch: 85 }),
    normal:         _p('normal', 'Normal', 0, 0, 0, 0, 0, 'normal'),
    telephoto:      _p('telephoto', 'Telephoto', 1.2, 2, 0, 0, 0, 'telephoto', { minZoom: 12, maxZoom: 22, minPitch: 0, maxPitch: 85 }),
    cinematic:      _p('cinematic', 'Cinematic', 0.3, 3, 0, 0, 0.1, 'normal', { minZoom: 11, maxZoom: 21, minPitch: 0, maxPitch: 85 }),
    surveillance:   _p('surveillance', 'Surveillance', -0.3, -5, 0, 0, 0, 'normal', { minZoom: 10, maxZoom: 20, minPitch: 0, maxPitch: 70 }),
    dashcam:        _p('dashcam', 'Dashcam', 0.2, 2, 0, 0, 0, 'normal', { minZoom: 14, maxZoom: 21, minPitch: 40, maxPitch: 85 }),
    helmetcam:      _p('helmetcam', 'Helmet Cam', -0.5, 1, 0, 0, 0, 'wide', { minZoom: 13, maxZoom: 20, minPitch: 30, maxPitch: 85 }),
    bus_window:     _p('bus_window', 'Bus Window', -0.2, -2, 0, 0, 0, 'normal', { minZoom: 13, maxZoom: 20, minPitch: 0, maxPitch: 85 }),
    ferry_deck:     _p('ferry_deck', 'Ferry Deck', -0.6, -4, 0, 0, 0, 'wide', { minZoom: 11, maxZoom: 19, minPitch: 0, maxPitch: 80 }),
    drone_observer: _p('drone_observer', 'Drone Observer', -1.0, -15, 0, 0, 0, 'wide', { minZoom: 10, maxZoom: 18, minPitch: 0, maxPitch: 60 }),
  };
  var ORDER = Object.keys(PROFILES);

  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function _clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function _norm(b) { return ((b % 360) + 360) % 360; }

  var _enabled = true, _debug = false, _auto = true, _selected = 'normal';
  var _zoomTrim = 0, _pitchTrim = 0, _bearingTrim = 0, _rollTrim = 0, _compTrim = 0;
  var _lastError = null, _lastProfile = null;
  var _stats = { applied: 0, autoApplied: 0, manualApplied: 0, previews: 0, suggestions: 0, invalidRequests: 0 };

  // ── suggestProfileForRequest(request) ───────────────────────────────────────
  function suggestProfileForRequest(request) {
    _stats.suggestions++;
    if (!request || typeof request !== 'object') return 'normal';
    var src = (request.source || '').toString().toLowerCase();
    if (request.debug === true || src.indexOf('surveillance') >= 0) return 'surveillance';
    var fam = (request.family || '').toString().toLowerCase();
    if (fam === 'external') {
      var ev = (request.externalViewId || request.modeId || request.externalView || '').toString().toLowerCase();
      if (ev.indexOf('drone') >= 0 || ev.indexOf('high') >= 0) return 'drone_observer';
      return 'cinematic';
    }
    // internal / POV — by transport, fall back to vehicle class.
    var tm = (request.transportMode || '').toString().toLowerCase();
    var vc = (request.vehicleClass || '').toString().toLowerCase();
    if (tm === 'drive' || vc === 'car') return 'dashcam';
    if (tm === 'transit' || vc === 'bus') return 'bus_window';
    if (tm === 'walk' || vc === 'walker') return 'helmetcam';
    if (tm === 'bike' || vc === 'bike') return 'helmetcam';
    if (tm === 'ferry' || vc === 'ferry') return 'ferry_deck';
    return 'normal';
  }

  // ── applyLens(request) / previewLens(request, profileId) ────────────────────
  function _adjust(request, profileId) {
    var prof = PROFILES[profileId] || PROFILES.normal;
    _lastProfile = prof.id;
    var oZoom = _num(request.zoom), oPitch = _num(request.pitch), oBearing = _num(request.bearing), oRoll = _num(request.roll);
    var baseZoom = oZoom != null ? oZoom : 18;
    var basePitch = oPitch != null ? oPitch : 60;
    var baseBearing = oBearing != null ? oBearing : 0;
    var baseRoll = oRoll != null ? oRoll : 0;

    var zoom = _clamp(baseZoom + prof.zoomDelta + _zoomTrim, Math.max(0, prof.clamp.minZoom), Math.min(22, prof.clamp.maxZoom));
    var pitch = _clamp(basePitch + prof.pitchDelta + _pitchTrim, Math.max(0, prof.clamp.minPitch), Math.min(85, prof.clamp.maxPitch));
    var bearing = _norm(baseBearing + prof.bearingDelta + _bearingTrim);
    var roll = _clamp(baseRoll + prof.rollDeg + _rollTrim, -45, 45);
    var compositionBias = _clamp(prof.compositionBias + _compTrim, -1, 1);

    var out = {};
    for (var k in request) if (request.hasOwnProperty(k)) out[k] = request[k];
    out.lensProfileId = prof.id;
    out.lensApplied = true;
    out.originalZoom = oZoom; out.originalPitch = oPitch; out.originalBearing = oBearing; out.originalRoll = oRoll;
    out.zoom = zoom; out.pitch = pitch; out.bearing = bearing; out.roll = roll;
    out.compositionBias = compositionBias; out.fovHint = prof.fovHint;
    return out;
  }
  function applyLens(request) {
    if (!request || typeof request !== 'object') { _stats.invalidRequests++; _lastError = request == null ? 'no_request' : 'invalid_request'; return request; }
    if (!_enabled) return request;
    var profileId = _auto ? suggestProfileForRequest(request) : _selected;
    if (!PROFILES[profileId]) { _lastError = 'invalid_profile'; profileId = 'normal'; }
    _stats.applied++; if (_auto) _stats.autoApplied++; else _stats.manualApplied++;
    _lastError = null;
    return _adjust(request, profileId);
  }
  function previewLens(request, profileId) {
    _stats.previews++;
    if (!request || typeof request !== 'object') { _lastError = 'invalid_request'; return request; }
    if (!PROFILES[profileId]) { _lastError = 'invalid_profile'; return null; }
    return _adjust(request, profileId);
  }

  // ── Profile + trims ─────────────────────────────────────────────────────────
  function setLensProfile(id) { if (!PROFILES[id]) { _lastError = 'invalid_profile'; return false; } _selected = id; _auto = false; return _selected; }
  function getLensProfile() { return _selected; }
  function listLensProfiles() { return ORDER.map(function (k) { return PROFILES[k]; }); }
  function getLensProfileDef(id) { return PROFILES[id] || null; }
  function setAutoProfileEnabled(on) { _auto = on !== false; return _auto; }
  function getAutoProfileEnabled() { return _auto; }

  function _trim(v, lo, hi, cur) { var n = _num(v); return n != null ? _clamp(n, lo, hi) : cur; }
  function setZoomTrim(v) { _zoomTrim = _trim(v, -2, 2, _zoomTrim); return _zoomTrim; }
  function setPitchTrim(v) { _pitchTrim = _trim(v, -20, 20, _pitchTrim); return _pitchTrim; }
  function setBearingTrim(v) { _bearingTrim = _trim(v, -45, 45, _bearingTrim); return _bearingTrim; }
  function setRollTrim(v) { _rollTrim = _trim(v, -15, 15, _rollTrim); return _rollTrim; }
  function setCompositionBias(v) { _compTrim = _trim(v, -1, 1, _compTrim); return _compTrim; }
  function resetTrims() { _zoomTrim = _pitchTrim = _bearingTrim = _rollTrim = _compTrim = 0; return true; }

  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }

  function getState() {
    return { version: VERSION, enabled: _enabled, debug: _debug, autoProfile: _auto, selectedProfile: _selected,
      lastProfile: _lastProfile, profileCount: ORDER.length,
      trims: { zoom: _zoomTrim, pitch: _pitchTrim, bearing: _bearingTrim, roll: _rollTrim, compositionBias: _compTrim },
      lastError: _lastError };
  }
  function getStats() { var o = {}; for (var k in _stats) o[k] = _stats[k]; return o; }

  SBE.CameraLensControlPass = Object.freeze({
    VERSION:                  VERSION,
    setLensProfile:           setLensProfile,
    getLensProfile:           getLensProfile,
    listLensProfiles:         listLensProfiles,
    getLensProfileDef:        getLensProfileDef,
    applyLens:                applyLens,
    previewLens:              previewLens,
    suggestProfileForRequest: suggestProfileForRequest,
    setAutoProfileEnabled:    setAutoProfileEnabled,
    getAutoProfileEnabled:    getAutoProfileEnabled,
    setZoomTrim:              setZoomTrim,
    setPitchTrim:             setPitchTrim,
    setBearingTrim:           setBearingTrim,
    setRollTrim:              setRollTrim,
    setCompositionBias:       setCompositionBias,
    resetTrims:               resetTrims,
    setEnabled:               setEnabled,
    setDebug:                 setDebug,
    getState:                 getState,
    getStats:                 getStats,
  });

  console.log('[CameraLensControlPass] v' + VERSION + ' loaded — ' + ORDER.length + ' lens profiles');
})(window);
