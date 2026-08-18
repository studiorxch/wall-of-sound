// ── subwayResidentGraffitiTypes ───────────────────────────────────────────────
// 0818_SUBWAY_Resident_Graffiti_Artists_v1.0.0
//
// TS mirror of the record shapes
// wall/systems/transit/subwayResidentGraffitiArtistAuthority.js owns and
// persists. Wall remains the sole authority for identity/style/behavior —
// see wallResidentGraffitiBridge.ts for the one narrow bridge into it, same
// convention as every other subway*Types.ts / wall*Bridge.ts pair this
// session.

export interface GraffitiStyleProfile {
  id: string; // "sr-style-######"
  label: string;
  preferredTools: Array<"marker" | "fatcap" | "mop">;
  preferredColors: string[];
  widthRange: { min: number; max: number };
  pressureBias: number | null;
  density: number;
  strokeCountRange: { min: number; max: number };
  angularity: number;
  curvature: number;
  dripAffinity: number;
  fatcapAffinity: number;
  markerAffinity: number;
  symmetryBias: number | null;
  verticality: number | null;
  horizontalStretch: number | null;
  complexity: number;
  seedSalt: number;
}

export type CoverPermission = "never" | "older_only" | "allowed";

export interface ResidentBehaviorProfile {
  emptySurfacePreference: number;
  coverPermission: CoverPermission;
  coverProbability: number;
  routeAffinity: number;
  recencyAvoidance: number;
  repeatCarAvoidance: number;
  maxRecentPlacementsConsidered: number;
}

export interface ResidentArtworkHistoryEntry {
  artworkId: string;
  createdAt: number;
  status: string;
  styleProfileId: string;
  generationSeed: number;
  toolSequence: string[];
  palette: string[];
}

export interface ResidentPlacementHistoryEntry {
  placementId: string;
  artworkId: string;
  surfaceId: string;
  routeId: string;
  logicalCarId: string;
  startedAt: number;
  endedAt: number | null;
}

export interface ResidentGraffitiArtist {
  id: string; // "sr-resident-######" — never the tag or display name
  displayName: string;
  tagName: string;
  creatorType: "resident";
  creatorId: string; // === id
  status: "active" | "inactive";
  homeBorough: string | null;
  preferredRoutes: string[]; // canonical subway:route:* — empty = no preference
  preferredRouteFamilies: string[]; // e.g. "ace", "l" — empty = no preference
  preferredSurfaceTypes: Array<"exterior_side_a" | "exterior_side_b">;
  styleProfileId: string;
  behaviorProfile: ResidentBehaviorProfile;
  createdAt: number;
  updatedAt: number;
  artworkHistory: ResidentArtworkHistoryEntry[];
  placementHistory: ResidentPlacementHistoryEntry[];
}

export interface EligibleSurfaceResolution {
  ok: boolean;
  reason?: string;
  surface?: { id: string; surfaceType: string; logicalCarId: string; consistId: string; logicalTrainId: string; routeId: string; routeFamily: string | null };
  car?: { id: string; slotIndex: number };
  train?: { id: string; routeId: string; routeFamily: string | null };
  coverAction?: boolean;
  covering?: { id: string; artworkId: string } | null;
}

export interface ResidentAuthorityDiagnostics {
  residentCount: number;
  styleProfileCount: number;
  residentIdentityCollisionCount: number; // required invariant: must be 0
  totalArtworksCreated: number;
  totalPlacementsCreated: number;
  orphanArtworkReferenceCount: number;
  orphanPlacementReferenceCount: number;
}
