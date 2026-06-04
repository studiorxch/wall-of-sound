// ── MaritimeTemporalEcology v1.0.0 ───────────────────────────────────────────
// 0523C_WOS_MaritimeSpawnEcology_v1.2.1
// Status: active
// Classification: runtime-authority
//
// Purpose:
//   Provides time-of-day affinity and weather affinity values consumed by the
//   EcologyScore formula in MaritimeSpawnEcology.
//
//   All time computations use simulation time, not wall-clock time.
//   In deterministic mode the caller must supply simulationTimeMs from the
//   injectable simulation clock — never from Date.now() or performance.now().
//
//   Time windows are probability modulation only.
//   They are not hard schedules. They do not force spawns or evictions.
//   They do not move vessels. They do not alter AIS truth.
//
//   Concrete time-density interaction is deferred to:
//     0523F_WOS_MaritimeContinuityDensity_v1.0.0
//   Concrete weather integration is deferred to:
//     0523E_WOS_MaritimeAtmosphericReadability_v1.0.0
//
//   Until those specs exist, default affinities from the spec apply:
//     DEFAULT_TIME_WINDOW_AFFINITY = 1.0
//     DEFAULT_WEATHER_AFFINITY     = 1.0
//
// Placement: wall/ecology/maritimeTemporalEcology.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── Default affinities (spec §ECOLOGY SCORE / EcologyScore Dependency Defaults) ─

  var DEFAULT_TIME_WINDOW_AFFINITY = 1.0;
  var DEFAULT_WEATHER_AFFINITY     = 1.0;

  // ── Time window definitions ──────────────────────────────────────────────────
  // Each entry defines an hour range [startHr, endHr) and per-zone-type multipliers.
  // Zone types not listed in a window inherit 1.0 (no modification).
  // Multipliers are probability modifiers, not hard constraints.
  //
  // From spec §TEMPORAL ECOLOGY:
  //   06:00–09:00  ferry activity increase
  //   12:00–14:00  moderate harbor utility lift
  //   17:00–19:00  ferry and service activity increase
  //   22:00–05:00  recreational suppression
  //   late night   cargo persistence remains plausible

  var _timeWindows = [
    {
      startHr: 6, endHr: 9,
      label: 'morning-commute',
      zoneMultipliers: {
        FERRY_TRANSIT_CORRIDOR: 1.45,
        INDUSTRIAL_CORRIDOR:    1.05,
        HARBOR_UTILITY_ZONE:    1.10,
        OPEN_RECREATIONAL_WATER: 0.85,
      },
    },
    {
      startHr: 12, endHr: 14,
      label: 'midday',
      zoneMultipliers: {
        HARBOR_UTILITY_ZONE:    1.20,
        FERRY_TRANSIT_CORRIDOR: 1.10,
        OPEN_RECREATIONAL_WATER: 1.15,
      },
    },
    {
      startHr: 17, endHr: 19,
      label: 'evening-commute',
      zoneMultipliers: {
        FERRY_TRANSIT_CORRIDOR:  1.45,
        HARBOR_UTILITY_ZONE:     1.15,
        OPEN_RECREATIONAL_WATER: 1.10,
        INDUSTRIAL_CORRIDOR:     1.05,
      },
    },
    {
      startHr: 22, endHr: 29, // 22:00–05:00 (hour 29 = 05:00 next day)
      label: 'late-night',
      zoneMultipliers: {
        OPEN_RECREATIONAL_WATER: 0.15, // strong recreational suppression
        FERRY_TRANSIT_CORRIDOR:  0.35,
        HARBOR_UTILITY_ZONE:     0.65,
        INDUSTRIAL_CORRIDOR:     0.90, // cargo persistence plausible
        STRATEGIC_SECURITY_CORRIDOR: 1.10,
      },
    },
  ];

  // ── Weather affinity table ───────────────────────────────────────────────────
  // Keyed by weather state string (from 0523E when available).
  // Until 0523E exists, callers pass null → DEFAULT_WEATHER_AFFINITY.
  // These values are zone-agnostic overall multipliers on ecology score.
  // Zone-specific weather modulation uses the zone's weatherSensitivity field
  // in MaritimeSpawnEcology, not here.

  var _weatherAffinityTable = {
    'clear':        1.00,
    'overcast':     0.95,
    'light-rain':   0.85,
    'heavy-rain':   0.60,
    'fog':          0.70,
    'dense-fog':    0.45,
    'storm':        0.30,
    'snow':         0.50,
  };

  // ── Internal: resolve hour-of-day from simulation time ──────────────────────
  // simulationTimeMs is ms from an arbitrary reference point.
  // We take modulo 24h to get ms-of-day, then convert to fractional hours.
  // This means the simulation clock's zero point maps to midnight by default.
  // Callers with a known epoch offset must supply (simulationTimeMs + offsetMs).

  var MS_PER_HOUR = 3600000;
  var MS_PER_DAY  = 86400000;

  function _hourOfDay(simulationTimeMs) {
    var msOfDay = ((simulationTimeMs % MS_PER_DAY) + MS_PER_DAY) % MS_PER_DAY;
    return msOfDay / MS_PER_HOUR; // 0.0 – 23.999...
  }

  // ── Time window affinity ─────────────────────────────────────────────────────
  // Returns the affinity multiplier for a given zone type at the current
  // simulation time. If no window covers the current hour, returns 1.0.
  //
  // zoneType — one of the ZONE_TYPE string constants from MaritimeEcologicalZones
  // simulationTimeMs — from injectable simulation clock; NEVER wall-clock

  function getTimeWindowAffinity(zoneType, simulationTimeMs) {
    if (simulationTimeMs == null || !Number.isFinite(simulationTimeMs)) {
      return DEFAULT_TIME_WINDOW_AFFINITY;
    }
    var hourF = _hourOfDay(simulationTimeMs);
    // Normalize hour for windows that span midnight (endHr > 24)
    var hourNorm  = hourF;
    var hourAlt   = hourF + 24; // for matching late-night windows that cross midnight

    for (var i = 0; i < _timeWindows.length; i++) {
      var win = _timeWindows[i];
      var matched = (hourNorm >= win.startHr && hourNorm < win.endHr) ||
                    (win.endHr > 24 && hourAlt >= win.startHr && hourAlt < win.endHr);
      if (matched) {
        var mult = win.zoneMultipliers[zoneType];
        return (mult != null) ? mult : 1.0;
      }
    }
    return 1.0; // no active window — neutral
  }

  // ── Weather affinity ─────────────────────────────────────────────────────────
  // Returns a scalar [0, 1+] affinity based on weather state string.
  // null or unknown weather → DEFAULT_WEATHER_AFFINITY (1.0).

  function getWeatherAffinity(weatherState) {
    if (!weatherState) return DEFAULT_WEATHER_AFFINITY;
    var val = _weatherAffinityTable[weatherState];
    return (val != null) ? val : DEFAULT_WEATHER_AFFINITY;
  }

  // ── Active window label (debug) ──────────────────────────────────────────────

  function getActiveWindowLabel(simulationTimeMs) {
    if (simulationTimeMs == null || !Number.isFinite(simulationTimeMs)) return null;
    var hourF    = _hourOfDay(simulationTimeMs);
    var hourAlt  = hourF + 24;
    for (var i = 0; i < _timeWindows.length; i++) {
      var win = _timeWindows[i];
      if ((hourF >= win.startHr && hourF < win.endHr) ||
          (win.endHr > 24 && hourAlt >= win.startHr && hourAlt < win.endHr)) {
        return win.label;
      }
    }
    return 'neutral';
  }

  function getDebugSnapshot(simulationTimeMs) {
    var hourF = simulationTimeMs != null ? _hourOfDay(simulationTimeMs) : null;
    return {
      version:        VERSION,
      simulationHour: hourF != null ? Math.floor(hourF * 10) / 10 : null,
      activeWindow:   getActiveWindowLabel(simulationTimeMs),
      defaults: {
        timeWindowAffinity: DEFAULT_TIME_WINDOW_AFFINITY,
        weatherAffinity:    DEFAULT_WEATHER_AFFINITY,
      },
      timeWindows: _timeWindows.map(function (w) {
        return { label: w.label, startHr: w.startHr, endHr: w.endHr > 24 ? w.endHr - 24 : w.endHr };
      }),
      weatherStates: Object.keys(_weatherAffinityTable),
    };
  }

  // ── Exports ──────────────────────────────────────────────────────────────────

  SBE.MaritimeTemporalEcology = {
    getTimeWindowAffinity,
    getWeatherAffinity,
    getActiveWindowLabel,
    getDebugSnapshot,

    DEFAULT_TIME_WINDOW_AFFINITY,
    DEFAULT_WEATHER_AFFINITY,

    VERSION: VERSION,
  };

  console.log('[MaritimeTemporalEcology v' + VERSION + '] ready');

})(window);
