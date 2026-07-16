import type { Track, TrackSourceOwner, TrackRating } from "../data/trackTypes";

export function parseDurationToSeconds(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number") return value > 0 ? value : undefined;
  const s = String(value).trim();
  if (!s) return undefined;
  // Plain number
  const asNum = parseFloat(s);
  if (!isNaN(asNum) && !s.includes(":")) return asNum > 0 ? asNum : undefined;
  // MM:SS or H:MM:SS
  const parts = s.split(":").map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return undefined;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return undefined;
}

export function parseDelimitedTags(value: unknown): string[] {
  if (value == null || value === "") return [];
  const s = String(value).trim();
  if (!s) return [];
  const sep = s.includes("|") ? "|" : ",";
  return s
    .split(sep)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function normalizeRating(value: unknown): TrackRating | undefined {
  if (value == null || value === "") return undefined;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(n)) return undefined;
  // Scale 0–100 down to 0–5
  const scaled = n > 5 ? Math.round(n / 20) : Math.round(n);
  return Math.max(0, Math.min(5, scaled)) as TrackRating;
}

export function normalizeSourceOwner(value: unknown): TrackSourceOwner {
  const s = String(value ?? "").trim().toLowerCase();
  if (s === "studiorich") return "studiorich";
  if (s === "external") return "external";
  if (s === "reference") return "reference";
  return "unknown";
}

// Preserves old mood-map catalog fields (moods, confidence, coord_x/y/z)
// from legacy JSON import, mapping to current field names.
export function normalizeTrackMetadata(track: Track): Track {
  const raw = track as Track & Record<string, unknown>;
  const legacyMoods = raw["moods"];
  const legacyConfidence = raw["confidence"];
  const legacyX = raw["coord_x"];
  const legacyY = raw["coord_y"];
  const legacyZ = raw["coord_z"];

  return {
    ...track,
    moodTags:
      track.moodTags && track.moodTags.length > 0
        ? track.moodTags
        : Array.isArray(legacyMoods)
        ? (legacyMoods as string[])
        : typeof legacyMoods === "string"
        ? parseDelimitedTags(legacyMoods)
        : track.moodTags ?? [],
    moodConfidence: track.moodConfidence ?? (typeof legacyConfidence === "number" ? legacyConfidence : undefined),
    moodCoordX: track.moodCoordX ?? (typeof legacyX === "number" ? legacyX : undefined),
    moodCoordY: track.moodCoordY ?? (typeof legacyY === "number" ? legacyY : undefined),
    moodCoordZ: track.moodCoordZ ?? (typeof legacyZ === "number" ? legacyZ : undefined),
  };
}
