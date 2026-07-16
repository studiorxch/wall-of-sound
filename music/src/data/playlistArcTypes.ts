export type PlaylistArcMode = "none" | "three_part" | "four_part";

export type PlaylistArcSectionName =
  | "opening"
  | "middle"
  | "closing"
  | "deepening"
  | "lift_contrast";

export type PlaylistEnergyTarget =
  | "auto"
  | "low"
  | "medium_low"
  | "medium"
  | "medium_high"
  | "high";

export type PlaylistTransitionIntent =
  | "auto"
  | "smooth"
  | "deepen"
  | "lift"
  | "contrast"
  | "reset"
  | "exit";

// Section budget mode (0711_MUSIC_Playlist_Section_Budget_Modes). Missing/undefined
// on older saved sections defaults to "percent" — the original, only-implemented mode.
export type PlaylistSectionWeightMode = "percent" | "duration" | "track_count";

export interface PlaylistArcSection {
  id: string;
  name: PlaylistArcSectionName;
  label: string;
  weight: number;
  // Budget mode fields — only one is "active" per weightMode, but all three are
  // kept populated so switching modes in the UI preserves prior values.
  weightMode?: PlaylistSectionWeightMode;
  durationMinutes?: number;
  trackCount?: number;
  primaryCrate: string;
  secondaryCrate?: string;
  crateBlend?: number;       // 0-1: fraction from primaryCrate (remainder from secondary)
  energyTarget: PlaylistEnergyTarget;
  transitionIntent: PlaylistTransitionIntent;
  locked: boolean;
  // Nested Middle sub-sections (0711_MUSIC_Nested_Middle_Section_Generator).
  // One level deep only: a top-level section may have children, but a child's
  // own `children` is never read. `enabled: false` disables a child without
  // removing its saved config (weights re-normalize over enabled children only).
  // When enabled children are present, the parent becomes a budget-only
  // container and is never itself a generation leaf.
  enabled?: boolean;
  children?: PlaylistArcSection[];
}

export interface PlaylistArcConfig {
  mode: PlaylistArcMode;
  sections: PlaylistArcSection[];
}

// --- Energy target ranges ---

export const ENERGY_TARGET_RANGES: Record<PlaylistEnergyTarget, [number, number]> = {
  auto:        [0.00, 1.00],
  low:         [0.00, 0.20],
  medium_low:  [0.18, 0.35],
  medium:      [0.30, 0.50],
  medium_high: [0.45, 0.70],
  high:        [0.65, 1.00],
};

// --- Section ordering preference ---

export const SECTION_ENERGY_DIRECTION: Record<PlaylistArcSectionName, "ascending" | "stable" | "descending" | "lift"> = {
  opening:      "ascending",
  middle:       "stable",
  deepening:    "stable",
  lift_contrast: "lift",
  closing:      "descending",
};

// --- Defaults ---

export const DEFAULT_THREE_PART_SECTIONS: PlaylistArcSection[] = [
  {
    id: "s1",
    name: "opening",
    label: "Opening",
    weight: 0.30,
    primaryCrate: "",
    energyTarget: "auto",
    transitionIntent: "deepen",
    locked: false,
  },
  {
    id: "s2",
    name: "middle",
    label: "Middle",
    weight: 0.45,
    primaryCrate: "",
    energyTarget: "auto",
    transitionIntent: "smooth",
    locked: false,
  },
  {
    id: "s3",
    name: "closing",
    label: "Closing",
    weight: 0.25,
    primaryCrate: "",
    energyTarget: "auto",
    transitionIntent: "exit",
    locked: false,
  },
];

export const DEFAULT_FOUR_PART_SECTIONS: PlaylistArcSection[] = [
  {
    id: "s1",
    name: "opening",
    label: "Opening",
    weight: 0.25,
    primaryCrate: "",
    energyTarget: "auto",
    transitionIntent: "deepen",
    locked: false,
  },
  {
    id: "s2",
    name: "deepening",
    label: "Deepening",
    weight: 0.35,
    primaryCrate: "",
    energyTarget: "auto",
    transitionIntent: "smooth",
    locked: false,
  },
  {
    id: "s3",
    name: "lift_contrast",
    label: "Lift / Contrast",
    weight: 0.20,
    primaryCrate: "",
    energyTarget: "auto",
    transitionIntent: "lift",
    locked: false,
  },
  {
    id: "s4",
    name: "closing",
    label: "Closing",
    weight: 0.20,
    primaryCrate: "",
    energyTarget: "auto",
    transitionIntent: "exit",
    locked: false,
  },
];

// --- Middle sub-sections (0711_MUSIC_Nested_Middle_Section_Generator) ---

// Default children when a user enables "Middle Subsections" — weights are
// percentages of the Middle budget, not the full playlist.
export function makeDefaultMiddleChildren(): PlaylistArcSection[] {
  return [
    {
      id: "s2a", name: "middle", label: "Middle A / Warm Build",
      weight: 0.30, primaryCrate: "", energyTarget: "auto",
      transitionIntent: "smooth", locked: false, enabled: true,
    },
    {
      id: "s2b", name: "middle", label: "Middle B / Core Groove",
      weight: 0.50, primaryCrate: "", energyTarget: "auto",
      transitionIntent: "smooth", locked: false, enabled: true,
    },
    {
      id: "s2c", name: "middle", label: "Middle C / Drift Variation",
      weight: 0.20, primaryCrate: "", energyTarget: "auto",
      transitionIntent: "smooth", locked: false, enabled: true,
    },
  ];
}

