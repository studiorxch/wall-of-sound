// ── MTABusRealtimeAdapter v1.0.0 ──────────────────────────────────────────────
// 0604H_WOS_MTABusRealtimeAdapter_v1.0.0
// Status: active | Classification: runtime-authority (adapter-only)
//
// Fetches the MTA Bus GTFS-Realtime Vehicle Positions feed, decodes it via
// SBE.GTFSRealtimeBindings, and exposes RAW bus rows. ADAPTER ONLY — never
// creates actors, never upserts ActorRuntime / TruthActorRuntime / WSL, never
// touches Mapbox sources/layers, AIS/marine, Citi Bike, subway, or Studio.
// Reads endpoint/timeout/cadence from SBE.MTABusFeedConfig and the API key from
// SBE.MTABusFeedSourceInventory; gates every fetch on getReadiness(). Failure
// strings come only from SBE.MTABusFeedConfig.FAILURE_REASONS. Never throws out
// of a public call. Load AFTER vendor/gtfsRealtimeBindings.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var SOURCE_ID = 'mta_bus_gtfs_rt_vehicle_positions';

  function _cfg() { return SBE.MTABusFeedConfig || null; }
  function _inv() { return SBE.MTABusFeedSourceInventory || null; }
  function _bindings() { return SBE.GTFSRealtimeBindings || null; }

  var _debug = false;
  var _running = false;
  var _pollTimer = null;
  var _rows = [];
  var _state = {
    lastFetchAt: null, lastSuccessAt: null, lastFailureAt: null, lastFailureReason: null,
    fetchCount: 0, successCount: 0, failureCount: 0,
    decodedEntityCount: 0, rejectedEntityCount: 0,
    rejectReasonCounts: {}, missingRouteIdCount: 0, lastStale: false, lastReadiness: null,
  };

  // Validate a failure reason against the canonical vocabulary (Version B enum).
  function _reason(r) {
    var c = _cfg();
    var list = c && c.FAILURE_REASONS ? c.FAILURE_REASONS : null;
    if (list && list.indexOf(r) === -1) return 'unknown_error';
    return r;
  }

  function _recordFailure(reason) {
    var rr = _reason(reason);
    _state.lastFailureAt = Date.now();
    _state.lastFailureReason = rr;
    _state.failureCount++;
    if (_debug) console.warn('[MTABusAdapter] fetch failed:', rr);
    return { ok: false, rowsAdded: 0, failureReason: rr, decodedEntityCount: 0, rejectedEntityCount: 0 };
  }

  // ── Row extraction + validation ─────────────────────────────────────────────
  function _extract(entity) {
    var vp = entity && entity.vehicle;
    if (!vp) return { reject: 'missing_vehicle_position' };
    var pos = vp.position;
    if (!pos) return { reject: 'missing_vehicle_position' };
    var lat = pos.latitude, lng = pos.longitude;
    if (lat == null || lng == null || !isFinite(lat) || !isFinite(lng)) return { reject: 'missing_coordinates' };
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return { reject: 'missing_coordinates' };
    var vid = (vp.vehicle && vp.vehicle.id) || (vp.vehicle && vp.vehicle.label) || entity.id;
    if (!vid) return { reject: 'missing_vehicle_position' };
    var ts = (vp.timestamp != null && isFinite(vp.timestamp) && vp.timestamp > 0) ? Math.round(vp.timestamp * 1000) : Date.now();
    var routeId = (vp.trip && vp.trip.routeId) || null;
    return {
      row: {
        sourceId: SOURCE_ID,
        vehicleId: String(vid),
        tripId: (vp.trip && vp.trip.tripId) || null,
        routeId: routeId,
        latitude: lat, longitude: lng,
        bearing: (pos.bearing != null && isFinite(pos.bearing)) ? pos.bearing : null,
        speedMps: (pos.speed != null && isFinite(pos.speed)) ? pos.speed : null,
        timestampUtcMs: ts,
        occupancyStatus: vp.occupancyStatus || null,
        rawEntityId: String(entity.id != null ? entity.id : vid),
      },
      missingRouteId: !routeId,
    };
  }

  function _processFeed(feed) {
    var entities = (feed && feed.entity) || [];
    _state.decodedEntityCount = entities.length;
    if (entities.length === 0) return { empty: true };
    var rows = [], rejected = 0, missingRoute = 0, newest = 0;
    for (var i = 0; i < entities.length; i++) {
      var res = _extract(entities[i]);
      if (res.reject) { rejected++; _state.rejectReasonCounts[res.reject] = (_state.rejectReasonCounts[res.reject] || 0) + 1; continue; }
      rows.push(res.row);
      if (res.missingRouteId) missingRoute++;
      if (res.row.timestampUtcMs > newest) newest = res.row.timestampUtcMs;
    }
    _state.rejectedEntityCount = rejected;
    _state.missingRouteIdCount = missingRoute;
    // Stale detection (non-fatal): newest row older than staleAfterMs.
    var c = _cfg();
    var staleAfter = c && c.staleAfterMs ? c.staleAfterMs : 45000;
    _state.lastStale = !!(newest && (Date.now() - newest) > staleAfter);
    return { empty: false, rows: rows, rejected: rejected };
  }

  // ── fetchOnce() — async; resolves to a result object, never rejects ─────────
  function fetchOnce() {
    _state.fetchCount++;
    _state.lastFetchAt = Date.now();
    var inv = _inv(), cfg = _cfg(), bind = _bindings();
    if (!inv || !cfg) return Promise.resolve(_recordFailure('not_configured'));

    var readiness = null;
    try { readiness = inv.getReadiness(); } catch (e) {}
    _state.lastReadiness = readiness;
    if (!readiness || readiness.canAttemptFetch !== true) {
      return Promise.resolve(_recordFailure(readiness && !readiness.apiKeyPresent ? 'api_key_missing' : 'not_configured'));
    }
    if (!bind || !bind.transit_realtime || !bind.transit_realtime.FeedMessage) {
      return Promise.resolve(_recordFailure('decode_failed'));
    }

    var key = null;
    try { key = typeof inv.getApiKey === 'function' ? inv.getApiKey() : null; } catch (e) {}
    if (!key) return Promise.resolve(_recordFailure('api_key_missing'));

    var base = cfg.vehiclePositionsUrl;
    var url = base + (base.indexOf('?') === -1 ? '?' : '&') + 'key=' + encodeURIComponent(key);
    var timeoutMs = cfg.requestTimeoutMs || 10000;

    if (typeof global.fetch !== 'function') return Promise.resolve(_recordFailure('network_error'));

    var controller = (typeof global.AbortController === 'function') ? new global.AbortController() : null;
    var timer = controller ? global.setTimeout(function () { try { controller.abort(); } catch (e) {} }, timeoutMs) : null;

    return global.fetch(url, controller ? { signal: controller.signal } : {})
      .then(function (resp) {
        if (timer) global.clearTimeout(timer);
        if (!resp.ok) {
          var hr = (resp.status === 429) ? 'rate_limited' : 'http_error';
          return _recordFailure(hr);
        }
        return resp.arrayBuffer().then(function (ab) {
          var feed;
          try { feed = bind.transit_realtime.FeedMessage.decode(new Uint8Array(ab)); }
          catch (e) { return _recordFailure('decode_failed'); }

          var proc;
          try { proc = _processFeed(feed); }
          catch (e) { return _recordFailure('decode_failed'); }

          if (proc.empty) { _recordFailure('empty_feed'); return { ok: false, rowsAdded: 0, failureReason: 'empty_feed', decodedEntityCount: 0, rejectedEntityCount: 0 }; }

          _rows = proc.rows;
          _state.lastSuccessAt = Date.now();
          _state.successCount++;
          if (_debug) console.log('[MTABusAdapter] rows', proc.rows.length, '| rejected', proc.rejected, '| stale', _state.lastStale);
          return { ok: true, rowsAdded: proc.rows.length, failureReason: _state.lastStale ? 'stale_feed' : null,
            decodedEntityCount: _state.decodedEntityCount, rejectedEntityCount: proc.rejected };
        });
      })
      .catch(function (err) {
        if (timer) global.clearTimeout(timer);
        var isAbort = err && (err.name === 'AbortError' || /abort/i.test(String(err && err.message)));
        return _recordFailure(isAbort ? 'network_error' : 'network_error');
      });
  }

  // ── Polling (disabled by default; manual fetchOnce preferred) ────────────────
  function start(opts) {
    _running = true;
    var poll = opts && opts.poll === true;
    if (poll) {
      var cfg = _cfg();
      var cadence = Math.max((cfg && cfg.minimumRefreshMs) || 10000, (cfg && cfg.refreshCadenceMs) || 15000);
      _stopPoll();
      _pollTimer = global.setInterval(function () { try { fetchOnce(); } catch (e) {} }, cadence);
    }
    return true;
  }
  function _stopPoll() { if (_pollTimer) { try { global.clearInterval(_pollTimer); } catch (e) {} _pollTimer = null; } }
  function stop() { _running = false; _stopPoll(); return true; }
  function isRunning() { return _running; }

  function getRows() { return _rows.slice(); }
  function clearRows() { _rows = []; return true; }

  function getState() {
    return {
      version: VERSION, running: _running, debug: _debug, sourceId: SOURCE_ID,
      lastFetchAt: _state.lastFetchAt, lastSuccessAt: _state.lastSuccessAt,
      lastFailureAt: _state.lastFailureAt, lastFailureReason: _state.lastFailureReason,
      fetchCount: _state.fetchCount, successCount: _state.successCount, failureCount: _state.failureCount,
      decodedEntityCount: _state.decodedEntityCount, rejectedEntityCount: _state.rejectedEntityCount,
      rowCount: _rows.length,
      rejectReasonCounts: _state.rejectReasonCounts, missingRouteIdCount: _state.missingRouteIdCount,
      lastStale: _state.lastStale,
      readiness: _state.lastReadiness,
    };
  }
  function getStats() {
    var f = _state.fetchCount;
    return {
      fetchCount: _state.fetchCount, successCount: _state.successCount, failureCount: _state.failureCount,
      decodedEntityCount: _state.decodedEntityCount, rejectedEntityCount: _state.rejectedEntityCount,
      rowCount: _rows.length,
      successRate: f > 0 ? Math.round((_state.successCount / f) * 1000) / 1000 : 0,
    };
  }
  function setDebug(on) { _debug = on !== false; return _debug; }

  SBE.MTABusRealtimeAdapter = Object.freeze({
    VERSION:    VERSION,
    start:      start,
    stop:       stop,
    isRunning:  isRunning,
    fetchOnce:  fetchOnce,
    getState:   getState,
    getRows:    getRows,
    getStats:   getStats,
    clearRows:  clearRows,
    setDebug:   setDebug,
  });

  console.log('[MTABusRealtimeAdapter] v' + VERSION + ' loaded (manual fetchOnce — no auto-poll)');
})(window);
