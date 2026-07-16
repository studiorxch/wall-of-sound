// Analysis trust checks (0705Q)
// Per-track and batch-level trust grading for BPM / key / energy.

import type { Track } from "../data/trackTypes";
import type { AnalysisTrust } from "../data/trackTypes";

export type TrackAnalysisTrust = {
  bpmTrust: AnalysisTrust;
  keyTrust: AnalysisTrust;
  energyTrust: AnalysisTrust;
  warnings: string[];
};

export type BatchAnalysisTrustReport = {
  suspiciousKey: boolean;
  suspiciousKeyReason?: string;
  suspiciousBpm: boolean;
  suspiciousBpmReason?: string;
  dominantKey?: string;
  dominantKeyCount?: number;
  dominantBpm?: number;
  dominantBpmCount?: number;
  totalTracks: number;
};

const VALID_CAMELOT_RE = /^(1[0-2]|[1-9])[AB]$/;
const BPM_SUSPICIOUS_THRESHOLD = 0.80; // fraction sharing same value
const KEY_SUSPICIOUS_THRESHOLD = 0.80;
const LARGE_BATCH = 10;

export function checkTrackAnalysisTrust(track: Track): TrackAnalysisTrust {
  const warnings: string[] = [];

  // BPM trust
  let bpmTrust: AnalysisTrust;
  const bpm = track.bpm ?? 0;
  if (bpm <= 0) {
    bpmTrust = "missing";
  } else if (bpm < 40 || bpm > 220) {
    bpmTrust = "low_confidence";
    warnings.push(`BPM ${bpm} is outside normal range (40–220)`);
  } else {
    const conf = track.audioAnalysis?.bpmConfidence ?? null;
    if (conf !== null && conf < 0.5) {
      bpmTrust = "low_confidence";
      warnings.push(`BPM confidence low (${(conf * 100).toFixed(0)}%)`);
    } else {
      bpmTrust = "trusted";
    }
  }

  // Key trust
  let keyTrust: AnalysisTrust;
  const key = track.camelotKey ?? track.key ?? "";
  if (!key) {
    keyTrust = "missing";
  } else if (!VALID_CAMELOT_RE.test(key)) {
    keyTrust = "low_confidence";
    warnings.push(`Key "${key}" is not a valid Camelot value`);
  } else {
    const conf = track.audioAnalysis?.keyConfidence ?? null;
    if (conf !== null && conf < 0.5) {
      keyTrust = "low_confidence";
      warnings.push(`Key confidence low (${(conf * 100).toFixed(0)}%)`);
    } else {
      keyTrust = "trusted";
    }
  }

  // Energy trust
  let energyTrust: AnalysisTrust;
  const energy = track.energy ?? null;
  if (energy === null || energy === 0) {
    energyTrust = "missing";
  } else if (energy < 0 || energy > 1) {
    energyTrust = "low_confidence";
    warnings.push(`Energy ${energy} is outside 0–1 range`);
  } else {
    energyTrust = "trusted";
  }

  return { bpmTrust, keyTrust, energyTrust, warnings };
}

export function detectBatchAnalysisTrust(tracks: Track[]): BatchAnalysisTrustReport {
  const n = tracks.length;
  const result: BatchAnalysisTrustReport = {
    suspiciousKey: false,
    suspiciousBpm: false,
    totalTracks: n,
  };
  if (n < LARGE_BATCH) return result;

  // Key batch check
  const keyCounts = new Map<string, number>();
  for (const t of tracks) {
    const k = t.camelotKey ?? t.key ?? "";
    if (k) keyCounts.set(k, (keyCounts.get(k) ?? 0) + 1);
  }
  const topKey = [...keyCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topKey) {
    const [key, count] = topKey;
    if (count / n >= KEY_SUSPICIOUS_THRESHOLD) {
      result.suspiciousKey = true;
      result.dominantKey = key;
      result.dominantKeyCount = count;
      result.suspiciousKeyReason = `${count}/${n} tracks share key "${key}" — analysis may have defaulted`;
    }
  }

  // BPM batch check — look for identical rounded BPM
  const bpmCounts = new Map<number, number>();
  for (const t of tracks) {
    const b = Math.round(t.bpm ?? 0);
    if (b > 0) bpmCounts.set(b, (bpmCounts.get(b) ?? 0) + 1);
  }
  const topBpm = [...bpmCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topBpm) {
    const [bpm, count] = topBpm;
    if (count / n >= BPM_SUSPICIOUS_THRESHOLD) {
      result.suspiciousBpm = true;
      result.dominantBpm = bpm;
      result.dominantBpmCount = count;
      result.suspiciousBpmReason = `${count}/${n} tracks share BPM ${bpm} — analysis may have defaulted`;
    }
  }

  return result;
}

export function applyBatchTrustToTrack(
  track: Track,
  batchReport: BatchAnalysisTrustReport,
): Partial<Track> {
  const patch: Partial<Track> = {};
  const per = checkTrackAnalysisTrust(track);
  const warnings = [...per.warnings];

  let keyTrust = per.keyTrust;
  if (batchReport.suspiciousKey && keyTrust !== "missing") {
    keyTrust = "untrusted";
    warnings.push(batchReport.suspiciousKeyReason ?? "Key batch suspicious");
  }

  let bpmTrust = per.bpmTrust;
  if (batchReport.suspiciousBpm && bpmTrust !== "missing") {
    bpmTrust = "untrusted";
    warnings.push(batchReport.suspiciousBpmReason ?? "BPM batch suspicious");
  }

  patch.bpmTrust = bpmTrust;
  patch.keyTrust = keyTrust;
  patch.energyTrust = per.energyTrust;
  if (warnings.length) patch.analysisTrustWarnings = warnings;
  return patch;
}
