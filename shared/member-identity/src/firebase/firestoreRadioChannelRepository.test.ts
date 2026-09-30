import { describe, expect, it } from "vitest";
import {
  decodeRadioChannel,
  validateCreateRadioChannelInput,
  validateUpdateRadioChannelInput,
} from "./firestoreRadioChannelRepository.js";
import type { CreateRadioChannelInput, RadioChannelRotation, UpdateRadioChannelInput } from "../data/radioChannelTypes.js";

const KNOWN_PROGRAMS = new Set(["soft-motion-radio", "jungle-fade", "late-night"]);

function validRotation(overrides: Partial<RadioChannelRotation> = {}): RadioChannelRotation {
  return { anchorAtMs: 1_700_000_000_000, programIds: ["soft-motion-radio", "jungle-fade", "late-night"], ...overrides };
}

function fullCreateInput(overrides: Partial<CreateRadioChannelInput> = {}): CreateRadioChannelInput {
  return { channelId: "channel-main", title: "StudioRich Main", status: "active", rotation: validRotation(), ...overrides };
}

describe("validateCreateRadioChannelInput", () => {
  it("accepts a complete, valid create input", () => {
    expect(() => validateCreateRadioChannelInput(fullCreateInput(), KNOWN_PROGRAMS)).not.toThrow();
  });

  it("rejects a missing channelId", () => {
    expect(() => validateCreateRadioChannelInput(fullCreateInput({ channelId: "" }), KNOWN_PROGRAMS)).toThrow("invalid_radio_channel_id");
  });

  it("rejects a missing title", () => {
    expect(() => validateCreateRadioChannelInput(fullCreateInput({ title: "" }), KNOWN_PROGRAMS)).toThrow("invalid_radio_channel_title");
  });

  it("rejects an invalid status", () => {
    const input = { ...fullCreateInput(), status: "ready" } as unknown as CreateRadioChannelInput;
    expect(() => validateCreateRadioChannelInput(input, KNOWN_PROGRAMS)).toThrow("invalid_radio_channel_status");
  });

  it("accepts 'inactive' status", () => {
    expect(() => validateCreateRadioChannelInput(fullCreateInput({ status: "inactive" }), KNOWN_PROGRAMS)).not.toThrow();
  });

  it("rejects a non-finite anchorAtMs", () => {
    const input = fullCreateInput({ rotation: validRotation({ anchorAtMs: Number.NaN }) });
    expect(() => validateCreateRadioChannelInput(input, KNOWN_PROGRAMS)).toThrow("invalid_radio_channel_rotation");
  });

  it("rejects an empty programIds list when status is active", () => {
    const input = fullCreateInput({ status: "active", rotation: validRotation({ programIds: [] }) });
    expect(() => validateCreateRadioChannelInput(input, KNOWN_PROGRAMS)).toThrow("invalid_radio_channel_rotation");
  });

  it("RADIO-04D: accepts an empty programIds list when status is inactive", () => {
    const input = fullCreateInput({ status: "inactive", rotation: validRotation({ programIds: [] }) });
    expect(() => validateCreateRadioChannelInput(input, KNOWN_PROGRAMS)).not.toThrow();
  });

  it("rejects a non-string entry in programIds", () => {
    const input = fullCreateInput({ rotation: validRotation({ programIds: ["soft-motion-radio", 123 as unknown as string] }) });
    expect(() => validateCreateRadioChannelInput(input, KNOWN_PROGRAMS)).toThrow("invalid_radio_channel_rotation");
  });

  it("rejects an empty-string entry in programIds", () => {
    const input = fullCreateInput({ rotation: validRotation({ programIds: ["soft-motion-radio", ""] }) });
    expect(() => validateCreateRadioChannelInput(input, KNOWN_PROGRAMS)).toThrow("invalid_radio_channel_rotation");
  });

  it("rejects a duplicate programId within the rotation", () => {
    const input = fullCreateInput({ rotation: validRotation({ programIds: ["soft-motion-radio", "soft-motion-radio"] }) });
    expect(() => validateCreateRadioChannelInput(input, KNOWN_PROGRAMS)).toThrow("invalid_radio_channel_rotation");
  });

  it("rejects a programId that does not exist in the known radioPrograms catalog", () => {
    const input = fullCreateInput({ rotation: validRotation({ programIds: ["soft-motion-radio", "does-not-exist"] }) });
    expect(() => validateCreateRadioChannelInput(input, KNOWN_PROGRAMS)).toThrow("invalid_radio_channel_program_reference");
  });

  it("preserves ordered programIds exactly (no sorting/dedup applied by validation)", () => {
    const input = fullCreateInput({ rotation: validRotation({ programIds: ["late-night", "soft-motion-radio", "jungle-fade"] }) });
    expect(() => validateCreateRadioChannelInput(input, KNOWN_PROGRAMS)).not.toThrow();
    expect(input.rotation.programIds).toEqual(["late-night", "soft-motion-radio", "jungle-fade"]);
  });
});

