import type { Track } from "../data/trackTypes";
import type { CrateRecord } from "../data/crateTypes";
import { defaultCrateFilters } from "../data/crateTypes";
import { getMoodGroup, normalizeMoodLabel } from "./moodTaxonomy";
import type { MoodGroupId } from "./moodTaxonomy";
import { rankMoodProfiles } from "./MoodAnalyzer";
import { trackToAudioFeatures } from "./audioFeatureAdapter";
import { resolveCrateTracks } from "./resolveCrate";

export type MoodCrateCountMode = "primary" | "allTags" | "liveTop3";

/**
 * Controls which source owners appear in generated auto mood crates.
 * "cat"           — CAT-only (default). Mixed crates are RESET to CAT-only on regenerate.
 * "ext"           — EXT-only. Mixed crates are RESET to EXT-only.
 * "all-separated" — One crate per owner per mood ("Catalog / Calm", "External / Calm").
 *                   Existing mixed crates are split.
 * "mixed"         — CAT + EXT in the same crate. Diagnostic / advanced only.
 */
export type MoodCrateSourceScope = "cat" | "ext" | "all-separated" | "mixed";

function genAutoId(mood: string): string {
  return `auto_mood_${mood.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
}

function genAutoIdForOwner(mood: string, owner: "studiorich" | "external"): string {
  const tag = owner === "studiorich" ? "cat" : "ext";
  return `auto_mood_${tag}_${mood.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
}

function ownersForScope(scope: MoodCrateSourceScope): Array<"studiorich" | "external"> {
  if (scope === "cat") return ["studiorich"];
  if (scope === "ext") return ["external"];
  // "all-separated" handled separately; "mixed" should not reach this path
  return ["studiorich", "external"];
}

function buildSeparatedAutoMoodCrate(
  mood: string,
  owner: "studiorich" | "external",
): CrateRecord {
  const now = nowIso();
  const prefix = owner === "studiorich" ? "Catalog" : "External";
  return {
    id: genAutoIdForOwner(mood, owner),
    name: `${prefix} / ${mood}`,
    kind: "auto_mood",
    createdAt: now,
    updatedAt: now,
    sourceOwners: [owner],
    filters: { ...defaultCrateFilters(), moodTags: [mood] },
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface MoodUsage {
  mood: string;
  moodGroup: MoodGroupId | null;
  trackCount: number;
}

/** Collect approved moods actually used by tracks (moodTags field only). */
export function getUsedApprovedMoods(tracks: Track[]): MoodUsage[] {
  const counts = new Map<string, number>();
  for (const t of tracks) {
    for (const raw of t.moodTags ?? []) {
      const label = normalizeMoodLabel(raw);
      if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([mood, trackCount]) => ({ mood, moodGroup: getMoodGroup(mood), trackCount }))
    .sort((a, b) => b.trackCount - a.trackCount);
}

export function buildAutoMoodCrateForMood(
  mood: string,
  sourceScope: Exclude<MoodCrateSourceScope, "all-separated"> = "cat",
): CrateRecord {
  const now = nowIso();
  const owners = ownersForScope(sourceScope);
  return {
    id: genAutoId(mood),
    name: mood,
    kind: "auto_mood",
    createdAt: now,
    updatedAt: now,
    sourceOwners: owners,
    filters: { ...defaultCrateFilters(), moodTags: [mood] },
  };
}

export interface GenerateResult {
  created: CrateRecord[];
  skippedExisting: string[];
  empty: string[];
}

export function generateMissingAutoMoodCrates(
  existingCrates: CrateRecord[],
  tracks: Track[],
  options: {
    sourceScope?: Exclude<MoodCrateSourceScope, "all-separated">;
    minTracks?: number;
  } = {},
): GenerateResult {
  const { sourceScope = "cat", minTracks = 1 } = options;

  const usedMoods = getUsedApprovedMoods(tracks);

  // Index existing crates by normalised mood name
  const existingByMood = new Map<string, CrateRecord>();
  for (const c of existingCrates) {
    // A crate "covers" a mood if it's an auto_mood crate for that mood,
    // or a manual crate whose name matches and has a single moodTag filter.
    const moodFilter = c.filters.moodTags;
    if (moodFilter.length === 1) {
      existingByMood.set(normalizeMoodLabel(moodFilter[0]), c);
    }
    // Also index by name for pure-name manual crates
    const normName = normalizeMoodLabel(c.name);
    if (!existingByMood.has(normName)) {
      existingByMood.set(normName, c);
    }
  }

  const created: CrateRecord[] = [];
  const skippedExisting: string[] = [];
  const empty: string[] = [];

  for (const { mood, trackCount } of usedMoods) {
    const key = normalizeMoodLabel(mood);
    if (trackCount < minTracks) {
      empty.push(mood);
      continue;
    }
    if (existingByMood.has(key)) {
      skippedExisting.push(mood);
      continue;
    }
    created.push(buildAutoMoodCrateForMood(mood, sourceScope));
  }

  return { created, skippedExisting, empty };
}

/** Audit helper exposed via window.MUSIC_DEBUG */
export function auditAutoMoodCrates(
  existingCrates: CrateRecord[],
  tracks: Track[],
) {
  const usedMoods = getUsedApprovedMoods(tracks);
  const autoCrates = existingCrates.filter((c) => c.kind === "auto_mood");
  const manualMoodCrates = existingCrates.filter(
    (c) => c.kind !== "auto_mood" && c.filters.moodTags.length === 1,
  );
  const result = generateMissingAutoMoodCrates(existingCrates, tracks);

  console.group("[MUSIC] Auto Mood Crate Audit");
  console.log("Used approved moods:", usedMoods);
  console.log("Auto mood crates:", autoCrates.map((c) => c.name));
  console.log("Manual mood crates:", manualMoodCrates.map((c) => c.name));
  console.log("Would create:", result.created.map((c) => c.name));
  console.log("Skipped (already covered):", result.skippedExisting);
  console.log("Empty / below threshold:", result.empty);
  console.groupEnd();

  return { usedMoods, autoCrates, manualMoodCrates, ...result };
}

// ── Count helpers ─────────────────────────────────────────────────────────────

/** moodTags[0] per track — primary committed assignment. */
export function getUsedPrimaryMoods(tracks: Track[]): MoodUsage[] {
  const counts = new Map<string, number>();
  for (const t of tracks) {
    const raw = (t.moodTags ?? [])[0];
    if (!raw) continue;
    const label = normalizeMoodLabel(raw);
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([mood, trackCount]) => ({ mood, moodGroup: getMoodGroup(mood), trackCount }))
    .sort((a, b) => b.trackCount - a.trackCount);
}

/** Live top-3 scoring per track — uses current MoodAnalyzer vectors without re-saving. */
export function getUsedLiveTop3Moods(tracks: Track[]): MoodUsage[] {
  const counts = new Map<string, number>();
  for (const t of tracks) {
    const { features } = trackToAudioFeatures(t);
    if (!features) continue;
    const top3 = rankMoodProfiles(features).slice(0, 3);
    for (const s of top3) {
      const label = normalizeMoodLabel(s.mood);
      if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([mood, trackCount]) => ({ mood, moodGroup: getMoodGroup(mood), trackCount }))
    .sort((a, b) => b.trackCount - a.trackCount);
}

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface MoodCrateCountAudit {
  primaryCounts: Record<string, number>;
  globalAllTagsCounts: Record<string, number>;
  catAllTagsCounts: Record<string, number>;
  extAllTagsCounts: Record<string, number>;
  /** @deprecated use globalAllTagsCounts */
  allCommittedTagCounts: Record<string, number>;
  liveTop3Counts: Record<string, number>;
  visibleCrateCounts: Record<string, number>;
  sourceMixedCrates: CrateRecord[];
  mismatches: Array<{ mood: string; allTags: number; visible: number; delta: number }>;
}

export function auditMoodCrateCounts(
  existingCrates: CrateRecord[],
  tracks: Track[],
): MoodCrateCountAudit {
  const toRecord = (usages: MoodUsage[]) =>
    Object.fromEntries(usages.map((u) => [u.mood, u.trackCount]));

  const primaryCounts       = toRecord(getUsedPrimaryMoods(tracks));
  const globalAllTagsCounts = toRecord(getUsedApprovedMoods(tracks));
  const liveTop3Counts      = toRecord(getUsedLiveTop3Moods(tracks));

  // Per-source allTags counts
  const catTracks = tracks.filter((t) => t.sourceOwner === "studiorich");
  const extTracks = tracks.filter((t) => t.sourceOwner === "external");
  const catAllTagsCounts = toRecord(getUsedApprovedMoods(catTracks));
  const extAllTagsCounts = toRecord(getUsedApprovedMoods(extTracks));

  // Visible crate counts (matches UI)
  const moodCrates = existingCrates.filter((c) => c.filters.moodTags.length === 1);
  const visibleCrateCounts: Record<string, number> = {};
  for (const c of moodCrates) {
    const mood = normalizeMoodLabel(c.filters.moodTags[0]);
    if (mood) visibleCrateCounts[mood] = resolveCrateTracks(c, tracks).tracks.length;
  }

  // Mixed auto_mood crates (sourceOwners.length > 1)
  const sourceMixedCrates = existingCrates.filter(
    (c) => c.kind === "auto_mood" && (c.sourceOwners?.length ?? 0) > 1,
  );

  // Mismatches: globalAllTags vs visible crate count
  const allMoods = new Set([
    ...Object.keys(globalAllTagsCounts),
    ...Object.keys(visibleCrateCounts),
  ]);
  const mismatches = Array.from(allMoods)
    .map((mood) => ({
      mood,
      allTags: globalAllTagsCounts[mood] ?? 0,
      visible: visibleCrateCounts[mood] ?? 0,
      delta:   (globalAllTagsCounts[mood] ?? 0) - (visibleCrateCounts[mood] ?? 0),
    }))
    .filter((m) => m.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  console.group("[auditMoodCrateCounts]");
  console.group("primary committed (moodTags[0])");
  console.table(primaryCounts);
  console.groupEnd();
  console.group("allTags — global (any moodTags, all tracks)");
  console.table(globalAllTagsCounts);
  console.groupEnd();
  console.group("allTags — CAT only (sourceOwner: studiorich)");
  console.table(catAllTagsCounts);
  console.groupEnd();
  console.group("allTags — EXT only (sourceOwner: external)");
  console.table(extAllTagsCounts);
  console.groupEnd();
  console.group("liveTop3 (current MoodAnalyzer vectors, not saved)");
  console.table(liveTop3Counts);
  console.groupEnd();
  console.group("visibleCrateCounts (resolveCrateTracks — matches UI)");
  console.table(visibleCrateCounts);
  console.groupEnd();
  if (sourceMixedCrates.length) {
    console.warn(
      `⚠ ${sourceMixedCrates.length} auto_mood crate(s) have mixed sourceOwners — run regenerateMoodCratesFromCurrentTags() to clean up:`,
      sourceMixedCrates.map((c) => `${c.name} [${(c.sourceOwners ?? []).join(", ")}]`),
    );
  }
  if (mismatches.length) {
    console.group(`mismatches (globalAllTags vs visible) — ${mismatches.length} moods differ`);
    console.table(mismatches);
    console.groupEnd();
  } else {
    console.log("✓ globalAllTags counts match visible crate counts");
  }
  console.groupEnd();

  return {
    primaryCounts,
    globalAllTagsCounts,
    catAllTagsCounts,
    extAllTagsCounts,
    allCommittedTagCounts: globalAllTagsCounts,
    liveTop3Counts,
    visibleCrateCounts,
    sourceMixedCrates,
    mismatches,
  };
}

// ── Regenerate ────────────────────────────────────────────────────────────────

export interface RegenerateMoodCratesResult {
  replaced: CrateRecord[];
  retained: CrateRecord[];
  created: CrateRecord[];
  removedBalanced: boolean;
  /** Number of existing crates whose sourceOwners were corrected to match the new scope. */
  sourceScopeUpdated: number;
  /** Mixed-source auto_mood crates that were dropped (will not appear in retained). */
  droppedMixed: CrateRecord[];
}

/**
 * Rebuilds auto_mood crates from current committed moodTags.
 *
 * sourceScope controls which tracks each crate covers:
 *   "cat"           — CAT-only (default). Mixed crates are RESET to CAT-only.
 *   "ext"           — EXT-only. Mixed crates are RESET to EXT-only.
 *   "all-separated" — One crate per owner per mood ("Catalog / Calm", "External / Calm").
 *                     Mixed crates are dropped and replaced with per-owner crates.
 *   "mixed"         — CAT + EXT in one crate. Diagnostic use only.
 *
 * mode "allTags" = any position in moodTags (default, matches crate filter logic).
 * mode "primary" = moodTags[0] only.
 * excludeBalanced: removes any existing Balanced auto_mood crate, does not create a new one.
 */
export function regenerateMoodCratesFromCurrentTags(
  existingCrates: CrateRecord[],
  tracks: Track[],
  options: {
    mode?: MoodCrateCountMode;
    excludeBalanced?: boolean;
    sourceScope?: MoodCrateSourceScope;
    minTracks?: number;
  } = {},
): RegenerateMoodCratesResult {
  const { mode = "allTags", excludeBalanced = true, sourceScope = "cat", minTracks = 1 } = options;

  const usages = mode === "primary" ? getUsedPrimaryMoods(tracks) : getUsedApprovedMoods(tracks);

  // Non-auto_mood crates are always retained unchanged
  const nonAuto = existingCrates.filter((c) => c.kind !== "auto_mood");
  const oldAuto  = existingCrates.filter((c) => c.kind === "auto_mood");

  const replaced: CrateRecord[] = [];
  const created: CrateRecord[]  = [];
  const droppedMixed: CrateRecord[] = [];
  let sourceScopeUpdated = 0;

  if (sourceScope === "all-separated") {
    // Index existing single-owner auto crates by `${owner}_${moodKey}`
    const oldBySepKey = new Map<string, CrateRecord>();
    for (const c of oldAuto) {
      const moodKey = normalizeMoodLabel(c.filters.moodTags[0] ?? c.name);
      if (!moodKey) continue;
      const owners = c.sourceOwners as string[] | undefined ?? [];
      if (owners.length === 1) {
        oldBySepKey.set(`${owners[0]}_${moodKey}`, c);
      } else if (owners.length > 1) {
        droppedMixed.push(c);
      }
    }

    // Track which sep keys we touched so we can retain unreferenced single-owner crates
    const seenSepKeys = new Set<string>();

    for (const { mood, trackCount } of usages) {
      const moodKey = normalizeMoodLabel(mood);
      if (!moodKey) continue;
      if (excludeBalanced && moodKey === "balanced") continue;
      if (trackCount < minTracks) continue;

      for (const owner of ["studiorich", "external"] as const) {
        // Only create a crate if this owner has tracks tagged with this mood
        const ownerTracks = tracks.filter((t) => t.sourceOwner === owner);
        const hasTagged = ownerTracks.some((t) =>
          (t.moodTags ?? []).some((m) => normalizeMoodLabel(m) === moodKey),
        );
        if (!hasTagged) continue;

        const sepKey = `${owner}_${moodKey}`;
        seenSepKeys.add(sepKey);
        if (oldBySepKey.has(sepKey)) {
          replaced.push(oldBySepKey.get(sepKey)!);
        } else {
          created.push(buildSeparatedAutoMoodCrate(mood, owner));
        }
      }
    }

    // Retain single-owner crates not visited above (no-longer-used moods will be absent
    // from retained — that's intentional; caller decides whether to persist nextCrates)
    for (const [key, c] of oldBySepKey) {
      if (!seenSepKeys.has(key)) replaced.push(c); // keep untouched old crates
    }
  } else {
    // "cat" | "ext" | "mixed" — single crate per mood

    const targetOwners =
      sourceScope === "mixed"
        ? (["studiorich", "external"] as Array<"studiorich" | "external">)
        : ownersForScope(sourceScope);

    const oldByMood = new Map<string, CrateRecord>();
    for (const c of oldAuto) {
      const key = normalizeMoodLabel(c.filters.moodTags[0] ?? c.name);
      if (key) oldByMood.set(key, c);
    }

    const seenMoods = new Set<string>();

    for (const { mood, trackCount } of usages) {
      const key = normalizeMoodLabel(mood);
      if (!key) continue;
      if (excludeBalanced && key === "balanced") continue;
      if (trackCount < minTracks) continue;
      seenMoods.add(key);

      if (oldByMood.has(key)) {
        const existing = oldByMood.get(key)!;
        const currentOwners = existing.sourceOwners as string[] | undefined ?? [];
        const isMixed = currentOwners.length > 1;
        const needsReset =
          isMixed ||
          currentOwners.length !== targetOwners.length ||
          !targetOwners.every((o) => currentOwners.includes(o));

        if (needsReset) {
          if (isMixed) droppedMixed.push(existing);
          replaced.push({ ...existing, sourceOwners: targetOwners, updatedAt: nowIso() });
          sourceScopeUpdated++;
        } else {
          replaced.push(existing);
        }
      } else {
        created.push(buildAutoMoodCrateForMood(mood, sourceScope === "mixed" ? "mixed" : sourceScope as Exclude<MoodCrateSourceScope, "all-separated">));
      }
    }
  }

  const oldByMoodForBalancedCheck = new Map<string, CrateRecord>();
  for (const c of oldAuto) {
    const key = normalizeMoodLabel(c.filters.moodTags[0] ?? c.name);
    if (key) oldByMoodForBalancedCheck.set(key, c);
  }
  const removedBalanced = excludeBalanced && oldByMoodForBalancedCheck.has("balanced");

  const retained = [...nonAuto, ...replaced];
  return { replaced, retained, created, removedBalanced, sourceScopeUpdated, droppedMixed };
}
