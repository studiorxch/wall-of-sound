(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── WorldTelemetryHUD (0519_WOS_ContextualToolHUD_WeatherTelemetry_v1.0.0) ─
  //
  // Cinematic environmental telemetry overlay.
  // Replaces the glass-panel WorldHUD with stark, instrumentation-grade typography.
  //
  // Layout (upper-right, pointer-events: none):
  //
  //   BROOKLYN, NY                ← location, uppercase, tertiary
  //   01:42                       ← local time, large, prominent
  //   AM · EDT                    ← meridiem + timezone abbreviation
  //   Rain Drift                  ← cinematic weather label
  //   68°                         ← temperature
  //
  // Data sources:
  //   world:clockTick             → time, weekday, isNight
  //   world:weatherChanged        → temperature, wmoCode, icon
  //   world:atmosphereChanged     → mood, lightTemp, isNight, fogDensity
  //   viewport:locationChanged    → city, region, timezone
  //
  // Philosophy: environmental instrumentation, not application chrome.

  var _hud  = null;
  var _els  = {};

  // ── Cinematic weather name mapping ────────────────────────────────────────
  // Raw WorldAtmosphere mood strings → cinematic labels.
  // These are felt before they are read.
  var CINEMATIC_LABELS = {
    "storm-night":   "Storm Front",
    "storm-day":     "Storm Front",
    "snow-night":    "Snow Veil",
    "snow-day":      "Snow Veil",
    "fog-night":     "Cold Fog",
    "fog-morning":   "Cold Fog",
    "rain-night":    "Rain Drift",
    "rain-day":      "Rain Drift",
    "full-moon":     "Full Moon",
    "clear-night":   "Clear Night",
    "golden-hour":   "Golden Hour",
    "overcast-day":  "Overcast",
    "clear-day":     "Daylight",
    "neutral":       "",
  };

  // WMO code supplemental labels for conditions not covered by mood strings
  var WMO_CINEMATIC = {
    45: "Cold Fog",
    48: "Icy Fog",
    51: "Light Drizzle",
    53: "Drizzle",
    55: "Heavy Drizzle",
  };

  function _cinematicLabel(mood, wmoCode) {
    if (CINEMATIC_LABELS[mood] !== undefined) return CINEMATIC_LABELS[mood];
    if (wmoCode != null && WMO_CINEMATIC[wmoCode]) return WMO_CINEMATIC[wmoCode];
    // Fallback: humanise raw mood string ("fog-morning" → "Fog Morning")
    return (mood || "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  // ── Timezone abbreviation ─────────────────────────────────────────────────
  // Extracts "EDT", "JST", "CET" etc. from an IANA timezone string.
  // Uses Intl.DateTimeFormat formatToParts — universally supported.
  function _tzAbbr(tz) {
    if (!tz || tz === "UTC") return "UTC";
    try {
      var parts = new Intl.DateTimeFormat("en-US", {
        timeZone:     tz,
        timeZoneName: "short",
      }).formatToParts(new Date());
      for (var i = 0; i < parts.length; i++) {
        if (parts[i].type === "timeZoneName") return parts[i].value;
      }
    } catch (e) {}
    return "";
  }

  // ── Local state ───────────────────────────────────────────────────────────
  var _data = {
    city:        "",
    region:      "",
    localTime:   "",
    meridiem:    "",         // "AM" or "PM" extracted from localTime
    timeHour:    "",         // just the hours:minutes portion
    timezone:    "UTC",
    tzAbbr:      "UTC",
    mood:        "neutral",
    wmoCode:     null,
    temperatureF: null,
    isNight:     false,
    fogDensity:  0,
    lightTemp:   "neutral",
  };

  var _lastTz = null;    // cache so _tzAbbr() isn't called every clock tick

  // ── DOM construction ──────────────────────────────────────────────────────
  function _build() {
    var canvasArea = document.querySelector(".canvas-area");
    if (!canvasArea) return;
    if (document.getElementById("world-telemetry-hud")) return; // idempotent

    _hud = document.createElement("div");
    _hud.id = "world-telemetry-hud";
    _hud.setAttribute("aria-live", "polite");
    _hud.setAttribute("aria-label", "World environmental telemetry");

    // Anatomy — each semantic slot is an independently-updated element
    _hud.innerHTML =
      '<div class="wt-location"></div>'          +
      '<div class="wt-time-block">'              +
        '<span class="wt-time"></span>'           +
        '<span class="wt-time-sub">'             +
          '<span class="wt-meridiem"></span>'    +
          '<span class="wt-sep" aria-hidden="true"> · </span>' +
          '<span class="wt-tzabbr"></span>'      +
        '</span>'                                +
      '</div>'                                   +
      '<div class="wt-conditions">'             +
        '<div class="wt-weather-label"></div>'  +
        '<div class="wt-temp"></div>'           +
      '</div>'                                  +
      '<div class="wt-drift-label"></div>';

    canvasArea.appendChild(_hud);

    _els = {
      location:     _hud.querySelector(".wt-location"),
      time:         _hud.querySelector(".wt-time"),
      meridiem:     _hud.querySelector(".wt-meridiem"),
      tzabbr:       _hud.querySelector(".wt-tzabbr"),
      weatherLabel: _hud.querySelector(".wt-weather-label"),
      temp:         _hud.querySelector(".wt-temp"),
      driftLabel:   _hud.querySelector(".wt-drift-label"),
    };
  }

  // ── Render ────────────────────────────────────────────────────────────────
  function _render() {
    if (!_hud) return;

    // Location: "BROOKLYN, NY" or just "BROOKLYN" if no region
    var loc = _data.city
      ? (_data.city + (_data.region && _data.region !== "—" ? ", " + _data.region : "")).toUpperCase()
      : "";
    if (_els.location) _els.location.textContent = loc;

    // Time: split "12:56 AM" into "12:56" and "AM"
    // WorldClock emits 12h format via Intl: "12:56 AM" or "1:42 PM"
    var raw   = _data.localTime || "";
    var parts = raw.split(" ");
    var hrMin = parts[0] || "";
    var merid = parts[1] || "";
    if (_els.time)     _els.time.textContent     = hrMin;
    if (_els.meridiem) _els.meridiem.textContent = merid;

    // Timezone abbreviation — cached to avoid Intl call every second
    if (_data.timezone !== _lastTz) {
      _lastTz = _data.timezone;
      _data.tzAbbr = _tzAbbr(_data.timezone);
    }
    if (_els.tzabbr) _els.tzabbr.textContent = _data.tzAbbr;

    // Cinematic weather label
    var label = _cinematicLabel(_data.mood, _data.wmoCode);
    if (_els.weatherLabel) _els.weatherLabel.textContent = label;

    // Temperature — bare number + degree
    if (_els.temp) {
      _els.temp.textContent = _data.temperatureF !== null
        ? _data.temperatureF + "°"
        : "";
    }

    // Mood classes on the hud root — drives CSS color/opacity variants
    _hud.className = "wt-mood-" + (_data.mood || "neutral").replace(/[^a-z-]/g, "");
    _hud.classList.toggle("wt--night",  _data.isNight);
    _hud.classList.toggle("wt--rain",   _data.mood && (_data.mood.includes("rain") || _data.mood.includes("storm")));
    _hud.classList.toggle("wt--fog",    _data.mood && _data.mood.includes("fog"));
    _hud.classList.toggle("wt--snow",   _data.mood && _data.mood.includes("snow"));
    _hud.classList.toggle("wt--golden", _data.lightTemp === "warm" && !_data.isNight);
  }

  // ── Event handlers ────────────────────────────────────────────────────────
  function _onClockTick(evt) {
    if (!evt || !evt.state) return;
    _data.localTime = evt.state.localTime    || "";
    _data.isNight   = !!evt.state.isNight;
    _render();
  }

  function _onWeather(evt) {
    if (!evt || !evt.state) return;
    _data.temperatureF = evt.state.temperatureF;
    _data.wmoCode      = evt.state.wmoCode;
    _render();
  }

  function _onAtmosphere(evt) {
    if (!evt || !evt.state) return;
    _data.mood       = evt.state.mood       || "neutral";
    _data.isNight    = !!evt.state.isNight;
    _data.fogDensity = evt.state.fogDensity || 0;
    _data.lightTemp  = evt.state.lightTemp  || "neutral";
    // Opacity modulation: foggy conditions wash out the HUD slightly
    _hud && (_hud.style.opacity = _data.fogDensity > 0.4 ? "0.72" : "1");
    _render();
  }

  function _onDriftChanged(evt) {
    if (!evt || !evt.state) return;
    if (_els.driftLabel) _els.driftLabel.textContent = evt.state.driftLabel || "";
  }

  function _onViewportLocation(evt) {
    if (!evt || !evt.location) return;
    var loc           = evt.location;
    _data.city        = loc.city     || "";
    _data.region      = loc.region   || "";
    _data.timezone    = loc.timezone || "UTC";
    _lastTz           = null; // force tz abbreviation recalculation
    _render();
  }

  // ── Hydrate from current system state ────────────────────────────────────
  function _hydrate() {
    // Pull current state from all relevant systems so HUD isn't blank on mount
    if (SBE.WorldClock)        _onClockTick({ state: SBE.WorldClock.getState() });
    if (SBE.WorldWeather)      _onWeather({ state: SBE.WorldWeather.getState() });
    if (SBE.WorldAtmosphere)   _onAtmosphere({ state: SBE.WorldAtmosphere.getState() });
    if (SBE.WorldDriftManager) _onDriftChanged({ state: SBE.WorldDriftManager.getState() });

    var vlaState = SBE.ViewportLocationAuthority && SBE.ViewportLocationAuthority.getState();
    if (vlaState && vlaState.city) {
      _onViewportLocation({ location: vlaState });
    } else {
      // Fallback to world default until VLA fires
      var world = SBE.WorldRuntime && SBE.WorldRuntime.getActiveWorld();
      if (world && world.location) {
        var wParts = world.location.split(",");
        _data.city   = (wParts[0] || "").trim();
        _data.region = (wParts[1] || "").trim();
      }
    }
    _render();
  }

  // ── Public ────────────────────────────────────────────────────────────────
  function init() {
    _build();

    var bus = SBE.WorkspaceEventBus;
    if (bus) {
      bus.on("world:clockTick",          _onClockTick);
      bus.on("world:weatherChanged",     _onWeather);
      bus.on("world:atmosphereChanged",  _onAtmosphere);
      bus.on("viewport:locationChanged", _onViewportLocation);
      bus.on("world:driftChanged",       _onDriftChanged);
    }

    _hydrate();
    console.log("[WorldTelemetryHUD] initialized");
  }

  SBE.WorldTelemetryHUD = { init: init };

})(window);
