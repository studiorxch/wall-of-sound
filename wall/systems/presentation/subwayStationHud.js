// ── SubwayStationHud v1.1.0 ────────────────────────────────────────────────────
// 0819_SUBWAY_Public_HUD_Line_Ribbon_v1.0.0_BUILD — §6-9, §12-15, §21
// 0821_SUBWAY_Boarding_UX_TrainRideSession — when the selected station IS the
// boarding station of an active waiting_to_board itinerary leg, a YOUR TRIP
// section renders above the general arrivals: route/direction/exit, then
// MATCHING LIVE TRAINS with a real BOARD action per candidate. Sourced
// EXCLUSIVELY from SubwayItineraryRideAuthority.getBoardingContext() — never
// a second candidate derivation. Clicking BOARD calls the exact same
// SubwayItineraryRideAuthority.selectTrain() every other boarding entry
// point calls (the itinerary HUD, a directly-selected train) — one boarding
// command, no duplicate ride lifecycle. When a real arrival exists but has
// no logicalTrainId yet, this honestly shows "arrival in X min / waiting for
// live train identity" with no BOARD action, never a fabricated candidate.
//
// Status: active | Classification: presentation (DOM only — no fetch, no
// canonical identity of its own)
//
// The PUBLIC-facing replacement for the small corner debug panel
// mtaSubwayMapLayer.js used to render on station selection. Reads already-
// canonical data only (MTASubwayStationLibrary record + SubwayArrivalIntelligence)
// — never a second identity/arrival authority (BUILD §4/§14: "Use the
// existing Arrival Intelligence data. Do not create a second arrival
// parser."). This module owns three DOM regions:
//
//   #subway-station-identity  — NEIGHBORHOOD / STATION NAME / LINE BADGES
//   #subway-arrival-lane      — up to two transient direction panels
//   #subway-radio-slot        — the reserved bottom-bar RADIO region (§21)
//
// Internal ids (stlib-*, canonical stop ids, freshness/source metadata) are
// deliberately never rendered here — that's the DEBUG HUD's job
// (mtaSubwayMapLayer.js's own gated diagnostics panel, BUILD §5/§13).
//
// Placement: wall/systems/presentation/subwayStationHud.js
// Load: AFTER mtaSubwayStationLibrary.js, subwayArrivalIntelligence.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.1.0';

  // Real, standard MTA borough abbreviations (from the real static GTFS
  // complex data this codebase already imports) — not a fabricated mapping,
  // just the full names for the same 5 real boroughs every NYC subway
  // station already belongs to.
  var BOROUGH_NAMES = {
    Bx: 'The Bronx', Bk: 'Brooklyn', M: 'Manhattan', Q: 'Queens', SI: 'Staten Island',
  };

  // "Choose a reasonable timeout based on current UI patterns" (BUILD §7) —
  // this codebase's own HUD/panel conventions elsewhere in wall/ (traversal
  // HUD auto-hide, tooltip dismissal) commonly land in the 15-30s band for
  // passively-read informational panels; 20s is a middle-of-that-band,
  // generous-enough-to-read, not-nagging choice.
  var DISMISS_MS = 20000;

  var _dom = null; // { identityEl, arrivalLaneEl, radioSlotEl } — created lazily
  var _dismissTimer = null;
  var _currentStationId = null;
  var _hovering = false;

  function _library() { return SBE.MTASubwayStationLibrary || null; }
  function _store() { return SBE.MTASubwayTransitStore || null; }
  function _arrivalIntelligence() { return SBE.SubwayArrivalIntelligence || null; }
  function _ride() { return SBE.SubwayItineraryRideAuthority || null; }

  function _fmtEta(seconds) {
    if (seconds == null) return '';
    var m = Math.round(seconds / 60);
    return m <= 0 ? 'due' : m + ' min';
  }

  function _boroughFullName(code) {
    if (!code) return null;
    return BOROUGH_NAMES[code] || code; // unknown code: show it verbatim rather than hide it, never fabricate a name
  }

  // BUILD §8: "the displayed neighborhood should correspond to that
  // station's location... Prefer an existing geographic/neighborhood
  // resolver if present. Do not fabricate neighborhood names. If
  // neighborhood data is unavailable, fall back gracefully to
  // borough/city context." No arbitrary-lat/lon neighborhood resolver
  // exists anywhere in wall/ (confirmed by live investigation before
  // writing this file — ViewportLocationAuthority only resolves the
  // camera/hero position, not a queried point) — the Station Library's own
  // real `operational.neighborhood` field is used when populated, honestly
  // falling back to the real `operational.borough` (always populated from
  // real MTA static data) rather than inventing a resolver in this build.
  function _neighborhoodContext(record) {
    var op = record.operational;
    if (op.neighborhood) return op.neighborhood;
    var borough = _boroughFullName(op.borough);
    return borough || 'New York, NY';
  }

  // BUILD §12: "circle / route letter/number inside / high contrast /
  // consistent sizing... semantically ready for route-specific color
  // later." Deliberately no per-family color logic yet — a `data-route-id`
  // attribute is the hook a future build can key palette color from
  // without this module needing to change.
  function _buildLineBadge(routeId, displayText) {
    var el = global.document.createElement('span');
    el.className = 'subway-line-badge';
    el.setAttribute('data-route-id', routeId);
    el.textContent = displayText;
    // Line Mode trigger (BUILD §18) — clicking a served-line badge shows
    // that route's real ordered station sequence in the left ribbon. Never
    // reaches into the ribbon's internals — calls its own public API.
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      var ribbon = SBE.SubwayLineRibbon;
      if (ribbon) ribbon.showLineMode(routeId);
      _postponeDismiss();
    });
    return el;
  }

  function _lineBadgesForRecord(record) {
    var store = _store();
    var frag = global.document.createDocumentFragment();
    var routeIds = (record.operational.routeIds || []).slice().sort();
    routeIds.forEach(function (rawRouteId) {
      var canonicalId = 'subway:route:' + rawRouteId;
      var route = store ? store.getRoute(canonicalId) : null;
      var label = route ? (route.displayName || rawRouteId) : rawRouteId;
      frag.appendChild(_buildLineBadge(canonicalId, label));
    });
    return frag;
  }

  // ── DOM setup — idempotent, mirrors mtaSubwayMapLayer.js's own
  //    lazy-HUD-creation convention. ────────────────────────────────────
  function _ensureDom() {
    if (_dom || !global.document) return _dom;
    var identityEl = global.document.createElement('div');
    identityEl.id = 'subway-station-identity';
    identityEl.className = 'subway-station-identity subway-panel-hidden';

    var arrivalLaneEl = global.document.createElement('div');
    arrivalLaneEl.id = 'subway-arrival-lane';
    arrivalLaneEl.className = 'subway-arrival-lane subway-panel-hidden';

    var radioSlotEl = global.document.createElement('div');
    radioSlotEl.id = 'subway-radio-slot';
    radioSlotEl.className = 'subway-radio-slot';
    // BUILD §21: no controllable playback authority exists anywhere in
    // wall/ (confirmed by live investigation) — render the structural slot
    // only, never fake transport controls.
    radioSlotEl.innerHTML = '<span class="subway-radio-label">RADIO</span>';

    [identityEl, arrivalLaneEl].forEach(function (el) {
      el.addEventListener('mouseenter', _onPanelHoverStart);
      el.addEventListener('mouseleave', _onPanelHoverEnd);
    });
    identityEl.addEventListener('click', _onIdentityClick);
    arrivalLaneEl.addEventListener('click', _postponeDismiss);

    global.document.body.appendChild(identityEl);
    global.document.body.appendChild(arrivalLaneEl);
    global.document.body.appendChild(radioSlotEl);
    _dom = { identityEl: identityEl, arrivalLaneEl: arrivalLaneEl, radioSlotEl: radioSlotEl };
    return _dom;
  }

  function _onPanelHoverStart() { _hovering = true; _clearDismissTimer(); }
  function _onPanelHoverEnd() { _hovering = false; _startDismissTimer(); }

  // ── Transient dismissal lifecycle (BUILD §7) ─────────────────────────
  function _clearDismissTimer() {
    if (_dismissTimer) { global.clearTimeout(_dismissTimer); _dismissTimer = null; }
  }
  function _startDismissTimer() {
    _clearDismissTimer();
    if (_hovering) return; // never dismiss while actively hovering/interacting
    _dismissTimer = global.setTimeout(hide, DISMISS_MS);
  }
  function _postponeDismiss() { _startDismissTimer(); }

  // YOUR TRIP's BOARD buttons live inside identityEl — one boarding command
  // (SubwayItineraryRideAuthority.selectTrain()), the exact same one every
  // other boarding entry point calls. Re-shows this same station afterward
  // so the panel reflects the real, current result (a successful board
  // changes getBoardingContext(); a rejected one is simply unchanged).
  function _onIdentityClick(e) {
    _postponeDismiss();
    var btn = e.target.closest ? e.target.closest('[data-board-train-id]') : null;
    if (!btn) return;
    var ride = _ride();
    if (!ride) return;
    ride.selectTrain(btn.getAttribute('data-board-train-id'));
    if (_currentStationId) show(_currentStationId);
  }

  // ── YOUR TRIP (0821_SUBWAY_Boarding_UX_TrainRideSession) ────────────────
  // True only when this exact station is the boarding station of a real,
  // currently waiting_to_board itinerary leg — the same station-library join
  // (canonical stop -> gtfsStopId -> library record) the resolver itself
  // uses, reimplemented independently against public data per this
  // codebase's established per-module convention, never reaching into the
  // resolver's own internals.
  function _isBoardingStationForActiveLeg(record) {
    var ride = _ride();
    var snap = ride ? ride.getSnapshot() : null;
    if (!snap || snap.status !== 'waiting_to_board' || !snap.leg) return false;
    var store = _store();
    var boardingStoreStation = store ? store.getStation(snap.leg.boardingStation.id) : null;
    var gtfsId = boardingStoreStation && boardingStoreStation.authoritativeIds && boardingStoreStation.authoritativeIds.gtfsStopId;
    return !!gtfsId && !!record.authoritativeLink && gtfsId === record.authoritativeLink.gtfsStopId;
  }

  // Sourced EXCLUSIVELY from getBoardingContext() — never independently
  // derives a candidate here. BOARD calls the exact same selectTrain() every
  // other boarding entry point calls (one boarding command, no duplicate
  // ride lifecycle).
  function _renderYourTripSection(snap) {
    var ride = _ride();
    var leg = snap.leg;
    var ctx = ride.getBoardingContext();
    // Real bug found via live end-to-end testing: getLiveCandidates() can
    // legitimately include a real, identity-associated candidate whose own
    // remaining schedule doesn't actually reach the exit station
    // (directionConfirmed:false — a genuine, honest signal, never a
    // fabrication). Listing it under "MATCHING LIVE TRAINS" with a plain
    // BOARD action offered a train that selectTrain()'s own
    // getTrainMatchInfo() check then rejected on click. Filtering through
    // getTrainMatchInfo() itself (never re-deriving the check inline)
    // guarantees what's shown here and what selectTrain() will actually
    // accept can never diverge.
    var matchingCandidates = ctx.candidates.filter(function (c) { return ride.getTrainMatchInfo(c.logicalTrainId).matches; });

    var html = '<div class="subway-station-your-trip">';
    html += '<div class="subway-station-your-trip-label">YOUR TRIP</div>';
    html += '<div class="subway-station-your-trip-route">' + _escapeHtml(leg.routeLabel || leg.routeId) + ' · toward ' + _escapeHtml(leg.direction.towardStationName) + '</div>';
    html += '<div class="subway-station-your-trip-exit">Exit at ' + _escapeHtml(leg.exitStation.name) + '</div>';

    if (matchingCandidates.length) {
      html += '<div class="subway-station-your-trip-candidates-label">MATCHING LIVE TRAINS</div>';
      matchingCandidates.slice(0, 5).forEach(function (c) {
        html += '<button class="subway-station-your-trip-candidate" data-board-train-id="' + _escapeHtml(c.logicalTrainId) + '">' +
          '<span>' + _escapeHtml(_fmtEta(c.etaSeconds)) + ' · ' + _escapeHtml(c.destination || 'toward ' + leg.direction.towardStationName) + '</span>' +
          '<span class="subway-station-your-trip-board">BOARD</span>' +
          '</button>';
      });
    } else if (ctx.nextArrival) {
      // A real arrival exists but has no logicalTrainId yet — honest,
      // never a fabricated candidate, no BOARD action.
      html += '<div class="subway-station-your-trip-waiting">arrival in ' + _escapeHtml(_fmtEta(ctx.nextArrival.etaSeconds)) + '</div>';
      html += '<div class="subway-station-your-trip-waiting-sub">waiting for live train identity</div>';
    } else {
      html += '<div class="subway-station-your-trip-waiting-sub">No trains currently predicted for this line.</div>';
    }
    html += '</div>';
    return html;
  }

  // ── Arrival direction panels (BUILD §14) — reads SubwayArrivalIntelligence
  //    exclusively; never re-derives arrival timing itself. ───────────────
  function _renderArrivalPanels(record) {
    var dom = _ensureDom();
    var ai = _arrivalIntelligence();
    if (!ai) { dom.arrivalLaneEl.innerHTML = ''; return; }
    var result = ai.getArrivalsForStation(record.studioRichStationId);
    if (!result.ok || !result.data.directions.length) {
      dom.arrivalLaneEl.innerHTML = '<div class="subway-arrival-panel subway-arrival-empty">No upcoming arrivals available right now.</div>';
      return;
    }
    var html = '';
    result.data.directions.forEach(function (dir) {
      html += '<div class="subway-arrival-panel">';
      html += '<div class="subway-arrival-panel-heading">' + _escapeHtml(dir.friendlyLabel) + '</div>';
      if (!dir.arrivals.length) {
        html += '<div class="subway-arrival-row subway-arrival-row-empty">No trains currently predicted</div>';
      } else {
        dir.arrivals.forEach(function (a) {
          var routeLabel = a.routeId.replace('subway:route:', '');
          var etaLabel = a.dueSoon ? 'Due' : (Math.max(1, Math.round(a.etaSeconds / 60)) + ' min');
          html += '<div class="subway-arrival-row">' +
            '<span class="subway-arrival-route">' + _escapeHtml(routeLabel) + '</span>' +
            '<span class="subway-arrival-eta">' + _escapeHtml(etaLabel) + '</span>' +
            '<span class="subway-arrival-dest">' + _escapeHtml(a.destination || dir.destination || '') + '</span>' +
            '</div>';
        });
      }
      html += '</div>';
    });
    dom.arrivalLaneEl.innerHTML = html;
  }

  function _escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────
  function show(studioRichStationId) {
    var lib = _library();
    if (!lib) return { ok: false, reason: 'library_unavailable' };
    var record = lib.getRecord(studioRichStationId);
    if (!record) return { ok: false, reason: 'not_found' };

    var dom = _ensureDom();
    _currentStationId = studioRichStationId;

    dom.identityEl.innerHTML =
      '<div class="subway-station-neighborhood">' + _escapeHtml(_neighborhoodContext(record)) + '</div>' +
      '<div class="subway-station-name">' + _escapeHtml(record.operational.displayName || '') + '</div>';
    var badgeRow = global.document.createElement('div');
    badgeRow.className = 'subway-line-badge-row';
    badgeRow.appendChild(_lineBadgesForRecord(record));
    dom.identityEl.appendChild(badgeRow);

    var ride = _ride();
    var rideSnap = ride ? ride.getSnapshot() : null;
    if (rideSnap && _isBoardingStationForActiveLeg(record)) {
      dom.identityEl.insertAdjacentHTML('beforeend', _renderYourTripSection(rideSnap));
    }

    _renderArrivalPanels(record);

    dom.identityEl.classList.remove('subway-panel-hidden');
    dom.arrivalLaneEl.classList.remove('subway-panel-hidden');
    _startDismissTimer();
    return { ok: true, data: record };
  }

  function hide() {
    _clearDismissTimer();
    _hovering = false;
    _currentStationId = null;
    if (!_dom) return;
    _dom.identityEl.classList.add('subway-panel-hidden');
    _dom.arrivalLaneEl.classList.add('subway-panel-hidden');
  }

  function isVisible() {
    return !!(_dom && !_dom.identityEl.classList.contains('subway-panel-hidden'));
  }

  function refreshArrivals() {
    if (!_currentStationId || !isVisible()) return;
    var lib = _library();
    var record = lib ? lib.getRecord(_currentStationId) : null;
    if (record) _renderArrivalPanels(record);
  }

  SBE.SubwayStationHud = Object.freeze({
    VERSION: VERSION,
    DISMISS_MS: DISMISS_MS,
    show: show,
    hide: hide,
    isVisible: isVisible,
    refreshArrivals: refreshArrivals,
    getCurrentStationId: function () { return _currentStationId; },
    // Test-only exposures — pure functions, never mutate identity.
    __neighborhoodContext: _neighborhoodContext,
    __boroughFullName: _boroughFullName,
    __isBoardingStationForActiveLeg: _isBoardingStationForActiveLeg,
    __test: {
      postponeDismiss: _postponeDismiss,
      forceDismiss: hide,
      isDismissTimerActive: function () { return !!_dismissTimer; },
      setHovering: function (v) { if (v) { _onPanelHoverStart(); } else { _onPanelHoverEnd(); } },
    },
  });

  console.log('[SubwayStationHud] v' + VERSION + ' loaded');
})(window);
