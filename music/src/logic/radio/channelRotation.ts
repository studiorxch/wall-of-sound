/**
 * Batch 02K -- the minimum deterministic authority answering "which RADIO
 * Program owns Channel airtime at wall-clock time T?" Pure math only, same
 * posture as `radioProgramClock.ts`'s own `resolveProgramPosition`: given
 * an ordered list of Program durations, a fixed cycle anchor, and "now",
 * it resolves which Program should currently be on air and at what offset
 * -- no timer state, no fetch, no I/O. A reload hours or days later
 * produces exactly the answer uninterrupted execution would have.
 *
 * ONE LEVEL ABOVE, NOT A REPLACEMENT FOR, resolveProgramPosition: that
 * function resolves POSITION WITHIN one Program's own track list;
 * this one resolves WHICH PROGRAM owns airtime right now. A future caller
 * combines them: resolveChannelRotation() picks the Program, then
 * resolveProgramPosition() (or resolveBroadcastState()) resolves inside
 * it -- this module knows nothing about tracks, manifests, or playback.
 *
 * CLOCK SYNCHRONIZATION RULE (deliberate, load-bearing): this resolver
 * determines BROADCAST AUTHORITY, not client availability. If Program B
 * owns a time window, this function keeps returning Program B for that
 * window even if a caller knows B is currently unreachable -- it never
 * silently substitutes a different Program. "Program failed to load, try
 * the next one" is a real, necessary behavior, but it belongs in a LATER
 * layer: if this resolver did that substitution itself, two listeners who
 * each independently know a different subset of "which Programs happen to
 * be reachable right now" could disagree about what's currently on air,
 * which defeats the entire point of a shared, authoritative timeline.
 *
 * INVALID INPUT: never thrown -- returned as an explicit `"invalid"`
 * result (see `ChannelRotationInvalidReason`), so a caller can display or
 * log a reason without a try/catch, and so a malformed rotation can never
 * be silently repaired into a different, unintended timeline by skipping
 * or reordering entries.
 */

export interface RotationEntry {
  readonly programId: string;
  readonly durationSeconds: number;
}

export interface ChannelRotation {
  readonly channelId: string;
  /** Epoch milliseconds -- the fixed instant `entries[0]` begins its first cycle. */
  readonly anchorAtMs: number;
  /** Rotation order. Array order IS the authority -- no separate `order` field (see this module's own Batch 02K scope note). */
  readonly entries: readonly RotationEntry[];
}

export type ChannelRotationInvalidReason =
  | "invalid_anchor_at_ms"
  | "invalid_now_ms"
  | "empty_entries"
  | "invalid_entry_duration"
  | "duplicate_program_id";

export type ChannelRotationResolution =
  | { readonly status: "invalid"; readonly channelId: string; readonly reason: ChannelRotationInvalidReason }
  | {
      readonly status: "before-start";
      readonly channelId: string;
      /** Seconds until anchorAtMs -- always > 0. */
      readonly startsInSeconds: number;
    }
  | {
      readonly status: "on-air";
      readonly channelId: string;
      readonly programId: string;
      readonly programIndex: number;
      /** Seconds into the current Program's own airtime window, in [0, entry.durationSeconds). */
      readonly programOffsetSeconds: number;
      readonly programStartedAtMs: number;
      readonly programEndsAtMs: number;
      readonly nextProgramId: string;
      readonly cycleDurationSeconds: number;
      /** How many full cycles have elapsed since anchorAtMs (0 on the first pass). */
      readonly cycleIndex: number;
    };

function validateRotation(rotation: ChannelRotation, nowMs: number): ChannelRotationInvalidReason | null {
  if (!Number.isFinite(rotation.anchorAtMs)) return "invalid_anchor_at_ms";
  if (!Number.isFinite(nowMs)) return "invalid_now_ms";
  if (rotation.entries.length === 0) return "empty_entries";
  const seenProgramIds = new Set<string>();
  for (const entry of rotation.entries) {
    if (!Number.isFinite(entry.durationSeconds) || entry.durationSeconds <= 0) return "invalid_entry_duration";
    if (seenProgramIds.has(entry.programId)) return "duplicate_program_id";
    seenProgramIds.add(entry.programId);
  }
  return null;
}

/**
 * Pure. Never throws, never touches storage or network. Same inputs always
 * produce the same output -- the property that lets two independent
 * listeners (or a client and a test) agree on "what's currently on air"
 * with no server round-trip beyond agreeing on `nowMs` and the rotation
 * definition itself (mirrors `resolveProgramPosition`'s own doc).
 */
export function resolveChannelRotation(rotation: ChannelRotation, nowMs: number): ChannelRotationResolution {
  const invalidReason = validateRotation(rotation, nowMs);
  if (invalidReason) return { status: "invalid", channelId: rotation.channelId, reason: invalidReason };

  const { channelId, anchorAtMs, entries } = rotation;

  if (nowMs < anchorAtMs) {
    return { status: "before-start", channelId, startsInSeconds: (anchorAtMs - nowMs) / 1000 };
  }

  const cycleDurationSeconds = entries.reduce((sum, entry) => sum + entry.durationSeconds, 0);
  const elapsedSeconds = (nowMs - anchorAtMs) / 1000;
  const cycleIndex = Math.floor(elapsedSeconds / cycleDurationSeconds);
  const elapsedInCycleSeconds = elapsedSeconds - cycleIndex * cycleDurationSeconds;
  const cycleStartAtMs = anchorAtMs + cycleIndex * cycleDurationSeconds * 1000;

  let cursorSeconds = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    const entryEndSeconds = cursorSeconds + entry.durationSeconds;
    // Exact boundary belongs to the NEXT entry at offset 0 -- same
    // convention `radioProgramClock.ts`'s own resolver already documents.
    // The `i === entries.length - 1` fallback exists for the same
    // floating-point-imprecision reason that module documents: elapsedInCycleSeconds
    // is mathematically guaranteed to be < cycleDurationSeconds, but a
    // rounding error in the modulo above could very rarely push it a hair
    // over -- forcing a match on the last entry rather than falling
    // through unresolved.
    if (elapsedInCycleSeconds < entryEndSeconds || i === entries.length - 1) {
      const programOffsetSeconds = elapsedInCycleSeconds - cursorSeconds;
      const nextIndex = (i + 1) % entries.length;
      return {
        status: "on-air",
        channelId,
        programId: entry.programId,
        programIndex: i,
        programOffsetSeconds,
        programStartedAtMs: cycleStartAtMs + cursorSeconds * 1000,
        programEndsAtMs: cycleStartAtMs + entryEndSeconds * 1000,
        nextProgramId: entries[nextIndex].programId,
        cycleDurationSeconds,
        cycleIndex,
      };
    }
    cursorSeconds = entryEndSeconds;
  }

  // Unreachable: the loop above always returns on its last iteration via
  // the `i === entries.length - 1` fallback. Kept only so TypeScript sees
  // every path return.
  throw new Error("unreachable_channel_rotation_resolution");
}
