/**
 * RADIO-04 -- the canonical Firestore-backed authority for
 * `Program x Channel x start x end`, established by the RADIO/PROMOTER
 * scheduling recon as the one missing piece: neither `RadioChannelRotation`
 * (a continuously repeating cycle, no calendar concept) nor
 * `eventProgram/current` (a global singleton, no channel reference, no
 * duration) can represent "this Program, on this Channel, from this start
 * time for this duration." This collection is that missing authority --
 * deliberately separate from MUSIC's own IndexedDB-scoped, Channel-unaware
 * `ScheduleBlock`/`BroadcastEvent` (`music/src/data/scheduleTypes.ts`,
 * `eventTypes.ts`), which this batch does not repurpose.
 *
 * MATERIALIZED OCCURRENCES, NOT A VIRTUAL RULE: a recurring request writes
 * one real, independently-persisted `RadioScheduleBlock` document PER
 * occurrence (sharing one `seriesId`), never a single "rule" document that
 * gets expanded at read time. This is deliberate: "historical aired
 * occurrences must not disappear merely because the current/future
 * recurrence changes" is only true if each occurrence is its own real
 * record. Recurrence is always bounded (`untilMs` or `count`) precisely so
 * every occurrence CAN be materialized up front, with no lazy/virtual
 * expansion machinery needed.
 */

/** V1: bounded only. An unbounded recurring series is out of scope -- see this batch's own architecture doc note on why. */
export type RadioScheduleRecurrenceFrequency = "none" | "daily" | "weekly";

export interface RadioScheduleRecurrence {
  readonly frequency: RadioScheduleRecurrenceFrequency;
  /** Epoch ms, inclusive bound on the LAST occurrence's own startAtMs. Mutually exclusive with `count` in practice (only one bound is needed), but both are accepted -- whichever is reached first stops generation. */
  readonly untilMs?: number;
  /** Bounded occurrence count, alternative/additional to `untilMs`. */
  readonly count?: number;
  /**
   * RADIO-04B -- an explicit, deliberate "the operator chose no end date"
   * marker. This does NOT make materialization unbounded: `createScheduleBlocks`
   * still only ever writes a real, bounded first batch (up to
   * `MAX_RADIO_SCHEDULE_OCCURRENCES`, currently 366), exactly like a bounded
   * request -- there is still no lazy/virtual expansion anywhere in this
   * system. What this flag changes is TRUTH, not behavior: the persisted
   * recurrence record honestly says "open-ended, N occurrences materialized
   * so far" instead of fabricating a `count`/`untilMs` the operator never
   * chose. `validateRecurrence` requires EXACTLY one of `untilMs`/`count`/
   * `openEnded` -- an omitted bound is still a validation error, never
   * silently read as "must mean open-ended" (a caller that simply forgot to
   * set a bound should fail loudly, not be reinterpreted as intentional).
   *
   * Auto-extending an open-ended series' materialized horizon FORWARD over
   * time (so it never runs out without an operator noticing) is real,
   * useful future work this flag deliberately leaves room for -- a series/
   * rule authority that can read "this series is still open, extend it" and
   * generate the next real batch, keeping every already-materialized
   * (possibly already-aired) occurrence immutable. That mechanism is NOT
   * implemented here -- see docs/architecture/radio/README.md's RADIO-04B
   * recon note for the proposed minimal design.
   */
  readonly openEnded?: boolean;
}

/**
 * "cancelled" is the ONLY removal path -- a block is never hard-deleted
 * (deleting would let a later query silently lose a historical, possibly
 * already-aired occurrence). Channel/broadcast resolution and the public
 * guide both treat a cancelled block exactly as if it didn't exist for
 * priority/listing purposes, but it remains a real, inspectable record.
 */
export type RadioScheduleBlockStatus = "scheduled" | "cancelled";

export interface RadioScheduleBlock {
  readonly id: string;
  readonly channelId: string;
  readonly programId: string;
  /** Epoch ms, inclusive. */
  readonly startAtMs: number;
  /** Epoch ms, exclusive. */
  readonly endAtMs: number;
  readonly status: RadioScheduleBlockStatus;
  /** Shared by every occurrence generated from the same recurring request; `null` for a genuine one-off. Grouping/history only -- never used to re-derive an occurrence's own start/end. */
  readonly seriesId: string | null;
  /** The recurrence rule THIS occurrence was generated under, carried on every occurrence (not just the first) so history remains self-describing even if a later series is edited independently. `null` for a one-off (`frequency: "none"` is the alternative spelling used internally during generation; persisted occurrences use `null` when there was never a rule at all). */
  readonly recurrence: RadioScheduleRecurrence | null;
  readonly createdAt: Date | null;
  readonly updatedAt: Date | null;
  readonly updatedBy: string | null;
}

export interface CreateRadioScheduleBlockInput {
  readonly channelId: string;
  readonly programId: string;
  readonly startAtMs: number;
  readonly endAtMs: number;
}

export interface RadioScheduleRepository {
  /**
   * Public read (matches every other RADIO catalog's own "PUBLIC/MEMBER
   * read" rule). Returns EVERY block for this channel, cancelled included
   * -- callers filter for their own purpose (priority resolution, the
   * public guide, or the operator's own history view all need different
   * slices of the same data). No time-range query -- same "fetch
   * everything, resolve purely client-side" convention `listRadioPrograms()`
   * already uses; this collection is not expected to reach a size where
   * that stops being reasonable within this batch's scope.
   */
  listScheduleBlocksForChannel(channelId: string): Promise<readonly RadioScheduleBlock[]>;
  /**
   * Authorized-operator-only in Firestore rules. Creates ONE OR MORE
   * blocks in a single batched write (a bounded recurring request
   * materializes every occurrence up front, sharing `seriesId`; a one-off
   * passes a single-element array and `seriesId: null`). ATOMIC REJECTION:
   * validates every candidate against every OTHER existing (non-cancelled)
   * block on the same channel AND against every other candidate in this
   * same request; if ANY candidate overlaps anything, the whole batch is
   * rejected and NOTHING is written -- never a partial write, never a
   * silent trim/override of an existing block.
   */
  createScheduleBlocks(
    inputs: readonly CreateRadioScheduleBlockInput[],
    seriesId: string | null,
    recurrence: RadioScheduleRecurrence | null,
    createdByMemberId: string,
  ): Promise<readonly RadioScheduleBlock[]>;
  /** Authorized-operator-only. Marks exactly one occurrence `"cancelled"` -- never deletes it. The block must already exist. */
  cancelScheduleBlock(blockId: string, updatedByMemberId: string): Promise<void>;
}

/**
 * Same convention as every other RADIO id generator (`generateRadioProgramId`
 * in `eventRadioTypes.ts`) -- fresh, unguessable, non-sequential, never
 * derived from channelId/programId/time.
 */
export function generateRadioScheduleBlockId(): string {
  return `radschedule_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function generateRadioScheduleSeriesId(): string {
  return `radscheduleseries_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
