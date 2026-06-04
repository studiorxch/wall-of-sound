// ── AirspaceInfluenceField v1.0.0 ─────────────────────────────────────────────
// 0528A_WOS_AirflightRuntimeBootstrap_v1.0.0
// Status: active
// Classification: interpretation-layer
//
// Purpose:
//   Manages the set of influence samples emitted by active aircraft.
//   Each sample is a soft spatial field: a radius, color, and intensity that
//   AirspaceInfluenceRenderer draws as a translucent aura around the aircraft.
//   This is the "when a plane flies, color the world around it" tool.
//
// Authority:
//   OWNS: influence sample state, sample decay, field intensity
//   MUST NOT MUTATE: AircraftRuntime, AISRuntime, atmosphere baseline truth
//
// Placement: wall/systems/presentation/airspaceInfluenceField.js
// Load: AFTER aircraftRuntime.js, BEFORE aircraftRenderer.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Constants ─────────────────────────────────────────────────────────────────

  var DECAY_MS       = 8000;
  var MIN_RADIUS_M   = 600;
  var MAX_RADIUS_M   = 6500;

  // Field colors per aircraft class — subtle, sky-derived palette
  var INFLUENCE_COLORS = Object.freeze({
    regional:   { r: 160, g: 220, b: 255 },   // pale blue
    narrowbody: { r: 180, g: 220, b: 255 },   // cool blue-white
    widebody:   { r: 210, g: 230, b: 255 },   // bright blue-white
    helicopter: { r: 255, g: 210, b: 140 },   // warm amber
    unknown:    { r: 200, g: 220, b: 240 },   // neutral
  });

  // Peak center alpha per class (at full intensity)
  var PEAK_ALPHA = Object.freeze({
    regional:   0.16,
    narrowbody: 0.18,
    widebody:   0.22,
    helicopter: 0.20,
    unknown:    0.14,
  });

  // ── State ─────────────────────────────────────────────────────────────────────

  var _samples = {};   // { aircraftId: AirspaceInfluenceSample }
  var _enabled = true;

  // ── emitInfluenceSample(aircraft) ────────────────────────────────────────────
  // Called by AircraftRuntime on every update tick.
  // Creates or refreshes the influence sample for the aircraft.

  function emitInfluenceSample(aircraft) {
    if (!_enabled) return null;

    var cls    = aircraft.aircraftClass || 'unknown';
    var scalar = aircraft.altitudeScalar || 0;
    var state  = aircraft.lifecycleState || 'PARKED';

    if (state === 'PARKED' || state === 'COMPLETE' || state === 'DORMANT') {
      // Remove any existing sample for this aircraft
      delete _samples[aircraft.id];
      return null;
    }

    // Radius expands with altitude
    var radiusM = MIN_RADIUS_M + scalar * (MAX_RADIUS_M - MIN_RADIUS_M);

    // Intensity: ramps from 0.25 at takeoff roll → 1.0 at cruise
    var intensity;
    if (state === 'TAKEOFF_ROLL')  { intensity = 0.25 + scalar * 0.4; }
    else if (state === 'LANDING')  { intensity = 0.25 + scalar * 0.4; }
    else                           { intensity = 0.25 + scalar * 0.75; }
    intensity = Math.max(0, Math.min(1, intensity));

    var col  = INFLUENCE_COLORS[cls] || INFLUENCE_COLORS.unknown;
    var peak = PEAK_ALPHA[cls]       || PEAK_ALPHA.unknown;

    var sample = {
      id:               'inf_' + aircraft.id,
      sourceAircraftId: aircraft.id,
      lat:              aircraft.lat,
      lng:              aircraft.lng,
      radiusM:          radiusM,
      intensity:        intensity,
      // Baked render-ready values
      r: col.r, g: col.g, b: col.b,
      peakAlpha:        peak,
      falloff:          'smooth',
      altitudeScalar:   scalar,
      expiresAtMs:      Date.now() + DECAY_MS,
    };

    _samples[aircraft.id] = sample;
    return sample;
  }

  // ── getActiveSamples() ────────────────────────────────────────────────────────
  // Returns all non-expired samples with positive intensity.

  function getActiveSamples() {
    var now    = Date.now();
    var result = [];
    var ids    = Object.keys(_samples);
    for (var i = 0; i < ids.length; i++) {
      var s = _samples[ids[i]];
      if (s && s.expiresAtMs > now && s.intensity > 0.01) result.push(s);
    }
    return result;
  }

  function clearSamples() {
    _samples = {};
    console.log('[AirspaceInfluenceField] samples cleared');
  }

  function setEnabled(val) {
    _enabled = !!val;
    console.log('[AirspaceInfluenceField] enabled:', _enabled);
    if (!_enabled) clearSamples();
  }

  function isEnabled() { return _enabled; }

  // ── Public API ────────────────────────────────────────────────────────────────

  SBE.AirspaceInfluenceField = Object.freeze({
    VERSION:             VERSION,
    emitInfluenceSample: emitInfluenceSample,
    getActiveSamples:    getActiveSamples,
    clearSamples:        clearSamples,
    setEnabled:          setEnabled,
    isEnabled:           isEnabled,
    INFLUENCE_COLORS:    INFLUENCE_COLORS,
    PEAK_ALPHA:          PEAK_ALPHA,
  });

  console.log('[AirspaceInfluenceField] v' + VERSION + ' loaded');

})(window);
