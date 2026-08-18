// ── MTASubwayRealtimeAdapter v1.0.0 ───────────────────────────────────────────
// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD — Data Layer §9
// Status: active | Classification: runtime-authority (adapter-only)
//
// Fetches current MTA subway GTFS-Realtime feeds (one per line group, plus
// the separate alerts feed — see mtaSubwayFeedSourceInventory.js) and decodes
// them via SBE.GTFSRealtimeBindings (extended in this build to also decode
// TripUpdate and Alert, not just VehiclePosition). ADAPTER ONLY — never
// creates map features, never touches Mapbox, never mutates
// ActorRuntime/TruthActorRuntime, never touches the bus/RACETRACK systems.
//
// UNLIKE the bus adapter (mtaBusRealtimeAdapter.js), NO API key is required —
// verified live during this build (every subway GTFS-RT endpoint returned
// real protobuf over a plain unauthenticated fetch). Do not add API-key
// plumbing here; that would misrepresent a source that doesn't need one.
//
// VERIFIED FINDING THIS ADAPTER'S CALLERS MUST RESPECT: current MTA subway
// VehiclePosition entities carry NO latitude/longitude (`position` is always
// null — confirmed by decoding real, live payloads for every line group
// during this build). Only TripUpdate (stop-sequence-relative arrival state)
// and the VehiclePosition current_status/current_stop_sequence/stop_id
// fields carry live train state. Do not fabricate coordinates from this
// data — see mtaSubwayMapFeatures.js for how this is surfaced honestly.
//
// Never throws out of a public call. Load AFTER the (extended)
// vendor/gtfsRealtimeBindings.js and mtaSubwayFeedSourceInventory.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  function _inv() { return SBE.MTASubwayFeedSourceInventory || null; }
  function _bindings() { return SBE.GTFSRealtimeBindings || null; }

  var _debug = false;
  var _tripUpdates = [];   // most recent decoded rows, per line group fetched
  var _vehicles = [];
  var _alerts = [];
  var _state = {
    lastFetchAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailureReason: null,
    fetchCount: 0, successCount: 0, failureCount: 0,
    perGroup: {},   // groupId -> { lastFetchAt, lastSuccessAt, lastFailureReason, decodedEntityCount }
  };

  function _reason(r) {
    var inv = _inv();
    var list = inv && inv.FAILURE_REASONS ? inv.FAILURE_REASONS : null;
    if (list && list.indexOf(r) === -1) return 'unknown_error';
    return r;
  }

  function _recordGroupFailure(groupId, reason) {
    var rr = _reason(reason);
    _state.perGroup[groupId] = _state.perGroup[groupId] || {};
    _state.perGroup[groupId].lastFetchAt = Date.now();
    _state.perGroup[groupId].lastFailureReason = rr;
    _state.lastFailureAt = Date.now();
    _state.lastFailureReason = rr;
    _state.failureCount++;
    if (_debug) console.warn('[MTASubwayRealtimeAdapter] group', groupId, 'failed:', rr);
    return { ok: false, groupId: groupId, failureReason: rr, tripUpdateCount: 0, vehicleCount: 0, alertCount: 0 };
  }

  // ── Row extraction (preserves authoritative IDs; never invents values) ──────
  function _extractTripUpdateRow(entity, sourceGroupId) {
    var tu = entity.tripUpdate;
    var trip = tu.trip || {};
    if (!trip.tripId && !trip.routeId) return null; // no authoritative identity at all — reject
    return {
      entityId: entity.id != null ? String(entity.id) : null,
      sourceGroupId: sourceGroupId,
      tripId: trip.tripId || null,
      routeId: trip.routeId || null,
      trainId: (trip.nyct && trip.nyct.trainId) || null,
      isAssigned: trip.nyct ? !!trip.nyct.isAssigned : null,
      direction: (trip.nyct && trip.nyct.direction) || null,
      timestampUtcMs: (tu.timestamp != null && isFinite(tu.timestamp)) ? Number(tu.timestamp) * 1000 : null,
      stopTimeUpdates: (tu.stopTimeUpdate || []).map(function (s) {
        return {
          stopId: s.stopId || null,
          scheduleRelationship: s.scheduleRelationship || null,
          arrivalUtcMs: (s.arrival && s.arrival.time != null) ? Number(s.arrival.time) * 1000 : null,
          departureUtcMs: (s.departure && s.departure.time != null) ? Number(s.departure.time) * 1000 : null,
          scheduledTrack: (s.nyct && s.nyct.scheduledTrack) || null,
          actualTrack: (s.nyct && s.nyct.actualTrack) || null,
        };
      }),
    };
  }

  function _extractVehicleRow(entity, sourceGroupId) {
    var vp = entity.vehicle;
    var trip = vp.trip || {};
    if (!trip.tripId && !vp.stopId) return null; // no usable identity — reject
    return {
      entityId: entity.id != null ? String(entity.id) : null,
      sourceGroupId: sourceGroupId,
      tripId: trip.tripId || null,
      routeId: trip.routeId || null,
      trainId: (trip.nyct && trip.nyct.trainId) || null,
      // Deliberately no latitude/longitude field here — the current source
      // never supplies one (see header). Consumers must not assume one.
      currentStopSequence: vp.currentStopSequence,
      currentStatus: vp.currentStatus,
      stopId: vp.stopId || null,
      timestampUtcMs: (vp.timestamp != null && isFinite(vp.timestamp)) ? Number(vp.timestamp) * 1000 : null,
    };
  }

  function _extractAlertRow(entity) {
    var al = entity.alert;
    return {
      entityId: entity.id != null ? String(entity.id) : null,
      routeIds: (al.informedEntity || []).map(function (s) { return s.routeId; }).filter(Boolean),
      stopIds: (al.informedEntity || []).map(function (s) { return s.stopId; }).filter(Boolean),
      cause: al.cause != null ? al.cause : null,
      effect: al.effect != null ? al.effect : null,
      headerText: (al.headerText && al.headerText.text) || null,
      descriptionText: (al.descriptionText && al.descriptionText.text) || null,
    };
  }

  // ── fetchGroup(groupId) — fetches + decodes one line-group feed ────────────
  function fetchGroup(groupId) {
    _state.fetchCount++;
    _state.lastFetchAt = Date.now();
    _state.perGroup[groupId] = _state.perGroup[groupId] || {};
    _state.perGroup[groupId].lastFetchAt = Date.now();

    var inv = _inv(), bind = _bindings();
    if (!inv) return Promise.resolve(_recordGroupFailure(groupId, 'not_configured'));
    if (!bind || !bind.transit_realtime || !bind.transit_realtime.FeedMessage) return Promise.resolve(_recordGroupFailure(groupId, 'decode_failed'));

    var source = null;
    var groups = inv.getRealtimeSources();
    for (var i = 0; i < groups.length; i++) if (groups[i].id === 'mta_subway_gtfs_rt_' + groupId) { source = groups[i]; break; }
    if (!source) return Promise.resolve(_recordGroupFailure(groupId, 'not_configured'));

    if (typeof global.fetch !== 'function') return Promise.resolve(_recordGroupFailure(groupId, 'network_error'));

    var controller = (typeof global.AbortController === 'function') ? new global.AbortController() : null;
    var timer = controller ? global.setTimeout(function () { try { controller.abort(); } catch (e) {} }, 10000) : null;

    return global.fetch(source.endpoint, controller ? { signal: controller.signal } : {})
      .then(function (resp) {
        if (timer) global.clearTimeout(timer);
        if (!resp.ok) return _recordGroupFailure(groupId, resp.status === 429 ? 'rate_limited' : 'http_error');
        return resp.arrayBuffer().then(function (ab) {
          var feed;
          try { feed = bind.transit_realtime.FeedMessage.decode(new Uint8Array(ab)); }
          catch (e) { return _recordGroupFailure(groupId, 'decode_failed'); }

          var entities = (feed && feed.entity) || [];
          if (entities.length === 0) return _recordGroupFailure(groupId, 'empty_feed');

          var tripUpdates = [], vehicles = [];
          for (var j = 0; j < entities.length; j++) {
            var ent = entities[j];
            if (ent.tripUpdate) { var tr = _extractTripUpdateRow(ent, groupId); if (tr) tripUpdates.push(tr); }
            if (ent.vehicle) { var vr = _extractVehicleRow(ent, groupId); if (vr) vehicles.push(vr); }
          }

          // Replace only this group's prior rows (other groups' rows untouched).
          _tripUpdates = _tripUpdates.filter(function (r) { return r.sourceGroupId !== groupId; }).concat(tripUpdates);
          _vehicles = _vehicles.filter(function (r) { return r.sourceGroupId !== groupId; }).concat(vehicles);

          _state.perGroup[groupId].lastSuccessAt = Date.now();
          _state.perGroup[groupId].lastFailureReason = null;
          _state.perGroup[groupId].decodedEntityCount = entities.length;
          _state.lastSuccessAt = Date.now();
          _state.successCount++;
          if (_debug) console.log('[MTASubwayRealtimeAdapter]', groupId, '— tripUpdates', tripUpdates.length, 'vehicles', vehicles.length);
          return { ok: true, groupId: groupId, tripUpdateCount: tripUpdates.length, vehicleCount: vehicles.length, decodedEntityCount: entities.length, failureReason: null };
        });
      })
      .catch(function () {
        if (timer) global.clearTimeout(timer);
        return _recordGroupFailure(groupId, 'network_error');
      });
  }

  // ── fetchAlerts() — fetches + decodes the separate alerts feed ─────────────
  function fetchAlerts() {
    _state.fetchCount++;
    var inv = _inv(), bind = _bindings();
    if (!inv) return Promise.resolve(_recordGroupFailure('alerts', 'not_configured'));
    if (!bind || !bind.transit_realtime || !bind.transit_realtime.FeedMessage) return Promise.resolve(_recordGroupFailure('alerts', 'decode_failed'));
    var source = inv.getAlertsSource();
    if (typeof global.fetch !== 'function') return Promise.resolve(_recordGroupFailure('alerts', 'network_error'));

    return global.fetch(source.endpoint)
      .then(function (resp) {
        if (!resp.ok) return _recordGroupFailure('alerts', resp.status === 429 ? 'rate_limited' : 'http_error');
        return resp.arrayBuffer().then(function (ab) {
          var feed;
          try { feed = bind.transit_realtime.FeedMessage.decode(new Uint8Array(ab)); }
          catch (e) { return _recordGroupFailure('alerts', 'decode_failed'); }
          var entities = (feed && feed.entity) || [];
          var alerts = [];
          for (var i = 0; i < entities.length; i++) if (entities[i].alert) alerts.push(_extractAlertRow(entities[i]));
          _alerts = alerts;
          _state.perGroup.alerts = _state.perGroup.alerts || {};
          _state.perGroup.alerts.lastSuccessAt = Date.now();
          _state.perGroup.alerts.lastFailureReason = null;
          _state.lastSuccessAt = Date.now();
          _state.successCount++;
          return { ok: true, groupId: 'alerts', alertCount: alerts.length, failureReason: null };
        });
      })
      .catch(function () { return _recordGroupFailure('alerts', 'network_error'); });
  }

  // ── fetchGroups(groupIds) — parallel fetch of several line groups ──────────
  function fetchGroups(groupIds) {
    var ids = Array.isArray(groupIds) && groupIds.length ? groupIds : ['ace'];
    return Promise.all(ids.map(fetchGroup)).then(function (results) {
      var ok = results.every(function (r) { return r && r.ok; });
      return { ok: ok, results: results };
    });
  }

  function getTripUpdates() { return _tripUpdates.slice(); }
  function getVehicles() { return _vehicles.slice(); }
  function getAlerts() { return _alerts.slice(); }
  function clearAll() { _tripUpdates = []; _vehicles = []; _alerts = []; return true; }

  function getState() {
    return {
      version: VERSION,
      lastFetchAt: _state.lastFetchAt,
      lastSuccessAt: _state.lastSuccessAt,
      lastFailureAt: _state.lastFailureAt,
      lastFailureReason: _state.lastFailureReason,
      fetchCount: _state.fetchCount, successCount: _state.successCount, failureCount: _state.failureCount,
      perGroup: _state.perGroup,
      tripUpdateCount: _tripUpdates.length,
      vehicleCount: _vehicles.length,
      alertCount: _alerts.length,
    };
  }
  function setDebug(on) { _debug = on !== false; return _debug; }

  SBE.MTASubwayRealtimeAdapter = Object.freeze({
    VERSION: VERSION,
    fetchGroup: fetchGroup,
    fetchGroups: fetchGroups,
    fetchAlerts: fetchAlerts,
    getTripUpdates: getTripUpdates,
    getVehicles: getVehicles,
    getAlerts: getAlerts,
    clearAll: clearAll,
    getState: getState,
    setDebug: setDebug,
  });

  console.log('[MTASubwayRealtimeAdapter] v' + VERSION + ' loaded (no API key required — manual fetch by default)');
})(window);
