// ── SubwayPresentationSurface v1.0.0 ──────────────────────────────────────────
// 0819_SUBWAY_Public_HUD_Line_Ribbon_v1.0.0_BUILD — §10/§13/§20
// Status: active | Classification: presentation / subway-presentation-surface
//
// Toggles ONE body class — `subway-presentation` — from
// MTASubwayMapLayer's own isActive() state, mirroring
// racetrackPresentationSurface.js's exact shape (a light poll safety net,
// no generic mode registry — confirmed live during this build's own
// investigation that no such registry exists anywhere in wall/). Unlike
// RACETRACK's presentation surface, this does NOT hide the whole chrome —
// SUBWAY renders directly onto the canonical live map (wall/index.html's
// own documented convention) — it hides only the specific DRIVE-mode/
// legacy-canvas elements this BUILD calls out (wall/styles.css owns the
// actual hide rules; this module only ever toggles the one class).
//
// Placement: wall/systems/presentation/subwayPresentationSurface.js
// Load: AFTER mtaSubwayMapLayer.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var PRESENTATION_CLASS = 'subway-presentation';
  var POLL_MS = 250;

  function _isSubwayActive() {
    var layer = global.SBE && SBE.MTASubwayMapLayer;
    return !!(layer && typeof layer.isActive === 'function' && layer.isActive());
  }

  function _apply() {
    try {
      global.document.body.classList.toggle(PRESENTATION_CLASS, _isSubwayActive());
    } catch (e) { /* DOM not ready yet — next poll tick retries */ }
  }

  function _init() {
    _apply();
    global.setInterval(_apply, POLL_MS);
  }

  try { _init(); } catch (e) { console.warn('[SubwayPresentationSurface] init failed:', e && e.message || e); }

  SBE.SubwayPresentationSurface = Object.freeze({
    VERSION: VERSION,
    PRESENTATION_CLASS: PRESENTATION_CLASS,
    isActive: _isSubwayActive,
    // Test-only — never used by production code.
    __test: { applyNow: _apply },
  });

  console.log('[SubwayPresentationSurface] v' + VERSION + ' loaded');
})(window);
