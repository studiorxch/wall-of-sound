import type { Track } from "../data/trackTypes";
import type { CrateRecord } from "../data/crateTypes";
import { getMoodGroup, type MoodGroupId, MOOD_GROUPS } from "./moodTaxonomy";

export type CrateVisualType = "mood" | "source" | "system" | "mixed" | "unknown";

export interface CrateMoodSummary {
  dominantMoodGroup?: MoodGroupId;
  secondaryMoodGroups: MoodGroupId[];
  moodCounts: Partial<Record<MoodGroupId, number>>;
  mappedTrackCount: number;
  unmappedTrackCount: number;
  confidence: "high" | "medium" | "low" | "none";
}

const SYSTEM_NAME_PATTERNS = [
  "recently added", "unrated", "missing mood", "missing audio",
  "needs review", "all internal", "all external", "all catalog",
  "reference", "artists", "uncategorized", "inbox",
];

export function classifyCrateVisualType(crate: CrateRecord): CrateVisualType {
  const nameLower = crate.name.toLowerCase();

  // Source crates: names that are clearly about source/library
  const isSourceName = SYSTEM_NAME_PATTERNS.some((p) => nameLower.includes(p));
  if (isSourceName) return "source";

  // Mood-filtered crates: have explicit mood tags in filters
  if (crate.filters.moodTags.length > 0) return "mood";

  // Crates with no filters at all and default name patterns → system
  if (
    !crate.filters.moodTags.length &&
    !crate.filters.groupings.length &&
    !crate.filters.genres.length &&
    !crate.filters.search &&
    isSourceName
  ) return "system";

  return "unknown";
}

export function computeCrateMoodSummary(
  _crate: CrateRecord,
  tracks: Track[],
): CrateMoodSummary {
  const moodCounts: Partial<Record<MoodGroupId, number>> = {};
  let mappedTrackCount = 0;
  let unmappedTrackCount = 0;

  for (const track of tracks) {
    const moods = track.moodTags ?? [];
    if (moods.length === 0) {
      unmappedTrackCount++;
      continue;
    }

    const groupsForTrack = new Set<MoodGroupId>();
    for (const mood of moods) {
      const group = getMoodGroup(mood);
      if (group) groupsForTrack.add(group);
    }

    if (groupsForTrack.size === 0) {
      unmappedTrackCount++;
    } else {
      mappedTrackCount++;
      for (const group of groupsForTrack) {
        moodCounts[group] = (moodCounts[group] ?? 0) + 1;
      }
    }
  }

  const totalMapped = Object.values(moodCounts).reduce((s, n) => s + (n ?? 0), 0);

  if (totalMapped === 0) {
    return {
      secondaryMoodGroups: [],
      moodCounts,
      mappedTrackCount: 0,
      unmappedTrackCount,
      confidence: "none",
    };
  }

  // Sort groups by count descending
  const sorted = (Object.entries(moodCounts) as [MoodGroupId, number][])
    .sort((a, b) => b[1] - a[1]);

  const dominantMoodGroup = sorted[0][0];
  const dominantCount = sorted[0][1];
  const dominantRatio = dominantCount / totalMapped;

  const confidence: CrateMoodSummary["confidence"] =
    dominantRatio >= 0.5 ? "high" :
    dominantRatio >= 0.3 ? "medium" : "low";

  // Secondary: groups above 15% threshold, excluding dominant
  const secondaryMoodGroups = sorted
    .slice(1)
    .filter(([, count]) => count / totalMapped >= 0.15)
    .map(([gid]) => gid);

  return {
    dominantMoodGroup,
    secondaryMoodGroups,
    moodCounts,
    mappedTrackCount,
    unmappedTrackCount,
    confidence,
  };
}

export interface CrateVisualToken {
  type: CrateVisualType;
  dominantMoodGroup?: MoodGroupId;
  secondaryMoodGroups: MoodGroupId[];
  colorToken: string;
  iconKey: string;
  confidence: "high" | "medium" | "low" | "none";
}

export function getCrateVisualToken(
  crate: CrateRecord,
  tracks: Track[],
): CrateVisualToken {
  // Use filter-declared mood tags to determine type first
  const moodTagGroups: MoodGroupId[] = [];
  for (const tag of crate.filters.moodTags) {
    const g = getMoodGroup(tag);
    if (g && !moodTagGroups.includes(g)) moodTagGroups.push(g);
  }

  const baseType = classifyCrateVisualType(crate);

  // If the crate has explicit mood filters, derive from those (fast, no track scan needed)
  if (moodTagGroups.length > 0) {
    const dominantMoodGroup = moodTagGroups[0];
    const secondaryMoodGroups = moodTagGroups.slice(1);
    const group = MOOD_GROUPS.find((g) => g.id === dominantMoodGroup);
    return {
      type: moodTagGroups.length > 1 ? "mixed" : "mood",
      dominantMoodGroup,
      secondaryMoodGroups,
      colorToken: group?.colorToken ?? "--mood-neutral",
      iconKey: dominantMoodGroup,
      confidence: "high",
    };
  }

  // Source/system crates: no mood color
  if (baseType === "source" || baseType === "system") {
    const src = crate.sourceOwners;
    const iconKey = src.length === 1
      ? (src[0] === "studiorich" ? "source-cat" : "source-ext")
      : "source-mixed";
    return {
      type: baseType,
      secondaryMoodGroups: [],
      colorToken: "--mood-neutral",
      iconKey,
      confidence: "none",
    };
  }

  // Derive from track mood tags
  const summary = computeCrateMoodSummary(crate, tracks);

  if (summary.confidence === "none") {
    return {
      type: "unknown",
      secondaryMoodGroups: [],
      colorToken: "--mood-neutral",
      iconKey: "unknown",
      confidence: "none",
    };
  }

  const dominantMoodGroup = summary.dominantMoodGroup!;
  const group = MOOD_GROUPS.find((g) => g.id === dominantMoodGroup);
  const type: CrateVisualType = summary.secondaryMoodGroups.length > 0 ? "mixed" : "mood";

  return {
    type,
    dominantMoodGroup,
    secondaryMoodGroups: summary.secondaryMoodGroups,
    colorToken: group?.colorToken ?? "--mood-neutral",
    iconKey: dominantMoodGroup,
    confidence: summary.confidence,
  };
}
