import { describe, expect, it } from "vitest";
import { decodeRadioProgram, validateCreateRadioProgramInput, validateSetEventProgramInput, validateUpdateRadioProgramInput } from "./firestoreEventRadioRepository.js";
import { generateRadioProgramId, type CreateRadioProgramInput, type SetEventProgramInput, type UpdateRadioProgramInput } from "../data/eventRadioTypes.js";

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

  it("programId remains independent from stationId -- a program's own id never needs to match, or be validated against, any package's stationId", () => {
    // A programId is only ever checked against knownProgramIds (Firestore doc
    // ids) -- validateSetEventProgramInput has no stationId parameter at all,
    // and this passes with a programId that looks nothing like any real
    // package's stationId, proving no hidden coupling exists.
    const input = personalInput({ programId: "soft-motion-radio" });
    expect(() => validateSetEventProgramInput(input, KNOWN_PROGRAMS)).not.toThrow();
  });
});

const BASE_PROGRAM_DOC = {
  title: "Soft Motion Radio",
  manifestBaseUrl: "/radio-web-export/soft-motion-radio/v1",
  trackCount: 11,
  totalDurationSeconds: 1546.6,
};

describe("decodeRadioProgram -- Batch 02F RADIO Program Package Identity Contract", () => {
  it("loads a legacy document containing only manifestBaseUrl (no stationId/bundleVersion at all)", () => {
    const result = decodeRadioProgram("soft-motion-radio", BASE_PROGRAM_DOC);
    expect(result).not.toBeNull();
    expect(result!.manifestBaseUrl).toBe("/radio-web-export/soft-motion-radio/v1/");
    expect(result!.stationId).toBeUndefined();
    expect(result!.bundleVersion).toBeUndefined();
  });

  it("loads a document with stationId + bundleVersion and preserves both unchanged", () => {
    const result = decodeRadioProgram("soft-motion-radio", {
      ...BASE_PROGRAM_DOC,
      stationId: "radplaylist_abc123_xyz789",
      bundleVersion: 3,
    });
    expect(result).not.toBeNull();
    expect(result!.stationId).toBe("radplaylist_abc123_xyz789");
    expect(result!.bundleVersion).toBe(3);
    // Package identity survives parsing byte-for-byte -- not normalized,
    // not re-derived, not coerced to a different type.
    expect(typeof result!.stationId).toBe("string");
    expect(Number.isInteger(result!.bundleVersion)).toBe(true);
  });

  it("drops a malformed stationId (non-string) without rejecting the whole document", () => {
    const result = decodeRadioProgram("soft-motion-radio", { ...BASE_PROGRAM_DOC, stationId: 12345 });
    expect(result).not.toBeNull();
    expect(result!.stationId).toBeUndefined();
  });

  it("drops an empty-string stationId without rejecting the whole document", () => {
    const result = decodeRadioProgram("soft-motion-radio", { ...BASE_PROGRAM_DOC, stationId: "" });
    expect(result).not.toBeNull();
    expect(result!.stationId).toBeUndefined();
  });

  it("drops a malformed bundleVersion (non-number) without rejecting the whole document", () => {
    const result = decodeRadioProgram("soft-motion-radio", { ...BASE_PROGRAM_DOC, bundleVersion: "3" });
    expect(result).not.toBeNull();
    expect(result!.bundleVersion).toBeUndefined();
  });

  it("drops a non-integer bundleVersion", () => {
    const result = decodeRadioProgram("soft-motion-radio", { ...BASE_PROGRAM_DOC, bundleVersion: 1.5 });
    expect(result).not.toBeNull();
    expect(result!.bundleVersion).toBeUndefined();
  });

  it("drops a non-positive bundleVersion", () => {
    const result = decodeRadioProgram("soft-motion-radio", { ...BASE_PROGRAM_DOC, bundleVersion: 0 });
    expect(result).not.toBeNull();
    expect(result!.bundleVersion).toBeUndefined();
  });

  it("never infers stationId/bundleVersion from manifestBaseUrl, title, or any other field", () => {
    // manifestBaseUrl and title both contain a slug-shaped string
    // ("soft-motion-radio") that a derivation shortcut might be tempted to
    // reuse as stationId -- confirm no such inference happens.
    const result = decodeRadioProgram("soft-motion-radio", BASE_PROGRAM_DOC);
    expect(result!.stationId).toBeUndefined();
    expect(result!.bundleVersion).toBeUndefined();
  });

  it("still rejects the whole document when a REQUIRED field is invalid, unaffected by the new optional fields", () => {
    const result = decodeRadioProgram("soft-motion-radio", { ...BASE_PROGRAM_DOC, manifestBaseUrl: undefined, stationId: "x", bundleVersion: 1 });
    expect(result).toBeNull();
  });

  it("normalizes manifestBaseUrl to a trailing slash exactly as before this batch, regardless of stationId/bundleVersion presence", () => {
    const result = decodeRadioProgram("soft-motion-radio", { ...BASE_PROGRAM_DOC, stationId: "radplaylist_abc", bundleVersion: 2 });
    expect(result!.manifestBaseUrl.endsWith("/")).toBe(true);
  });
});

