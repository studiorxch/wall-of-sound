// ── SubwayItineraryRideAuthority v1.1.0 ──────────────────────────────────────
// 0819_SUBWAY_Itinerary_Execution_Map_Authoring
// 0821_SUBWAY_Boarding_UX_TrainRideSession — ARCHITECTURAL CORRECTION: this
// file used to require an active itinerary leg for a ride to exist at all
// (every entry point required status:waiting_to_board, itself only reachable
// via startLeg()). Riding is now the general capability; an itinerary is
// optional CONTEXT layered on top of it, never a prerequisite:
//
//   TrainRideSession
//   ├── free_ride       — leg == null.  idle -> riding directly. No exit
//   │                      concept; CURRENT/NEXT + Sunroof only. Ends via
//   │                      stopRide() ("EXIT TRAIN"), returning to idle.
//   └── itinerary_ride   — leg != null. waiting_to_board -> riding, with a
//                          real planned exit (-> approaching_exit ->
//                          completed on real arrival). selectTrain() only
//                          accepts a train that genuinely matches the leg
//                          (see getTrainMatchInfo) — the itinerary
//                          CONSTRAINS which trains are boardable; it does
//                          not gate whether riding is possible at all.
//
// Both modes are the exact same state machine, the exact same
// selectTrain(logicalTrainId) entry point, and the exact same real
// logicalTrainId binding — `leg == null` is the ONLY discriminator, checked
// live off `_state.leg`, never a second parallel "ride mode" flag that could
// drift out of sync. Every caller (itinerary HUD BOARD, the station panel's
// MATCHING LIVE TRAINS BOARD, and a directly-selected train's BOARD
// TRAIN/BOARD THIS TRAIN) converges on this one function — no duplicate ride
// lifecycle exists anywhere in this codebase.
// ──────────────────────────────────────────────────────────────────────────────
// Status: active | Classification: runtime-authority / subway-ride-session
//
// The EXECUTION half of the SUBWAY riding story — deliberately separate from
// SubwayItineraryLegResolver (resolution: where/how an itinerary-bound rider
// should travel). This module answers "is a ride actually happening right
// now," owns a minimal real state machine (idle -> [waiting_to_board] ->
// riding -> [approaching_exit -> completed]), and is the ONLY place either a
// resolved TransitLegPlan OR a directly-selected live train gets turned into
// a real, observable ride.
//
// Cross-context command/snapshot surface — same shape as
// itineraryRunAuthority.js's own wos:itineraryRun:* channel, but a
// deliberately SEPARATE, transit-shaped channel (wos:subwayRide:*): a
// transit leg is never forced through DRIVE's ItineraryRunController
// payload contract (real-time live-train position is not a pre-fetched
// static route to sample). Runs ONLY on canonical LIVE MAP
// (wall/index.html) — MUSIC sends commands over localStorage and reads
// snapshots back the same way every other MAPS<->Wall bridge already does.
// Free-ride boarding (station panel / train selection) never needs the
// cross-tab channel at all — it's a same-tab, direct call on canonical LIVE
// MAP, exactly like an itinerary-bound board triggered from the local HUD.
//
// Reuses, never duplicates: SubwayItineraryLegResolver.getLiveCandidates()
// for candidate binding, SubwayLogicalRollingStockAuthority.getPositionState()
// for real current/next-stop truth, SunroofCameraController.attach() for the
// actual camera-follow (unmodified — this file only ever calls it, never
// reimplements any part of it).
//
// Placement: wall/systems/transit/subwayItineraryRideAuthority.js
// Load: AFTER subwayItineraryLegResolver.js, subwayLogicalRollingStockAuthority.js.
// Reads SBE.SunroofCameraController/SBE.MTASubwayMapLayer only at call time,
// so exact ordering relative to those two doesn't matter here.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.1.0';

  var STORAGE_COMMAND_KEY  = 'wos:subwayRide:command';
  var STORAGE_SNAPSHOT_KEY = 'wos:subwayRide:snapshot';
  var TICK_MS = 1000;

  function _rollingStock() { return global.SBE && SBE.SubwayLogicalRollingStockAuthority; }
  function _resolver() { return global.SBE && SBE.SubwayItineraryLegResolver; }
  function _sunroof() { return global.SBE && SBE.SunroofCameraController; }

  function _idleState() {
    return {
      status: 'idle', // idle | waiting_to_board | riding | approaching_exit | completed
      itineraryId: null, stageId: null,
      leg: null, // null => free_ride once riding; a real TransitLegPlan => itinerary_ride
      selectedLogicalTrainId: null,
      currentStopId: null, nextStopId: null,
      startedAt: null, completedAt: null,
      lastCommandReason: null,
    };
  }

  var _state = _idleState();
  var _tickTimer = null;
  var _listeners = [];

  function _notify() {
    _listeners.slice().forEach(function (fn) {
      try { fn(); } catch (e) { console.warn('[SubwayItineraryRideAuthority] subscriber threw:', e && e.message || e); }
    });
  }
  function _publish() {
    try { global.localStorage.setItem(STORAGE_SNAPSHOT_KEY, JSON.stringify(_state)); } catch (e) {}
  }
  function _setState(patch) {
    _state = Object.assign({}, _state, patch);
    _publish();
    _notify();
  }

  // ── Public: lifecycle ──────────────────────────────────────────────────────
  // Begins a real ride against an already-resolved leg (see
  // SubwayItineraryLegResolver.resolveLeg) — never accepts raw
  // origin/destination itself; resolution and execution stay separate.
  function startLeg(itineraryId, stageId, leg) {
    if (!leg || !leg.boardingStation || !leg.exitStation) return { ok: false, reason: 'invalid_leg' };
    _stopTick();
    var sunroof = _sunroof();
    if (sunroof && typeof sunroof.detach === 'function') { try { sunroof.detach(); } catch (e) {} }
    _state = {
      status: 'waiting_to_board',
      itineraryId: itineraryId || null, stageId: stageId || null,
      leg: leg,
      selectedLogicalTrainId: null,
      currentStopId: null, nextStopId: leg.boardingStation.id,
      startedAt: new Date().toISOString(), completedAt: null,
      lastCommandReason: null,
    };
    _publish();
    _notify();
    return { ok: true };
  }

  // Real, currently-active live trains for the active leg — delegates
  // entirely to SubwayItineraryLegResolver.getLiveCandidates(), never
  // recomputed here.
  //
  // 0820_SUBWAY_Itinerary_Ride_Candidate_Resolver — real bug, reproduced
  // exactly: SubwayArrivalIntelligence reads store.getAllTrips() directly,
  // so a real live trip's ETA is visible the instant the GTFS-realtime feed
  // reports it. The resolver's getLiveCandidates() additionally requires a
  // real logicalTrainId (per its own explicit "never a fabricated
  // candidate" rule) — but that identity only exists once
  // SubwayLogicalRollingStockAuthority.reconcile() has independently
  // processed the SAME trip, which runs on its own separate 5s timer. A
  // trip Arrival Intelligence already shows can still be unassociated at
  // the exact moment a caller asks for candidates, producing an empty list
  // while the arrivals panel simultaneously shows real ETAs for the same
  // trains — confirmed live: clearing rolling stock's associations while
  // leaving the transit store's real trip data untouched reproduced
  // candidates:[] alongside arrivalIntelligence still reporting 7 real
  // arrivals, exactly the reported "LIVE TRAINS — NONE RIGHT NOW" symptom.
  //
  // Fixed here, not in the resolver: the resolver's own header states it
  // never rewrites any authority it reads (pure read-only derivation) — a
  // reconcile() call belongs in this file, which already owns ride
  // lifecycle side effects. reconcile() is idempotent and cheap (bounded by
  // the real, small number of currently-active trips) — calling it more
  // often than its own timer only lets real associations catch up sooner,
  // never fabricates one. This does NOT relax the "real logicalTrainId
  // required" rule the resolver enforces — it closes the timing gap so
  // that requirement is actually met, rather than bypassing it.
  function getLiveCandidates() {
    var resolver = _resolver();
    if (!resolver || !_state.leg) return [];
    var rs = _rollingStock();
    if (rs && typeof rs.reconcile === 'function') { try { rs.reconcile(); } catch (e) {} }
    return resolver.getLiveCandidates(_state.leg);
  }

  // 0821_SUBWAY_Boarding_UX — the ride HUD needs to tell "a real train is
  // en route, its identity just hasn't resolved yet" apart from "nothing is
  // coming" (real user report: "LIVE TRAINS — NONE RIGHT NOW can appear even
  // while the arrival panel shows trains approaching" — see
  // getLiveCandidates()'s own header for the underlying reconcile-timing
  // race). `candidates` is the exact same boardable list getLiveCandidates()
  // already returns (never duplicated logic — this calls it directly);
  // `nextArrival` is the resolver's new, deliberately UNGATED preview
  // (SubwayItineraryLegResolver.getNextArrivalPreview) — real ETA data, but
  // never usable for binding (no logicalTrainId guarantee).
  // Test-only seam (never used by production code, always null in
  // production) — this file runs against a REAL live MTA feed, so a real
  // waiting_to_board leg can genuinely already have real live candidates on
  // it by the time a test runs; there is no way to force a real corridor to
  // be empty on demand. This lets the HUD's own explanatory-copy branches
  // (empty / arrival-not-yet-boardable / boardable) be tested deterministic-
  // ally without depending on live traffic being in any particular state.
  var _boardingContextOverride = null;
  function getBoardingContext() {
    if (_boardingContextOverride) return _boardingContextOverride();
    var resolver = _resolver();
    var candidates = getLiveCandidates();
    var nextArrival = (resolver && _state.leg) ? resolver.getNextArrivalPreview(_state.leg) : null;
    return { candidates: candidates, nextArrival: nextArrival };
  }

  // 0821_SUBWAY_Boarding_UX_TrainRideSession — given a real logicalTrainId,
  // reports whether it's a valid board target for the ACTIVE itinerary leg
  // (if any), reusing the exact same route-filtered/identity-associated
  // candidate data getLiveCandidates() already computes — never
  // independently re-derives route or direction matching. With no leg
  // active this always reports matches:true: a free ride has no itinerary
  // constraint to fail. `reason` is one of 'wrong_route' (the train's own
  // route never serves this leg at all), 'wrong_direction' (same route, but
  // not a live boarding-station arrival this leg can use — e.g. heading the
  // other way), or 'does_not_reach_exit' (a real, identity-associated
  // candidate whose own remaining schedule doesn't reach the exit station —
  // see SubwayItineraryLegResolver's directionConfirmed for the underlying
  // real signal). Never fabricates a reason for a train that IS a genuine
  // match.
  function getTrainMatchInfo(logicalTrainId) {
    if (!_state.leg) return { matches: true, reason: null, candidate: null };
    var rs = _rollingStock();
    var train = rs && rs.getLogicalTrain(logicalTrainId);
    if (!train) return { matches: false, reason: 'not_found', candidate: null };
    if (train.routeId !== _state.leg.routeId) return { matches: false, reason: 'wrong_route', candidate: null };
    var candidate = getLiveCandidates().filter(function (c) { return c.logicalTrainId === logicalTrainId; })[0] || null;
    if (!candidate) return { matches: false, reason: 'wrong_direction', candidate: null };
    if (!candidate.directionConfirmed) return { matches: false, reason: 'does_not_reach_exit', candidate: candidate };
    return { matches: true, reason: null, candidate: candidate };
  }

  // Manual train selection (no automatic boarding, per spec) — validates the
  // real logical train exists, hands it to the EXISTING, unmodified
  // SunroofCameraController for the actual camera-follow, and only then
  // advances ride status. If Sunroof can't attach (e.g. SUBWAY mode isn't
  // active yet), the ride stays put and the real reason is reported — never
  // a silent/fake "riding" state.
  //
  // THE one boarding command (0821_SUBWAY_Boarding_UX_TrainRideSession) —
  // called identically by the itinerary HUD's BOARD, the station panel's
  // MATCHING LIVE TRAINS BOARD, and a directly-selected train's BOARD
  // TRAIN/BOARD THIS TRAIN. Free ride (no active leg): boardable from idle
  // (a fresh selection) or riding (switching trains directly) — no route/
  // direction constraint, since there is no itinerary to constrain against.
  // Itinerary ride (leg active): boardable only from waiting_to_board or
  // riding, AND only for a train getTrainMatchInfo() confirms genuinely
  // matches — this is the itinerary CONSTRAINING which trains are valid, not
  // gating whether riding is possible at all.
  function selectTrain(logicalTrainId) {
    var hasLeg = !!_state.leg;
    if (hasLeg) {
      if (_state.status !== 'waiting_to_board' && _state.status !== 'riding') {
        return { ok: false, reason: 'invalid_state' };
      }
    } else if (_state.status !== 'idle' && _state.status !== 'riding') {
      return { ok: false, reason: 'invalid_state' };
    }
    var rs = _rollingStock();
    if (!rs || !rs.getLogicalTrain(logicalTrainId)) {
      // 0821_SUBWAY_Boarding_UX — this used to return without ever touching
      // lastCommandReason, so a real, plausible case (a listed candidate
      // going stale between render and click) produced zero HUD feedback —
      // the exact "I clicked a train and nothing happened" symptom this
      // checkpoint traces. Every rejection path now reports honestly, same
      // as the pre-existing sunroof-attach-failure path below already did.
      _setState({ lastCommandReason: 'not_found' });
      return { ok: false, reason: 'not_found' };
    }
    if (hasLeg) {
      var match = getTrainMatchInfo(logicalTrainId);
      if (!match.matches) {
        _setState({ lastCommandReason: match.reason });
        return { ok: false, reason: match.reason };
      }
    }
    var sunroof = _sunroof();
    var attachResult = sunroof && typeof sunroof.attach === 'function'
      ? sunroof.attach(logicalTrainId)
      : { ok: false, reason: 'sunroof_unavailable' };
    if (!attachResult.ok) {
      _setState({ lastCommandReason: attachResult.reason || 'attach_failed' });
      return attachResult;
    }
    _setState({
      status: 'riding', selectedLogicalTrainId: logicalTrainId, lastCommandReason: null,
      startedAt: _state.startedAt || new Date().toISOString(), // a free ride never went through startLeg(), which is the only other place this gets set
    });
    _startTick();
    return { ok: true };
  }

  // TEMPORARY diagnostics (0820_SUBWAY_Post_Launch_Execution_Investigation) —
  // remove once the reported post-launch stall is root-caused.
  var _diagTickCount = 0;
  var _diagLastTickAt = null;
  var _diagLastError = null;
  var _diagLastBlockedReason = null;
  var _diagStorageEventCount = 0;
  var _diagStorageEventLastAt = null;
  var _diagStorageEventLastKey = null;
  var _diagBootCheckLog = []; // [{at, outcome, commandId, issuedAt, ageMs}]
  var MAX_DIAG_LOG = 20;

  // Real progression, driven ONLY from SubwayLogicalRollingStockAuthority's
  // own already-proven truth-aware position (never reimplemented here).
  // currentStopId is the train's last REAL confirmed dwell (observedStopId);
  // nextStopId is its real next stop. Completion requires the train to
  // genuinely be observed AT the exit station — never a distance/time guess.
  //
  // 0821_SUBWAY_Boarding_UX_TrainRideSession — this used to require
  // _state.leg to tick at all, so a free ride (leg == null by design) would
  // never see CURRENT/NEXT update — a real gap, since "RIDING -> CURRENT/
  // NEXT" is required for a free ride too. Position tracking now runs
  // unconditionally; only the exit/completion branch (which has no meaning
  // without a planned exit station) stays itinerary-only.
  function _tick() {
    _diagTickCount++;
    _diagLastTickAt = Date.now();
    try {
      if (_state.status !== 'riding' && _state.status !== 'approaching_exit') { _diagLastBlockedReason = 'wrong_status:' + _state.status; _stopTick(); return; }
      var rs = _rollingStock();
      if (!rs || !_state.selectedLogicalTrainId) { _diagLastBlockedReason = 'missing_dependency'; return; }
      var pos = rs.getPositionState(_state.selectedLogicalTrainId);
      if (!pos) { _diagLastBlockedReason = 'no_position_state'; return; }
      _diagLastBlockedReason = null; // this tick genuinely reached real progression logic

      var currentStopId = pos.observedStopId != null ? pos.observedStopId : _state.currentStopId;
      var nextStopId = pos.nextStopId != null ? pos.nextStopId : _state.nextStopId;
      var patch = { currentStopId: currentStopId, nextStopId: nextStopId };

      if (_state.leg) {
        var exitId = _state.leg.exitStation.id;
        if (currentStopId === exitId) {
          patch.status = 'completed';
          patch.completedAt = new Date().toISOString();
          _setState(patch);
          _stopTick();
          return;
        }
        if (nextStopId === exitId && _state.status === 'riding') {
          patch.status = 'approaching_exit';
        }
      }
      _setState(patch);
    } catch (e) {
      _diagLastError = { message: (e && e.message) || String(e), stack: e && e.stack, at: Date.now(), tickCount: _diagTickCount };
      console.error('[SubwayItineraryRideAuthority][DIAG] _tick() threw on tick ' + _diagTickCount + ':', e);
    }
  }

  function _startTick() {
    _stopTick();
    _tick();
    _tickTimer = global.setInterval(_tick, TICK_MS);
  }
  function _stopTick() {
    if (_tickTimer != null) { global.clearInterval(_tickTimer); _tickTimer = null; }
  }

  // Ends the current ride, whatever kind it is — this IS "EXIT TRAIN," the
  // one exit path for both a free ride and an itinerary ride, always
  // available while riding (0821_SUBWAY_Boarding_UX_TrainRideSession).
  // Detaches the real, unmodified Sunroof (its own detach() already restores
  // the pre-attach camera — untouched here, never reimplemented).
  // `wasInterrupted` reports whether this ended a real itinerary leg before
  // it reached its real planned exit (status was riding/approaching_exit
  // with a leg attached, never completed) — exiting is never blocked either
  // way; this is purely informational for a caller that wants to react
  // (e.g. distinguish an early exit from a normal end-of-ride stop).
  function stopRide() {
    var wasInterrupted = !!_state.leg && (_state.status === 'riding' || _state.status === 'approaching_exit');
    _stopTick();
    var sunroof = _sunroof();
    if (sunroof && typeof sunroof.detach === 'function') { try { sunroof.detach(); } catch (e) {} }
    _state = _idleState();
    _publish();
    _notify();
    return { ok: true, wasInterrupted: wasInterrupted };
  }

  function getSnapshot() { return _state; }

  function subscribe(fn) {
    _listeners.push(fn);
    return function unsubscribe() {
      var i = _listeners.indexOf(fn);
      if (i >= 0) _listeners.splice(i, 1);
    };
  }

  // ── Cross-tab command receipt (from MUSIC) ─────────────────────────────────
  // De-duped by commandId — a command can legitimately be observed twice
  // (once via the boot-time pending-command check below, once via a live
  // 'storage' event that still fires shortly after) and must only ever
  // apply once.
  var _lastAppliedCommandId = null;
  function _handleCommand(cmd) {
    if (!cmd || !cmd.type || !cmd.commandId) return;
    if (cmd.commandId === _lastAppliedCommandId) return;
    _lastAppliedCommandId = cmd.commandId;
    if (cmd.type === 'startLeg') { startLeg(cmd.itineraryId, cmd.stageId, cmd.leg); return; }
    if (cmd.type === 'selectTrain') { selectTrain(cmd.logicalTrainId); return; }
    if (cmd.type === 'stop') { stopRide(); return; }
  }
  function _onStorageEvent(e) {
    _diagStorageEventCount++;
    _diagStorageEventLastAt = Date.now();
    _diagStorageEventLastKey = e.key;
    if (e.key !== STORAGE_COMMAND_KEY || !e.newValue) return;
    var cmd;
    try { cmd = JSON.parse(e.newValue); } catch (err) { return; }
    _handleCommand(cmd);
  }
  try { global.addEventListener('storage', _onStorageEvent); } catch (e) {}

  // ── Boot-time pending-command check — the critical fix for a real,
  // reproduced race: a launching MUSIC tab writes STORAGE_COMMAND_KEY THEN
  // opens/focuses LIVE MAP; if that same named window.open() call ends up
  // navigating/reloading the MUSIC tab's OWN browsing context (confirmed
  // reproducible), MUSIC's own JS never gets to run any code after the
  // write — but the write itself already landed in localStorage before
  // that happened. A 'storage' event alone would never fire for it (that
  // event only ever fires in OTHER tabs, and only for a write that happens
  // AFTER this tab's listener attaches) — so LIVE MAP must also explicitly
  // check the CURRENT stored command value once at load, mirroring
  // itineraryRunAuthority.js's own _respondToLiveMapRequest() pattern for
  // the exact same class of race. Only a FRESH command (issued recently) is
  // consumed — never replays a stale command left over from a much earlier
  // session. ──
  var PENDING_COMMAND_MAX_AGE_MS = 30000;
  function _diagLogBootCheck(outcome, cmd, ageMs) {
    _diagBootCheckLog.push({
      at: Date.now(), outcome: outcome,
      commandId: cmd && cmd.commandId || null,
      issuedAt: cmd && cmd.issuedAt || null,
      ageMs: ageMs != null ? ageMs : null,
    });
    if (_diagBootCheckLog.length > MAX_DIAG_LOG) _diagBootCheckLog.shift();
  }
  function _checkPendingCommandOnBoot() {
    try {
      var raw = global.localStorage.getItem(STORAGE_COMMAND_KEY);
      if (!raw) { _diagLogBootCheck('no_raw_value', null, null); return; }
      var cmd = JSON.parse(raw);
      if (!cmd || !cmd.issuedAt) { _diagLogBootCheck('malformed', cmd, null); return; }
      var ageMs = Date.now() - new Date(cmd.issuedAt).getTime();
      if (ageMs < 0 || ageMs > PENDING_COMMAND_MAX_AGE_MS) { _diagLogBootCheck('stale_or_skewed', cmd, ageMs); return; } // stale or clock-skewed — never replay
      _diagLogBootCheck('consumed', cmd, ageMs);
      _handleCommand(cmd);
    } catch (e) {
      _diagLogBootCheck('threw:' + ((e && e.message) || String(e)), null, null);
    }
  }
  _checkPendingCommandOnBoot();

  try {
    global.addEventListener('beforeunload', function () {
      if (_state.status !== 'idle') stopRide();
    });
  } catch (e) {}

  // TEMPORARY (0820_SUBWAY_Post_Launch_Execution_Investigation) — real,
  // read-only proof of the tick timer's health. Remove alongside the
  // matching blocks in itineraryRunController.js/itineraryRunAuthority.js
  // once the stall is root-caused.
  function getDiagnostics() {
    return {
      status: _state.status,
      tickTimerActive: _tickTimer != null,
      tickCount: _diagTickCount,
      lastTickAt: _diagLastTickAt,
      msSinceLastTick: _diagLastTickAt != null ? (Date.now() - _diagLastTickAt) : null,
      lastBlockedReason: _diagLastBlockedReason,
      lastError: _diagLastError,
      storageEventCount: _diagStorageEventCount,
      storageEventLastAt: _diagStorageEventLastAt,
      storageEventLastKey: _diagStorageEventLastKey,
      bootCheckLog: _diagBootCheckLog.slice(),
    };
  }

  SBE.SubwayItineraryRideAuthority = Object.freeze({
    VERSION: VERSION,
    getDiagnostics: getDiagnostics,
    STORAGE_COMMAND_KEY: STORAGE_COMMAND_KEY,
    STORAGE_SNAPSHOT_KEY: STORAGE_SNAPSHOT_KEY,
    startLeg: startLeg,
    getLiveCandidates: getLiveCandidates,
    getBoardingContext: getBoardingContext,
    getTrainMatchInfo: getTrainMatchInfo,
    selectTrain: selectTrain,
    stopRide: stopRide,
    getSnapshot: getSnapshot,
    subscribe: subscribe,
    // Test-only — never used by production code.
    __test: {
      simulateCommand: function (cmd) { _handleCommand(cmd); },
      tick: function () { _tick(); },
      resetForTests: function () { _stopTick(); _state = _idleState(); _boardingContextOverride = null; },
      setBoardingContextOverride: function (fn) { _boardingContextOverride = fn; },
    },
  });

  console.log('[SubwayItineraryRideAuthority] v' + VERSION + ' loaded');
})(window);
