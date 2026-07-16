import type { Track, TrackSourceOwner } from "./trackTypes";
import type { FlowCurve } from "./flowCurveTypes";
import type { TrackSlot, TrackLock, OrphanTrack } from "./playlistTypes";
import type { ScheduleState } from "./scheduleTypes";
import type { MusicSourcePool } from "./sourcePoolTypes";
import type { BroadcastEvent } from "./eventTypes";
import type { LibrarySourceDefinition, LibraryScanReport } from "./librarySourceTypes";
import type { LibraryTrackFilters } from "../logic/libraryFilters";
import type { PlayColorTheme } from "../logic/colorLab";
import type { CrateRecord } from "./crateTypes";
import type { PlaylistPathOption } from "./playlistPathTypes";
export type { PlaylistPathOption } from "./playlistPathTypes";
export type { PlayColorTheme };
export type { CrateRecord };

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
  // Recheck/repair lifecycle (0709) — all optional, existing saved projects unaffected.
  firstSeenAt?: string;
  lastSeenAt?: string;
  lastCheckedAt?: string;
  clearedAt?: string;
  sourcePath?: string;
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

export type PlaylistBuildRecipe = {
  sourceOwners?: TrackSourceOwner[];
  moodTags?: string[];
  groupings?: string[];
  genres?: string[];
  minRating?: number;
  search?: string;
  matchMode?: "all_groups" | "any_signal";
};

export type DuplicateFamilyMode = "allow" | "avoid_family" | "separate_family";
export type DuplicatePreferredVariant = "highest_rating" | "non_s01" | "longest" | "shortest" | "newest" | "none";

export type PlaylistDuplicateRules = {
  mode: DuplicateFamilyMode;
  separationTracks: number;
  preferredVariant: DuplicatePreferredVariant;
};

export const DEFAULT_DUPLICATE_RULES: PlaylistDuplicateRules = {
  mode: "separate_family",
  separationTracks: 8,
  preferredVariant: "non_s01",
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
  // Integrated playlist builder recipe — filters used to populate this playlist
  buildRecipe?: PlaylistBuildRecipe;
  // Crate-first population (Phase 1): selected crate IDs whose union is the candidate pool
  crateIds?: string[];
  // Duplicate family rules (Phase 2 — 0704D)
  duplicateRules?: PlaylistDuplicateRules;
  // Playlist Path Options (0704G)
  pathOptions?: PlaylistPathOption[];
  acceptedPathOptionId?: string;
  // Metadata repair impact (0705E) — set after AudioLab import marks options stale
  metadataRepairImpact?: import("./playlistPathTypes").PlaylistMetadataRepairImpact;
  // Playlist Options provenance (0707_PlaylistOptionsCrateFlowCleanup)
  // sourceCrateIds is the canonical crate list; crateIds is kept for legacy compatibility.
  sourceCrateIds?: string[];
  optionsGeneratedAt?: string;
  optionsGeneratedFromCrateIds?: string[];
  optionsGeneratedFromTrackSignature?: string;
  optionsGeneratedFromMetadataVersion?: string;
  playlistOptionsStaleReason?: "crate_sources_changed" | "metadata_changed" | "track_pool_changed" | "options_never_generated" | null;
  // Artwork display mode (0706A)
  artworkDisplayMode?: "cover_only" | "banner" | "full_atmosphere";
  // URL-based artwork references (0706A follow-up) — preferred over base64 coverImage.src
  coverArtUrl?: string;
  backgroundArtUrl?: string;
  // High-quality broadcast background (1280px/0.87) — separate from the 400px UI thumbnail
  broadcastBackgroundArt?: string;
  // Playlist section/weight generator config (0711_MUSIC_Playlist_Section_Weights_Restore).
  // Persisted so Sections/Weights can be edited after creation and regeneration
  // paths can rebuild the playlist section-by-section instead of one flat pool.
  arcConfig?: import("./playlistArcTypes").PlaylistArcConfig;
  // Crate-first playlist shape (0711_MUSIC_Crate_First_Playlist_Shape_UX_Revision) —
  // the user-facing wizard model (Intro/S01.../Outro fed by weighted crates).
  // Independent of arcConfig; a playlist created via the shape wizard carries
  // this instead.
  shapeConfig?: import("./playlistShapeTypes").PlaylistShapeConfig;
  // Playlist Local Repair (0713_MUSIC_Playlist_Local_Repair_And_Gap_Analysis
  // §13/§16) — persists ONLY the user's disposition on issues (accepted
  // temporary matches, "keep current" exceptions, ignored issues), keyed by
  // a deterministic issue key. Issues themselves are always recomputed from
  // current playlist + library state, never persisted.
  repairState?: import("./playlistRepairTypes").PlaylistRepairState;
  // Playlist Transition Preparation (0714_MUSIC_Playlist_Transition_
  // Preparation) — the saved, deterministic playback plan for every
  // adjacent track pair in THIS playlist (§3: belongs to the ordered pair
  // inside a playlist, never to the track record). Undefined until
  // "Prepare for Playback" has run at least once.
  playbackPreparation?: import("./playlistTransitionTypes").PlaylistPlaybackPreparation;
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
  // Crates — reusable filtered candidate pools (Phase 1)
  crates?: CrateRecord[];
  // Playlist Local Repair — library gap register (0713_MUSIC_Playlist_Local_
  // Repair_And_Gap_Analysis §13). Spans playlists (a gap can be sourced from
  // several), so it lives at the project level, not per-playlist.
  libraryGaps?: import("./playlistRepairTypes").LibraryGapRecord[];
  // Metadata import history (0705D)
  metadataImportHistory?: import("./metadataSourceTypes").MetadataImportRecord[];
  // External identity repair history (0705H)
  externalIdentityRepairHistory?: import("../logic/externalIdentityRepair").ExternalIdentityRepairRecord[];
  // External identity batch repair history (0705I)
  externalIdentityBatchRepairHistory?: import("../logic/externalIdentityBatchReview").ExternalIdentityBatchRepairRecord[];
  // Issue IDs the user has ignored or deferred (0705H)
  ignoredIssueIds?: string[];
  deferredIssueIds?: string[];
  // Sectional Looper and Loop Library (0714_MUSIC_Sectional_Looper_And_Loop_
  // Library v1.0.0) — approved/candidate loop assets and resumable
  // Sectional Looper experiment records. Project-level (not per-playlist or
  // per-track) since a loop's lineage points back to a track by ID.
  loops?: import("./loopTypes").LoopAsset[];
  audioExperiments?: import("./loopTypes").AudioExperimentRecord[];
  // Loop Rendering and External Handoff (0714O_MUSIC_Loop_Rendering_And_
  // External_Handoff v1.0.0) — one LoopRenderRecord per loop that has ever
  // been rendered; a loop without an entry here is a non-destructive
  // reference only.
  loopRenders?: import("./loopRenderTypes").LoopRenderRecord[];
  // 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion — draft
  // selection persistence (§17), the approved-loop revision model (§21),
  // and Loop Bin tab/filter/sort state (§27), all project-level for the
  // same reason as `loops` above. `loopRevisionsMigrationVersion` gates the
  // explicit, versioned §37 migration in
  // ./migrations/migrateLoopRevisionsV1.ts — never advanced by
  // repairStoredProject itself.
  loopWorkspaceDrafts?: import("./loopTypes").DraftLoopSelection[];
  loopRevisions?: import("./loopTypes").LoopRevision[];
  loopBinViewState?: import("./loopTypes").LoopBinViewState;
  loopRevisionsMigrationVersion?: number;
  createdAt: string;
  updatedAt: string;
};
