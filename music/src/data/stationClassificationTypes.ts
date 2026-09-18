// ── Station component + complex classification model ──────────────────────────
// 0909_WOS_Subway_Station_Component_Complex_Classification_v1.0.0
//
// A compositional GRAMMAR for describing NYC Subway stations — deliberately
// separate from (and reusing, not duplicating) the existing station-geometry
// and archetype layers. Four independent axes, per the governing spec:
//   1. topology (physical track/platform arrangement)
//   2. service pattern (do express trains stop or bypass — independent of topology)
//   3. structure (underground/elevated/open-cut/at-grade — independent of topology)
//   4. operational role (through vs. terminal — independent of topology)
// plus a StationComponent (one coherent track/platform system, classified on
// all four axes) and a StationComplex (a named station as a COMPOSITION of
// one or more components, e.g. Union Square = two ISLAND_4TRACK components +
// one SIDE_2TRACK component, connected by real transfer relationships).
//
// This checkpoint is TYPES + composability tests only — no automatic
// classification, no new archetype, no geometry, and (per its own explicit
// recon requirement) no duplication of anything that already exists:
//   - Provenance/GeometrySource (stationGeometryTypes.ts) is reused directly
//     for "how do we know this classification" — the exact same source/
//     confidence/note shape already used for every geometry fact in this
//     whole arc, just applied to a classification claim instead.
//   - PlatformConfig ("island"|"side"|"unknown", stationGeometryTypes.ts)
//     already exists at the PER-PLATFORM level; StationTopologyFamily below
//     is a STATION-level concept built from it conceptually (a station's
//     topology family is a function of its platforms' configs + track
//     count), but this checkpoint does not implement that derivation —
//     "do not implement automatic classification yet."
//   - TrackRole (stationGeometryTypes.ts) already carries local/express +
//     direction semantics per PHYSICAL TRACK. StationServicePattern below
//     is a different, station-level concept (does this station's express
//     tracks stop here at all) that TrackRole alone cannot answer — a
//     SIDE_4TRACK station's express tracks always have platformId: null
//     (EXPRESS_BYPASS, the only real pattern this arc's own 4-track
//     archetype produces), while a hypothetical ISLAND_4TRACK station could
//     have express tracks WITH a platformId (EXPRESS_STOP) — genuinely
//     different information TrackRole doesn't carry on its own.
//   - A real complex-identity authority already exists in wall/
//     (`subway:complex:${complexId}`, wall/systems/transit/mtaSubwayIdentity.js's
//     buildComplexRef) — StationComplexId below is a DELIBERATELY SEPARATE,
//     music-side classification-layer concept, never imported from or a
//     competing duplicate of that authority, mirroring the same
//     non-coupling discipline already established between this arc's own
//     `stationGeometry:R42` and the unrelated StudioRich station-library
//     identity (see StationGeometryEditor.tsx's own header comment). A real
//     MTA complex id can still be used as the human-meaningful key for
//     both — e.g. wall's `subway:complex:36` and this file's own
//     `stationComplex:36` both name the same real Bay Ridge Av complex —
//     without either side importing the other.
// - StationGeometryData itself (stationGeometryTypes.ts) is completely
//   UNMODIFIED by this checkpoint. A component classification references a
//   real geometry record only by its own existing id (stationGeometryId, an
//   optional plain string) — never the other way around, and never a new
//   field bolted onto StationGeometryData.
import type { Provenance } from "./stationGeometryTypes";

// ── Core topology families ───────────────────────────────────────────────────
// The initial vocabulary only — explicitly not exhaustive (see the governing
// spec's own "future exceptions" list: 3-track stations, stacked tracks,
// split-level stations, mixed side+island, terminal fan-outs). Adding one is
// a real, separate decision gated on real station evidence, not a checkpoint
// like this one.
// Frozen at eight families per 0909_WOS_Subway_Corridor_Classification_Batch_02
// _Flushing_Line_v1.1.0's own "Frozen Horizontal Topology Vocabulary" —
// SIDE_3TRACK/ISLAND_3TRACK were real, clean matches for 13 real Flushing
// Line components (zero UNRESOLVED_TOPOLOGY that batch); SINGLE_TRACK_
// SINGLE_PLATFORM and MIXED_4TRACK_3PLATFORM had no real example yet but
// were declared frozen alongside the other six. This type previously only
// listed the original four (a real gap between the governing spec's own
// prose freeze and the actual code, found during this checkpoint's own
// recon) — corrected here as a mechanical fix, not a new design decision;
// no new family is being introduced, only the four already-frozen-in-spec
// families this type was missing.
export type StationTopologyFamily =
  | "SINGLE_TRACK_SINGLE_PLATFORM"
  | "SIDE_2TRACK"
  | "ISLAND_2TRACK"
  | "SIDE_3TRACK"
  | "ISLAND_3TRACK"
  | "SIDE_4TRACK"
  | "ISLAND_4TRACK"
  | "MIXED_4TRACK_3PLATFORM";

// ── Service behavior — independent of topology ──────────────────────────────
/** The PHYSICAL relationship between this component's tracks and platforms — does a distinct express/bypass track physically exist here at all? See StationStopBehavior for the separate, operational question of whether express service actually stops. */
export type StationServicePattern = "LOCAL_ONLY" | "EXPRESS_BYPASS" | "EXPRESS_STOP";

