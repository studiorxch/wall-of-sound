// ── CitiBikeStationVisualProfile v1.0.0 ───────────────────────────────────────
// 0603D_WOS_CitiBikeStationVisualProfile_v1.0.0
// Status: active | Classification: interpretation-layer (truth → presentation)
//
// Interprets passive Citi Bike station truth (availability metadata) into a
// readable curb-pressure VISUAL STATE + profile. Registers a `bike.station`
// profile in SBE.ActorVisualRegistry and enables viewport safety. Does NOT
// fetch, mutate truth, create motion, or touch hero/AIS/aircraft/ambient/style.
// Load AFTER citibikeStationRuntime.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var MAX_VISIBLE_STATION_ACTORS = 600;

  var STATION_SCALE = {
    empty: 0.52, low: 0.62, balanced: 0.72, full: 0.84, stale: 0.55, offline: 0.48,
  };
  var STATION_OPACITY = {
    empty: 0.88, low: 0.92, balanced: 1.0, full: 1.0, stale: 0.45, offline: 0.30,
  };
  var STATE_PRIORITY = {   // higher = more attention-worthy
    offline: 5, empty: 4, stale: 3, low: 2, full: 1, balanced: 0,
  };
  var PALETTE_REF = {
    empty: 'citibike.station.empty', low: 'citibike.station.low',
    balanced: 'citibike.station.balanced', full: 'citibike.station.full',
    stale: 'citibike.station.stale', offline: 'citibike.station.offline',
  };
  var GLYPH_REF = {
    station: 'glyph.bike.station', ebike: 'glyph.bike.ebike',
    warning: 'glyph.status.warning', offline: 'glyph.status.offline',
  };

  var _enabled = false, _debug = false, _registered = false, _lastError = null;

  function _clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function _runtime() { return SBE.CitiBikeStationRuntime; }

  // ── State resolution (deterministic order: offline→stale→empty→low→full→balanced)
  function resolveStationState(metadata) {
    var m = metadata || {};
    var installed = m.isInstalled !== false;
    var renting   = m.isRenting   !== false;
    var returning = m.isReturning !== false;
    var bikes = typeof m.numBikesAvailable === 'number' ? m.numBikesAvailable : 0;
    var ratio = typeof m.pressureRatio === 'number' ? m.pressureRatio : 0;

    if (m.isInstalled === false || (m.isRenting === false && m.isReturning === false)) {
      return { state: 'offline', reason: 'not_installed_or_not_operating' };
    }
    if (m.statusStale === true) return { state: 'stale', reason: 'status_stale' };
    if (bikes === 0) return { state: 'empty', reason: 'no_bikes_available' };
    if (ratio > 0 && ratio < 0.25) return { state: 'low', reason: 'pressure_below_0.25' };
    if (ratio > 0.75) return { state: 'full', reason: 'pressure_above_0.75' };
    return { state: 'balanced', reason: 'pressure_0.25_to_0.75' };
  }

  // ── Visual resolution for one station actor ─────────────────────────────────
  function resolveStationVisual(actor) {
    var m = (actor && actor.metadata) || {};
    var res = resolveStationState(m);
    var state = res.state;
    var capacity = typeof m.capacity === 'number' ? m.capacity : 0;
    var capacityBoost = _clamp(capacity / 120, 0, 0.18);
    var finalScale = _clamp((STATION_SCALE[state] || 0.6) + capacityBoost, 0.45, 1.0);
    return {
      state: state,
      shape: 'station_node',
      variant: 'citibike_station_' + state,
      scale: Math.round(finalScale * 1000) / 1000,
      paletteRef: PALETTE_REF[state] || 'citibike.station.balanced',
      glyphRef: (state === 'offline') ? GLYPH_REF.offline
              : (state === 'stale')   ? GLYPH_REF.warning
              : ((m.numEbikesAvailable || 0) > 0 ? GLYPH_REF.ebike : GLYPH_REF.station),
      opacity: STATION_OPACITY[state] != null ? STATION_OPACITY[state] : 1.0,
      priority: STATE_PRIORITY[state] != null ? STATE_PRIORITY[state] : 0,
      metadata: {
        pressureRatio: typeof m.pressureRatio === 'number' ? m.pressureRatio : 0,
        bikes: m.numBikesAvailable || 0,
        docks: m.numDocksAvailable || 0,
        capacity: capacity,
      },
    };
  }

  // ── Register a bike.station profile in ActorVisualRegistry ───────────────────
  // (station_node shape; safe WSL fallback isolated here, not in the runtime.)
  function registerActorVisualProfile() {
    var reg = SBE.ActorVisualRegistry;
    if (!reg || typeof reg.registerVisualProfile !== 'function') { _lastError = 'actor_visual_registry_missing'; return false; }
    reg.registerVisualProfile({
      visualId: 'citibike_station_node',
      actorType: 'bike.station',
      renderer: 'worldSpaceVehicleLayer',
      shape: 'station_node',
      wslShape: 'traffic_car',          // temporary render fallback (isolated here)
      variant: 'sedan_light',
      paletteRef: 'citibike.station.balanced',
      glyphRef: GLYPH_REF.station,
      scale: STATION_SCALE.balanced,
      detailTier: 'low',
      depthPolicy: 'road',
      tags: ['truth', 'station', 'citibike'],
    });
    _registered = true;
    return true;
  }

  // ── Aggregate visual state (read-only; never deletes/mutates truth) ─────────
  function getState() {
    var rt = _runtime();
    var stations = (rt && typeof rt.listStations === 'function') ? rt.listStations() : [];
    var stateCounts = { offline: 0, stale: 0, empty: 0, low: 0, full: 0, balanced: 0 };
    for (var i = 0; i < stations.length; i++) {
      var st = resolveStationState(stations[i]);   // station record IS the metadata shape
      if (stateCounts[st.state] == null) stateCounts[st.state] = 0;
      stateCounts[st.state]++;
    }
    var visibleCandidateCount = stations.length;
    var capped = visibleCandidateCount > MAX_VISIBLE_STATION_ACTORS;
    return {
      version: VERSION,
      enabled: _enabled,
      debug: _debug,
      registered: _registered,
      viewportFilterEnabled: !!(rt && rt.getState && rt.getState().viewportFilterEnabled),
      stationCount: stations.length,
      visibleCandidateCount: visibleCandidateCount,
      maxVisibleStationActors: MAX_VISIBLE_STATION_ACTORS,
      capped: capped,
      stateCounts: stateCounts,
      lastError: _lastError,
    };
  }

  function setEnabled(on) {
    _enabled = on !== false;
    if (_enabled) {
      registerActorVisualProfile();
      // Viewport safety on by default when visuals are enabled (no truth deleted).
      var rt = _runtime();
      try { if (rt && typeof rt.setViewportFilter === 'function') rt.setViewportFilter(true); } catch (e) {}
    }
    console.log('[CitiBikeStationVisualProfile] enabled →', _enabled);
    return _enabled;
  }
  function setDebug(on) { _debug = on !== false; return _debug; }

  SBE.CitiBikeStationVisualProfile = Object.freeze({
    VERSION:                    VERSION,
    resolveStationState:        resolveStationState,
    resolveStationVisual:       resolveStationVisual,
    registerActorVisualProfile: registerActorVisualProfile,
    getState:                   getState,
    setEnabled:                 setEnabled,
    setDebug:                   setDebug,
  });

  // Register the profile on load (safe even before any fetch). Enable viewport
  // safety so the city-scale station layer stays performant by default.
  try { setEnabled(true); } catch (e) { _lastError = 'init_failed:' + (e && e.message ? e.message : e); }

  console.log('[CitiBikeStationVisualProfile] v' + VERSION + ' loaded');
})(window);
