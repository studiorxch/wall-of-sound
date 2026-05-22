(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── SurfaceStateManager (0519_WOS_SurfaceStateManager_v1.0.0) ────────────
  //
  // Canonical runtime controller for persistent world surfaces.
  // Surfaces are living worlds — not tabs, not documents, not bookmarks.
  // Each surface owns: camera position, atmosphere snapshot, environment
  // profile, route state, audio profile, and systems configuration.
  //
  // Switching surfaces feels like tuning into another world, not opening a file.
  //
  // Events emitted (via WorkspaceEventBus):
  //   surface:created    — new surface registered with initial state
  //   surface:activated  — surface restore complete; world is live
  //   surface:updated    — state captured (camera, atmosphere, weather)
  //   surface:removed    — surface deleted, runtime cleaned up
  //
  // Phase 1: in-memory only. Phase 2: localStorage / cloud sync.
  // Serialization helpers are stubbed and future-safe.

  var _surfaces = {};   // docId → SurfaceState record
  var _activeId = null; // docId of current surface
  var _capturing = false; // debounce guard for captureActiveSurface

  function _bus() { return SBE.WorkspaceEventBus; }
  function _now() { return Date.now(); }

  // ── Mood → identity color ─────────────────────────────────────────────────
  // Each atmospheric mood maps to a canonical identity color.
  // Colors communicate environment class: blue=rain, purple=storm, amber=heat, etc.
  var MOOD_COLORS = {
    "rain-night":   "#4fc3f7",  // rain blue
    "rain-day":     "#64b5f6",  // rain blue (day)
    "storm-night":  "#7e57c2",  // electric purple
    "storm-day":    "#9575cd",  // electric purple (day)
    "fog-night":    "#78909c",  // blue-grey fog
    "fog-morning":  "#90a4ae",  // fog (morning)
    "snow-night":   "#b3e5fc",  // ice blue
    "snow-day":     "#b3e5fc",  // ice blue
    "golden-hour":  "#ffb74d",  // amber
    "clear-day":    "#81c784",  // green daylight
    "clear-night":  "#5c6bc0",  // deep blue night
    "full-moon":    "#ce93d8",  // lavender moonlight
    "overcast-day": "#78909c",  // steel overcast
    "neutral":      "#3dd8c5",  // teal (default)
  };

  function _colorForMood(mood) {
    return MOOD_COLORS[mood] || MOOD_COLORS["neutral"];
  }

  // ── SurfaceState factory ──────────────────────────────────────────────────
  function _defaultState(doc) {
    return {
      id:        doc.surfaceId || doc.id,
      docId:     doc.id,
      name:      doc.name,
      createdAt: doc.createdAt || _now(),
      updatedAt: _now(),

      camera: {
        lng:     -73.9857,
        lat:     40.7484,
        zoom:    13,
        pitch:   0,
        bearing: 0,
      },

      environment: {
        weather:        "clear",
        temperature:    null,
        cloudiness:     0,
        fogDensity:     0,
        roadWetness:    0,
        driftIntensity: 0,
        timezone:       "America/New_York",
        localTime:      null,
      },

      atmosphere: {
        tintColor:         [0, 0, 0],
        ambientBrightness: 1.0,
        cinematicLabel:    "",
        mood:              "neutral",
        isNight:           false,
      },

      identity: {
        color:      doc.accent || "#3dd8c5",
        avatar:     null,
        mood:       "neutral",
        visibility: "public",
        live:       false,
      },

      route: {
        enabled:     false,
        origin:      null,
        destination: null,
        progress:    0,
        autopilot:   false,
      },

      render: {
        styleId: null,
        overlays: {
          atmosphere: true,
          lighting:   true,
          geography:  true,
          traffic:    false,
        },
      },

      audio: {
        soundtrackProfile: null,
        volume:            0.82,
        reactive:          true,
      },

      systems: {
        ecology:   false,
        traffic:   false,
        actors:    false,
        broadcast: true,
      },

      metadata: {
        thumbnail: null,
        color:     doc.accent || "#3dd8c5",
        tags:      [],
      },
    };
  }

  // ── Camera snapshot ───────────────────────────────────────────────────────
  function _snapshotCamera() {
    var map = SBE.MapboxViewportRuntime && SBE.MapboxViewportRuntime.getMap
      ? SBE.MapboxViewportRuntime.getMap() : null;
    if (!map) return null;
    var c = map.getCenter();
    return {
      lng:     c.lng,
      lat:     c.lat,
      zoom:    map.getZoom(),
      pitch:   map.getPitch(),
      bearing: map.getBearing(),
    };
  }

  // ── Atmosphere snapshot ───────────────────────────────────────────────────
  function _snapshotAtmosphere() {
    var atm = SBE.WorldAtmosphere && SBE.WorldAtmosphere.getState();
    if (!atm) return null;
    return {
      tintColor:         atm.tintColor         || [0, 0, 0],
      ambientBrightness: atm.ambientBrightness  || 1.0,
      cinematicLabel:    atm.mood               || "neutral",
      mood:              atm.mood               || "neutral",
      isNight:           !!atm.isNight,
    };
  }

  // ── Environment snapshot ──────────────────────────────────────────────────
  function _snapshotEnvironment() {
    var wx  = SBE.WorldWeather && SBE.WorldWeather.getState();
    var atm = SBE.WorldAtmosphere && SBE.WorldAtmosphere.getState();
    var vla = SBE.ViewportLocationAuthority && SBE.ViewportLocationAuthority.getState();
    var lit = SBE.WorldLightingModel && SBE.WorldLightingModel.getState();
    var clk = SBE.WorldClock && SBE.WorldClock.getState();
    return {
      weather:        (wx  && wx.condition)       || "clear",
      temperature:    (wx  && wx.temperatureF)    || null,
      cloudiness:     (atm && atm.cloudiness)     || 0,
      fogDensity:     (atm && atm.fogDensity)     || 0,
      roadWetness:    (lit && lit.roadWetness)    || 0,
      driftIntensity: (lit && lit.driftIntensity) || 0,
      timezone:       (vla && vla.timezone)       || "UTC",
      localTime:      (clk && clk.localTime)      || null,
    };
  }

  // ── captureActiveSurface ──────────────────────────────────────────────────
  // Snapshots current world state into the active surface record.
  // Called: on camera moveend, on atmosphere/weather change, on route update.
  function captureActiveSurface() {
    if (!_activeId) return;
    var rec = _surfaces[_activeId];
    if (!rec) return;

    var cam = _snapshotCamera();
    if (cam) rec.camera = cam;

    var atmSnap = _snapshotAtmosphere();
    if (atmSnap) {
      rec.atmosphere = atmSnap;
      // Sync identity from live atmosphere so color ring reflects current mood
      rec.identity.mood  = atmSnap.mood;
      rec.identity.color = _colorForMood(atmSnap.mood);
    }

    rec.environment = _snapshotEnvironment();
    rec.updatedAt   = _now();

    _bus().emit("surface:updated", { id: rec.id, docId: rec.docId, state: rec });
  }

  // ── activateSurface ───────────────────────────────────────────────────────
  // Full switching sequence:
  //   1. Capture current surface state
  //   2. Resolve next surface record
  //   3. Open in Workspace (updates UI, sidebar, lower panel)
  //   4. Restore camera (flyTo with cinematic easing)
  //   5. Emit surface:activated
  function activateSurface(id) {
    if (id === _activeId) return; // already active

    // 1. Save current before leaving
    captureActiveSurface();

    // 2. Resolve record
    var rec = _surfaces[id];
    if (!rec) {
      console.warn("[SurfaceStateManager] activateSurface: no state record for id:", id);
      // Fall back to Workspace so UI stays consistent
      _activeId = id;
      SBE.Workspace.openSurface(id);
      return;
    }

    // 3. Suspend transitional systems
    //    Phase 1 stub — future: pause autopilot, audio fades, lerp transitions

    // 4. Open in Workspace — triggers workspace:surfacesChanged → rail refresh
    _activeId = id;
    SBE.Workspace.openSurface(rec.docId);

    // 5. Restore camera
    var map = SBE.MapboxViewportRuntime && SBE.MapboxViewportRuntime.getMap
      ? SBE.MapboxViewportRuntime.getMap() : null;
    if (map && rec.camera && rec.camera.lng !== undefined) {
      map.flyTo({
        center:   [rec.camera.lng, rec.camera.lat],
        zoom:     rec.camera.zoom,
        pitch:    rec.camera.pitch,
        bearing:  rec.camera.bearing,
        duration: 950,
        // ease-in-out quadratic — smooth but not sluggish
        easing: function (t) {
          return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        },
      });
    }

    // 6. Resume runtime — Phase 1: atmosphere/telemetry continue globally.
    //    Phase 2: restore per-surface atmosphere overrides here.

    // 7. Emit activated
    _bus().emit("surface:activated", {
      id:    rec.id,
      docId: rec.docId,
      name:  rec.name,
      state: rec,
    });

    console.log("[SurfaceStateManager] activated:", rec.name,
      "(" + (rec.camera.lng).toFixed(4) + ", " + (rec.camera.lat).toFixed(4) + ")" +
      " z" + (rec.camera.zoom).toFixed(1));
  }

  // ── createSurface ─────────────────────────────────────────────────────────
  // Creates a new surface through Workspace, initializes its state record
  // at the current camera position, and activates it.
  function createSurface(opts) {
    var name = opts && opts.name;
    var doc  = SBE.Workspace.createSurface("route", name);

    var rec = _defaultState(doc);

    // New surface inherits current camera view so it starts where you are
    var cam = _snapshotCamera();
    if (cam) rec.camera = cam;

    _surfaces[doc.id] = rec;

    activateSurface(doc.id);
    return doc;
  }

  // ── removeSurface ─────────────────────────────────────────────────────────
  function removeSurface(id) {
    var rec = _surfaces[id];
    if (rec) {
      delete _surfaces[id];
      _bus().emit("surface:removed", { id: rec.id, docId: rec.docId, name: rec.name });
    }
    SBE.Workspace.closeSurface(id);
  }

  // ── Accessors ─────────────────────────────────────────────────────────────
  function getSurface(id)    { return _surfaces[id] || null; }
  function getActiveSurface(){ return _surfaces[_activeId] || null; }
  function getActiveId()     { return _activeId; }

  // ── setIdentity ───────────────────────────────────────────────────────────
  function setIdentity(id, patch) {
    var rec = _surfaces[id];
    if (!rec) return;
    Object.assign(rec.identity, patch);
    rec.updatedAt = _now();
    _bus().emit("surface:updated", { id: rec.id, docId: rec.docId, state: rec });
  }

  // ── Serialization ─────────────────────────────────────────────────────────
  function serializeSurface(id) {
    var rec = _surfaces[id];
    return rec ? JSON.parse(JSON.stringify(rec)) : null;
  }

  function deserializeSurface(data) {
    if (!data || !data.docId) return null;
    _surfaces[data.docId] = data;
    return data;
  }

  // ── Register Workspace docs that already exist at init time ───────────────
  function _registerExisting() {
    var docs = SBE.Workspace.getAllSurfaces();
    docs.forEach(function (doc) {
      if (!_surfaces[doc.id]) {
        _surfaces[doc.id] = _defaultState(doc);
      }
    });
    var active = SBE.Workspace.getActiveSurface();
    if (active) _activeId = active.id;
  }

  // ── Hook Mapbox moveend ───────────────────────────────────────────────────
  // Attaches the camera-idle capture to the Mapbox map object.
  // Called after map is ready (may be deferred).
  function _hookMapCamera(map) {
    if (!map || map._ssm_hooked) return;
    map._ssm_hooked = true;
    map.on("moveend", function () {
      // Debounce: skip if we triggered the flyTo ourselves
      captureActiveSurface();
    });
  }

  // ── init ──────────────────────────────────────────────────────────────────
  function init() {
    if (!SBE.Workspace) {
      console.warn("[SurfaceStateManager] SBE.Workspace not available — aborting init");
      return;
    }

    _registerExisting();

    var bus = _bus();

    // Track externally-created surfaces
    bus.on("surface:created", function (evt) {
      var docId = evt.documentId;
      if (docId && !_surfaces[docId]) {
        var doc = SBE.Workspace.getSurfaceById(docId);
        if (doc) _surfaces[doc.id] = _defaultState(doc);
      }
    });

    // Sync _activeId when Workspace opens a surface externally
    // (do NOT re-run activateSurface — that would cause double flyTo)
    bus.on("surface:opened", function (evt) {
      if (evt.documentId && evt.documentId !== _activeId) {
        _activeId = evt.documentId;
      }
    });

    // Atmosphere and weather changes → capture current surface state
    bus.on("world:atmosphereChanged", captureActiveSurface);
    bus.on("world:weatherChanged",    captureActiveSurface);
    bus.on("routes:changed",          captureActiveSurface);

    // Hook map camera — try immediately, fall back to map:ready
    var map = SBE.MapboxViewportRuntime && SBE.MapboxViewportRuntime.getMap
      ? SBE.MapboxViewportRuntime.getMap() : null;
    if (map) {
      _hookMapCamera(map);
    } else {
      bus.on("map:ready", function () {
        var m = SBE.MapboxViewportRuntime && SBE.MapboxViewportRuntime.getMap
          ? SBE.MapboxViewportRuntime.getMap() : null;
        _hookMapCamera(m);
      });
    }

    console.log("[SurfaceStateManager] initialized —",
      Object.keys(_surfaces).length, "surface(s) registered");
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.SurfaceStateManager = {
    init:                 init,
    createSurface:        createSurface,
    activateSurface:      activateSurface,
    captureActiveSurface: captureActiveSurface,
    removeSurface:        removeSurface,
    getSurface:           getSurface,
    getActiveSurface:     getActiveSurface,
    getActiveId:          getActiveId,
    serializeSurface:     serializeSurface,
    deserializeSurface:   deserializeSurface,
    setIdentity:          setIdentity,
    moodColor:            _colorForMood,
  };

})(window);
