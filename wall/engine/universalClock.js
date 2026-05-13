// 0511_WOS_FoundationProtocols_HumanAquarium_v1.0.0
// Universal Clock — authoritative synchronized time for all WOS systems.
// Vanilla IIFE. Attaches to SBE.UniversalClock.
// Load order: schemas.js → universalClock.js → (all other foundation modules) → main.js
//
// ═══════════════════════════════════════════════════════════════════════════
// OWNERSHIP
//   This module owns: worldSec, worldTimeScale, season, moonPhase, daylightLevel
//   All other systems read from the clock — they never write to it.
//   The clock is the single source of temporal truth for the entire WOS universe.
//
// PERSIST: worldTimeScale, worldStartSec, hemisphere, paused
// NEVER PERSIST: _realElapsedSec (runtime accumulator)
//
// TIME MODEL
//   worldSec = worldStartSec + _realElapsedSec * worldTimeScale
//   Default worldTimeScale = 60  →  1 real second = 1 world minute
//                                    24 real minutes = 1 full world day
// ═══════════════════════════════════════════════════════════════════════════

(function initUniversalClock(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── Constants ─────────────────────────────────────────────────────────────
  var SEC_PER_DAY    = 86400;
  var MOON_CYCLE_DAY = 29.53;   // synodic month in days
  var DEFAULT_SCALE  = 60;      // 1 real-sec = 1 world-min

  // Day-of-year breakpoints for northern-hemisphere seasons
  var SEASON_BREAKS_N = { spring: 80, summer: 172, autumn: 264, winter: 355 };
  var SEASON_BREAKS_S = { spring: 264, summer: 355, autumn: 80, winter: 172 };

  // ── Helpers ───────────────────────────────────────────────────────────────
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function _season(dayOfYear, breaks) {
    var d = ((dayOfYear % 365) + 365) % 365;
    if (d < breaks.spring)  return "winter";
    if (d < breaks.summer)  return "spring";
    if (d < breaks.autumn)  return "summer";
    if (d < breaks.winter)  return "autumn";
    return "winter";
  }

  // ── Clock factory ─────────────────────────────────────────────────────────
  // worldStartSec: world time (in seconds) at the moment the clock was created.
  //   Set to e.g. 8 * 3600 to begin at 08:00 world time.
  function makeClock(opts) {
    opts = opts || {};
    return {
      // ── Persistent ──────────────────────────────────────────────────────
      worldTimeScale: typeof opts.worldTimeScale === "number" ? opts.worldTimeScale : DEFAULT_SCALE,
      worldStartSec:  typeof opts.worldStartSec  === "number" ? opts.worldStartSec  : 8 * 3600, // start at 08:00
      hemisphere:     opts.hemisphere || "north",
      paused:         false,

      // ── Runtime (ephemeral — never persist) ─────────────────────────────
      _realElapsedSec: 0,
    };
  }

  // ── Persist keys ──────────────────────────────────────────────────────────
  var PERSIST_KEYS = ["worldTimeScale", "worldStartSec", "hemisphere", "paused"];

  // ── Tick ──────────────────────────────────────────────────────────────────
  // Call once per frame from the simulation loop. realDtSec = frame delta in seconds.
  function tick(clock, realDtSec) {
    if (!clock || clock.paused) return;
    clock._realElapsedSec += realDtSec;
  }

  // ── World-time accessor ───────────────────────────────────────────────────
  function getWorldSec(clock) {
    return clock.worldStartSec + clock._realElapsedSec * clock.worldTimeScale;
  }

  // ── Derived state (computed on demand — not stored) ───────────────────────
  // Returns a plain object describing the current world-time state.
  // Cheap: only simple arithmetic. Safe to call every frame.
  function getDerived(clock) {
    var ws       = getWorldSec(clock);
    var totalDay = ws / SEC_PER_DAY;
    var hour     = (ws % SEC_PER_DAY) / 3600;
    if (hour < 0) hour += 24;
    var dayOfYear = Math.floor(((totalDay % 365) + 365) % 365);

    var breaks = clock.hemisphere === "south" ? SEASON_BREAKS_S : SEASON_BREAKS_N;
    var season = _season(dayOfYear, breaks);

    // Moon phase: 0 = new moon, 0.5 = full moon, cycles every ~29.53 days
    var moonPhase = ((totalDay % MOON_CYCLE_DAY) + MOON_CYCLE_DAY) % MOON_CYCLE_DAY / MOON_CYCLE_DAY;

    // Daylight: 0 at sunrise (06:00) and sunset (18:00), 1 at noon
    // Uses sin so it ramps smoothly: sin((hour - 6) * π / 12)
    var daylightLevel = clamp(Math.sin((hour - 6) * Math.PI / 12), 0, 1);

    // Time-of-day label for HUD / inspector
    var tod;
    if      (hour <  6) tod = "night";
    else if (hour <  8) tod = "dawn";
    else if (hour < 12) tod = "morning";
    else if (hour < 13) tod = "noon";
    else if (hour < 17) tod = "afternoon";
    else if (hour < 20) tod = "dusk";
    else                tod = "night";

    return {
      worldSec:      ws,
      totalDay:      totalDay,
      hour:          hour,
      dayOfYear:     dayOfYear,
      season:        season,
      moonPhase:     moonPhase,
      daylightLevel: daylightLevel,
      timeOfDay:     tod,
    };
  }

  // ── Formatted time string (HH:MM) ─────────────────────────────────────────
  function formatTime(clock) {
    var d = getDerived(clock);
    var h = Math.floor(d.hour);
    var m = Math.floor((d.hour - h) * 60);
    return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m;
  }

  // ── Time controls ─────────────────────────────────────────────────────────
  function pause(clock)  { clock.paused = true;  }
  function resume(clock) { clock.paused = false; }

  function setHour(clock, hour) {
    // Snap world time to a specific hour of the current day, preserving day count.
    var ws     = getWorldSec(clock);
    var dayStart = Math.floor(ws / SEC_PER_DAY) * SEC_PER_DAY;
    var newWs  = dayStart + clamp(hour, 0, 23.999) * 3600;
    // Back-calculate the real elapsed that produces newWs
    clock._realElapsedSec = (newWs - clock.worldStartSec) / clock.worldTimeScale;
    if (clock._realElapsedSec < 0) clock._realElapsedSec = 0;
  }

  // ── Serialization ─────────────────────────────────────────────────────────
  function serializeClock(clock) {
    var out = {};
    PERSIST_KEYS.forEach(function (k) { out[k] = clock[k]; });
    return out;
  }

  function rehydrateClock(saved) {
    var c = makeClock(saved || {});
    // _realElapsedSec intentionally reset — world starts from worldStartSec on load
    return c;
  }

  // ── Public API ────────────────────────────────────────────────────────────
  SBE.UniversalClock = {
    makeClock:       makeClock,
    tick:            tick,
    getWorldSec:     getWorldSec,
    getDerived:      getDerived,
    formatTime:      formatTime,
    pause:           pause,
    resume:          resume,
    setHour:         setHour,
    serializeClock:  serializeClock,
    rehydrateClock:  rehydrateClock,
    // Constants
    DEFAULT_SCALE:   DEFAULT_SCALE,
    SEC_PER_DAY:     SEC_PER_DAY,
  };

  console.log("[WOS UniversalClock] Loaded — Foundation Protocols v1.0.0");
})(window);
