// ── RacetrackPresentationSurface v1.0.0 ───────────────────────────────────────
// 0805E_RACETRACK_Wall_Mode_and_Cached_Course_Runtime
// Status: active | Classification: presentation / racetrack-presentation-surface
//
// Toggles ONE body class — `racetrack-presentation` — from
// RacetrackSessionRuntime's own scene state, so canonical LIVE MAP's legacy
// nav/rail chrome hides itself (via wall/styles.css) while RACETRACK is
// open, and reappears the instant the user leaves RACETRACK — no reload,
// no direct DOM manipulation here beyond the one class toggle. Mirrors
// itineraryPresentationSurface.js's exact shape (subscribe() + a light poll
// safety net), scoped to RACETRACK only — no generic mode registry.
//
// "Open" is defined as: RacetrackSessionRuntime exists AND either the
// `?mode=racetrack` boot flag activated it, or the scene has ever been
// explicitly entered this page life. There is no separate "closed" scene —
// leaving RACETRACK on canonical LIVE MAP today means navigating away from
// `?mode=racetrack` (a fresh load), matching wall/'s existing no-client-
// -router reality; this module does not invent a "leave RACETRACK" affordance
// beyond that.
//
// Placement: wall/systems/presentation/racetrackPresentationSurface.js
// Load: AFTER racetrackSessionRuntime.js.
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var PRESENTATION_CLASS = 'racetrack-presentation';
  var POLL_MS = 250;

  var _active = false; // set true once, by main.js's ?mode=racetrack boot check

  function activate() {
    _active = true;
    _apply();
  }

  function _apply() {
    try {
      global.document.body.classList.toggle(PRESENTATION_CLASS, _active);
    } catch (e) { /* DOM not ready yet — next poll tick retries */ }
  }

  function _init() {
    _apply();
    var runtime = global.SBE && SBE.RacetrackSessionRuntime;
    if (runtime) runtime.subscribe(_apply);
    global.setInterval(_apply, POLL_MS);
  }

  try { _init(); } catch (e) { console.warn('[RacetrackPresentationSurface] init failed:', e && e.message || e); }

  SBE.RacetrackPresentationSurface = Object.freeze({
    VERSION: VERSION,
    PRESENTATION_CLASS: PRESENTATION_CLASS,
    activate: activate,
    isActive: function () { return _active; },
    // Test-only — never used by production code.
    __test: {
      applyNow: _apply,
    },
  });

  console.log('[RacetrackPresentationSurface] v' + VERSION + ' loaded');

})(window);
