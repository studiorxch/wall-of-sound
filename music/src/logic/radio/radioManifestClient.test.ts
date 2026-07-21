import { describe, it, expect } from "vitest";
import { projectWorkspaceRow } from "./radioManifestClient";
import type { RadioLoopPackageManifest } from "../../data/radioLoopTypes";

function baseMetadata(overrides: Partial<RadioLoopPackageManifest> = {}): RadioLoopPackageManifest {
  return {
    schemaVersion: "1.0.0", radioLoopId: "rloop_000001", packageVersion: 2, status: "RADIO_READY",
    source: { trackId: "track_a", loopId: "loop_a" },
    audio: { primary: { codec: "opus", container: "ogg", mimeType: "audio/ogg; codecs=opus", relativePath: "core.opus", bitrateKbps: 128, channels: 2, durationSeconds: 4.2 }, variants: [] },
    musical: { bpm: 120, key: "8A", bars: 8 },
    arrangement: { roles: ["foundation"], familyIds: ["family-1"], energy: 0.5 },
    approval: { publicUseApproved: true, approvedAt: "2026-07-17T00:00:00.000Z" },
    ...overrides,
  };
}

describe("projectWorkspaceRow", () => {
  it("projects every field from a fully-populated package", () => {
    const row = projectWorkspaceRow(baseMetadata({ title: "My Loop" }), true);
    expect(row.radioLoopId).toBe("rloop_000001");
    expect(row.currentPackageVersion).toBe(2);
    expect(row.status).toBe("RADIO_READY");
    expect(row.isActiveInManifest).toBe(true);
    expect(row.workingTitle).toBe("My Loop");
    expect(row.durationSeconds).toBe(4.2);
    expect(row.bpm).toBe(120);
    expect(row.roles).toEqual(["foundation"]);
    expect(row.publicUseApproved).toBe(true);
    expect(row.deliveryCodec).toBe("opus");
  });

  it("leaves unresolved optional metadata as undefined, never an invented default", () => {
    const row = projectWorkspaceRow(baseMetadata({ musical: {} }), false);
    expect(row.bpm).toBeUndefined();
    expect(row.key).toBeUndefined();
    expect(row.bars).toBeUndefined();
    expect(row.workingTitle).toBeUndefined();
  });

  it("reflects isActiveInManifest exactly as passed", () => {
    expect(projectWorkspaceRow(baseMetadata(), true).isActiveInManifest).toBe(true);
    expect(projectWorkspaceRow(baseMetadata(), false).isActiveInManifest).toBe(false);
  });

  it("marks stemStatus available only when stems are present and non-empty", () => {
    expect(projectWorkspaceRow(baseMetadata(), true).stemStatus).toBe("missing");
    expect(projectWorkspaceRow(baseMetadata({ stems: [] }), true).stemStatus).toBe("missing");
    expect(projectWorkspaceRow(baseMetadata({ stems: [{ name: "drums", relativePath: "stems/drums.opus", channels: 2, durationSeconds: 4.2 }] }), true).stemStatus).toBe("available");
  });

  it("starts source unresolved — resolution is a separate step", () => {
    const row = projectWorkspaceRow(baseMetadata(), true);
    expect(row.source.resolved).toBe(false);
  });

  it("reflects RETIRED status and includes it in availableVersions", () => {
    const row = projectWorkspaceRow(baseMetadata({ status: "RETIRED", packageVersion: 3, retirement: { reason: "test", retiredAt: "2026-07-17T00:00:00.000Z" } }), false);
    expect(row.status).toBe("RETIRED");
    expect(row.currentPackageVersion).toBe(3);
    expect(row.availableVersions).toEqual([3]);
  });
});
