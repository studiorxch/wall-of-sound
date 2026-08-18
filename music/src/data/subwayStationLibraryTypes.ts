// ── subwayStationLibraryTypes ─────────────────────────────────────────────────
// 0818_SUBWAY_Station_Library_Foundation_v1.0.0
//
// TS mirror of the record shape wall/systems/transit/mtaSubwayStationLibrary.js
// owns and persists (localStorage-backed). Wall remains the sole authority —
// these types describe the wire shape the bridge reads/writes, matching the
// convention orbProfileTypes.ts / the Geographic Style record types already use.
//
// StudioRich Station Library is MAPS' newest peer library, alongside
// Geographic/Vehicles/Overlays/Orbs/Itineraries/Race Courses. See
// wallStationLibraryBridge.ts for the one narrow bridge into Wall's real
// authority (window.SBE.MTASubwayStationLibrary).

export interface StationAuthoritativeLink {
  gtfsStopId: string | null;
  complexId: string | null;
  linkedAt: number;
  linkConfidence: "exact_import" | "manual_reconcile";
  migratedFrom?: string | null;
  migrationReason?: string | null;
}

export interface StationOperationalSnapshot {
  // Display label only — NEVER a unique key. Duplicate names are expected
  // and normal (see StationLibraryRecord.studioRichStationId for identity).
  displayName: string | null;
  latitude: number;
  longitude: number;
  borough: string | null;
  // Not supplied by any current live MTA source (see mtaSubwayStationLibrary.js)
  // — left null unless StudioRich authors it (studioRich.neighborhood).
  neighborhood: string | null;
  routeIds: string[];
  complexId: string | null;
  complexIsMultiStation: boolean;
  complexMemberStopIds: string[];
}

// StudioRich-authored fields — never overwritten by import/refresh. Every
// *Refs array is deliberately typed as string[] (opaque foreign-entity ids)
// rather than importing not-yet-built domain types (landmarks, venues,
// Residents, etc.) — those systems are explicitly out of scope for this
// build; only the schema's ability to hold references to them is required.
export interface StationStudioRichMetadata {
  notes: string | null;
  neighborhood: string | null;
  landmarkRefs: string[];
  venueRefs: string[];
  fieldRecordingRefs: string[];
  musicRefs: string[];
  radioRefs: string[];
  graffitiWallRefs: string[];
  residentRefs: string[];
  cameraRefs: string[];
  mediaRefs: string[];
  worldOverrides: Record<string, unknown>;
  posterMetadata: Record<string, unknown>;
}

export interface StationLibraryRecord {
  // Stable, opaque, StudioRich-minted identity — "stlib-000123". NEVER
  // derived from an MTA id or a display name; survives an MTA refresh even
  // if the linked authoritative id later changes (see authoritativeLink).
  studioRichStationId: string;
  createdAt: number;
  updatedAt: number;
  lastRefreshedAt: number;
  authoritativeLink: StationAuthoritativeLink;
  operational: StationOperationalSnapshot;
  studioRich: StationStudioRichMetadata;
}

export interface StationLibraryDuplicateNameGroup {
  displayName: string;
  records: StationLibraryRecord[];
}

export interface StationLibraryDiagnostics {
  version: string;
  recordCount: number;
  linkedCount: number;
  duplicateDisplayNameGroupCount: number;
  identityCollisionCount: number; // required invariant: must be 0
  unresolvedStaticStopCount: number;
  orphanedRecordCount: number;
  lastImport: {
    at: number;
    sourceStopCount: number;
    created: number;
    updated: number;
    unchanged: number;
  } | null;
}

export interface StationMapFeature {
  type: "Feature";
  id: string;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    studioRichStationId: string;
    displayName: string | null;
    gtfsStopId: string | null;
    borough: string | null;
    routeIds: string[];
  };
}
