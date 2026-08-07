import type { Track, MechanicalMoodTag } from "../data/trackTypes";
import type { CrateRecord } from "../data/crateTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type { PlaylistShapeConfig, PlaylistShapeSection } from "../data/playlistShapeTypes";
import { resolveCrateTracks } from "./resolveCrate";
import { createPlaylistDuplicateGuard, filterDuplicateCandidates, markTrackUsed } from "../lib/playlistDuplicateGuard";
import {
  defaultEnvelopeForSection,
  peakEnvelope,
  getEnergyTargetAtPosition,
  computeSectionEnergyCoverage,
  describeSectionEnergyWarning,
  normalizeEnergyEnvelope,
  PREFERRED_TOLERANCE,
  ACCEPTABLE_TOLERANCE,
  type SectionEnergyCoverage,
} from "./playlistEnergyEnvelope";
import { isBpmTrustedForAnalysis, isKeyTrustedForAnalysis, resolveAuthoritativeBpm } from "./dspFeatureExtraction";
import { computeBpmTransitionDistance, scoreBpmTransition, type BpmTransitionDistance } from "./playlistSequencing/bpmTransition";
import { scoreKeyTransition } from "./playlistSequencing/keyTransition";
import { computeTransitionScore, type PlaylistTransitionScore } from "./playlistSequencing/transitionScore";
import { classifySectionSequencingRole, getSectionSequencingProfile } from "./playlistSequencing/sectionSequencingProfile";
import { describeTransitionWarnings, describeSectionSequencingWarnings, type PlaylistSequencingWarning } from "./playlistSequencing/transitionWarnings";
import { computeMoodContinuity } from "./playlistAnalyzer/transitions";

// ---------------------------------------------------------------------------
// Intro mechanical-role fallback ladder (0804_MUSIC_Playlist_Eligibility_
// Repair §8). Purely a SOFT preference re-ranking, never a hard filter — a
// track lacking any preferred role still remains fully eligible and simply
// falls through to the next tier. Applies only to the section whose id is
// "intro" and which has no explicit requiredMechanicalRoles configured (a
// section with requiredMechanicalRoles set uses that as a genuine hard
// filter instead — see filterByRequiredRoles below — and skips this ladder
// entirely, since there's nothing left to "fall back" through).
//
// Spec's 7-item preference order collapses into 3 real tiers plus "no match"
// (tier 3): tier 0 = "opener" (Level 0, "exact preferred role"); tier 1 =
// drift/reset/hold/plateau (Level 1, "compatible opening role"); tier 2 =
// "build" AND below-target energy (Level 2, "compatible energy/BPM
// regardless of role" — role is present but energy is what actually
// qualifies it); tier 3 = no role signal at all, ranked purely by the
// existing energy/BPM/key/mood logic below (Level 3, "any hard-eligible
// track"). Level 4 ("fail only when assigned crates contain no hard-eligible
// track") is not a scoring tier — it's simply what already happens when a
// section's candidate pool is empty (existing warning path, unchanged).
const INTRO_ROLE_TIER_0: MechanicalMoodTag[] = ["opener"];
const INTRO_ROLE_TIER_1: MechanicalMoodTag[] = ["drift", "reset", "hold", "plateau"];
const INTRO_ROLE_TIER_2: MechanicalMoodTag[] = ["build"];

function hasAnyRole(track: Track, roles: MechanicalMoodTag[]): boolean {
  const tags = track.mechanicalMoodTags;
  if (!tags || tags.length === 0) return false;
  return roles.some((r) => tags.includes(r));
}

/** Lower is better; 3 means "no role signal — score on energy/BPM/key alone". */
function introRoleTierOf(track: Track, targetEnergy: number): number {
  if (hasAnyRole(track, INTRO_ROLE_TIER_0)) return 0;
  if (hasAnyRole(track, INTRO_ROLE_TIER_1)) return 1;
  if (hasAnyRole(track, INTRO_ROLE_TIER_2) && typeof track.energy === "number" && track.energy < targetEnergy) return 2;
  return 3;
}

/**
 * requiredMechanicalRoles (opt-in, test #16 "exact role requirements still
 * work when explicitly configured") — a genuine hard filter, unlike the
 * fallback ladder above. Only meaningful for the section it's set on;
 * returns the pool unchanged when unset/empty.
 */
