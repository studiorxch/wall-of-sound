import type { PlaylistRecord } from "../data/playProjectTypes";
import type { Track } from "../data/trackTypes";
import { resolveAudioUrl } from "./audioPathResolver";

export type PlaylistUiState =
  | "draft_empty"
  | "needs_crates"
  | "ready_to_generate"
  | "options_generated"
  | "options_stale"
  | "accepted"
  | "accepted_options_stale"
  | "missing_audio";

export interface PlaylistUiStateSummary {
  state: PlaylistUiState;
  label: string;
  description: string;
  primaryActionLabel: string;
  secondaryActionLabel?: string;
  severity: "neutral" | "good" | "warning" | "critical";
  /** Show this state as a badge in the playlist header. Only true for actionable/problematic states. */
  showHeaderBadge: boolean;
}

export function computePlaylistUiState(
  playlist: PlaylistRecord,
  tracksById?: Map<string, Track>,
  _recoveryWarning?: boolean,
): PlaylistUiStateSummary {
  const crateIds = playlist.sourceCrateIds ?? playlist.crateIds ?? [];
  const hasCrates = crateIds.length > 0;
  const pathOptions = playlist.pathOptions ?? [];
  const hasOptions = pathOptions.length > 0;
  const acceptedId = playlist.acceptedPathOptionId;
  const isAccepted = !!acceptedId && playlist.slots.some((s) => s.assignedTrackId);
  const staleReason = playlist.playlistOptionsStaleReason;
  const isStale = !!staleReason && staleReason !== "options_never_generated";
  const hasSlots = playlist.slots.some((s) => s.assignedTrackId);

  // draft_empty: nothing set up yet
  if (!hasCrates && !hasOptions && !hasSlots) {
    return {
      state: "draft_empty",
      label: "Draft",
      description: "Start by adding one or more crates.",
      primaryActionLabel: "Add Crate",
      severity: "neutral",
      showHeaderBadge: false,
    };
  }

  // accepted states
  if (isAccepted) {
    // Check for missing audio in accepted slots
    if (tracksById) {
      const missingAudio = playlist.slots
        .filter((s) => s.assignedTrackId)
        .some((s) => {
          const t = tracksById.get(s.assignedTrackId!);
          if (!t) return false;
          if (t.sourceOwner === "reference") return false;
          return !resolveAudioUrl(t.audioRelPath) && !t.filePath && !t.objectUrl;
        });
      if (missingAudio) {
        return {
          state: "missing_audio",
          label: "Missing Audio",
          description: "Some playlist tracks have missing or unresolved audio.",
          primaryActionLabel: "Audit Audio",
          severity: "warning",
          showHeaderBadge: true,
        };
      }
    }

    if (isStale) {
      return {
        state: "accepted_options_stale",
        label: "Options Stale",
        description: "Current playlist output is preserved. Regenerate options when ready.",
        primaryActionLabel: "Regenerate Options",
        secondaryActionLabel: "Keep Current Output",
        severity: "warning",
        showHeaderBadge: true,
      };
    }
    return {
      state: "accepted",
      label: "Accepted Playlist",
      description: "Playlist output is active.",
      primaryActionLabel: "Options",
      severity: "good",
      showHeaderBadge: false,
    };
  }

  // no accepted output
  if (!hasCrates) {
    return {
      state: "needs_crates",
      label: "Needs Crates",
      description: "No crates selected — add one or more crates to generate playlist options.",
      primaryActionLabel: "Add Crate",
      severity: "neutral",
      showHeaderBadge: true,
    };
  }

  if (!hasOptions) {
    return {
      state: "ready_to_generate",
      label: "Ready to Generate",
      description: "Crates selected. Generate playlist options from this crate pool.",
      primaryActionLabel: "Generate Options",
      severity: "neutral",
      showHeaderBadge: true,
    };
  }

  if (isStale) {
    return {
      state: "options_stale",
      label: "Options Stale",
      description: "Options are stale. Regenerate to score the current crate pool.",
      primaryActionLabel: "Regenerate Options",
      severity: "warning",
      showHeaderBadge: true,
    };
  }

  return {
    state: "options_generated",
    label: "Options Generated",
    description: "Review generated options and accept one as the playlist.",
    primaryActionLabel: "Review Options",
    severity: "neutral",
    showHeaderBadge: false,
  };
}
