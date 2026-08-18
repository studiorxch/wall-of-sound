// ── GTFSRealtimeBindings v1.1.0 (vendor shim) ─────────────────────────────────
// 0604H_WOS_MTABusRealtimeAdapter_v1.0.0
// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD — Data Layer §9 (extended)
// Status: active | Classification: vendor-decode (read-only)
//
// A dependency-free, browser-safe minimal GTFS-Realtime protobuf decoder.
// v1.0.0 decoded ONLY VehiclePosition (for bus placement). v1.1.0 ADDS
// TripUpdate (incl. the NYCT subway extensions) and Alert decoding, needed by
// mtaSubwayRealtimeAdapter.js. VehiclePosition decoding also gained the
// current_stop_sequence/stop_id/current_status fields subway needs (bus never
// used them; purely additive, existing bus fields/behavior unchanged).
//
// Exposes SBE.GTFSRealtimeBindings.transit_realtime.FeedMessage.decode(bytes).
// If a real `transit_realtime` / GtfsRealtimeBindings global is ever present it
// is preferred. Never throws at load. No network, no DOM, no mutation.
//
// Field numbers verified 2026-08-18 against the live, official proto sources
// (not assumed from memory): https://raw.githubusercontent.com/google/transit/
// master/gtfs-realtime/proto/gtfs-realtime.proto and
// https://api.mta.info/nyct-subway.proto.txt — and cross-checked by
// hand-decoding real, freshly-fetched MTA subway GTFS-RT payloads byte-for-
// byte during this build (see mtaSubwayFeedSourceInventory.js header).
//
// GTFS-Realtime proto field numbers:
//   FeedMessage:       entity=2 (repeated)
//   FeedEntity:        id=1, trip_update=3, vehicle=4, alert=5
//   TripDescriptor:    trip_id=1, route_id=5; NYCT ext nyct_trip_descriptor=1001
//   NyctTripDescriptor:train_id=1, is_assigned=2, direction=3 (enum N=1/E=2/S=3/W=4)
//   VehiclePosition:   trip=1, position=2, current_stop_sequence=3,
//                      current_status=4, timestamp=5, congestion_level=6,
//                      stop_id=7, vehicle=8, occupancy_status=9
//   Position:          latitude=1, longitude=2, bearing=3, speed=5  (all float32)
//   VehicleDescriptor: id=1, label=2
//   TripUpdate:        trip=1, stop_time_update=2 (repeated), vehicle=3,
//                      timestamp=4, delay=5
//   StopTimeUpdate:    stop_sequence=1, arrival=2, departure=3, stop_id=4,
//                      schedule_relationship=5; NYCT ext nyct_stop_time_update=1001
//   NyctStopTimeUpdate:scheduled_track=1, actual_track=2
//   StopTimeEvent:     delay=1, time=2, uncertainty=3, scheduled_time=4
//   Alert:             informed_entity=5 (repeated), cause=6, effect=7,
//                      header_text=10, description_text=11 (TranslatedString)
//   EntitySelector:    route_id=2, trip=4, stop_id=5
//   TranslatedString:  translation=1 (repeated {text=1, language=2})
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.1.0';

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
  var NYCT_DIRECTION = { 1: 'NORTH', 2: 'EAST', 3: 'SOUTH', 4: 'WEST' };

  function _decodeNyctTripDescriptor(buf, s, e) {
    var n = { trainId: null, isAssigned: null, direction: null };
    _each(buf, s, e, function (f, w, v, r) {
      if (f === 1 && w === 2 && r) n.trainId = _utf8(buf, r[0], r[1]);
      else if (f === 2 && w === 0) n.isAssigned = !!v;
      else if (f === 3 && w === 0) { var dv = Number(v); n.direction = NYCT_DIRECTION[dv] || null; }
    });
    return n;
  }
  function _decodeTrip(buf, s, e) {
    var t = { tripId: null, routeId: null, nyct: null };
    _each(buf, s, e, function (f, w, v, r) {
      if (w === 2 && r) {
        if (f === 1) t.tripId = _utf8(buf, r[0], r[1]);
        else if (f === 5) t.routeId = _utf8(buf, r[0], r[1]);
        else if (f === 1001) t.nyct = _decodeNyctTripDescriptor(buf, r[0], r[1]);
      }
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
  var VEHICLE_STOP_STATUS = { 0: 'INCOMING_AT', 1: 'STOPPED_AT', 2: 'IN_TRANSIT_TO' };

  function _decodeVehiclePosition(buf, s, e) {
    var vp = { trip: null, position: null, currentStopSequence: null, stopId: null,
      currentStatus: null, timestamp: null, vehicle: null, occupancyStatus: null };
    _each(buf, s, e, function (f, w, v, r) {
      if (f === 1 && w === 2 && r) vp.trip = _decodeTrip(buf, r[0], r[1]);
      else if (f === 2 && w === 2 && r) vp.position = _decodePosition(buf, r[0], r[1]);
      else if (f === 3 && w === 0) vp.currentStopSequence = Number(v);
      else if (f === 4 && w === 0) { var sv = Number(v); vp.currentStatus = VEHICLE_STOP_STATUS[sv] || null; }
      else if (f === 5 && w === 0) vp.timestamp = v;
      else if (f === 7 && w === 2 && r) vp.stopId = _utf8(buf, r[0], r[1]);
      else if (f === 8 && w === 2 && r) vp.vehicle = _decodeVehicleDesc(buf, r[0], r[1]);
      else if (f === 9 && w === 0) vp.occupancyStatus = (OCCUPANCY[v] != null ? OCCUPANCY[v] : String(v));
    });
    return vp;
  }

  // ── TripUpdate decode (subway: trip_update carries stop-relative live state
  //    — arrival/departure predictions per stop — since VehiclePosition never
  //    carries lat/lon on the current NYCT subway feeds; see
  //    mtaSubwayFeedSourceInventory.js for the verification evidence) ────────
  function _decodeStopTimeEvent(buf, s, e) {
    var ev = { delay: null, time: null, uncertainty: null, scheduledTime: null };
    _each(buf, s, e, function (f, w, v) {
      if (f === 1 && w === 0) ev.delay = Number(v);
      else if (f === 2 && w === 0) ev.time = v;
      else if (f === 3 && w === 0) ev.uncertainty = Number(v);
      else if (f === 4 && w === 0) ev.scheduledTime = v;
    });
    return ev;
  }
  function _decodeNyctStopTimeUpdate(buf, s, e) {
    var n = { scheduledTrack: null, actualTrack: null };
    _each(buf, s, e, function (f, w, v, r) {
      if (f === 1 && w === 2 && r) n.scheduledTrack = _utf8(buf, r[0], r[1]);
      else if (f === 2 && w === 2 && r) n.actualTrack = _utf8(buf, r[0], r[1]);
    });
    return n;
  }
  var SCHEDULE_RELATIONSHIP = { 0: 'SCHEDULED', 1: 'SKIPPED', 2: 'NO_DATA', 3: 'UNSCHEDULED' };
  function _decodeStopTimeUpdate(buf, s, e) {
    var stu = { stopSequence: null, stopId: null, arrival: null, departure: null, scheduleRelationship: null, nyct: null };
    _each(buf, s, e, function (f, w, v, r) {
      if (f === 1 && w === 0) stu.stopSequence = Number(v);
      else if (f === 2 && w === 2 && r) stu.arrival = _decodeStopTimeEvent(buf, r[0], r[1]);
      else if (f === 3 && w === 2 && r) stu.departure = _decodeStopTimeEvent(buf, r[0], r[1]);
      else if (f === 4 && w === 2 && r) stu.stopId = _utf8(buf, r[0], r[1]);
      else if (f === 5 && w === 0) { var sr = Number(v); stu.scheduleRelationship = SCHEDULE_RELATIONSHIP[sr] || null; }
      else if (f === 1001 && w === 2 && r) stu.nyct = _decodeNyctStopTimeUpdate(buf, r[0], r[1]);
    });
    return stu;
  }
  function _decodeTripUpdate(buf, s, e) {
    var tu = { trip: null, vehicle: null, stopTimeUpdate: [], timestamp: null, delay: null };
    _each(buf, s, e, function (f, w, v, r) {
      if (f === 1 && w === 2 && r) tu.trip = _decodeTrip(buf, r[0], r[1]);
      else if (f === 2 && w === 2 && r) tu.stopTimeUpdate.push(_decodeStopTimeUpdate(buf, r[0], r[1]));
      else if (f === 3 && w === 2 && r) tu.vehicle = _decodeVehicleDesc(buf, r[0], r[1]);
      else if (f === 4 && w === 0) tu.timestamp = v;
      else if (f === 5 && w === 0) tu.delay = Number(v);
    });
    return tu;
  }

  // ── Alert decode ──────────────────────────────────────────────────────────
  function _decodeTranslatedString(buf, s, e) {
    var texts = [];
    _each(buf, s, e, function (f, w, v, r) {
      if (f === 1 && w === 2 && r) {
        var text = null, lang = null;
        _each(buf, r[0], r[1], function (tf, tw, tv, tr) {
          if (tf === 1 && tw === 2 && tr) text = _utf8(buf, tr[0], tr[1]);
          else if (tf === 2 && tw === 2 && tr) lang = _utf8(buf, tr[0], tr[1]);
        });
        if (text != null) texts.push({ text: text, language: lang });
      }
    });
    // Convenience: prefer an 'en' (or unlabeled) translation as .text; keep all.
    var preferred = null;
    for (var i = 0; i < texts.length; i++) {
      if (!texts[i].language || /^en/i.test(texts[i].language)) { preferred = texts[i].text; break; }
    }
    return { text: preferred != null ? preferred : (texts[0] ? texts[0].text : null), translations: texts };
  }
  function _decodeEntitySelector(buf, s, e) {
    var sel = { routeId: null, tripId: null, stopId: null };
    _each(buf, s, e, function (f, w, v, r) {
      if (f === 2 && w === 2 && r) sel.routeId = _utf8(buf, r[0], r[1]);
      else if (f === 4 && w === 2 && r) { var t = _decodeTrip(buf, r[0], r[1]); sel.tripId = t.tripId; }
      else if (f === 5 && w === 2 && r) sel.stopId = _utf8(buf, r[0], r[1]);
    });
    return sel;
  }
  function _decodeAlert(buf, s, e) {
    var al = { informedEntity: [], cause: null, effect: null, headerText: null, descriptionText: null };
    _each(buf, s, e, function (f, w, v, r) {
      if (f === 5 && w === 2 && r) al.informedEntity.push(_decodeEntitySelector(buf, r[0], r[1]));
      else if (f === 6 && w === 0) al.cause = Number(v);
      else if (f === 7 && w === 0) al.effect = Number(v);
      else if (f === 10 && w === 2 && r) al.headerText = _decodeTranslatedString(buf, r[0], r[1]);
      else if (f === 11 && w === 2 && r) al.descriptionText = _decodeTranslatedString(buf, r[0], r[1]);
    });
    return al;
  }

  function _decodeEntity(buf, s, e) {
    var ent = { id: null, tripUpdate: null, vehicle: null, alert: null };
    _each(buf, s, e, function (f, w, v, r) {
      if (f === 1 && w === 2 && r) ent.id = _utf8(buf, r[0], r[1]);
      else if (f === 3 && w === 2 && r) ent.tripUpdate = _decodeTripUpdate(buf, r[0], r[1]);
      else if (f === 4 && w === 2 && r) ent.vehicle = _decodeVehiclePosition(buf, r[0], r[1]);
      else if (f === 5 && w === 2 && r) ent.alert = _decodeAlert(buf, r[0], r[1]);
    });
    return ent;
  }
  function _decodeFeedMessage(bytes) {
    var buf = _u8(bytes);
    var feed = { entity: [] };
    _each(buf, 0, buf.length, function (f, w, v, r) {
      if (f === 2 && w === 2 && r) feed.entity.push(_decodeEntity(buf, r[0], r[1]));
      // field 1 (header) intentionally ignored.
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
