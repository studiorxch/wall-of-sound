// ── Racetrack Course Package data model ───────────────────────────────────────
// 0805E_RACETRACK_Wall_Mode_and_Cached_Course_Runtime
//
// A provider-independent, IMMUTABLE course package compiled once (MUSIC-side,
// from a real Race Course + Race Lane — see racetrackCoursePackageCompiler.ts)
// and consumed read-only by wall/'s RACETRACK runtime. RACETRACK never reads
// raw Race Course/Race Lane authoring data directly — only this compiled,
// versioned, fingerprinted snapshot. Never mutated after compilation;
// recompiling produces a new version, never an in-place edit.
//
// Delivery (per plan review): the full package lives in same-origin
// IndexedDB (racetrackCoursePackageStorage.ts's MAPS_RACETRACK_PACKAGE_DB) —
// never duplicated into localStorage. Only a slim pointer
// {id,version,fingerprint,updatedAt} travels via localStorage as a change
// signal (see racetrackCoursePackageStore.ts).

export interface RacetrackCourseSample {
  index: number;
  distanceMeters: number;
  progress01: number;
  coordinate: [number, number];
  headingDeg: number;
}

export interface RacetrackCoursePose {
  distanceMeters: number;
  coordinate: [number, number];
  headingDeg: number;
}

export interface RacetrackCheckpoint {
  id: string;
  label: string;
  distanceMeters: number;
  progress01: number;
  coordinate: [number, number];
}

export type RacetrackRoutePreviewMode = "guide" | "track";

export interface RacetrackRoutePresentation {
  lineColor: string;
  lineWidthPx: number;
  previewMode: RacetrackRoutePreviewMode;
}

export interface RacetrackCameraAnchor {
  id: string;
  label: string;
  distanceMeters: number;
  coordinate: [number, number];
  headingDeg: number;
  pitch: number;
  zoom: number;
}

// Reserved for a future provider-independent world package — left
// deliberately unpopulated (undefined) in this build. Typed now so a future
// build can populate it without a package schema migration.
export interface RacetrackEnvironmentPackage {
  description?: string;
}

// Reserved for future terrain sampling — same disclosed v1 simplification as
// RacetrackEnvironmentPackage above.
export interface RacetrackTerrainPackage {
  description?: string;
}

export type RacetrackCoursePackageProviderSource = "mapbox" | "pmtiles" | "custom_world" | "static_package";

export interface RacetrackCoursePackage {
  id: string;
  slug: string;
  name: string;
  version: number;

  sourceRaceCourseId: string;
  sourceRaceCourseFingerprint: string;

  route: { type: "LineString"; coordinates: [number, number][] };
  // Full-resolution, deterministic — the same authority discipline
  // established in 0805D: never decimated for real use, only for preview.
  progressSamples: RacetrackCourseSample[];
  // Preview-only, decimated (via raceLanePreviewGeometry.ts's
  // decimateForPreview, reused verbatim) — rendering convenience, never the
  // sampling/positioning authority.
  previewRoute: RacetrackCourseSample[];

  start: RacetrackCoursePose;
  finish: RacetrackCoursePose;
  checkpoints: RacetrackCheckpoint[];

  routePresentation: RacetrackRoutePresentation;
  cameraAnchors: RacetrackCameraAnchor[];

  environment?: RacetrackEnvironmentPackage;
  terrain?: RacetrackTerrainPackage;

  // Carried straight from the source Race Lane's own readiness split
  // (0805F required correction) at compile time. A package is only ever
  // produced when presentationReady is true — the compiler refuses
  // otherwise (see racetrackCoursePackageCompiler.ts) — so this field is
  // always `true` on any real package; it is still stored explicitly rather
  // than assumed, so a consumer never has to re-derive it. runtimeReady may
  // legitimately be false (e.g. an unresolved offset_intersection) — RACETRACK's
  // Attract/Selection/Lobby scenes may consume such a package; only a future
  // Start Game execution path may ever require runtimeReady === true.
  presentationReady: boolean;
  runtimeReady: boolean;
  // The subset of the source lane's readiness reasons that are runtime-only
  // concerns (never presentation blockers) — e.g. ['offset_intersection'].
  // Never hidden from the UI; always disclosed, never silently dropped.
  warnings: string[];

  providerSource: RacetrackCoursePackageProviderSource;

  createdAt: number;
  publishedAt: number | null;
}

// The slim change-signal delivered via localStorage — never the full
// package. wall/'s racetrackCoursePackageRuntime.js reads this, then fetches
// the full record from the same-origin MAPS_RACETRACK_PACKAGE_DB directly.
export interface RacetrackCoursePackagePointer {
  id: string;
  version: number;
  fingerprint: string;
  updatedAt: number;
}
