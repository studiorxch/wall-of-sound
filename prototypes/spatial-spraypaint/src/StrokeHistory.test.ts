import { describe, expect, it } from "vitest";
import { StrokeHistory, type StrokeMetadata } from "./StrokeHistory";
import { type StrokePoint } from "./types";
import { applyPan, applyZoomAroundPoint, resetWallView, wallToScreen } from "./WallView";

const point = (x: number): StrokePoint => ({ x, y: 10, timestamp: x, velocity: 0, width: 10, opacity: 1 });
type MetadataOverrides = Partial<Omit<StrokeMetadata, "toolId" | "variantId">> & {
  toolId?: "spray-can" | "paint-marker";
  variantId?: StrokeMetadata["variantId"];
};

const metadata = (overrides: MetadataOverrides = {}): StrokeMetadata => {
  const shared = {
    color: overrides.color ?? "#fff",
    size: overrides.size ?? 10,
    inputSource: overrides.inputSource ?? "mouse",
  };
  return overrides.toolId === "paint-marker"
    ? { ...shared, toolId: "paint-marker", variantId: overrides.variantId === "chisel" || overrides.variantId === "clean-chisel" || overrides.variantId === "drippy-chisel" || overrides.variantId === "mop" || overrides.variantId === "drip-mop" ? overrides.variantId : "round" }
    : { ...shared, toolId: "spray-can", variantId: overrides.variantId === "round" || overrides.variantId === "chisel" || overrides.variantId === "clean-chisel" || overrides.variantId === "drippy-chisel" || overrides.variantId === "mop" || overrides.variantId === "drip-mop" ? "new-york-fat" : overrides.variantId ?? "new-york-fat" };
};

describe("stroke history", () => {
  it("undoes finalized strokes one at a time in reverse order", () => {
    const history = new StrokeHistory();
    history.begin(metadata());
    history.appendPoint(point(1));
    history.finalize();
    history.begin(metadata({ color: "#f00", variantId: "needle" }));
    history.appendPoint(point(2));
    history.finalize();

    expect(history.undo().map((stroke) => stroke.id)).toEqual([1]);
    expect(history.undo()).toEqual([]);
    expect(history.canUndo()).toBe(false);
  });

  it("does not commit an empty stroke and returns defensive snapshots", () => {
    const history = new StrokeHistory();
    history.begin(metadata());
    expect(history.finalize()).toBe(false);
    history.begin(metadata());
    history.appendPoint(point(1));
    history.finalize();
    const snapshot = history.snapshot();
    snapshot[0].points[0].x = 99;
    expect(history.snapshot()[0].points[0].x).toBe(1);
  });

  it("bounds undo depth without dropping older paint from replay", () => {
    const history = new StrokeHistory(2);
    for (let index = 0; index < 3; index += 1) {
      history.begin(metadata({ variantId: "needle" }));
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
      history.begin(metadata({ color: index ? "#f00" : "#fff", variantId: "needle" }));
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
    history.begin(metadata({ variantId: "needle" }));
    history.appendPoint(point(120));
    history.finalize();
    history.begin(metadata({ color: "#f00", variantId: "needle" }));
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

  it("renders an in-progress canonical stroke through view movement without splitting it", () => {
    const history = new StrokeHistory();
    history.begin(metadata({ variantId: "needle" }));
    history.appendPoint(point(120));
    const before = history.renderSnapshot();
    const movedView = applyPan(resetWallView(), -40, 20);
    const projected = before[0].points.map((storedPoint) => wallToScreen(movedView, storedPoint));

    expect(before).toHaveLength(1);
    expect(before[0].points[0]).toEqual(point(120));
    expect(projected[0]).toEqual({ x: 80, y: 30 });
    expect(before[0].points[0].width).toBe(10);

    history.appendPoint(point(180));
    expect(history.finalize()).toBe(true);
    expect(history.snapshot()).toHaveLength(1);
    expect(history.snapshot()[0].points.map(({ x }) => x)).toEqual([120, 180]);
  });

  it("replays, undoes, clears, and restores mixed Tool strokes", () => {
    const history = new StrokeHistory();
    history.begin(metadata({ toolId: "spray-can", variantId: "new-york-fat" }));
    history.appendPoint(point(20));
    history.finalize();
    history.begin(metadata({
      toolId: "paint-marker",
      variantId: "round",
      color: "#f00",
      size: 28,
      inputSource: "spatial",
    }));
    history.appendPoint(point(40));
    history.finalize();

    expect(history.snapshot().map(({ toolId, variantId }) => [toolId, variantId])).toEqual([
      ["spray-can", "new-york-fat"],
      ["paint-marker", "round"],
    ]);
    expect(history.undo().map(({ toolId }) => toolId)).toEqual(["spray-can"]);
    expect(history.clearUndoably()).toBe(true);
    expect(history.undo().map(({ toolId }) => toolId)).toEqual(["spray-can"]);
  });

  it("retains every marker identity and deterministic wet state defensively", () => {
    const history = new StrokeHistory();
    for (const variantId of ["round", "chisel", "clean-chisel", "drippy-chisel", "mop", "drip-mop"] as const) {
      history.begin(metadata({ toolId: "paint-marker", variantId }));
      history.appendPoint({
        ...point(history.snapshot().length + 1),
        paintLoad: variantId === "drippy-chisel" || variantId.includes("mop") ? 0.84 : undefined,
      });
      if (variantId === "drippy-chisel" || variantId === "drip-mop") {
        history.appendDrip({ x: 10, y: 20, width: 2, length: 90, opacity: 0.8, bend: 4, durationMs: 1280 });
      }
      history.finalize();
    }

    const snapshot = history.snapshot();
    expect(snapshot.map(({ variantId }) => variantId)).toEqual([
      "round", "chisel", "clean-chisel", "drippy-chisel", "mop", "drip-mop",
    ]);
    expect(snapshot[3].points[0].paintLoad).toBe(0.84);
    expect(snapshot[5].drips[0]).toMatchObject({ bend: 4, durationMs: 1280 });
    snapshot[5].drips[0].bend = 99;
    expect(history.snapshot()[5].drips[0].bend).toBe(4);
  });

  it("restores exact mixed-color wet marks and continuous-run state after Clear", () => {
    const history = new StrokeHistory();
    history.begin(metadata({ toolId: "paint-marker", variantId: "mop", color: "#15cfe5", size: 44 }));
    history.appendPoint({ ...point(20), paintLoad: 0.78 });
    history.appendDrip({
      x: 20,
      y: 24,
      width: 7,
      length: 130,
      opacity: 0.82,
      bend: 5,
      tipWidthRatio: 0.4,
      originPoolRadius: 8,
      terminalBulbRatio: 0.5,
    });
    history.finalize();
    history.begin(metadata({ toolId: "paint-marker", variantId: "drip-mop", color: "#ffd21c", size: 50 }));
    history.appendPoint({ ...point(80), paintLoad: 0.94 });
    history.finalize();
    const before = history.snapshot();

    expect(history.clearUndoably()).toBe(true);
    expect(history.undo()).toEqual(before);
    expect(history.snapshot().map(({ color }) => color)).toEqual(["#15cfe5", "#ffd21c"]);
  });
});
