import { describe, it, expect } from "vitest";
import { computeActionEligibility, summarizeEligibility } from "./libraryActionsEligibility";
import type { Track } from "../../data/trackTypes";

function track(overrides: Partial<Track> & { trackId: string }): Track {
  return {
    title: "T", artist: "A", durationSeconds: 100, energy: 0.5, energySource: "manual",
    ...overrides,
  } as Track;
}

describe("computeActionEligibility — always-eligible metadata actions", () => {
  it("removeFromLibrary is eligible for every selected track regardless of playability", () => {
    const tracks = [track({ trackId: "t1", audioMissing: true }), track({ trackId: "t2" })];
    const result = computeActionEligibility("removeFromLibrary", tracks);
    expect(result.eligibleIds.sort()).toEqual(["t1", "t2"]);
    expect(result.ineligibleIds).toEqual([]);
  });
  it("batchComments is eligible even for a codec-blocked track", () => {
    const tracks = [track({ trackId: "t1", audioMissing: true })];
    const result = computeActionEligibility("batchComments", tracks);
    expect(result.eligibleIds).toEqual(["t1"]);
  });
});

describe("computeActionEligibility — sendToRadio", () => {
  it("excludes external-sourced tracks, includes everything else (Catalog and Sounds both eligible)", () => {
    const tracks = [
      track({ trackId: "t1", sourceOwner: "studiorich" }),
      track({ trackId: "t2", sourceOwner: "external" }),
      track({ trackId: "t3", sourceOwner: "reference" }),
    ];
    const result = computeActionEligibility("sendToRadio", tracks);
    expect(result.eligibleIds.sort()).toEqual(["t1", "t3"]);
    expect(result.ineligibleIds).toEqual(["t2"]);
  });
});

describe("computeActionEligibility — recheckPlaybackIssue", () => {
  it("is eligible only for tracks with a flagged playback issue", () => {
    const tracks = [track({ trackId: "t1" }), track({ trackId: "t2" })];
    const result = computeActionEligibility("recheckPlaybackIssue", tracks, {
      trackPlaybackIssues: { t1: { status: "unplayable", code: "CODEC" } },
    });
    expect(result.eligibleIds).toEqual(["t1"]);
    expect(result.ineligibleIds).toEqual(["t2"]);
  });
});

describe("computeActionEligibility — analyze", () => {
  it("requires linkable audio", () => {
    const tracks = [
      track({ trackId: "t1", filePath: "/x/y.wav" }),
      track({ trackId: "t2" }),
    ];
    const result = computeActionEligibility("analyze", tracks);
    expect(result.eligibleIds).toEqual(["t1"]);
    expect(result.ineligibleIds).toEqual(["t2"]);
  });
});

describe("summarizeEligibility", () => {
  it("reports a clean count when everything is eligible", () => {
    const summary = summarizeEligibility({ eligibleIds: ["a", "b"], ineligibleIds: [] }, "Send to RADIO");
    expect(summary.text).toBe("Send to RADIO: 2 of 2 selected");
  });
  it("reports eligible/ineligible counts for a mixed selection, never silently dropping the ineligible ones", () => {
    const summary = summarizeEligibility({ eligibleIds: ["a"], ineligibleIds: ["b", "c"] }, "Send to RADIO");
    expect(summary.eligibleCount).toBe(1);
    expect(summary.ineligibleCount).toBe(2);
    expect(summary.totalCount).toBe(3);
    expect(summary.text).toContain("1 of 3 eligible");
    expect(summary.text).toContain("2 ineligible");
  });
});
