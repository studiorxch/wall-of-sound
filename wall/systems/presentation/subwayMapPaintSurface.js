// SubwayMapPaintSurface v0.2.0
// Public β0.2 adapter: clean Subway controls over the existing Workspace and
// SurfaceDrawingRuntime authorities. This module owns no stroke or projection
// truth; it only routes PAINT / PAN / UNDO commands and Art Supply selection
// to those authorities.
//
// Map Art Supplies Integration V1: Level 1 is the persistent compact
// toolbar (PAN + the same five supplies Blackbook has: PENCIL / PEN /
// MARKER / MOP / SPRAY + ERASER + UNDO). Selecting a drawing supply reveals
// Level 2, a contextual COLOR/WIDTH/OPACITY strip for THAT supply only --
// it collapses back to Level 1 once the member picks PAN or another supply
// that doesn't need it (Eraser has no contextual options, same as
// Blackbook). Supply defaults come from `window.SBE.ArtSupplies` (the same
// PENCIL_SUPPLY/PEN_SUPPLY/MARKER_SUPPLY/MOP_SUPPLY/SPRAY_SUPPLY Blackbook
// uses) -- never a second set of hardcoded numbers.
(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = "0.2.0";
  var ROOT_ID = "subway-map-paint-controls";
  var _root = null;

  var DRAW_SUPPLIES = ["pencil", "pen", "marker", "mop", "spray"];
  var SUPPLY_LABELS = { pencil: "PENCIL", pen: "PEN", marker: "MARKER", mop: "MOP", spray: "SPRAY" };
  // Per-supply remembered Width/Opacity/Color, mirroring Blackbook's
  // supplySettings map -- switching supplies restores that supply's own
  // last-used values instead of leaking one supply's settings into another.
  var _supplySettings = null;

  function _workspace() { return SBE.Workspace || null; }
  function _drawing() { return SBE.SurfaceDrawingRuntime || null; }
  function _supplies() { return SBE.ArtSupplies || null; }
  function _subwayActive() {
    var surface = SBE.SubwayPresentationSurface;
    return !!(surface && surface.isActive && surface.isActive());
  }

  function _ensureSupplySettings() {
    if (_supplySettings) return _supplySettings;
    var supplies = _supplies();
    _supplySettings = {};
    DRAW_SUPPLIES.forEach(function (id) {
      var key = id.toUpperCase() + "_SUPPLY";
      var defaults = supplies && supplies[key] ? supplies[key].defaultSettings : { width: 6, opacity: 0.85 };
      var color = id === "pencil" ? "#171412" : id === "pen" ? "#101828" : id === "mop" ? "#1c6e6e" : id === "spray" ? "#e2572b" : "#d32852";
      _supplySettings[id] = { color: color, width: defaults.width, opacity: defaults.opacity };
    });
    return _supplySettings;
  }

  function _activeDrawSupply() {
    var drawing = _drawing();
    var brush = drawing && drawing.getBrush ? drawing.getBrush() : null;
    return brush && DRAW_SUPPLIES.indexOf(brush.supplyId) !== -1 ? brush.supplyId : null;
  }

  function _setMode(mode) {
    var workspace = _workspace();
    if (!workspace || (mode !== "draw" && mode !== "navigate")) return false;
    workspace.setInteractionMode(mode);
    _render();
    return true;
  }

  function _selectSupply(supplyId) {
    var drawing = _drawing();
    var workspace = _workspace();
    if (!drawing || !drawing.setBrush) return false;
    if (supplyId === "eraser") {
      drawing.setBrush({ supplyId: "eraser" });
    } else if (DRAW_SUPPLIES.indexOf(supplyId) !== -1) {
      var settings = _ensureSupplySettings()[supplyId];
      drawing.setBrush({ supplyId: supplyId, color: settings.color, width: settings.width, opacity: settings.opacity });
    } else {
      return false;
    }
    if (workspace) workspace.setInteractionMode("draw");
    _render();
    return true;
  }

  function _rememberCurrentSupplySettings() {
    var supplyId = _activeDrawSupply();
    if (!supplyId) return;
    var drawing = _drawing();
    var brush = drawing && drawing.getBrush ? drawing.getBrush() : null;
    if (!brush) return;
    var settings = _ensureSupplySettings()[supplyId];
    settings.color = brush.color;
    settings.width = brush.width;
    settings.opacity = brush.opacity;
  }

  function _applyOption(name, value) {
    var supplyId = _activeDrawSupply();
    if (!supplyId) return;
    var drawing = _drawing();
    if (!drawing || !drawing.setBrush) return;
    var patch = {};
    patch[name] = name === "width" ? Number(value) : name === "opacity" ? Number(value) : value;
    drawing.setBrush(patch);
    _rememberCurrentSupplySettings();
    _render();
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
    var level1 = ''
      + '<div class="subway-map-paint-level1" data-map-paint-level="1">'
      + '<button type="button" data-map-paint-mode="navigate">PAN</button>'
      + DRAW_SUPPLIES.map(function (id) {
          return '<button type="button" data-map-paint-supply="' + id + '">' + SUPPLY_LABELS[id] + '</button>';
        }).join("")
      + '<button type="button" data-map-paint-supply="eraser">ERASER</button>'
      + '<button type="button" data-map-paint-action="undo">UNDO</button>'
      + '</div>';
    var level2 = ''
      + '<div class="subway-map-paint-level2" data-map-paint-level="2" hidden>'
      + '<label>COLOR <input type="color" data-map-paint-option="color"></label>'
      + '<label>WIDTH <input type="range" min="1" max="48" step="1" data-map-paint-option="width"></label>'
      + '<label>OPACITY <input type="range" min="0.15" max="1" step="0.05" data-map-paint-option="opacity"></label>'
      + '</div>';
    _root.innerHTML = level1 + level2;
    _root.addEventListener("click", function (event) {
      var target = event.target && event.target.closest ? event.target.closest("button") : null;
      if (!target) return;
      var mode = target.getAttribute("data-map-paint-mode");
      if (mode) { _setMode(mode); return; }
      var supply = target.getAttribute("data-map-paint-supply");
      if (supply) { _selectSupply(supply); return; }
      if (target.getAttribute("data-map-paint-action") === "undo") _undo();
    });
    _root.addEventListener("input", function (event) {
      var option = event.target && event.target.getAttribute ? event.target.getAttribute("data-map-paint-option") : null;
      if (!option) return;
      _applyOption(option, event.target.value);
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

    var supplyId = _activeDrawSupply();
    root.querySelectorAll("[data-map-paint-mode]").forEach(function (button) {
      var selected = button.getAttribute("data-map-paint-mode") === mode && !supplyId;
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    root.querySelectorAll("[data-map-paint-supply]").forEach(function (button) {
      var id = button.getAttribute("data-map-paint-supply");
      var selected = mode === "draw" && (id === "eraser" ? (drawing && drawing.getBrush && drawing.getBrush().supplyId === "eraser") : id === supplyId);
      button.classList.toggle("is-active", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
    var undo = root.querySelector('[data-map-paint-action="undo"]');
    if (undo) undo.disabled = !strokes.length;

    // Level 2 contextual options: visible only while an actual drawing
    // supply (not Eraser, not PAN) is active -- collapses back to the
    // compact Level 1 toolbar otherwise, per the two-level interaction
    // model this task specifies.
    var level2 = root.querySelector('[data-map-paint-level="2"]');
    if (level2) {
      var showOptions = mode === "draw" && !!supplyId;
      level2.hidden = !showOptions;
      if (showOptions) {
        var brush = drawing.getBrush();
        var colorInput = level2.querySelector('[data-map-paint-option="color"]');
        var widthInput = level2.querySelector('[data-map-paint-option="width"]');
        var opacityInput = level2.querySelector('[data-map-paint-option="opacity"]');
        if (colorInput && global.document.activeElement !== colorInput) colorInput.value = brush.color;
        if (widthInput && global.document.activeElement !== widthInput) widthInput.value = String(brush.width);
        if (opacityInput && global.document.activeElement !== opacityInput) opacityInput.value = String(brush.opacity);
      }
    }
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
    selectSupply: _selectSupply,
    undo: _undo,
    getMode: function () {
      var workspace = _workspace();
      return workspace && workspace.getInteractionMode ? workspace.getInteractionMode() : null;
    },
    __test: { renderNow: _render, rootId: ROOT_ID },
  });
})(window);
