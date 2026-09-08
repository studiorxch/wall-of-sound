import { describe, expect, it } from "vitest";
import { StrokeHistory } from "./StrokeHistory";
import { type StrokePoint } from "./types";

const point = (x: number): StrokePoint => ({ x, y: 10, timestamp: x, velocity: 0, width: 10, opacity: 1 });

describe("stroke history", () => {
  it("undoes finalized strokes one at a time in reverse order", () => {
    const history = new StrokeHistory();
    history.begin({ color: "#fff", capId: "new-york-fat" });
    history.appendPoint(point(1));
    history.finalize();
    history.begin({ color: "#f00", capId: "needle" });
    history.appendPoint(point(2));
    history.finalize();

    expect(history.undo().map((stroke) => stroke.id)).toEqual([1]);
    expect(history.undo()).toEqual([]);
    expect(history.canUndo()).toBe(false);
  });

  it("does not commit an empty stroke and returns defensive snapshots", () => {
    const history = new StrokeHistory();
    history.begin({ color: "#fff", capId: "new-york-fat" });
    expect(history.finalize()).toBe(false);
    history.begin({ color: "#fff", capId: "new-york-fat" });
    history.appendPoint(point(1));
    history.finalize();
    const snapshot = history.snapshot();
    snapshot[0].points[0].x = 99;
    expect(history.snapshot()[0].points[0].x).toBe(1);
  });

  it("bounds undo depth without dropping older paint from replay", () => {
    const history = new StrokeHistory(2);
    for (let index = 0; index < 3; index += 1) {
      history.begin({ color: "#fff", capId: "needle" });
      history.appendPoint(point(index));
      history.finalize();
    }
    expect(history.snapshot().map((stroke) => stroke.id)).toEqual([1, 2, 3]);
    expect(history.size()).toBe(2);
    history.undo();
    history.undo();
    expect(history.canUndo()).toBe(false);
    expect(history.snapshot().map((stroke) => stroke.id)).toEqual([1]);
  });
});
