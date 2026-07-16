// Playlist Local Repair — library gap register (§13). Pure functions over a
// LibraryGapRecord[] array; the caller owns persistence (see PlayProject.
// libraryGaps in playProjectTypes.ts). Gaps are never auto-closed — only
// "candidate_found" is set automatically; "resolved"/"dismissed" require an
// explicit user action elsewhere.

import type { Track } from "../../data/trackTypes";
import type { LibraryGapRecord, MissingTrackBrief } from "../../data/playlistRepairTypes";

function bpmRangesOverlap(a?: [number, number], b?: [number, number]): boolean {
  if (!a || !b) return false;
  return a[0] <= b[1] && b[0] <= a[1];
}

function keysOverlap(a: string[], b: string[]): boolean {
  return a.some((k) => b.includes(k));
}

/** "Substantially similar" (§13) — same role, and either BPM or key overlap. */
function isSimilarGap(brief: MissingTrackBrief, gap: LibraryGapRecord): boolean {
  if (gap.mergedBrief.role !== brief.role) return false;
  const bpmMatch = bpmRangesOverlap(brief.tempo.acceptableBpmRange, gap.mergedBrief.tempo.acceptableBpmRange);
  const keyMatch = keysOverlap(brief.harmony.acceptableCamelotKeys, gap.mergedBrief.harmony.acceptableCamelotKeys);
  return bpmMatch || keyMatch;
}

function widenRange(a?: [number, number], b?: [number, number]): [number, number] | undefined {
  if (!a) return b;
  if (!b) return a;
  return [Math.min(a[0], b[0]), Math.max(a[1], b[1])];
}

export function mergeBriefIntoGapRegister(
  existingGaps: LibraryGapRecord[],
  brief: MissingTrackBrief,
  playlistId: string,
  issueId: string,
  nowIso: string,
): LibraryGapRecord[] {
  const openGaps = existingGaps.filter((g) => g.status === "open" || g.status === "candidate_found");
  const match = openGaps.find((g) => isSimilarGap(brief, g));

  if (match) {
    return existingGaps.map((g) => {
      if (g.gapId !== match.gapId) return g;
      return {
        ...g,
        occurrenceCount: g.occurrenceCount + 1,
        sourcePlaylistIds: [...new Set([...g.sourcePlaylistIds, playlistId])],
        sourceIssueIds: [...new Set([...g.sourceIssueIds, issueId])],
        updatedAt: nowIso,
        mergedBrief: {
          ...g.mergedBrief,
          tempo: {
            ...g.mergedBrief.tempo,
            preferredBpmRange: widenRange(g.mergedBrief.tempo.preferredBpmRange, brief.tempo.preferredBpmRange),
            acceptableBpmRange: widenRange(g.mergedBrief.tempo.acceptableBpmRange, brief.tempo.acceptableBpmRange),
          },
          harmony: {
            preferredCamelotKeys: [...new Set([...g.mergedBrief.harmony.preferredCamelotKeys, ...brief.harmony.preferredCamelotKeys])],
            acceptableCamelotKeys: [...new Set([...g.mergedBrief.harmony.acceptableCamelotKeys, ...brief.harmony.acceptableCamelotKeys])],
          },
        },
      };
    });
  }

  const newGap: LibraryGapRecord = {
    gapId: `gap_${brief.role}_${Math.random().toString(36).slice(2, 8)}`,
    status: "open",
    sourcePlaylistIds: [playlistId],
    sourceIssueIds: [issueId],
    mergedBrief: brief,
    occurrenceCount: 1,
    matchingTrackIds: [],
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  return [...existingGaps, newGap];
}

/**
 * Compares one track against open gaps (§13 "whenever a track is imported,
 * analyzed, edited, or assigned, compare it against open gaps"). Returns the
 * gap ids the track is a plausible match for — caller decides whether to
 * mark `candidate_found` (never auto-resolves).
 */
export function checkTrackAgainstGaps(track: Track, gaps: LibraryGapRecord[]): string[] {
  const matches: string[] = [];
  for (const gap of gaps) {
    if (gap.status !== "open" && gap.status !== "candidate_found") continue;
    const brief = gap.mergedBrief;
    const bpmOk = brief.tempo.acceptableBpmRange
      ? typeof track.bpm === "number" && track.bpm >= brief.tempo.acceptableBpmRange[0] && track.bpm <= brief.tempo.acceptableBpmRange[1]
      : true;
    const keyOk = brief.harmony.acceptableCamelotKeys.length > 0
      ? typeof track.camelotKey === "string" && brief.harmony.acceptableCamelotKeys.includes(track.camelotKey)
      : true;
    const moodOk = brief.moods.required.length > 0
      ? brief.moods.required.some((m) => (track.moodTags ?? []).includes(m))
      : true;
    if (bpmOk && keyOk && moodOk) matches.push(gap.gapId);
  }
  return matches;
}

export function markCandidateFound(gaps: LibraryGapRecord[], gapId: string, trackId: string, nowIso: string): LibraryGapRecord[] {
  return gaps.map((g) => g.gapId === gapId
    ? { ...g, status: g.status === "open" ? "candidate_found" : g.status, matchingTrackIds: [...new Set([...g.matchingTrackIds, trackId])], updatedAt: nowIso }
    : g);
}
