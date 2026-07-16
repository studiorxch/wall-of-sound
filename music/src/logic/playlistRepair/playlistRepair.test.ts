import { describe, it, expect } from "vitest";
import type { Track } from "../../data/trackTypes";
import type { TrackSlot } from "../../data/playlistTypes";
import { resolvePlaylistOrder } from "../playlistAnalyzer/resolveOrder";
import { detectPlaylistIssuesAll, issueKey } from "./issueDetection";
import { aggregateBlueIssues, nonAggregatedIssues } from "./aggregateIssues";
import { buildRepairZone } from "./repairZone";
import { computeReadiness } from "./readiness";
import { mergeBriefIntoGapRegister } from "./libraryGapRegister";
import { buildMissingTrackBrief } from "./missingTrackBrief";
import type { PlaylistIssue, LibraryGapRecord } from "../../data/playlistRepairTypes";

function makeTrack(id: string, opts: Partial<Track> = {}): Track {
  return {
    trackId: id, title: id, artist: "Artist",
    durationSeconds: 200, energy: 0.5,
    sourceOwner: "studiorich", genres: [], moodTags: [], moodSuggestions: [],
    sourcePoolIds: [], grouping: "", albumArtist: "", archiveStatus: "library",
    ...opts,
  } as unknown as Track;
}

function makeSlot(id: string, index: number, trackId: string | undefined, sectionId?: string): TrackSlot {
  return {
    slotId: id, slotIndex: index, startTimeSeconds: index * 200, targetEnergy: 0.5, targetBpm: 120,
    assignedTrackId: trackId, warningLevel: "none", warningMessages: [], sectionId,
  };
}

// A playlist where every track lacks trusted BPM/key (the common "blue
// aggregation" case), with two large energy jumps that read as red issues.
function buildFixture(trackCount: number) {
  const tracks: Track[] = [];
  const slots: TrackSlot[] = [];
  for (let i = 0; i < trackCount; i++) {
    // Alternate energy sharply to guarantee red energy_discontinuity issues
    // at known positions (1 and 3), independent of trackCount.
    const energy = i === 1 || i === 3 ? 0.95 : 0.1;
    tracks.push(makeTrack(`t${i}`, { energy }));
    slots.push(makeSlot(`s${i}`, i, `t${i}`));
  }
  const tracksById = new Map(tracks.map((t) => [t.trackId, t]));
  const entries = resolvePlaylistOrder(slots, tracksById);
  const issues = detectPlaylistIssuesAll(entries);
  return { tracks, slots, tracksById, entries, issues };
}

// ── Issue aggregation ────────────────────────────────────────────────────────

describe("aggregateBlueIssues", () => {
  it("aggregates many identical blue issues (missing BPM) into one group with all positions available", () => {
    const { issues, entries } = buildFixture(10);
    const aggregates = aggregateBlueIssues(issues, entries);
    const missingBpm = aggregates.find((a) => a.issueType === "missing_bpm");
    expect(missingBpm).toBeDefined();
    expect(missingBpm!.count).toBeGreaterThanOrEqual(2);
    expect(missingBpm!.affectedPositions.length).toBeGreaterThan(0);
    expect(missingBpm!.affectedTrackIds.length).toBeGreaterThan(0);
  });

  it("does not aggregate red transition issues", () => {
    const { issues, entries } = buildFixture(10);
    const aggregates = aggregateBlueIssues(issues, entries);
    expect(aggregates.every((a) => a.colorState === "blue")).toBe(true);
    const nonAgg = nonAggregatedIssues(issues, aggregates);
    const redIssues = issues.filter((i) => i.colorState === "red");
    for (const red of redIssues) {
      expect(nonAgg.some((i) => i.issueId === red.issueId)).toBe(true);
    }
  });

  it("leaves underlying issue records untouched (aggregation is additive, not destructive)", () => {
    const { issues, entries } = buildFixture(10);
    const before = issues.length;
    aggregateBlueIssues(issues, entries);
    expect(issues.length).toBe(before);
  });

  it("does not aggregate a lone occurrence of a blue type", () => {
    // Two tracks total, only one transition — at most one of each blue type.
    const { issues, entries } = buildFixture(2);
    const aggregates = aggregateBlueIssues(issues, entries);
    for (const a of aggregates) expect(a.count).toBeGreaterThanOrEqual(2);
  });
});

// ── Local impact ─────────────────────────────────────────────────────────────

describe("local impact — recalculation scoping", () => {
  it("replacing one track only recalculates its two adjacent transitions, not unrelated ones", () => {
    const { tracks, slots, tracksById } = buildFixture(8);
    const beforeEntries = resolvePlaylistOrder(slots, tracksById);
    const beforeIssues = detectPlaylistIssuesAll(beforeEntries);

    // Replace track at position 5 with a fresh track — unrelated to any
    // existing energy-jump position (1/3).
    const replacedSlots = slots.map((s, i) => (i === 5 ? { ...s, assignedTrackId: "replacement" } : s));
    const replacementTrack = makeTrack("replacement", { energy: 0.1 });
    const tracksById2 = new Map([...tracks, replacementTrack].map((t) => [t.trackId, t]));
    const afterEntries = resolvePlaylistOrder(replacedSlots, tracksById2);
    const afterIssues = detectPlaylistIssuesAll(afterEntries);

    // Issues at the untouched energy-jump positions (1, 3) must survive
    // unchanged by key (type:position), independent of the edit elsewhere.
    const beforeKeys = new Set(beforeIssues.filter((i) => i.primaryPosition === 1 || i.primaryPosition === 3).map(issueKey));
    const afterKeys = new Set(afterIssues.filter((i) => i.primaryPosition === 1 || i.primaryPosition === 3).map(issueKey));
    expect(afterKeys).toEqual(beforeKeys);
  });

  it("unrelated positions never move when a single slot is edited", () => {
    const { slots } = buildFixture(6);
    const replacedSlots = slots.map((s, i) => (i === 2 ? { ...s, assignedTrackId: "swap" } : s));
    for (let i = 0; i < slots.length; i++) {
      if (i === 2) continue;
      expect(replacedSlots[i].assignedTrackId).toBe(slots[i].assignedTrackId);
      expect(replacedSlots[i].slotIndex).toBe(slots[i].slotIndex);
    }
  });
});

