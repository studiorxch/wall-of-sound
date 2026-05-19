(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── WorldHUD (0520B_WOS_ViewportBoundAtmosphere_v1.0.0) ──────────────────
  //
  // Atmospheric glass overlay — smart-glass instrumentation, not telemetry.
  // Placement: upper-RIGHT, independent of sidebar chrome.
  //
  // Location is VIEWPORT-BOUND: wherever the camera looks = the world location.
  // Updates dynamically on viewport:locationChanged (camera pan/zoom settle).
  //
  // Layout:
  //   🌙  74°              ← icon + temp (large)
  //   Tue · 12:56 AM      ← weekday · time
  //   Brooklyn, NY        ← live viewport location

  var _hud  = null;
  var _els  = {};

  function init() {
    var canvasArea = document.querySelector(".canvas-area");
    if (!canvasArea) return;
    if (document.getElementById("world-hud")) return; // idempotent

    _hud = document.createElement("div");
    _hud.id = "world-hud";
    _hud.setAttribute("aria-live", "polite");
    _hud.setAttribute("aria-label", "World atmosphere HUD");
    _hud.innerHTML =
      '<div class="hud-weather-line">' +
        '<span class="hud-icon" aria-hidden="true"></span>' +
        '<span class="hud-temp"></span>' +
      '</div>' +
      '<div class="hud-time-line">' +
        '<span class="hud-weekday"></span>' +
        '<span class="hud-sep" aria-hidden="true">·</span>' +
        '<span class="hud-time"></span>' +
      '</div>' +
      '<div class="hud-location"></div>';

    canvasArea.appendChild(_hud);

    _els = {
      icon:     _hud.querySelector(".hud-icon"),
      temp:     _hud.querySelector(".hud-temp"),
      weekday:  _hud.querySelector(".hud-weekday"),
      time:     _hud.querySelector(".hud-time"),
      location: _hud.querySelector(".hud-location"),
    };

    // Location starts from world default; overwritten by viewport:locationChanged
    var world = SBE.WorldRuntime && SBE.WorldRuntime.getActiveWorld();
    if (_els.location) _els.location.textContent = (world && world.location) || "";

    // Subscribe to world events
    var bus = SBE.WorkspaceEventBus;
    if (bus) {
      bus.on("world:clockTick",           _onClockTick);
      bus.on("world:weatherChanged",      _onWeather);
      bus.on("world:atmosphereChanged",   _onAtmosphere);
      bus.on("world:activated",           _onWorldActivated);
      // Viewport-bound location: update city/region whenever camera settles
      bus.on("viewport:locationChanged",  _onViewportLocation);
    }

    // Hydrate immediately from current state
    _hydrate();

    console.log("[WorldHUD] initialized");
  }

  function _hydrate() {
    if (SBE.WorldClock)   _onClockTick({ state: SBE.WorldClock.getState() });
    if (SBE.WorldWeather) _onWeather({ state: SBE.WorldWeather.getState() });
    if (SBE.WorldAtmosphere) _onAtmosphere({ state: SBE.WorldAtmosphere.getState() });
  }

  function _onClockTick(evt) {
    if (!_hud || !evt || !evt.state) return;
    var s = evt.state;
    if (_els.weekday) _els.weekday.textContent = s.weekdayShort || "";
    if (_els.time)    _els.time.textContent    = s.localTime    || "";
  }

  function _onWeather(evt) {
    if (!_hud || !evt || !evt.state) return;
    var s = evt.state;
    if (_els.icon) _els.icon.textContent = s.icon || "";
    if (_els.temp) {
      // Show temp if available; fall back to condition text
      _els.temp.textContent = s.temperatureF !== null
        ? s.temperatureF + "°"
        : (s.condition && s.condition !== "—" ? s.condition : "");
    }
  }

  function _onAtmosphere(evt) {
    if (!_hud || !evt || !evt.state) return;
    var s = evt.state;

    // Environmental tinting via CSS custom property
    _hud.style.setProperty("--hud-tint", s.tintColor || "rgba(0,0,0,0)");

    // Mood classes for typography/border adjustment
    _hud.className = "hud-mood-" + (s.mood || "neutral").replace(/[^a-z-]/g, "");
    _hud.classList.toggle("hud--night",  s.isNight);
    _hud.classList.toggle("hud--rainy",  s.mood && (s.mood.includes("rain") || s.mood.includes("storm")));
    _hud.classList.toggle("hud--snowy",  s.mood && s.mood.includes("snow"));
    _hud.classList.toggle("hud--foggy",  s.mood && s.mood.includes("fog"));
    _hud.classList.toggle("hud--golden", s.lightTemp === "warm" && !s.isNight);

    // Brightness modulation — subtle opacity shift to match world lighting
    _hud.style.opacity = s.isNight ? "0.85" : "1.0";
  }

  function _onWorldActivated(evt) {
    var world = evt && evt.world;
    if (_els.location) _els.location.textContent = (world && world.location) || "";
  }

  function _onViewportLocation(evt) {
    if (!_els.location || !evt || !evt.location) return;
    var loc = evt.location;
    var city   = loc.city   || "";
    var region = loc.region || "";
    // Format: "Brooklyn, New York" or just "Brooklyn" if no region
    _els.location.textContent = city + (region && region !== "—" ? ", " + region : "");
  }

  SBE.WorldHUD = { init: init };

})(window);
