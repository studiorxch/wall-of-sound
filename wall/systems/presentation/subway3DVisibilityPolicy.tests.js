// ── Subway3DVisibilityPolicy Tests v1.0.0 ────────────────────────────────────
// 0825_WOS_Global_3D_Train_Visibility_LOD_v1.0.0 — spec §20 pure policy tests.
// Status: active | Classification: test-harness (dependency-free, no THREE/
// Mapbox — this module never touches either, verified by these tests using
// no stubs for them at all).
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function run() {
    var policy = SBE.Subway3DVisibilityPolicy;
    var results = [];

    if (!policy || !policy.resolveVisibility) {
      results.push(_assert('SBE.Subway3DVisibilityPolicy.resolveVisibility is available', false));
      console.log('[Subway3DVisibilityPolicyTests] FAIL — module not available');
      return { ok: false, total: 1, failed: 1, results: results };
    }

    var MIN_ZOOM = policy.SUBWAY_3D_LOD.fullConsistMinZoom;

    // 1. Far zoom returns zero automatic 3D candidates.
    (function () {
      var candidates = [
        { logicalTrainId: 'a', distanceFromCenterPx: 10, inViewport: true, isSelected: false, isRiding: false },
        { logicalTrainId: 'b', distanceFromCenterPx: 20, inViewport: true, isSelected: false, isRiding: false },
      ];
      var r = policy.resolveVisibility({ zoom: MIN_ZOOM - 5, candidates: candidates, previouslyPromotedTrainIds: [] });
      results.push(_assert('far zoom: zero automatic candidates promoted', r.promotedTrainIds.length === 0, r));
      results.push(_assert('far zoom: counts.eligibleCount is 0', r.counts.eligibleCount === 0, r.counts));
    })();

    // 2. Close zoom returns only viewport-qualified candidates.
    (function () {
      var candidates = [
        { logicalTrainId: 'in-view', distanceFromCenterPx: 10, inViewport: true, isSelected: false, isRiding: false },
        { logicalTrainId: 'off-screen', distanceFromCenterPx: 9999, inViewport: false, isSelected: false, isRiding: false },
      ];
      var r = policy.resolveVisibility({ zoom: MIN_ZOOM, candidates: candidates, previouslyPromotedTrainIds: [] });
      results.push(_assert('close zoom: in-viewport candidate promoted',
        r.promotedTrainIds.indexOf('in-view') !== -1, r));
      results.push(_assert('close zoom: off-screen candidate NOT promoted',
        r.promotedTrainIds.indexOf('off-screen') === -1, r));
    })();

    // 3. Selected train receives priority — promoted even off-screen, even at far zoom.
    (function () {
      var candidates = [
        { logicalTrainId: 'sel', distanceFromCenterPx: 9999, inViewport: false, isSelected: true, isRiding: false },
      ];
      var r = policy.resolveVisibility({ zoom: 0, candidates: candidates, previouslyPromotedTrainIds: [] });
      results.push(_assert('selected train promoted regardless of zoom/viewport',
        r.promotedTrainIds.indexOf('sel') !== -1 && r.selectedTrainIds.indexOf('sel') !== -1, r));
    })();

    // 4. Riding train receives highest priority — promoted even beyond the automatic cap.
    (function () {
      var candidates = [
        { logicalTrainId: 'ride', distanceFromCenterPx: 9999, inViewport: false, isSelected: false, isRiding: true },
        { logicalTrainId: 'auto1', distanceFromCenterPx: 10, inViewport: true, isSelected: false, isRiding: false },
        { logicalTrainId: 'auto2', distanceFromCenterPx: 20, inViewport: true, isSelected: false, isRiding: false },
      ];
      var r = policy.resolveVisibility({ zoom: MIN_ZOOM, candidates: candidates, previouslyPromotedTrainIds: [], maxAutoTrains: 1 });
      results.push(_assert('riding train promoted regardless of zoom/viewport/cap',
        r.promotedTrainIds.indexOf('ride') !== -1 && r.ridingTrainIds.indexOf('ride') !== -1, r));
      results.push(_assert('riding train does not consume the automatic cap budget (auto1 still gets its 1 slot)',
        r.autoPromotedTrainIds.length === 1 && r.autoPromotedTrainIds[0] === 'auto1', r));
    })();

    // 5. Automatic candidate cap is deterministic — same input twice, same output; nearest-first ordering.
    (function () {
      var candidates = [
        { logicalTrainId: 'far', distanceFromCenterPx: 300, inViewport: true, isSelected: false, isRiding: false },
        { logicalTrainId: 'near', distanceFromCenterPx: 5, inViewport: true, isSelected: false, isRiding: false },
        { logicalTrainId: 'mid', distanceFromCenterPx: 100, inViewport: true, isSelected: false, isRiding: false },
      ];
      var r1 = policy.resolveVisibility({ zoom: MIN_ZOOM, candidates: candidates, previouslyPromotedTrainIds: [], maxAutoTrains: 2 });
      var r2 = policy.resolveVisibility({ zoom: MIN_ZOOM, candidates: candidates, previouslyPromotedTrainIds: [], maxAutoTrains: 2 });
      results.push(_assert('cap is deterministic — identical input produces identical output',
        JSON.stringify(r1.promotedTrainIds) === JSON.stringify(r2.promotedTrainIds), { r1: r1.promotedTrainIds, r2: r2.promotedTrainIds }));
      results.push(_assert('cap prefers nearest-to-center first (near, mid — not far)',
        r1.autoPromotedTrainIds.length === 2 && r1.autoPromotedTrainIds[0] === 'near' && r1.autoPromotedTrainIds[1] === 'mid', r1));
      results.push(_assert('the third (farthest) candidate is reported rejected-by-cap',
        r1.rejectedByCapTrainIds.indexOf('far') !== -1, r1));
    })();

    // 6. Duplicate logical train ids cannot create duplicate actors.
    (function () {
      var candidates = [
        { logicalTrainId: 'dup', distanceFromCenterPx: 5, inViewport: true, isSelected: false, isRiding: false },
        { logicalTrainId: 'dup', distanceFromCenterPx: 5, inViewport: true, isSelected: false, isRiding: false },
      ];
      var r = policy.resolveVisibility({ zoom: MIN_ZOOM, candidates: candidates, previouslyPromotedTrainIds: [] });
      results.push(_assert('duplicate candidate ids collapse to a single promotion',
        r.promotedTrainIds.length === 1 && r.counts.candidateCount === 1, r));
    })();

    // 7. Hysteresis prevents immediate promote/demote thrash.
    (function () {
      var candidates = [
        { logicalTrainId: 'retained', distanceFromCenterPx: 5, inViewport: true, isSelected: false, isRiding: false },
      ];
      var justBelow = MIN_ZOOM - 0.5; // within the default 1.0 retention hysteresis band
      var farBelow = MIN_ZOOM - 5; // well outside the hysteresis band
      var rRetained = policy.resolveVisibility({ zoom: justBelow, candidates: candidates, previouslyPromotedTrainIds: ['retained'] });
      var rNotYetPromoted = policy.resolveVisibility({ zoom: justBelow, candidates: candidates, previouslyPromotedTrainIds: [] });
      var rDropped = policy.resolveVisibility({ zoom: farBelow, candidates: candidates, previouslyPromotedTrainIds: ['retained'] });
      results.push(_assert('a previously-promoted train is RETAINED just below the promotion threshold (hysteresis)',
        rRetained.promotedTrainIds.indexOf('retained') !== -1, rRetained));
      results.push(_assert('a train NOT previously promoted does NOT newly qualify just below the threshold',
        rNotYetPromoted.promotedTrainIds.indexOf('retained') === -1, rNotYetPromoted));
      results.push(_assert('a previously-promoted train IS dropped once zoom falls outside the hysteresis band',
        rDropped.promotedTrainIds.indexOf('retained') === -1, rDropped));
    })();

    // 8. (Actor retirement / stale-state removal is a subway3DTrainActorLayer.js
    // lifecycle concern, not this pure policy's — covered in that file's own
    // test suite, since it requires the actor's per-train Map, not just a
    // decision object.)

    // 9. (Lightweight-suppression-applies-only-to-promoted-trains is explicitly
    // deferred this build per plan review — no 2D suppression exists yet to test.)

    // 10. Selected/riding override behavior survives automatic-cap saturation
    // even when the cap is fully saturated by OTHER trains and set to zero.
    (function () {
      var candidates = [
        { logicalTrainId: 'ride', distanceFromCenterPx: 1, inViewport: true, isSelected: false, isRiding: true },
        { logicalTrainId: 'sel', distanceFromCenterPx: 2, inViewport: true, isSelected: true, isRiding: false },
        { logicalTrainId: 'auto', distanceFromCenterPx: 3, inViewport: true, isSelected: false, isRiding: false },
      ];
      var r = policy.resolveVisibility({ zoom: MIN_ZOOM, candidates: candidates, previouslyPromotedTrainIds: [], maxAutoTrains: 0 });
      results.push(_assert('riding+selected both survive a fully saturated (zero) automatic cap',
        r.promotedTrainIds.indexOf('ride') !== -1 && r.promotedTrainIds.indexOf('sel') !== -1, r));
      results.push(_assert('the ordinary automatic candidate is correctly rejected by the zero cap',
        r.promotedTrainIds.indexOf('auto') === -1 && r.rejectedByCapTrainIds.indexOf('auto') !== -1, r));
    })();

    // A train that is BOTH riding and selected is promoted exactly once (riding takes precedence, no double-count).
    (function () {
      var candidates = [
        { logicalTrainId: 'both', distanceFromCenterPx: 5, inViewport: true, isSelected: true, isRiding: true },
      ];
      var r = policy.resolveVisibility({ zoom: MIN_ZOOM, candidates: candidates, previouslyPromotedTrainIds: [] });
      results.push(_assert('a train that is both riding and selected is promoted exactly once, counted as riding',
        r.promotedTrainIds.length === 1 && r.ridingTrainIds.indexOf('both') !== -1 && r.selectedTrainIds.indexOf('both') === -1, r));
    })();

    // Degenerate inputs never throw.
    (function () {
      results.push(_assert('empty/undefined input returns an empty, valid result without throwing',
        (function () {
          var r = policy.resolveVisibility();
          return r.promotedTrainIds.length === 0 && r.counts.candidateCount === 0;
        })()));
      results.push(_assert('a candidate with no logicalTrainId is ignored, not thrown on',
        (function () {
          var r = policy.resolveVisibility({ zoom: MIN_ZOOM, candidates: [{ distanceFromCenterPx: 1, inViewport: true }], previouslyPromotedTrainIds: [] });
          return r.promotedTrainIds.length === 0;
        })()));
    })();

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };

    console.log('[Subway3DVisibilityPolicyTests] ' + (summary.ok ? 'PASS' : 'FAIL') +
      ' — ' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
    if (failed.length) console.warn('[Subway3DVisibilityPolicyTests] failures:', failed);

    return summary;
  }

  SBE.Subway3DVisibilityPolicyTests = { run: run };

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.subway3DVisibilityPolicy = { runTests: run };
})(window);
