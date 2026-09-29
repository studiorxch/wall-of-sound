// RADIO-04 -- pure occurrence materialization. Recurrence is ALWAYS bounded
// (validateRecurrence in the repository layer already rejects an unbounded
// rule), so every occurrence can be generated up front, here, before any
// write happens -- no lazy/virtual expansion anywhere in this system.
// `MAX_OCCURRENCES` is a hard safety cap independent of `count`/`untilMs`,
// so a caller can never accidentally request a runaway-large batch write.

import type { RadioScheduleRecurrence } from "@studiorich/member-identity";

export interface OccurrenceWindow {
  readonly startAtMs: number;
  readonly endAtMs: number;
}

export const MAX_RADIO_SCHEDULE_OCCURRENCES = 366;

/**
 * Pure. `first` is the operator's own chosen first occurrence; `recurrence`
 * is `null` (or `{frequency:"none"}`) for a one-off, which always returns
 * exactly `[first]` unchanged. `daily`/`weekly` step by a fixed real-time
 * interval from `first.startAtMs` -- deliberately NOT calendar-aware
 * (no DST/leap-day adjustment) for V1; each occurrence keeps the exact
 * same duration as `first`.
 */
export function materializeOccurrences(first: OccurrenceWindow, recurrence: RadioScheduleRecurrence | null): OccurrenceWindow[] {
  if (!recurrence || recurrence.frequency === "none") return [first];
  const stepMs = recurrence.frequency === "daily" ? 24 * 3600 * 1000 : 7 * 24 * 3600 * 1000;
  const durationMs = first.endAtMs - first.startAtMs;
  const occurrences: OccurrenceWindow[] = [];
  let startAtMs = first.startAtMs;
  for (let i = 0; i < MAX_RADIO_SCHEDULE_OCCURRENCES; i += 1) {
    if (recurrence.untilMs != null && startAtMs > recurrence.untilMs) break;
    if (recurrence.count != null && i >= recurrence.count) break;
    occurrences.push({ startAtMs, endAtMs: startAtMs + durationMs });
    startAtMs += stepMs;
  }
  return occurrences;
}
