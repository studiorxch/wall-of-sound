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
  // 0804_MUSIC_Playlist_Eligibility_Repair §8 test #16 "exact role
  // requirements still work when explicitly configured" — opt-in only, no
  // default value, no dedicated wizard UI control (this shape config
  // deliberately exposes no per-section mood/role controls — see the header
  // comment above). When set and non-empty, a section (currently only "intro"
  // reads this) becomes a genuine HARD filter: only candidates carrying at
  // least one of these roles are considered at all. When unset (the default
  // for every section today), the section instead uses a soft preference
  // fallback ladder — see playlistShapeBuilder.ts's INTRO_ROLE_PREFERENCE_TIERS.
  requiredMechanicalRoles?: import("./trackTypes").MechanicalMoodTag[];
};

export type PlaylistShapeConfig = {
  mode: "flat" | "organized";
  targetDurationMinutes: number;
  introMinutes: number;
  outroMinutes: number;
  middleBlockMinutes: number;
  sections: PlaylistShapeSection[];
};
