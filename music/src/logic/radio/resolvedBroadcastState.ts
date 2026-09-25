/**
 * Batch 02C -- Canonical Broadcast Resolver Core. The ONE pure function that
 * answers "what should this listener/surface be playing or displaying right
 * now" -- introduced so `eventMusicRuntime.ts` stops independently
 * reimplementing Clock/Personal resolution, and so a future second consumer
 * (a public-player Clock mode, a MAP presentation) can share this exact
 * logic instead of duplicating it again.
 *
 * REUSES, DOES NOT REPLACE, existing authorities:
 * - `resolveProgramPosition` (radioProgramClock.ts) remains the ONLY Clock
 *   timeline math -- this module calls it, never reimplements it.
 * - `resolveResumedOffsetSeconds` (radioResumableSession.ts) remains the
 *   ONLY Personal-mode offset extrapolation -- same relationship.
 * - `RadioWebManifest` (the immutable "RADIO Package") and the caller's own
 *   already-resolved program fields (the operational "RADIO Program" --
 *   `EventProgramConfig`'s shape, not the raw Firestore `EventProgramState`,
 *   since a Firestore document's own bookkeeping fields like `updatedAt` are
 *   irrelevant to pure resolution) are the only inputs.
 *
 * This module owns NO persistence and NO transport. It does not touch
 * localStorage, sessionStorage, or Firestore -- see this batch's own scope
 * note: the previously-proposed `wos:radioBroadcast:resolvedState` channel
 * is explicitly NOT introduced here. Callers decide what to do with the
 * result.
 */

import type { RadioWebManifest } from "../../data/radioWebBundleTypes";
import { resolveProgramPosition, type ProgramEndPolicy, type ProgramTrack } from "./radioProgramClock";
import { resolveResumedOffsetSeconds, type RadioResumableSession } from "../../audio/radioResumableSession";

export type BroadcastPlaybackMode = "personal" | "clock";

/**
 * The operational "RADIO Program" fields resolution actually needs --
 * deliberately NOT the raw Firestore `EventProgramState` (its `status`,
 * `updatedAt`, `updatedBy` are Firestore bookkeeping, already accounted for
 * by whatever loaded this: `loadEventProgramConfig` only ever returns a
 * resolved config for a program whose `status` was already `"active"`).
 * `programId` is nullable because today's only real caller
 * (`eventMusicRuntime.ts`'s `EventProgramConfig`) doesn't carry one --
 * carried through purely for a future caller that does.
 */
export interface BroadcastProgramInput {
  readonly programId: string | null;
  readonly playbackMode: BroadcastPlaybackMode;
  readonly startAtMs: number | null;
  readonly endPolicy: ProgramEndPolicy;
}

export interface ResolveBroadcastStateInput {
  /** `null` means no active RADIO Program at all -- resolves to `"inactive"`. */
  readonly program: BroadcastProgramInput | null;
  /** Which RADIO Package this program's tracks come from -- used only to validate a Personal-mode session belongs to the SAME package, never to fetch anything. */
  readonly manifestBaseUrl: string;
  readonly manifest: RadioWebManifest | null;
  readonly nowMs: number;
  /** Consulted ONLY when `program.playbackMode === "personal"` -- Clock mode always re-derives position from `resolveProgramPosition`, never from a session (see radioResumableSession.ts's own doc). */
  readonly resumableSession: RadioResumableSession | null;
}

/** Mirrors `ProgramClockResolution`'s own status vocabulary (`before-start`/`playing`/`ended`/`empty`), plus `"inactive"` for "no RADIO Program at all" -- a state `resolveProgramPosition` itself has no vocabulary for, since it always assumes a program exists. */
export type ResolvedBroadcastState =
  | { readonly status: "inactive" }
  | { readonly status: "before-start"; readonly programId: string | null; readonly startsInSeconds: number }
  | {
      readonly status: "playing";
      readonly programId: string | null;
      readonly playbackMode: BroadcastPlaybackMode;
      readonly trackId: string;
      readonly trackIndex: number;
      readonly title: string;
      readonly artist: string;
      readonly offsetSeconds: number;
      readonly durationSeconds: number | null;
      readonly isPlaying: boolean;
    }
  | { readonly status: "ended"; readonly programId: string | null }
  | { readonly status: "empty"; readonly programId: string | null };

