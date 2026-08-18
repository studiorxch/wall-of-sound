// ── MTASubwayIdentity v1.0.0 ──────────────────────────────────────────────────
// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD — Data Layer §10
// Status: active | Classification: runtime-authority (pure — no fetch, no DOM)
//
// Builds collision-safe StudioRich transit identity references from the raw
// normalized rows mtaSubwayStaticAdapter.js and mtaSubwayRealtimeAdapter.js
// already produce. This is the ONE place canonical `subway:*` ids get minted.
// Pure functions only — takes rows in, returns Ref objects out. No fetch, no
// polling, no rendering.
//
// REQUIRED INVARIANT: displayName !== identity, always. Canonical ids are
// built as `subway:<kind>:<authoritativeId>` — since MTA's own GTFS stop_id /
// route_id / complex_id / trip_id namespaces are already globally unique by
// construction (verified during this build: 1488 stops.txt rows, zero
// duplicate stop_id values; the 43%-of-497-pages name collision the
// 2026-08-18 resumption audit found was entirely a DISPLAY-NAME collision,
// never an authoritative-id collision), a display name is never part of any
// canonical id anywhere in this file. Two stops named "Fulton St" — GTFS
// stop_id 229 (Manhattan, complex 628) and stop_id G36 (Brooklyn, complex
// 292) — resolve to the distinct ids `subway:stop:229` and `subway:stop:G36`
// and are never merged.
//
// Concepts exposed (adapted from the BUILD's required shape to what current
// MTA source data actually supports — see file header of
// mtaSubwayStaticAdapter.js for what was and wasn't found in the source):
//   TransitStationRef — one GTFS stops.txt row, station-level OR platform.
//   TransitComplexRef — a station COMPLEX (MTA Subway Stations and Complexes
//                       dataset only; GTFS static itself has no such grouping).
//   TransitRouteRef   — one GTFS routes.txt row.
//   TransitTripRef     — one active realtime trip (from TripUpdate).
//   TransitVehicleRef  — one active realtime vehicle-state entity (from
//                       VehiclePosition). NEVER carries latitude/longitude —
//                       the current source doesn't supply one; see
//                       mtaSubwayRealtimeAdapter.js header for the evidence.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  function _inv() { return SBE.MTASubwayFeedSourceInventory || null; }

  function stationId(stopId) { return 'subway:stop:' + String(stopId); }
  function complexId(rawComplexId) { return 'subway:complex:' + String(rawComplexId); }
  function routeId(rawRouteId) { return 'subway:route:' + String(rawRouteId); }
  function tripId(rawTripId) { return 'subway:trip:' + String(rawTripId); }
  function vehicleId(trainIdOrTripId) { return 'subway:vehicle:' + String(trainIdOrTripId); }

  // ── Explicit join helpers (never name-based) ─────────────────────────────
  function resolveStationRefId(rawStopId) { return rawStopId ? stationId(rawStopId) : null; }
  function resolveComplexRefId(rawComplexId) { return rawComplexId ? complexId(rawComplexId) : null; }
  function resolveRouteRefId(rawRouteId) { return rawRouteId ? routeId(rawRouteId) : null; }

  function routeFamilyForRouteId(rawRouteId) {
    var inv = _inv();
    if (!inv || !rawRouteId) return null;
    var src = inv.getRealtimeSourceForRoute(rawRouteId);
    return src ? src.id.replace('mta_subway_gtfs_rt_', '') : null; // e.g. 'ace', 'l', 'numbered'
  }

  // ── Builders ──────────────────────────────────────────────────────────────
  // stationsByStopId: Map/object of raw stopId -> raw normalized stop row
  // (from mtaSubwayStaticAdapter.getStops()), used only to resolve a
  // platform's parentId — never to resolve by name.
  function buildStationRef(rawStop) {
    if (!rawStop || !rawStop.stopId) return null;
    var isPlatform = !!rawStop.parentStation;
    return Object.freeze({
      id: stationId(rawStop.stopId),
      authoritativeIds: Object.freeze({ gtfsStopId: rawStop.stopId }),
      displayName: rawStop.stopName || null,   // label only — never part of `id`
      kind: isPlatform ? 'platform' : 'station',
      latitude: rawStop.latitude,
      longitude: rawStop.longitude,
      complexId: rawStop.complexId ? complexId(rawStop.complexId) : null,
      parentId: isPlatform ? stationId(rawStop.parentStation) : null,
      routeIds: [], // populated by the store, which has route→stop membership context
    });
  }

  function buildComplexRef(rawComplex) {
    if (!rawComplex || !rawComplex.complexId) return null;
    return Object.freeze({
      id: complexId(rawComplex.complexId),
      authoritativeIds: Object.freeze({ mtaComplexId: rawComplex.complexId }),
      displayName: rawComplex.displayName || rawComplex.stopName || null,
      isComplex: !!rawComplex.isComplex,
      borough: rawComplex.borough || null,
      latitude: rawComplex.latitude,
      longitude: rawComplex.longitude,
      routeIds: (rawComplex.routeIds || []).map(routeId),
      memberStationIds: (rawComplex.memberStopIds || []).map(stationId),
    });
  }

  function buildRouteRef(rawRoute) {
    if (!rawRoute || !rawRoute.routeId) return null;
    return Object.freeze({
      id: routeId(rawRoute.routeId),
      authoritativeId: rawRoute.routeId,
      displayName: rawRoute.shortName || rawRoute.longName || rawRoute.routeId,
      routeFamily: routeFamilyForRouteId(rawRoute.routeId),
      // Raw MTA-supplied color preserved as metadata only — never business logic.
      // A future palette build resolves display color through semantic tokens
      // (see 0818_SUBWAY_Data_Architecture_v1.0.0.md §6); this build does not.
      sourceColor: rawRoute.sourceColor ? ('#' + rawRoute.sourceColor) : null,
      sourceTextColor: rawRoute.sourceTextColor ? ('#' + rawRoute.sourceTextColor) : null,
      shapeIds: (rawRoute.shapeIds || []).slice(),
    });
  }

  function buildTripRef(rawTripUpdateRow) {
    if (!rawTripUpdateRow || !rawTripUpdateRow.tripId) return null;
    return Object.freeze({
      id: tripId(rawTripUpdateRow.tripId),
      authoritativeId: rawTripUpdateRow.tripId,
      routeId: rawTripUpdateRow.routeId ? routeId(rawTripUpdateRow.routeId) : null,
      trainId: rawTripUpdateRow.trainId || null,
      direction: rawTripUpdateRow.direction || null,
      stopTimes: (rawTripUpdateRow.stopTimeUpdates || []).map(function (s) {
        return Object.freeze({
          stationId: s.stopId ? stationId(s.stopId) : null,
          arrivalUtcMs: s.arrivalUtcMs,
          departureUtcMs: s.departureUtcMs,
          scheduledTrack: s.scheduledTrack,
          actualTrack: s.actualTrack,
        });
      }),
    });
  }

  function buildVehicleRef(rawVehicleRow) {
    if (!rawVehicleRow) return null;
    if (!rawVehicleRow.tripId && !rawVehicleRow.trainId) return null;
    // No stable vehicle identifier exists in the current subway realtime
    // source (VehicleDescriptor is never populated) — trainId (when present)
    // or tripId is the most stable identity available. Documented, not hidden.
    var idBasis = rawVehicleRow.trainId || rawVehicleRow.tripId;
    return Object.freeze({
      id: vehicleId(idBasis),
      authoritativeId: rawVehicleRow.trainId || null,
      tripId: rawVehicleRow.tripId ? tripId(rawVehicleRow.tripId) : null,
      routeId: rawVehicleRow.routeId ? routeId(rawVehicleRow.routeId) : null,
      // Deliberately absent: latitude/longitude/bearing. Current source does
      // not supply them — see mtaSubwayRealtimeAdapter.js header. A consumer
      // must render from currentStationId/currentStatus, never fabricate a
      // coordinate.
      currentStationId: rawVehicleRow.stopId ? stationId(rawVehicleRow.stopId) : null,
      currentStopSequence: rawVehicleRow.currentStopSequence != null ? rawVehicleRow.currentStopSequence : null,
      currentStatus: rawVehicleRow.currentStatus || null,
      timestampUtcMs: rawVehicleRow.timestampUtcMs != null ? rawVehicleRow.timestampUtcMs : null,
    });
  }

  SBE.MTASubwayIdentity = Object.freeze({
    VERSION: VERSION,
    stationId: stationId,
    complexId: complexId,
    routeId: routeId,
    tripId: tripId,
    vehicleId: vehicleId,
    resolveStationRefId: resolveStationRefId,
    resolveComplexRefId: resolveComplexRefId,
    resolveRouteRefId: resolveRouteRefId,
    buildStationRef: buildStationRef,
    buildComplexRef: buildComplexRef,
    buildRouteRef: buildRouteRef,
    buildTripRef: buildTripRef,
    buildVehicleRef: buildVehicleRef,
  });

  console.log('[MTASubwayIdentity] v' + VERSION + ' loaded (pure — no fetch, no state)');
})(window);
