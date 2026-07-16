import type { Track } from "../data/trackTypes";
import { getMoodGroup, normalizeMoodLabel } from "./moodTaxonomy";
import type { MoodGroupId } from "./moodTaxonomy";

export type MoodSignalHealth =
  | "complete"
  | "needs_mood"
  | "needs_more_mood"
  | "needs_mechanism"
  | "unmapped_suggested"
  | "empty";

export interface TrackSignalState {
  trackId: string;
  title: string;
  artist: string;
  approvedMoods: string[];
  suggestedMoods: string[];
  mechanisms: string[];
  approvedGroups: (MoodGroupId | null)[];
  suggestedGroups: (MoodGroupId | null)[];
  unmappedSuggested: string[];
  health: MoodSignalHealth;
}

export function computeTrackSignalState(track: Track): TrackSignalState {
  const approvedMoods = track.moodTags ?? [];
  const suggestedMoods = track.moodSuggestions ?? [];
  // Prefer mechanismTags (sonic), fall back to mechanicalMoodTags (mix role) as strings
  const mechanisms: string[] = track.mechanismTags?.length
    ? track.mechanismTags
    : (track.mechanicalMoodTags?.map(String) ?? []);

  const approvedGroups = approvedMoods.map((m) => getMoodGroup(normalizeMoodLabel(m)));
  const suggestedGroups = suggestedMoods.map((m) => getMoodGroup(normalizeMoodLabel(m)));

  const unmappedSuggested = suggestedMoods.filter(
    (m) => getMoodGroup(normalizeMoodLabel(m)) === null,
  );

  let health: MoodSignalHealth;
  if (approvedMoods.length === 0 && suggestedMoods.length === 0 && mechanisms.length === 0) {
    health = "empty";
  } else if (approvedMoods.length === 0) {
    health = "needs_mood";
  } else if (approvedMoods.length < 2 && suggestedMoods.length > 0) {
    health = mechanisms.length === 0 ? "needs_mechanism" : "needs_more_mood";
  } else if (mechanisms.length === 0) {
    health = "needs_mechanism";
  } else if (unmappedSuggested.length > 0) {
    health = "unmapped_suggested";
  } else {
    health = "complete";
  }

  return {
    trackId: track.trackId,
    title: track.title ?? "(untitled)",
    artist: track.artist ?? "",
    approvedMoods,
    suggestedMoods,
    mechanisms,
    approvedGroups,
    suggestedGroups,
    unmappedSuggested,
    health,
  };
}

export interface MoodSignalAuditSummary {
  totalTracks: number;
  withApprovedMood: number;
  withNoApprovedMood: number;
  withSuggested: number;
  missingMechanism: number;
  withUnmappedSuggested: number;
  complete: number;
  approvedMoodsUsed: string[];
  suggestedMoodsUsed: string[];
  mechanismsUsed: string[];
}

export function auditMoodSignals(tracks: Track[]): {
  summary: MoodSignalAuditSummary;
  states: TrackSignalState[];
} {
  const states = tracks.map(computeTrackSignalState);

  const approvedSet = new Set<string>();
  const suggestedSet = new Set<string>();
  const mechanismSet = new Set<string>();

  let withApprovedMood = 0;
  let withNoApprovedMood = 0;
  let withSuggested = 0;
  let missingMechanism = 0;
  let withUnmappedSuggested = 0;
  let complete = 0;

  for (const s of states) {
    if (s.approvedMoods.length > 0) withApprovedMood++; else withNoApprovedMood++;
    if (s.suggestedMoods.length > 0) withSuggested++;
    if (s.mechanisms.length === 0) missingMechanism++;
    if (s.unmappedSuggested.length > 0) withUnmappedSuggested++;
    if (s.health === "complete") complete++;
    s.approvedMoods.forEach((m) => approvedSet.add(m));
    s.suggestedMoods.forEach((m) => suggestedSet.add(m));
    s.mechanisms.forEach((m) => mechanismSet.add(m));
  }

  return {
    summary: {
      totalTracks: tracks.length,
      withApprovedMood,
      withNoApprovedMood,
      withSuggested,
      missingMechanism,
      withUnmappedSuggested,
      complete,
      approvedMoodsUsed: [...approvedSet].sort(),
      suggestedMoodsUsed: [...suggestedSet].sort(),
      mechanismsUsed: [...mechanismSet].sort(),
    },
    states,
  };
}

export const SONIC_MECHANISMS = [
  "field-recording",
  "sample-transformation",
  "granular-processing",
  "spatial-design",
  "micro-editing",
  "signal-degradation",
  "dub-delay",
  "sub-bass-pressure",
  "breakbeat-fracture",
  "lo-fi-texture",
  "ambient-wash",
  "rhythmic-looping",
  "modular-patterning",
  "percussive-fragments",
] as const;