function manifestTracks(manifest: RadioWebManifest | null): readonly ProgramTrack[] {
  return (manifest?.entries ?? []).map((entry) => ({ id: entry.radioTrackId, durationSeconds: entry.durationSeconds }));
}

function resolveClock(program: BroadcastProgramInput, manifest: RadioWebManifest | null, nowMs: number): ResolvedBroadcastState {
  const { programId } = program;
  if (program.startAtMs === null) return { status: "empty", programId };
  const resolution = resolveProgramPosition({
    tracks: manifestTracks(manifest),
    programStartAtMs: program.startAtMs,
    nowMs,
    endPolicy: program.endPolicy,
  });
  switch (resolution.status) {
    case "before-start":
      return { status: "before-start", programId, startsInSeconds: resolution.startsInSeconds };
    case "ended":
      return { status: "ended", programId };
    case "empty":
      return { status: "empty", programId };
    case "playing": {
      // `resolution.trackIndex` indexes the SAME ordered track list the
      // caller supplied -- same direct-index relationship
      // `eventMusicRuntime.ts` already relied on before this refactor, kept
      // unchanged rather than "corrected" to an id-based lookup, since that
      // would risk changing which entry resolves for an existing program
      // whose manifest happens to contain an unusable-duration track.
      const entry = manifest?.entries[resolution.trackIndex];
      if (!entry) return { status: "empty", programId };
      return {
        status: "playing",
        programId,
        playbackMode: "clock",
        trackId: entry.radioTrackId,
        trackIndex: resolution.trackIndex,
        title: entry.title,
        artist: entry.artist || "StudioRich",
        offsetSeconds: resolution.offsetSeconds,
        durationSeconds: entry.durationSeconds ?? null,
        isPlaying: true,
      };
    }
  }
}

function resolvePersonal(
  program: BroadcastProgramInput,
  manifestBaseUrl: string,
  manifest: RadioWebManifest | null,
  nowMs: number,
  resumableSession: RadioResumableSession | null,
): ResolvedBroadcastState {
  const { programId } = program;
  if (!resumableSession) return { status: "empty", programId };
  if (resumableSession.playbackMode !== "personal") return { status: "empty", programId };
  if (resumableSession.manifestBaseUrl !== manifestBaseUrl) return { status: "empty", programId };
  const entry = manifest?.entries[resumableSession.trackIndex];
  if (!entry) return { status: "empty", programId };
  return {
    status: "playing",
    programId,
    playbackMode: "personal",
    trackId: entry.radioTrackId,
    trackIndex: resumableSession.trackIndex,
    title: entry.title,
    artist: entry.artist || "StudioRich",
    offsetSeconds: resolveResumedOffsetSeconds(resumableSession, nowMs),
    durationSeconds: entry.durationSeconds ?? null,
    isPlaying: resumableSession.isPlaying,
  };
}

/**
 * Pure. Never throws, never touches any storage or network. The single
 * place Clock-mode and Personal-mode resolution branch -- every caller
 * (today: `eventMusicRuntime.ts`'s `resolveStartPosition`/`checkDrift`;
 * later: any other presentation surface) gets the same answer for the same
 * inputs.
 */
export function resolveBroadcastState(input: ResolveBroadcastStateInput): ResolvedBroadcastState {
  const { program, manifestBaseUrl, manifest, nowMs, resumableSession } = input;
  if (!program) return { status: "inactive" };
  if (program.playbackMode === "clock") return resolveClock(program, manifest, nowMs);
  return resolvePersonal(program, manifestBaseUrl, manifest, nowMs, resumableSession);
}