// ── Stop behavior — independent of, and orthogonal to, the physical service pattern above ─
// 0909_WOS_Subway_Service_Pattern_Track_Role_Refinement_v1.0.0
//
// StationServicePattern alone cannot cleanly describe a real case Corridor
// Classification Batch 02 (Flushing Line) found four times: an ordinary
// 2-track LOCAL_ONLY component where a real scheduled express service
// shares the SAME physical tracks as local trains and simply skips the
// stop — there is no distinct bypass track, so EXPRESS_BYPASS would be
// physically dishonest (it implies one exists), and the station itself
// isn't meaningfully "EXPRESS_STOP" either. This field exists to say that
// scheduling fact plainly, without touching topology, without inventing a
// fake track, and without overloading StationServicePattern's own meaning.
//
// Deliberately optional and typically populated ONLY when servicePattern is
// LOCAL_ONLY and this real ambiguity applies — for EXPRESS_BYPASS/
// EXPRESS_STOP components the stop question is already fully answered by
// servicePattern itself, and setting this field redundantly risks the two
// fields silently disagreeing later. Left omitted (not defaulted) for every
// component where it doesn't apply, same discipline as every other "not yet
// established" field in this whole arc.
export type StationStopBehavior = "ALL_RELEVANT_SERVICES_STOP" | "SCHEDULED_EXPRESS_SKIP";

// ── Structural environment — independent of topology ────────────────────────
export type StationStructureType = "UNDERGROUND" | "ELEVATED" | "OPEN_CUT" | "AT_GRADE";

// ── Operational role — independent of topology ──────────────────────────────
export type StationOperationalRole = "THROUGH" | "TERMINAL";

/**
 * Deterministic component identity — never a random id, matching this
 * codebase's existing `stationGeometry:${gtfsStopId}` / `stationArchetype:
 * ${key}` convention.
 */
export type StationComponentId = `stationComponent:${string}`;

export function makeStationComponentId(key: string): StationComponentId {
  return `stationComponent:${key}`;
}

/**
 * One coherent track/platform system, classified on all four independent
 * axes. A "normal" station (Bay Ridge Av, 53rd Street, ...) is exactly one
 * component; a large multi-line station (Union Square) is several, owned by
 * a StationComplexClassification (below).
 */
export interface StationComponentClassification {
  id: StationComponentId;
  topology: StationTopologyFamily;
  servicePattern: StationServicePattern;
  /** See StationStopBehavior's own doc — orthogonal to servicePattern, populated chiefly for a LOCAL_ONLY component with real scheduled express-skip behavior on shared tracks. Omitted where it doesn't apply. */
  stopBehavior?: StationStopBehavior;
  structure: StationStructureType;
  operationalRole: StationOperationalRole;
  /** Real route ids this component serves, e.g. ["R"] — carried for context only, never authoritative here (mirrors StationGeometryStationRef.routeIds's own doc). */
  lineGroupIds: string[];
  /**
   * Optional pointer into an existing, real StationGeometryData record
   * (its own `id`, e.g. "stationGeometry:R42") — a component never
   * duplicates geometry, only references it when a calibrated record
   * exists. Omitted for a component that has topology evidence but no
   * authored/calibrated geometry yet.
   */
  stationGeometryId?: string;
  /** How this classification itself is known — reuses Provenance exactly as every geometry fact in this arc already does. */
  provenance: Provenance;
}

/**
 * Deterministic complex identity — see this file's own header for why this
 * is deliberately separate from wall/'s real `subway:complex:*` authority.
 */
export type StationComplexId = `stationComplex:${string}`;

export function makeStationComplexId(key: string): StationComplexId {
  return `stationComplex:${key}`;
}

export type ComplexConnectorKind =
  | "sharedMezzanine"
  | "transferCorridor"
  | "stairs"
  | "escalator"
  | "elevator"
  | "paidAreaConnection";

/**
 * A relationship between exactly two components within the same complex.
 * Deliberately no geometry (no path, no coordinates) — this checkpoint's
 * own "do not build transfer corridor geometry" — and deliberately no
 * numeric elevation for vertical stacking, only a qualitative order, for
 * the same "never fabricate a number nobody measured" discipline already
 * used throughout every calibrated station in this arc.
 */
export interface StationComplexConnector {
  id: string;
  connects: [StationComponentId, StationComponentId];
  kind: ComplexConnectorKind;
  /** Qualitative only. "above" means the first id in `connects` sits above the second. Omit when unknown. */
  relativeVerticalOrder?: "above" | "below" | "same" | "unknown";
  provenance: Provenance;
}

/**
 * A named station as a COMPOSITION of one or more components. An ordinary
 * single-component station can still have a StationComplexClassification
 * (with exactly one componentId and zero connectors) if useful, but is not
 * required to — most of this arc's own calibrated stations (Bay Ridge Av,
 * 77th St, 53rd St, 45th St) have no complex record at all yet, since each
 * is a single real, uncomposed component and none needed one for this
 * checkpoint's own scope.
 */
export interface StationComplexClassification {
  id: StationComplexId;
  /** The real MTA/GTFS complex id this corresponds to, when known — e.g. "36" for Bay Ridge Av's real complex. Never fabricated. */
  complexId?: string;
  componentIds: StationComponentId[];
  connectors: StationComplexConnector[];
  provenance: Provenance;
}
