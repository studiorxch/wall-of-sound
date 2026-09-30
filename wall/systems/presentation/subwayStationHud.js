// ── SubwayStationHud v1.2.0 ────────────────────────────────────────────────────
// 0819_SUBWAY_Public_HUD_Line_Ribbon_v1.0.0_BUILD — §6-9, §15, §21
// 0821_SUBWAY_Boarding_UX_TrainRideSession — when the selected station IS the
// boarding station of an active waiting_to_board itinerary leg, a YOUR TRIP
// section renders inside the identity block: route/direction/exit, then
// MATCHING LIVE TRAINS with a real BOARD action per candidate. Sourced
// EXCLUSIVELY from SubwayItineraryRideAuthority.getBoardingContext() — never
// a second candidate derivation. Clicking BOARD calls the exact same
// SubwayItineraryRideAuthority.selectTrain() every other boarding entry
// point calls (the itinerary HUD, a directly-selected train) — one boarding
// command, no duplicate ride lifecycle. When a real arrival exists but has
// no logicalTrainId yet, this honestly shows "arrival in X min / waiting for
// live train identity" with no BOARD action, never a fabricated candidate.
// This is a distinct, itinerary-scoped feature (an active boarding decision),
// not the general per-direction arrival board removed below — it stays.
//
// STATION-03 — MAP → STATION presentation boundary: the general §11-12
// per-direction arrival board (up to two transient panels, one per real
// direction, listing several upcoming arrivals each) has been REMOVED from
// this module. MAP's selected-station presentation is now the lightweight
// identity block only; detailed live arrivals (NORTHBOUND/SOUTHBOUND, max
// two per service) are now Station Cover's job exclusively
// (music/src/logic/maps/stationArrivalPresentation.ts +
// music/src/station/stationCoverRuntime.ts) — see
// docs/architecture/subway/README.md §14. The underlying data authority
// this module read from, `SubwayArrivalIntelligence`, is UNCHANGED and
// UNDUPLICATED — this is a presentation-only removal, not a data-authority
// change. `refreshArrivals()`/`isVisible()`'s old arrival-panel behavior no
// longer exists; `show()`/`hide()` now only manage the identity block.
//
// Status: active | Classification: presentation (DOM only — no fetch, no
// canonical identity of its own)
//
// The PUBLIC-facing replacement for the small corner debug panel
// mtaSubwayMapLayer.js used to render on station selection. Reads already-
// canonical data only (MTASubwayStationLibrary record) — never a second
// identity authority. This module owns two DOM regions:
//
//   #subway-station-identity  — NEIGHBORHOOD / STATION NAME / LINE BADGES / YOUR TRIP
//   #subway-radio-slot        — the reserved bottom-bar RADIO region (§21)
//
// Internal ids (stlib-*, canonical stop ids, freshness/source metadata) are
// deliberately never rendered here — that's the DEBUG HUD's job
// (mtaSubwayMapLayer.js's own gated diagnostics panel, BUILD §5/§13).
//
// Placement: wall/systems/presentation/subwayStationHud.js
// Load: AFTER mtaSubwayStationLibrary.js, subwayArrivalIntelligence.js
// (still a real load-order dependency: SubwayItineraryRideAuthority's own
// YOUR TRIP section indirectly relies on arrival-adjacent identity timing
// elsewhere in the boot sequence, even though this module itself no longer
// calls SubwayArrivalIntelligence directly).
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.2.0';

  // "Choose a reasonable timeout based on current UI patterns" (BUILD §7) —
  // this codebase's own HUD/panel conventions elsewhere in wall/ (traversal
  // HUD auto-hide, tooltip dismissal) commonly land in the 15-30s band for
  // passively-read informational panels; 20s is a middle-of-that-band,
  // generous-enough-to-read, not-nagging choice.
  var DISMISS_MS = 20000;

  var _dom = null; // { identityEl, radioSlotEl } — created lazily
  var _dismissTimer = null;
  var _currentStationId = null;
  var _hovering = false;

  function _library() { return SBE.MTASubwayStationLibrary || null; }
  function _store() { return SBE.MTASubwayTransitStore || null; }
  function _ride() { return SBE.SubwayItineraryRideAuthority || null; }

  function _fmtEta(seconds) {
    if (seconds == null) return '';
    var m = Math.round(seconds / 60);
    return m <= 0 ? 'due' : m + ' min';
  }

  // STATION-04 -- neighborhood/borough resolution and the served-route
  // line-badge row (`_boroughFullName`/`_neighborhoodContext`/
  // `_buildLineBadge`/`_lineBadgesForRecord`) were REMOVED from this file:
  // that identity content is the Mezzanine Drawer's job exclusively now
  // (see subwayMezzanineDrawer.js / music/station.html, which already
  // re-derive the same facts from canonical Station Truth independently).
  // KNOWN GAP, intentionally deferred (see docs/architecture/subway/README.md
  // §15): `_buildLineBadge`'s click handler was the ONLY production
  // trigger for `SubwayLineRibbon.showLineMode()` ("click a served route
  // to see its ordered station sequence in the left ribbon"). No
  // replacement trigger was added this batch -- the drawer's own route
  // badges live in a separate document and cannot call a `wall/`-realm
  // function directly. Recommended smallest resolution: a small
  // `postMessage` bridge from the drawer's badge click to
  // `subwayMezzanineDrawer.js`, which already owns the same-origin iframe
  // reference needed to receive it.

  // ── DOM setup — idempotent, mirrors mtaSubwayMapLayer.js's own
  //    lazy-HUD-creation convention. ────────────────────────────────────
  function _ensureDom() {
    if (_dom || !global.document) return _dom;
    var identityEl = global.document.createElement('div');
    identityEl.id = 'subway-station-identity';
    identityEl.className = 'subway-station-identity subway-panel-hidden';

    var radioSlotEl = global.document.createElement('div');
    radioSlotEl.id = 'subway-radio-slot';
    radioSlotEl.className = 'subway-radio-slot';
    // BUILD §21: no controllable playback authority exists anywhere in
    // wall/ (confirmed by live investigation) — render the structural slot
    // only, never fake transport controls.
    radioSlotEl.innerHTML = '<span class="subway-radio-label">RADIO</span>';

    identityEl.addEventListener('mouseenter', _onPanelHoverStart);
    identityEl.addEventListener('mouseleave', _onPanelHoverEnd);
    identityEl.addEventListener('click', _onIdentityClick);

    global.document.body.appendChild(identityEl);
    global.document.body.appendChild(radioSlotEl);
    _dom = { identityEl: identityEl, radioSlotEl: radioSlotEl };
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

    // STATION-04 -- neighborhood/name/line-badge identity is now the
    // Mezzanine Drawer's job exclusively (see subwayMezzanineDrawer.js and
    // music/station.html) -- rendering it here too would be exactly the
    // "fragmented station information" this batch consolidates. This
    // block now renders ONLY YOUR TRIP (an itinerary-scoped, live-action
    // decision surface this codebase's own STATION-03/04 recon confirmed
    // cannot safely cross into the drawer's separately-hosted iframe
    // document -- the same reachability class as live arrivals). When
    // there is no active boarding leg for this station, identityEl stays
    // empty and hidden -- never a redundant identity card.
    dom.identityEl.innerHTML = '';
    var ride = _ride();
    var rideSnap = ride ? ride.getSnapshot() : null;
    var hasYourTrip = !!(rideSnap && _isBoardingStationForActiveLeg(record));
    if (hasYourTrip) {
      dom.identityEl.insertAdjacentHTML('beforeend', _renderYourTripSection(rideSnap));
      dom.identityEl.classList.remove('subway-panel-hidden');
      _startDismissTimer();
    } else {
      dom.identityEl.classList.add('subway-panel-hidden');
      _clearDismissTimer();
    }

    var drawer = SBE.SubwayMezzanineDrawer;
    var gtfsStopId = record.authoritativeLink && record.authoritativeLink.gtfsStopId;
    if (drawer && gtfsStopId) drawer.open(gtfsStopId);

    return { ok: true, data: record };
  }

  function hide() {
    _clearDismissTimer();
    _hovering = false;
    _currentStationId = null;
    var drawer = SBE.SubwayMezzanineDrawer;
    if (drawer) drawer.close();
    if (!_dom) return;
    _dom.identityEl.classList.add('subway-panel-hidden');
  }

  function isVisible() {
    return !!(_dom && !_dom.identityEl.classList.contains('subway-panel-hidden'));
  }

  SBE.SubwayStationHud = Object.freeze({
    VERSION: VERSION,
    DISMISS_MS: DISMISS_MS,
    show: show,
    hide: hide,
    isVisible: isVisible,
    getCurrentStationId: function () { return _currentStationId; },
    // Test-only exposures — pure functions, never mutate identity.
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