describe("validateUpdateRadioChannelInput", () => {
  it("accepts an update with only channelId (a true no-op patch)", () => {
    const input: UpdateRadioChannelInput = { channelId: "channel-main" };
    expect(() => validateUpdateRadioChannelInput(input, "active", KNOWN_PROGRAMS)).not.toThrow();
  });

  it("accepts a title-only update", () => {
    const input: UpdateRadioChannelInput = { channelId: "channel-main", title: "New Title" };
    expect(() => validateUpdateRadioChannelInput(input, "active", KNOWN_PROGRAMS)).not.toThrow();
  });

  it("rejects an explicit empty-string title", () => {
    const input: UpdateRadioChannelInput = { channelId: "channel-main", title: "" };
    expect(() => validateUpdateRadioChannelInput(input, "active", KNOWN_PROGRAMS)).toThrow("invalid_radio_channel_title");
  });

  it("rejects an invalid status", () => {
    const input = { channelId: "channel-main", status: "live" } as unknown as UpdateRadioChannelInput;
    expect(() => validateUpdateRadioChannelInput(input, "active", KNOWN_PROGRAMS)).toThrow("invalid_radio_channel_status");
  });

  it("rejects a rotation reorder that references an unknown program", () => {
    const input: UpdateRadioChannelInput = { channelId: "channel-main", rotation: validRotation({ programIds: ["unknown-program"] }) };
    expect(() => validateUpdateRadioChannelInput(input, "active", KNOWN_PROGRAMS)).toThrow("invalid_radio_channel_program_reference");
  });

  it("accepts a valid rotation reorder", () => {
    const input: UpdateRadioChannelInput = { channelId: "channel-main", rotation: validRotation({ programIds: ["late-night", "jungle-fade", "soft-motion-radio"] }) };
    expect(() => validateUpdateRadioChannelInput(input, "active", KNOWN_PROGRAMS)).not.toThrow();
  });

  it("RADIO-04D: rejects an empty rotation when the effective status is active", () => {
    const input: UpdateRadioChannelInput = { channelId: "channel-main", rotation: validRotation({ programIds: [] }) };
    expect(() => validateUpdateRadioChannelInput(input, "active", KNOWN_PROGRAMS)).toThrow("invalid_radio_channel_rotation");
  });

  it("RADIO-04D: accepts an empty rotation when the effective status is inactive", () => {
    const input: UpdateRadioChannelInput = { channelId: "channel-main", rotation: validRotation({ programIds: [] }) };
    expect(() => validateUpdateRadioChannelInput(input, "inactive", KNOWN_PROGRAMS)).not.toThrow();
  });
});

const BASE_CHANNEL_DOC = {
  title: "StudioRich Main",
  status: "active",
  rotation: { anchorAtMs: 1_700_000_000_000, programIds: ["soft-motion-radio", "jungle-fade"] },
};

describe("decodeRadioChannel", () => {
  it("decodes a valid document, preserving anchor and ordered programIds exactly", () => {
    const result = decodeRadioChannel("channel-main", BASE_CHANNEL_DOC);
    expect(result).not.toBeNull();
    expect(result!.channelId).toBe("channel-main");
    expect(result!.rotation.anchorAtMs).toBe(1_700_000_000_000);
    expect(result!.rotation.programIds).toEqual(["soft-motion-radio", "jungle-fade"]);
  });

  it("rejects a document with a malformed status", () => {
    expect(decodeRadioChannel("channel-main", { ...BASE_CHANNEL_DOC, status: "ready" })).toBeNull();
  });

  it("rejects a document with a non-finite anchor", () => {
    expect(decodeRadioChannel("channel-main", { ...BASE_CHANNEL_DOC, rotation: { anchorAtMs: Number.NaN, programIds: ["x"] } })).toBeNull();
  });

  it("rejects an ACTIVE document with an empty programIds list", () => {
    expect(decodeRadioChannel("channel-main", { ...BASE_CHANNEL_DOC, status: "active", rotation: { anchorAtMs: 1, programIds: [] } })).toBeNull();
  });

  it("RADIO-04D: decodes an INACTIVE document with an empty programIds list -- it must remain visible (e.g. to listRadioChannels()), never treated as malformed", () => {
    const result = decodeRadioChannel("channel-main", { ...BASE_CHANNEL_DOC, status: "inactive", rotation: { anchorAtMs: 1, programIds: [] } });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("inactive");
    expect(result!.rotation.programIds).toEqual([]);
  });

  it("rejects a document missing the rotation entirely", () => {
    const { rotation: _rotation, ...withoutRotation } = BASE_CHANNEL_DOC;
    void _rotation;
    expect(decodeRadioChannel("channel-main", withoutRotation)).toBeNull();
  });

  it("rejects a document missing the title", () => {
    const { title: _title, ...withoutTitle } = BASE_CHANNEL_DOC;
    void _title;
    expect(decodeRadioChannel("channel-main", withoutTitle)).toBeNull();
  });
});
