import { describe, it, expect } from "vitest";
import { estimateInboxItemBytes, summarizePlaylistStorage, DEFAULT_STORAGE_BUDGET_BYTES } from "./radioStorageEstimate";
import { RADIO_OPUS_ENCODING_POLICY } from "../../data/radioLoopTypes";
import { RADIO_TRACK_OPUS_ENCODING_POLICY } from "../../data/radioTrackPackageTypes";

describe("estimateInboxItemBytes", () => {
  it("computes real byte math for a loop against RADIO_OPUS_ENCODING_POLICY's bitrate", () => {
    const bytes = estimateInboxItemBytes("loop", 60);
    expect(bytes).toBe(Math.round((60 * RADIO_OPUS_ENCODING_POLICY.bitrateKbps * 1000) / 8));
    expect(typeof bytes).toBe("number");
  });

  // 0718B — "track" now has a verified packaging path of its own (a
  // RadioTrackPackage), at ITS OWN policy's bitrate (160k), never the
  // loop policy's 128k.
  it("computes real byte math for a track against RADIO_TRACK_OPUS_ENCODING_POLICY's bitrate, distinct from the loop bitrate", () => {
    const bytes = estimateInboxItemBytes("track", 60);
    expect(bytes).toBe(Math.round((60 * RADIO_TRACK_OPUS_ENCODING_POLICY.bitrateKbps * 1000) / 8));
    expect(bytes).not.toBe(estimateInboxItemBytes("loop", 60));
  });

  it("every kind with no packaging path returns the literal 'unknown', never 0", () => {
    for (const kind of ["sound", "stem", "stem_section", "fill", "build", "announcement"] as const) {
      const result = estimateInboxItemBytes(kind, 60);
      expect(result).toBe("unknown");
      expect(result).not.toBe(0);
    }
  });

  it("a loop with no known duration is also 'unknown', never a fabricated 0", () => {
    expect(estimateInboxItemBytes("loop", null)).toBe("unknown");
    expect(estimateInboxItemBytes("loop", undefined)).toBe("unknown");
    expect(estimateInboxItemBytes("loop", 0)).toBe("unknown");
    expect(estimateInboxItemBytes("loop", NaN)).toBe("unknown");
  });

  it("a real knownByteSize always wins over the bitrate*duration approximation, for any kind", () => {
    expect(estimateInboxItemBytes("track", 60, 4_200_000)).toBe(4_200_000);
    expect(estimateInboxItemBytes("loop", null, 999)).toBe(999); // even with no duration at all
  });

  it("an invalid knownByteSize (zero/negative/NaN) falls back to the normal estimate, not 'unknown'", () => {
    expect(estimateInboxItemBytes("loop", 60, 0)).toBe(estimateInboxItemBytes("loop", 60));
    expect(estimateInboxItemBytes("loop", 60, -5)).toBe(estimateInboxItemBytes("loop", 60));
    expect(estimateInboxItemBytes("loop", 60, NaN)).toBe(estimateInboxItemBytes("loop", 60));
  });
});

describe("summarizePlaylistStorage", () => {
  it("sums only numeric estimates and tracks unknowns separately, never coercing them to 0 in the total", () => {
    const summary = summarizePlaylistStorage([
      { entryId: "e1", bytes: 1000 },
      { entryId: "e2", bytes: 2000 },
      { entryId: "e3", bytes: "unknown" },
    ]);
    expect(summary.totalBytes).toBe(3000);
    expect(summary.unknownCount).toBe(1);
  });

  it("defaults to the 8 GB working target and computes remaining/over-budget correctly", () => {
    const summary = summarizePlaylistStorage([{ entryId: "e1", bytes: DEFAULT_STORAGE_BUDGET_BYTES + 1 }]);
    expect(summary.budgetBytes).toBe(DEFAULT_STORAGE_BUDGET_BYTES);
    expect(summary.remainingBytes).toBe(-1);
    expect(summary.overBudget).toBe(true);
  });

  it("flags nearBudget once the warning threshold ratio is crossed but budget isn't exceeded", () => {
    const budget = 1000;
    const summary = summarizePlaylistStorage([{ entryId: "e1", bytes: 950 }], budget, 0.9);
    expect(summary.warningThresholdBytes).toBe(900);
    expect(summary.nearBudget).toBe(true);
    expect(summary.overBudget).toBe(false);
  });

  it("does not flag nearBudget well under the threshold", () => {
    const summary = summarizePlaylistStorage([{ entryId: "e1", bytes: 100 }], 1000, 0.9);
    expect(summary.nearBudget).toBe(false);
    expect(summary.overBudget).toBe(false);
  });
});
