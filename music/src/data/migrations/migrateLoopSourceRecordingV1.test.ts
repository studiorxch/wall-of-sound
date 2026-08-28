import { describe, it, expect } from "vitest";
import { migrateLoopSourceRecordingV1 } from "./migrateLoopSourceRecordingV1";
import type { PlayProject } from "../playProjectTypes";
import type { LoopAsset } from "../loopTypes";
import type { Track } from "../trackTypes";

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

function track(overrides: Partial<Track> = {}): Track {
  return {
    trackId: "t1", title: "Track One", artist: "StudioRich",
    durationSeconds: 120, energy: 0.5, energySource: "estimated",
    sourceOwner: "studiorich",
    ...overrides,
  } as Track;
}

function legacyLoop(overrides: Partial<LoopAsset> = {}): LoopAsset {
  return {
    id: "loop_1", sourceKind: "track", sourceTrackId: "t1",
    title: "Groove A", sourceTitle: "Track One",
    startSeconds: 20.62, endSeconds: 41.24, durationSeconds: 20.62,
    boundarySource: "manual", contentClass: "unknown",
    status: "approved", warnings: [], createdAt: "t0", updatedAt: "t0",
    ...overrides,
  } as LoopAsset;
}

describe("migrateLoopSourceRecordingV1", () => {
  it("resolves sourceRecording from the matching track's sourceOwner (catalog)", () => {
    const project = baseProject({ loops: [legacyLoop()], libraryTracks: [track()] });
    const migrated = migrateLoopSourceRecordingV1(project);

    expect(migrated.loopSourceRecordingMigrationVersion).toBe(1);
    const loop = migrated.loops!.find((l) => l.id === "loop_1")!;
    expect(loop.sourceRecording).toEqual({ sourceLibrary: "catalog", recordingId: "t1" });
    expect(loop.needsReview).toBeFalsy();
    // Never rewrites the legacy field.
    expect(loop.sourceTrackId).toBe("t1");
  });

  it("resolves external and sounds the same way, via the real sourceOwner values", () => {
    const project = baseProject({
      loops: [
        legacyLoop({ id: "loop_ext", sourceTrackId: "t2" }),
        legacyLoop({ id: "loop_snd", sourceTrackId: "t3" }),
      ],
      libraryTracks: [
        track({ trackId: "t2", sourceOwner: "external" }),
        track({ trackId: "t3", sourceOwner: "reference" }),
      ],
    });
    const migrated = migrateLoopSourceRecordingV1(project);
    const loops = migrated.loops!;
    expect(loops.find((l) => l.id === "loop_ext")!.sourceRecording).toEqual({ sourceLibrary: "external", recordingId: "t2" });
    expect(loops.find((l) => l.id === "loop_snd")!.sourceRecording).toEqual({ sourceLibrary: "sounds", recordingId: "t3" });
  });

  it("leaves sourceRecording unset and flags needsReview when the source track is gone — never guesses", () => {
    const project = baseProject({ loops: [legacyLoop({ sourceTrackId: "deleted_track" })], libraryTracks: [] });
    const migrated = migrateLoopSourceRecordingV1(project);
    const loop = migrated.loops![0];
    expect(loop.sourceRecording).toBeUndefined();
    expect(loop.needsReview).toBe(true);
    // Still never rewrites the legacy field, even when unresolved.
    expect(loop.sourceTrackId).toBe("deleted_track");
  });

  it("leaves sourceRecording unset and flags needsReview when the track's sourceOwner is unknown — never guesses", () => {
    const project = baseProject({
      loops: [legacyLoop()],
      libraryTracks: [track({ sourceOwner: "unknown" })],
    });
    const migrated = migrateLoopSourceRecordingV1(project);
    const loop = migrated.loops![0];
    expect(loop.sourceRecording).toBeUndefined();
    expect(loop.needsReview).toBe(true);
  });

  it("backfills tags/purposeMemberships to empty arrays unconditionally, even when sourceRecording can't resolve", () => {
    const project = baseProject({ loops: [legacyLoop({ sourceTrackId: "deleted_track" })] });
    const migrated = migrateLoopSourceRecordingV1(project);
    const loop = migrated.loops![0];
    expect(loop.tags).toEqual([]);
    expect(loop.purposeMemberships).toEqual([]);
  });

  it("does not clobber a loop that already has needsReview set for an unrelated reason", () => {
    const project = baseProject({
      loops: [legacyLoop({ needsReview: true, sourceTrackId: "deleted_track" })],
    });
    const migrated = migrateLoopSourceRecordingV1(project);
    expect(migrated.loops![0].needsReview).toBe(true);
  });

  it("is idempotent: running it twice does not re-touch already-migrated loops", () => {
    const project = baseProject({ loops: [legacyLoop()], libraryTracks: [track()] });
    const once = migrateLoopSourceRecordingV1(project);
    const twice = migrateLoopSourceRecordingV1(once);
    expect(twice).toBe(once); // version gate short-circuits to the same object
  });

  it("is a per-loop no-op for a loop that already carries sourceRecording/tags/purposeMemberships, even without the version gate", () => {
    const project = baseProject({
      loops: [legacyLoop({ sourceRecording: { sourceLibrary: "catalog", recordingId: "t1" }, tags: ["drum loop"], purposeMemberships: ["production"] })],
      loopSourceRecordingMigrationVersion: 0,
    });
    const migrated = migrateLoopSourceRecordingV1(project);
    expect(migrated.loops![0].tags).toEqual(["drum loop"]);
    expect(migrated.loops![0].purposeMemberships).toEqual(["production"]);
  });

  it("leaves a project with no loops untouched apart from setting the version marker", () => {
    const project = baseProject();
    const migrated = migrateLoopSourceRecordingV1(project);
    expect(migrated.loopSourceRecordingMigrationVersion).toBe(1);
    expect(migrated.loops ?? []).toHaveLength(0);
  });
});
