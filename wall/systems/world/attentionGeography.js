(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── AttentionGeography (0521_WOS_AttentionGeography_v1.0.0) ──────────────
  //
  // Cinematic cartography. Defines how environments naturally attract,
  // hold, and release observational focus.
  //
  // Attention is probabilistic, not scripted.
  // Significance accumulates. Familiarity changes perception.
  // Infrastructure carries emotional weight.
  //
  // Consumed by: PassengerMode
  // Never produces: markers, objectives, UI indicators
  //
  // finalWeight = field.weight * atmosphereAffinity * driftAffinity
  //             * memoryModifier * silenceModifier * cinematicBias

  // ── Haversine distance (meters) ───────────────────────────────────────────
  function _haversine(lng1, lat1, lng2, lat2) {
    var R  = 6371000;
    var p1 = lat1 * Math.PI / 180, p2 = lat2 * Math.PI / 180;
    var dp = (lat2 - lat1) * Math.PI / 180;
    var dl = (lng2 - lng1) * Math.PI / 180;
    var a  = Math.sin(dp / 2) * Math.sin(dp / 2) +
             Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // Approximate bearing from point A → point B (degrees, 0=north)
  function _bearing(lngA, latA, lngB, latB) {
    var dLng = (lngB - lngA) * Math.PI / 180;
    var la   = latA * Math.PI / 180;
    var lb   = latB * Math.PI / 180;
    var y    = Math.sin(dLng) * Math.cos(lb);
    var x    = Math.cos(la) * Math.sin(lb) - Math.sin(la) * Math.cos(lb) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function _lerp(a, b, t) { return a + (b - a) * t; }
  function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ── Field registry ────────────────────────────────────────────────────────
  var _fields  = {};   // id → AttentionField
  var _memory  = {};   // id → { visits, revisitResistance, lastVisit }
  var _weights = {};   // id → computed finalWeight (last evaluation)
  var _activeField = null;

  function _memoryFor(id) {
    if (!_memory[id]) {
      _memory[id] = { visits: 0, revisitResistance: 0, lastVisit: 0 };
    }
    return _memory[id];
  }

  // ── sampleWeight — compute finalWeight for a field ────────────────────────
  function sampleWeight(field) {
    var atm   = SBE.WorldAtmosphere  && SBE.WorldAtmosphere.getState();
    var drift = SBE.WorldDriftManager && SBE.WorldDriftManager.getState();
    var mood  = (atm && atm.mood)    || "neutral";
    var mem   = _memoryFor(field.id);

    // ── Atmosphere affinity ──────────────────────────────────────────────
    var ab   = field.atmosphericBias;
    var atmA = 1.0;
    if (mood.includes("rain") || mood.includes("storm")) atmA = _lerp(1.0, ab.rainAffinity  || 1.0, 0.7);
    if (mood.includes("fog"))                             atmA = _lerp(atmA, ab.fogAffinity   || 1.0, 0.6);
    if (atm && atm.isNight)                              atmA = _lerp(atmA, ab.nightAffinity  || 1.0, 0.5);

    // ── Drift affinity ───────────────────────────────────────────────────
    var driftA = 1.0;
    if (drift) {
      // silence-affinity fields bloom at low soundtrack energy (quiet hours)
      var silQ = 1 - drift.soundtrackEnergy;
      driftA = _lerp(1.0, (ab.silenceAffinity || 1.0), silQ * 0.5);
      // night-affinity further modulated by ambient intensity
      driftA = _lerp(driftA, driftA * (ab.nightAffinity || 1.0), drift.ambientIntensity * 0.3);
    }

    // ── Memory modifier ──────────────────────────────────────────────────
    // Repeated visits reduce novelty; familiarity builds differently
    var novelty    = _clamp(1 - mem.revisitResistance * 0.6, 0.25, 1.0);
    var familiarity = _clamp(mem.visits * 0.04, 0, 0.3);  // slight warm accumulation
    var memMod     = novelty + familiarity;

    // ── Silence modifier ─────────────────────────────────────────────────
    var silMod = 1.0;
    var bus    = SBE.WorkspaceEventBus;
    // Check passenger silence window if available
    var pm = SBE.PassengerMode && SBE.PassengerMode.getState();
    if (pm && pm.pacing) {
      silMod = _lerp(1.0, ab.silenceAffinity || 1.0, pm.pacing.silenceBias * 0.4);
    }

    // ── Cinematic bias ───────────────────────────────────────────────────
    var cb      = field.cinematicBias || {};
    var cinBias = (cb.framingPriority || 1.0);

    var w = field.weight * atmA * driftA * memMod * silMod * cinBias;
    return _clamp(w, 0, 5.0);
  }

  // ── Evaluate all fields and rank ──────────────────────────────────────────
  function _evaluate() {
    var top = null, topW = -1;

    Object.keys(_fields).forEach(function (id) {
      var f = _fields[id];
      var w = sampleWeight(f);
      _weights[id] = w;
      if (w > topW) { topW = w; top = f; }
    });

    _activeField = top;
  }

  // ── Public field access ───────────────────────────────────────────────────
  function getTopField() { return _activeField; }

  function getActiveFields() {
    return Object.keys(_fields)
      .map(function (id) { return { field: _fields[id], weight: _weights[id] || 0 }; })
      .sort(function (a, b) { return b.weight - a.weight; });
  }

  function getBearingTo(fieldId, fromLng, fromLat) {
    var f = _fields[fieldId];
    if (!f) return null;
    return _bearing(fromLng, fromLat, f.position.lng, f.position.lat);
  }

  function getDistanceTo(fieldId, fromLng, fromLat) {
    var f = _fields[fieldId];
    if (!f) return Infinity;
    return _haversine(fromLng, fromLat, f.position.lng, f.position.lat);
  }

  // ── Field management ──────────────────────────────────────────────────────
  function registerField(field) {
    if (!field || !field.id) return;
    _fields[field.id]  = field;
    _weights[field.id] = 0;
  }

  function removeField(id) {
    delete _fields[id];
    delete _weights[id];
  }

  function recordVisit(id) {
    var mem = _memoryFor(id);
    mem.visits    += 1;
    mem.lastVisit  = performance.now();
    // Revisit resistance rises with each visit, decays slowly over time
    mem.revisitResistance = _clamp(mem.revisitResistance + 0.2, 0, 1.0);
  }

  // ── Natural revisit resistance decay ──────────────────────────────────────
  function _tickMemoryDecay() {
    var now = performance.now();
    Object.keys(_memory).forEach(function (id) {
      var mem = _memory[id];
      var ageMs = now - mem.lastVisit;
      // Resistance decays ~50% per 10 minutes
      if (ageMs > 10000) {
        mem.revisitResistance = _clamp(mem.revisitResistance - 0.001, 0, 1.0);
      }
    });
  }

  function getState() {
    return { fields: _fields, memory: _memory, weights: _weights, activeField: _activeField };
  }

  // ── Default fields — Brooklyn/Manhattan world ─────────────────────────────
  // Seeded from corridorZero.js waypoints and the known geography of the
  // phase1_brooklyn_coldspring world.
  function _seedDefaultFields() {
    var defaults = [
      {
        id: "brooklyn-bridge",
        type: "bridge",
        position: { lng: -73.9964, lat: 40.7057 },
        radius: 450,
        weight: 1.4,
        emotionalBias:    { loneliness: 0.2, tension: 0.4, warmth: 0.3, exhaustion: 0.1, mystery: 0.5 },
        atmosphericBias:  { rainAffinity: 1.6, nightAffinity: 1.8, fogAffinity: 1.5, silenceAffinity: 1.2 },
        cinematicBias:    { lingerMultiplier: 1.8, framingPriority: 1.5, stabilizationBias: 1.4 },
        persistenceBias:  { holdAffinity: 1.6, returnGlanceAffinity: 1.5, releaseResistance: 1.7, residueStrength: 1.4 },
        persistence:      { cooldownMs: 90000, memoryWeight: 0.8, revisitResistance: 0 },
      },
      {
        id: "dumbo-overlook",
        type: "overlook",
        position: { lng: -73.9898, lat: 40.7030 },
        radius: 300,
        weight: 1.2,
        emotionalBias:    { loneliness: 0.1, tension: 0.2, warmth: 0.5, exhaustion: 0.1, mystery: 0.4 },
        atmosphericBias:  { rainAffinity: 1.3, nightAffinity: 1.6, fogAffinity: 1.2, silenceAffinity: 1.1 },
        cinematicBias:    { lingerMultiplier: 1.5, framingPriority: 1.3, stabilizationBias: 1.2 },
        persistenceBias:  { holdAffinity: 1.3, returnGlanceAffinity: 1.2, releaseResistance: 1.3, residueStrength: 1.1 },
        persistence:      { cooldownMs: 60000, memoryWeight: 0.7, revisitResistance: 0 },
      },
      {
        id: "manhattan-bridge-fdr",
        type: "bridge",
        position: { lng: -73.9852, lat: 40.7156 },
        radius: 500,
        weight: 1.1,
        emotionalBias:    { loneliness: 0.3, tension: 0.5, warmth: 0.1, exhaustion: 0.3, mystery: 0.4 },
        atmosphericBias:  { rainAffinity: 1.4, nightAffinity: 1.7, fogAffinity: 1.3, silenceAffinity: 1.0 },
        cinematicBias:    { lingerMultiplier: 1.6, framingPriority: 1.2, stabilizationBias: 1.3 },
        persistenceBias:  { holdAffinity: 1.4, returnGlanceAffinity: 1.3, releaseResistance: 1.5, residueStrength: 1.2 },
        persistence:      { cooldownMs: 75000, memoryWeight: 0.6, revisitResistance: 0 },
      },
      {
        id: "atlantic-avenue-corridor",
        type: "rail",
        position: { lng: -73.9664, lat: 40.6832 },
        radius: 600,
        weight: 0.9,
        emotionalBias:    { loneliness: 0.5, tension: 0.3, warmth: 0.2, exhaustion: 0.4, mystery: 0.3 },
        atmosphericBias:  { rainAffinity: 1.2, nightAffinity: 1.4, fogAffinity: 1.1, silenceAffinity: 1.4 },
        cinematicBias:    { lingerMultiplier: 1.2, framingPriority: 0.9, stabilizationBias: 1.1 },
        persistenceBias:  { holdAffinity: 1.1, returnGlanceAffinity: 0.9, releaseResistance: 1.2, residueStrength: 1.0 },
        persistence:      { cooldownMs: 45000, memoryWeight: 0.5, revisitResistance: 0 },
      },
      {
        id: "gowanus-industrial",
        type: "industrial",
        position: { lng: -73.9993, lat: 40.6665 },
        radius: 700,
        weight: 1.0,
        emotionalBias:    { loneliness: 0.7, tension: 0.3, warmth: 0.1, exhaustion: 0.5, mystery: 0.6 },
        atmosphericBias:  { rainAffinity: 1.5, nightAffinity: 1.3, fogAffinity: 1.6, silenceAffinity: 1.5 },
        cinematicBias:    { lingerMultiplier: 1.4, framingPriority: 1.1, stabilizationBias: 1.3 },
        persistenceBias:  { holdAffinity: 1.3, returnGlanceAffinity: 1.1, releaseResistance: 1.4, residueStrength: 1.3 },
        persistence:      { cooldownMs: 60000, memoryWeight: 0.6, revisitResistance: 0 },
      },
      {
        id: "red-hook-waterfront",
        type: "coastline",
        position: { lng: -74.0100, lat: 40.6750 },
        radius: 800,
        weight: 1.1,
        emotionalBias:    { loneliness: 0.8, tension: 0.1, warmth: 0.2, exhaustion: 0.3, mystery: 0.5 },
        atmosphericBias:  { rainAffinity: 1.4, nightAffinity: 1.5, fogAffinity: 1.7, silenceAffinity: 1.6 },
        cinematicBias:    { lingerMultiplier: 1.7, framingPriority: 1.2, stabilizationBias: 1.5 },
        persistenceBias:  { holdAffinity: 1.5, returnGlanceAffinity: 1.4, releaseResistance: 1.6, residueStrength: 1.5 },
        persistence:      { cooldownMs: 80000, memoryWeight: 0.7, revisitResistance: 0 },
      },
      {
        id: "fort-greene-transition",
        type: "district-transition",
        position: { lng: -73.9844, lat: 40.6952 },
        radius: 400,
        weight: 0.8,
        emotionalBias:    { loneliness: 0.2, tension: 0.2, warmth: 0.5, exhaustion: 0.2, mystery: 0.2 },
        atmosphericBias:  { rainAffinity: 1.1, nightAffinity: 1.2, fogAffinity: 1.0, silenceAffinity: 0.9 },
        cinematicBias:    { lingerMultiplier: 1.1, framingPriority: 0.8, stabilizationBias: 0.9 },
        persistenceBias:  { holdAffinity: 0.9, returnGlanceAffinity: 0.8, releaseResistance: 0.9, residueStrength: 0.8 },
        persistence:      { cooldownMs: 30000, memoryWeight: 0.4, revisitResistance: 0 },
      },
      {
        id: "crown-heights-origin",
        type: "district-transition",
        position: { lng: -73.9441, lat: 40.6782 },
        radius: 350,
        weight: 0.7,
        emotionalBias:    { loneliness: 0.2, tension: 0.1, warmth: 0.6, exhaustion: 0.1, mystery: 0.1 },
        atmosphericBias:  { rainAffinity: 1.0, nightAffinity: 1.1, fogAffinity: 0.9, silenceAffinity: 0.8 },
        cinematicBias:    { lingerMultiplier: 1.0, framingPriority: 0.7, stabilizationBias: 0.8 },
        persistenceBias:  { holdAffinity: 0.8, returnGlanceAffinity: 0.7, releaseResistance: 0.8, residueStrength: 0.7 },
        persistence:      { cooldownMs: 20000, memoryWeight: 0.3, revisitResistance: 0 },
      },
    ];

    defaults.forEach(registerField);
  }

  // ── Evaluation tick (called by PassengerMode or external tick) ─────────────
  var _lastEval  = 0;
  var EVAL_MS    = 3000;  // re-evaluate field weights every 3s

  function tick() {
    var now = performance.now();
    if (now - _lastEval < EVAL_MS) return;
    _lastEval = now;
    _tickMemoryDecay();
    _evaluate();
  }

  // ── init ──────────────────────────────────────────────────────────────────
  function init() {
    _seedDefaultFields();
    _evaluate();

    console.log("[AttentionGeography] initialized —",
      Object.keys(_fields).length, "fields,",
      "top:", _activeField ? _activeField.id : "none");
  }

  SBE.AttentionGeography = {
    init:          init,
    tick:          tick,
    registerField: registerField,
    removeField:   removeField,
    recordVisit:   recordVisit,
    sampleWeight:  sampleWeight,
    getTopField:   getTopField,
    getActiveFields: getActiveFields,
    getBearingTo:  getBearingTo,
    getDistanceTo: getDistanceTo,
    getState:      getState,
  };

})(window);
