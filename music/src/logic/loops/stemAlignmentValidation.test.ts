import { describe, it, expect } from "vitest";
import {
  validateStemAlignment, computeStemFrameBounds, validateRenderedStemGroup,
} from "./stemAlignmentValidation";

describe("validateStemAlignment", () => {
  it("passes when all stems match the parent and duration is compatible", () => {
    const result = validateStemAlignment("parent1", 100, [
      { trackId: "drums", parentTrackId: "parent1", sampleRate: 44100, durationSeconds: 100.1 },
      { trackId: "bass", parentTrackId: "parent1", sampleRate: 48000, durationSeconds: 99.9 },
    ]);
    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("flags a stem belonging to the wrong parent", () => {
    const result = validateStemAlignment("parent1", 100, [
      { trackId: "drums", parentTrackId: "some_other_track", sampleRate: 44100, durationSeconds: 100 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([{ kind: "wrong_parent", trackId: "drums" }]);
  });

  it("flags a stem whose duration diverges beyond tolerance", () => {
    const result = validateStemAlignment("parent1", 100, [
      { trackId: "drums", parentTrackId: "parent1", sampleRate: 44100, durationSeconds: 40 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ kind: "duration_mismatch", trackId: "drums" });
  });

  it("respects a custom tolerance", () => {
    const result = validateStemAlignment("parent1", 100, [
      { trackId: "drums", parentTrackId: "parent1", sampleRate: 44100, durationSeconds: 100.4 },
    ], 0.1);
    expect(result.ok).toBe(false);
  });
});

describe("computeStemFrameBounds", () => {
  it("computes frames independently per sample rate — never reusing a raw frame number across rates", () => {
    const a = computeStemFrameBounds(10, 18, 44100);
    const b = computeStemFrameBounds(10, 18, 48000);
    expect(a.startFrame).toBe(Math.round(10 * 44100));
    expect(b.startFrame).toBe(Math.round(10 * 48000));
    expect(a.startFrame).not.toBe(b.startFrame);
    // But the SECONDS they represent are identical.
    expect(a.startFrame / 44100).toBeCloseTo(b.startFrame / 48000, 3);
  });
});

describe("validateRenderedStemGroup", () => {
  it("passes when all rendered files share the same final duration despite differing sample rates", () => {
    const result = validateRenderedStemGroup([
      { trackId: "drums", sampleCount: 44100 * 8, sampleRate: 44100 },
      { trackId: "bass", sampleCount: 48000 * 8, sampleRate: 48000 },
    ]);
    expect(result.ok).toBe(true);
  });

  it("flags a file whose rendered duration diverges from the group", () => {
    const result = validateRenderedStemGroup([
      { trackId: "drums", sampleCount: 44100 * 8, sampleRate: 44100 },
      { trackId: "bass", sampleCount: 44100 * 7, sampleRate: 44100 },
    ]);
    expect(result.ok).toBe(false);
    expect(result.errors[0].trackId).toBe("bass");
  });

  it("is trivially ok for an empty group", () => {
    expect(validateRenderedStemGroup([])).toEqual({ ok: true, errors: [] });
  });
});
