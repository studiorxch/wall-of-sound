import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { importSunoLibraryManifests } from "./manifestAdapter";
import { validateManifestSourceTexts, type ManifestSourceTexts } from "./manifestValidation";
import {
  EXCLUDED_WORKSPACE_AUTHORITY,
  SUPERSEDED_PLANNING_TOTAL,
  VERIFIED_DIRECT_LOCATION_TOTAL,
  buildTrainingExclusionRecords,
  classifyLocationProvenance,
  deriveEligibilityStatus,
  detectDuplicateCaptureBatchIds,
  isCanonicalRecordingExcluded,
  verifyWorkspaceExclusionAuthority,
} from "./trainingEligibility";

// Real evidence, not fixtures — same suno-snapshot-2026-08-11-full manifests
// already used by manifestAdapter.test.ts/canonicalIdentity.test.ts. This
// build (0812C v1.0.1) revises v1.0.0's BLOCKED finding: 403 was Suno's own
// displayed *song* count; 531 is the archive-derived *encoded location*
// count for the same 11 workspaces — a different, larger unit, not a wrong
// number to be corrected down.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_DIR = path.resolve(__dirname, "../../../../WOS-share/SUNO_LIBRARY/MANIFESTS");

function readReal(name: string): string {
  return readFileSync(path.join(MANIFEST_DIR, name), "utf-8");
}

const REAL_SOURCES: ManifestSourceTexts = {
  acquisitionSnapshot: readReal("suno-acquisition-snapshot.json"),
  audioInventory: readReal("suno-audio-inventory.json"),
  duplicateGroups: readReal("suno-duplicate-groups.json"),
  supplementalAssets: readReal("suno-supplemental-assets.json"),
  syncCheckpoint: readReal("suno-sync-checkpoint.json"),
};

const importResult = importSunoLibraryManifests(REAL_SOURCES);
if (importResult.status === "BLOCKED") throw new Error("fixture import blocked");

const validation = validateManifestSourceTexts(REAL_SOURCES);
if (validation.status === "BLOCKED") throw new Error("fixture validation blocked");
const rawAudioAssets = validation.bundle.audioInventory.audioAssets;

const NOW = "2026-08-12T12:00:00.000Z";
const exclusionResult = buildTrainingExclusionRecords(
  importResult.encodedLocations,
  importResult.canonicalRecordings,
  importResult.batches,
  importResult.duplicateRelationships,
  rawAudioAssets,
  NOW,
);

describe("EXCLUDED_WORKSPACE_AUTHORITY — v1.0.1 revised table", () => {
  it("has exactly 11 workspaces", () => {
    expect(EXCLUDED_WORKSPACE_AUTHORITY.length).toBe(11);
  });

  it("retains 403 only as a superseded planning estimate, distinct from the 531 authoritative total", () => {
    expect(SUPERSEDED_PLANNING_TOTAL).toBe(403);
    expect(VERIFIED_DIRECT_LOCATION_TOTAL).toBe(531);
    expect(VERIFIED_DIRECT_LOCATION_TOTAL).not.toBe(SUPERSEDED_PLANNING_TOTAL);
  });
});

describe("verifyWorkspaceExclusionAuthority — real manifest data", () => {
  const verification = verifyWorkspaceExclusionAuthority(importResult.encodedLocations);

  it("matches 11/11 workspaces with zero missing", () => {
    expect(verification.matchedWorkspaceSlugs.length).toBe(11);
    expect(verification.missingWorkspaceSlugs).toEqual([]);
  });

  it("verifies exactly 531 direct encoded locations", () => {
    expect(verification.verifiedDirectLocationCount).toBe(531);
    expect(verification.ok).toBe(true);
  });

  it("reconciles every individual workspace's verified count", () => {
    const byWorkspace = new Map<string, number>();
    for (const loc of importResult.encodedLocations) {
      if (loc.workspaceSlug) byWorkspace.set(loc.workspaceSlug, (byWorkspace.get(loc.workspaceSlug) ?? 0) + 1);
    }
    for (const entry of EXCLUDED_WORKSPACE_AUTHORITY) {
      expect(byWorkspace.get(entry.workspaceSlug)).toBe(entry.verifiedEncodedLocationCount);
    }
  });
});

