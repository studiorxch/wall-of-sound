(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── SubwayTopologyRuntime (0520E_WOS_SubwayTopologyRuntime_v1.1.0) ─────────
  //
  // Urban nervous system infrastructure — persistent infrastructural pulse.
  //
  // CANONICAL RESPONSIBILITY SEPARATION:
  //   BroadcastScheduler owns intent.
  //   SurfaceRegistry owns identity.
  //   TransitionRuntime owns continuity.
  //   SubwayTopologyRuntime owns infrastructural pulse.
  //
  // TEMPORAL COUPLING DOCTRINE:
  //   This system NEVER runs an independent clock.
  //   All temporal context is derived from broadcast events.
  //   tick(broadcastTimeContext) is the only temporal entry point.
  //
  // EXTERNAL MUTATION DOCTRINE:
  //   All outputs are heuristic influence inputs to downstream systems.
  //   This system never overrides scheduling, forces transitions,
  //   hijacks Surfaces, or directly mutates atmosphere.
  //
  // PULSE EQUATION:
  //   P_district(t) = α * P_district(t-1) + Σ(W_line * I_phase * T_node)
  //
  // Emits (broadcast: namespace):
  //   broadcast:subwayPulseUpdated         { pulseState }
  //   broadcast:districtPressureChanged    { districtId, pressure }
  //   broadcast:transferIntensityChanged   { stationId, intensity }
  //   broadcast:infrastructurePhaseChanged { phase, hour }

  // ── Infrastructure phase map ──────────────────────────────────────────────
  var INFRA_PHASES = [
    { maxHour:  5, phase: "deep_night",      silenceBias: 0.85, rushAmp: 0.05, intensity: 0.10 },
    { maxHour:  7, phase: "early_morning",   silenceBias: 0.55, rushAmp: 0.40, intensity: 0.45 },
    { maxHour:  9, phase: "morning_rush",    silenceBias: 0.10, rushAmp: 1.20, intensity: 0.90 },
    { maxHour: 11, phase: "midmorning",      silenceBias: 0.25, rushAmp: 0.60, intensity: 0.65 },
    { maxHour: 14, phase: "midday",          silenceBias: 0.30, rushAmp: 0.55, intensity: 0.60 },
    { maxHour: 16, phase: "afternoon",       silenceBias: 0.20, rushAmp: 0.75, intensity: 0.70 },
    { maxHour: 19, phase: "evening_rush",    silenceBias: 0.08, rushAmp: 1.15, intensity: 0.92 },
    { maxHour: 21, phase: "early_evening",   silenceBias: 0.35, rushAmp: 0.45, intensity: 0.60 },
    { maxHour: 23, phase: "late_evening",    silenceBias: 0.60, rushAmp: 0.20, intensity: 0.35 },
    { maxHour: 24, phase: "late_night",      silenceBias: 0.78, rushAmp: 0.08, intensity: 0.18 },
  ];

  // Historical decay coefficient — how much prior district pressure persists
  var ALPHA = 0.82;

  // ── Core state ────────────────────────────────────────────────────────────
  var _state = {
    stations:      {},   // id → station descriptor
    lines:         {},   // id → line descriptor
    transferNodes: {},   // stationId → { weight, connectedLines }
    districtPulse: {},   // districtId → pressure 0–1
    pulseState: {
      intensity:    0,
      rushPressure: 0,
      silenceBias:  0,
    },
    topologyTime: {
      hour:  0,
      phase: "deep_night",
    },
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _bus()              { return SBE.WorkspaceEventBus; }
  function _emit(evt, payload) { var b = _bus(); b && b.emit(evt, payload); }
  function _clamp(v, lo, hi)   { return v < lo ? lo : v > hi ? hi : v; }

  // ── Phase derivation ──────────────────────────────────────────────────────
  function _deriveInfrastructuralPhase(hour) {
    for (var i = 0; i < INFRA_PHASES.length; i++) {
      if (hour < INFRA_PHASES[i].maxHour) return INFRA_PHASES[i];
    }
    return INFRA_PHASES[0];
  }

  // ── Station registration ──────────────────────────────────────────────────
  function registerStation(descriptor) {
    if (!descriptor || !descriptor.id) {
      console.warn("[SubwayTopologyRuntime] registerStation: descriptor requires id");
      return;
    }
    _state.stations[descriptor.id] = Object.assign({}, descriptor);

    // Index as transfer node if weight is meaningful
    if (descriptor.transferWeight && descriptor.transferWeight > 0.5) {
      _state.transferNodes[descriptor.id] = {
        weight:         descriptor.transferWeight,
        connectedLines: descriptor.lines || [],
      };
    }

    // Seed district pulse if not yet tracked
    if (descriptor.district && !_state.districtPulse[descriptor.district]) {
      _state.districtPulse[descriptor.district] = 0;
    }

    console.log("[SubwayTopologyRuntime] registered station:", descriptor.id,
      "district:", descriptor.district || "—",
      "transfer:", descriptor.transferWeight || "—");
  }

  // ── Line registration ─────────────────────────────────────────────────────
  function registerLine(descriptor) {
    if (!descriptor || !descriptor.id) {
      console.warn("[SubwayTopologyRuntime] registerLine: descriptor requires id");
      return;
    }
    _state.lines[descriptor.id] = Object.assign({}, descriptor);

    // Seed district pulses for all districts this line serves
    var districts = descriptor.districts || [];
    for (var i = 0; i < districts.length; i++) {
      if (!_state.districtPulse[districts[i]]) {
        _state.districtPulse[districts[i]] = 0;
      }
    }

    console.log("[SubwayTopologyRuntime] registered line:", descriptor.id,
      "districts:", districts.join(", ") || "—");
  }

  // ── Connection registry ───────────────────────────────────────────────────
  // Establishes spatial adjacency between two stations for continuity metrics.
  function connectStations(fromId, toId, opts) {
    var a = _state.stations[fromId];
    var b = _state.stations[toId];
    if (!a || !b) {
      console.warn("[SubwayTopologyRuntime] connectStations: unknown station(s)", fromId, toId);
      return;
    }
    opts = opts || {};
    a._connections = a._connections || [];
    b._connections = b._connections || [];

    var conn = {
      toId:           toId,
      lineId:         opts.lineId || null,
      tunnelDuration: opts.tunnelDurationMs || 90000,  // default 90s
      geoDelta:       _geoDistance(a.geographicAnchor, b.geographicAnchor),
    };
    // Prevent duplicates
    var exists = a._connections.some(function (c) { return c.toId === toId && c.lineId === opts.lineId; });
    if (!exists) a._connections.push(conn);

    var connB = { toId: fromId, lineId: opts.lineId || null,
      tunnelDuration: opts.tunnelDurationMs || 90000,
      geoDelta: conn.geoDelta };
    var existsB = b._connections.some(function (c) { return c.toId === fromId && c.lineId === opts.lineId; });
    if (!existsB) b._connections.push(connB);
  }

  // Haversine distance in km
  function _geoDistance(a, b) {
    if (!a || !b) return 0;
    var R  = 6371;
    var dLat = (b.lat - a.lat) * Math.PI / 180;
    var dLng = (b.lng - a.lng) * Math.PI / 180;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  // ── Pulse recalculation ───────────────────────────────────────────────────
  // P_district(t) = α * P_district(t-1) + Σ(W_line * I_phase * T_node)
  function _recalculateDistrictPulses(phaseProfile) {
    var districts = Object.keys(_state.districtPulse);
    var changed   = [];

    for (var d = 0; d < districts.length; d++) {
      var districtId = districts[d];
      var prior      = _state.districtPulse[districtId];

      // Collect all lines serving this district
      var lineIds = Object.keys(_state.lines);
      var sigma   = 0;

      for (var l = 0; l < lineIds.length; l++) {
        var line     = _state.lines[lineIds[l]];
        var lineDistricts = line.districts || [];
        if (lineIds[l] === "default" || lineDistricts.indexOf(districtId) === -1) continue;

        var rp   = line.rhythmProfile || {};
        var wLine = phaseProfile.rushAmp > 0.8
          ? (rp.daytimeIntensity || 0.5) * (rp.rushAmplification || 1.0)
          : phaseProfile.intensity < 0.3
            ? (rp.nighttimeIntensity || 0.2)
            : (rp.daytimeIntensity || 0.5);

        // Transfer node amplification: find stations in this district on this line
        var stationIds = Object.keys(_state.stations);
        var tNode      = 1.0;
        for (var s = 0; s < stationIds.length; s++) {
          var st = _state.stations[stationIds[s]];
          if (st.district === districtId && st.lines && st.lines.indexOf(lineIds[l]) !== -1) {
            var tn = _state.transferNodes[stationIds[s]];
            if (tn) tNode = Math.max(tNode, tn.weight);
          }
        }

        sigma += wLine * phaseProfile.intensity * tNode;
      }

      var next = _clamp(ALPHA * prior + sigma * (1 - ALPHA), 0, 1);
      _state.districtPulse[districtId] = next;

      if (Math.abs(next - prior) > 0.01) {
        changed.push({ districtId: districtId, pressure: next });
      }
    }

    // Emit per-district changes
    for (var i = 0; i < changed.length; i++) {
      _emit("broadcast:districtPressureChanged", changed[i]);
    }
  }

  // ── tick — canonical temporal entry point ─────────────────────────────────
  // TEMPORAL COUPLING DOCTRINE: never self-clock; derive from broadcast.
  function tick(broadcastTimeContext) {
    broadcastTimeContext = broadcastTimeContext || {};
    var hour = broadcastTimeContext.hour != null ? broadcastTimeContext.hour : _state.topologyTime.hour;

    var phaseProfile = _deriveInfrastructuralPhase(hour);
    var prevPhase    = _state.topologyTime.phase;

    _state.topologyTime.hour  = hour;
    _state.topologyTime.phase = phaseProfile.phase;

    // Smoothly converge pulse state toward phase targets
    var LERP = 0.08;
    var ps   = _state.pulseState;
    ps.intensity    = ps.intensity    + (phaseProfile.intensity  - ps.intensity)    * LERP;
    ps.rushPressure = ps.rushPressure + (phaseProfile.rushAmp    - ps.rushPressure) * LERP;
    ps.silenceBias  = ps.silenceBias  + (phaseProfile.silenceBias - ps.silenceBias) * LERP;

    _recalculateDistrictPulses(phaseProfile);

    _emit("broadcast:subwayPulseUpdated", { pulseState: Object.assign({}, ps) });

    if (prevPhase !== phaseProfile.phase) {
      _emit("broadcast:infrastructurePhaseChanged", {
        phase: phaseProfile.phase,
        hour:  hour,
      });
      console.log("[SubwayTopologyRuntime] phase →", phaseProfile.phase, "hour:", hour);
    }
  }

  // ── Event listeners ───────────────────────────────────────────────────────
  function _onScheduleAdvanced(evt) {
    if (!evt) return;
    var hour = evt.hour != null ? evt.hour : _state.topologyTime.hour;
    tick({ hour: hour, phase: evt.phase });
  }

  function _onDistrictChanged(evt) {
    if (!evt || !evt.districtId) return;
    // Acknowledge district change — pulse will naturally shift on next tick
    console.log("[SubwayTopologyRuntime] district context:", evt.districtId);
  }

  function _onTransitionResolved(evt) {
    // On surface transition, nudge a fresh pulse calculation at current time
    tick({ hour: _state.topologyTime.hour });
  }

  // ── Getters ───────────────────────────────────────────────────────────────
  function getStation(id)  { return _state.stations[id] || null; }
  function getLine(id)     { return _state.lines[id] || null; }
  function getState()      { return _state; }

  function getConnectedStations(stationId) {
    var st = _state.stations[stationId];
    if (!st) return [];
    return (st._connections || []).map(function (c) {
      return Object.assign({ station: _state.stations[c.toId] || null }, c);
    });
  }

  function getDistrictPulse(districtId) {
    return districtId
      ? (_state.districtPulse[districtId] || 0)
      : Object.assign({}, _state.districtPulse);
  }

  // ── Default NYC topology seed ─────────────────────────────────────────────
  function _seedDefaultTopology() {
    // Lines
    registerLine({
      id: "L", type: "subway",
      districts: ["canarsie", "bushwick", "williamsburg", "union_square", "chelsea"],
      rhythmProfile: { daytimeIntensity: 0.80, nighttimeIntensity: 0.35, rushAmplification: 1.20 },
      atmosphereBias: { urgency: 0.60, isolation: 0.20 },
    });
    registerLine({
      id: "A", type: "subway",
      districts: ["far_rockaway", "bed_stuy", "downtown_brooklyn", "lower_manhattan", "midtown", "harlem", "washington_heights"],
      rhythmProfile: { daytimeIntensity: 0.85, nighttimeIntensity: 0.55, rushAmplification: 1.15 },
      atmosphereBias: { urgency: 0.50, isolation: 0.10 },
    });
    registerLine({
      id: "G", type: "subway",
      districts: ["long_island_city", "greenpoint", "williamsburg", "bed_stuy", "park_slope", "carroll_gardens"],
      rhythmProfile: { daytimeIntensity: 0.55, nighttimeIntensity: 0.30, rushAmplification: 0.85 },
      atmosphereBias: { urgency: 0.25, isolation: 0.55 },
    });
    registerLine({
      id: "J", type: "subway",
      districts: ["jamaica", "cypress_hills", "bushwick", "ridgewood", "downtown_brooklyn"],
      rhythmProfile: { daytimeIntensity: 0.65, nighttimeIntensity: 0.25, rushAmplification: 1.05 },
      atmosphereBias: { urgency: 0.45, isolation: 0.40 },
    });
    registerLine({
      id: "N", type: "subway",
      districts: ["astoria", "long_island_city", "midtown", "union_square", "brooklyn", "coney_island"],
      rhythmProfile: { daytimeIntensity: 0.78, nighttimeIntensity: 0.40, rushAmplification: 1.10 },
      atmosphereBias: { urgency: 0.55, isolation: 0.15 },
    });

    // Stations
    registerStation({
      id: "14_st_union_sq", name: "14 St - Union Sq",
      borough: "Manhattan", district: "union_square",
      lines: ["N", "Q", "R", "W", "4", "5", "6", "L"],
      transferWeight: 0.95,
      atmosphereBias: { tension: 0.70, density: 0.80, silence: 0.10 },
      geographicAnchor: { lat: 40.7347, lng: -73.9900 },
    });
    registerStation({
      id: "atlantic_av_barclays", name: "Atlantic Av - Barclays Ctr",
      borough: "Brooklyn", district: "downtown_brooklyn",
      lines: ["B", "D", "N", "Q", "R", "2", "3", "4", "5", "G"],
      transferWeight: 0.92,
      atmosphereBias: { tension: 0.60, density: 0.75, silence: 0.15 },
      geographicAnchor: { lat: 40.6838, lng: -73.9769 },
    });
    registerStation({
      id: "bedford_av", name: "Bedford Av",
      borough: "Brooklyn", district: "williamsburg",
      lines: ["L"],
      transferWeight: 0.60,
      atmosphereBias: { tension: 0.30, density: 0.55, silence: 0.35 },
      geographicAnchor: { lat: 40.7171, lng: -73.9563 },
    });
    registerStation({
      id: "metropolitan_av_williamsburg", name: "Metropolitan Av",
      borough: "Brooklyn", district: "williamsburg",
      lines: ["G"],
      transferWeight: 0.45,
      atmosphereBias: { tension: 0.20, density: 0.40, silence: 0.55 },
      geographicAnchor: { lat: 40.7143, lng: -73.9514 },
    });
    registerStation({
      id: "lorimer_st", name: "Lorimer St",
      borough: "Brooklyn", district: "williamsburg",
      lines: ["G", "L"],
      transferWeight: 0.72,
      atmosphereBias: { tension: 0.35, density: 0.50, silence: 0.40 },
      geographicAnchor: { lat: 40.7142, lng: -73.9494 },
    });
    registerStation({
      id: "broadway_junction", name: "Broadway Junction",
      borough: "Brooklyn", district: "bed_stuy",
      lines: ["A", "C", "J", "L", "Z"],
      transferWeight: 0.88,
      atmosphereBias: { tension: 0.65, density: 0.70, silence: 0.12 },
      geographicAnchor: { lat: 40.6788, lng: -73.9049 },
    });
    registerStation({
      id: "fulton_st", name: "Fulton St",
      borough: "Manhattan", district: "lower_manhattan",
      lines: ["2", "3", "4", "5", "A", "C", "J", "Z"],
      transferWeight: 0.90,
      atmosphereBias: { tension: 0.75, density: 0.85, silence: 0.08 },
      geographicAnchor: { lat: 40.7090, lng: -74.0075 },
    });

    // Connections
    connectStations("bedford_av",    "lorimer_st",    { lineId: "L", tunnelDurationMs: 120000 });
    connectStations("lorimer_st",    "broadway_junction", { lineId: "L", tunnelDurationMs: 300000 });
    connectStations("lorimer_st",    "metropolitan_av_williamsburg", { lineId: "G", tunnelDurationMs: 90000 });
    connectStations("14_st_union_sq","bedford_av",    { lineId: "L", tunnelDurationMs: 420000 });
    connectStations("broadway_junction", "atlantic_av_barclays", { lineId: "A", tunnelDurationMs: 240000 });
    connectStations("fulton_st",     "atlantic_av_barclays", { lineId: "N", tunnelDurationMs: 300000 });
  }

  // ── init ──────────────────────────────────────────────────────────────────
  function init() {
    var bus = _bus();
    if (bus) {
      bus.on("broadcast:scheduleAdvanced",  _onScheduleAdvanced);
      bus.on("broadcast:districtChanged",   _onDistrictChanged);
      bus.on("broadcast:transitionResolved", _onTransitionResolved);
    }

    _seedDefaultTopology();

    // Hydrate from WorldDriftManager if available
    var drift = SBE.WorldDriftManager && SBE.WorldDriftManager.getState();
    if (drift) tick({ hour: drift.hour });
    else tick({ hour: 0 });

    console.log("[SubwayTopologyRuntime] initialized v1.1.0 — infrastructural pulse active");
  }

  SBE.SubwayTopologyRuntime = {
    init:                 init,
    registerStation:      registerStation,
    registerLine:         registerLine,
    connectStations:      connectStations,
    getStation:           getStation,
    getLine:              getLine,
    getConnectedStations: getConnectedStations,
    getDistrictPulse:     getDistrictPulse,
    tick:                 tick,
    getState:             getState,
  };

})(window);
