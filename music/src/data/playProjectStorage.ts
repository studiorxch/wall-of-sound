import type { PlayProject, PlaylistRecord } from "./playProjectTypes";
import { saveMusicState, loadMusicState, loadMusicStateAsync, primeStateCache, type MusicSaveReason } from "../logic/musicAutosave";
import { DEFAULT_LIBRARY_SOURCES } from "./librarySourceTypes";
import type { PlaylistProject } from "./playlistTypes";
import { normalizeWarningMessages } from "./playlistTypes";
import type { ScheduleState } from "./scheduleTypes";
import { generateFlowCurve } from "../logic/curvePresets";
import { sourceGroupIdFor } from "../logic/sourceEligibility";
import { isValidScheduleBlock } from "../logic/scheduleResolver";
import { normalizeTrackMetadata } from "../logic/trackMetadata";
import { normalizeEnergyEnvelope, defaultEnvelopeForSection } from "../logic/playlistEnergyEnvelope";
import { migrateApprovedLoopsToRevisionsV1 } from "./migrations/migrateLoopRevisionsV1";
import { reconcileLibraryGridPreferences } from "../logic/library/libraryColumns";
import type { LibrarySourceKey } from "./libraryGridTypes";

function makeDefaultSchedule(): ScheduleState {
  const ts = nowIso();
  return {
    scheduleId: genId("sched"),
    title: "MUSIC Schedule",
    blocks: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

const V1_KEY = "flow_curve_project";

function nowIso(): string {
  return new Date().toISOString();
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function migrateV1(p: PlaylistProject): PlayProject {
  const ts = p.createdAt ?? nowIso();
  const playlistId = genId("pl");
  const defaultCurve = generateFlowCurve({
    presetType: "elegant_nested_arc",
    targetDurationSeconds: 7200,
    curveDensity: "medium",
  });
  const playlist: PlaylistRecord = {
    playlistId,
    title: p.title ?? "My Mix",
    sourceGroupId: sourceGroupIdFor(playlistId),
    slots: p.slots ?? [],
    curve: p.flowCurve ?? defaultCurve,
    locks: p.locks ?? [],
    orphans: p.orphans ?? [],
    targetDurationMinutes: Math.round((p.targetDurationSeconds ?? 7200) / 60),
    manualOrderDirty: (p.slots?.length ?? 0) > 0,
    createdAt: ts,
    updatedAt: ts,
  };
  return {
    schemaVersion: "play-project-v2",
    libraryTracks: p.tracks ?? [],
    activePlaylistId: playlistId,
    playlists: [playlist],
    excludedTrackIds: p.excludedTrackIds ?? [],
    createdAt: ts,
    updatedAt: nowIso(),
  };
}

// savePlayProject routes through the centralized autosave system.
// Pass a reason when known; defaults to "unknown" for legacy call sites.
export function savePlayProject(
  project: PlayProject,
  opts?: { reason?: MusicSaveReason; allowDestructive?: boolean; confirmedByUser?: boolean },
): boolean {
  const result = saveMusicState(project, {
    reason: opts?.reason ?? "unknown",
    allowDestructive: opts?.allowDestructive,
    confirmedByUser: opts?.confirmedByUser,
  });
  return result.ok;
}

/**
 * Repair minor, non-fatal issues on an otherwise-valid stored project so a small
 * inconsistency never discards the user's saved work. Mutates a shallow copy.
 * Exported so the import flow can repair a parsed project before loading it.
 */
export function repairStoredProject(project: PlayProject): PlayProject {
  const repaired: PlayProject = { ...project };

  if (!Array.isArray(repaired.playlists)) repaired.playlists = [];
  if (!Array.isArray(repaired.libraryTracks)) repaired.libraryTracks = [];
  if (!Array.isArray(repaired.excludedTrackIds)) repaired.excludedTrackIds = [];
  // Event-first foundations (0623C)
  if (!Array.isArray(repaired.sourcePools)) repaired.sourcePools = [];
  if (!Array.isArray(repaired.broadcastEvents)) repaired.broadcastEvents = [];
  // Seed default library sources (0701E) if missing or empty
  if (!Array.isArray(repaired.librarySources) || repaired.librarySources.length === 0) {
    repaired.librarySources = DEFAULT_LIBRARY_SOURCES;
  } else {
    // Ensure all 3 default sources exist (merge by id without overwriting user changes)
    const existingIds = new Set(repaired.librarySources.map((s) => s.id));
    for (const def of DEFAULT_LIBRARY_SOURCES) {
      if (!existingIds.has(def.id)) repaired.librarySources.push(def);
    }
  }
  if (!Array.isArray(repaired.libraryScanReports)) repaired.libraryScanReports = [];
  if (!Array.isArray(repaired.crates)) repaired.crates = [];
  if (!Array.isArray(repaired.loops)) repaired.loops = [];
  if (!Array.isArray(repaired.audioExperiments)) repaired.audioExperiments = [];
  if (!Array.isArray(repaired.loopRenders)) repaired.loopRenders = [];
  // 0715C — shape-repair only; the approved-loop→revision migration itself
  // is a separate, explicit, versioned step (migrateApprovedLoopsToRevisionsV1),
  // never folded in here.
  if (!Array.isArray(repaired.loopWorkspaceDrafts)) repaired.loopWorkspaceDrafts = [];
  if (!Array.isArray(repaired.loopRevisions)) repaired.loopRevisions = [];
  if (!repaired.loopBinViewState || typeof repaired.loopBinViewState !== "object") {
    repaired.loopBinViewState = { tab: "approved", filters: {}, sort: "start_time", updatedAt: nowIso() };
  }
  // 0717C_MUSIC_Complete_Song_Intelligence_and_Section_Map
  if (!Array.isArray(repaired.songAnalyses)) repaired.songAnalyses = [];
  // 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation
  if (!Array.isArray(repaired.radioInboxItems)) repaired.radioInboxItems = [];
  if (!Array.isArray(repaired.radioPlaylists)) repaired.radioPlaylists = [];
  // 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows
  if (!Array.isArray(repaired.radioBanks)) repaired.radioBanks = [];
  if (!Array.isArray(repaired.radioDashboardReceipts)) repaired.radioDashboardReceipts = [];
  // 0718B_RADIO_Web_Publication_Asset_Export_Bridge
  if (!Array.isArray(repaired.radioWebExports)) repaired.radioWebExports = [];
  // 0721_MUSIC_RADIO_Sectional_Loopchain_Player
  if (!Array.isArray(repaired.loopchainSectionAcceptances)) repaired.loopchainSectionAcceptances = [];
  if (!Array.isArray(repaired.loopchainObservations)) repaired.loopchainObservations = [];
  if (!Array.isArray(repaired.loopchainListenerFeedback)) repaired.loopchainListenerFeedback = [];
  // 0721B_MUSIC_Catalog_Data_Grid_Comments (expanded to the shared Library
  // data grid) — one-time migration: a project saved by the Catalog-only
  // 0721B build stored its single record under the old `catalogGridPreferences`
  // field name. If that field is present and the new per-library map hasn't
  // captured Catalog's prefs yet, carry it forward as `libraryGridPreferences.studiorich`
  // rather than silently discarding a real, already-customized layout.
  const legacyCatalogPrefs = (repaired as unknown as { catalogGridPreferences?: unknown }).catalogGridPreferences;
  const libraryPrefsSeed = { ...(repaired.libraryGridPreferences ?? {}) };
  if (legacyCatalogPrefs && !libraryPrefsSeed.studiorich) {
    libraryPrefsSeed.studiorich = legacyCatalogPrefs as never;
  }
  delete (repaired as unknown as { catalogGridPreferences?: unknown }).catalogGridPreferences;

  // Always run every library's record through the reconciler (not just a
  // presence check), so a corrupt/stale-version record left by a future
  // format change is defensively normalized rather than merely
  // defaulted-if-absent — and each library is reconciled against its own
  // registry defaults, never another library's.
  const librarySourceKeys: LibrarySourceKey[] = ["studiorich", "external", "reference"];
  repaired.libraryGridPreferences = {};
  for (const key of librarySourceKeys) {
    repaired.libraryGridPreferences[key] = reconcileLibraryGridPreferences(libraryPrefsSeed[key], key);
  }

  // Repair activePlaylistId: if missing or pointing at a deleted playlist,
  // fall back to the first playlist rather than discarding the project.
  const ids = new Set(repaired.playlists.map((pl) => pl.playlistId));
  if (typeof repaired.activePlaylistId !== "string" || !ids.has(repaired.activePlaylistId)) {
    const firstId = repaired.playlists[0]?.playlistId;
    if (firstId) {
      if (repaired.activePlaylistId) {
        console.warn(
          `[PLAY] Stored activePlaylistId "${repaired.activePlaylistId}" not found; repaired to "${firstId}".`,
        );
      }
      repaired.activePlaylistId = firstId;
    }
  }

  // Backfill missing timestamps + source-group ids on playlists (0621E),
  // and normalize slot warning messages so malformed data can't crash render (0621F).
  const ts = nowIso();
  repaired.playlists = repaired.playlists.map((pl) => {
    const base = {
      ...pl,
      createdAt: pl.createdAt ?? ts,
      updatedAt: pl.updatedAt ?? ts,
      sourceGroupId: pl.sourceGroupId ?? sourceGroupIdFor(pl.playlistId),
      preservedGapSlotIds: Array.isArray(pl.preservedGapSlotIds) ? pl.preservedGapSlotIds : [],
      playlistRole: pl.playlistRole ?? "static",
      slots: Array.isArray(pl.slots)
        ? pl.slots.map((s) => ({ ...s, warningMessages: normalizeWarningMessages(s.warningMessages) }))
        : [],
      // 0722D — spec §5.3: hydrate missing transition collections to an
      // empty collection without crashing older projects.
      djTransitionPlans: Array.isArray(pl.djTransitionPlans) ? pl.djTransitionPlans : [],
    };
    // Energy-envelope migration (0712_MUSIC_Playlist_Section_Energy_Envelopes
    // §4.2) — a section saved before this feature existed has no
    // `energyEnvelope` at all; one saved by a partially-written draft might
    // have a malformed one. Never overwrite an already-valid explicit
    // envelope; every section must leave this repair with a complete,
    // normalized one.
    if (base.shapeConfig && Array.isArray(base.shapeConfig.sections)) {
      base.shapeConfig = {
        ...base.shapeConfig,
        sections: base.shapeConfig.sections.map((sec) => ({
          ...sec,
          energyEnvelope: normalizeEnergyEnvelope(sec.energyEnvelope, defaultEnvelopeForSection(sec.id)),
        })),
      };
    }
    // 0624J — ensure colorTheme has id/name; migrate to colorThemes if absent
    let colorTheme = base.colorTheme;
    if (colorTheme) {
      if (!colorTheme.id || !colorTheme.name) {
        colorTheme = {
          ...colorTheme,
          id: colorTheme.id || genId("theme"),
          name: colorTheme.name || "Untitled Map Theme",
        };
      }
    }
    let colorThemes = Array.isArray(base.colorThemes) ? base.colorThemes : [];
    // Ensure each preset has id/name
    colorThemes = colorThemes.map((t) => ({
      ...t,
      id: t.id || genId("theme"),
      name: t.name || "Untitled Map Theme",
    }));
    // Migrate legacy single colorTheme into presets array
    if (colorThemes.length === 0 && colorTheme) {
      colorThemes = [colorTheme];
    }
    let activeColorThemeId = base.activeColorThemeId;
    if (colorThemes.length > 0 && !colorThemes.some((t) => t.id === activeColorThemeId)) {
      activeColorThemeId = colorThemes[0].id;
    }
    return { ...base, colorTheme, colorThemes, activeColorThemeId };
  });

  // Backfill track source groups (0621E): a track that already lives in exactly
  // one playlist is scoped to that playlist's group. Tracks in zero or multiple
  // playlists are left unscoped (globally eligible) so nothing breaks.
  const membership = new Map<string, Set<string>>();
  for (const pl of repaired.playlists) {
    for (const slot of pl.slots ?? []) {
      const id = slot.assignedTrackId;
      if (!id) continue;
      if (!membership.has(id)) membership.set(id, new Set());
      membership.get(id)!.add(pl.sourceGroupId!);
    }
  }
  let scopedCount = 0;
  repaired.libraryTracks = repaired.libraryTracks.map((t) => {
    // Source-group backfill (0621E)
    let track = t;
    if (t.sourceGroupId == null) {
      const groups = membership.get(t.trackId);
      if (groups && groups.size === 1) {
        scopedCount++;
        track = { ...t, sourceGroupId: [...groups][0] };
      }
    }
    // Library field backfill (0623C + 0624C + 0624E + 0624F)
    const backfilled = {
      ...track,
      genres: Array.isArray(track.genres) ? track.genres : [],
      moodTags: Array.isArray(track.moodTags) ? track.moodTags : [],
      moodSuggestions: Array.isArray(track.moodSuggestions) ? track.moodSuggestions : [],
      sourceOwner: track.sourceOwner ?? "unknown",
      sourcePoolIds: Array.isArray(track.sourcePoolIds) ? track.sourcePoolIds : [],
      grouping: track.grouping ?? "",
      albumArtist: track.albumArtist ?? "",
      audioAnalysis: track.audioAnalysis ?? undefined,
      archiveStatus: track.archiveStatus ?? "library",
    };
    return normalizeTrackMetadata(backfilled);
  });
  if (scopedCount > 0) {
    console.info(`[PLAY] Source-group migration scoped ${scopedCount} track(s) to their playlist.`);
  }

  // Schedule foundation (0621G): backfill a default schedule if missing, and
  // drop malformed blocks so a bad block can never crash the scheduler.
  if (!repaired.schedule || typeof repaired.schedule !== "object") {
    repaired.schedule = makeDefaultSchedule();
  } else {
    const blocks = Array.isArray(repaired.schedule.blocks) ? repaired.schedule.blocks : [];
    const validBlocks = blocks.filter(isValidScheduleBlock);
    if (validBlocks.length !== blocks.length) {
      console.warn(`[PLAY] Dropped ${blocks.length - validBlocks.length} malformed schedule block(s).`);
    }
    repaired.schedule = {
      ...makeDefaultSchedule(),
      ...repaired.schedule,
      blocks: validBlocks,
    };
  }

  return repaired;
}

/** Async load from IndexedDB with migration. Use this in the startup useEffect. */
export async function loadPlayProjectAsync(): Promise<PlayProject | null> {
  const result = await loadMusicStateAsync();
  if (result?.state) {
    primeStateCache(result.state);
    // 0715C §37 — explicit, versioned, idempotent migration; called
    // directly here (same load path as migrateV1 below), never folded
    // into repairStoredProject itself.
    return migrateApprovedLoopsToRevisionsV1(repairStoredProject(result.state));
  }
  // Fall through to legacy v1 format
  try {
    const raw1 = localStorage.getItem(V1_KEY);
    if (raw1) {
      const v1 = JSON.parse(raw1) as PlaylistProject;
      return migrateApprovedLoopsToRevisionsV1(migrateV1(v1));
    }
  } catch (err) {
    console.warn("[PLAY] Failed to load v1 fallback:", err);
  }
  return null;
}

export function loadPlayProject(): PlayProject | null {
  // loadMusicState() handles cache + localStorage fallback for useState initializers.
  // Prefer loadPlayProjectAsync() in the startup useEffect — it reads from IDB.
  const state = loadMusicState();
  if (state) return migrateApprovedLoopsToRevisionsV1(repairStoredProject(state));

  // Final fallback: v1 legacy format
  try {
    const raw1 = localStorage.getItem(V1_KEY);
    if (raw1) {
      const v1 = JSON.parse(raw1) as PlaylistProject;
      return migrateApprovedLoopsToRevisionsV1(migrateV1(v1));
    }
  } catch (err) {
    console.warn("[PLAY] Failed to load v1 fallback:", err);
  }
  return null;
}

export function loadPlayProjectFromJson(jsonText: string): PlayProject | null {
  try {
    const parsed = JSON.parse(jsonText);
    if (parsed?.schemaVersion === "play-project-v2") return parsed as PlayProject;
    // Try v1 format
    if (parsed?.tracks !== undefined && parsed?.flowCurve !== undefined) {
      return migrateV1(parsed as PlaylistProject);
    }
    return null;
  } catch {
    return null;
  }
}
