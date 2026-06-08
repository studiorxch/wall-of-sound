// ── TransitAssignmentAuthority v1.0.0 ─────────────────────────────────────────
// 0605E_WOS_TransitAssignmentAuthority_v1.0.0
// Status: active | Classification: presentation-authority (assignment)
//
// The first intentional assignment layer for live transit: lets WOS say "this bus
// matters" (hero / event / studio / sponsored / graffiti / holiday / debug /
// custom) — turning simulation into world direction. Assignment is PRESENTATION
// authority, never truth: never mutates TruthActorRuntime, telemetry, routes,
// motion smoothing, selector, WSL, or Mapbox. Assignment-cache writes only.
// Assignment SUGGESTS a livery; the livery authority decides. Load AFTER
// transitLiveryHooks.js. Never throws out of a public call.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var LS_KEY = 'wos.transit.assignments';
  var SOURCE_ID = 'mta_bus_gtfs_rt_vehicle_positions';

  var TYPES = { hero: 100, debug: 90, event: 80, studio: 70, sponsored: 60, graffiti: 55, holiday: 50, custom: 40 };

  function _tar() { return SBE.TruthActorRuntime || null; }
  function _mvr() { return SBE.MapboxViewportRuntime || null; }
  function _map() { var m = _mvr(); try { return (m && typeof m.getMap === 'function') ? m.getMap() : null; } catch (e) { return null; } }
  function _ls() { try { return global.localStorage || null; } catch (e) { return null; } }

  var _enabled = true, _active = false, _debug = false;
  var _actor = {}, _vehicle = {}, _route = {};   // assignment caches
  var _heroVehicleId = null;
  var _idSeq = 0;
  var _stats = { resolves: 0, actorResolves: 0, vehicleResolves: 0, routeResolves: 0, noneResolves: 0, heroAssigns: 0, invalidRejects: 0 };
  var _meta = { lastAssignmentAt: null, lastError: null };

  function _isBus(a) {
    if (!a) return false;
    if (a.actorType === 'vehicle.bus') return true;
    if (a.sourceId === SOURCE_ID) return true;
    return !!(a.metadata && a.metadata.mode === 'bus' && a.metadata.system === 'mta');
  }
  function _vehicleId(actor) { var md = (actor && actor.metadata) || {}; return md.vehicleId != null ? md.vehicleId : (actor && actor.sourceEntityId != null ? actor.sourceEntityId : null); }
  function _routeId(actor) { var md = (actor && actor.metadata) || {}; return md.routeId != null ? md.routeId : (actor && actor.routeId != null ? actor.routeId : null); }

  // Normalize a string|object into a full TransitAssignment.
  function _normalize(input, defaultType) {
    var a = (typeof input === 'string') ? { label: input } : (input && typeof input === 'object' ? input : {});
    var type = a.assignmentType || defaultType || 'custom';
    if (!TYPES.hasOwnProperty(type)) { _stats.invalidRejects++; return null; }
    return {
      assignmentId: a.assignmentId || ('asg_' + (++_idSeq) + '_' + Date.now().toString(36)),
      assignmentType: type,
      label: a.label != null ? String(a.label) : (type.charAt(0).toUpperCase() + type.slice(1)),
      description: a.description != null ? a.description : null,
      priority: (typeof a.priority === 'number' && isFinite(a.priority)) ? a.priority : TYPES[type],
      enabled: a.enabled !== false,
      metadata: (a.metadata && typeof a.metadata === 'object') ? a.metadata : {},
    };
  }

  function _store(map, key, assignment, defaultType) {
    if (key == null || String(key).trim() === '') { _meta.lastError = 'invalid_key'; return false; }
    var asg = _normalize(assignment, defaultType);
    if (!asg) { _meta.lastError = 'invalid_assignment_type'; return false; }
    map[String(key)] = asg; _meta.lastAssignmentAt = Date.now(); _meta.lastError = null; _persist();
    return asg;
  }

  // ── Assignment ──────────────────────────────────────────────────────────────
  function assignVehicle(vehicleId, assignment) { return !!_store(_vehicle, vehicleId, assignment); }
  function assignRoute(routeId, assignment) { return !!_store(_route, routeId, assignment); }
  function assignActor(actorId, assignment) { return !!_store(_actor, actorId, assignment); }

  function unassignVehicle(vehicleId) { if (vehicleId != null && _vehicle[String(vehicleId)]) { if (String(vehicleId) === String(_heroVehicleId)) _heroVehicleId = null; delete _vehicle[String(vehicleId)]; _persist(); return true; } return false; }
  function unassignRoute(routeId) { if (routeId != null && _route[String(routeId)]) { delete _route[String(routeId)]; _persist(); return true; } return false; }
  function unassignActor(actorId) { if (actorId != null && _actor[String(actorId)]) { delete _actor[String(actorId)]; _persist(); return true; } return false; }
  function clearAll() { _actor = {}; _vehicle = {}; _route = {}; _heroVehicleId = null; _persist(); return true; }

  // ── resolve(actor) — actor > vehicle > route > none ─────────────────────────
  function _out(actor, asg, source) {
    return { ok: !!asg, actorId: actor && actor.actorId, vehicleId: _vehicleId(actor), routeId: _routeId(actor),
      assignmentId: asg ? asg.assignmentId : null, assignmentType: asg ? asg.assignmentType : null,
      label: asg ? asg.label : null, description: asg ? asg.description : null,
      priority: asg ? asg.priority : 0, enabled: asg ? asg.enabled : false,
      metadata: asg ? asg.metadata : null, source: source };
  }
  function resolve(actor) {
    _stats.resolves++;
    if (!_enabled || !actor || typeof actor !== 'object') { _stats.noneResolves++; return _out(actor || {}, null, 'none'); }
    var aid = actor.actorId;
    if (aid != null && _actor[String(aid)] && _actor[String(aid)].enabled) { _stats.actorResolves++; return _out(actor, _actor[String(aid)], 'actor'); }
    var vid = _vehicleId(actor);
    if (vid != null && _vehicle[String(vid)] && _vehicle[String(vid)].enabled) { _stats.vehicleResolves++; return _out(actor, _vehicle[String(vid)], 'vehicle'); }
    var rid = _routeId(actor);
    if (rid != null && _route[String(rid)] && _route[String(rid)].enabled) { _stats.routeResolves++; return _out(actor, _route[String(rid)], 'route'); }
    _stats.noneResolves++; return _out(actor, null, 'none');
  }
  // Lightweight hero check (used by presence/cruise without a full resolve path).
  function isHeroVehicle(vehicleId) { return vehicleId != null && String(vehicleId) === String(_heroVehicleId); }
  function hasAnyAssignments() { return !!(_heroVehicleId || Object.keys(_actor).length || Object.keys(_vehicle).length || Object.keys(_route).length); }

  // ── Hero helpers (only one active hero) ─────────────────────────────────────
  function assignHeroBus(vehicleId, label) {
    if (vehicleId == null || String(vehicleId).trim() === '') { _meta.lastError = 'invalid_key'; return false; }
    if (_heroVehicleId != null && String(_heroVehicleId) !== String(vehicleId)) {
      var prev = _vehicle[String(_heroVehicleId)];
      if (prev && prev.assignmentType === 'hero') delete _vehicle[String(_heroVehicleId)];   // replace previous hero
    }
    var ok = _store(_vehicle, vehicleId, { assignmentType: 'hero', label: label || ('Hero Bus ' + vehicleId) }, 'hero');
    if (!ok) return false;
    _heroVehicleId = String(vehicleId); _stats.heroAssigns++;
    return true;
  }
  function _busActors() {
    var tar = _tar();
    if (!tar || typeof tar.listActors !== 'function') return [];
    try { return tar.listActors().filter(_isBus); } catch (e) { return []; }
  }
  function assignRandomHeroBus() {
    var buses = _busActors();
    if (!buses.length) { _meta.lastError = 'no_bus_truth'; return false; }
    var pick = buses[Math.floor(Math.random() * buses.length)];
    return assignHeroBus(_vehicleId(pick), 'Random Hero');
  }
  function assignNearestHeroBus() {
    var buses = _busActors(); if (!buses.length) { _meta.lastError = 'no_bus_truth'; return false; }
    var map = _map(); if (!map || typeof map.project !== 'function') { _meta.lastError = 'map_unavailable'; return false; }
    var w = 0, h = 0; try { var cv = map.getCanvas(); w = cv.clientWidth || 0; h = cv.clientHeight || 0; } catch (e) {}
    var cx = w / 2, cy = h / 2, best = null, bestD = Infinity;
    for (var i = 0; i < buses.length; i++) {
      var b = buses[i]; if (b.lng == null || b.lat == null) continue;
      var pt; try { pt = map.project([b.lng, b.lat]); } catch (e) { continue; }
      var d = (pt.x - cx) * (pt.x - cx) + (pt.y - cy) * (pt.y - cy);
      if (d < bestD) { bestD = d; best = b; }
    }
    if (!best) { _meta.lastError = 'no_projectable_bus'; return false; }
    return assignHeroBus(_vehicleId(best), 'Nearest Hero');
  }
  function clearHeroBus() {
    if (_heroVehicleId != null) { var p = _vehicle[String(_heroVehicleId)]; if (p && p.assignmentType === 'hero') delete _vehicle[String(_heroVehicleId)]; _heroVehicleId = null; _persist(); return true; }
    return false;
  }
  function getHeroBus() {
    if (_heroVehicleId == null) return null;
    var asg = _vehicle[String(_heroVehicleId)] || null;
    var actor = null, buses = _busActors();
    for (var i = 0; i < buses.length; i++) { if (String(_vehicleId(buses[i])) === String(_heroVehicleId)) { actor = buses[i]; break; } }
    return { vehicleId: _heroVehicleId, assignment: asg, actorId: actor ? actor.actorId : null,
      lng: actor ? actor.lng : null, lat: actor ? actor.lat : null, routeId: actor ? _routeId(actor) : null };
  }

  // ── Dev-only persistence ────────────────────────────────────────────────────
  function _persist() {
    var ls = _ls(); if (!ls) return;
    try { ls.setItem(LS_KEY, JSON.stringify({ actor: _actor, vehicle: _vehicle, route: _route, hero: _heroVehicleId })); } catch (e) { _meta.lastError = 'persist_failed'; }
  }
  function _load() {
    var ls = _ls(); if (!ls) return;
    try {
      var raw = ls.getItem(LS_KEY); if (!raw) return;
      var d = JSON.parse(raw); if (!d || typeof d !== 'object') return;
      if (d.actor) _actor = d.actor; if (d.vehicle) _vehicle = d.vehicle; if (d.route) _route = d.route;
      _heroVehicleId = d.hero != null ? d.hero : null;
    } catch (e) { _meta.lastError = 'load_failed'; }
  }

  // ── Lifecycle / introspection ───────────────────────────────────────────────
  function start() { _active = true; _load(); return true; }
  function stop() { _active = false; return true; }
  function isActive() { return _active; }
  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }

  function listAssignments() {
    function copy(m) { var o = {}; for (var k in m) if (m.hasOwnProperty(k)) o[k] = m[k]; return o; }
    return { actor: copy(_actor), vehicle: copy(_vehicle), route: copy(_route), heroVehicleId: _heroVehicleId };
  }
  function getAssignment(id) {
    if (id == null) return null;
    var k = String(id);
    return _actor[k] || _vehicle[k] || _route[k] || null;
  }
  function listTypes() { return Object.keys(TYPES); }

  function getState() {
    return { version: VERSION, active: _active, enabled: _enabled, debug: _debug,
      assignmentCount: Object.keys(_actor).length + Object.keys(_vehicle).length + Object.keys(_route).length,
      actorAssignments: Object.keys(_actor).length, vehicleAssignments: Object.keys(_vehicle).length, routeAssignments: Object.keys(_route).length,
      heroVehicleId: _heroVehicleId, persistenceEnabled: !!_ls(),
      lastAssignmentAt: _meta.lastAssignmentAt, lastError: _meta.lastError };
  }
  function getStats() {
    return { resolves: _stats.resolves, actorResolves: _stats.actorResolves, vehicleResolves: _stats.vehicleResolves,
      routeResolves: _stats.routeResolves, noneResolves: _stats.noneResolves, heroAssigns: _stats.heroAssigns, invalidRejects: _stats.invalidRejects };
  }

  SBE.TransitAssignmentAuthority = Object.freeze({
    VERSION:             VERSION,
    start:               start,
    stop:                stop,
    isActive:            isActive,
    assignVehicle:       assignVehicle,
    assignRoute:         assignRoute,
    assignActor:         assignActor,
    unassignVehicle:     unassignVehicle,
    unassignRoute:       unassignRoute,
    unassignActor:       unassignActor,
    clearAll:            clearAll,
    resolve:             resolve,
    isHeroVehicle:       isHeroVehicle,
    hasAnyAssignments:   hasAnyAssignments,
    assignHeroBus:       assignHeroBus,
    assignRandomHeroBus: assignRandomHeroBus,
    assignNearestHeroBus: assignNearestHeroBus,
    clearHeroBus:        clearHeroBus,
    getHeroBus:          getHeroBus,
    listAssignments:     listAssignments,
    getAssignment:       getAssignment,
    listTypes:           listTypes,
    getState:            getState,
    getStats:            getStats,
    setEnabled:          setEnabled,
    setDebug:            setDebug,
  });

  console.log('[TransitAssignmentAuthority] v' + VERSION + ' loaded — ' + Object.keys(TYPES).length + ' assignment types');
})(window);
