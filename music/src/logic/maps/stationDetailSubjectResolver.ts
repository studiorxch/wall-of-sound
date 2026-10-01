// ── Station Detail Subject resolver ────────────────────────────────────────────
// STATION-10 (0915_WOS_Subway_Detail_Subject_Selection_Proof_v1.0.0)
//
// Resolves a StationDetailSubjectRef back into the exact canonical Base
// Truth record it points at. This is the ONLY place a StationDetailSubjectRef
// is turned into real subject data — the projection (stationTopologyProjection.ts)
// and renderer (stationTopologySvgRenderer.ts) stay exactly as they were:
// pure, identity-blind pass-throughs that never resolve anything themselves
// (STATION-09 recon invariant: the rendering/projection layer may expose
// identity, it must never become the identity authority).
//
// `StationDetailSubjectSource` is deliberately NOT `StationGeometryData`
// itself — same narrowing precedent as StationTopologyInput
// (stationTopologyProjection.ts): the resolver has no use for
// levels/connections/platformLinks/evidenceConflicts/entrances, and a
// narrower structural type lets a synthetic/test-only fixture (e.g. the
// STATION-06/07 four-track island contract fixture) satisfy it without
// fabricating an entire StationGeometryData record. Any real
// StationGeometryData value already satisfies this type structurally.
import type {
  StationGeometryId,
  StationPlatform,
  StationTrackCenterline,
  StationWallSurface,
} from "../../data/stationGeometryTypes";
import type { StationDetailSubjectKind, StationDetailSubjectRef } from "../../data/stationDetailSubjectTypes";

export interface StationDetailSubjectSource {
  readonly id: StationGeometryId;
  readonly platforms: readonly StationPlatform[];
  readonly trackCenterlines: readonly StationTrackCenterline[];
  readonly wallSurfaces: readonly StationWallSurface[];
}

export type ResolvedStationDetailSubject =
  | { readonly subjectKind: "platform"; readonly subject: StationPlatform }
  | { readonly subjectKind: "track"; readonly subject: StationTrackCenterline }
  | { readonly subjectKind: "wall"; readonly subject: StationWallSurface };

export function isStationDetailSubjectKind(value: string): value is StationDetailSubjectKind {
  return value === "platform" || value === "track" || value === "wall";
}

/**
 * Pure. Resolves `ref` against `source`'s own real Base Truth arrays —
 * never substitutes another subject, another station, or a writable-
 * surface default. Dispatch is scoped strictly by `subjectKind`: a
 * platform id and a track id that happen to share the same string value
 * never cross-resolve into each other's collection, because each kind
 * only ever searches its own array. Never reads `suitableForArt` or any
 * other writability field — a non-writable subject (e.g. a track, which
 * has no `suitableForArt` field at all) resolves exactly like any other.
 * Returns `null` for a station-id mismatch or an unknown `subjectId` —
 * an honest failure, never a fallback to any other subject.
 */
export function resolveStationDetailSubject(
  source: StationDetailSubjectSource,
  ref: StationDetailSubjectRef,
): ResolvedStationDetailSubject | null {
  if (source.id !== ref.stationGeometryId) return null;

  if (ref.subjectKind === "platform") {
    const subject = source.platforms.find((p) => p.id === ref.subjectId);
    return subject ? { subjectKind: "platform", subject } : null;
  }
  if (ref.subjectKind === "track") {
    const subject = source.trackCenterlines.find((t) => t.id === ref.subjectId);
    return subject ? { subjectKind: "track", subject } : null;
  }
  const subject = source.wallSurfaces.find((w) => w.id === ref.subjectId);
  return subject ? { subjectKind: "wall", subject } : null;
}
