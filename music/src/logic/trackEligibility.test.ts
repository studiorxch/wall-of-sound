// 0804_MUSIC_Playlist_Eligibility_Repair — §13 required tests, mapped by
// number in each test name. Existing playback-safety behavior
// (getTrackEligibility/gatePlaylistCandidates/backfillGeneratedSlots) is
// covered elsewhere (implicitly, via the playlistSequencing/playlistRepair
// suites) — these tests target the NEW eligibility-audit reconciliation
// this build adds.

import { describe, it, expect } from "vitest";
import type { Track } from "../data/trackTypes";
import { gatePlaylistCandidates, buildPlaylistEligibilityAudit } from "./trackEligibility";

function track(overrides: Partial<Track> & { trackId: string }): Track {
  return {
    title: "T", artist: "A", durationSeconds: 100, energy: 0.5, energySource: "manual",
    sourceOwner: "studiorich",
    ...overrides,
  } as Track;
}

describe("buildPlaylistEligibilityAudit", () => {
  it("[test 1, 2] reconciles considered -> hardEligible + hardRejectedUnique with nothing silently dropped, reproducing the real 205-track shape", () => {
    // 197 hard-eligible, 8 missing-audio — the exact shape from the reported bug.
    const eligible = Array.from({ length: 197 }, (_, i) => track({ trackId: `e${i}` }));
    const missing = Array.from({ length: 8 }, (_, i) => track({ trackId: `m${i}`, audioMissing: true }));
    const all = [...eligible, ...missing];
    const gate = gatePlaylistCandidates(all, { mode: "casual" }, "test");
    const audit = buildPlaylistEligibilityAudit({ consideredCount: all.length, gate });

    expect(audit.considered).toBe(205);
    expect(audit.hardEligible).toBe(197);
    expect(audit.hardRejectedUnique).toBe(8);
    expect(audit.rejectionCounts.missing_audio).toBe(8);
    // Every considered track accounted for — hardEligible + hardRejectedUnique reconciles exactly.
    expect(audit.hardEligible + audit.hardRejectedUnique).toBe(audit.considered);
  });

  it("[test 3] does not inflate hardRejectedUnique when a track carries more than one rejection reason", () => {
    const doubleReason = track({ trackId: "t1", audioMissing: true }); // missing_audio
    const gate = gatePlaylistCandidates([doubleReason], {
      mode: "casual",
      excludedTrackIds: ["t1"], // ALSO explicit_exclusion
    }, "test");
    const audit = buildPlaylistEligibilityAudit({ consideredCount: 1, gate });

    expect(audit.hardRejectedUnique).toBe(1); // one unique track
    expect(audit.rejectionCounts.missing_audio).toBe(1);
    expect(audit.rejectionCounts.explicit_exclusion).toBe(1);
    // Sum of rejectionCounts (2) exceeds hardRejectedUnique (1) — the overlap
    // must be surfaced separately, never presented as 2 unique tracks.
    expect(audit.multiReasonRejectedCount).toBe(1);
  });

  it("threads through caller-supplied unresolved-metadata and per-section candidate counts unchanged", () => {
    const gate = gatePlaylistCandidates([track({ trackId: "t1" })], { mode: "casual" }, "test");
    const audit = buildPlaylistEligibilityAudit({
      consideredCount: 1,
      gate,
      metadataWarningCounts: { pending_import_analysis: 5 },
      sectionCandidateCounts: { Intro: 42, Outro: 31 },
    });
    expect(audit.unresolvedMetadataWarnings).toEqual({ pending_import_analysis: 5 });
    expect(audit.sectionCandidateCounts).toEqual({ Intro: 42, Outro: 31 });
  });

  it("defaults unresolvedMetadataWarnings/sectionCandidateCounts to empty objects when not supplied", () => {
    const gate = gatePlaylistCandidates([track({ trackId: "t1" })], { mode: "casual" }, "test");
    const audit = buildPlaylistEligibilityAudit({ consideredCount: 1, gate });
    expect(audit.unresolvedMetadataWarnings).toEqual({});
    expect(audit.sectionCandidateCounts).toEqual({});
  });

  it("all-eligible pool reports zero rejections and zero overlap", () => {
    const all = Array.from({ length: 10 }, (_, i) => track({ trackId: `t${i}` }));
    const gate = gatePlaylistCandidates(all, { mode: "casual" }, "test");
    const audit = buildPlaylistEligibilityAudit({ consideredCount: all.length, gate });
    expect(audit.hardEligible).toBe(10);
    expect(audit.hardRejectedUnique).toBe(0);
    expect(audit.multiReasonRejectedCount).toBe(0);
  });
});
