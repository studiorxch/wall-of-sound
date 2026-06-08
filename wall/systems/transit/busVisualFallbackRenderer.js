// ── BusVisualFallbackRenderer v1.0.0 ──────────────────────────────────────────
// 0604J_WOS_BusVisualFallbackRenderer_v1.0.0
// Status: active | Classification: interpretation-layer (presentation-only)
//
// Renders a BOUNDED, altitude-aware visible subset of `vehicle.bus` truth actors
// on the Wall using simple fallback bus shapes. PRESENTATION ONLY — never mutates
// TruthActorRuntime truth, adapter rows, bridge rows, Mapbox sources/layers, asset
// assignments, or Studio. Writes only `bus_fallback:*` payloads into WSL and tracks
// its own ids so clear() is precisely scoped. Reuses the existing WSL `city-bus`
// silhouette builder (no WSL change). Manual renderOnce() — no continuous RAF.
// Load AFTER mtaBusActorBridge.js. Never throws out of a public call.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var SOURCE_ID = 'mta_bus_gtfs_rt_vehicle_positions';
  var WSL_SOURCE = 'mta-bus-fallback';
  var ID_PREFIX = 'bus_fallback:';
  var MAX_SCAN_ACTORS = 6000;
  var DEFAULT_STALE_MS = 45000;
  var DEFAULT_PADDING_PX = 160;

  // Altitude profiles (zoom proxy) → budget + base scale + variant.
  var PROFILES = {
    low:      { minZoom: 15.5, budget: 120, scale: 1.00, variant: 'fallback_bus_low' },
    city:     { minZoom: 12.0, budget: 300, scale: 0.72, variant: 'fallback_bus_city' },
    regional: { minZoom: 9.0,  budget: 500, scale: 0.38, variant: 'fallback_bus_dot' },
    cruise:   { minZoom: -Infinity, budget: 0, scale: 0.00, variant: null },
  };

  function _tar() { return SBE.TruthActorRuntime || null; }
  function _wsl() { return SBE.WorldSpaceVehicleLayer || null; }
  function _mvr() { return SBE.MapboxViewportRuntime || null; }
  function _cfg() { return SBE.MTABusFeedConfig || null; }
  function _map() { var m = _mvr(); try { return (m && typeof m.getMap === 'function') ? m.getMap() : null; } catch (e) { return null; } }
  function _staleMs() { var c = _cfg(); return (c && c.MTA_BUS_STALE_AFTER_MS) || (c && c.staleAfterMs) || DEFAULT_STALE_MS; }

  var _enabled = true, _active = false, _debug = false;
  var _maxVisibleOverride = null;
  var _paddingPx = DEFAULT_PADDING_PX;
  var _renderedIds = {};   // wslId → actorId  (only bus_fallback payloads we wrote)
  var _pollTimer = null;
  var _state = {
    lastRenderAt: null, renderCount: 0, lastError: null,
    truthActorCount: 0, eligibleCount: 0, viewportCandidateCount: 0,
    selectedCount: 0, renderedCount: 0, removedCount: 0,
    altitudeProfile: 'city', maxVisible: PROFILES.city.budget, truncated: false,
  };
  var _sel = { totalBusActors: 0, validBusActors: 0, staleRejected: 0, viewportRejected: 0,
    selected: 0, budget: 0, profile: 'city', renderedIds: [] };

  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  function _isBus(a) {
    if (!a) return false;
    if (a.actorType === 'vehicle.bus') return true;
    if (a.sourceId === SOURCE_ID) return true;
    return !!(a.metadata && a.metadata.mode === 'bus' && a.metadata.system === 'mta');
  }

  function _profileForZoom(zoom) {
    if (zoom == null || !isFinite(zoom)) return 'city';
    if (zoom >= PROFILES.low.minZoom) return 'low';
    if (zoom >= PROFILES.city.minZoom) return 'city';
    if (zoom >= PROFILES.regional.minZoom) return 'regional';
    return 'cruise';
  }
  function _budgetFor(profileName) {
    if (profileName === 'cruise') return 0;   // cruise never draws individual buses
    var base = PROFILES[profileName].budget;
    return _maxVisibleOverride != null ? Math.min(_maxVisibleOverride, base) : base;
  }

  // Project a bus to screen px (null if unavailable).
  function _project(map, lng, lat) {
    if (!map || typeof map.project !== 'function') return null;
    try { var p = map.project([lng, lat]); return { x: p.x, y: p.y }; } catch (e) { return null; }
  }
  function _canvasSize(map) {
    try { var c = map.getCanvas(); return { w: c.clientWidth || c.width || 0, h: c.clientHeight || c.height || 0 }; }
    catch (e) { return { w: 0, h: 0 }; }
  }

  // ── renderOnce() — select a bounded subset and upsert to WSL ─────────────────
  function renderOnce() {
    _state.renderCount++;
    _state.lastRenderAt = Date.now();
    _state.lastError = null;

    var tar = _tar(), wsl = _wsl(), map = _map();
    var wslOk = !!(wsl && typeof wsl.upsertVehicle === 'function');
    var tarOk = !!(tar && typeof tar.listActors === 'function');

    // Reset selection counters.
    _sel = { totalBusActors: 0, validBusActors: 0, staleRejected: 0, viewportRejected: 0,
      selected: 0, budget: 0, profile: 'city', renderedIds: [] };

    if (!_enabled) { _state.lastError = 'disabled'; return _result(false); }
    if (!tarOk) { _state.lastError = 'actor_runtime_unavailable'; return _result(false); }
    if (!wslOk) { _state.lastError = 'wsl_unavailable'; return _result(false); }

    // 0604K — delegate selection to the BusPresentationSelector when present.
    // Renderer keeps payload construction / upsert / clear / id tracking.
    var selector = SBE.BusPresentationSelector;
    if (selector && typeof selector.select === 'function') {
      var selection = null;
      try { selection = selector.select(); } catch (e) { selection = null; }
      if (selection) return _renderFromSelection(selection, wsl);
      // selection null → fall through to internal fallback below.
    }

    var zoom = null;
    if (map && typeof map.getZoom === 'function') { try { zoom = map.getZoom(); } catch (e) {} }
    var profileName = _profileForZoom(zoom);
    var profile = PROFILES[profileName];
    var budget = _budgetFor(profileName);
    _state.altitudeProfile = profileName;
    _state.maxVisible = budget;
    _sel.profile = profileName; _sel.budget = budget;

    // Gather bus truth actors (deterministic, scan-capped).
    var all;
    try { all = tar.listActors(); } catch (e) { all = []; }
    _state.truthActorCount = all.length;
    var buses = [];
    for (var i = 0; i < all.length && buses.length < MAX_SCAN_ACTORS; i++) { if (_isBus(all[i])) buses.push(all[i]); }
    _state.truncated = (all.length > MAX_SCAN_ACTORS);
    _sel.totalBusActors = buses.length;

    var now = Date.now();
    var staleMs = _staleMs();
    var size = map ? _canvasSize(map) : { w: 0, h: 0 };
    var cx = size.w / 2, cy = size.h / 2;

    var candidates = [];
    var eligible = 0;
    for (var j = 0; j < buses.length; j++) {
      var a = buses[j];
      var lat = _num(a.lat), lng = _num(a.lng);
      if (lat == null || lng == null || lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
      _sel.validBusActors++;
      if (a.metadata && a.metadata.presentationEligible === false) continue;
      eligible++;
      // Stale gate.
      var ts = _num(a.timestampMs);
      if (ts != null && (now - ts) > staleMs) { _sel.staleRejected++; continue; }
      // Viewport gate (needs a map; cruise budget 0 short-circuits below anyway).
      if (map) {
        var pt = _project(map, lng, lat);
        if (!pt) { _sel.viewportRejected++; continue; }
        if (pt.x < -_paddingPx || pt.y < -_paddingPx || pt.x > size.w + _paddingPx || pt.y > size.h + _paddingPx) {
          _sel.viewportRejected++; continue;
        }
        var dx = pt.x - cx, dy = pt.y - cy;
        candidates.push({ actor: a, dist: Math.sqrt(dx * dx + dy * dy), ts: ts || 0 });
      } else {
        // No map → cannot place; treat as viewport-rejected (state explains why).
        _sel.viewportRejected++;
      }
    }
    _state.eligibleCount = eligible;
    _state.viewportCandidateCount = candidates.length;

    // Selection priority: viewport-center distance → freshness → id (deterministic).
    candidates.sort(function (p, q) {
      if (p.dist !== q.dist) return p.dist - q.dist;
      if (p.ts !== q.ts) return q.ts - p.ts;
      return String(p.actor.actorId) < String(q.actor.actorId) ? -1 : 1;
    });
    var selected = (budget > 0) ? candidates.slice(0, budget) : [];
    _state.selectedCount = selected.length;
    _sel.selected = selected.length;

    var applied = _applyActors(selected.map(function (s) { return s.actor; }), profileName, profile, wsl);
    _state.renderedCount = applied.rendered;
    _state.removedCount = applied.removed;
    _sel.renderedIds = Object.keys(_renderedIds);

    if (_debug) console.log('[BusFallback:internal]', profileName, 'budget', budget, '| buses', buses.length, '| candidates', candidates.length, '| rendered', applied.rendered, '| removed', applied.removed);
    return _result(true);
  }

  // Shared WSL apply: build fallback payloads, upsert, remove unselected, track ids.
  function _applyActors(actorList, profileName, profile, wsl) {
    var keepIds = {}, rendered = 0;
    for (var k = 0; k < actorList.length; k++) {
      var actor = actorList[k];
      if (!actor) continue;
      var wslId = ID_PREFIX + actor.actorId;
      // 0605B — presentation motion continuity (truth untouched; falls back to
      // truth coordinates when smoothing is absent/disabled).
      var rLng = actor.lng, rLat = actor.lat;
      var sm = SBE.BusMotionSmoothing;
      if (sm && typeof sm.getPresentationPosition === 'function') {
        try { sm.observe(actor); var sp = sm.getPresentationPosition(actor.actorId); if (sp) { rLng = sp.lng; rLat = sp.lat; } } catch (e) {}
      }
      // 0604M — distinct fleet silhouette from the asset resolver (falls back to
      // the generic city-bus block when the resolver is absent).
      var ar = SBE.BusAssetResolver;
      var ap = (ar && typeof ar.getPresentationProfile === 'function')
        ? (function () { try { return ar.getPresentationProfile(actor); } catch (e) { return null; } })() : null;
      var silhouette = ap ? ap.silhouetteClass : 'city-bus';
      var assetClass = ap ? ap.assetClass : null;
      var classScale = ap && ap.scale != null ? ap.scale : 1;
      // 0605G — articulated bus two-segment presentation (bend metadata only).
      var artic = null;
      if (assetClass === 'articulated' && SBE.ArticulatedBusPresentationPass) {
        var ab = SBE.ArticulatedBusPresentationPass;
        try { if (typeof ab.observe === 'function') ab.observe(actor); artic = (typeof ab.getPresentationState === 'function') ? ab.getPresentationState(actor.actorId) : null; } catch (e) {}
      }
      // 0605C — presentation livery hook (truth untouched; default_mta fallback).
      var lh = SBE.TransitLiveryHooks;
      var livery = (lh && typeof lh.resolveForActor === 'function')
        ? (function () { try { return lh.resolveForActor(actor); } catch (e) { return null; } })() : null;
      // 0605E — director assignment (presentation only; truth untouched).
      var aa = SBE.TransitAssignmentAuthority;
      var assignment = (aa && typeof aa.resolve === 'function')
        ? (function () { try { return aa.resolve(actor); } catch (e) { return null; } })() : null;
      var payload = {
        id: wslId,
        actorId: actor.actorId,
        actorType: 'vehicle.bus',
        silhouetteClass: silhouette,
        variant: (ap && ap.variant) || profile.variant,
        renderVariant: (ap && ap.variant) || profile.variant,
        lat: rLat, lng: rLng,
        headingDeg: actor.headingDeg || 0,
        scale: profile.scale * classScale,
        paletteRef: (livery && livery.paletteRef) || (ap && ap.paletteRef) || 'actor.generic',
        priorityClass: 'civic-service',
        visible: true,
        source: WSL_SOURCE,
        metadata: {
          routeId: (actor.metadata && actor.metadata.routeId) || null,
          vehicleId: (actor.metadata && actor.metadata.vehicleId) || actor.sourceEntityId || null,
          busAssetClass: assetClass,
          truthClass: 'observed',
          altitudeProfile: profileName,
          // 0605C presentation-only livery hooks (no truth mutation).
          liveryKey: livery ? livery.liveryKey : null,
          liveryCategory: livery ? livery.category : null,
          liverySource: livery ? livery.source : null,
          wrapKey: livery ? livery.wrapKey : null,
          surfaceTag: livery ? livery.surfaceTag : null,
          // 0605E director assignment metadata (presentation only).
          assignmentType: (assignment && assignment.ok) ? assignment.assignmentType : null,
          assignmentLabel: (assignment && assignment.ok) ? assignment.label : null,
          assignmentId: (assignment && assignment.ok) ? assignment.assignmentId : null,
          // 0605G articulation (presentation only).
          articulationBendDeg: artic ? artic.bendAngleDeg : null,
          articulationSimplified: artic ? artic.simplified : null,
          rearLng: artic ? artic.rearLng : null,
          rearLat: artic ? artic.rearLat : null,
        },
        articulationBendDeg: artic ? artic.bendAngleDeg : 0,
      };
      var ok = false;
      try { ok = !!wsl.upsertVehicle(payload); } catch (e) { /* skip this bus */ }
      if (ok) { keepIds[wslId] = actor.actorId; rendered++; }
    }
    var removed = 0;
    for (var oldId in _renderedIds) {
      if (!_renderedIds.hasOwnProperty(oldId)) continue;
      if (!keepIds[oldId]) { try { if (wsl.removeVehicle) wsl.removeVehicle(oldId); removed++; } catch (e) {} }
    }
    _renderedIds = keepIds;
    return { rendered: rendered, removed: removed };
  }

  // 0604K — render the subset the BusPresentationSelector chose.
  function _renderFromSelection(selection, wsl) {
    var profileName = selection.profile || 'city';
    var profile = PROFILES[profileName] || PROFILES.city;
    var budget = selection.budget || 0;
    var c = selection.counts || {};
    var sel = selection.selectedActors || [];
    var ready = selection.readyActors || [];
    _state.altitudeProfile = profileName;
    _state.maxVisible = budget;
    _state.truthActorCount = c.totalBusActors || 0;
    _state.eligibleCount = c.validBusActors || 0;
    _state.viewportCandidateCount = sel.length + ready.length;
    _state.selectedCount = sel.length;
    _sel = { totalBusActors: c.totalBusActors || 0, validBusActors: c.validBusActors || 0,
      staleRejected: c.staleRejected || 0, viewportRejected: c.viewportRejected || 0,
      selected: sel.length, budget: budget, profile: profileName, renderedIds: [] };

    var actorList = sel.map(function (x) { return (x && x.actor) ? x.actor : x; });
    var applied = _applyActors(actorList, profileName, profile, wsl);
    _state.renderedCount = applied.rendered;
    _state.removedCount = applied.removed;
    _state.lastError = null;   // zero-render explanation lives in the selector (0604K)
    _sel.renderedIds = Object.keys(_renderedIds);
    if (_debug) console.log('[BusFallback:selector]', profileName, 'budget', budget, '| selected', sel.length, '| rendered', applied.rendered, '| removed', applied.removed, '| zero', selection.zeroRenderReason);
    return _result(true);
  }

  function _result(ok) {
    return {
      ok: ok,
      profile: _state.altitudeProfile,
      budget: _state.maxVisible,
      truthActorCount: _state.truthActorCount,
      eligibleCount: _state.eligibleCount,
      viewportCandidateCount: _state.viewportCandidateCount,
      selectedCount: _state.selectedCount,
      renderedCount: _state.renderedCount,
      removedCount: _state.removedCount,
      lastError: _state.lastError,
    };
  }

  // ── clear() — remove ONLY this renderer's WSL payloads ──────────────────────
  function clear() {
    var wsl = _wsl();
    var removed = 0;
    if (wsl && typeof wsl.removeVehicle === 'function') {
      for (var id in _renderedIds) { if (_renderedIds.hasOwnProperty(id)) { try { wsl.removeVehicle(id); removed++; } catch (e) {} } }
    }
    _renderedIds = {};
    _state.renderedCount = 0; _state.removedCount = removed;
    if (_debug) console.log('[BusFallback] cleared', removed, 'fallback bus payloads');
    return removed;
  }

  // ── Lifecycle (manual by default; optional conservative interval) ────────────
  function start(opts) {
    _active = true;
    _stopPoll();
    if (opts && typeof opts.intervalMs === 'number') {
      var ms = Math.max(15000, opts.intervalMs);
      _pollTimer = global.setInterval(function () { try { renderOnce(); } catch (e) {} }, ms);
    }
    try { renderOnce(); } catch (e) {}
    return true;
  }
  function _stopPoll() { if (_pollTimer) { try { global.clearInterval(_pollTimer); } catch (e) {} _pollTimer = null; } }
  function stop() { _active = false; _stopPoll(); return true; }
  function isActive() { return _active; }

  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }
  function setMaxVisible(count) { var n = Number(count); _maxVisibleOverride = (isFinite(n) && n >= 0) ? Math.floor(n) : null; return _maxVisibleOverride; }
  function setViewportPaddingPx(px) { var n = Number(px); if (isFinite(n) && n >= 0) _paddingPx = Math.floor(n); return _paddingPx; }

  function getRenderedIds() { return Object.keys(_renderedIds); }
  function getSelectionState() {
    return {
      totalBusActors: _sel.totalBusActors, validBusActors: _sel.validBusActors,
      staleRejected: _sel.staleRejected, viewportRejected: _sel.viewportRejected,
      selected: _sel.selected, budget: _sel.budget, profile: _sel.profile,
      renderedIds: _sel.renderedIds.slice(),
    };
  }
  function getState() {
    var tar = _tar(), wsl = _wsl(), map = _map();
    return {
      version: VERSION, active: _active, enabled: _enabled, debug: _debug,
      lastRenderAt: _state.lastRenderAt, renderCount: _state.renderCount, lastError: _state.lastError,
      truthActorCount: _state.truthActorCount, eligibleCount: _state.eligibleCount,
      viewportCandidateCount: _state.viewportCandidateCount, selectedCount: _state.selectedCount,
      renderedCount: _state.renderedCount, removedCount: _state.removedCount,
      altitudeProfile: _state.altitudeProfile, maxVisible: _state.maxVisible,
      viewportPaddingPx: _paddingPx, truncated: _state.truncated,
      wslAvailable: !!(wsl && typeof wsl.upsertVehicle === 'function'),
      actorRuntimeAvailable: !!(tar && typeof tar.listActors === 'function'),
      mapAvailable: !!map,
    };
  }

  SBE.BusVisualFallbackRenderer = Object.freeze({
    VERSION:             VERSION,
    start:               start,
    stop:                stop,
    isActive:            isActive,
    renderOnce:          renderOnce,
    clear:               clear,
    setEnabled:          setEnabled,
    setDebug:            setDebug,
    setMaxVisible:       setMaxVisible,
    setViewportPaddingPx: setViewportPaddingPx,
    getState:            getState,
    getSelectionState:   getSelectionState,
    getRenderedIds:      getRenderedIds,
  });

  console.log('[BusVisualFallbackRenderer] v' + VERSION + ' loaded (manual renderOnce — bounded, altitude-aware)');
})(window);