function filterByRequiredRoles(tracks: Track[], required: MechanicalMoodTag[] | undefined): Track[] {
  if (!required || required.length === 0) return tracks;
  return tracks.filter((t) => hasAnyRole(t, required));
}

// ---------------------------------------------------------------------------
// Timing distribution resolver (0711_MUSIC_Crate_First_Playlist_Shape_UX_Revision)
// ---------------------------------------------------------------------------
// Intro/Outro are capped to a practical 15–20 min range; the remaining time is
// divided into equal, readable middle blocks (S01, S02, ...) — never a tiny
// orphan section.

function makeSection(id: string, label: string, durationMinutes: number, envelope = defaultEnvelopeForSection(id)): PlaylistShapeSection {
  return { id, label, durationMinutes, crateWeights: [], energyEnvelope: envelope };
}

export function resolveShapeSections(input: {
  targetDurationMinutes: number;
  introMinutes?: number;
  outroMinutes?: number;
  middleBlockMinutes?: number;
}): PlaylistShapeSection[] {
  const target = Math.max(1, input.targetDurationMinutes);
  const defaultCap = target >= 90 ? 20 : 15;
  const introMinutes = input.introMinutes ?? defaultCap;
  const outroMinutes = input.outroMinutes ?? defaultCap;
  const middleBlockMinutes = input.middleBlockMinutes ?? 20;

  const remaining = Math.max(0, target - introMinutes - outroMinutes);
  const numBlocks = remaining > 0 ? Math.max(1, Math.round(remaining / middleBlockMinutes)) : 0;

  const sections: PlaylistShapeSection[] = [makeSection("intro", "Intro", introMinutes)];

  if (numBlocks > 0) {
    const base = Math.floor(remaining / numBlocks);
    let remainder = remaining - base * numBlocks;
    // The identifiable "peak" is the middle-most block (spec §4.2's "Peak
    // section when identifiable" default) — for a single middle block that's
    // just it; for several, the one nearest the temporal center.
    const peakIndex = Math.floor((numBlocks - 1) / 2);
    for (let i = 0; i < numBlocks; i++) {
      // Distribute the remainder across the first few blocks instead of
      // creating one larger/smaller odd block at the end.
      const dur = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder--;
      const envelope = i === peakIndex ? peakEnvelope() : defaultEnvelopeForSection(`s${i + 1}`);
      sections.push(makeSection(`s${i + 1}`, `S${String(i + 1).padStart(2, "0")}`, dur, envelope));
    }
  }

  sections.push(makeSection("outro", "Outro", outroMinutes));
  return sections;
}

export function makeDefaultShapeConfig(targetDurationMinutes: number): PlaylistShapeConfig {
  const target = Math.max(1, targetDurationMinutes);
  const defaultCap = target >= 90 ? 20 : 15;
  return {
    mode: "organized",
    targetDurationMinutes: target,
    introMinutes: defaultCap,
    outroMinutes: defaultCap,
    middleBlockMinutes: 20,
    sections: resolveShapeSections({ targetDurationMinutes: target }),
  };
}

// ---------------------------------------------------------------------------
// Generation (spec §Generation Behavior / §Weighted Candidate Selection)
// ---------------------------------------------------------------------------

export type ShapeSectionResult = {
  sectionId: string;
  sectionLabel: string;
  targetDurationSeconds: number;
  tracks: Track[];
  actualDurationSeconds: number;
  warning?: string;
  energyCoverage?: SectionEnergyCoverage;
  energyWarning?: string;
  // 0804_MUSIC_Playlist_Eligibility_Repair §7 sectionCandidateCounts — the
  // number of hard-eligible tracks actually available to this section
  // (post crate-resolution, post duplicate-filtering, pre-picking), distinct
  // from `tracks.length` (how many were actually picked into the playlist).
  candidateCount: number;
  // §8 "log the fallback level used for each generated section" — only ever
  // set for the "intro" section when its fallback ladder actually ran (i.e.
  // requiredMechanicalRoles was NOT set); 0-3, matching introRoleTierOf's
  // scale, or undefined for every other section / when no candidates existed
  // to classify at all.
  introFallbackLevel?: number;
  // 0804_MUSIC_Crate_BPM_Group_Filters §10 — "include crate filter
  // mismatches in the eligibility audit as outside_assigned_crate, not as
  // unexplained rejection." Summed across this section's assigned crates:
  // tracks that passed every safety/search/rating/mood/grouping/genre/
  // genreFamily gate but were excluded specifically by that crate's own
  // BPM/Group filters. Distinct from candidateCount (the final, already-
  // filtered pool) and from trackEligibility.ts's global playback-safety
  // rejection reasons (codec/missing_audio/etc.) — this is a per-crate,
  // per-section signal, not a global one.
  outsideAssignedCrateCount: number;
};

