import { describe, expect, it } from "vitest";
import { cycleSunoSort, applySunoSort } from "./sunoSorting";

describe("cycleSunoSort", () => {
  it("cycles none -> asc -> desc -> none for the same column", () => {
    let key = cycleSunoSort(null, "bpm");
    expect(key).toEqual({ columnId: "bpm", direction: "asc" });
    key = cycleSunoSort(key, "bpm");
    expect(key).toEqual({ columnId: "bpm", direction: "desc" });
    key = cycleSunoSort(key, "bpm");
    expect(key).toBeNull();
  });

  it("switching to a different column resets to asc", () => {
    const key = cycleSunoSort({ columnId: "bpm", direction: "desc" }, "energy");
    expect(key).toEqual({ columnId: "energy", direction: "asc" });
  });
});

describe("applySunoSort", () => {
  const rows = [
    { id: "a", bpm: 120 },
    { id: "b", bpm: null },
    { id: "c", bpm: 90 },
    { id: "d", bpm: 150 },
  ];
  const getValue = (r: (typeof rows)[number], col: string) => (col === "bpm" ? r.bpm : null);

  it("returns records unchanged (same order) when sortKey is null", () => {
    expect(applySunoSort(rows, null, getValue)).toEqual(rows);
  });

  it("sorts ascending, nulls always last", () => {
    const sorted = applySunoSort(rows, { columnId: "bpm", direction: "asc" }, getValue);
    expect(sorted.map((r) => r.id)).toEqual(["c", "a", "d", "b"]);
  });

  it("sorts descending, nulls still always last", () => {
    const sorted = applySunoSort(rows, { columnId: "bpm", direction: "desc" }, getValue);
    expect(sorted.map((r) => r.id)).toEqual(["d", "a", "c", "b"]);
  });

  it("is stable for equal values", () => {
    const tied = [{ id: "x", bpm: 100 }, { id: "y", bpm: 100 }];
    const sorted = applySunoSort(tied, { columnId: "bpm", direction: "asc" }, getValue);
    expect(sorted.map((r) => r.id)).toEqual(["x", "y"]);
  });
});
