// ── SubwayLineRibbon v1.0.0 ────────────────────────────────────────────────────
// 0819_SUBWAY_Public_HUD_Line_Ribbon_v1.0.0_BUILD — §16-19
// Status: active | Classification: presentation + pure derivation
//
// A minimal vertical line-context strip on the left edge. Quiet at rest
// (BUILD §16: "extremely quiet... map should remain visually dominant"),
// expands on hover to show station names (§17), and is structurally capable
// of two data modes on top of the same rendering:
//
//   LINE MODE — a selected route's real ordered station sequence (§18),
//   RIDE MODE — a selected train's real remaining canonical stop sequence (§19).
//
// Both derivations read ALREADY-canonical data only:
//   - Line Mode: real station/shape data via MTASubwayTransitStore, ordered
//     by real matched shape-index (the SAME technique
//     subwayTrainMotionModel.js/its own tests already use this session for
//     station-pair discovery — "do not create a manually maintained station
//     sequence", BUILD §18).
//   - Ride Mode: a selected train's own real `TransitTripRef.stopTimes[]`
//     — which, per the Continuous Train Motion Fix's own live-verified
//     finding, is ALREADY exactly "current/last stop + real remaining
//     stops" (real GTFS-Realtime TripUpdates are trimmed to just that as a
//     trip progresses) — no filtering needed, no second parser.
//
// Trigger wiring (BUILD leaves the exact UI trigger to this build's own
// judgment — "at minimum prove" the capability): clicking a line badge in
// SubwayStationHud's station-identity panel sets Line Mode for that route;
// selecting a train (MTASubwayMapLayer.selectTrain(), the existing,
// already-wired interaction) sets Ride Mode for that train. Clearing either
// selection collapses the ribbon back to its quiet rest state.
//
// Placement: wall/systems/presentation/subwayLineRibbon.js
// Load: AFTER mtaSubwayStationLibrary.js, subwayTrainMotionModel.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var _dom = null; // { rootEl } — created lazily
  var _mode = 'collapsed'; // 'collapsed' | 'line' | 'ride'
  var _hoverExpanded = false;
  var _lineData = null; // { routeId, displayName, stations: [{id, displayName}] }
  var _rideData = null; // { logicalTrainId, tripId, routeId, stops: [{stationId, displayName, isCurrent}] }

  // ── Sunroof compact ride state (0819 Sunroof Camera Ride Test, BUILD
  //    §18-22) — while a camera ride is attached, the ribbon defaults to a
  //    compact LINE BADGE / CURRENT / NEXT instrument instead of the full
  //    station list, per BUILD §18 ("uses more screen space than
  //    necessary"). Toggled externally by SubwayCameraSunroof.attach()/
  //    detach() via setSunroofCompactMode() — never toggled by this module
  //    on its own initiative. ──────────────────────────────────────────────
  var _sunroofCompact = false;
  var _rideExpanded = false;
  var _rideAutoMinimizeTimer = null;
  var RIDE_AUTO_MINIMIZE_MS = 6000; // shorter than the public station HUD's 20s — this is a quick glance instrument, not a read-and-digest panel

  function _store() { return SBE.MTASubwayTransitStore || null; }
  function _library() { return SBE.MTASubwayStationLibrary || null; }
  function _rollingStock() { return SBE.SubwayLogicalRollingStockAuthority || null; }

  function _dist(a, b) { var dLat = a[0] - b[0], dLon = a[1] - b[1]; return Math.sqrt(dLat * dLat + dLon * dLon); }
  function _nearestIndex(points, station) {
    var best = -1, bestDist = Infinity;
    for (var i = 0; i < points.length; i++) {
      var d = _dist(points[i], [station.latitude, station.longitude]);
      if (d < bestDist) { bestDist = d; best = i; }
    }
    return (best !== -1 && bestDist <= 0.01) ? best : null;
  }

  // ── Line Mode derivation (BUILD §18) — real ordered station sequence for
  //    a route, derived from real shape-index matching (never a manually
  //    maintained list). Picks the route's longest real shape (most real
  //    stations resolvable) as the representative ordering. ───────────────
  function buildLineSequence(routeId) {
    var store = _store();
    if (!store) return null;
    var route = store.getRoute(routeId);
    if (!route || !route.shapeIds || !route.shapeIds.length) return null;

    var best = null;
    for (var s = 0; s < route.shapeIds.length; s++) {
      var points = store.getShapePoints(route.shapeIds[s]);
      if (!points || points.length < 2) continue;
      var stations = store.getAllStations().filter(function (st) {
        return st.kind === 'station' && st.routeIds.indexOf(route.id) !== -1;
      });
      var indexed = stations.map(function (st) { return { st: st, idx: _nearestIndex(points, st) }; })
        .filter(function (x) { return x.idx != null; });
      if (!best || indexed.length > best.length) best = indexed;
    }
    if (!best || !best.length) return null;
    best.sort(function (a, b) { return a.idx - b.idx; });
    return {
      routeId: routeId,
      displayName: route.displayName || routeId,
      stations: best.map(function (x) { return { id: x.st.id, displayName: x.st.displayName }; }),
    };
  }

  // ── Ride Mode derivation (BUILD §19) — a selected train's real remaining
  //    canonical stop sequence, read directly from its own real trip's
  //    stopTimes (already current-stop-forward per real TripUpdate
  //    trimming — see file header). `isCurrent` marks the train's real
  //    observed/next stop, never a guessed position. ─────────────────────
  function buildRideSequence(logicalTrainId) {
    var store = _store();
    var rs = _rollingStock();
    if (!store || !rs) return null;
    var train = rs.getLogicalTrain(logicalTrainId);
    var pos = rs.getPositionState(logicalTrainId);
    if (!train || !train.activeTripId) return null;
    var trip = null;
    var allTrips = store.getAllTrips();
    for (var i = 0; i < allTrips.length; i++) { if (allTrips[i].id === train.activeTripId) { trip = allTrips[i]; break; } }
    if (!trip || !trip.stopTimes || !trip.stopTimes.length) return null;

    var currentStopId = pos ? (pos.observedStopId || pos.nextStopId) : null;
    var stops = trip.stopTimes.map(function (st) {
      var station = store.getStation(st.stationId);
      return {
        stationId: st.stationId,
        displayName: station ? station.displayName : st.stationId,
        isCurrent: st.stationId === currentStopId,
      };
    });
    return { logicalTrainId: logicalTrainId, tripId: train.activeTripId, routeId: train.routeId, stops: stops };
  }

  // ── DOM ────────────────────────────────────────────────────────────────
  function _ensureDom() {
    if (_dom || !global.document) return _dom;
    var rootEl = global.document.createElement('div');
    rootEl.id = 'subway-line-ribbon';
    rootEl.className = 'subway-line-ribbon subway-ribbon-collapsed';
    rootEl.addEventListener('mouseenter', function () {
      if (_sunroofCompact && _mode === 'ride') { _rideExpanded = true; _clearRideAutoMinimizeTimer(); _render(); return; }
      _hoverExpanded = true; _render();
    });
    rootEl.addEventListener('mouseleave', function () {
      if (_sunroofCompact && _mode === 'ride') { _startRideAutoMinimizeTimer(); return; }
      _hoverExpanded = false; _render();
    });
    rootEl.addEventListener('click', _onRootClick);
    global.document.body.appendChild(rootEl);
    _dom = { rootEl: rootEl };
    return _dom;
  }

  // ── Sunroof compact-ride interaction (BUILD §21 — explicit expand,
  //    explicit minimize, auto-minimize after inactivity). Delegated so a
  //    single listener covers the toggle/exit/minimize controls plus a
  //    click anywhere on the compact block itself as "explicit expand." ──
  function _clearRideAutoMinimizeTimer() {
    if (_rideAutoMinimizeTimer) { global.clearTimeout(_rideAutoMinimizeTimer); _rideAutoMinimizeTimer = null; }
  }
  function _startRideAutoMinimizeTimer() {
    _clearRideAutoMinimizeTimer();
    _rideAutoMinimizeTimer = global.setTimeout(function () { _rideExpanded = false; _rideAutoMinimizeTimer = null; _render(); }, RIDE_AUTO_MINIMIZE_MS);
  }
  function _onRootClick(e) {
    var target = e.target;
    if (target.closest && target.closest('.subway-ribbon-sunroof-toggle')) {
      e.stopPropagation();
      var sunroof = SBE.SunroofCameraController;
      if (sunroof && _rideData) sunroof.attach(_rideData.logicalTrainId);
      return;
    }
    if (target.closest && target.closest('.subway-ribbon-sunroof-exit')) {
      e.stopPropagation();
      var sunroofExit = SBE.SunroofCameraController;
      if (sunroofExit) sunroofExit.detach();
      return;
    }
    if (target.closest && target.closest('.subway-ribbon-sunroof-minimize')) {
      e.stopPropagation();
      _rideExpanded = false; _clearRideAutoMinimizeTimer(); _render();
      return;
    }
    if (_sunroofCompact && _mode === 'ride' && !_rideExpanded) {
      _rideExpanded = true; _clearRideAutoMinimizeTimer(); _render();
    }
  }

  // Called by SubwayCameraSunroof.attach()/detach() only — this module
  // never decides on its own initiative to enter/leave compact ride
  // presentation (BUILD §18: compaction is tied to an active camera ride).
  function setSunroofCompactMode(enabled) {
    _sunroofCompact = !!enabled;
    _rideExpanded = false;
    _clearRideAutoMinimizeTimer();
    _render();
  }

  function _stationListHtml(stations, currentId) {
    var html = '';
    stations.forEach(function (s, i) {
      var isCurrent = currentId != null && s.id === currentId;
      html += '<div class="subway-ribbon-row' + (isCurrent ? ' subway-ribbon-row-current' : '') + '">' +
        '<span class="subway-ribbon-marker">' + (isCurrent ? '┃' : '●') + '</span>' +
        '<span class="subway-ribbon-station">' + _escapeHtml(s.displayName) + (isCurrent ? ' <em>CURRENT</em>' : '') + '</span>' +
        '</div>';
      if (i < stations.length - 1) html += '<div class="subway-ribbon-connector">│</div>';
    });
    return html;
  }

  function _escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // BUILD §19 compact default: "[LINE BADGE] / CURRENT STOP / ↓ / NEXT
  //    STOP" — only when a camera ride is actually attached (_sunroofCompact),
  //    never for a merely-selected-but-not-riding train.
  function _compactRideHtml(rideData) {
    if (!rideData) return '<div class="subway-ribbon-spine"></div>';
    var stops = rideData.stops;
    var currentStop = stops.filter(function (s) { return s.isCurrent; })[0] || null;
    var currentIdx = currentStop ? stops.indexOf(currentStop) : -1;
    var nextStop = currentIdx !== -1 && currentIdx + 1 < stops.length ? stops[currentIdx + 1]
      : (currentIdx === -1 && stops.length ? stops[0] : null);
    var routeLabel = _escapeHtml(rideData.routeId.replace('subway:route:', ''));
    var html = '<div class="subway-ribbon-sunroof-badge">' + routeLabel + '</div>';
    if (currentStop) {
      html += '<div class="subway-ribbon-row subway-ribbon-row-current"><span class="subway-ribbon-marker">┃</span>' +
        '<span class="subway-ribbon-station">' + _escapeHtml(currentStop.displayName) + ' <em>CURRENT</em></span></div>';
    }
    if (nextStop) {
      html += '<div class="subway-ribbon-connector">↓</div>' +
        '<div class="subway-ribbon-row"><span class="subway-ribbon-marker">●</span>' +
        '<span class="subway-ribbon-station">' + _escapeHtml(nextStop.displayName) + ' <em>NEXT</em></span></div>';
    }
    if (!currentStop && !nextStop) html += '<div class="subway-ribbon-row subway-ribbon-row-empty">Stop data unavailable</div>';
    html += '<button type="button" class="subway-ribbon-sunroof-exit">EXIT SUNROOF</button>';
    return html;
  }

  // Full station list for Ride Mode — used both for plain (non-sunroof)
  // train selection AND for the sunroof's explicitly-expanded view. The
  // heading control differs: a SUNROOF entry toggle when no ride is
  // attached yet, or MINIMIZE/EXIT once one is (BUILD §21 — explicit
  // expand, explicit minimize, distinct from auto-minimize-by-timer).
  function _fullRideHtml(rideData) {
    var heading = '<div class="subway-ribbon-heading"><span class="subway-ribbon-heading-label">' +
      _escapeHtml(rideData.routeId.replace('subway:route:', '')) + ' train</span>';
    if (_sunroofCompact) {
      heading += '<span class="subway-ribbon-sunroof-controls">' +
        '<button type="button" class="subway-ribbon-sunroof-minimize">MINIMIZE</button>' +
        '<button type="button" class="subway-ribbon-sunroof-exit">EXIT</button></span>';
    } else {
      heading += '<button type="button" class="subway-ribbon-sunroof-toggle">SUNROOF</button>';
    }
    heading += '</div>';
    return heading + _stationListHtml(rideData.stops.map(function (s) { return { id: s.stationId, displayName: s.displayName }; }),
      rideData.stops.filter(function (s) { return s.isCurrent; }).map(function (s) { return s.stationId; })[0] || null);
  }

  function _render() {
    var dom = _ensureDom();
    var rideCompactActive = _sunroofCompact && _mode === 'ride' && !_rideExpanded;
    var expanded = (_hoverExpanded || _mode !== 'collapsed') && !rideCompactActive;

    dom.rootEl.classList.toggle('subway-ribbon-collapsed', !expanded && !rideCompactActive);
    dom.rootEl.classList.toggle('subway-ribbon-expanded', expanded);
    dom.rootEl.classList.toggle('subway-ribbon-ride-compact', rideCompactActive);

    if (rideCompactActive) { dom.rootEl.innerHTML = _compactRideHtml(_rideData); return; }
    if (!expanded) { dom.rootEl.innerHTML = '<div class="subway-ribbon-spine"></div>'; return; }

    if (_mode === 'line' && _lineData) {
      dom.rootEl.innerHTML = '<div class="subway-ribbon-heading">' + _escapeHtml(_lineData.displayName) + '</div>' +
        _stationListHtml(_lineData.stations, null);
    } else if (_mode === 'ride' && _rideData) {
      dom.rootEl.innerHTML = _fullRideHtml(_rideData);
    } else {
      dom.rootEl.innerHTML = '<div class="subway-ribbon-spine"></div>';
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────
  function _detachSunroofIfActiveForOtherTrain(logicalTrainId) {
    var sunroof = SBE.SunroofCameraController;
    if (sunroof && sunroof.isActive() && sunroof.getActiveTrainId() !== logicalTrainId) sunroof.detach();
  }

  function showLineMode(routeId) {
    var seq = buildLineSequence(routeId);
    if (!seq) return { ok: false, reason: 'not_found' };
    // Line Mode displaces Ride Mode on the same ribbon — a camera ride
    // attached to a train no longer has a ride surface to report into.
    _detachSunroofIfActiveForOtherTrain(null);
    _lineData = seq; _rideData = null; _mode = 'line';
    _render();
    return { ok: true, data: seq };
  }

  function showRideMode(logicalTrainId) {
    var seq = buildRideSequence(logicalTrainId);
    if (!seq) return { ok: false, reason: 'not_found' };
    // Selecting a DIFFERENT train while a ride is attached must never leave
    // the camera silently following the old train while the ribbon shows
    // the new one — detach rather than guess at an implicit re-attach.
    _detachSunroofIfActiveForOtherTrain(logicalTrainId);
    _rideData = seq; _lineData = null; _mode = 'ride';
    _render();
    return { ok: true, data: seq };
  }

  function collapse() {
    _detachSunroofIfActiveForOtherTrain(null);
    _mode = 'collapsed'; _lineData = null; _rideData = null;
    _render();
  }

  function getMode() { return _mode; }

  SBE.SubwayLineRibbon = Object.freeze({
    VERSION: VERSION,
    buildLineSequence: buildLineSequence,
    buildRideSequence: buildRideSequence,
    showLineMode: showLineMode,
    showRideMode: showRideMode,
    collapse: collapse,
    getMode: getMode,
    setSunroofCompactMode: setSunroofCompactMode,
    __test: {
      setHoverExpanded: function (v) { _hoverExpanded = !!v; _render(); },
      isExpanded: function () { return _hoverExpanded || _mode !== 'collapsed'; },
      isSunroofCompact: function () { return _sunroofCompact; },
      isRideExpanded: function () { return _rideExpanded; },
      isAutoMinimizeTimerActive: function () { return !!_rideAutoMinimizeTimer; },
      forceAutoMinimize: function () { _clearRideAutoMinimizeTimer(); _rideExpanded = false; _render(); },
      setRideExpanded: function (v) { if (v) { _rideExpanded = true; _clearRideAutoMinimizeTimer(); } else { _startRideAutoMinimizeTimer(); } _render(); },
      clickSelector: function (sel) { var dom = _ensureDom(); var el = dom.rootEl.querySelector(sel); if (el) el.click(); return !!el; },
    },
  });

  console.log('[SubwayLineRibbon] v' + VERSION + ' loaded');
})(window);
