import { describe, expect, it } from "vitest";
import { validateSetEventProgramInput } from "./firestoreEventRadioRepository.js";
import type { SetEventProgramInput } from "../data/eventRadioTypes.js";

const KNOWN_PROGRAMS = new Set(["soft-motion-radio", "jungle-fade"]);

function personalInput(overrides: Partial<SetEventProgramInput> = {}): SetEventProgramInput {
  return {
    programId: "soft-motion-radio",
    playbackMode: "personal",
    startAtMs: null,
    endPolicy: "stop",
    status: "active",
    ...overrides,
  };
}

describe("validateSetEventProgramInput -- Event Radio Turnkey Operations V1", () => {
  it("accepts a valid personal-mode configuration", () => {
    expect(() => validateSetEventProgramInput(personalInput(), KNOWN_PROGRAMS)).not.toThrow();
  });

  it("accepts a valid clock-mode configuration with a real startAtMs", () => {
    const input = personalInput({ playbackMode: "clock", startAtMs: Date.now(), status: "active" });
    expect(() => validateSetEventProgramInput(input, KNOWN_PROGRAMS)).not.toThrow();
  });

  it("accepts a valid 'ready' (scheduled, not yet active) clock configuration even without a startAtMs -- the operator is still configuring it", () => {
    const input = personalInput({ playbackMode: "clock", startAtMs: null, status: "ready" });
    expect(() => validateSetEventProgramInput(input, KNOWN_PROGRAMS)).not.toThrow();
  });

  it("rejects an unknown program reference", () => {
    const input = personalInput({ programId: "does-not-exist" });
    expect(() => validateSetEventProgramInput(input, KNOWN_PROGRAMS)).toThrow("invalid_event_program_reference");
  });

  it("rejects an empty program reference", () => {
    const input = personalInput({ programId: "" });
    expect(() => validateSetEventProgramInput(input, KNOWN_PROGRAMS)).toThrow("invalid_event_program_reference");
  });

  it("rejects an invalid playback mode", () => {
    const input = { ...personalInput(), playbackMode: "live-broadcast" } as unknown as SetEventProgramInput;
    expect(() => validateSetEventProgramInput(input, KNOWN_PROGRAMS)).toThrow("invalid_event_playback_mode");
  });

  it("rejects an invalid end policy", () => {
    const input = { ...personalInput(), endPolicy: "loop-forever" } as unknown as SetEventProgramInput;
    expect(() => validateSetEventProgramInput(input, KNOWN_PROGRAMS)).toThrow("invalid_event_end_policy");
  });

  it("rejects an invalid status", () => {
    const input = { ...personalInput(), status: "live" } as unknown as SetEventProgramInput;
    expect(() => validateSetEventProgramInput(input, KNOWN_PROGRAMS)).toThrow("invalid_event_status");
  });

  it("rejects activating clock mode with no startAtMs -- an active Clock Radio event must have a real, unambiguous start time", () => {
    const input = personalInput({ playbackMode: "clock", startAtMs: null, status: "active" });
    expect(() => validateSetEventProgramInput(input, KNOWN_PROGRAMS)).toThrow("invalid_event_clock_start_time");
  });

  it("rejects a non-finite startAtMs even when supplied", () => {
    const input = personalInput({ playbackMode: "clock", startAtMs: Number.NaN, status: "active" });
    expect(() => validateSetEventProgramInput(input, KNOWN_PROGRAMS)).toThrow("invalid_event_clock_start_time");
  });

  it("a personal-mode configuration never requires startAtMs", () => {
    const input = personalInput({ playbackMode: "personal", startAtMs: null, status: "active" });
    expect(() => validateSetEventProgramInput(input, KNOWN_PROGRAMS)).not.toThrow();
  });
});
