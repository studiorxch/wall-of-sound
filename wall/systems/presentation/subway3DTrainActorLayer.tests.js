// ── Subway3DTrainActorLayer Tests v1.0.0 ─────────────────────────────────────
// 0825_MAPS_Ep2_3D_Train_Actor_Foundation_v1.0.0
// Status: active | Classification: test-harness (dependency-free)
//
// Covers only the pure heading-derivation seam (reimplemented locally from
// subwayCameraSunroof.js's own _bearingFromMotion/_dwellTravelSign technique,
// per this codebase's established per-consumer convention). Mapbox custom
// layer mounting, THREE.js rendering, and live motion binding are live-
// browser verification only.
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function _approx(a, b, tol) {
    return Math.abs(a - b) <= (tol == null ? 1e-6 : tol);
  }

  function _withStubStore(stations, fn) {
    var prev = SBE.MTASubwayTransitStore;
    SBE.MTASubwayTransitStore = { getStation: function (id) { return stations[id] || null; } };
    try { return fn(); } finally { SBE.MTASubwayTransitStore = prev; }
  }

  function run() {
    var layer = SBE.Subway3DTrainActorLayer;
    var results = [];

    if (!layer || !layer.__bearingFromMotionForTests) {
      results.push(_assert('SBE.Subway3DTrainActorLayer.__bearingFromMotionForTests is available', false));
      console.log('[Subway3DTrainActorLayerTests] FAIL — module/test seam not available');
      return { ok: false, total: 1, failed: 1, results: results };
    }

    (function () {
      // Moving east: toIdx > fromIdx, last two bodyPolyline points both [lon,lat]
      // increasing lon -> bearing should be ~90deg.
      var motion = {
        bodyPolyline: [[-74.01, 40.70], [-74.00, 40.70]],
        shapeSegment: { points: [[40.70, -74.01], [40.70, -74.00]], fromIdx: 0, toIdx: 1 },
      };
      var bearing = layer.__bearingFromMotionForTests(motion, null);
      results.push(_assert('moving forward (toIdx>fromIdx) derives bearing from polyline end',
        bearing != null && _approx(bearing, 90, 1), bearing));
    })();

    (function () {
      // Moving in reverse shape-index direction: toIdx < fromIdx -> bearing
      // should come from the START of bodyPolyline, reversed.
      var motion = {
        bodyPolyline: [[-74.00, 40.70], [-74.01, 40.70]],
        shapeSegment: { points: [[40.70, -74.00], [40.70, -74.01]], fromIdx: 1, toIdx: 0 },
      };
      var bearing = layer.__bearingFromMotionForTests(motion, null);
      results.push(_assert('moving backward (toIdx<fromIdx) still derives a real bearing, not null',
        bearing != null, bearing));
    })();

    (function () {
      // Dwelling (fromIdx === toIdx) with no next-stop evidence -> null
      // (caller holds last-known heading rather than guessing).
      var motion = {
        bodyPolyline: [[-74.01, 40.70], [-74.00, 40.70]],
        shapeSegment: { points: [[40.70, -74.01], [40.70, -74.00]], fromIdx: 0, toIdx: 0 },
      };
      var bearing = layer.__bearingFromMotionForTests(motion, null);
      results.push(_assert('dwelling with no nextStopId evidence returns null (hold-last-known)',
        bearing === null, bearing));
    })();

    (function () {
      // Dwelling WITH real next-stop evidence -> dwell dot-product sign resolves.
      var motion = {
        bodyCenter: [-74.005, 40.70],
        bodyPolyline: [[-74.01, 40.70], [-74.00, 40.70]],
        shapeSegment: { points: [[40.70, -74.01], [40.70, -74.00]], fromIdx: 0, toIdx: 0 },
      };
      var bearing = _withStubStore({ 'next-stop': { latitude: 40.70, longitude: -73.99 } }, function () {
        return layer.__bearingFromMotionForTests(motion, 'next-stop');
      });
      results.push(_assert('dwelling with real next-stop evidence derives a real bearing via dot-product sign',
        bearing != null, bearing));
    })();

    (function () {
      var poly = null;
      var motion = { bodyPolyline: poly, shapeSegment: { fromIdx: 0, toIdx: 1, points: [] } };
      var bearing = layer.__bearingFromMotionForTests(motion, null);
      results.push(_assert('missing/too-short bodyPolyline returns null without throwing',
        bearing === null, bearing));
    })();

    // ── Motion-grace decision — pure, no THREE/Mapbox dependency. Covers
    // the car-instance lifecycle/live-tracking continuity fix (a transient
    // GTFS-realtime poll miss must not immediately hide the car). _tick()'s
    // own handling of _carInstance (never disposed/recreated across
    // hold/hide, only in deactivate() or a genuine train reselection) is
    // structural, not a pure function, so "recovery preserves the same car
    // instance" is verified by code inspection (setVisibility(false)/hold
    // never touch _carInstance identity) rather than a unit test here —
    // live-browser verification only, per this file's own convention.
    if (layer.__motionGraceDecisionForTests) {
      var graceMs = layer.MOTION_GRACE_MS;

      (function () {
        // valid -> unknown -> valid, all within the grace window: holds,
        // then resumes — never hides.
        var t0 = 1000000;
        var lastValid = t0;
        var holdDecision = layer.__motionGraceDecisionForTests(false, lastValid, t0 + 5000, graceMs);
        results.push(_assert('unknown bodyCenter well within grace window holds (does not hide)',
          holdDecision.action === 'hold', holdDecision));
        var resumeDecision = layer.__motionGraceDecisionForTests(true, lastValid, t0 + 6000, graceMs);
        results.push(_assert('valid bodyCenter after a within-grace hold resumes with action update',
          resumeDecision.action === 'update', resumeDecision));
      })();

      (function () {
        // valid -> unknown, beyond the grace window: hides.
        var t0 = 2000000;
        var lastValid = t0;
        var expiredDecision = layer.__motionGraceDecisionForTests(false, lastValid, t0 + graceMs + 1, graceMs);
        results.push(_assert('unknown bodyCenter beyond grace window hides (action hide_expired)',
          expiredDecision.action === 'hide_expired', expiredDecision));
      })();

      (function () {
        // Exactly at the boundary — age === graceMs should NOT still be
        // held (grace is "up to", not inclusive-forever).
        var t0 = 3000000;
        var boundaryDecision = layer.__motionGraceDecisionForTests(false, t0, t0 + graceMs, graceMs);
        results.push(_assert('unknown bodyCenter exactly at the grace boundary hides, not holds',
          boundaryDecision.action === 'hide_expired', boundaryDecision));
      })();

      (function () {
        // No previous valid transform at all (fresh instance/fresh
        // selection) + unknown bodyCenter: stays hidden, no grace granted —
        // there is nothing valid to hold.
        var noHistoryDecision = layer.__motionGraceDecisionForTests(false, null, 4000000, graceMs);
        results.push(_assert('unknown bodyCenter with no prior valid motion hides immediately (no grace)',
          noHistoryDecision.action === 'hide_no_history', noHistoryDecision));
      })();
    } else {
      results.push(_assert('SBE.Subway3DTrainActorLayer.__motionGraceDecisionForTests is available', false));
    }

    // ── Consist car placement — pure, no THREE/Mapbox dependency (4-Car
    // Consist Gate). RIGID-LINK / DIRECT-DISTANCE coupler model: each
    // coupler P[i] is SOLVED (circle/line-segment intersection in local
    // projected meters, not walked in fixed arc steps) so the DIRECT/
    // straight-line distance from P[i-1] is exactly CANONICAL_CAR_LENGTH_M
    // — matching the rendered rigid GLB body's real fixed physical length
    // (confirmed via direct FrontBumper/RearBumper measurement against the
    // real asset — see subwayTrainCarVisualAdapter.tests.js). An earlier
    // version stepped in cumulative ARC length instead, which is only
    // equal to direct/chord distance on a perfectly straight segment — on
    // any curve arc > chord, leaving the fixed-length rigid body too long
    // for the span between its own couplers, which is what produced the
    // reported zigzag. Adjacent cars still share the exact same coupler
    // point object (reference equality). Needs
    // SBE.SubwayTrainMotionModel's own pure exposures (__haversineMeters,
    // __pointAtContinuousIndex) — same reuse this file's production code
    // makes, not a duplicate.
    if (layer.__computeCarPlacementsForTests && global.SBE.SubwayTrainMotionModel) {
      var MM = global.SBE.SubwayTrainMotionModel;
      var CAR_LEN = MM.CANONICAL_CAR_LENGTH_M;
      // Haversine (spherical) vs this function's own local-flat-projection
      // solve differ by a few centimeters at car-length spans — expected,
      // acceptable flat-projection error, not a defect. Loose enough to
      // pass that expected drift, tight enough to catch the old arc-based
      // model's much larger (multi-decimeter, curve-dependent) error.
      var SPAN_TOLERANCE_M = 0.05;

      function _couplersShared(result) {
        for (var k = 0; k < result.placements.length - 1; k++) {
          if (result.placements[k].rearCoupler !== result.placements[k + 1].frontCoupler) return false;
        }
        return true;
      }
      function _circularArcFixture(radiusM, pointCount, totalAngleRad, refLat, refLon) {
        var points = [];
        for (var i = 0; i <= pointCount; i++) {
          var a = (i / pointCount) * totalAngleRad;
          var dLat = (radiusM * Math.sin(a)) / 111320;
          var dLon = (radiusM * (1 - Math.cos(a))) / (111320 * Math.cos(refLat * Math.PI / 180));
          points.push([refLat + dLat, refLon + dLon]);
        }
        return points;
      }

      (function () {
        // Straight track, ample geometry: 4 cars, contiguous, couplers
        // shared, correct front-to-back ordering, identical headings
        // ("straight-track consist remains straight").
        var points = [];
        for (var i = 0; i <= 10; i++) points.push([40.7000 + i * 0.0001, -74.0000]);
        var seg = { points: points, fromIdx: 0, toIdx: 10 };
        var result = layer.__computeCarPlacementsForTests(seg, [-74.0000, 40.7005], null, 4, CAR_LEN);
        results.push(_assert('straight track: requests exactly 4, places exactly 4, no geometry shortfall',
          result.placedCarCount === 4 && !result.geometryInsufficient, result));
        results.push(_assert('straight track: adjacent cars share the exact same coupler point (reference-equal)',
          _couplersShared(result), result.placements));
        results.push(_assert('straight track: direct front-to-rear span is CANONICAL_CAR_LENGTH_M for every car',
          result.placements.every(function (p) { return Math.abs(MM.__haversineMeters(p.frontCoupler, p.rearCoupler) - CAR_LEN) < SPAN_TOLERANCE_M; }),
          result.placements));
        results.push(_assert('straight track: carIndex is strictly ascending front-to-back (correct ordering)',
          result.placements.every(function (p, idx) { return p.carIndex === idx; }), result.placements));
        var headingsAllEqual = result.placements.every(function (p) { return Math.abs(p.headingDeg - result.placements[0].headingDeg) < 1e-6; });
        results.push(_assert('straight track: every car shares the same heading (consist remains straight)',
          headingsAllEqual, result.placements.map(function (p) { return p.headingDeg; })));
      })();

      (function () {
        // Smooth, gentle curve (R=120m, generous — realistic mainline
        // scale) with enough geometry for all 4 requested cars: verifies a
        // CONTINUOUS ARTICULATED CHAIN — headings must progress smoothly
        // and MONOTONICALLY car to car (each step in the same rotational
        // direction), never oscillating back and forth (which would be the
        // "alternating zigzag" failure mode), and every span must still be
        // the real rigid-body length.
        var points = _circularArcFixture(120, 120, 1.0, 40.7, -74.0);
        var seg = { points: points, fromIdx: 0, toIdx: points.length - 1 };
        var result = layer.__computeCarPlacementsForTests(seg, [points[60][1], points[60][0]], null, 4, CAR_LEN);
        results.push(_assert('smooth curve: places all 4 requested cars',
          result.placedCarCount === 4 && !result.geometryInsufficient, result));
        results.push(_assert('smooth curve: every direct front-to-rear span is CANONICAL_CAR_LENGTH_M',
          result.placements.every(function (p) { return Math.abs(MM.__haversineMeters(p.frontCoupler, p.rearCoupler) - CAR_LEN) < SPAN_TOLERANCE_M; }),
          result.placements));
        results.push(_assert('smooth curve: couplers shared (no lateral staircasing)',
          _couplersShared(result), result.placements));
        var headings = result.placements.map(function (p) { return p.headingDeg; });
        var deltas = headings.slice(1).map(function (h, i) { return h - headings[i]; });
        var allSameSign = deltas.every(function (d) { return d < 0; }) || deltas.every(function (d) { return d > 0; });
        results.push(_assert('smooth curve: headings progress monotonically car-to-car — CONTINUOUS ARTICULATED CHAIN, not an alternating zigzag',
          allSameSign, headings));
      })();

      (function () {
        // Sharp 90° bend fixture — the case that exposed staircasing under
        // both the earlier center+independent-tangent model AND the
        // cumulative-arc-length coupler model. The car straddling the bend
        // must still get a real, valid rigid-body span (never overshoot
        // past real geometry) and couplers must still be shared exactly.
        var points = [];
        for (var i = 0; i <= 5; i++) points.push([40.7000 + i * 0.0002, -74.0100]); // north leg
        var baseLat = points[5][0], baseLon = points[5][1];
        for (var j = 1; j <= 5; j++) points.push([baseLat, baseLon + j * 0.0002]); // east leg
        var seg = { points: points, fromIdx: 0, toIdx: 10 };
        var result = layer.__computeCarPlacementsForTests(seg, [baseLon + 0.0002, baseLat], null, 3, 40);
        results.push(_assert('bend fixture: places all 3 requested cars',
          result.placedCarCount === 3, result));
        results.push(_assert('bend fixture: NO LATERAL STAIRCASING — adjacent cars share the exact same coupler point across the bend',
          _couplersShared(result), result.placements));
        results.push(_assert('bend fixture: every direct front-to-rear span is the real rigid-body length (40 test units)',
          result.placements.every(function (p) { return Math.abs(MM.__haversineMeters(p.frontCoupler, p.rearCoupler) - 40) < SPAN_TOLERANCE_M; }),
          result.placements));
        results.push(_assert('bend fixture: cars fully on the east leg read ~90deg (east)',
          result.placements.length >= 2 &&
          Math.abs(result.placements[0].headingDeg - 90) < 1 &&
          Math.abs(result.placements[1].headingDeg - 90) < 1,
          result.placements));
        results.push(_assert('bend fixture: the car straddling the bend reads a heading strictly between the two legs (0-90deg), never snapped to either',
          result.placements.length >= 3 && result.placements[2].headingDeg > 0 && result.placements[2].headingDeg < 90,
          result.placements));
      })();

      (function () {
        // Tight curve (R=25m — a real, sharp yard/interlocking-scale
        // curve) must REMAIN CONNECTED: still places cars, couplers still
        // shared, still the correct real rigid-body span — the direct-
        // distance solve must not break down or disconnect under a much
        // tighter curve than a real mainline would ever have.
        var points = _circularArcFixture(25, 80, 2.5, 40.7, -74.0);
        var seg = { points: points, fromIdx: 0, toIdx: points.length - 1 };
        var result = layer.__computeCarPlacementsForTests(seg, [points[40][1], points[40][0]], null, 4, CAR_LEN);
        results.push(_assert('tight curve: places at least 3 of the 4 requested cars (real geometry constraint, not a defect)',
          result.placedCarCount >= 3, result));
        results.push(_assert('tight curve: remains connected — couplers still shared across every joint',
          _couplersShared(result), result.placements));
        results.push(_assert('tight curve: every direct front-to-rear span is still CANONICAL_CAR_LENGTH_M',
          result.placements.every(function (p) { return Math.abs(MM.__haversineMeters(p.frontCoupler, p.rearCoupler) - CAR_LEN) < SPAN_TOLERANCE_M; }),
          result.placements));
      })();

      (function () {
        // No overlap/stack: consecutive cars' rear couplers must be
        // strictly ordered by cumulative distance from the front tip —
        // never equal, never reversed, never landing on the same point.
        var points = [];
        for (var i = 0; i <= 10; i++) points.push([40.7000 + i * 0.0001, -74.0000]);
        var seg = { points: points, fromIdx: 0, toIdx: 10 };
        var result = layer.__computeCarPlacementsForTests(seg, [-74.0000, 40.7005], null, 4, CAR_LEN);
        var frontTip = result.placements[0].frontCoupler;
        var cumulativeDistances = result.placements.map(function (p) { return MM.__haversineMeters(frontTip, p.rearCoupler); });
        var strictlyIncreasing = cumulativeDistances.every(function (d, idx) { return idx === 0 || d > cumulativeDistances[idx - 1]; });
        results.push(_assert('no overlap/stack: each car\'s rear coupler is strictly farther from the front tip than the previous car\'s',
          strictlyIncreasing, cumulativeDistances));
      })();

      (function () {
        // Geometry insufficient for even ONE car's rear coupler: unplaced,
        // never clamped/extrapolated.
        var points = [[40.7000, -74.0000], [40.7001, -74.0000]]; // ~11m total — under one full car length
        var seg = { points: points, fromIdx: 0, toIdx: 1 };
        var result = layer.__computeCarPlacementsForTests(seg, [-74.0000, 40.70005], null, 4, CAR_LEN);
        results.push(_assert('short geometry (< 1 car): places zero cars rather than a partial/extrapolated one',
          result.placedCarCount === 0, result));
        results.push(_assert('short geometry (< 1 car): geometryInsufficient is reported true',
          result.geometryInsufficient === true, result));
      })();

      (function () {
        // Geometry sufficient for SOME but not all requested cars:
        // placedCarCount simply reduces to what real geometry supports —
        // never all-or-nothing, never stacked/extrapolated to make up the
        // difference.
        var points = _circularArcFixture(120, 120, 1.0, 40.7, -74.0).slice(0, 25);
        var seg = { points: points, fromIdx: 0, toIdx: points.length - 1 };
        var result = layer.__computeCarPlacementsForTests(seg, [points[10][1], points[10][0]], null, 4, CAR_LEN);
        results.push(_assert('partial geometry: placedCarCount reduces gracefully (neither 0 nor the full 4 requested)',
          result.placedCarCount > 0 && result.placedCarCount < 4 && result.geometryInsufficient === true, result));
      })();

      (function () {
        // requestedCarCount honored exactly when geometry supports it —
        // this is how a real train with configuredCarCount < 4 is expected
        // to render fewer than 4 visual cars (the caller passes the smaller
        // count; this function has no independent car-count opinion).
        var points = [];
        for (var i = 0; i <= 10; i++) points.push([40.7000 + i * 0.0001, -74.0000]);
        var seg = { points: points, fromIdx: 0, toIdx: 10 };
        var result = layer.__computeCarPlacementsForTests(seg, [-74.0000, 40.7005], null, 1, CAR_LEN);
        results.push(_assert('requestedCarCount=1 on ample geometry places exactly 1, not 4',
          result.placedCarCount === 1 && result.requestedCarCount === 1 && !result.geometryInsufficient, result));
      })();

      (function () {
        // Metric midpoint, not naive lon/lat averaging — center is derived
        // by unprojecting the local-METERS midpoint of the two couplers.
        // At car-length spans this is numerically indistinguishable from a
        // naive lon/lat average (both front/rear sit within ~18m of the
        // same reference latitude, where the local linear projection this
        // function uses and a plain degree average coincide to well under
        // a millimeter) — the point of this test is to lock down that the
        // ACTUAL center value matches the geometrically-correct midpoint of
        // the two real coupler points, not some other point entirely (e.g.
        // a stale cursor or an asymmetric offset), which naive-average
        // comparison catches just as reliably as a true metric-frame check
        // would at this scale.
        var points = [];
        for (var i = 0; i <= 10; i++) points.push([40.7000 + i * 0.0001, -74.0000]);
        var seg = { points: points, fromIdx: 0, toIdx: 10 };
        var result = layer.__computeCarPlacementsForTests(seg, [-74.0000, 40.7005], null, 1, CAR_LEN);
        var p = result.placements[0];
        var expectedLon = (p.frontCoupler[0] + p.rearCoupler[0]) / 2;
        var expectedLat = (p.frontCoupler[1] + p.rearCoupler[1]) / 2;
        results.push(_assert('center is the true midpoint of front/rear couplers (metric-frame computation, matches expected midpoint to sub-micrometer precision)',
          Math.abs(p.lon - expectedLon) < 1e-9 && Math.abs(p.lat - expectedLat) < 1e-9,
          { center: [p.lon, p.lat], expected: [expectedLon, expectedLat] }));
      })();

      (function () {
        // Degenerate inputs never throw.
        results.push(_assert('null shapeSegment returns empty/insufficient without throwing',
          (function () {
            var r = layer.__computeCarPlacementsForTests(null, null, null, 4, CAR_LEN);
            return r.placedCarCount === 0 && r.geometryInsufficient === true;
          })()));
        var dwellSegNoEvidence = { points: [[40.7000, -74.0000], [40.7001, -74.0000]], fromIdx: 0, toIdx: 0 };
        results.push(_assert('dwelling with no directional evidence returns empty/insufficient without throwing',
          (function () {
            var r = layer.__computeCarPlacementsForTests(dwellSegNoEvidence, [-74.0000, 40.70005], null, 4, CAR_LEN);
            return r.placedCarCount === 0 && r.geometryInsufficient === true;
          })()));
      })();
    } else {
      results.push(_assert('SBE.Subway3DTrainActorLayer.__computeCarPlacementsForTests is available', false));
    }

    // ── Multi-train actor lifecycle — 0825_WOS_Global_3D_Train_Visibility_LOD
    // spec §20 point 8: actor retirement must remove stale logical-train
    // state, not just hide it. This drives _tick() end-to-end (via the
    // test-only __tickForTests/__setMapForTests/__resetForTests seams —
    // same "exported despite the name" convention as
    // SubwayLogicalRollingStockAuthority's own test hooks) against fully
    // mocked authorities and a mock map — never real Mapbox/THREE. The pure
    // visibility DECISION itself (who gets promoted) is already covered by
    // subway3DVisibilityPolicy.tests.js; this file only proves the ACTOR
    // correctly acts on that decision: creates real per-train car instances
    // on promotion, and — the part no pure function alone can prove —
    // actually deletes a train's ConsistState (and disposes its car
    // instances) when the policy stops promoting it.
    if (layer.__tickForTests && layer.__setMapForTests && layer.__resetForTests && layer.__debugGetConsists &&
        global.SBE.Subway3DVisibilityPolicy) {

      function _mockMap(zoom) {
        return {
          getLayer: function () { return null; },
          addLayer: function () {},
          removeLayer: function () {},
          getZoom: function () { return zoom; },
          getCanvas: function () { return { clientWidth: 1000, clientHeight: 800 }; },
          project: function () { return { x: 500, y: 400 }; }, // dead-center — every candidate is in-viewport, distance 0
          queryTerrainElevation: function () { return null; },
          triggerRepaint: function () {},
        };
      }

      function _mockRollingStock(trainSpecs) {
        // trainSpecs: [{id, carCount}]
        return {
          getActiveLogicalTrains: function () { return trainSpecs.map(function (t) { return { id: t.id, consistId: 'consist-' + t.id }; }); },
          getPositionState: function (id) { return { position: [-74.0, 40.70], nextStopId: null }; },
          getLogicalTrain: function (id) {
            var found = trainSpecs.filter(function (t) { return t.id === id; })[0];
            return found ? { id: id, consistId: 'consist-' + id } : null;
          },
          getLogicalConsist: function (cid) {
            var found = trainSpecs.filter(function (t) { return 'consist-' + t.id === cid; })[0];
            return found ? { id: cid, configuredCarCount: found.carCount } : null;
          },
          getLogicalCarsForConsist: function () { return []; },
          MAX_LOGICAL_CAR_COUNT: 11,
        };
      }

      function _mockAdapter(disposedLog) {
        return {
          isLoaded: function () { return true; },
          load: function () {},
          createInstance: function (identity) {
            var visible = true, transform = { lon: null, lat: null, altM: null, headingDeg: null };
            return {
              group: {},
              setTransform: function (lon, lat, altM, headingDeg) { transform = { lon: lon, lat: lat, altM: altM, headingDeg: headingDeg }; },
              setVisibility: function (v) { visible = v; },
              getLastTransform: function () { return transform; },
              getIdentity: function () { return identity; },
              disposeInstance: function () { disposedLog.push(identity.id); },
            };
          },
          disposeSharedAsset: function () {},
        };
      }

      // No selection, not riding — every promotion in this block is purely
      // automatic (viewport-proximity) so it exercises the SAME code path
      // the global-visibility feature actually adds, not just the
      // already-proven single-selected-train compatibility case.
      var _noSelectionMapLayer = { getSelectedTrain: function () { return null; } };
      var _notRidingAuthority = { getSnapshot: function () { return { status: 'idle', selectedLogicalTrainId: null }; } };
      // Never reaches the 'update' branch (bodyCenter always null — no real
      // GTFS/journey state exists in this pure test env) — creation/
      // disposal is proven independently of placement math, which is
      // already exhaustively covered above.
      var _noMotionModel = { buildMotionState: function () { return { bodyCenter: null, shapeSegment: null }; }, CANONICAL_CAR_LENGTH_M: 18.3 };

      function _withStubs(overrides, fn) {
        var saved = {};
        Object.keys(overrides).forEach(function (key) { saved[key] = global.SBE[key]; global.SBE[key] = overrides[key]; });
        try { return fn(); } finally { Object.keys(saved).forEach(function (key) { global.SBE[key] = saved[key]; }); }
      }

      (function () {
        var disposedLog = [];
        _withStubs({
          MTASubwayMapLayer: _noSelectionMapLayer,
          SubwayItineraryRideAuthority: _notRidingAuthority,
          SubwayTrainMotionModel: _noMotionModel,
          SubwayLogicalRollingStockAuthority: _mockRollingStock([{ id: 'trainA', carCount: 2 }]),
          SubwayTrainCarVisualAdapter: _mockAdapter(disposedLog),
        }, function () {
          layer.__resetForTests();
          layer.__setMapForTests(_mockMap(16)); // >= fullConsistMinZoom — eligible for automatic promotion
          layer.__tickForTests();
          var consists = layer.__debugGetConsists();
          results.push(_assert('auto-eligible candidate is promoted: exactly one consist created',
            consists.length === 1 && consists[0].logicalTrainId === 'trainA', consists));
          results.push(_assert('promoted consist creates the real requested car count (2), not a fixed/default count',
            consists.length === 1 && consists[0].carInstanceCount === 2, consists));

          // Now the train falls out of range entirely (simulates leaving
          // viewport/zoom eligibility) — the policy will promote nothing.
          global.SBE.SubwayLogicalRollingStockAuthority = _mockRollingStock([]);
          layer.__tickForTests();
          var afterRetire = layer.__debugGetConsists();
          results.push(_assert('retired train (spec §20 pt.8): ConsistState is actually DELETED, not just hidden',
            afterRetire.length === 0, afterRetire));
          results.push(_assert('retired train: disposeInstance() was called on every one of its car instances',
            disposedLog.length === 2, disposedLog));

          layer.__resetForTests();
        });
      })();

      (function () {
        // Two simultaneous trains — proves per-train state is genuinely
        // independent (different car counts, both created, neither
        // clobbers the other's ConsistState), the core structural change
        // this restructuring makes.
        var disposedLog = [];
        _withStubs({
          MTASubwayMapLayer: _noSelectionMapLayer,
          SubwayItineraryRideAuthority: _notRidingAuthority,
          SubwayTrainMotionModel: _noMotionModel,
          SubwayLogicalRollingStockAuthority: _mockRollingStock([{ id: 'trainA', carCount: 2 }, { id: 'trainB', carCount: 3 }]),
          SubwayTrainCarVisualAdapter: _mockAdapter(disposedLog),
        }, function () {
          layer.__resetForTests();
          layer.__setMapForTests(_mockMap(16));
          layer.__tickForTests();
          var consists = layer.__debugGetConsists();
          var byId = {}; consists.forEach(function (c) { byId[c.logicalTrainId] = c; });
          results.push(_assert('two simultaneously-eligible trains both get independent consists',
            consists.length === 2 && byId.trainA && byId.trainB, consists));
          results.push(_assert('each train\'s consist has its OWN correct car count, not shared/clobbered state',
            byId.trainA && byId.trainA.carInstanceCount === 2 && byId.trainB && byId.trainB.carInstanceCount === 3, consists));

          // Retiring ONLY trainA must not disturb trainB's already-live consist.
          global.SBE.SubwayLogicalRollingStockAuthority = _mockRollingStock([{ id: 'trainB', carCount: 3 }]);
          layer.__tickForTests();
          var afterPartialRetire = layer.__debugGetConsists();
          results.push(_assert('retiring one train leaves the other train\'s consist completely untouched',
            afterPartialRetire.length === 1 && afterPartialRetire[0].logicalTrainId === 'trainB' &&
            afterPartialRetire[0].carInstanceCount === 3, afterPartialRetire));

          layer.__resetForTests();
        });
      })();

      (function () {
        // Below the automatic promotion zoom threshold, zero candidates
        // qualify — no consist should ever be created. Guards against a
        // regression where the actor promotes independent of the policy's
        // own zoom gate.
        var disposedLog = [];
        _withStubs({
          MTASubwayMapLayer: _noSelectionMapLayer,
          SubwayItineraryRideAuthority: _notRidingAuthority,
          SubwayTrainMotionModel: _noMotionModel,
          SubwayLogicalRollingStockAuthority: _mockRollingStock([{ id: 'trainA', carCount: 2 }]),
          SubwayTrainCarVisualAdapter: _mockAdapter(disposedLog),
        }, function () {
          layer.__resetForTests();
          layer.__setMapForTests(_mockMap(10)); // well below fullConsistMinZoom
          layer.__tickForTests();
          var consists = layer.__debugGetConsists();
          results.push(_assert('far zoom: no automatic candidate is promoted, no consist created',
            consists.length === 0, consists));
          layer.__resetForTests();
        });
      })();
    } else {
      results.push(_assert('SBE.Subway3DTrainActorLayer multi-train test seams (__tickForTests/__setMapForTests/__resetForTests/__debugGetConsists) and SBE.Subway3DVisibilityPolicy are available', false));
    }

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };

    console.log('[Subway3DTrainActorLayerTests] ' + (summary.ok ? 'PASS' : 'FAIL') +
      ' — ' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
    if (failed.length) console.warn('[Subway3DTrainActorLayerTests] failures:', failed);

    return summary;
  }

  SBE.Subway3DTrainActorLayerTests = { run: run };

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.subway3DTrainActorLayer = { runTests: run };
})(window);
