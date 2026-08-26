// ── SubwayTrainMotionModel v2.0.0 ─────────────────────────────────────────────
// 0818_SUBWAY_Train_Rendering_Palette_Library_v1.0.0_BUILD — Logic Layer §10-25
// Extended by the "SUBWAY Continuous Train Motion Fix" patch — see ROOT CAUSE
// below; this is the reason v1.0.0's motion, while mathematically continuous
// in its own unit tests, rendered as station-to-station teleporting live.
// Status: active | Classification: derived presentation (no Mapbox, no fetch,
// no DOM) with a small in-memory journey cache (see PERSISTENT JOURNEY below)
//
// A derived-presentation layer on top of SubwayLogicalRollingStockAuthority,
// same architectural role as subwayTrainVisualState.js (bearing/headsign) —
// it never recomputes trip association or the authority's own TrainPositionState,
// it only derives RENDERING physics from that already-canonical evidence.
//
// ── ROOT CAUSE (found live, quantified before any code change) ──────────────
// Real GTFS-Realtime TripUpdates are continuously TRIMMED to only their
// REMAINING stop_time_update entries as a trip progresses — the stop a train
// just departed is no longer listed. SubwayLogicalRollingStockAuthority's own
// `_computePosition()` (unmodified by this patch) honestly reports this as
// `truthState:'observed_stop'`, `observedStopId:null`,
// `source:'mta_vehicle_position_no_prior_stop'` whenever a real vehicle is
// IN_TRANSIT_TO/INCOMING_AT a stop that happens to be the FIRST entry left in
// its own trimmed stopTimes — which, live-verified across the full real
// network, was the OVERWHELMING majority of every currently-moving train
// (113 of 114 genuinely-transiting trains sampled; only 1 had a real prior-
// stop entry survive in its own trimmed TripUpdate). v1.0.0 of this module
// only ran continuous motion for `truthState === 'inferred_segment'` — every
// one of those 113 real moving trains fell instead into the DWELL branch
// (`observed_stop`), which either found no shape segment (observedStopId is
// null) and rendered nothing, or froze at the raw next-station coordinate —
// exactly the reported "pause, then teleport to the next station" bug. This
// module never mutates or second-guesses the authority's own truthState
// vocabulary (still exactly observed_stop/inferred_segment/stale/unknown
// everywhere); it only recognizes, via the authority's OWN already-exposed
// `source` field, when an `observed_stop` reading is really a transiting
// train with degraded (not missing) evidence, and derives the missing
// "previous station" identity honestly from real static route/shape
// topology (never fabricated) so continuous motion can run for it too.
//
//   - which real route-shape segment a train's body sits on (and a real,
//     arc-length-walked sub-polyline of that segment for the elongated body —
//     never a straight-line chord that could leave the shape on a tight curve)
//   - a deterministic accel/cruise/decel EASING of segment progress
//   - a direction lane key ('A'/'B'/null) from real NYCT evidence — the
//     nyct.direction NORTH/SOUTH field the authority already exposes via
//     SubwayTrainVisualState.directionId, falling back to the direction
//     letter NYCT itself encodes in the raw trip_id ("..N"/"..S", the
//     standard NYCT GTFS-Realtime trip-id convention) when nyct.direction is
//     absent — never a guessed screen orientation.
//   - a real remaining-time-to-next-stop when the trip's own stopTimes carry
//     arrival/departure evidence for the upcoming stop, for ETA-informed
//     segment duration — read directly from the same canonical
//     TransitTripRef.stopTimes[] every other module in this build already
//     reads (subwayArrivalIntelligence.js, subwayTrainVisualState.js); never
//     a second parser.
//
// ── PERSISTENT JOURNEY (new this patch) ──────────────────────────────────────
// A small in-memory (never localStorage — recomputed derived state, same
// convention as the rolling-stock authority's own un-persisted
// TrainPositionState) cache keyed by logicalTrainId, tracking the CURRENT
// segment a train is journeying across: `journeyEstablishedAt` (when THIS
// segment was first observed — the tier-B fallback's honest "segment start"
// anchor when no real departure timestamp survives), plus the last rendered
// visual progress/time for monotonicity and speed-sanity bounding across
// calls. A new realtime poll UPDATES the existing journey's target evidence
// in place (never resets `journeyEstablishedAt`/visual progress) as long as
// the train is still journeying toward the SAME derived segment — this is
// what makes a same-segment poll never teleport the render. A genuine
// segment change (the train truly advanced to a new pair of stations) starts
// a fresh journey, which is a real, expected, non-teleporting transition
// (the old journey's final position and the new one's start are the same
// real station).
//
// This module never becomes canonical identity. `bodyPolyline`/`bodyCenter`/
// `motionPhase`/`directionLaneKey`/`renderLengthMeters` are throwaway,
// recomputed-on-demand presentation values — logicalTrainId/tripId/routeId
// are always pass-throughs of the rolling-stock authority's own record. The
// journey cache is presentation-only continuity state, not a second
// identity/position authority — it is keyed BY the authority's own
// logicalTrainId and discarded/rebuilt freely; deleting it never changes
// what the authority itself believes about a train.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '2.0.0';

  // A single documented approximation, not a physical engineering claim
  // (BUILD §11 explicitly permits this): a typical NYCT subway car is
  // commonly cited between ~51ft (R32/R42-era) and ~75ft (R44/R46) —
  // 18.3m (~60ft) is a reasonable rounded middle figure covering both A and
  // B division stock as a single constant. Combined with the train's own
  // ALREADY-KNOWN configuredCarCount (from the Logical Rolling Stock build,
  // default 10) this becomes a route/consist-aware value rather than one
  // flat number for every train, per BUILD §11's own preferred option.
  var CANONICAL_CAR_LENGTH_M = 18.3;

  // Minimum on-screen readable body length, converted to real-world meters
  // at the current zoom/latitude via the standard Web Mercator
  // meters-per-pixel formula — a real, well-known formula, not invented.
  var MIN_READABLE_PIXELS = 14;

  // Motion easing phase boundaries (BUILD §20 — "exact phase boundaries may
  // be tuned live").
  var ACCEL_END = 0.15;
  var DECEL_START = 0.75;

  // ETA-informed animation window bounds (BUILD §18) — real evidence when
  // available, clamped to a workable visual cadence; never fabricates the
  // ETA value itself, only bounds how long the EASED WALK is allowed to take
  // so an extremely-far real ETA doesn't freeze the visible motion for
  // minutes. Falls back to this same window's upper/lower bound as the
  // "strongest truthful existing interpolation model" (BUILD §18) when no
  // real timing evidence resolves at all — matches the fixed animation
  // window this codebase already used before this build (disclosed, not a
  // fabricated prediction).
  var MIN_SEGMENT_ANIM_MS = 2500;
  var MAX_SEGMENT_ANIM_MS = 20000;
  var FALLBACK_SEGMENT_ANIM_MS = 5000;

  // Conservative presentation-only speed sanity bound (Continuous Motion Fix
  // §7) — real NYC subway top speed is well under this even on express
  // segments; this exists only to bound how fast VISUAL progress is allowed
  // to jump in response to a sudden realtime evidence change (e.g. a
  // corrected ETA), never to claim a real train speed. 25 m/s = 90 km/h.
  var MAX_PRESENTATION_SPEED_MPS = 25;

  // Persistent per-train journey cache (Continuous Motion Fix §2) — see file
  // header. Never persisted to localStorage; rebuilt freely; keyed by the
  // authority's own logicalTrainId, never a second identity.
  var _journeys = {};

  // ── Station-skip catch-up (R/Broadway/Bay Ridge corridor investigation)
  //    — see the DWELL branch below for the full root-cause writeup. Tracks
  //    the last real station this train was honestly rendered at/toward,
  //    scoped by tripId so a mid-session trip re-association (a real,
  //    observed mechanism — SubwayLogicalRollingStockAuthority's own
  //    "pool_reassignment") never glides across two unrelated real
  //    journeys. Never persisted; rebuilt freely. ──────────────────────────
  var _lastRendered = {};    // logicalTrainId -> { tripId, stopId }
  var _catchUpJourneys = {}; // logicalTrainId -> { key, segRange, startedAt, durationMs }
  var MAX_CATCHUP_DISTANCE_M = 3000; // sanity bound — never glide an unrelated real distance
  var CATCHUP_ASSUMED_SPEED_MPS = 8; // a reasonable presentation-only average pace for a skipped real distance, well under MAX_PRESENTATION_SPEED_MPS

  function _store() { return SBE.MTASubwayTransitStore || null; }
  function _rollingStock() { return SBE.SubwayLogicalRollingStockAuthority || null; }
  function _trainVisualState() { return SBE.SubwayTrainVisualState || null; }

  // ── Real geodesy — same class of formula already proven in this build's
  //    prior session (destination-point / bearing); haversine distance is
  //    the standard companion formula, equally real. ───────────────────────
  var EARTH_RADIUS_M = 6371000;
  function _toRad(deg) { return (deg * Math.PI) / 180; }
  function _haversineMeters(a, b) {
    // a, b: [lon, lat]
    var dLat = _toRad(b[1] - a[1]), dLon = _toRad(b[0] - a[0]);
    var lat1 = _toRad(a[1]), lat2 = _toRad(b[1]);
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function _metersPerPixel(zoom, latitudeDeg) {
    return (156543.03392 * Math.cos(_toRad(latitudeDeg))) / Math.pow(2, zoom);
  }

  // ── Real shape-segment resolution — mirrors the matching approach
  //    SubwayLogicalRollingStockAuthority._interpolateAlongShape already
  //    uses (nearest-point-within-threshold per candidate shape), kept as an
  //    independent small pure utility here since the authority does not
  //    export its own — this module never reads the authority's private
  //    state, only its already-public route/station/shape data via the
  //    store, exactly like every other reader in this codebase (BUILD §5:
  //    "do not create a visual train ID independent from logicalTrainId" —
  //    this reuses the authority's REAL, already-computed pos/progress; it
  //    only re-derives which real polyline indices that position sits
  //    between, a pure geometry lookup, not an identity decision). ────────
  var SHAPE_MATCH_THRESHOLD_DEG = 0.01; // ~1.1km — matches the authority's own tolerance
  function _distDeg(a, b) { var dLat = a[0] - b[0], dLon = a[1] - b[1]; return Math.sqrt(dLat * dLat + dLon * dLon); }
  function _nearestIndex(points, station) {
    var best = -1, bestDist = Infinity;
    for (var i = 0; i < points.length; i++) {
      var d = _distDeg(points[i], [station.latitude, station.longitude]);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return (best !== -1 && bestDist <= SHAPE_MATCH_THRESHOLD_DEG) ? best : null;
  }

  // Resolves the real shape polyline + continuous index range a train's
  // current segment (or single dwell point) sits on. Returns null when no
  // shape can be confidently matched — never a fabricated segment.
  function _resolveShapeSegmentUncached(store, routeId, prevStationId, nextStationId) {
    var route = store.getRoute(routeId);
    if (!route || !route.shapeIds || !route.shapeIds.length) return null;
    var prevStation = prevStationId ? store.getStation(prevStationId) : null;
    var nextStation = nextStationId ? store.getStation(nextStationId) : null;
    var anchorStation = nextStation || prevStation;
    if (!anchorStation) return null;

    for (var s = 0; s < route.shapeIds.length; s++) {
      var shapeId = route.shapeIds[s];
      var points = store.getShapePoints(shapeId);
      if (!points || points.length < 2) continue;
      var anchorIdx = _nearestIndex(points, anchorStation);
      if (anchorIdx == null) continue;
      var otherIdx = (prevStation && nextStation) ? _nearestIndex(points, prevStation) : anchorIdx;
      if (otherIdx == null) otherIdx = anchorIdx;
      return { shapeId: shapeId, points: points, fromIdx: otherIdx, toIdx: anchorIdx };
    }
    return null;
  }

  // PERFORMANCE — memoized wrapper (Continuous Motion Fix). Real station
  // coordinates and real route shapes are static for the lifetime of a
  // session (loaded once from the static GTFS snapshot), so the SAME
  // (routeId, prevStationId, nextStationId) triple always resolves to the
  // SAME real segment — safe to cache permanently rather than re-searching
  // shape geometry on every animation tick for every train. Live-measured
  // necessary: many trains genuinely share the same route+station pair
  // (dwelling at the same real platform, or transiting the same real
  // segment), and the per-journey cache in buildMotionState only covers a
  // SINGLE train's own repeated calls, not this cross-train sharing.
  var _shapeSegmentMemo = {};
  function _resolveShapeSegment(store, routeId, prevStationId, nextStationId) {
    var key = routeId + '|' + (prevStationId || '') + '|' + (nextStationId || '');
    if (key in _shapeSegmentMemo) return _shapeSegmentMemo[key];
    var result = _resolveShapeSegmentUncached(store, routeId, prevStationId, nextStationId);
    _shapeSegmentMemo[key] = result;
    return result;
  }

  // ── Real static-topology previous-station derivation (Continuous Motion
  //    Fix, ROOT CAUSE above) — used ONLY when the authority's own
  //    `observedStopId` is null because the realtime TripUpdate has already
  //    trimmed the departed-from stop out of its stop_time_update list. This
  //    NEVER guesses a direction convention (shape index ordering differs
  //    per shape file) — it derives the real direction of travel FOR THIS
  //    SPECIFIC TRIP from two of the trip's own still-remaining real
  //    stopTimes entries (`toStopId` and the one after it), then walks the
  //    real matched shape index the opposite way to find the real station
  //    that must have preceded `toStopId`. Returns null (never a fabricated
  //    station) when the trip has fewer than 2 remaining stopTimes entries
  //    (can't determine direction) or no adjacent real station exists on the
  //    matched shape. ─────────────────────────────────────────────────────
  function _derivePreviousStopIdViaTopologyUncached(store, routeId, toStopId, afterStopId) {
    var route = store.getRoute(routeId);
    if (!route || !route.shapeIds || !route.shapeIds.length) return null;
    var toStation = store.getStation(toStopId);
    var afterStation = store.getStation(afterStopId);
    if (!toStation || !afterStation) return null;

    for (var s = 0; s < route.shapeIds.length; s++) {
      var points = store.getShapePoints(route.shapeIds[s]);
      if (!points || points.length < 3) continue;
      var toIdx = _nearestIndex(points, toStation);
      var afterIdx = _nearestIndex(points, afterStation);
      if (toIdx == null || afterIdx == null || toIdx === afterIdx) continue;

      // Real direction of travel for THIS trip on THIS shape: index moves
      // from toIdx toward afterIdx as the trip progresses, so the departed
      // (previous) station sits on the OPPOSITE side of toIdx.
      var travelIncreasing = afterIdx > toIdx;
      var allStations = store.getAllStations().filter(function (st) {
        return st.kind === 'station' && st.routeIds.indexOf(route.id) !== -1;
      });
      var best = null, bestIdx = null;
      for (var i = 0; i < allStations.length; i++) {
        if (allStations[i].id === toStopId) continue;
        var idx = _nearestIndex(points, allStations[i]);
        if (idx == null) continue;
        if (travelIncreasing ? idx < toIdx : idx > toIdx) {
          if (bestIdx == null || (travelIncreasing ? idx > bestIdx : idx < bestIdx)) { bestIdx = idx; best = allStations[i]; }
        }
      }
      if (best) return best.id;
    }
    return null;
  }

  // PERFORMANCE — memoized wrapper, same rationale as _resolveShapeSegment
  // above: real static topology, safe to cache permanently per session.
  // Needs the trip only to read its two real still-remaining stopTimes
  // entries (toStopId/afterStopId) — the actual geometry search depends
  // only on those two real station ids and the route, so the memo key is
  // built from them, not from the trip object itself (many different trips
  // heading to the same next stop with the same following stop resolve
  // identically).
  var _prevStopTopologyMemo = {};
  function _derivePreviousStopIdViaTopology(store, routeId, toStopId, trip) {
    if (!trip || !toStopId) return null;
    var stopTimes = trip.stopTimes || [];
    if (stopTimes.length < 2 || stopTimes[0].stationId !== toStopId) return null;
    var afterStopId = stopTimes[1].stationId;
    var key = routeId + '|' + toStopId + '|' + afterStopId;
    if (key in _prevStopTopologyMemo) return _prevStopTopologyMemo[key];
    var result = _derivePreviousStopIdViaTopologyUncached(store, routeId, toStopId, afterStopId);
    _prevStopTopologyMemo[key] = result;
    return result;
  }

  // Real cumulative arc-length of a [fromIdx,toIdx] shape range, in meters —
  // used only for the speed-sanity bound (§7), never for identity/geometry.
  function _segmentLengthMeters(points, fromIdx, toIdx) {
    var lo = Math.max(0, Math.min(fromIdx, toIdx)), hi = Math.min(points.length - 1, Math.max(fromIdx, toIdx));
    var total = 0;
    for (var i = Math.floor(lo); i < Math.ceil(hi); i++) {
      if (i + 1 > points.length - 1) break;
      total += _haversineMeters([points[i][1], points[i][0]], [points[i + 1][1], points[i + 1][0]]);
    }
    return total;
  }

  function _pointAtContinuousIndex(points, contIdx) {
    var i0 = Math.max(0, Math.min(points.length - 1, Math.floor(contIdx)));
    var i1 = Math.max(0, Math.min(points.length - 1, contIdx >= i0 ? i0 + 1 : i0 - 1));
    var t = Math.abs(contIdx - i0);
    var p0 = points[i0], p1 = points[i1];
    var lat = p0[0] + (p1[0] - p0[0]) * t;
    var lon = p0[1] + (p1[1] - p0[1]) * t;
    return [lon, lat]; // [lon,lat] — store points are [lat,lon]
  }

  // Real arc-length walk along the shape polyline, centered at `centerIdx`
  // (a continuous index), extending `halfLengthM` in each direction. Always
  // a sub-sequence of REAL polyline vertices (plus the two fractional
  // endpoints) — never a synthetic chord, so the result cannot leave
  // canonical route geometry regardless of curve tightness. Clamped at
  // array bounds (a train near a terminal produces a naturally shorter body
  // — an honest degenerate case, not a fabricated extension past the line).
  function _walkBodyPolyline(points, centerIdx, halfLengthM) {
    var center = _pointAtContinuousIndex(points, centerIdx);
    var forward = [center], backward = [center];

    var i = centerIdx, remaining = halfLengthM, cursor = center;
    while (remaining > 0) {
      var nextI = Math.floor(i) + 1;
      if (nextI > points.length - 1) break;
      var nextPt = [points[nextI][1], points[nextI][0]];
      var segLen = _haversineMeters(cursor, nextPt);
      if (segLen <= 0) { i = nextI; continue; }
      if (segLen >= remaining) {
        var t = remaining / segLen;
        forward.push([cursor[0] + (nextPt[0] - cursor[0]) * t, cursor[1] + (nextPt[1] - cursor[1]) * t]);
        remaining = 0;
      } else {
        forward.push(nextPt);
        remaining -= segLen;
        cursor = nextPt;
        i = nextI;
      }
    }

    i = centerIdx; remaining = halfLengthM; cursor = center;
    while (remaining > 0) {
      var prevI = Math.ceil(i) - 1;
      if (prevI < 0) break;
      var prevPt = [points[prevI][1], points[prevI][0]];
      var segLenB = _haversineMeters(cursor, prevPt);
      if (segLenB <= 0) { i = prevI; continue; }
      if (segLenB >= remaining) {
        var tB = remaining / segLenB;
        backward.push([cursor[0] + (prevPt[0] - cursor[0]) * tB, cursor[1] + (prevPt[1] - cursor[1]) * tB]);
        remaining = 0;
      } else {
        backward.push(prevPt);
        remaining -= segLenB;
        cursor = prevPt;
        i = prevI;
      }
    }

    backward.reverse();
    return backward.concat(forward.slice(1));
  }

  // ── Motion easing (BUILD §19-20) — deterministic, monotonic, no overfit
  //    physics. f(0)=0, f(1)=1; slower at both ends, fastest through the
  //    cruise band. ──────────────────────────────────────────────────────
  function _easeMotionProgress(rawT) {
    var t = Math.max(0, Math.min(1, rawT));
    if (t <= ACCEL_END) {
      var accelT = t / ACCEL_END;
      return ACCEL_END * (accelT * accelT); // ease-in
    }
    if (t >= DECEL_START) {
      var decelT = (t - DECEL_START) / (1 - DECEL_START);
      var eased = decelT * (2 - decelT); // ease-out
      return DECEL_START + (1 - DECEL_START) * eased;
    }
    // cruise band is a straight, stable linear traversal between the two
    // eased endpoints so the curve is continuous (no velocity discontinuity
    // at the phase boundaries).
    var cruiseSpan = DECEL_START - ACCEL_END;
    return ACCEL_END + ((t - ACCEL_END) / cruiseSpan) * cruiseSpan;
  }

  function _motionPhaseFor(rawT) {
    if (rawT <= ACCEL_END) return 'accelerating';
    if (rawT >= DECEL_START) return 'decelerating';
    return 'cruising';
  }

  // ── Direction lane key (BUILD §14) — real evidence only. ─────────────────
  function _rawTripIdSuffix(canonicalTripId) {
    if (!canonicalTripId) return null;
    var idx = canonicalTripId.indexOf('subway:trip:');
    return idx === 0 ? canonicalTripId.slice('subway:trip:'.length) : canonicalTripId;
  }
  function _directionLaneKey(directionId, canonicalTripId) {
    if (directionId === 'NORTH') return 'A';
    if (directionId === 'SOUTH') return 'B';
    // Fallback: NYCT's own real trip_id convention encodes direction as
    // "..N"/"..S" immediately after the route token (e.g.
    // "133550_R..N", "135400_A..S05R") — verified live against real feed
    // trip ids during this session's prior build. A real MTA-authored
    // signal, not a guessed screen orientation.
    var raw = _rawTripIdSuffix(canonicalTripId);
    if (!raw) return null;
    var m = /\.\.([NS])/.exec(raw);
    if (!m) return null;
    return m[1] === 'N' ? 'A' : 'B';
  }

  // ── Real ETA-to-next-stop lookup (BUILD §18) — reads the SAME canonical
  //    TransitTripRef.stopTimes[] every other derivation module in this
  //    build reads; never a second parser, never a fabricated value. ──────
  function _findTrip(store, canonicalTripId) {
    if (!canonicalTripId) return null;
    var all = store.getAllTrips();
    for (var i = 0; i < all.length; i++) { if (all[i].id === canonicalTripId) return all[i]; }
    return null;
  }
  function _findStopTimeEntry(trip, stationId) {
    if (!trip || !stationId) return null;
    var stopTimes = trip.stopTimes || [];
    for (var i = 0; i < stopTimes.length; i++) { if (stopTimes[i].stationId === stationId) return stopTimes[i]; }
    return null;
  }

  // ── Main derivation ───────────────────────────────────────────────────
  // opts.nowMs — for deterministic tests; defaults to real Date.now().
  function buildMotionState(logicalTrainId, opts) {
    var rs = _rollingStock(), store = _store(), vs = _trainVisualState();
    if (!rs || !store) return null;
    var train = rs.getLogicalTrain(logicalTrainId);
    var pos = rs.getPositionState(logicalTrainId);
    if (!train || !pos) return null;

    var nowMs = (opts && opts.nowMs) || Date.now();
    var visual = vs ? vs.buildVisualState(logicalTrainId) : null;
    var directionLaneKey = _directionLaneKey(visual ? visual.directionId : null, pos.tripId);
    var consist = rs.getLogicalConsist(train.consistId);
    var configuredCarCount = consist ? consist.configuredCarCount : 10;
    var physicalLengthMeters = configuredCarCount * CANONICAL_CAR_LENGTH_M;

    var base = {
      logicalTrainId: logicalTrainId, tripId: pos.tripId, routeId: train.routeId,
      positionState: pos.truthState, directionLaneKey: directionLaneKey,
      physicalLengthMeters: physicalLengthMeters,
      configuredCarCount: configuredCarCount,
    };

    // unknown — no VehiclePosition evidence at all. Nothing honest to plot,
    // matching the existing buildVehiclePresenceFeatures()/
    // buildLogicalTrainFeatures() precedent (no fabricated position). The
    // train is genuinely lost — any future reappearance starts a fresh
    // journey, never a stale one.
    if (pos.truthState === 'unknown' || !pos.position) {
      delete _journeys[logicalTrainId];
      return Object.assign({}, base, {
        motionPhase: 'frozen', segmentProgressRaw: null, segmentProgressEased: null,
        bodyCenter: null, bodyPolyline: null,
        etaMsToNextStop: null, segmentDurationMsUsed: null, usedRealEtaEvidence: false, evidenceTier: 'D',
      });
    }

    // stale — "halt or strongly reduce inferred continuation." The evidence
    // is old but real (a last-known station is still known) — render a
    // short, static, non-moving body anchored there rather than hiding the
    // train entirely. Journey cache is left untouched (not cleared): if the
    // train recovers onto the SAME segment, motion resumes from where it
    // honestly should be rather than restarting; if it recovers onto a
    // different segment, the segment-key mismatch below naturally starts a
    // fresh journey on its own.
    if (pos.truthState === 'stale') {
      var staleSeg = pos.observedStopId ? _resolveShapeSegment(store, train.routeId, pos.observedStopId, pos.observedStopId) : null;
      return Object.assign({}, base, {
        motionPhase: 'frozen', segmentProgressRaw: null, segmentProgressEased: null,
        bodyCenter: staleSeg ? _pointAtContinuousIndex(staleSeg.points, staleSeg.toIdx) : null,
        bodyPolyline: staleSeg ? _walkBodyPolyline(staleSeg.points, staleSeg.toIdx, physicalLengthMeters / 2) : null,
        etaMsToNextStop: null, segmentDurationMsUsed: null, usedRealEtaEvidence: false, evidenceTier: 'D',
        shapeSegment: staleSeg,
      });
    }

    // Genuine dwell — the authority itself directly observed the train
    // STOPPED_AT a real platform. Deliberately excludes the two OTHER
    // `observed_stop` sources below (`mta_vehicle_position_no_prior_stop` /
    // `mta_vehicle_position_no_geometry`) — those are really TRANSITING
    // trains the authority conservatively reported as if dwelling only
    // because the realtime TripUpdate had already trimmed the departed stop
    // out of its own stop_time_update list (see ROOT CAUSE, file header) —
    // live-verified as the overwhelming majority of every currently-moving
    // real train. No active journey while genuinely at rest.
    if (pos.truthState === 'observed_stop' && pos.source === 'mta_vehicle_position_stopped_at') {
      // Real station-skip catch-up — root cause (found live, quantified
      // before any code change): on locally-spaced corridors (confirmed on
      // the R's Brooklyn 4th Avenue/Bay Ridge trunk — R41/59 St -> R40/
      // 53 St -> R39/45 St -> R36/36 St), a real vehicle's genuine
      // STOPPED_AT readings can arrive several real stations apart between
      // two polls — verified live against the RAW canonical VehicleRef
      // entity (MTASubwayTransitStore's own vehicle record, independent of
      // this module), which honestly reported STOPPED_AT at each poll, at
      // a DIFFERENT real station each time, with no IN_TRANSIT_TO/
      // INCOMING_AT reading ever captured in between (77 real seconds of
      // 1-second sampling, zero intermediate readings). This is a genuine
      // MTA feed-cadence characteristic on this corridor, not a
      // misclassification — but the render previously just snapped
      // instantly to each new STOPPED_AT station, discarding the real
      // distance travelled, which is exactly the reported "teleporting"
      // symptom. Detected by comparing against the last real station this
      // train was honestly rendered at/toward, WITHIN THE SAME real trip
      // (tripId-scoped — a mid-session logical-train pool_reassignment to
      // a different real trip must never glide across two unrelated real
      // journeys). When a same-trip mismatch is found, glide across the
      // REAL matched shape geometry between the two real stations —
      // bounded, honestly labeled evidenceTier 'C' (no real timing
      // evidence for exactly when the skipped distance was covered),
      // sanity-bounded to MAX_CATCHUP_DISTANCE_M so a bad match never
      // produces a nonsensical long-distance glide.
      var lastRendered = _lastRendered[logicalTrainId];
      var isRealStationSkip = lastRendered && lastRendered.tripId === pos.tripId && lastRendered.stopId !== pos.observedStopId;
      if (isRealStationSkip) {
        var catchUpKey = lastRendered.stopId + '>' + pos.observedStopId;
        var catchUp = _catchUpJourneys[logicalTrainId];
        if (!catchUp || catchUp.key !== catchUpKey) {
          var catchUpSeg = _resolveShapeSegment(store, train.routeId, lastRendered.stopId, pos.observedStopId);
          var catchUpDistanceM = catchUpSeg ? _segmentLengthMeters(catchUpSeg.points, catchUpSeg.fromIdx, catchUpSeg.toIdx) : null;
          var catchUpValid = !!catchUpSeg && catchUpDistanceM != null && catchUpDistanceM > 0 && catchUpDistanceM <= MAX_CATCHUP_DISTANCE_M;
          catchUp = catchUpValid ? {
            key: catchUpKey, segRange: catchUpSeg, startedAt: nowMs,
            durationMs: Math.max(MIN_SEGMENT_ANIM_MS, Math.min(MAX_SEGMENT_ANIM_MS, (catchUpDistanceM / CATCHUP_ASSUMED_SPEED_MPS) * 1000)),
          } : null;
          _catchUpJourneys[logicalTrainId] = catchUp;
        }
        if (catchUp) {
          var catchUpElapsed = Math.max(0, nowMs - catchUp.startedAt);
          var catchUpRawT = Math.min(1, catchUpElapsed / catchUp.durationMs);
          if (catchUpRawT < 1) {
            delete _journeys[logicalTrainId]; // the primary moving-toward-nextStopId journey doesn't apply mid-catch-up
            var catchUpEased = _easeMotionProgress(catchUpRawT);
            var catchUpContIdx = catchUp.segRange.fromIdx + catchUpEased * (catchUp.segRange.toIdx - catchUp.segRange.fromIdx);
            var catchUpCenter = _pointAtContinuousIndex(catchUp.segRange.points, catchUpContIdx);
            return Object.assign({}, base, {
              motionPhase: _motionPhaseFor(catchUpRawT), segmentProgressRaw: catchUpRawT, segmentProgressEased: catchUpEased,
              bodyCenter: catchUpCenter, bodyPolyline: _walkBodyPolyline(catchUp.segRange.points, catchUpContIdx, physicalLengthMeters / 2),
              etaMsToNextStop: null, segmentDurationMsUsed: catchUp.durationMs, usedRealEtaEvidence: false, evidenceTier: 'C',
              shapeSegment: catchUp.segRange,
            });
          }
          delete _catchUpJourneys[logicalTrainId]; // catch-up finished naturally — settle into genuine dwell below
        }
      }

      delete _journeys[logicalTrainId];
      _lastRendered[logicalTrainId] = { tripId: pos.tripId, stopId: pos.observedStopId };
      var dwellSeg = _resolveShapeSegment(store, train.routeId, pos.observedStopId, pos.observedStopId);
      var dwellCenter = dwellSeg ? _pointAtContinuousIndex(dwellSeg.points, dwellSeg.toIdx) : pos.position;
      return Object.assign({}, base, {
        motionPhase: 'dwell', segmentProgressRaw: null, segmentProgressEased: null,
        bodyCenter: dwellCenter, bodyPolyline: dwellSeg ? _walkBodyPolyline(dwellSeg.points, dwellSeg.toIdx, physicalLengthMeters / 2) : null,
        etaMsToNextStop: null, segmentDurationMsUsed: null, usedRealEtaEvidence: false, evidenceTier: 'A',
        shapeSegment: dwellSeg,
      });
    }

    // No forward target at all (shouldn't normally occur once the above are
    // excluded, but stay honest rather than assume) — nothing to animate.
    if (!pos.nextStopId) {
      delete _journeys[logicalTrainId];
      return Object.assign({}, base, {
        motionPhase: 'frozen', segmentProgressRaw: null, segmentProgressEased: null,
        bodyCenter: pos.position, bodyPolyline: null,
        etaMsToNextStop: null, segmentDurationMsUsed: null, usedRealEtaEvidence: false, evidenceTier: 'D',
      });
    }

    // ── Moving: covers real `inferred_segment` AND the degraded-evidence
    //    `observed_stop` cases above — both are genuinely transiting trains,
    //    and both run through the exact same continuous, journey-anchored
    //    computation. `derivedPreviousStopId` is populated (and honestly
    //    labeled as derived, never presented as an authority observation)
    //    only when the authority's own `observedStopId` is null. ─────────
    //
    // PERFORMANCE: topology derivation + shape-segment resolution are each
    // real geometry searches (route shapes × all route stations), not cheap
    // — live-measured to take the render loop from ~17ms to 300+ms for a
    // full network before this cache existed. Both are DETERMINISTIC for
    // the lifetime of a single journey (they only depend on which segment a
    // train is on, which doesn't change tick-to-tick), so they are computed
    // once per journey and cached on the journey record itself, keyed by a
    // cheap raw-evidence check — never recomputed every animation tick.
    var trip = _findTrip(store, pos.tripId);
    var fromStopId = pos.observedStopId; // real when the authority still has it (rare)
    var cachedJourney = _journeys[logicalTrainId];
    var derivedFromStopId, segRange;
    if (cachedJourney && cachedJourney.segRange && cachedJourney.rawFromStopId === fromStopId && cachedJourney.rawNextStopId === pos.nextStopId) {
      derivedFromStopId = cachedJourney.derivedFromStopId;
      segRange = cachedJourney.segRange;
    } else {
      derivedFromStopId = fromStopId || (trip ? _derivePreviousStopIdViaTopology(store, train.routeId, pos.nextStopId, trip) : null);
      segRange = derivedFromStopId ? _resolveShapeSegment(store, train.routeId, derivedFromStopId, pos.nextStopId) : null;
    }
    if (!segRange) {
      // Tier D — no real geometry to walk yet. Freeze at the last honest
      // visual position if a journey already exists for this train (never
      // snap to a raw station point mid-journey); otherwise there is
      // nothing honest to plot.
      var existingJourney = _journeys[logicalTrainId];
      return Object.assign({}, base, {
        motionPhase: 'frozen',
        segmentProgressRaw: existingJourney ? existingJourney.lastVisualProgressRaw : null,
        segmentProgressEased: existingJourney ? _easeMotionProgress(existingJourney.lastVisualProgressRaw) : null,
        bodyCenter: existingJourney ? existingJourney.lastVisualBodyCenter : (fromStopId ? null : pos.position),
        bodyPolyline: null,
        etaMsToNextStop: null, segmentDurationMsUsed: null, usedRealEtaEvidence: false, evidenceTier: 'D',
        derivedPreviousStopId: fromStopId ? null : derivedFromStopId,
      });
    }

    var segKey = (derivedFromStopId || '?') + '>' + pos.nextStopId;
    var journey = _journeys[logicalTrainId];
    var isNewJourney = !journey || journey.segKey !== segKey;
    if (isNewJourney) {
      journey = {
        segKey: segKey,
        journeyEstablishedAt: pos.observedTimestamp || nowMs, // the real moment this journey was first observed, not the render call time
        lastVisualProgressRaw: 0, lastVisualAt: nowMs, lastVisualBodyCenter: null,
      };
      _journeys[logicalTrainId] = journey;
    }
    // Refresh the cheap cache-hit fields every call (even on a cache hit —
    // trivial assignment) so the NEXT call can reuse this same derivation.
    journey.rawFromStopId = fromStopId;
    journey.rawNextStopId = pos.nextStopId;
    journey.derivedFromStopId = derivedFromStopId;
    journey.segRange = segRange;

    var nextEntry = trip ? _findStopTimeEntry(trip, pos.nextStopId) : null;
    var prevEntry = (fromStopId && trip) ? _findStopTimeEntry(trip, fromStopId) : null;
    var segStartMs = prevEntry ? (prevEntry.departureUtcMs || prevEntry.arrivalUtcMs) : null;
    var segEndMs = nextEntry ? (nextEntry.arrivalUtcMs || nextEntry.departureUtcMs) : null;

    var rawT, usedRealEtaEvidence, evidenceTier;
    if (segStartMs && segEndMs && segEndMs > segStartMs) {
      // Tier A (best) — real supported departure + real supported arrival.
      rawT = (nowMs - segStartMs) / (segEndMs - segStartMs);
      usedRealEtaEvidence = true; evidenceTier = 'A';
    } else if (segEndMs) {
      // Tier B (good) — real supported arrival survives, but the departed
      // stop's own timing entry was already trimmed from this trip's
      // TripUpdate. Anchor segment start at journeyEstablishedAt — the real
      // moment THIS journey was first observed — an honest "last
      // trustworthy segment-entry observation," never a fabricated
      // departure time.
      var tierBStart = journey.journeyEstablishedAt;
      rawT = segEndMs > tierBStart ? (nowMs - tierBStart) / (segEndMs - tierBStart) : 1;
      usedRealEtaEvidence = true; evidenceTier = 'B';
    } else {
      // Tier C (fallback) — no real arrival evidence either. Bounded
      // predicted continuation from the last real visual progress at a
      // conservative constant assumed rate; never fabricates a specific ETA.
      var elapsedC = Math.max(0, nowMs - journey.lastVisualAt);
      rawT = journey.lastVisualProgressRaw + (elapsedC / FALLBACK_SEGMENT_ANIM_MS);
      usedRealEtaEvidence = false; evidenceTier = 'C';
    }
    rawT = Math.max(0, Math.min(1, rawT));

    // Backwards-protection and the speed-sanity bound (§6/§7) exist ONLY to
    // guard against a REALTIME CORRECTION — new evidence (a shifted
    // supported departure/arrival, or a new journeyEstablishedAt anchor)
    // that would otherwise imply a jump. They must NOT apply to routine
    // re-evaluation of the SAME unchanged evidence at a later nowMs: for
    // fixed segStartMs/segEndMs, the Tier A/B formula is already
    // monotonically increasing in nowMs by construction, so clamping it
    // would artificially slow a train relative to its own real supported
    // schedule — exactly the bug this fix caught live (a real ~6km
    // Manhattan-Bridge-class express segment legitimately implies a faster
    // real pace than the conservative MAX_PRESENTATION_SPEED_MPS sanity
    // constant, and unconditionally capping it made the train visually
    // arrive far later than its own real supported arrival time). Detected
    // by comparing an evidence signature across calls — only tier A/B can
    // ever "correct" (tier C's own formula is already safe-by-construction,
    // always non-decreasing from the last visual progress).
    var evidenceSignature = evidenceTier === 'A' ? ('A:' + segStartMs + ':' + segEndMs)
      : evidenceTier === 'B' ? ('B:' + journey.journeyEstablishedAt + ':' + segEndMs)
      : 'C';
    var isCorrection = !isNewJourney && evidenceTier !== 'C' && journey.lastEvidenceSignature != null && journey.lastEvidenceSignature !== evidenceSignature;

    if (isCorrection) {
      // Never move backwards during a correction (§6) — clamp to the last
      // rendered progress on this journey.
      if (rawT < journey.lastVisualProgressRaw) rawT = journey.lastVisualProgressRaw;

      // Speed sanity bound (§7) — cap how far progress can advance in THIS
      // correction relative to real elapsed time and the segment's real
      // physical length, so a sudden large realtime correction reshapes the
      // remaining journey smoothly rather than snapping the render. A
      // presentation-only bound; never rewrites operational truth.
      var elapsedSec = Math.max(0.001, (nowMs - journey.lastVisualAt) / 1000);
      var segLenM = Math.max(1, _segmentLengthMeters(segRange.points, segRange.fromIdx, segRange.toIdx));
      var maxProgressDelta = (MAX_PRESENTATION_SPEED_MPS * elapsedSec) / segLenM;
      if (rawT - journey.lastVisualProgressRaw > maxProgressDelta) rawT = journey.lastVisualProgressRaw + maxProgressDelta;
      rawT = Math.max(0, Math.min(1, rawT));
    }
    journey.lastEvidenceSignature = evidenceSignature;

    var etaMs = segEndMs ? (segEndMs - nowMs) : null;
    var segmentDurationMsUsed = evidenceTier === 'A'
      ? Math.max(MIN_SEGMENT_ANIM_MS, Math.min(MAX_SEGMENT_ANIM_MS, segEndMs - segStartMs))
      : evidenceTier === 'B'
        ? Math.max(MIN_SEGMENT_ANIM_MS, Math.min(MAX_SEGMENT_ANIM_MS, segEndMs - journey.journeyEstablishedAt))
        : FALLBACK_SEGMENT_ANIM_MS;

    var easedProgress = _easeMotionProgress(rawT);
    var contIdx = segRange.fromIdx + easedProgress * (segRange.toIdx - segRange.fromIdx);
    var bodyCenter = _pointAtContinuousIndex(segRange.points, contIdx);
    var bodyPolyline = _walkBodyPolyline(segRange.points, contIdx, physicalLengthMeters / 2);

    journey.lastVisualProgressRaw = rawT;
    journey.lastVisualAt = nowMs;
    journey.lastVisualBodyCenter = bodyCenter;
    journey.lastRealtimeRevision = pos.observedTimestamp;

    // Record the real station this journey is honestly heading toward, so
    // a later genuine STOPPED_AT reading AT that exact station is
    // recognized as the expected arrival (no false catch-up trigger) — see
    // the DWELL branch's own station-skip-catch-up logic above.
    _lastRendered[logicalTrainId] = { tripId: pos.tripId, stopId: pos.nextStopId };

    return Object.assign({}, base, {
      motionPhase: _motionPhaseFor(rawT),
      segmentProgressRaw: rawT, segmentProgressEased: easedProgress,
      bodyCenter: bodyCenter, bodyPolyline: bodyPolyline,
      etaMsToNextStop: etaMs, segmentDurationMsUsed: segmentDurationMsUsed, usedRealEtaEvidence: usedRealEtaEvidence,
      shapeSegment: segRange, evidenceTier: evidenceTier,
      derivedPreviousStopId: fromStopId ? null : derivedFromStopId,
      journeyEstablishedAt: journey.journeyEstablishedAt,
    });
  }

  function renderLengthMeters(physicalLengthMeters, zoom, latitudeDeg) {
    var minReadableM = MIN_READABLE_PIXELS * _metersPerPixel(zoom, latitudeDeg);
    return Math.max(physicalLengthMeters, minReadableM);
  }

  function getDiagnostics() {
    var rs = _rollingStock();
    if (!rs) return { version: VERSION, trainCount: 0 };
    var trains = rs.getActiveLogicalTrains();
    var byPhase = {}, byEvidenceTier = {};
    trains.forEach(function (t) {
      var m = buildMotionState(t.id);
      if (!m) return;
      byPhase[m.motionPhase] = (byPhase[m.motionPhase] || 0) + 1;
      if (m.evidenceTier) byEvidenceTier[m.evidenceTier] = (byEvidenceTier[m.evidenceTier] || 0) + 1;
    });
    return { version: VERSION, trainCount: trains.length, byMotionPhase: byPhase, byEvidenceTier: byEvidenceTier, activeJourneyCount: Object.keys(_journeys).length };
  }

  // Test-only reset of the persistent journey cache (Continuous Motion Fix
  // §2) — mirrors the `__resetForTests()` convention already used by
  // SubwayLogicalRollingStockAuthority. Never touches that authority's own
  // state; this cache is purely this module's own presentation continuity.
  function __resetJourneys() { _journeys = {}; _lastRendered = {}; _catchUpJourneys = {}; }
  function __getJourney(logicalTrainId) { return _journeys[logicalTrainId] || null; }
  function __getLastRendered(logicalTrainId) { return _lastRendered[logicalTrainId] || null; }
  function __getCatchUpJourney(logicalTrainId) { return _catchUpJourneys[logicalTrainId] || null; }
  function __setLastRenderedForTests(logicalTrainId, tripId, stopId) { _lastRendered[logicalTrainId] = { tripId: tripId, stopId: stopId }; }

  SBE.SubwayTrainMotionModel = Object.freeze({
    VERSION: VERSION,
    CANONICAL_CAR_LENGTH_M: CANONICAL_CAR_LENGTH_M,
    MIN_READABLE_PIXELS: MIN_READABLE_PIXELS,
    ACCEL_END: ACCEL_END,
    DECEL_START: DECEL_START,
    buildMotionState: buildMotionState,
    renderLengthMeters: renderLengthMeters,
    getDiagnostics: getDiagnostics,
    // Pure-math exposures for tests / reuse by mtaSubwayMapFeatures.js —
    // never a second identity authority, just shared geometry.
    __haversineMeters: _haversineMeters,
    __metersPerPixel: _metersPerPixel,
    __easeMotionProgress: _easeMotionProgress,
    __directionLaneKey: _directionLaneKey,
    __walkBodyPolyline: _walkBodyPolyline,
    __resolveShapeSegment: _resolveShapeSegment,
    __pointAtContinuousIndex: _pointAtContinuousIndex,
    __derivePreviousStopIdViaTopology: _derivePreviousStopIdViaTopology,
    __segmentLengthMeters: _segmentLengthMeters,
    __resetJourneys: __resetJourneys,
    __getJourney: __getJourney,
    __getLastRendered: __getLastRendered,
    __getCatchUpJourney: __getCatchUpJourney,
    __setLastRenderedForTests: __setLastRenderedForTests,
    MAX_CATCHUP_DISTANCE_M: MAX_CATCHUP_DISTANCE_M,
    MAX_PRESENTATION_SPEED_MPS: MAX_PRESENTATION_SPEED_MPS,
  });

  console.log('[SubwayTrainMotionModel] v' + VERSION + ' loaded (pure derivation — no Mapbox dependency)');
})(window);
