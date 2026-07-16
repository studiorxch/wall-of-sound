// Playlist Transition Preparation — cue selection (§9, §10). Never snaps to
// untrusted beat/bar evidence; playback bounds are authoritative for
// non-destructive start/end behavior and are never altered.

import type { Track } from "../../data/trackTypes";
import { isBeatMapTrustedForAnalysis } from "../beatMap/beatMapTrust";
import { isPlaybackBoundsTrusted } from "../playbackBounds/playbackBoundsTrust";

export interface OutgoingCueResult {
  outgoingEndSeconds: number;
  outgoingAvailableSeconds: number;
  outgoingBarIndex?: number;
  selectedFromBoundary: "preferred_end" | "outro_region" | "audible_end" | "manual";
  fromBeatMapTrusted: boolean;
  fromBarGridTrusted: boolean;
  fromPlaybackBoundsTrusted: boolean;
  fromOutroRegionAvailable: boolean;
}

export interface IncomingCueResult {
  incomingCueSeconds: number;
  incomingFullLevelSeconds?: number;
  incomingAvailableSeconds: number;
  incomingBarIndex?: number;
  selectedToBoundary: "preferred_start" | "intro_region" | "audible_start" | "manual";
  toBeatMapTrusted: boolean;
  toBarGridTrusted: boolean;
  toPlaybackBoundsTrusted: boolean;
  toIntroRegionAvailable: boolean;
}

const DEFAULT_AVAILABLE_SECONDS = 4; // conservative fallback when no region evidence exists at all

// §9 outgoing cue: trusted clean outro region → trusted preferred end →
// audible end → source end fallback.
export function selectOutgoingCue(track: Track): OutgoingCueResult {
  const beatMap = track.beatMap;
  const bounds = track.playbackBounds;
  const beatMapTrusted = isBeatMapTrustedForAnalysis(beatMap);
  const barGridTrusted = beatMapTrusted && (beatMap?.barStartTimesSeconds.length ?? 0) > 0;
  const boundsTrusted = isPlaybackBoundsTrusted(bounds);
  const outroAvailable = beatMapTrusted && beatMap?.outroRegion != null;

  if (outroAvailable && beatMap?.outroRegion) {
    const barIndex = beatMap.barStartTimesSeconds.findIndex((t) => Math.abs(t - beatMap.outroRegion!.startSeconds) < 1e-3);
    return {
      outgoingEndSeconds: beatMap.outroRegion.endSeconds,
      outgoingAvailableSeconds: Math.max(0, beatMap.outroRegion.endSeconds - beatMap.outroRegion.startSeconds),
      outgoingBarIndex: barIndex >= 0 ? barIndex : undefined,
      selectedFromBoundary: "outro_region",
      fromBeatMapTrusted: beatMapTrusted, fromBarGridTrusted: barGridTrusted, fromPlaybackBoundsTrusted: boundsTrusted,
      fromOutroRegionAvailable: true,
    };
  }

  if (boundsTrusted && bounds) {
    return {
      outgoingEndSeconds: bounds.preferredEndSeconds,
      outgoingAvailableSeconds: Math.max(0, bounds.preferredEndSeconds - bounds.audibleStartSeconds > DEFAULT_AVAILABLE_SECONDS
        ? DEFAULT_AVAILABLE_SECONDS : bounds.preferredEndSeconds),
      selectedFromBoundary: "preferred_end",
      fromBeatMapTrusted: beatMapTrusted, fromBarGridTrusted: barGridTrusted, fromPlaybackBoundsTrusted: boundsTrusted,
      fromOutroRegionAvailable: false,
    };
  }

  const audibleEnd = bounds?.audibleEndSeconds ?? track.durationSeconds ?? 0;
  return {
    outgoingEndSeconds: audibleEnd,
    outgoingAvailableSeconds: DEFAULT_AVAILABLE_SECONDS,
    selectedFromBoundary: "audible_end",
    fromBeatMapTrusted: beatMapTrusted, fromBarGridTrusted: barGridTrusted, fromPlaybackBoundsTrusted: boundsTrusted,
    fromOutroRegionAvailable: false,
  };
}

// §9 incoming cue: trusted clean intro region → trusted first downbeat →
// trusted preferred start → audible start → source start fallback.
export function selectIncomingCue(track: Track): IncomingCueResult {
  const beatMap = track.beatMap;
  const bounds = track.playbackBounds;
  const beatMapTrusted = isBeatMapTrustedForAnalysis(beatMap);
  const barGridTrusted = beatMapTrusted && (beatMap?.barStartTimesSeconds.length ?? 0) > 0;
  const boundsTrusted = isPlaybackBoundsTrusted(bounds);
  const introAvailable = beatMapTrusted && beatMap?.introRegion != null;

  if (introAvailable && beatMap?.introRegion) {
    const barIndex = beatMap.barStartTimesSeconds.findIndex((t) => Math.abs(t - beatMap.introRegion!.startSeconds) < 1e-3);
    return {
      incomingCueSeconds: beatMap.introRegion.startSeconds,
      incomingFullLevelSeconds: beatMap.introRegion.endSeconds,
      incomingAvailableSeconds: Math.max(0, beatMap.introRegion.endSeconds - beatMap.introRegion.startSeconds),
      incomingBarIndex: barIndex >= 0 ? barIndex : undefined,
      selectedToBoundary: "intro_region",
      toBeatMapTrusted: beatMapTrusted, toBarGridTrusted: barGridTrusted, toPlaybackBoundsTrusted: boundsTrusted,
      toIntroRegionAvailable: true,
    };
  }

  if (beatMapTrusted && beatMap?.firstDownbeatSeconds != null) {
    return {
      incomingCueSeconds: beatMap.firstDownbeatSeconds,
      incomingAvailableSeconds: DEFAULT_AVAILABLE_SECONDS,
      selectedToBoundary: "intro_region",
      toBeatMapTrusted: beatMapTrusted, toBarGridTrusted: barGridTrusted, toPlaybackBoundsTrusted: boundsTrusted,
      toIntroRegionAvailable: false,
    };
  }

  if (boundsTrusted && bounds) {
    return {
      incomingCueSeconds: bounds.preferredStartSeconds,
      incomingAvailableSeconds: DEFAULT_AVAILABLE_SECONDS,
      selectedToBoundary: "preferred_start",
      toBeatMapTrusted: beatMapTrusted, toBarGridTrusted: barGridTrusted, toPlaybackBoundsTrusted: boundsTrusted,
      toIntroRegionAvailable: false,
    };
  }

  return {
    incomingCueSeconds: bounds?.audibleStartSeconds ?? 0,
    incomingAvailableSeconds: DEFAULT_AVAILABLE_SECONDS,
    selectedToBoundary: "audible_start",
    toBeatMapTrusted: beatMapTrusted, toBarGridTrusted: barGridTrusted, toPlaybackBoundsTrusted: boundsTrusted,
    toIntroRegionAvailable: false,
  };
}

