import type { Track } from "../data/trackTypes";

export type MetadataCoverageStatus = "excellent" | "usable" | "weak" | "blocked";
export type DurationSource = "metadata" | "estimated" | "missing";

export const ESTIMATED_DURATION_FALLBACK = 180; // seconds

export type TrackReadiness = {
  trackId: string;
  hasTitle: boolean;
  hasArtist: boolean;
  hasDuration: boolean;
  hasBpm: boolean;
  hasKey: boolean;
  hasEnergy: boolean;
  hasFilePath: boolean;
  durationSource: DurationSource;
  effectiveDuration: number;
  warnings: string[];
};

export type MetadataReadinessSummary = {
  status: MetadataCoverageStatus;
  totalTracks: number;
  durationCount: number;
  bpmCount: number;
  keyCount: number;
  energyCount: number;
  filePathCount: number;
  estimatedDurationCount: number;
  missingTrackIds: string[];
};

export function buildTrackReadiness(track: Track): TrackReadiness {
  const hasTitle = !!(track.title?.trim());
  const hasArtist = !!(track.artist?.trim());
  const hasDuration = (track.durationSeconds ?? 0) > 0;
  const hasBpm = (track.bpm ?? 0) > 0;
  const hasKey = !!(track.camelotKey || track.key || track.musicalKey);
  const hasEnergy = (track.energy ?? 0) > 0;
  const hasFilePath = !!(track.filePath || track.audioFilename || track.fileName);

  const durationSource: DurationSource = hasDuration
    ? "metadata"
    : "estimated";

  const effectiveDuration = hasDuration
    ? track.durationSeconds
    : ESTIMATED_DURATION_FALLBACK;

  const warnings: string[] = [];
  if (!hasDuration) warnings.push("Missing duration (estimated 3:00)");
  if (!hasBpm) warnings.push("Missing BPM");
  if (!hasKey) warnings.push("Missing key");
  if (!hasEnergy) warnings.push("Missing energy");
  if (!hasFilePath) warnings.push("No file path");

  return {
    trackId: track.trackId,
    hasTitle, hasArtist, hasDuration, hasBpm, hasKey, hasEnergy, hasFilePath,
    durationSource, effectiveDuration, warnings,
  };
}

export function summarizeMetadataReadiness(
  tracks: Track[],
  resolvedTrackIds?: string[],
): MetadataReadinessSummary {
  if (tracks.length === 0) {
    return {
      status: "blocked",
      totalTracks: 0,
      durationCount: 0, bpmCount: 0, keyCount: 0,
      energyCount: 0, filePathCount: 0, estimatedDurationCount: 0,
      missingTrackIds: [],
    };
  }

  let durationCount = 0, bpmCount = 0, keyCount = 0;
  let energyCount = 0, filePathCount = 0, estimatedDurationCount = 0;

  for (const t of tracks) {
    const r = buildTrackReadiness(t);
    if (r.hasDuration) durationCount++;
    else estimatedDurationCount++;
    if (r.hasBpm) bpmCount++;
    if (r.hasKey) keyCount++;
    if (r.hasEnergy) energyCount++;
    if (r.hasFilePath) filePathCount++;
  }

  const n = tracks.length;
  const durationPct = durationCount / n;
  const scoringPct = (bpmCount + keyCount + energyCount) / (n * 3);

  let status: MetadataCoverageStatus;
  if (durationPct >= 0.9 && scoringPct >= 0.9) {
    status = "excellent";
  } else if (durationPct >= 0.5 || scoringPct >= 0.7) {
    status = "usable";
  } else if (n > 0) {
    status = "weak";
  } else {
    status = "blocked";
  }

  return {
    status,
    totalTracks: n,
    durationCount, bpmCount, keyCount,
    energyCount, filePathCount, estimatedDurationCount,
    missingTrackIds: resolvedTrackIds
      ? resolvedTrackIds.filter((id) => !tracks.some((t) => t.trackId === id))
      : [],
  };
}

export function effectiveDuration(track: Track): number {
  return (track.durationSeconds ?? 0) > 0
    ? track.durationSeconds
    : ESTIMATED_DURATION_FALLBACK;
}

export function fmtDurationWithSource(secs: number, source: DurationSource): string {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  const base = `${m}:${String(s).padStart(2, "0")}`;
  return source === "estimated" ? `${base} est` : base;
}

export type MetadataTrustGrade = "excellent" | "usable" | "provisional" | "weak" | "blocked";

export function deriveTrustGrade(summary: MetadataReadinessSummary): MetadataTrustGrade {
  if (summary.totalTracks === 0) return "blocked";

  const n = summary.totalTracks;
  const durationRate = summary.durationCount / n;
  const bpmRate = summary.bpmCount / n;
  const energyRate = summary.energyCount / n;

  if (durationRate === 0 || bpmRate === 0 || energyRate === 0) return "provisional";
  if (durationRate < 0.7 || bpmRate < 0.7 || energyRate < 0.7) return "weak";
  if (durationRate < 0.9 || bpmRate < 0.9 || energyRate < 0.9) return "usable";
  return "excellent";
}

export function trustGradeAllowsNormalScore(grade: MetadataTrustGrade): boolean {
  return grade === "excellent" || grade === "usable";
}
