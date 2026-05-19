(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── RuntimeViewportRouter (0518D_WOS_RuntimeViewportRouting_v1.0.0) ────────
  // Traffic controller between workspace, active runtime, viewport, and input.
  //
  // Responsibilities:
  //   • Resolve active runtime from active document
  //   • Delegate render calls (operator overlay / presentation layer)
  //   • Delegate update(dt) to runtime
  //   • Delegate pointer + keyboard input to runtime (guarded)
  //   • Expose getCameraTargets() as the canonical camera hint interface
  //
  // Rendering modes:
  //   "operator"      — editing infrastructure (handles, labels, metrics HUD)
  //   "presentation"  — cinematic/audience-facing only
  //
  // CONSTRAINT: This spec is delegation infrastructure only.
  // Do NOT move existing render logic here. Do NOT rewrite camera or renderers.

  var _mode = "operator"; // "operator" | "presentation"

  // ── Active runtime resolution ──────────────────────────────────────────────
  function getActiveRuntime() {
    if (!SBE.Workspace) return null;
    var doc = SBE.Workspace.getActiveDocument();
    return (doc && doc.runtime) ? doc.runtime : null;
  }

  // ── Mode ──────────────────────────────────────────────────────────────────
  function setMode(mode) {
    if (mode !== "operator" && mode !== "presentation") {
      console.warn("[RuntimeViewportRouter] unknown mode:", mode);
      return;
    }
    var prev = _mode;
    _mode = mode;
    if (SBE.WorkspaceEventBus) {
      SBE.WorkspaceEventBus.emit("viewport:modeChanged", {
        source: "RuntimeViewportRouter",
        timestamp: performance.now(),
        mode: mode,
        previousMode: prev,
      });
    }

    // Sync Mapbox style to presentation mode
    if (SBE.MapboxViewportRuntime) {
      SBE.MapboxViewportRuntime.setPresentationMode(mode === "presentation");
    }
  }

  function getMode() { return _mode; }

  // ── Update ────────────────────────────────────────────────────────────────
  function update(dt) {
    var rt = getActiveRuntime();
    if (rt && typeof rt.update === "function") {
      rt.update(dt);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  // Called from the main render loop with the world-space canvas context
  // (i.e. INSIDE the camera transform). Options are passed through to runtime.
  function render(ctx, options) {
    var rt = getActiveRuntime();
    if (!rt) return;

    if (_mode === "operator") {
      if (typeof rt.renderOperatorOverlay === "function") {
        ctx.save();
        rt.renderOperatorOverlay(ctx, options);
        ctx.restore();
      }
    } else {
      if (typeof rt.renderPresentationLayer === "function") {
        ctx.save();
        rt.renderPresentationLayer(ctx, options);
        ctx.restore();
      }
    }
  }

  // ── Camera targets ────────────────────────────────────────────────────────
  // Canonical interface for camera systems (curiosity, director, passenger).
  function getCameraTargets() {
    var rt = getActiveRuntime();
    if (rt && typeof rt.getCameraTargets === "function") {
      return rt.getCameraTargets();
    }
    return [];
  }

  // ── Input delegation ──────────────────────────────────────────────────────
  // All handlers are guarded — missing hooks on the runtime are silently skipped.
  function handlePointerDown(evt) {
    var rt = getActiveRuntime();
    if (rt && typeof rt.handlePointerDown === "function") rt.handlePointerDown(evt);
  }

  function handlePointerMove(evt) {
    var rt = getActiveRuntime();
    if (rt && typeof rt.handlePointerMove === "function") rt.handlePointerMove(evt);
  }

  function handlePointerUp(evt) {
    var rt = getActiveRuntime();
    if (rt && typeof rt.handlePointerUp === "function") rt.handlePointerUp(evt);
  }

  function handleKeyDown(evt) {
    var rt = getActiveRuntime();
    if (rt && typeof rt.handleKeyDown === "function") rt.handleKeyDown(evt);
  }

  function handleKeyUp(evt) {
    var rt = getActiveRuntime();
    if (rt && typeof rt.handleKeyUp === "function") rt.handleKeyUp(evt);
  }

  function handleDblClick(evt) {
    var rt = getActiveRuntime();
    if (rt && typeof rt.handleDblClick === "function") rt.handleDblClick(evt);
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.RuntimeViewportRouter = {
    getActiveRuntime:  getActiveRuntime,

    setMode:  setMode,
    getMode:  getMode,

    update: update,
    render: render,

    getCameraTargets: getCameraTargets,

    handlePointerDown: handlePointerDown,
    handlePointerMove: handlePointerMove,
    handlePointerUp:   handlePointerUp,
    handleKeyDown:     handleKeyDown,
    handleKeyUp:       handleKeyUp,
    handleDblClick:    handleDblClick,
  };

  // Convenience alias
  SBE.ViewportMode = {
    get current() { return _mode; },
    set current(m) { setMode(m); },
    OPERATOR:     "operator",
    PRESENTATION: "presentation",
  };

})(window);
