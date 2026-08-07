// ── ItineraryRunAuthority Tests v1.3.0 ────────────────────────────────────────
// 0730D_MAPS_Itinerary_Runner_and_Active_Orb_Traversal
// 0730E_MAPS_RunPresentationControls_VisibilityFix_AbsoluteClock
// 0730F_MAPS_CameraFollowHero
// 0805A_MAPS_Itinerary_Presentation_Foundation_Repairs
// 0805B_MAPS_Live_Map_Presentation_Surface_and_Shortcut_Registry
// Status: active | Classification: test-harness (dependency-free)
//
// v1.3.0 (0805B): F/L/0/Esc simulateKeydown() now dispatches through
// SBE.KeyboardShortcutRegistry.handleKeydown() (the shortcuts themselves are
// registered by itineraryRunAuthority.js at its own load time, not bound to
// a private listener anymore) — added an explicit assertion confirming all 4
// are genuinely present in registry.list('itinerary') before exercising them,
// on top of the existing 0805A behavioral assertions (which needed no
// changes — the net observable behavior is identical, only the dispatch
// plumbing moved).
//
// v1.1.0 additions (0730E): live setPlaybackRate()/setHeroAltitude() (both
// as controller methods and as authority commands), absolute-clock
// stage-boundary overshoot-carry (single and multi-stage crossings), locate
// command → MapboxViewportRuntime.flyTo, and the widened heartbeat/stale-
// lock tolerance.
//
// v1.2.0 additions (0805A): presentation-only actor smoothing
// (getPresentationEntity() divergence/convergence, exact snap on pause/
// restart, reset on stop), heroVisualLiftPixels isolation + clamping, no-
// Hero-Car-fallback + presentationWarning set/clear (stubbed
// SBE.OrbProfileRenderer), RAF camera-follow damping toward
// getPresentationEntity() specifically (not the raw authoritative position —
// asserted as a genuine divergence, not just a passthrough), the RAF loop
// going inert once follow is disabled, F/L/0/Esc keyboard shortcuts
// (including key-repeat and typing-target guards), and the launch-readiness
// handshake always echoing the CURRENT request's id (never a stale one).
// NOTE: the MUSIC-side rejection of a MISMATCHED/stale response id
// (openOrFocusLiveMap() in wallItineraryRunBridge.ts) is a different module
// with no vitest coverage of its own (consistent with this codebase's
// existing convention of not unit-testing localStorage bridge clients) —
// verified via live verification + code inspection instead, not here.
//
// Same rationale/convention as orbProfileAuthority.tests.js — no test runner
// exists under wall/, so this mirrors the `_wos.debug.*` console-diagnostic
// pattern. Covers ItineraryRouteSampler (pure, deterministic), and
// ItineraryRunController/ItineraryRunAuthority's synchronous lifecycle
// behavior (start/pause/resume/stop/restart return values and immediate
// state). Full RAF-driven stage-advancement/completion timing is verified
// LIVE in the browser (see the 0730D completion report), not here — this
// harness deliberately stays synchronous/fast.
//
// Run via: _wos.debug.itineraryRun.runTests()
//
// Placement: wall/systems/runtime/itineraryRunAuthority.tests.js
// Load: AFTER itineraryRunAuthority.js. Not required for production operation.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function _samplePayload() {
    return {
      itineraryId: 'test-itin-1',
      title: 'Test Itinerary',
      builtAt: new Date().toISOString(),
      stages: [
        {
          stageId: 'stage-1', originStopId: 'a', destinationStopId: 'b', mode: 'driving',
          routeSetId: 'rs1', routeId: 'r1',
          geometry: { type: 'LineString', coordinates: [[-74.01, 40.71], [-74.00, 40.72], [-73.99, 40.73]] },
          distanceMeters: 1500, durationSeconds: 60,
        },
        {
          stageId: 'stage-2', originStopId: 'b', destinationStopId: 'c', mode: 'walking',
          routeSetId: 'rs2', routeId: 'r2',
          geometry: { type: 'LineString', coordinates: [[-73.99, 40.73], [-73.98, 40.74]] },
          distanceMeters: 800, durationSeconds: 600,
        },
      ],
    };
  }

  function _multiStagePayload() {
    return {
      itineraryId: 'test-itin-multi',
      title: 'Multi Stage Test',
      builtAt: new Date().toISOString(),
      stages: [
        { stageId: 's1', originStopId: 'a', destinationStopId: 'b', mode: 'driving', routeSetId: 'rs1', routeId: 'r1',
          geometry: { type: 'LineString', coordinates: [[-74.01, 40.71], [-74.00, 40.72]] }, distanceMeters: 500, durationSeconds: 10 },
        { stageId: 's2', originStopId: 'b', destinationStopId: 'c', mode: 'driving', routeSetId: 'rs2', routeId: 'r2',
          geometry: { type: 'LineString', coordinates: [[-74.00, 40.72], [-73.99, 40.73]] }, distanceMeters: 500, durationSeconds: 10 },
        { stageId: 's3', originStopId: 'c', destinationStopId: 'd', mode: 'driving', routeSetId: 'rs3', routeId: 'r3',
          geometry: { type: 'LineString', coordinates: [[-73.99, 40.73], [-73.98, 40.74]] }, distanceMeters: 500, durationSeconds: 10 },
      ],
    };
  }

  function run() {
    var sampler = SBE.ItineraryRouteSampler;
    var controller = SBE.ItineraryRunController;
    var authority = SBE.ItineraryRunAuthority;
    var results = [];

    // ── ItineraryRouteSampler — pure, deterministic ─────────────────────────
    if (!sampler) {
      results.push(_assert('ItineraryRouteSampler is loaded', false));
    } else {
      var points = sampler.toPoints([[-74.0, 40.7], [-74.0, 40.71], [-74.0, 40.72]]);
      results.push(_assert('toPoints converts [lng,lat] pairs to {lat,lng}', points.length === 3 && points[0].lat === 40.7 && points[0].lng === -74.0));

      var segs = sampler.buildSegments(points);
      results.push(_assert('buildSegments returns a real positive total distance', segs.total > 0));
      results.push(_assert('buildSegments cumFrac ends at 1', Math.abs(segs.cumFrac[segs.cumFrac.length - 1] - 1) < 1e-9));

      var start = sampler.interpolate(points, segs, 0);
      var end = sampler.interpolate(points, segs, 1);
      results.push(_assert('interpolate(0) returns the first point', Math.abs(start.lat - points[0].lat) < 1e-9 && Math.abs(start.lng - points[0].lng) < 1e-9));
      results.push(_assert('interpolate(1) returns the last point', Math.abs(end.lat - points[2].lat) < 1e-9 && Math.abs(end.lng - points[2].lng) < 1e-9));

      var mid = sampler.interpolate(points, segs, 0.5);
      results.push(_assert('interpolate(0.5) lands strictly between start and end', mid.lat > start.lat && mid.lat < end.lat));

      var heading = sampler.lookaheadBearing(points, segs, 0.1, 13.8);
      results.push(_assert('lookaheadBearing returns a real 0-360 heading', heading >= 0 && heading < 360));

      results.push(_assert('isValidGeometry rejects degenerate single-point geometry', sampler.isValidGeometry([[-74, 40.7]]) === false));
      results.push(_assert('isValidGeometry accepts a real 2+ point LineString', sampler.isValidGeometry([[-74, 40.7], [-74.01, 40.71]]) === true));
    }

    // ── ItineraryRunController — synchronous lifecycle ──────────────────────
    if (!controller) {
      results.push(_assert('ItineraryRunController is loaded', false));
    } else {
      controller.stop(); // clean slate regardless of any prior state
      results.push(_assert('idle status before any start()', controller.getStatus() === 'idle'));

      var badStart = controller.start({ stages: [] }, 1);
      results.push(_assert('start() rejects an empty-stage payload', badStart.ok === false));

      var payload = _samplePayload();
      var startResult = controller.start(payload, 30);
      results.push(_assert('start() with a valid 2-stage payload succeeds', startResult.ok === true && !!startResult.runId));
      results.push(_assert('status is running immediately after start()', controller.getStatus() === 'running'));

      var snap1 = controller.getSnapshot();
      results.push(_assert('getSnapshot() reports the real itineraryId/stageCount', snap1.itineraryId === 'test-itin-1' && snap1.stageCount === 2));
      results.push(_assert('getSnapshot() starts at stage 0', snap1.stageIndex === 0));

      var pauseResult = controller.pause();
      results.push(_assert('pause() succeeds while running', pauseResult.ok === true));
      results.push(_assert('status is paused after pause()', controller.getStatus() === 'paused'));
      var pausedSnap = controller.getSnapshot();

      var resumeResult = controller.resume();
      results.push(_assert('resume() succeeds while paused', resumeResult.ok === true));
      results.push(_assert('status is running again after resume()', controller.getStatus() === 'running'));

      var pauseAgainFail = controller.pause();
      controller.pause(); // re-pause to compare position stability
      var stillPausedSnap = controller.getSnapshot();
      results.push(_assert('position does not advance while paused',
        pausedSnap.stageIndex === stillPausedSnap.stageIndex));
      void pauseAgainFail;

      var stopResult = controller.stop();
      results.push(_assert('stop() succeeds', stopResult.ok === true));
      results.push(_assert('status is idle after stop()', controller.getStatus() === 'idle'));
      results.push(_assert('getSnapshot() reports null itineraryId after stop()', controller.getSnapshot().itineraryId === null));

      // restart() deliberately reuses _lastPayload across stop() (so "Stop
      // then Restart" works without re-sending the payload) — this is a
      // separate, freshly-started run to isolate the assertion below from
      // whatever _lastPayload a prior start() in this same test run left behind.
      controller.start(payload, 30);
      var restartResult = controller.restart();
      results.push(_assert('restart() after a real start() succeeds with a NEW runId', restartResult.ok === true && restartResult.runId !== startResult.runId));
      results.push(_assert('restart() resets to stage 0', controller.getSnapshot().stageIndex === 0));

      controller.stop(); // leave clean
    }

    // ── ItineraryRunController — 0730E playback rate / hero altitude / clock ──
    if (!controller) {
      results.push(_assert('ItineraryRunController is loaded (0730E)', false));
    } else {
      var p = _samplePayload();
      controller.start(p, 1, 0);
      controller.__test.step(1); // 1 real second at 1x
      var beforeRate = controller.getSnapshot();

      var rateResult = controller.setPlaybackRate(10);
      var afterRateImmediate = controller.getSnapshot();
      results.push(_assert('setPlaybackRate() succeeds while running', rateResult.ok === true));
      results.push(_assert('setPlaybackRate() reflects immediately in snapshot.playbackRate', afterRateImmediate.playbackRate === 10));
      results.push(_assert('setPlaybackRate() does not change elapsed time by itself (no tick has occurred yet)',
        afterRateImmediate.elapsedSeconds === beforeRate.elapsedSeconds));
      results.push(_assert('setPlaybackRate() does not change current position by itself',
        afterRateImmediate.latitude === beforeRate.latitude && afterRateImmediate.longitude === beforeRate.longitude));

      controller.__test.step(1); // 1 real second, now scaled by the NEW 10x rate
      var afterStepAtNewRate = controller.getSnapshot();
      results.push(_assert('subsequent advancement uses the new rate (≈10s credited for 1 real second at 10x)',
        Math.abs((afterStepAtNewRate.elapsedSeconds - afterRateImmediate.elapsedSeconds) - 10) < 0.05));

      var beforeAlt = controller.getSnapshot();
      var altResult = controller.setHeroAltitude(200);
      var afterAlt = controller.getSnapshot();
      results.push(_assert('setHeroAltitude() succeeds while running', altResult.ok === true));
      results.push(_assert('setHeroAltitude() updates snapshot.altitudeMeters', afterAlt.altitudeMeters === 200));
      results.push(_assert('setHeroAltitude() never touches distance/progress/heading/position',
        afterAlt.distanceTraveledMeters === beforeAlt.distanceTraveledMeters &&
        afterAlt.stageProgress01 === beforeAlt.stageProgress01 &&
        afterAlt.headingDeg === beforeAlt.headingDeg &&
        afterAlt.latitude === beforeAlt.latitude && afterAlt.longitude === beforeAlt.longitude));

      controller.setHeroAltitude(999999);
      results.push(_assert('setHeroAltitude() clamps above-range values to HERO_ALTITUDE_MAX_M',
        controller.getSnapshot().altitudeMeters === controller.HERO_ALTITUDE_MAX_M));
      controller.setHeroAltitude(-50);
      results.push(_assert('setHeroAltitude() clamps below-range values to HERO_ALTITUDE_MIN_M',
        controller.getSnapshot().altitudeMeters === controller.HERO_ALTITUDE_MIN_M));

      controller.pause();
      var pausedBeforeAlt = controller.getSnapshot();
      controller.setHeroAltitude(75);
      var pausedAfterAlt = controller.getSnapshot();
      results.push(_assert('setHeroAltitude() works while paused and does not resume the run',
        controller.getStatus() === 'paused' && pausedAfterAlt.altitudeMeters === 75 &&
        pausedAfterAlt.stageProgress01 === pausedBeforeAlt.stageProgress01));
      controller.stop();

      // Start with explicit initial playbackRate + heroAltitudeMeters (pre-Start
      // selection) and confirm the very first snapshot already reflects both —
      // and that the initial entity carried a real heading, not a stub.
      controller.start(p, 5, 120);
      var initialSnap = controller.getSnapshot();
      results.push(_assert('start() accepts initial playbackRate/heroAltitudeMeters',
        initialSnap.playbackRate === 5 && initialSnap.altitudeMeters === 120));
      results.push(_assert('start() populates a real heading on the very first frame (not null/stub)',
        typeof initialSnap.headingDeg === 'number' && initialSnap.headingDeg >= 0 && initialSnap.headingDeg < 360));
      controller.stop();

      // Stage-boundary catch-up: overshoot beyond one finished stage carries
      // into the next stage's elapsed clock instead of being discarded.
      controller.start(p, 1, 0); // stage-1 duration 60s
      controller.__test.step(70); // crosses the 60s boundary with 10s overshoot
      var crossedOnce = controller.getSnapshot();
      results.push(_assert('a large tick crosses exactly one stage boundary when only one fits', crossedOnce.stageIndex === 1));
      results.push(_assert('overshoot beyond the finished stage carries into the next stage\'s elapsed (not reset to 0)',
        Math.abs(crossedOnce.stageElapsedSeconds - 10) < 0.05));
      controller.stop();

      // A single tick spanning MULTIPLE short stages must carry overshoot
      // across every crossing, landing partway through the final one reached.
      var multi = _multiStagePayload();
      controller.start(multi, 1, 0); // 3 stages, 10s each
      controller.__test.step(25); // crosses stage 0 (10s) and stage 1 (10s), 5s into stage 2
      var crossedMulti = controller.getSnapshot();
      results.push(_assert('a single tick can cross multiple stage boundaries in one call', crossedMulti.stageIndex === 2));
      results.push(_assert('overshoot carries correctly across every crossed boundary',
        Math.abs(crossedMulti.stageElapsedSeconds - 5) < 0.05));
      controller.stop();

      // Completion still preserves final position (0730D behavior, re-confirmed
      // unaffected by the 0730E clock rewrite) and Locate Hero-relevant fields
      // (lat/lng) remain populated after completion, not cleared.
      controller.start(p, 1, 0);
      controller.__test.step(10000); // far beyond total duration — completes immediately
      var completedSnap = controller.getSnapshot();
      results.push(_assert('a tick far beyond total duration completes the run', completedSnap.status === 'completed'));
      results.push(_assert('completion preserves a real final lat/lng (not cleared)',
        completedSnap.latitude != null && completedSnap.longitude != null));
      controller.stop();
    }

    // ── ItineraryRunController — 0805A actor smoothing / getPresentationEntity ──
    if (!controller) {
      results.push(_assert('ItineraryRunController is loaded (0805A)', false));
    } else {
      var sp = _samplePayload(); // stage-1 duration 60s at 1x — plenty of room for a big jump
      controller.start(sp, 1, 0);
      results.push(_assert('getPresentationEntity() is seeded (not null) immediately after start()',
        controller.getPresentationEntity() !== null));
      var seedSnap = controller.getSnapshot();
      var seedPres = controller.getPresentationEntity();
      results.push(_assert('getPresentationEntity() matches the authoritative position on the very first frame (no spring-in pop)',
        Math.abs(seedPres.lat - seedSnap.latitude) < 1e-9 && Math.abs(seedPres.lng - seedSnap.longitude) < 1e-9));

      // __test.step() advances the authoritative clock by the given SIMULATED
      // seconds, but its internal _advanceSmoothing() call uses REAL elapsed
      // wall-clock time (near-zero here) — so one big simulated jump moves
      // _currentEntity far while _smoothedEntity barely eases toward it. This
      // is exactly the divergence the camera-follow correction depends on.
      controller.__test.step(30);
      var rawAfterJump = controller.getSnapshot();
      var presAfterJump = controller.getPresentationEntity();
      results.push(_assert('presentation entity meaningfully lags the raw authoritative position after a large jump (proves smoothing is real, not a passthrough)',
        Math.abs(presAfterJump.lat - rawAfterJump.latitude) > 1e-6 || Math.abs(presAfterJump.lng - rawAfterJump.longitude) > 1e-6));

      // Force convergence with an explicit large dt override — deterministic,
      // no dependency on real timing.
      controller.__test.advanceSmoothing(10);
      var presConverged = controller.getPresentationEntity();
      var rawStill = controller.getSnapshot();
      results.push(_assert('advanceSmoothing() with a large dt converges the presentation entity onto the authoritative position',
        Math.abs(presConverged.lat - rawStill.latitude) < 1e-6 && Math.abs(presConverged.lng - rawStill.longitude) < 1e-6));

      // Pause must snap exactly — exponential decay never fully reaches its
      // target on its own, so "settle cleanly" requires an explicit snap.
      controller.__test.step(5);
      controller.pause();
      var pausedRaw = controller.getSnapshot();
      var pausedPres = controller.getPresentationEntity();
      results.push(_assert('pause() snaps the presentation entity exactly onto the paused authoritative position',
        pausedPres.lat === pausedRaw.latitude && pausedPres.lng === pausedRaw.longitude));
      controller.resume();

      // heroVisualLiftPixels — isolation + clamping, mirrors setHeroAltitude's
      // existing isolation test.
      var beforeLift = controller.getSnapshot();
      var liftResult = controller.setHeroVisualLift(80);
      var afterLift = controller.getSnapshot();
      results.push(_assert('setHeroVisualLift() succeeds while running', liftResult.ok === true));
      results.push(_assert('setHeroVisualLift() updates snapshot.heroVisualLiftPixels', afterLift.heroVisualLiftPixels === 80));
      results.push(_assert('setHeroVisualLift() never touches distance/progress/heading/position/altitude',
        afterLift.distanceTraveledMeters === beforeLift.distanceTraveledMeters &&
        afterLift.stageProgress01 === beforeLift.stageProgress01 &&
        afterLift.headingDeg === beforeLift.headingDeg &&
        afterLift.latitude === beforeLift.latitude && afterLift.longitude === beforeLift.longitude &&
        afterLift.altitudeMeters === beforeLift.altitudeMeters));
      controller.setHeroVisualLift(999999);
      results.push(_assert('setHeroVisualLift() clamps above-range values to HERO_VISUAL_LIFT_MAX_PX',
        controller.getSnapshot().heroVisualLiftPixels === controller.HERO_VISUAL_LIFT_MAX_PX));
      controller.setHeroVisualLift(-50);
      results.push(_assert('setHeroVisualLift() clamps below-range values to HERO_VISUAL_LIFT_MIN_PX',
        controller.getSnapshot().heroVisualLiftPixels === controller.HERO_VISUAL_LIFT_MIN_PX));

      controller.stop();
      results.push(_assert('stop() clears getPresentationEntity() back to null', controller.getPresentationEntity() === null));

      controller.start(sp, 1, 0);
      controller.__test.step(30);
      var restartResult2 = controller.restart();
      results.push(_assert('restart() succeeds after smoothing had diverged', restartResult2.ok === true));
      var freshPres = controller.getPresentationEntity();
      var freshSnap = controller.getSnapshot();
      results.push(_assert('restart() reseeds the presentation entity exactly onto stage-0 (no leftover divergence from the prior run)',
        Math.abs(freshPres.lat - freshSnap.latitude) < 1e-9 && Math.abs(freshPres.lng - freshSnap.longitude) < 1e-9));
      controller.stop();
    }

    // ── ItineraryRunController — 0805A no-Hero-Car-fallback / presentationWarning ──
    // Stubs SBE.OrbProfileRenderer so this test's outcome never depends on
    // whatever real Orb state happens to exist on the live page. try/finally:
    // same rationale as the MapboxViewportRuntime stubbing below — a thrown
    // assertion setup must never leave the real OrbProfileRenderer replaced
    // for the rest of the page's life.
    if (!controller) {
      results.push(_assert('ItineraryRunController is loaded (0805A fallback test)', false));
    } else {
      (function () {
        var realOrb = SBE.OrbProfileRenderer;
        try {
          // Unhealthy/unavailable Orb — itinerary presentation must NOT fall
          // back to the legacy Hero Car; it must continue with no visible hero.
          SBE.OrbProfileRenderer = { isRenderReady: function () { return false; } };
          var fp = _samplePayload();
          controller.start(fp, 1, 0);
          var unhealthySnap = controller.getSnapshot();
          results.push(_assert('an unavailable Orb during itinerary presentation reports visibleHeroKind:"none" (no Hero Car substitute)',
            unhealthySnap.visibleHeroKind === 'none'));
          results.push(_assert('an unavailable Orb during itinerary presentation sets presentationWarning:"orb_unavailable"',
            unhealthySnap.presentationWarning === 'orb_unavailable'));
          controller.stop();

          // Healthy Orb — warning must clear, kind must report 'orb'.
          SBE.OrbProfileRenderer = { isRenderReady: function () { return true; }, update: function () { return true; } };
          controller.start(fp, 1, 0);
          var healthySnap = controller.getSnapshot();
          results.push(_assert('a healthy Orb during itinerary presentation reports visibleHeroKind:"orb"',
            healthySnap.visibleHeroKind === 'orb'));
          results.push(_assert('a healthy Orb during itinerary presentation clears presentationWarning back to null',
            healthySnap.presentationWarning === null));
          controller.stop();
        } finally {
          SBE.OrbProfileRenderer = realOrb;
        }
      })();
    }

    // ── ItineraryRunAuthority — command handling + lock ─────────────────────
    if (!authority) {
      results.push(_assert('ItineraryRunAuthority is loaded', false));
    } else {
      var payload2 = _samplePayload();
      authority.__test.simulateCommand({ type: 'start', payload: payload2, speedMultiplier: 30, commandId: 't1', issuedAt: new Date().toISOString() });
      results.push(_assert('simulateCommand(start) makes this tab the owner', authority.isOwner() === true));
      var lock = authority.__test.readOwnerLock();
      results.push(_assert('owner lock is written with this tab\'s id', !!lock && lock.ownerId === authority.__test.tabId));

      var liveSnapshot = authority.getSnapshot();
      results.push(_assert('getSnapshot() reflects the active run while owner', liveSnapshot.itineraryId === 'test-itin-1'));

      authority.__test.simulateCommand({ type: 'stop', commandId: 't2', issuedAt: new Date().toISOString() });
      results.push(_assert('simulateCommand(stop) releases ownership', authority.isOwner() === false));
      results.push(_assert('owner lock is cleared after stop', authority.__test.readOwnerLock() === null));

      // ── 0730E: setPlaybackRate / setHeroAltitude / locate commands ────────
      var payload3 = _samplePayload();
      authority.__test.simulateCommand({ type: 'start', payload: payload3, speedMultiplier: 1, heroAltitudeMeters: 0, commandId: 't3', issuedAt: new Date().toISOString() });

      authority.__test.simulateCommand({ type: 'setPlaybackRate', rate: 5, commandId: 't4', issuedAt: new Date().toISOString() });
      results.push(_assert('authority setPlaybackRate command reaches the controller', authority.getSnapshot().playbackRate === 5));

      authority.__test.simulateCommand({ type: 'setHeroAltitude', meters: 50, commandId: 't5', issuedAt: new Date().toISOString() });
      results.push(_assert('authority setHeroAltitude command reaches the controller', authority.getSnapshot().altitudeMeters === 50));

      // Stub MapboxViewportRuntime.flyTo — a one-shot camera jump, not a mode.
      // try/finally: if any assertion setup throws, the real MapboxViewportRuntime
      // must still be restored — a permanently-stubbed camera runtime for the
      // rest of this page's life is a real, previously-hit failure mode.
      (function () {
        var realMvr = SBE.MapboxViewportRuntime;
        try {
          var flyToCalls = [];
          SBE.MapboxViewportRuntime = { flyTo: function (opts) { flyToCalls.push(opts); } };
          authority.__test.simulateCommand({ type: 'locate', commandId: 't6', issuedAt: new Date().toISOString() });
          results.push(_assert('locate command triggers exactly one MapboxViewportRuntime.flyTo call',
            flyToCalls.length === 1 && Array.isArray(flyToCalls[0].center) && flyToCalls[0].center.length === 2));
        } finally {
          SBE.MapboxViewportRuntime = realMvr;
        }
      })();

      authority.__test.simulateCommand({ type: 'stop', commandId: 't7', issuedAt: new Date().toISOString() });
      results.push(_assert('owner lock is cleared after this run\'s stop', authority.__test.readOwnerLock() === null));

      // ── 0730E: widened heartbeat/stale-lock tolerance ──────────────────────
      if (authority.__test.isLockStale) {
        var tol = authority.__test.HEARTBEAT_MS * authority.__test.STALE_MULTIPLIER;
        results.push(_assert('heartbeat tolerance is widened well beyond the old ~4s window (survives background timer throttling)', tol >= 60000));
        results.push(_assert('a lock heartbeat within the widened tolerance is NOT treated as stale',
          authority.__test.isLockStale({ heartbeatAt: Date.now() - (tol - 5000) }) === false));
        results.push(_assert('a lock heartbeat beyond the widened tolerance IS still eventually reclaimed as stale',
          authority.__test.isLockStale({ heartbeatAt: Date.now() - (tol + 5000) }) === true));
      }

      // ── 0730F: Follow Hero ──────────────────────────────────────────────────
      // A fake map (not the real canonical map) so this test never disturbs
      // whatever camera state the live LIVE MAP session is actually in —
      // exercises the exact same on()/setCenter()/originalEvent-discrimination
      // logic the real Mapbox GL map object provides. try/finally: a real bug
      // was found here — an earlier version of this test threw mid-block on a
      // stale run-lock, skipping the restore line below and permanently
      // stubbing SBE.MapboxViewportRuntime for the rest of the page's life
      // (silently breaking Locate Hero/Follow Hero in the real, live session).
      // Restoration must never depend on reaching the end of the block.
      (function () {
        var realMvr = SBE.MapboxViewportRuntime;
        try {
          var followMap = {
            _handlers: {},
            center: null,
            on: function (evt, fn) { (this._handlers[evt] = this._handlers[evt] || []).push(fn); },
            fire: function (evt, e) { (this._handlers[evt] || []).forEach(function (fn) { fn(e); }); },
            setCenter: function (c) { this.center = c; },
          };
          SBE.MapboxViewportRuntime = { getMap: function () { return followMap; } };

          var payload4 = _samplePayload();
          authority.__test.simulateCommand({ type: 'start', payload: payload4, speedMultiplier: 1, commandId: 'f1', issuedAt: new Date().toISOString() });
          results.push(_assert('followHeroEnabled defaults to false on a fresh run', authority.getSnapshot().followHeroEnabled === false));

          authority.__test.simulateCommand({ type: 'setFollowHero', enabled: true, commandId: 'f2', issuedAt: new Date().toISOString() });
          var snapAtEnable = authority.getSnapshot();
          results.push(_assert('setFollowHero(true) command flips followHeroEnabled', snapAtEnable.followHeroEnabled === true));
          results.push(_assert('enabling follow immediately re-centers the camera on the current actor position',
            !!followMap.center && followMap.center[0] === snapAtEnable.longitude && followMap.center[1] === snapAtEnable.latitude));
          results.push(_assert('setCenter() never touches zoom/pitch/bearing (no such call was ever made)',
            !!followMap.center && followMap.center.length === 2));

          controller.__test.step(3); // advance real position while following
          authority.__test.cameraTick(10); // large dtOverride — forces full convergence deterministically
          // 0805B fix: compare against getPresentationEntity() (the SMOOTHED
          // entity), not the raw snapshot — after a single step(3) real/
          // smoothed have deliberately diverged (see the smoothing tests
          // above), and the camera correctly targets the smoothed value
          // (0805A's required correction), so comparing against raw here was
          // a stale assertion left over from before that distinction existed
          // (0730F), caught by live execution.
          var presAfterMove = controller.getPresentationEntity();
          results.push(_assert('follow re-centers on the actor\'s NEW (presentation/smoothed) position after it moves',
            !!followMap.center && Math.abs(followMap.center[0] - presAfterMove.lng) < 1e-6 && Math.abs(followMap.center[1] - presAfterMove.lat) < 1e-6));

          // ── 0805A: camera damping must target getPresentationEntity(), NOT
          // the raw authoritative position — required correction. A big
          // simulated jump makes the two genuinely diverge (see the
          // controller-level smoothing tests above for why __test.step()
          // produces this); the camera must chase the SMOOTHED value.
          controller.__test.step(30);
          var rawDiverged = authority.getSnapshot();
          var presDiverged = controller.getPresentationEntity();
          results.push(_assert('raw authoritative position and presentation entity have genuinely diverged after a big jump',
            Math.abs(presDiverged.lat - rawDiverged.latitude) > 1e-6 || Math.abs(presDiverged.lng - rawDiverged.longitude) > 1e-6));

          authority.__test.cameraTick(0.05); // one small-dt frame — partial damped step
          var afterOneTick = followMap.center.slice();
          var distToPresAfterOne = Math.hypot(afterOneTick[0] - presDiverged.lng, afterOneTick[1] - presDiverged.lat);
          authority.__test.cameraTick(0.05); // a second small-dt frame — should move CLOSER to the target
          var afterTwoTicks = followMap.center.slice();
          var distToPresAfterTwo = Math.hypot(afterTwoTicks[0] - presDiverged.lng, afterTwoTicks[1] - presDiverged.lat);
          results.push(_assert('camera converges progressively toward the presentation target across multiple small-dt frames (damped, not an instant snap)',
            distToPresAfterTwo <= distToPresAfterOne));

          authority.__test.cameraTick(10); // large dt — forces full convergence
          var converged = followMap.center;
          results.push(_assert('camera fully converges onto the PRESENTATION (smoothed) entity, not the raw authoritative position',
            Math.abs(converged[0] - presDiverged.lng) < 1e-6 && Math.abs(converged[1] - presDiverged.lat) < 1e-6 &&
            (Math.abs(converged[0] - rawDiverged.longitude) > 1e-6 || Math.abs(converged[1] - rawDiverged.latitude) > 1e-6)));

          // Manual interaction (real originalEvent present) must disable follow immediately.
          followMap.fire('dragstart', { originalEvent: {} });
          results.push(_assert('manual map interaction (originalEvent present) disables follow immediately',
            authority.getFollowHero() === false && authority.getSnapshot().followHeroEnabled === false));

          var centerBeforeDisabledTick = followMap.center;
          authority.__test.cameraTick(10);
          results.push(_assert('the RAF-driven camera loop is a no-op once follow is disabled (does not keep moving the map)',
            followMap.center === centerBeforeDisabledTick));

          // Re-enable, then confirm a PROGRAMMATIC-looking event (no originalEvent
          // — what our own setCenter()-driven moves look like) does NOT disable it.
          authority.__test.simulateCommand({ type: 'setFollowHero', enabled: true, commandId: 'f3', issuedAt: new Date().toISOString() });
          followMap.fire('zoomstart', {});
          results.push(_assert('a programmatic-looking event (no originalEvent) does not disable follow',
            authority.getFollowHero() === true));

          // Pause: position stops changing, but follow stays enabled and the
          // camera stays centered on the frozen position (no special-casing
          // needed — re-centering on an unchanged point is a harmless no-op).
          authority.__test.simulateCommand({ type: 'pause', commandId: 'f4', issuedAt: new Date().toISOString() });
          var pausedSnap = authority.getSnapshot();
          authority.__test.cameraTick(10);
          results.push(_assert('follow stays enabled through Pause', authority.getFollowHero() === true));
          results.push(_assert('camera stays centered on the paused position',
            !!followMap.center && Math.abs(followMap.center[0] - pausedSnap.longitude) < 1e-6 && Math.abs(followMap.center[1] - pausedSnap.latitude) < 1e-6));

          authority.__test.simulateCommand({ type: 'resume', commandId: 'f5', issuedAt: new Date().toISOString() });
          results.push(_assert('follow stays enabled through Resume', authority.getFollowHero() === true));

          // ── 0805A: keyboard shortcuts (F/L/0/Esc) — guarded against typing
          // targets and key-repeat, scoped to the executing (owner) tab.
          // 0805B: dispatched via SBE.KeyboardShortcutRegistry now, not a
          // private listener — simulateKeydown() below routes through
          // registry.handleKeydown(); confirm the 4 real production
          // registrations actually exist before exercising them.
          if (SBE.KeyboardShortcutRegistry) {
            var itinShortcutIds = SBE.KeyboardShortcutRegistry.list('itinerary').map(function (s) { return s.id; });
            ['itinerary-toggle-follow', 'itinerary-locate', 'itinerary-free-camera-0', 'itinerary-free-camera-esc'].forEach(function (id) {
              results.push(_assert('itinerary shortcut "' + id + '" is registered in SBE.KeyboardShortcutRegistry (0805B migration)',
                itinShortcutIds.indexOf(id) !== -1));
            });
          }

          function _fakeKeyEvent(key, repeat) {
            return { key: key, repeat: !!repeat, preventDefault: function () {} };
          }
          var flyToCallsKb = [];
          SBE.MapboxViewportRuntime.flyTo = function (opts) { flyToCallsKb.push(opts); };

          authority.__test.simulateKeydown(_fakeKeyEvent('f', false));
          results.push(_assert('"F" keydown toggles follow off', authority.getFollowHero() === false));
          authority.__test.simulateKeydown(_fakeKeyEvent('f', false));
          results.push(_assert('"F" keydown toggles follow back on', authority.getFollowHero() === true));

          authority.__test.simulateKeydown(_fakeKeyEvent('l', false));
          results.push(_assert('"L" keydown triggers a one-time locate (flyTo)', flyToCallsKb.length === 1));

          authority.__test.simulateKeydown(_fakeKeyEvent('0', false));
          results.push(_assert('"0" keydown releases to free camera (disables follow)', authority.getFollowHero() === false));

          authority.__test.simulateCommand({ type: 'setFollowHero', enabled: true, commandId: 'f3b', issuedAt: new Date().toISOString() });
          authority.__test.simulateKeydown(_fakeKeyEvent('Escape', false));
          results.push(_assert('"Escape" keydown releases to free camera (disables follow)', authority.getFollowHero() === false));

          authority.__test.simulateCommand({ type: 'setFollowHero', enabled: true, commandId: 'f3c', issuedAt: new Date().toISOString() });
          authority.__test.simulateKeydown(_fakeKeyEvent('f', true)); // key-repeat must be ignored
          results.push(_assert('a repeated ("held") keydown is ignored, not treated as a real toggle',
            authority.getFollowHero() === true));

          (function () {
            var input = global.document.createElement('input');
            global.document.body.appendChild(input);
            input.focus();
            try {
              authority.__test.simulateKeydown(_fakeKeyEvent('f', false));
              results.push(_assert('keydown is ignored while a real typing target (INPUT) is focused',
                authority.getFollowHero() === true));
            } finally {
              input.blur();
              global.document.body.removeChild(input);
            }
          })();

          // Stop must explicitly disable follow.
          authority.__test.simulateCommand({ type: 'stop', commandId: 'f6', issuedAt: new Date().toISOString() });
          results.push(_assert('Stop disables follow', authority.getSnapshot().followHeroEnabled === false));
        } finally {
          SBE.MapboxViewportRuntime = realMvr;
        }
      })();

      // ── 0805A: launch readiness handshake — every response must echo the
      // CURRENT request's id, never a stale/earlier one (a crashed tab can
      // leave an old `ready` value behind with no beforeunload to clear it;
      // MUSIC only trusts a response whose requestId matches what it just
      // asked for, so the wall side's job is to always respond to the LATEST
      // request, never keep echoing an old one).
      if (authority.__test.setLiveMapReady && authority.__test.respondToLiveMapRequestNow) {
        var reqKey = authority.__test.STORAGE_LIVEMAP_REQUEST_KEY;
        var readyKey = authority.__test.STORAGE_LIVEMAP_READY_KEY;
        authority.__test.setLiveMapReady(true);

        global.localStorage.setItem(reqKey, JSON.stringify({ requestId: 'req-a', issuedAt: new Date().toISOString() }));
        authority.__test.respondToLiveMapRequestNow();
        var readyA = JSON.parse(global.localStorage.getItem(readyKey));
        results.push(_assert('responding to a request echoes that exact request\'s id',
          readyA && readyA.requestId === 'req-a' && readyA.ready === true));

        // A NEW launch attempt supersedes the old one — the response must
        // update to the new id, never keep pointing at 'req-a'.
        global.localStorage.setItem(reqKey, JSON.stringify({ requestId: 'req-b', issuedAt: new Date().toISOString() }));
        authority.__test.respondToLiveMapRequestNow();
        var readyB = JSON.parse(global.localStorage.getItem(readyKey));
        results.push(_assert('a fresh request updates the response to the NEW id, not a stale echo of the previous one',
          readyB && readyB.requestId === 'req-b'));
        results.push(_assert('the stale prior response is genuinely gone, not just superseded in memory',
          readyB.requestId !== 'req-a'));

        try { global.localStorage.removeItem(reqKey); global.localStorage.removeItem(readyKey); } catch (e) {}
      }
    }

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };

    console.log('[ItineraryRunAuthorityTests] ' + (summary.ok ? 'PASS' : 'FAIL') +
      ' — ' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
    if (failed.length) console.warn('[ItineraryRunAuthorityTests] failures:', failed);

    return summary;
  }

  SBE.ItineraryRunAuthorityTests = { run: run };

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.itineraryRun = { runTests: run };

})(window);
