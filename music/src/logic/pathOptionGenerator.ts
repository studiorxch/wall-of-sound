import type { Track } from "../data/trackTypes";
import type { PlaylistDuplicateRules } from "../data/playProjectTypes";
import type {
  PlaylistPathOption,
  PathOptionStrategy,
  WarningBreakdown,
  ScoreBreakdown,
} from "../data/playlistPathTypes";
import type { TrackSlot } from "../data/playlistTypes";
import { assignPlaylistToCurve } from "./playlistAssigner";
import { getCamelotPenalty } from "./camelot";

// ── Synthetic curve point sets per strategy ──────────────────────────────────

const STRATEGY_POINTS: Record<PathOptionStrategy, { timePercent: number; energy: number }[]> = {
  best_overall: [
    { timePercent: 0,    energy: 0.45 },
    { timePercent: 0.25, energy: 0.62 },
    { timePercent: 0.55, energy: 0.78 },
    { timePercent: 0.75, energy: 0.82 },
    { timePercent: 1,    energy: 0.52 },
  ],
  lowest_warnings: [
    { timePercent: 0,    energy: 0.50 },
    { timePercent: 0.33, energy: 0.52 },
    { timePercent: 0.66, energy: 0.55 },
    { timePercent: 1,    energy: 0.50 },
  ],
  most_movement: [
    { timePercent: 0,    energy: 0.40 },
    { timePercent: 0.20, energy: 0.82 },
    { timePercent: 0.40, energy: 0.30 },
    { timePercent: 0.60, energy: 0.88 },
    { timePercent: 0.80, energy: 0.38 },
    { timePercent: 1,    energy: 0.65 },
  ],
};

const STRATEGY_NAMES: Record<PathOptionStrategy, string> = {
  best_overall:     "Best Overall",
  lowest_warnings:  "Lowest Warnings",
  most_movement:    "Most Movement",
};

const STRATEGY_EXPLANATIONS: Record<PathOptionStrategy, string> = {
  best_overall:    "Balanced arc — energy builds toward a controlled peak, then resolves. Balances all flow criteria.",
  lowest_warnings: "Smooth and safe — minimal BPM and key jumps, flat energy profile, fewer transition warnings.",
  most_movement:   "Dynamic and contrasting — wave-shaped energy, more risk but more musical excitement.",
};

// ── Warning classifier ────────────────────────────────────────────────────────

function classifyWarning(msg: string): keyof WarningBreakdown {
  const m = msg.toLowerCase();
  if (m.includes("bpm")) return "bpmJump";
  if (m.includes("key")) return "keyRisk";
  if (m.includes("energy")) return "energyJump";
  if (m.includes("empty slot")) return "emptySlot";
  if (m.includes("not found") || m.includes("missing") || m.includes("metadata")) return "missingMetadata";
  return "unknown";
}

function buildWarningBreakdown(slots: TrackSlot[]): WarningBreakdown {
  const b: WarningBreakdown = { bpmJump: 0, keyRisk: 0, energyJump: 0, emptySlot: 0, missingMetadata: 0, unknown: 0 };
  for (const slot of slots) {
    for (const msg of slot.warningMessages ?? []) {
      b[classifyWarning(msg)]++;
    }
  }
  return b;
}

// ── Scorer ────────────────────────────────────────────────────────────────────

