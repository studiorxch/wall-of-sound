(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── AtmosphereRuntime (0520H_WOS_AtmosphereRuntime_v1.1.0) ───────────────
  //
  // Persistent environmental continuity orchestration.
  //
  // CANONICAL RESPONSIBILITY SEPARATION:
  //   BroadcastScheduler owns intent.
  //   SurfaceRegistry owns identity.
  //   TransitionRuntime owns continuity.
  //   SubwayTopologyRuntime owns infrastructural pulse.
  //   AtmosphereRuntime owns environmental state.
  //
  // ATMOSPHERIC CONVERGENCE ORDER:
  //   1. Temporal phase establishes base state.
  //   2. Active injections modify target state.
  //   3. Inertia filter has final authority over visible output.
  //
  // DELTA-TIME INERTIA DOCTRINE:
  //   factor = 1 - inertia^(deltaTimeSeconds)
  //   All interpolation is frame-rate independent.
  //
  // INJECTION LIFECYCLE DOCTRINE:
  //   Injections decay over durationMs, expire automatically.
  //   Systems never directly mutate atmosphere state.
  //
  // Emits (broadcast: namespace):
  //   broadcast:atmosphereUpdated           { atmosphere }
  //   broadcast:environmentalPressureChanged { pressure }
  //   broadcast:visibilityChanged           { visibility }
  //   broadcast:cinematicPressureChanged    { cinematicPressure }

  // ── Phase atmospheric baselines ───────────────────────────────────────────
  var PHASE_BASELINES = {
    deep_night:   { fog: 0.18, precipitation: 0.00, humidity: 0.50, lightLevel: 0.08, temperature: 0.38, visibility: 0.70, movementBias: 0.10, densityBias: 0.12, cinematicPressure: 0.30,
                    colorBias: { shadows: { r: 0.04, g: 0.04, b: 0.16 }, midtones: { r: 0.08, g: 0.10, b: 0.22 }, highlights: { r: 0.75, g: 0.80, b: 0.70 }, chromaticIntensity: 0.42 },
                    soundtrackBias: { ambient: 0.80, tension: 0.08, silence: 0.65 } },
    early_morning:{ fog: 0.22, precipitation: 0.00, humidity: 0.55, lightLevel: 0.22, temperature: 0.42, visibility: 0.68, movementBias: 0.20, densityBias: 0.18, cinematicPressure: 0.22,
                    colorBias: { shadows: { r: 0.05, g: 0.05, b: 0.14 }, midtones: { r: 0.12, g: 0.14, b: 0.20 }, highlights: { r: 0.82, g: 0.84, b: 0.76 }, chromaticIntensity: 0.30 },
                    soundtrackBias: { ambient: 0.70, tension: 0.05, silence: 0.55 } },
    morning_rush: { fog: 0.08, precipitation: 0.00, humidity: 0.42, lightLevel: 0.55, temperature: 0.55, visibility: 0.85, movementBias: 0.80, densityBias: 0.75, cinematicPressure: 0.55,
                    colorBias: { shadows: { r: 0.06, g: 0.06, b: 0.08 }, midtones: { r: 0.14, g: 0.15, b: 0.16 }, highlights: { r: 0.90, g: 0.90, b: 0.88 }, chromaticIntensity: 0.20 },
                    soundtrackBias: { ambient: 0.50, tension: 0.45, silence: 0.15 } },
    midmorning:   { fog: 0.05, precipitation: 0.00, humidity: 0.38, lightLevel: 0.70, temperature: 0.60, visibility: 0.90, movementBias: 0.55, densityBias: 0.50, cinematicPressure: 0.30,
                    colorBias: { shadows: { r: 0.07, g: 0.07, b: 0.07 }, midtones: { r: 0.16, g: 0.16, b: 0.15 }, highlights: { r: 0.92, g: 0.92, b: 0.90 }, chromaticIntensity: 0.15 },
                    soundtrackBias: { ambient: 0.55, tension: 0.25, silence: 0.30 } },
    midday:       { fog: 0.03, precipitation: 0.00, humidity: 0.35, lightLevel: 0.85, temperature: 0.68, visibility: 0.95, movementBias: 0.60, densityBias: 0.55, cinematicPressure: 0.20,
                    colorBias: { shadows: { r: 0.08, g: 0.08, b: 0.06 }, midtones: { r: 0.18, g: 0.18, b: 0.14 }, highlights: { r: 0.95, g: 0.94, b: 0.88 }, chromaticIntensity: 0.12 },
                    soundtrackBias: { ambient: 0.45, tension: 0.30, silence: 0.25 } },
    afternoon:    { fog: 0.04, precipitation: 0.00, humidity: 0.38, lightLevel: 0.75, temperature: 0.65, visibility: 0.92, movementBias: 0.65, densityBias: 0.58, cinematicPressure: 0.25,
                    colorBias: { shadows: { r: 0.09, g: 0.07, b: 0.05 }, midtones: { r: 0.20, g: 0.17, b: 0.12 }, highlights: { r: 0.94, g: 0.90, b: 0.82 }, chromaticIntensity: 0.18 },
                    soundtrackBias: { ambient: 0.50, tension: 0.35, silence: 0.22 } },
    evening_rush: { fog: 0.06, precipitation: 0.00, humidity: 0.44, lightLevel: 0.45, temperature: 0.58, visibility: 0.82, movementBias: 0.85, densityBias: 0.80, cinematicPressure: 0.60,
                    colorBias: { shadows: { r: 0.10, g: 0.06, b: 0.04 }, midtones: { r: 0.22, g: 0.14, b: 0.10 }, highlights: { r: 0.90, g: 0.82, b: 0.72 }, chromaticIntensity: 0.28 },
                    soundtrackBias: { ambient: 0.40, tension: 0.55, silence: 0.10 } },
    early_evening:{ fog: 0.10, precipitation: 0.00, humidity: 0.48, lightLevel: 0.30, temperature: 0.52, visibility: 0.78, movementBias: 0.50, densityBias: 0.45, cinematicPressure: 0.40,
                    colorBias: { shadows: { r: 0.07, g: 0.05, b: 0.10 }, midtones: { r: 0.15, g: 0.12, b: 0.18 }, highlights: { r: 0.82, g: 0.80, b: 0.75 }, chromaticIntensity: 0.32 },
                    soundtrackBias: { ambient: 0.65, tension: 0.20, silence: 0.38 } },
    late_evening: { fog: 0.14, precipitation: 0.00, humidity: 0.52, lightLevel: 0.15, temperature: 0.44, visibility: 0.73, movementBias: 0.25, densityBias: 0.28, cinematicPressure: 0.35,
                    colorBias: { shadows: { r: 0.05, g: 0.04, b: 0.14 }, midtones: { r: 0.10, g: 0.10, b: 0.20 }, highlights: { r: 0.78, g: 0.80, b: 0.72 }, chromaticIntensity: 0.38 },
                    soundtrackBias: { ambient: 0.75, tension: 0.10, silence: 0.52 } },
    late_night:   { fog: 0.16, precipitation: 0.00, humidity: 0.52, lightLevel: 0.10, temperature: 0.40, visibility: 0.72, movementBias: 0.12, densityBias: 0.15, cinematicPressure: 0.28,
                    colorBias: { shadows: { r: 0.04, g: 0.04, b: 0.15 }, midtones: { r: 0.09, g: 0.10, b: 0.21 }, highlights: { r: 0.76, g: 0.80, b: 0.71 }, chromaticIntensity: 0.40 },
                    soundtrackBias: { ambient: 0.82, tension: 0.06, silence: 0.62 } },
  };

  // Weather modifiers applied on top of phase baseline
  var WEATHER_MODIFIERS = {
    clear: { fog: 0, precipitation: 0, humidity: 0, visibility: 0, densityBias: 0, cinematicPressure: 0 },
    rain:  { fog: 0.12, precipitation: 0.70, humidity: 0.30, visibility: -0.20, densityBias: 0.15, cinematicPressure: 0.25 },
    drizzle: { fog: 0.08, precipitation: 0.25, humidity: 0.20, visibility: -0.10, densityBias: 0.08, cinematicPressure: 0.18 },
    fog:   { fog: 0.45, precipitation: 0, humidity: 0.25, visibility: -0.35, densityBias: 0.10, cinematicPressure: 0.30 },
    overcast: { fog: 0.06, precipitation: 0, humidity: 0.15, visibility: -0.08, densityBias: 0.05, cinematicPressure: 0.12 },
    snow:  { fog: 0.15, precipitation: 0.50, humidity: 0.20, visibility: -0.25, densityBias: 0.20, cinematicPressure: 0.35 },
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  function _clamp(v, lo, hi)   { return v < lo ? lo : v > hi ? hi : v; }
  function _lerp(a, b, t)      { return a + (b - a) * t; }
  function _bus()              { return SBE.WorkspaceEventBus; }
  function _emit(evt, payload) { var b = _bus(); b && b.emit(evt, payload); }

  // ── Core state ────────────────────────────────────────────────────────────
  var _state = {
    phase:         "deep_night",
    weather:       "clear",
    visibility:    0.70,
    humidity:      0.50,
    fog:           0.18,
    precipitation: 0.00,
    temperature:   0.38,
    lightLevel:    0.08,
    colorBias: {
      shadows:    { r: 0.04, g: 0.04, b: 0.16 },
      midtones:   { r: 0.08, g: 0.10, b: 0.22 },
      highlights: { r: 0.75, g: 0.80, b: 0.70 },
      chromaticIntensity: 0.42,
    },
    movementBias:  0.10,
    densityBias:   0.12,
    soundtrackBias: { ambient: 0.80, tension: 0.08, silence: 0.65 },
    cinematicPressure:  0.30,
    transitionProgress: 0,
    inertia: { fog: 0.92, precipitation: 0.95, lightLevel: 0.88, visibility: 0.90, humidity: 0.93, densityBias: 0.85, cinematicPressure: 0.80, movementBias: 0.78 },
    injections: [],
  };

  // ── Inertia-based lerp — frame-rate independent ────────────────────────────
  // factor = 1 - inertia^dt
  function _driftToward(current, target, inertiaCoef, dt) {
    var factor = 1 - Math.pow(inertiaCoef, dt);
    return _lerp(current, target, factor);
  }

  // ── Phase baseline ────────────────────────────────────────────────────────
  function _getBaseline(phase, weather) {
    var base    = PHASE_BASELINES[phase] || PHASE_BASELINES.deep_night;
    var weather_mod = WEATHER_MODIFIERS[weather] || WEATHER_MODIFIERS.clear;
    return {
      fog:              _clamp(base.fog           + weather_mod.fog,              0, 1),
      precipitation:    _clamp(base.precipitation + weather_mod.precipitation,    0, 1),
      humidity:         _clamp(base.humidity      + weather_mod.humidity,         0, 1),
      lightLevel:       base.lightLevel,
      temperature:      base.temperature,
      visibility:       _clamp(base.visibility    + weather_mod.visibility,       0, 1),
      movementBias:     base.movementBias,
      densityBias:      _clamp(base.densityBias   + weather_mod.densityBias,      0, 1),
      cinematicPressure:_clamp(base.cinematicPressure + weather_mod.cinematicPressure, 0, 1),
      colorBias:        base.colorBias,
      soundtrackBias:   base.soundtrackBias,
    };
  }

  // ── Injection management ──────────────────────────────────────────────────
  function inject(opts) {
    if (!opts || !opts.source) {
      console.warn("[AtmosphereRuntime] inject: opts.source required");
      return;
    }
    opts.timestamp  = opts.timestamp  || performance.now();
    opts.durationMs = opts.durationMs || 300000;
    opts.easing     = opts.easing     || "linear";
    _state.injections.push(Object.assign({}, opts));
  }

  // Compute normalized [0,1] blend weight for injection at current time
  function _injectionWeight(inj, now) {
    var elapsed  = now - inj.timestamp;
    var progress = _clamp(elapsed / inj.durationMs, 0, 1);
    if (inj.easing === "smooth") {
      progress = progress * progress * (3 - 2 * progress);
    }
    // Fade: ramp up in first 10%, hold, ramp out in last 20%
    var fadeIn  = _clamp(progress / 0.10, 0, 1);
    var fadeOut = _clamp((1 - progress) / 0.20, 0, 1);
    return Math.min(fadeIn, fadeOut);
  }

  // Apply active injections onto target state object (mutates target in-place)
  function _applyInjections(target, now) {
    var live = [];
    for (var i = 0; i < _state.injections.length; i++) {
      var inj     = _state.injections[i];
      var elapsed = now - inj.timestamp;
      if (elapsed >= inj.durationMs) continue;  // expired, drop
      live.push(inj);
      var w = _injectionWeight(inj, now);
      if (inj.fog              != null) target.fog              = _clamp(target.fog              + inj.fog              * w, 0, 1);
      if (inj.densityBias      != null) target.densityBias      = _clamp(target.densityBias      + inj.densityBias      * w, 0, 1);
      if (inj.cinematicPressure!= null) target.cinematicPressure= _clamp(target.cinematicPressure+ inj.cinematicPressure* w, 0, 1);
      if (inj.visibility       != null) target.visibility       = _clamp(target.visibility       + inj.visibility       * w, 0, 1);
      if (inj.humidity         != null) target.humidity         = _clamp(target.humidity         + inj.humidity         * w, 0, 1);
      if (inj.movementBias     != null) target.movementBias     = _clamp(target.movementBias     + inj.movementBias     * w, 0, 1);
    }
    _state.injections = live;   // prune expired
  }

  // ── tick — canonical temporal entry point ─────────────────────────────────
  var _lastTickTime = 0;
  var _prevVisibility        = 0;
  var _prevCinematicPressure = 0;

  function tick(broadcastTimeContext) {
    broadcastTimeContext = broadcastTimeContext || {};
    var hour  = broadcastTimeContext.hour  != null ? broadcastTimeContext.hour  : 0;
    var phase = broadcastTimeContext.phase || _state.phase;
    var dt    = broadcastTimeContext.deltaTimeSeconds != null
      ? broadcastTimeContext.deltaTimeSeconds
      : 0.25;   // safe default matching BroadcastScheduler cadence
    dt        = _clamp(dt, 0.001, 2.0);  // clamp against stalls / tab-sleep

    var now = performance.now();
    _state.phase   = phase;
    _state.weather = broadcastTimeContext.weather || _state.weather;

    // ── Step 1: base state from temporal phase ─────────────────────────
    var baseline = _getBaseline(_state.phase, _state.weather);

    // ── Step 2: subway topology influence ─────────────────────────────
    var str = SBE.SubwayTopologyRuntime;
    if (str) {
      var ps = str.getState().pulseState;
      // Rush pressure elevates density and cinematic pressure
      baseline.densityBias       = _clamp(baseline.densityBias       + ps.rushPressure * 0.15, 0, 1);
      baseline.cinematicPressure = _clamp(baseline.cinematicPressure + ps.rushPressure * 0.10, 0, 1);
      // Silence bias softens visibility (late night haze) and lifts ambient
      baseline.visibility        = _clamp(baseline.visibility        - ps.silenceBias  * 0.08, 0, 1);
      baseline.soundtrackBias.ambient = _clamp(baseline.soundtrackBias.ambient + ps.silenceBias * 0.10, 0, 1);
    }

    // ── Step 3: TransitionRuntime continuity progress ─────────────────
    var tr = SBE.TransitionRuntime;
    if (tr) {
      _state.transitionProgress = tr.getState().easedProgress;
    }

    // ── Step 4: active injections modify target ────────────────────────
    _applyInjections(baseline, now);

    // ── Step 5: inertia filter — final authority ───────────────────────
    var iner = _state.inertia;
    _state.fog              = _driftToward(_state.fog,              baseline.fog,              iner.fog,              dt);
    _state.precipitation    = _driftToward(_state.precipitation,    baseline.precipitation,    iner.precipitation,    dt);
    _state.lightLevel       = _driftToward(_state.lightLevel,       baseline.lightLevel,       iner.lightLevel,       dt);
    _state.visibility       = _driftToward(_state.visibility,       baseline.visibility,       iner.visibility,       dt);
    _state.humidity         = _driftToward(_state.humidity,         baseline.humidity,         iner.humidity,         dt);
    _state.densityBias      = _driftToward(_state.densityBias,      baseline.densityBias,      iner.densityBias,      dt);
    _state.cinematicPressure= _driftToward(_state.cinematicPressure,baseline.cinematicPressure,iner.cinematicPressure, dt);
    _state.movementBias     = _driftToward(_state.movementBias,     baseline.movementBias,     iner.movementBias,     dt);
    _state.temperature      = baseline.temperature;   // no inertia — informational
    _state.soundtrackBias.ambient = baseline.soundtrackBias.ambient;
    _state.soundtrackBias.tension = baseline.soundtrackBias.tension;
    _state.soundtrackBias.silence = baseline.soundtrackBias.silence;

    // ── Color bias — direct from phase (cinematic grading, no per-frame lerp) ──
    var cb = baseline.colorBias;
    _state.colorBias.shadows.r    = cb.shadows.r;
    _state.colorBias.shadows.g    = cb.shadows.g;
    _state.colorBias.shadows.b    = cb.shadows.b;
    _state.colorBias.midtones.r   = cb.midtones.r;
    _state.colorBias.midtones.g   = cb.midtones.g;
    _state.colorBias.midtones.b   = cb.midtones.b;
    _state.colorBias.highlights.r = cb.highlights.r;
    _state.colorBias.highlights.g = cb.highlights.g;
    _state.colorBias.highlights.b = cb.highlights.b;
    _state.colorBias.chromaticIntensity = cb.chromaticIntensity;

    // ── Emit resolved state ────────────────────────────────────────────
    _emit("broadcast:atmosphereUpdated", { atmosphere: getResolvedAtmosphere() });

    // Throttled change events
    var visDelta = Math.abs(_state.visibility - _prevVisibility);
    if (visDelta > 0.02) {
      _prevVisibility = _state.visibility;
      _emit("broadcast:visibilityChanged", { visibility: _state.visibility });
    }
    var cpDelta = Math.abs(_state.cinematicPressure - _prevCinematicPressure);
    if (cpDelta > 0.02) {
      _prevCinematicPressure = _state.cinematicPressure;
      _emit("broadcast:cinematicPressureChanged", { cinematicPressure: _state.cinematicPressure });
    }

    _emit("broadcast:environmentalPressureChanged", { pressure: getEnvironmentalPressure() });

    _lastTickTime = now;
  }

  // ── getResolvedAtmosphere ─────────────────────────────────────────────────
  function getResolvedAtmosphere() {
    return {
      phase:             _state.phase,
      weather:           _state.weather,
      visibility:        _state.visibility,
      humidity:          _state.humidity,
      fog:               _state.fog,
      precipitation:     _state.precipitation,
      temperature:       _state.temperature,
      lightLevel:        _state.lightLevel,
      colorBias:         _state.colorBias,
      movementBias:      _state.movementBias,
      densityBias:       _state.densityBias,
      soundtrackBias:    _state.soundtrackBias,
      cinematicPressure: _state.cinematicPressure,
    };
  }

  // ── getEnvironmentalPressure ───────────────────────────────────────────────
  // Derived pressure fields for downstream heuristics.
  function getEnvironmentalPressure() {
    return {
      nightSilence:    _clamp(_state.soundtrackBias.silence * (1 - _state.lightLevel), 0, 1),
      rainDensity:     _clamp(_state.precipitation * _state.densityBias, 0, 1),
      fogIsolation:    _clamp(_state.fog * (1 - _state.visibility), 0, 1),
      humiditySoftness:_state.humidity,
      visibilityTension: _clamp(1 - _state.visibility, 0, 1),
      cinematic:       _state.cinematicPressure,
    };
  }

  // ── Event listeners ───────────────────────────────────────────────────────
  function _onScheduleAdvanced(evt) {
    if (!evt) return;
    var dt = evt.deltaTimeSeconds != null ? evt.deltaTimeSeconds : 0.5;
    tick({ hour: evt.hour, phase: evt.phase, weather: evt.weather, deltaTimeSeconds: dt });
  }

  function _onSubwayPulseUpdated(evt) {
    // Pulse changes trigger a light re-tick; subway influence is pulled live in tick()
    if (!evt) return;
    tick({ hour: _state._lastHour, phase: _state.phase, deltaTimeSeconds: 0.016 });
  }

  function _onWeatherChanged(evt) {
    if (!evt) return;
    _state.weather = evt.weather || _state.weather;
    // Inject a weather shift as an environmental injection for smooth convergence
    var mod = WEATHER_MODIFIERS[_state.weather];
    if (mod) {
      inject({
        source:    "weather_change",
        fog:       mod.fog       || 0,
        densityBias: mod.densityBias || 0,
        cinematicPressure: mod.cinematicPressure || 0,
        visibility: mod.visibility || 0,
        durationMs: 600000,
        easing:    "smooth",
      });
    }
  }

  function _onTransitionProgress(evt) {
    if (!evt) return;
    _state.transitionProgress = evt.easedProgress != null ? evt.easedProgress : evt.progress || 0;
  }

  // ── getState ──────────────────────────────────────────────────────────────
  function getState() { return _state; }

  // ── init ──────────────────────────────────────────────────────────────────
  function init() {
    var bus = _bus();
    if (bus) {
      bus.on("broadcast:scheduleAdvanced",  _onScheduleAdvanced);
      bus.on("broadcast:subwayPulseUpdated", _onSubwayPulseUpdated);
      bus.on("broadcast:weatherChanged",    _onWeatherChanged);
      bus.on("broadcast:transitionProgress", _onTransitionProgress);
    }

    // Hydrate from drift manager if available
    var drift = SBE.WorldDriftManager && SBE.WorldDriftManager.getState();
    var initHour = drift ? drift.hour : 0;
    tick({ hour: initHour, deltaTimeSeconds: 0.5 });

    console.log("[AtmosphereRuntime] initialized v1.1.0 — environmental continuity active");
  }

  SBE.AtmosphereRuntime = {
    init:                    init,
    inject:                  inject,
    tick:                    tick,
    getState:                getState,
    getResolvedAtmosphere:   getResolvedAtmosphere,
    getEnvironmentalPressure: getEnvironmentalPressure,
  };

})(window);
