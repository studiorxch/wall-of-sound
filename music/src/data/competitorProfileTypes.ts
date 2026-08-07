// ── Competitor Profile data model ─────────────────────────────────────────────
// 0805E_RACETRACK_Wall_Mode_and_Cached_Course_Runtime
//
// A CompetitorProfile is a canonical, MUSIC/MAPS-side record pairing a name/
// team with a real Orb Profile (wall/-side, unchanged, referenced by id only
// — never duplicated). No authoring UI exists yet; competitorProfileStore.ts
// seeds one CompetitorProfile per existing real Orb on first hydrate.
// RACETRACK (wall/) never writes to this record — it only reads a slim
// mirror (see competitorProfileStore.ts's catalog-mirror write) and resolves
// the actual Orb visuals itself via its own, already-existing
// OrbProfileAuthority (same window, synchronous).

export interface CompetitorProfile {
  id: string;
  name: string;
  team: string;
  orbProfileId: string;
  createdAt: number;
  updatedAt: number;
}
