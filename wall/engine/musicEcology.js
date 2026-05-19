(function initMusicEcology(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Music ecology maps district pressure → WOS audio/world parameters ───────
  //
  // Pressure inputs:          Audio/world output targets:
  //   nightlife 0–1    →        BPM shift, harmonic brightness
  //   traffic   0–1    →        rhythmic density, field intensity
  //   delivery  0–1    →        percussive activity
  //   energy    0–1    →        overall amplitude / field strength
  //   weather   0–1    →        texture filtering (damping / reverb)

  // Smoothed ecology output (prevents jarring jumps)
  var _smooth = {
    bpmShift:      0,    // semitones / relative BPM mod
    density:       0.5,
    brightness:    0.5,
    percussion:    0.3,
    fieldStrength: 0.3,
    weatherDamp:   0.0,
  };

  var _lastTick = 0;

  // ── Helper: weighted average across all districts ──────────────────────────
  function _avgPressure(world, key) {
    var dp = world.pressure && world.pressure.districts;
    if (!dp) return 0;
    var keys = Object.keys(dp);
    if (!keys.length) return 0;
    var sum = 0;
    keys.forEach(function (id) { sum += (dp[id][key] || 0); });
    return sum / keys.length;
  }

  // ── Per-tick update ────────────────────────────────────────────────────────
  // dt in real seconds. state = full WOS state.
  function tick(world, state, dt) {
    if (!world || !state) return;

    var smooth = Math.min(1, dt * 0.15); // slow ecology → audio smoothing

    // Sample aggregate pressure
    var nightlife = _avgPressure(world, "nightlife");
    var traffic   = _avgPressure(world, "traffic");
    var delivery  = _avgPressure(world, "delivery");
    var energy    = _avgPressure(world, "energy");
    var weather   = _avgPressure(world, "weather");

    // Target values derived from pressure
    var tBpmShift      = (nightlife - 0.5) * 24;    // -12 to +12 BPM offset
    var tDensity       = 0.3 + traffic   * 0.7;
    var tBrightness    = 0.2 + nightlife * 0.8;
    var tPercussion    = 0.1 + delivery  * 0.9;
    var tFieldStrength = 0.2 + energy    * 0.8;
    var tWeatherDamp   = weather;

    // Smooth interpolation
    _smooth.bpmShift      += (tBpmShift      - _smooth.bpmShift)      * smooth;
    _smooth.density       += (tDensity       - _smooth.density)       * smooth;
    _smooth.brightness    += (tBrightness    - _smooth.brightness)    * smooth;
    _smooth.percussion    += (tPercussion    - _smooth.percussion)    * smooth;
    _smooth.fieldStrength += (tFieldStrength - _smooth.fieldStrength) * smooth;
    _smooth.weatherDamp   += (tWeatherDamp   - _smooth.weatherDamp)   * smooth;

    // ── Write to state ─────────────────────────────────────────────────────
    // BPM: base BPM modulated by nightlife pressure
    if (state.bpm != null) {
      var baseBpm = state._ecologyBaseBpm || state.bpm;
      if (!state._ecologyBaseBpm) state._ecologyBaseBpm = state.bpm;
      var targetBpm = Math.max(60, Math.min(200, baseBpm + _smooth.bpmShift));
      // Only nudge BPM if ecology is enabled — don't override user BPM directly
      if (world.musicEcology && world.musicEcology.enabled) {
        state.bpm = state.bpm + (targetBpm - state.bpm) * smooth * 0.2;
      }
    }

    // Field strength: energy → world physics strength
    if (world.musicEcology && world.musicEcology.enabled) {
      if (state.world && state.world.physics && state.world.physics.flow) {
        state.world.physics.flow.strength =
          Math.max(0, Math.min(0.08, _smooth.fieldStrength * 0.06));
      }
    }

    // ── Store output for inspector / debug ─────────────────────────────────
    world.musicEcology = world.musicEcology || {};
    world.musicEcology.output = {
      bpmShift:      _smooth.bpmShift,
      density:       _smooth.density,
      brightness:    _smooth.brightness,
      percussion:    _smooth.percussion,
      fieldStrength: _smooth.fieldStrength,
      weatherDamp:   _smooth.weatherDamp,
    };
  }

  // ── BPM reset helper ───────────────────────────────────────────────────────
  function resetBpmBase(state) {
    delete state._ecologyBaseBpm;
  }

  // ── Query ──────────────────────────────────────────────────────────────────
  function getOutput(world) {
    return (world && world.musicEcology && world.musicEcology.output) || _smooth;
  }

  SBE.MusicEcology = {
    tick:         tick,
    getOutput:    getOutput,
    resetBpmBase: resetBpmBase,
  };

})(window);
