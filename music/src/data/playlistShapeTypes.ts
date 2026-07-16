// Crate-first playlist shape (0711_MUSIC_Crate_First_Playlist_Shape_UX_Revision).
// User-facing model: an organized timeline of Intro / S01 / S02 ... / Outro
// sections, each fed by one or more weighted crates. Deliberately does not
// expose mood/energy/genre/transition controls — that intelligence belongs to
// the crate, not the playlist. Superseded/replaces the Mood Arc-based wizard
// shape step; the standalone Playlist Settings → Sections/Weights system
// (PlaylistArcConfig) is untouched.

export type SectionCrateWeight = {
  crateId: string;
  weight: number;
};

// Section energy envelope (0712_MUSIC_Playlist_Section_Energy_Envelopes) — the
// intended energy PATH through a section, independent of both the crate (which
// defines candidate membership) and each track's own actual energy value. See
// src/logic/playlistEnergyEnvelope.ts for the curve math and the documented
// 0–1 scale deviation from the original spec draft.
export type PlaylistEnergyShape = "flat" | "rise" | "fall" | "arc" | "valley";

export type PlaylistEnergyShapeSource = "inferred" | "explicit";

export interface PlaylistSectionEnergyEnvelope {
  start: number;
  end: number;
  shape: PlaylistEnergyShape;
  shapeSource: PlaylistEnergyShapeSource;
}

export type PlaylistShapeSection = {
  id: string;
  label: string;
  durationMinutes: number;
  crateWeights: SectionCrateWeight[];
  locked?: boolean;
  energyEnvelope: PlaylistSectionEnergyEnvelope;
};

export type PlaylistShapeConfig = {
  mode: "flat" | "organized";
  targetDurationMinutes: number;
  introMinutes: number;
  outroMinutes: number;
  middleBlockMinutes: number;
  sections: PlaylistShapeSection[];
};
