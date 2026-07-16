/**
 * 8-group mood taxonomy derived from 8x24_mood_chart.csv.
 * Hue ranges are canonical; colors are tuned for dark-UI readability (l≈58%, s≈65%).
 *
 * Color wheel order:
 *   Drive   0–43°   red-orange
 *   Joy     45–88°  warm yellow-green
 *   Wonder  90–133° green
 *   Trust   135–178° teal-cyan
 *   Calm    180–223° blue
 *   Dream   225–268° indigo-violet
 *   Fear    270–313° violet-magenta
 *   Neutral 315–358° (desaturated graphite in UI)
 */

export type MoodGroupId =
  | "drive" | "joy" | "wonder" | "trust"
  | "calm"  | "dream" | "fear" | "neutral";

export interface MoodGroup {
  id: MoodGroupId;
  label: string;
  /** CSS custom property name on :root */
  colorToken: string;
  /** Hue range from chart */
  hueRange: [number, number];
  moods: string[];
}

export const MOOD_GROUPS: MoodGroup[] = [
  {
    id: "drive",
    label: "Drive",
    colorToken: "--mood-drive",
    hueRange: [0, 43],
    moods: [
      "Edgy","Gritty","Restless","Tense","Anti-Establishment","Energetic","Powerful","Intense",
      "Hard-hitting","Charged","Provocative","Defiant","Volatile","Angry","Aggressive","Combative",
      "Turbulent","Belligerent","Rebellious","Furious","Riotous","Explosive","Wrathful","Frenzied",
    ],
  },
  {
    id: "joy",
    label: "Joy",
    colorToken: "--mood-joy",
    hueRange: [45, 88],
    moods: [
      "Mellow","Hopeful","Comforting","Gracious","Playful","Grateful","Sincere","Cheerful",
      "Soulful","Warm","Intimate","Affectionate","Buoyant","Uplifting","Heartfelt","Joyful",
      "Exuberant","Radiant","Effervescent","Triumphant","Jubilant","Ecstatic","Liberated","Blissful",
    ],
  },
  {
    id: "wonder",
    label: "Wonder",
    colorToken: "--mood-wonder",
    hueRange: [90, 133],
    moods: [
      "Open","Liminal","Dreamy","Weightless","Whimsical","Novel","Beautiful","Cinematic",
      "Nostalgic","Romantic","Magical","Luminescent","Boundless","Incongruous","Mythic","Fabled",
      "Softer","Fantastical","Disorienting","Hallucinatory","Orphic","Phantasmic","Transcendent","Cosmic",
    ],
  },
  {
    id: "trust",
    label: "Trust",
    colorToken: "--mood-trust",
    hueRange: [135, 178],
    moods: [
      "Safe","Comfortable","Content","Untroubled","Gentle","Calm","Nurturing","Cozy",
      "Reassured","Peaceful","Soothing","Balanced","Grounded","Connected","Trusting","Sheltered",
      "Harmonious","Contented","Assured","Precise","Unflappable","Anchored","Centered","Secure",
    ],
  },
  {
    id: "calm",
    label: "Calm",
    colorToken: "--mood-calm",
    hueRange: [180, 223],
    moods: [
      "Still","Lonely","Sad","Melancholy","Reflective","Hazy","Subdued","Drifting",
      "Introspective","Wistful","Bittersweet","Tender","Quiet","Submerged","Remorseful","Poignant",
      "Resigned","Vulnerable","Hollow","Despondent","Brooding","Somber","Anguish","Drowned",
    ],
  },
  {
    id: "dream",
    label: "Dream",
    colorToken: "--mood-dream",
    hueRange: [225, 268],
    moods: [
      "Ethereal","Experimental","Quirky","Unfolding","Prospective","Reverie","Inspired","Adventurous",
      "Imaginative","Speculative","Enchanted","Longing","Mesmerizing","Surreal","Lush","Innovative",
      "Visionary","Proleptic","Esoteric","Futuristic","Enigmatic","Imminent","Awakening","Transfigured",
    ],
  },
  {
    id: "fear",
    label: "Fear",
    colorToken: "--mood-fear",
    hueRange: [270, 313],
    moods: [
      "Unsettled","Uneasy","Disquieted","Uncertain","Taut","Nervous","Apprehensive","Elusive",
      "Anxious","Creeping","Suspenseful","Ominous","Dark","Shadowed","Obscured","Eerie",
      "Uncanny","Hypnotic","Haunting","Fearful","Disoriented","Claustrophobic","Alienated","Paranoid",
    ],
  },
  {
    id: "neutral",
    label: "Neutral",
    colorToken: "--mood-neutral",
    hueRange: [315, 358],
    moods: [
      "Baseline","Observational","Impassive","Ambivalent","Detached","Objective","Minimalist","Structured",
      "Stable","Analog","Concrete","Perceptive","Clinical","Textural","Atmospheric","Raw",
      "Ambient","Glitchy","Abstract","Underground","Deconstructed","Arcane","Timeless","Mechanical",
    ],
  },
];

// ── Lookup tables ─────────────────────────────────────────────────────────────

const MOOD_TO_GROUP = new Map<string, MoodGroupId>();
for (const group of MOOD_GROUPS) {
  for (const mood of group.moods) {
    MOOD_TO_GROUP.set(mood.toLowerCase(), group.id);
  }
}

/**
 * Alias mapping for commonly used informal terms that aren't in the 192-mood chart.
 * Maps alias (lowercase) → nearest canonical group.
 * Does NOT erase the original label — just assigns a group.
 */
