(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── CameraInteractionAuthority (Calibration V1 Revision 13) ───────────────
  //
  // A human actively manipulating the Mapbox camera has exclusive camera
  // authority over ambient/cinematic camera systems (TiltProjectionRuntime
  // today; any future ambient camera behavior should check this too).
  //
  // Root cause this exists to fix: TiltProjectionRuntime ran an unconditional
  // 2000ms interval calling map.setPitch() with zero awareness of human
  // interaction, fighting drag/zoom/rotate/pitch gestures mid-gesture and
  // forcing Revision 12's Camera Interaction Cache out of its optimized
  // (transform-only) path every time it fired during a gesture.
  //
  // Tracks each Mapbox interaction TYPE independently (drag, zoom, rotate,
  // pitch) via a counted Set, not a single boolean -- two overlapping
  // gestures (e.g. a pinch that is simultaneously a zoom AND a rotate) each
  // have their own start/end pair, and ownership must not release until
  // EVERY active type has ended, not just the first one to fire its `*end`.
  //
  // After the last active interaction ends, ambient systems still yield for
  // a short GRACE_PERIOD_MS -- releasing the map the instant a drag ends and
  // letting an ambient system immediately snap pitch back would read as the
  // map fighting the user the moment they let go, which is exactly the
  // behavior this authority exists to prevent. The default matches
  // TiltProjectionRuntime's own 2000ms evaluation cadence -- see this file's
  // header comment in wall/systems/world/tiltProjectionRuntime.js -- so an
  // ambient tick that was already "due" isn't perceived as an abrupt resume.
  //
  // A NEW interaction starting during the grace window cancels it outright
  // (ownership resumes immediately, continuously) rather than letting a
  // quick re-grab fall through a gap in coverage.
  //
  // Calibration V1 Revision 14 -- ambient-change ownership flag: verified
  // live against REAL trusted browser input before choosing this mechanism.
  // Mapbox's own `event.originalEvent` reliably distinguishes genuine human
  // input from a programmatic call for drag (dragstart/dragend carried a
  // real, isTrusted MouseEvent) -- but did NOT for zoom (a real, trusted
  // wheel-driven zoomstart/zoomend carried NO originalEvent at all, exactly
  // like TiltProjectionRuntime's own programmatic map.setPitch()). Since the
  // discriminator is unreliable for at least one interaction type, per the
  // explicit fallback instruction this authority does NOT use originalEvent
  // at all -- instead, any code that programmatically changes the camera on
  // the ambient system's own behalf must wrap that call in
  // `runAmbientCameraChange()`, and every `_onStart`/`_onEnd` call ignores
  // events fired while inside that wrapper. This is what stops
  // TiltProjectionRuntime's own map.setPitch() calls from being
  // misidentified as human interaction and re-arming their own suppression
  // (the Revision 13 self-suppression loop -- see reconnaissance notes).

  var INTERACTION_TYPES = ["drag", "zoom", "rotate", "pitch"];
  var GRACE_PERIOD_MS = 2000;

  var _map = null;
  var _activeTypes = {};        // type -> true while that gesture is in progress
  var _activeCount = 0;
  var _graceUntil = 0;          // performance.now() timestamp; 0 = no pending grace
  var _ambientChangeDepth = 0;  // >0 while inside runAmbientCameraChange() -- reentrant-safe

  function _now() {
    return (global.performance && global.performance.now) ? global.performance.now() : Date.now();
  }

  function _isAmbientChange() {
    return _ambientChangeDepth > 0;
  }

  // Wraps a synchronous camera-mutating call an ambient/cinematic system
  // makes on its own behalf (e.g. TiltProjectionRuntime's map.setPitch()) so
  // the interaction events it fires are never tracked as human input. Mapbox
  // fires start/end pairs for a direct, non-eased setter (like setPitch)
  // synchronously within the call itself (confirmed live: pitchstart and
  // pitchend land at the identical timestamp for TiltProjectionRuntime's own
  // calls) -- a plain synchronous try/finally wrapper is therefore
  // sufficient; this is NOT meant for an eased transition (easeTo/flyTo),
  // whose start/end events span real time after the call returns.
  function runAmbientCameraChange(fn) {
    _ambientChangeDepth += 1;
    try {
      return fn();
    } finally {
      _ambientChangeDepth -= 1;
    }
  }

  function _onStart(type) {
    if (_isAmbientChange()) return; // never track an ambient system's own camera change as human interaction
    if (_activeTypes[type]) return; // already tracked (defensive against duplicate events)
    _activeTypes[type] = true;
    _activeCount += 1;
    // A new gesture starting -- including one that starts during what would
    // otherwise be the post-interaction grace window -- always cancels any
    // pending grace outright, so ambient yield coverage is continuous with
    // no gap a quick re-grab could fall through.
    _graceUntil = 0;
  }

  function _onEnd(type) {
    if (_isAmbientChange()) return; // never track an ambient system's own camera change as human interaction
    if (!_activeTypes[type]) return; // defensive against an unmatched *end
    delete _activeTypes[type];
    _activeCount = Math.max(0, _activeCount - 1);
    // Only start the idle grace period once ALL overlapping interaction
    // types have ended -- ending one of several simultaneous gestures (e.g.
    // rotateend firing mid-pinch while zoom is still active) must not
    // release ownership early.
    if (_activeCount === 0) {
      _graceUntil = _now() + GRACE_PERIOD_MS;
    }
  }

  function isInteracting() {
    return _activeCount > 0;
  }

  // Whether an ambient/cinematic camera system should yield right now --
  // true while a human gesture is active, and for GRACE_PERIOD_MS after the
  // last one ends. This is the single check ambient systems should use; they
  // should not need to know about the interaction-type Set at all.
  function shouldAmbientYield() {
    if (_activeCount > 0) return true;
    return _graceUntil > 0 && _now() < _graceUntil;
  }

  function getActiveInteractionTypes() {
    return Object.keys(_activeTypes);
  }

  function init(mapInstance) {
    if (_map) return; // idempotent -- init() called more than once is a no-op
    _map = mapInstance;
    if (!_map || typeof _map.on !== "function") return;
    for (var i = 0; i < INTERACTION_TYPES.length; i++) {
      (function (type) {
        _map.on(type + "start", function () { _onStart(type); });
        _map.on(type + "end", function () { _onEnd(type); });
      })(INTERACTION_TYPES[i]);
    }
  }

  SBE.CameraInteractionAuthority = {
    init: init,
    isInteracting: isInteracting,
    shouldAmbientYield: shouldAmbientYield,
    getActiveInteractionTypes: getActiveInteractionTypes,
    runAmbientCameraChange: runAmbientCameraChange,
    __test: {
      // Reconnaissance/regression-test-only introspection and control --
      // never used by production code paths.
      simulateStart: function (type) { _onStart(type); },
      simulateEnd: function (type) { _onEnd(type); },
      getGraceRemainingMs: function () {
        var remaining = _graceUntil - _now();
        return remaining > 0 ? remaining : 0;
      },
      reset: function () { _activeTypes = {}; _activeCount = 0; _graceUntil = 0; _ambientChangeDepth = 0; },
      isAmbientChange: _isAmbientChange,
      GRACE_PERIOD_MS: GRACE_PERIOD_MS,
    },
  };

})(window);
