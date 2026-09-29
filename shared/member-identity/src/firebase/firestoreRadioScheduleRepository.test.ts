import { describe, expect, it } from "vitest";
import {
  decodeRadioScheduleBlock,
  findScheduleConflicts,
  validateCreateRadioScheduleBlockInput,
  validateRecurrence,
} from "./firestoreRadioScheduleRepository.js";
import type { CreateRadioScheduleBlockInput, RadioScheduleBlock, RadioScheduleRecurrence } from "../data/radioScheduleTypes.js";

const T0 = 1_700_000_000_000;
const HOUR = 3_600_000;

function createInput(overrides: Partial<CreateRadioScheduleBlockInput> = {}): CreateRadioScheduleBlockInput {
  return { channelId: "studiorich-radio", programId: "radprogram_a", startAtMs: T0, endAtMs: T0 + 2 * HOUR, ...overrides };
}

describe("validateCreateRadioScheduleBlockInput -- RADIO-04", () => {
  it("accepts a valid two-hour block", () => {
    expect(() => validateCreateRadioScheduleBlockInput(createInput())).not.toThrow();
  });
  it("rejects a missing channelId", () => {
    expect(() => validateCreateRadioScheduleBlockInput(createInput({ channelId: "" }))).toThrow("invalid_radio_schedule_channel_id");
  });
  it("rejects a missing programId", () => {
    expect(() => validateCreateRadioScheduleBlockInput(createInput({ programId: "" }))).toThrow("invalid_radio_schedule_program_id");
  });
  it("rejects a non-finite start", () => {
    expect(() => validateCreateRadioScheduleBlockInput(createInput({ startAtMs: Number.NaN }))).toThrow("invalid_radio_schedule_start");
  });
  it("rejects an end at or before start", () => {
    expect(() => validateCreateRadioScheduleBlockInput(createInput({ endAtMs: T0 }))).toThrow("invalid_radio_schedule_end_before_start");
    expect(() => validateCreateRadioScheduleBlockInput(createInput({ endAtMs: T0 - 1 }))).toThrow("invalid_radio_schedule_end_before_start");
  });
});

describe("validateRecurrence -- RADIO-04 (bounded-only V1)", () => {
  it("accepts null (a one-off)", () => {
    expect(() => validateRecurrence(null)).not.toThrow();
  });
  it("accepts frequency none without any bound", () => {
    expect(() => validateRecurrence({ frequency: "none" })).not.toThrow();
  });
  it("accepts daily bounded by untilMs", () => {
    expect(() => validateRecurrence({ frequency: "daily", untilMs: T0 + 30 * 24 * HOUR })).not.toThrow();
  });
  it("accepts weekly bounded by count", () => {
    expect(() => validateRecurrence({ frequency: "weekly", count: 8 })).not.toThrow();
  });
  it("rejects an unbounded recurring rule -- fails closed, V1 never allows an infinite series", () => {
    expect(() => validateRecurrence({ frequency: "daily" } as RadioScheduleRecurrence)).toThrow("invalid_radio_schedule_recurrence_unbounded");
    expect(() => validateRecurrence({ frequency: "weekly" } as RadioScheduleRecurrence)).toThrow("invalid_radio_schedule_recurrence_unbounded");
  });
  it("rejects a zero or negative count", () => {
    expect(() => validateRecurrence({ frequency: "daily", count: 0 })).toThrow("invalid_radio_schedule_recurrence_count");
    expect(() => validateRecurrence({ frequency: "daily", count: -1 })).toThrow("invalid_radio_schedule_recurrence_count");
  });
  it("rejects an invalid frequency", () => {
    expect(() => validateRecurrence({ frequency: "monthly" } as unknown as RadioScheduleRecurrence)).toThrow("invalid_radio_schedule_recurrence_frequency");
  });
});

function existingBlock(overrides: Partial<RadioScheduleBlock> = {}): Pick<RadioScheduleBlock, "id" | "startAtMs" | "endAtMs" | "status"> {
  return { id: "radschedule_existing", startAtMs: T0, endAtMs: T0 + 2 * HOUR, status: "scheduled", ...overrides };
}