function buildScoreBreakdown(
  slots: TrackSlot[],
  tracksById: Map<string, Track>,
  targetDurationSeconds: number,
): ScoreBreakdown & { total: number } {
  const assignedSlots = slots.filter((s) => s.assignedTrackId);
  const tracks = assignedSlots
    .map((s) => tracksById.get(s.assignedTrackId!))
    .filter((t): t is Track => !!t);

  if (tracks.length === 0) {
    return { warnings: 0, durationFit: 0, energyContinuity: 0, keyCompatibility: 0, bpmContinuity: 0, movement: 0, rating: 0, fillRatio: 0, total: 0 };
  }

  const redWarnings = slots.filter((s) => s.warningLevel === "red").length;
  const totalDur = tracks.reduce((s, t) => s + (t.durationSeconds ?? 0), 0);

  // Duration fit
  const durationFitRaw = Math.max(0, 1 - Math.abs(totalDur - targetDurationSeconds) / targetDurationSeconds);

  // BPM continuity
  let bpmPenaltySum = 0;
  for (let i = 1; i < tracks.length; i++) {
    const prev = tracks[i - 1].bpm ?? 0;
    const curr = tracks[i].bpm ?? 0;
    if (prev && curr) bpmPenaltySum += Math.abs(curr - prev) / (prev || 1);
  }
  const bpmContinuityRaw = Math.max(0, 1 - bpmPenaltySum / Math.max(1, tracks.length - 1) / 0.15);

  // Key compatibility
  let keyPenaltySum = 0;
  let keyPairs = 0;
  for (let i = 1; i < tracks.length; i++) {
    const prev = tracks[i - 1].camelotKey;
    const curr = tracks[i].camelotKey;
    if (prev && curr) { keyPenaltySum += getCamelotPenalty(prev, curr) / 40; keyPairs++; }
  }
  const keyCompatibilityRaw = keyPairs ? Math.max(0, 1 - keyPenaltySum / keyPairs) : 0.5;

  // Energy
  const energies = tracks.map((t) => t.energy ?? 0.5);
  const energyRange = Math.max(...energies) - Math.min(...energies);
  let energyJumpSum = 0;
  for (let i = 1; i < energies.length; i++) energyJumpSum += Math.abs(energies[i] - energies[i - 1]);
  const energyContinuityRaw = Math.max(0, 1 - energyJumpSum / Math.max(1, energies.length - 1) / 0.25);

  // Movement
  const movementRaw = Math.min(1, energyRange / 0.35) * Math.max(0, 1 - Math.max(0, energyRange - 0.55) / 0.3);

  // Rating
  const ratedTracks = tracks.filter((t) => (t.rating ?? 0) > 0);
  const avgRating = ratedTracks.length
    ? ratedTracks.reduce((s, t) => s + (t.rating ?? 0), 0) / ratedTracks.length
    : 3;
  const ratingRaw = Math.min(1, avgRating / 5);

  // Fill ratio
  const fillRatioRaw = Math.min(1, assignedSlots.length / Math.max(1, slots.length));

  const warnings     = Math.round((1 - redWarnings / Math.max(1, assignedSlots.length)) * 25);
  const durationFit  = Math.round(durationFitRaw * 15);
  const energyCont   = Math.round(energyContinuityRaw * 15);
  const keyCompat    = Math.round(keyCompatibilityRaw * 15);
  const bpmCont      = Math.round(bpmContinuityRaw * 10);
  const movement     = Math.round(movementRaw * 10);
  const rating       = Math.round(ratingRaw * 5);
  const fillRatio    = Math.round(fillRatioRaw * 5);

  return {
    warnings, durationFit, energyContinuity: energyCont,
    keyCompatibility: keyCompat, bpmContinuity: bpmCont,
    movement, rating, fillRatio,
    total: Math.max(0, Math.min(100,
      warnings + durationFit + energyCont + keyCompat + bpmCont + movement + rating + fillRatio
    )),
  };
}

// ── Improvement hints ─────────────────────────────────────────────────────────

function buildHints(breakdown: WarningBreakdown, scoreBreakdown: ScoreBreakdown, trackCount: number): string[] {
  const hints: string[] = [];
  if (breakdown.missingMetadata > trackCount * 0.3) {
    hints.push("Complete BPM, key, and energy metadata — many warnings stem from missing tag data.");
  }
  if (breakdown.bpmJump > 5) {
    hints.push("Add bridge tracks between contrasting BPM ranges, or try Lowest Warnings for smoother transitions.");
  }
  if (breakdown.keyRisk > 5) {
    hints.push("Add tracks in compatible Camelot keys, or use the Lowest Warnings option for safer key moves.");
  }
  if (breakdown.energyJump > 5) {
    hints.push("Add mid-energy bridge tracks, or try Best Overall for a more gradual energy arc.");
  }
  if (scoreBreakdown.durationFit < 8) {
    hints.push("Adjust target duration or add more tracks in the underrepresented BPM/energy zone.");
  }
  if (hints.length === 0 && breakdown.emptySlot === 0) {
    hints.push("Looking clean — accept this option or compare with others before committing.");
  }
  return hints.slice(0, 3);
}

// ── Derived curve ─────────────────────────────────────────────────────────────

function deriveCurvePoints(tracks: Track[]): { timePercent: number; energy: number }[] {
  if (tracks.length === 0) return [];
  if (tracks.length === 1) return [{ timePercent: 0.5, energy: tracks[0].energy ?? 0.5 }];
  const COUNT = Math.min(8, tracks.length);
  return Array.from({ length: COUNT }, (_, i) => {
    const trackIdx = Math.round((i / (COUNT - 1)) * (tracks.length - 1));
    const lo = Math.max(0, trackIdx - 1);
    const hi = Math.min(tracks.length - 1, trackIdx + 1);
    const energy = ((tracks[lo].energy ?? 0.5) + (tracks[trackIdx].energy ?? 0.5) + (tracks[hi].energy ?? 0.5)) / 3;
    return { timePercent: i / (COUNT - 1), energy: Math.round(energy * 100) / 100 };
  });
}

