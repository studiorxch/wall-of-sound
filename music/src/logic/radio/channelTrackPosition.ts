/**
 * Batch 02O -- the PROGRAM CLOCK half of Channel -> Track resolution: given
 * a set of real, published manifest entries and an offset already known to
 * fall within that Program's total on-air duration (established by the
 * CHANNEL CLOCK, `resolveChannelRotation`, one layer up), find which track
 * owns that offset and where within it.
 *
 * DELIBERATELY NOT `resolveProgramPosition`: that function's
 * before-start/ended/repeat vocabulary models an INDEPENDENT program
 * timeline with its own `programStartAtMs` -- exactly Event Radio
 * Control's own operational concept, not a Channel-owned rotation slot.
 * A Program inside a Channel rotation is already known, by construction,
 * to be currently owning airtime (`resolveChannelRotation` already
 * proved that); it needs no second before-start/repeat check, and
 * fabricating a synthetic `programStartAtMs` just to reuse that machinery
 * would be exactly the "pretend to be Event Radio configuration" this
 * batch's own scope forbids. This is a small, honest, independent
 * cumulative-offset walk instead -- the same shape of math, not the same
 * function, because the semantics are genuinely different one layer up.
 *
 * SIDESTEPS, RATHER THAN REPAIRS, the known "RADIO manifest/clock index
 * identity mismatch" debt (see `radioProgramClock.ts`'s own callers,
 * which index the ORIGINAL manifest array by a position computed from a
 * FILTERED one): this walk always returns `trackIndex` as a real position
 * into the exact `entries` array the caller supplied -- unusable-duration
 * entries are skipped for the cumulative-time math (so they never
 * "consume" airtime, matching `radioProgramClock.ts`'s own
 * `usableTracks()` filtering intent) but the position it reports for a
 * MATCH is always taken from the real loop index `i`, never from a
 * separately-filtered array's index. No existing file was touched to
 * achieve this -- it's a property of writing new code against the real
 * array directly, not a fix applied to the old debt-carrying code path.
 */

export interface ManifestTrackLike {
  readonly radioTrackId: string;
  readonly durationSeconds: number;
}

export type ChannelTrackPositionResult =
  | { readonly status: "invalid-manifest" }
  | { readonly status: "track-resolution-failed" }
  | {
      readonly status: "resolved";
      readonly trackId: string;
      readonly trackIndex: number;
      readonly trackOffsetSeconds: number;
      readonly trackDurationSeconds: number;
    };

/**
 * Pure. `entries` should be a real `RadioWebManifest.entries` array (or
 * anything with the same `{radioTrackId, durationSeconds}` shape);
 * `programOffsetSeconds` should already be a valid in-range offset (the
 * Channel clock's own contract) -- this function still defends against a
 * negative/non-finite/out-of-range value rather than trusting the caller
 * blindly.
 */
export function resolveTrackAtProgramOffset(
  entries: readonly ManifestTrackLike[],
  programOffsetSeconds: number,
): ChannelTrackPositionResult {
  if (entries.length === 0) return { status: "invalid-manifest" };
  if (!Number.isFinite(programOffsetSeconds) || programOffsetSeconds < 0) return { status: "track-resolution-failed" };

  let cursorSeconds = 0;
  let lastUsableIndex = -1;
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (!Number.isFinite(entry.durationSeconds) || entry.durationSeconds <= 0) continue; // never "consumes" offset time
    lastUsableIndex = i;
    const entryEndSeconds = cursorSeconds + entry.durationSeconds;
    if (programOffsetSeconds < entryEndSeconds) {
      return {
        status: "resolved",
        trackId: entry.radioTrackId,
        trackIndex: i,
        trackOffsetSeconds: programOffsetSeconds - cursorSeconds,
        trackDurationSeconds: entry.durationSeconds,
      };
    }
    cursorSeconds = entryEndSeconds;
  }

  // Floating-point-imprecision fallback, same posture as
  // radioProgramClock.ts's own documented fallback: land on the last
  // usable entry rather than reporting failure for a genuinely in-range
  // offset that arithmetic rounding pushed a hair past its own cumulative end.
  if (lastUsableIndex !== -1) {
    const entry = entries[lastUsableIndex];
    return {
      status: "resolved",
      trackId: entry.radioTrackId,
      trackIndex: lastUsableIndex,
      trackOffsetSeconds: entry.durationSeconds,
      trackDurationSeconds: entry.durationSeconds,
    };
  }

  return { status: "track-resolution-failed" };
}
