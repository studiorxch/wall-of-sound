// ── GTFSRealtimeBindings v1.0.0 (vendor shim) ─────────────────────────────────
// 0604H_WOS_MTABusRealtimeAdapter_v1.0.0
// Status: active | Classification: vendor-decode (read-only)
//
// A dependency-free, browser-safe minimal GTFS-Realtime protobuf decoder. It
// decodes ONLY the FeedMessage → FeedEntity → VehiclePosition fields WOS needs
// for live bus placement (positions, trip, vehicle id, timestamp, occupancy).
// TripUpdates and Alerts are intentionally NOT decoded.
//
// Exposes SBE.GTFSRealtimeBindings.transit_realtime.FeedMessage.decode(bytes).
// If a real `transit_realtime` / GtfsRealtimeBindings global is ever present it
// is preferred. Never throws at load. No network, no DOM, no mutation.
//
// GTFS-Realtime proto field numbers (subset):
//   FeedMessage:      entity=2 (repeated)
//   FeedEntity:       id=1, vehicle=4
//   VehiclePosition:  trip=1, position=2, timestamp=5, vehicle=8, occupancy_status=9
//   TripDescriptor:   trip_id=1, route_id=5
//   Position:         latitude=1, longitude=2, bearing=3, speed=5  (all float32)
//   VehicleDescriptor:id=1, label=2
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var OCCUPANCY = ['EMPTY', 'MANY_SEATS_AVAILABLE', 'FEW_SEATS_AVAILABLE', 'STANDING_ROOM_ONLY',
    'CRUSHED_STANDING_ROOM_ONLY', 'FULL', 'NOT_ACCEPTING_PASSENGERS', 'NO_DATA_AVAILABLE', 'NOT_BOARDABLE'];

  // ── Minimal protobuf wire reader ────────────────────────────────────────────
  function _u8(bytes) {
    if (bytes instanceof Uint8Array) return bytes;
    if (bytes && bytes.buffer instanceof ArrayBuffer) return new Uint8Array(bytes.buffer, bytes.byteOffset || 0, bytes.byteLength);
    if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
    if (Array.isArray(bytes)) return new Uint8Array(bytes);
    throw new Error('unsupported_bytes');
  }
  // 64-bit-safe varint → JS number (safe to 2^53). Advances cursor object {buf,pos}.
  function _varint(c) {
    var bytes = [], b;
    do { b = c.buf[c.pos++]; bytes.push(b & 0x7f); } while (b & 0x80 && c.pos <= c.end);
    var val = 0;
    for (var i = bytes.length - 1; i >= 0; i--) val = val * 128 + bytes[i];
    return val;
  }
  function _float32(c) {
    var dv = new DataView(c.buf.buffer, c.buf.byteOffset + c.pos, 4);
    c.pos += 4;
    return dv.getFloat32(0, true);
  }
  function _utf8(buf, start, end) {
    if (global.TextDecoder) { try { return new TextDecoder('utf-8').decode(buf.subarray(start, end)); } catch (e) {} }
    var s = '';
    for (var i = start; i < end; i++) s += String.fromCharCode(buf[i]);
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }

  // Walk fields in [start,end); cb(field, wire, varintVal, range[start,end]).
  function _each(buf, start, end, cb) {
    var c = { buf: buf, pos: start, end: end };
    while (c.pos < end) {
      var tag = _varint(c);
      var field = tag >>> 3, wire = tag & 7;
      if (wire === 0) { cb(field, wire, _varint(c), null); }
      else if (wire === 1) { var s1 = c.pos; c.pos += 8; cb(field, wire, null, [s1, c.pos]); }
      else if (wire === 2) { var len = _varint(c); var s2 = c.pos; c.pos += len; cb(field, wire, null, [s2, c.pos]); }
      else if (wire === 5) { var s5 = c.pos; c.pos += 4; cb(field, wire, null, [s5, c.pos]); }
      else { break; }   // unknown wire type — stop this message safely
    }
  }
  function _readFloatAt(buf, range) { var c = { buf: buf, pos: range[0], end: range[1] }; return _float32(c); }

  function _decodePosition(buf, s, e) {
    var p = { latitude: null, longitude: null, bearing: null, speed: null };
    _each(buf, s, e, function (f, w, v, r) {
      if (w === 5 && r) {
        if (f === 1) p.latitude = _readFloatAt(buf, r);
        else if (f === 2) p.longitude = _readFloatAt(buf, r);
        else if (f === 3) p.bearing = _readFloatAt(buf, r);
        else if (f === 5) p.speed = _readFloatAt(buf, r);
      }
    });
    return p;
  }
  function _decodeTrip(buf, s, e) {
    var t = { tripId: null, routeId: null };
    _each(buf, s, e, function (f, w, v, r) {
      if (w === 2 && r) { if (f === 1) t.tripId = _utf8(buf, r[0], r[1]); else if (f === 5) t.routeId = _utf8(buf, r[0], r[1]); }
    });
    return t;
  }
  function _decodeVehicleDesc(buf, s, e) {
    var d = { id: null, label: null };
    _each(buf, s, e, function (f, w, v, r) {
      if (w === 2 && r) { if (f === 1) d.id = _utf8(buf, r[0], r[1]); else if (f === 2) d.label = _utf8(buf, r[0], r[1]); }
    });
    return d;
  }
  function _decodeVehiclePosition(buf, s, e) {
    var vp = { trip: null, position: null, timestamp: null, vehicle: null, occupancyStatus: null };
    _each(buf, s, e, function (f, w, v, r) {
      if (f === 1 && w === 2 && r) vp.trip = _decodeTrip(buf, r[0], r[1]);
      else if (f === 2 && w === 2 && r) vp.position = _decodePosition(buf, r[0], r[1]);
      else if (f === 5 && w === 0) vp.timestamp = v;
      else if (f === 8 && w === 2 && r) vp.vehicle = _decodeVehicleDesc(buf, r[0], r[1]);
      else if (f === 9 && w === 0) vp.occupancyStatus = (OCCUPANCY[v] != null ? OCCUPANCY[v] : String(v));
    });
    return vp;
  }
  function _decodeEntity(buf, s, e) {
    var ent = { id: null, vehicle: null };
    _each(buf, s, e, function (f, w, v, r) {
      if (f === 1 && w === 2 && r) ent.id = _utf8(buf, r[0], r[1]);
      else if (f === 4 && w === 2 && r) ent.vehicle = _decodeVehiclePosition(buf, r[0], r[1]);
    });
    return ent;
  }
  function _decodeFeedMessage(bytes) {
    var buf = _u8(bytes);
    var feed = { entity: [] };
    _each(buf, 0, buf.length, function (f, w, v, r) {
      if (f === 2 && w === 2 && r) feed.entity.push(_decodeEntity(buf, r[0], r[1]));
      // field 1 (header) intentionally ignored for v1.
    });
    return feed;
  }

  // Prefer a real binding if the host page already provides one.
  var existing = global.transit_realtime || (global.GtfsRealtimeBindings && global.GtfsRealtimeBindings.transit_realtime);
  var transit_realtime = (existing && existing.FeedMessage && typeof existing.FeedMessage.decode === 'function')
    ? existing
    : { FeedMessage: { decode: function (bytes) { return _decodeFeedMessage(bytes); } } };

  SBE.GTFSRealtimeBindings = Object.freeze({
    VERSION: VERSION,
    transit_realtime: transit_realtime,
    OCCUPANCY_STATUS: OCCUPANCY.slice(),
    usingVendorDecoder: !(existing && existing.FeedMessage),
  });

  console.log('[GTFSRealtimeBindings] v' + VERSION + ' loaded (' + (SBE.GTFSRealtimeBindings.usingVendorDecoder ? 'vendor decoder' : 'host binding') + ')');
})(window);
