import { describe, it, expect } from "vitest";
import {
  defaultLibraryGridPreferences, reconcileLibraryGridPreferences, restoreDefaultLibraryGridPreferences,
  clampColumnWidth, computeAutoFitWidth, LIBRARY_COLUMN_REGISTRY, REQUIRED_COLUMN_ID,
} from "./libraryColumns";

const NOW = "2026-07-21T00:00:00.000Z";

describe("defaultLibraryGridPreferences", () => {
  it("includes every registry column, title first, for Catalog (studiorich) with none hidden by default", () => {
    const prefs = defaultLibraryGridPreferences("studiorich", NOW);
    expect(prefs.columnOrder[0]).toBe(REQUIRED_COLUMN_ID);
    expect(prefs.columnOrder).toHaveLength(LIBRARY_COLUMN_REGISTRY.length);
    expect(prefs.columns.every((c) => c.visible)).toBe(true);
  });

  it("includes every registry column for External with none hidden by default", () => {
    const prefs = defaultLibraryGridPreferences("external", NOW);
    expect(prefs.columns.every((c) => c.visible)).toBe(true);
  });

  it("Sounds (reference) starts with bpm/key/suggested/mechanical hidden but still present in columnOrder", () => {
    const prefs = defaultLibraryGridPreferences("reference", NOW);
    expect(prefs.columnOrder).toHaveLength(LIBRARY_COLUMN_REGISTRY.length);
    for (const id of ["bpm", "key", "suggested", "mechanical"] as const) {
      expect(prefs.columns.find((c) => c.id === id)?.visible).toBe(false);
    }
    for (const id of ["title", "artist", "genre", "duration", "comments"] as const) {
      expect(prefs.columns.find((c) => c.id === id)?.visible).toBe(true);
    }
  });
});

describe("clampColumnWidth", () => {
  it("clamps below min up to min", () => {
    expect(clampColumnWidth("bpm", 1)).toBeGreaterThanOrEqual(50);
  });
  it("clamps above max down to max", () => {
    expect(clampColumnWidth("bpm", 9999)).toBeLessThanOrEqual(100);
  });
  it("passes through an in-range value unchanged (rounded)", () => {
    expect(clampColumnWidth("bpm", 70.4)).toBe(70);
  });
});

