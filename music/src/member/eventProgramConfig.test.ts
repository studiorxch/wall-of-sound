import { describe, expect, it } from "vitest";
import { parseEventProgramConfig, DEFAULT_EVENT_PROGRAM_CONFIG } from "./eventProgramConfig";

describe("parseEventProgramConfig -- Event Music Foundation V1", () => {
  it("accepts a well-formed personal-mode config", () => {
    const result = parseEventProgramConfig({
      schemaVersion: "1.0.0",
      manifestBaseUrl: "/radio-web-export/soft-motion-radio/v1/",
      playbackMode: "personal",
      startAtMs: null,
      endPolicy: "stop",
    });
    expect(result).toEqual({
      schemaVersion: "1.0.0",
      manifestBaseUrl: "/radio-web-export/soft-motion-radio/v1/",
      playbackMode: "personal",
      startAtMs: null,
      endPolicy: "stop",
    });
  });

  it("accepts a well-formed clock-mode config with a real startAtMs", () => {
    const result = parseEventProgramConfig({
      manifestBaseUrl: "/radio-web-export/jungle-fade/v1/",
      playbackMode: "clock",
      startAtMs: 1_700_000_000_000,
      endPolicy: "repeat",
    });
    expect(result.playbackMode).toBe("clock");
    expect(result.startAtMs).toBe(1_700_000_000_000);
    expect(result.endPolicy).toBe("repeat");
  });

  it("normalizes a manifestBaseUrl missing its trailing slash", () => {
    const result = parseEventProgramConfig({ manifestBaseUrl: "/radio-web-export/soft-motion-radio/v1" });
    expect(result.manifestBaseUrl).toBe("/radio-web-export/soft-motion-radio/v1/");
  });

  it("falls back to the safe default for null/non-object input, never throwing", () => {
    expect(parseEventProgramConfig(null)).toEqual(DEFAULT_EVENT_PROGRAM_CONFIG);
    expect(parseEventProgramConfig(undefined)).toEqual(DEFAULT_EVENT_PROGRAM_CONFIG);
    expect(parseEventProgramConfig("not an object")).toEqual(DEFAULT_EVENT_PROGRAM_CONFIG);
    expect(parseEventProgramConfig(42)).toEqual(DEFAULT_EVENT_PROGRAM_CONFIG);
    expect(parseEventProgramConfig([])).toEqual(DEFAULT_EVENT_PROGRAM_CONFIG);
  });

  it("falls back to the default's own value for an invalid playbackMode, without discarding other valid fields", () => {
    const result = parseEventProgramConfig({ manifestBaseUrl: "/radio-web-export/jungle-fade/v1/", playbackMode: "live-broadcast" });
    expect(result.playbackMode).toBe(DEFAULT_EVENT_PROGRAM_CONFIG.playbackMode);
    expect(result.manifestBaseUrl).toBe("/radio-web-export/jungle-fade/v1/");
  });

  it("falls back to null for a non-numeric startAtMs rather than a garbage epoch", () => {
    const result = parseEventProgramConfig({ playbackMode: "clock", startAtMs: "8:00 PM" });
    expect(result.startAtMs).toBeNull();
  });

  it("falls back to the default's own value for an invalid endPolicy", () => {
    const result = parseEventProgramConfig({ endPolicy: "loop-forever-fast" });
    expect(result.endPolicy).toBe(DEFAULT_EVENT_PROGRAM_CONFIG.endPolicy);
  });

  it("an empty object resolves entirely to the safe default", () => {
    expect(parseEventProgramConfig({})).toEqual(DEFAULT_EVENT_PROGRAM_CONFIG);
  });
});
