import type { Track } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type {
  PlaylistArcSection,
  PlaylistArcConfig,
  PlaylistEnergyTarget,
  PlaylistTransitionIntent,
  PlaylistSectionWeightMode,
} from "../data/playlistArcTypes";
import { ENERGY_TARGET_RANGES, SECTION_ENERGY_DIRECTION } from "../data/playlistArcTypes";
import { getCamelotPenalty } from "./camelot";
import { createPlaylistDuplicateGuard, filterDuplicateCandidates, markTrackUsed } from "../lib/playlistDuplicateGuard";

const FALLBACK_AVG_TRACK_SECONDS = 180;

// ---------------------------------------------------------------------------
// Crate matching
// ---------------------------------------------------------------------------

// Reads suggestedMood / mechanism / grouping (may be array) from runtime track objects
// that come from external library.index.json and aren't in the TypeScript Track type.
function getExtraStringArray(t: Track, key: string): string[] {
  const val = (t as Record<string, unknown>)[key];
  if (!val) return [];
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === "string") return [val];
  return [];
}

/** True if `crateValue` appears in any mood/grouping/genre field of the track. */
export function trackMatchesCrate(t: Track, crateValue: string): boolean {
  if (!crateValue.trim()) return false;
  const v = crateValue.toLowerCase().trim();

  // Confirmed mood tags
  if ((t.moodTags ?? []).some((m) => m.toLowerCase() === v)) return true;
  // MUSIC-generated suggestions (moodSuggestions)
  if ((t.moodSuggestions ?? []).some((m) => m.toLowerCase() === v)) return true;
  // Primary mood
  if ((t.primaryMood ?? "").toLowerCase() === v) return true;
  // External suggestedMood array
  if (getExtraStringArray(t, "suggestedMood").some((m) => m.toLowerCase() === v)) return true;
  // External mechanism array
  if (getExtraStringArray(t, "mechanism").some((m) => m.toLowerCase() === v)) return true;
  // Grouping — may be string or array at runtime
  const groupingArr = getExtraStringArray(t, "grouping");
  if (groupingArr.some((g) => g.toLowerCase() === v)) return true;
  if (typeof t.grouping === "string" && t.grouping.toLowerCase() === v) return true;
  // Genre
  if ((t.genre ?? "").toLowerCase() === v) return true;
  if ((t.genres ?? []).some((g) => g.toLowerCase() === v)) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Distinct crate values from library (for the UI selector)
// ---------------------------------------------------------------------------

export function collectDistinctCrateValues(tracks: Track[]): string[] {
  const seen = new Set<string>();
  for (const t of tracks) {
    for (const m of t.moodTags ?? []) seen.add(m);
    for (const m of t.moodSuggestions ?? []) seen.add(m);
    if (t.primaryMood) seen.add(t.primaryMood);
    for (const m of getExtraStringArray(t, "suggestedMood")) seen.add(m);
    for (const m of getExtraStringArray(t, "mechanism")) seen.add(m);
    for (const g of getExtraStringArray(t, "grouping")) seen.add(g);
    if (typeof t.grouping === "string" && t.grouping) seen.add(t.grouping);
    if (t.genre) seen.add(t.genre);
    for (const g of t.genres ?? []) seen.add(g);
  }
  return [...seen].filter(Boolean).sort();
}

// ---------------------------------------------------------------------------
// Section target count calculation (spec §Step 1)
// ---------------------------------------------------------------------------

export function calcSectionCounts(totalTracks: number, sections: PlaylistArcSection[]): number[] {
  const floored = sections.map((s) => Math.floor(s.weight * totalTracks));
  const remainders = sections.map((s) => s.weight * totalTracks - Math.floor(s.weight * totalTracks));
  const floredSum = floored.reduce((a, b) => a + b, 0);
  let remaining = totalTracks - floredSum;

  // Assign extra tracks to sections with largest fractional remainders
  const order = sections
    .map((_, i) => i)
    .sort((a, b) => remainders[b] - remainders[a]);

  const counts = [...floored];
  for (let i = 0; i < remaining && i < order.length; i++) {
    counts[order[i]]++;
  }

  // Guarantee at least 1 per section if possible
  for (let i = 0; i < counts.length && remaining > 0; i++) {
    if (counts[i] === 0) {
      counts[i] = 1;
      remaining--;
    }
  }

  return counts;
}

// ---------------------------------------------------------------------------
// Section budget resolution (0711_MUSIC_Playlist_Section_Budget_Modes)
// ---------------------------------------------------------------------------
//
// Resolution order (mixed-mode sections in one playlist):
//   1. track_count sections — exact requested count (capped to eligible pool)
//   2. duration sections — estimated count from target minutes / avg track length
//   3. percent sections — split whatever track-count budget remains, proportionally
// This mirrors calcSectionCounts' remainder-based rounding, but only across the
// percent subset and only against the leftover budget once fixed sections are removed.

export type ResolvedSectionBudget = {
  sectionId: string;
  sectionLabel: string;
  mode: PlaylistSectionWeightMode;
  targetTrackCount: number;
  targetDurationSeconds?: number;
  warnings: string[];
};

function avgTrackDuration(pool: Track[], globalAvgDurationSeconds?: number): { avg: number; usedFallback: boolean } {
  const withDur = pool.map((t) => t.durationSeconds).filter((d): d is number => !!d && d > 0);
  if (withDur.length > 0) return { avg: withDur.reduce((a, b) => a + b, 0) / withDur.length, usedFallback: false };
  if (globalAvgDurationSeconds && globalAvgDurationSeconds > 0) return { avg: globalAvgDurationSeconds, usedFallback: true };
  return { avg: FALLBACK_AVG_TRACK_SECONDS, usedFallback: true };
}

export function resolveSectionBudgets(params: {
  sections: PlaylistArcSection[];
  targetTrackCount: number;
  targetDurationSeconds?: number;
  poolsBySectionId: Map<string, Track[]>;
  globalAvgDurationSeconds?: number;
}): ResolvedSectionBudget[] {
  const { sections, targetTrackCount, targetDurationSeconds, poolsBySectionId, globalAvgDurationSeconds } = params;
  const modeOf = (s: PlaylistArcSection): PlaylistSectionWeightMode => s.weightMode ?? "percent";
  const bySectionId = new Map<string, ResolvedSectionBudget>();

  let usedFixedCount = 0;
  let usedFixedDurationSeconds = 0;

  // Pass 1 — track_count (exact request, capped to what's actually available)
  for (const s of sections.filter((s) => modeOf(s) === "track_count")) {
    const requested = Math.max(0, Math.round(s.trackCount ?? 0));
    const pool = poolsBySectionId.get(s.id) ?? [];
    const warnings: string[] = [];
    if (pool.length < requested) {
      warnings.push(`Track-count section "${s.label}" requested ${requested} tracks but only ${pool.length} eligible tracks exist.`);
    }
    const resolved = Math.min(requested, pool.length);
    bySectionId.set(s.id, { sectionId: s.id, sectionLabel: s.label, mode: "track_count", targetTrackCount: resolved, warnings });
    usedFixedCount += resolved;
  }

  // Pass 2 — duration (estimate count from target minutes ÷ avg track length)
  for (const s of sections.filter((s) => modeOf(s) === "duration")) {
    const targetSecs = Math.max(0, (s.durationMinutes ?? 0) * 60);
    const pool = poolsBySectionId.get(s.id) ?? [];
    const { avg, usedFallback } = avgTrackDuration(pool, globalAvgDurationSeconds);
    const warnings: string[] = [];
    if (usedFallback) warnings.push(`Duration mode used fallback average track length for section "${s.label}".`);
    const estCount = avg > 0 ? Math.max(1, Math.ceil(targetSecs / avg)) : 1;
    const resolved = Math.min(estCount, pool.length);
    if (resolved < estCount) {
      warnings.push(`Section "${s.label}" only has ${pool.length} eligible tracks for a ~${estCount}-track duration target.`);
    }
    bySectionId.set(s.id, { sectionId: s.id, sectionLabel: s.label, mode: "duration", targetTrackCount: resolved, targetDurationSeconds: targetSecs, warnings });
    usedFixedCount += resolved;
    usedFixedDurationSeconds += targetSecs;
  }

  // Pass 3 — percent sections split the remaining track-count budget
  const percentSections = sections.filter((s) => modeOf(s) === "percent");
  const remainingBudget = Math.max(0, targetTrackCount - usedFixedCount);
  const totalPercentWeight = percentSections.reduce((sum, s) => sum + s.weight, 0) || 1;
  const floored = percentSections.map((s) => Math.floor((s.weight / totalPercentWeight) * remainingBudget));
  const remainders = percentSections.map(
    (s, i) => (s.weight / totalPercentWeight) * remainingBudget - floored[i],
  );
  const flooredSum = floored.reduce((a, b) => a + b, 0);
  let remainder = remainingBudget - flooredSum;
  const order = percentSections.map((_, i) => i).sort((a, b) => remainders[b] - remainders[a]);
  const counts = [...floored];
  for (let i = 0; i < remainder && i < order.length; i++) counts[order[i]]++;

  percentSections.forEach((s, i) => {
    bySectionId.set(s.id, { sectionId: s.id, sectionLabel: s.label, mode: "percent", targetTrackCount: counts[i], warnings: [] });
  });

  // Fixed-exceeds-target warning attached to the first section so it surfaces once.
  const exceedsCount = usedFixedCount > targetTrackCount;
  const exceedsDuration = targetDurationSeconds != null && usedFixedDurationSeconds > targetDurationSeconds;
  if ((exceedsCount || exceedsDuration) && sections.length > 0) {
    const first = bySectionId.get(sections[0].id);
    if (first) first.warnings = [...first.warnings, "Fixed section budgets exceed playlist target."];
  }

  return sections.map((s) => bySectionId.get(s.id)!).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Nested Middle sub-section flattening (0711_MUSIC_Nested_Middle_Section_Generator)
// ---------------------------------------------------------------------------
//
// Only top-level sections may have children, and only one level deep. A
// top-level section with enabled children becomes a budget-only container —
// its own budget is resolved and then split across its enabled children,
// but the parent itself is never a generation leaf (no empty "Middle"
// divider, no candidate selection against the parent section directly).

export type ResolvedArcLeafSection = {
  id: string;
  label: string;
  parentId?: string;
  parentLabel?: string;
  sectionIndex: number;
  sourceSection: PlaylistArcSection;
  targetTrackCount: number;
  targetDurationSeconds?: number;
};

export function resolveArcLeafSections(params: {
  sections: PlaylistArcSection[];
  targetTrackCount: number;
  targetDurationSeconds?: number;
  candidatePoolsBySectionId: Map<string, Track[]>;
  globalAvgDurationSeconds?: number;
}): { leaves: ResolvedArcLeafSection[]; warnings: string[] } {
  const { sections, targetTrackCount, targetDurationSeconds, candidatePoolsBySectionId, globalAvgDurationSeconds } = params;
  const warnings: string[] = [];

  const topBudgets = resolveSectionBudgets({
    sections,
    targetTrackCount,
    targetDurationSeconds,
    poolsBySectionId: candidatePoolsBySectionId,
    globalAvgDurationSeconds,
  });
  const topBudgetById = new Map(topBudgets.map((b) => [b.sectionId, b]));

  const leaves: ResolvedArcLeafSection[] = [];
  let sectionIndex = 0;

  for (const sec of sections) {
    const budget = topBudgetById.get(sec.id);
    if (!budget) continue;
    warnings.push(...budget.warnings);

    const allChildren = sec.children ?? [];
    const enabledChildren = allChildren.filter((c) => c.enabled !== false);

    if (allChildren.length > 0 && enabledChildren.length === 0) {
      warnings.push(`"${sec.label}" has children but all are disabled — generating from "${sec.label}" directly.`);
    }

    if (enabledChildren.length === 0) {
      leaves.push({
        id: sec.id,
        label: sec.label,
        sectionIndex: sectionIndex++,
        sourceSection: sec,
        targetTrackCount: budget.targetTrackCount,
        targetDurationSeconds: budget.targetDurationSeconds,
      });
      continue;
    }

    // Weight-sanity checks scoped to this parent's children (percent-mode only).
    const percentChildren = enabledChildren.filter((c) => (c.weightMode ?? "percent") === "percent");
    if (percentChildren.length > 0) {
      const totalWeight = percentChildren.reduce((s, c) => s + c.weight, 0);
      if (totalWeight <= 0) {
        warnings.push(`"${sec.label}" children total 0% — falling back to equal split.`);
      } else if (totalWeight > 1.5) {
        warnings.push(`"${sec.label}" child weights (${Math.round(totalWeight * 100)}%) exceed 100% — proportions will be normalized.`);
      }
    }

    const childBudgets = resolveSectionBudgets({
      sections: enabledChildren,
      targetTrackCount: budget.targetTrackCount,
      targetDurationSeconds: budget.targetDurationSeconds,
      poolsBySectionId: candidatePoolsBySectionId,
      globalAvgDurationSeconds,
    });
    const childBudgetById = new Map(childBudgets.map((b) => [b.sectionId, b]));

    const usedFixedChildCount = enabledChildren
      .filter((c) => (c.weightMode ?? "percent") !== "percent")
      .reduce((s, c) => s + (childBudgetById.get(c.id)?.targetTrackCount ?? 0), 0);
    if (usedFixedChildCount > budget.targetTrackCount) {
      warnings.push(`"${sec.label}" child track counts (${usedFixedChildCount}) exceed "${sec.label}"'s own target (${budget.targetTrackCount}).`);
    }
    const usedFixedChildDuration = enabledChildren
      .filter((c) => (c.weightMode ?? "percent") === "duration")
      .reduce((s, c) => s + Math.max(0, (c.durationMinutes ?? 0) * 60), 0);
    if (budget.targetDurationSeconds != null && usedFixedChildDuration > budget.targetDurationSeconds) {
      warnings.push(`"${sec.label}" child duration budgets exceed "${sec.label}"'s own duration target.`);
    }

    for (const child of enabledChildren) {
      const cb = childBudgetById.get(child.id);
      if (!cb) continue;
      warnings.push(...cb.warnings);
      leaves.push({
        id: child.id,
        label: child.label,
        parentId: sec.id,
        parentLabel: sec.label,
        sectionIndex: sectionIndex++,
        sourceSection: child,
        targetTrackCount: cb.targetTrackCount,
        targetDurationSeconds: cb.targetDurationSeconds,
      });
    }
  }

  return { leaves, warnings };
}

// ---------------------------------------------------------------------------
// Energy filtering
// ---------------------------------------------------------------------------

function energyScore(track: Track, target: PlaylistEnergyTarget): number {
  if (target === "auto") return 0;
  const [lo, hi] = ENERGY_TARGET_RANGES[target];
  const e = track.energy ?? 0;
  if (e >= lo && e <= hi) return 0;
  return Math.min(Math.abs(e - lo), Math.abs(e - hi));
}

// ---------------------------------------------------------------------------
// Candidate pool selection per section (spec §Step 2)
// ---------------------------------------------------------------------------

export function selectCandidatesForSection(
  allTracks: Track[],
  section: PlaylistArcSection,
  usedTrackIds: Set<string>,
): Track[] {
  // A blank primary crate means "no filter" — pull from the whole eligible pool
  // (this is what describeArcConfigWarnings tells the user will happen), not zero
  // candidates. trackMatchesCrate() itself always returns false for an empty
  // crateValue, so that fallback has to happen here.
  const primary = section.primaryCrate.trim()
    ? allTracks.filter((t) => !usedTrackIds.has(t.trackId) && trackMatchesCrate(t, section.primaryCrate))
    : allTracks.filter((t) => !usedTrackIds.has(t.trackId));
  const secondary = section.secondaryCrate
    ? allTracks.filter(
        (t) =>
          !usedTrackIds.has(t.trackId) &&
          !primary.some((p) => p.trackId === t.trackId) &&
          trackMatchesCrate(t, section.secondaryCrate!)
      )
    : [];

  const blend = section.crateBlend ?? 1.0;

  // Build combined pool with energy scoring
  const score = (t: Track) => energyScore(t, section.energyTarget);
  const sortedPrimary = [...primary].sort((a, b) => score(a) - score(b));
  const sortedSecondary = [...secondary].sort((a, b) => score(a) - score(b));

  // Interleave based on blend ratio
  const pool: Track[] = [];
  let pi = 0, si = 0;
  while (pi < sortedPrimary.length || si < sortedSecondary.length) {
    const pFrac = pool.length === 0 ? 1 : (pool.filter((t) => primary.some((p) => p.trackId === t.trackId)).length / pool.length);
    const wantPrimary = sortedSecondary.length === 0 || (pFrac < blend && pi < sortedPrimary.length);
    if (wantPrimary && pi < sortedPrimary.length) {
      pool.push(sortedPrimary[pi++]);
    } else if (si < sortedSecondary.length) {
      pool.push(sortedSecondary[si++]);
    } else {
      pool.push(sortedPrimary[pi++]);
    }
  }

  return pool;
}

// ---------------------------------------------------------------------------
// Duration-budget selection — keep adding ordered tracks until the target
// duration is met or slightly exceeded. Never cuts a track mid-way.
// ---------------------------------------------------------------------------

export function selectTracksForDurationBudget(pool: Track[], targetDurationSeconds: number): Track[] {
  if (targetDurationSeconds <= 0) return [];
  const picked: Track[] = [];
  let total = 0;
  for (const t of pool) {
    if (total >= targetDurationSeconds) break;
    picked.push(t);
    total += t.durationSeconds ?? 0;
  }
  return picked;
}

// ---------------------------------------------------------------------------
// Within-section track ordering (spec §Step 3)
// ---------------------------------------------------------------------------

export function orderSectionTracks(tracks: Track[], sectionName: PlaylistArcSection["name"]): Track[] {
  const dir = SECTION_ENERGY_DIRECTION[sectionName];
  const sorted = [...tracks];
  if (dir === "ascending") {
    sorted.sort((a, b) => (a.energy ?? 0) - (b.energy ?? 0));
  } else if (dir === "descending") {
    sorted.sort((a, b) => (b.energy ?? 0) - (a.energy ?? 0));
  } else if (dir === "lift") {
    // Start mid-energy, push higher toward end
    const avg = sorted.reduce((s, t) => s + (t.energy ?? 0), 0) / (sorted.length || 1);
    sorted.sort((a, b) => {
      const da = Math.abs((a.energy ?? 0) - avg);
      const db = Math.abs((b.energy ?? 0) - avg);
      return da - db;
    });
  }
  // "stable" — no sort change
  return sorted;
}

// ---------------------------------------------------------------------------
// Transition scoring (spec §Stitch Sections)
// ---------------------------------------------------------------------------

export function scoreTransition(
  lastTrack: Track | undefined,
  nextTrack: Track,
  intent: PlaylistTransitionIntent,
): number {
  if (!lastTrack || intent === "auto") return 0;

  const bpmDelta = Math.abs((lastTrack.bpm ?? 120) - (nextTrack.bpm ?? 120));
  const energyDelta = (nextTrack.energy ?? 0) - (lastTrack.energy ?? 0);
  const camelotPenalty = getCamelotPenalty(lastTrack.camelotKey ?? "", nextTrack.camelotKey ?? "");

  let penalty = 0;

  switch (intent) {
    case "smooth":
      penalty += bpmDelta * 0.8;
      penalty += Math.abs(energyDelta) * 20;
      penalty += camelotPenalty * 0.5;
      break;
    case "deepen":
      // Reward lower energy / deeper next track
      penalty += bpmDelta * 0.3;
      if (energyDelta > 0.1) penalty += energyDelta * 15; // going up = bad
      break;
    case "lift":
      // Reward modest energy increase
      if (energyDelta < 0) penalty += Math.abs(energyDelta) * 20; // going down = bad
      penalty += bpmDelta * 0.3;
      break;
    case "contrast":
      // Large delta is fine — penalize only extreme BPM jumps
      penalty += Math.max(0, bpmDelta - 20) * 0.3;
      break;
    case "reset":
      // Reward lower energy, penalize high-energy next track
      if (energyDelta > 0.05) penalty += energyDelta * 25;
      break;
    case "exit":
      // Reward lower energy, stable BPM
      if (energyDelta > 0) penalty += energyDelta * 30;
      penalty += bpmDelta * 0.4;
      break;
  }

  return penalty;
}

// ---------------------------------------------------------------------------
// Arc scoring metrics (spec §Scoring Additions)
// ---------------------------------------------------------------------------

export interface ArcScoreResult {
  moodArcScore: number;
  sectionTargetScore: number;
  transitionIntentScore: number;
  crateDistributionScore: number;
  energyArcScore: number;
  total: number;
}

export interface SectionAssignment {
  sectionId: string;
  sectionLabel: string;
  parentSectionId?: string;
  parentSectionLabel?: string;
  tracks: Track[];
  targetCount: number;
  warning?: string;
}

/** All top-level sections plus their (one-level-deep) children, flattened for lookup. */
function flattenAllSections(sections: PlaylistArcSection[]): PlaylistArcSection[] {
  return sections.flatMap((s) => [s, ...(s.children ?? [])]);
}

export function scoreArc(
  assignments: SectionAssignment[],
  config: PlaylistArcConfig,
): ArcScoreResult {
  const sections = flattenAllSections(config.sections);

  // sectionTargetScore: fraction of sections that met their target count
  const sectionTargetScore =
    assignments.filter((a) => a.tracks.length >= a.targetCount).length /
    (assignments.length || 1);

  // crateDistributionScore: fraction of tracks in each section that match their crate
  let crateMatchCount = 0, crateTotal = 0;
  assignments.forEach((a) => {
    const sec = sections.find((s) => s.id === a.sectionId);
    if (!sec) return;
    a.tracks.forEach((t) => {
      crateTotal++;
      if (trackMatchesCrate(t, sec.primaryCrate) ||
          (sec.secondaryCrate && trackMatchesCrate(t, sec.secondaryCrate))) {
        crateMatchCount++;
      }
    });
  });
  const crateDistributionScore = crateTotal > 0 ? crateMatchCount / crateTotal : 1;

  // energyArcScore: check energy direction per section
  let arcOk = 0;
  assignments.forEach((a) => {
    const sec = sections.find((s) => s.id === a.sectionId);
    if (!sec || a.tracks.length < 2) { arcOk++; return; }
    const dir = SECTION_ENERGY_DIRECTION[sec.name];
    const energies = a.tracks.map((t) => t.energy ?? 0);
    const first = energies[0], last = energies[energies.length - 1];
    if (dir === "ascending" && last >= first) arcOk++;
    else if (dir === "descending" && last <= first) arcOk++;
    else if (dir === "lift") arcOk++;
    else if (dir === "stable") arcOk++;
    else arcOk += 0.5;
  });
  const energyArcScore = arcOk / (assignments.length || 1);

  // transitionIntentScore: penalize bad section-boundary transitions
  let transitionScore = 1;
  for (let i = 0; i + 1 < assignments.length; i++) {
    const lastTrack = assignments[i].tracks[assignments[i].tracks.length - 1];
    const nextTrack = assignments[i + 1].tracks[0];
    const intent = sections.find((s) => s.id === assignments[i].sectionId)?.transitionIntent ?? "auto";
    if (lastTrack && nextTrack) {
      const penalty = scoreTransition(lastTrack, nextTrack, intent);
      transitionScore -= Math.min(0.2, penalty / 100);
    }
  }
  transitionScore = Math.max(0, transitionScore);

  // moodArcScore: rough structural adherence (sections filled in order)
  const filledSections = assignments.filter((a) => a.tracks.length > 0).length;
  const moodArcScore = filledSections / (assignments.length || 1);

  const total =
    moodArcScore * 0.25 +
    sectionTargetScore * 0.25 +
    transitionScore * 0.20 +
    crateDistributionScore * 0.20 +
    energyArcScore * 0.10;

  return {
    moodArcScore,
    sectionTargetScore,
    transitionIntentScore: transitionScore,
    crateDistributionScore,
    energyArcScore,
    total,
  };
}

// ---------------------------------------------------------------------------
// Full arc playlist build (spec §Generation Behavior)
// ---------------------------------------------------------------------------

export interface ArcBuildResult {
  tracks: Track[];
  assignments: SectionAssignment[];
  score: ArcScoreResult;
  warnings: string[];
  log: string;
}

export function buildArcPlaylist(params: {
  libraryTracks: Track[];
  config: PlaylistArcConfig;
  totalTrackCount: number;
  targetDurationSeconds?: number;
}): ArcBuildResult {
  const { libraryTracks, config, totalTrackCount, targetDurationSeconds } = params;
  // Duplicate guard (0711_MUSIC_Playlist_Duplicate_Track_Guard): one guard for
  // the whole run, not per section/leaf — a track pulled by an earlier
  // section via any overlapping crate can never be picked again later.
  const guard = createPlaylistDuplicateGuard();
  const usedIds = guard.usedTrackIds;
  const assignments: SectionAssignment[] = [];
  const warnings: string[] = [];
  const logLines: string[] = [];

  // Only use playable tracks (linked audio or objectUrl). Codec/playback safety
  // is already enforced upstream — libraryTracks arriving here has already been
  // gated by gatePlaylistCandidates()/partitionEligibleTracks() at the call site.
  const eligible = libraryTracks.filter(
    (t) => t.sourceOwner !== "reference" && (t.audioLinked || t.objectUrl)
  );

  // Global average track duration — fallback reference for duration-mode
  // sections whose own candidate pool has no duration data at all.
  const globalDurations = eligible.map((t) => t.durationSeconds).filter((d): d is number => !!d && d > 0);
  const globalAvgDurationSeconds = globalDurations.length > 0
    ? globalDurations.reduce((a, b) => a + b, 0) / globalDurations.length
    : undefined;

  // Preliminary per-section pools (no cross-section exclusion yet) — used only
  // to resolve budgets (estimate durations / check availability) before the
  // real sequential assignment pass below applies usedIds exclusion. Covers
  // both top-level sections and their children (flattened).
  const allSections = flattenAllSections(config.sections);
  const preliminaryPools = new Map<string, Track[]>();
  for (const sec of allSections) {
    preliminaryPools.set(sec.id, selectCandidatesForSection(eligible, sec, new Set()));
  }

  const { leaves, warnings: budgetWarnings } = resolveArcLeafSections({
    sections: config.sections,
    targetTrackCount: totalTrackCount,
    targetDurationSeconds,
    candidatePoolsBySectionId: preliminaryPools,
    globalAvgDurationSeconds,
  });
  warnings.push(...budgetWarnings);

  logLines.push(`Arc mode: ${config.mode}`);
  logLines.push(`Target tracks: ${totalTrackCount}`);
  logLines.push("");

  for (const leaf of leaves) {
    const sec = leaf.sourceSection;
    const targetCount = leaf.targetTrackCount;
    const mode = sec.weightMode ?? "percent";

    // Candidate fallback (spec §Candidate Pool Rules): child-specific pool →
    // parent's own pool → the whole crate-scoped eligible pool. Each step only
    // runs if the previous one came up short, and each widening is reported.
    let pool = filterDuplicateCandidates(selectCandidatesForSection(eligible, sec, usedIds), guard);
    let usedFallback: string | undefined;
    if (pool.length === 0 && leaf.parentId) {
      const parentSection = config.sections.find((s) => s.id === leaf.parentId);
      if (parentSection) {
        const parentPool = filterDuplicateCandidates(selectCandidatesForSection(eligible, parentSection, usedIds), guard);
        if (parentPool.length > 0) {
          pool = parentPool;
          usedFallback = `"${leaf.label}" had no direct matches. Used broader "${parentSection.label}" pool.`;
        }
      }
    }
    if (pool.length === 0) {
      pool = filterDuplicateCandidates(eligible.filter((t) => !usedIds.has(t.trackId)), guard);
      if (pool.length > 0) {
        usedFallback = `"${leaf.label}" had no direct matches. Used broader eligible pool.`;
      }
    }
    if (usedFallback) warnings.push(usedFallback);

    let picked: Track[];
    if (mode === "duration" && leaf.targetDurationSeconds != null) {
      picked = selectTracksForDurationBudget(pool, leaf.targetDurationSeconds);
    } else if (pool.length >= targetCount) {
      picked = pool.slice(0, targetCount);
    } else {
      picked = pool;
      if (targetCount > 0 && pool.length < targetCount) {
        warnings.push(`Section "${leaf.label}" only has ${pool.length} eligible tracks for a ${targetCount}-track section.`);
      }
    }

    const ordered = orderSectionTracks(picked, sec.name);
    for (const t of ordered) markTrackUsed(t, guard);

    const pickedDurationSeconds = ordered.reduce((s, t) => s + (t.durationSeconds ?? 0), 0);

    assignments.push({
      sectionId: leaf.id,
      sectionLabel: leaf.label,
      parentSectionId: leaf.parentId,
      parentSectionLabel: leaf.parentLabel,
      tracks: ordered,
      targetCount,
      warning: usedFallback,
    });

    const primaryLabel = sec.primaryCrate
      ? `${sec.primaryCrate}${sec.crateBlend ? ` ${Math.round(sec.crateBlend * 100)}%` : ""}`
      : "any";
    const secondaryLabel = sec.secondaryCrate
      ? `, ${sec.secondaryCrate} ${Math.round((1 - (sec.crateBlend ?? 1)) * 100)}%`
      : "";
    logLines.push(`${leaf.parentLabel ? `${leaf.parentLabel} → ${leaf.label}` : leaf.label}:`);
    logLines.push(`  Mode: ${mode}`);
    logLines.push(`  Target: ${targetCount}${leaf.targetDurationSeconds ? ` (~${Math.round(leaf.targetDurationSeconds / 60)} min)` : ""}`);
    logLines.push(`  Crates: ${primaryLabel}${secondaryLabel}`);
    logLines.push(`  Selected: ${ordered.length}${mode === "duration" ? ` (${Math.round(pickedDurationSeconds / 60)} min)` : ""}`);
    if (mode !== "duration" && ordered.length < targetCount) {
      logLines.push(`  ⚠ Short by ${targetCount - ordered.length} — check crate size`);
    }
    logLines.push("");
  }

  const allTracks = assignments.flatMap((a) => a.tracks);
  const score = scoreArc(assignments, config);

  logLines.push(`Warnings: ${warnings.length === 0 ? "none" : warnings.join("; ")}`);

  return { tracks: allTracks, assignments, score, warnings, log: logLines.join("\n") };
}

// ---------------------------------------------------------------------------
// Slot construction with section metadata (0711 — section restore)
// ---------------------------------------------------------------------------

/** Builds TrackSlots from an ArcBuildResult, tagging each slot with its section origin. */
export function buildSlotsFromArcResult(result: ArcBuildResult): TrackSlot[] {
  const slots: TrackSlot[] = [];
  let cumulativeTime = 0;
  let slotIndex = 0;
  result.assignments.forEach((a, sectionIndex) => {
    for (const t of a.tracks) {
      slots.push({
        slotId: `slot_${slotIndex}`,
        slotIndex,
        startTimeSeconds: cumulativeTime,
        targetEnergy: t.energy ?? 0.5,
        targetBpm: t.bpm ?? 120,
        assignedTrackId: t.trackId,
        warningLevel: "none",
        warningMessages: [],
        sectionId: a.sectionId,
        sectionLabel: a.sectionLabel,
        sectionIndex,
        parentSectionId: a.parentSectionId,
        parentSectionLabel: a.parentSectionLabel,
      });
      cumulativeTime += t.durationSeconds ?? 0;
      slotIndex++;
    }
  });
  return slots;
}

/** Weight-sum / config sanity warnings, shown before generation runs. */
export function describeArcConfigWarnings(config: PlaylistArcConfig): string[] {
  if (config.mode === "none") return [];
  const warnings: string[] = [];
  // Weight-sum check only applies to percent-mode sections — duration/track_count
  // sections don't participate in the percent split at all.
  const percentSections = config.sections.filter((s) => (s.weightMode ?? "percent") === "percent");
  if (percentSections.length > 0) {
    const totalWeight = percentSections.reduce((s, sec) => s + sec.weight, 0);
    const pct = Math.round(totalWeight * 100);
    if (Math.abs(totalWeight - 1) > 0.02) {
      warnings.push(`Section weights total ${pct}%. Normalize or adjust.`);
    }
  }
  for (const sec of config.sections) {
    const enabledChildren = (sec.children ?? []).filter((c) => c.enabled !== false);
    if (enabledChildren.length > 0) {
      // Parent is a budget-only container when it has enabled children — its
      // own crate is never used for generation, so don't warn about it.
      for (const child of enabledChildren) {
        if (!child.primaryCrate.trim()) {
          warnings.push(`Section "${child.label}" has no crate set — it will pull from the whole eligible pool.`);
        }
      }
    } else if (!sec.primaryCrate.trim()) {
      warnings.push(`Section "${sec.label}" has no crate set — it will pull from the whole eligible pool.`);
    }
  }
  return warnings;
}
