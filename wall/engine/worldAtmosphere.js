(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── WorldAtmosphere (0520A_WOS_WorldAtmosphere_v1.0.0) ────────────────────
  //
  // All environmental state systems — geographic surface only.
  //
  //   SBE.WorldClock       — authoritative world time (timezone-aware, 1s ticks)
  //   SBE.WorldWeather     — live conditions via Open-Meteo (10 min polling)
  //   SBE.WorldMoonPhase   — lunar state (daily compute)
  //   SBE.WorldCalendar    — NYC/USA civic rhythms (hourly compute)
  //   SBE.WorldAtmosphere  — synthesized mood from all above
  //
  // Activate only for geographic surfaces. Free surfaces are unaffected.

  function _bus() { return SBE.WorkspaceEventBus; }
  function _emit(event, payload) {
    if (_bus()) _bus().emit(event, Object.assign(
      { source: "WorldAtmosphere", timestamp: performance.now() },
      payload
    ));
  }
  function _world() {
    return SBE.WorldRuntime ? SBE.WorldRuntime.getActiveWorld() : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. SBE.WorldClock
  //    Timezone-aware, 1-second resolution. Emits world:clockTick every second.
  //    Supports: realtime | accelerated | cinematic | frozen | replay modes.
  // ═══════════════════════════════════════════════════════════════════════════
  (function setup_WorldClock() {
    var _state = {
      timezone:     "America/New_York",
      localTime:    "",
      localDate:    "",
      weekdayShort: "",
      hour24:       0,
      minute:       0,
      sunrise:      6.0,   // hours — updated from weather API
      sunset:       20.0,  // hours — updated from weather API
      isNight:      false,
      simulationRate: 1,
      mode:         "realtime",
    };

    var _fmtTime, _fmtDate, _fmtDay, _fmtH24, _fmtMin;
    var _interval = null;

    function _buildFormatters(tz) {
      var o = { timeZone: tz };
      _fmtTime = new Intl.DateTimeFormat("en-US", Object.assign({}, o, { hour: "numeric", minute: "2-digit", hour12: true }));
      _fmtDate = new Intl.DateTimeFormat("en-US", Object.assign({}, o, { month: "short", day: "numeric" }));
      _fmtDay  = new Intl.DateTimeFormat("en-US", Object.assign({}, o, { weekday: "short" }));
      _fmtH24  = new Intl.DateTimeFormat("en-US", Object.assign({}, o, { hour: "numeric", hour12: false }));
      _fmtMin  = new Intl.DateTimeFormat("en-US", Object.assign({}, o, { minute: "2-digit" }));
    }

    function _tick() {
      var now      = new Date();
      var prevNight = _state.isNight;

      _state.localTime    = _fmtTime.format(now).toUpperCase();
      _state.localDate    = _fmtDate.format(now);
      _state.weekdayShort = _fmtDay.format(now);

      // hour12:false gives "24" for midnight in some locales — normalize to 0
      var h = parseInt(_fmtH24.format(now), 10) % 24;
      var m = parseInt(_fmtMin.format(now), 10);
      _state.hour24  = isNaN(h) ? 0 : h;
      _state.minute  = isNaN(m) ? 0 : m;
      _state.isNight = _state.hour24 < _state.sunrise || _state.hour24 >= _state.sunset;

      _emit("world:clockTick", { state: Object.assign({}, _state) });
      if (_state.isNight !== prevNight) {
        _emit("world:dayNightChanged", { isNight: _state.isNight });
      }
    }

    function init() {
      var w = _world();
      if (w && w.timezone) _state.timezone = w.timezone;
      _buildFormatters(_state.timezone);
      _tick(); // immediate
      _interval = setInterval(_tick, 1000);

      // ViewportLocationAuthority is the authoritative timezone source.
      // When the camera moves to a new region, update timezone immediately.
      if (_bus()) {
        _bus().on("viewport:locationChanged", function (evt) {
          var tz = evt.location && evt.location.timezone;
          if (tz && tz !== _state.timezone) {
            setTimezone(tz);
            console.log("[WorldClock] timezone →", tz);
          }
        });
      }

      console.log("[WorldClock] running — tz:", _state.timezone);
    }

    function getState()             { return Object.assign({}, _state); }
    function setTimezone(tz)        { _state.timezone = tz; _buildFormatters(tz); }
    function setSunriseSunset(r, s) { _state.sunrise = r; _state.sunset = s; }

    SBE.WorldClock = { init: init, getState: getState, setTimezone: setTimezone, setSunriseSunset: setSunriseSunset };
  })();


  // ═══════════════════════════════════════════════════════════════════════════
  // 2. SBE.WorldWeather
  //    Open-Meteo (free, no key). Polls every 10 min. Emits world:weatherChanged.
  //    Fallback: textual condition when no icon available.
  // ═══════════════════════════════════════════════════════════════════════════
  (function setup_WorldWeather() {
    // WMO weather code → condition / day+night icon
    var WMO = {
      0:  { condition: "Clear",          icon: { day: "☀",  night: "🌙" } },
      1:  { condition: "Mainly Clear",   icon: { day: "🌤", night: "🌙" } },
      2:  { condition: "Partly Cloudy",  icon: { day: "⛅", night: "⛅" } },
      3:  { condition: "Overcast",       icon: { day: "☁",  night: "☁"  } },
      45: { condition: "Fog",            icon: { day: "🌫", night: "🌫" } },
      48: { condition: "Icy Fog",        icon: { day: "🌫", night: "🌫" } },
      51: { condition: "Light Drizzle",  icon: { day: "🌦", night: "🌧" } },
      53: { condition: "Drizzle",        icon: { day: "🌦", night: "🌧" } },
      55: { condition: "Heavy Drizzle",  icon: { day: "🌧", night: "🌧" } },
      61: { condition: "Light Rain",     icon: { day: "🌦", night: "🌧" } },
      63: { condition: "Rain",           icon: { day: "🌧", night: "🌧" } },
      65: { condition: "Heavy Rain",     icon: { day: "🌧", night: "🌧" } },
      71: { condition: "Light Snow",     icon: { day: "❄",  night: "❄"  } },
      73: { condition: "Snow",           icon: { day: "❄",  night: "❄"  } },
      75: { condition: "Heavy Snow",     icon: { day: "❄",  night: "❄"  } },
      77: { condition: "Snow Grains",    icon: { day: "❄",  night: "❄"  } },
      80: { condition: "Rain Showers",   icon: { day: "🌦", night: "🌧" } },
      81: { condition: "Rain Showers",   icon: { day: "🌧", night: "🌧" } },
      82: { condition: "Heavy Showers",  icon: { day: "🌧", night: "🌧" } },
      85: { condition: "Snow Showers",   icon: { day: "❄",  night: "❄"  } },
      86: { condition: "Heavy Snow",     icon: { day: "❄",  night: "❄"  } },
      95: { condition: "Thunderstorm",   icon: { day: "⛈",  night: "⛈"  } },
      96: { condition: "Thunderstorm",   icon: { day: "⛈",  night: "⛈"  } },
      99: { condition: "Thunderstorm",   icon: { day: "⛈",  night: "⛈"  } },
    };

    var _state = {
      condition:     "—",
      temperatureF:  null,
      humidity:      null,
      windSpeed:     null,
      icon:          null,
      visibility:    null,
      cloudCover:    null,
      precipitation: null,
      wmoCode:       null,
      isNight:       false,
      lastFetch:     0,
    };

    var POLL_MS = 10 * 60 * 1000; // 10 min

    function _iconFor(code, isNight) {
      var e = WMO[code];
      if (!e) return null;
      return isNight ? e.icon.night : e.icon.day;
    }
    function _conditionFor(code) {
      return WMO[code] ? WMO[code].condition : ("Condition " + code);
    }

    function _parseSunHour(isoStr) {
      // "2026-05-19T05:42" → 5.7
      if (!isoStr) return null;
      var parts = isoStr.split("T")[1].split(":");
      return parseInt(parts[0], 10) + parseInt(parts[1], 10) / 60;
    }

    function init() {
      // ViewportLocationAuthority is now the sole weather data source.
      // WorldWeather is a state store + icon resolver that publishes world:weatherChanged.
      // No self-fetch, no polling — VLA drives all updates.
      if (_bus()) {
        _bus().on("viewport:locationChanged", function (evt) {
          var wx = evt.weather;
          if (!wx) return;

          var isNight = SBE.WorldClock ? SBE.WorldClock.getState().isNight : false;
          _state.temperatureF  = wx.temperatureF;
          _state.humidity      = wx.humidity;
          _state.windSpeed     = wx.windSpeed;
          _state.precipitation = wx.precipitation;
          _state.cloudCover    = wx.cloudCover;
          _state.visibility    = wx.visibility;
          _state.wmoCode       = wx.wmoCode;
          _state.condition     = _conditionFor(wx.wmoCode);
          _state.icon          = _iconFor(wx.wmoCode, isNight);
          _state.isNight       = isNight;
          _state.lastFetch     = Date.now();

          // Forward sunrise/sunset to WorldClock
          var riseH = _parseSunHour(wx.sunrise);
          var setH  = _parseSunHour(wx.sunset);
          if (riseH !== null && setH !== null && SBE.WorldClock) {
            SBE.WorldClock.setSunriseSunset(riseH, setH);
          }

          _emit("world:weatherChanged", { state: Object.assign({}, _state) });
          if (SBE.WorldAtmosphere) SBE.WorldAtmosphere.recompute();
        });

        // Day/night flip: update icon without re-fetching
        _bus().on("world:dayNightChanged", function (evt) {
          if (_state.wmoCode !== null) {
            _state.isNight = evt.isNight;
            _state.icon    = _iconFor(_state.wmoCode, evt.isNight);
            _emit("world:weatherChanged", { state: Object.assign({}, _state) });
          }
        });
      }

      console.log("[WorldWeather] initialized — consuming ViewportLocationAuthority");
    }

    function getState() { return Object.assign({}, _state); }
    // refresh: ask VLA to re-resolve the current viewport
    function refresh()  { if (SBE.ViewportLocationAuthority) SBE.ViewportLocationAuthority.forceUpdate(); }

    SBE.WorldWeather = { init: init, getState: getState, refresh: refresh };
  })();


  // ═══════════════════════════════════════════════════════════════════════════
  // 3. SBE.WorldMoonPhase
  //    Computed from date math — no API. Recomputes hourly.
  //    NOT decorative: future ecology, tides, nightlife will respond to this.
  // ═══════════════════════════════════════════════════════════════════════════
  (function setup_WorldMoonPhase() {
    var PHASES = [
      "New Moon", "Waxing Crescent", "First Quarter", "Waxing Gibbous",
      "Full Moon", "Waning Gibbous",  "Last Quarter",  "Waning Crescent",
    ];
    var ICONS = {
      "New Moon":        "🌑",
      "Waxing Crescent": "🌒",
      "First Quarter":   "🌓",
      "Waxing Gibbous":  "🌔",
      "Full Moon":       "🌕",
      "Waning Gibbous":  "🌖",
      "Last Quarter":    "🌗",
      "Waning Crescent": "🌘",
    };

    // Days since Jan 6 2000 new moon reference
    var EPOCH_MS = new Date(2000, 0, 6).getTime();
    var CYCLE    = 29.53058867;

    function _compute(date) {
      var days  = (date.getTime() - EPOCH_MS) / 86400000;
      var frac  = (days / CYCLE) % 1;
      if (frac < 0) frac += 1;

      var phaseIdx  = Math.round(frac * 8) % 8;
      var phase     = PHASES[phaseIdx];
      // Illumination: 0 at new moon, 1 at full, returns to 0
      var illum     = 1 - Math.abs(frac * 2 - 1);

      return {
        phase:        phase,
        icon:         ICONS[phase] || "🌙",
        illumination: Math.round(illum * 100) / 100,
        isFullMoon:   phase === "Full Moon",
        phaseFrac:    Math.round(frac * 1000) / 1000,
      };
    }

    var _state = null;

    function init() {
      _state = _compute(new Date());
      _emit("world:moonPhaseChanged", { state: Object.assign({}, _state) });
      // Hourly recompute — phase shifts slowly
      setInterval(function () {
        var fresh = _compute(new Date());
        if (fresh.phase !== _state.phase) {
          _state = fresh;
          _emit("world:moonPhaseChanged", { state: Object.assign({}, _state) });
        }
      }, 60 * 60 * 1000);
      console.log("[WorldMoonPhase]", _state.phase, _state.icon, "illum:", _state.illumination);
    }

    function getState() { return Object.assign({}, _state || _compute(new Date())); }

    SBE.WorldMoonPhase = { init: init, getState: getState };
  })();


  // ═══════════════════════════════════════════════════════════════════════════
  // 4. SBE.WorldCalendar
  //    NYC / USA civic rhythms. Influences soundtrack, traffic, district behavior.
  // ═══════════════════════════════════════════════════════════════════════════
  (function setup_WorldCalendar() {
    var FIXED = [
      { month: 1,  day: 1,  name: "New Year's Day" },
      { month: 7,  day: 4,  name: "Independence Day" },
      { month: 11, day: 11, name: "Veterans Day" },
      { month: 12, day: 25, name: "Christmas" },
      { month: 12, day: 26, name: "Boxing Day" },
    ];

    // Nth occurrence of weekday in a month (n=-1 = last)
    function _nthWeekday(y, m, wd, n) {
      var d;
      if (n > 0) {
        d = new Date(y, m - 1, 1);
        while (d.getDay() !== wd) d.setDate(d.getDate() + 1);
        d.setDate(d.getDate() + (n - 1) * 7);
      } else {
        d = new Date(y, m, 0);
        while (d.getDay() !== wd) d.setDate(d.getDate() - 1);
        d.setDate(d.getDate() + (n + 1) * 7);
      }
      return d;
    }

    function _floating(y) {
      var MON = 1, THU = 4;
      return [
        { d: _nthWeekday(y, 1,  MON, 3),  name: "MLK Day" },
        { d: _nthWeekday(y, 2,  MON, 3),  name: "Presidents Day" },
        { d: _nthWeekday(y, 5,  MON, -1), name: "Memorial Day" },
        { d: _nthWeekday(y, 9,  MON, 1),  name: "Labor Day" },
        { d: _nthWeekday(y, 10, MON, 2),  name: "Columbus Day" },
        { d: _nthWeekday(y, 11, THU, 4),  name: "Thanksgiving" },
        // NYC Marathon — first Sunday of November
        { d: _nthWeekday(y, 11, 0,   1),  name: "NYC Marathon" },
      ];
    }

    function _holiday(date) {
      var m = date.getMonth() + 1, d = date.getDate(), y = date.getFullYear();
      for (var i = 0; i < FIXED.length; i++) {
        if (FIXED[i].month === m && FIXED[i].day === d) return FIXED[i].name;
      }
      var fl = _floating(y);
      for (var j = 0; j < fl.length; j++) {
        var f = fl[j];
        if (f.d.getMonth() === date.getMonth() && f.d.getDate() === d) return f.name;
      }
      return null;
    }

    function _compute(date) {
      var dow       = date.getDay();
      var isWeekend = (dow === 0 || dow === 6);
      var holiday   = _holiday(date);
      var h         = date.getHours();

      return {
        holiday:        holiday,
        isWeekend:      isWeekend,
        civicIntensity: holiday ? 1.0 : isWeekend ? 0.65 : 0.35,
        nightlifeBias:  (h >= 22 || h < 4) ? 0.85 : (h >= 20 ? 0.5 : 0.2),
        tourismBias:    isWeekend || !!holiday ? 0.75 : 0.35,
      };
    }

    var _state = null;

    function init() {
      _state = _compute(new Date());
      _emit("world:calendarChanged", { state: Object.assign({}, _state) });
      setInterval(function () {
        _state = _compute(new Date());
        _emit("world:calendarChanged", { state: Object.assign({}, _state) });
      }, 60 * 60 * 1000);
      var note = _state.holiday ? ("● " + _state.holiday) : (_state.isWeekend ? "weekend" : "weekday");
      console.log("[WorldCalendar]", note, "civic:", _state.civicIntensity);
    }

    function getState() { return Object.assign({}, _state || _compute(new Date())); }

    SBE.WorldCalendar = { init: init, getState: getState };
  })();


  // ═══════════════════════════════════════════════════════════════════════════
  // 5. SBE.WorldAtmosphere
  //    Synthesizes all above into a cinematic mood descriptor.
  //    Drives WorldHUD tinting and future visual/audio systems.
  // ═══════════════════════════════════════════════════════════════════════════
  (function setup_WorldAtmosphere() {
    var _state = {
      mood:              "neutral",
      isNight:           false,
      fogDensity:        0,
      lightTemp:         "neutral",   // "warm" | "cool" | "neutral"
      tintColor:         "rgba(0,0,0,0)",
      ambientBrightness: 1.0,
      cloudiness:        0,
      moon:              null,
      calendar:          null,
    };

    function _recompute() {
      var clk  = SBE.WorldClock      ? SBE.WorldClock.getState()      : {};
      var wx   = SBE.WorldWeather    ? SBE.WorldWeather.getState()    : {};
      var moon = SBE.WorldMoonPhase  ? SBE.WorldMoonPhase.getState()  : {};
      var cal  = SBE.WorldCalendar   ? SBE.WorldCalendar.getState()   : {};

      var isNight = clk.isNight || false;
      var h       = clk.hour24  || 0;
      var cloud   = (wx.cloudCover || 0) / 100;
      var code    = wx.wmoCode || 0;
      var isRain  = code >= 51 && code <= 82;
      var isFog   = code === 45 || code === 48;
      var isSnow  = (code >= 71 && code <= 77) || (code >= 85 && code <= 86);
      var isStorm = code >= 95;

      // Mood string
      var mood;
      if      (isStorm)  mood = isNight ? "storm-night" : "storm-day";
      else if (isSnow)   mood = isNight ? "snow-night"  : "snow-day";
      else if (isFog)    mood = isNight ? "fog-night"   : "fog-morning";
      else if (isRain)   mood = isNight ? "rain-night"  : "rain-day";
      else if (isNight)  mood = moon.isFullMoon ? "full-moon" : "clear-night";
      else if (h < 7 || h >= 18) mood = "golden-hour";
      else               mood = cloud > 0.6 ? "overcast-day" : "clear-day";

      // Fog density
      var fog = isFog ? 0.70 : isStorm ? 0.30 : isRain ? 0.15 : 0;
      fog += cloud * 0.04;

      // Light temperature
      var lightTemp =
        (h >= 6 && h <= 8)   ? "warm"    // dawn
        : (h >= 17 && h <= 19) ? "warm"  // dusk
        : (isNight || isSnow)  ? "cool"
        : "neutral";

      // Tint
      var tint =
        (isNight && moon.illumination > 0.7) ? "rgba(80,100,160,0.09)"  // moonlit
        : isNight                             ? "rgba(10,12,30,0.16)"    // dark
        : (lightTemp === "warm")              ? "rgba(255,150,50,0.07)"  // golden
        : "rgba(0,0,0,0)";

      // Brightness
      var bright = isNight ? 0.65 : (h < 8 || h > 18 ? 0.82 : 1.0);
      if (isFog)   bright *= 0.85;
      if (isStorm) bright *= 0.75;

      Object.assign(_state, {
        mood, isNight, fogDensity: fog, lightTemp,
        tintColor: tint, ambientBrightness: bright,
        cloudiness: cloud, moon: moon, calendar: cal,
      });

      _emit("world:atmosphereChanged", { state: Object.assign({}, _state) });
    }

    function init() {
      if (_bus()) {
        _bus().on("world:clockTick",     _recompute);
        _bus().on("world:weatherChanged", _recompute);
        _bus().on("world:moonPhaseChanged", _recompute);
      }
      _recompute();
      console.log("[WorldAtmosphere] initialized");
    }

    function getState()  { return Object.assign({}, _state); }
    function recompute() { _recompute(); }

    SBE.WorldAtmosphere = { init: init, getState: getState, recompute: recompute };
  })();


  // ── Master init ────────────────────────────────────────────────────────────
  // Called by WorkspaceUI after WorldRuntime is ready.
  // Geographic binding: only runs if Workspace is in geo mode.
  function initAll() {
    if (!SBE.Workspace || !SBE.Workspace.isGeographicMode || !SBE.Workspace.isGeographicMode()) {
      console.log("[WorldAtmosphere] skipped — not a geographic workspace");
      return;
    }
    // Order matters: Clock + Weather subscribe to VLA before VLA fires its first event
    SBE.WorldClock.init();
    SBE.WorldWeather.init();
    SBE.WorldMoonPhase.init();
    SBE.WorldCalendar.init();
    SBE.WorldAtmosphere.init();
    // WorldLightingModel derives emotional state from atmosphere + Mapbox queries
    if (SBE.WorldLightingModel) SBE.WorldLightingModel.init();
    // VLA fires viewport:locationChanged last — all subscribers are ready
    if (SBE.ViewportLocationAuthority) SBE.ViewportLocationAuthority.init();
  }

  SBE.WorldAtmosphereSystem = { init: initAll };

})(window);
