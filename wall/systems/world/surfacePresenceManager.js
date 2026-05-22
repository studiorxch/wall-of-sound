(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── SurfacePresenceManager (0520A_WOS_SurfacePresence_v1.0.0) ────────────
  //
  // Resolves and broadcasts the living activity state of each surface.
  // Surfaces are not static destinations — they are transmissions.
  //
  // Presence layers:
  //   1. Mood Pulse      — atmospheric breathing derived from WorldAtmosphere mood
  //   2. Audio Activity  — lerped audio energy from transport + master gain
  //   3. Occupancy       — users/agents present (Phase 1: count only)
  //   4. Simulation State — active | paused | idle | broadcasting | rendering
  //   5. Broadcast State  — local | live | auto | shared
  //
  // Emits: surface:presenceUpdated { docId, presence }
  //
  // Architecture: orchestration layer only. Never touches DOM directly.
  // workspaceUI.js is the exclusive renderer of presence state.

  // ── Mood → pulse animation class ─────────────────────────────────────────
  // Each mood maps to a CSS animation class applied to the surface node.
  // Different classes carry different keyframe durations + shadow colors.
  var MOOD_PULSE = {
    "golden-hour":  { cls: "ws-pulse--warm",     intensity: 0.10 },
    "clear-day":    { cls: "ws-pulse--day",       intensity: 0.06 },
    "clear-night":  { cls: "ws-pulse--night",     intensity: 0.08 },
    "full-moon":    { cls: "ws-pulse--moon",      intensity: 0.08 },
    "overcast-day": { cls: "ws-pulse--overcast",  intensity: 0.05 },
    "rain-night":   { cls: "ws-pulse--rain",      intensity: 0.10 },
    "rain-day":     { cls: "ws-pulse--rain",      intensity: 0.08 },
    "storm-night":  { cls: "ws-pulse--storm",     intensity: 0.14 },
    "storm-day":    { cls: "ws-pulse--storm",     intensity: 0.12 },
    "fog-night":    { cls: "ws-pulse--fog",       intensity: 0.06 },
    "fog-morning":  { cls: "ws-pulse--fog",       intensity: 0.05 },
    "snow-night":   { cls: "ws-pulse--snow",      intensity: 0.07 },
    "snow-day":     { cls: "ws-pulse--snow",      intensity: 0.06 },
    "neutral":      { cls: "ws-pulse--neutral",   intensity: 0.06 },
  };

  var ALL_PULSE_CLASSES = Object.keys(MOOD_PULSE).map(function (k) { return MOOD_PULSE[k].cls; })
    .filter(function (v, i, a) { return a.indexOf(v) === i; }); // dedupe

  function _pulseForMood(mood) {
    return MOOD_PULSE[mood] || MOOD_PULSE["neutral"];
  }

  // ── Presence record factory ───────────────────────────────────────────────
  function _defaultPresence(docId) {
    return {
      docId:      docId,
      moodPulse:  { enabled: true, cls: "ws-pulse--neutral", intensity: 0.06 },
      audio:      { level: 0, smoothed: 0 },
      occupancy:  { count: 0, avatars: [] },
      simulation: { state: "active" },   // active|paused|idle|broadcasting|rendering
      broadcast:  { mode: "local" },     // local|live|auto|shared
    };
  }

  var _presences  = {};  // docId → presence record
  var _lastTick   = 0;
  var TICK_MS     = 110; // ~9fps — audio lerp doesn't need 60fps

  // ── Audio level resolution ────────────────────────────────────────────────
  // Phase 1: derive from transport playback state + optional master gain.
  // Future: read actual RMS from an AnalyserNode inserted on master output.
  function _resolveRawAudioLevel() {
    var wos = global._wos;
    if (!wos || !wos.state) return 0;

    if (!wos.state.isPlaying) return 0;

    // Try to read master gain value for a slightly more dynamic signal
    var gain = wos.state.audio && wos.state.audio.masterGain
      ? wos.state.audio.masterGain.gain.value
      : 0.85;

    // Normalize to 0–1 range (gain is typically 0–1 already)
    return Math.min(1, gain * 0.65);
  }

  // ── Tick — runs at TICK_MS, lerps audio smoothing ────────────────────────
  function _tick(ts) {
    global.requestAnimationFrame(_tick);
    if (ts - _lastTick < TICK_MS) return;
    _lastTick = ts;

    var rawLevel     = _resolveRawAudioLevel();
    var driftMul     = (SBE.WorldDriftManager && SBE.WorldDriftManager.getState().pulseMultiplier) || 1.0;
    var scaledLevel  = Math.min(1, rawLevel * driftMul);
    var bus          = SBE.WorkspaceEventBus;
    var changed      = false;

    Object.keys(_presences).forEach(function (docId) {
      var p   = _presences[docId];
      var prev = p.audio.smoothed;
      // Lerp coefficient 0.08 — slow, atmospheric smoothing
      p.audio.smoothed = prev + (scaledLevel - prev) * 0.08;
      // Only emit if meaningfully changed (>0.001 threshold avoids constant updates)
      if (Math.abs(p.audio.smoothed - prev) > 0.001 && bus) {
        bus.emit("surface:presenceUpdated", { docId: docId, presence: p });
      }
    });
  }

  // ── Atmosphere → mood pulse update ───────────────────────────────────────
  function _onAtmosphere(evt) {
    if (!evt || !evt.state) return;
    var mood  = evt.state.mood || "neutral";
    var pulse = _pulseForMood(mood);
    var bus   = SBE.WorkspaceEventBus;

    Object.keys(_presences).forEach(function (docId) {
      var p = _presences[docId];
      if (p.moodPulse.cls === pulse.cls && p.moodPulse.intensity === pulse.intensity) return;
      p.moodPulse.cls       = pulse.cls;
      p.moodPulse.intensity = pulse.intensity;
      bus && bus.emit("surface:presenceUpdated", { docId: docId, presence: p });
    });
  }

  // ── Surface registration ──────────────────────────────────────────────────
  function _register(docId) {
    if (!_presences[docId]) {
      _presences[docId] = _defaultPresence(docId);
      // Seed mood pulse from current atmosphere
      var atm = SBE.WorldAtmosphere && SBE.WorldAtmosphere.getState();
      if (atm) {
        var pulse = _pulseForMood(atm.mood || "neutral");
        _presences[docId].moodPulse.cls       = pulse.cls;
        _presences[docId].moodPulse.intensity = pulse.intensity;
      }
    }
    return _presences[docId];
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  function getPresence(docId) { return _presences[docId] || null; }

  function getAllPulseClasses() { return ALL_PULSE_CLASSES.slice(); }

  function setSimulationState(docId, state) {
    var p = _presences[docId];
    if (!p) return;
    p.simulation.state = state;
    SBE.WorkspaceEventBus &&
      SBE.WorkspaceEventBus.emit("surface:presenceUpdated", { docId: docId, presence: p });
  }

  function setBroadcastMode(docId, mode) {
    var p = _presences[docId];
    if (!p) return;
    p.broadcast.mode = mode;
    SBE.WorkspaceEventBus &&
      SBE.WorkspaceEventBus.emit("surface:presenceUpdated", { docId: docId, presence: p });
  }

  function setOccupancy(docId, count, avatars) {
    var p = _presences[docId];
    if (!p) return;
    p.occupancy.count   = count || 0;
    p.occupancy.avatars = avatars || [];
    SBE.WorkspaceEventBus &&
      SBE.WorkspaceEventBus.emit("surface:presenceUpdated", { docId: docId, presence: p });
  }

  // ── init ──────────────────────────────────────────────────────────────────
  function init() {
    if (!SBE.Workspace) {
      console.warn("[SurfacePresenceManager] SBE.Workspace not available — aborting");
      return;
    }

    // Register all existing surfaces
    SBE.Workspace.getAllSurfaces().forEach(function (doc) { _register(doc.id); });

    var bus = SBE.WorkspaceEventBus;
    bus.on("world:atmosphereChanged", _onAtmosphere);
    bus.on("surface:created",  function (evt) { if (evt && evt.documentId) _register(evt.documentId); });
    bus.on("surface:activated", function (evt) { if (evt && evt.docId)      _register(evt.docId); });

    // Hydrate pulse from current atmosphere state
    var atm = SBE.WorldAtmosphere && SBE.WorldAtmosphere.getState();
    if (atm) _onAtmosphere({ state: atm });

    // Start the tick loop
    global.requestAnimationFrame(_tick);

    console.log("[SurfacePresenceManager] initialized —",
      Object.keys(_presences).length, "surface(s)");
  }

  SBE.SurfacePresenceManager = {
    init:               init,
    getPresence:        getPresence,
    getAllPulseClasses:  getAllPulseClasses,
    setSimulationState: setSimulationState,
    setBroadcastMode:   setBroadcastMode,
    setOccupancy:       setOccupancy,
  };

})(window);