// 0804_MUSIC_Playlist_Eligibility_Repair §9 — explicit result state so a
// caller never has to infer completeness from warnings text.
export type PlaylistGenerationState = "complete" | "partial" | "blocked";

/**
 * "complete": every section reached its target duration with at least one
 * track. "blocked": nothing was generated at all. "partial": anything in
 * between (some tracks exist, but at least one section came up short or
 * empty). A 1-second tolerance absorbs floating-point/rounding noise from
 * summed track durations — sections essentially never land exactly on the
 * target second.
 */
export function derivePlaylistGenerationState(result: ShapeBuildResult): PlaylistGenerationState {
  if (result.tracks.length === 0) return "blocked";
  const allSectionsFull = result.sections.every(
    (s) => s.tracks.length > 0 && s.actualDurationSeconds >= s.targetDurationSeconds - 1,
  );
  return allSectionsFull ? "complete" : "partial";
}

// Transient per-transition diagnostics (0713_MUSIC_Playlist_BPM_Key_
// Sequencing §17) — "may be stored transiently for review," not persisted
// with the playlist record. Populated for every adjacent pair actually
// picked during generation (including across a section boundary — §14).
export interface PlaylistTransitionDiagnostic {
  fromTrackId?: string;
  toTrackId: string;
  sectionId: string;
  bpmDistance?: BpmTransitionDistance;
  bpmFit: number;
  keyPenalty?: number;
  keyFit: number;
  energyFit: number;
  moodContinuity: number;
  variety: number;
  scoreBreakdown: PlaylistTransitionScore;
  totalScore: number;
  warningCodes: string[];
}

export interface ShapeBuildResult {
  tracks: Track[];
  sections: ShapeSectionResult[];
  warnings: string[];
  transitionDiagnostics: PlaylistTransitionDiagnostic[];
}

/**
 * Builds a playlist from shape sections. `libraryTracks` must already be
 * codec/playback-gated by the caller (gatePlaylistCandidates /
 * partitionEligibleTracks) — weighting never overrides that safety gate,
 * it only decides which of the already-safe tracks to prefer.
 */
