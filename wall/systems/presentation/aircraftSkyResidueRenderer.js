// ── AircraftSkyResidueRenderer v1.0.0 ────────────────────────────────────────
// 0528R_WOS_AircraftContrailAndNavLighting_v1.0.0
// Status: active
// Classification: presentation-runtime
//
// Purpose:
//   Aircraft leave temporary sky residue as they traverse atmosphere.
//   Contrail segments are stored as geo coordinates (lat/lng) and projected
//   each frame — so the trail correctly follows geography as camera moves.
//   A soft fog-diffusion halo improves nav light atmospheric readability.
//
//   Three residue types (vapor only for now; glyph_seed ready for GlyphLab):
//     'contrail'      — standard cruise/descent vapor trail
//     'vapor'         — softer, lower-altitude wisps
//     'glyph_seed'    — future GlyphLab residue path marker (inactive)
//
//   Canvas at z-index 5: contrails render BELOW atmosphere haze (z:6) so fog
//   correctly obscures the trail — aircraft feel embedded in weather.
//
// Authority:
//   OWNS: contrail segments, vapor residue aging, drift offsets,
//         nav-light diffusion halos
//   READS: AircraftRuntime, AtmosphericContinuityRuntime,
//          CloudAtmosphereLayer, MapboxViewportRuntime
//   MUST NOT MUTATE: aircraft entity, trip state, planner state,
//                    atmospheric truth, cloud presets, map style
//
// Segment caps:
//   maxSegmentsPerAircraft = 80
//   maxTotalSegments       = 600
//
// Placement: wall/systems/presentation/aircraftSkyResidueRenderer.js
// Load: AFTER aircraftRenderer.js, AFTER atmosphericContinuityRuntime.js,
//       BEFORE regionalFlightTripDebug.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Configuration ─────────────────────────────────────────────────────────────

  var MAX_SEGS_PER_AIRCRAFT = 80;
  var MAX_TOTAL_SEGS        = 600;

  // Minimum geographic distance before a new segment is recorded.
  // ~0.0006° ≈ 60m at mid-latitudes.
  var MIN_SEGMENT_DIST_DEG  = 0.0006;

  // Altitude threshold for contrail eligibility
  var CONTRAIL_ALT_MIN      = 0.62;

  // Contrail lifespan by cloud preset (ms)
  var LIFE_BY_PRESET = Object.freeze({
    clear:       22000,
    thin:        30000,
    harbor_fog:  38000,
    storm_shelf: 45000,
  });

  // Nav light blink period and duty cycle
  var BLINK_PERIOD_MS = 1200;
  var BLINK_DUTY      = 0.35;   // 35% on

  // ── State ─────────────────────────────────────────────────────────────────────

  var _enabled        = true;
  var _contrailsOn    = true;
  var _navLightsOn    = true;
  var _glyphSeedOn    = false;   // future hook — inactive this build

  var _segments       = {};    // { aircraftId: [segment, ...] }  newest at end
  var _totalSegCount  = 0;

  var _canvas         = null;
  var _ctx            = null;
  var _rafId          = null;
  var _lastFrameMs    = 0;

  // ── Canvas ────────────────────────────────────────────────────────────────────

  function _ensureCanvas() {
    if (_canvas && _canvas.parentElement) return true;
    var container = document.querySelector('.mapboxgl-canvas-container') ||
                    document.getElementById('map') || document.body;
    _canvas     = document.createElement('canvas');
    _canvas.id  = 'wos-sky-residue-canvas';
    _canvas.setAttribute('aria-hidden', 'true');
    _canvas.style.cssText = [
      'position:absolute', 'top:0', 'left:0',
      'width:100%', 'height:100%',
      'pointer-events:none', 'z-index:5',   // below atmosphere:6, aircraft:8
    ].join(';');
    if (container !== document.body &&
        (!container.style.position || container.style.position === 'static')) {
      container.style.position = 'relative';
    }
    container.appendChild(_canvas);
    _ctx = _canvas.getContext('2d');
    return true;
  }

  function _resizeCanvas() {
    if (!_canvas || !_canvas.parentElement) return;
    var p = _canvas.parentElement;
    var w = p.clientWidth  || global.innerWidth;
    var h = p.clientHeight || global.innerHeight;
    if (_canvas.width !== w || _canvas.height !== h) {
      _canvas.width  = w;
      _canvas.height = h;
    }
  }

  // ── Projection ────────────────────────────────────────────────────────────────

  function _project(lat, lng) {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    if (!mvr || !mvr.project) return null;
    try { return mvr.project([lng, lat]); } catch (e) { return null; }
  }

  // ── Atmospheric state reader ───────────────────────────────────────────────────

  function _getAtmo() {
    var acr = global.SBE && SBE.AtmosphericContinuityRuntime;
    if (acr && acr.getState) {
      var s = acr.getState();
      return s.atmosphere;
    }
    return {
      hazeDensity: 0, fogDensity: 0, thermalDistortion: 0,
      electricalActivity: 0, silenceScalar: 0, pressureScalar: 0,
      resonanceScalar: 0,
    };
  }

  function _getCloudPreset() {
    var cal = global.SBE && SBE.CloudAtmosphereLayer;
    return (cal && cal.getPreset) ? cal.getPreset() : 'clear';
  }

  // ── Segment eligibility ───────────────────────────────────────────────────────

  function _isEligible(e) {
    if (!e.lat || !e.lng) return false;
    if (e.altitudeScalar < CONTRAIL_ALT_MIN) return false;
    if (e.lifecycleState !== 'CRUISE' && e.lifecycleState !== 'DESCENT') return false;
    return true;
  }

  // Distance check (squared, in degrees — fast, no trig)
  function _distSqDeg(lat1, lng1, lat2, lng2) {
    var dlat = lat2 - lat1;
    var dlng = lng2 - lng1;
    return dlat * dlat + dlng * dlng;
  }

  // ── Segment management ────────────────────────────────────────────────────────

  function _appendSegment(e, preset, atmo) {
    var pool = _segments[e.id] || (_segments[e.id] = []);

    // Distance gate — don't append if too close to last point
    if (pool.length > 0) {
      var last = pool[pool.length - 1];
      var d2   = _distSqDeg(last.lat + last.driftLat, last.lng + last.driftLng, e.lat, e.lng);
      if (d2 < MIN_SEGMENT_DIST_DEG * MIN_SEGMENT_DIST_DEG) return;
    }

    var lifeMs = LIFE_BY_PRESET[preset] || 28000;

    // Silence shortens life (atmosphere is too still for persistent trails)
    lifeMs *= Math.max(0.5, 1 - atmo.silenceScalar * 0.4);

    // Pressure extends life (denser air holds vapor longer)
    lifeMs *= (1 + atmo.pressureScalar * 0.25);

    var type = 'contrail';
    if (e.altitudeScalar < 0.72) type = 'vapor';
    if (_glyphSeedOn)            type = 'glyph_seed';   // future hook

    pool.push({
      lat:            e.lat,
      lng:            e.lng,
      headingDeg:     e.headingDeg    || 0,
      altitudeScalar: e.altitudeScalar,
      createdAtMs:    Date.now(),
      ageMs:          0,
      lifeMs:         lifeMs,
      driftLat:       0,
      driftLng:       0,
      residueType:    type,
    });

    _totalSegCount++;

    // Cap per-aircraft pool (drop oldest)
    if (pool.length > MAX_SEGS_PER_AIRCRAFT) {
      pool.shift();
      _totalSegCount--;
    }

    // Global cap — drop from the aircraft with most segments
    if (_totalSegCount > MAX_TOTAL_SEGS) {
      var ids   = Object.keys(_segments);
      var maxId = ids.reduce(function (best, id) {
        return _segments[id].length > _segments[best].length ? id : best;
      }, ids[0]);
      if (_segments[maxId] && _segments[maxId].length > 0) {
        _segments[maxId].shift();
        _totalSegCount--;
      }
    }
  }

  function _ageAndDrift(dtMs, atmo) {
    var now = Date.now();
    var windLng = (0.28 + atmo.pressureScalar * 0.18) * (dtMs / 1000) * 0.0000065;
    var liftLat = atmo.thermalDistortion * 0.25     * (dtMs / 1000) * 0.0000030;

    var ids = Object.keys(_segments);
    for (var i = 0; i < ids.length; i++) {
      var pool   = _segments[ids[i]];
      var newPool = [];
      for (var j = 0; j < pool.length; j++) {
        var seg = pool[j];
        seg.ageMs  = now - seg.createdAtMs;
        // Drift accumulates over lifetime
        var ageT   = Math.min(1, seg.ageMs / seg.lifeMs);
        seg.driftLng += windLng * (0.5 + ageT * 0.5);   // older segments drift more
        seg.driftLat += liftLat;

        if (seg.ageMs < seg.lifeMs) {
          newPool.push(seg);
        } else {
          _totalSegCount--;
        }
      }
      if (newPool.length > 0) {
        _segments[ids[i]] = newPool;
      } else {
        delete _segments[ids[i]];
      }
    }
  }

  // ── Contrail rendering ────────────────────────────────────────────────────────
  // Render each aircraft's contrail as a series of projected line segments.
  // Opacity decays with age via smoothstep; width varies with altitude and fog.

  function _smoothstep(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  }

  function _renderContrails(ctx, cW, cH, atmo) {
    var ids = Object.keys(_segments);
    if (ids.length === 0) return;

    // Electrical bloom tints contrails blue-white
    var electricTint = Math.max(0, atmo.electricalActivity - 0.3) / 0.7;
    // Thermal bloom widens and warms contrails
    var thermalBoost = Math.max(0, atmo.thermalDistortion - 0.3) / 0.7;

    for (var i = 0; i < ids.length; i++) {
      var pool = _segments[ids[i]];
      if (!pool || pool.length < 2) continue;

      // Project all segments
      var pts = [];
      for (var j = 0; j < pool.length; j++) {
        var seg = pool[j];
        var pt  = _project(seg.lat + seg.driftLat, seg.lng + seg.driftLng);
        if (!pt) { pts.push(null); continue; }
        if (pt.x < -200 || pt.x > cW + 200 ||
            pt.y < -200 || pt.y > cH + 200) { pts.push(null); continue; }
        pts.push({ x: pt.x, y: pt.y, seg: seg });
      }

      // Draw adjacent pairs as short strokes
      for (var k = 0; k + 1 < pts.length; k++) {
        var a = pts[k];
        var b = pts[k + 1];
        if (!a || !b) continue;

        var seg0 = a.seg;
        var ageT = Math.min(1, seg0.ageMs / seg0.lifeMs);
        var fade = _smoothstep(ageT);

        // Base opacity: max for type / altitude
        var baseAlpha = seg0.residueType === 'vapor'
          ? 0.06 + (seg0.altitudeScalar - CONTRAIL_ALT_MIN) * 0.12
          : 0.10 + (seg0.altitudeScalar - CONTRAIL_ALT_MIN) * 0.18;

        // Atmospheric modulation
        baseAlpha *= (1 + atmo.fogDensity * 0.45);
        baseAlpha *= (1 - atmo.silenceScalar * 0.35);
        baseAlpha *= (1 + electricTint * 0.30);

        var alpha = Math.max(0, Math.min(0.28, baseAlpha * (1 - fade)));
        if (alpha < 0.008) continue;

        // Stroke width
        var w = Math.max(0.8, (1.5 + atmo.fogDensity * 2.8 + thermalBoost * 1.5) *
                              (1 - seg0.altitudeScalar * 0.25));

        // Colour: warm base → cool-electric tint
        var r = Math.round(220 - electricTint * 30 + thermalBoost * 20);
        var g = Math.round(230 - electricTint * 10);
        var bv= Math.round(240 + electricTint * 15 - thermalBoost * 40);

        ctx.save();
        ctx.globalAlpha  = alpha;
        ctx.strokeStyle  = 'rgb(' + r + ',' + g + ',' + bv + ')';
        ctx.lineWidth    = w;
        ctx.lineCap      = 'round';
        ctx.lineJoin     = 'round';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ── Nav light fog diffusion ───────────────────────────────────────────────────
  // Draws a soft radial glow around each eligible aircraft when fog > 0.10.
  // This is the atmospheric bloom that makes a distant beacon readable in weather.
  // Separate from the crisp nav-light dots drawn by AircraftRenderer.

  function _renderNavLightDiffusion(ctx, aircraft, atmo) {
    if (atmo.fogDensity < 0.08 && atmo.hazeDensity < 0.06) return;

    var fogFactor = Math.max(atmo.fogDensity, atmo.hazeDensity * 0.6);

    // 1.2s blink cycle
    var phase    = (Date.now() % BLINK_PERIOD_MS) / BLINK_PERIOD_MS;
    var blinkOn  = phase < BLINK_DUTY;
    if (!blinkOn) return;

    // Ease within ON window
    var pulse    = Math.sin((phase / BLINK_DUTY) * Math.PI);
    var blinkAmt = 0.5 + pulse * 0.5;

    for (var i = 0; i < aircraft.length; i++) {
      var e = aircraft[i];
      if (e.altitudeScalar < 0.10) continue;
      if (e.lifecycleState === 'PARKED') continue;

      var pt = _project(e.lat, e.lng);
      if (!pt) continue;

      // Diffusion radius grows with fog but softens the light (not amplifies)
      var baseR    = 8 + e.altitudeScalar * 4;
      var diffR    = baseR * (1 + fogFactor * 5.5);

      // Alpha: proportional to fog density (light becomes visible in haze)
      // but inversely limited (fog obscures rather than amplifies)
      var maxAlpha = fogFactor * 0.22 * blinkAmt;
      if (maxAlpha < 0.015) continue;

      // Colour: warm amber-white (beacon/strobe feel)
      var grad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, diffR);
      grad.addColorStop(0,    'rgba(255,235,180,' + (maxAlpha * 0.75).toFixed(3) + ')');
      grad.addColorStop(0.35, 'rgba(255,225,160,' + (maxAlpha * 0.35).toFixed(3) + ')');
      grad.addColorStop(1,    'rgba(255,210,140,0)');

      ctx.save();
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, diffR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── Main frame ────────────────────────────────────────────────────────────────

  function _frame(ts) {
    _rafId = global.requestAnimationFrame(_frame);

    if (!_ensureCanvas()) return;
    _resizeCanvas();

    var dt = _lastFrameMs > 0 ? Math.min(ts - _lastFrameMs, 100) : 16.667;
    _lastFrameMs = ts;

    _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    if (!_enabled) return;

    var art = global.SBE && SBE.AircraftRuntime;
    if (!art) return;

    var aircraft = art.getActiveAircraft();
    var atmo     = _getAtmo();
    var preset   = _getCloudPreset();

    // Append contrail segments for eligible aircraft
    if (_contrailsOn) {
      for (var i = 0; i < aircraft.length; i++) {
        if (_isEligible(aircraft[i])) {
          _appendSegment(aircraft[i], preset, atmo);
        }
      }
      _ageAndDrift(dt, atmo);
      _renderContrails(_ctx, _canvas.width, _canvas.height, atmo);
    }

    // Nav light atmospheric diffusion
    if (_navLightsOn) {
      _renderNavLightDiffusion(_ctx, aircraft, atmo);
    }
  }

  // ── Public controls ───────────────────────────────────────────────────────────

  function start() {
    if (_rafId) return;
    _lastFrameMs = 0;
    _rafId = global.requestAnimationFrame(_frame);
    console.log('[AircraftSkyResidueRenderer] v' + VERSION + ' started');
  }

  function stop() {
    if (_rafId) { global.cancelAnimationFrame(_rafId); _rafId = null; }
    if (_ctx && _canvas) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    console.log('[AircraftSkyResidueRenderer] stopped');
  }

  function setEnabled(val)    { _enabled     = !!val; }
  function getEnabled()       { return _enabled; }
  function setContrails(val)  { _contrailsOn = !!val; console.log('[AircraftSkyResidueRenderer] contrails →', _contrailsOn); }
  function getContrails()     { return _contrailsOn; }
  function setNavLights(val)  { _navLightsOn = !!val; console.log('[AircraftSkyResidueRenderer] navLights →', _navLightsOn); }
  function getNavLights()     { return _navLightsOn; }
  function setGlyphSeed(val)  { _glyphSeedOn = !!val; console.log('[AircraftSkyResidueRenderer] glyphSeed →', _glyphSeedOn, '(future hook)'); }
  function getGlyphSeed()     { return _glyphSeedOn; }

  function clearResidue() {
    var count = _totalSegCount;
    _segments      = {};
    _totalSegCount = 0;
    console.log('[AircraftSkyResidueRenderer] cleared', count, 'segments');
  }

  function getState() {
    var segsByAircraft = {};
    var ids = Object.keys(_segments);
    for (var i = 0; i < ids.length; i++) {
      segsByAircraft[ids[i]] = _segments[ids[i]].length;
    }
    return {
      version:      VERSION,
      enabled:      _enabled,
      contrailsOn:  _contrailsOn,
      navLightsOn:  _navLightsOn,
      glyphSeedOn:  _glyphSeedOn,
      totalSegments: _totalSegCount,
      segsByAircraft: segsByAircraft,
      caps: {
        maxPerAircraft: MAX_SEGS_PER_AIRCRAFT,
        maxTotal:       MAX_TOTAL_SEGS,
      },
    };
  }

  // ── Exports ───────────────────────────────────────────────────────────────────

  SBE.AircraftSkyResidueRenderer = Object.freeze({
    VERSION:       VERSION,
    start:         start,
    stop:          stop,
    setEnabled:    setEnabled,
    getEnabled:    getEnabled,
    setContrails:  setContrails,
    getContrails:  getContrails,
    setNavLights:  setNavLights,
    getNavLights:  getNavLights,
    setGlyphSeed:  setGlyphSeed,
    getGlyphSeed:  getGlyphSeed,
    clearResidue:  clearResidue,
    getState:      getState,
  });

  // ── Auto-start ────────────────────────────────────────────────────────────────

  function _scheduleStart() {
    var bs = global.SBE && SBE.WOSBootSequencer;
    if (bs && typeof bs.defer === 'function') {
      bs.defer('aircraftSkyResidueRenderer.start', start, 700);
    } else {
      global.setTimeout(start, 250);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    global.setTimeout(_scheduleStart, 0);
  } else {
    document.addEventListener('DOMContentLoaded', _scheduleStart);
  }

  console.log('[AircraftSkyResidueRenderer] v' + VERSION + ' loaded — z:5 (below atmosphere)');

})(window);
