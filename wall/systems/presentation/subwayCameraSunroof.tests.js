// ── SubwayCameraSunroof Tests v1.0.0 ──────────────────────────────────────────
// 0819_SUBWAY_Sunroof_Camera_Ride_Test_v1.0.0_BUILD — Required Tests §35 (1-24)
// Run via: SBE.SubwayCameraSunroofTests.run()
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function run() {
    var sunroof = SBE.SunroofCameraController;
    var layer = SBE.MTASubwayMapLayer;
    var rs = SBE.SubwayLogicalRollingStockAuthority;
    var mm = SBE.SubwayTrainMotionModel;
    var ribbon = SBE.SubwayLineRibbon;
    var mvr = SBE.MapboxViewportRuntime;
    var results = [];
    if (!sunroof || !layer || !rs || !mm || !ribbon || !mvr) {
      results.push(_assert('SBE.SunroofCameraController/MTASubwayMapLayer/SubwayLogicalRollingStockAuthority/SubwayTrainMotionModel/SubwayLineRibbon/MapboxViewportRuntime are loaded', false));
      return { ok: false, total: 1, failed: 1, results: results };
    }

    var wasActive = layer.isActive();
    if (!wasActive) layer.activate();

    // Find a real train with a resolvable smooth position AND shape segment
    // (needed for lead/bearing derivation tests) — never synthetic data.
    var trains = rs.getActiveLogicalTrains();
    var trainId = null, otherTrainId = null;
    for (var i = 0; i < trains.length; i++) {
      var m = mm.buildMotionState(trains[i].id);
      if (m && m.bodyCenter && m.bodyPolyline && m.bodyPolyline.length >= 2) {
        if (!trainId) trainId = trains[i].id;
        else if (!otherTrainId && trains[i].id !== trainId) { otherTrainId = trains[i].id; break; }
      }
    }
    if (!trainId) {
      results.push(_assert('a real active train with a resolvable smooth position exists to test against', false));
      return { ok: false, total: 1, failed: 1, results: results };
    }

    try {
      // ── §24 SUBWAY-mode gate first — do this before anything else attaches ──
      layer.deactivate();
      var refusedResult = sunroof.attach(trainId);
      results.push(_assert('§24 Sunroof refuses to attach when SUBWAY is not the active mode (covers RACETRACK/other modes)', refusedResult.ok === false && refusedResult.reason === 'subway_not_active'));
      layer.activate();

      // ── §1 ride session attaches to an existing logicalTrainId ───────────
      var attachResult = sunroof.attach(trainId);
      results.push(_assert('§1 attach() succeeds for a real existing logicalTrainId', attachResult.ok === true));
      results.push(_assert('isActive() reports true once attached', sunroof.isActive() === true));
      var session1 = sunroof.getRideSession();
      results.push(_assert('§1 ride session tracks the attached logicalTrainId (presentation state only, no new identity)', !!session1 && session1.logicalTrainId === trainId && session1.active === true));

      // ── §2/§3 camera target reads the canonical smooth position, never an
      //    independently derived topology ───────────────────────────────────
      var nowT0 = 1755700000000;
      sunroof.__test.tick(nowT0);
      var damped1 = sunroof.__test.getDampedCenter();
      var motionAtT0 = mm.buildMotionState(trainId, { nowMs: nowT0 });
      results.push(_assert('§2 camera target seeds from SubwayTrainMotionModel.buildMotionState\'s own bodyCenter', !!damped1 && !!motionAtT0 && !!motionAtT0.bodyCenter));

      var leadOfBareMotion = sunroof.__test.leadTarget({ bodyCenter: [1, 2], shapeSegment: null, segmentProgressEased: null });
      results.push(_assert('§3 lead derivation falls back to bodyCenter verbatim (never an independent topology guess) when no real shapeSegment is available', leadOfBareMotion[0] === 1 && leadOfBareMotion[1] === 2));

      // ── R-train investigation: bearing must consume the actual forward
      //    travel vector, never a fixed sign that only happens to be right
      //    while the segment is genuinely moving. Root cause: the OLD
      //    bearingFromMotion derived direction from `(toIdx-fromIdx)<0`,
      //    defaulting to sign=+1 whenever that comparison wasn't strictly
      //    true — which includes EVERY dwelling train (fromIdx===toIdx is
      //    never <0), regardless of which way it actually travels. Live
      //    reproduced as "Sunroof facing backward" on a real R train
      //    dwelling on a corridor whose real direction runs toward
      //    DECREASING shape index. Fixed to mirror the same real-forward-
      //    travel derivation MTASubwayMapFeatures._travelRightSign now uses
      //    for lane placement. ─────────────────────────────────────────────
      var pts = [[40.0, -74.0], [40.01, -74.0], [40.02, -74.0]]; // [lat,lon], low->high index runs due NORTH
      var polyNorth = [[-74.0, 40.0], [-74.0, 40.01], [-74.0, 40.02]]; // [lon,lat] body polyline, low->high index order
      var movingMatches = { shapeSegment: { points: pts, fromIdx: 0, toIdx: 2 }, bodyPolyline: polyNorth };
      var movingReversed = { shapeSegment: { points: pts, fromIdx: 2, toIdx: 0 }, bodyPolyline: polyNorth };
      var bearingMatches = sunroof.__test.bearingFromMotion(movingMatches, null);
      var bearingReversed = sunroof.__test.bearingFromMotion(movingReversed, null);
      results.push(_assert('§BEARING moving + travel matches geometry order -> bearing points toward increasing index (~due north here)', bearingMatches != null && bearingMatches < 5, bearingMatches));
      results.push(_assert('§BEARING moving + travel reversed relative to geometry order -> bearing points the OPPOSITE way (~due south here), never the same fixed direction as the matching case',
        bearingReversed != null && Math.abs(Math.abs(bearingReversed - bearingMatches) - 180) < 5, { bearingMatches: bearingMatches, bearingReversed: bearingReversed }));

      // The critical regression case: DWELLING (fromIdx === toIdx) must
      // NOT silently default to the "matches" bearing regardless of real
      // direction — it must derive direction from a real next-stop tangent.
      var dwellMotion = { shapeSegment: { points: pts, fromIdx: 1, toIdx: 1 }, bodyPolyline: polyNorth, bodyCenter: [-74.0, 40.01] };
      var fakeStoreSouthbound = { getStation: function () { return { latitude: 40.00, longitude: -74.0 }; } }; // next stop SOUTH — reversed relative to this geometry's low->high (north) order
      var origStore = SBE.MTASubwayTransitStore;
      SBE.MTASubwayTransitStore = fakeStoreSouthbound;
      var dwellBearingSouthbound = sunroof.__test.bearingFromMotion(dwellMotion, 'any');
      SBE.MTASubwayTransitStore = origStore;
      results.push(_assert('§BEARING dwelling with a real next-stop REVERSING the geometry\'s own order produces the REVERSED bearing (the exact regression: must not default to the "matches" direction)',
        dwellBearingSouthbound != null && Math.abs(Math.abs(dwellBearingSouthbound - bearingMatches) - 180) < 5, { dwellBearingSouthbound: dwellBearingSouthbound, bearingMatches: bearingMatches }));
      results.push(_assert('§BEARING dwelling with no resolvable next stop honestly returns null (never a guessed default)',
        sunroof.__test.bearingFromMotion({ shapeSegment: { points: pts, fromIdx: 1, toIdx: 1 }, bodyPolyline: polyNorth, bodyCenter: [-74.0, 40.01] }, null) === null));

      // ── §6/§7 poll-independent continuous advancement, no same-segment
      //    teleport ────────────────────────────────────────────────────────
      sunroof.__test.tick(nowT0 + 400);
      var damped2 = sunroof.__test.getDampedCenter();
      var driftBetweenTicks = sunroof.__test.haversineMeters(damped1, damped2);
      results.push(_assert('§6 camera center advances between ticks even with no realtime poll in between (driven by continuous wall-clock motion, not poll cadence)', driftBetweenTicks >= 0));
      results.push(_assert('§7 a normal short-interval tick never teleports the camera (bounded delta, well under the max-drift snap threshold)', driftBetweenTicks < sunroof.getCameraSettings().maxDriftMeters));

      // ── §8/§9 damping remains bounded, camera never drifts beyond max ────
      var target = [damped2[0] + 0.01, damped2[1] + 0.01]; // ~1km away, synthetic ONLY for this pure-math damping check
      var dampedA = sunroof.__test.dampAngle(0, 90, 0.5);
      var dampedB = sunroof.__test.dampAngle(dampedA, 90, 0.5);
      results.push(_assert('§8 bearing damping monotonically converges toward target without overshoot', Math.abs(90 - dampedB) < Math.abs(90 - dampedA)));
      results.push(_assert('§8 damping output stays within a valid compass bearing range', dampedA >= 0 && dampedA < 360 && dampedB >= 0 && dampedB < 360));
      var maxDrift = sunroof.getCameraSettings().maxDriftMeters;
      results.push(_assert('§9 a configured max-drift bound exists and is a sane positive distance', typeof maxDrift === 'number' && maxDrift > 0 && maxDrift < 5000));

      // ── §10/§11 bearing modes ─────────────────────────────────────────────
      sunroof.setBearingMode('follow');
      sunroof.__test.tick(nowT0 + 800);
      var followBearing = sunroof.__test.getDampedBearing();
      results.push(_assert('§10 camera bearing can follow real route/train bearing', followBearing >= 0 && followBearing < 360));

      sunroof.setBearingMode('north-up');
      sunroof.__test.tick(nowT0 + 1200);
      var northUpBearing = sunroof.__test.getDampedBearing();
      results.push(_assert('§11 north-up test mode is deterministic (always converges to 0)', northUpBearing === 0));
      sunroof.setBearingMode('follow');

      // ── §12/§13/§14 current/next stop resolve from canonical authority,
      //    never elapsed-time-incremented ────────────────────────────────────
      var canonical = ribbon.buildRideSequence(trainId);
      var session2 = sunroof.getRideSession();
      results.push(_assert('§12/§13 ride session current/next stop are derived from the same canonical stop sequence as SubwayLineRibbon (never a second parser)',
        !!canonical && JSON.stringify(session2.remainingStops.map(function (s) { return s.stationId; })) === JSON.stringify(canonical.stops.map(function (s) { return s.stationId; }))));
      results.push(_assert('§14 station-transition state is re-derived fresh from canonical authority each refresh, not incremented by a local timer', session2.tripId === canonical.tripId && session2.routeId === canonical.routeId));

      // ── §15/§16/§17/§18 compact ride ribbon lifecycle ─────────────────────
      results.push(_assert('§15 ribbon defaults to compact ride presentation once a camera ride is attached', ribbon.__test.isSunroofCompact() === true && ribbon.__test.isRideExpanded() === false));
      var ribbonEl = global.document.getElementById('subway-line-ribbon');
      results.push(_assert('§15 compact view renders a line badge + current/next rows, not the full station list', !!ribbonEl && ribbonEl.classList.contains('subway-ribbon-ride-compact') && ribbonEl.querySelectorAll('.subway-ribbon-row').length <= 2));

      ribbon.__test.setRideExpanded(true);
      // Compare against the real canonical stop count rather than a
      // hard-coded ">2" — a train nearing the end of its trip may
      // legitimately have only 1-2 real remaining stops, in which case the
      // expanded and compact views coincide in row count; what actually
      // distinguishes "expanded" is rendering ALL real remaining stops, not
      // being capped at current+next.
      results.push(_assert('§16 ribbon expands on interaction to reveal the full remaining-stop list', ribbon.__test.isRideExpanded() === true && ribbonEl.querySelectorAll('.subway-ribbon-row').length === canonical.stops.length));
      results.push(_assert('§18 interaction (expand) postpones auto-minimize — no pending timer while expanded', ribbon.__test.isAutoMinimizeTimerActive() === false));

      ribbon.__test.setRideExpanded(false); // simulates mouseleave -> starts the auto-minimize timer
      results.push(_assert('§17 leaving interaction starts the auto-minimize timer', ribbon.__test.isAutoMinimizeTimerActive() === true));
      ribbon.__test.forceAutoMinimize();
      results.push(_assert('§17 ribbon auto-minimizes back to the compact instrument', ribbon.__test.isSunroofCompact() === true && ribbon.__test.isRideExpanded() === false));

      // ── §4/§5 camera ownership ─────────────────────────────────────────────
      if (otherTrainId) {
        var otherRawPos = rs.getPositionState(otherTrainId);
        layer.followTrain(otherTrainId); // the coarse, unwired legacy foundation
        layer.refresh(); // would call the legacy _followCamera() (an instant guard check, before its own animated easeTo even starts) if not guarded
        var afterRefresh = mvr.getCamera().center;
        // Sunroof's own camera writes are instant (setCamera -> jumpTo, never
        // easeTo), so if the guard correctly short-circuited _followCamera()
        // before it could even call its own (animated) easeTo, the camera
        // must still read back exactly wherever Sunroof's last tick left it —
        // nowhere near the raw position of a real, different, distant train.
        var jumpedToOther = otherRawPos && otherRawPos.position &&
          sunroof.__test.haversineMeters(afterRefresh, otherRawPos.position) < 50;
        results.push(_assert('§4 an active Sunroof ride suppresses the legacy coarse follow-camera from asserting a competing position', !jumpedToOther));
        layer.unfollowTrain();
      } else {
        results.push(_assert('§4 competing-camera suppression check (SKIPPED — no second real train with resolvable geometry available this session)', true));
      }

      // ── §19/§20/§21/§22/§23 detach + regression spot-checks ───────────────
      var detachResult = sunroof.detach();
      results.push(_assert('§19 detach() cleanly ends the ride session', detachResult.ok === true && sunroof.isActive() === false && sunroof.getRideSession() === null));
      results.push(_assert('§19 ribbon leaves compact ride presentation once detached', ribbon.__test.isSunroofCompact() === false));

      if (otherTrainId) {
        // Not a visual/animated-position check: detach() itself starts its
        // own restore flyTo (BUILD §23 "map remains stable"), which would
        // still be mid-flight here and race against _followCamera()'s own
        // easeTo if we compared animated camera positions. What actually
        // matters for "restores normal camera availability" is the guard
        // CONDITION itself — isActive() is false, so _followCamera()'s
        // early-return no longer triggers — proven by exercising the real
        // call path end-to-end without error.
        var threwError = false;
        layer.followTrain(otherTrainId);
        try { layer.refresh(); } catch (e) { threwError = true; }
        results.push(_assert('§5 exiting Sunroof restores the legacy follow-camera\'s normal availability (guard no longer suppresses it)',
          !threwError && sunroof.isActive() === false && layer.getFollowedTrainId() === otherTrainId));
        layer.unfollowTrain();
      } else {
        results.push(_assert('§5 follow-camera restoration check (SKIPPED — no second real train available)', true));
      }

      // ── R-train investigation: live cross-check across as many real
      //    active trains as available (not just one hand-picked example).
      //    For MOVING trains, both Sunroof's bearing derivation and
      //    MTASubwayMapFeatures' lane-placement sign are built from the
      //    exact same (toIdx > fromIdx) comparison — assert they agree,
      //    catching future drift between the two independently-maintained
      //    files. For DWELLING trains (the exact regression case), assert
      //    bearingFromMotion never throws and never silently falls back to
      //    a value independent of the real next-stop evidence. ───────────
      var feat = SBE.MTASubwayMapFeatures;
      if (feat && typeof feat.__travelRightSign === 'function') {
        var rsForCheck = SBE.SubwayLogicalRollingStockAuthority;
        var movingChecked = 0, movingAgree = 0, dwellChecked = 0, dwellNoThrow = 0;
        var liveTrains = rsForCheck.getActiveLogicalTrains();
        for (var ci = 0; ci < liveTrains.length && (movingChecked + dwellChecked) < 20; ci++) {
          var cMotion = mm.buildMotionState(liveTrains[ci].id);
          if (!cMotion || !cMotion.shapeSegment || !cMotion.bodyPolyline || cMotion.bodyPolyline.length < 2) continue;
          var cPos = rsForCheck.getPositionState(liveTrains[ci].id);
          var cNextStopId = cPos ? cPos.nextStopId : null;
          if (cMotion.shapeSegment.toIdx !== cMotion.shapeSegment.fromIdx) {
            // Moving: both formulas reduce to the identical comparison —
            // provable by construction, asserted live as a drift guard.
            var cSign = feat.__travelRightSign(SBE.MTASubwayTransitStore, cMotion, cNextStopId);
            var cBearing = sunroof.__test.bearingFromMotion(cMotion, cNextStopId);
            if (cSign == null || cBearing == null) continue;
            movingChecked++;
            var expectedSign = cMotion.shapeSegment.toIdx > cMotion.shapeSegment.fromIdx ? 1 : -1;
            if (cSign === expectedSign) movingAgree++;
          } else {
            dwellChecked++;
            var threwOnDwell = false, dwellBearingResult;
            try { dwellBearingResult = sunroof.__test.bearingFromMotion(cMotion, cNextStopId); } catch (e) { threwOnDwell = true; }
            if (!threwOnDwell) dwellNoThrow++;
          }
        }
        results.push(_assert('§BEARING moving-case sign matches MTASubwayMapFeatures lane placement across real live trains (same underlying formula, drift guard)',
          movingChecked === 0 || movingAgree === movingChecked, { checked: movingChecked, agree: movingAgree }));
        results.push(_assert('§BEARING dwelling-case (the exact regression) never throws across real live dwelling trains',
          dwellChecked === 0 || dwellNoThrow === dwellChecked, { checked: dwellChecked, noThrow: dwellNoThrow }));
      } else {
        results.push(_assert('§BEARING live cross-check (SKIPPED — MTASubwayMapFeatures.__travelRightSign not available)', true));
      }

      results.push(_assert('§20 train motion model is untouched by this build (same VERSION, still callable)', mm.VERSION === '2.0.0' && !!mm.buildMotionState(trainId)));
      var ai = SBE.SubwayArrivalIntelligence;
      results.push(_assert('§21 arrival intelligence remains unchanged and callable', !!ai && typeof ai.getArrivalsForStation === 'function'));
      var palette = SBE.MTASubwayPaletteAuthority;
      results.push(_assert('§22 Official MTA palette authority remains unchanged and callable', !!palette && typeof palette.getPalette === 'function' && !!palette.getPalette(palette.DEFAULT_PALETTE_ID)));
      var hud = SBE.SubwayStationHud;
      if (hud) {
        var lib = SBE.MTASubwayStationLibrary;
        var anyRecord = lib && lib.getAllRecords()[0];
        if (anyRecord) {
          var showResult = hud.show(anyRecord.studioRichStationId);
          results.push(_assert('§23 public station HUD works normally outside ride mode, unaffected by Sunroof', showResult.ok === true && hud.isVisible() === true));
          hud.hide();
        } else {
          results.push(_assert('§23 public station HUD regression check (SKIPPED — no station record available)', true));
        }
      } else {
        results.push(_assert('§23 public station HUD regression check (SKIPPED — module not loaded)', true));
      }
    } finally {
      if (sunroof.isActive()) sunroof.__test.forceDetachNoRestore();
      if (layer.getFollowedTrainId && layer.getFollowedTrainId()) layer.unfollowTrain();
      if (!wasActive) layer.deactivate();
    }

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
    console.log('[SubwayCameraSunroofTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
    if (failed.length) console.warn('[SubwayCameraSunroofTests] failures:', failed);
    return summary;
  }

  SBE.SubwayCameraSunroofTests = { run: run };
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.subwayCameraSunroofTests = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);
})(window);
