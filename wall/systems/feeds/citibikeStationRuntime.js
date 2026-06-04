// ── CitiBikeStationRuntime v1.0.0 ─────────────────────────────────────────────
// 0603C_WOS_CitiBikeGBFSStationRuntime_v1.0.0
// Status: active | Classification: feed-adapter (truth source → actor runtime)
//
// First live public-feed adapter. Fetches Citi Bike GBFS station_information +
// station_status, merges by station_id, and upserts normalized `bike.station`
// truth actors into SBE.TruthActorRuntime. NO moving bikes, NO trip inference,
// NO synthetic motion, NO direct WorldSpaceVehicleLayer writes.
//
// Authority:
//   OWNS: GBFS station polling/merge → bike.station actor updates
//   USES: SBE.TruthActorRuntime.upsertActor (only), MapboxViewportRuntime (read)
//   MUST NOT: touch hero/AIS/aircraft/ambient/Mapbox style, throw on fetch fail
// Load AFTER truthActorRuntime.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  var VERSION   = '1.0.0';
  var SOURCE_ID = 'citibike_gbfs';
  var ACTOR_TYPE = 'bike.station';
  var DISCOVERY_URL = 'https://gbfs.citibikenyc.com/gbfs/gbfs.json';
  var POLL_INTERVAL_MS = 30000;
  var STARTUP_RETRY_MS = 5000;
  var STATION_TTL_MS   = 3600000;
  var STATUS_STALE_MS  = 120000;
  var MAX_ACTORS_PER_REFRESH = 2500;
  var VIEWPORT_PADDING_PX = 320;

  // Fallback direct URLs if discovery fails (public, no auth).
  var FALLBACK_INFO   = 'https://gbfs.citibikenyc.com/gbfs/en/station_information.json';
  var FALLBACK_STATUS = 'https://gbfs.citibikenyc.com/gbfs/en/station_status.json';

  // ── State ───────────────────────────────────────────────────────────────────
  var _active = false, _enabled = true, _debug = false, _viewportFilter = false;
  var _pollTimer = null;
  var _stations = {};   // stationId → normalized merged record
  var _info = {};       // stationId → information record
  var _feedUrls = { discovery: DISCOVERY_URL, stationInformation: '', stationStatus: '' };
  var _stats = {
    lastFetchAt: 0, lastMergeAt: 0, lastUpsertAt: 0, lastError: null,
    fetchCount: 0, upsertCount: 0, staleCount: 0, informationCount: 0, statusCount: 0,
  };
  var _refreshing = false;

  function _now() { return Date.now(); }
  function _tar() { return SBE.TruthActorRuntime; }
  function _map() {
    try { var mvr = SBE.MapboxViewportRuntime; return mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null; }
    catch (e) { return null; }
  }
  function _log() { if (_debug) console.log.apply(console, ['[CitiBikeStationRuntime]'].concat([].slice.call(arguments))); }

  // ── Fetch helpers (defensive; never throw) ──────────────────────────────────
  function _fetchJson(url) {
    if (!global.fetch) return Promise.reject(new Error('fetch_unavailable'));
    var opts = { method: 'GET' };
    try { opts.cache = 'no-store'; } catch (e) {}
    return global.fetch(url, opts).then(function (res) {
      if (!res || !res.ok) throw new Error('http_' + (res ? res.status : 'noresp'));
      return res.json();
    });
  }

  // GBFS v2 (data.stations) and v3 share the stations array under data.stations.
  function _extractStations(json) {
    if (json && json.data && Array.isArray(json.data.stations)) return json.data.stations;
    if (json && Array.isArray(json.stations)) return json.stations;
    return [];
  }
  // Discovery: find feed urls for a language (v2 data.<lang>.feeds, v3 data.feeds).
  function _findFeedUrls(json) {
    var out = { stationInformation: '', stationStatus: '' };
    try {
      var feeds = [];
      if (json && json.data) {
        if (Array.isArray(json.data.feeds)) feeds = json.data.feeds;           // v3
        else {
          for (var lang in json.data) {                                         // v2 (en, etc.)
            if (json.data[lang] && Array.isArray(json.data[lang].feeds)) { feeds = json.data[lang].feeds; break; }
          }
        }
      }
      feeds.forEach(function (f) {
        if (!f || !f.name || !f.url) return;
        if (f.name === 'station_information') out.stationInformation = f.url;
        if (f.name === 'station_status')      out.stationStatus = f.url;
      });
    } catch (e) {}
    return out;
  }

  // ── Refresh: discover → fetch → merge → upsert ──────────────────────────────
  function refresh() {
    if (_refreshing) return Promise.resolve(false);
    _refreshing = true;

    var p = Promise.resolve();
    // Discover URLs if not yet resolved.
    if (!_feedUrls.stationInformation || !_feedUrls.stationStatus) {
      p = _fetchJson(DISCOVERY_URL).then(function (disc) {
        var urls = _findFeedUrls(disc);
        _feedUrls.stationInformation = urls.stationInformation || FALLBACK_INFO;
        _feedUrls.stationStatus      = urls.stationStatus || FALLBACK_STATUS;
      }).catch(function (err) {
        // Discovery failed → fall back to direct URLs, record (do not throw).
        _feedUrls.stationInformation = FALLBACK_INFO;
        _feedUrls.stationStatus      = FALLBACK_STATUS;
        _stats.lastError = 'discovery_failed:' + (err && err.message ? err.message : err);
      });
    }

    return p.then(function () {
      _stats.fetchCount++;
      var infoP = _fetchJson(_feedUrls.stationInformation)
        .then(function (j) { return _extractStations(j); })
        .catch(function (err) { _stats.lastError = 'info_fetch_failed:' + (err && err.message ? err.message : err); return null; });
      var statusP = _fetchJson(_feedUrls.stationStatus)
        .then(function (j) { return _extractStations(j); })
        .catch(function (err) { _stats.lastError = 'status_fetch_failed:' + (err && err.message ? err.message : err); return null; });
      return Promise.all([infoP, statusP]);
    }).then(function (res) {
      var infoArr = res[0], statusArr = res[1];
      _stats.lastFetchAt = _now();
      _mergeAndUpsert(infoArr, statusArr);
      _refreshing = false;
      return true;
    }).catch(function (err) {
      _stats.lastError = 'refresh_failed:' + (err && err.message ? err.message : err);
      _refreshing = false;
      return false;
    });
  }

  function _num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
  function _bool(v) { return v === true || v === 1; }

  function _mergeAndUpsert(infoArr, statusArr) {
    // 1. Update information cache (owns id/name/lat/lon/capacity).
    if (infoArr && infoArr.length) {
      _info = {};
      _stats.informationCount = 0;
      infoArr.forEach(function (s) {
        var id = s.station_id != null ? String(s.station_id) : null;
        var lat = s.lat, lng = (s.lon != null ? s.lon : s.lng);
        if (!id || typeof lat !== 'number' || typeof lng !== 'number') return;   // invalid → skip
        _info[id] = { stationId: id, name: s.name || ('Station ' + id), lat: lat, lng: lng, capacity: _num(s.capacity) };
        _stats.informationCount++;
      });
    }

    // 2. Index status by id.
    var statusById = {};
    if (statusArr && statusArr.length) {
      _stats.statusCount = 0;
      statusArr.forEach(function (s) {
        var id = s.station_id != null ? String(s.station_id) : null;
        if (!id) return;
        statusById[id] = s; _stats.statusCount++;
      });
    }

    // 3. Merge per station (information drives the set; keep stale status if missing).
    var now = _now();
    var staleCount = 0;
    Object.keys(_info).forEach(function (id) {
      var base = _info[id];
      var st = statusById[id];
      var prev = _stations[id] || {};
      var lastReported = st && st.last_reported != null ? Number(st.last_reported) * (st.last_reported < 1e12 ? 1000 : 1) : prev.lastReported || 0;
      var statusStale = !st || (lastReported && (now - lastReported) > STATUS_STALE_MS);
      if (statusStale) staleCount++;
      var bikes = st ? _num(st.num_bikes_available) : _num(prev.numBikesAvailable);
      var cap = base.capacity;
      _stations[id] = {
        stationId: id, name: base.name, lat: base.lat, lng: base.lng, capacity: cap,
        numBikesAvailable:  bikes,
        numDocksAvailable:  st ? _num(st.num_docks_available)  : _num(prev.numDocksAvailable),
        numEbikesAvailable: st ? _num(st.num_ebikes_available) : _num(prev.numEbikesAvailable),
        isInstalled: st ? _bool(st.is_installed) : (prev.isInstalled !== false),
        isRenting:   st ? _bool(st.is_renting)   : (prev.isRenting !== false),
        isReturning: st ? _bool(st.is_returning) : (prev.isReturning !== false),
        lastReported: lastReported,
        statusStale: !!statusStale,
        pressureRatio: cap > 0 ? Math.round((bikes / cap) * 1000) / 1000 : 0,
        actorId: prev.actorId || null,
      };
    });
    _stats.staleCount = staleCount;
    _stats.lastMergeAt = now;

    if (_enabled) _upsertActors();
  }

  // Optional viewport filter — controls which stations render (never deletes records).
  function _passesViewport(station) {
    if (!_viewportFilter) return true;
    var map = _map();
    if (!map || typeof map.project !== 'function') return true;   // can't filter → allow
    try {
      var p = map.project([station.lng, station.lat]);
      var c = map.getCanvas();
      var m = VIEWPORT_PADDING_PX;
      return p.x >= -m && p.y >= -m && p.x <= c.clientWidth + m && p.y <= c.clientHeight + m;
    } catch (e) { return true; }
  }

  function _upsertActors() {
    var tar = _tar();
    if (!tar || typeof tar.upsertActor !== 'function') { _stats.lastError = 'truth_actor_runtime_missing'; return; }
    var now = _now();
    var count = 0;
    var ids = Object.keys(_stations);
    for (var i = 0; i < ids.length; i++) {
      if (count >= MAX_ACTORS_PER_REFRESH) break;
      var s = _stations[ids[i]];
      if (!_passesViewport(s)) continue;
      var actorId = tar.upsertActor({
        sourceId: SOURCE_ID, sourceEntityId: s.stationId, actorType: ACTOR_TYPE,
        label: s.name, lng: s.lng, lat: s.lat, headingDeg: 0, speedMps: 0,
        timestampMs: now, ttlMs: STATION_TTL_MS,
        metadata: {
          stationId: s.stationId, capacity: s.capacity,
          numBikesAvailable: s.numBikesAvailable, numDocksAvailable: s.numDocksAvailable,
          numEbikesAvailable: s.numEbikesAvailable, isInstalled: s.isInstalled,
          isRenting: s.isRenting, isReturning: s.isReturning,
          lastReported: s.lastReported, statusStale: s.statusStale, pressureRatio: s.pressureRatio,
        },
      });
      if (actorId) { s.actorId = actorId; count++; }
    }
    _stats.upsertCount = count;
    _stats.lastUpsertAt = now;
    _log('upserted', count, 'station actors');
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  function start(options) {
    options = options || {};
    if (options.viewportFilter != null) _viewportFilter = !!options.viewportFilter;
    if (_active) { return true; }
    _active = true;
    var tar = _tar();
    try { if (tar && typeof tar.start === 'function') tar.start(); } catch (e) {}
    // One async refresh (never blocks the caller / Drive).
    try { refresh(); } catch (e) { _stats.lastError = 'start_refresh_failed:' + (e && e.message ? e.message : e); }
    _startPoll();
    console.log('[CitiBikeStationRuntime] v' + VERSION + ' started');
    return true;
  }
  function _startPoll() {
    if (_pollTimer) return;
    _pollTimer = global.setInterval(function () {
      if (!_active || !_enabled) return;
      try { refresh(); } catch (e) { _stats.lastError = 'poll_refresh_failed:' + (e && e.message ? e.message : e); }
    }, POLL_INTERVAL_MS);
  }
  function _stopPoll() { if (_pollTimer) { global.clearInterval(_pollTimer); _pollTimer = null; } }

  function stop() { _active = false; _stopPoll(); console.log('[CitiBikeStationRuntime] stopped'); return true; }
  function restart(options) { stop(); return start(options); }

  function clear() {
    var tar = _tar();
    Object.keys(_stations).forEach(function (id) {
      var s = _stations[id];
      if (s.actorId && tar && typeof tar.removeActor === 'function') { try { tar.removeActor(s.actorId); } catch (e) {} }
    });
    _stations = {}; _info = {};
    _stats.upsertCount = 0;
    console.log('[CitiBikeStationRuntime] cleared (only citibike station actors)');
    return true;
  }

  function setEnabled(on) { _enabled = !!on; if (!_enabled) _stopPoll(); else if (_active) _startPoll(); return _enabled; }
  function setDebug(on) { _debug = !!on; return _debug; }
  function setViewportFilter(on) { _viewportFilter = !!on; if (_active) _upsertActors(); return _viewportFilter; }

  function getStation(stationId) { return _stations[String(stationId)] || null; }
  function listStations() { return Object.keys(_stations).map(function (k) { return _stations[k]; }); }

  function getState() {
    return {
      version: VERSION, active: _active, enabled: _enabled, debug: _debug,
      viewportFilterEnabled: _viewportFilter,
      stationCount: Object.keys(_stations).length,
      actorCount: _stats.upsertCount,
      informationCount: _stats.informationCount,
      statusCount: _stats.statusCount,
      lastFetchAt: _stats.lastFetchAt, lastMergeAt: _stats.lastMergeAt, lastUpsertAt: _stats.lastUpsertAt,
      lastError: _stats.lastError,
      fetchCount: _stats.fetchCount, upsertCount: _stats.upsertCount, staleCount: _stats.staleCount,
      feedUrls: {
        discovery: _feedUrls.discovery,
        stationInformation: _feedUrls.stationInformation,
        stationStatus: _feedUrls.stationStatus,
      },
    };
  }

  SBE.CitiBikeStationRuntime = Object.freeze({
    VERSION:           VERSION,
    start:             start,
    stop:              stop,
    restart:           restart,
    refresh:           refresh,
    clear:             clear,
    getState:          getState,
    listStations:      listStations,
    getStation:        getStation,
    setEnabled:        setEnabled,
    setDebug:          setDebug,
    setViewportFilter: setViewportFilter,
  });

  console.log('[CitiBikeStationRuntime] v' + VERSION + ' loaded');
})(window);
