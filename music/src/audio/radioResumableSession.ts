/**
 * MAP / Blackbook / RADIO Integration Beta -- a minimal, origin-scoped
 * resumable RADIO session. NOT zero-gap playback: a full document
 * navigation always interrupts audio briefly (see this build's own recon).
 * This only lets whichever page next initializes the ONE authoritative
 * playback engine reconstruct where the listener actually was, instead of
 * restarting the program from track 0.
 *
 * Deliberately `sessionStorage`, not Firestore: this is ephemeral, per-tab
 * playback state, not durable StudioRich data, and per-tab scoping is
 * exactly right for "one authoritative player" -- a second tab never
 * inherits or fights over another tab's session.
 *
 * MAP and Blackbook are served from separate dev-server origins today
 * (confirmed by this build's own recon), so `sessionStorage` cannot
 * actually bridge them yet. This module is built for the target
 * same-origin architecture: once both surfaces share an origin, a MAP-side
 * player reads/writes the exact same storage key with zero changes here.
 *
 * PERSONAL mode only: `resolveResumedOffsetSeconds` extrapolates forward
 * from a saved offset by real elapsed time, mirroring the same
 * "reconstruct, don't restart" principle `radioProgramClock.ts` already
 * proves for CLOCK mode. Clock mode never needs this module for its
 * playback POSITION -- it always re-derives from `programStartAtMs` and
 * `Date.now()` via `resolveProgramPosition`, regardless of any saved
 * session -- but a session is still written in Clock mode so `isPlaying`
 * can be reconstructed.
 */

export const RADIO_RESUMABLE_SESSION_STORAGE_KEY = "studiorich.radio.session.v1";

export type RadioResumablePlaybackMode = "personal" | "clock";

export interface RadioResumableSession {
  readonly schemaVersion: 1;
  readonly manifestBaseUrl: string;
  readonly trackId: string;
  readonly trackIndex: number;
  /** Offset in seconds AS OF `referenceAtMs` -- see resolveResumedOffsetSeconds. */
  readonly offsetSeconds: number;
  readonly referenceAtMs: number;
  readonly isPlaying: boolean;
  /**
   * 0..1. No user-facing volume control exists in the app today (see this
   * build's own recon) -- this field exists so the schema is already
   * complete for when one is added; every write today persists `1`.
   */
  readonly volume: number;
  readonly playbackMode: RadioResumablePlaybackMode;
}

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;
type ClearableStorage = Pick<Storage, "removeItem">;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function writeRadioResumableSession(storage: WritableStorage, session: RadioResumableSession): void {
  storage.setItem(RADIO_RESUMABLE_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function clearRadioResumableSession(storage: ClearableStorage): void {
  storage.removeItem(RADIO_RESUMABLE_SESSION_STORAGE_KEY);
}

/** Never throws -- a corrupted or foreign-shaped stored value degrades to "no session" (start fresh), same posture as this codebase's other config parsers. */
export function readRadioResumableSession(storage: ReadableStorage): RadioResumableSession | null {
  const raw = storage.getItem(RADIO_RESUMABLE_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (
      data.schemaVersion !== 1 ||
      typeof data.manifestBaseUrl !== "string" ||
      typeof data.trackId !== "string" ||
      !isFiniteNumber(data.trackIndex) ||
      !isFiniteNumber(data.offsetSeconds) ||
      !isFiniteNumber(data.referenceAtMs) ||
      typeof data.isPlaying !== "boolean" ||
      !isFiniteNumber(data.volume) ||
      (data.playbackMode !== "personal" && data.playbackMode !== "clock")
    ) {
      return null;
    }
    return {
      schemaVersion: 1,
      manifestBaseUrl: data.manifestBaseUrl,
      trackId: data.trackId,
      trackIndex: data.trackIndex,
      offsetSeconds: data.offsetSeconds,
      referenceAtMs: data.referenceAtMs,
      isPlaying: data.isPlaying,
      volume: data.volume,
      playbackMode: data.playbackMode,
    };
  } catch {
    return null;
  }
}

/** PERSONAL mode only -- see this module's own doc for why CLOCK mode never calls this for position. */
export function resolveResumedOffsetSeconds(session: RadioResumableSession, nowMs: number): number {
  if (!session.isPlaying) return session.offsetSeconds;
  const elapsedSeconds = Math.max(0, (nowMs - session.referenceAtMs) / 1000);
  return session.offsetSeconds + elapsedSeconds;
}