export function buildShapePlaylist(params: {
  libraryTracks: Track[];
  crates: CrateRecord[];
  shapeConfig: PlaylistShapeConfig;
  // 0804_MUSIC_Playlist_Eligibility_Repair §10 — "distinguish an empty crate
  // from a crate whose tracks all fail hard gates." Optional, UNGATED
  // library snapshot used ONLY to tell those two cases apart in a warning
  // message when a section comes up with zero candidates; never used for
  // actual candidate selection (that still only ever reads params.libraryTracks,
  // the already-gated pool — this parameter cannot smuggle a hard-ineligible
  // track back into scoring/picking).
  allLibraryTracksForDiagnostics?: Track[];
}): ShapeBuildResult {
  const cratesById = new Map(params.crates.map((c) => [c.id, c]));
  // Duplicate guard (0711_MUSIC_Playlist_Duplicate_Track_Guard): one guard for
  // the whole run, created once before the section loop — not per section —
  // so a track pulled in an earlier section (via any overlapping crate) can
  // never be picked again by a later one.
  const guard = createPlaylistDuplicateGuard();
  const sections: ShapeSectionResult[] = [];
  const warnings: string[] = [];
  const transitionDiagnostics: PlaylistTransitionDiagnostic[] = [];
  // Tracked across the WHOLE run, not reset per section (0713_MUSIC_Playlist_
  // BPM_Key_Sequencing §14: "do not reset BPM/key continuity simply because a
  // section boundary exists") — the first track of a section is scored
  // against the previous section's final track, exactly like any other pair.
  let lastPicked: Track | undefined;
  const totalSections = params.shapeConfig.sections.length;

  params.shapeConfig.sections.forEach((rawSec, sectionIdx) => {
    // Defensive normalization — most callers already have a valid envelope
    // (repairStoredProject migrates on load, makeSection seeds new ones),
    // but the generator itself must never crash on a malformed/missing one.
    const sec: PlaylistShapeSection = {
      ...rawSec,
      energyEnvelope: normalizeEnergyEnvelope(rawSec.energyEnvelope, defaultEnvelopeForSection(rawSec.id)),
    };
    const targetSecs = Math.max(0, sec.durationMinutes * 60);

    if (sec.crateWeights.length === 0) {
      const warning = `"${sec.label}" has no crates assigned — section will be empty. Add crates or lower constraints.`;
      warnings.push(warning);
      sections.push({ sectionId: sec.id, sectionLabel: sec.label, targetDurationSeconds: targetSecs, tracks: [], actualDurationSeconds: 0, warning, candidateCount: 0, outsideAssignedCrateCount: 0 });
      return;
    }

    // Normalize weights: if the total is 0, split equally; a single crate
    // always effectively receives 100%.
    const rawWeights = sec.crateWeights.map((cw) => Math.max(0, cw.weight));
    const totalWeight = rawWeights.reduce((a, b) => a + b, 0);
    const normWeights = totalWeight > 0
      ? rawWeights.map((w) => w / totalWeight)
      : sec.crateWeights.map(() => 1 / sec.crateWeights.length);

    let duplicateExcludedCount = 0;
    // 0804_MUSIC_Crate_BPM_Group_Filters §10 — summed across this section's
    // assigned crates, straight from resolveCrateTracks's own count (never
    // re-derived independently, so it can't drift from the real filter pass).
    let outsideAssignedCrateCount = 0;
    // requiredMechanicalRoles (§8 test #16, opt-in hard filter) narrows the
    // pool BEFORE duplicate-filtering/scoring — a section with this set
    // never falls back through the soft preference ladder below, since its
    // whole candidate pool is already role-constrained.
    const cratePools = sec.crateWeights.map((cw, i) => {
      const crate = cratesById.get(cw.crateId);
      const resolved = crate ? resolveCrateTracks(crate, params.libraryTracks) : null;
      if (resolved) outsideAssignedCrateCount += resolved.excludedByBpmOrGroupFilters;
      const rawTracks = resolved ? filterByRequiredRoles(resolved.tracks, sec.requiredMechanicalRoles) : [];
      const tracks = filterDuplicateCandidates(rawTracks, guard);
      duplicateExcludedCount += rawTracks.length - tracks.length;
      return { crateId: cw.crateId, weight: normWeights[i], tracks };
    });

    // Energy-envelope diagnostics (§8) — computed on the whole assembled
    // candidate pool for this section, before any picking happens, so the
    // coverage numbers reflect what was actually available, not just what
    // got chosen.
    const assembledCandidates = cratePools.flatMap((p) => p.tracks);
    const energyCoverage = computeSectionEnergyCoverage({
      energies: assembledCandidates.map((t) => t.energy),
      envelope: sec.energyEnvelope,
    });
    const energyWarning = describeSectionEnergyWarning(sec.label, energyCoverage, sec.energyEnvelope) ?? undefined;

    // Section-aware sequencing profile (0713_MUSIC_Playlist_BPM_Key_
    // Sequencing §11) — one classification per section, reused for every
    // pick inside it. Configuration, not scattered conditionals.
    const sectionRole = classifySectionSequencingRole(sec.id, sectionIdx, totalSections);
    const sequencingProfile = getSectionSequencingProfile(sectionRole);
    const sectionDiagnostics: PlaylistTransitionDiagnostic[] = [];

    // Count-based weighted round robin (v1, per spec): always pull next from
    // whichever pool is furthest below its target share (picks/weight ratio).
    // WHICH crate to pull from is decided exactly as before (crate weighting
    // is untouched by this build — §20). WHICH track within that crate's
    // pool is chosen in two phases (§19 "energy hard eligibility → BPM/key
    // soft ranking"):
    //   1. Energy TIER is hard authority — a track in a worse energy-fit
    //      tier can never be picked over one in a better tier, no matter how
    //      good its BPM/key fit is.
    //   2. Within the best available tier, BPM/key/mood/variety (§12) break
    //      ties via the shared combined-score helper.
    // Missing energy/BPM/key metadata is never fabricated — such tracks
    // simply sort last (weakest fit / neutral score), never excluded.
    // §8 Intro fallback ladder — soft preference only, active for the
    // "intro" section unless requiredMechanicalRoles turned it into a hard
    // filter above (in which case there's nothing left to fall back
    // through: the pool is already exactly the required roles or empty).
    const isIntroSection = sec.id === "intro" && !sec.requiredMechanicalRoles?.length;
    let introFirstPickRoleTier: number | undefined;

    const picked: Track[] = [];
    let actualSecs = 0;
    const nextIdx = cratePools.map(() => 0);
    const pickedCounts = cratePools.map(() => 0);
    while (actualSecs < targetSecs) {
      let bestPool = -1;
      let bestRatio = Infinity;
      for (let i = 0; i < cratePools.length; i++) {
        if (cratePools[i].weight <= 0) continue;
        if (nextIdx[i] >= cratePools[i].tracks.length) continue;
        const ratio = pickedCounts[i] / cratePools[i].weight;
        if (ratio < bestRatio) { bestRatio = ratio; bestPool = i; }
      }
      if (bestPool === -1) break; // every assigned crate is exhausted

      const pool = cratePools[bestPool];
      const position = targetSecs > 0 ? Math.max(0, Math.min(1, actualSecs / targetSecs)) : 0;
      const targetEnergy = getEnergyTargetAtPosition(sec.energyEnvelope, position);
      const consumeFrom = nextIdx[bestPool];

      const energyDistanceOf = (t: Track): number => {
        const e = t.energy;
        return typeof e === "number" && Number.isFinite(e) ? Math.abs(e - targetEnergy) : Number.POSITIVE_INFINITY;
      };
      const energyTierOf = (dist: number): number => {
        if (!Number.isFinite(dist)) return 3;
        if (dist <= PREFERRED_TOLERANCE) return 0;
        if (dist <= ACCEPTABLE_TOLERANCE) return 1;
        return 2;
      };
      const energyFitOf = (dist: number): number => {
        if (!Number.isFinite(dist)) return 0;
        if (dist <= PREFERRED_TOLERANCE) return 1;
        if (dist <= ACCEPTABLE_TOLERANCE) return 0.6;
        return Math.max(0, 1 - dist);
      };

      // Phase 0 (Intro only): find the best mechanical-role tier actually
      // available, then restrict the rest of this pick to that tier only.
      // Never a hard exclusion — it only narrows which indices Phases 1/2
      // scan over; a track outside the best tier is still fully eligible on
      // a LATER pick if nothing better remains.
      let scanRange: number[] = [];
      for (let j = consumeFrom; j < pool.tracks.length; j++) scanRange.push(j);
      let introRoleTier: number | undefined;
      if (isIntroSection) {
        let bestRoleTier = 3;
        for (const j of scanRange) {
          const rt = introRoleTierOf(pool.tracks[j], targetEnergy);
          if (rt < bestRoleTier) bestRoleTier = rt;
        }
        introRoleTier = bestRoleTier;
        scanRange = scanRange.filter((j) => introRoleTierOf(pool.tracks[j], targetEnergy) === bestRoleTier);
      }

      // Phase 1: determine the best energy tier actually available (within
      // the role-tier-restricted scan range for Intro, or the full range
      // for every other section).
      let bestTier = 3;
      for (const j of scanRange) {
        const tier = energyTierOf(energyDistanceOf(pool.tracks[j]));
        if (tier < bestTier) bestTier = tier;
      }

      // Phase 2: within that tier, rank by the combined transition score.
      // 0804_MUSIC_Playlist_Eligibility_Repair: fromBpm/fromKey/fromMoods
      // being unavailable (untrusted/missing) is passed through as `null`,
      // not silently defaulted to a neutral 0.5 that still counted at full
      // weight — computeTransitionScore now OMITS a null input from the
      // weighted total entirely and renormalizes the remaining weights, per
      // direct instruction ("missing BPM: omit BPM scoring", etc.).
      const fromBpm = lastPicked && isBpmTrustedForAnalysis(lastPicked) ? lastPicked.bpm : undefined;
      const fromKey = lastPicked && isKeyTrustedForAnalysis(lastPicked) ? (lastPicked.camelotKey as string | undefined) : undefined;
      const fromMoods = lastPicked?.moodTags ?? [];

      let bestIdx = consumeFrom;
      let bestDiag: PlaylistTransitionDiagnostic | null = null;
      let bestTotal = -Infinity;
      for (const j of scanRange) {
        const cand = pool.tracks[j];
        const dist = energyDistanceOf(cand);
        if (energyTierOf(dist) !== bestTier) continue;

        const energyFit = energyFitOf(dist);
        const toBpm = isBpmTrustedForAnalysis(cand) ? cand.bpm : undefined;
        const bpmDistance = computeBpmTransitionDistance(fromBpm, toBpm);
        const bpmFitRaw = scoreBpmTransition(bpmDistance);
        const bpmFitForScoring = bpmDistance.relationship === "unknown" ? null : bpmFitRaw;
        const toKey = isKeyTrustedForAnalysis(cand) ? (cand.camelotKey as string | undefined) : undefined;
        const keyResult = scoreKeyTransition(fromKey, toKey);
        const keyFitForScoring = keyResult.penalty === undefined ? null : keyResult.score;
        // Undefined both when there's no lastPicked to compare against AND
        // when either track has no mood tags at all — both are genuinely
        // "no continuity signal available," omitted the same way.
        const moodContinuityRaw = lastPicked ? computeMoodContinuity(fromMoods, cand.moodTags ?? []) : undefined;
        const moodContinuity = moodContinuityRaw ?? 0.5; // display/diagnostic value only — unchanged
        const variety = lastPicked && lastPicked.artist && cand.artist && lastPicked.artist === cand.artist ? 0.3 : 1;

        const scoreBreakdown = computeTransitionScore({
          energyFit, bpmFit: bpmFitForScoring, keyFit: keyFitForScoring,
          moodContinuity: moodContinuityRaw ?? null,
          variety, profile: sequencingProfile,
        });

        if (scoreBreakdown.total > bestTotal) {
          bestTotal = scoreBreakdown.total;
          bestIdx = j;
          const seqWarnings: PlaylistSequencingWarning[] = lastPicked
            ? describeTransitionWarnings({
                fromPosition: -1, toPosition: -1, // positions unknown until slotting — filled in by caller if needed
                fromTrackId: lastPicked.trackId, toTrackId: cand.trackId,
                sectionId: sec.id, bpmDistance, keyPenalty: keyResult.penalty,
                keyTrusted: fromKey != null && toKey != null, profile: sequencingProfile,
              })
            : [];
          bestDiag = {
            fromTrackId: lastPicked?.trackId, toTrackId: cand.trackId, sectionId: sec.id,
            bpmDistance, bpmFit: bpmFitRaw, keyPenalty: keyResult.penalty, keyFit: keyResult.score,
            energyFit, moodContinuity, variety, scoreBreakdown, totalScore: scoreBreakdown.total,
            warningCodes: seqWarnings.map((w) => w.code),
          };
        }
      }

      if (bestIdx !== consumeFrom) {
        const tmp = pool.tracks[consumeFrom];
        pool.tracks[consumeFrom] = pool.tracks[bestIdx];
        pool.tracks[bestIdx] = tmp;
      }

      const track = pool.tracks[nextIdx[bestPool]++];
      pickedCounts[bestPool]++;
      if (isIntroSection && introFirstPickRoleTier === undefined) introFirstPickRoleTier = introRoleTier;
      picked.push(track);
      markTrackUsed(track, guard);
      actualSecs += track.durationSeconds ?? 0;
      if (bestDiag) { sectionDiagnostics.push(bestDiag); transitionDiagnostics.push(bestDiag); }
      lastPicked = track;
    }

    const sectionLevelWarnings = describeSectionSequencingWarnings({
      sectionId: sec.id,
      sectionRole,
      transitions: sectionDiagnostics
        .filter((d): d is PlaylistTransitionDiagnostic & { fromTrackId: string } => d.fromTrackId != null)
        .map((d) => ({
          fromPosition: -1, toPosition: -1, fromTrackId: d.fromTrackId, toTrackId: d.toTrackId,
          bpmDistance: d.bpmDistance ?? { relationship: "unknown" as const }, keyPenalty: d.keyPenalty,
          keyTrusted: d.keyPenalty != null,
        })),
    });
    for (const w of sectionLevelWarnings) warnings.push(w.explanation);

    let warning: string | undefined;
    if (actualSecs < targetSecs && picked.length > 0) {
      warning = duplicateExcludedCount > 0
        ? `"${sec.label}" could only fill ${Math.round(actualSecs / 60)}m of ${Math.round(targetSecs / 60)}m because ${duplicateExcludedCount} duplicate candidate${duplicateExcludedCount !== 1 ? "s" : ""} were excluded.`
        : `"${sec.label}" could only fill ${Math.round(actualSecs / 60)}m of ${Math.round(targetSecs / 60)}m. Add crates or lower constraints.`;
      warnings.push(warning);
    } else if (picked.length === 0) {
      if (duplicateExcludedCount > 0) {
        warning = `"${sec.label}" has no eligible tracks left in its assigned crates — ${duplicateExcludedCount} candidate${duplicateExcludedCount !== 1 ? "s" : ""} were duplicates already used elsewhere in this playlist.`;
      } else {
        // §10 "distinguish an empty crate from a crate whose tracks all fail
        // hard gates" / "confirm the assigned crate exists" / "show the
        // crate name in diagnostics".
        const missingCrateNames = sec.crateWeights
          .filter((cw) => !cratesById.has(cw.crateId))
          .map((cw) => cw.crateId);
        const diagLib = params.allLibraryTracksForDiagnostics;
        const namedCrates = sec.crateWeights
          .map((cw) => cratesById.get(cw.crateId))
          .filter((c): c is CrateRecord => c != null);
        const rawUngatedCount = diagLib
          ? namedCrates.reduce((sum, c) => sum + resolveCrateTracks(c, diagLib).tracks.length, 0)
          : null;
        const crateNameList = namedCrates.map((c) => `"${c.name}"`).join(", ");

        if (missingCrateNames.length > 0) {
          warning = `"${sec.label}" is assigned to a crate that no longer exists (${missingCrateNames.join(", ")}).`;
        } else if (rawUngatedCount === 0) {
          warning = `"${sec.label}"'s assigned crate${namedCrates.length !== 1 ? "s" : ""} ${crateNameList} ${namedCrates.length !== 1 ? "are" : "is"} empty — no tracks in the library match its filter criteria at all.`;
        } else if (rawUngatedCount != null && rawUngatedCount > 0) {
          warning = `"${sec.label}"'s assigned crate${namedCrates.length !== 1 ? "s" : ""} ${crateNameList} ${namedCrates.length !== 1 ? "have" : "has"} ${rawUngatedCount} track${rawUngatedCount !== 1 ? "s" : ""}, but all fail hard eligibility (missing/inaccessible audio, codec block, or explicit exclusion).`;
        } else {
          warning = `"${sec.label}" has no eligible tracks in its assigned crates.`;
        }
      }
      warnings.push(warning);
    }

    if (energyWarning) warnings.push(energyWarning);

    if (isIntroSection && introFirstPickRoleTier !== undefined) {
      console.info(`[playlistShapeBuilder] Intro fallback level used: ${introFirstPickRoleTier}`);
    }

    sections.push({
      sectionId: sec.id, sectionLabel: sec.label, targetDurationSeconds: targetSecs, tracks: picked, actualDurationSeconds: actualSecs, warning,
      energyCoverage, energyWarning, candidateCount: assembledCandidates.length,
      introFallbackLevel: isIntroSection ? introFirstPickRoleTier : undefined,
      outsideAssignedCrateCount,
    });
  });

  return { tracks: sections.flatMap((s) => s.tracks), sections, warnings, transitionDiagnostics };
}

/** Builds TrackSlots from a ShapeBuildResult, tagging each slot with its section origin. */
export function buildSlotsFromShapeResult(result: ShapeBuildResult): TrackSlot[] {
  const slots: TrackSlot[] = [];
  let cumulativeTime = 0;
  let slotIndex = 0;
  result.sections.forEach((s, sectionIndex) => {
    for (const t of s.tracks) {
      slots.push({
        slotId: `slot_${slotIndex}`,
        slotIndex,
        startTimeSeconds: cumulativeTime,
        targetEnergy: t.energy ?? 0.5,
        targetBpm: resolveAuthoritativeBpm(t) ?? 120,
        assignedTrackId: t.trackId,
        warningLevel: "none",
        warningMessages: [],
        sectionId: s.sectionId,
        sectionLabel: s.sectionLabel,
        sectionIndex,
      });
      cumulativeTime += t.durationSeconds ?? 0;
      slotIndex++;
    }
  });
  return slots;
}
