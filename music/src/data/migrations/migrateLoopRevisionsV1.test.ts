import { describe, it, expect } from "vitest";
import { migrateApprovedLoopsToRevisionsV1 } from "./migrateLoopRevisionsV1";
import type { PlayProject } from "../playProjectTypes";
import type { LoopAsset } from "../loopTypes";

function baseProject(overrides: Partial<PlayProject> = {}): PlayProject {
  return {
    schemaVersion: "play-project-v2",
    libraryTracks: [],
    activePlaylistId: "p1",
    playlists: [],
    excludedTrackIds: [],
    createdAt: "t0",
    updatedAt: "t0",
    ...overrides,
  };
}

function approvedLoop(overrides: Partial<LoopAsset> = {}): LoopAsset {
  return {
    id: "loop_1", sourceKind: "track", sourceTrackId: "t1",
    title: "Groove A", sourceTitle: "Track One",
    startSeconds: 20.62, endSeconds: 41.24, durationSeconds: 20.62,
    boundarySource: "manual", contentClass: "unknown",
    status: "approved", warnings: [], createdAt: "t0", updatedAt: "t0",
    loopFilePath: "/rendered/groove_a.wav",
    ...overrides,
  };
}

describe("migrateApprovedLoopsToRevisionsV1", () => {
  it("synthesizes a v1 revision for an approved loop with no existing revision", () => {
    const project = baseProject({ loops: [approvedLoop()] });
    const migrated = migrateApprovedLoopsToRevisionsV1(project);

    expect(migrated.loopRevisionsMigrationVersion).toBe(1);
    expect(migrated.loopRevisions).toHaveLength(1);
    const rev = migrated.loopRevisions![0];
    expect(rev.loopId).toBe("loop_1");
    expect(rev.startFrame).toBeGreaterThan(0);

    const loop = migrated.loops!.find((l) => l.id === "loop_1")!;
    expect(loop.activeRevisionId).toBe(rev.id);
    // Preserves id and rendered path exactly (§37).
    expect(loop.id).toBe("loop_1");
    expect(loop.loopFilePath).toBe("/rendered/groove_a.wav");
  });

  it("preserves exact frames derived from the loop's own stored seconds and the track's sample rate", () => {
    const project = baseProject({
      loops: [approvedLoop({ startSeconds: 1, endSeconds: 2 })],
      libraryTracks: [{ trackId: "t1", audioAnalysis: { sampleRate: 48000 } } as any],
    });
    const migrated = migrateApprovedLoopsToRevisionsV1(project);
    const rev = migrated.loopRevisions![0];
    expect(rev.startFrame).toBe(48000);
    expect(rev.endFrame).toBe(96000);
  });

  it("does not touch candidate/rejected loops", () => {
    const project = baseProject({ loops: [approvedLoop({ id: "loop_2", status: "rejected" })] });
    const migrated = migrateApprovedLoopsToRevisionsV1(project);
    expect(migrated.loopRevisions ?? []).toHaveLength(0);
    expect(migrated.loops![0].activeRevisionId).toBeUndefined();
  });

  it("is idempotent: running it twice does not create duplicate revisions", () => {
    const project = baseProject({ loops: [approvedLoop()] });
    const once = migrateApprovedLoopsToRevisionsV1(project);
    const twice = migrateApprovedLoopsToRevisionsV1(once);
    expect(twice.loopRevisions).toHaveLength(1);
    expect(twice).toBe(once); // version gate short-circuits to the same object
  });

  it("is a per-loop no-op when a loop already has an activeRevisionId, even without the version gate", () => {
    const project = baseProject({
      loops: [approvedLoop({ activeRevisionId: "rev_existing" })],
      loopRevisionsMigrationVersion: 0, // simulate: gate not yet set, but loop already revisioned
    });
    const migrated = migrateApprovedLoopsToRevisionsV1(project);
    expect(migrated.loopRevisions ?? []).toHaveLength(0);
    expect(migrated.loops![0].activeRevisionId).toBe("rev_existing");
  });

  it("leaves a project with no loops untouched apart from setting the version marker", () => {
    const project = baseProject();
    const migrated = migrateApprovedLoopsToRevisionsV1(project);
    expect(migrated.loopRevisionsMigrationVersion).toBe(1);
    expect(migrated.loopRevisions ?? []).toHaveLength(0);
  });
});