describe("reconcileLibraryGridPreferences", () => {
  it("falls back wholesale to this library's defaults for a non-object value", () => {
    const result = reconcileLibraryGridPreferences(null, "studiorich", NOW);
    expect(result).toEqual(defaultLibraryGridPreferences("studiorich", NOW));
  });

  it("falls back to Sounds' own defaults (not Catalog's) for a non-object value", () => {
    const result = reconcileLibraryGridPreferences(null, "reference", NOW);
    expect(result).toEqual(defaultLibraryGridPreferences("reference", NOW));
    expect(result.columns.find((c) => c.id === "bpm")?.visible).toBe(false);
  });

  it("drops unknown column ids from both order and columns", () => {
    const result = reconcileLibraryGridPreferences({
      version: 1,
      columnOrder: ["title", "ghost_column", "bpm"],
      columns: [{ id: "ghost_column", visible: true, width: 500 }, { id: "bpm", visible: true, width: 70 }],
      sort: [],
      density: "comfortable",
      updatedAt: NOW,
    }, "studiorich", NOW);
    expect(result.columnOrder).not.toContain("ghost_column");
    expect(result.columns.find((c) => c.id === ("ghost_column" as never))).toBeUndefined();
  });

  it("drops duplicate column entries, keeping only the first", () => {
    const result = reconcileLibraryGridPreferences({
      version: 1,
      columnOrder: ["title", "bpm", "bpm"],
      columns: [{ id: "bpm", visible: true, width: 70 }, { id: "bpm", visible: false, width: 90 }],
      sort: [],
      density: "comfortable",
      updatedAt: NOW,
    }, "studiorich", NOW);
    expect(result.columnOrder.filter((id) => id === "bpm")).toHaveLength(1);
  });

  it("appends a newly-added registry column missing from a stale stored record, visible at its default width", () => {
    const stale = {
      version: 1,
      columnOrder: ["title", "bpm"],
      columns: [{ id: "title", visible: true, width: 220 }, { id: "bpm", visible: true, width: 70 }],
      sort: [],
      density: "comfortable",
      updatedAt: NOW,
    };
    const result = reconcileLibraryGridPreferences(stale, "studiorich", NOW);
    expect(result.columnOrder).toContain("comments");
    const comments = result.columns.find((c) => c.id === "comments");
    expect(comments?.visible).toBe(true);
  });

  it("a Sounds record migrated from before Comments existed gets Comments visible by default (not silently hidden)", () => {
    const stale = {
      version: 1,
      columnOrder: ["title", "genre"],
      columns: [{ id: "title", visible: true, width: 220 }, { id: "genre", visible: true, width: 110 }],
      sort: [],
      density: "comfortable",
      updatedAt: NOW,
    };
    const result = reconcileLibraryGridPreferences(stale, "reference", NOW);
    expect(result.columns.find((c) => c.id === "comments")?.visible).toBe(true);
  });

  it("always keeps the required identity column visible and first, even if stored as hidden/reordered", () => {
    const corrupt = {
      version: 1,
      columnOrder: ["bpm", "title"],
      columns: [{ id: "title", visible: false, width: 220 }, { id: "bpm", visible: true, width: 70 }],
      sort: [],
      density: "comfortable",
      updatedAt: NOW,
    };
    const result = reconcileLibraryGridPreferences(corrupt, "studiorich", NOW);
    expect(result.columnOrder[0]).toBe(REQUIRED_COLUMN_ID);
    expect(result.columns.find((c) => c.id === REQUIRED_COLUMN_ID)?.visible).toBe(true);
  });

  it("clamps an out-of-range stored width", () => {
    const result = reconcileLibraryGridPreferences({
      version: 1,
      columnOrder: ["title", "bpm"],
      columns: [{ id: "bpm", visible: true, width: 99999 }],
      sort: [],
      density: "comfortable",
      updatedAt: NOW,
    }, "studiorich", NOW);
    const bpm = result.columns.find((c) => c.id === "bpm");
    expect(bpm!.width).toBeLessThanOrEqual(100);
  });

  it("drops invalid sort entries but keeps valid ones", () => {
    const result = reconcileLibraryGridPreferences({
      version: 1,
      columnOrder: ["title"],
      columns: [],
      sort: [{ columnId: "bpm", direction: "desc" }, { columnId: "ghost", direction: "asc" }, { columnId: "bpm", direction: "sideways" }],
      density: "comfortable",
      updatedAt: NOW,
    }, "studiorich", NOW);
    expect(result.sort).toEqual([{ columnId: "bpm", direction: "desc" }]);
  });
});

describe("restoreDefaultLibraryGridPreferences", () => {
  it("is identical to this library's fresh default", () => {
    expect(restoreDefaultLibraryGridPreferences("studiorich", NOW)).toEqual(defaultLibraryGridPreferences("studiorich", NOW));
    expect(restoreDefaultLibraryGridPreferences("reference", NOW)).toEqual(defaultLibraryGridPreferences("reference", NOW));
  });
});

describe("computeAutoFitWidth", () => {
  const measure = (text: string) => text.length * 7; // deterministic fake measurer

  it("fits to the widest of header/cell text, clamped to the column's bounds", () => {
    const width = computeAutoFitWidth("bpm", "BPM", ["120", "95"], measure, 10);
    expect(width).toBeGreaterThanOrEqual(measure("BPM") + 10);
    expect(width).toBeLessThanOrEqual(100); // bpm's maxWidth
  });

  it("never returns less than the column minWidth even for very short content", () => {
    const width = computeAutoFitWidth("title", "T", ["A"], measure, 0);
    expect(width).toBeGreaterThanOrEqual(120); // title's minWidth
  });
});
