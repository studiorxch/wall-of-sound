import { describe, expect, it } from "vitest";
import { StrokeHistory } from "./StrokeHistory";
import { type StrokePoint } from "./types";
import { applyPan, applyZoomAroundPoint, resetWallView, wallToScreen } from "./WallView";

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

  it("restores the complete pre-clear stroke state with one undo", () => {
    const history = new StrokeHistory();
    for (let index = 0; index < 2; index += 1) {
      history.begin({ color: index ? "#f00" : "#fff", capId: "needle" });
      history.appendPoint(point(index));
      history.finalize();
    }

    expect(history.clearUndoably()).toBe(true);
    expect(history.snapshot()).toEqual([]);
    expect(history.canUndo()).toBe(true);
    expect(history.undo().map((stroke) => stroke.id)).toEqual([1, 2]);
    expect(history.undo().map((stroke) => stroke.id)).toEqual([1]);
  });

  it("preserves wall coordinates through transformed replay, Undo, and Clear restoration", () => {
    const history = new StrokeHistory();
    history.begin({ color: "#fff", capId: "needle" });
    history.appendPoint(point(120));
    history.finalize();
    history.begin({ color: "#f00", capId: "needle" });
    history.appendPoint(point(300));
    history.finalize();
    const view = applyPan(applyZoomAroundPoint(resetWallView(), 2, { x: 0, y: 0 }), -50, 80);

    expect(history.snapshot().map((stroke) => wallToScreen(view, stroke.points[0]))).toEqual([
      { x: 190, y: 100 },
      { x: 550, y: 100 },
    ]);
    expect(history.undo().map((stroke) => stroke.id)).toEqual([1]);
    expect(history.clearUndoably()).toBe(true);
    expect(history.undo()[0].points[0].x).toBe(120);
  });
});
