import { describe, it, expect } from "vitest";
import { compareRadioLoopVersions } from "./radioVersionCompare";
import type { RadioLoopPackageManifest } from "../../data/radioLoopTypes";

function baseMetadata(overrides: Partial<RadioLoopPackageManifest> = {}): RadioLoopPackageManifest {
  return {
    schemaVersion: "1.0.0", radioLoopId: "rloop_000001", packageVersion: 1, status: "RADIO_READY",
    source: { trackId: "track_a", loopId: "loop_a" },
    audio: { primary: { codec: "opus", container: "ogg", mimeType: "audio/ogg; codecs=opus", relativePath: "core.opus", bitrateKbps: 128, channels: 2, durationSeconds: 4.2 }, variants: [] },
    musical: { bpm: 120 },
    arrangement: { roles: ["foundation"], familyIds: ["family-1"] },
    approval: { publicUseApproved: true, approvedAt: "2026-07-16T00:00:00.000Z" },
    ...overrides,
  };
}

describe("compareRadioLoopVersions", () => {
  it("reports no changes for two identical versions (aside from version number itself)", () => {
    const a = baseMetadata({ packageVersion: 1 });
    const b = baseMetadata({ packageVersion: 2 });
    const diff = compareRadioLoopVersions(a, b);
    expect(diff.arrangementChanged).toBe(false);
    expect(diff.approvalChanged).toBe(false);
    expect(diff.musicalChanged).toBe(false);
    expect(diff.audioIdentityChanged).toBe(false);
    expect(diff.stemSetChanged).toBe(false);
    expect(diff.changedFields).toEqual([]);
  });

  it("never claims audio changed for a pure metadata revision — the exact scenario 0717A produces", () => {
    const a = baseMetadata({ packageVersion: 1, arrangement: { roles: ["foundation"], familyIds: ["family-1"] } });
    const b = baseMetadata({ packageVersion: 2, arrangement: { roles: ["motion"], familyIds: ["family-2"] } });
    const diff = compareRadioLoopVersions(a, b);
    expect(diff.arrangementChanged).toBe(true);
    expect(diff.audioIdentityChanged).toBe(false);
  });

  it("detects a real audio-identity change (e.g. a different bitrate or duration)", () => {
    const a = baseMetadata();
    const b = baseMetadata({ audio: { primary: { ...a.audio.primary, durationSeconds: 8.4 }, variants: [] } });
    const diff = compareRadioLoopVersions(a, b);
    expect(diff.audioIdentityChanged).toBe(true);
    expect(diff.changedFields).toContain("audio");
  });

  it("detects a stem-set change", () => {
    const a = baseMetadata();
    const b = baseMetadata({ stems: [{ name: "drums", relativePath: "stems/drums.opus", channels: 2, durationSeconds: 4.2 }] });
    expect(compareRadioLoopVersions(a, b).stemSetChanged).toBe(true);
  });

  it("detects an approval change", () => {
    const a = baseMetadata({ approval: { publicUseApproved: true, approvedAt: "2026-07-16T00:00:00.000Z" } });
    const b = baseMetadata({ approval: { publicUseApproved: false, approvedAt: "2026-07-17T00:00:00.000Z" } });
    expect(compareRadioLoopVersions(a, b).approvalChanged).toBe(true);
  });

  it("detects a title change", () => {
    const a = baseMetadata({ title: "Old Title" });
    const b = baseMetadata({ title: "New Title" });
    expect(compareRadioLoopVersions(a, b).changedFields).toContain("title");
  });
});