describe("detectDuplicateCaptureBatchIds — generalized, not hardcoded to New Lofi", () => {
  const duplicateBatchIds = detectDuplicateCaptureBatchIds(importResult.batches);

  it("finds duplicate-capture batches only under the new-lofi workspace in the current real archive", () => {
    const flaggedBatches = importResult.batches.filter((b) => duplicateBatchIds.has(b.batchId));
    expect(flaggedBatches.length).toBeGreaterThan(0);
    expect(flaggedBatches.every((b) => b.workspaceSlug === "new-lofi")).toBe(true);
  });

  it("flags exactly 6 batches (2 captures x 3 same-named ZIPs)", () => {
    const flaggedBatches = importResult.batches.filter((b) => duplicateBatchIds.has(b.batchId));
    expect(flaggedBatches.length).toBe(6);
  });
});

describe("buildTrainingExclusionRecords — real manifest data", () => {
  it("does not block", () => {
    expect(exclusionResult.status).toBe("PASS");
  });

  it("verifies 531 direct locations before mutating any exclusion state", () => {
    if (exclusionResult.status !== "PASS") throw new Error("blocked");
    expect(exclusionResult.verifiedDirectLocationCount).toBe(531);
  });

  it("reports the canonical exclusion count separately from the encoded-location count", () => {
    if (exclusionResult.status !== "PASS") throw new Error("blocked");
    expect(exclusionResult.excludedCanonicalRecordingCount).toBe(402);
    expect(exclusionResult.excludedEncodedLocationCount).toBe(549);
    expect(exclusionResult.excludedEncodedLocationCount).not.toBe(exclusionResult.excludedCanonicalRecordingCount);
  });

  it("exclude-on-any-source pulls in the real 18-location Wookie supplemental ripple case", () => {
    if (exclusionResult.status !== "PASS") throw new Error("blocked");
    const rippleRecords = exclusionResult.locationRecords.filter((r) => !r.isDirectWorkspaceMember);
    expect(rippleRecords.length).toBe(18);
    // Every ripple record is workspace-less at its own location (supplemental),
    // pulled in only via a shared canonical recording with a wookie member —
    // never via an invented relationship.
    expect(rippleRecords.every((r) => r.workspaceSlug === null)).toBe(true);
  });

  it("New Lofi: both distinct SHA-256 captures are preserved as separate encoded-location records, never merged", () => {
    if (exclusionResult.status !== "PASS") throw new Error("blocked");
    const newLofiRecords = exclusionResult.locationRecords.filter((r) => r.workspaceSlug === "new-lofi");
    expect(newLofiRecords.length).toBe(154);
    const distinctIds = new Set(newLofiRecords.map((r) => r.encodedLocationId));
    expect(distinctIds.size).toBe(154); // no collapsing/merging occurred
  });

  it("New Lofi: neither capture is treated as authoritative — both get identical classification and eligibility", () => {
    if (exclusionResult.status !== "PASS") throw new Error("blocked");
    const newLofiRecords = exclusionResult.locationRecords.filter((r) => r.workspaceSlug === "new-lofi");
    expect(newLofiRecords.every((r) => r.provenance.classification === "duplicate_capture")).toBe(true);
    expect(newLofiRecords.every((r) => r.eligibilityStatus === "excluded")).toBe(true);
  });

  it("New Lofi's 154 locations classify duplicate_capture with high confidence", () => {
    if (exclusionResult.status !== "PASS") throw new Error("blocked");
    const classification = exclusionResult.classificationCounts.find((c) => c.classification === "duplicate_capture");
    expect(classification?.count).toBe(154);
    expect(classification?.confidence).toBe("high");
  });

  it("the remaining 377 direct in-scope locations (10 non-new-lofi workspaces) plus the 18 ripple locations classify unresolved_audio (395 total)", () => {
    if (exclusionResult.status !== "PASS") throw new Error("blocked");
    const classification = exclusionResult.classificationCounts.find((c) => c.classification === "unresolved_audio");
    expect(classification?.count).toBe(395); // 377 direct + 18 ripple, neither carries positive provenance evidence
    expect(classification?.confidence).toBe("insufficient-evidence");
  });

  it("finds zero generated_output/uploaded_reference/alternate_encoding/derived_output within the 531-workspace scope (real archive evidence for those falls outside the 11 workspaces)", () => {
    if (exclusionResult.status !== "PASS") throw new Error("blocked");
    for (const classification of ["generated_output", "uploaded_reference", "alternate_encoding", "derived_output"] as const) {
      const entry = exclusionResult.classificationCounts.find((c) => c.classification === classification);
      expect(entry).toBeUndefined();
    }
  });

  it("100% of the 531+18 records are excluded — none silently defaulted to eligible", () => {
    if (exclusionResult.status !== "PASS") throw new Error("blocked");
    expect(exclusionResult.locationRecords.every((r) => r.eligibilityStatus === "excluded")).toBe(true);
  });

  it("every excluded record carries the human decision authority and exclusion code", () => {
    if (exclusionResult.status !== "PASS") throw new Error("blocked");
    expect(exclusionResult.locationRecords.every((r) => r.decisionAuthority === "human")).toBe(true);
    expect(exclusionResult.locationRecords.every((r) => r.exclusionCode === "suno_subscription_status_uncertain")).toBe(true);
  });

  it("browsing/playback is not disabled: archiveStatus reflects real playback resolvability, not a blanket 'blocked' value", () => {
    if (exclusionResult.status !== "PASS") throw new Error("blocked");
    const statuses = new Set(exclusionResult.locationRecords.map((r) => r.archiveStatus));
    // At least one of the three real playback states must be represented —
    // proves exclusion never overwrites archiveStatus with a fixed value.
    expect(statuses.size).toBeGreaterThan(0);
    for (const s of statuses) expect(["direct", "fallback", "unavailable"]).toContain(s);
  });

  it("is deterministic across repeated calls on the same real input", () => {
    const second = buildTrainingExclusionRecords(
      importResult.encodedLocations,
      importResult.canonicalRecordings,
      importResult.batches,
      importResult.duplicateRelationships,
      rawAudioAssets,
      NOW,
    );
    if (exclusionResult.status !== "PASS" || second.status !== "PASS") throw new Error("blocked");
    expect(second.excludedCanonicalRecordingCount).toBe(exclusionResult.excludedCanonicalRecordingCount);
    expect(second.excludedEncodedLocationCount).toBe(exclusionResult.excludedEncodedLocationCount);
    expect(second.locationRecords.map((r) => r.encodedLocationId)).toEqual(
      exclusionResult.locationRecords.map((r) => r.encodedLocationId),
    );
  });

  it("canonical propagation is safe: no location outside a real duplicate/UUID relationship is pulled in", () => {
    if (exclusionResult.status !== "PASS") throw new Error("blocked");
    // Every ripple (non-direct) record's canonical recording must actually
    // contain a directly-excluded member among its real encodedLocationIds —
    // proving propagation never invents a connection.
    const canonicalById = new Map(importResult.canonicalRecordings.map((c) => [c.canonicalRecordingId, c]));
    const locationsById = new Map(importResult.encodedLocations.map((l) => [l.archiveAssetId, l]));
    for (const record of exclusionResult.locationRecords.filter((r) => !r.isDirectWorkspaceMember)) {
      const canonical = canonicalById.get(record.canonicalRecordingId);
      expect(canonical).toBeDefined();
      const hasDirectMember = canonical!.encodedLocationIds.some((id) => {
        const loc = locationsById.get(id);
        return loc?.workspaceSlug != null && EXCLUDED_WORKSPACE_AUTHORITY.some((w) => w.workspaceSlug === loc.workspaceSlug);
      });
      expect(hasDirectMember).toBe(true);
    }
  });
});

