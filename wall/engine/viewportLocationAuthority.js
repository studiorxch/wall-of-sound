(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── ViewportLocationAuthority (0520B_WOS_ViewportBoundAtmosphere_v1.0.0) ──
  //
  // The camera IS the environmental sensory organ of WOS.
  // Wherever the viewport center is = the authoritative world location.
  //
  // Pipeline:
  //   Mapbox Camera → Viewport Center → Geographic Resolution
  //   → Open-Meteo (weather + timezone=auto) + Nominatim (city name)
  //   → viewport:locationChanged → WorldClock / WorldWeather / WorldHUD
  //
  // Cache: 0.01° grid buckets (~1 km cells). No re-fetch for tiny drift.
  // Throttle: debounced 500ms after moveend.
  // Forbidden: static Brooklyn, world defaults, startup config.
  //
  // Event emitted:  viewport:locationChanged
  //   { location: ViewportLocationState, weather: raw weather data }

  var BUCKET = 0.01; // ~1 km resolution at mid-latitudes

  var _state = {
    longitude:   null,
    latitude:    null,
    city:        "—",
    region:      "—",
    country:     "—",
    timezone:    "UTC",
    lastUpdated: 0,
  };

  var _lastBktLat  = null;
  var _lastBktLng  = null;
  var _geoCache    = {};   // bucket-key → { city, region, country }
  var _pending     = false;
  var _debounce    = null;

  // ── Helpers ────────────────────────────────────────────────────────────────
  function _bus() { return SBE.WorkspaceEventBus; }

  function _bkt(v) { return Math.round(v / BUCKET) * BUCKET; }

  function _cacheKey(lat, lng) {
    return _bkt(lat).toFixed(2) + "," + _bkt(lng).toFixed(2);
  }

  function _bucketChanged(lat, lng) {
    return _bkt(lat) !== _lastBktLat || _bkt(lng) !== _lastBktLng;
  }

  function _mapCenter() {
    var mbr = SBE.MapboxViewportRuntime;
    if (mbr && mbr.isReady()) {
      var m = mbr.getMap();
      if (m) { var c = m.getCenter(); return { lat: c.lat, lng: c.lng }; }
    }
    // Bootstrap fallback — replaced once map is ready
    var w = SBE.WorldRuntime && SBE.WorldRuntime.getActiveWorld();
    return w && w.center
      ? { lat: w.center[1], lng: w.center[0] }
      : { lat: 40.678, lng: -73.944 };
  }

  function _parseSunHour(iso) {
    if (!iso) return null;
    var t = iso.split("T")[1].split(":");
    return parseInt(t[0], 10) + parseInt(t[1], 10) / 60;
  }

  // ── API fetches (parallel, independent failure) ────────────────────────────
  function _fetchWeather(lat, lng, cb) {
    var url = "https://api.open-meteo.com/v1/forecast"
      + "?latitude="  + lat.toFixed(4)
      + "&longitude=" + lng.toFixed(4)
      + "&current=temperature_2m,weathercode,wind_speed_10m,relative_humidity_2m,precipitation,cloud_cover,visibility"
      + "&daily=sunrise,sunset"
      + "&temperature_unit=fahrenheit"
      + "&timezone=auto";   // ← timezone resolved from coordinates by Open-Meteo

    window.fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var cur = d.current || {};
        cb(null, {
          timezone:      d.timezone || "UTC",
          wmoCode:       cur.weathercode,
          temperatureF:  Math.round(cur.temperature_2m),
          humidity:      cur.relative_humidity_2m,
          windSpeed:     cur.wind_speed_10m,
          precipitation: cur.precipitation,
          cloudCover:    cur.cloud_cover,
          visibility:    cur.visibility,
          sunrise:       d.daily && d.daily.sunrise && d.daily.sunrise[0],
          sunset:        d.daily && d.daily.sunset  && d.daily.sunset[0],
        });
      })
      .catch(function (e) { cb(e || new Error("weather fetch failed")); });
  }

  function _fetchGeocode(lat, lng, cb) {
    var key = _cacheKey(lat, lng);
    if (_geoCache[key]) { cb(null, _geoCache[key]); return; }

    var url = "https://nominatim.openstreetmap.org/reverse"
      + "?format=json&lat=" + lat.toFixed(4) + "&lon=" + lng.toFixed(4) + "&zoom=10";

    window.fetch(url, { headers: { "Accept-Language": "en" } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var a = d.address || {};
        var result = {
          city:    a.city || a.town || a.village || a.suburb || a.county || d.name || "—",
          region:  a.state || a.region || "—",
          country: a.country || "—",
        };
        _geoCache[key] = result;
        cb(null, result);
      })
      .catch(function (e) { cb(e || new Error("geocode failed")); });
  }

  // ── Resolution pipeline ────────────────────────────────────────────────────
  function _runPipeline(lat, lng) {
    if (_pending) return;
    _pending = true;

    var blat = _bkt(lat), blng = _bkt(lng);
    var wxData = null, geoData = null, done = 0;

    function _check() {
      if (++done < 2) return;
      _pending = false;
      if (!wxData) return; // weather is mandatory; geocode failure is non-fatal

      _state = {
        longitude:   lng,
        latitude:    lat,
        city:        geoData ? geoData.city    : _state.city,
        region:      geoData ? geoData.region  : _state.region,
        country:     geoData ? geoData.country : _state.country,
        timezone:    wxData.timezone,
        lastUpdated: Date.now(),
      };

      _lastBktLat = blat;
      _lastBktLng = blng;

      var bus = _bus();
      if (bus) {
        bus.emit("viewport:locationChanged", {
          source:    "ViewportLocationAuthority",
          timestamp: performance.now(),
          location:  Object.assign({}, _state),
          weather:   Object.assign({}, wxData),
        });
      }

      console.log("[VLA]", _state.city + ", " + _state.region,
        "·", _state.timezone, "·", wxData.temperatureF + "°F");
    }

    _fetchWeather(lat, lng, function (err, data) {
      if (!err) wxData = data;
      else console.warn("[VLA] weather:", err.message || err);
      _check();
    });

    _fetchGeocode(lat, lng, function (err, data) {
      if (!err) geoData = data;
      _check();
    });
  }

  // ── Camera event wiring ────────────────────────────────────────────────────
  function _onCameraChanged() {
    clearTimeout(_debounce);
    _debounce = setTimeout(function () {
      var c = _getAndCheck();
      if (c) _runPipeline(c.lat, c.lng);
    }, 500);
  }

  function _getAndCheck() {
    var c = _mapCenter();
    return _bucketChanged(c.lat, c.lng) ? c : null;
  }

  // ── Public ─────────────────────────────────────────────────────────────────
  function init() {
    var bus = _bus();
    if (bus) {
      bus.on("map:cameraChanged", _onCameraChanged);
      bus.on("map:ready", function () {
        // First authoritative resolve — map just became available
        var c = _mapCenter();
        _runPipeline(c.lat, c.lng);
      });
    }

    // If map is already ready, resolve now
    var mbr = SBE.MapboxViewportRuntime;
    if (mbr && mbr.isReady()) {
      var c = _mapCenter();
      _runPipeline(c.lat, c.lng);
    }

    console.log("[ViewportLocationAuthority] initialized — camera is the world sensor");
  }

  function getState()    { return Object.assign({}, _state); }
  function forceUpdate() {
    var c = _mapCenter();
    _lastBktLat = null; // clear bucket so _runPipeline won't be skipped
    _runPipeline(c.lat, c.lng);
  }

  SBE.ViewportLocationAuthority = { init: init, getState: getState, forceUpdate: forceUpdate };

})(window);
