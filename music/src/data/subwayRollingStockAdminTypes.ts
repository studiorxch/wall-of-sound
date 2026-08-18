// ── subwayRollingStockAdminTypes ──────────────────────────────────────────────
// 0818_SUBWAY_Logical_Rolling_Stock_v1.0.0 / 0818_SUBWAY_Car_Surface_Artwork_Placement_v1.0.0
//
// TS mirror of the record shapes wall/systems/transit/
// subwayLogicalRollingStockAuthority.js, subwayCarSurfaceAuthority.js,
// subwayArtworkAuthority.js, and subwayArtworkPlacementAuthority.js own and
// persist. Wall remains the sole authority — see
// wallRollingStockAdminBridge.ts for the one narrow bridge into these real
// authorities (window.SBE.SubwayLogicalRollingStockAuthority etc.), same
// convention as subwayStationLibraryTypes.ts / wallStationLibraryBridge.ts.
//
// This is a development/admin inspection surface (BUILD §24-27) — no
// artwork content/canvas types exist here; `sourceRef` stays an opaque
// pointer for a future drawing app.

export interface LogicalTrain {
  id: string; // "sr-train-######" — never the MTA trip id
  routeId: string;
  routeFamily: string | null;
  consistId: string;
  activeTripId: string | null;
  direction: string | null;
  lifecycleState: "observed" | "active" | "temporarily_missing" | "stale" | "ended" | "reassociated";
  createdAt: number;
  updatedAt: number;
  lastObservedAt: number | null;
  truthState: "logical";
  associationConfidence: number;
  lastKnownMtaTrainId: string | null;
  provenance: {
    createdReason: string;
    tripAssociationHistory: Array<{ tripId: string; reason: string; confidence: number; associatedAt: number }>;
  };
}

export interface LogicalConsist {
  id: string; // "sr-consist-######"
  logicalTrainId: string;
  routeId: string;
  routeFamily: string | null;
  configuredCarCount: number;
  carIds: string[];
  createdAt: number;
  updatedAt: number;
  truthState: "logical";
}

export interface LogicalCar {
  id: string; // "sr-car-######"
  consistId: string;
  logicalTrainId: string;
  routeId: string;
  routeFamily: string | null;
  slotIndex: number;
  createdAt: number;
  updatedAt: number;
  truthState: "logical";
  lifecycleState: string;
}

export interface TrainPositionState {
  logicalTrainId: string;
  tripId: string | null;
  routeId: string;
  observedStopId: string | null;
  nextStopId: string | null;
  observedTimestamp: number | null;
  position: [number, number] | null;
  progress: number | null;
  truthState: "observed_stop" | "inferred_segment" | "stale" | "unknown";
  confidence: number;
  stale: boolean;
  source: string;
}

export type SurfaceType = "exterior_side_a" | "exterior_side_b" | "front" | "rear" | "interior";

export interface CarSurface {
  id: string; // "sr-surface-######"
  logicalCarId: string;
  consistId: string;
  logicalTrainId: string;
  routeId: string;
  routeFamily: string | null;
  surfaceType: SurfaceType;
  createdAt: number;
  updatedAt: number;
  lifecycleState: string;
  truthState: "logical";
}

export type ArtworkCreatorType = "system" | "user" | "resident" | "invited_artist" | "unknown";

export interface Artwork {
  id: string; // "sr-art-######"
  creatorType: ArtworkCreatorType;
  creatorId: string | null;
  title: string | null;
  sourceType: string;
  sourceRef: string | null;
  createdAt: number;
  updatedAt: number;
  status: "draft" | "active" | "archived";
  metadata: Record<string, unknown>;
}

export type PlacementTargetType = "route" | "route_family" | "logical_train" | "logical_consist" | "logical_car" | "surface";
export type PlacementLifecycleState = "scheduled" | "active" | "covered" | "retired" | "removed" | "expired";

export interface ArtworkPlacement {
  id: string; // "sr-placement-######"
  artworkId: string;
  targetType: PlacementTargetType;
  targetId: string;
  routeId: string;
  logicalTrainId: string;
  consistId: string;
  logicalCarId: string;
  surfaceId: string;
  startedAt: number;
  endedAt: number | null;
  placementState: PlacementLifecycleState;
  layerIndex: number;
  createdAt: number;
  updatedAt: number;
}

export interface RollingStockDiagnostics {
  activeLogicalTrainCount: number;
  logicalConsistCount: number;
  logicalCarCount: number;
  routePoolCount: number;
  logicalTrainIdentityCollisionCount: number; // required invariant: must be 0
  logicalCarIdentityCollisionCount: number; // required invariant: must be 0
  lastReconcileAt: number | null;
}

export interface SurfacePlacementDiagnostics {
  surfaceCount: number;
  surfaceCollisionCount: number; // required invariant: must be 0
  artworkCount: number;
  placementCount: number;
  activePlacements: number;
  orphanActivePlacementCount: number; // required invariant: must be 0
}
