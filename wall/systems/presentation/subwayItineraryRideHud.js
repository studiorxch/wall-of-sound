// ── SubwayItineraryRideHud v1.2.0 ────────────────────────────────────────────
// 0819_SUBWAY_Itinerary_Execution_Map_Authoring
// 0821_SUBWAY_Boarding_UX — real user report: candidates/station info were
// clickable with no visible effect on WAITING TO BOARD, no explanation of
// what action boards a train, and "LIVE TRAINS — NONE RIGHT NOW" could show
// while the (separate) station arrivals panel had real trains approaching.
// Traced live: the boarding action (SubwayItineraryRideAuthority.selectTrain)
// was ALREADY correctly wired to this HUD's own candidate buttons — the real
// gaps were (a) no visible "this click boards a train" affordance, (b) no
// distinction between "arrival exists" and "boardable identity exists" (the
// exact getLiveCandidates() reconcile-race documented in the ride authority),
// and (c) clicking a train ON THE MAP calls MTASubwayMapLayer's own SEPARATE
// debug-selection selectTrain() — never SubwayItineraryRideAuthority's
// boarding action — a genuine dead end from the user's likely first
// instinct. Fixed without inventing new map-click plumbing: this HUD reads
// MTASubwayMapLayer.getSelectedTrain() (already public, already wired to the
// existing train-click handler) and, when that selection is a real train,
// offers the SAME boarding action inline — with zero new click wiring in
// mtaSubwayMapLayer.js itself.
//
// 0821_SUBWAY_Boarding_UX_TrainRideSession — riding no longer requires an
// active itinerary (see subwayItineraryRideAuthority.js's own header for the
// full free_ride/itinerary_ride model). This HUD is now the one general ride
// surface, not itinerary-only:
//   - idle + a train selected on the map -> a plain "BOARD TRAIN" offer
//     (free ride — no itinerary to match against).
//   - waiting_to_board (itinerary active) + a train selected -> "MATCHES
//     YOUR TRIP / BOARD THIS TRAIN" when it's a genuine candidate, or the
//     real reason it isn't (wrong route / wrong direction / does not reach
//     exit) — via SubwayItineraryRideAuthority.getTrainMatchInfo(), never
//     independently re-derived.
//   - riding with no leg (free ride) -> CURRENT/NEXT + EXIT TRAIN, no BOARD/
//     TOWARD/EXIT rows (there is no destination to show).
//   - riding/approaching_exit/completed with a leg (itinerary ride) ->
//     unchanged from before.
//
// Status: active | Classification: presentation (DOM only)
//
// Deliberately NOT a redesign of subwayStationHud.js/subwayLineRibbon.js:
// this is its own small, separate panel, quiet (display:none) whenever
// there is genuinely nothing to show (idle, nothing selected).
//
// Reads SubwayItineraryRideAuthority as its state-of-record; also reads
// MTASubwayMapLayer.getSelectedTrain() (public, presentation-layer) for the
// on-map board affordance above — never reaches into
// SunroofCameraController/SubwayLogicalRollingStockAuthority directly (the
// ride authority already owns that binding).
//
// Placement: wall/systems/presentation/subwayItineraryRideHud.js
// Load: AFTER subwayItineraryRideAuthority.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.2.0';

  var STATUS_LABEL = {
    waiting_to_board: 'Waiting to board',
    riding: 'Riding',
    approaching_exit: 'Approaching exit',
    completed: 'Ride complete',
  };

  // How long the transient "BOARDED [ROUTE] TRAIN" confirmation stays up
  // after a successful board — long enough to register, short enough to get
  // out of the way of the now-live CURRENT/NEXT rows underneath it.
  var BOARDED_CONFIRMATION_MS = 4000;

  var _root = null;
  var _lastStatus = null;
  var _boardedConfirmationTimer = null;
  var _showBoardedConfirmation = false;
  var _boardedRouteLabel = null;

  function _ride() { return global.SBE && SBE.SubwayItineraryRideAuthority; }
  function _store() { return global.SBE && SBE.MTASubwayTransitStore; }
  function _mapLayer() { return global.SBE && SBE.MTASubwayMapLayer; }

  function _stationName(id) {
    var store = _store();
    var s = store ? store.getStation(id) : null;
    return (s && s.displayName) || id || '—';
  }

  function _ensureRoot() {
    if (_root) return _root;
    _root = global.document.createElement('div');
    _root.id = 'subway-ride-hud';
    _root.className = 'subway-ride-hud';
    _root.style.display = 'none';
    global.document.body.appendChild(_root);
    return _root;
  }

  function _fmtEta(seconds) {
    if (seconds == null) return '';
    var m = Math.round(seconds / 60);
    return m <= 0 ? 'due' : m + ' min';
  }

  var COMMAND_REASON_MESSAGE = {
    subway_not_active: "SUBWAY map isn't active on this window yet — switch to SUBWAY mode and try again.",
    not_found: 'That train is no longer live — pick another from the list.',
    attach_failed: "Couldn't attach the camera to that train — try again.",
    wrong_route: "That train doesn't serve this trip's line — pick a matching train.",
    wrong_direction: "That train isn't heading toward your trip's exit — pick a matching train.",
    does_not_reach_exit: "That train's real remaining schedule doesn't reach your exit station — pick a matching train.",
  };
  function _lastCommandReasonMessage(reason) {
    return COMMAND_REASON_MESSAGE[reason] || reason;
  }

  // Terse, proactive (pre-click) mismatch labels — the spec's own wording
  // ("wrong direction" / "wrong route" / "does not reach exit") shown next
  // to a selected-but-non-matching train, distinct from the reactive
  // post-click warning copy above.
  var MATCH_REASON_LABEL = {
    wrong_route: 'wrong route',
    wrong_direction: 'wrong direction',
    does_not_reach_exit: 'does not reach exit',
    not_found: 'no longer live',
  };

  // Detects the real waiting_to_board -> riding transition (never inferred
  // from a click — a click can still fail, e.g. subway_not_active) and shows
  // a brief, real confirmation. Tracked here, not in the authority: this is
  // presentation-only state with no bearing on ride truth.
  function _trackBoardTransition(status) {
    if (_lastStatus !== 'riding' && status === 'riding') {
      var ride = _ride();
      var snap = ride ? ride.getSnapshot() : null;
      _boardedRouteLabel = snap && snap.leg ? (snap.leg.routeLabel || snap.leg.routeId) : '';
      _showBoardedConfirmation = true;
      if (_boardedConfirmationTimer) global.clearTimeout(_boardedConfirmationTimer);
      _boardedConfirmationTimer = global.setTimeout(function () {
        _showBoardedConfirmation = false;
        _boardedConfirmationTimer = null;
        _render();
      }, BOARDED_CONFIRMATION_MS);
    }
    _lastStatus = status;
  }

  function _clearBoardedConfirmation() {
    if (_boardedConfirmationTimer) { global.clearTimeout(_boardedConfirmationTimer); _boardedConfirmationTimer = null; }
    _showBoardedConfirmation = false;
    _boardedRouteLabel = null;
    _lastStatus = null;
  }

  // The spec's alternate boarding path — "when the train itself is selected
  // on the map." MTASubwayMapLayer.selectTrain() (the existing, already-
  // wired click handler on the TRAINS layer) is its own separate
  // debug/inspection selection, deliberately untouched here — this only
  // READS its already-public getSelectedTrain() result. No new map-click
  // wiring anywhere in this file or mtaSubwayMapLayer.js.
  function _mapSelectedTrainId() {
    var mapLayer = _mapLayer();
    var selected = mapLayer && typeof mapLayer.getSelectedTrain === 'function' ? mapLayer.getSelectedTrain() : null;
    return (selected && selected.train && selected.train.id) || null;
  }

  // The general train-selection boarding panel (0821_SUBWAY_Boarding_UX_
  // TrainRideSession) — covers BOTH real cases with one path, since
  // getTrainMatchInfo() itself already reports matches:true unconditionally
  // when no itinerary leg is active:
  //   - no itinerary active: any real train -> plain "BOARD TRAIN".
  //   - itinerary active: a genuine candidate -> "MATCHES YOUR TRIP / BOARD
  //     THIS TRAIN"; a non-candidate -> the real reason it isn't (never
  //     independently re-derived — straight from getTrainMatchInfo(), which
  //     itself reuses getLiveCandidates()).
  // Returns '' when nothing is selected on the map — never renders an empty
  // shell.
  function _renderTrainSelectionPanel(ride, hasLeg) {
    var selectedId = _mapSelectedTrainId();
    if (!selectedId) return '';
    var match = ride.getTrainMatchInfo(selectedId);
    var html = '<div class="subway-ride-hud-map-match' + (match.matches ? '' : ' subway-ride-hud-map-match--mismatch') + '">';
    if (match.matches) {
      // hasLeg:false already has "TRAIN SELECTED" as the panel's own header
      // (see _render()) — no itinerary to name here, so the label would
      // just repeat that; only the itinerary case needs its own label.
      if (hasLeg) html += '<div class="subway-ride-hud-map-match-label">MATCHES YOUR TRIP</div>';
      html += '<button class="subway-ride-hud-board-btn subway-ride-hud-board-btn--primary" data-action="select" data-train-id="' + _escape(selectedId) + '">' +
        (hasLeg ? 'BOARD THIS TRAIN' : 'BOARD TRAIN') + '</button>';
    } else {
      html += '<div class="subway-ride-hud-map-match-label">' + _escape(MATCH_REASON_LABEL[match.reason] || match.reason) + '</div>';
    }
    html += '</div>';
    return html;
  }

  // Distinguishes, per the real reconcile-timing race documented in
  // SubwayItineraryRideAuthority.getLiveCandidates()/getBoardingContext():
  // real boardable candidates > a real arrival exists but isn't boardable
  // yet > genuinely nothing predicted. Never the same "LIVE TRAINS — none
  // right now" message for all three, which is what produced the original
  // "arrivals panel shows trains but this says none" confusion.
  function _renderBoardingSection(ride, leg, snap) {
    var ctx = ride.getBoardingContext();
    // Real bug found via live end-to-end testing: getLiveCandidates() can
    // legitimately include a real, identity-associated candidate whose own
    // remaining schedule doesn't actually reach the exit station
    // (directionConfirmed:false — a genuine, honest signal, never a
    // fabrication). Listing it here with a plain BOARD action offered a
    // train that selectTrain()'s own getTrainMatchInfo() check then
    // rejected on click — a real "I clicked BOARD and nothing happened"
    // regression. Filtering through getTrainMatchInfo() itself (never
    // re-deriving the check inline) guarantees what's shown here and what
    // selectTrain() will actually accept can never diverge.
    var candidates = ctx.candidates.filter(function (c) { return ride.getTrainMatchInfo(c.logicalTrainId).matches; });
    var html = _renderTrainSelectionPanel(ride, true);

    if (candidates.length) {
      html += '<div class="subway-ride-hud-candidates-label">LIVE TRAINS</div>';
      html += '<div class="subway-ride-hud-explain">Select a matching train to begin the ride.</div>';
      candidates.slice(0, 5).forEach(function (c) {
        html += '<button class="subway-ride-hud-candidate" data-action="select" data-train-id="' + _escape(c.logicalTrainId) + '">' +
          '<span class="subway-ride-hud-candidate-route">' + _escape(leg.routeLabel || leg.routeId) + '</span>' +
          '<span class="subway-ride-hud-eta">' + _escape(_fmtEta(c.etaSeconds)) + '</span>' +
          '<span class="subway-ride-hud-candidate-dest">' + _escape(c.destination || 'toward ' + leg.direction.towardStationName) + '</span>' +
          '<span class="subway-ride-hud-board-label">BOARD</span>' +
          '</button>';
      });
    } else {
      html += '<div class="subway-ride-hud-candidates-label subway-ride-hud-candidates-label--none">NO BOARDABLE TRAIN YET</div>';
      if (ctx.nextArrival) {
        html += '<div class="subway-ride-hud-row"><span class="subway-ride-hud-label">NEXT ARRIVAL</span><span>' + _escape(_fmtEta(ctx.nextArrival.etaSeconds)) + '</span></div>';
        html += '<div class="subway-ride-hud-explain">Waiting for live train identity…</div>';
      } else {
        html += '<div class="subway-ride-hud-explain">No trains currently predicted for this line.</div>';
      }
    }

    if (snap.lastCommandReason) {
      html += '<div class="subway-ride-hud-warning">' + _escape(_lastCommandReasonMessage(snap.lastCommandReason)) + '</div>';
    }
    return html;
  }

  function _render() {
    var ride = _ride();
    var root = _ensureRoot();
    if (!ride) { root.style.display = 'none'; return; }
    var snap = ride.getSnapshot();
    if (!snap) { root.style.display = 'none'; root.innerHTML = ''; return; }

    // 0821_SUBWAY_Boarding_UX_TrainRideSession — idle is no longer always
    // quiet: a train selected on the map with no ride active is the free-
    // ride entry point (real user requirement: "selecting any valid live
    // train should offer BOARD TRAIN" — even with no itinerary running).
    if (snap.status === 'idle') {
      var idlePanel = _renderTrainSelectionPanel(ride, false);
      if (!idlePanel) {
        root.style.display = 'none';
        root.innerHTML = '';
        _clearBoardedConfirmation();
        return;
      }
      root.style.display = 'block';
      root.innerHTML =
        '<div class="subway-ride-hud-header"><span class="subway-ride-hud-status">TRAIN SELECTED</span>' +
        '<button class="subway-ride-hud-close" data-action="dismiss" title="Dismiss">×</button></div>' + idlePanel;
      return;
    }

    _trackBoardTransition(snap.status);
    root.style.display = 'block';
    var leg = snap.leg; // present for an itinerary ride, null for a free ride

    var html = '';
    html += '<div class="subway-ride-hud-header">';
    html += '<span class="subway-ride-hud-badge">' + _escape(leg ? (leg.routeLabel || leg.routeId) : 'RIDE') + '</span>';
    html += '<span class="subway-ride-hud-status">' + _escape(STATUS_LABEL[snap.status] || snap.status) + '</span>';
    html += '<button class="subway-ride-hud-close" data-action="stop" title="Exit train">×</button>';
    html += '</div>';

    if (_showBoardedConfirmation) {
      html += '<div class="subway-ride-hud-boarded-banner">BOARDED ' + _escape(_boardedRouteLabel) + ' TRAIN</div>';
    }

    // BOARD/TOWARD/EXIT only have meaning with a real planned destination —
    // a free ride has none of those, only where the train actually is.
    if (leg) {
      html += '<div class="subway-ride-hud-row"><span class="subway-ride-hud-label">BOARD</span><span>' + _escape(leg.boardingStation.name) + '</span></div>';
      html += '<div class="subway-ride-hud-row"><span class="subway-ride-hud-label">TOWARD</span><span>' + _escape(leg.direction.towardStationName) + '</span></div>';
    }
    html += '<div class="subway-ride-hud-row"><span class="subway-ride-hud-label">CURRENT</span><span>' + _escape(snap.currentStopId ? _stationName(snap.currentStopId) : '—') + '</span></div>';
    html += '<div class="subway-ride-hud-row"><span class="subway-ride-hud-label">NEXT</span><span>' + _escape(snap.nextStopId ? _stationName(snap.nextStopId) : '—') + '</span></div>';
    if (leg) {
      html += '<div class="subway-ride-hud-row"><span class="subway-ride-hud-label">EXIT</span><span>' + _escape(leg.exitStation.name) + '</span></div>';
    }

    if (snap.status === 'waiting_to_board') {
      html += _renderBoardingSection(ride, leg, snap);
    }

    // "EXIT TRAIN must always be available while riding, even if no
    // destination was declared" — explicit, not just the small header ×.
    if (snap.status === 'riding' || snap.status === 'approaching_exit') {
      html += '<button class="subway-ride-hud-candidate subway-ride-hud-exit" data-action="stop">EXIT TRAIN</button>';
    }

    if (snap.status === 'completed') {
      html += '<button class="subway-ride-hud-candidate subway-ride-hud-done" data-action="stop">Done</button>';
    }

    root.innerHTML = html;
  }

  function _escape(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function _onRootClick(e) {
    var btn = e.target.closest ? e.target.closest('[data-action]') : null;
    if (!btn) return;
    var ride = _ride();
    if (!ride) return;
    var action = btn.getAttribute('data-action');
    if (action === 'stop') { ride.stopRide(); return; }
    if (action === 'select') { ride.selectTrain(btn.getAttribute('data-train-id')); return; }
    if (action === 'dismiss') {
      // Idle "train selected" offer only reflects the map's own selection —
      // dismissing it clears that selection (the existing, public,
      // unmodified clearTrainSelection()) rather than inventing separate
      // panel-only dismissal state.
      var mapLayer = _mapLayer();
      if (mapLayer && typeof mapLayer.clearTrainSelection === 'function') mapLayer.clearTrainSelection();
      _render();
    }
  }

  function _init() {
    var root = _ensureRoot();
    root.addEventListener('click', _onRootClick);
    var ride = _ride();
    if (ride) ride.subscribe(_render);
    _render();
    global.setInterval(_render, 2000); // safety-net poll — matches this codebase's established pattern for presentation surfaces reacting to authority snapshots
  }

  try { _init(); } catch (e) { console.warn('[SubwayItineraryRideHud] init failed:', e && e.message || e); }

  SBE.SubwayItineraryRideHud = Object.freeze({
    VERSION: VERSION,
    __test: { renderNow: _render },
  });

  console.log('[SubwayItineraryRideHud] v' + VERSION + ' loaded');
})(window);
