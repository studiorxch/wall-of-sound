import { describe, it, expect } from "vitest";
import { materializeOccurrences, MAX_RADIO_SCHEDULE_OCCURRENCES } from "./radioScheduleRecurrence";

const T0 = 1_700_000_000_000; // a Tuesday-ish anchor, exact weekday irrelevant to this pure math
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

describe("materializeOccurrences -- RADIO-04", () => {
  it("null recurrence returns exactly the one given occurrence", () => {
    const result = materializeOccurrences({ startAtMs: T0, endAtMs: T0 + 2 * HOUR }, null);
    expect(result).toEqual([{ startAtMs: T0, endAtMs: T0 + 2 * HOUR }]);
  });

  it("frequency 'none' returns exactly the one given occurrence", () => {
    const result = materializeOccurrences({ startAtMs: T0, endAtMs: T0 + 2 * HOUR }, { frequency: "none" });
    expect(result).toEqual([{ startAtMs: T0, endAtMs: T0 + 2 * HOUR }]);
  });

  it("daily bounded by count generates exactly that many, one day apart, same duration", () => {
    const result = materializeOccurrences({ startAtMs: T0, endAtMs: T0 + 2 * HOUR }, { frequency: "daily", count: 5 });
    expect(result.length).toBe(5);
    expect(result.map((o) => o.startAtMs)).toEqual([T0, T0 + DAY, T0 + 2 * DAY, T0 + 3 * DAY, T0 + 4 * DAY]);
    expect(result.every((o) => o.endAtMs - o.startAtMs === 2 * HOUR)).toBe(true);
  });

  it("weekly bounded by count generates exactly that many, one week apart", () => {
    const result = materializeOccurrences({ startAtMs: T0, endAtMs: T0 + 2 * HOUR }, { frequency: "weekly", count: 8 });
    expect(result.length).toBe(8);
    expect(result[1].startAtMs).toBe(T0 + WEEK);
    expect(result[7].startAtMs).toBe(T0 + 7 * WEEK);
  });

  it("bounded by untilMs stops generating once the next occurrence's start would exceed it", () => {
    // 4 daily occurrences fit fully before untilMs; the 5th's start is past it.
    const result = materializeOccurrences({ startAtMs: T0, endAtMs: T0 + 2 * HOUR }, { frequency: "daily", untilMs: T0 + 3 * DAY + HOUR });
    expect(result.length).toBe(4);
  });

  it("count and untilMs together stop at whichever bound is reached first", () => {
    const result = materializeOccurrences({ startAtMs: T0, endAtMs: T0 + 2 * HOUR }, { frequency: "daily", count: 100, untilMs: T0 + 2 * DAY });
    expect(result.length).toBe(3); // T0, T0+1d, T0+2d -- the 4th (T0+3d) exceeds untilMs
  });

  it("hard safety cap: an absurdly large count never exceeds MAX_RADIO_SCHEDULE_OCCURRENCES", () => {
    const result = materializeOccurrences({ startAtMs: T0, endAtMs: T0 + 2 * HOUR }, { frequency: "daily", count: 100_000 });
    expect(result.length).toBe(MAX_RADIO_SCHEDULE_OCCURRENCES);
  });

  it("every occurrence keeps the exact same duration as the first, regardless of frequency", () => {
    const result = materializeOccurrences({ startAtMs: T0, endAtMs: T0 + 90 * 60 * 1000 }, { frequency: "weekly", count: 4 });
    expect(result.every((o) => o.endAtMs - o.startAtMs === 90 * 60 * 1000)).toBe(true);
  });
});
