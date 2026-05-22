(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── GridRuntime (0520F_WOS_GridRuntime_v1.1.0) ────────────────────────────
  //
  // Persistent spatial influence resolution infrastructure.
  // The environmental field substrate of the city.
  //
  // CANONICAL RESPONSIBILITY SEPARATION:
  //   BroadcastScheduler owns intent.
  //   SurfaceRegistry owns identity.
  //   TransitionRuntime owns continuity.
  //   SubwayTopologyRuntime owns infrastructural pulse.
  //   AtmosphereRuntime owns environmental state.
  //   GridRuntime owns spatial field resolution.
  //
  // FIELD RESOLUTION ORDER:
  //   1. Base environmental state (from AtmosphereRuntime).
  //   2. Active field injections.
  //   3. Spatial diffusion (≤10Hz).
  //   4. Inertia filter — continuity has final authority.
  //
  // DOUBLE-BUFFERED SNAPSHOT DOCTRINE:
  //   All writes go to writeBuffer.
  //   readSnapshot is frozen at end of each tick.
  //   Consumers always read from readSnapshot.
  //
  // BILINEAR SPATIAL SAMPLING:
  //   sampleInterpolated(wx, wy) → blended environmental influence.
  //   Never exposes raw cell boundary snapping.
  //
  // GEOGRAPHIC PROJECTION:
  //   Flat-earth approximation centered on Brooklyn/Manhattan.
  //   Reference SW corner: (REF_LAT, REF_LNG).
  //   Cell resolution: CELL_RES meters per cell.
  //
  // Emits (broadcast: namespace):
  //   broadcast:gridFieldUpdated          { statistics }
  //   broadcast:spatialPressureChanged    { x, y, pressure }
  //   broadcast:environmentalZoneShifted  { zone, scalars }

  // ── Grid constants ────────────────────────────────────────────────────────
  var GRID_SIZE = 128;       // cells per axis
  var CELL_RES  = 100;       // meters per cell
  var TOTAL     = GRID_SIZE * GRID_SIZE;

  // Geographic projection — flat-earth approximation at 40.7°N
  var REF_LAT              = 40.630;   // SW grid corner latitude
  var REF_LNG              = -74.040;  // SW grid corner longitude
  var METERS_PER_DEG_LAT   = 111320;
  var METERS_PER_DEG_LNG   = 85395;   // at 40.7°N

  // Diffusion
  var DIFFUSION_CADENCE_MS = 200;   // 5Hz
  var DIFFUSION_GAMMA      = 0.06;  // gentle neighborhood bleed

  // Inertia per scalar (higher = slower convergence)
  var SCALAR_INERTIA = {
    lightLevel:         0.90,
    ambientLevel:       0.88,
    silencePressure:    0.92,
    weatherExposure:    0.85,
    density:            0.85,
    chromaticIntensity: 0.90,
    fogIsolation:       0.92,
    transitPressure:    0.80,
    cinematicWeight:    0.88,
  };

  // Scalar keys for tight loops (avoids Object.keys() allocation per cell)
  var SCALAR_KEYS = [
    "lightLevel", "ambientLevel", "silencePressure", "weatherExposure",
    "density", "chromaticIntensity", "fogIsolation", "transitPressure",
    "cinematicWeight",
  ];

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function _lerp(a, b, t)    { return a + (b - a) * t; }
  function _bus()             { return SBE.WorkspaceEventBus; }
  function _emit(e, p)        { var b = _bus(); b && b.emit(e, p); }

  // ── Geographic projection ─────────────────────────────────────────────────
  function latLngToWorld(lat, lng) {
    return {
      x: (lng - REF_LNG) * METERS_PER_DEG_LNG,
      y: (lat - REF_LAT) * METERS_PER_DEG_LAT,
    };
  }

  function _worldToFrac(wx, wy) {
    // Returns fractional cell coordinates (may be non-integer)
    return {
      fx: wx / CELL_RES,
      fy: wy / CELL_RES,
    };
  }

  function _cellIndex(gx, gy) {
    gx = _clamp(gx | 0, 0, GRID_SIZE - 1);
    gy = _clamp(gy | 0, 0, GRID_SIZE - 1);
    return gy * GRID_SIZE + gx;
  }

  // ── Cell factory ──────────────────────────────────────────────────────────
  function _makeCell(gx, gy) {
    return {
      id: "cell_" + gx + "_" + gy,
      coordinates: { x: gx, y: gy },
      scalars: {
        lightLevel:         0.08,
        ambientLevel:       0.40,
        silencePressure:    0.70,
        weatherExposure:    0.85,
        density:            0.12,
        chromaticIntensity: 0.42,
        fogIsolation:       0.10,
        transitPressure:    0.05,
        cinematicWeight:    0.50,
      },
    };
  }

  // ── Buffer allocation — pre-allocate both buffers at init ─────────────────
  function _allocBuffer() {
    var buf = new Array(TOTAL);
    for (var gy = 0; gy < GRID_SIZE; gy++) {
      for (var gx = 0; gx < GRID_SIZE; gx++) {
        buf[gy * GRID_SIZE + gx] = _makeCell(gx, gy);
      }
    }
    return buf;
  }

  // ── Core state ────────────────────────────────────────────────────────────
  var _writeBuffer  = null;
  var _readSnapshot = null;

  var _state = {
    gridSize:             GRID_SIZE,
    cellResolutionMeters: CELL_RES,
    worldBounds: {
      minX: 0,
      minY: 0,
      maxX: GRID_SIZE * CELL_RES,
      maxY: GRID_SIZE * CELL_RES,
    },
    writeBuffer:   null,   // reference, not embedded
    readSnapshot:  null,   // reference, not embedded
    temporalState: { phase: "deep_night", hour: 0 },
    statistics:    { activeFields: 0, updatedCells: 0, averagePressure: 0 },
  };

  // Active field injections
  var _injections       = [];
  var _lastDiffusionMs  = 0;

  // ── Field injection ───────────────────────────────────────────────────────
  function injectField(opts) {
    if (!opts || !opts.source || !opts.center) {
      console.warn("[GridRuntime] injectField: opts requires source and center");
      return;
    }
    _injections.push({
      source:    opts.source,
      center:    { x: opts.center.x || 0, y: opts.center.y || 0 },
      radius:    opts.radius  || 300,
      pressure:  Object.assign({}, opts.pressure || {}),
      decay:     opts.decay   != null ? opts.decay : 0.92,
      timestamp: opts.timestamp || performance.now(),
      durationMs: opts.durationMs || 0,  // 0 = permanent until removed
    });
  }

  // ── Apply one injection to writeBuffer ────────────────────────────────────
  function _applyInjection(inj, now) {
    var cx  = inj.center.x / CELL_RES;
    var cy  = inj.center.y / CELL_RES;
    var rad = inj.radius   / CELL_RES;

    // Compute injection weight from age if durationMs set
    var weight = 1.0;
    if (inj.durationMs > 0) {
      var elapsed  = now - inj.timestamp;
      var progress = _clamp(elapsed / inj.durationMs, 0, 1);
      weight       = 1 - progress;
    }
    if (weight <= 0.001) return false;  // expired

    var keys = Object.keys(inj.pressure);
    var radSq = rad * rad;

    // Bounded scan: only cells within bounding box of radius
    var gxMin = _clamp(Math.floor(cx - rad) - 1, 0, GRID_SIZE - 1);
    var gxMax = _clamp(Math.ceil(cx  + rad) + 1, 0, GRID_SIZE - 1);
    var gyMin = _clamp(Math.floor(cy - rad) - 1, 0, GRID_SIZE - 1);
    var gyMax = _clamp(Math.ceil(cy  + rad) + 1, 0, GRID_SIZE - 1);

    for (var gy = gyMin; gy <= gyMax; gy++) {
      for (var gx = gxMin; gx <= gxMax; gx++) {
        var dx   = gx - cx;
        var dy   = gy - cy;
        var dist = dx * dx + dy * dy;
        if (dist > radSq) continue;

        var falloff = Math.pow(inj.decay, Math.sqrt(dist));
        var idx     = gy * GRID_SIZE + gx;
        var cell    = _writeBuffer[idx];
        var sc      = cell.scalars;

        for (var k = 0; k < keys.length; k++) {
          var key = keys[k];
          if (sc[key] != null) {
            sc[key] = _clamp(sc[key] + inj.pressure[key] * falloff * weight, 0, 1);
          }
        }
      }
    }
    return true;
  }

  // ── Spatial diffusion — 5Hz, bounded loop ─────────────────────────────────
  // Cell_new = Cell_current + γ * (avgNeighbors - Cell_current)
  function _diffuse() {
    var ki, k, idx, n;
    var nSum   = new Array(SCALAR_KEYS.length);
    var nCount = 0;

    for (var gy = 0; gy < GRID_SIZE; gy++) {
      for (var gx = 0; gx < GRID_SIZE; gx++) {
        idx = gy * GRID_SIZE + gx;
        var cell = _writeBuffer[idx];
        var sc   = cell.scalars;

        // Accumulate neighbor scalars (4-connected)
        for (ki = 0; ki < SCALAR_KEYS.length; ki++) nSum[ki] = 0;
        nCount = 0;

        if (gx > 0)            { var l = _writeBuffer[idx - 1].scalars;              for (ki = 0; ki < SCALAR_KEYS.length; ki++) nSum[ki] += l[SCALAR_KEYS[ki]]; nCount++; }
        if (gx < GRID_SIZE-1)  { var r = _writeBuffer[idx + 1].scalars;              for (ki = 0; ki < SCALAR_KEYS.length; ki++) nSum[ki] += r[SCALAR_KEYS[ki]]; nCount++; }
        if (gy > 0)            { var u = _writeBuffer[idx - GRID_SIZE].scalars;      for (ki = 0; ki < SCALAR_KEYS.length; ki++) nSum[ki] += u[SCALAR_KEYS[ki]]; nCount++; }
        if (gy < GRID_SIZE-1)  { var d = _writeBuffer[idx + GRID_SIZE].scalars;      for (ki = 0; ki < SCALAR_KEYS.length; ki++) nSum[ki] += d[SCALAR_KEYS[ki]]; nCount++; }

        if (nCount === 0) continue;

        for (ki = 0; ki < SCALAR_KEYS.length; ki++) {
          k = SCALAR_KEYS[ki];
          var avg = nSum[ki] / nCount;
          sc[k] = _clamp(sc[k] + DIFFUSION_GAMMA * (avg - sc[k]), 0, 1);
        }
      }
    }
  }

  // ── Apply atmosphere baseline across all cells ────────────────────────────
  function _applyAtmosphereBaseline(atm, dt) {
    if (!atm) return;

    // Derived per-cell targets from global atmosphere
    var tgt = {
      lightLevel:         atm.lightLevel         || 0,
      ambientLevel:       atm.densityBias         || 0,
      silencePressure:    (atm.soundtrackBias && atm.soundtrackBias.silence) || 0,
      weatherExposure:    atm.visibility          || 0,
      density:            atm.densityBias         || 0,
      chromaticIntensity: (atm.colorBias && atm.colorBias.chromaticIntensity) || 0,
      fogIsolation:       atm.fog                 || 0,
      transitPressure:    0,   // will be overridden by STR injections
      cinematicWeight:    atm.cinematicPressure   || 0,
    };

    // frame-rate-independent inertia factor
    for (var i = 0; i < TOTAL; i++) {
      var sc = _writeBuffer[i].scalars;
      for (var ki = 0; ki < SCALAR_KEYS.length; ki++) {
        var key = SCALAR_KEYS[ki];
        if (key === "transitPressure") continue;  // managed by injections
        var iner   = SCALAR_INERTIA[key];
        var factor = 1 - Math.pow(iner, dt);
        sc[key]    = _lerp(sc[key], tgt[key], factor);
      }
    }
  }

  // ── Subway topology → field injections ───────────────────────────────────
  function _injectSubwayInfluence() {
    var str = SBE.SubwayTopologyRuntime;
    if (!str) return;

    var ps       = str.getState().pulseState;
    var stations = str.getState().stations;
    var sIds     = Object.keys(stations);

    for (var i = 0; i < sIds.length; i++) {
      var st  = stations[sIds[i]];
      if (!st.geographicAnchor) continue;

      var tw  = st.transferWeight || 0.5;
      var wxy = latLngToWorld(st.geographicAnchor.lat, st.geographicAnchor.lng);

      injectField({
        source:     "subway_" + st.id,
        center:     wxy,
        radius:     200 + tw * 300,
        pressure: {
          transitPressure: tw * ps.intensity * 0.8,
          density:         tw * ps.rushPressure * 0.3,
          silencePressure: -(tw * ps.rushPressure * 0.2),
          cinematicWeight: tw * 0.15,
        },
        decay:      0.88,
        durationMs: 500,    // short-lived; re-injected each tick
        timestamp:  performance.now(),
      });
    }
  }

  // ── tick ──────────────────────────────────────────────────────────────────
  function tick(broadcastTimeContext) {
    broadcastTimeContext = broadcastTimeContext || {};
    var hour  = broadcastTimeContext.hour  != null ? broadcastTimeContext.hour : _state.temporalState.hour;
    var phase = broadcastTimeContext.phase  || _state.temporalState.phase;
    var dt    = broadcastTimeContext.deltaTimeSeconds != null ? broadcastTimeContext.deltaTimeSeconds : 0.25;
    dt        = _clamp(dt, 0.001, 2.0);

    _state.temporalState.hour  = hour;
    _state.temporalState.phase = phase;

    var now = performance.now();

    // ── Step 1: atmosphere baseline (inertia-filtered) ─────────────────
    var atm = SBE.AtmosphereRuntime && SBE.AtmosphereRuntime.getResolvedAtmosphere();
    _applyAtmosphereBaseline(atm, dt);

    // ── Step 2: inject subway topology influence ───────────────────────
    _injectSubwayInfluence();

    // ── Step 3: apply all active field injections ─────────────────────
    var live = [];
    for (var i = 0; i < _injections.length; i++) {
      var alive = _applyInjection(_injections[i], now);
      if (alive) live.push(_injections[i]);
    }
    _injections = live;

    // ── Step 4: spatial diffusion — 5Hz ───────────────────────────────
    if (now - _lastDiffusionMs >= DIFFUSION_CADENCE_MS) {
      _diffuse();
      _lastDiffusionMs = now;
    }

    // ── Step 5: swap buffers — readSnapshot ← writeBuffer ─────────────
    var tmp       = _readSnapshot;
    _readSnapshot = _writeBuffer;
    _writeBuffer  = tmp;

    // Copy readSnapshot state back into writeBuffer for next tick
    for (var j = 0; j < TOTAL; j++) {
      var src = _readSnapshot[j].scalars;
      var dst = _writeBuffer[j].scalars;
      for (var ki = 0; ki < SCALAR_KEYS.length; ki++) {
        var key = SCALAR_KEYS[ki];
        dst[key] = src[key];
      }
    }

    // ── Statistics ────────────────────────────────────────────────────
    var pressureSum = 0;
    var sampleStep  = 16;  // sample every 16th cell for performance
    var sampleCount = 0;
    for (var si = 0; si < TOTAL; si += sampleStep) {
      pressureSum += _readSnapshot[si].scalars.cinematicWeight;
      sampleCount++;
    }
    _state.statistics.activeFields    = _injections.length;
    _state.statistics.updatedCells    = TOTAL;
    _state.statistics.averagePressure = sampleCount ? pressureSum / sampleCount : 0;

    _emit("broadcast:gridFieldUpdated", { statistics: Object.assign({}, _state.statistics) });
  }

  // ── getCell — direct access (prefer sampleInterpolated) ──────────────────
  function getCell(gx, gy) {
    var c = _readSnapshot[_cellIndex(gx, gy)];
    if (!c) return null;
    // Return shallow copy of scalars — never the live reference
    return { id: c.id, coordinates: { x: c.coordinates.x, y: c.coordinates.y }, scalars: Object.assign({}, c.scalars) };
  }

  // ── sample — world coords → nearest cell scalars ──────────────────────────
  function sample(wx, wy) {
    var gx = _clamp(Math.floor(wx / CELL_RES), 0, GRID_SIZE - 1);
    var gy = _clamp(Math.floor(wy / CELL_RES), 0, GRID_SIZE - 1);
    return getCell(gx, gy);
  }

  // ── sampleInterpolated — bilinear spatial sampling ────────────────────────
  // Value_sampled = (1-u)(1-v)*C00 + u(1-v)*C10 + (1-u)v*C01 + uv*C11
  function sampleInterpolated(wx, wy) {
    var f  = _worldToFrac(wx, wy);
    var gx = Math.floor(f.fx);
    var gy = Math.floor(f.fy);
    var u  = f.fx - gx;
    var v  = f.fy - gy;

    gx = _clamp(gx, 0, GRID_SIZE - 1);
    gy = _clamp(gy, 0, GRID_SIZE - 1);
    var gx1 = _clamp(gx + 1, 0, GRID_SIZE - 1);
    var gy1 = _clamp(gy + 1, 0, GRID_SIZE - 1);

    var c00 = _readSnapshot[gy  * GRID_SIZE + gx ].scalars;
    var c10 = _readSnapshot[gy  * GRID_SIZE + gx1].scalars;
    var c01 = _readSnapshot[gy1 * GRID_SIZE + gx ].scalars;
    var c11 = _readSnapshot[gy1 * GRID_SIZE + gx1].scalars;

    var w00 = (1 - u) * (1 - v);
    var w10 = u       * (1 - v);
    var w01 = (1 - u) * v;
    var w11 = u       * v;

    var out = {};
    for (var ki = 0; ki < SCALAR_KEYS.length; ki++) {
      var key = SCALAR_KEYS[ki];
      out[key] = w00 * c00[key] + w10 * c10[key] + w01 * c01[key] + w11 * c11[key];
    }
    return out;
  }

  // ── sampleAtLatLng — convenience wrapper ──────────────────────────────────
  function sampleAtLatLng(lat, lng) {
    var wxy = latLngToWorld(lat, lng);
    return sampleInterpolated(wxy.x, wxy.y);
  }

  // ── getState ──────────────────────────────────────────────────────────────
  function getState() { return _state; }

  // ── Event listeners ───────────────────────────────────────────────────────
  function _onScheduleAdvanced(evt) {
    if (!evt) return;
    var dt = evt.deltaTimeSeconds != null ? evt.deltaTimeSeconds : 0.5;
    tick({ hour: evt.hour, phase: evt.phase, deltaTimeSeconds: dt });
  }

  function _onAtmosphereUpdated() {
    // Atmosphere pull is live in tick(); no action needed here
  }

  function _onSubwayPulseUpdated() {
    // STR influence is re-injected each tick(); no action needed here
  }

  function _onTransitionProgress(evt) {
    if (!evt) return;
    // Could bias cinematic weight during transitions — reserved for future use
  }

  // ── init ──────────────────────────────────────────────────────────────────
  function init() {
    _writeBuffer  = _allocBuffer();
    _readSnapshot = _allocBuffer();

    _state.writeBuffer  = _writeBuffer;
    _state.readSnapshot = _readSnapshot;

    var bus = _bus();
    if (bus) {
      bus.on("broadcast:scheduleAdvanced",   _onScheduleAdvanced);
      bus.on("broadcast:atmosphereUpdated",  _onAtmosphereUpdated);
      bus.on("broadcast:subwayPulseUpdated", _onSubwayPulseUpdated);
      bus.on("broadcast:transitionProgress", _onTransitionProgress);
    }

    // Hydrate from current world state
    var drift = SBE.WorldDriftManager && SBE.WorldDriftManager.getState();
    tick({ hour: drift ? drift.hour : 0, deltaTimeSeconds: 0.5 });

    console.log("[GridRuntime] initialized v1.1.0 — 128×128 spatial field lattice active",
      "(" + (GRID_SIZE * CELL_RES / 1000).toFixed(1) + "km²)");
  }

  SBE.GridRuntime = {
    init:               init,
    tick:               tick,
    sample:             sample,
    sampleInterpolated: sampleInterpolated,
    sampleAtLatLng:     sampleAtLatLng,
    getCell:            getCell,
    injectField:        injectField,
    getState:           getState,
    latLngToWorld:      latLngToWorld,
  };

})(window);
