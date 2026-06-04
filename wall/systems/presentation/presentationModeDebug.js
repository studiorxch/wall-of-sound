// ── PresentationModeDebug v1.2.0 ──────────────────────────────────────────────
// 0528S_WOS_PresentationModeTabToggle_v1.0.0 — debug companion
// v1.1.0 — extended CSS patch: #ws-lower-panel, #ws-geo-controls, .ws-mode-toggle,
//           .mapboxgl-ctrl-*, [data-watch-hide], .watch-hide (workspace.css + styles.css)
// v1.2.0 — grid collapse: body.presentation .app-body grid-template-columns:0 1fr 0
//           #left-rail width:0 collapse; #ws-lower-panel display:none (44px collapse)
//           data-watch-hide stamped on #left-rail (HTML) and #ws-lower-panel (workspaceUI.js)
// Status: active
// Classification: debug-companion — do NOT load in production
//
// Exposes:
//   _wos.presentationMode(enabled?)   — toggle or set presentation mode
//   _wos.presentationModeState()      — read current state
//
// Uses the existing body.presentation class toggled by main.js togglePresentationMode().
// Tab key already calls togglePresentationMode() via main.js:17441 — this companion
// only adds the _wos console helpers and MapboxViewportRuntime.resize() call.
//
// Placement: wall/systems/presentation/presentationModeDebug.js
// Load: AFTER main.js scripts, alongside other debug companions
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  global._wos = global._wos || {};

  var VERSION    = '1.2.0';
  var BODY_CLASS = 'presentation';

  // ── _resize() ─────────────────────────────────────────────────────────────────
  // Nudge Mapbox to recompute viewport after chrome layout changes.

  function _resize() {
    var mvr = global.SBE && global.SBE.MapboxViewportRuntime;
    if (mvr && typeof mvr.resize === 'function') {
      setTimeout(function () { mvr.resize(); }, 50);
    }
  }

  // ── presentationMode(enabled?) ────────────────────────────────────────────────

  function presentationMode(enabled) {
    var next = (enabled === undefined)
      ? !document.body.classList.contains(BODY_CLASS)
      : !!enabled;

    document.body.classList.toggle(BODY_CLASS, next);
    _resize();

    console.log('[PresentationMode] ' + (next ? 'ON' : 'OFF'));
    return next;
  }

  // ── presentationModeState() ───────────────────────────────────────────────────

  function presentationModeState() {
    return document.body.classList.contains(BODY_CLASS);
  }

  // ── Bind ──────────────────────────────────────────────────────────────────────

  global._wos.presentationMode      = presentationMode;
  global._wos.presentationModeState = presentationModeState;

  console.log('[PresentationModeDebug] v' + VERSION + ' ready');
  console.log('  _wos.presentationMode(true)   — enter cinematic mode');
  console.log('  _wos.presentationMode(false)  — restore UI');
  console.log('  _wos.presentationModeState()  — read current state');
  console.log('  Tab key                       — toggles mode (existing handler)');

})(window);
