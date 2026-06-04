// ── TiltProjectionRuntime v1.0.0 ──────────────────────────────────────────
// 0522_WOS_TiltProjectionRuntime_v1.0.0
// Status: canonical-draft
// Classification: interpretation-layer
//
// Governs Mapbox map pitch (cinematic tilt) as an observability instrument.
// Tilt is atmospheric and patient — NOT tactical, NOT gameplay-oriented.
// Does NOT chase vessels, hard-lock targets, or prioritize drama.
//
// Authority: interpretation-only.
// Reads from:  AISRuntime (vessel count, feed state), ObservabilityCamera
//              (pacing, isolation phase), OverlayGrammar (projection density)
// Writes to:   Mapbox map.setPitch() — viewport presentation only
// Mutates:     NOTHING in AISRuntime, ObservabilityCamera, or OverlayGrammar
//
// Tilt modes:
//   TILT_DISABLED  — pitch = 0 (flat map, debug or accessibility)
//   TILT_HARBOR    — pitch 28–38° (default cinematic harbor state)
//   TILT_CINEMATIC — pitch 45–60° (reserved, not default; requires explicit enable)
//
// Execution flow:
//   Mode evaluation → Target pitch derivation → Spring-dynamics blend → setPitch
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── Tilt mode constants ───────────────────────────────────────────────────
  var MODE_DISABLED  = 'TILT_DISABLED';
  var MODE_HARBOR    = 'TILT_HARBOR';
  var MODE_CINEMATIC = 'TILT_CINEMATIC';

  // ── Pitch ranges ──────────────────────────────────────────────────────────
  var PITCH_DISABLED_TARGET  = 0;
  var PITCH_HARBOR_BASE      = 28;
  var PITCH_HARBOR_MAX       = 38;
  var PITCH_CINEMATIC_BASE   = 45;
  var PITCH_CINEMATIC_MAX    = 60;

  // ── Spring dynamics ───────────────────────────────────────────────────────
  // Pitch transitions are slow and atmospheric. Spring is underdamped enough
  // to feel weighted but never bounces — critically damped feel.
  var SPRING_STIFFNESS = 0.04;  // [0..1] fraction per tick toward target
  var MIN_PITCH_DELTA  = 0.05;  // skip setPitch if delta below this (deg)

  // ── Evaluation cadence ────────────────────────────────────────────────────
  // 0.5Hz — patient, atmospheric, NOT reactive.
  var EVAL_INTERVAL_MS = 2000;

  // ── Runtime state ─────────────────────────────────────────────────────────
  var _mode          = MODE_HARBOR; // default on init
  var _enabled       = true;
  var _currentPitch  = 0;          // actual applied pitch (interpolated)
  var _targetPitch   = PITCH_HARBOR_BASE;
  var _evalTimer     = null;
  var _initialized   = false;
  var _mapRef        = null;       // Mapbox map instance (injected at init)

  // ── Target pitch derivation ───────────────────────────────────────────────
  // Harbor pitch modulates within range based on vessel observability density.
  // More active vessels → slightly higher tilt (more spatial depth needed).
  // Atmosphere is a secondary softener — it MUST NOT control tilt direction.

  function _deriveTargetPitch() {
    if (!_enabled || _mode === MODE_DISABLED) {
      return PITCH_DISABLED_TARGET;
    }

    var baseMin, baseMax;
    if (_mode === MODE_CINEMATIC) {
      baseMin = PITCH_CINEMATIC_BASE;
      baseMax = PITCH_CINEMATIC_MAX;
    } else {
      // MODE_HARBOR (default)
      baseMin = PITCH_HARBOR_BASE;
      baseMax = PITCH_HARBOR_MAX;
    }

    // Vessel density modulation — more active vessels → higher tilt within range
    var densityFactor = _resolveVesselDensityFactor();

    // Observability weight from camera — patient atmospheric input
    var camWeight = _resolveCameraObservabilityWeight();

    // Combined: density drives range position, camera softens by up to 15%
    var rawTarget = baseMin + (baseMax - baseMin) * densityFactor;
    rawTarget = rawTarget * (0.85 + camWeight * 0.15);

    return Math.max(baseMin, Math.min(baseMax, rawTarget));
  }

  function _resolveVesselDensityFactor() {
    var ais = global.SBE && SBE.AISRuntime;
    if (!ais) return 0.5; // neutral
    var vessels = ais.getActiveVessels();
    if (!vessels || vessels.length === 0) return 0.3; // low density → flatter
    // Saturation at 8 active vessels → full range
    return Math.min(1, vessels.length / 8);
  }

  function _resolveCameraObservabilityWeight() {
    var oc = global.SBE && SBE.ObservabilityCamera;
    if (!oc || !oc.getState) return 1.0;
    var s = oc.getState();
    return typeof s.observabilityWeight === 'number' ? s.observabilityWeight : 1.0;
  }

  // ── Spring-dynamics pitch advance ─────────────────────────────────────────

  function _advancePitch() {
    _targetPitch = _deriveTargetPitch();
    var delta    = _targetPitch - _currentPitch;

    // Spring: exponential approach
    _currentPitch += delta * SPRING_STIFFNESS;

    // Apply to Mapbox map if available
    if (Math.abs(delta) > MIN_PITCH_DELTA) {
      _applyPitchToMap(_currentPitch);
    }
  }

  function _applyPitchToMap(pitch) {
    // Prefer injected map reference, then try SBE.map or window.map
    var map = _mapRef
           || (global.SBE && SBE.map)
           || global.map
           || null;
    if (!map || typeof map.setPitch !== 'function') return;
    try {
      map.setPitch(pitch);
    } catch (e) {
      // Map may not be ready — silently absorb
    }
  }

  // ── Evaluation tick ───────────────────────────────────────────────────────

  function _evalTick() {
    _advancePitch();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init(mapInstance) {
    if (_initialized) return;
    _initialized = true;
    if (mapInstance) _mapRef = mapInstance;
    // Capture current map pitch as starting position
    if (_mapRef && typeof _mapRef.getPitch === 'function') {
      _currentPitch = _mapRef.getPitch();
    }
    _evalTimer = setInterval(_evalTick, EVAL_INTERVAL_MS);
    console.log('[TiltProjectionRuntime v1.0.0] initialized — mode:', _mode);
  }

  function destroy() {
    if (_evalTimer) { clearInterval(_evalTimer); _evalTimer = null; }
    _initialized = false;
  }

  // setEnabled(bool) — master tilt switch
  function setEnabled(enabled) {
    _enabled = !!enabled;
    if (!_enabled) {
      _targetPitch  = 0;
      _currentPitch = 0;
      _applyPitchToMap(0);
    }
    console.log('[TiltProjectionRuntime] enabled:', _enabled);
  }

  // setMode(mode) — 'disabled' | 'harbor' | 'cinematic'
  function setMode(mode) {
    var norm = (mode || '').toLowerCase();
    if (norm === 'disabled') {
      _mode = MODE_DISABLED;
    } else if (norm === 'cinematic') {
      _mode = MODE_CINEMATIC;
    } else {
      _mode = MODE_HARBOR; // default
    }
    console.log('[TiltProjectionRuntime] mode →', _mode);
    // Force an immediate advance so the transition begins without waiting
    _advancePitch();
  }

  // injectMap(mapInstance) — set or replace the Mapbox map reference
  function injectMap(mapInstance) {
    _mapRef = mapInstance;
  }

  // getState() — diagnostic snapshot
  function getState() {
    return {
      enabled:      _enabled,
      mode:         _mode,
      currentPitch: _currentPitch,
      targetPitch:  _targetPitch,
      initialized:  _initialized,
    };
  }

  // forceEval() — immediate evaluation (debug/testing)
  function forceEval() {
    _advancePitch();
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  SBE.TiltProjectionRuntime = {
    init,
    destroy,
    setEnabled,
    setMode,
    injectMap,
    getState,
    forceEval,

    // Mode constants
    MODE_DISABLED,
    MODE_HARBOR,
    MODE_CINEMATIC,
  };

})(window);