// ── Curve builder ─────────────────────────────────────────────────────────────

function buildSyntheticCurve(strategy: PathOptionStrategy, targetDurationSeconds: number) {
  const pts = STRATEGY_POINTS[strategy];
  return {
    curveId: `synth_${strategy}`,
    name: STRATEGY_NAMES[strategy],
    presetType: "elegant_nested_arc" as const,
    targetDurationSeconds,
    points: pts.map((p, i) => ({ pointId: `p${i}`, timePercent: p.timePercent, energy: p.energy })),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export function generatePlaylistPathOptions(params: {
  cratePoolTracks: Track[];
  excludedTrackIds: string[];
  targetDurationSeconds: number;
  locks?: import("../data/playlistTypes").TrackLock[];
  duplicateRules?: PlaylistDuplicateRules;
  crateUsageMap?: Map<string, string[]>;
  metadataRevision?: string;
  metadataSnapshot?: import("../data/playlistPathTypes").PlaylistGenerationMetadataSnapshot;
}): PlaylistPathOption[] {
  const { cratePoolTracks, excludedTrackIds, targetDurationSeconds, locks = [], duplicateRules, crateUsageMap = new Map(), metadataRevision, metadataSnapshot } = params;
  if (cratePoolTracks.length === 0) return [];

  const tracksById = new Map(cratePoolTracks.map((t) => [t.trackId, t]));
  const strategies: PathOptionStrategy[] = ["best_overall", "lowest_warnings", "most_movement"];
  const options: PlaylistPathOption[] = [];
  const seenOrderings = new Set<string>();

  for (const strategy of strategies) {
    const curve = buildSyntheticCurve(strategy, targetDurationSeconds);
    const { slots } = assignPlaylistToCurve({
      tracks: cratePoolTracks,
      curve,
      locks,
      excludedTrackIds,
      targetDurationSeconds,
      duplicateRules,
    });

    const assignedSlots = slots.filter((s) => s.assignedTrackId);
    const trackIds = assignedSlots.map((s) => s.assignedTrackId!);

    const fingerprint = trackIds.slice(0, 6).join(",");
    if (seenOrderings.has(fingerprint)) continue;
    seenOrderings.add(fingerprint);

    const tracks = trackIds.map((id) => tracksById.get(id)).filter((t): t is Track => !!t);
    const totalDuration = tracks.reduce((s, t) => s + (t.durationSeconds ?? 0), 0);

    const warningBreakdown = buildWarningBreakdown(slots);
    const { total: score, ...scoreBreakdownRaw } = buildScoreBreakdown(slots, tracksById, targetDurationSeconds);
    const { total: _total, ...scoreBreakdown } = { total: score, ...scoreBreakdownRaw };
    const improvementHints = buildHints(warningBreakdown, scoreBreakdown, tracks.length);

    const crateUsage: Record<string, number> = {};
    for (const [crateId, crateTrackIds] of crateUsageMap) {
      const crateSet = new Set(crateTrackIds);
      crateUsage[crateId] = trackIds.filter((id) => crateSet.has(id)).length;
    }

    const energies = tracks.map((t) => t.energy ?? 0.5);
    const avgEnergy = energies.length ? energies.reduce((s, e) => s + e, 0) / energies.length : 0.5;
    const energyRange = energies.length ? Math.max(...energies) - Math.min(...energies) : 0;
    const bpms = tracks.map((t) => t.bpm ?? 0).filter(Boolean);

    options.push({
      id: `opt_${strategy}_${Date.now().toString(36)}`,
      name: STRATEGY_NAMES[strategy],
      strategy,
      createdAt: new Date().toISOString(),
      trackIds,
      durationSeconds: totalDuration,
      score,
      stats: {
        redWarnings: slots.filter((s) => s.warningLevel === "red").length,
        yellowWarnings: slots.filter((s) => s.warningLevel === "yellow").length,
        warningBreakdown,
        scoreBreakdown,
        improvementHints,
        bpmMin: bpms.length ? Math.min(...bpms) : 0,
        bpmMax: bpms.length ? Math.max(...bpms) : 0,
        avgEnergy,
        energyRange,
        keyCompatibilityScore: scoreBreakdown.keyCompatibility / 15,
        movementScore: scoreBreakdown.movement / 10,
        durationFitScore: scoreBreakdown.durationFit / 15,
        crateUsage,
      },
      derivedCurvePoints: deriveCurvePoints(tracks),
      explanation: STRATEGY_EXPLANATIONS[strategy],
      metadataRevision,
      metadataSnapshot,
    });
  }

  return options.sort((a, b) => b.score - a.score);
}
