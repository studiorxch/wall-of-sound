/**
 * Event Music + Clock Radio Foundation V1 -- the minimum reusable timeline
 * resolver a shared-clock ("CLOCK RADIO") program needs. Pure, deterministic,
 * fully testable without playing audio, an AudioContext, or a network
 * request: given an ordered list of track durations, a program start time,
 * and "now", it resolves which track should currently be playing and at
 * what offset within it.
 *
 * This is NOT a playback engine. It never touches HTMLMediaElement,
 * DualDeckPlaybackEngine, or any audio source. `eventMusicRuntime.ts` is
 * the caller that takes this function's output and turns it into an actual
 * `preload()`/`seekDeck()` call on the existing engine.
 *
 * MEDIA-AGNOSTIC BY DESIGN (V1 audio-only, video-ready per this build's own
 * brief): a `ProgramTrack` is just `{ id, durationSeconds }` -- it says
 * nothing about audio vs video. A future video item can resolve against
 * this exact same function without redesigning the timeline model. No
 * video playback, encoding, or delivery is implemented here or anywhere in
 * this build.
 */

export interface ProgramTrack {
  readonly id: string;
  readonly durationSeconds: number;
}

export type ProgramEndPolicy = "stop" | "repeat";

export interface ProgramClockInput {
  /** Ordered tracks -- the same order the playlist/manifest already authors. */
  readonly tracks: readonly ProgramTrack[];
  /** Program start time, in epoch milliseconds. */
  readonly programStartAtMs: number;
  /** The authoritative "now", in epoch milliseconds -- see this module's own Authority doc below. */
  readonly nowMs: number;
  /** What happens once the last track finishes. Defaults to "stop". */
  readonly endPolicy?: ProgramEndPolicy;
}

export type ProgramClockResolution =
  | {
      readonly status: "before-start";
      /** Seconds until the program begins -- always > 0. */
      readonly startsInSeconds: number;
    }
  | {
      readonly status: "playing";
      readonly trackIndex: number;
      readonly track: ProgramTrack;
      /** Seconds into the current track, in [0, track.durationSeconds). */
      readonly offsetSeconds: number;
      /** Seconds since programStartAtMs, accounting for any repeat wraps. */
      readonly elapsedSeconds: number;
      /** How many full repeat cycles have elapsed (0 on the first pass). */
      readonly repeatCount: number;
    }
  | {
      readonly status: "ended";
      /** Total seconds since the (single, non-repeating) program's last track finished. */
      readonly secondsSinceEnd: number;
    }
  | {
      readonly status: "empty";
    };

/**
 * A track with a non-finite, non-positive, or missing duration is dropped
 * entirely from timeline resolution rather than silently treated as
 * zero-length (which would make it permanently "already finished" and
 * invisible) or infinite (which would freeze the whole program on it
 * forever). See this build's own "Duration Authority" requirement: a
 * program cannot claim an exact shared timeline through an unresolved
 * duration, so the resolver refuses to pretend one exists for that track.
 */
function usableTracks(tracks: readonly ProgramTrack[]): ProgramTrack[] {
  return tracks.filter((track) => Number.isFinite(track.durationSeconds) && track.durationSeconds > 0);
}

/**
 * Resolves a program's current track + offset at a single instant. Purely
 * a function of its inputs -- the same inputs always produce the same
 * output, which is exactly what lets two independent listeners (or a
 * client and a test) agree on "what's currently playing" without any
 * server round-trip beyond agreeing on `nowMs` and the program definition.
 */
export function resolveProgramPosition(input: ProgramClockInput): ProgramClockResolution {
  const tracks = usableTracks(input.tracks);
  if (tracks.length === 0) return { status: "empty" };

  const totalDurationSeconds = tracks.reduce((sum, track) => sum + track.durationSeconds, 0);
  const rawElapsedSeconds = (input.nowMs - input.programStartAtMs) / 1000;

  if (rawElapsedSeconds < 0) {
    return { status: "before-start", startsInSeconds: -rawElapsedSeconds };
  }

  const endPolicy = input.endPolicy ?? "stop";
  let elapsedSeconds = rawElapsedSeconds;
  let repeatCount = 0;

  if (elapsedSeconds >= totalDurationSeconds) {
    if (endPolicy === "stop") {
      return { status: "ended", secondsSinceEnd: elapsedSeconds - totalDurationSeconds };
    }
    // "repeat": wrap into the cycle currently in progress. totalDurationSeconds
    // is already confirmed > 0 (every usable track duration is > 0).
    repeatCount = Math.floor(elapsedSeconds / totalDurationSeconds);
    elapsedSeconds -= repeatCount * totalDurationSeconds;
  }

  let cursor = 0;
  for (let index = 0; index < tracks.length; index += 1) {
    const track = tracks[index];
    const trackEnd = cursor + track.durationSeconds;
    // Exact boundary (elapsedSeconds === trackEnd) belongs to the NEXT
    // track, at offset 0 -- a boundary instant is never "the last
    // fractional moment of the previous track."
    if (elapsedSeconds < trackEnd) {
      return {
        status: "playing",
        trackIndex: index,
        track,
        offsetSeconds: elapsedSeconds - cursor,
        elapsedSeconds: rawElapsedSeconds,
        repeatCount,
      };
    }
    cursor = trackEnd;
  }

  // Floating-point edge case: elapsedSeconds landed within a few ULPs of
  // totalDurationSeconds after the wrap subtraction above. Resolve to the
  // very end of the last track rather than falling through with no match.
  const lastIndex = tracks.length - 1;
  const lastTrack = tracks[lastIndex];
  return {
    status: "playing",
    trackIndex: lastIndex,
    track: lastTrack,
    offsetSeconds: lastTrack.durationSeconds,
    elapsedSeconds: rawElapsedSeconds,
    repeatCount,
  };
}

/**
 * DRIFT POLICY (this build's own requirement -- documented, not chased to
 * sample-perfection): a listener's local HTMLMediaElement.currentTime is an
 * APPROXIMATION of the authoritative program position this module resolves,
 * never the source of truth itself. `eventMusicRuntime.ts` compares its own
 * deck's current time against a fresh `resolveProgramPosition` call
 * periodically (not every frame) and classifies the difference:
 *
 *   |drift| <= TOLERATED_DRIFT_SECONDS        -> do nothing (inaudible/normal)
 *   TOLERATED < |drift| <= CORRECTABLE_DRIFT  -> V1: log/report only, no
 *                                                 audible correction (a tiny
 *                                                 fade/rate nudge is a real
 *                                                 future improvement, not
 *                                                 built here)
 *   |drift| > CORRECTABLE_DRIFT_SECONDS       -> hard seek/reload to the
 *                                                 freshly-resolved position
 *                                                 (same as a fresh join)
 *
 * These thresholds are deliberately generous (event music, not a DJ beat-
 * matching tool) and never trigger a *periodic* seek for ordinary decode/
 * scheduling jitter -- only a genuinely large discrepancy (e.g. the tab was
 * backgrounded and throttled) re-anchors to the authoritative timeline.
 */
export const TOLERATED_DRIFT_SECONDS = 1.5;
export const CORRECTABLE_DRIFT_SECONDS = 8;