describe("findScheduleConflicts -- RADIO-04 overlap detection (half-open interval)", () => {
  it("no conflict when a candidate is entirely before an existing block", () => {
    const conflicts = findScheduleConflicts([existingBlock()], [{ startAtMs: T0 - 3 * HOUR, endAtMs: T0 - HOUR }]);
    expect(conflicts).toEqual([]);
  });

  it("no conflict when a candidate starts exactly when an existing block ends (half-open, boundary is not overlap)", () => {
    const conflicts = findScheduleConflicts([existingBlock()], [{ startAtMs: T0 + 2 * HOUR, endAtMs: T0 + 4 * HOUR }]);
    expect(conflicts).toEqual([]);
  });

  it("detects a conflict for a fully overlapping candidate", () => {
    const conflicts = findScheduleConflicts([existingBlock()], [{ startAtMs: T0 + HOUR, endAtMs: T0 + 3 * HOUR }]);
    expect(conflicts).toEqual([{ candidateIndex: 0, conflictsWithId: "radschedule_existing", conflictsWithCandidateIndex: null }]);
  });

  it("detects a conflict for a candidate that fully contains an existing block", () => {
    const conflicts = findScheduleConflicts([existingBlock()], [{ startAtMs: T0 - HOUR, endAtMs: T0 + 3 * HOUR }]);
    expect(conflicts.length).toBe(1);
  });

  it("ignores a CANCELLED existing block entirely", () => {
    const conflicts = findScheduleConflicts([existingBlock({ status: "cancelled" })], [{ startAtMs: T0, endAtMs: T0 + HOUR }]);
    expect(conflicts).toEqual([]);
  });

  it("detects two candidates in the SAME batch overlapping each other (a bad recurring request self-conflicting) -- reported from both sides", () => {
    const conflicts = findScheduleConflicts([], [
      { startAtMs: T0, endAtMs: T0 + 2 * HOUR },
      { startAtMs: T0 + HOUR, endAtMs: T0 + 3 * HOUR },
    ]);
    expect(conflicts).toEqual([
      { candidateIndex: 0, conflictsWithId: null, conflictsWithCandidateIndex: 1 },
      { candidateIndex: 1, conflictsWithId: null, conflictsWithCandidateIndex: 0 },
    ]);
  });

  it("a real weekly recurring batch with no overlap produces zero conflicts", () => {
    const WEEK = 7 * 24 * HOUR;
    const candidates = [0, 1, 2, 3].map((i) => ({ startAtMs: T0 + i * WEEK, endAtMs: T0 + i * WEEK + 2 * HOUR }));
    expect(findScheduleConflicts([], candidates)).toEqual([]);
  });
});

const BASE_DOC = { channelId: "studiorich-radio", programId: "radprogram_a", startAtMs: T0, endAtMs: T0 + 2 * HOUR, status: "scheduled" };

describe("decodeRadioScheduleBlock -- RADIO-04", () => {
  it("decodes a valid one-off block (no seriesId, no recurrence)", () => {
    const result = decodeRadioScheduleBlock("radschedule_1", BASE_DOC);
    expect(result).toMatchObject({ id: "radschedule_1", channelId: "studiorich-radio", programId: "radprogram_a", status: "scheduled", seriesId: null, recurrence: null });
  });

  it("decodes a recurring occurrence with seriesId + recurrence preserved", () => {
    const result = decodeRadioScheduleBlock("radschedule_2", {
      ...BASE_DOC, seriesId: "radscheduleseries_x", recurrence: { frequency: "weekly", count: 8 },
    });
    expect(result?.seriesId).toBe("radscheduleseries_x");
    expect(result?.recurrence).toEqual({ frequency: "weekly", untilMs: undefined, count: 8 });
  });

  it("rejects a document missing a required field", () => {
    const { channelId: _channelId, ...withoutChannelId } = BASE_DOC;
    void _channelId;
    expect(decodeRadioScheduleBlock("radschedule_3", withoutChannelId)).toBeNull();
  });

  it("rejects an invalid status", () => {
    expect(decodeRadioScheduleBlock("radschedule_4", { ...BASE_DOC, status: "live" })).toBeNull();
  });
});
