(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── SurfacePersistence (0518F_WOS_RouteDocumentPersistence_v1.0.0) ─────────
  // localStorage-backed persistence for WOS surfaces.
  // Key format: wos.surface.{surfaceId}
  // Index key:  wos.surface.index  → [surfaceId, ...]
  //
  // Persistence is runtime-agnostic: it stores surface structure and
  // runtimeState, never renderer or simulation internals.

  var VERSION     = "0518F.1";
  var KEY_PREFIX  = "wos.surface.";
  var INDEX_KEY   = "wos.surface.index";

  function _emit(event, surfaceId, extra) {
    if (!SBE.WorkspaceEventBus) return;
    SBE.WorkspaceEventBus.emit(event, Object.assign({
      source:    "SurfacePersistence",
      timestamp: performance.now(),
      surfaceId: surfaceId,
    }, extra));
  }

  // ── Index management ──────────────────────────────────────────────────────
  function _getIndex() {
    try {
      return JSON.parse(localStorage.getItem(INDEX_KEY) || "[]");
    } catch (_) { return []; }
  }

  function _addToIndex(surfaceId) {
    var idx = _getIndex();
    if (idx.indexOf(surfaceId) === -1) {
      idx.push(surfaceId);
      localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
    }
  }

  function _removeFromIndex(surfaceId) {
    var idx = _getIndex().filter(function (id) { return id !== surfaceId; });
    localStorage.setItem(INDEX_KEY, JSON.stringify(idx));
  }

  // ── Serialization ──────────────────────────────────────────────────────────
  // Converts a workspace document (surface) into the canonical JSON shape.
  // The runtime's serialize() is called to capture runtimeState.
  function serializeSurface(doc) {
    var runtimeState = {};
    if (doc.runtime && typeof doc.runtime.serialize === "function") {
      try { runtimeState = doc.runtime.serialize(); } catch (_) {}
    }

    return {
      version: VERSION,
      surface: {
        id:        doc.surfaceId || doc.id,
        name:      doc.name,
        type:      doc.type,
        runtime:   doc.runtime && (doc.runtime.type || "unknown"),
        metadata:  doc.meta    || {},
        layers:    doc.layers  || [],
        runtimeState: runtimeState,
        createdAt: new Date(doc.createdAt || Date.now()).toISOString(),
        updatedAt: new Date().toISOString(),
      },
    };
  }

  // Reconstructs a surface-shaped object from serialized JSON.
  // Does NOT rehydrate the runtime — the workspace/runtime handles that.
  function deserializeSurface(json) {
    var data;
    try {
      data = typeof json === "string" ? JSON.parse(json) : json;
    } catch (e) {
      console.error("[SurfacePersistence] deserialize: invalid JSON", e);
      return null;
    }
    if (!data || data.version !== VERSION || !data.surface) {
      console.warn("[SurfacePersistence] deserialize: incompatible version or missing surface");
      return null;
    }
    return data.surface;
  }

  // ── Save / Load ────────────────────────────────────────────────────────────
  function saveSurface(doc) {
    if (!doc) return false;
    var surfaceId = doc.surfaceId || doc.id;
    try {
      var payload = JSON.stringify(serializeSurface(doc));
      localStorage.setItem(KEY_PREFIX + surfaceId, payload);
      _addToIndex(surfaceId);
      _emit("surface:saved", surfaceId);
      return true;
    } catch (e) {
      console.error("[SurfacePersistence] saveSurface failed:", e);
      return false;
    }
  }

  function loadSurface(surfaceId) {
    try {
      var raw = localStorage.getItem(KEY_PREFIX + surfaceId);
      if (!raw) return null;
      var surface = deserializeSurface(raw);
      if (surface) _emit("surface:loaded", surfaceId, { surface: surface });
      return surface;
    } catch (e) {
      console.error("[SurfacePersistence] loadSurface failed:", e);
      return null;
    }
  }

  function deleteSurface(surfaceId) {
    localStorage.removeItem(KEY_PREFIX + surfaceId);
    _removeFromIndex(surfaceId);
    _emit("surface:deleted", surfaceId);
  }

  function hasSaved(surfaceId) {
    return localStorage.getItem(KEY_PREFIX + surfaceId) !== null;
  }

  function listSavedIds() {
    return _getIndex();
  }

  // ── Export / Import ────────────────────────────────────────────────────────
  function exportSurface(doc, format) {
    format = format || "json";
    var data = serializeSurface(doc);

    if (format === "json") {
      var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      _downloadBlob(blob, (doc.name || "surface") + ".wos.json");
      _emit("surface:exported", doc.surfaceId || doc.id, { format: format });
      return;
    }

    if (format === "svg") {
      // Stub — SVG route export will be implemented when the render pipeline is ready
      console.warn("[SurfacePersistence] SVG export not yet implemented");
      return;
    }

    if (format === "png") {
      // Stub — PNG viewport capture will be implemented with the render pipeline
      console.warn("[SurfacePersistence] PNG export not yet implemented");
      return;
    }

    console.warn("[SurfacePersistence] unknown export format:", format);
  }

  function importSurface(json) {
    var surface = deserializeSurface(json);
    if (!surface) return null;
    _emit("surface:imported", surface.id, { surface: surface });
    return surface;
  }

  // ── Session snapshot ───────────────────────────────────────────────────────
  // Saves the entire workspace state (all surfaces + active ID) for auto-restore.
  var SESSION_KEY = "wos.session";

  function saveSession() {
    if (!SBE.Workspace) return;
    try {
      var docs = SBE.Workspace.getAllSurfaces();
      var active = SBE.Workspace.getActiveSurface();
      var snapshot = {
        version:         VERSION,
        activeSurfaceId: active ? (active.surfaceId || active.id) : null,
        surfaces:        docs.map(serializeSurface),
      };
      localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
    } catch (e) {
      console.error("[SurfacePersistence] saveSession failed:", e);
    }
  }

  function loadSession() {
    try {
      var raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      var snap = JSON.parse(raw);
      if (!snap || snap.version !== VERSION) return null;
      return snap;
    } catch (e) {
      console.error("[SurfacePersistence] loadSession failed:", e);
      return null;
    }
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  // ── Helper ─────────────────────────────────────────────────────────────────
  function _downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a   = document.createElement("a");
    a.href  = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.SurfacePersistence = {
    saveSurface:       saveSurface,
    loadSurface:       loadSurface,
    deleteSurface:     deleteSurface,
    hasSaved:          hasSaved,
    listSavedIds:      listSavedIds,
    serializeSurface:  serializeSurface,
    deserializeSurface:deserializeSurface,
    exportSurface:     exportSurface,
    importSurface:     importSurface,
    saveSession:       saveSession,
    loadSession:       loadSession,
    clearSession:      clearSession,
  };

})(window);
