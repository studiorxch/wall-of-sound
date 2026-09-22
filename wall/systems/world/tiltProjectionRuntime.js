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

  // Calibration V1 Revision 13: true while the previous tick yielded to
  // human camera ownership -- see _advancePitch's own doc for why this
  // matters on the FIRST tick back.
  var _wasYielding = false;

  function _authority() {
    return global.SBE && SBE.CameraInteractionAuthority;
  }

  function _advancePitch() {
    // Calibration V1 Revision 13 (Human Camera Ownership): a human actively
    // dragging/zooming/rotating/pitching the map -- or within the short idle
    // grace period right after -- has exclusive camera authority. Skip this
    // tick's derivation AND application entirely: no setPitch(), and no
    // internal bookkeeping update either, so a long interaction can't build
    // up a stale target/delta that would cause a jump the moment ownership
    // is released.
    var authority = _authority();
    if (authority && authority.shouldAmbientYield()) {
      _wasYielding = true;
      return;
    }

    if (_wasYielding) {
      // Resuming after yielding: re-sync from the map's ACTUAL current
      // pitch (wherever the human's gesture left it), not the stale
      // `_currentPitch` this runtime was tracking before it yielded --
      // otherwise the spring would ease from a position the map hasn't
      // actually been at for as long as the interaction + grace period
      // lasted, reading as an abrupt correction rather than a patient
      // resume. This is what makes "do NOT immediately snap/reassert
      // ambient pitch" hold even once the grace period elapses -- the very
      // first tick back still starts its spring from truth, not memory.
      var map = _mapRef || (global.SBE && SBE.map) || global.map || null;
      if (map && typeof map.getPitch === "function") {
        try { _currentPitch = map.getPitch(); } catch (e) {}
      }
      _wasYielding = false;
    }

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
      // Calibration V1 Revision 14: wrapped so CameraInteractionAuthority
      // never mistakes THIS runtime's own ambient pitch change for human
      // interaction -- see cameraInteractionAuthority.js's own doc for why
      // event.originalEvent could not be used for this instead (verified
      // live against real trusted input: it does not reliably distinguish
      // every interaction type, so it was rejected in favor of this
      // explicit wrapper). Falls back to a direct call if the authority
      // hasn't loaded, matching every other optional-bridge check here.
      var authority = _authority();
      if (authority && authority.runAmbientCameraChange) {
        authority.runAmbientCameraChange(function () { map.setPitch(pitch); });
      } else {
        map.setPitch(pitch);
      }
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
    // Calibration V1 Revision 14: `mapInstance` has historically arrived
    // null from at least one call site (a bare `map` identifier that wasn't
    // reliably resolved at that point in boot -- the same root cause fixed
    // for CameraInteractionAuthority.init() in Revision 13). This runtime
    // never actually broke from that, because `_applyPitchToMap` already
    // had its own `SBE.map || global.map` fallback -- but `_currentPitch`'s
    // STARTING value below did not have an equivalent fallback, so it
    // silently began easing from 0 instead of the map's real initial pitch
    // whenever the injected argument was null. Falling back to
    // MapboxViewportRuntime.getMap() here (a reliable accessor, not the
    // ambiguous bare identifier) fixes that starting-value bug without
    // changing any cinematic behavior otherwise -- the spring/mode/target
    // math below is untouched.
    var resolvedMap = mapInstance
      || (global.SBE && SBE.MapboxViewportRuntime && SBE.MapboxViewportRuntime.getMap ? SBE.MapboxViewportRuntime.getMap() : null);
    if (resolvedMap) _mapRef = resolvedMap;
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
