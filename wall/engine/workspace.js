(function initWorkspace(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Workspace Engine (0518_WOS_WorkspaceArchitecture_v1.0.0) ────────────────
  //
  // WOS is no longer a single runtime. It is a multi-document creative
  // environment. Each document has a type, a runtime context, and a persistent
  // identity. Documents live in tabs. The active document governs what the
  // canvas and inspector display.
  //
  // Document types
  //   route       — route / traffic world  (the live simulation)
  //   canvas      — freeform canvas / symbol layout
  //   soundscape  — audio / sample mapping
  //   world       — world parameters, ecology settings, lighting
  //
  // Sidebar contexts (lower-left icon strip)
  //   world       — world ecology sidebar
  //   layers      — layer visibility
  //   sequences   — sequence / automation lanes
  //   assets      — asset library
  //   settings    — workspace settings
  //   help        — help & docs

  // ── Document type metadata ─────────────────────────────────────────────────
  // Resolved from SBE.DocumentRegistry — do not hardcode type branches here.

  var SIDEBAR_CONTEXTS = ["world", "zones", "routes", "layers", "sequences", "assets", "settings", "help"];

  // ── Internal state ─────────────────────────────────────────────────────────
  var _docs        = [];        // ordered array of document objects
  var _activeId    = null;      // id of currently active document
  var _sidebarCtx  = "world";   // active sidebar context key
  var _nextId      = 1;
  // Geographic workspace flag — once init'd as geo, never falls back to legacy
  var _isGeographic = true;

  var _interactionMode = "navigate"; // "navigate" | "draw" | "route-edit"

  var _bus = function() { return SBE.WorkspaceEventBus; };

  function _emit(event, payload) {
    var full = Object.assign({ source: "Workspace", timestamp: performance.now() }, payload);
    _bus().emit(event, full);
    // Compat alias: workspace:surfacesChanged ↔ workspace:tabsChanged
    if (event === "workspace:surfacesChanged") _bus().emit("workspace:tabsChanged", full);
    if (event === "workspace:tabsChanged")     _bus().emit("workspace:surfacesChanged", full);
  }

  // ── Surface (document) factory ────────────────────────────────────────────
  // Internal: still called _makeDoc for backward compat, but surfaces are
  // now the canonical term. Anchor and transform come from SurfaceModel.
  function _makeDoc(type, name, opts) {
    var meta = SBE.DocumentRegistry.get(type);
    if (!meta) throw new Error("[Workspace] unknown surface type: " + type);
    var _id = _nextId++;
    var doc = {
      id:        "doc-" + _id,
      surfaceId: SBE.ID ? SBE.ID.create() : ("surf-" + Date.now()),
      type:      type,
      name:      name || ("Surface " + _id),
      accent:    meta.accent,
      icon:      meta.icon,
      modified:  false,
      createdAt: Date.now(),
      runtime:   null,          // set by RuntimeManager when attached
      layers:         [],
      overlayObjects: [],  // SurfaceDrawingRuntime strokes/shapes
      anchor:    SBE.SurfaceModel ? SBE.SurfaceModel.defaultAnchor(type) : { type: "free" },
      transform: SBE.SurfaceModel ? SBE.SurfaceModel.createTransform()   : {},
      meta:      opts || {},
    };
    return doc;
  }

  // ── Surface lifecycle ──────────────────────────────────────────────────────
  // Canonical API uses "Surface" naming. "Document" methods remain as aliases.
  function createSurface(type, name, opts) {
    var doc = _makeDoc(type, name, opts);
    _docs.push(doc);
    _emit("surface:created", { surfaceId: doc.surfaceId, documentId: doc.id, surface: doc });
    _emit("workspace:surfacesChanged", { docs: _docs.slice(), surfaces: _docs.slice(), activeId: _activeId });
    return doc;
  }
  var createDocument = createSurface; // deprecated alias

  function openSurface(id) {
    var doc = _getById(id);
    if (!doc) { console.warn("[Workspace] openSurface: id not found:", id); return; }
    var prev = _activeId;
    _activeId = id;
    _emit("surface:opened", { surfaceId: doc.surfaceId, documentId: id, surface: doc, previousId: prev });
    _emit("workspace:surfacesChanged", { docs: _docs.slice(), surfaces: _docs.slice(), activeId: _activeId });
    return doc;
  }
  var openDocument = openSurface; // deprecated alias

  function closeSurface(id) {
    var idx = _docs.findIndex(function(d) { return d.id === id; });
    if (idx === -1) return;
    var closing = _docs[idx];

    // Destroy runtime state before removing from list
    if (closing.runtime && typeof closing.runtime.destroy === "function") {
      closing.runtime.destroy();
    }
    closing.runtime = null;

    _docs.splice(idx, 1);

    // If last surface was closed, immediately create a fresh geographic surface
    // so the workspace never has a null active surface (prevents legacy fallback rendering).
    if (_docs.length === 0) {
      var replacement = _makeDoc("route", "Surface 1", { isDefault: true });
      _docs.push(replacement);
      _emit("surface:created", { surfaceId: replacement.surfaceId, documentId: replacement.id, surface: replacement });
      _activeId = replacement.id;
      // Attach a fresh routePlanner runtime to the replacement surface
      var _replDescriptor = SBE.RuntimeRegistry ? SBE.RuntimeRegistry.get("routePlanner") : null;
      if (_replDescriptor) {
        var _replRt = _replDescriptor.create(replacement);
        RuntimeManager.register("routePlanner-" + replacement.id, _replRt);
        RuntimeManager.attachToDocument(replacement.id, "routePlanner-" + replacement.id);
      }
      _emit("surface:opened", { surfaceId: replacement.surfaceId, documentId: replacement.id, surface: replacement, previousId: id });
    } else if (_activeId === id) {
      var nextIdx = Math.min(idx, _docs.length - 1);
      _activeId = _docs[nextIdx].id;
      _emit("surface:opened", { surfaceId: _docs[nextIdx].surfaceId, documentId: _activeId, surface: _docs[nextIdx], previousId: id });
    }

    _emit("surface:closed", { surfaceId: closing.surfaceId, documentId: closing.id, surface: closing });
    _emit("workspace:surfacesChanged", { docs: _docs.slice(), surfaces: _docs.slice(), activeId: _activeId });
  }
  var closeDocument = closeSurface; // deprecated alias

  function duplicateSurface(id) {
    var src = _getById(id);
    if (!src) return;
    var copy = _makeDoc(src.type, src.name + " copy", JSON.parse(JSON.stringify(src.meta)));
    var idx = _docs.findIndex(function(d) { return d.id === id; });
    _docs.splice(idx + 1, 0, copy);
    _emit("surface:created", { surfaceId: copy.surfaceId, documentId: copy.id, surface: copy });
    _emit("workspace:surfacesChanged", { docs: _docs.slice(), surfaces: _docs.slice(), activeId: _activeId });
    return copy;
  }
  var duplicateDocument = duplicateSurface; // deprecated alias

  function renameSurface(id, name) {
    var doc = _getById(id);
    if (!doc) return;
    doc.name = name;
    doc.modified = true;
    _emit("surface:renamed", { surfaceId: doc.surfaceId, documentId: id, surface: doc, name: name });
    _emit("workspace:surfacesChanged", { docs: _docs.slice(), surfaces: _docs.slice(), activeId: _activeId });
  }
  var renameDocument = renameSurface; // deprecated alias

  function reorderTab(fromId, toId) {
    var fi = _docs.findIndex(function(d) { return d.id === fromId; });
    var ti = _docs.findIndex(function(d) { return d.id === toId; });
    if (fi === -1 || ti === -1 || fi === ti) return;
    var doc = _docs.splice(fi, 1)[0];
    _docs.splice(ti, 0, doc);
    _emit("workspace:surfacesChanged", { docs: _docs.slice(), activeId: _activeId });
  }

  function markModified(id) {
    var doc = _getById(id);
    if (doc) { doc.modified = true; _emit("workspace:surfacesChanged", { docs: _docs.slice(), activeId: _activeId }); }
  }

  function markSaved(id) {
    var doc = _getById(id);
    if (doc) { doc.modified = false; _emit("workspace:surfacesChanged", { docs: _docs.slice(), activeId: _activeId }); }
  }

  // ── Sidebar ────────────────────────────────────────────────────────────────
  function setSidebarContext(ctx) {
    if (SIDEBAR_CONTEXTS.indexOf(ctx) === -1) {
      console.warn("[Workspace] unknown sidebar context:", ctx);
      return;
    }
    var prev = _sidebarCtx;
    _sidebarCtx = ctx;
    _emit("sidebar:changed", { context: ctx, previousContext: prev });
  }

  function getSidebarContext() { return _sidebarCtx; }

  // ── Accessors ──────────────────────────────────────────────────────────────
  function getActiveSurface()  { return _activeId ? _getById(_activeId) : null; }
  var getActiveDocument = getActiveSurface; // deprecated alias

  function getAllSurfaces()    { return _docs.slice(); }
  var getAllDocuments = getAllSurfaces; // deprecated alias

  function getSurfaceById(id)  { return _getById(id); }
  var getDocumentById = getSurfaceById; // deprecated alias

  function getDocTypes() {
    var result = {};
    SBE.DocumentRegistry.list().forEach(function (d) { result[d.type] = d; });
    return result;
  }

  function getSidebarContexts() { return SIDEBAR_CONTEXTS.slice(); }

  function isGeographicMode() { return _isGeographic; }

  // ── Interaction mode ───────────────────────────────────────────────────────
  var INTERACTION_MODES = ["navigate", "select", "draw", "route-edit", "zone-edit"];

  function setInteractionMode(mode) {
    if (INTERACTION_MODES.indexOf(mode) === -1) {
      console.warn("[Workspace] unknown interaction mode:", mode);
      return;
    }
    var prev = _interactionMode;
    if (mode === prev) return;
    _interactionMode = mode;
    _emit("workspace:interactionModeChanged", { mode: mode, previousMode: prev });
  }

  function getInteractionMode() { return _interactionMode; }

  function _getById(id) {
    for (var i = 0; i < _docs.length; i++) {
      if (_docs[i].id === id) return _docs[i];
    }
    return null;
  }

  // ── RuntimeManager ─────────────────────────────────────────────────────────
  // Lightweight bridge: documents can request a named runtime object be
  // attached. The workspace tracks attachment; actual runtime boot is
  // handled externally (main.js / engine modules).
  var RuntimeManager = (function() {
    var _runtimes = {};

    function register(name, rt) {
      _runtimes[name] = rt;
      _emit("runtime:registered", { name: name, runtime: rt });
    }

    function get(name) { return _runtimes[name] || null; }

    function attachToDocument(docId, runtimeName) {
      var doc = _getById(docId);
      if (!doc) return;
      doc.runtime = _runtimes[runtimeName] || null;
      _emit("runtime:attached", { docId: docId, runtimeName: runtimeName, runtime: doc.runtime });
    }

    function listRuntimes() { return Object.keys(_runtimes); }

    return { register: register, get: get, attachToDocument: attachToDocument, listRuntimes: listRuntimes };
  })();

  // ── Serialization ──────────────────────────────────────────────────────────
  function serialize() {
    return {
      version:    "0518.1",
      activeId:   _activeId,
      sidebarCtx: _sidebarCtx,
      docs:       _docs.map(function(d) {
        return { id: d.id, type: d.type, name: d.name, modified: d.modified,
                 createdAt: d.createdAt, meta: d.meta };
      }),
    };
  }

  function deserialize(data) {
    if (!data || data.version !== "0518.1") {
      console.warn("[Workspace] deserialize: incompatible version or missing data");
      return;
    }
    _docs = [];
    _nextId = 1;
    data.docs.forEach(function(d) {
      var doc = _makeDoc(d.type, d.name, d.meta);
      doc.id        = d.id;
      doc.modified  = d.modified;
      doc.createdAt = d.createdAt;
      _docs.push(doc);
    });
    _activeId   = data.activeId;
    _sidebarCtx = data.sidebarCtx || "world";
    _emit("workspace:loaded",      { docs: _docs.slice(), surfaces: _docs.slice(), activeId: _activeId });
    _emit("workspace:surfacesChanged", { docs: _docs.slice(), surfaces: _docs.slice(), activeId: _activeId });
    _emit("sidebar:changed",       { context: _sidebarCtx, previousContext: null });
  }

  // ── Surface persistence helpers ────────────────────────────────────────────
  function saveSurface(id) {
    var doc = _getById(id) || getActiveDocument();
    if (!doc || !SBE.SurfacePersistence) return false;
    var ok = SBE.SurfacePersistence.saveSurface(doc);
    if (ok) markSaved(doc.id);
    return ok;
  }

  function saveSession() {
    if (SBE.SurfacePersistence) SBE.SurfacePersistence.saveSession();
  }

  // getSurfaces is an alias for getAllSurfaces (both return _docs.slice())
  function getSurfaces() { return _docs.slice(); }

  // ── Default init ───────────────────────────────────────────────────────────
  // Tries to restore the last saved session first; falls back to a fresh
  // default route document if no saved state is found.
  function initDefault() {
    if (_docs.length > 0) return;  // idempotent

    // Attempt session restore — only valid geographic surfaces are restored.
    // Legacy non-route surfaces and stale runtimeState (old corridor routes) are discarded.
    var VALID_GEO_TYPES = ["route", "world"];
    if (SBE.SurfacePersistence) {
      var session = SBE.SurfacePersistence.loadSession();
      var validSurfaces = session && Array.isArray(session.surfaces)
        ? session.surfaces.filter(function (s) {
            return VALID_GEO_TYPES.indexOf(s.type || "route") !== -1;
          })
        : [];
      if (validSurfaces.length > 0) {
        validSurfaces.forEach(function (surf) {
          var doc = _makeDoc(surf.type || "route", surf.name, surf.metadata || {});
          doc.surfaceId = surf.id || doc.surfaceId;
          doc.createdAt = surf.createdAt ? new Date(surf.createdAt).getTime() : doc.createdAt;
          _docs.push(doc);
          _emit("surface:created", { surfaceId: doc.surfaceId, documentId: doc.id, surface: doc });

          var descriptor = SBE.RuntimeRegistry.get("routePlanner");
          if (descriptor) {
            // Strip legacy waypoint routes from runtimeState — routes now come from RouteInputSystem
            var cleanState = surf.runtimeState || {};
            if (cleanState.routes && cleanState.routes.length) {
              console.log("[Workspace] discarding", cleanState.routes.length,
                "legacy waypoint route(s) from persisted state for surface:", surf.name);
              cleanState = Object.assign({}, cleanState, { routes: [], activeRouteId: null });
            }
            doc.meta.runtimeState = cleanState;
            var rtInstance = descriptor.create(doc);
            RuntimeManager.register("routePlanner-" + doc.id, rtInstance);
            RuntimeManager.attachToDocument(doc.id, "routePlanner-" + doc.id);
          }
        });

        // Restore active surface
        var activeSurf = session.activeSurfaceId
          ? _docs.find(function (d) { return d.surfaceId === session.activeSurfaceId; })
          : null;
        if (activeSurf) {
          openDocument(activeSurf.id);
        } else if (_docs.length > 0) {
          openDocument(_docs[0].id);
        }
        _emit("workspace:surfacesChanged", { docs: _docs.slice(), activeId: _activeId });
        console.log("[Workspace] session restored —", _docs.length, "geographic surface(s)");
        return;
      }
    }

    // Fresh start
    var world = createSurface("route", "Surface 1", { isDefault: true });
    openSurface(world.id);

    var descriptor = SBE.RuntimeRegistry.get("routePlanner");
    var rtInstance = descriptor ? descriptor.create(world) : { name: "routePlanner", active: true };
    RuntimeManager.register("routePlanner", rtInstance);
    RuntimeManager.attachToDocument(world.id, "routePlanner");

    console.log("[Workspace] initDefault — clean geographic surface:", world.id);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.Workspace = {
    // Surface lifecycle (canonical)
    createSurface:    createSurface,
    openSurface:      openSurface,
    closeSurface:     closeSurface,
    duplicateSurface: duplicateSurface,
    renameSurface:    renameSurface,
    reorderTab:       reorderTab,
    markModified:     markModified,
    markSaved:        markSaved,

    // Surface accessors (canonical)
    getActiveSurface:  getActiveSurface,
    getAllSurfaces:     getAllSurfaces,
    getSurfaceById:    getSurfaceById,
    getSurfaces:       getAllSurfaces,
    getDocTypes:       getDocTypes,
    getSidebarContexts: getSidebarContexts,
    isGeographicMode:      isGeographicMode,
    setInteractionMode:    setInteractionMode,
    getInteractionMode:    getInteractionMode,

    // Persistence
    saveSurface:  saveSurface,
    saveSession:  saveSession,

    // Deprecated document aliases (preserved for compat)
    createDocument:    createDocument,
    openDocument:      openDocument,
    closeDocument:     closeDocument,
    duplicateDocument: duplicateDocument,
    renameDocument:    renameDocument,
    getActiveDocument: getActiveDocument,
    getAllDocuments:    getAllDocuments,
    getDocumentById:   getDocumentById,

    // Sidebar
    setSidebarContext: setSidebarContext,
    getSidebarContext: getSidebarContext,

    // Runtime
    RuntimeManager: RuntimeManager,

    // Serialization
    serialize:   serialize,
    deserialize: deserialize,

    // Init
    initDefault: initDefault,

    // Events — subscribe via SBE.WorkspaceEventBus directly
    on:  function(e, fn) { return SBE.WorkspaceEventBus.on(e, fn); },
    off: function(e, fn) { return SBE.WorkspaceEventBus.off(e, fn); },
  };

  // ── Legacy alias policy (0518H) ────────────────────────────────────────────
  // Temporary compat shim — removal target: 0525 sprint.
  SBE.LegacyAliases = {
    enabled:       true,
    removalTarget: "0525",
    aliases: {
      "createDocument":  "createSurface",
      "openDocument":    "openSurface",
      "closeDocument":   "closeSurface",
      "getAllDocuments":  "getAllSurfaces",
      "getActiveDocument": "getActiveSurface",
      "workspace:tabsChanged": "workspace:surfacesChanged",
    },
  };

})(window);
