import { describe, it, expect } from "vitest";
import { computeKeyboardMove, type KeyboardMoveModifiers } from "./keyboardBoundaryEditing";
import type { MusicalGrid } from "../../data/loopTypes";

const SR = 44100;
const SOURCE_FRAMES = 500000;

function grid(): MusicalGrid {
  return {
    bpm: 120, meterNumerator: 4, meterDenominator: 4,
    originSeconds: 0, originFrame: 0, originSource: "detected_beat", trust: "provisional", confidence: 0.5,
    beatFrames: [0, 22050, 44100, 66150, 88200],
    barFrames: [0, 88200, 176400],
    sourceFingerprint: "fp", updatedAt: "now",
  };
}

function mods(overrides: Partial<KeyboardMoveModifiers> = {}): KeyboardMoveModifiers {
  return { shift: false, option: false, meta: false, ...overrides };
}

describe("computeKeyboardMove", () => {
  it("moves right by the current snap unit (beat)", () => {
    const next = computeKeyboardMove(44100, "right", mods(), "beat", grid(), SR, SOURCE_FRAMES);
    expect(next).toBe(66150);
  });

  it("moves left by the current snap unit (bar)", () => {
    const next = computeKeyboardMove(88200, "left", mods(), "bar", grid(), SR, SOURCE_FRAMES);
    expect(next).toBe(0);
  });

  it("Shift takes a larger step", () => {
    const beatStep = computeKeyboardMove(0, "right", mods(), "beat", grid(), SR, SOURCE_FRAMES)!;
    const shiftStep = computeKeyboardMove(0, "right", mods({ shift: true }), "beat", grid(), SR, SOURCE_FRAMES)!;
    expect(shiftStep).toBeGreaterThan(beatStep);
  });

  it("Option moves by exactly ±1ms regardless of snap mode", () => {
    const oneMs = Math.round(SR / 1000);
    const next = computeKeyboardMove(10000, "right", mods({ option: true }), "bar", grid(), SR, SOURCE_FRAMES);
    expect(next).toBe(10000 + oneMs);
    const back = computeKeyboardMove(10000, "left", mods({ option: true }), "bar", grid(), SR, SOURCE_FRAMES);
    expect(back).toBe(10000 - oneMs);
  });

  it("Command moves to the previous/next grid line", () => {
    const next = computeKeyboardMove(10000, "right", mods({ meta: true }), "bar", grid(), SR, SOURCE_FRAMES);
    expect(next).toBe(88200);
    const prev = computeKeyboardMove(100000, "left", mods({ meta: true }), "bar", grid(), SR, SOURCE_FRAMES);
    expect(prev).toBe(88200);
  });

  it("Command returns null (blocked) when there is no next/previous grid line", () => {
    const next = computeKeyboardMove(200000, "right", mods({ meta: true }), "bar", grid(), SR, SOURCE_FRAMES);
    expect(next).toBeNull();
    const prev = computeKeyboardMove(0, "left", mods({ meta: true }), "bar", grid(), SR, SOURCE_FRAMES);
    expect(prev).toBeNull();
  });

  it("clamps to source bounds rather than moving past them", () => {
    const next = computeKeyboardMove(SOURCE_FRAMES - 10, "right", mods({ option: true }), "bar", grid(), SR, SOURCE_FRAMES);
    expect(next).toBe(SOURCE_FRAMES);
  });

  it("falls back to a single-frame nudge when snap is off or there is no grid", () => {
    const next = computeKeyboardMove(1000, "right", mods(), "off", null, SR, SOURCE_FRAMES);
    expect(next).toBe(1001);
  });
});
