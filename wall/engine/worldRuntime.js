(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── WorldRuntime (0520_WOS_WorldRuntimeArchitecture_v1.0.0) ───────────────
  //
  // The canonical authoritative root of the WOS spatial operating system.
  //
  // The user does NOT open a canvas. The user ENTERS A WORLD.
  //
  // Canonical runtime hierarchy:
  //
  //   WORLD
  //    ├── ZONES          — polygonal editable regions
  //    ├── SYSTEM LAYERS  — routes, graffiti, audio, ecology, motion, traffic
  //    ├── VISUALIZATION  — glass overlays, heatmaps, harmonic fields
  //    ├── TOOL LAYER     — temporary interaction modes (navigate/draw/route-edit)
  //    └── TELEMETRY      — toggleable developer/debug channel
  //
  // Ownership rules:
  //   World     → geography, projection, spatial coordinate system
  //   Zone      → polygonal region definition
  //   Route     → navigation
  //   Graffiti  → visual overlays
  //   Ecology   → simulation
  //   Tool      → input authority (temporary)
  //   Telemetry → debugging (separate visibility channel)

  var _worlds     = {};
  var _activeId   = null;
  var _layers     = [];
  var _zones      = [];
  var _nextLayerId = 1;
  var _nextZoneId  = 1;
  var _telemetry   = false;

  function _bus() { return SBE.WorkspaceEventBus; }
  function _emit(event, payload) {
    if (_bus()) _bus().emit(event, Object.assign(
      { source: "WorldRuntime", timestamp: performance.now() },
      payload
    ));
  }

  // ── World registration ────────────────────────────────────────────────────
  function registerWorld(descriptor) {
    if (!descriptor || !descriptor.id) throw new Error("[WorldRuntime] descriptor requires an id");
    _worlds[descriptor.id] = descriptor;
    _emit("world:registered", { world: descriptor });
    return descriptor;
  }

  function setActiveWorld(id) {
    var world = _worlds[id];
    if (!world) { console.warn("[WorldRuntime] unknown world:", id); return; }
    var prev  = _activeId;
    _activeId = id;
    _emit("world:activated", { world: world, previousId: prev });
    return world;
  }

  function getActiveWorld() {
    return _activeId ? (_worlds[_activeId] || null) : null;
  }

  function getWorlds() {
    return Object.values(_worlds);
  }

  // ── Layer registry ─────────────────────────────────────────────────────────
  // Layers = behavioral/visual strata operating INSIDE the world.
  // They NEVER own geography, projection, or camera authority.
  function registerLayer(descriptor) {
    var existing = _layers.find(function (l) { return l.id === descriptor.id; });
    if (existing) return existing; // idempotent by id

    var layer = Object.assign({
      id:      "layer-" + (_nextLayerId++),
      name:    "Layer",
      type:    "overlay",
      visible: true,
      locked:  false,
      zoneIds: [],
      runtime: null,
    }, descriptor);
    _layers.push(layer);
    _emit("world:layerRegistered", { layer: layer });
    return layer;
  }

  function getLayers() { return _layers.slice(); }

  function getLayer(id) {
    return _layers.find(function (l) { return l.id === id; }) || null;
  }

  function setLayerVisible(id, visible) {
    var l = getLayer(id);
    if (l) { l.visible = !!visible; _emit("world:layerChanged", { layer: l }); }
  }

  function setLayerLocked(id, locked) {
    var l = getLayer(id);
    if (l) { l.locked = !!locked; _emit("world:layerChanged", { layer: l }); }
  }

  // ── Zone registry ──────────────────────────────────────────────────────────
  // Zones = polygonal world regions, NOT rectangular artboards.
  // Zones may overlap, blend, inherit behaviors, and contain multiple systems.
  function createZone(opts) {
    var id = "zone-" + (_nextZoneId++);
    var zone = Object.assign({
      id:       id,
      name:     "Zone " + _nextZoneId,
      polygon:  null,   // GeoPolygon — set via zone editor
      visible:  true,
      locked:   false,
      systems:  [],
      metadata: {},
    }, opts || {});
    _zones.push(zone);
    _emit("world:zoneCreated", { zone: zone });
    return zone;
  }

  function getZones() { return _zones.slice(); }

  function getZone(id) {
    return _zones.find(function (z) { return z.id === id; }) || null;
  }

  function updateZone(id, patch) {
    var z = getZone(id);
    if (!z) return;
    Object.assign(z, patch);
    _emit("world:zoneChanged", { zone: z });
    return z;
  }

  function deleteZone(id) {
    var idx = _zones.findIndex(function (z) { return z.id === id; });
    if (idx === -1) return;
    var z = _zones.splice(idx, 1)[0];
    _emit("world:zoneDeleted", { zone: z });
  }

  // ── Projection authority ───────────────────────────────────────────────────
  // Mapbox IS the world renderer — not a background image, not an overlay texture.
  // All geographic projections are authoritative through this interface.
  function getProjectionAuthority() {
    return (SBE.MapboxViewportRuntime && SBE.MapboxViewportRuntime.isReady())
      ? SBE.MapboxViewportRuntime
      : null;
  }

  // ── Input authority ────────────────────────────────────────────────────────
  // Determines which system currently owns pointer/keyboard input.
  // Routing hierarchy: TOOL → SYSTEM → WORLD
  //
  //   navigate   → Mapbox (world) owns all input
  //   draw       → SurfaceDrawingRuntime owns input
  //   route-edit → active surface's routePlanner runtime owns input
  //   zone-edit  → zone editor owns input (future)
  //   select     → selection tool owns input (future)
  function getInputAuthority() {
    var mode = SBE.Workspace ? SBE.Workspace.getInteractionMode() : "navigate";
    switch (mode) {
      case "draw":
        return SBE.SurfaceDrawingRuntime || null;
      case "route-edit": {
        var surf = SBE.Workspace && SBE.Workspace.getActiveSurface();
        return (surf && surf.runtime) ? surf.runtime : null;
      }
      case "zone-edit":
        return null; // future: ZoneEditorRuntime
      case "select":
        return null; // future: SelectionRuntime
      case "navigate":
      default:
        return getProjectionAuthority();
    }
  }

  // ── Telemetry channel ──────────────────────────────────────────────────────
  // Telemetry is a SEPARATE visibility channel — never baked into world rendering.
  // Toggleable, color-coded, always visually distinct from production rendering.
  function isTelemetryEnabled() { return _telemetry; }

  function setTelemetry(enabled) {
    _telemetry = !!enabled;
    document.body.classList.toggle("ws-telemetry-active", _telemetry);
    _emit("world:telemetryChanged", { enabled: _telemetry });
  }

  function toggleTelemetry() { setTelemetry(!_telemetry); }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    // Register the canonical WOS world
    registerWorld({
      id:          "wos-world",
      name:        "Wall of Sound",
      description: "Brooklyn geographic simulation world",
      center:      [-73.944, 40.678],
      zoom:        12,
      projection:  "geographic",
      timezone:    "America/New_York",
      location:    "Brooklyn, NY",
      createdAt:   Date.now(),
    });
    setActiveWorld("wos-world");

    // Register canonical system layers in priority order
    registerLayer({ id: "layer-routes",   type: "route",    name: "Routes",   runtime: "RouteInputSystem" });
    registerLayer({ id: "layer-graffiti", type: "graffiti", name: "Graffiti", runtime: "SurfaceDrawingRuntime" });
    registerLayer({ id: "layer-audio",    type: "audio",    name: "Audio",    runtime: null });
    registerLayer({ id: "layer-ecology",  type: "ecology",  name: "Ecology",  runtime: null });
    registerLayer({ id: "layer-traffic",  type: "traffic",  name: "Traffic",  runtime: null });

    console.log("[WorldRuntime] initialized — world: wos-world · %d layers", _layers.length);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.WorldRuntime = {
    // World identity
    registerWorld:   registerWorld,
    setActiveWorld:  setActiveWorld,
    getActiveWorld:  getActiveWorld,
    getWorlds:       getWorlds,

    // Layer registry (behavioral/visual strata)
    registerLayer:   registerLayer,
    getLayers:       getLayers,
    getLayer:        getLayer,
    setLayerVisible: setLayerVisible,
    setLayerLocked:  setLayerLocked,

    // Zone registry (polygonal world regions)
    createZone:  createZone,
    getZones:    getZones,
    getZone:     getZone,
    updateZone:  updateZone,
    deleteZone:  deleteZone,

    // Authority
    getProjectionAuthority: getProjectionAuthority,
    getInputAuthority:      getInputAuthority,

    // Telemetry
    isTelemetryEnabled: isTelemetryEnabled,
    setTelemetry:       setTelemetry,
    toggleTelemetry:    toggleTelemetry,

    // Init
    init: init,
  };

})(window);