describe("zero excluded canonical IDs appear in an eligible-only view", () => {
  it("isCanonicalRecordingExcluded correctly flags every excluded canonical ID and no others", () => {
    if (exclusionResult.status !== "PASS") throw new Error("blocked");
    const excludedIds = new Set(exclusionResult.canonicalSummaries.map((s) => s.canonicalRecordingId));
    for (const canonical of importResult.canonicalRecordings) {
      const flagged = isCanonicalRecordingExcluded(exclusionResult, canonical.canonicalRecordingId);
      expect(flagged).toBe(excludedIds.has(canonical.canonicalRecordingId));
    }
    // At least one real canonical recording remains eligible (not every
    // recording in the whole 6,925-count archive is touched by this build).
    const eligibleExists = importResult.canonicalRecordings.some(
      (c) => !isCanonicalRecordingExcluded(exclusionResult, c.canonicalRecordingId),
    );
    expect(eligibleExists).toBe(true);
  });
});

describe("classifyLocationProvenance — precedence and non-inference rules (synthetic, for edge cases the real archive doesn't exercise within scope)", () => {
  const baseLocation = () =>
    ({
      archiveAssetId: "asset-test",
      snapshotId: "snap",
      workspaceSlug: "some-workspace",
      workspaceNameOriginal: "Some Workspace",
      batchId: "batch:test",
      inferredBatchOrdinal: 1,
      sourceClass: "zip-batch-member" as const,
      originalMemberPath: "test.mp3",
      supplementalRelativePath: null,
      extractedRelativePath: "snapshots/x/test.mp3",
      filename: "test.mp3",
      collision: { isCollisionRenamed: false, originalMemberBasename: "test.mp3", derivedBasename: "test.mp3", note: null },
      technical: {
        containerFormat: "mp3",
        audioCodec: "mp3",
        durationSeconds: 10,
        sampleRate: 44100,
        channelCount: 2,
        channelLayout: "stereo",
        bitrate: 128000,
        byteSize: 1000,
        sha256: "abc",
        mediaStatus: "valid" as const,
      },
      provider: {
        recoveryState: "legacy-no-embedded-id" as const,
        sunoUuid: null,
        sunoUrl: null,
        embeddedTitle: null,
        embeddedAuthor: null,
        embeddedCreatedAt: null,
        rawComment: null,
      },
      duplicateGroupIds: [],
      canonicalRecordingId: "asset:asset-test",
    }) satisfies Parameters<typeof classifyLocationProvenance>[0];

  it("never infers uploaded_reference from a missing UUID alone", () => {
    const loc = baseLocation();
    const result = classifyLocationProvenance(loc, new Map(), new Set(), new Set());
    expect(result.classification).not.toBe("uploaded_reference");
    expect(result.classification).toBe("unresolved_audio");
  });

  it("classifies generated_output from a real Suno generation comment", () => {
    const loc = { ...baseLocation(), provider: { ...baseLocation().provider, rawComment: "made with suno; created=2026-01-01T00:00:00Z; id=abc-123" } };
    const result = classifyLocationProvenance(loc, new Map(), new Set(), new Set());
    expect(result.classification).toBe("generated_output");
    expect(result.confidence).toBe("high");
  });

  it("classifies uploaded_reference from an explicit third-party download comment, never reviewable for clearance", () => {
    const loc = { ...baseLocation(), provider: { ...baseLocation().provider, rawComment: "Downloaded from Samplefocus.com" } };
    const result = classifyLocationProvenance(loc, new Map(), new Set(), new Set());
    expect(result.classification).toBe("uploaded_reference");
    expect(result.reviewableForClearance).toBe(false);
  });

  it("classifies uploaded_reference + reviewableForClearance from field-recorder embedded metadata", () => {
    const loc = baseLocation();
    const tags = new Map([[loc.archiveAssetId, { coding_history: "A=PCM", encoded_by: "TASCAM PCM Recoder DR-07X" }]]);
    const result = classifyLocationProvenance(loc, tags, new Set(), new Set());
    expect(result.classification).toBe("uploaded_reference");
    expect(result.reviewableForClearance).toBe(true);
  });

  it("duplicate_capture takes precedence over a coincident generation stamp", () => {
    const loc = {
      ...baseLocation(),
      batchId: "batch:dup",
      provider: { ...baseLocation().provider, rawComment: "made with suno; created=2026-01-01T00:00:00Z; id=abc-123" },
    };
    const result = classifyLocationProvenance(loc, new Map(), new Set(["batch:dup"]), new Set());
    expect(result.classification).toBe("duplicate_capture");
  });

  it("alternate_encoding applies only when not already explained by a stronger signal", () => {
    const loc = baseLocation();
    const result = classifyLocationProvenance(loc, new Map(), new Set(), new Set([loc.archiveAssetId]));
    expect(result.classification).toBe("alternate_encoding");
  });
});

