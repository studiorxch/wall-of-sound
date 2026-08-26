// ── SubwayLogicalRollingStockAuthority v1.0.0 ─────────────────────────────────
// 0818_SUBWAY_Logical_Rolling_Stock_v1.0.0_BUILD — Data + Logic Layer §7-22
// Status: active | Classification: runtime-authority (persistent — localStorage)
//
// StudioRich's first persistent logical rolling-stock layer. Owns three
// persistent identity classes — LogicalTrain (sr-train-*), LogicalConsist
// (sr-consist-*), LogicalCar (sr-car-*) — plus the deterministic, canonical-
// ID-only machinery that associates a real MTA realtime trip with a stable
// logical train, ages that association through an explicit lifecycle, and
// computes a truth-aware position for each active logical train.
//
// ── THREE TRUTH CLASSES (BUILD §5) ───────────────────────────────────────────
//   observed — read directly from mtaSubwayTransitStore's realtime state
//              (trip/vehicle refs, themselves built by mtaSubwayIdentity.js
//              from real MTA GTFS-Realtime rows). This file never invents an
//              observed value.
//   inferred — this file's own calculation (position between two known,
//              canonical stations, clamped to real static-GTFS shape
//              geometry) from observed evidence + canonical route geometry.
//              Every inferred position retains its source stop ids, source
//              timestamp, method, and confidence — see TrainPositionState.
//   logical  — persistent StudioRich world identity (train/consist/car ids).
//              Never claims physical MTA accuracy. logicalTrainId is NEVER
//              the transient MTA trip_id (BUILD §8 hard requirement) — a
//              trip attaches to / detaches from a logical train over time.
//
// ── ROUTE POOL SCOPE (BUILD §12-13, §16) ─────────────────────────────────────
// Pools are keyed by canonical routeId (e.g. "subway:route:A"), not by
// color/semantic family — A/C/E share a color family but must never share a
// pool (an A-line car must never casually become a C-line or L-line car).
// Reassociation (trainId-match or pool-reassignment) is scoped to searching
// ONLY within the trip's own route pool in this build — cross-route-family
// reassignment is architecturally anticipated by the BUILD (§12: "must be
// explicit, logged, deterministic, rare") but deliberately NOT exercised
// here: never searching outside a trip's own route pool is a strictly
// stronger guarantee against cross-route identity corruption than the BUILD
// requires, and keeps the association logic simple enough to fully test.
//
// ── NO FABRICATED PHYSICAL CLAIMS ────────────────────────────────────────────
// configuredCarCount always currently falls back to DEFAULT_LOGICAL_CAR_COUNT
// (10) — CAR_COUNT_RULES is an empty, real config layer (keyable by routeId
// or routeFamily) with no per-route overrides authored yet. Authoring a
// specific route's real physical car count without a verified source would
// violate BUILD §10/§41's "do not claim exact physical consist" requirement;
// the fallback-only state is the honest one until such a source exists.
//
// ── PERFORMANCE (BUILD §29) ───────────────────────────────────────────────────
// No per-train timers. reconcile() is called once per external tick (from
// mtaSubwayMapLayer.js's existing single 5s watch timer) and does one pass
// over the store's current trip/vehicle lists. Shape-geometry nearest-point
// lookups are memoized per (shapeId, stationId) since stations never move.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var STORAGE_KEY = 'wos:subwayLogicalRollingStock:v1';

  var DEFAULT_LOGICAL_CAR_COUNT = 10;
  var MIN_LOGICAL_CAR_COUNT = 1;
  var MAX_LOGICAL_CAR_COUNT = 11;

  // Association/position aging thresholds. Chosen to align with existing
  // SUBWAY conventions rather than arbitrary new numbers: STALE_AFTER_MS
  // matches mtaSubwayPollingRuntime.js's own DEFAULT_STALE_AFTER_MS (~3x the
  // 30s default poll cadence); ENDED_AFTER_MS matches its
  // DEFAULT_DISABLED_AFTER_MS (10 missed-cycle windows).
  var STALE_AFTER_MS = 90000;
  var ENDED_AFTER_MS = 300000;
  var MAX_ASSOCIATION_HISTORY = 20;
  var SHAPE_MATCH_THRESHOLD_DEG = 0.02; // ~2km-scale sanity check, not a distance display value

  // ── Retention bound (0820_MAPS_Itinerary_Execution_Lifecycle_Storage) ──────
  // This file persists every logical train/consist/car it ever mints — none
  // were ever removed. Confirmed root cause of a real production quota
  // failure: continuous 5s reconcile() cycles running for 6+ days against
  // live MTA realtime data, each cycle that can't reuse an idle train in its
  // route pool minting a brand new train + consist + up to 11 cars, forever.
  // The shared origin's localStorage quota was exhausted, which silently
  // failed OTHER writes at the same origin too (the itinerary command
  // channel) — a completely unrelated system was blocked by this one's
  // unbounded growth. PRUNE_IDLE_AFTER_MS is deliberately far beyond
  // ENDED_AFTER_MS (5min) — that window is for reassociation *eligibility*,
  // this one is for "will this ever plausibly be reused or looked at again."
  // A generous 24h means no in-progress UI session (a Sunroof ride, an
  // itinerary leg) can ever have its train vanish out from under it; nothing
  // legitimate needs a fully-idle train's identity to survive a full day
  // unused. MAX_PERSISTED_TRAINS is a hard backstop independent of age, in
  // case churn is high enough that age-based pruning alone isn't sufficient
  // within one save cycle.
  var PRUNE_IDLE_AFTER_MS = 24 * 60 * 60 * 1000;
  var MAX_PERSISTED_TRAINS = 2000;
  // Progressive boot-recovery targets (0820_MAPS_Itinerary_Execution_Lifecycle_Storage_Migration)
  // — a real production capture showed a 5,124,922-byte write STILL being
  // attempted after the pruning fix shipped. Root cause: age-based pruning
  // (24h idle) only removes trains that stop being reused; a real MTA feed
  // can keep reassociating trains indefinitely, so updatedAt never ages out
  // even though the DISTINCT-ever-created count is enormous. The 2000-train
  // hard cap was never actually reached in that scenario either, because
  // this recalibration hadn't been measured yet: this file's own real-usage
  // measurement (see the completion report) put per-train footprint
  // (including its own cars) at roughly 5.3KB — 2000 trains alone could be
  // ~10MB, larger than realistic total origin quota. These targets instead
  // define a hard, unconditional ceiling applied once at boot for anyone
  // already carrying oversized state: try normal pruning first: if the
  // result still won't save, progressively keep only the N most-recently-
  // updated IDLE trains (active trains are NEVER dropped, at any step) at
  // shrinking N, and only wipe everything as the absolute last resort if
  // even zero idle trains retained still can't fit — guaranteeing the
  // origin's quota is freed rather than permanently blocking every other
  // write sharing it, which is what was actually observed in production.
  var RECOVERY_KEEP_STEPS = [500, 200, 75, 25, 0];

  // No per-route/fleet overrides authored yet — see file header. Keyable by
  // either exact routeId ("subway:route:G") or routeFamily ("g").
  var CAR_COUNT_RULES = {};

  function _store() { return SBE.MTASubwayTransitStore || null; }

  // ── State ─────────────────────────────────────────────────────────────────
  var _trains = {};            // sr-train-* -> LogicalTrain
  var _consists = {};          // sr-consist-* -> LogicalConsist
  var _cars = {};               // sr-car-* -> LogicalCar
  var _tripAssociations = {};  // rawTripId -> TripAssociation (current/most-recent)
  var _routePools = {};        // canonicalRouteId -> [logicalTrainId, ...]
  var _positions = {};         // logicalTrainId -> TrainPositionState (recomputed every reconcile — never persisted)
  var _shapeIndexCache = {};   // "shapeId::stationId" -> nearest point index (memoized; stations never move)

  var _nextTrainCounter = 1, _nextConsistCounter = 1, _nextCarCounter = 1;
  var _loaded = false;
  var _listeners = [];

  var _diag = {
    newLogicalTrainsCreated: 0,
    logicalTrainsReused: 0,
    tripReassociationCount: 0,
    unresolvedTripAssociationCount: 0,
    lastReconcileAt: null,
    lastPruneAt: null,
    lastPruneRemovedTrains: 0,
    lastPruneRemovedAssociations: 0,
    lastSaveOk: null,
    lastSaveError: null,
    lastSaveBytes: null,
    lastBootRecovery: null,
  };

  function _notify() { _listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }
  function subscribe(fn) { _listeners.push(fn); return function () { _listeners = _listeners.filter(function (f) { return f !== fn; }); }; }

  function _mintTrainId() { var id = 'sr-train-' + String(_nextTrainCounter).padStart(6, '0'); _nextTrainCounter++; return id; }
  function _mintConsistId() { var id = 'sr-consist-' + String(_nextConsistCounter).padStart(6, '0'); _nextConsistCounter++; return id; }
  function _mintCarId() { var id = 'sr-car-' + String(_nextCarCounter).padStart(6, '0'); _nextCarCounter++; return id; }

  // ── Persistence (mirrors mtaSubwayStationLibrary.js's shape) ────────────────
  function _ls() { try { return global.localStorage || null; } catch (e) { return null; } }

  function _save() {
    var ls = _ls(); if (!ls) return false;
    var json = JSON.stringify({
      version: VERSION,
      nextTrainCounter: _nextTrainCounter,
      nextConsistCounter: _nextConsistCounter,
      nextCarCounter: _nextCarCounter,
      trains: _trains,
      consists: _consists,
      cars: _cars,
      tripAssociations: _tripAssociations,
      routePools: _routePools,
    });
    try {
      ls.setItem(STORAGE_KEY, json);
      _diag.lastSaveOk = true;
      _diag.lastSaveError = null;
      _diag.lastSaveBytes = json.length;
      return true;
    } catch (e) {
      // 0820_MAPS_Itinerary_Execution_Lifecycle_Storage — a real production
      // failure here (QuotaExceededError, this key alone growing unbounded
      // over 6+ days) silently blocked an entirely unrelated system: the
      // itinerary command channel shares this same origin's quota, and its
      // own write wraps a try/catch that discarded the exception with no
      // trace. Naming the error explicitly (not just its message) makes a
      // quota failure here unmistakable instead of looking like any other
      // storage error — pruning (_pruneStaleRollingStock, called from
      // reconcile() before this function) is the actual fix; this is the
      // visibility that made the root cause provable in the first place.
      var isQuotaError = !!(e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'));
      _diag.lastSaveOk = false;
      _diag.lastSaveError = { name: e && e.name, message: (e && e.message) || String(e), isQuotaError: isQuotaError, attemptedBytes: json.length };
      console.warn('[SubwayLogicalRollingStockAuthority] save failed' + (isQuotaError ? ' (QUOTA EXCEEDED)' : '') + ':', e && e.message || e, '— attempted', json.length, 'bytes');
      return false;
    }
  }

  function _load() {
    if (_loaded) return true;
    _loaded = true;
    var ls = _ls(); if (!ls) return false;
    try {
      var raw = ls.getItem(STORAGE_KEY);
      if (!raw) return true; // no prior data — empty is a valid start state
      var parsed = JSON.parse(raw);
      _trains = (parsed && parsed.trains) || {};
      _consists = (parsed && parsed.consists) || {};
      _cars = (parsed && parsed.cars) || {};
      _tripAssociations = (parsed && parsed.tripAssociations) || {};
      _routePools = (parsed && parsed.routePools) || {};
      _nextTrainCounter = (parsed && parsed.nextTrainCounter) || 1;
      _nextConsistCounter = (parsed && parsed.nextConsistCounter) || 1;
      _nextCarCounter = (parsed && parsed.nextCarCounter) || 1;
      _recoverFromOversizedBootState(raw.length);
      return true;
    } catch (e) {
      console.warn('[SubwayLogicalRollingStockAuthority] load failed (starting empty):', e && e.message || e);
      _trains = {}; _consists = {}; _cars = {}; _tripAssociations = {}; _routePools = {};
      return false;
    }
  }

  // ── Car-count configuration (BUILD §10) ──────────────────────────────────
  function configuredCarCountFor(routeId, routeFamily) {
    var raw = (routeId && CAR_COUNT_RULES[routeId]) || (routeFamily && CAR_COUNT_RULES[routeFamily]) || DEFAULT_LOGICAL_CAR_COUNT;
    return Math.max(MIN_LOGICAL_CAR_COUNT, Math.min(MAX_LOGICAL_CAR_COUNT, raw));
  }

  // ── Logical train/consist/car creation (BUILD §8-11) ─────────────────────
  function _createLogicalTrain(routeId, routeFamily, now) {
    var trainId = _mintTrainId();
    var consistId = _mintConsistId();
    var carCount = configuredCarCountFor(routeId, routeFamily);

    var carIds = [];
    for (var i = 0; i < carCount; i++) {
      var carId = _mintCarId();
      _cars[carId] = {
        id: carId, consistId: consistId, logicalTrainId: trainId,
        routeId: routeId, routeFamily: routeFamily, slotIndex: i,
        createdAt: now, updatedAt: now, truthState: 'logical', lifecycleState: 'active',
      };
      carIds.push(carId);
    }

    _consists[consistId] = {
      id: consistId, logicalTrainId: trainId, routeId: routeId, routeFamily: routeFamily,
      configuredCarCount: carCount, carIds: carIds, createdAt: now, updatedAt: now, truthState: 'logical',
    };

    _trains[trainId] = {
      id: trainId, routeId: routeId, routeFamily: routeFamily, consistId: consistId,
      activeTripId: null, direction: null, lifecycleState: 'observed',
      createdAt: now, updatedAt: now, lastObservedAt: null, truthState: 'logical',
      associationConfidence: 1.0,
      lastKnownMtaTrainId: null,
      provenance: { createdReason: 'new_logical_train', tripAssociationHistory: [] },
    };

    _routePools[routeId] = _routePools[routeId] || [];
    _routePools[routeId].push(trainId);
    return _trains[trainId];
  }

  // Inverse of _createLogicalTrain — removes a train and everything it
  // exclusively owns (its consist, that consist's cars, its route-pool
  // entry, its cached position). Never called on a train with an
  // activeTripId — only ever on ones already idle long enough that nothing
  // legitimate could still be depending on their identity.
  function _removeLogicalTrain(trainId) {
    var train = _trains[trainId];
    if (!train) return;
    var consist = _consists[train.consistId];
    if (consist) {
      (consist.carIds || []).forEach(function (carId) { delete _cars[carId]; });
      delete _consists[train.consistId];
    }
    var pool = _routePools[train.routeId];
    if (pool) {
      var idx = pool.indexOf(trainId);
      if (idx >= 0) pool.splice(idx, 1);
    }
    delete _trains[trainId];
    delete _positions[trainId];
  }

  // Bounds long-run persisted growth — called once per reconcile(), before
  // _save(). Two passes: age-based (an idle train untouched for
  // PRUNE_IDLE_AFTER_MS is unlikely to ever be reassociated or displayed
  // again — see the constant's own header comment for why 24h is safe), then
  // a hard-count backstop (oldest-idle-first) in case churn outpaces
  // age-based eviction within a single cycle. Never touches a train with an
  // activeTripId, regardless of age or count pressure. Orphaned trip
  // associations (pointing at a train pruned by either pass, or by an
  // earlier version of this file that never pruned at all) are swept in the
  // same pass — a real, expected case for anyone upgrading from unbounded
  // growth, not a hypothetical.
  function _pruneStaleRollingStock(now) {
    var removedTrains = 0;
    Object.keys(_trains).forEach(function (id) {
      var t = _trains[id];
      if (!t.activeTripId && t.lifecycleState === 'ended' && (now - t.updatedAt) > PRUNE_IDLE_AFTER_MS) {
        _removeLogicalTrain(id);
        removedTrains++;
      }
    });
    var effectiveMax = _maxPersistedTrainsOverride != null ? _maxPersistedTrainsOverride : MAX_PERSISTED_TRAINS;
    var remainingIds = Object.keys(_trains);
    if (remainingIds.length > effectiveMax) {
      var idleOldestFirst = remainingIds
        .map(function (id) { return _trains[id]; })
        .filter(function (t) { return !t.activeTripId; })
        .sort(function (a, b) { return a.updatedAt - b.updatedAt; });
      var overBy = remainingIds.length - effectiveMax;
      for (var i = 0; i < overBy && i < idleOldestFirst.length; i++) {
        _removeLogicalTrain(idleOldestFirst[i].id);
        removedTrains++;
      }
    }
    var removedAssociations = 0;
    Object.keys(_tripAssociations).forEach(function (rawTripId) {
      var assoc = _tripAssociations[rawTripId];
      if (!assoc || !_trains[assoc.logicalTrainId]) {
        delete _tripAssociations[rawTripId];
        removedAssociations++;
      }
    });
    if (removedTrains > 0 || removedAssociations > 0) {
      _diag.lastPruneAt = now;
      _diag.lastPruneRemovedTrains = removedTrains;
      _diag.lastPruneRemovedAssociations = removedAssociations;
    }
    return { removedTrains: removedTrains, removedAssociations: removedAssociations };
  }

  // Discards every idle (non-active) train NOT among the `keepCount` most
  // recently updated, regardless of age — used only by boot recovery below,
  // when ordinary age-based pruning has already run and the state still
  // won't fit. Active trains are never touched at any keepCount, including 0.
  function _shrinkToMostRecentIdle(keepCount) {
    var idleOldestFirst = Object.keys(_trains)
      .map(function (id) { return _trains[id]; })
      .filter(function (t) { return !t.activeTripId; })
      .sort(function (a, b) { return a.updatedAt - b.updatedAt; }); // oldest first
    var toRemove = keepCount >= idleOldestFirst.length ? [] : idleOldestFirst.slice(0, idleOldestFirst.length - keepCount);
    toRemove.forEach(function (t) { _removeLogicalTrain(t.id); });
    Object.keys(_tripAssociations).forEach(function (rawTripId) {
      var assoc = _tripAssociations[rawTripId];
      if (!assoc || !_trains[assoc.logicalTrainId]) delete _tripAssociations[rawTripId];
    });
    return toRemove.length;
  }

  // ── One-time boot recovery for ALREADY-oversized existing state ──────────
  // (0820_MAPS_Itinerary_Execution_Lifecycle_Storage_Migration) — ordinary
  // pruning only prevents FUTURE growth; it does nothing for a user who
  // already has multiple megabytes persisted from before this fix shipped,
  // and — confirmed by a real production capture — age-based pruning alone
  // can fail to shrink a real feed's state enough on its own, because
  // trains that keep getting legitimately reused never age out even though
  // the distinct-ever-created count driving the byte size is enormous. This
  // runs once, only when existing data is actually loaded (never on a fresh
  // empty start), and only needs to do real work if a save genuinely still
  // fails afterward — most callers will find ordinary pruning was already
  // enough and this is a no-op past the first save attempt.
  function _recoverFromOversizedBootState(rawByteLength) {
    var now = Date.now();
    var before = { trains: Object.keys(_trains).length, bytes: rawByteLength };
    _pruneStaleRollingStock(now);
    if (_save()) {
      _diag.lastBootRecovery = { at: now, neededAggressiveShrink: false, before: before, afterTrains: Object.keys(_trains).length, afterBytes: _diag.lastSaveBytes };
      return;
    }
    var steps = _recoveryKeepStepsOverride || RECOVERY_KEEP_STEPS;
    for (var i = 0; i < steps.length; i++) {
      _shrinkToMostRecentIdle(steps[i]);
      if (_save()) {
        _diag.lastBootRecovery = { at: now, neededAggressiveShrink: true, keptIdleCount: steps[i], before: before, afterTrains: Object.keys(_trains).length, afterBytes: _diag.lastSaveBytes };
        console.warn('[SubwayLogicalRollingStockAuthority] boot recovery: existing state was still too large after normal pruning — shrunk to ' +
          steps[i] + ' most-recent idle trains (plus all active ones) to fit. Was ' + before.trains + ' trains / ' + rawByteLength + ' bytes.');
        return;
      }
    }
    // Absolute last resort: even zero retained idle trains (only active ones
    // survive _shrinkToMostRecentIdle(0)) still doesn't fit — the active
    // fleet alone exceeds available quota. Wiping is a genuine data loss for
    // idle/historical tracking, but the alternative (leaving the origin
    // permanently over quota, silently blocking every other system sharing
    // it — which is the actual production symptom this migration exists to
    // end) is worse. Active trains are derived, regenerable MTA truth, not
    // user-authored content — safe to sacrifice for system health.
    var hadActive = Object.keys(_trains).filter(function (id) { return !!_trains[id].activeTripId; }).length;
    _trains = {}; _consists = {}; _cars = {}; _tripAssociations = {}; _routePools = {}; _positions = {};
    var ls = _ls();
    if (ls) { try { ls.removeItem(STORAGE_KEY); } catch (e) {} }
    _diag.lastBootRecovery = { at: now, neededAggressiveShrink: true, keptIdleCount: 0, wipedActiveTrainsToo: hadActive, before: before, afterTrains: 0, afterBytes: 0 };
    console.warn('[SubwayLogicalRollingStockAuthority] boot recovery: state could not be shrunk to fit even with only active trains retained (' +
      hadActive + ' active) — wiped entirely to free the shared origin\'s quota. All logical trains will be re-created fresh on next reconcile.');
  }

  function _pushHistory(train, assocEvent) {
    var hist = train.provenance.tripAssociationHistory;
    hist.push({ tripId: assocEvent.tripId, reason: assocEvent.reason, confidence: assocEvent.confidence, associatedAt: assocEvent.associatedAt });
    if (hist.length > MAX_ASSOCIATION_HISTORY) hist.splice(0, hist.length - MAX_ASSOCIATION_HISTORY);
  }

  // ── Realtime trip association (BUILD §14-16) — canonical IDs only ───────
  function _routeFamilyFor(routeId) {
    var store = _store();
    var route = store ? store.getRoute(routeId) : null;
    return route ? route.routeFamily : null;
  }

  function _findReassociationCandidate(routeId, rawTrainId) {
    var pool = (_routePools[routeId] || []).map(function (id) { return _trains[id]; }).filter(Boolean);
    if (rawTrainId) {
      var byTrainId = pool.filter(function (t) { return !t.activeTripId && t.lastKnownMtaTrainId === rawTrainId; })[0];
      if (byTrainId) return { train: byTrainId, reason: 'mta_train_id_match', confidence: 0.85 };
    }
    var idle = pool.filter(function (t) { return !t.activeTripId && t.lifecycleState === 'ended'; })[0];
    if (idle) return { train: idle, reason: 'pool_reassignment', confidence: 0.5 };
    return null;
  }

  function _associateNewTrip(trip, rawTripId, now) {
    var routeId = trip.routeId;
    var routeFamily = _routeFamilyFor(routeId);
    var candidate = _findReassociationCandidate(routeId, trip.trainId);

    var train, reason, confidence;
    if (candidate) {
      train = candidate.train;
      reason = candidate.reason;
      confidence = candidate.confidence;
      _diag.logicalTrainsReused++;
      _diag.tripReassociationCount++;
    } else {
      train = _createLogicalTrain(routeId, routeFamily, now);
      reason = 'new_logical_train';
      confidence = 1.0;
      _diag.newLogicalTrainsCreated++;
    }

    train.lastKnownMtaTrainId = trip.trainId || train.lastKnownMtaTrainId;
    train.associationConfidence = confidence;
    train.provenance.createdReason = train.provenance.createdReason || reason;

    var assoc = {
      tripId: trip.id, rawTripId: rawTripId, logicalTrainId: train.id, routeId: routeId,
      confidence: confidence, reason: reason,
      associatedAt: now, lastConfirmedAt: now,
      lifecycleState: (reason === 'new_logical_train') ? 'observed' : 'reassociated',
      endedAt: null,
    };
    _tripAssociations[rawTripId] = assoc;
    _pushHistory(train, assoc);
    return assoc;
  }

  function _confirmAssociation(assoc, now) {
    assoc.lastConfirmedAt = now;
    if (assoc.lifecycleState === 'observed' || assoc.lifecycleState === 'reassociated') assoc.lifecycleState = 'active';
    else if (assoc.lifecycleState !== 'active') assoc.lifecycleState = 'active';
    return assoc;
  }

  function _ageAssociation(assoc, now) {
    var elapsed = now - assoc.lastConfirmedAt;
    if (elapsed >= ENDED_AFTER_MS) { assoc.lifecycleState = 'ended'; assoc.endedAt = assoc.endedAt || now; }
    else if (elapsed >= STALE_AFTER_MS) { assoc.lifecycleState = 'stale'; }
    else { assoc.lifecycleState = 'temporarily_missing'; }
    return assoc;
  }

  // ── Truth-aware position (BUILD §17-22) ──────────────────────────────────
  function _unknownPosition(logicalTrainId, tripId, routeId) {
    return { logicalTrainId: logicalTrainId, tripId: tripId || null, routeId: routeId || null,
      observedStopId: null, nextStopId: null, observedTimestamp: null, position: null, progress: null,
      truthState: 'unknown', confidence: 0, stale: false, source: 'none' };
  }

  function _findStopTimeIndex(trip, stationId) {
    var stopTimes = trip.stopTimes || [];
    for (var i = 0; i < stopTimes.length; i++) { if (stopTimes[i].stationId === stationId) return i; }
    return -1;
  }

  function _distDeg(a, b) { var dLat = a[0] - b[0], dLon = a[1] - b[1]; return Math.sqrt(dLat * dLat + dLon * dLon); }

  function _nearestShapeIndex(shapeId, station, points) {
    var cacheKey = shapeId + '::' + station.id;
    if (_shapeIndexCache[cacheKey] !== undefined) return _shapeIndexCache[cacheKey];
    var best = -1, bestDist = Infinity;
    for (var i = 0; i < points.length; i++) {
      var d = _distDeg(points[i], [station.latitude, station.longitude]);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    var result = (best !== -1 && bestDist <= SHAPE_MATCH_THRESHOLD_DEG) ? best : null;
    _shapeIndexCache[cacheKey] = result;
    return result;
  }

  function _timeFraction(prevEntry, nextEntry, refNowMs) {
    var prevMs = prevEntry && (prevEntry.departureUtcMs || prevEntry.arrivalUtcMs);
    var nextMs = nextEntry && (nextEntry.arrivalUtcMs || nextEntry.departureUtcMs);
    if (!prevMs || !nextMs || nextMs <= prevMs || !refNowMs) return 0.5; // insufficient timing evidence — honest midpoint default
    var f = (refNowMs - prevMs) / (nextMs - prevMs);
    return Math.max(0, Math.min(1, f));
  }

  // Interpolates strictly along a real canonical route shape between two
  // real, canonical-ID-resolved stations — the result always lies ON the
  // shape's polyline (a convex combination of two adjacent real points),
  // never off-geometry. Returns null (never a fabricated point) if no
  // shape's geometry can be confidently matched to both stations.
  function _interpolateAlongShape(store, route, prevStation, nextStation, prevEntry, nextEntry, refNowMs) {
    if (!route || !route.shapeIds || !route.shapeIds.length) return null;
    for (var s = 0; s < route.shapeIds.length; s++) {
      var shapeId = route.shapeIds[s];
      var points = store.getShapePoints(shapeId);
      if (!points || points.length < 2) continue;
      var prevIdx = _nearestShapeIndex(shapeId, prevStation, points);
      var nextIdx = _nearestShapeIndex(shapeId, nextStation, points);
      if (prevIdx == null || nextIdx == null || prevIdx === nextIdx) continue;

      var lo = Math.min(prevIdx, nextIdx), hi = Math.max(prevIdx, nextIdx);
      var fraction = _timeFraction(prevEntry, nextEntry, refNowMs);
      var contIdx = (prevIdx <= nextIdx) ? (lo + fraction * (hi - lo)) : (hi - fraction * (hi - lo));
      var i0 = Math.max(0, Math.min(points.length - 1, Math.floor(contIdx)));
      var i1 = Math.max(0, Math.min(points.length - 1, i0 + (contIdx >= i0 ? 1 : -1)));
      var t = Math.abs(contIdx - i0);
      var p0 = points[i0], p1 = points[i1];
      var lat = p0[0] + (p1[0] - p0[0]) * t;
      var lon = p0[1] + (p1[1] - p0[1]) * t;
      return { position: [lon, lat], progress: fraction, confidence: 0.7 };
    }
    return null;
  }

  function _computePosition(store, train, trip, vehicle, now) {
    var logicalTrainId = train.id, canonicalTripId = trip ? trip.id : train.activeTripId, routeId = train.routeId;
    if (!vehicle) return _unknownPosition(logicalTrainId, canonicalTripId, routeId);

    var freshness = now - (vehicle.timestampUtcMs || now);
    if (vehicle.timestampUtcMs && freshness > STALE_AFTER_MS) {
      return { logicalTrainId: logicalTrainId, tripId: canonicalTripId, routeId: routeId,
        observedStopId: vehicle.currentStationId || null, nextStopId: null, observedTimestamp: vehicle.timestampUtcMs,
        position: null, progress: null, truthState: 'stale', confidence: 0.1, stale: true, source: 'mta_vehicle_position_expired' };
    }

    if (vehicle.currentStatus === 'STOPPED_AT' && vehicle.currentStationId) {
      var stoppedStation = store.getStation(vehicle.currentStationId);
      var stopIdx = trip ? _findStopTimeIndex(trip, vehicle.currentStationId) : -1;
      var nextStopId = (trip && stopIdx !== -1 && trip.stopTimes[stopIdx + 1]) ? trip.stopTimes[stopIdx + 1].stationId : null;
      return { logicalTrainId: logicalTrainId, tripId: canonicalTripId, routeId: routeId,
        observedStopId: vehicle.currentStationId, nextStopId: nextStopId, observedTimestamp: vehicle.timestampUtcMs,
        position: stoppedStation ? [stoppedStation.longitude, stoppedStation.latitude] : null, progress: null,
        truthState: 'observed_stop', confidence: 0.95, stale: false, source: 'mta_vehicle_position_stopped_at' };
    }

    // IN_TRANSIT_TO / INCOMING_AT — vehicle.currentStationId is the upcoming stop.
    var nextId = vehicle.currentStationId;
    if (!nextId || !trip) return _unknownPosition(logicalTrainId, canonicalTripId, routeId);
    var nextIdx = _findStopTimeIndex(trip, nextId);
    var prevEntry = (nextIdx > 0) ? trip.stopTimes[nextIdx - 1] : null;
    var nextEntry = (nextIdx !== -1) ? trip.stopTimes[nextIdx] : null;
    var nextStation = store.getStation(nextId);

    if (!prevEntry || !nextStation) {
      // No prior-stop anchor to interpolate from — honest fallback matching
      // the existing buildVehiclePresenceFeatures() precedent: plot at the
      // nearest verified (upcoming) station rather than inventing a segment.
      return { logicalTrainId: logicalTrainId, tripId: canonicalTripId, routeId: routeId,
        observedStopId: null, nextStopId: nextId, observedTimestamp: vehicle.timestampUtcMs,
        position: nextStation ? [nextStation.longitude, nextStation.latitude] : null, progress: null,
        truthState: 'observed_stop', confidence: 0.6, stale: false, source: 'mta_vehicle_position_no_prior_stop' };
    }

    var prevStation = store.getStation(prevEntry.stationId);
    var route = store.getRoute(routeId);
    var seg = (prevStation && route) ? _interpolateAlongShape(store, route, prevStation, nextStation, prevEntry, nextEntry, vehicle.timestampUtcMs || now) : null;

    if (!seg) {
      return { logicalTrainId: logicalTrainId, tripId: canonicalTripId, routeId: routeId,
        observedStopId: prevEntry.stationId, nextStopId: nextId, observedTimestamp: vehicle.timestampUtcMs,
        position: [nextStation.longitude, nextStation.latitude], progress: null,
        truthState: 'observed_stop', confidence: 0.6, stale: false, source: 'mta_vehicle_position_no_geometry' };
    }

    return { logicalTrainId: logicalTrainId, tripId: canonicalTripId, routeId: routeId,
      observedStopId: prevEntry.stationId, nextStopId: nextId, observedTimestamp: vehicle.timestampUtcMs,
      position: seg.position, progress: seg.progress,
      truthState: 'inferred_segment', confidence: seg.confidence, stale: false, source: 'inferred_from_canonical_geometry' };
  }

  // ── reconcile() — the ONE entry point a scheduler calls (BUILD §29: no
  //    per-train timers; centralized scheduling only). Pure read of the
  //    store's current trip/vehicle lists; never fetches. opts.now lets
  //    tests exercise aging deterministically without real sleeps. ────────
  function reconcile(opts) {
    _load();
    var now = (opts && opts.now) || Date.now();
    var store = _store();
    if (!store) return { ok: false, reason: 'store_unavailable' };

    _diag.unresolvedTripAssociationCount = 0;

    var trips = store.getAllTrips();
    var vehiclesByTripId = {};
    store.getAllVehicles().forEach(function (v) { if (v.tripId) vehiclesByTripId[v.tripId] = v; });

    var seenRawTripIds = {};

    trips.forEach(function (trip) {
      var rawTripId = trip.authoritativeId;
      seenRawTripIds[rawTripId] = true;
      if (!trip.routeId) { _diag.unresolvedTripAssociationCount++; return; }

      var assoc = _tripAssociations[rawTripId];
      if (assoc && assoc.logicalTrainId && _trains[assoc.logicalTrainId]) {
        _confirmAssociation(assoc, now);
      } else {
        assoc = _associateNewTrip(trip, rawTripId, now);
      }

      var train = _trains[assoc.logicalTrainId];
      if (!train) { _diag.unresolvedTripAssociationCount++; return; }
      train.activeTripId = trip.id;
      train.direction = trip.direction || train.direction;
      train.lastObservedAt = now;
      train.updatedAt = now;
      train.lifecycleState = assoc.lifecycleState;

      var vehicle = vehiclesByTripId[trip.id] || null;
      _positions[train.id] = _computePosition(store, train, trip, vehicle, now);
    });

    Object.keys(_tripAssociations).forEach(function (rawTripId) {
      if (seenRawTripIds[rawTripId]) return;
      var assoc = _tripAssociations[rawTripId];
      if (!assoc || assoc.lifecycleState === 'ended') return;
      _ageAssociation(assoc, now);
      var train = _trains[assoc.logicalTrainId];
      if (!train) return;
      train.lifecycleState = assoc.lifecycleState;
      train.updatedAt = now;
      if (assoc.lifecycleState === 'ended') {
        train.activeTripId = null;
        _positions[train.id] = _unknownPosition(train.id, null, train.routeId);
      } else {
        var prevPos = _positions[train.id];
        if (prevPos) _positions[train.id] = Object.assign({}, prevPos, { truthState: 'stale', stale: true, position: prevPos.position, confidence: Math.min(prevPos.confidence, 0.2) });
      }
    });

    _diag.lastReconcileAt = now;
    var pruneResult = _pruneStaleRollingStock(now);
    // Surfaces (SubwayCarSurfaceAuthority) are minted 1:1 derived from
    // logical cars — when pruning here removes cars, their surfaces become
    // orphaned. Only worth the scan when something was actually pruned.
    // Optional/defensive: this file has no compile-time dependency on
    // car-surface authority, matching every other cross-authority reference
    // in this codebase (SBE.X && SBE.X.method(...)).
    if (pruneResult.removedTrains > 0) {
      var carSurfaces = global.SBE && SBE.SubwayCarSurfaceAuthority;
      if (carSurfaces && typeof carSurfaces.pruneOrphanedSurfaces === 'function') {
        try { carSurfaces.pruneOrphanedSurfaces(); } catch (e) {}
      }
    }
    _save();
    _notify();
    return {
      ok: true,
      activeTripCount: trips.length,
      logicalTrainCount: Object.keys(_trains).length,
      newLogicalTrainsCreated: _diag.newLogicalTrainsCreated,
      logicalTrainsReused: _diag.logicalTrainsReused,
      prunedTrains: pruneResult.removedTrains,
      prunedAssociations: pruneResult.removedAssociations,
    };
  }

  // ── Read-only selectors ───────────────────────────────────────────────────
  function getLogicalTrain(id) { _load(); return _trains[id] || null; }
  function getAllLogicalTrains() { _load(); return Object.keys(_trains).map(function (k) { return _trains[k]; }); }
  function getTrainsForRoute(routeId) { _load(); return (_routePools[routeId] || []).map(function (id) { return _trains[id]; }).filter(Boolean); }
  function getLogicalConsist(id) { _load(); return _consists[id] || null; }
  function getLogicalCarsForConsist(consistId) {
    _load();
    var consist = _consists[consistId];
    if (!consist) return [];
    return consist.carIds.map(function (id) { return _cars[id]; }).filter(Boolean).sort(function (a, b) { return a.slotIndex - b.slotIndex; });
  }
  function getLogicalCar(id) { _load(); return _cars[id] || null; }
  function getPositionState(logicalTrainId) { return _positions[logicalTrainId] || null; }
  function getTripAssociation(rawTripId) { _load(); return _tripAssociations[rawTripId] || null; }
  function getTripAssociationByCanonicalId(canonicalTripId) {
    _load();
    var found = null;
    Object.keys(_tripAssociations).some(function (k) { if (_tripAssociations[k].tripId === canonicalTripId) { found = _tripAssociations[k]; return true; } return false; });
    return found;
  }
  function getInspection(logicalTrainId) {
    var train = getLogicalTrain(logicalTrainId);
    if (!train) return null;
    var consist = getLogicalConsist(train.consistId);
    var cars = getLogicalCarsForConsist(train.consistId);
    var position = getPositionState(logicalTrainId);
    return { train: train, consist: consist, cars: cars, position: position };
  }

  function getActiveLogicalTrains() { return getAllLogicalTrains().filter(function (t) { return !!t.activeTripId; }); }

  // ── Diagnostics (BUILD §35 — identity collision counts required to be 0) ──
  function getDiagnostics() {
    _load();
    var trains = getAllLogicalTrains();
    var trainIdSet = {}, trainCollisions = 0;
    trains.forEach(function (t) { if (trainIdSet[t.id]) trainCollisions++; trainIdSet[t.id] = true; });

    var cars = Object.keys(_cars).map(function (k) { return _cars[k]; });
    var carIdSet = {}, carCollisions = 0;
    cars.forEach(function (c) { if (carIdSet[c.id]) carCollisions++; carIdSet[c.id] = true; });

    var positions = Object.keys(_positions).map(function (k) { return _positions[k]; });
    var observedStopCount = positions.filter(function (p) { return p.truthState === 'observed_stop'; }).length;
    var inferredSegmentCount = positions.filter(function (p) { return p.truthState === 'inferred_segment'; }).length;
    var staleCount = positions.filter(function (p) { return p.truthState === 'stale'; }).length;
    var unknownCount = positions.filter(function (p) { return p.truthState === 'unknown'; }).length;

    return {
      version: VERSION,
      activeMtaTripCount: trains.filter(function (t) { return !!t.activeTripId; }).length,
      activeLogicalTrainCount: trains.length,
      logicalConsistCount: Object.keys(_consists).length,
      logicalCarCount: cars.length,
      routePoolCount: Object.keys(_routePools).length,
      observedStopPositionCount: observedStopCount,
      inferredSegmentPositionCount: inferredSegmentCount,
      staleTrainCount: staleCount,
      unknownPositionTrainCount: unknownCount,
      unresolvedTripAssociationCount: _diag.unresolvedTripAssociationCount,
      tripReassociationCount: _diag.tripReassociationCount,
      newLogicalTrainsCreated: _diag.newLogicalTrainsCreated,
      logicalTrainsReused: _diag.logicalTrainsReused,
      logicalTrainIdentityCollisionCount: trainCollisions, // required invariant: must be 0
      logicalCarIdentityCollisionCount: carCollisions,     // required invariant: must be 0
      lastRealtimeUpdate: (_store() && _store().getDiagnostics().realtimeLastUpdatedAt) || null,
      lastReconcileAt: _diag.lastReconcileAt,
      lastPruneAt: _diag.lastPruneAt,
      lastPruneRemovedTrains: _diag.lastPruneRemovedTrains,
      lastPruneRemovedAssociations: _diag.lastPruneRemovedAssociations,
      lastSaveOk: _diag.lastSaveOk,
      lastSaveError: _diag.lastSaveError,
      lastSaveBytes: _diag.lastSaveBytes,
      lastBootRecovery: _diag.lastBootRecovery,
    };
  }

  // Test-only hooks — never called by production code.
  function __resetForTests() {
    _trains = {}; _consists = {}; _cars = {}; _tripAssociations = {}; _routePools = {}; _positions = {}; _shapeIndexCache = {};
    _nextTrainCounter = 1; _nextConsistCounter = 1; _nextCarCounter = 1; _loaded = true;
    _diag = {
      newLogicalTrainsCreated: 0, logicalTrainsReused: 0, tripReassociationCount: 0, unresolvedTripAssociationCount: 0,
      lastReconcileAt: null, lastPruneAt: null, lastPruneRemovedTrains: 0, lastPruneRemovedAssociations: 0,
      lastSaveOk: null, lastSaveError: null, lastSaveBytes: null, lastBootRecovery: null,
    };
    _maxPersistedTrainsOverride = null;
    _recoveryKeepStepsOverride = null;
    var ls = _ls(); if (ls) { try { ls.removeItem(STORAGE_KEY); } catch (e) {} }
  }
  function __setCarCountRuleForTests(key, count) { CAR_COUNT_RULES[key] = count; }
  function __clearCarCountRulesForTests() { Object.keys(CAR_COUNT_RULES).forEach(function (k) { delete CAR_COUNT_RULES[k]; }); }
  // Retention-bound test hooks (0820_MAPS_Itinerary_Execution_Lifecycle_Storage).
  function __pruneForTests(now) { return _pruneStaleRollingStock(now != null ? now : Date.now()); }
  var _maxPersistedTrainsOverride = null;
  function __setMaxPersistedTrainsForTests(n) { _maxPersistedTrainsOverride = n; }
  function __restoreMaxPersistedTrainsForTests() { _maxPersistedTrainsOverride = null; }
  function __forceTrainAgeForTests(trainId, updatedAt, lifecycleState) {
    var t = _trains[trainId];
    if (!t) return false;
    t.updatedAt = updatedAt;
    if (lifecycleState) t.lifecycleState = lifecycleState;
    return true;
  }
  var _recoveryKeepStepsOverride = null;
  function __setRecoveryKeepStepsForTests(steps) { _recoveryKeepStepsOverride = steps; }
  function __restoreRecoveryKeepStepsForTests() { _recoveryKeepStepsOverride = null; }
  function __triggerBootRecoveryForTests(rawByteLength) { _recoverFromOversizedBootState(rawByteLength != null ? rawByteLength : 0); }

  SBE.SubwayLogicalRollingStockAuthority = Object.freeze({
    VERSION: VERSION,
    DEFAULT_LOGICAL_CAR_COUNT: DEFAULT_LOGICAL_CAR_COUNT,
    MIN_LOGICAL_CAR_COUNT: MIN_LOGICAL_CAR_COUNT,
    MAX_LOGICAL_CAR_COUNT: MAX_LOGICAL_CAR_COUNT,
    configuredCarCountFor: configuredCarCountFor,
    reconcile: reconcile,
    getLogicalTrain: getLogicalTrain,
    getAllLogicalTrains: getAllLogicalTrains,
    getActiveLogicalTrains: getActiveLogicalTrains,
    getTrainsForRoute: getTrainsForRoute,
    getLogicalConsist: getLogicalConsist,
    getLogicalCarsForConsist: getLogicalCarsForConsist,
    getLogicalCar: getLogicalCar,
    getPositionState: getPositionState,
    getTripAssociation: getTripAssociation,
    getTripAssociationByCanonicalId: getTripAssociationByCanonicalId,
    getInspection: getInspection,
    getDiagnostics: getDiagnostics,
    subscribe: subscribe,
    PRUNE_IDLE_AFTER_MS: PRUNE_IDLE_AFTER_MS,
    MAX_PERSISTED_TRAINS: MAX_PERSISTED_TRAINS,
    __resetForTests: __resetForTests,
    __setCarCountRuleForTests: __setCarCountRuleForTests,
    __clearCarCountRulesForTests: __clearCarCountRulesForTests,
    __pruneForTests: __pruneForTests,
    __forceTrainAgeForTests: __forceTrainAgeForTests,
    __setMaxPersistedTrainsForTests: __setMaxPersistedTrainsForTests,
    __restoreMaxPersistedTrainsForTests: __restoreMaxPersistedTrainsForTests,
    __setRecoveryKeepStepsForTests: __setRecoveryKeepStepsForTests,
    __restoreRecoveryKeepStepsForTests: __restoreRecoveryKeepStepsForTests,
    __triggerBootRecoveryForTests: __triggerBootRecoveryForTests,
  });

  console.log('[SubwayLogicalRollingStockAuthority] v' + VERSION + ' loaded (persistent — call .reconcile() to associate/update)');
})(window);
