import { type WallPoint } from "./WallView";

export interface HandWorkingRegion {
  safeMin: number;
  safeMax: number;
  pressureMin: number;
  pressureMax: number;
}

export interface HandEdgeMotionState {
  velocityX: number;
  velocityY: number;
}

export interface HandEdgeMotionInput {
  hand: WallPoint;
  drawingActive: boolean;
  deltaMs: number;
}

export interface HandEdgeMotionResult {
  state: HandEdgeMotionState;
  wallDelta: WallPoint;
  edgePressure: WallPoint;
  moving: boolean;
}

export const HAND_WORKING_REGION: Readonly<HandWorkingRegion> = {
  safeMin: 0.2,
  safeMax: 0.8,
  pressureMin: 0.06,
  pressureMax: 0.94,
};

export const HAND_EDGE_MAX_SPEED_PX_PER_SECOND = 320;
export const HAND_EDGE_ACCELERATION_PX_PER_SECOND_SQUARED = 1400;
export const HAND_EDGE_DECELERATION_PX_PER_SECOND_SQUARED = 1800;
export const HAND_EDGE_MAX_FRAME_MS = 50;
export const HAND_EDGE_TRACKING_FRESH_MS = 140;

export function resetHandEdgeMotion(): HandEdgeMotionState {
  return { velocityX: 0, velocityY: 0 };
}

export function edgePressureForAxis(
  position: number,
  region: HandWorkingRegion = HAND_WORKING_REGION,
): number {
  if (position < region.safeMin) {
    return -smoothPressure((region.safeMin - position) / (region.safeMin - region.pressureMin));
  }
  if (position > region.safeMax) {
    return smoothPressure((position - region.safeMax) / (region.pressureMax - region.safeMax));
  }
  return 0;
}

export function resolveHandEdgeMotion(
  state: HandEdgeMotionState,
  input: HandEdgeMotionInput,
): HandEdgeMotionResult {
  if (!input.drawingActive) {
    return {
      state: resetHandEdgeMotion(),
      wallDelta: { x: 0, y: 0 },
      edgePressure: { x: 0, y: 0 },
      moving: false,
    };
  }

  const deltaSeconds = Math.max(0, Math.min(HAND_EDGE_MAX_FRAME_MS, input.deltaMs)) / 1000;
  const edgePressure = {
    x: edgePressureForAxis(input.hand.x),
    y: edgePressureForAxis(input.hand.y),
  };
  const targetVelocity = {
    x: -edgePressure.x * HAND_EDGE_MAX_SPEED_PX_PER_SECOND,
    y: -edgePressure.y * HAND_EDGE_MAX_SPEED_PX_PER_SECOND,
  };
  const nextState = {
    velocityX: approachVelocity(state.velocityX, targetVelocity.x, deltaSeconds),
    velocityY: approachVelocity(state.velocityY, targetVelocity.y, deltaSeconds),
  };
  const wallDelta = {
    x: nextState.velocityX * deltaSeconds,
    y: nextState.velocityY * deltaSeconds,
  };

  return {
    state: nextState,
    wallDelta,
    edgePressure,
    moving: nextState.velocityX !== 0 || nextState.velocityY !== 0,
  };
}

function smoothPressure(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return clamped * clamped * (3 - 2 * clamped);
}

function approachVelocity(current: number, target: number, deltaSeconds: number): number {
  const accelerating = Math.abs(target) > Math.abs(current) && current * target >= 0;
  const rate = accelerating
    ? HAND_EDGE_ACCELERATION_PX_PER_SECOND_SQUARED
    : HAND_EDGE_DECELERATION_PX_PER_SECOND_SQUARED;
  const maximumChange = rate * deltaSeconds;
  if (Math.abs(target - current) <= maximumChange) return target === 0 ? 0 : target;
  return current + Math.sign(target - current) * maximumChange;
}
