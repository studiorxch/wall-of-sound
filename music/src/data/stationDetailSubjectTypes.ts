// ── StationDetailSubjectRef ────────────────────────────────────────────────────
// STATION-10 (0915_WOS_Subway_Detail_Subject_Selection_Proof_v1.0.0)
//
// The minimal additive reference type STATION-09's own recon proposed
// (docs/architecture/proposals/STATION_09_DETAIL_SUBJECT_RECON.md §C):
// a pointer triple that identifies ONE physical Station Base Truth subject
// without owning or duplicating it. This module declares the reference
// shape only — resolving one against real StationGeometryData lives in
// stationDetailSubjectResolver.ts, never here.
//
// `subjectKind` is deliberately the smallest vocabulary current Base Truth
// justifies: StationGeometryData already has exactly three subject-shaped
// element arrays (platforms, trackCenterlines, wallSurfaces) — see
// stationGeometryTypes.ts. This is independent from (not imported from)
// stationTopologyProjection.ts's own TopologyLaneKind, even though the
// string values happen to coincide today — a subject reference is a
// Base-Truth-identity concept, and the rendering/projection layer must
// never become the identity authority (STATION-09 recon invariant,
// restated as an explicit architectural invariant for this batch).
export type StationDetailSubjectKind = "platform" | "track" | "wall";

import type { StationGeometryId } from "./stationGeometryTypes";

/**
 * A pointer to one physical subject within one station's canonical
 * geometry — never a copy of its data, never an identity of its own.
 * `subjectId` is the subject's own existing `.id` field
 * (StationPlatform.id / StationTrackCenterline.id / StationWallSurface.id),
 * unmodified, whatever id-generation path produced it (archetype-derived
 * or hand-authored — this reference is blind to that distinction, same as
 * the STATION-07 projection it sits downstream of).
 */
export interface StationDetailSubjectRef {
  readonly stationGeometryId: StationGeometryId;
  readonly subjectKind: StationDetailSubjectKind;
  readonly subjectId: string;
}
