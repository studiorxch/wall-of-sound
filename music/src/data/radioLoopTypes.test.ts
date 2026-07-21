import { describe, it, expect } from "vitest";
import {
  formatRadioLoopId,
  parseRadioLoopIdSequence,
  isLegalRadioStateTransition,
  isValidRadioArrangementRole,
  RADIO_ID_PATTERN,
} from "./radioLoopTypes";

describe("formatRadioLoopId", () => {
  it("zero-pads to six digits", () => {
    expect(formatRadioLoopId(1)).toBe("rloop_000001");
    expect(formatRadioLoopId(42)).toBe("rloop_000042");
    expect(formatRadioLoopId(123456)).toBe("rloop_123456");
  });

  it("round-trips through the pattern", () => {
    const id = formatRadioLoopId(7);
    expect(RADIO_ID_PATTERN.test(id)).toBe(true);
  });
});

describe("parseRadioLoopIdSequence", () => {
  it("extracts the numeric sequence", () => {
    expect(parseRadioLoopIdSequence("rloop_000001")).toBe(1);
    expect(parseRadioLoopIdSequence("rloop_000999")).toBe(999);
  });

  it("returns null for malformed or foreign ids", () => {
    expect(parseRadioLoopIdSequence("rloop_1")).toBeNull();
    expect(parseRadioLoopIdSequence("loop_000001")).toBeNull();
    expect(parseRadioLoopIdSequence("rloop_00000a")).toBeNull();
    expect(parseRadioLoopIdSequence("")).toBeNull();
  });
});

describe("isLegalRadioStateTransition", () => {
  it("allows the documented forward transitions", () => {
    expect(isLegalRadioStateTransition("CANDIDATE", "VALIDATING")).toBe(true);
    expect(isLegalRadioStateTransition("VALIDATING", "RADIO_READY")).toBe(true);
    expect(isLegalRadioStateTransition("RADIO_READY", "PUBLISHED")).toBe(true);
    expect(isLegalRadioStateTransition("RADIO_READY", "RETIRED")).toBe(true);
    expect(isLegalRadioStateTransition("PUBLISHED", "RETIRED")).toBe(true);
  });

  it("rejects skips, reversals, and terminal-state transitions", () => {
    expect(isLegalRadioStateTransition("CANDIDATE", "RADIO_READY")).toBe(false);
    expect(isLegalRadioStateTransition("RADIO_READY", "CANDIDATE")).toBe(false);
    expect(isLegalRadioStateTransition("PUBLISHED", "RADIO_READY")).toBe(false);
    expect(isLegalRadioStateTransition("RETIRED", "PUBLISHED")).toBe(false);
    expect(isLegalRadioStateTransition("RETIRED", "RADIO_READY")).toBe(false);
  });
});

describe("isValidRadioArrangementRole", () => {
  it("accepts every closed-vocabulary role", () => {
    for (const role of ["foundation", "motion", "detail", "event", "bridge", "recovery"]) {
      expect(isValidRadioArrangementRole(role)).toBe(true);
    }
  });

  it("rejects the pre-0717A legacy role and other unknown values", () => {
    expect(isValidRadioArrangementRole("atmosphere")).toBe(false);
    expect(isValidRadioArrangementRole("")).toBe(false);
    expect(isValidRadioArrangementRole("Foundation")).toBe(false);
  });
});
