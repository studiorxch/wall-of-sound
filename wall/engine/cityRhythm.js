(function initCityRhythm(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── City Rhythm System (CityRhythm v1.0.0) ────────────────────────────────
  //
  // Master temporal modulation layer for WOS ecology.
  // Drives district pressure, traffic density, realization count, and music
  // through smooth cyclical curves representing urban emotional time.
  //
  // Time is EMOTIONAL not literal — 1 full day ≈ 2 real hours by default.
  // Phases:  dawn(5–8)  day(8–17)  dusk(17–20)  night(20–2)  lateNight(2–5)
  //
  // Integration:
  //   tick(state, dt)         — call EVERY FRAME (advances time + curves)
  //   applyDistrictBias(state) — call AFTER DistrictPressure.tick() each ~3s

  // ── Time phases ────────────────────────────────────────────────────────────
  var PHASES = ["dawn", "day", "dusk", "night", "lateNight"];

  // ── District rhythm profiles ────────────────────────────────────────────────
  // Multipliers applied on top of base rhythm curves per district.
  // > 1 = district is MORE sensitive to this pressure during the phase.
  var DISTRICT_PROFILES = {
    downtown: {
      nightlifeWeight: 0.55,
      commuterWeight:  1.25,
      deliveryWeight:  1.15,
    },
    williamsburg: {
      nightlifeWeight: 1.20,
      commuterWeight:  0.65,
      deliveryWeight:  0.80,
    },
    bushwick: {
      nightlifeWeight: 1.55,
      commuterWeight:  0.30,
      deliveryWeight:  0.60,
    },
  };

  // ── Config accessor ────────────────────────────────────────────────────────
  function _cfg(state) {
    return (state.world && state.world.rhythm) || {};
  }

  // ── Bell curve helpers ─────────────────────────────────────────────────────
  // Standard Gaussian bell centered at peak with given width (in hours).
  function _bell(h, peak, width) {
    return Math.exp(-Math.pow((h - peak) / width, 2));
  }

  // Wrap-aware bell for values that straddle midnight (h = 0/24 boundary).
  function _bellWrap(h, peak, width) {
    var d = Math.abs(h - peak);
    if (d > 12) d = 24 - d;
    return Math.exp(-Math.pow(d / width, 2));
  }

  // Clamp 0–1
  function _clamp(v) { return Math.max(0, Math.min(1, v)); }

  // ── Rhythm curves ──────────────────────────────────────────────────────────
  // All return values 0–1 for a given hour (0–24, decimal ok).

  // Nightlife: peaks at midnight, falls to near-zero by noon.
  function _nightlifeCurve(h) {
    return _clamp(_bellWrap(h, 0, 3.5) * 0.65 + _bellWrap(h, 22, 2.5) * 0.55);
  }

  // Traffic: two peaks — morning commute (8h) and evening commute (17.5h).
  function _trafficCurve(h) {
    var am = _bell(h, 8.5,  1.4);
    var pm = _bell(h, 17.5, 1.6);
    return _clamp(am * 0.85 + pm * 0.95);
  }

  // Delivery: elevated midday window (9–19h), quiet at night.
  function _deliveryCurve(h) {
    if (h < 7 || h > 21) return 0.04;
    var mid = _bell(h, 13, 3.5);
    return _clamp(0.15 + mid * 0.85);
  }

  // City energy: aggregate vitality. Combines all pressures with phase weighting.
  function _energyCurve(nl, tr, dl, h) {
    // Dawn: low but rising. Day: steady. Dusk: climbing. Night: peak. Late: fading.
    var dawnLift  = _bell(h, 6.5, 1.2) * 0.35;
    var duskLift  = _bell(h, 18,  1.5) * 0.55;
    var nightPeak = _bellWrap(h, 23,  3.0) * 0.80;
    var base = (nl * 0.4 + tr * 0.35 + dl * 0.25);
    return _clamp(base + dawnLift + duskLift + nightPeak - 0.15);
  }

  // ── Phase resolution ───────────────────────────────────────────────────────
  function _resolvePhase(h) {
    if (h >= 5  && h < 8)  return "dawn";
    if (h >= 8  && h < 17) return "day";
    if (h >= 17 && h < 20) return "dusk";
    if (h >= 20 || h < 2)  return "night";
    return "lateNight"; // 2–5
  }

  // ── Main per-frame tick ────────────────────────────────────────────────────
  // dt in real seconds. Advances city time and recomputes rhythm curves.
  // MUST run every frame — time advance is frame-rate scaled.
  function tick(state, dt) {
    var r = state.world && state.world.rhythm;
    if (!r || !r.enabled) return;

    // Advance city time
    // dayLengthMinutes real minutes = 1 full 24h WOS day.
    var dayLenSec  = (r.dayLengthMinutes || 120) * 60;
    var hoursPerSec = 24 / dayLenSec;
    r.currentTime  = (r.currentTime + dt * hoursPerSec) % 24;
    r.currentHour  = r.currentTime;

    var h = r.currentTime;
    r.phase = _resolvePhase(h);

    // Apply weather damping (rain/storm slow everything down)
    var eco         = state.world && state.world.ecology;
    var weatherDamp = 1.0;
    if (eco && eco.weather) {
      weatherDamp = 1.0 - eco.weather.intensity * 0.30;
    }
    var ws = r.weatherBias || 0;    // user-injected weather bias (–1 to +1)

    // Compute base rhythm curves
    var nl = _nightlifeCurve(h);
    var tr = _trafficCurve(h);
    var dl = _deliveryCurve(h);
    var en = _energyCurve(nl, tr, dl, h);

    // Weather modulation
    tr *= weatherDamp;
    dl *= weatherDamp;
    en  = _clamp(en * (weatherDamp * 0.5 + 0.5));

    // Apply rhythmScale (global intensity override, default 1.0)
    var rs = r.rhythmScale || 1.0;
    nl = _clamp(nl * rs);
    tr = _clamp(tr * rs);
    dl = _clamp(dl * rs);
    en = _clamp(en * rs);

    // Store outputs
    r.metrics.nightlifeBias = nl;
    r.metrics.trafficBias   = tr;
    r.metrics.deliveryBias  = dl;
    r.metrics.cityEnergy    = en;

    // ── Push time signal into ecology ──────────────────────────────────────
    // DistrictPressure.tick() reads eco.timeOfDay — we own it from here.
    if (eco) {
      eco.time    = h * 60;            // minutes 0–1440
      eco.timeOfDay = h / 24;          // 0–1
    }

    // ── Scale realization density with city energy ─────────────────────────
    var realCfg = state.world && state.world.realization;
    if (realCfg) {
      var baseMax = realCfg._baseMaxActive || realCfg.maxActive || 120;
      realCfg._baseMaxActive = baseMax;
      // Energy 0.1–1.0 → maxActive 20%–100% of base cap
      realCfg.maxActive = Math.round(baseMax * (0.20 + en * 0.80));
    }

    // ── Scale flow field with city energy and traffic bias ─────────────────
    var flowCfg = state.world && state.world.flow;
    if (flowCfg) {
      // More traffic → stronger alignment + cohesion, more congestion
      flowCfg.alignmentStrength  = 0.008 + tr * 0.020;
      flowCfg.cohesionStrength   = 0.005 + tr * 0.012;
      // City energy determines how many neighbors contribute
      flowCfg.maxNeighbors = Math.round(4 + en * 8);
    }
  }

  // ── Apply district pressure biases (call after DistrictPressure.tick()) ───
  // Post-multiplies the already-smoothed district pressure values by the
  // district's rhythm profile and current rhythm curves.
  function applyDistrictBias(state) {
    var r = state.world && state.world.rhythm;
    if (!r || !r.enabled) return;

    var eco = state.world && state.world.ecology;
    if (!eco || !eco.pressure || !eco.pressure.districts) return;

    var nl = r.metrics.nightlifeBias;
    var tr = r.metrics.trafficBias;
    var dl = r.metrics.deliveryBias;

    Object.keys(eco.pressure.districts).forEach(function (id) {
      var dp      = eco.pressure.districts[id];
      var profile = DISTRICT_PROFILES[id] || {
        nightlifeWeight: 1.0,
        commuterWeight:  1.0,
        deliveryWeight:  1.0,
      };

      // Blend rhythm modulation into smoothed pressure values.
      // We don't hard-set — we gently nudge toward rhythm target.
      // (lerp factor 0.08 per apply call = slow drift, not snap)
      var tNl = _clamp(dp.nightlife * (0.5 + nl * profile.nightlifeWeight * 0.8));
      var tTr = _clamp(dp.traffic   * (0.4 + tr * profile.commuterWeight  * 0.9));
      var tDl = _clamp(dp.delivery  * (0.4 + dl * profile.deliveryWeight  * 0.9));

      dp.nightlife += (tNl - dp.nightlife) * 0.10;
      dp.traffic   += (tTr - dp.traffic)   * 0.10;
      dp.delivery  += (tDl - dp.delivery)  * 0.10;
      dp.energy     = (dp.nightlife * 0.45 + dp.traffic * 0.35 + dp.delivery * 0.20);
    });

    // ── Music ecology coupling ─────────────────────────────────────────────
    // Write rhythm hints directly onto musicEcology for MusicEcology.tick().
    var me = eco.musicEcology;
    if (me && me.enabled) {
      me._rhythmPhase       = r.phase;
      me._rhythmEnergy      = r.metrics.cityEnergy;
      me._rhythmNightlife   = nl;
      me._rhythmTraffic     = tr;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  // Returns a human-readable phase label with clock time.
  function getPhaseLabel(state) {
    var r = state.world && state.world.rhythm;
    if (!r) return "";
    var h   = Math.floor(r.currentHour);
    var m   = Math.floor((r.currentHour - h) * 60);
    var hh  = ("0" + h).slice(-2);
    var mm  = ("0" + m).slice(-2);
    return r.phase.toUpperCase() + "  " + hh + ":" + mm;
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.CityRhythm = {
    tick:              tick,
    applyDistrictBias: applyDistrictBias,
    getPhaseLabel:     getPhaseLabel,
    DISTRICT_PROFILES: DISTRICT_PROFILES,
    PHASES:            PHASES,
  };

})(window);
