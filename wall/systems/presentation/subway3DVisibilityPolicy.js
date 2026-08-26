// ── Subway3DVisibilityPolicy v1.0.0 ──────────────────────────────────────────
// 0825_WOS_Global_3D_Train_Visibility_LOD_v1.0.0 — §4/§6-9 pure visibility/LOD
// decision module.
// Status: active | Classification: presentation-authority (interpretation
// layer — same category as busPresentationSelector.js/
// truthActorVisualLODPolicy.js).
//
// "Renderer draws · Selector chooses · Truth runtime knows." (established
// convention, wall/systems/transit/README.md). This module is the Selector:
// it consumes plain, already-computed candidate metadata and returns which
// logical trains should receive full 3D presentation. It does NOT:
//   - hold a map reference or call any Mapbox API (no map.project(), no
//     MapboxViewportRuntime access) — per explicit plan-review correction,
//     projection/candidate-preparation lives in subway3DTrainActorLayer.js
//     (or a tiny adapter), never here, so this module stays deterministic
//     and unit-testable without Mapbox/THREE loaded at all;
//   - read any authority directly (SubwayLogicalRollingStockAuthority,
//     MTASubwayMapLayer, SubwayItineraryRideAuthority) — the caller resolves
//     isSelected/isRiding/position into the candidate array before calling in;
//   - mutate anything, cache anything across calls, or hold a map/Set of its
//     own — every call is a pure function of its arguments. Hysteresis (see
//     below) is achieved by the CALLER passing back last tick's promoted set,
//     not by internal state.
//
// Candidate shape (plain data, no class):
//   { logicalTrainId, distanceFromCenterPx, inViewport, isSelected, isRiding }
//
// Priority order (spec §6.4/§6.5/§8): riding > selected > viewport proximity.
// Riding and selected trains are ALWAYS promoted regardless of zoom or the
// automatic cap — spec §6.5 "cannot be demoted merely because zoom/bounds
// policy changes," §9 "selected/riding trains must not disappear solely
// because the automatic cap is saturated." This also preserves the existing,
// already-proven single-selected-train behavior unchanged as the first
// compatibility case: with zero automatic candidates in the input, a single
// selected train behaves exactly as subway3DTrainActorLayer.js already did
// before this build.
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Policy constants (spec §7) — named, not scattered raw numbers ─────────
  //
  // fullConsistMinZoom is anchored to the EXISTING, already-shipped subway
  // zoom convention: mtaSubwayMapLayer.js's own CLOSE_ZOOM_THRESHOLD = 16
  // ("car-section divisions appear only this close" in the 2D presentation).
  // Reused deliberately, not reinvented — mtaSubwayMapLayer.js itself is on
  // hold this build, so this is a literal copy of that already-proven value,
  // not a new one. This value is NOT provisional.
  var FULL_CONSIST_MIN_ZOOM = 16;

  // Hysteresis (spec §7 — "add hysteresis so trains do not rapidly pop
  // between 2D and 3D... avoid one-frame flicker"): a train already promoted
  // last tick stays eligible for automatic retention down to
  // (fullConsistMinZoom - retentionZoomHysteresis), while a train NOT
  // already promoted still needs the full fullConsistMinZoom to newly
  // qualify. PROVISIONAL starting value — has not been tuned against real
  // zoom-hover behavior in a live browser yet.
  var RETENTION_ZOOM_HYSTERESIS = 1.0;

  // Hard cap on AUTOMATIC (viewport-proximity, non-riding, non-selected)
  // promotions only — riding/selected trains are never counted against or
  // rejected by this cap (spec §9). PROVISIONAL — deliberately conservative
  // pending real close-zoom Manhattan/Brooklyn density measurement (spec
  // §5.6 audit found no existing density figure in this codebase to anchor
  // to). Calibrate this value using the counts[] instrumentation below
  // rather than guessing a "final" number now.
  var MAX_AUTO_3D_TRAINS_PROVISIONAL = 3;

  var SUBWAY_3D_LOD = Object.freeze({
    fullConsistMinZoom: FULL_CONSIST_MIN_ZOOM,
    retentionZoomHysteresis: RETENTION_ZOOM_HYSTERESIS,
    maxAutoTrains: MAX_AUTO_3D_TRAINS_PROVISIONAL,
  });

  function _sortByProximityThenId(list) {
    return list.slice().sort(function (a, b) {
      var da = typeof a.distanceFromCenterPx === 'number' ? a.distanceFromCenterPx : Infinity;
      var db = typeof b.distanceFromCenterPx === 'number' ? b.distanceFromCenterPx : Infinity;
      if (da !== db) return da - db;
      // Deterministic tie-break — same convention as busPresentationSelector.js.
      if (a.logicalTrainId < b.logicalTrainId) return -1;
      if (a.logicalTrainId > b.logicalTrainId) return 1;
      return 0;
    });
  }

  // Pure decision function. `input`:
  //   zoom                       — current map zoom (number)
  //   candidates                 — array of {logicalTrainId, distanceFromCenterPx, inViewport, isSelected, isRiding}
  //   previouslyPromotedTrainIds — array of logicalTrainId promoted as of the end of the last call (hysteresis input)
  //   fullConsistMinZoom         — optional override (defaults to SUBWAY_3D_LOD.fullConsistMinZoom)
  //   retentionZoomHysteresis    — optional override
  //   maxAutoTrains              — optional override
  function resolveVisibility(input) {
    input = input || {};
    var zoom = typeof input.zoom === 'number' ? input.zoom : 0;
    var candidatesIn = Array.isArray(input.candidates) ? input.candidates : [];
    var fullConsistMinZoom = typeof input.fullConsistMinZoom === 'number' ? input.fullConsistMinZoom : SUBWAY_3D_LOD.fullConsistMinZoom;
    var retentionZoomHysteresis = typeof input.retentionZoomHysteresis === 'number' ? input.retentionZoomHysteresis : SUBWAY_3D_LOD.retentionZoomHysteresis;
    var maxAutoTrains = typeof input.maxAutoTrains === 'number' ? input.maxAutoTrains : SUBWAY_3D_LOD.maxAutoTrains;
    var previouslyPromoted = {};
    (Array.isArray(input.previouslyPromotedTrainIds) ? input.previouslyPromotedTrainIds : []).forEach(function (id) {
      previouslyPromoted[id] = true;
    });

    var candidateCount = 0;
    var inViewportCount = 0;
    var seen = {}; // de-dupe guard — a logicalTrainId appearing twice in input is only ever considered once
    var riding = [];
    var selected = [];
    var autoEligible = [];

    candidatesIn.forEach(function (c) {
      if (!c || !c.logicalTrainId || seen[c.logicalTrainId]) return;
      seen[c.logicalTrainId] = true;
      candidateCount++;
      if (c.inViewport) inViewportCount++;

      if (c.isRiding) { riding.push(c); return; }
      if (c.isSelected) { selected.push(c); return; }

      // Automatic tier — zoom-gated (with hysteresis) and viewport-gated.
      if (!c.inViewport) return;
      var minZoomForThis = previouslyPromoted[c.logicalTrainId] ?
        (fullConsistMinZoom - retentionZoomHysteresis) : fullConsistMinZoom;
      if (zoom >= minZoomForThis) autoEligible.push(c);
    });

    riding = _sortByProximityThenId(riding);
    selected = _sortByProximityThenId(selected);
    autoEligible = _sortByProximityThenId(autoEligible);

    var eligibleCount = riding.length + selected.length + autoEligible.length;
    var cap = Math.max(0, maxAutoTrains);
    var autoPromoted = autoEligible.slice(0, cap);
    var rejectedByCap = autoEligible.slice(autoPromoted.length);

    var promotedTrainIds = riding.concat(selected, autoPromoted).map(function (c) { return c.logicalTrainId; });

    return {
      currentZoom: zoom,
      fullConsistMinZoom: fullConsistMinZoom,
      retentionZoomHysteresis: retentionZoomHysteresis,
      maxAutoTrains: maxAutoTrains,
      promotedTrainIds: promotedTrainIds,
      ridingTrainIds: riding.map(function (c) { return c.logicalTrainId; }),
      selectedTrainIds: selected.map(function (c) { return c.logicalTrainId; }),
      autoPromotedTrainIds: autoPromoted.map(function (c) { return c.logicalTrainId; }),
      rejectedByCapTrainIds: rejectedByCap.map(function (c) { return c.logicalTrainId; }),
      counts: {
        candidateCount: candidateCount,
        inViewportCount: inViewportCount,
        eligibleCount: eligibleCount,
        promotedCount: promotedTrainIds.length,
        rejectedByCapCount: rejectedByCap.length,
      },
    };
  }

  SBE.Subway3DVisibilityPolicy = Object.freeze({
    VERSION: VERSION,
    SUBWAY_3D_LOD: SUBWAY_3D_LOD,
    resolveVisibility: resolveVisibility,
  });

  console.log('[Subway3DVisibilityPolicy] v' + VERSION + ' loaded');
})(window);
