import type { PlayProject, PlaylistRecord } from "./playProjectTypes";
import { DEFAULT_LIBRARY_SOURCES } from "./librarySourceTypes";
import type { PlaylistProject } from "./playlistTypes";
import { normalizeWarningMessages } from "./playlistTypes";
import type { ScheduleState } from "./scheduleTypes";
import { generateFlowCurve } from "../logic/curvePresets";
import { sourceGroupIdFor } from "../logic/sourceEligibility";
import { isValidScheduleBlock } from "../logic/scheduleResolver";
import { normalizeTrackMetadata } from "../logic/trackMetadata";

function makeDefaultSchedule(): ScheduleState {
  const ts = nowIso();
  return {
    scheduleId: genId("sched"),
    title: "PLAY Schedule",
    blocks: [],
    createdAt: ts,
    updatedAt: ts,
  };
}

const V2_KEY = "play-project-v2";
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

export function savePlayProject(project: PlayProject): boolean {
  try {
    // objectUrl is a session-only blob URL — strip before persisting
    const toStore = {
      ...project,
      libraryTracks: project.libraryTracks.map(({ objectUrl: _u, ...rest }) => rest),
    };
    localStorage.setItem(V2_KEY, JSON.stringify(toStore));
    return true;
  } catch (err) {
    // Quota exceeded or serialization failure — log with size hint so it's diagnosable
    const approxKb = Math.round(JSON.stringify(project.libraryTracks).length / 1024);
    console.warn(
      `[PLAY] savePlayProject failed — localStorage quota exceeded? Library: ${project.libraryTracks.length} tracks (~${approxKb} KB).`,
      err,
    );
    return false;
  }
}

/**
 * Validate that a parsed value has the minimum viable v2 project shape.
 * Returns true only if it is structurally a usable project (an object with a
 * playlists array). Missing optional metadata is NOT a validation failure —
 * that is handled by repairStoredProject.
 */
function validateStoredProject(value: unknown): value is PlayProject {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<PlayProject>;
  if (p.schemaVersion !== "play-project-v2") return false;
  if (!Array.isArray(p.playlists)) return false;
  // A project with zero playlists but a library is still hydratable (repair adds a playlist).
  if (p.playlists.length === 0 && !Array.isArray(p.libraryTracks)) return false;
  return true;
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
    };
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

export function loadPlayProject(): PlayProject | null {
  try {
    const raw2 = localStorage.getItem(V2_KEY);
    if (raw2) {
      const parsed: unknown = JSON.parse(raw2);
      if (validateStoredProject(parsed)) {
        return repairStoredProject(parsed);
      }
      // v2 key present but malformed — warn, then try v1 below rather than crashing.
      console.warn("[PLAY] Saved project failed validation; attempting v1 fallback / default.");
    }
    // Fall back to v1 migration
    const raw1 = localStorage.getItem(V1_KEY);
    if (raw1) {
      const v1 = JSON.parse(raw1) as PlaylistProject;
      return migrateV1(v1);
    }
    return null;
  } catch (err) {
    console.warn("[PLAY] Failed to load saved project from storage:", err);
    return null;
  }
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