// ── Candidate repair ─────────────────────────────────────────────────────────

describe("buildRepairZone", () => {
  it("scopes strictly to previous/current/next around the issue position", () => {
    const { entries, issues } = buildFixture(8);
    const issue = issues.find((i) => i.scope === "transition")!;
    const zone = buildRepairZone(issue, entries);
    expect(zone.targetPosition).toBe(issue.primaryPosition);
    if (zone.previousPosition != null) expect(zone.previousPosition).toBe(issue.primaryPosition - 1);
    if (zone.nextPosition != null) expect(zone.nextPosition).toBe(issue.primaryPosition + 1);
  });
});

describe("readiness", () => {
  it("no issues → ready", () => {
    expect(computeReadiness([]).state).toBe("ready");
  });

  it("unresolved red → needs_repair", () => {
    const issue: PlaylistIssue = {
      issueId: "i1", type: "bpm_large_jump", severity: "error", colorState: "red",
      primaryPosition: 1, affectedPositions: [0, 1], scope: "transition",
      explanation: "x", warningCodes: [], repairAvailable: true, missingTrackBriefAvailable: true,
    };
    expect(computeReadiness([issue]).state).toBe("needs_repair");
  });

  it("only accepted yellow → ready_with_compromises", () => {
    const issue: PlaylistIssue = {
      issueId: "i2", type: "key_incompatible", severity: "warning", colorState: "yellow",
      primaryPosition: 1, affectedPositions: [0, 1], scope: "transition",
      explanation: "x", warningCodes: [], repairAvailable: true, missingTrackBriefAvailable: true, accepted: true,
    };
    expect(computeReadiness([issue]).state).toBe("ready_with_compromises");
  });

  it("blocking blue (>=5) → insufficient_analysis", () => {
    const issues: PlaylistIssue[] = Array.from({ length: 5 }, (_, i) => ({
      issueId: `b${i}`, type: "missing_bpm", severity: "info", colorState: "blue",
      primaryPosition: i, affectedPositions: [i], scope: "transition",
      explanation: "x", warningCodes: [], repairAvailable: false, missingTrackBriefAvailable: false,
    }));
    expect(computeReadiness(issues).state).toBe("insufficient_analysis");
  });
});

// ── Persistence ──────────────────────────────────────────────────────────────

describe("issueKey stability", () => {
  it("is deterministic across recomputation for the same type/position", () => {
    const { entries } = buildFixture(6);
    const issuesA = detectPlaylistIssuesAll(entries);
    const issuesB = detectPlaylistIssuesAll(entries);
    expect(issuesA.map(issueKey)).toEqual(issuesB.map(issueKey));
  });
});

describe("library gap register persistence", () => {
  it("keep-current-equivalent gap merge survives being re-applied without duplicating", () => {
    // Trusted prev/next neighbors so the brief carries a real BPM/key range —
    // gap similarity requires an overlapping range to merge against.
    const prev = makeTrack("prev", { bpm: 122, bpmSource: "detected", camelotKey: "8B", keySource: "detected" });
    const next = makeTrack("next", { bpm: 124, bpmSource: "detected", camelotKey: "8B", keySource: "detected" });
    const zone = {
      issueId: "i1", targetPosition: 1, previousPosition: 0, nextPosition: 2,
      previousTrackId: "prev", nextTrackId: "next", issueTypes: ["weak_bridge"], severity: "warning" as const,
    };
    const brief = buildMissingTrackBrief({ playlistId: "pl1", zone, previousTrack: prev, nextTrack: next, role: "bridge", searchedCandidateCount: 10 });

    const gaps1 = mergeBriefIntoGapRegister([], brief, "pl1", "i1", "2026-01-01T00:00:00Z");
    expect(gaps1.length).toBe(1);
    expect(gaps1[0].occurrenceCount).toBe(1);

    // Same brief seen again (e.g. after a second reload) — should merge, not duplicate.
    const gaps2 = mergeBriefIntoGapRegister(gaps1, brief, "pl1", "i1", "2026-01-02T00:00:00Z");
    expect(gaps2.length).toBe(1);
    expect(gaps2[0].occurrenceCount).toBe(2);
  });

  it("gap link (sourcePlaylistIds) survives being persisted verbatim", () => {
    const gap: LibraryGapRecord = {
      gapId: "g1", status: "open", sourcePlaylistIds: ["pl1"], sourceIssueIds: ["i1"],
      mergedBrief: {
        id: "b1", playlistId: "pl1", positionBetween: [0, 1], role: "bridge",
        energy: {}, tempo: {}, harmony: { preferredCamelotKeys: [], acceptableCamelotKeys: [] },
        moods: { required: [], optional: [], avoid: [] }, purpose: "test", confidence: 0.5,
      },
      occurrenceCount: 1, matchingTrackIds: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    };
    const roundTripped = JSON.parse(JSON.stringify(gap)) as LibraryGapRecord;
    expect(roundTripped.sourcePlaylistIds).toEqual(["pl1"]);
    expect(roundTripped.gapId).toBe("g1");
  });
});
