// 0511_WOS_FoundationProtocols_HumanAquarium_v1.0.0
// Environment State — canonical environmental conditions for all WOS worlds.
// Vanilla IIFE. Attaches to SBE.EnvironmentState.
// Load order: universalClock.js → environmentState.js → …
//
// ═══════════════════════════════════════════════════════════════════════════
// OWNERSHIP
//   This module owns: weatherType, temperature, humidity, windStrength,
//   cloudDensity, visibility, and their transition targets.
//
//   It DOES NOT own: rendering, camera behavior, audio, traffic.
//   Those systems READ from EnvironmentState — they never write to it.
//
// AUTHORITY CHAIN
//   Event zones may trigger weatherShift actions. These call setWeather().
//   The clock informs temperature drift (hour + season). Neither writes state.
//
// PERSIST: weatherType, _targetWeather (so scene reloads to correct weather)
// NEVER PERSIST: interpolated values (temperature, humidity, etc.) —
//   they are recomputed from weatherType on rehydrate.
//
// FUTURE DEPENDENCIES (read this state, do not write it):
//   traffic, routing, soundtrack, camera interest, tree movement, fog, transit
// ═══════════════════════════════════════════════════════════════════════════

(function initEnvironmentState(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── Helpers ───────────────────────────────────────────────────────────────
  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ── Weather archetypes ────────────────────────────────────────────────────
  // These are canonical target values for each weather type.
  // Actual env values lerp toward the active archetype over time.
  var ARCHETYPES = {
    clear:      { temperature: 20,  humidity: 0.30, windStrength: 0.10, cloudDensity: 0.05, visibility: 1.00 },
    cloudy:     { temperature: 15,  humidity: 0.52, windStrength: 0.20, cloudDensity: 0.70, visibility: 0.85 },
    light_rain: { temperature: 13,  humidity: 0.80, windStrength: 0.30, cloudDensity: 0.88, visibility: 0.60 },
    heavy_rain: { temperature: 10,  humidity: 0.96, windStrength: 0.72, cloudDensity: 1.00, visibility: 0.28 },
    fog:        { temperature:  8,  humidity: 0.90, windStrength: 0.04, cloudDensity: 0.60, visibility: 0.18 },
    snow:       { temperature: -2,  humidity: 0.70, windStrength: 0.40, cloudDensity: 0.84, visibility: 0.48 },
  };

  var WEATHER_TYPES = Object.keys(ARCHETYPES);

  // Season base temperature offsets (added to archetype temperature)
  var SEASON_TEMP_OFFSET = { spring: 0, summer: 8, autumn: -3, winter: -12 };

  // Hour-of-day temperature modifier: coldest ~04:00, warmest ~14:00
  function _hourTempOffset(hour) {
    return Math.sin((hour - 4) * Math.PI / 12) * 6;
  }

  // ── Environment factory ───────────────────────────────────────────────────
  function makeEnvironment(opts) {
    opts = opts || {};
    var weather = opts.weatherType || "clear";
    var arch    = ARCHETYPES[weather] || ARCHETYPES.clear;
    return {
      // ── Persistent ──────────────────────────────────────────────────────
      weatherType:    weather,
      _targetWeather: weather,

      // ── Runtime (interpolated — never persist) ───────────────────────
      temperature:    arch.temperature,
      humidity:       arch.humidity,
      windStrength:   arch.windStrength,
      cloudDensity:   arch.cloudDensity,
      visibility:     arch.visibility,

      // Transition speed (lerp alpha per second, not per frame)
      _transitionRate: 0.004,   // slow — weather should take minutes to shift
    };
  }

  var PERSIST_KEYS = ["weatherType", "_targetWeather"];

  // ── Weather transition ─────────────────────────────────────────────────────
  // setWeather enqueues a transition. The lerp in update() handles the animation.
  function setWeather(env, weatherType) {
    if (!ARCHETYPES[weatherType]) {
      console.warn("[EnvironmentState] unknown weatherType:", weatherType, "valid:", WEATHER_TYPES.join(", "));
      return;
    }
    env._targetWeather = weatherType;
    // weatherType label updates immediately so inspectors show intent;
    // visual/numeric values catch up via lerp.
    env.weatherType    = weatherType;
  }

  // ── Update ────────────────────────────────────────────────────────────────
  // Call once per simulation frame.
  // clock: SBE.UniversalClock instance (optional — used for temp adjustment)
  // dt: real-time delta in seconds
  function update(env, clock, dt) {
    if (!env) return;

    var arch   = ARCHETYPES[env._targetWeather] || ARCHETYPES.clear;
    var rate   = 1 - Math.pow(1 - env._transitionRate, dt);  // frame-rate-independent lerp

    // Base temperature from archetype + season + hour
    var targetTemp = arch.temperature;
    if (clock) {
      var derived = SBE.UniversalClock.getDerived(clock);
      targetTemp += (SEASON_TEMP_OFFSET[derived.season] || 0);
      targetTemp += _hourTempOffset(derived.hour);
    }

    env.temperature  = lerp(env.temperature,  targetTemp,        rate);
    env.humidity     = lerp(env.humidity,      arch.humidity,     rate);
    env.windStrength = lerp(env.windStrength,  arch.windStrength, rate);
    env.cloudDensity = lerp(env.cloudDensity,  arch.cloudDensity, rate);
    env.visibility   = lerp(env.visibility,    arch.visibility,   rate);
  }

  // ── Interest score (used by AquariumCamera and soundtrack) ───────────────
  // Returns 0–1: how cinematically interesting the current environment is.
  // Peaks during storms, fog, and heavy weather; low during clear calm.
  function cinematicInterest(env) {
    if (!env) return 0;
    // Combination: low visibility + high wind + high cloud density
    var drama = (1 - env.visibility) * 0.5 + env.windStrength * 0.3 + env.cloudDensity * 0.2;
    return clamp(drama, 0, 1);
  }

  // ── Serialization ─────────────────────────────────────────────────────────
  function serializeEnvironment(env) {
    var out = {};
    PERSIST_KEYS.forEach(function (k) { out[k] = env[k]; });
    return out;
  }

  function rehydrateEnvironment(saved) {
    var e = makeEnvironment(saved || {});
    // Re-snap numeric values to target archetype on load (no mid-transition artifacts)
    if (saved && saved._targetWeather) {
      e._targetWeather = saved._targetWeather;
      e.weatherType    = saved.weatherType || saved._targetWeather;
    }
    var arch = ARCHETYPES[e._targetWeather] || ARCHETYPES.clear;
    e.temperature  = arch.temperature;
    e.humidity     = arch.humidity;
    e.windStrength = arch.windStrength;
    e.cloudDensity = arch.cloudDensity;
    e.visibility   = arch.visibility;
    return e;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  SBE.EnvironmentState = {
    makeEnvironment:      makeEnvironment,
    setWeather:           setWeather,
    update:               update,
    cinematicInterest:    cinematicInterest,
    serializeEnvironment: serializeEnvironment,
    rehydrateEnvironment: rehydrateEnvironment,
    // Constants (read-only reference)
    ARCHETYPES:    ARCHETYPES,
    WEATHER_TYPES: WEATHER_TYPES,
  };

  console.log("[WOS EnvironmentState] Loaded — Foundation Protocols v1.0.0");
})(window);