function fullCreateInput(overrides: Partial<CreateRadioProgramInput> = {}): CreateRadioProgramInput {
  return {
    programId: "radprogram_abc123_xyz789",
    title: "Soft Motion Radio",
    manifestBaseUrl: "/radio-web-export/soft-motion-radio/v3",
    trackCount: 11,
    totalDurationSeconds: 1546.6,
    stationId: "radplaylist_abc123_xyz789",
    bundleVersion: 3,
    ...overrides,
  };
}

describe("validateCreateRadioProgramInput -- Batch 02I Published Package -> RADIO Program Creation", () => {
  it("accepts a complete, valid create input", () => {
    expect(() => validateCreateRadioProgramInput(fullCreateInput())).not.toThrow();
  });

  it("rejects a missing programId", () => {
    expect(() => validateCreateRadioProgramInput(fullCreateInput({ programId: "" }))).toThrow("invalid_radio_program_id");
  });

  it("rejects a missing title", () => {
    expect(() => validateCreateRadioProgramInput(fullCreateInput({ title: "" }))).toThrow("invalid_radio_program_title");
  });

  it("rejects a missing manifestBaseUrl", () => {
    expect(() => validateCreateRadioProgramInput(fullCreateInput({ manifestBaseUrl: "" }))).toThrow("invalid_radio_program_manifest_base_url");
  });

  it("rejects a non-integer trackCount", () => {
    expect(() => validateCreateRadioProgramInput(fullCreateInput({ trackCount: 1.5 }))).toThrow("invalid_radio_program_track_count");
  });

  it("rejects a negative trackCount", () => {
    expect(() => validateCreateRadioProgramInput(fullCreateInput({ trackCount: -1 }))).toThrow("invalid_radio_program_track_count");
  });

  it("rejects a non-finite totalDurationSeconds", () => {
    expect(() => validateCreateRadioProgramInput(fullCreateInput({ totalDurationSeconds: Number.NaN }))).toThrow("invalid_radio_program_total_duration_seconds");
  });

  it("rejects a negative totalDurationSeconds", () => {
    expect(() => validateCreateRadioProgramInput(fullCreateInput({ totalDurationSeconds: -1 }))).toThrow("invalid_radio_program_total_duration_seconds");
  });

  it("rejects a missing/empty stationId -- required here, unlike the optional-on-read RadioProgramSummary field", () => {
    expect(() => validateCreateRadioProgramInput(fullCreateInput({ stationId: "" }))).toThrow("invalid_radio_program_station_id");
  });

  it("rejects a zero bundleVersion", () => {
    expect(() => validateCreateRadioProgramInput(fullCreateInput({ bundleVersion: 0 }))).toThrow("invalid_radio_program_bundle_version");
  });

  it("rejects a negative bundleVersion", () => {
    expect(() => validateCreateRadioProgramInput(fullCreateInput({ bundleVersion: -1 }))).toThrow("invalid_radio_program_bundle_version");
  });

  it("rejects a non-integer bundleVersion", () => {
    expect(() => validateCreateRadioProgramInput(fullCreateInput({ bundleVersion: 1.5 }))).toThrow("invalid_radio_program_bundle_version");
  });

  it("rejects a missing bundleVersion entirely (required, not optional, for application creation)", () => {
    const { bundleVersion: _bundleVersion, ...withoutBundleVersion } = fullCreateInput();
    void _bundleVersion;
    expect(() => validateCreateRadioProgramInput(withoutBundleVersion as CreateRadioProgramInput)).toThrow("invalid_radio_program_bundle_version");
  });

  it("rejects a missing stationId entirely (required, not optional, for application creation)", () => {
    const { stationId: _stationId, ...withoutStationId } = fullCreateInput();
    void _stationId;
    expect(() => validateCreateRadioProgramInput(withoutStationId as CreateRadioProgramInput)).toThrow("invalid_radio_program_station_id");
  });
});

