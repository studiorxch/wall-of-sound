// ── ItineraryPresentationSurface v1.0.0 ───────────────────────────────────────
// 0805B_MAPS_Live_Map_Presentation_Surface_and_Shortcut_Registry
// Status: active | Classification: presentation / itinerary-presentation-surface
//
// Toggles ONE body class — `itinerary-presentation` — from the authoritative
// itinerary-run snapshot's status, so canonical LIVE MAP's legacy Drive/
// Flight/Walk/Bike/Transit/Orbital nav deck (#wos-nav), left rail, and
// launcher rail hide themselves (via wall/styles.css) while an itinerary is
// starting/running/paused/completed, and reappear automatically the instant
// the run returns to idle/stopping/error — no reload, no direct DOM
// manipulation here, just one class toggle driven by CSS already written for
// this class (see styles.css's `body.itinerary-presentation` block).
//
// This is intentionally the ONLY thing this module does — it owns no run
// state of its own (reads SBE.ItineraryRunAuthority.getSnapshot() only,
// never caches/forks it) and never touches the camera, Now Playing, or the
// compact telemetry HUD, all of which are governed by their own existing
// modules/CSS untouched by this file.
//
// Reacts via BOTH subscribe() (instant reaction to command-driven transitions
// — Start/Pause/Resume/Stop/Restart all call _notify()) AND a light 250ms
// poll (matching itineraryRunAuthority.js's own SNAPSHOT_PUBLISH_MS) as a
// safety net for the one transition subscribe() alone would miss: a run
// reaching Completion organically inside the controller's own RAF loop
// publishes the new snapshot on the existing publish interval, but does NOT
// call _notify() — confirmed by reading _startSnapshotPublishing()'s body,
// which only ever calls _publishSnapshot(), never _notify(). Polling closes
// that specific gap without needing to touch itineraryRunAuthority.js's
// publish loop for a presentation-only concern.
//
// Placement: wall/systems/presentation/itineraryPresentationSurface.js
// Load: AFTER itineraryRunAuthority.js (subscribes to it).
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var PRESENTATION_CLASS = 'itinerary-presentation';
  var POLL_MS = 250; // matches ItineraryRunAuthority's SNAPSHOT_PUBLISH_MS

  var ACTIVE_STATUSES = { starting: true, running: true, paused: true, completed: true };

  var _lastActive = null; // tri-state (null|true|false) so the very first apply always runs

  function _isPresentationActive(snapshot) {
    return !!(snapshot && ACTIVE_STATUSES[snapshot.status]);
  }

  function _apply() {
    var authority = global.SBE && SBE.ItineraryRunAuthority;
    if (!authority) return;
    var snapshot = authority.getSnapshot();
    var active = _isPresentationActive(snapshot);
    if (active === _lastActive) return;
    _lastActive = active;
    try {
      global.document.body.classList.toggle(PRESENTATION_CLASS, active);
    } catch (e) {}
  }

  function _init() {
    var authority = global.SBE && SBE.ItineraryRunAuthority;
    if (!authority) return;
    _apply();
    authority.subscribe(_apply);
    global.setInterval(_apply, POLL_MS);
  }

  try { _init(); } catch (e) { console.warn('[ItineraryPresentationSurface] init failed:', e && e.message || e); }

  SBE.ItineraryPresentationSurface = Object.freeze({
    VERSION: VERSION,
    PRESENTATION_CLASS: PRESENTATION_CLASS,
    // Test-only — never used by production code.
    __test: {
      isPresentationActive: _isPresentationActive,
      applyNow: _apply,
    },
  });

  console.log('[ItineraryPresentationSurface] v' + VERSION + ' loaded');

})(window);