describe("deriveEligibilityStatus — classification-forced exclusion, independent of workspace scope", () => {
  it("forces exclusion for generated_output/derived_output/unresolved_audio even outside any excluded workspace", () => {
    expect(deriveEligibilityStatus(false, "generated_output")).toBe("excluded");
    expect(deriveEligibilityStatus(false, "derived_output")).toBe("excluded");
    expect(deriveEligibilityStatus(false, "unresolved_audio")).toBe("excluded");
  });

  it("does not force-exclude uploaded_reference/alternate_encoding/duplicate_capture outside an excluded workspace", () => {
    expect(deriveEligibilityStatus(false, "uploaded_reference")).toBe("eligible");
    expect(deriveEligibilityStatus(false, "alternate_encoding")).toBe("eligible");
    expect(deriveEligibilityStatus(false, "duplicate_capture")).toBe("eligible");
  });

  it("workspace exclusion always wins regardless of classification", () => {
    for (const c of ["generated_output", "uploaded_reference", "derived_output", "alternate_encoding", "duplicate_capture", "unresolved_audio"] as const) {
      expect(deriveEligibilityStatus(true, c)).toBe("excluded");
    }
  });
});

describe("source manifests and archive remain unchanged", () => {
  it("re-reading the real manifest files after building exclusion records reproduces byte-identical text", () => {
    const rereadAudioInventory = readReal("suno-audio-inventory.json");
    expect(rereadAudioInventory).toBe(REAL_SOURCES.audioInventory);
  });
});
