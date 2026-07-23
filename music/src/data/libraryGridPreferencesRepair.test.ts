import { describe, it, expect } from "vitest";
import { repairStoredProject } from "./playProjectStorage";
import type { PlayProject } from "./playProjectTypes";

function baseProject(overrides: Partial<PlayProject> = {}): PlayProject {
  const ts = "2026-07-21T00:00:00.000Z";
  return {
    activePlaylistId: "pl_1",
    playlists: [{
      playlistId: "pl_1", title: "P", sourceGroupId: "g", allowCrossGroupAutofill: false,
      slots: [], curve: { curveId: "c", name: "n", presetType: "elegant_nested_arc", targetDurationSeconds: 60, points: [] },
      locks: [], orphans: [], targetDurationMinutes: 1, manualOrderDirty: false,
      createdAt: ts, updatedAt: ts, preservedGapSlotIds: [], playlistRole: "static", colorThemes: [],
    }],
    libraryTracks: [],
    excludedTrackIds: [],
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  } as unknown as PlayProject;
}

describe("libraryGridPreferences repair — independent per-library records", () => {
  it("creates a reconciled record for all three libraries even when the field is entirely absent", () => {
    const repaired = repairStoredProject(baseProject());
    expect(repaired.libraryGridPreferences?.studiorich).toBeTruthy();
    expect(repaired.libraryGridPreferences?.external).toBeTruthy();
    expect(repaired.libraryGridPreferences?.reference).toBeTruthy();
  });

  it("Sounds (reference) gets its own default-hidden-columns applied even when generated fresh", () => {
    const repaired = repairStoredProject(baseProject());
    const soundsPrefs = repaired.libraryGridPreferences!.reference!;
    expect(soundsPrefs.columns.find((c) => c.id === "bpm")?.visible).toBe(false);
  });

  it("a stored Catalog layout customization is preserved and never bleeds into External or Sounds", () => {
    const customCatalog = {
      version: 1,
      columnOrder: ["title", "bpm"],
      columns: [{ id: "title", visible: true, width: 220 }, { id: "bpm", visible: true, width: 999 }],
      sort: [{ columnId: "bpm", direction: "desc" }],
      density: "compact",
      updatedAt: "2026-07-20T00:00:00.000Z",
    };
    const repaired = repairStoredProject(baseProject({
      libraryGridPreferences: { studiorich: customCatalog as never },
    }));
    expect(repaired.libraryGridPreferences!.studiorich!.sort).toEqual([{ columnId: "bpm", direction: "desc" }]);
    expect(repaired.libraryGridPreferences!.studiorich!.density).toBe("compact");
    // External/Sounds must not have inherited Catalog's custom sort/density —
    // this is the structural guarantee the map shape (vs. a single shared
    // record) is meant to provide.
    expect(repaired.libraryGridPreferences!.external!.sort).toEqual([]);
    expect(repaired.libraryGridPreferences!.external!.density).toBe("comfortable");
    expect(repaired.libraryGridPreferences!.reference!.sort).toEqual([]);
  });

  it("changing External's layout does not touch Catalog's or Sounds' stored record", () => {
    const customExternal = {
      version: 1,
      columnOrder: ["title", "artist"],
      columns: [{ id: "title", visible: true, width: 220 }, { id: "artist", visible: false, width: 90 }],
      sort: [{ columnId: "artist", direction: "asc" }],
      density: "comfortable",
      updatedAt: "2026-07-20T00:00:00.000Z",
    };
    const repaired = repairStoredProject(baseProject({
      libraryGridPreferences: { external: customExternal as never },
    }));
    expect(repaired.libraryGridPreferences!.external!.sort).toEqual([{ columnId: "artist", direction: "asc" }]);
    expect(repaired.libraryGridPreferences!.studiorich!.sort).toEqual([]);
    expect(repaired.libraryGridPreferences!.reference!.sort).toEqual([]);
  });

  it("migrates a legacy singular catalogGridPreferences record (pre-shared-grid) into libraryGridPreferences.studiorich", () => {
    const legacyShape = {
      version: 1,
      columnOrder: ["title", "genre"],
      columns: [{ id: "title", visible: true, width: 260 }, { id: "genre", visible: true, width: 150 }],
      sort: [{ columnId: "genre", direction: "asc" }],
      density: "compact",
      updatedAt: "2026-07-21T09:00:00.000Z",
    };
    const legacyProject = { ...baseProject(), catalogGridPreferences: legacyShape } as unknown as PlayProject;
    const repaired = repairStoredProject(legacyProject);
    expect(repaired.libraryGridPreferences!.studiorich!.sort).toEqual([{ columnId: "genre", direction: "asc" }]);
    expect(repaired.libraryGridPreferences!.studiorich!.density).toBe("compact");
    // The old field name must not survive on the repaired object.
    expect((repaired as unknown as { catalogGridPreferences?: unknown }).catalogGridPreferences).toBeUndefined();
  });

  it("a migrated Catalog layout gains the Comments column visible, since it predates that column", () => {
    const legacyShape = {
      version: 1,
      columnOrder: ["title", "genre"],
      columns: [{ id: "title", visible: true, width: 260 }, { id: "genre", visible: true, width: 150 }],
      sort: [],
      density: "comfortable",
      updatedAt: "2026-07-21T09:00:00.000Z",
    };
    const legacyProject = { ...baseProject(), catalogGridPreferences: legacyShape } as unknown as PlayProject;
    const repaired = repairStoredProject(legacyProject);
    expect(repaired.libraryGridPreferences!.studiorich!.columns.find((c) => c.id === "comments")?.visible).toBe(true);
  });

  it("does not overwrite an already-present libraryGridPreferences.studiorich with a stale legacy field", () => {
    const alreadyMigrated = {
      version: 1, columnOrder: ["title"], columns: [{ id: "title", visible: true, width: 220 }],
      sort: [{ columnId: "title", direction: "desc" }], density: "comfortable", updatedAt: "2026-07-21T10:00:00.000Z",
    };
    const staleLegacy = {
      version: 1, columnOrder: ["title"], columns: [{ id: "title", visible: true, width: 220 }],
      sort: [], density: "comfortable", updatedAt: "2026-07-20T00:00:00.000Z",
    };
    const project = {
      ...baseProject(),
      libraryGridPreferences: { studiorich: alreadyMigrated },
      catalogGridPreferences: staleLegacy,
    } as unknown as PlayProject;
    const repaired = repairStoredProject(project);
    expect(repaired.libraryGridPreferences!.studiorich!.sort).toEqual([{ columnId: "title", direction: "desc" }]);
  });
});
