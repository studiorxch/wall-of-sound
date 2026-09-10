import { describe, expect, it } from "vitest";
import {
  HAND_WORKING_REGION,
  edgePressureForAxis,
  resetHandEdgeMotion,
  resolveHandEdgeMotion,
} from "./HandEdgeMotion";
import { applyPan, resetWallView, screenToWall } from "./WallView";

const step = (
  hand: { x: number; y: number },
  state = resetHandEdgeMotion(),
  drawingActive = true,
) => resolveHandEdgeMotion(state, { hand, drawingActive, deltaMs: 16 });

describe("Hand edge-driven wall motion", () => {
  it("keeps the comfortable center safe region motionless", () => {
    expect(step({ x: 0.5, y: 0.5 })).toMatchObject({
      wallDelta: { x: 0, y: 0 },
      edgePressure: { x: 0, y: 0 },
      moving: false,
    });
    expect(edgePressureForAxis(HAND_WORKING_REGION.safeMin)).toBe(0);
    expect(edgePressureForAxis(HAND_WORKING_REGION.safeMax)).toBe(0);
  });

  it.each([
    [{ x: 0.1, y: 0.5 }, "x", 1],
    [{ x: 0.9, y: 0.5 }, "x", -1],
    [{ x: 0.5, y: 0.1 }, "y", 1],
    [{ x: 0.5, y: 0.9 }, "y", -1],
  ] as const)("moves the Wall opposite the approached edge at %o", (hand, axis, direction) => {
    const result = step(hand);
    expect(Math.sign(result.wallDelta[axis])).toBe(direction);
  });

  it("ramps wall speed smoothly under sustained edge pressure", () => {
    let state = resetHandEdgeMotion();
    const deltas: number[] = [];
    for (let frame = 0; frame < 6; frame += 1) {
      const result = step({ x: 0.98, y: 0.5 }, state);
      state = result.state;
      deltas.push(Math.abs(result.wallDelta.x));
    }
    expect(deltas.every((delta, index) => index === 0 || delta > deltas[index - 1])).toBe(true);
  });

  it("increases pressure as the Hand moves from the approach band toward the outer band", () => {
    expect(Math.abs(edgePressureForAxis(0.1))).toBeGreaterThan(Math.abs(edgePressureForAxis(0.18)));
    expect(Math.abs(edgePressureForAxis(0.9))).toBeGreaterThan(Math.abs(edgePressureForAxis(0.82)));
  });

  it("decelerates and stops after the Hand returns to the safe region", () => {
    let state = resetHandEdgeMotion();
    for (let frame = 0; frame < 8; frame += 1) state = step({ x: 0.98, y: 0.5 }, state).state;
    const firstRecovery = step({ x: 0.5, y: 0.5 }, state);
    expect(Math.abs(firstRecovery.state.velocityX)).toBeLessThan(Math.abs(state.velocityX));
    state = firstRecovery.state;
    for (let frame = 0; frame < 20; frame += 1) state = step({ x: 0.5, y: 0.5 }, state).state;
    expect(state).toEqual(resetHandEdgeMotion());
  });

  it("stops immediately when the intentional Hand drawing gesture ends", () => {
    const moving = step({ x: 0.98, y: 0.5 });
    expect(step({ x: 0.98, y: 0.5 }, moving.state, false)).toMatchObject({
      state: resetHandEdgeMotion(),
      wallDelta: { x: 0, y: 0 },
      moving: false,
    });
  });

  it("combines horizontal and vertical pressure for diagonal motion", () => {
    const result = step({ x: 0.95, y: 0.05 });
    expect(result.wallDelta.x).toBeLessThan(0);
    expect(result.wallDelta.y).toBeGreaterThan(0);
  });

  it("moves only WallView while retaining canonical Wall coordinates and zoom", () => {
    const before = resetWallView();
    const result = step({ x: 0.95, y: 0.5 });
    const after = applyPan(before, result.wallDelta.x, result.wallDelta.y);
    const screenHand = { x: 950, y: 500 };
    const beforeWallPoint = screenToWall(before, screenHand);
    const afterWallPoint = screenToWall(after, screenHand);
    expect(after.zoom).toBe(before.zoom);
    expect(afterWallPoint.x).toBeGreaterThan(beforeWallPoint.x);
    expect(screenHand).toEqual({ x: 950, y: 500 });
  });
});
