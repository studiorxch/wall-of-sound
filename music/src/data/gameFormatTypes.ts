// ── Game Format data model ────────────────────────────────────────────────────
// 0805E_RACETRACK_Wall_Mode_and_Cached_Course_Runtime
//
// A GameFormat is a canonical, MUSIC/MAPS-side record describing a race
// format's rules-metadata (objective, competitor bounds, reward, stakes) —
// pure data, never a race runtime. No authoring UI exists yet in this build;
// gameFormatStore.ts seeds one real record on first hydrate. RACETRACK
// (wall/) never writes to this record — it only reads a slim mirror (see
// gameFormatStore.ts's catalog-mirror write).

export type GameFormatMode = "point_to_point";

export interface GameFormat {
  id: string;
  name: string;
  objective: string;
  minCompetitors: number;
  maxCompetitors: number;
  reward: string;
  stakes: string;
  mode: GameFormatMode;
  createdAt: number;
  updatedAt: number;
}
