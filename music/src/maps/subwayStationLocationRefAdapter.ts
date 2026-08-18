// ── SUBWAY station → itinerary LocationRef compatibility adapter ─────────────
// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD §19 — Itinerary Compatibility Check
//
// This build does NOT connect full itinerary routing to SUBWAY (explicitly
// out of scope — see the BUILD's Hard Scope exclusions). This file exists
// only to PROVE the canonical SUBWAY station identity
// (wall/systems/transit/mtaSubwayIdentity.js's TransitStationRef shape,
// id = "subway:stop:<gtfsStopId>") can be adapted into the existing id-first
// itinerary LocationRef model (music/src/data/itineraryTypes.ts) without
// ever using a station's display name as a key. See
// subwayStationLocationRefAdapter.test.ts for the proof.
//
// A real future build wiring SUBWAY into itinerary planning would extend
// this into a full LocationRef source alongside Mapbox Geocoding — that
// extension is deliberately NOT built here.

import type { LocationRef } from "../data/itineraryTypes";

// Mirrors the canonical shape mtaSubwayIdentity.js's buildStationRef()
// produces (this file lives in music/, which does not load wall/'s runtime
// JS, so the shape is restated here as a TS type rather than imported).
export interface SubwayStationRefLike {
  id: string; // "subway:stop:<gtfsStopId>" — collision-safe, never name-based
  displayName: string | null;
  latitude: number;
  longitude: number;
}

export function subwayStationToLocationRef(station: SubwayStationRefLike): LocationRef {
  return {
    id: station.id, // the canonical subway:stop:* id IS the LocationRef.id — never re-derived from displayName
    name: station.displayName ?? station.id, // label only, per LocationRef's own contract
    longitude: station.longitude,
    latitude: station.latitude,
    // placeId intentionally omitted — SUBWAY stations aren't Mapbox Geocoding
    // features; a real future adapter would need a distinct re-resolution
    // strategy (out of scope here).
  };
}

// ── 0818_SUBWAY_Station_Library_Foundation_v1.0.0 extension ──────────────────
// The Station Library (wall/systems/transit/mtaSubwayStationLibrary.js) mints
// its OWN stable `studioRichStationId` — deliberately decoupled from the raw
// `subway:stop:<gtfsStopId>` id above, so a future upstream MTA id change
// never breaks continuity (see that file's header for why). This proves the
// SAME itinerary-compatibility guarantee holds for the Station Library's
// identity, not just the raw transit-model identity: LocationRef.id becomes
// the stable studioRichStationId, still never a display name.
export interface StationLibraryRecordLike {
  studioRichStationId: string; // "stlib-000123" — stable even if the linked MTA id later changes
  operational: { displayName: string | null; latitude: number; longitude: number };
}

export function stationLibraryRecordToLocationRef(record: StationLibraryRecordLike): LocationRef {
  return subwayStationToLocationRef({
    id: record.studioRichStationId,
    displayName: record.operational.displayName,
    latitude: record.operational.latitude,
    longitude: record.operational.longitude,
  });
}
