// ── GTFSRealtimeBindings Tests v1.0.0 ─────────────────────────────────────────
// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD — Data Layer §9 decoder tests
// Status: active | Classification: test-harness (dependency-free)
//
// Same rationale/convention as keyboardShortcutRegistry.tests.js — no test
// runner exists under wall/, so this mirrors the `_wos.debug.*`
// console-diagnostic pattern.
//
// Fixtures are hand-encoded protobuf byte sequences (a tiny local encoder
// below, test-only, never shipped in the decoder itself) built directly from
// the same field numbers documented in gtfsRealtimeBindings.js's header —
// this proves the DECODER is correct against the spec, independent of any
// particular live feed capture. The decoder was separately cross-checked
// against real, live-fetched MTA subway GTFS-RT payloads during this build
// (see mtaSubwayFeedSourceInventory.js and the 0818 completion report) —
// these unit tests are the repeatable regression layer for that finding.
//
// Run via: _wos.debug.gtfsRealtimeBindings.runTests()
//
// Placement: wall/systems/transit/vendor/gtfsRealtimeBindings.tests.js
// Load: AFTER vendor/gtfsRealtimeBindings.js. Not required for production operation.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  // ── Minimal protobuf ENCODER (test-only; mirrors the decoder's field map) ──
  function _pbVarint(n) {
    var bytes = [];
    var v = n;
    do { var b = v & 0x7f; v = Math.floor(v / 128); if (v > 0) b |= 0x80; bytes.push(b); } while (v > 0);
    return bytes;
  }
  function _pbTag(field, wire) { return _pbVarint((field << 3) | wire); }
  function _pbString(field, str) {
    var strBytes = [];
    for (var i = 0; i < str.length; i++) strBytes.push(str.charCodeAt(i)); // ASCII test fixtures only
    return _pbTag(field, 2).concat(_pbVarint(strBytes.length)).concat(strBytes);
  }
  function _pbVarintField(field, n) { return _pbTag(field, 0).concat(_pbVarint(n)); }
  function _pbMessage(field, bytesArr) { return _pbTag(field, 2).concat(_pbVarint(bytesArr.length)).concat(bytesArr); }
  function _bytes(arr) { return new Uint8Array(arr); }

  function run() {
    var bindings = SBE.GTFSRealtimeBindings;
    var results = [];

    if (!bindings || !bindings.transit_realtime || !bindings.transit_realtime.FeedMessage) {
      results.push(_assert('SBE.GTFSRealtimeBindings is loaded', false));
      console.log('[GTFSRealtimeBindingsTests] FAIL — bindings not loaded');
      return { ok: false, total: 1, failed: 1, results: results };
    }
    var decode = bindings.transit_realtime.FeedMessage.decode;

    // ── VehiclePosition: no position field, only stop-relative state ────────
    (function () {
      // TripDescriptor { trip_id=1, route_id=5 }
      var trip = _pbString(1, 'trip123').concat(_pbString(5, 'A'));
      // VehiclePosition { trip=1, current_stop_sequence=3, current_status=4(STOPPED_AT=1), timestamp=5, stop_id=7 }
      var vp = _pbMessage(1, trip)
        .concat(_pbVarintField(3, 53))
        .concat(_pbVarintField(4, 1))
        .concat(_pbVarintField(5, 1700000000))
        .concat(_pbString(7, 'A09N'));
      // FeedEntity { id=1, vehicle=4 }
      var entity = _pbString(1, 'e1').concat(_pbMessage(4, vp));
      var feed = _pbMessage(2, entity);
      var decoded = decode(_bytes(feed));

      results.push(_assert('FeedMessage decodes exactly 1 entity', decoded.entity.length === 1));
      var e = decoded.entity[0];
      results.push(_assert('entity.vehicle is present, tripUpdate/alert are not', !!e.vehicle && !e.tripUpdate && !e.alert));
      results.push(_assert('vehicle.position is null (no lat/lon in this fixture, matching real subway feeds)', e.vehicle.position === null));
      results.push(_assert('vehicle.currentStopSequence decodes to 53', e.vehicle.currentStopSequence === 53));
      results.push(_assert('vehicle.currentStatus decodes enum 1 to STOPPED_AT', e.vehicle.currentStatus === 'STOPPED_AT'));
      results.push(_assert('vehicle.stopId decodes to "A09N" (field 7, not field 4)', e.vehicle.stopId === 'A09N'));
      results.push(_assert('vehicle.trip.tripId/routeId decode correctly', e.vehicle.trip.tripId === 'trip123' && e.vehicle.trip.routeId === 'A'));
    })();

    // ── TripUpdate + StopTimeUpdate + NYCT extensions ────────────────────────
    (function () {
      // NyctTripDescriptor { train_id=1, is_assigned=2 }, extension field 1001 on TripDescriptor
      var nyctTrip = _pbString(1, '06 0123').concat(_pbVarintField(2, 1));
      var trip = _pbString(1, 'trip456').concat(_pbString(5, '6')).concat(_pbMessage(1001, nyctTrip));
      // NyctStopTimeUpdate { scheduled_track=1, actual_track=2 }, extension field 1001 on StopTimeUpdate
      var nyctStu = _pbString(1, '1').concat(_pbString(2, '1'));
      // StopTimeEvent { time=2 }
      var arrival = _pbVarintField(2, 1700000100);
      // StopTimeUpdate { arrival=2, stop_id=4, nyct=1001 }
      var stu = _pbMessage(2, arrival).concat(_pbString(4, '635N')).concat(_pbMessage(1001, nyctStu));
      // TripUpdate { trip=1, stop_time_update=2 }
      var tu = _pbMessage(1, trip).concat(_pbMessage(2, stu));
      var entity = _pbString(1, 'e2').concat(_pbMessage(3, tu));
      var feed = _pbMessage(2, entity);
      var decoded = decode(_bytes(feed));

      var e = decoded.entity[0];
      results.push(_assert('entity.tripUpdate is present, vehicle/alert are not', !!e.tripUpdate && !e.vehicle && !e.alert));
      results.push(_assert('tripUpdate.trip.nyct.trainId decodes the NYCT extension (field 1001)', e.tripUpdate.trip.nyct && e.tripUpdate.trip.nyct.trainId === '06 0123'));
      results.push(_assert('tripUpdate.trip.nyct.isAssigned decodes true', e.tripUpdate.trip.nyct.isAssigned === true));
      results.push(_assert('tripUpdate has exactly 1 stopTimeUpdate', e.tripUpdate.stopTimeUpdate.length === 1));
      var s0 = e.tripUpdate.stopTimeUpdate[0];
      results.push(_assert('stopTimeUpdate.stopId decodes to "635N"', s0.stopId === '635N'));
      results.push(_assert('stopTimeUpdate.arrival.time decodes correctly', s0.arrival.time === 1700000100));
      results.push(_assert('stopTimeUpdate.nyct.scheduledTrack/actualTrack decode (field 1001 on StopTimeUpdate)', s0.nyct && s0.nyct.scheduledTrack === '1' && s0.nyct.actualTrack === '1'));
    })();

    // ── Alert + EntitySelector + TranslatedString ────────────────────────────
    (function () {
      // EntitySelector { route_id=2, stop_id=5 }
      var sel = _pbString(2, 'A').concat(_pbString(5, 'A09'));
      // TranslatedString.Translation { text=1, language=2 }
      var translation = _pbString(1, 'Delays on the A line').concat(_pbString(2, 'en'));
      // TranslatedString { translation=1 }
      var headerText = _pbMessage(1, translation);
      // Alert { informed_entity=5, header_text=10 }
      var alert = _pbMessage(5, sel).concat(_pbMessage(10, headerText));
      var entity = _pbString(1, 'e3').concat(_pbMessage(5, alert));
      var feed = _pbMessage(2, entity);
      var decoded = decode(_bytes(feed));

      var e = decoded.entity[0];
      results.push(_assert('entity.alert is present, tripUpdate/vehicle are not', !!e.alert && !e.tripUpdate && !e.vehicle));
      results.push(_assert('alert.informedEntity has 1 selector with routeId/stopId', e.alert.informedEntity.length === 1 && e.alert.informedEntity[0].routeId === 'A' && e.alert.informedEntity[0].stopId === 'A09'));
      results.push(_assert('alert.headerText.text decodes the nested TranslatedString.Translation.text', e.alert.headerText && e.alert.headerText.text === 'Delays on the A line'));
    })();

    // ── Multi-entity feed: mixed types don't cross-contaminate ──────────────
    (function () {
      var vp = _pbVarintField(3, 1);
      var e1 = _pbString(1, 'v1').concat(_pbMessage(4, vp));
      var alert = _pbMessage(5, _pbString(2, 'G'));
      var e2 = _pbString(1, 'a1').concat(_pbMessage(5, alert));
      var feed = _pbMessage(2, e1).concat(_pbMessage(2, e2));
      var decoded = decode(_bytes(feed));

      results.push(_assert('mixed feed decodes 2 entities in order', decoded.entity.length === 2));
      results.push(_assert('first entity is vehicle-only', !!decoded.entity[0].vehicle && !decoded.entity[0].alert));
      results.push(_assert('second entity is alert-only', !!decoded.entity[1].alert && !decoded.entity[1].vehicle));
    })();

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };

    console.log('[GTFSRealtimeBindingsTests] ' + (summary.ok ? 'PASS' : 'FAIL') +
      ' — ' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
    if (failed.length) console.warn('[GTFSRealtimeBindingsTests] failures:', failed);

    return summary;
  }

  SBE.GTFSRealtimeBindingsTests = { run: run };

  // main.js's DOMContentLoaded handler replaces window._wos wholesale and
  // only restores top-level keys not already present on its own object —
  // nested _wos.debug.* entries registered before that point are silently
  // dropped (its own .debug already exists, so the merge skips ours).
  // worldSpaceVehicleDebug.js works around this with setTimeout; same fix here.
  function _bindDebug() {
    global._wos = global._wos || {};
    global._wos.debug = global._wos.debug || {};
    global._wos.debug.gtfsRealtimeBindings = { runTests: run };
  }
  _bindDebug();
  global.setTimeout(_bindDebug, 300);
  global.setTimeout(_bindDebug, 1000);

})(window);