// --- Presets ---

export interface PlaylistArcPreset {
  id: string;
  label: string;
  description: string;
  config: PlaylistArcConfig;
}

export const ARC_PRESETS: PlaylistArcPreset[] = [
  {
    id: "bittersweet_nostalgia",
    label: "Bittersweet Nostalgia",
    description: "ache → remember → recover → glow",
    config: {
      mode: "four_part",
      sections: [
        {
          id: "s1", name: "opening", label: "Ache",
          weight: 0.25, primaryCrate: "melancholy", secondaryCrate: "nostalgia", crateBlend: 0.65,
          energyTarget: "medium_low", transitionIntent: "deepen", locked: false,
        },
        {
          id: "s2", name: "deepening", label: "Memory",
          weight: 0.35, primaryCrate: "nostalgia", secondaryCrate: "melancholy", crateBlend: 0.75,
          energyTarget: "medium_low", transitionIntent: "smooth", locked: false,
        },
        {
          id: "s3", name: "lift_contrast", label: "Soft Lift",
          weight: 0.20, primaryCrate: "hope", secondaryCrate: "nostalgia", crateBlend: 0.60,
          energyTarget: "medium", transitionIntent: "lift", locked: false,
        },
        {
          id: "s4", name: "closing", label: "Afterglow",
          weight: 0.20, primaryCrate: "nostalgia", secondaryCrate: "hope", crateBlend: 0.60,
          energyTarget: "low", transitionIntent: "exit", locked: false,
        },
      ],
    },
  },
  {
    id: "dub_infrastructure",
    label: "Dub Infrastructure",
    description: "signal → pressure → decay",
    config: {
      mode: "three_part",
      sections: [
        {
          id: "s1", name: "opening", label: "Signal In",
          weight: 0.30, primaryCrate: "submerged", secondaryCrate: "deep", crateBlend: 0.70,
          energyTarget: "medium_low", transitionIntent: "deepen", locked: false,
        },
        {
          id: "s2", name: "middle", label: "Pressure Loop",
          weight: 0.45, primaryCrate: "dub infrastructure", secondaryCrate: "minimal pressure", crateBlend: 0.70,
          energyTarget: "medium", transitionIntent: "smooth", locked: false,
        },
        {
          id: "s3", name: "closing", label: "Signal Decay",
          weight: 0.25, primaryCrate: "background engine", secondaryCrate: "submerged rhythm", crateBlend: 0.60,
          energyTarget: "low", transitionIntent: "exit", locked: false,
        },
      ],
    },
  },
  {
    id: "five_part_middle_split",
    label: "5-Part Middle Split",
    description: "intro → warm build → core groove → drift → outro",
    config: {
      mode: "three_part",
      sections: [
        {
          id: "s1", name: "opening", label: "Intro",
          weight: 0.15, primaryCrate: "", energyTarget: "auto",
          transitionIntent: "deepen", locked: false,
        },
        {
          id: "s2", name: "middle", label: "Middle",
          weight: 0.70, primaryCrate: "", energyTarget: "auto",
          transitionIntent: "smooth", locked: false,
          children: [
            {
              id: "s2a", name: "middle", label: "Middle A / Warm Build",
              weight: 0.20, primaryCrate: "", energyTarget: "medium_low",
              transitionIntent: "smooth", locked: false, enabled: true,
            },
            {
              id: "s2b", name: "middle", label: "Middle B / Core Groove",
              weight: 0.35, primaryCrate: "", energyTarget: "medium",
              transitionIntent: "smooth", locked: false, enabled: true,
            },
            {
              id: "s2c", name: "middle", label: "Middle C / Drift / Variation",
              weight: 0.15, primaryCrate: "", energyTarget: "medium_low",
              transitionIntent: "lift", locked: false, enabled: true,
            },
          ],
        },
        {
          id: "s3", name: "closing", label: "Outro",
          weight: 0.15, primaryCrate: "", energyTarget: "auto",
          transitionIntent: "exit", locked: false,
        },
      ],
    },
  },
  {
    id: "afterhours",
    label: "Afterhours",
    description: "deep → pulse → drift",
    config: {
      mode: "three_part",
      sections: [
        {
          id: "s1", name: "opening", label: "Entry",
          weight: 0.30, primaryCrate: "late-night", secondaryCrate: "minimal", crateBlend: 0.65,
          energyTarget: "medium_low", transitionIntent: "deepen", locked: false,
        },
        {
          id: "s2", name: "middle", label: "Deep Hour",
          weight: 0.45, primaryCrate: "hypnotic", secondaryCrate: "afterhours", crateBlend: 0.70,
          energyTarget: "medium", transitionIntent: "smooth", locked: false,
        },
        {
          id: "s3", name: "closing", label: "Before Light",
          weight: 0.25, primaryCrate: "drifting", secondaryCrate: "deep", crateBlend: 0.60,
          energyTarget: "low", transitionIntent: "exit", locked: false,
        },
      ],
    },
  },
];
