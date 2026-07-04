import type { Track, TrackSourceOwner } from "./trackTypes";
import type { FlowCurve } from "./flowCurveTypes";
import type { TrackSlot, TrackLock, OrphanTrack } from "./playlistTypes";
import type { ScheduleState } from "./scheduleTypes";
import type { MusicSourcePool } from "./sourcePoolTypes";
import type { BroadcastEvent } from "./eventTypes";
import type { LibrarySourceDefinition, LibraryScanReport } from "./librarySourceTypes";
import type { LibraryTrackFilters } from "../logic/libraryFilters";
import type { PlayColorTheme } from "../logic/colorLab";
export type { PlayColorTheme };

export type PlaylistSourcePolicy =
  | "studiorich_only"
  | "external_only"
  | "mixed"
  | "unknown_review";

export type PlaylistImageSource = "uploaded" | "url" | "generated" | "imported" | "none";

export type PlaylistImage = {
  src: string;
  source: PlaylistImageSource;
  createdAt: string;
  alt?: string;
};

export type BroadcastCardVariant =
  | "now_entering"
  | "playing_next"
  | "live_set"
  | "release_event";

export type BroadcastCardBackgroundSource = "playlist" | "cover_blur" | "dark";

export type PlaylistBroadcastIdentity = {
  presentationMode?: "card" | "overlay" | "full_scene" | "map_channel";
  mapPreset?: string;
  cameraPreset?: string;
  overlayPreset?: string;
  nowPlayingStyle?: string;
  backgroundFit?: "cover" | "contain" | "tile" | "blurred";
  mapChannelUrl?: string; // override WOS local URL for route/map iframe
};

export type PlaylistMood = {
  description?: string;
  tags?: string[];
  energyBias?: number;
  valenceBias?: number;
  densityBias?: number;
  confidence?: number;
};

export type TrackPlaybackStatus = "unknown" | "playable" | "unplayable";

export type TrackPlaybackIssue = {
  status: TrackPlaybackStatus;
  code?: "CODEC" | "NO_SOURCE" | "MISSING" | "NETWORK" | "UNKNOWN";
  message?: string;
  detectedAt?: string;
};

export type PlaylistFillReport = {
  attemptedAt: string;
  targetSeconds: number;
  currentSecondsBefore: number;
  currentSecondsAfter: number;
  missingSecondsBefore: number;
  missingSecondsAfter: number;
  eligibleTrackCount: number;
  insertedTrackCount: number;
  reason?: string;
};

export type PlaylistRecord = {
  playlistId: string;
  title: string;
  description?: string;
  // Source-group isolation (0621E). sourceGroupId scopes which tracks are
  // eligible for automatic fill/regenerate. allowCrossGroupAutofill (default
  // false/undefined) opts a playlist into pulling from the whole library.
  sourceGroupId?: string;
  allowCrossGroupAutofill?: boolean;
  slots: TrackSlot[];
  curve: FlowCurve;
  locks: TrackLock[];
  orphans: OrphanTrack[];
  targetDurationMinutes: number;
  mixBufferMinutes?: number;
  coverImage?: PlaylistImage;
  backgroundImage?: PlaylistImage;
  accentColor?: string;
  mood?: PlaylistMood;
  broadcastIdentity?: PlaylistBroadcastIdentity;
  createdAt: string;
  updatedAt: string;
  locked?: boolean;
  manualOrderDirty?: boolean;
  // Slot IDs that were intentionally emptied via "Remove and Leave Gap" (0622C).
  // assignPlaylistToCurve skips these slots so the gap is preserved after curve edits.
  // Cleared when the slot is filled or deleted.
  preservedGapSlotIds?: string[];
  lastFillReport?: PlaylistFillReport;
  // Event-first programming foundations (0623C)
  playlistRole?: "static" | "template" | "event_generated";
  sourcePoolId?: string;
  targetTrackCount?: number;
  regenerationMode?: "manual" | "per_event_occurrence" | "daily" | "weekly";
  templateSourceFilters?: LibraryTrackFilters;
  // Map Focus color theme (0624H)
  colorTheme?: PlayColorTheme;
  // Theme variation presets (0624J)
  colorThemes?: PlayColorTheme[];
  activeColorThemeId?: string;
  // Source safety (0630C)
  sourcePolicy?: PlaylistSourcePolicy;
  allowedSourceOwners?: TrackSourceOwner[];
  // Deck routing (0702B): hint for which deck this playlist defaults to
  playlistKind?: "music" | "reference_overlay" | "mixed" | "unknown";
};

export type PlayProject = {
  schemaVersion: "play-project-v2";
  libraryTracks: Track[];
  activePlaylistId: string;
  playlists: PlaylistRecord[];
  excludedTrackIds: string[];
  trackPlaybackIssues?: Record<string, TrackPlaybackIssue>;
  // Scheduler foundation (0621G). Optional so existing projects load; storage
  // repair backfills an empty default schedule.
  schedule?: ScheduleState;
  // Event-first programming foundations (0623C). Optional for backward compat.
  sourcePools?: MusicSourcePool[];
  broadcastEvents?: BroadcastEvent[];
  // Library source definitions (0701E)
  librarySources?: LibrarySourceDefinition[];
  libraryScanReports?: LibraryScanReport[];
  createdAt: string;
  updatedAt: string;
};
