(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── MapboxViewportRuntime (0518E_WOS_MapboxViewport_v1.0.0) ───────────────
  // Singleton spatial layer. Manages the Mapbox GL JS map instance, coordinate
  // projection, camera synchronization, and style switching.
  //
  // The map renders in #mapbox-viewport beneath the WOS canvas.
  // All geographic coordinate conversion routes through this runtime.

  // ── Access token — resolved at runtime from wall/mapbox-env.js global ───
  // Set VITE_MAPBOX_TOKEN in wall-of-sound/.env.local and copy
  // wall/mapbox-env.template.js → wall/mapbox-env.js to populate the global.
  var ACCESS_TOKEN =
    (global.SBE && global.SBE.MapboxToken) || global.MAPBOX_TOKEN || "";

  // ── Map styles ────────────────────────────────────────────────────────────
  // operator:     Mapbox built-in dark-v11. Used for routing/infrastructure work.
  // presentation: StudioRich harbor night style. Default boot target for WOS.
  var STYLES = {
    operator:     "mapbox://styles/mapbox/dark-v11",
    presentation: "mapbox://styles/studiorich/cm3goyx23003901qkb60ff29p",
  };

  // ── Default camera — Harbor Bootstrap (0522A) ─────────────────────────────
  // Lower Manhattan waterfront: Battery Park / Upper Bay / Governors Island /
  // Buttermilk Channel / East River entrance. Cinematic harbor framing.
  var DEFAULT_CAMERA = {
    center: [-74.0165, 40.7015],
    zoom: 12.8,
    bearing: -12,
    pitch: 30,
  };

  var _map = null;
  var _container = null;
  var _presentationMode = true;   // WOS always boots into presentation style
  var _ready = false;
  var _readyCallbacks = [];

  // Style-load callbacks — fire on map.on('style.load'), well before tile decode.
  // Used by the boot sequencer to reveal the UI as soon as the basemap is visible.
  var _styleLoaded = false;
  var _styleLoadCallbacks = [];

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  function init(containerEl) {
    if (_map) return;
    if (!global.mapboxgl) {
      console.error("[MapboxViewportRuntime] mapboxgl not loaded");
      return;
    }
    if (!ACCESS_TOKEN) {
      console.warn(
        "[MapboxViewportRuntime] Mapbox token missing — set VITE_MAPBOX_TOKEN in wall-of-sound/.env.local"
      );
    }

    _container = containerEl;
    global.mapboxgl.accessToken = ACCESS_TOKEN;

    _map = new global.mapboxgl.Map({
      container: containerEl,
      style: _presentationMode ? STYLES.presentation : STYLES.operator,
      center: DEFAULT_CAMERA.center,
      zoom: DEFAULT_CAMERA.zoom,
      bearing: DEFAULT_CAMERA.bearing,
      pitch: DEFAULT_CAMERA.pitch,
      antialias: true,
      attributionControl: false,
      prefetchZoomDelta: 2,    // pre-fetch adjacent zoom levels for smoother tile transitions
      preserveDrawingBuffer: true,  // required for toDataURL() snapshots (WebGL clears buffer each frame by default)
    });

    // style.load — fires after the style JSON is applied, before tile decode.
    // This is the earliest moment the map is visually coherent (basemap colors,
    // water fills, land fills). Used to reveal the UI shell early.
    _map.on("style.load", function () {
      // Clear any fog/atmosphere baked into the style — custom styles can carry a fog
      // layer (e.g. a purple haze on the presentation style). WOS uses ThreeSkyLayer
      // for sky above the horizon and PredictiveTilePreloadRuntime for traversal haze.
      try { if (_map.setFog) _map.setFog(null); } catch (e) {}

      if (_styleLoaded) return; // guard re-entrant style switches
      _styleLoaded = true;
      var _t = performance.now();
      _styleLoadCallbacks.forEach(function (fn) {
        try { fn(_t); } catch (e) {}
      });
      _styleLoadCallbacks = [];
      console.log("[MapboxViewportRuntime] style.load — basemap visible at", Math.round(_t) + "ms");
    });

    _map.on("load", function () {
      _ready = true;
      _readyCallbacks.forEach(function (fn) {
        try {
          fn();
        } catch (e) {}
      });
      _readyCallbacks = [];
      if (SBE.WorkspaceEventBus) {
        SBE.WorkspaceEventBus.emit("map:ready", {
          source: "MapboxViewportRuntime",
          timestamp: performance.now(),
        });
      }
      console.log("[MapboxViewportRuntime] map ready (tiles) — style:",
        _presentationMode ? "presentation (" + STYLES.presentation + ")" : "operator (" + STYLES.operator + ")");
    });

    _map.on("error", function (e) {
      console.error(
        "[MapboxViewportRuntime] map error:",
        e.error && e.error.message,
      );
    });

    // Forward camera move events to event bus
    _map.on("move", function () {
      if (!SBE.WorkspaceEventBus) return;
      SBE.WorkspaceEventBus.emit("map:cameraMoved", {
        source: "MapboxViewportRuntime",
        timestamp: performance.now(),
      });
    });
    _map.on("moveend", function () {
      if (!SBE.WorkspaceEventBus) return;
      SBE.WorkspaceEventBus.emit("map:cameraChanged", {
        source: "MapboxViewportRuntime",
        timestamp: performance.now(),
        camera: getCamera(),
      });
    });
  }

  function destroy() {
    if (_map) {
      _map.remove();
      _map = null;
      _ready = false;
      _container = null;
    }
  }

  function resize() {
    if (_map) _map.resize();
  }

  function onReady(fn) {
    if (_ready) {
      fn();
      return;
    }
    _readyCallbacks.push(fn);
  }

  // onStyleLoad(fn) — fn(timestampMs) fires as soon as the style is applied.
  // Fires well before onReady (which waits for full tile decode).
  // If already fired, calls fn synchronously on the next tick.
  function onStyleLoad(fn) {
    if (_styleLoaded) {
      global.setTimeout(function () { try { fn(performance.now()); } catch (e) {} }, 0);
      return;
    }
    _styleLoadCallbacks.push(fn);
  }

  // ── Projection ─────────────────────────────────────────────────────────────
  // project(lngLat) → {x, y}  screen pixel coordinates
  // lngLat MUST be LngLatLike: [lng, lat] array or {lng, lat} object.
  // NEVER pass positional (lat, lng) args — Mapbox will throw LngLatLike error.
  function project(lngLat) {
    if (!_map || !_ready) return { x: 0, y: 0 };
    // Defensive: reject clearly invalid inputs before passing to Mapbox
    if (lngLat === null || lngLat === undefined) return { x: 0, y: 0 };
    if (typeof lngLat === 'number') {
      console.warn('[MapboxViewportRuntime] project() received a number — caller must pass [lng, lat] array');
      return { x: 0, y: 0 };
    }
    var pt = _map.project(lngLat);
    return { x: Math.round(pt.x), y: Math.round(pt.y) };
  }

  // unproject([x, y]) → {lng, lat}  geographic coordinates
  function unproject(point) {
    if (!_map || !_ready) return { lng: 0, lat: 0 };
    var ll = _map.unproject(point);
    return { lng: ll.lng, lat: ll.lat };
  }

  // ── Camera ─────────────────────────────────────────────────────────────────
  function setCamera(state) {
    if (!_map) return;
    _map.jumpTo({
      center: state.center || DEFAULT_CAMERA.center,
      zoom: state.zoom !== undefined ? state.zoom : DEFAULT_CAMERA.zoom,
      bearing:
        state.bearing !== undefined ? state.bearing : DEFAULT_CAMERA.bearing,
      pitch: state.pitch !== undefined ? state.pitch : DEFAULT_CAMERA.pitch,
    });
  }

  function getCamera() {
    if (!_map) return Object.assign({}, DEFAULT_CAMERA);
    var c = _map.getCenter();
    return {
      center: [c.lng, c.lat],
      zoom: _map.getZoom(),
      bearing: _map.getBearing(),
      pitch: _map.getPitch(),
    };
  }

  function flyTo(target) {
    if (!_map) return;
    _map.flyTo({
      center: target.center,
      zoom: target.zoom !== undefined ? target.zoom : _map.getZoom(),
      bearing:
        target.bearing !== undefined ? target.bearing : _map.getBearing(),
      pitch: target.pitch !== undefined ? target.pitch : _map.getPitch(),
      speed: target.speed || 1.2,
      curve: target.curve || 1.42,
      duration: target.duration,
    });
  }

  function fitBounds(bounds, opts) {
    if (!_map) return;
    _map.fitBounds(bounds, opts || { padding: 60 });
  }

  // ── Style / presentation mode ──────────────────────────────────────────────
  function setPresentationMode(enabled) {
    _presentationMode = !!enabled;
    if (!_map) return;
    var style = enabled ? STYLES.presentation : STYLES.operator;
    _map.setStyle(style);
    // Notify WOSMapStyleAuthority so Studio Map Lab syncs via cross-tab storage event
    var wsa = SBE.WOSMapStyleAuthority;
    if (wsa && typeof wsa.setActiveProfile === 'function') {
      wsa.setActiveProfile(enabled ? 'wos.dark.cyan' : 'wos.operator');
    }
    if (SBE.WorkspaceEventBus) {
      SBE.WorkspaceEventBus.emit("map:styleChanged", {
        source: "MapboxViewportRuntime",
        timestamp: performance.now(),
        mode: enabled ? "presentation" : "operator",
        style: style,
      });
    }
  }

  function isPresentationMode() {
    return _presentationMode;
  }
  function isReady() {
    return _ready;
  }
  function getMap() {
    return _map;
  }

  // ── Canvas overlays ────────────────────────────────────────────────────────
  // These are called by the runtime viewport router for canvas-layer drawing
  // that must be spatially aligned with the map (e.g. route lines, waypoints).

  function renderOperatorOverlay(ctx, options) {
    if (SBE.MapboxOperatorRenderer) {
      SBE.MapboxOperatorRenderer.render(ctx, options);
    }
  }

  function renderPresentationLayer(ctx, options) {
    if (SBE.MapboxPresentationRenderer) {
      SBE.MapboxPresentationRenderer.render(ctx, options);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.MapboxViewportRuntime = {
    init: init,
    destroy: destroy,
    resize: resize,
    onReady: onReady,
    onStyleLoad: onStyleLoad,

    project: project,
    unproject: unproject,

    setCamera: setCamera,
    getCamera: getCamera,
    flyTo: flyTo,
    fitBounds: fitBounds,

    setPresentationMode: setPresentationMode,
    isPresentationMode: isPresentationMode,

    isReady: isReady,
    getMap: getMap,

    renderOperatorOverlay: renderOperatorOverlay,
    renderPresentationLayer: renderPresentationLayer,
  };
})(window);
