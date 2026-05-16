// 0512_WOS_ViewportSystem_v1.0.0
// Viewport System — split resize, zoom, pan, canvas centering.
// Vanilla IIFE. Attaches to SBE.ViewportSystem.
// Load order: ... → viewportSystem.js (after DOM is ready)
//
// ═══════════════════════════════════════════════════════════════════════════
// FEATURES
//   F1 — Split resize: drag #split-handle to resize world/workbench split.
//          Default 62% world / 38% workbench. Min top 240px, min bottom 320px.
//          State persisted to _wos.state.ui.viewportSplit (px height of workbench).
//   F2 — Zoom controls: [-] 100% [+] + Fit buttons. Ctrl/Cmd+wheel.
//          Levels: 25 / 50 / 100 / 200 / 400 / Fit.
//          Transform applied to #engine-canvas (transform-origin: center center).
//   F3 — Pan: Spacebar + drag (Figma style). Grab/grabbing cursors.
//   F4 — Canvas centering: canvas-wrap is flex-centered in canvas-area,
//          independent of inspector and note-meter widths.
//   F5 — Transport always above fold: enforced by layout (transport-bar inside app-body).
// ═══════════════════════════════════════════════════════════════════════════

(function initViewportSystem(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── Constants ─────────────────────────────────────────────────────────────

  var ZOOM_LEVELS  = [0.25, 0.5, 1.0, 2.0, 4.0];
  var ZOOM_DEFAULT = 1.0;
  var MIN_WB_HEIGHT  = 320;   // px — workbench never shorter than this
  var MIN_TOP_HEIGHT = 240;   // px — world never shorter than this

  // ── State ─────────────────────────────────────────────────────────────────

  var _zoom = ZOOM_DEFAULT;
  var _panX = 0;            // translate X in unscaled canvas pixels
  var _panY = 0;
  var _wbHeight    = null;  // null = use CSS default (--symbol-workbench-height)
  var _splitActive = false;
  var _spaceDown   = false;
  var _panActive   = false;
  var _panOriginX  = 0;
  var _panOriginY  = 0;
  var _panBasePanX = 0;
  var _panBasePanY = 0;

  // ── Zoom ──────────────────────────────────────────────────────────────────

  function _applyTransform() {
    var canvas = document.getElementById("engine-canvas");
    if (!canvas) return;
    // translate is in pre-scale units so pan feels 1:1 regardless of zoom
    canvas.style.transform =
      "scale(" + _zoom + ") translate(" + _panX + "px, " + _panY + "px)";
    canvas.style.transformOrigin = "center center";
    _updateZoomLabel();
    _saveState();
  }

  function _updateZoomLabel() {
    var lbl = document.getElementById("vp-zoom-label");
    if (lbl) lbl.textContent = Math.round(_zoom * 100) + "%";
  }

  function zoomIn(pivotX, pivotY) {
    var next = ZOOM_LEVELS.find(function (z) { return z > _zoom + 0.001; });
    if (!next) return;
    _zoom = next;
    _applyTransform();
  }

  function zoomOut() {
    var copy = ZOOM_LEVELS.slice().reverse();
    var prev = copy.find(function (z) { return z < _zoom - 0.001; });
    if (!prev) return;
    _zoom = prev;
    _applyTransform();
  }

  function zoomFit() {
    _zoom = ZOOM_DEFAULT;
    _panX = 0;
    _panY = 0;
    _applyTransform();
  }

  function zoomTo(level) {
    _zoom = Math.max(0.125, Math.min(level, 8));
    _applyTransform();
  }

  // ── Ctrl/Cmd+wheel zoom ───────────────────────────────────────────────────

  function _initWheelZoom() {
    var cw = document.getElementById("canvas-wrap");
    if (!cw) return;
    cw.addEventListener("wheel", function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else              zoomOut();
    }, { passive: false });
  }

  // ── Spacebar pan ──────────────────────────────────────────────────────────

  function _initPan() {
    // Track spacebar — ignore when focus is inside a text field
    document.addEventListener("keydown", function (e) {
      if (e.code !== "Space") return;
      var t = e.target;
      if (t.matches("input, textarea, select, [contenteditable]")) return;
      if (!_spaceDown) {
        _spaceDown = true;
        var cw = document.getElementById("canvas-wrap");
        if (cw) cw.classList.add("is-panning");
      }
      e.preventDefault();
    });

    document.addEventListener("keyup", function (e) {
      if (e.code !== "Space") return;
      _spaceDown = false;
      var cw = document.getElementById("canvas-wrap");
      if (cw) {
        cw.classList.remove("is-panning");
        cw.classList.remove("is-panning-active");
      }
      if (_panActive) {
        _panActive = false;
        var cwEl = document.getElementById("canvas-wrap");
        if (cwEl) cwEl.releasePointerCapture && void 0;
      }
    });

    var canvasWrap = document.getElementById("canvas-wrap");
    if (!canvasWrap) return;

    canvasWrap.addEventListener("pointerdown", function (e) {
      if (!_spaceDown) return;
      _panActive = true;
      canvasWrap.setPointerCapture(e.pointerId);
      canvasWrap.classList.add("is-panning-active");
      _panOriginX  = e.clientX;
      _panOriginY  = e.clientY;
      _panBasePanX = _panX;
      _panBasePanY = _panY;
      e.preventDefault();
      e.stopPropagation();
    });

    canvasWrap.addEventListener("pointermove", function (e) {
      if (!_panActive) return;
      // Delta in screen pixels → convert to unscaled canvas pixels
      _panX = _panBasePanX + (e.clientX - _panOriginX) / _zoom;
      _panY = _panBasePanY + (e.clientY - _panOriginY) / _zoom;
      _applyTransform();
    });

    canvasWrap.addEventListener("pointerup", function () {
      if (!_panActive) return;
      _panActive = false;
      canvasWrap.classList.remove("is-panning-active");
    });
  }

  // ── Split resize (F1) ─────────────────────────────────────────────────────

  function applySplit(heightPx) {
    if (heightPx !== undefined && heightPx !== null) {
      _wbHeight = heightPx;
    }
    if (_wbHeight !== null) {
      document.documentElement.style.setProperty(
        "--symbol-workbench-height", _wbHeight + "px"
      );
    }
    _saveState();
  }

  function _initSplitDrag() {
    var handle = document.getElementById("split-handle");
    if (!handle) return;

    handle.addEventListener("pointerdown", function (e) {
      _splitActive = true;
      handle.setPointerCapture(e.pointerId);
      document.body.classList.add("split-dragging");
      e.preventDefault();
    });

    handle.addEventListener("pointermove", function (e) {
      if (!_splitActive) return;
      // New workbench height = distance from pointer to bottom of window
      var raw = window.innerHeight - e.clientY;
      raw = Math.max(MIN_WB_HEIGHT, Math.min(raw, window.innerHeight - MIN_TOP_HEIGHT - 4));
      applySplit(raw);
    });

    handle.addEventListener("pointerup", function () {
      _splitActive = false;
      document.body.classList.remove("split-dragging");
    });

    handle.addEventListener("pointercancel", function () {
      _splitActive = false;
      document.body.classList.remove("split-dragging");
    });
  }

  // ── Zoom button bindings ──────────────────────────────────────────────────

  function _initZoomButtons() {
    var btnIn  = document.getElementById("vp-zoom-in");
    var btnOut = document.getElementById("vp-zoom-out");
    var btnFit = document.getElementById("vp-zoom-fit");
    if (btnIn)  btnIn.addEventListener("click",  function () { zoomIn(); });
    if (btnOut) btnOut.addEventListener("click", function () { zoomOut(); });
    if (btnFit) btnFit.addEventListener("click", function () { zoomFit(); });
  }

  // ── State persistence ─────────────────────────────────────────────────────

  function _saveState() {
    var state = global._wos && global._wos.state;
    if (!state) return;
    if (!state.ui) state.ui = {};
    state.ui.worldZoom      = _zoom;
    state.ui.worldPanX      = _panX;
    state.ui.worldPanY      = _panY;
    state.ui.viewportSplit  = _wbHeight;
  }

  function _loadState() {
    var state = global._wos && global._wos.state;
    if (!state || !state.ui) return;
    if (typeof state.ui.worldZoom === "number") _zoom = state.ui.worldZoom;
    if (typeof state.ui.worldPanX === "number") _panX = state.ui.worldPanX;
    if (typeof state.ui.worldPanY === "number") _panY = state.ui.worldPanY;
    if (typeof state.ui.viewportSplit === "number") _wbHeight = state.ui.viewportSplit;
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    _loadState();
    _initSplitDrag();
    _initWheelZoom();
    _initPan();
    _initZoomButtons();
    _applyTransform();
    console.log("[WOS ViewportSystem] Loaded v1.0.0");
  }

  // ── Public API ────────────────────────────────────────────────────────────

  SBE.ViewportSystem = {
    init:       init,
    zoomIn:     zoomIn,
    zoomOut:    zoomOut,
    zoomFit:    zoomFit,
    zoomTo:     zoomTo,
    applySplit: applySplit,
    getZoom:    function ()  { return _zoom; },
    getPan:     function ()  { return { x: _panX, y: _panY }; },
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})(window);