export const MOOD_ALIASES: Record<string, MoodGroupId> = {
  // calm-adjacent
  chill: "calm",
  chilled: "calm",
  relaxed: "calm",
  soothing: "calm",
  muted: "calm",
  meditative: "calm",
  introspective: "calm",
  melancholy: "calm",
  submerged: "calm",
  vulnerable: "calm",
  remorseful: "calm",
  poignant: "calm",

  // joy-adjacent
  hopeful: "joy",
  playful: "joy",
  upbeat: "joy",
  uplifting: "joy",
  euphoric: "joy",
  carefree: "joy",

  // wonder-adjacent
  dreamy: "wonder",
  nostalgic: "wonder",
  weightless: "wonder",
  fantastical: "wonder",
  magical: "wonder",

  // trust-adjacent
  balanced: "trust",
  sheltered: "trust",
  grounded: "trust",
  peaceful: "trust",

  // drive-adjacent
  aggressive: "drive",
  tense: "drive",
  intense: "drive",
  energetic: "drive",
  epic: "drive",

  // dream-adjacent
  experimental: "dream",
  futuristic: "dream",
  hypnotic: "dream",
  cinematic: "dream",
  ambient: "dream",
  mysterious: "dream",
  surreal: "dream",
  sleepy: "dream",

  // fear-adjacent
  haunting: "fear",
  dark: "fear",
  eerie: "fear",

  // neutral-adjacent
  raw: "neutral",
  clinical: "neutral",
  mechanical: "neutral",
  abstract: "neutral",
  glitchy: "neutral",
  atmospheric: "neutral",
};

const NON_MOOD_PATTERNS = {
  mechanism: [
    "field-recording","sample-transformation","granular-processing","spatial-design",
    "synthesis","resampling","layering","processing","convolution","granular",
  ],
  genre: [
    "electronic","ambient","downtempo","idm","experimental-electronic","breakbeat",
    "dark-ambient","drone","industrial","techno","house","jazz","classical","folk",
  ],
  role: [
    "opener","bridge","closer","reset","lift","hold","interlude","deep-listening",
    "cinematic-interlude","immersive-journey","transition","intro","outro",
  ],
};

// ── Public API ────────────────────────────────────────────────────────────────

export function getMoodGroup(mood: string): MoodGroupId | null {
  const key = mood.toLowerCase().trim();
  return MOOD_TO_GROUP.get(key) ?? MOOD_ALIASES[key] ?? null;
}

export function getMoodColorToken(mood: string): string {
  const group = getMoodGroup(mood);
  if (!group) return "--mood-neutral";
  const g = MOOD_GROUPS.find((g) => g.id === group);
  return g?.colorToken ?? "--mood-neutral";
}

/** Returns the original label unchanged; alias mapping is group-only, not label replacement. */
export function normalizeMoodLabel(value: string): string {
  return value;
}

export type TagKind = "mood" | "modifier" | "mechanism" | "genre" | "role" | "unknown";

export function classifyMoodLikeValue(value: string): {
  kind: TagKind;
  group?: MoodGroupId;
  normalized?: string;
} {
  const key = value.toLowerCase().trim();

  for (const [kind, list] of Object.entries(NON_MOOD_PATTERNS) as [TagKind, string[]][]) {
    if (list.some((p) => key === p || key.includes(p) || p.includes(key))) {
      return { kind };
    }
  }

  const group = getMoodGroup(key);
  if (group) {
    return { kind: "mood", group, normalized: value };
  }

  return { kind: "unknown" };
}

// ── Debug audit ───────────────────────────────────────────────────────────────

export function auditMoodVocabulary(
  tracks: Array<{ moodTags?: string[]; moodSuggestions?: string[] }>,
) {
  const approvedCounts = new Map<string, number>();
  const suggestedCounts = new Map<string, number>();

  for (const t of tracks) {
    for (const m of t.moodTags ?? []) approvedCounts.set(m, (approvedCounts.get(m) ?? 0) + 1);
    for (const m of t.moodSuggestions ?? []) suggestedCounts.set(m, (suggestedCounts.get(m) ?? 0) + 1);
  }

  const allValues = new Set([...approvedCounts.keys(), ...suggestedCounts.keys()]);

  const byGroup: Record<MoodGroupId, string[]> = {
    drive: [], joy: [], wonder: [], trust: [], calm: [], dream: [], fear: [], neutral: [],
  };
  const unmapped: string[] = [];
  const possibleMechanism: string[] = [];
  const possibleRole: string[] = [];
  const possibleGenre: string[] = [];

  for (const v of allValues) {
    const classified = classifyMoodLikeValue(v);
    if (classified.kind === "mood" && classified.group) {
      byGroup[classified.group].push(v);
    } else if (classified.kind === "mechanism") {
      possibleMechanism.push(v);
    } else if (classified.kind === "role") {
      possibleRole.push(v);
    } else if (classified.kind === "genre") {
      possibleGenre.push(v);
    } else {
      unmapped.push(v);
    }
  }

  console.group("🎭 MUSIC Mood Vocabulary Audit");
  console.log(
    `${allValues.size} unique values — ${approvedCounts.size} approved, ${suggestedCounts.size} suggested`,
  );
  console.group("By group");
  for (const [gid, moods] of Object.entries(byGroup)) {
    if (moods.length) console.log(`${gid}: ${moods.join(", ")}`);
  }
  console.groupEnd();
  if (unmapped.length) console.warn("Unmapped (no group match):", unmapped.sort());
  if (possibleMechanism.length) console.warn("Possible mechanism in mood field:", possibleMechanism);
  if (possibleRole.length) console.warn("Possible role in mood field:", possibleRole);
  if (possibleGenre.length) console.warn("Possible genre in mood field:", possibleGenre);
  console.groupEnd();

  return { byGroup, unmapped, possibleMechanism, possibleRole, possibleGenre };
}
