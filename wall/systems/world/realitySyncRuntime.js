(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── RealitySyncRuntime (0520N_WOS_RealitySyncRuntime_v1.0.0) ─────────────
  //
  // Authoritative real-world environmental synchronization.
  // Fetches live weather, resolves to a canonical realityState, and feeds it
  // downstream to AtmosphereRuntime as an environmental injection.
  //
  // ARCHITECTURAL PIPELINE:
  //   RealitySyncRuntime → AtmosphereRuntime → OverlayRuntime / HUD / Traffic
  //
  // SEPARATION OF CONCERNS:
  //   This runtime fetches and resolves only. It does NOT render.
  //   AtmosphereRuntime still interprets cinematic/mood drift on top of reality.
  //   Reality influences the world — it does not replace cinematic judgment.
  //
  // DATA SOURCE: Open-Meteo (free, no API key, WMO weather codes)
  //   https://open-meteo.com/en/docs
  //
  // REFRESH CADENCE: every 15 minutes (environmental truth, not real-time).
  //
  // STATUS LIFECYCLE:
  //   "live"    — data < 20 minutes old
  //   "stale"   — data 20–60 minutes old
  //   "offline" — fetch failed, no prior data
  //
  // Emits (broadcast: namespace):
  //   broadcast:realityStateUpdated   { state }
  //   broadcast:weatherChanged        { weather }   ← consumed by AtmosphereRuntime

  var REFRESH_MS    = 15 * 60 * 1000;   // 15 minutes
  var LIVE_CUTOFF   = 20 * 60 * 1000;   // 20 min → stale
  var STALE_CUTOFF  = 60 * 60 * 1000;   // 60 min → offline

  // ── WMO weather code → condition + glyph ─────────────────────────────────
  var WMO_MAP = {
    0:  { condition: "clear",          glyph: "○", label: "Clear"          },
    1:  { condition: "mostly-clear",   glyph: "◎", label: "Mostly Clear"   },
    2:  { condition: "partly-cloudy",  glyph: "◑", label: "Partly Cloudy"  },
    3:  { condition: "overcast",       glyph: "●", label: "Overcast"       },
    45: { condition: "fog",            glyph: "∿", label: "Fog"            },
    48: { condition: "fog",            glyph: "∿", label: "Freezing Fog"   },
    51: { condition: "drizzle",        glyph: "·", label: "Light Drizzle"  },
    53: { condition: "drizzle",        glyph: "·", label: "Drizzle"        },
    55: { condition: "drizzle",        glyph: "·", label: "Heavy Drizzle"  },
    56: { condition: "drizzle",        glyph: "·", label: "Freezing Drizzle"},
    57: { condition: "drizzle",        glyph: "·", label: "Heavy Fz. Drizzle"},
    61: { condition: "rain",           glyph: "▾", label: "Light Rain"     },
    63: { condition: "rain",           glyph: "▾", label: "Rain"           },
    65: { condition: "rain",           glyph: "▾", label: "Heavy Rain"     },
    66: { condition: "rain",           glyph: "▾", label: "Freezing Rain"  },
    67: { condition: "rain",           glyph: "▾", label: "Heavy Fz. Rain" },
    71: { condition: "snow",           glyph: "❄", label: "Light Snow"     },
    73: { condition: "snow",           glyph: "❄", label: "Snow"           },
    75: { condition: "snow",           glyph: "❄", label: "Heavy Snow"     },
    77: { condition: "snow",           glyph: "❄", label: "Snow Grains"    },
    80: { condition: "showers",        glyph: "▾", label: "Showers"        },
    81: { condition: "showers",        glyph: "▾", label: "Rain Showers"   },
    82: { condition: "showers",        glyph: "▾", label: "Heavy Showers"  },
    85: { condition: "snow",           glyph: "❄", label: "Snow Showers"   },
    86: { condition: "snow",           glyph: "❄", label: "Heavy Snow Showers"},
    95: { condition: "thunderstorm",   glyph: "⚡", label: "Thunderstorm"   },
    96: { condition: "thunderstorm",   glyph: "⚡", label: "Hail Storm"     },
    99: { condition: "thunderstorm",   glyph: "⚡", label: "Heavy Hail"     },
  };

  function _wmoEntry(code) {
    return WMO_MAP[code] || WMO_MAP[0];
  }

  // ── Core state ────────────────────────────────────────────────────────────
  var _state = {
    status:       "offline",   // "live" | "stale" | "offline"
    fetchedAt:    0,
    resolvedAt:   0,
    errorCount:   0,
    resolved: null,            // resolvedRealityState (see below)
  };

  // ── resolvedRealityState shape ────────────────────────────────────────────
  // {
  //   condition,      // "clear" | "rain" | "snow" | "fog" | …
  //   glyph,          // single unicode glyph for HUD display
  //   label,          // human-readable condition label
  //   precipitation,  // 0–1 normalized (actual mm/hr * scaling)
  //   precipMmPerHr,  // raw mm/hr
  //   cloudCover,     // 0–1
  //   temperatureF,   // °F
  //   temperatureC,   // °C
  //   humidity,       // 0–1
  //   windMph,        // mph
  //   isDaylight,     // boolean
  //   iconId,         // "condition-day" | "condition-night"
  //   sunriseISO,     // ISO string
  //   sunsetISO,      // ISO string
  // }

  function _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function _bus()             { return SBE.WorkspaceEventBus; }
  function _emit(evt, payload){ var b = _bus(); b && b.emit(evt, payload); }

  // ── Resolve raw Open-Meteo response → resolvedRealityState ───────────────
  function _resolve(data) {
    var cur    = data.current        || {};
    var daily  = data.daily          || {};
    var code   = cur.weather_code    != null ? cur.weather_code : 0;
    var entry  = _wmoEntry(code);
    var isDaylight = cur.is_day === 1;

    var precipMmPerHr = cur.precipitation || 0;
    // Normalize: 10mm/hr = 1.0 (heavy sustained rain)
    var precipNorm    = _clamp(precipMmPerHr / 10, 0, 1);

    var cloudCoverNorm = _clamp((cur.cloud_cover || 0) / 100, 0, 1);
    var humidityNorm   = _clamp((cur.relative_humidity_2m || 50) / 100, 0, 1);
    var tempF          = cur.temperature_2m != null ? cur.temperature_2m : null;
    var tempC          = tempF != null ? Math.round((tempF - 32) * 5 / 9 * 10) / 10 : null;
    var windMph        = cur.wind_speed_10m != null ? Math.round(cur.wind_speed_10m) : 0;

    return {
      condition:    entry.condition,
      glyph:        entry.glyph,
      label:        entry.label,
      precipitation: precipNorm,
      precipMmPerHr: precipMmPerHr,
      cloudCover:   cloudCoverNorm,
      temperatureF: tempF != null ? Math.round(tempF) : null,
      temperatureC: tempC,
      humidity:     humidityNorm,
      windMph:      windMph,
      isDaylight:   isDaylight,
      iconId:       entry.condition + (isDaylight ? "-day" : "-night"),
      sunriseISO:   (daily.sunrise && daily.sunrise[0]) || null,
      sunsetISO:    (daily.sunset  && daily.sunset[0])  || null,
    };
  }

  // ── Inject resolved state into AtmosphereRuntime ──────────────────────────
  function _injectToAtmosphere(resolved) {
    var ar = SBE.AtmosphereRuntime;
    if (!ar) return;

    // Map condition → atmosphere modifiers (additive injection, not replacement)
    var fogAdd        = 0;
    var precipAdd     = 0;
    var cpAdd         = 0;
    var visibilityMod = 0;

    switch (resolved.condition) {
      case "fog":          fogAdd = 0.35;  visibilityMod = -0.30; cpAdd = 0.20; break;
      case "rain":         fogAdd = 0.10;  precipAdd = resolved.precipitation * 0.6; visibilityMod = -0.15; cpAdd = 0.18; break;
      case "drizzle":      fogAdd = 0.06;  precipAdd = resolved.precipitation * 0.4; cpAdd = 0.10; break;
      case "showers":      fogAdd = 0.08;  precipAdd = resolved.precipitation * 0.5; visibilityMod = -0.10; cpAdd = 0.15; break;
      case "snow":         fogAdd = 0.12;  precipAdd = resolved.precipitation * 0.5; visibilityMod = -0.20; cpAdd = 0.22; break;
      case "thunderstorm": fogAdd = 0.08;  precipAdd = resolved.precipitation * 0.8; visibilityMod = -0.18; cpAdd = 0.35; break;
      case "overcast":     fogAdd = 0.04;  visibilityMod = -0.05; break;
      default: break;
    }

    ar.inject({
      source:            "reality_sync",
      fog:               fogAdd,
      precipitation:     precipAdd,
      visibility:        visibilityMod,
      humidity:          (resolved.humidity - 0.5) * 0.3,   // delta from midpoint
      cinematicPressure: cpAdd,
      densityBias:       resolved.cloudCover * 0.12,
      durationMs:        REFRESH_MS + 5 * 60 * 1000,  // hold through next fetch + buffer
      easing:            "smooth",
      timestamp:         performance.now(),
    });

    // Also emit broadcast:weatherChanged so AtmosphereRuntime's _onWeatherChanged picks it up
    _emit("broadcast:weatherChanged", { weather: resolved.condition });
  }

  // ── Fetch from Open-Meteo ─────────────────────────────────────────────────
  function _fetch() {
    var vla = SBE.ViewportLocationAuthority;
    var st  = vla && vla.getState ? vla.getState() : null;
    var lat = st && st.latitude  != null ? st.latitude  : 40.6782;
    var lng = st && st.longitude != null ? st.longitude : -73.9442;

    var url = "https://api.open-meteo.com/v1/forecast"
      + "?latitude="  + lat
      + "&longitude=" + lng
      + "&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,is_day"
      + "&daily=sunrise,sunset"
      + "&temperature_unit=fahrenheit"
      + "&wind_speed_unit=mph"
      + "&timezone=auto"
      + "&forecast_days=1";

    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        var resolved     = _resolve(data);
        _state.resolved  = resolved;
        _state.fetchedAt = Date.now();
        _state.status    = "live";
        _state.errorCount = 0;

        _injectToAtmosphere(resolved);

        _emit("broadcast:realityStateUpdated", {
          state:  resolved,
          status: "live",
          fetchedAt: _state.fetchedAt,
        });

        console.log("[RealitySyncRuntime] live —",
          resolved.label, resolved.temperatureF + "°F",
          "humidity:" + Math.round(resolved.humidity * 100) + "%",
          "precip:" + resolved.precipMmPerHr.toFixed(1) + "mm/hr");
      })
      .catch(function (err) {
        _state.errorCount++;
        // Degrade status based on age of last good data
        var age = Date.now() - _state.fetchedAt;
        _state.status = _state.resolved
          ? (age > STALE_CUTOFF ? "offline" : "stale")
          : "offline";

        _emit("broadcast:realityStateUpdated", {
          state:  _state.resolved,
          status: _state.status,
          fetchedAt: _state.fetchedAt,
        });

        console.warn("[RealitySyncRuntime] fetch failed (" + _state.status + "):", err.message);
      });
  }

  // ── Status maintenance — called periodically to update live/stale/offline ──
  function _updateStatus() {
    if (!_state.resolved) return;
    var age = Date.now() - _state.fetchedAt;
    var newStatus = age < LIVE_CUTOFF ? "live" : age < STALE_CUTOFF ? "stale" : "offline";
    if (newStatus !== _state.status) {
      _state.status = newStatus;
      _emit("broadcast:realityStateUpdated", {
        state:     _state.resolved,
        status:    _state.status,
        fetchedAt: _state.fetchedAt,
      });
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────
  function getState()            { return _state; }
  function getResolvedState()    { return _state.resolved; }
  function forceRefresh()        { _fetch(); }

  // ── init ──────────────────────────────────────────────────────────────────
  function init() {
    // Fetch immediately, then on cadence
    _fetch();
    global.setInterval(_fetch,          REFRESH_MS);
    global.setInterval(_updateStatus,   60 * 1000);  // status check every 1 min

    console.log("[RealitySyncRuntime] initialized v1.0.0 — live weather active, refresh every",
      REFRESH_MS / 60000 + "min");
  }

  SBE.RealitySyncRuntime = {
    init:               init,
    getState:           getState,
    getResolvedState:   getResolvedState,
    forceRefresh:       forceRefresh,
  };

})(window);
