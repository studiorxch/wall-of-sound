import { describe, it, expect } from "vitest";
import { applyLibrarySort, cycleSingleColumnSort, cycleMultiColumnSort, sortPriorityForColumn } from "./librarySorting";
import type { Track } from "../../data/trackTypes";
import type { LibrarySortKey } from "../../data/libraryGridTypes";

function track(overrides: Partial<Track> & { trackId: string }): Track {
  return {
    title: "Untitled", artist: "Unknown", durationSeconds: 100, energy: 0.5, energySource: "manual",
    ...overrides,
  } as Track;
}

describe("applyLibrarySort — canonical default", () => {
  it("returns tracks unchanged when no sort keys are active", () => {
    const tracks = [track({ trackId: "b", title: "B" }), track({ trackId: "a", title: "A" })];
    expect(applyLibrarySort(tracks, [])).toEqual(tracks);
  });
});

describe("applyLibrarySort — single key, ascending/descending", () => {
  const tracks = [
    track({ trackId: "t1", bpm: 128 }),
    track({ trackId: "t2", bpm: 100 }),
    track({ trackId: "t3", bpm: 140 }),
  ];
  it("ascending", () => {
    const sorted = applyLibrarySort(tracks, [{ columnId: "bpm", direction: "asc" }]);
    expect(sorted.map((t) => t.trackId)).toEqual(["t2", "t1", "t3"]);
  });
  it("descending", () => {
    const sorted = applyLibrarySort(tracks, [{ columnId: "bpm", direction: "desc" }]);
    expect(sorted.map((t) => t.trackId)).toEqual(["t3", "t1", "t2"]);
  });
});

describe("applyLibrarySort — deterministic null handling", () => {
  it("always places missing BPM last regardless of direction", () => {
    const tracks = [
      track({ trackId: "t1", bpm: 128 }),
      track({ trackId: "t2", bpm: undefined }),
      track({ trackId: "t3", bpm: 100 }),
    ];
    const asc = applyLibrarySort(tracks, [{ columnId: "bpm", direction: "asc" }]);
    expect(asc[asc.length - 1].trackId).toBe("t2");
    const desc = applyLibrarySort(tracks, [{ columnId: "bpm", direction: "desc" }]);
    expect(desc[desc.length - 1].trackId).toBe("t2");
  });
});

describe("applyLibrarySort — comments presence + alphabetical secondary", () => {
  it("groups commented tracks before uncommented, alphabetical within the group, never using length", () => {
    const tracks = [
      track({ trackId: "t1", notes: "zzz short" }),
      track({ trackId: "t2", notes: undefined }),
      track({ trackId: "t3", notes: "a much longer comment than zzz" }),
    ];
    const sorted = applyLibrarySort(tracks, [{ columnId: "comments", direction: "asc" }]);
    expect(sorted.map((t) => t.trackId)).toEqual(["t3", "t1", "t2"]); // "a..." < "zzz" alphabetically, length irrelevant
  });
  it("keeps the uncommented group last even when direction is descending", () => {
    const tracks = [
      track({ trackId: "t1", notes: "b" }),
      track({ trackId: "t2", notes: undefined }),
      track({ trackId: "t3", notes: "a" }),
    ];
    const sorted = applyLibrarySort(tracks, [{ columnId: "comments", direction: "desc" }]);
    expect(sorted.map((t) => t.trackId)).toEqual(["t1", "t3", "t2"]);
  });
});

describe("applyLibrarySort — multi-column priority + stable tie-break", () => {
  it("uses the second key only to break ties on the first", () => {
    const tracks = [
      track({ trackId: "t3", bpm: 120, title: "C" }),
      track({ trackId: "t1", bpm: 120, title: "A" }),
      track({ trackId: "t2", bpm: 100, title: "B" }),
    ];
    const keys: LibrarySortKey[] = [{ columnId: "bpm", direction: "asc" }, { columnId: "title", direction: "asc" }];
    const sorted = applyLibrarySort(tracks, keys);
    expect(sorted.map((t) => t.trackId)).toEqual(["t2", "t1", "t3"]);
  });

  it("never flickers for genuinely equal rows across repeated calls (stable trackId tie-break)", () => {
    const tracks = [
      track({ trackId: "t2", bpm: 120 }),
      track({ trackId: "t1", bpm: 120 }),
    ];
    const a = applyLibrarySort(tracks, [{ columnId: "bpm", direction: "asc" }]).map((t) => t.trackId);
    const b = applyLibrarySort(tracks, [{ columnId: "bpm", direction: "asc" }]).map((t) => t.trackId);
    expect(a).toEqual(b);
    expect(a).toEqual(["t1", "t2"]); // trackId ascending tie-break
  });
});

describe("cycleSingleColumnSort — ordinary click cycle", () => {
  it("first click ascends", () => {
    expect(cycleSingleColumnSort([], "bpm")).toEqual([{ columnId: "bpm", direction: "asc" }]);
  });
  it("second click descends", () => {
    expect(cycleSingleColumnSort([{ columnId: "bpm", direction: "asc" }], "bpm")).toEqual([{ columnId: "bpm", direction: "desc" }]);
  });
  it("third click returns to unsorted (canonical default order)", () => {
    expect(cycleSingleColumnSort([{ columnId: "bpm", direction: "desc" }], "bpm")).toEqual([]);
  });
  it("clicking a different column replaces the whole sort state (single-column mode)", () => {
    const keys: LibrarySortKey[] = [{ columnId: "bpm", direction: "asc" }, { columnId: "title", direction: "asc" }];
    expect(cycleSingleColumnSort(keys, "artist")).toEqual([{ columnId: "artist", direction: "asc" }]);
  });
});

describe("cycleMultiColumnSort — option/alt click", () => {
  it("adds a new column without clearing existing sort keys", () => {
    const keys: LibrarySortKey[] = [{ columnId: "bpm", direction: "asc" }];
    expect(cycleMultiColumnSort(keys, "title")).toEqual([{ columnId: "bpm", direction: "asc" }, { columnId: "title", direction: "asc" }]);
  });
  it("reverses an existing ascending key in place", () => {
    const keys: LibrarySortKey[] = [{ columnId: "bpm", direction: "asc" }, { columnId: "title", direction: "asc" }];
    expect(cycleMultiColumnSort(keys, "bpm")).toEqual([{ columnId: "bpm", direction: "desc" }, { columnId: "title", direction: "asc" }]);
  });
  it("removes a descending key, leaving other keys untouched", () => {
    const keys: LibrarySortKey[] = [{ columnId: "bpm", direction: "desc" }, { columnId: "title", direction: "asc" }];
    expect(cycleMultiColumnSort(keys, "bpm")).toEqual([{ columnId: "title", direction: "asc" }]);
  });
});

describe("sortPriorityForColumn", () => {
  it("returns 1-based priority for active multi-sort columns", () => {
    const keys: LibrarySortKey[] = [{ columnId: "bpm", direction: "asc" }, { columnId: "title", direction: "asc" }];
    expect(sortPriorityForColumn(keys, "bpm")).toBe(1);
    expect(sortPriorityForColumn(keys, "title")).toBe(2);
    expect(sortPriorityForColumn(keys, "artist")).toBeUndefined();
  });
});
