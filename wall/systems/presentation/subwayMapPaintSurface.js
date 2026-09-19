// SubwayMapPaintSurface v0.1.0
// Public β0.2 adapter: clean Subway controls over the existing Workspace and
// SurfaceDrawingRuntime authorities. This module owns no stroke or projection
// truth; it only routes PAINT / PAN / UNDO commands to those authorities.
(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = "0.1.0";
  var ROOT_ID = "subway-map-paint-controls";
  var _root = null;

  function _workspace() { return SBE.Workspace || null; }
  function _drawing() { return SBE.SurfaceDrawingRuntime || null; }
  function _subwayActive() {
    var surface = SBE.SubwayPresentationSurface;
    return !!(surface && surface.isActive && surface.isActive());
  }

  function _setMode(mode) {
    var workspace = _workspace();
    if (!workspace || (mode !== "draw" && mode !== "navigate")) return false;
    workspace.setInteractionMode(mode);
    _render();
    return true;
  }

  function _undo() {
    var drawing = _drawing();
    var removed = drawing && drawing.undo ? drawing.undo() : null;
    _render();
    return removed;
  }

  function _ensureRoot() {
    if (_root || !global.document) return _root;
    _root = global.document.createElement("div");
    _root.id = ROOT_ID;
    _root.className = "subway-map-paint-controls";
    _root.setAttribute("aria-label", "Map creation controls");
    _root.innerHTML =
      '<button type="button" data-map-paint-mode="draw">PAINT</button>' +
      '<button type="button" data-map-paint-mode="navigate">PAN</button>' +
      '<button type="button" data-map-paint-action="undo">UNDO</button>';
    _root.addEventListener("click", function (event) {
      var target = event.target && event.target.closest ? event.target.closest("button") : null;
      if (!target) return;
      var mode = target.getAttribute("data-map-paint-mode");
      if (mode) { _setMode(mode); return; }
      if (target.getAttribute("data-map-paint-action") === "undo") _undo();
    });
    global.document.body.appendChild(_root);
    return _root;
  }

  function _render() {
    var root = _ensureRoot();
    if (!root) return;
    var active = _subwayActive();
    var workspace = _workspace();
    var drawing = _drawing();
    var mode = workspace && workspace.getInteractionMode ? workspace.getInteractionMode() : "navigate";
    var strokes = drawing && drawing.getStrokes ? drawing.getStrokes() : [];
    root.hidden = !active;
    root.querySelectorAll("[data-map-paint-mode]").forEach(function (button) {
      var selected = button.getAttribute("data-map-paint-mode") === mode;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    var undo = root.querySelector('[data-map-paint-action="undo"]');
    if (undo) undo.disabled = !strokes.length;
  }

  function _init() {
    _ensureRoot();
    var bus = SBE.WorkspaceEventBus;
    if (bus) {
      bus.on("workspace:interactionModeChanged", _render);
      bus.on("workspace:surfacesChanged", _render);
      bus.on("surface:opened", _render);
    }
    global.setInterval(_render, 250);
    _render();
  }

  try { _init(); } catch (error) {
    console.warn("[SubwayMapPaintSurface] init failed:", error && error.message || error);
  }

  SBE.SubwayMapPaintSurface = Object.freeze({
    VERSION: VERSION,
    enterPaint: function () { return _setMode("draw"); },
    enterPan: function () { return _setMode("navigate"); },
    undo: _undo,
    getMode: function () {
      var workspace = _workspace();
      return workspace && workspace.getInteractionMode ? workspace.getInteractionMode() : null;
    },
    __test: { renderNow: _render, rootId: ROOT_ID },
  });
})(window);