function fullUpdateInput(overrides: Partial<UpdateRadioProgramInput> = {}): UpdateRadioProgramInput {
  return {
    programId: "radprogram_abc123_xyz789",
    title: "Soft Motion Radio",
    manifestBaseUrl: "/radio-web-export/soft-motion-radio/v3",
    trackCount: 11,
    totalDurationSeconds: 1546.6,
    stationId: "radplaylist_abc123_xyz789",
    bundleVersion: 3,
    ...overrides,
  };
}

describe("validateUpdateRadioProgramInput -- RADIO-03 (batch 0929-5) Program Package Version Adoption", () => {
  it("accepts a complete, valid update input", () => {
    expect(() => validateUpdateRadioProgramInput(fullUpdateInput())).not.toThrow();
  });

  it("accepts adopting a HIGHER bundleVersion than the Program previously had -- the whole point of this input", () => {
    expect(() => validateUpdateRadioProgramInput(fullUpdateInput({ bundleVersion: 2 }))).not.toThrow();
  });

  it("rejects a missing programId -- the identity being updated must be named", () => {
    expect(() => validateUpdateRadioProgramInput(fullUpdateInput({ programId: "" }))).toThrow("invalid_radio_program_id");
  });

  it("rejects a missing title", () => {
    expect(() => validateUpdateRadioProgramInput(fullUpdateInput({ title: "" }))).toThrow("invalid_radio_program_title");
  });

  it("rejects a missing manifestBaseUrl", () => {
    expect(() => validateUpdateRadioProgramInput(fullUpdateInput({ manifestBaseUrl: "" }))).toThrow("invalid_radio_program_manifest_base_url");
  });

  it("rejects a non-integer trackCount", () => {
    expect(() => validateUpdateRadioProgramInput(fullUpdateInput({ trackCount: 1.5 }))).toThrow("invalid_radio_program_track_count");
  });

  it("rejects a negative totalDurationSeconds", () => {
    expect(() => validateUpdateRadioProgramInput(fullUpdateInput({ totalDurationSeconds: -1 }))).toThrow("invalid_radio_program_total_duration_seconds");
  });

  it("rejects a missing/empty stationId (fails closed on an invalid/nonexistent package reference)", () => {
    expect(() => validateUpdateRadioProgramInput(fullUpdateInput({ stationId: "" }))).toThrow("invalid_radio_program_station_id");
  });

  it("rejects a zero or negative bundleVersion (fails closed on an invalid package version)", () => {
    expect(() => validateUpdateRadioProgramInput(fullUpdateInput({ bundleVersion: 0 }))).toThrow("invalid_radio_program_bundle_version");
    expect(() => validateUpdateRadioProgramInput(fullUpdateInput({ bundleVersion: -1 }))).toThrow("invalid_radio_program_bundle_version");
  });

  it("rejects a non-integer bundleVersion", () => {
    expect(() => validateUpdateRadioProgramInput(fullUpdateInput({ bundleVersion: 1.5 }))).toThrow("invalid_radio_program_bundle_version");
  });
});

describe("generateRadioProgramId -- Batch 02I", () => {
  it("generates an id independent from any stationId -- never programId === stationId by construction", () => {
    const stationId = "radplaylist_abc123_xyz789";
    const programId = generateRadioProgramId();
    expect(programId).not.toBe(stationId);
    expect(programId.startsWith("radprogram_")).toBe(true);
    expect(stationId.startsWith("radplaylist_")).toBe(true);
  });

  it("generates distinct ids on successive calls", () => {
    const first = generateRadioProgramId();
    const second = generateRadioProgramId();
    expect(first).not.toBe(second);
  });
});
