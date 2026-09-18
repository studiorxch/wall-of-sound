import { describe, it, expect } from "vitest";
import {
  addFootprintVertex,
  clearFootprint,
  moveFootprintVertex,
  removeFootprintVertex,
  roundLocalPoint,
} from "./stationGeometryEditGeometry";

describe("addFootprintVertex", () => {
  it("turns an unauthored (undefined) footprint into a real one-point start", () => {
    const result = addFootprintVertex(undefined, { x: 1, y: 2 });
    expect(result).toEqual([{ x: 1, y: 2 }]);
  });

  it("appends to an existing footprint without mutating the input array", () => {
    const original = [{ x: 0, y: 0 }];
    const result = addFootprintVertex(original, { x: 5, y: 5 });
    expect(result).toEqual([{ x: 0, y: 0 }, { x: 5, y: 5 }]);
    expect(original).toEqual([{ x: 0, y: 0 }]); // unchanged
  });
});

describe("moveFootprintVertex", () => {
  it("replaces the vertex at the given index", () => {
    const footprint = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }];
    const result = moveFootprintVertex(footprint, 1, { x: 9, y: 9 });
    expect(result).toEqual([{ x: 0, y: 0 }, { x: 9, y: 9 }, { x: 2, y: 2 }]);
  });

  it("is a no-op for an out-of-range index (returns the same reference)", () => {
    const footprint = [{ x: 0, y: 0 }];
    expect(moveFootprintVertex(footprint, 5, { x: 9, y: 9 })).toBe(footprint);
    expect(moveFootprintVertex(footprint, -1, { x: 9, y: 9 })).toBe(footprint);
  });
});

describe("removeFootprintVertex", () => {
  it("removes exactly the vertex at the given index", () => {
    const footprint = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }];
    const result = removeFootprintVertex(footprint, 1);
    expect(result).toEqual([{ x: 0, y: 0 }, { x: 2, y: 2 }]);
  });

  it("is a no-op for an out-of-range index", () => {
    const footprint = [{ x: 0, y: 0 }];
    expect(removeFootprintVertex(footprint, 5)).toBe(footprint);
  });
});

describe("clearFootprint", () => {
  it("always returns undefined — never an empty array standing in for 'not authored'", () => {
    expect(clearFootprint()).toBeUndefined();
  });
});

describe("roundLocalPoint", () => {
  it("rounds to millimeter precision without changing the point's meaning", () => {
    expect(roundLocalPoint({ x: 1.23456, y: -7.89123 })).toEqual({ x: 1.235, y: -7.891 });
  });
});

describe("footprint edit sequence (integration of the pure ops, mirroring real editor usage)", () => {
  it("draws a triangle from undefined, edits one vertex, then deletes another, ending with the expected 2-point shape", () => {
    let footprint: { x: number; y: number }[] | undefined = undefined;
    footprint = addFootprintVertex(footprint, { x: 0, y: 0 });
    footprint = addFootprintVertex(footprint, { x: 10, y: 0 });
    footprint = addFootprintVertex(footprint, { x: 5, y: 3 });
    expect(footprint).toHaveLength(3);

    footprint = moveFootprintVertex(footprint, 2, { x: 5, y: 4 });
    expect(footprint[2]).toEqual({ x: 5, y: 4 });

    footprint = removeFootprintVertex(footprint, 1);
    expect(footprint).toEqual([{ x: 0, y: 0 }, { x: 5, y: 4 }]);

    const cleared = clearFootprint();
    expect(cleared).toBeUndefined();
  });
});
