import { useState, useCallback, useEffect, useRef } from "react";
import type { Track, TrackSourceOwner } from "./data/trackTypes";
import { parseCsvTracks } from "./data/importCsv";
import type { LibraryScanReport } from "./data/librarySourceTypes";
import { LIBRARY_PATHS } from "./data/librarySourceTypes";
import { upsertTracks, repairDuplicates } from "./logic/trackUpsertKey";
import { linkAudioFiles } from "./logic/audioFolderLinker";
import type { AudioLinkReport } from "./logic/audioFolderLinker";
import { PlaylistBuilderPanel } from "./ui/PlaylistBuilderPanel";
import type { PlaylistBuilderResult } from "./ui/PlaylistBuilderPanel";
import { NewPlaylistDialog } from "./ui/NewPlaylistDialog";
import type { NewPlaylistDialogResult } from "./ui/NewPlaylistDialog";
import { suggestMoodsFromAnalysis } from "./logic/moodSuggestions";
import { analyzeMechanicalMoods } from "./logic/mechanicalMoodAnalyzer";
import type { AnalyzerJobStatus } from "./data/trackTypes";
import type { FlowCurve, CurvePresetType } from "./data/flowCurveTypes";
import type { TrackLock, TrackSlot } from "./data/playlistTypes";
import type { PlayProject, PlaylistRecord, PlaylistFillReport, TrackPlaybackIssue, PlaylistImage, PlaylistBroadcastIdentity } from "./data/playProjectTypes";
import type { PlaybackStatus } from "./data/playbackTypes";
import { generateFlowCurve } from "./logic/curvePresets";
import { assignPlaylistToCurve } from "./logic/playlistAssigner";
import { evaluateSlotWarnings } from "./logic/warningEngine";
import { savePlayProject, loadPlayProject, repairStoredProject } from "./data/playProjectStorage";
import { downloadPlayProjectExport, stableProjectHash } from "./data/playProjectExport";
import { buildPlaylistSlotsFromSourcePool } from "./logic/sourcePoolFill";
import { getNextPlayableSlot, getPreviousPlayableSlot } from "./logic/playbackQueue";
import {
  moveSlotUp, moveSlotDown, reorderPlaylistSlot,
  removeSlotCompact, removeSlotLeaveGap, replaceSlot,
  insertTrackAfterSlot, appendTrackToPlaylist, reindexPlaylistSlots,
} from "./logic/manualPlaylistOrder";
import { validatePlaylistForExport, type ExportHealthReport, formatExportReport } from "./logic/exportHealth";
import { fillMissingTime } from "./logic/fillMissingTime";
import { appendTracksToPlaylist, type TrackDragPayload } from "./logic/playlistMembership";
import { exportM3u, downloadFile } from "./data/exportPlaylist";
import { AddMusicPanel } from "./ui/AddMusicPanel";
import { FlowCurveCanvas } from "./ui/FlowCurveCanvas";
import { TopBar } from "./ui/TopBar";
import { SamplerPlayer } from "./ui/SamplerPlayer";
import { SamplerBankView } from "./ui/SamplerBankView";
import { PlaylistsGrid } from "./ui/PlaylistsGrid";
import { SamplerBanksGrid } from "./ui/SamplerBanksGrid";
import { FileManager, type ViewMode } from "./ui/FileManager";
import { PlaylistHeader } from "./ui/PlaylistHeader";
import { MainTrackWindow } from "./ui/MainTrackWindow";
import { PlaybackTransport } from "./ui/PlaybackTransport";
import { BroadcastHudShell } from "./ui/BroadcastHudShell";
import { HudOperatorControls } from "./ui/HudOperatorControls";
import {
  DEFAULT_SECONDARY_TIMING_MS,
  SECONDARY_CYCLE,
  type BroadcastSecondaryMode,
} from "./ui/BroadcastSecondaryLayer";
import { buildNowNextQueueState } from "./logic/nowNextQueue";
import { getSourceComposition, SourceCompositionBadges } from "./ui/SourceBadge";
import { filterTracksForPlaylist, isTrackEligibleForPlaylist, sourceGroupIdFor } from "./logic/sourceEligibility";
import { SchedulerGuideView } from "./ui/SchedulerGuideView";
import type { ScheduleState, ScheduleBlock, ScheduleBlockRole, ScheduleDisplayMode } from "./data/scheduleTypes";
import type { BroadcastEvent } from "./data/eventTypes";
import type { MusicSourcePool } from "./data/sourcePoolTypes";
import { resolveSchedule, createScheduleBlockFromPlaylist } from "./logic/scheduleResolver";
import { resolveSmartGridComposition } from "./logic/smartGridResolver";
import type { WorkspaceMode, ImportDestination, PageMenuItem } from "./ui/TopBar";
import "./styles.css";

// ── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PRESET: CurvePresetType = "elegant_nested_arc";
const DEFAULT_DENSITY: "low" | "medium" | "high" = "medium";
const DEFAULT_TARGET_MINUTES = 120;
// Live schedule clock (0621I): 30s is responsive to block boundaries without
// noisy render churn.
const SCHEDULE_CLOCK_TICK_MS = 30_000;

function nowIso(): string { return new Date().toISOString(); }
function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function makeDefaultSchedule(): ScheduleState {
  const ts = nowIso();
  return { scheduleId: genId("sched"), title: "PLAY Schedule", blocks: [], createdAt: ts, updatedAt: ts };
}

function makeDefaultPlaylist(overrides?: Partial<PlaylistRecord>): PlaylistRecord {
  const ts = nowIso();
  const playlistId = genId("pl");
  return {
    playlistId,
    title: "Untitled Playlist",
    sourceGroupId: `source-${playlistId}`,
    allowCrossGroupAutofill: false,
    slots: [],
    curve: generateFlowCurve({ presetType: DEFAULT_PRESET, targetDurationSeconds: DEFAULT_TARGET_MINUTES * 60, curveDensity: DEFAULT_DENSITY }),
    locks: [],
    orphans: [],
    targetDurationMinutes: DEFAULT_TARGET_MINUTES,
    manualOrderDirty: false,
    allowedSourceOwners: ["studiorich"],
    createdAt: ts,
    updatedAt: ts,
    ...overrides,
  };
}

function getAudioUrl(filePath: string): string {
  return `/media?path=${encodeURIComponent(filePath)}`;
}

/**
 * Deduplication for audio-folder imports (External and Reference).
 * Identity key: sourceOwner + filePath (or fileName as fallback).
 * Re-importing the same folder updates the objectUrl/audioLinked fields on
 * existing rows instead of appending a duplicate.
 */
function upsertFolderTracks(
  existing: Track[],
  incoming: Track[],
): { tracks: Track[]; added: number; updated: number } {
  function folderKey(t: Track): string {
    const owner = t.sourceOwner ?? "unknown";
    const path = (t.filePath || t.fileName || "").toLowerCase();
    return `${owner}:${path}`;
  }

  const keyToIdx = new Map<string, number>();
  const working = [...existing];
  for (let i = 0; i < working.length; i++) {
    const k = folderKey(working[i]);
    if (!keyToIdx.has(k)) keyToIdx.set(k, i);
  }

  let added = 0;
  let updated = 0;
  for (const track of incoming) {
    const k = folderKey(track);
    const idx = keyToIdx.get(k);
    if (idx === undefined) {
      keyToIdx.set(k, working.length);
      working.push(track);
      added++;
    } else {
      // Re-link audio: update objectUrl and link status, preserve all other user data
      working[idx] = {
        ...working[idx],
        objectUrl: track.objectUrl,
        audioLinked: track.audioLinked,
        audioMissing: track.audioMissing,
        audioLastScannedAt: track.audioLastScannedAt,
      };
      updated++;
    }
  }

  return { tracks: working, added, updated };
}

function getTrackPlayUrl(track: { objectUrl?: string; filePath?: string }): string | null {
  if (track.objectUrl) return track.objectUrl;
  if (track.filePath) return getAudioUrl(track.filePath);
  return null;
}


// ── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  // ── Multi-playlist state ─────────────────────────────────────────────────
  const [playlists, setPlaylists] = useState<PlaylistRecord[]>(() => [makeDefaultPlaylist({ title: "My Mix" })]);
  const [activePlaylistId, setActivePlaylistId] = useState<string>(() => playlists[0]?.playlistId ?? "");
  const [libraryTracks, setLibraryTracks] = useState<Track[]>([]);
  const [excludedTrackIds, setExcludedTrackIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("playlist");
  const [sourceOwnerFilter, setSourceOwnerFilter] = useState<import("./data/trackTypes").TrackSourceOwner | null>(null);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("flow_curve");
  // ── Broadcast HUD operator state (lifted so controls live in the top row) ──
  const [hudSecondaryMode, setHudSecondaryMode] = useState<BroadcastSecondaryMode>("none");
  const [hudPinned, setHudPinned] = useState(false);
  const [hudGridVisible, setHudGridVisible] = useState(false);
  const [hudModeKey, setHudModeKey] = useState("0");
  const hudModeKeyRef = useRef(0);
  // ── Scheduler state (0621G) ───────────────────────────────────────────────
  const [schedule, setSchedule] = useState<ScheduleState>(() => loadPlayProject()?.schedule ?? makeDefaultSchedule());
  // ── Event-first foundations (0623C) ──────────────────────────────────────
  const [broadcastEvents, setBroadcastEvents] = useState<BroadcastEvent[]>(() => loadPlayProject()?.broadcastEvents ?? []);
  const [sourcePools, setSourcePools] = useState<MusicSourcePool[]>(() => loadPlayProject()?.sourcePools ?? []);
  const broadcastEventsRef = useRef<BroadcastEvent[]>([]);
  const sourcePoolsRef = useRef<MusicSourcePool[]>([]);
  const librarySourcesRef = useRef<import("./data/librarySourceTypes").LibrarySourceDefinition[]>([]);
  // Shared live clock (0621I) — single source of "now" for all schedule-aware surfaces.
  const [scheduleNow, setScheduleNow] = useState<Date>(() => new Date());
  const [density] = useState<"low" | "medium" | "high">(DEFAULT_DENSITY);
  const [projectCreatedAt] = useState(nowIso);
  // Hydration guard: autosave must not run until the saved project has been
  // loaded, or the default boot state overwrites valid saved data on mount.
  const [hasHydratedProject, setHasHydratedProject] = useState(false);

  // ── Playback state ───────────────────────────────────────────────────────
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("idle");
  const [currentSlotIdx, setCurrentSlotIdx] = useState<number | null>(null);
  // Playback context (0622A): the playlist actually loaded in the player, kept
  // separate from the editor selection (activePlaylistId). currentSlotIdx is an
  // index into the PLAYING playlist's slots. Runtime-only (not persisted).
  const [playingPlaylistId, setPlayingPlaylistId] = useState<string | null>(null);
  const autoplayNext = true;
  const [playbackError, setPlaybackError] = useState<string | undefined>();
  const [audioTime, setAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [playbackErrors, setPlaybackErrors] = useState<Map<string, string>>(() => {
    const saved = loadPlayProject()?.trackPlaybackIssues ?? {};
    return new Map(Object.entries(saved).map(([id, issue]) => [id, issue.code ?? "ERR"]));
  });
  const [trackPlaybackIssues, setTrackPlaybackIssues] = useState<Record<string, TrackPlaybackIssue>>(() =>
    loadPlayProject()?.trackPlaybackIssues ?? {}
  );

  // ── Sampler state (0702B) — independent sampler bank ────────────────────
  const [samplerBank, setSamplerBank] = useState<PlaylistRecord | null>(null);
  const [samplerVisible, setSamplerVisible] = useState(false);
  const [musicVolume, setMusicVolume] = useState(1.0);

  // ── Export / dirty tracking state (0623B) ───────────────────────────────
  const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);
  const [exportedProjectHash, setExportedProjectHash] = useState<string | null>(null);

  // ── UI state ─────────────────────────────────────────────────────────────
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<number | null>(null);
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(null);
  const [exportReport, setExportReport] = useState<ExportHealthReport | null>(null);
  const [exportReportText, setExportReportText] = useState("");
  const [notify, setNotify] = useState<string | null>(null);
  const [flash, setFlash] = useState("");
  const [_fillReport, setFillReport] = useState<PlaylistFillReport | null>(null);

  // ── Refs (stale-closure-safe reads in event handlers) ────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoplayRef = useRef(true);
  const currentSlotIdxRef = useRef<number | null>(null);
  const slotsRef = useRef<TrackSlot[]>([]);
  const libraryTracksRef = useRef<Track[]>([]);
  const playCountedRef = useRef(false);
  const playbackStatusRef = useRef<PlaybackStatus>("idle");
  const selectedSlotIdxRef = useRef<number | null>(null);
  const activePlaylistIdRef = useRef<string>("");
  const playlistsRef = useRef<PlaylistRecord[]>([]);
  const excludedTrackIdsRef = useRef<Set<string>>(new Set());
  const projectCreatedAtRef = useRef(projectCreatedAt);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackPlaybackIssuesRef = useRef<Record<string, TrackPlaybackIssue>>({});
  const scheduleRef = useRef<ScheduleState>(schedule);
  // Playback context refs (0622A) — stable across editor selection changes.
  const playingPlaylistIdRef = useRef<string | null>(null);
  const playingSlotsRef = useRef<TrackSlot[]>([]);

  // Action refs for keyboard shortcuts (avoid stale closures)
  const playActionRef = useRef<() => void>(() => {});
  const pauseActionRef = useRef<() => void>(() => {});
  const stopActionRef = useRef<() => void>(() => {});
  const nextActionRef = useRef<() => void>(() => {});
  const prevActionRef = useRef<() => void>(() => {});
  const removeSelectedRef = useRef<() => void>(() => {});

  // ── Derived active playlist ──────────────────────────────────────────────
  const activePlaylist =
    playlists.find((p) => p.playlistId === activePlaylistId) ?? playlists[0];
  const slots = activePlaylist?.slots ?? [];
  const locks = activePlaylist?.locks ?? [];
  const orphans = activePlaylist?.orphans ?? [];

  // ── Sync refs ────────────────────────────────────────────────────────────
  useEffect(() => { autoplayRef.current = autoplayNext; }, [autoplayNext]);
  useEffect(() => { currentSlotIdxRef.current = currentSlotIdx; }, [currentSlotIdx]);
  useEffect(() => { playbackStatusRef.current = playbackStatus; }, [playbackStatus]);
  useEffect(() => { selectedSlotIdxRef.current = selectedSlotIdx; }, [selectedSlotIdx]);
  useEffect(() => { libraryTracksRef.current = libraryTracks; }, [libraryTracks]);
  useEffect(() => { excludedTrackIdsRef.current = excludedTrackIds; }, [excludedTrackIds]);
  useEffect(() => { playlistsRef.current = playlists; }, [playlists]);
  useEffect(() => {
    trackPlaybackIssuesRef.current = trackPlaybackIssues;
    // Do not autosave before hydration — otherwise the default boot state
    // overwrites the user's saved project in localStorage on first mount.
    if (!hasHydratedProject) return;
    savePlayProject(makeProj(playlistsRef.current, libraryTracksRef.current, excludedTrackIdsRef.current));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackPlaybackIssues, hasHydratedProject]);
  useEffect(() => { activePlaylistIdRef.current = activePlaylistId; }, [activePlaylistId]);
  useEffect(() => { scheduleRef.current = schedule; }, [schedule]);
  useEffect(() => { broadcastEventsRef.current = broadcastEvents; }, [broadcastEvents]);
  useEffect(() => { sourcePoolsRef.current = sourcePools; }, [sourcePools]);

  // Sampler bank filesystem sync — write banks.json whenever playlists change (post-hydration).
  useEffect(() => {
    if (!hasHydratedProject) return;
    const banks = playlists.filter((p) => p.playlistKind === "reference_overlay");
    const banksPath = `${__LIBRARY_ROOT__}/sampler-banks/banks.json`;
    fetch(`/library-write?path=${encodeURIComponent(banksPath)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(banks),
    }).catch(() => {});
  }, [playlists, hasHydratedProject]);
  // Keep playback refs in sync (0622A): playingSlotsRef tracks the PLAYING
  // playlist's current slots regardless of which playlist is being edited.
  useEffect(() => { playingPlaylistIdRef.current = playingPlaylistId; }, [playingPlaylistId]);
  useEffect(() => {
    if (!playingPlaylistId) { playingSlotsRef.current = []; return; }
    const pp = playlists.find((p) => p.playlistId === playingPlaylistId);
    playingSlotsRef.current = pp?.slots ?? [];
  }, [playlists, playingPlaylistId]);
  useEffect(() => {
    slotsRef.current = activePlaylist?.slots ?? [];
  }, [playlists, activePlaylistId]);

  // Live schedule clock (0621I): tick the shared `now` so Scheduler, HUD buffet,
  // and Smart Grid composition re-resolve as time passes, without operator input.
  useEffect(() => {
    const id = window.setInterval(() => setScheduleNow(new Date()), SCHEDULE_CLOCK_TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  // HUD secondary-layer auto-dismiss (0621B): timed modes return to "none" unless pinned.
  useEffect(() => {
    if (hudSecondaryMode === "none" || hudPinned) return;
    const ms = DEFAULT_SECONDARY_TIMING_MS[hudSecondaryMode];
    const id = window.setTimeout(() => setHudSecondaryMode("none"), ms);
    return () => window.clearTimeout(id);
  }, [hudSecondaryMode, hudPinned]);

  // ── Project helpers ──────────────────────────────────────────────────────
  function makeProj(pls: PlaylistRecord[], lib?: Track[], excl?: Set<string>, activePLId?: string): PlayProject {
    return {
      schemaVersion: "play-project-v2",
      libraryTracks: lib ?? libraryTracksRef.current,
      activePlaylistId: activePLId ?? activePlaylistIdRef.current,
      playlists: pls,
      excludedTrackIds: [...(excl ?? excludedTrackIdsRef.current)],
      trackPlaybackIssues: trackPlaybackIssuesRef.current,
      schedule: scheduleRef.current,
      sourcePools: sourcePoolsRef.current,
      broadcastEvents: broadcastEventsRef.current,
      librarySources: librarySourcesRef.current.length ? librarySourcesRef.current : undefined,
      createdAt: projectCreatedAtRef.current,
      updatedAt: nowIso(),
    };
  }

  function mutatePLAndSave(
    plId: string,
    fn: (pl: PlaylistRecord) => PlaylistRecord,
    lib?: Track[],
    excl?: Set<string>,
  ) {
    setPlaylists((prev) => {
      const next = prev.map((p) => (p.playlistId === plId ? fn(p) : p));
      savePlayProject(makeProj(next, lib, excl));
      return next;
    });
  }

  // ── Slot helpers ─────────────────────────────────────────────────────────
  function applyManualSlots(newSlots: TrackSlot[], plId?: string) {
    const id = plId ?? activePlaylistIdRef.current;
    const now = nowIso();
    setExportReport(null);
    mutatePLAndSave(id, (pl) => ({
      ...pl, slots: newSlots, manualOrderDirty: true, updatedAt: now,
    }));
  }

  function showNotify(msg: string) {
    setNotify(msg);
    if (notifyTimerRef.current) clearTimeout(notifyTimerRef.current);
    notifyTimerRef.current = setTimeout(() => setNotify(null), 3000);
  }

  function showFlashMsg(msg: string) {
    setFlash(msg);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(""), 2500);
  }

  // ── regenerate ───────────────────────────────────────────────────────────
  function regenerateForPL(lib: Track[], excl: Set<string>, plId: string) {
    const now = nowIso();
    setPlaylists((prev) => {
      const pl = prev.find((p) => p.playlistId === plId);
      if (!pl) return prev;

      let newPL: PlaylistRecord;
      if (pl.manualOrderDirty) {
        const tbm = new Map(lib.map((t) => [t.trackId, t]));
        const refreshed = evaluateSlotWarnings({ slots: pl.slots, tracksById: tbm });
        newPL = { ...pl, slots: refreshed, updatedAt: now };
      } else if (lib.length === 0) {
        newPL = { ...pl, slots: [], orphans: [], updatedAt: now };
      } else {
        const { slots: s, orphans: o } = assignPlaylistToCurve({
          tracks: filterTracksForPlaylist({ tracks: lib, playlist: pl }),
          curve: pl.curve, locks: pl.locks,
          excludedTrackIds: [...excl],
          targetDurationSeconds: pl.targetDurationMinutes * 60,
        });
        newPL = { ...pl, slots: s, orphans: o, updatedAt: now };
      }

      const next = prev.map((p) => (p.playlistId === plId ? newPL : p));
      savePlayProject(makeProj(next, lib, excl));
      return next;
    });
  }

  function regenerate(lib: Track[], excl: Set<string>) {
    regenerateForPL(lib, excl, activePlaylistIdRef.current);
  }

  // ── Curve change (user drags curve canvas) ────────────────────────────────
  const handleCurveChange = useCallback((c: FlowCurve) => {
    const now = nowIso();
    setPlaylists((prev) => {
      const plId = activePlaylistIdRef.current;
      const pl = prev.find((p) => p.playlistId === plId);
      if (!pl) return prev;

      let newPL: PlaylistRecord;
      if (libraryTracksRef.current.length > 0) {
        // Always reassign from curve — dragging a node is an intentional regeneration.
        // Clears manualOrderDirty so the playlist stays curve-reactive.
        const { slots: s, orphans: o } = assignPlaylistToCurve({
          tracks: filterTracksForPlaylist({ tracks: libraryTracksRef.current, playlist: pl }),
          curve: c, locks: pl.locks,
          excludedTrackIds: [...excludedTrackIdsRef.current],
          targetDurationSeconds: pl.targetDurationMinutes * 60,
        });
        console.debug("[handleCurveChange] reassigned", s.filter(sl => sl.assignedTrackId).length, "slots; orphans:", o.length, "manualOrderDirty was:", pl.manualOrderDirty);
        // Re-apply preserved gaps: blank out any slot whose slotId was intentionally emptied (0622C).
        const gapIds = new Set(pl.preservedGapSlotIds ?? []);
        const sWithGaps = gapIds.size > 0
          ? s.map((slot) => gapIds.has(slot.slotId) ? { ...slot, assignedTrackId: undefined } : slot)
          : s;
        newPL = { ...pl, curve: c, slots: sWithGaps, orphans: o, manualOrderDirty: false, updatedAt: now };
      } else {
        newPL = { ...pl, curve: c, updatedAt: now };
      }

      const next = prev.map((p) => (p.playlistId === plId ? newPL : p));
      savePlayProject(makeProj(next));
      return next;
    });
  }, []);

  // ── Preset / duration change ──────────────────────────────────────────────
  function handlePresetChange(p: CurvePresetType) {
    const plId = activePlaylistIdRef.current;
    const now = nowIso();
    setPlaylists((prev) => {
      const pl = prev.find((pl2) => pl2.playlistId === plId);
      if (!pl) return prev;
      const newCurve = generateFlowCurve({
        presetType: p, targetDurationSeconds: pl.targetDurationMinutes * 60, curveDensity: density,
      });
      const newPL: PlaylistRecord = { ...pl, curve: newCurve, updatedAt: now };
      const next = prev.map((p2) => (p2.playlistId === plId ? newPL : p2));
      savePlayProject(makeProj(next));
      return next;
    });
    showFlashMsg("Curve updated — click Regenerate From Curve or Fill Missing Time to update playlist.");
  }

  function handleTargetDurationChange(minutes: number) {
    const plId = activePlaylistIdRef.current;
    const now = nowIso();
    setPlaylists((prev) => {
      const pl = prev.find((p) => p.playlistId === plId);
      if (!pl) return prev;
      const newCurve = generateFlowCurve({
        presetType: pl.curve.presetType, targetDurationSeconds: minutes * 60, curveDensity: density,
      });
      const newPL: PlaylistRecord = { ...pl, targetDurationMinutes: minutes, curve: newCurve, updatedAt: now };
      const next = prev.map((p) => (p.playlistId === plId ? newPL : p));
      savePlayProject(makeProj(next));
      return next;
    });
  }

  function handleRegenerateFromCurve() {
    const plId = activePlaylistIdRef.current;
    const lib = libraryTracksRef.current;
    const excl = excludedTrackIdsRef.current;
    const now = nowIso();
    setPlaylists((prev) => {
      const pl = prev.find((p) => p.playlistId === plId);
      if (!pl) return prev;
      if (pl.locked) {
        showNotify("Playlist is locked. Duplicate or unlock to edit.");
        return prev;
      }
      const issues = trackPlaybackIssuesRef.current;
      const unplayableIds = Object.entries(issues)
        .filter(([, i]) => i.status === "unplayable")
        .map(([id]) => id);
      const effectiveExcl = [...excl, ...unplayableIds];
      const { slots: s, orphans: o } = assignPlaylistToCurve({
        tracks: filterTracksForPlaylist({ tracks: lib, playlist: pl }),
        curve: pl.curve,
        locks: pl.locks,
        excludedTrackIds: effectiveExcl,
        targetDurationSeconds: pl.targetDurationMinutes * 60,
      });
      const updated: PlaylistRecord = {
        ...pl, slots: s, orphans: o, manualOrderDirty: false, updatedAt: now,
      };
      const next = prev.map((p) => (p.playlistId === plId ? updated : p));
      savePlayProject(makeProj(next, lib, excl));
      return next;
    });
    const count = playlistsRef.current.find((p) => p.playlistId === plId)?.slots.filter((s) => s.assignedTrackId).length ?? 0;
    showNotify(`Regenerated from curve — ${count} tracks assigned.`);
  }

  // ── Playlist CRUD ─────────────────────────────────────────────────────────

  function handleSelectPlaylist(id: string) {
    // Editor selection only (0622A) — must NOT touch live playback. The player
    // keeps running on playingPlaylistId; we only move the editor's view here.
    setActivePlaylistId(id);
    activePlaylistIdRef.current = id;
    const pl = playlists.find((p) => p.playlistId === id);
    slotsRef.current = pl?.slots ?? [];
    setSelectedSlotIdx(null);
    setExportReport(null);
    // Save activePlaylistId
    savePlayProject(makeProj(playlistsRef.current, undefined, undefined, id));
  }

  function handleDuplicatePlaylist(id: string) {
    const pl = playlists.find((p) => p.playlistId === id);
    if (!pl) return;
    const now = nowIso();
    const copy: PlaylistRecord = {
      ...pl,
      playlistId: genId("pl"),
      title: `${pl.title} Copy`,
      createdAt: now,
      updatedAt: now,
      lastFillReport: undefined,
    };
    const next = [...playlists, copy];
    setPlaylists(next);
    setActivePlaylistId(copy.playlistId);
    activePlaylistIdRef.current = copy.playlistId;
    slotsRef.current = copy.slots;
    savePlayProject(makeProj(next, undefined, undefined, copy.playlistId));
    setViewMode("playlist");
    setCurrentSlotIdx(null);
    setSelectedSlotIdx(null);
  }

  function handleDeletePlaylist(id: string) {
    if (playlists.length <= 1) return;
    const next = playlists.filter((p) => p.playlistId !== id);
    // Case 3 (0622A): deleting the PLAYING playlist stops + clears playback,
    // regardless of which playlist is selected in the editor.
    if (playingPlaylistIdRef.current === id) {
      handleStop();
      setCurrentSlotIdx(null);
      setPlayingPlaylistId(null);
      playingPlaylistIdRef.current = null;
      playingSlotsRef.current = [];
    }
    let newActiveId = activePlaylistId;
    if (activePlaylistId === id) {
      // Editor moves to another playlist; playback is untouched here (handled
      // above only when the PLAYING playlist itself was deleted).
      newActiveId = next[0]?.playlistId ?? "";
      setActivePlaylistId(newActiveId);
      activePlaylistIdRef.current = newActiveId;
      slotsRef.current = next[0]?.slots ?? [];
      setSelectedSlotIdx(null);
    }
    setPlaylists(next);
    savePlayProject(makeProj(next, undefined, undefined, newActiveId));
  }

  // ── Scheduler (0621G) ─────────────────────────────────────────────────────
  function commitSchedule(next: ScheduleState) {
    next = { ...next, updatedAt: nowIso() };
    scheduleRef.current = next;       // keep ref current so makeProj persists it now
    setSchedule(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  function handleAddScheduleBlock(params: {
    playlistId: string; startTimeIso: string;
    role: ScheduleBlockRole; displayMode: ScheduleDisplayMode;
  }) {
    const pl = playlistsRef.current.find((p) => p.playlistId === params.playlistId);
    if (!pl) return;
    const secsByTrackId = new Map(libraryTracksRef.current.map((t) => [t.trackId, t.durationSeconds ?? 0]));
    const block = createScheduleBlockFromPlaylist({
      playlist: pl,
      startTimeIso: params.startTimeIso,
      role: params.role,
      displayMode: params.displayMode,
      nowIso: nowIso(),
      blockId: genId("blk"),
      secsByTrackId,
    });
    commitSchedule({ ...scheduleRef.current, blocks: [...scheduleRef.current.blocks, block] });
  }

  function handleRemoveScheduleBlock(blockId: string) {
    commitSchedule({
      ...scheduleRef.current,
      blocks: scheduleRef.current.blocks.filter((b) => b.blockId !== blockId),
    });
  }

  function handleAddBroadcastEvent(event: BroadcastEvent) {
    const next = [...broadcastEventsRef.current, event];
    broadcastEventsRef.current = next;
    setBroadcastEvents(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  // ── Source pool handlers (0624A) ─────────────────────────────────────────

  function commitSourcePools(next: MusicSourcePool[]) {
    sourcePoolsRef.current = next;
    setSourcePools(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  function handleCreateSourcePoolFromPlaylist(playlistId: string) {
    const pl = playlistsRef.current.find((p) => p.playlistId === playlistId);
    if (!pl) return;
    const trackIds = pl.slots
      .filter((s) => s.assignedTrackId)
      .map((s) => s.assignedTrackId!);
    const now = nowIso();
    const poolId = genId("pool");
    const pool: MusicSourcePool = {
      id: poolId,
      title: `${pl.title} Pool`,
      trackIds,
      defaultDurationMinutes: pl.targetDurationMinutes,
      defaultPresentationMode: pl.broadcastIdentity?.presentationMode,
      createdAt: now,
      updatedAt: now,
    };
    commitSourcePools([...sourcePoolsRef.current, pool]);
    // Stamp sourcePoolIds on each included track (library membership)
    const trackIdSet = new Set(trackIds);
    const nextTracks = libraryTracksRef.current.map((t) =>
      trackIdSet.has(t.trackId)
        ? { ...t, sourcePoolIds: [...new Set([...(t.sourcePoolIds ?? []), poolId])] }
        : t,
    );
    libraryTracksRef.current = nextTracks;
    setLibraryTracks(nextTracks);
    savePlayProject(makeProj(playlistsRef.current, nextTracks));
  }

  function handleRenameSourcePool(poolId: string, name: string) {
    if (!name.trim()) return;
    commitSourcePools(
      sourcePoolsRef.current.map((p) =>
        p.id === poolId ? { ...p, title: name.trim(), updatedAt: nowIso() } : p,
      ),
    );
  }

  function handleRemoveSourcePool(poolId: string) {
    // Remove pool record only — do not delete tracks or clear their grouping
    commitSourcePools(sourcePoolsRef.current.filter((p) => p.id !== poolId));
    // Remove pool membership from track sourcePoolIds
    const next = libraryTracksRef.current.map((t) =>
      (t.sourcePoolIds ?? []).includes(poolId)
        ? { ...t, sourcePoolIds: (t.sourcePoolIds ?? []).filter((id) => id !== poolId) }
        : t,
    );
    libraryTracksRef.current = next;
    setLibraryTracks(next);
    savePlayProject(makeProj(playlistsRef.current, next));
  }

  function handleCleanEmptyGroups() {
    const trackCounts = new Map<string, number>();
    for (const t of libraryTracksRef.current) {
      for (const pid of (t.sourcePoolIds ?? [])) {
        trackCounts.set(pid, (trackCounts.get(pid) ?? 0) + 1);
      }
    }
    commitSourcePools(sourcePoolsRef.current.filter((p) => (trackCounts.get(p.id) ?? 0) > 0));
  }

  function handleSetPlaylistRole(
    playlistId: string,
    role: "static" | "template" | "event_generated",
  ) {
    mutatePLAndSave(playlistId, (pl) => ({ ...pl, playlistRole: role }));
  }

  function handleSetPlaylistSourcePool(playlistId: string, sourcePoolId: string | undefined) {
    mutatePLAndSave(playlistId, (pl) => ({ ...pl, sourcePoolId }));
  }

  function handleSetPlaylistTargetTrackCount(playlistId: string, count: number | undefined) {
    mutatePLAndSave(playlistId, (pl) => ({ ...pl, targetTrackCount: count }));
  }

  function handleSetPlaylistRegenerationMode(
    playlistId: string,
    mode: PlaylistRecord["regenerationMode"],
  ) {
    mutatePLAndSave(playlistId, (pl) => ({ ...pl, regenerationMode: mode }));
  }

  function handleSetTemplateSourceFilters(
    playlistId: string,
    filters: import("./logic/libraryFilters").LibraryTrackFilters,
  ) {
    mutatePLAndSave(playlistId, (pl) => ({ ...pl, templateSourceFilters: filters }));
  }

  function handleSetSourcePolicy(
    playlistId: string,
    policy: import("./data/playProjectTypes").PlaylistSourcePolicy | undefined,
  ) {
    mutatePLAndSave(playlistId, (pl) => ({ ...pl, sourcePolicy: policy }));
  }

  function handleSetAllowedSourceOwners(
    playlistId: string,
    owners: import("./data/trackTypes").TrackSourceOwner[] | undefined,
  ) {
    mutatePLAndSave(playlistId, (pl) => ({ ...pl, allowedSourceOwners: owners }));
  }

  function handleCreateLibraryGroupFromSelection(trackIds: string[], groupName: string) {
    if (!groupName.trim() || !trackIds.length) return;
    const name = groupName.trim();
    const idSet = new Set(trackIds);
    const poolId = genId("pool");
    const now = nowIso();
    // Stamp grouping + sourcePoolIds on each selected track
    const next = libraryTracksRef.current.map((t) => {
      if (!idSet.has(t.trackId)) return t;
      return {
        ...t,
        grouping: name,
        sourcePoolIds: [...new Set([...(t.sourcePoolIds ?? []), poolId])],
      };
    });
    libraryTracksRef.current = next;
    setLibraryTracks(next);
    // Create/update MusicSourcePool for template dropdown compatibility
    const pool: import("./data/sourcePoolTypes").MusicSourcePool = {
      id: poolId,
      title: name,
      trackIds,
      createdAt: now,
      updatedAt: now,
    };
    commitSourcePools([...sourcePoolsRef.current, pool]);
    savePlayProject(makeProj(playlistsRef.current, next));
  }

  function handleCreatePlaylistFromTemplate(templatePlaylistId: string) {
    const template = playlistsRef.current.find((p) => p.playlistId === templatePlaylistId);
    if (!template) return;
    const now = nowIso();
    const newId = genId("pl");
    const dateStr = now.slice(0, 10);

    let newSlots = template.slots;
    const pool = template.sourcePoolId
      ? sourcePoolsRef.current.find((p) => p.id === template.sourcePoolId)
      : undefined;
    if (pool) {
      const filled = buildPlaylistSlotsFromSourcePool({
        sourcePool: pool,
        tracks: libraryTracksRef.current,
        targetDurationMinutes: template.targetDurationMinutes,
        targetTrackCount: template.targetTrackCount,
        templateSourceFilters: template.templateSourceFilters,
      });
      if (filled.length > 0) newSlots = filled;
    } else if (template.templateSourceFilters) {
      // No explicit pool — fill directly from library filters
      const emptyPool = { id: "", title: "", createdAt: "", updatedAt: "" };
      const filled = buildPlaylistSlotsFromSourcePool({
        sourcePool: emptyPool,
        tracks: libraryTracksRef.current,
        targetDurationMinutes: template.targetDurationMinutes,
        targetTrackCount: template.targetTrackCount,
        templateSourceFilters: template.templateSourceFilters,
      });
      if (filled.length > 0) newSlots = filled;
    }

    const generated: PlaylistRecord = {
      ...template,
      playlistId: newId,
      title: `${template.title} · ${dateStr}`,
      sourceGroupId: sourceGroupIdFor(newId),
      playlistRole: "event_generated",
      slots: newSlots,
      manualOrderDirty: newSlots.length > 0,
      preservedGapSlotIds: [],
      createdAt: now,
      updatedAt: now,
    };

    const next = [...playlistsRef.current, generated];
    playlistsRef.current = next;
    setPlaylists(next);
    setActivePlaylistId(newId);
    activePlaylistIdRef.current = newId;
    slotsRef.current = generated.slots;
    savePlayProject(makeProj(next));
  }

  function handleMoveScheduleBlock(blockId: string, deltaMinutes: number) {
    const blocks = scheduleRef.current.blocks.map((b): ScheduleBlock => {
      if (b.blockId !== blockId) return b;
      const startMs = Date.parse(b.startTimeIso) + deltaMinutes * 60_000;
      const endMs = Date.parse(b.endTimeIso) + deltaMinutes * 60_000;
      return {
        ...b,
        startTimeIso: new Date(startMs).toISOString(),
        endTimeIso: new Date(endMs).toISOString(),
        updatedAt: nowIso(),
      };
    });
    commitSchedule({ ...scheduleRef.current, blocks });
  }

  // ── Playlist metadata ─────────────────────────────────────────────────────
  function handlePlaylistTitleChange(title: string) {
    mutatePLAndSave(activePlaylistId, (pl) => ({ ...pl, title, updatedAt: nowIso() }));
  }

  function handlePlaylistDescriptionChange(description: string) {
    mutatePLAndSave(activePlaylistId, (pl) => ({ ...pl, description, updatedAt: nowIso() }));
  }

  function handlePlaylistCoverImageChange(img: PlaylistImage | undefined) {
    mutatePLAndSave(activePlaylistId, (pl) => ({ ...pl, coverImage: img, updatedAt: nowIso() }));
  }

  function handlePlaylistBackgroundImageChange(img: PlaylistImage | undefined) {
    mutatePLAndSave(activePlaylistId, (pl) => ({ ...pl, backgroundImage: img, updatedAt: nowIso() }));
  }

  function handlePlaylistAccentColorChange(color: string | undefined) {
    mutatePLAndSave(activePlaylistId, (pl) => ({ ...pl, accentColor: color, updatedAt: nowIso() }));
  }

  function handlePlaylistMoodTagsChange(tags: string[]) {
    mutatePLAndSave(activePlaylistId, (pl) => ({
      ...pl, mood: { ...pl.mood, tags }, updatedAt: nowIso(),
    }));
  }

  function handlePlaylistBroadcastIdentityChange(bi: PlaylistBroadcastIdentity) {
    mutatePLAndSave(activePlaylistId, (pl) => ({ ...pl, broadcastIdentity: bi, updatedAt: nowIso() }));
  }

  function handlePlaylistColorThemesChange(themes: import("./logic/colorLab").PlayColorTheme[], activeColorThemeId: string) {
    const active = themes.find((t) => t.id === activeColorThemeId) ?? themes[0];
    mutatePLAndSave(activePlaylistId, (pl) => ({
      ...pl,
      colorThemes: themes,
      activeColorThemeId,
      colorTheme: active,
      updatedAt: nowIso(),
    }));
  }

  // ── Lock management ──────────────────────────────────────────────────────
  function handleLockChange(l: TrackLock[]) {
    mutatePLAndSave(activePlaylistId, (pl) => ({ ...pl, locks: l, updatedAt: nowIso() }));
    regenerate(libraryTracks, excludedTrackIds);
  }

  function handleToggleLock(trackId: string, slotIndex: number) {
    const existing = locks.find((l) => l.trackId === trackId);
    const next = existing
      ? locks.filter((l) => l.trackId !== trackId)
      : [...locks, { trackId, lockType: "position" as const, slotIndex }];
    mutatePLAndSave(activePlaylistId, (pl) => ({ ...pl, locks: next, updatedAt: nowIso() }));
    regenerate(libraryTracks, excludedTrackIds);
  }

  // ── Exclude / restore / remove ────────────────────────────────────────────
  function handleExclude(id: string) {
    const e = new Set(excludedTrackIds);
    e.add(id);
    setExcludedTrackIds(e);
    const pl = activePlaylist;
    if (!pl) return;
    if (pl.manualOrderDirty) {
      const slotIdx = pl.slots.findIndex((s) => s.assignedTrackId === id);
      if (slotIdx >= 0) {
        const compact = removeSlotCompact(pl.slots, slotIdx);
        const tbm = new Map(libraryTracks.map((t) => [t.trackId, t]));
        const reindexed = reindexPlaylistSlots(compact, tbm);
        const evaluated = evaluateSlotWarnings({ slots: reindexed, tracksById: tbm });
        mutatePLAndSave(activePlaylistId, (p) => ({ ...p, slots: evaluated, manualOrderDirty: true, updatedAt: nowIso() }), libraryTracks, e);
      } else {
        savePlayProject(makeProj(playlists, libraryTracks, e));
      }
    } else {
      regenerateForPL(libraryTracks, e, activePlaylistId);
    }
  }

  function handleRestore(id: string) {
    const e = new Set(excludedTrackIds);
    e.delete(id);
    setExcludedTrackIds(e);
    if (activePlaylist?.manualOrderDirty) {
      savePlayProject(makeProj(playlists, libraryTracks, e));
    } else {
      regenerateForPL(libraryTracks, e, activePlaylistId);
    }
  }

  function handleRemove(id: string) {
    const newTracks = libraryTracks.filter((x) => x.trackId !== id);
    const e = new Set(excludedTrackIds);
    e.delete(id);
    setLibraryTracks(newTracks);
    setExcludedTrackIds(e);
    const pl = activePlaylist;
    if (!pl) return;
    if (pl.manualOrderDirty) {
      const slotIdx = pl.slots.findIndex((s) => s.assignedTrackId === id);
      const newLocks = locks.filter((l) => l.trackId !== id);
      if (slotIdx >= 0) {
        const compact = removeSlotCompact(pl.slots, slotIdx);
        const tbm = new Map(newTracks.map((t) => [t.trackId, t]));
        const reindexed = reindexPlaylistSlots(compact, tbm);
        const evaluated = evaluateSlotWarnings({ slots: reindexed, tracksById: tbm });
        mutatePLAndSave(activePlaylistId, (p) => ({ ...p, slots: evaluated, locks: newLocks, manualOrderDirty: true, updatedAt: nowIso() }), newTracks, e);
      } else {
        mutatePLAndSave(activePlaylistId, (p) => ({ ...p, locks: newLocks, updatedAt: nowIso() }), newTracks, e);
      }
    } else {
      regenerateForPL(newTracks, e, activePlaylistId);
    }
  }

  function handleRestoreOrphan(id: string) { handleRestore(id); }

  // ── Track import ──────────────────────────────────────────────────────────
  function handleTracksImported(newTracks: Track[], destination: ImportDestination = "library") {
    const deduped = newTracks.filter((n) => !libraryTracksRef.current.find((t) => t.trackId === n.trackId));

    let toAdd: Track[];

    if (destination === "archive") {
      toAdd = deduped.map((t) => ({ ...t, archiveStatus: "archive" as const }));
    } else if (destination === "playlist") {
      // Scope to active playlist's source group so fill/regenerate works correctly
      const groupId = activePlaylist?.sourceGroupId;
      toAdd = groupId
        ? deduped.map((t) => ({ ...t, sourceGroupId: t.sourceGroupId ?? groupId }))
        : deduped;
    } else if (destination === "group") {
      // Grouping is applied by the user after import via Create Library Group; just add to library
      toAdd = deduped;
    } else {
      // "library" — plain import, no source group scoping, no auto-regenerate
      toAdd = deduped;
    }

    const merged = [...libraryTracksRef.current, ...toAdd];
    libraryTracksRef.current = merged;
    setLibraryTracks(merged);

    if (destination === "playlist") {
      // Append imported tracks to the active playlist as new slots
      const activeId = activePlaylistId;
      mutatePLAndSave(activeId, (pl) => {
        const nextSlots = [...pl.slots];
        let slotIndex = nextSlots.length;
        let startTime = nextSlots.reduce((s, slot) => {
          const t = merged.find((tr) => tr.trackId === slot.assignedTrackId);
          return s + (t?.durationSeconds ?? 0);
        }, 0);
        for (const t of toAdd) {
          nextSlots.push({
            slotId: `slot_${slotIndex}`,
            slotIndex,
            assignedTrackId: t.trackId,
            targetBpm: t.bpm,
            targetEnergy: t.energy,
            startTimeSeconds: startTime,
            warningMessages: [],
            warningLevel: "none",
          });
          startTime += t.durationSeconds;
          slotIndex++;
        }
        return { ...pl, slots: nextSlots, manualOrderDirty: true, updatedAt: nowIso() };
      });
    } else {
      // Library / Archive / Group: save without touching playlist or curve
      savePlayProject(makeProj(playlistsRef.current, merged, excludedTrackIds));
    }
  }

  function handleBulkSetArchiveStatus(trackIds: string[], status: import("./data/trackTypes").TrackArchiveStatus) {
    const idSet = new Set(trackIds);
    const next = libraryTracksRef.current.map((t) =>
      idSet.has(t.trackId) ? { ...t, archiveStatus: status } : t
    );
    libraryTracksRef.current = next;
    setLibraryTracks(next);
    savePlayProject(makeProj(playlistsRef.current, next));
  }

  // ── Rate track ────────────────────────────────────────────────────────────
  function handleRateTrack(trackId: string, rating: import("./data/trackTypes").TrackRating) {
    setLibraryTracks((prev) => prev.map((t) => (t.trackId === trackId ? { ...t, rating } : t)));
  }

  function handleBulkUpdateTracks(trackIds: string[], patch: Partial<Track>) {
    const idSet = new Set(trackIds);
    const isMoodAdd = (patch as Record<string, unknown>)["_bulkMoodMode"] === "add";
    const { _bulkMoodMode: _ignored, ...cleanPatch } = patch as Record<string, unknown>;
    const safePatch = cleanPatch as Partial<Track>;
    const next = libraryTracksRef.current.map((t) => {
      if (!idSet.has(t.trackId)) return t;
      if (isMoodAdd && safePatch.moodTags) {
        const merged = [...new Set([...(t.moodTags ?? []), ...safePatch.moodTags])];
        return { ...t, moodTags: merged };
      }
      return { ...t, ...safePatch };
    });
    libraryTracksRef.current = next;
    setLibraryTracks(next);
    savePlayProject(makeProj(playlistsRef.current, next));
  }

  // ── Analyzer job queue (0701D) ────────────────────────────────────────────
  const [analyzerJobs, setAnalyzerJobs] = useState<Map<string, AnalyzerJobStatus>>(new Map());

  function runMechanicalAnalysis(trackIds: string[]) {
    if (!trackIds.length) return;
    setAnalyzerJobs((prev) => {
      const next = new Map(prev);
      trackIds.forEach((id) => next.set(id, "running"));
      return next;
    });
    // Catalog analysis is synchronous — run immediately then mark complete
    const idSet = new Set(trackIds);
    const next = libraryTracksRef.current.map((t) => {
      if (!idSet.has(t.trackId)) return t;
      const result = analyzeMechanicalMoods(t);
      return { ...t, ...result };
    });
    libraryTracksRef.current = next;
    setLibraryTracks(next);
    savePlayProject(makeProj(playlistsRef.current, next));
    setAnalyzerJobs((prev) => {
      const done = new Map(prev);
      trackIds.forEach((id) => done.set(id, "complete"));
      // Clear completed jobs after 3s
      setTimeout(() => {
        setAnalyzerJobs((c) => {
          const cleared = new Map(c);
          trackIds.forEach((id) => { if (cleared.get(id) === "complete") cleared.delete(id); });
          return cleared;
        });
      }, 3000);
      return done;
    });
  }

  function handleAnalyzeTrack(trackId: string) {
    runMechanicalAnalysis([trackId]);
  }

  function handleAnalyzeSelected(trackIds: string[]) {
    runMechanicalAnalysis(trackIds);
  }

  function handleAnalyzeLibrary() {
    runMechanicalAnalysis(libraryTracksRef.current.map((t) => t.trackId));
  }

  function handleReanalyze(trackIds: string[]) {
    runMechanicalAnalysis(trackIds);
  }

  function handleAnalyzeSource(owner: TrackSourceOwner) {
    const ids = libraryTracksRef.current
      .filter((t) => (t.sourceOwner ?? "unknown") === owner)
      .map((t) => t.trackId);
    runMechanicalAnalysis(ids);
  }

  // ── Source-scoped import (0701E) ──────────────────────────────────────────

  const SOURCE_DEFAULTS: Record<TrackSourceOwner, { sourceLibrary: string; platformUse: Track["platformUse"]; analysisSources: Track["analysisSources"] }> = {
    studiorich: { sourceLibrary: "Catalog", platformUse: ["internal", "studiorich_stream"], analysisSources: ["import", "external_tool"] },
    external:   { sourceLibrary: "External",           platformUse: ["mixcloud", "reference_only"],    analysisSources: ["import", "external_tool"] },
    reference:  { sourceLibrary: "Reference",          platformUse: ["reference_only"],                analysisSources: ["import", "external_tool"] },
    unknown:    { sourceLibrary: "Unknown",             platformUse: ["do_not_publish"],                analysisSources: ["import"] },
  };

  function applyUpsertResult(upserted: Track[], importedCount: number, updatedCount: number) {
    libraryTracksRef.current = upserted;
    setLibraryTracks(upserted);
    savePlayProject(makeProj(playlistsRef.current, upserted));
    return { importedCount, updatedCount };
  }

  // ── Update Library — reads from fixed filesystem roots ────────────────────
  // Fixed paths (relative to vite cwd = project root):
  //   library/catalog/tracks.csv + library/catalog/audio/   → studiorich
  //   library/external/tracks.csv + library/external/audio/ → external
  //   library/reference/tracks.csv + library/reference/audio/ → reference
  //
  // Audio is served via /media?path=<absolute> so filePath survives refresh
  // without needing objectUrls. Tracks created this way are stable on reload.

  async function handleUpdateLibrary(owner: TrackSourceOwner) {
    if (owner === "unknown") return;
    setLibraryUpdating(owner);
    const paths = LIBRARY_PATHS[owner as keyof typeof LIBRARY_PATHS];
    const defaults = SOURCE_DEFAULTS[owner];
    let current = libraryTracksRef.current;
    let csvAdded = 0, csvUpdated = 0, audioScanned = 0, audioAdded = 0, audioLinked = 0;
    const now = nowIso();
    const label = defaults.sourceLibrary;
    const warnings: string[] = [];

    console.log(`[UpdateLibrary] ${label} — csv: ${paths.csv} | audio: ${paths.audio}`);

    // Step 1: CSV
    try {
      const resp = await fetch(`/library-data?path=${encodeURIComponent(paths.csv)}`);
      console.log(`[UpdateLibrary] CSV fetch status: ${resp.status}`);
      if (resp.ok) {
        const csvText = await resp.text();
        const { tracks: csvTracks, errors } = parseCsvTracks(csvText, {
          defaultSourceOwner: owner,
          defaultSourceLibrary: defaults.sourceLibrary,
          defaultPlatformUse: defaults.platformUse,
          defaultAnalysisStatus: "partial",
          defaultAnalysisSources: defaults.analysisSources,
        });
        if (errors.length) {
          console.warn(`[UpdateLibrary] ${label} CSV parse warnings:`, errors.slice(0, 5));
          warnings.push(`${errors.length} CSV parse warning(s)`);
        }
        console.log(`[UpdateLibrary] CSV parsed: ${csvTracks.length} rows`);
        const { tracks: upserted, result } = upsertTracks(current, csvTracks);
        current = upserted;
        csvAdded = result.importedCount;
        csvUpdated = result.updatedCount;
        console.log(`[UpdateLibrary] CSV upsert: +${csvAdded} added, ${csvUpdated} updated`);
      } else if (resp.status === 404) {
        if (owner === "studiorich") warnings.push(`CSV not found at ${paths.csv}`);
        // External/Reference: CSV is optional — audio scan will create rows
      } else {
        warnings.push(`CSV fetch error: HTTP ${resp.status}`);
      }
    } catch (e) {
      console.error(`[UpdateLibrary] CSV fetch threw:`, e);
      warnings.push(`CSV fetch failed: ${(e as Error).message}`);
    }

    // Step 2: Audio folder
    let audioFolderFound = false;
    try {
      const resp = await fetch(`/library-ls?path=${encodeURIComponent(paths.audio)}`);
      console.log(`[UpdateLibrary] audio-ls fetch status: ${resp.status}`);
      if (resp.ok) {
        audioFolderFound = true;
        const files: Array<{name: string; path: string}> = await resp.json();
        const AUDIO_EXT = /\.(mp3|flac|wav|aif|aiff|ogg|m4a|aac|opus)$/i;
        const audioFiles = files.filter((f) => AUDIO_EXT.test(f.name));
        audioScanned = audioFiles.length;
        console.log(`[UpdateLibrary] audio folder: ${files.length} total files, ${audioScanned} audio`);

        if (owner === "studiorich") {
          // Link audio to existing CSV tracks by filename matching
          const byLower = new Map(audioFiles.map((f) => [f.name.toLowerCase(), f.path]));
          current = current.map((t) => {
            if (t.sourceOwner !== "studiorich") return t;
            if (t.audioLinked && t.filePath) { audioLinked++; return t; }
            const fn = (t.audioFilename ?? t.fileName ?? "").toLowerCase();
            const matched = fn ? byLower.get(fn) : undefined;
            if (matched) {
              audioLinked++;
              return { ...t, filePath: matched, audioLinked: true, audioMissing: false, audioLastScannedAt: now };
            }
            return { ...t, audioMissing: true, audioLastScannedAt: now };
          });
          console.log(`[UpdateLibrary] StudioRich linked: ${audioLinked}`);
        } else {
          // External / Reference: audio files become track rows
          const incoming: Track[] = audioFiles.map((f) => ({
            trackId: genId(owner.slice(0, 3)),
            title: f.name.replace(/\.[^.]+$/, ""),
            artist: "",
            bpm: 0,
            camelotKey: "1A" as const,
            durationSeconds: 0,
            energy: 0,
            energySource: "estimated" as const,
            sourceOwner: owner,
            sourceLibrary: defaults.sourceLibrary,
            fileName: f.name,
            filePath: f.path,
            audioLinked: true,
            audioMissing: false,
            audioLastScannedAt: now,
            platformUse: defaults.platformUse,
            analysisStatus: (owner === "reference" ? "not_analyzed" : "partial") as Track["analysisStatus"],
            analysisSources: defaults.analysisSources,
          }));
          const { tracks: merged, added, updated } = upsertFolderTracks(current, incoming);
          current = merged;
          audioAdded = added;
          audioLinked = updated;
          console.log(`[UpdateLibrary] ${label} audio upsert: +${audioAdded} added, ${audioLinked} re-linked`);
        }
      } else if (resp.status === 404) {
        console.warn(`[UpdateLibrary] audio folder not found: ${paths.audio}`);
        warnings.push(`Audio folder not found at ${paths.audio}`);
      } else {
        warnings.push(`Audio folder fetch error: HTTP ${resp.status}`);
      }
    } catch (e) {
      console.error(`[UpdateLibrary] audio-ls threw:`, e);
      warnings.push(`Audio scan failed: ${(e as Error).message}`);
    }

    libraryTracksRef.current = current;
    setLibraryTracks(current);
    const cacheSaved = savePlayProject(makeProj(playlistsRef.current, current));
    setLibraryUpdating(null);

    // Write compact index file for external/reference (source of truth on disk).
    let diskIndexOk: boolean | null = null; // null = not applicable (studiorich)
    if (owner === "external" || owner === "reference") {
      const ownerTracks = current.filter((t) => t.sourceOwner === owner);
      const indexPath = `${__LIBRARY_ROOT__}/${owner}/library.index.json`;
      const indexData = JSON.stringify(
        ownerTracks.map(({ objectUrl: _u, ...t }) => t),
      );
      try {
        const wr = await fetch(`/library-write?path=${encodeURIComponent(indexPath)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: indexData,
        });
        diskIndexOk = wr.ok;
        if (!wr.ok) console.warn(`[UpdateLibrary] index write HTTP ${wr.status}`);
      } catch (e) {
        diskIndexOk = false;
        console.warn(`[UpdateLibrary] index write failed:`, e);
      }
    }

    // Build notification
    const parts: string[] = [];
    if (csvAdded)    parts.push(`+${csvAdded} from CSV`);
    if (csvUpdated)  parts.push(`${csvUpdated} CSV updated`);
    if (audioScanned && owner === "studiorich") parts.push(`${audioLinked} audio linked`);
    if (audioAdded)  parts.push(`+${audioAdded} audio tracks`);
    if (audioLinked && owner !== "studiorich") parts.push(`${audioLinked} re-linked`);
    if (!audioFolderFound && !csvAdded && !csvUpdated) parts.push("nothing to import");

    const summary = parts.length ? parts.join(" · ") : "already up to date";
    const warnStr = warnings.length ? `  ⚠ ${warnings.join("; ")}` : "";

    // Persistence status — differentiate cache failure from real data loss.
    let persistNote = "";
    if (!cacheSaved) {
      if (diskIndexOk === true) {
        persistNote = "  (cache miss — disk index will restore on refresh)";
      } else if (diskIndexOk === false) {
        persistNote = "  ⚠ cache + disk index both failed — changes in memory only";
      } else {
        // studiorich: no disk index, but source CSV/audio folder is the recovery path
        persistNote = "  (cache miss — run Update Library again after refresh to restore)";
      }
    } else if (diskIndexOk === false) {
      persistNote = "  ⚠ disk index write failed — refresh may not restore full count";
    }

    const msg = `${label}: ${summary}${warnStr}${persistNote}`;
    console.log(`[UpdateLibrary] Done — ${msg}`);

    showNotify(msg);
  }

  function handleImportCsvToSource(owner: TrackSourceOwner, file: File) {
    const defaults = SOURCE_DEFAULTS[owner];
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { tracks, errors } = parseCsvTracks(ev.target?.result as string, {
        defaultSourceOwner: owner,
        defaultSourceLibrary: defaults.sourceLibrary,
        defaultPlatformUse: defaults.platformUse,
        defaultAnalysisStatus: "partial",
        defaultAnalysisSources: defaults.analysisSources,
      });
      const { tracks: upserted, result } = upsertTracks(libraryTracksRef.current, tracks);
      applyUpsertResult(upserted, result.importedCount, result.updatedCount);
      const parts = [`+${result.importedCount} new`];
      if (result.updatedCount) parts.push(`${result.updatedCount} updated`);
      if (result.duplicateSkippedCount) parts.push(`${result.duplicateSkippedCount} dupes skipped`);
      if (errors.length) parts.push(`${errors.length} errors`);
      setImportFlash(`${parts.join(" · ")} → ${defaults.sourceLibrary}`);
      setTimeout(() => setImportFlash(""), 5000);
      const report: LibraryScanReport = {
        id: `scan_${Date.now()}`,
        sourceId: `src_${owner}`,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: errors.length ? "failed" : "complete",
        importedCount: result.importedCount,
        updatedCount: result.updatedCount,
        unchangedCount: result.unchangedCount,
        duplicateSkippedCount: result.duplicateSkippedCount,
        rejectedCount: errors.length,
        errors: errors.length ? errors.slice(0, 10) : undefined,
      };
      void report;
    };
    reader.readAsText(file);
  }

  async function handleLoadSourceSeed(owner: TrackSourceOwner) {
    if (owner !== "studiorich") return;
    try {
      const resp = await fetch("/catalog/studiorich-seed.json");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const seed = await resp.json() as { libraryTracks?: Track[] };
      const seedTracks: Track[] = (seed.libraryTracks ?? []).map((t) => ({
        ...t,
        sourceOwner: "studiorich" as const,
        sourceLibrary: "Catalog",
        platformUse: ["internal", "studiorich_stream"] as Track["platformUse"],
        analysisStatus: "partial" as const,
      }));
      const { tracks: upserted, result } = upsertTracks(libraryTracksRef.current, seedTracks);
      applyUpsertResult(upserted, result.importedCount, result.updatedCount);
      const parts = [`+${result.importedCount} new`];
      if (result.updatedCount) parts.push(`${result.updatedCount} updated`);
      if (result.duplicateSkippedCount) parts.push(`${result.duplicateSkippedCount} skipped`);
      setImportFlash(`StudioRich seed: ${parts.join(" · ")}`);
      setTimeout(() => setImportFlash(""), 5000);
    } catch (e) {
      setImportFlash(`Seed load failed: ${(e as Error).message}`);
      setTimeout(() => setImportFlash(""), 4000);
    }
  }

  function handleRepairDuplicates(owner: TrackSourceOwner) {
    const sourceTracks = libraryTracksRef.current.filter((t) => (t.sourceOwner ?? "unknown") === owner);
    const otherTracks = libraryTracksRef.current.filter((t) => (t.sourceOwner ?? "unknown") !== owner);
    const { tracks: repaired, mergedCount, removedCount } = repairDuplicates(sourceTracks);
    const next = [...otherTracks, ...repaired];
    libraryTracksRef.current = next;
    setLibraryTracks(next);
    savePlayProject(makeProj(playlistsRef.current, next));
    const ownerLabel = SOURCE_DEFAULTS[owner]?.sourceLibrary ?? owner;
    if (removedCount === 0) {
      setImportFlash(`${ownerLabel}: no duplicates found`);
    } else {
      setImportFlash(`${ownerLabel}: merged ${mergedCount} groups, removed ${removedCount} duplicates → ${repaired.length} unique`);
    }
    setTimeout(() => setImportFlash(""), 6000);
  }

  const [audioLinkReport, setAudioLinkReport] = useState<AudioLinkReport | null>(null);

  function handleLinkAudioFolder(owner: TrackSourceOwner, files: FileList, rescan = false) {
    const fileArr = Array.from(files);
    // Collect existing objectUrls for this owner so they can be revoked on rescan
    const staleUrls = rescan
      ? libraryTracksRef.current
          .filter((t) => t.sourceOwner === owner && t.objectUrl)
          .map((t) => t.objectUrl!)
      : [];
    const { tracks: updated, report } = linkAudioFiles(
      libraryTracksRef.current, fileArr, owner, { rescan, revokeUrls: staleUrls }
    );
    libraryTracksRef.current = updated;
    setLibraryTracks(updated);
    // Persist folder path hint in the matching library source
    const nextSources = librarySourcesRef.current.map((s) =>
      s.sourceOwner === owner ? { ...s, audioFolderPath: report.folderName, lastScannedAt: report.scannedAt } : s
    );
    librarySourcesRef.current = nextSources;
    savePlayProject(makeProj(playlistsRef.current, updated));
    setAudioLinkReport(report);
  }

  function handleRescanAudioFolder(owner: TrackSourceOwner, files: FileList) {
    handleLinkAudioFolder(owner, files, true);
  }

  function handleImportAudioFolderAsExternal(files: FileList) {
    const AUDIO_EXT = /\.(mp3|flac|wav|aif|aiff|ogg|m4a|aac|opus)$/i;
    const audioFiles = Array.from(files).filter((f) => AUDIO_EXT.test(f.name));
    if (!audioFiles.length) return;
    const now = nowIso();
    const incoming: Track[] = audioFiles.map((f) => {
      const rel = (f as unknown as { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const nameNoExt = f.name.replace(/\.[^.]+$/, "");
      const objUrl = URL.createObjectURL(f);
      return {
        trackId: genId("ext"),
        title: nameNoExt,
        artist: "",
        bpm: 0,
        camelotKey: "1A" as const,
        durationSeconds: 0,
        energy: 0,
        energySource: "estimated" as const,
        sourceOwner: "external" as const,
        sourceLibrary: "External",
        fileName: f.name,
        filePath: rel,
        audioLinked: true,
        audioMissing: false,
        audioLastScannedAt: now,
        objectUrl: objUrl,
      };
    });
    const { tracks: merged, added, updated } = upsertFolderTracks(libraryTracksRef.current, incoming);
    libraryTracksRef.current = merged;
    setLibraryTracks(merged);
    const saved = savePlayProject(makeProj(playlistsRef.current, merged));
    if (!saved) showNotify("External import saved in-session but could not persist to storage (quota exceeded?). Export project to preserve.");
    const folderName = (() => {
      const first = audioFiles[0] as unknown as { webkitRelativePath?: string };
      if (first.webkitRelativePath) return first.webkitRelativePath.split("/")[0];
      return "External folder";
    })();
    setAudioLinkReport({
      sourceOwner: "external",
      scannedAt: now,
      folderName,
      totalSourceTracks: incoming.length,
      totalAudioFiles: audioFiles.length,
      linkedCount: added + updated,
      missingCount: 0,
      alreadyLinked: updated,
      duplicateFileMatches: updated,
      unmatchedFiles: 0,
      playableCount: added + updated,
    });
  }

  function handleLoadSampler(playlistId: string) {
    const pl = playlistsRef.current.find((p) => p.playlistId === playlistId) ?? null;
    setSamplerBank(pl);
    if (pl) setSamplerVisible(true);
  }

  function handleCreateSamplerBank(title?: string) {
    // Guard: title may arrive as a DOM Event if the button passes onClick directly
    const safeTitle = typeof title === "string" && title.trim() ? title.trim() : "New Sampler Bank";
    const ts = nowIso();
    const playlistId = genId("pl");
    const bank: PlaylistRecord = {
      playlistId,
      title: safeTitle,
      sourceGroupId: `source-${playlistId}`,
      allowCrossGroupAutofill: false,
      slots: [],
      curve: generateFlowCurve({ presetType: DEFAULT_PRESET, targetDurationSeconds: DEFAULT_TARGET_MINUTES * 60, curveDensity: DEFAULT_DENSITY }),
      locks: [],
      orphans: [],
      targetDurationMinutes: DEFAULT_TARGET_MINUTES,
      manualOrderDirty: false,
      playlistKind: "reference_overlay",
      createdAt: ts,
      updatedAt: ts,
    };
    setPlaylists((prev) => {
      const next = [...prev, bank];
      playlistsRef.current = next;
      savePlayProject(makeProj(next, libraryTracksRef.current));
      return next;
    });
    setActivePlaylistId(playlistId);
    setViewMode("playlist");
  }

  function handleAddTracksToSamplerBank(bankId: string, trackIds: string[]) {
    setPlaylists((prev) => {
      const next = prev.map((pl) => {
        if (pl.playlistId !== bankId) return pl;
        const existingIds = new Set(pl.slots.map((s) => s.assignedTrackId).filter(Boolean));
        const newSlots = trackIds
          .filter((id) => !existingIds.has(id))
          .map((trackId) => ({
            slotId: genId("slot"),
            assignedTrackId: trackId,
            warningMessages: [],
          }));
        return { ...pl, slots: [...pl.slots, ...newSlots], updatedAt: nowIso() };
      });
      playlistsRef.current = next;
      savePlayProject(makeProj(next, libraryTracksRef.current));
      // Keep samplerBank in sync if it's the one being modified
      setSamplerBank((prev) => prev?.playlistId === bankId ? (next.find((p) => p.playlistId === bankId) ?? prev) : prev);
      return next;
    });
  }

  function handleDeleteFromReference(trackIds: string[]) {
    const idSet = new Set(trackIds);
    const next = libraryTracksRef.current.filter((t) => !idSet.has(t.trackId));
    libraryTracksRef.current = next;
    setLibraryTracks(next);
    savePlayProject(makeProj(playlistsRef.current, next));
    // Rewrite reference index so the deletions survive refresh
    const refTracks = next.filter((t) => t.sourceOwner === "reference");
    const indexPath = `${__LIBRARY_ROOT__}/reference/library.index.json`;
    fetch(`/library-write?path=${encodeURIComponent(indexPath)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(refTracks.map(({ objectUrl: _u, ...t }) => t)),
    }).catch(() => {});
  }

  function handleCreateSamplerBankFromTracks(title: string, trackIds: string[]) {
    const safeTitle = title.trim() || "New Sampler Bank";
    const ts = nowIso();
    const playlistId = genId("pl");
    const slots = trackIds.map((trackId) => ({ slotId: genId("slot"), assignedTrackId: trackId, warningMessages: [] }));
    const bank: PlaylistRecord = {
      playlistId,
      title: safeTitle,
      sourceGroupId: `source-${playlistId}`,
      allowCrossGroupAutofill: false,
      slots,
      curve: generateFlowCurve({ presetType: DEFAULT_PRESET, targetDurationSeconds: DEFAULT_TARGET_MINUTES * 60, curveDensity: DEFAULT_DENSITY }),
      locks: [],
      orphans: [],
      targetDurationMinutes: DEFAULT_TARGET_MINUTES,
      manualOrderDirty: false,
      playlistKind: "reference_overlay",
      createdAt: ts,
      updatedAt: ts,
    };
    setPlaylists((prev) => {
      const next = [...prev, bank];
      playlistsRef.current = next;
      savePlayProject(makeProj(next, libraryTracksRef.current));
      return next;
    });
  }

  function handleRenameBank(id: string, title: string) {
    if (!title.trim()) return;
    setPlaylists((prev) => {
      const next = prev.map((pl) => pl.playlistId === id ? { ...pl, title: title.trim(), updatedAt: nowIso() } : pl);
      playlistsRef.current = next;
      savePlayProject(makeProj(next, libraryTracksRef.current));
      return next;
    });
  }

  function handleImportAudioFolderAsReference(files: FileList) {
    const AUDIO_EXT = /\.(mp3|flac|wav|aif|aiff|ogg|m4a|aac|opus)$/i;
    const audioFiles = Array.from(files).filter((f) => AUDIO_EXT.test(f.name));
    if (!audioFiles.length) return;
    const now = nowIso();
    const incoming: Track[] = audioFiles.map((f) => {
      const rel = (f as unknown as { webkitRelativePath?: string }).webkitRelativePath || f.name;
      const nameNoExt = f.name.replace(/\.[^.]+$/, "");
      const objUrl = URL.createObjectURL(f);
      return {
        trackId: genId("ref"),
        title: nameNoExt,
        artist: "",
        bpm: 0,
        camelotKey: "1A" as const,
        durationSeconds: 0,
        energy: 0,
        energySource: "estimated" as const,
        sourceOwner: "reference" as const,
        sourceLibrary: "Reference",
        fileName: f.name,
        filePath: rel,
        audioLinked: true,
        audioMissing: false,
        audioLastScannedAt: now,
        objectUrl: objUrl,
        platformUse: ["reference_only" as const],
        analysisStatus: "not_analyzed" as const,
      };
    });
    const { tracks: merged, added, updated } = upsertFolderTracks(libraryTracksRef.current, incoming);
    libraryTracksRef.current = merged;
    setLibraryTracks(merged);
    const saved = savePlayProject(makeProj(playlistsRef.current, merged));
    if (!saved) showNotify("Reference import saved in-session but could not persist to storage (quota exceeded?). Export project to preserve.");
    const folderName = (() => {
      const first = audioFiles[0] as unknown as { webkitRelativePath?: string };
      if (first.webkitRelativePath) return first.webkitRelativePath.split("/")[0];
      return "Reference folder";
    })();
    setAudioLinkReport({
      sourceOwner: "reference",
      scannedAt: now,
      folderName,
      totalSourceTracks: incoming.length,
      totalAudioFiles: audioFiles.length,
      linkedCount: added + updated,
      missingCount: 0,
      alreadyLinked: updated,
      duplicateFileMatches: updated,
      unmatchedFiles: 0,
      playableCount: added + updated,
    });
  }

  const [importFlash, setImportFlash] = useState("");
  const [libraryUpdating, setLibraryUpdating] = useState<TrackSourceOwner | null>(null);
  const audioRescanRefs = useRef<Partial<Record<TrackSourceOwner, HTMLInputElement | null>>>({});
  const csvImportRefs = useRef<Partial<Record<TrackSourceOwner, HTMLInputElement | null>>>({});

  // ── New Playlist Dialog ───────────────────────────────────────────────────
  const [showNewPlaylistDialog, setShowNewPlaylistDialog] = useState(false);
  const [newPlaylistDefaultTitle, setNewPlaylistDefaultTitle] = useState("Untitled Playlist");

  function handleCreatePlaylist() {
    const existingNames = new Set(playlists.map((p) => p.title));
    let title = "Untitled Playlist";
    let n = 2;
    while (existingNames.has(title)) { title = `Untitled Playlist ${n++}`; }
    setNewPlaylistDefaultTitle(title);
    setShowNewPlaylistDialog(true);
  }

  function handleNewPlaylistDialogConfirm(result: NewPlaylistDialogResult) {
    setShowNewPlaylistDialog(false);
    const newPL = makeDefaultPlaylist({
      title: result.title,
      allowedSourceOwners: result.allowedSourceOwners,
    });
    const next = [...playlists, newPL];
    setPlaylists(next);
    setActivePlaylistId(newPL.playlistId);
    activePlaylistIdRef.current = newPL.playlistId;
    slotsRef.current = newPL.slots;
    savePlayProject(makeProj(next, undefined, undefined, newPL.playlistId));
    setViewMode("playlist");
    setCurrentSlotIdx(null);
    setSelectedSlotIdx(null);
    if (result.buildMode === "auto") {
      // Trigger fill from curve after state settles
      setTimeout(() => handleRegenerateFromCurve(), 50);
    }
  }

  // ── Playlist Builder (0701F) ──────────────────────────────────────────────
  const [showPlaylistBuilder, setShowPlaylistBuilder] = useState(false);
  const [builderDefaultOwner, setBuilderDefaultOwner] = useState<TrackSourceOwner>("studiorich");

  function handleOpenPlaylistBuilder(owner: TrackSourceOwner = "studiorich") {
    setBuilderDefaultOwner(owner);
    setShowPlaylistBuilder(true);
  }

  function handlePlaylistBuilderConfirm(result: PlaylistBuilderResult) {
    setShowPlaylistBuilder(false);
    // Filter tracks from library by the builder's criteria
    const { filters, title, mode } = result;
    const candidate = libraryTracksRef.current.filter((t) => {
      if (filters.sourceOwners.length && !filters.sourceOwners.includes(t.sourceOwner ?? "unknown")) return false;
      if (filters.bpmMin !== undefined && t.bpm < filters.bpmMin) return false;
      if (filters.bpmMax !== undefined && t.bpm > filters.bpmMax) return false;
      if (filters.energyMin !== undefined && t.energy < filters.energyMin) return false;
      if (filters.energyMax !== undefined && t.energy > filters.energyMax) return false;
      if (filters.ratingMin && (t.rating ?? 0) < filters.ratingMin) return false;
      if (filters.primaryMood && t.primaryMood !== filters.primaryMood) return false;
      if (filters.genres.length) {
        const tg = [t.genre ?? "", ...(t.genres ?? [])].map((g) => g.toLowerCase());
        if (!filters.genres.some((g) => tg.includes(g.toLowerCase()))) return false;
      }
      if (filters.grouping && t.grouping !== filters.grouping) return false;
      if (filters.mechanicalMoodTags.length) {
        const tm = t.mechanicalMoodTags ?? [];
        if (!filters.mechanicalMoodTags.every((m) => tm.includes(m))) return false;
      }
      if (filters.audioLinked === true && !t.audioLinked) return false;
      if (filters.audioLinked === false && t.audioLinked) return false;
      if (filters.analysisStatus && t.analysisStatus !== filters.analysisStatus) return false;
      if (filters.mechanicalAnalysisStatus && t.mechanicalAnalysisStatus !== filters.mechanicalAnalysisStatus) return false;
      return true;
    });

    // Respect track count limit
    const pool = filters.trackCount ? candidate.slice(0, filters.trackCount) : candidate;
    if (pool.length === 0) {
      setImportFlash("Builder: no tracks matched — playlist not created");
      setTimeout(() => setImportFlash(""), 4000);
      return;
    }

    const targetSecs = filters.targetMinutes ? filters.targetMinutes * 60 : DEFAULT_TARGET_MINUTES * 60;
    const newPL = makeDefaultPlaylist({ title, targetDurationMinutes: Math.round(targetSecs / 60) });

    // Assign tracks as slots — reference catalog trackIds directly (0701G)
    let startSecs = 0;
    newPL.slots = pool.map((t, i) => {
      const slot: import("./data/playlistTypes").TrackSlot = {
        slotId: genId("slot"),
        slotIndex: i,
        startTimeSeconds: startSecs,
        targetEnergy: t.energy,
        targetBpm: t.bpm,
        assignedTrackId: t.trackId,
        warningLevel: "none",
        warningMessages: [],
      };
      startSecs += t.durationSeconds ?? 0;
      return slot;
    });

    if (mode === "create_fit_curve" || mode === "create_fill_time") {
      const { slots: fittedSlots } = assignPlaylistToCurve({
        tracks: pool,
        curve: newPL.curve,
        locks: [],
        excludedTrackIds: [],
        targetDurationSeconds: newPL.targetDurationMinutes * 60,
      });
      newPL.slots = fittedSlots;
    }

    const nextPlaylists = [...playlistsRef.current, newPL];
    playlistsRef.current = nextPlaylists;
    setPlaylists(nextPlaylists);
    setActivePlaylistId(newPL.playlistId);
    activePlaylistIdRef.current = newPL.playlistId;
    savePlayProject(makeProj(nextPlaylists, undefined, undefined, newPL.playlistId));
    setViewMode("playlist");
    setImportFlash(`Created "${title}" with ${pool.length} tracks`);
    setTimeout(() => setImportFlash(""), 4000);
  }

  // ── Mood suggestion handlers ──────────────────────────────────────────────
  function handleGenerateMoodSuggestionsForTracks(trackIds?: string[]) {
    const idSet = trackIds ? new Set(trackIds) : null;
    const next = libraryTracksRef.current.map((t) => {
      if (idSet && !idSet.has(t.trackId)) return t;
      if (!t.audioAnalysis) return t;
      const suggestions = suggestMoodsFromAnalysis(t);
      // Never clear existing suggestions on empty result — only replace on success (0701G)
      if (!suggestions.length) return t;
      return { ...t, moodSuggestions: suggestions };
    });
    libraryTracksRef.current = next;
    setLibraryTracks(next);
    savePlayProject(makeProj(playlistsRef.current, next));
  }

  function handleApplyMoodSuggestionsToTracks(trackIds: string[]) {
    const idSet = new Set(trackIds);
    const next = libraryTracksRef.current.map((t) => {
      if (!idSet.has(t.trackId)) return t;
      const suggestions = t.moodSuggestions ?? [];
      if (!suggestions.length) return t;
      const merged = [...new Set([...(t.moodTags ?? []), ...suggestions])];
      return { ...t, moodTags: merged };
    });
    libraryTracksRef.current = next;
    setLibraryTracks(next);
    savePlayProject(makeProj(playlistsRef.current, next));
  }

  // Restore/clear mood suggestion actions (0701G)
  function handleRestoreSuggestionsFromImport(trackId: string) {
    const next = libraryTracksRef.current.map((t) => {
      if (t.trackId !== trackId) return t;
      const imported = t.importedMoodTags ?? [];
      if (!imported.length) return t;
      return { ...t, moodSuggestions: imported };
    });
    libraryTracksRef.current = next;
    setLibraryTracks(next);
    savePlayProject(makeProj(playlistsRef.current, next));
  }

  function handleRestoreSuggestionsFromMechanical(trackId: string) {
    const next = libraryTracksRef.current.map((t) => {
      if (t.trackId !== trackId) return t;
      const mechTags = (t.mechanicalMoodTags ?? []) as string[];
      if (!mechTags.length) return t;
      return { ...t, moodSuggestions: mechTags };
    });
    libraryTracksRef.current = next;
    setLibraryTracks(next);
    savePlayProject(makeProj(playlistsRef.current, next));
  }

  function handleClearSuggestedMoods(trackId: string) {
    const next = libraryTracksRef.current.map((t) =>
      t.trackId === trackId ? { ...t, moodSuggestions: [] } : t
    );
    libraryTracksRef.current = next;
    setLibraryTracks(next);
    savePlayProject(makeProj(playlistsRef.current, next));
  }

  // ── Manual playlist mutations ─────────────────────────────────────────────
  function tracksById_live(): Map<string, Track> {
    return new Map(libraryTracks.map((t) => [t.trackId, t]));
  }

  function handleMoveUp(slotIndex: number) {
    const newSlots = moveSlotUp({ slots, slotIndex, locks });
    const tbm = tracksById_live();
    applyManualSlots(evaluateSlotWarnings({ slots: newSlots, tracksById: tbm }));
  }

  function handleMoveDown(slotIndex: number) {
    const newSlots = moveSlotDown({ slots, slotIndex, locks });
    const tbm = tracksById_live();
    applyManualSlots(evaluateSlotWarnings({ slots: newSlots, tracksById: tbm }));
  }

  function handleReorderSlot(from: number, to: number) {
    const newSlots = reorderPlaylistSlot({ slots, fromSlotIndex: from, toSlotIndex: to, locks });
    const tbm = tracksById_live();
    applyManualSlots(evaluateSlotWarnings({ slots: newSlots, tracksById: tbm }));
  }

  function handleRemoveFromPlaylist(trackId: string) {
    const slotIndex = slots.findIndex((s) => s.assignedTrackId === trackId);
    if (slotIndex < 0) return;
    // Only affects playback when the editor IS the playing playlist (0622A).
    const wasPlaying = isEditingPlayingPlaylist && currentSlotIdx === slotIndex;
    const playingAfterRemoved = isEditingPlayingPlaylist && currentSlotIdx !== null && currentSlotIdx > slotIndex;
    const compact = removeSlotCompact(slots, slotIndex);
    const tbm = tracksById_live();
    const reindexed = reindexPlaylistSlots(compact, tbm);
    const evaluated = evaluateSlotWarnings({ slots: reindexed, tracksById: tbm });
    const remainingSlotIds = new Set(reindexed.map((s) => s.slotId));
    const now = nowIso();
    setExportReport(null);
    mutatePLAndSave(activePlaylistIdRef.current, (pl) => ({
      ...pl,
      slots: evaluated,
      manualOrderDirty: true,
      preservedGapSlotIds: (pl.preservedGapSlotIds ?? []).filter((id) => remainingSlotIds.has(id)),
      updatedAt: now,
    }));
    if (wasPlaying) { handleStop(); setCurrentSlotIdx(null); }
    else if (playingAfterRemoved && currentSlotIdx !== null) setCurrentSlotIdx(currentSlotIdx - 1);
    if (selectedSlotIdx !== null && selectedSlotIdx >= slotIndex) setSelectedSlotIdx(Math.max(0, selectedSlotIdx - 1));
  }

  function handleRemoveFromPlaylistLeaveGap(trackId: string) {
    const slotIndex = slots.findIndex((s) => s.assignedTrackId === trackId);
    if (slotIndex < 0) return;
    const newSlots = removeSlotLeaveGap(slots, slotIndex);
    const gapSlotId = newSlots[slotIndex]?.slotId;
    const tbm = tracksById_live();
    const evaluated = evaluateSlotWarnings({ slots: newSlots, tracksById: tbm });
    const now = nowIso();
    setExportReport(null);
    mutatePLAndSave(activePlaylistIdRef.current, (pl) => ({
      ...pl,
      slots: evaluated,
      manualOrderDirty: false,
      preservedGapSlotIds: gapSlotId
        ? [...(pl.preservedGapSlotIds ?? []).filter((id) => id !== gapSlotId), gapSlotId]
        : (pl.preservedGapSlotIds ?? []),
      updatedAt: now,
    }));
    if (isEditingPlayingPlaylist && currentSlotIdx === slotIndex) { handleStop(); setCurrentSlotIdx(null); }
  }

  function playlistSlotOf(trackId: string): number {
    return slots.findIndex((s) => s.assignedTrackId === trackId);
  }

  function handleAddToPlaylistEnd(trackId: string) {
    const existing = playlistSlotOf(trackId);
    if (existing >= 0) { showNotify(`Already in playlist: slot #${existing + 1}`); return; }
    const newSlots = appendTrackToPlaylist(slots, trackId);
    const tbm = tracksById_live();
    applyManualSlots(evaluateSlotWarnings({ slots: reindexPlaylistSlots(newSlots, tbm), tracksById: tbm }));
    setViewMode("playlist");
  }

  function handleInsertAfterSlot(trackId: string, afterSlotIdx: number) {
    const existing = playlistSlotOf(trackId);
    if (existing >= 0) { showNotify(`Already in playlist: slot #${existing + 1}`); return; }
    const insertAfter = afterSlotIdx >= 0 ? afterSlotIdx : slots.length - 1;
    const newSlots = insertTrackAfterSlot(slots, insertAfter, trackId);
    const tbm = tracksById_live();
    applyManualSlots(evaluateSlotWarnings({ slots: reindexPlaylistSlots(newSlots, tbm), tracksById: tbm }));
    setViewMode("playlist");
  }

  function handleReplaceSlot(trackId: string, slotIdx: number) {
    if (slotIdx < 0 || slotIdx >= slots.length) return;
    const existing = playlistSlotOf(trackId);
    if (existing >= 0 && existing !== slotIdx) { showNotify(`Already in playlist: slot #${existing + 1}`); return; }
    const newSlots = replaceSlot(slots, slotIdx, trackId);
    const oldTrackId = slots[slotIdx].assignedTrackId;
    const newLocks = oldTrackId ? locks.filter((l) => l.trackId !== oldTrackId) : locks;
    const tbm = tracksById_live();
    const now = nowIso();
    setExportReport(null);
    setPlaylists((prev) => {
      const next = prev.map((p) =>
        p.playlistId === activePlaylistId
          ? { ...p, slots: evaluateSlotWarnings({ slots: newSlots, tracksById: tbm }), locks: newLocks, manualOrderDirty: true, updatedAt: now }
          : p,
      );
      savePlayProject(makeProj(next));
      return next;
    });
    if (isEditingPlayingPlaylist && currentSlotIdx === slotIdx) { handleStop(); setCurrentSlotIdx(null); }
    setViewMode("playlist");
  }

  function handleFindBestSlot(trackId: string) {
    const existing = playlistSlotOf(trackId);
    if (existing >= 0) { showNotify(`Already in playlist: slot #${existing + 1}`); return; }
    const emptySlot = slots.findIndex((s) => !s.assignedTrackId);
    if (emptySlot >= 0) {
      const newSlots = replaceSlot(slots, emptySlot, trackId);
      const tbm = tracksById_live();
      applyManualSlots(evaluateSlotWarnings({ slots: newSlots, tracksById: tbm }));
    } else {
      handleAddToPlaylistEnd(trackId);
      return;
    }
    setViewMode("playlist");
  }

  function handleRemoveRepeats() {
    const tbm = tracksById_live();
    const seenIds = new Set<string>();
    const seenPaths = new Set<string>();
    let changed = false;
    let newSlots = slots.map((s) => {
      if (!s.assignedTrackId) return s;
      const track = tbm.get(s.assignedTrackId);
      const path = track?.filePath?.trim();
      if (seenIds.has(s.assignedTrackId) || (path && seenPaths.has(path))) {
        changed = true; return { ...s, assignedTrackId: undefined };
      }
      seenIds.add(s.assignedTrackId);
      if (path) seenPaths.add(path);
      return s;
    });
    if (!changed) { showNotify("No repeated tracks found"); return; }
    newSlots = newSlots.filter((s) => s.assignedTrackId !== undefined);
    const reindexed = reindexPlaylistSlots(newSlots, tbm);
    applyManualSlots(evaluateSlotWarnings({ slots: reindexed, tracksById: tbm }));
    showNotify("Repeated tracks removed");
  }

  // ── Empty slot repair ─────────────────────────────────────────────────────
  function handleFillGap(slotIndex: number) {
    const pl = activePlaylist;
    if (!pl) return;
    const slot = pl.slots[slotIndex];
    if (!slot || slot.assignedTrackId) return;
    const tbm = tracksById_live();
    const issues = trackPlaybackIssuesRef.current;
    const excl = excludedTrackIds;
    const assignedIds = new Set(pl.slots.map((s) => s.assignedTrackId).filter(Boolean) as string[]);
    const assignedPaths = new Set<string>();
    for (const id of assignedIds) {
      const fp = tbm.get(id)?.filePath;
      if (fp) assignedPaths.add(fp.trim().toLowerCase().replace(/\\/g, "/"));
    }
    const candidates = libraryTracks.filter((t) => {
      if (excl.has(t.trackId)) return false;
      if (issues[t.trackId]?.status === "unplayable") return false;
      if (assignedIds.has(t.trackId)) return false;
      // Source-group isolation (0621E): only pull from this playlist's group.
      if (!isTrackEligibleForPlaylist({ track: t, playlist: pl })) return false;
      const fp = t.filePath?.trim();
      if (!fp) return false;
      if (assignedPaths.has(fp.toLowerCase().replace(/\\/g, "/"))) return false;
      return true;
    });
    candidates.sort((a, b) => {
      const da = Math.abs(a.energy - (slot.targetEnergy ?? 0.5));
      const db = Math.abs(b.energy - (slot.targetEnergy ?? 0.5));
      if (Math.abs(da - db) > 0.1) return da - db;
      return (b.rating ?? 0) - (a.rating ?? 0);
    });
    const best = candidates[0];
    if (!best) { showNotify("No eligible track found for this slot."); return; }
    const newSlots = replaceSlot(pl.slots, slotIndex, best.trackId);
    const reindexed = reindexPlaylistSlots(newSlots, tbm);
    const evaluated = evaluateSlotWarnings({ slots: reindexed, tracksById: tbm });
    // Preserve manualOrderDirty: filling one gap must not lock the curve — if the
    // playlist was curve-generated it should stay curve-reactive after a fill.
    mutatePLAndSave(activePlaylistId, (p) => ({ ...p, slots: evaluated, updatedAt: nowIso() }));
    showNotify(`Filled slot #${slotIndex + 1} with "${best.title ?? best.trackId}".`);
  }

  function handleDeleteGap(slotIndex: number) {
    const pl = activePlaylist;
    if (!pl) return;
    const tbm = tracksById_live();
    const compact = removeSlotCompact(pl.slots, slotIndex);
    const reindexed = reindexPlaylistSlots(compact, tbm);
    const evaluated = evaluateSlotWarnings({ slots: reindexed, tracksById: tbm });
    mutatePLAndSave(activePlaylistId, (p) => ({ ...p, slots: evaluated, manualOrderDirty: true, updatedAt: nowIso() }));
  }

  function handleClearPlaybackIssue(trackId: string) {
    setPlaybackErrors((prev) => { const next = new Map(prev); next.delete(trackId); return next; });
    setTrackPlaybackIssues((prev) => {
      const { [trackId]: _, ...rest } = prev;
      trackPlaybackIssuesRef.current = rest;
      return rest;
    });
    showNotify("Playback issue cleared.");
  }

  // ── Fill Missing Time ─────────────────────────────────────────────────────
  function handleFillMissingTime() {
    const pl = activePlaylist;
    if (!pl) return;
    const now = nowIso();
    const { slots: newSlots, report } = fillMissingTime({
      playlist: pl,
      libraryTracks,
      excludedTrackIds,
      attemptedAt: now,
      trackPlaybackIssues: trackPlaybackIssuesRef.current,
      // Source-group isolation (0621E): scope new candidates to this playlist's group.
      eligibleTrackIds: new Set(
        filterTracksForPlaylist({ tracks: libraryTracks, playlist: pl }).map((t) => t.trackId),
      ),
    });
    setFillReport(report);
    if (report.insertedTrackCount === 0) {
      showNotify(report.reason ?? "Nothing to fill");
      return;
    }
    const msg = report.missingSecondsAfter > 0
      ? `Added ${report.insertedTrackCount} tracks — ${Math.round(report.missingSecondsAfter / 60)}m still missing`
      : `Added ${report.insertedTrackCount} track${report.insertedTrackCount !== 1 ? "s" : ""}`;
    showNotify(msg);
    const now2 = nowIso();
    setExportReport(null);
    // 0622B: Fill is a curve-aware operation, not a manual reorder. Leaving the
    // playlist curve-reactive (manualOrderDirty: false) — the same shape as after
    // Regenerate — keeps track nodes responsive to curve edits after a fill.
    // (newSlots are already reindexed + warning-evaluated by fillMissingTime.)
    mutatePLAndSave(activePlaylistId, (p) => {
      // Clear any preserved gap slots that fill just filled in (0622C).
      const filledIds = new Set(newSlots.filter((s) => s.assignedTrackId).map((s) => s.slotId));
      const remainingGaps = (p.preservedGapSlotIds ?? []).filter((id) => !filledIds.has(id));
      return { ...p, slots: newSlots, manualOrderDirty: false, lastFillReport: report, preservedGapSlotIds: remainingGaps, updatedAt: now2 };
    });
  }

  // ── Drop tracks onto playlist ─────────────────────────────────────────────
  function handleDropTracksOnPlaylist(targetPlaylistId: string, payload: TrackDragPayload) {
    const tbm = tracksById_live();
    const tracksToAdd = payload.trackIds
      .map((id) => tbm.get(id))
      .filter((t): t is Track => !!t);
    if (tracksToAdd.length === 0) return;

    let addedCount = 0;
    let skippedCount = 0;

    setPlaylists((prev) => {
      const targetPL = prev.find((p) => p.playlistId === targetPlaylistId);
      if (!targetPL) return prev;
      if (targetPL.locked) {
        showNotify("Playlist is locked. Duplicate or unlock to edit.");
        return prev;
      }
      const { playlist: updated, addedTrackIds, skippedDuplicateTrackIds } = appendTracksToPlaylist({
        playlist: targetPL,
        tracksToAdd,
        tracksById: tbm,
      });
      addedCount = addedTrackIds.length;
      skippedCount = skippedDuplicateTrackIds.length;
      const next = prev.map((p) => p.playlistId === targetPlaylistId ? updated : p);
      savePlayProject(makeProj(next, libraryTracksRef.current, excludedTrackIdsRef.current));
      return next;
    });

    // Show notify after state update — values are captured in closure above
    setTimeout(() => {
      const targetTitle = playlistsRef.current.find((p) => p.playlistId === targetPlaylistId)?.title ?? "playlist";
      if (addedCount === 0) {
        showNotify(`No tracks added. ${skippedCount} duplicate${skippedCount !== 1 ? "s" : ""} already in ${targetTitle}.`);
      } else if (skippedCount > 0) {
        showNotify(`Added ${addedCount} track${addedCount !== 1 ? "s" : ""} to ${targetTitle}. Skipped ${skippedCount} duplicate${skippedCount !== 1 ? "s" : ""}.`);
      } else {
        showNotify(`Added ${addedCount} track${addedCount !== 1 ? "s" : ""} to ${targetTitle}.`);
      }
    }, 0);
  }

  // ── Bulk library → playlist ────────────────────────────────────────────────
  function handleBulkAddTracksToPlaylist(targetPlaylistId: string, trackIds: string[]) {
    handleDropTracksOnPlaylist(targetPlaylistId, { trackIds });
  }

  function handleBulkCreatePlaylistFromTracks(trackIds: string[]) {
    const tbm = tracksById_live();
    const resolvedTracks = trackIds.map((id) => tbm.get(id)).filter((t): t is Track => !!t);
    if (resolvedTracks.length === 0) return;

    // Derive allowedSourceOwners from the selected tracks.
    const owners = [...new Set(resolvedTracks.map((t) => t.sourceOwner).filter((o): o is TrackSourceOwner => !!o && o !== "reference" && o !== "unknown"))];

    const existingNames = new Set(playlists.map((p) => p.title));
    let title = "New Playlist";
    let n = 2;
    while (existingNames.has(title)) { title = `New Playlist ${n++}`; }

    const newPL = makeDefaultPlaylist({
      title,
      allowedSourceOwners: owners.length > 0 ? owners : ["studiorich"],
    });
    const { playlist: withTracks } = appendTracksToPlaylist({ playlist: newPL, tracksToAdd: resolvedTracks, tracksById: tbm });
    const next = [...playlists, withTracks];
    setPlaylists(next);
    setActivePlaylistId(withTracks.playlistId);
    activePlaylistIdRef.current = withTracks.playlistId;
    savePlayProject(makeProj(next, undefined, undefined, withTracks.playlistId));
    setViewMode("playlist");
    showNotify(`Created "${title}" with ${resolvedTracks.length} track${resolvedTracks.length !== 1 ? "s" : ""}.`);
  }

  // ── Add Music panel ───────────────────────────────────────────────────────
  const [showAddMusic, setShowAddMusic] = useState(false);

  function handleAddMusicTracks(trackIds: string[], newSourceOwners: TrackSourceOwner[]) {
    const targetId = activePlaylistIdRef.current;
    if (!targetId) return;

    // Find the tracks from library
    const tbm = tracksById_live();
    const tracksToAdd = trackIds.map((id) => tbm.get(id)).filter((t): t is Track => !!t);
    if (tracksToAdd.length === 0) return;

    let addedCount = 0;
    let skippedCount = 0;

    setPlaylists((prev) => {
      const pl = prev.find((p) => p.playlistId === targetId);
      if (!pl || pl.locked) return prev;

      const { playlist: updated, addedTrackIds, skippedDuplicateTrackIds } = appendTracksToPlaylist({
        playlist: pl,
        tracksToAdd,
        tracksById: tbm,
      });
      addedCount = addedTrackIds.length;
      skippedCount = skippedDuplicateTrackIds.length;

      // Expand allowedSourceOwners if user added from a new source
      const existingOwners = new Set(pl.allowedSourceOwners ?? ["studiorich"]);
      const expandedOwners = [...existingOwners];
      for (const owner of newSourceOwners) {
        if (!existingOwners.has(owner)) expandedOwners.push(owner);
      }
      const final = expandedOwners.length !== (pl.allowedSourceOwners ?? ["studiorich"]).length
        ? { ...updated, allowedSourceOwners: expandedOwners as TrackSourceOwner[] }
        : updated;

      const next = prev.map((p) => p.playlistId === targetId ? final : p);
      savePlayProject(makeProj(next, libraryTracksRef.current, excludedTrackIdsRef.current));
      return next;
    });

    setTimeout(() => {
      if (addedCount === 0) {
        showNotify(`No tracks added — ${skippedCount} already in playlist.`);
      } else if (skippedCount > 0) {
        showNotify(`Added ${addedCount} · skipped ${skippedCount} duplicates.`);
      } else {
        showNotify(`Added ${addedCount} track${addedCount !== 1 ? "s" : ""}.`);
      }
    }, 0);
  }

  function handleReplacePlaylistWithTracks(trackIds: string[], newSourceOwners: TrackSourceOwner[]) {
    const targetId = activePlaylistIdRef.current;
    if (!targetId) return;
    const tbm = tracksById_live();
    const tracksToAdd = trackIds.map((id) => tbm.get(id)).filter((t): t is Track => !!t);
    const now = nowIso();

    setPlaylists((prev) => {
      const pl = prev.find((p) => p.playlistId === targetId);
      if (!pl || pl.locked) return prev;

      // Build fresh slots from the track list
      let startSecs = 0;
      const freshSlots = tracksToAdd.map((t, i) => {
        const slot: import("./data/playlistTypes").TrackSlot = {
          slotId: genId("slot"),
          slotIndex: i,
          startTimeSeconds: startSecs,
          targetEnergy: t.energy,
          targetBpm: t.bpm,
          assignedTrackId: t.trackId,
          warningLevel: "none",
          warningMessages: [],
        };
        startSecs += t.durationSeconds ?? 0;
        return slot;
      });

      // Expand allowedSourceOwners if new sources introduced
      const existingOwners = new Set(pl.allowedSourceOwners ?? ["studiorich"]);
      const expandedOwners = [...existingOwners];
      for (const owner of newSourceOwners) {
        if (!existingOwners.has(owner)) expandedOwners.push(owner);
      }

      const updated: PlaylistRecord = {
        ...pl,
        slots: freshSlots,
        locks: [],
        orphans: [],
        manualOrderDirty: true,
        updatedAt: now,
        allowedSourceOwners: expandedOwners as TrackSourceOwner[],
      };
      const next = prev.map((p) => p.playlistId === targetId ? updated : p);
      savePlayProject(makeProj(next, libraryTracksRef.current, excludedTrackIdsRef.current));
      return next;
    });

    showNotify(`Replaced playlist with ${tracksToAdd.length} track${tracksToAdd.length !== 1 ? "s" : ""}.`);
  }

  // ── Export ────────────────────────────────────────────────────────────────
  function handleExportM3u() {
    const pl = activePlaylist;
    if (!pl) return;
    const { content, report } = exportM3u({ tracks: libraryTracks, slots: pl.slots, title: pl.title });
    downloadFile(`${pl.title}.m3u`, content, "audio/x-mpegurl");
    const summary = `M3U: ${report.exportableCount} exported · ${report.skippedCount} skipped`;
    showFlashMsg(summary);
    setExportReport(report);
    setExportReportText(formatExportReport(report, pl.title));
  }

  function handleRunExportHealth() {
    const pl = activePlaylist;
    if (!pl) return;
    const tbm = tracksById_live();
    setExportReport(validatePlaylistForExport(pl.slots, tbm));
  }

  // ── Load from storage ─────────────────────────────────────────────────────
  useEffect(() => {
    const saved = loadPlayProject();
    if (saved) applyProject(saved);
    // Hydration complete — autosave may now run safely.
    setHasHydratedProject(true);

    // Index-wins hydration: for external/reference, if the library.index.json
    // has MORE tracks than what localStorage restored, replace with the index.
    // This handles: localStorage quota failure, stale/partial saves, first run.
    const savedTracks = saved?.libraryTracks ?? [];
    (["external", "reference"] as const).forEach(async (owner) => {
      const savedCount = savedTracks.filter((t) => t.sourceOwner === owner).length;
      const indexPath = `${__LIBRARY_ROOT__}/${owner}/library.index.json`;
      try {
        const resp = await fetch(`/library-data?path=${encodeURIComponent(indexPath)}`);
        if (!resp.ok) return;
        const tracks: Track[] = JSON.parse(await resp.text());
        if (!Array.isArray(tracks) || tracks.length === 0) return;
        if (tracks.length <= savedCount) return; // localStorage already has full or better data
        console.log(`[PLAY] Index has ${tracks.length} ${owner} tracks vs ${savedCount} in localStorage — index wins`);
        setLibraryTracks((prev) => {
          const merged = [...prev.filter((t) => t.sourceOwner !== owner), ...tracks];
          libraryTracksRef.current = merged;
          savePlayProject(makeProj(playlistsRef.current, merged));
          return merged;
        });
      } catch {
        // Index file absent or unreadable — skip silently
      }
    });

    // Sampler bank persistence: hydrate from filesystem index.
    // Banks file is the source of truth — merge any banks not already in localStorage.
    const banksPath = `${__LIBRARY_ROOT__}/sampler-banks/banks.json`;
    (async () => {
      try {
        const resp = await fetch(`/library-data?path=${encodeURIComponent(banksPath)}`);
        if (!resp.ok) return;
        const fsbanks: PlaylistRecord[] = JSON.parse(await resp.text());
        if (!Array.isArray(fsbanks) || fsbanks.length === 0) return;
        setPlaylists((prev) => {
          const existingIds = new Set(prev.map((p) => p.playlistId));
          const incoming = fsbanks.filter(
            (b) => b.playlistKind === "reference_overlay" && !existingIds.has(b.playlistId),
          );
          if (incoming.length === 0) return prev;
          console.log(`[PLAY] Hydrated ${incoming.length} sampler bank(s) from filesystem index`);
          const next = [...prev, ...incoming];
          playlistsRef.current = next;
          savePlayProject(makeProj(next));
          return next;
        });
      } catch {
        // Banks file absent — skip silently
      }
    })();
  }, []);

  function applyProject(p: PlayProject) {
    setLibraryTracks(p.libraryTracks);
    setExcludedTrackIds(new Set(p.excludedTrackIds ?? []));
    const pls = p.playlists.length > 0 ? p.playlists : [makeDefaultPlaylist()];
    setPlaylists(pls);
    const activeId = p.activePlaylistId || pls[0]?.playlistId || "";
    setActivePlaylistId(activeId);
    activePlaylistIdRef.current = activeId;
    const activePL = pls.find((pl) => pl.playlistId === activeId) ?? pls[0];
    slotsRef.current = activePL?.slots ?? [];
    setCurrentSlotIdx(null);
    setSelectedSlotIdx(null);
    setExportReport(null);
    const issues = p.trackPlaybackIssues ?? {};
    trackPlaybackIssuesRef.current = issues;
    setTrackPlaybackIssues(issues);
    setPlaybackErrors(new Map(Object.entries(issues).map(([id, issue]) => [id, issue.code ?? "ERR"])));
    const sched = p.schedule ?? makeDefaultSchedule();
    scheduleRef.current = sched;
    setSchedule(sched);
    const events = p.broadcastEvents ?? [];
    broadcastEventsRef.current = events;
    setBroadcastEvents(events);
    const sources = p.librarySources ?? [];
    librarySourcesRef.current = sources;
    const pools = p.sourcePools ?? [];
    sourcePoolsRef.current = pools;
    setSourcePools(pools);
  }

  // ── Export / Import (0623B) ──────────────────────────────────────────────

  function handleExportProject() {
    const exportedAt = downloadPlayProjectExport(playProject);
    setLastExportedAt(exportedAt);
    setExportedProjectHash(stableProjectHash(playProject));
  }

  function handleImportProject(p: PlayProject) {
    const repaired = repairStoredProject(p);
    applyProject(repaired);
    savePlayProject(repaired);
    // After import the in-memory state matches the file — record its hash as the
    // baseline so dirty tracking starts from the imported content.
    setExportedProjectHash(stableProjectHash(repaired));
    // lastExportedAt intentionally NOT set — the user has not exported a file yet.
  }

  // ── Audio setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;

    audio.addEventListener("ended", () => {
      // Autoplay continues on the PLAYING playlist (0622A), not the editor view.
      if (autoplayRef.current && currentSlotIdxRef.current !== null) {
        const ps = playingSlotsRef.current;
        const next = getNextPlayableSlot({ slots: ps, currentSlotIndex: currentSlotIdxRef.current });
        if (next) { playSlotDirect(next.slotIndex, ps, libraryTracksRef.current); }
        else setPlaybackStatus("idle");
      } else {
        setPlaybackStatus("idle");
      }
    });

    audio.addEventListener("error", () => {
      if (!audio.currentSrc) return;
      const slotIdx = currentSlotIdxRef.current;
      const slot = slotIdx !== null ? playingSlotsRef.current[slotIdx] : undefined;
      const trackId = slot?.assignedTrackId;

      function markUnplayable(trackId: string, code: TrackPlaybackIssue["code"], msg: string) {
        setPlaybackErrors((prev) => new Map(prev).set(trackId, code ?? "ERR"));
        const issue: TrackPlaybackIssue = { status: "unplayable", code, message: msg, detectedAt: new Date().toISOString() };
        setTrackPlaybackIssues((prev) => {
          const next = { ...prev, [trackId]: issue };
          trackPlaybackIssuesRef.current = next;
          return next;
        });
        if (autoplayRef.current) {
          showNotify(`Skipped unplayable track: ${code ?? "ERR"}.`);
          setTimeout(() => nextActionRef.current?.(), 150);
        } else {
          setPlaybackError(`Playback error — ${msg}`);
          setPlaybackStatus("error");
        }
      }

      let category: TrackPlaybackIssue["code"] = "UNKNOWN";
      let msg = "file missing or unsupported codec";
      const code = audio.error?.code;
      if (code === MediaError.MEDIA_ERR_DECODE) {
        category = "CODEC"; msg = "codec decode failure";
      } else if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        const track = trackId ? libraryTracksRef.current.find((t) => t.trackId === trackId) : undefined;
        if (track?.filePath) {
          fetch(getAudioUrl(track.filePath), { method: "HEAD" })
            .then((r) => {
              const xErr = r.headers.get("X-Media-Error");
              const cat: TrackPlaybackIssue["code"] = xErr === "FILE_MISSING" ? "MISSING"
                : xErr === "UNSUPPORTED_EXT" ? "CODEC"
                : xErr === "NO_PATH" ? "NO_SOURCE" : "CODEC";
              if (trackId) markUnplayable(trackId, cat, xErr ?? "no source");
            })
            .catch(() => {
              if (trackId) markUnplayable(trackId, "UNKNOWN", "cannot reach media server");
            });
          return;
        }
        category = "CODEC"; msg = "format not supported";
      } else if (code === MediaError.MEDIA_ERR_NETWORK) {
        category = "NETWORK"; msg = "network error";
      } else if (code === MediaError.MEDIA_ERR_ABORTED) {
        return;
      }
      if (trackId) markUnplayable(trackId, category, msg);
      else { setPlaybackError(`Playback error — ${msg}`); setPlaybackStatus("error"); }
    });

    audio.addEventListener("timeupdate", () => {
      setAudioTime(audio.currentTime);
      if (playCountedRef.current) return;
      const { currentTime, duration } = audio;
      if (!duration || isNaN(duration)) return;
      const threshold = Math.min(30, duration * 0.4);
      if (currentTime >= threshold) {
        playCountedRef.current = true;
        const slotIdx = currentSlotIdxRef.current;
        if (slotIdx === null) return;
        const slot = slotsRef.current[slotIdx];
        if (!slot?.assignedTrackId) return;
        const trackId = slot.assignedTrackId;
        const now2 = nowIso();
        setLibraryTracks((prev) =>
          prev.map((t) =>
            t.trackId === trackId
              ? { ...t, playCount: (t.playCount ?? 0) + 1, lastPlayedAt: now2, lastPlayedSlotIndex: slotIdx }
              : t,
          ),
        );
      }
    });

    audio.addEventListener("durationchange", () => {
      setAudioDuration(isNaN(audio.duration) ? 0 : audio.duration);
    });

    return () => { audio.pause(); };
  }, []);

  // Sync Music Player volume to audio element
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = musicVolume;
  }, [musicVolume]);

  // ── Action refs update every render ──────────────────────────────────────
  useEffect(() => {
    playActionRef.current = handlePlay;
    pauseActionRef.current = handlePause;
    stopActionRef.current = handleStop;
    nextActionRef.current = handleNext;
    prevActionRef.current = handlePrevious;
    removeSelectedRef.current = () => {
      const selIdx = selectedSlotIdxRef.current;
      if (selIdx === null) return;
      const slot = slotsRef.current[selIdx];
      if (slot?.assignedTrackId) {
        handleRemoveFromPlaylist(slot.assignedTrackId);
      } else {
        const compact = removeSlotCompact(slotsRef.current, selIdx);
        const tbm = new Map(libraryTracksRef.current.map((t) => [t.trackId, t]));
        applyManualSlots(evaluateSlotWarnings({ slots: reindexPlaylistSlots(compact, tbm), tracksById: tbm }));
      }
    };
  });

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === " ") {
        e.preventDefault();
        if (playbackStatusRef.current === "playing") pauseActionRef.current();
        else playActionRef.current();
      } else if (e.key === "Escape") {
        stopActionRef.current();
      } else if (e.key === "ArrowRight") {
        e.preventDefault(); nextActionRef.current();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault(); prevActionRef.current();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        removeSelectedRef.current();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // ── Playback functions ────────────────────────────────────────────────────
  function playSlotDirect(slotIndex: number, slotList: TrackSlot[], trackList: Track[]) {
    const slot = slotList[slotIndex];
    if (!slot?.assignedTrackId) {
      setPlaybackError(`#${slotIndex + 1}: slot is empty`);
      setPlaybackStatus("error");
      return;
    }
    const tbm = new Map(trackList.map((t) => [t.trackId, t]));
    const track = tbm.get(slot.assignedTrackId);
    const playUrl = track ? getTrackPlayUrl(track) : null;
    if (!playUrl) {
      setPlaybackError(`#${slotIndex + 1}: no audio — link an audio folder first`);
      setPlaybackStatus("error");
      return;
    }
    const audio = audioRef.current!;
    audio.pause();
    audio.src = playUrl;
    playCountedRef.current = false;
    setAudioTime(0);
    setAudioDuration(0);
    audio.load();
    audio.play()
      .then(() => {
        setCurrentSlotIdx(slotIndex);
        setPlaybackStatus("playing");
        setPlaybackError(undefined);
      })
      .catch((err: Error) => {
        setPlaybackError(`#${slotIndex + 1}: ${err.message}`);
        setPlaybackStatus("error");
      });
  }

  // Audition a catalog track directly (not via playlist slot) — 0701G
  const [auditionTrackId, setAuditionTrackId] = useState<string | null>(null);

  function handleAuditionTrack(trackId: string) {
    const track = libraryTracksRef.current.find((t) => t.trackId === trackId);
    const playUrl = track ? getTrackPlayUrl(track) : null;
    if (!playUrl) {
      showNotify("No audio linked for this track — link an audio folder first.");
      return;
    }
    const audio = audioRef.current!;
    audio.pause();
    audio.src = playUrl;
    playCountedRef.current = false;
    setAudioTime(0);
    setAudioDuration(0);
    audio.load();
    audio.play()
      .then(() => {
        setAuditionTrackId(trackId);
        setCurrentSlotIdx(null);
        setPlaybackStatus("playing");
        setPlaybackError(undefined);
      })
      .catch((err: Error) => {
        setPlaybackError(`Audition: ${err.message}`);
        setPlaybackStatus("error");
      });
  }

  function handleAuditionAndAdd(trackId: string) {
    handleAuditionTrack(trackId);
    handleAddToPlaylistEnd(trackId);
  }

  // Explicit play (0622A): the ONLY path that (re)binds the playing context to
  // the editor's currently-selected playlist.
  function beginPlaybackFromActive(slotIndex: number) {
    const plId = activePlaylistIdRef.current;
    const editorSlots = slotsRef.current;
    setPlayingPlaylistId(plId);
    playingPlaylistIdRef.current = plId;
    playingSlotsRef.current = editorSlots;
    playSlotDirect(slotIndex, editorSlots, libraryTracksRef.current);
  }

  function handlePlayFromSlot(slotIndex: number) {
    beginPlaybackFromActive(slotIndex);
  }

  function handlePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playbackStatus === "paused") {
      audio.play().then(() => setPlaybackStatus("playing")).catch(() => {});
    } else if (playbackStatus === "idle" || playbackStatus === "error") {
      // Resume the existing playing context if there is one; otherwise start
      // from the editor's selected playlist (explicit play).
      if (playingPlaylistIdRef.current && currentSlotIdxRef.current !== null && playingSlotsRef.current.length) {
        playSlotDirect(currentSlotIdxRef.current, playingSlotsRef.current, libraryTracksRef.current);
      } else {
        const startIdx = currentSlotIdx ?? slots.findIndex((s) => s.assignedTrackId);
        if (startIdx >= 0) beginPlaybackFromActive(startIdx);
      }
    }
  }

  function handlePause() {
    audioRef.current?.pause();
    setPlaybackStatus("paused");
  }

  function handleStop() {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    setPlaybackStatus("idle");
    setPlaybackError(undefined);
    setAudioTime(0);
  }

  function handleNext() {
    // Continuation runs on the PLAYING playlist (0622A), not the editor selection.
    const ps = playingSlotsRef.current;
    const next = getNextPlayableSlot({ slots: ps, currentSlotIndex: currentSlotIdxRef.current ?? -1 });
    if (next) playSlotDirect(next.slotIndex, ps, libraryTracksRef.current);
  }

  function handlePrevious() {
    const ps = playingSlotsRef.current;
    const prev = getPreviousPlayableSlot({ slots: ps, currentSlotIndex: currentSlotIdxRef.current ?? ps.length });
    if (prev) playSlotDirect(prev.slotIndex, ps, libraryTracksRef.current);
  }

  function handleSeek(time: number) {
    if (audioRef.current) audioRef.current.currentTime = time;
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const tbm = new Map(libraryTracks.map((t) => [t.trackId, t]));
  const lockedTrackIds = new Set(locks.map((l) => l.trackId));

  const placed = slots.filter((s) => s.assignedTrackId).length;
  const assignedSlotsDur = slots.filter((s) => s.assignedTrackId);
  const totalDurationSeconds = assignedSlotsDur.reduce(
    (sum, s) => sum + (tbm.get(s.assignedTrackId!)?.durationSeconds ?? 0), 0,
  );

  // Playback context (0622A) — derived from the PLAYING playlist, not the editor.
  const playingPlaylist = playingPlaylistId
    ? playlists.find((p) => p.playlistId === playingPlaylistId)
    : undefined;
  const playingSlots = playingPlaylist?.slots ?? [];
  const currentTrack = currentSlotIdx !== null
    ? tbm.get(playingSlots[currentSlotIdx]?.assignedTrackId ?? "")
    : (auditionTrackId ? tbm.get(auditionTrackId) : undefined);
  // The editor only highlights the playing slot when it is editing the playing playlist.
  const isEditingPlayingPlaylist = playingPlaylistId != null && playingPlaylistId === activePlaylistId;
  const editorNowPlayingSlotIdx = isEditingPlayingPlaylist ? currentSlotIdx : null;
  // HUD/transport reflect the playing playlist; fall back to editor when idle.
  const hudPlaylist = playingPlaylist ?? activePlaylist;

  const playProject: PlayProject = makeProj(playlists, libraryTracks, excludedTrackIds, activePlaylistId);
  const isProjectDirty = exportedProjectHash !== null && stableProjectHash(playProject) !== exportedProjectHash;

  // ── Broadcast HUD secondary-layer queue + operator handlers ────────────────
  // HUD reflects the PLAYING playlist when playing (0622A), else the editor view.
  const hudQueue = hudPlaylist
    ? buildNowNextQueueState({
        playlist: hudPlaylist,
        tracksById: tbm,
        currentSlotIndex: currentSlotIdx,
        playbackIssues: trackPlaybackIssues,
        autoplayEnabled: autoplayNext,
        maxUpNextItems: 4,
      })
    : null;

  function activateHudMode(mode: BroadcastSecondaryMode) {
    hudModeKeyRef.current += 1;
    setHudModeKey(String(hudModeKeyRef.current));
    setHudSecondaryMode(mode);
  }

  function cycleHudSecondaryMode() {
    const idx = SECONDARY_CYCLE.indexOf(hudSecondaryMode);
    let next = SECONDARY_CYCLE[(idx + 1) % SECONDARY_CYCLE.length];
    // Skip next_up if nothing is queued.
    if (next === "next_up" && !hudQueue?.next) {
      next = SECONDARY_CYCLE[(SECONDARY_CYCLE.indexOf(next) + 1) % SECONDARY_CYCLE.length];
    }
    activateHudMode(next);
  }

  const hudTimerDurationMs = hudSecondaryMode !== "none"
    ? DEFAULT_SECONDARY_TIMING_MS[hudSecondaryMode]
    : 0;

  // Scheduler (0621G) + live clock (0621I): all schedule-aware surfaces resolve
  // from the single shared `scheduleNow`, which ticks every 30s.
  const renderNowIso = scheduleNow.toISOString();
  const resolvedSchedule = resolveSchedule({ schedule, nowIso: renderNowIso });
  const scheduledLater = resolvedSchedule.later;
  // Smart Grid (0621H): schedule-aware composition for the grid overlay.
  const gridComposition = resolveSmartGridComposition({ resolvedSchedule });

  // Page-level context menu items for TopBar ···
  const pageMenuItems: PageMenuItem[] = (() => {
    if (viewMode === "library" && sourceOwnerFilter && sourceOwnerFilter !== "unknown") {
      const owner = sourceOwnerFilter;
      const items: PageMenuItem[] = [];
      items.push({ label: "Import CSV…", action: () => csvImportRefs.current[owner]?.click() });
      items.push({ label: "Re-link Audio Folder…", action: () => audioRescanRefs.current[owner]?.click() });
      if (owner === "studiorich") {
        items.push({ label: "", action: () => {}, sep: true });
        items.push({
          label: "Analyze Mechanical Moods",
          action: () => handleAnalyzeSource(owner),
          disabled: analyzerJobs.size > 0,
        });
      }
      if (owner === "reference") {
        items.push({ label: "", action: () => {}, sep: true });
        items.push({ label: "New Sampler Bank", action: handleCreateSamplerBank });
      }
      return items;
    }
    if (viewMode === "playlists_grid") {
      return [
        { label: "New Playlist", action: handleCreatePlaylist },
      ];
    }
    if (viewMode === "sampler_banks_grid") {
      return [
        { label: "New Sampler Bank", action: handleCreateSamplerBank },
      ];
    }
    return [];
  })();

  return (
    <div className="app">
      {notify && <div className="app-notify">{notify}</div>}
      {showNewPlaylistDialog && (
        <NewPlaylistDialog
          defaultTitle={newPlaylistDefaultTitle}
          onConfirm={handleNewPlaylistDialogConfirm}
          onCancel={() => setShowNewPlaylistDialog(false)}
        />
      )}
      {showPlaylistBuilder && (
        <PlaylistBuilderPanel
          libraryTracks={libraryTracks}
          defaultSourceOwner={builderDefaultOwner}
          onConfirm={handlePlaylistBuilderConfirm}
          onCancel={() => setShowPlaylistBuilder(false)}
        />
      )}

      {/* Row 1 — Global nav */}
      <TopBar
        onTracksImported={handleTracksImported}
        onProjectLoaded={handleImportProject}
        onExportProject={handleExportProject}
        workspaceMode={workspaceMode}
        onWorkspaceModeChange={setWorkspaceMode}
        lastExportedAt={lastExportedAt}
        isProjectDirty={isProjectDirty}
        rightSlot={
          workspaceMode === "broadcast_hud" && activePlaylist ? (
            <HudOperatorControls
              secondaryMode={hudSecondaryMode}
              pinned={hudPinned}
              gridVisible={hudGridVisible}
              playbackStatus={playbackStatus}
              accent={activePlaylist.accentColor ?? "var(--accent)"}
              onCycleSecondary={cycleHudSecondaryMode}
              onTogglePin={() => setHudPinned((v) => !v)}
              onToggleGrid={() => setHudGridVisible((v) => !v)}
            />
          ) : undefined
        }
        pageMenuItems={pageMenuItems}
      />

      {/* Broadcast HUD Mode */}
      {workspaceMode === "broadcast_hud" && hudPlaylist && (
        <BroadcastHudShell
          playlist={hudPlaylist}
          allPlaylists={playlists}
          slots={slots}
          locks={locks}
          tracksById={tbm}
          libraryTracks={libraryTracks}
          currentSlotIdx={currentSlotIdx}
          hoveredSlotIndex={hoveredSlotIndex}
          playbackStatus={playbackStatus}
          currentTrack={currentTrack}
          autoplayNext={autoplayNext}
          currentTimeSeconds={audioTime}
          durationSeconds={audioDuration}
          trackPlaybackIssues={trackPlaybackIssues}
          errorMessage={playbackError}
          onPlay={handlePlay}
          onPause={handlePause}
          onStop={handleStop}
          onNext={handleNext}
          onPrevious={handlePrevious}
          onSeek={handleSeek}
          onNodeHoverChange={setHoveredSlotIndex}
          onExitHud={() => setWorkspaceMode("flow_curve")}
          secondaryMode={hudSecondaryMode}
          secondaryModeKey={hudModeKey}
          secondaryTimerDurationMs={hudTimerDurationMs}
          gridVisible={hudGridVisible}
          queue={hudQueue}
          scheduleLater={scheduledLater}
          gridComposition={gridComposition}
          resolvedSchedule={resolvedSchedule}
        />
      )}

      {/* Scheduler / TV Guide Mode */}
      {workspaceMode === "scheduler" && (
        <SchedulerGuideView
          schedule={schedule}
          playlists={playlists}
          nowIso={renderNowIso}
          broadcastEvents={broadcastEvents}
          onAddBlock={handleAddScheduleBlock}
          onRemoveBlock={handleRemoveScheduleBlock}
          onMoveBlock={handleMoveScheduleBlock}
          onAddEvent={handleAddBroadcastEvent}
          onSelectPlaylist={setActivePlaylistId}
        />
      )}

      {/* Rows 2+3 — Two-column layout: left nav + right workspace (flow_curve only) */}
      {workspaceMode === "flow_curve" && <div className="workspace">
        {/* Left column — persistent Music Library navigation */}
        <FileManager
          playlists={playlists}
          activePlaylistId={activePlaylistId}
          libraryTracks={libraryTracks}
          orphanCount={orphans.length}
          excludedCount={excludedTrackIds.size}
          lockedCount={locks.length}
          viewMode={viewMode}
          sourceOwnerFilter={sourceOwnerFilter}
          onSelectPlaylist={handleSelectPlaylist}
          onViewModeChange={setViewMode}
          onSourceOwnerFilterChange={setSourceOwnerFilter}
          onCreatePlaylist={handleCreatePlaylist}
          onDuplicatePlaylist={handleDuplicatePlaylist}
          onDeletePlaylist={handleDeletePlaylist}
          onDropTracksOnPlaylist={handleDropTracksOnPlaylist}
          sourcePools={sourcePools}
          onCreateSourcePoolFromPlaylist={() => handleCreateSourcePoolFromPlaylist(activePlaylistId)}
          onPlayOnDeckA={(id) => { handleSelectPlaylist(id); }}
          onPlayOnDeckB={handleLoadSampler}
          onCreateSamplerBank={handleCreateSamplerBank}
        />

        {/* Right column — playlist header, flow curve, and all workspace content */}
        <div className="workspace-right">
          {viewMode === "playlist" && activePlaylist && activePlaylist.playlistKind !== "reference_overlay" && (
            <PlaylistHeader
              playlist={activePlaylist}
              libraryTracks={libraryTracks}
              totalTrackCount={placed}
              totalDurationSeconds={totalDurationSeconds}
              flash={flash}
              onTitleChange={handlePlaylistTitleChange}
              onDescriptionChange={handlePlaylistDescriptionChange}
              onTargetDurationChange={handleTargetDurationChange}
              onPresetChange={handlePresetChange}
              onFillMissingTime={handleFillMissingTime}
              onRegenerateFromCurve={handleRegenerateFromCurve}
              onExportM3u={handleExportM3u}
              onCoverImageChange={handlePlaylistCoverImageChange}
              onBackgroundImageChange={handlePlaylistBackgroundImageChange}
              onAccentColorChange={handlePlaylistAccentColorChange}
              onMoodTagsChange={handlePlaylistMoodTagsChange}
              onBroadcastIdentityChange={handlePlaylistBroadcastIdentityChange}
              onColorThemesChange={handlePlaylistColorThemesChange}
              sourcePools={sourcePools}
              onCreateSourcePool={() => handleCreateSourcePoolFromPlaylist(activePlaylist.playlistId)}
              onSetPlaylistRole={(role) => handleSetPlaylistRole(activePlaylist.playlistId, role)}
              onSetSourcePoolId={(id) => handleSetPlaylistSourcePool(activePlaylist.playlistId, id)}
              onSetTargetTrackCount={(n) => handleSetPlaylistTargetTrackCount(activePlaylist.playlistId, n)}
              onSetRegenerationMode={(m) => handleSetPlaylistRegenerationMode(activePlaylist.playlistId, m)}
              onSetTemplateSourceFilters={(f) => handleSetTemplateSourceFilters(activePlaylist.playlistId, f)}
              onCreateFromTemplate={() => handleCreatePlaylistFromTemplate(activePlaylist.playlistId)}
              onSourcePolicyChange={(p) => handleSetSourcePolicy(activePlaylist.playlistId, p)}
              onAllowedSourceOwnersChange={(o) => handleSetAllowedSourceOwners(activePlaylist.playlistId, o)}
              onAddMusic={() => setShowAddMusic(true)}
            >
              <FlowCurveCanvas
                curve={activePlaylist.curve}
                slots={slots}
                tracksById={tbm}
                locks={locks}
                onCurveChange={handleCurveChange}
                nowPlayingSlotIndex={editorNowPlayingSlotIdx}
                hoveredSlotIndex={hoveredSlotIndex}
                onNodeHoverChange={setHoveredSlotIndex}
              />
            </PlaylistHeader>
          )}
          <div className="workspace-main">
          {showAddMusic && activePlaylist && activePlaylist.playlistKind !== "reference_overlay" && (
            <AddMusicPanel
              playlist={activePlaylist}
              libraryTracks={libraryTracks}
              tracksById={tbm}
              onAdd={handleAddMusicTracks}
              onReplace={handleReplacePlaylistWithTracks}
              onClose={() => setShowAddMusic(false)}
            />
          )}
          {/* Hidden audio rescan folder inputs — triggered from page ⋯ menu */}
          {(["studiorich", "external", "reference"] as TrackSourceOwner[]).map((owner) => (
            <input
              key={`rescan-${owner}`}
              type="file"
              // @ts-expect-error webkitdirectory not in React types
              webkitdirectory=""
              multiple
              style={{ display: "none" }}
              ref={(el) => { audioRescanRefs.current[owner] = el; }}
              onChange={(e) => {
                if (e.target.files?.length) handleRescanAudioFolder(owner, e.target.files);
                e.target.value = "";
              }}
            />
          ))}
          {/* Hidden CSV import inputs per source — triggered from page ⋯ menu */}
          {(["studiorich", "external", "reference"] as TrackSourceOwner[]).map((owner) => (
            <input
              key={`csv-${owner}`}
              type="file"
              accept=".csv"
              style={{ display: "none" }}
              ref={(el) => { csvImportRefs.current[owner] = el; }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportCsvToSource(owner, file);
                e.target.value = "";
              }}
            />
          ))}

          {/* Library page header — visible when a library source is active */}
          {viewMode === "library" && sourceOwnerFilter && sourceOwnerFilter !== "unknown" && (() => {
            const owner = sourceOwnerFilter;
            const labels: Record<string, string> = { studiorich: "Catalog", external: "External", reference: "Reference" };
            const unitLabel = owner === "reference" ? "clips" : "tracks";
            const sourceTracks = libraryTracks.filter((t) => t.sourceOwner === owner);
            const count = sourceTracks.length;
            const isUpdating = libraryUpdating === owner;
            return (
              <div className="lib-page-header">
                <span className="lib-page-title">{labels[owner] ?? owner}</span>
                <span className="lib-page-count">{count} {unitLabel}</span>
                <button
                  className="lib-update-btn"
                  disabled={!!libraryUpdating}
                  onClick={() => handleUpdateLibrary(owner)}
                >
                  {isUpdating ? "Updating…" : "Update Library"}
                </button>
              </div>
            );
          })()}

          {viewMode === "playlists_grid" ? (
            <PlaylistsGrid
              playlists={playlists.filter((pl) => pl.playlistKind !== "reference_overlay")}
              libraryTracks={libraryTracks}
              activePlaylistId={activePlaylistId}
              onOpen={(id) => { setActivePlaylistId(id); setViewMode("playlist"); }}
              onPlay={(id) => handleSelectPlaylist(id)}
              onDuplicate={handleDuplicatePlaylist}
              onDelete={handleDeletePlaylist}
              onCreate={handleCreatePlaylist}
            />
          ) : viewMode === "sampler_banks_grid" ? (
            <SamplerBanksGrid
              banks={playlists.filter((pl) => pl.playlistKind === "reference_overlay")}
              loadedBankId={samplerBank?.playlistId ?? null}
              onOpen={(id) => { setActivePlaylistId(id); setViewMode("playlist"); }}
              onLoadInSampler={handleLoadSampler}
              onDuplicate={handleDuplicatePlaylist}
              onDelete={handleDeletePlaylist}
              onCreate={handleCreateSamplerBank}
              onRename={handleRenameBank}
            />
          ) : viewMode === "playlist" && activePlaylist?.playlistKind === "reference_overlay" ? (
            <SamplerBankView
              bank={activePlaylist}
              libraryTracks={libraryTracks}
              onLoadInSampler={handleLoadSampler}
              onAddReferenceTracksToBank={handleAddTracksToSamplerBank}
              referenceTrackCount={libraryTracks.filter((t) => t.sourceOwner === "reference").length}
            />
          ) : (
          <MainTrackWindow
            mode={viewMode}
            tracks={libraryTracks}
            slots={slots}
            orphans={orphans}
            locks={locks}
            excludedTrackIds={excludedTrackIds}
            lockedTrackIds={lockedTrackIds}
            tracksById={tbm}
            nowPlayingSlotIndex={editorNowPlayingSlotIdx}
            hoveredSlotIndex={hoveredSlotIndex}
            selectedSlotIndex={selectedSlotIdx}
            playbackErrors={playbackErrors}
            onToggleLock={handleToggleLock}
            onExclude={handleExclude}
            onRestore={handleRestore}
            onRemove={handleRemove}
            onRestoreOrphan={handleRestoreOrphan}
            onLockChange={handleLockChange}
            onPlayFromSlot={handlePlayFromSlot}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onRowHoverChange={setHoveredSlotIndex}
            onRateTrack={handleRateTrack}
            onSelectSlot={setSelectedSlotIdx}
            onRemoveFromPlaylist={handleRemoveFromPlaylist}
            onRemoveFromPlaylistLeaveGap={handleRemoveFromPlaylistLeaveGap}
            onReorderSlot={handleReorderSlot}
            onAddToPlaylistEnd={handleAddToPlaylistEnd}
            onInsertAfterSlot={handleInsertAfterSlot}
            onReplaceSlot={handleReplaceSlot}
            onFindBestSlot={handleFindBestSlot}
            onRemoveRepeats={handleRemoveRepeats}
            exportReport={exportReport}
            onRunExportHealth={handleRunExportHealth}
            manualOrderDirty={activePlaylist?.manualOrderDirty ?? false}
            activePlaylistId={activePlaylistId}
            onFillGap={handleFillGap}
            onDeleteGap={handleDeleteGap}
            onClearPlaybackIssue={handleClearPlaybackIssue}
            onBulkUpdate={handleBulkUpdateTracks}
            onCreateLibraryGroup={handleCreateLibraryGroupFromSelection}
            onGenerateMoodSuggestions={handleGenerateMoodSuggestionsForTracks}
            onApplyMoodSuggestions={handleApplyMoodSuggestionsToTracks}
            onRestoreSuggestionsFromImport={handleRestoreSuggestionsFromImport}
            onRestoreSuggestionsFromMechanical={handleRestoreSuggestionsFromMechanical}
            onClearSuggestedMoods={handleClearSuggestedMoods}
            onAuditionTrack={handleAuditionTrack}
            onAuditionAndAdd={handleAuditionAndAdd}
            auditionTrackId={auditionTrackId}
            onBulkSetArchiveStatus={handleBulkSetArchiveStatus}
            onAnalyzeTrack={handleAnalyzeTrack}
            onAnalyzeSelected={handleAnalyzeSelected}
            onAnalyzeLibrary={handleAnalyzeLibrary}
            onReanalyze={handleReanalyze}
            analyzerJobs={analyzerJobs}
            sourcePools={sourcePools}
            onRenameSourcePool={handleRenameSourcePool}
            onRemoveSourcePool={handleRemoveSourcePool}
            onCleanEmptyGroups={handleCleanEmptyGroups}
            sourceOwnerFilter={sourceOwnerFilter}
            samplerBanks={playlists.filter((pl) => pl.playlistKind === "reference_overlay")}
            loadedSamplerBankId={samplerBank?.playlistId ?? null}
            onAddTracksToSamplerBank={handleAddTracksToSamplerBank}
            onCreateSamplerBankFromTracks={handleCreateSamplerBankFromTracks}
            onDeleteFromReference={handleDeleteFromReference}
            musicPlaylists={playlists.filter((pl) => !pl.playlistKind || pl.playlistKind !== "reference_overlay")}
            onBulkAddTracksToPlaylist={handleBulkAddTracksToPlaylist}
            onBulkCreatePlaylistFromTracks={handleBulkCreatePlaylistFromTracks}
          />
          )}
        </div>
        </div>{/* end workspace-right */}
      </div>}

      {/* Player + Sampler — always mounted so audio survives workspace navigation.
          Hidden (not unmounted) in broadcast_hud so audio keeps playing. */}
      <div className={`player-sampler-bar${workspaceMode === "broadcast_hud" ? " player-sampler-bar--hidden" : ""}`}>
        <div className="music-player-panel">
          <div className="player-panel-label player-panel-label--ctx">
            <span className="player-context-type">MUSIC</span>
            {hudPlaylist && (
              <SourceCompositionBadges
                composition={getSourceComposition(hudPlaylist.slots.map((s) => s.assignedTrackId), libraryTracks)}
                className="player-source-badge"
              />
            )}
            {hudPlaylist && <span className="player-context-name">{hudPlaylist.title}</span>}
          </div>
          <PlaybackTransport
            status={playbackStatus}
            currentSlotIndex={currentSlotIdx}
            currentTrack={currentTrack}
            errorMessage={playbackError}
            totalSlots={playingPlaylist ? playingSlots.length : slots.length}
            currentTimeSeconds={audioTime}
            durationSeconds={audioDuration}
            volume={musicVolume}
            onPlay={handlePlay}
            onPause={handlePause}
            onStop={handleStop}
            onNext={handleNext}
            onPrevious={handlePrevious}
            onPlayFromSlot={handlePlayFromSlot}
            onSeek={handleSeek}
            onVolumeChange={setMusicVolume}
            onRateTrack={handleRateTrack}
          />
        </div>
        <div className={`sampler-panel${samplerBank && !samplerVisible ? " sampler-panel--collapsed" : ""}`}>
          {(!samplerBank || samplerVisible) && (
            <div className="player-panel-label">Sampler</div>
          )}
          {samplerBank ? (
            <SamplerPlayer
              bank={samplerBank}
              libraryTracks={libraryTracks}
              collapsed={!samplerVisible}
              onCollapse={() => setSamplerVisible(false)}
              onExpand={() => setSamplerVisible(true)}
              onClear={() => { setSamplerBank(null); setSamplerVisible(false); }}
            />
          ) : (
            <div className="sampler-empty">No bank loaded — right-click a Sampler Bank and choose "Load in Sampler"</div>
          )}
        </div>
      </div>

      {/* Export report modal */}
      {exportReport && (
        <div className="export-modal-overlay" onClick={() => setExportReport(null)}>
          <div className="export-modal" onClick={(e) => e.stopPropagation()}>
            <div className="export-modal-header">
              <span>M3U Export Report</span>
              <button className="export-modal-close" onClick={() => setExportReport(null)}>✕</button>
            </div>
            <div className="export-modal-summary">
              <span className="em-stat">{exportReport.exportableCount} exported</span>
              <span className="em-sep">·</span>
              <span className={`em-stat${exportReport.skippedCount > 0 ? " em-warn" : ""}`}>
                {exportReport.skippedCount} skipped
              </span>
              <span className="em-sep">·</span>
              <span className={`em-stat${exportReport.problemCount - exportReport.skippedCount > 0 ? " em-caution" : ""}`}>
                {exportReport.problemCount - exportReport.skippedCount} warnings
              </span>
            </div>
            <textarea className="export-modal-text" readOnly value={exportReportText} />
            <div className="export-modal-footer">
              <button className="tb-btn" onClick={() => navigator.clipboard.writeText(exportReportText)}>Copy</button>
              <button className="tb-btn" onClick={() => downloadFile(`export_report.txt`, exportReportText, "text/plain")}>
                Download .txt
              </button>
              <button className="tb-btn" onClick={() => setExportReport(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
