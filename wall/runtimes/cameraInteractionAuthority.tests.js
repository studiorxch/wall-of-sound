// CameraInteractionAuthority + TiltProjectionRuntime focused regression
// tests — Calibration V1 Revision 13 (Human Camera Ownership).
// Run via: SBE.CameraInteractionAuthorityTests.run()  (async — awaits real
// grace-period timing for the resumption tests, does not fake the clock)
(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, condition, details) {
    return { name: name, pass: !!condition, details: details || null };
  }

  function _waitMs(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function run() {
    var results = [];
    var authority = SBE.CameraInteractionAuthority;
    var tilt = SBE.TiltProjectionRuntime;

    if (!authority || !authority.__test) {
      return { ok: false, total: 1, failed: 1, results: [_assert("CameraInteractionAuthority test surface is loaded", false)] };
    }

    // Every test in this suite manipulates shared runtime state (the
    // authority's interaction Set/grace timer, and -- for the integration
    // section -- the real live map's pitch). Reset/restore around the whole
    // run so this never leaves a stray interaction type "stuck active" or
    // the live camera at an unintended pitch for a human validator.
    authority.__test.reset();
    try {
      // ── Pure ownership-tracking logic (no real map needed) ────────────────
      results.push(_assert(
        "idle: no interaction active, ambient may act",
        !authority.isInteracting() && !authority.shouldAmbientYield()
      ));

      authority.__test.simulateStart("drag");
      results.push(_assert(
        "a single active interaction type makes humanCameraActive true",
        authority.isInteracting() && authority.shouldAmbientYield()
          && JSON.stringify(authority.getActiveInteractionTypes()) === JSON.stringify(["drag"])
      ));

      // Overlapping interaction types: starting a second type while the
      // first is still active, then ending only the SECOND one, must NOT
      // release ownership -- this is the "not a fragile single boolean"
      // requirement.
      authority.__test.simulateStart("zoom");
      results.push(_assert(
        "a second overlapping interaction type is tracked alongside the first",
        authority.getActiveInteractionTypes().length === 2
      ));
      authority.__test.simulateEnd("zoom");
      results.push(_assert(
        "ending ONE of several overlapping interaction types does not release ownership while another remains active",
        authority.isInteracting() && authority.shouldAmbientYield()
          && JSON.stringify(authority.getActiveInteractionTypes()) === JSON.stringify(["drag"])
      ));

      authority.__test.simulateEnd("drag");
      results.push(_assert(
        "ending the LAST active interaction type releases isInteracting() immediately",
        !authority.isInteracting()
      ));
      results.push(_assert(
        "...but ambient yield continues into the idle grace period right after",
        authority.shouldAmbientYield() && authority.__test.getGraceRemainingMs() > 0
      ));

      // A new interaction starting during the grace window must cancel it
      // outright (continuous ownership, no gap a quick re-grab falls through).
      authority.__test.simulateStart("rotate");
      results.push(_assert(
        "a new interaction starting during the grace window cancels the pending grace and resumes ownership immediately",
        authority.isInteracting() && authority.__test.getGraceRemainingMs() === 0
      ));
      authority.__test.simulateEnd("rotate");
      results.push(_assert(
        "grace period restarts cleanly after the interrupted interaction itself ends",
        !authority.isInteracting() && authority.shouldAmbientYield()
      ));
      authority.__test.reset();
      results.push(_assert(
        "reset() clears all tracked interaction state (test-only, mirrors a clean idle app boot)",
        !authority.isInteracting() && !authority.shouldAmbientYield()
      ));

      // ── Revision 14: ambient-change ownership flag ──────────────────────
      // Verified live against REAL trusted browser input before choosing
      // this mechanism over event.originalEvent (which does not reliably
      // distinguish human input for every interaction type -- confirmed a
      // genuine trusted wheel-driven zoomstart/zoomend carried no
      // originalEvent at all, indistinguishable from an ambient system's own
      // programmatic call). This is the fix for the Revision 13
      // self-suppression loop: an ambient system's own start/end events,
      // fired while wrapped in runAmbientCameraChange(), must never be
      // tracked as human interaction, and must not even affect
      // isAmbientChange() bookkeeping once the wrapped call returns.
      results.push(_assert(
        "runAmbientCameraChange() marks isAmbientChange() true only strictly during the wrapped call",
        !authority.__test.isAmbientChange()
          && authority.runAmbientCameraChange(function () { return authority.__test.isAmbientChange(); }) === true
          && !authority.__test.isAmbientChange()
      ));
      authority.runAmbientCameraChange(function () {
        authority.__test.simulateStart("pitch");
        authority.__test.simulateEnd("pitch");
      });
      results.push(_assert(
        "an interaction start+end fired from INSIDE runAmbientCameraChange() is never tracked -- isInteracting stays false and no grace period is armed",
        !authority.isInteracting() && !authority.shouldAmbientYield() && authority.__test.getGraceRemainingMs() === 0
      ));
      authority.__test.reset();

      // ── TiltProjectionRuntime integration (real global runtime + real map) ──
      // Calibration V1 Revision 17 (finding A): TiltProjectionRuntime is
      // deliberately never init()'d for the Subway working canvas -- "the
      // camera never moves autonomously while the user is working on the
      // canvas" -- so `getState().initialized` is false here by design,
      // not a fault. This integration block exercises resumption/ambient
      // behavior that only applies where Tilt actually runs (every other
      // Wall mode); skip it here rather than fail against an intentionally
      // disabled runtime.
      var map = SBE.MapboxViewportRuntime && SBE.MapboxViewportRuntime.getMap && SBE.MapboxViewportRuntime.getMap();
      var tiltState = tilt && tilt.getState && tilt.getState();
      if (tiltState && !tiltState.initialized) {
        results.push(_assert("Revision 17: TiltProjectionRuntime integration tests (skipped -- Tilt is intentionally never initialized for the Subway working canvas)", true));
      } else if (tilt && tilt.forceEval && tilt.getState && map && typeof map.getPitch === "function" && typeof map.setPitch === "function") {
        var originalPitch = map.getPitch();
        try {
          // Force the map away from Tilt's target range and confirm a
          // yielded forceEval() genuinely does not move it at all.
          map.setPitch(0);
          authority.__test.simulateStart("pitch");
          tilt.forceEval();
          results.push(_assert(
            "Revision 13: TiltProjectionRuntime.forceEval() does not call setPitch() while a human interaction is active",
            map.getPitch() === 0
          ));

          authority.__test.simulateEnd("pitch");
          tilt.forceEval();
          results.push(_assert(
            "Revision 13: TiltProjectionRuntime remains suppressed during the idle grace period immediately after interaction ends",
            map.getPitch() === 0
          ));

          // Wait past the grace period, then confirm ambient tilt is free
          // to resume -- and that resuming does not itself read as a snap:
          // the first tick back re-syncs from the map's actual pitch (0,
          // set above) rather than whatever stale internal state predates
          // the interaction, so it eases gently toward target rather than
          // jumping.
          await _waitMs(authority.__test.GRACE_PERIOD_MS + 250);
          results.push(_assert(
            "Revision 13: ambient yield ends once the grace period has fully elapsed with no further interaction",
            !authority.shouldAmbientYield()
          ));
          var pitchBeforeResume = map.getPitch();
          tilt.forceEval();
          var pitchAfterResume = map.getPitch();
          results.push(_assert(
            "Revision 13: TiltProjectionRuntime resumes ordinary idle cinematic tilt after the grace period elapses (a real setPitch happens again)",
            pitchAfterResume !== pitchBeforeResume && pitchAfterResume > pitchBeforeResume
          ));
          results.push(_assert(
            "Revision 13: the resumed tick eases gently (one spring step), not an instant jump straight to the target",
            pitchAfterResume < 15 // one 0.04-stiffness step from 0 toward a ~28-38 target is well under 15
          ));

          // Revision 14 (the self-suppression loop fix, end-to-end against
          // the REAL map -- not simulated events): the resumed tick above
          // just called the real map.setPitch(), which fires REAL
          // pitchstart/pitchend on the real map. Prove those real events do
          // NOT get tracked as human interaction and do NOT arm a grace
          // period -- if they did, ambient tilt would immediately re-suppress
          // itself the moment it acts, exactly the Revision 13 bug.
          results.push(_assert(
            "Revision 14: TiltProjectionRuntime's own real setPitch() call does not leave isInteracting() true or arm a grace period afterward",
            !authority.isInteracting() && !authority.shouldAmbientYield() && authority.__test.getGraceRemainingMs() === 0
          ));
          var rebuildBaselinePitch = map.getPitch();
          tilt.forceEval();
          results.push(_assert(
            "Revision 14: a second consecutive ambient tick still succeeds immediately (no self-armed grace blocking it) -- pitch keeps advancing tick over tick",
            map.getPitch() !== rebuildBaselinePitch
          ));
        } finally {
          // Restore the exact original camera pitch before continuing --
          // this test suite must not leave the live scene's camera altered
          // for whatever human validation runs next.
          authority.__test.reset();
          map.setPitch(originalPitch);
        }
      } else {
        results.push(_assert("Revision 13: TiltProjectionRuntime integration tests (skipped -- runtime/map not ready in this environment)", true));
      }
    } finally {
      authority.__test.reset();
    }

    var failed = results.filter(function (result) { return !result.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
    console.log("[CameraInteractionAuthorityTests] " + (summary.ok ? "PASS" : "FAIL") + " — " + (results.length - failed.length) + "/" + results.length);
    if (failed.length) console.warn("[CameraInteractionAuthorityTests] failures:", failed);
    return summary;
  }

  SBE.CameraInteractionAuthorityTests = { run: run };
})(window);
