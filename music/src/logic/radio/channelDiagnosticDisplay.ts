/**
 * Batch 02R -- pure state->display mapping and time formatting for the
 * Channel Control ON AIR/NEXT diagnostic. No resolution logic lives here
 * -- `resolveChannelTrackBroadcast` (Batch 02O) remains the ONE authority
 * for what's on air; this module only turns its result into copy.
 *
 * RECON FINDING: `trackId` is currently the only safe track identifier
 * `resolveChannelTrackBroadcast` exposes -- no title/artist. Broadening
 * that resolver to also carry cosmetic manifest-entry metadata (title,
 * artist) was judged NOT worth doing for this checkpoint's display-only
 * need; this module displays `trackId` verbatim and the limitation is
 * disclosed here and in the completion report, per this batch's own
 * instruction, rather than silently working around it (e.g. by having
 * this "pure display" module reach out and re-fetch the manifest itself,
 * which would duplicate work the resolver already did).
 *
 * PRESERVES THE UNDERLYING DISTINCTION: every `ChannelTrackBroadcastResult`
 * status maps to a small set of DISPLAY kinds ("on-air"/"inactive"/
 * "before-start"/"error"), but the original status/reason string is
 * always carried through as `technicalReason` -- simplified user-facing
 * wording, never flattened diagnostic information.
 */

import type { RadioProgramSummary } from "@studiorich/member-identity";
import type { ChannelTrackBroadcastResult } from "./channelTrackBroadcast";

export type ChannelDiagnosticDisplayKind = "on-air" | "inactive" | "before-start" | "error";

export interface ChannelDiagnosticDisplay {
  readonly kind: ChannelDiagnosticDisplayKind;
  readonly headline: string;
  readonly detail: string;
  /** The original resolver status/reason, preserved for diagnostics even though `headline`/`detail` are simplified for operators. */
  readonly technicalReason: string;
  readonly programTitle?: string;
  readonly trackLabel?: string;
  readonly programPosition?: string;
  readonly trackPosition?: string;
  readonly programEndsIn?: string;
  readonly nextProgramTitle?: string;
}

/** HH:MM:SS, zero-padded, always three segments for consistency (the brief's own mockup used two different formats for Program vs Track position -- this module deliberately uses one consistent format instead, disclosed here rather than silently matching the mockup exactly). Never negative -- clamps to 0. */
export function formatClockDuration(totalSeconds: number): string {
  const clamped = Number.isFinite(totalSeconds) && totalSeconds > 0 ? Math.floor(totalSeconds) : 0;
  const hours = Math.floor(clamped / 3600);
  const minutes = Math.floor((clamped % 3600) / 60);
  const seconds = clamped % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function titleFor(programId: string, programsById: ReadonlyMap<string, RadioProgramSummary>): string {
  return programsById.get(programId)?.title ?? programId;
}

/** Pure. Never fetches, never mutates -- a straight mapping from an already-resolved result to display copy. */
export function buildChannelDiagnosticDisplay(
  result: ChannelTrackBroadcastResult,
  programsById: ReadonlyMap<string, RadioProgramSummary>,
  nowMs: number,
): ChannelDiagnosticDisplay {
  switch (result.status) {
    case "channel-not-found":
      return { kind: "error", headline: "ERROR", detail: "Channel not found.", technicalReason: "channel-not-found" };
    case "channel-inactive":
      return { kind: "inactive", headline: "INACTIVE", detail: "Channel is not currently broadcasting.", technicalReason: "channel-inactive" };
    case "before-start":
      return {
        kind: "before-start",
        headline: "BEFORE START",
        detail: `Rotation begins in ${formatClockDuration(result.startsInSeconds)}.`,
        technicalReason: "before-start",
      };
    case "hydration-failed":
      return {
        kind: "error",
        headline: "ERROR",
        detail: "Rotation configuration is invalid.",
        technicalReason: `hydration-failed:${result.reason}${result.programId ? `:${result.programId}` : ""}`,
      };
    case "invalid":
      return { kind: "error", headline: "ERROR", detail: "Rotation is invalid.", technicalReason: `invalid:${result.reason}` };
    case "program-not-found":
      return { kind: "error", headline: "ERROR", detail: "The on-air Program is missing from the catalog.", technicalReason: `program-not-found:${result.programId}` };
    case "package-unavailable":
      return {
        kind: "error",
        headline: "ERROR",
        detail: `Couldn't load the on-air Program's package (${result.message}). The Channel clock is unaffected.`,
        technicalReason: `package-unavailable:${result.programId}`,
      };
    case "invalid-manifest":
      return { kind: "error", headline: "ERROR", detail: "The on-air Program's package is invalid.", technicalReason: `invalid-manifest:${result.programId}` };
    case "track-resolution-failed":
      return { kind: "error", headline: "ERROR", detail: "Couldn't resolve a track within the on-air Program.", technicalReason: `track-resolution-failed:${result.programId}` };
    case "on-air":
      return {
        kind: "on-air",
        headline: "ON AIR",
        detail: "",
        technicalReason: "on-air",
        programTitle: titleFor(result.programId, programsById),
        trackLabel: result.trackId,
        programPosition: formatClockDuration(result.programOffsetSeconds),
        trackPosition: formatClockDuration(result.trackOffsetSeconds),
        programEndsIn: formatClockDuration((result.programEndsAtMs - nowMs) / 1000),
        nextProgramTitle: titleFor(result.nextProgramId, programsById),
      };
  }
}
