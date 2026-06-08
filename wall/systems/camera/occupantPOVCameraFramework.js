// ── OccupantPOVCameraFramework v1.0.0 ─────────────────────────────────────────
// 0605L_WOS_OccupantPOVCameraFramework_v1.0.0
// Status: active | Classification: presentation-layer (occupant anchors)
//
// Canonical occupant-based camera ANCHORS for WOS. Answers exactly one question —
// "where is the viewer sitting?" — and nothing more:
//
//     Occupancy → Anchor → Lens → Presentation
//                  ▲ this spec owns only the Anchor stage
//
// Maps (actor, anchorId) → an actor-local occupant offset {x:right, y:forward,
// z:up} (metres) plus the resolved world eye position. NO lens, framing, pitch,
// bearing, or cinematic behaviour — those belong to 0605I/0605K. Actor-agnostic:
// cars, buses, walkers, bikes, ferries, and future classes. READ-ONLY: derives
// from actor position/heading only; mutates nothing. Pure resolver (no map/DOM
// required). Load after the camera shot presets. Never throws publicly.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // Canonical anchor offsets — local metres: x = right of travel, y = forward
  // (+ = toward heading), z = up (occupant eye height above the actor footprint).
  var ANCHOR_OFFSETS = {
    // Car cabin
    driver_seat:       { x: -0.35, y:  0.20, z: 1.25 },
    front_passenger:   { x:  0.35, y:  0.20, z: 1.25 },
    rear_seat:         { x:  0.00, y: -0.55, z: 1.20 },
    // Car viewpoints (looking out)
    windshield_view:   { x:  0.00, y:  0.55, z: 1.25 },
    left_window_view:  { x: -0.45, y:  0.00, z: 1.20 },
    right_window_view: { x:  0.45, y:  0.00, z: 1.20 },
    rear_window_view:  { x:  0.00, y: -0.65, z: 1.20 },
    // Bus
    bus_front_window:  { x:  0.00, y:  1.80, z: 2.30 },
    bus_passenger:     { x:  0.00, y:  0.50, z: 2.10 },
    // Walker / bike / ferry
    walker_head:       { x:  0.00, y:  0.00, z: 1.65 },
    bike_rider:        { x:  0.00, y:  0.00, z: 1.55 },
    ferry_passenger:   { x:  0.00, y:  0.00, z: 4.00 },
  };
  // Canonical list (the 11 named anchors).
  var CANONICAL = ['driver_seat', 'front_passenger', 'rear_seat', 'windshield_view',
    'left_window_view', 'right_window_view', 'rear_window_view', 'bus_front_window',
    'walker_head', 'bike_rider', 'ferry_passenger'];

  // Default anchor per vehicle class (used when no anchorId is supplied).
  var CLASS_DEFAULT = { car: 'driver_seat', bus: 'bus_front_window', walker: 'walker_head', bike: 'bike_rider', ferry: 'ferry_passenger' };

  function _num(v) { return (typeof v === 'number' && isFinite(v)) ? v : (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v) ? parseFloat(v) : null); }

  // Classify an actor into a vehicle profile class.
  function vehicleClassOf(actor) {
    if (!actor) return 'car';
    var md = actor.metadata || {};
    var explicit = (actor.vehicleClass || md.vehicleClass || md.class || '').toString().toLowerCase();
    if (CLASS_DEFAULT[explicit]) return explicit;
    var t = (actor.actorType || actor.type || '').toString().toLowerCase();
    if (t.indexOf('bus') >= 0) return 'bus';
    if (t.indexOf('marine') >= 0 || t.indexOf('ferry') >= 0 || t.indexOf('vessel') >= 0 || t.indexOf('boat') >= 0) return 'ferry';
    if (t.indexOf('bike') >= 0 || t.indexOf('bicycle') >= 0 || t.indexOf('cycle') >= 0) return 'bike';
    if (t.indexOf('walk') >= 0 || t.indexOf('ped') >= 0 || t.indexOf('foot') >= 0) return 'walker';
    if (t === 'hero_car' || t.indexOf('car') >= 0 || t.indexOf('vehicle') >= 0) return 'car';
    return 'car';
  }

  function _actorPose(actor) {
    if (!actor) return null;
    var md = actor.metadata || {};
    var lng = _num(actor.lng != null ? actor.lng : (actor.lon != null ? actor.lon : md.lng));
    var lat = _num(actor.lat != null ? actor.lat : md.lat);
    var heading = _num(actor.headingDeg != null ? actor.headingDeg : (md.headingDeg != null ? md.headingDeg : actor.heading));
    return { lng: lng, lat: lat, heading: heading != null ? heading : 0 };
  }
  // Offset lng/lat by metres along a compass bearing (0 = north, clockwise).
  function _projectM(lng, lat, bearingDeg, distM) {
    var br = bearingDeg * Math.PI / 180;
    return { lng: lng + (distM * Math.sin(br)) / (111320 * Math.cos(lat * Math.PI / 180)), lat: lat + (distM * Math.cos(br)) / 111320 };
  }

  // ── resolveAnchor(actor, anchorId) — the one public question ────────────────
  function resolveAnchor(actor, anchorId) {
    var vehicleClass = vehicleClassOf(actor);
    if (!anchorId) anchorId = CLASS_DEFAULT[vehicleClass] || 'driver_seat';
    var off = ANCHOR_OFFSETS[anchorId];
    if (!off) return { ok: false, reason: 'unknown_anchor', anchorId: anchorId, vehicleClass: vehicleClass };

    var pose = _actorPose(actor);
    var out = {
      ok: true, anchorId: anchorId, vehicleClass: vehicleClass,
      offset: { x: off.x, y: off.y, z: off.z },
      heightM: off.z,
      actorLng: pose ? pose.lng : null, actorLat: pose ? pose.lat : null, headingDeg: pose ? pose.heading : null,
      lng: null, lat: null,   // resolved occupant world eye position (planar)
    };
    // Resolve the world eye position when the actor has coordinates.
    if (pose && pose.lng != null && pose.lat != null) {
      var h = pose.heading || 0;
      var p = { lng: pose.lng, lat: pose.lat };
      if (off.y) p = _projectM(p.lng, p.lat, h, off.y);          // forward along heading
      if (off.x) p = _projectM(p.lng, p.lat, h + 90, off.x);     // right of heading
      out.lng = p.lng; out.lat = p.lat;
    }
    return out;
  }

  function listAnchors() { return CANONICAL.slice(); }
  function getAnchorOffset(anchorId) { var o = ANCHOR_OFFSETS[anchorId]; return o ? { x: o.x, y: o.y, z: o.z } : null; }
  function getProfile(vehicleClass) {
    var out = {};
    for (var k in ANCHOR_OFFSETS) if (ANCHOR_OFFSETS.hasOwnProperty(k)) out[k] = { x: ANCHOR_OFFSETS[k].x, y: ANCHOR_OFFSETS[k].y, z: ANCHOR_OFFSETS[k].z };
    return { vehicleClass: vehicleClass || null, defaultAnchor: CLASS_DEFAULT[vehicleClass] || null, anchors: out };
  }
  function getState() {
    return { version: VERSION, anchorCount: CANONICAL.length,
      classes: Object.keys(CLASS_DEFAULT), classDefaults: (function () { var o = {}; for (var k in CLASS_DEFAULT) o[k] = CLASS_DEFAULT[k]; return o; })() };
  }

  SBE.OccupantPOVCameraFramework = Object.freeze({
    VERSION:         VERSION,
    resolveAnchor:   resolveAnchor,
    vehicleClassOf:  vehicleClassOf,
    listAnchors:     listAnchors,
    getAnchorOffset: getAnchorOffset,
    getProfile:      getProfile,
    getState:        getState,
  });

  console.log('[OccupantPOVCameraFramework] v' + VERSION + ' loaded — ' + CANONICAL.length + ' canonical anchors (anchor stage only)');
})(window);
