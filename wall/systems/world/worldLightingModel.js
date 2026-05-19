(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── WorldLightingModel (0520B_WOS_AtmosphericResponseLayer_v1.0.0) ────────
  //
  // Emotional lighting state for the geographic substrate.
  // Computes stable environmental values that the AtmosphereComposite
  // renderer consumes every frame.
  //
  // Responsibilities:
  //   - Road wetness coefficient (weather + time of day)
  //   - Road segment geometry cache (Mapbox query, debounced on camera change)
  //   - Ambient zone clusters (density-driven emotional geography)
  //   - Urban density estimate (road + POI feature count)
  //   - Drift intensity (how agitated the atmosphere is)
  //
  // Emits: world:lightingChanged
  //
  // Performance contract:
  //   - Road queries: debounced 650ms, capped at 50 segments
  //   - Zone recompute: triggered only on camera settle or atmosphere change
  //   - No per-frame API calls — compositor projects cached geo coords itself

  var _bus = function () { return SBE.WorkspaceEventBus; };

  // ── State ─────────────────────────────────────────────────────────────────
  var _state = {
    roadWetness:    0,      // 0–1: drive road reflectance rendering
    driftIntensity: 0.15,   // 0–1: how energised atmospheric drift is
    ambientZones:   [],     // [{cx,cy,radius,r,g,b,opacity,type,density}] screen-space
    roadSegments:   [],     // [{coords:[[lng,lat]...], type, strokeWidth}] geo-space
    urbanDensity:   0,      // 0–1: derived from road+POI feature density
    isNight:        false,
    lightTemp:      "neutral",
    mood:           "neutral",
  };

  // Latest raw atmosphere snapshot — updated on every world:atmosphereChanged
  var _atm = {
    fogDensity: 0, cloudiness: 0, ambientBrightness: 1.0,
    isNight: false, lightTemp: "neutral", mood: "neutral",
    humidity: 0,
  };

  var _zoneDebounce  = null;
  var _roadDebounce  = null;
  var _lastGridW     = 0;
  var _lastGridH     = 0;

  // ── Mapbox access ─────────────────────────────────────────────────────────
  function _mbr() {
    var mbr = SBE.MapboxViewportRuntime;
    return (mbr && mbr.isReady()) ? mbr : null;
  }

  function _map() {
    var mbr = _mbr();
    return mbr ? mbr.getMap() : null;
  }

  // ── Road layer identification ─────────────────────────────────────────────
  // Inspects the active Mapbox style to discover road layer IDs by convention.
  // Mapbox Standard / Streets styles use consistent naming patterns.
  var _roadLayerCache  = null;
  var _poiLayerCache   = null;

  function _discoverLayers() {
    if (_roadLayerCache) return;
    var map = _map();
    if (!map) return;
    try {
      var style  = map.getStyle();
      if (!style || !style.layers) return;
      var roads  = [];
      var pois   = [];
      style.layers.forEach(function (l) {
        var id = l.id || "";
        if (l.type === "line" &&
            (id.includes("road") || id.includes("street") ||
             id.includes("highway") || id.includes("motorway") ||
             id.includes("trunk") || id.includes("primary") ||
             id.includes("secondary"))) {
          // Classify road importance for stroke width
          var width = id.includes("motorway") || id.includes("trunk")  ? 3.5
                    : id.includes("primary")  || id.includes("highway") ? 2.5
                    : id.includes("secondary") || id.includes("street") ? 1.8
                    : 1.2;
          roads.push({ id: id, width: width });
        }
        if (l.type === "symbol" &&
            (id.includes("poi") || id.includes("transit") || id.includes("place-"))) {
          pois.push(id);
        }
      });
      _roadLayerCache = roads.slice(0, 24);   // cap layer count
      _poiLayerCache  = pois.slice(0, 12);
    } catch (e) { /* style not loaded yet */ }
  }

  // ── Road wetness ──────────────────────────────────────────────────────────
  // Combines rainfall, fog, humidity and night amplification.
  // Result is a smooth 0–1 value; compositor interprets as reflectance strength.
  function _computeRoadWetness(atm) {
    var mood   = atm.mood || "";
    var isRain = mood.includes("rain");
    var isFog  = mood.includes("fog");
    var isStorm = mood.includes("storm");

    var rainWeight = isStorm ? 1.0 : isRain ? 0.80 : 0;
    var fogWeight  = isFog  ? 0.55 : Math.min(0.4, (atm.fogDensity || 0) * 0.8);
    var wet = Math.max(rainWeight, fogWeight);

    // Night makes reflections far more visible — perceived wetness amplification
    if (atm.isNight && wet > 0) wet = Math.min(1.0, wet * 1.30);

    return wet;
  }

  // ── Drift intensity ───────────────────────────────────────────────────────
  // How "unsettled" the atmosphere feels. Scales cloud/fog drift amplitude.
  function _computeDriftIntensity(atm) {
    var mood = atm.mood || "";
    var base = 0.12;                                   // always a little alive
    var fog  = Math.max(0, (atm.fogDensity || 0) - 0.1) * 0.6;
    var rain = (mood.includes("rain") || mood.includes("storm")) ? 0.40 : 0;
    var cloud = Math.max(0, (atm.cloudiness || 0) - 0.3) * 0.35;
    return Math.min(1.0, base + fog + rain + cloud);
  }

  // ── Road segment cache ────────────────────────────────────────────────────
  // Queries Mapbox rendered features → extracts LineString coords.
  // Result stored in _state.roadSegments as raw geo arrays.
  // Compositor projects these per-frame via mbr.getMap().project().
  function _queryRoadSegments() {
    var map = _map();
    if (!map) { _state.roadSegments = []; return; }

    _discoverLayers();
    if (!_roadLayerCache || !_roadLayerCache.length) {
      _state.roadSegments = [];
      return;
    }

    var W = _lastGridW;
    var H = _lastGridH;
    if (!W || !H) {
      var ca = document.querySelector(".canvas-area");
      W = ca ? ca.offsetWidth  : window.innerWidth;
      H = ca ? ca.offsetHeight : window.innerHeight;
    }

    // Inset bbox — ignore extreme edges where features are half-clipped
    var bbox = [[W * 0.08, H * 0.08], [W * 0.92, H * 0.92]];
    var layerIds = _roadLayerCache.map(function (r) { return r.id; });
    var layerMap = {};
    _roadLayerCache.forEach(function (r) { layerMap[r.id] = r.width; });

    var features;
    try {
      features = map.queryRenderedFeatures(bbox, { layers: layerIds });
    } catch (e) {
      _state.roadSegments = [];
      return;
    }
    if (!features || !features.length) { _state.roadSegments = []; return; }

    // De-duplicate by id, cap total, extract coords
    var seen = {};
    var segments = [];
    for (var i = 0; i < features.length && segments.length < 50; i++) {
      var f   = features[i];
      var key = f.id != null ? f.id : i;
      if (seen[key]) continue;
      seen[key] = true;

      var geom   = f.geometry;
      if (!geom) continue;
      var lines  = geom.type === "LineString"      ? [geom.coordinates]
                 : geom.type === "MultiLineString"  ?  geom.coordinates
                 : null;
      if (!lines) continue;

      var layerId = f.layer && f.layer.id;
      var w = layerId && layerMap[layerId] ? layerMap[layerId] : 1.5;

      lines.forEach(function (coords) {
        if (!coords || coords.length < 2) return;
        // LOD: take every 2nd point on dense segments to keep projection budget low
        var sampled = [];
        var step = coords.length > 10 ? 2 : 1;
        for (var j = 0; j < coords.length; j += step) {
          sampled.push(coords[j]);
        }
        if (sampled.length >= 2) {
          segments.push({ coords: sampled, strokeWidth: w });
        }
      });
    }
    _state.roadSegments = segments;
  }

  // ── Ambient zone clusters ─────────────────────────────────────────────────
  // Uses a 3×3 grid of road feature density to generate up to 9 emotional
  // lighting pockets. Each cell with sufficient density becomes a zone.
  // Zone color and opacity are modulated by atmosphere state.
  function _computeAmbientZones(atm) {
    var map = _map();
    if (!map) { _state.ambientZones = []; return; }

    var ca = document.querySelector(".canvas-area");
    var W  = ca ? ca.offsetWidth  : window.innerWidth;
    var H  = ca ? ca.offsetHeight : window.innerHeight;
    _lastGridW = W;
    _lastGridH = H;

    // Query road + POI features for density estimation
    _discoverLayers();
    var roadIds = _roadLayerCache ? _roadLayerCache.map(function(r){return r.id;}) : [];
    var poiIds  = _poiLayerCache  || [];

    var roadFeats = [], poiFeats = [];
    try {
      var bbox = [[W * 0.05, H * 0.05], [W * 0.95, H * 0.95]];
      if (roadIds.length) roadFeats = map.queryRenderedFeatures(bbox, { layers: roadIds }) || [];
      if (poiIds.length)  poiFeats  = map.queryRenderedFeatures(bbox, { layers: poiIds  }) || [];
    } catch (e) { _state.ambientZones = []; return; }

    // Overall urban density
    _state.urbanDensity = Math.min(1,
      (roadFeats.length / 100) * 0.65 +
      (poiFeats.length  /  30) * 0.35
    );

    // Grid density: count road feature midpoints per cell
    var COLS = 3, ROWS = 3;
    var cW = W / COLS, cH = H / ROWS;
    var grid = new Array(COLS * ROWS).fill(0);

    // Project each road feature midpoint into a grid cell
    roadFeats.slice(0, 80).forEach(function (f) {
      var geom   = f.geometry;
      if (!geom) return;
      var coords = geom.type === "LineString" ? geom.coordinates
                 : geom.type === "MultiLineString" && geom.coordinates[0]
                   ? geom.coordinates[0] : null;
      if (!coords || !coords.length) return;
      var mid = coords[Math.floor(coords.length / 2)];
      if (!mid) return;
      try {
        var pt = map.project(mid);
        if (pt.x > 0 && pt.x < W && pt.y > 0 && pt.y < H) {
          var col = Math.min(COLS - 1, Math.floor(pt.x / cW));
          var row = Math.min(ROWS - 1, Math.floor(pt.y / cH));
          grid[row * COLS + col]++;
        }
      } catch (e) {}
    });

    // POI features boost grid cells too
    poiFeats.slice(0, 30).forEach(function (f) {
      var geom = f.geometry;
      if (!geom || geom.type !== "Point") return;
      var c = geom.coordinates;
      try {
        var pt = map.project(c);
        if (pt.x > 0 && pt.x < W && pt.y > 0 && pt.y < H) {
          var col = Math.min(COLS - 1, Math.floor(pt.x / cW));
          var row = Math.min(ROWS - 1, Math.floor(pt.y / cH));
          grid[row * COLS + col] += 0.5;
        }
      } catch (e) {}
    });

    var maxVal = Math.max.apply(null, grid.concat([1]));
    var zones  = [];

    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var d = grid[r * COLS + c] / maxVal;
        if (d < 0.12) continue;  // below threshold — not an ambient zone

        var cx     = (c + 0.5) * cW;
        var cy     = (r + 0.5) * cH;
        var radius = Math.max(cW, cH) * 0.80;  // soft, large, overlapping

        var zc = _zoneColor(d, atm);
        if (zc.opacity < 0.004) continue;

        zones.push({
          cx: cx, cy: cy, radius: radius,
          r: zc.r, g: zc.g, b: zc.b,
          opacity: zc.opacity,
          type: zc.type,
          density: d,
        });
      }
    }

    _state.ambientZones = zones;
  }

  // ── Zone color classification ─────────────────────────────────────────────
  // Derives emotional color from density + atmosphere.
  //   High density, night  → sodium amber / cyan city light
  //   High density, rain   → blue-grey reflective
  //   Low density, night   → cold suburban dark
  //   Day (all)            → near-invisible, slight warmth gradient
  function _zoneColor(density, atm) {
    var mood    = atm.mood || "";
    var isNight = atm.isNight;
    var isRain  = mood.includes("rain") || mood.includes("storm");
    var isFog   = mood.includes("fog");

    if (density > 0.60) {
      // Dense urban core
      if (isNight && isRain)  return { r: 90,  g: 115, b: 165, opacity: 0.055, type: "urban-wet"    };
      if (isNight && isFog)   return { r: 130, g: 140, b: 155, opacity: 0.045, type: "urban-fog"    };
      if (isNight)            return { r: 200, g: 145, b: 55,  opacity: 0.048, type: "urban-sodium"  };
      if (isRain)             return { r: 50,  g: 70,  b: 110, opacity: 0.022, type: "urban-wet-day" };
                              return { r: 255, g: 210, b: 120, opacity: 0.015, type: "urban-day"     };
    } else if (density > 0.30) {
      // Medium density — mixed residential / commercial
      if (isNight && isRain)  return { r: 70,  g: 90,  b: 130, opacity: 0.038, type: "mid-wet"      };
      if (isNight)            return { r: 160, g: 110, b: 50,  opacity: 0.032, type: "mid-sodium"    };
                              return { r: 0,   g: 0,   b: 0,   opacity: 0.006, type: "mid-day"       };
    } else {
      // Sparse — parks, water edges, suburban
      if (isNight)            return { r: 30,  g: 45,  b: 80,  opacity: 0.025, type: "sparse-night"  };
                              return { r: 0,   g: 0,   b: 0,   opacity: 0.003, type: "sparse-day"    };
    }
  }

  // ── Event handlers ────────────────────────────────────────────────────────
  function _onAtmosphere(evt) {
    if (!evt || !evt.state) return;
    _atm = evt.state;
    // Wetness and drift update immediately on atmosphere change
    _state.roadWetness    = _computeRoadWetness(_atm);
    _state.driftIntensity = _computeDriftIntensity(_atm);
    _state.isNight        = !!_atm.isNight;
    _state.lightTemp      = _atm.lightTemp  || "neutral";
    _state.mood           = _atm.mood       || "neutral";

    // Zones react to atmosphere change (rain/night transitions)
    clearTimeout(_zoneDebounce);
    _zoneDebounce = setTimeout(function () {
      _computeAmbientZones(_atm);
      _emit();
    }, 400);

    _emit();
  }

  function _onCameraChanged() {
    // Camera moved — road segments and zones are now stale
    clearTimeout(_roadDebounce);
    _roadDebounce = setTimeout(function () {
      _queryRoadSegments();
      _computeAmbientZones(_atm);
      _emit();
    }, 650);
  }

  function _emit() {
    var bus = _bus();
    if (!bus) return;
    bus.emit("world:lightingChanged", {
      source:    "WorldLightingModel",
      timestamp: performance.now(),
      state:     {
        roadWetness:    _state.roadWetness,
        driftIntensity: _state.driftIntensity,
        ambientZones:   _state.ambientZones.slice(),
        roadSegments:   _state.roadSegments,     // passed by ref — compositor reads, never mutates
        urbanDensity:   _state.urbanDensity,
        isNight:        _state.isNight,
        lightTemp:      _state.lightTemp,
        mood:           _state.mood,
      },
    });
  }

  // ── Public ────────────────────────────────────────────────────────────────
  function init() {
    var bus = _bus();
    if (bus) {
      bus.on("world:atmosphereChanged",  _onAtmosphere);
      bus.on("viewport:locationChanged", _onCameraChanged);
      bus.on("map:cameraChanged",        _onCameraChanged);
    }

    // Hydrate from current atmosphere state
    var atm = SBE.WorldAtmosphere && SBE.WorldAtmosphere.getState();
    if (atm) _atm = atm;
    _state.roadWetness    = _computeRoadWetness(_atm);
    _state.driftIntensity = _computeDriftIntensity(_atm);

    // Initial query — map may not be ready yet; if not, camera events will trigger
    setTimeout(function () {
      _queryRoadSegments();
      _computeAmbientZones(_atm);
      _emit();
    }, 800);

    console.log("[WorldLightingModel] initialized");
  }

  function getState() {
    return {
      roadWetness:    _state.roadWetness,
      driftIntensity: _state.driftIntensity,
      ambientZones:   _state.ambientZones.slice(),
      roadSegments:   _state.roadSegments,
      urbanDensity:   _state.urbanDensity,
      isNight:        _state.isNight,
      lightTemp:      _state.lightTemp,
      mood:           _state.mood,
    };
  }

  // Direct accessor for compositor hot path — no allocation
  function getRoadSegments() { return _state.roadSegments; }
  function getAmbientZones()  { return _state.ambientZones; }

  SBE.WorldLightingModel = {
    init:            init,
    getState:        getState,
    getRoadSegments: getRoadSegments,
    getAmbientZones: getAmbientZones,
  };

})(window);
