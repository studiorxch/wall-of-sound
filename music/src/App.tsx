import { useState, useEffect, useRef, useMemo } from "react";
import type { Track, TrackSourceOwner } from "./data/trackTypes";
import { parseCsvTracks } from "./data/importCsv";
import type { LibraryScanReport } from "./data/librarySourceTypes";
import { LIBRARY_PATHS } from "./data/librarySourceTypes";
import { upsertTracks } from "./logic/trackUpsertKey";
import { linkAudioFiles } from "./logic/audioFolderLinker";
import type { AudioLinkReport } from "./logic/audioFolderLinker";
import { PlaylistBuilderPanel } from "./ui/PlaylistBuilderPanel";
import type { PlaylistBuilderResult } from "./ui/PlaylistBuilderPanel";
import { buildArcPlaylist, buildSlotsFromArcResult, describeArcConfigWarnings } from "./logic/playlistArcBuilder";
import type { PlaylistArcConfig } from "./data/playlistArcTypes";
import { NewPlaylistWizard } from "./ui/NewPlaylistWizard";
import type { NewPlaylistWizardResult } from "./ui/NewPlaylistWizard";
import { suggestMoodsFromAnalysis } from "./logic/moodSuggestions";
import { analyzeMechanicalMoods } from "./logic/mechanicalMoodAnalyzer";
import type { AnalyzerJobStatus } from "./data/trackTypes";
import type { CurvePresetType } from "./data/flowCurveTypes";
import type { TrackLock, TrackSlot } from "./data/playlistTypes";
import type { PlayProject, PlaylistRecord, PlaylistFillReport, TrackPlaybackIssue, PlaylistImage, PlaylistBroadcastIdentity } from "./data/playProjectTypes";
import type { PlaybackStatus } from "./data/playbackTypes";
import { generateFlowCurve } from "./logic/curvePresets";
import { assignPlaylistToCurve } from "./logic/playlistAssigner";
import { evaluateSlotWarnings } from "./logic/warningEngine";
import { savePlayProject, loadPlayProject, loadPlayProjectAsync, repairStoredProject } from "./data/playProjectStorage";
import { downloadPlayProjectExport, stableProjectHash } from "./data/playProjectExport";
import { installMusicDebug } from "./logic/musicAutosave";
import {
  assessStartupRecovery,
  loadLkgState,
  loadCheckpointState,
  downloadStateAsJson,
  type StartupRecoveryAssessment,
} from "./logic/musicStartupRecovery";
import { saveAcceptedLibraryState } from "./logic/musicLibraryAcceptance";
import { loadStateRecord, listCheckpointSummaries, type StateRecordSummary } from "./logic/musicStateStore";
import { summarizeMusicState, type MusicStateSummary } from "./logic/musicStateSummary";
import { StartupRecoveryPrompt } from "./ui/StartupRecoveryPrompt";
import { DataManagementPanel } from "./ui/DataManagementPanel";
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
import { CrateMetadataPanel } from "./ui/CrateMetadataPanel";
import type { MetadataUpdate } from "./logic/metadataCsvImport";
import { applyImportPreview } from "./logic/metadataCsvImport";
import type { MetadataImportPreview, MetadataImportRecord } from "./data/metadataSourceTypes";
import {
  computeCratePoolMetadataRevision,
  buildPlaylistGenerationMetadataSnapshot,
} from "./logic/metadataRevision";
import type { PlaylistMetadataRepairImpact } from "./data/playlistPathTypes";
import { LibraryHealthPanel } from "./ui/LibraryHealthPanel";
import { TopBar } from "./ui/TopBar";
import { SamplerPlayer } from "./ui/SamplerPlayer";
import { SamplerBankView } from "./ui/SamplerBankView";
import { PlaylistsGrid } from "./ui/PlaylistsGrid";
import { SamplerBanksGrid } from "./ui/SamplerBanksGrid";
import { FileManager, type ViewMode } from "./ui/FileManager";
import { ArtistLibraryPanel } from "./ui/ArtistLibraryPanel";
import { PlaylistHeader } from "./ui/PlaylistHeader";
import { MainTrackWindow } from "./ui/MainTrackWindow";
import { PlaylistLowerPanel } from "./ui/PlaylistLowerPanel";
import { PlaylistDeck } from "./ui/PlaylistDeck";
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
import { partitionEligibleTracks, describeSkipReport, getTrackEligibility, isTrackPlaybackEligible, gatePlaylistCandidates, describeInsufficientCandidates, finalizeGeneratedPlaylistSlots, type CandidateGateResult } from "./logic/trackEligibility";
import { excludePendingImports, isPendingImportAnalysis } from "./logic/audioReadiness";
import { filterTracksByRecipe } from "./logic/recipeFilter";
import { resolveCratePool, resolveCrateTracks } from "./logic/resolveCrate";
import { generateMissingAutoMoodCrates, auditAutoMoodCrates, auditMoodCrateCounts, regenerateMoodCratesFromCurrentTags, type MoodCrateCountMode, type MoodCrateSourceScope } from "./logic/autoMoodCrates";
import { pickAudioFiles, importAudioFiles, auditAudioAnalysis, reanalyzeTrack, reanalyzeMissing } from "./logic/audioImport";
import { matchStemRoleFromFileName, buildNewStemTracks, type StemImportEntry, type StemRole } from "./logic/loops/stemRegistration";
import { buildIntakeItem, isSupportedAudioExtension } from "./logic/importIntake";
import type { MusicImportIntakeItem } from "./data/importTypes";
import { ImportIntakePanel } from "./ui/ImportIntakePanel";
import { ImportAudioModal } from "./ui/ImportAudioModal";
import { installMoodAnalyzerDebug } from "./logic/MoodAnalyzer";
import { trackToAudioFeatures, auditTrackAnalysisFields } from "./logic/audioFeatureAdapter";
import { analyzeTrackMood, analyzeAllMissingMoods } from "./logic/trackMoodAnalysis";
import { extractDspFeatures, analyzeTrackDspFeatures, analyzeMissingDspFeatures, auditDspAudioSources, requiresCanonicalAnalysis, type AnalyzeMissingDspDebugArg } from "./logic/dspFeatureExtraction";
import { reanalyzeEntirePlaylist } from "./logic/playlistRepair/reanalyzePlaylist";
import { buildDiagnostic, diagnoseFixture, summarizeCalibration, buildCalibrationReportMarkdown } from "./logic/beatMap/calibration/calibrationReport";
import { buildSyntheticFixtures } from "./logic/beatMap/calibration/calibrationFixtures";
import { generatePlaylistPathOptions } from "./logic/pathOptionGenerator";
import type { CrateRecord } from "./data/crateTypes";
import type { LoopAsset, AudioExperimentRecord, DraftLoopSelection, LoopRevision, LoopBinViewState } from "./data/loopTypes";
import type { LoopRenderRecord, LoopRenderSettings } from "./data/loopRenderTypes";
import { defaultRenderSettings } from "./data/loopRenderTypes";
import { renderLoopToWav, downloadWavBuffer, verifyRenderedAudioIntegrity } from "./logic/loops/loopRenderService";
import { resolveActiveLoopBoundsFrames } from "./logic/loops/loopRevisions";
import type { RadioPromotionFormInput } from "./data/radioLoopTypes";
import { promoteLoopToRadio, type PromoteLoopToRadioResult, type RadioPromotionPhase } from "./logic/radio/radioPromotionOrchestrator";
import { useRadioLoopAudition } from "./logic/radio/radioLoopAudition";
// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation
import type { RadioAssetKind, RadioInboxItem } from "./data/radioInboxTypes";
import type { RadioPlaylist } from "./data/radioPlaylistTypes";
import { resolveOrCreateInboxItem, type RadioInboxSourceRef } from "./logic/radio/radioInboxResolver";
import { sendPlaylistToRadio } from "./logic/radio/musicToRadioPlaylistSync";
import { compareMusicPlaylistToRadioPlaylist, type RadioPlaylistUpdateDiff } from "./logic/radio/radioPlaylistUpdateComparison";
import { computeSourceFingerprint } from "./logic/playbackBounds/computeTrackPlaybackBounds";
// 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows
import type { RadioBank } from "./data/radioBankTypes";
import type { RadioDashboardReceipt } from "./data/radioDashboardReceiptTypes";
import { sendBankToRadio } from "./logic/radio/musicToRadioBankSync";
import { compareMusicBankToRadioBank, type RadioBankUpdateDiff } from "./logic/radio/radioBankUpdateComparison";
import { addAssetReceipt, addOrReactivateReceipt, dismissReceipt, migrateLegacyInboxItemsToReceipts } from "./logic/radio/radioDashboardReceipts";
import { RadioDashboardView } from "./ui/radio/RadioDashboardView";
// 0718B_RADIO_Web_Publication_Asset_Export_Bridge
import type { RadioWebExportRecord } from "./data/radioWebBundleTypes";
import type { LoopchainDraft, RadioLoopchainSectionAcceptance, LoopchainObservation } from "./data/radioLoopchainTypes";
import { RadioPlaylistsView } from "./ui/radio/RadioPlaylistsView";
import { RadioLoopchainPlayer } from "./ui/radio/RadioLoopchainPlayer";
import { RadioBanksView } from "./ui/radio/RadioBanksView";
import { type RadioLooperSharedProps } from "./ui/radio/RadioMultiTrackPrepWorkspace";
import { RadioPlaylistUpdateCompareDialog } from "./ui/radio/RadioPlaylistUpdateCompareDialog";
import { CollectionsOverview } from "./ui/CollectionsOverview";
import type { CompleteSongAnalysis } from "./data/songAnalysisTypes";
import { createSongAnalysisOrchestrator } from "./logic/songAnalysis/songAnalysisOrchestrator";
import type { ChunkedDspProgress } from "./logic/dspFeatureExtraction";
import { defaultCrateFilters } from "./data/crateTypes";
import { CratesGrid } from "./ui/CratesGrid";
import { CrateDetail } from "./ui/CrateDetail";
import { SectionalLooperWorkspace } from "./ui/SectionalLooperWorkspace";
import { LoopLibraryView } from "./ui/LoopLibraryView";
import { MoodSignalAuditView } from "./ui/MoodSignalAuditView";
import { MoodAnalysisReviewView } from "./ui/MoodAnalysisReviewView";
import { auditMoodSignals } from "./logic/moodSignalAudit";
import { buildMoodAnalysisReviewRow, getMoodAnalysisReviewRows, getMoodCalibrationSummary, snapshotMoodCalibration, compareMoodCalibrationSnapshots } from "./logic/moodAnalysisReview";
import { SchedulerGuideView } from "./ui/SchedulerGuideView";
import type { ScheduleState, ScheduleBlock, ScheduleBlockRole, ScheduleDisplayMode } from "./data/scheduleTypes";
import type { BroadcastEvent } from "./data/eventTypes";
import type { MusicSourcePool } from "./data/sourcePoolTypes";
import { resolveSchedule, createScheduleBlockFromPlaylist } from "./logic/scheduleResolver";
import { resolveSmartGridComposition } from "./logic/smartGridResolver";
import { computeOpenIssueCount } from "./logic/libraryHealth";
import type { WorkspaceMode, ImportDestination, PageMenuItem } from "./ui/TopBar";
import { PlaylistAtmosphereLayer } from "./ui/PlaylistAtmosphereLayer";
import { usePreparedPlaybackController } from "./audio/usePreparedPlaybackController";
import { PreparedPlaybackStatus } from "./ui/player/PreparedPlaybackStatus";
import { findOutgoingPlan } from "./audio/preparedPlaybackSession";
import { useLoopAuditionController } from "./audio/useLoopAuditionController";
import { LoopAuditionBar } from "./ui/player/LoopAuditionBar";
import { buildSurfaceSnapshot } from "./audio/playbackAuthority";
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
  return { scheduleId: genId("sched"), title: "MUSIC Schedule", blocks: [], createdAt: ts, updatedAt: ts };
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

function getTrackPlayUrl(track: { objectUrl?: string; filePath?: string; audioRelPath?: string }): string | null {
  // Prefer portable audioRelPath via /music-audio/ route
  if (track.audioRelPath) return `/music-audio/${track.audioRelPath}`;
  // Blob URL from file-picker import (session-only)
  if (track.objectUrl) return track.objectUrl;
  // Legacy absolute-path proxy
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
  // 0716A_MUSIC_Direct_Manipulation_Looper_And_Playhead — the global
  // Spacebar handler below is mounted once ([] deps); this ref lets it read
  // the CURRENT viewMode without resubscribing, so it can defer to the
  // Sectional Looper's own Spacebar Play/Pause handling while that view is
  // open (both bind document-level "keydown", and same-node listeners
  // registered earlier always fire regardless of the later one's
  // stopPropagation — the only way to prevent the double-toggle is this
  // guard on the earlier-registered listener itself).
  const viewModeRef = useRef(viewMode);
  useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);
  const [sourceOwnerFilter, setSourceOwnerFilter] = useState<import("./data/trackTypes").TrackSourceOwner | null>(null);
  const [showCoveragePanel, setShowCoveragePanel] = useState(false);
  const [externalRepairHistory, setExternalRepairHistory] = useState<import("./logic/externalIdentityRepair").ExternalIdentityRepairRecord[]>(
    () => (loadPlayProject() as any)?.externalIdentityRepairHistory ?? []
  );
  const [ignoredIssueIds, setIgnoredIssueIds] = useState<string[]>(
    () => (loadPlayProject() as any)?.ignoredIssueIds ?? []
  );
  const [deferredIssueIds, setDeferredIssueIds] = useState<string[]>(
    () => (loadPlayProject() as any)?.deferredIssueIds ?? []
  );
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
  // ── Crates (Phase 1) ─────────────────────────────────────────────────────
  const [crates, setCrates] = useState<CrateRecord[]>(() => loadPlayProject()?.crates ?? []);
  const cratesRef = useRef<CrateRecord[]>([]);
  const [activeCrateId, setActiveCrateId] = useState<string | null>(null);
  // ── Sectional Looper and Loop Library (0714_MUSIC_Sectional_Looper_And_Loop_Library) ──
  const [loops, setLoops] = useState<LoopAsset[]>(() => loadPlayProject()?.loops ?? []);
  const loopsRef = useRef<LoopAsset[]>([]);
  const [audioExperiments, setAudioExperiments] = useState<AudioExperimentRecord[]>(
    () => loadPlayProject()?.audioExperiments ?? [],
  );
  const audioExperimentsRef = useRef<AudioExperimentRecord[]>([]);
  const [looperSourceTrackId, setLooperSourceTrackId] = useState<string | null>(null);
  const [loopRenders, setLoopRenders] = useState<LoopRenderRecord[]>(() => loadPlayProject()?.loopRenders ?? []);
  const loopRendersRef = useRef<LoopRenderRecord[]>([]);
  // 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion — draft
  // selection persistence (§17), the revision model (§21), and Loop Bin
  // view state (§27), lifted to App-root state following the exact
  // loops/loopRenders ref+state pattern above.
  const [loopWorkspaceDrafts, setLoopWorkspaceDrafts] = useState<DraftLoopSelection[]>(
    () => loadPlayProject()?.loopWorkspaceDrafts ?? [],
  );
  const loopWorkspaceDraftsRef = useRef<DraftLoopSelection[]>([]);
  const [loopRevisions, setLoopRevisions] = useState<LoopRevision[]>(() => loadPlayProject()?.loopRevisions ?? []);
  const loopRevisionsRef = useRef<LoopRevision[]>([]);
  const [loopBinViewState, setLoopBinViewState] = useState<LoopBinViewState>(
    () => loadPlayProject()?.loopBinViewState ?? { tab: "approved", filters: {}, sort: "start_time", updatedAt: nowIso() },
  );
  const loopBinViewStateRef = useRef<LoopBinViewState>(loopBinViewState);
  // Carried through unchanged into every save — this marker only ever
  // advances inside migrateApprovedLoopsToRevisionsV1 at LOAD time, never
  // here, so a save must not silently reset it to undefined.
  const loopRevisionsMigrationVersionRef = useRef<number | undefined>(loadPlayProject()?.loopRevisionsMigrationVersion);
  // 0717C_MUSIC_Complete_Song_Intelligence_and_Section_Map — one
  // CompleteSongAnalysis per source track, project-level for the same
  // reason as loops/loopRevisions above.
  const [songAnalyses, setSongAnalyses] = useState<CompleteSongAnalysis[]>(() => loadPlayProject()?.songAnalyses ?? []);
  const songAnalysesRef = useRef<CompleteSongAnalysis[]>([]);
  // 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation — RADIO Inbox
  // items and RADIO Playlists, client-local, project-level for the same
  // reason as loops/songAnalyses above.
  const [radioInboxItems, setRadioInboxItems] = useState<RadioInboxItem[]>(() => loadPlayProject()?.radioInboxItems ?? []);
  const radioInboxItemsRef = useRef<RadioInboxItem[]>([]);
  const [radioPlaylists, setRadioPlaylists] = useState<RadioPlaylist[]>(() => loadPlayProject()?.radioPlaylists ?? []);
  const radioPlaylistsRef = useRef<RadioPlaylist[]>([]);
  // 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows — RADIO Banks and
  // the persisted dashboard receipt log, same project-level reason as
  // radioInboxItems/radioPlaylists above.
  const [radioBanks, setRadioBanks] = useState<RadioBank[]>(() => loadPlayProject()?.radioBanks ?? []);
  const radioBanksRef = useRef<RadioBank[]>([]);
  const [radioDashboardReceipts, setRadioDashboardReceipts] = useState<RadioDashboardReceipt[]>(() => loadPlayProject()?.radioDashboardReceipts ?? []);
  const radioDashboardReceiptsRef = useRef<RadioDashboardReceipt[]>([]);
  // 0718B_RADIO_Web_Publication_Asset_Export_Bridge — persisted export
  // history; only ever appended to by a validated Web Bundle export (see
  // radioWebBundleExportOrchestrator.ts's buildExportRecord).
  const [radioWebExports, setRadioWebExports] = useState<RadioWebExportRecord[]>(() => loadPlayProject()?.radioWebExports ?? []);
  const radioWebExportsRef = useRef<RadioWebExportRecord[]>([]);
  // 0721_MUSIC_RADIO_Sectional_Loopchain_Player — one working chain draft,
  // plus its region-bound loop acceptances and local observation log,
  // project-level for the same reason as songAnalyses/radioPlaylists above.
  const [loopchainDraft, setLoopchainDraft] = useState<LoopchainDraft | undefined>(() => loadPlayProject()?.loopchainDraft);
  const loopchainDraftRef = useRef<LoopchainDraft | undefined>(undefined);
  const [loopchainSectionAcceptances, setLoopchainSectionAcceptances] = useState<RadioLoopchainSectionAcceptance[]>(() => loadPlayProject()?.loopchainSectionAcceptances ?? []);
  const loopchainSectionAcceptancesRef = useRef<RadioLoopchainSectionAcceptance[]>([]);
  const [loopchainObservations, setLoopchainObservations] = useState<LoopchainObservation[]>(() => loadPlayProject()?.loopchainObservations ?? []);
  const loopchainObservationsRef = useRef<LoopchainObservation[]>([]);
  // Session-only — which real songs the player was opened with (from
  // RADIO Playlists' currently-bound source tracks); never persisted.
  const [loopchainCandidateSourceTrackIds, setLoopchainCandidateSourceTrackIds] = useState<string[]>([]);
  const decodedSourceBufferCacheRef = useRef<Map<string, AudioBuffer>>(new Map());
  const renderDecodeCtxRef = useRef<AudioContext | null>(null);
  // ── Playlist Local Repair — library gap register (0713_MUSIC_Playlist_Local_Repair_And_Gap_Analysis) ──
  const [libraryGaps, setLibraryGaps] = useState<import("./data/playlistRepairTypes").LibraryGapRecord[]>(
    () => loadPlayProject()?.libraryGaps ?? [],
  );
  const libraryGapsRef = useRef<import("./data/playlistRepairTypes").LibraryGapRecord[]>([]);
  const [reanalyzingPlaylistId, setReanalyzingPlaylistId] = useState<string | null>(null);
  const [reanalysisProgress, setReanalysisProgress] = useState<import("./data/playlistRepairTypes").PlaylistReanalysisProgress | null>(null);
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
  const [startupRecovery, setStartupRecovery] = useState<StartupRecoveryAssessment | null>(null);
  // Data Management → Backups & Recovery (0712_MUSIC_Recovery_Screen_Removal
  // §2.4) — user-initiated only, never an automatic startup modal.
  const [showDataManagement, setShowDataManagement] = useState(false);
  const [dataManagementLkgSummary, setDataManagementLkgSummary] = useState<MusicStateSummary | null>(null);
  const [dataManagementCheckpoints, setDataManagementCheckpoints] = useState<StateRecordSummary[]>([]);

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
  // Dual-Deck Playback (0714_MUSIC_Dual_Deck_Playback_And_Crossfade_Execution)
  // — off by default (§7: never silently switch all playback to prepared
  // mode). Standard single-track playback via audioRef is untouched.
  const [preparedPlaybackEnabled, setPreparedPlaybackEnabled] = useState(false);

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
  // hydrationReadyRef: guards index-wins saves from running before applyProject has synced refs.
  const hydrationReadyRef = useRef(false);
  const projectCreatedAtRef = useRef(projectCreatedAt);
  const notifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackPlaybackIssuesRef = useRef<Record<string, TrackPlaybackIssue>>({});
  const scheduleRef = useRef<ScheduleState>(schedule);
  // Playback context refs (0622A) — stable across editor selection changes.
  const playingPlaylistIdRef = useRef<string | null>(null);
  const playingSlotsRef = useRef<TrackSlot[]>([]);

  const builderRef = useRef<HTMLDivElement>(null);

  // Action refs for keyboard shortcuts (avoid stale closures)
  const playActionRef = useRef<() => void>(() => {});
  const pauseActionRef = useRef<() => void>(() => {});
  const stopActionRef = useRef<() => void>(() => {});
  const nextActionRef = useRef<() => void>(() => {});
  const prevActionRef = useRef<() => void>(() => {});
  const removeSelectedRef = useRef<() => void>(() => {});
  // §18/§19 — authority-aware, not just the standard player's playbackStatus.
  const transportIsPlayingRef = useRef(false);

  // ── Derived active playlist ──────────────────────────────────────────────
  const activePlaylist =
    playlists.find((p) => p.playlistId === activePlaylistId) ?? playlists[0];
  const slots = activePlaylist?.slots ?? [];
  const locks = activePlaylist?.locks ?? [];
  const orphans = activePlaylist?.orphans ?? [];

  // Blocked-track count for the active playlist (0709) — codec/unplayable/
  // missing-audio slots currently assigned. Drives the "Remove Blocked Tracks"
  // banner in PlaylistHeader.
  const blockedTrackCount = useMemo(() => {
    if (!activePlaylist) return 0;
    const tbm = new Map(libraryTracks.map((t) => [t.trackId, t]));
    let count = 0;
    for (const s of activePlaylist.slots) {
      const id = s.assignedTrackId;
      if (!id) continue;
      const track = tbm.get(id);
      if (!track) continue;
      if (!isTrackPlaybackEligible(track, { playbackIssues: trackPlaybackIssues })) count++;
    }
    return count;
  }, [activePlaylist, libraryTracks, trackPlaybackIssues]);

  // Resolved crate pool for the active playlist (empty when no crates attached)
  const cratePoolTracks = useMemo<import("./data/trackTypes").Track[]>(() => {
    const crateIds = activePlaylist?.crateIds;
    if (!crateIds || crateIds.length === 0) return [];
    const cratesMap = new Map(crates.map((c) => [c.id, c]));
    return resolveCratePool(crateIds, cratesMap, libraryTracks);
  }, [activePlaylist?.crateIds, crates, libraryTracks]);

  // Metadata revision for the active crate pool — used for stale detection (0705E)
  const currentMetadataRevision = useMemo(
    () => computeCratePoolMetadataRevision(cratePoolTracks),
    [cratePoolTracks],
  );

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
  useEffect(() => { cratesRef.current = crates; }, [crates]);
  useEffect(() => { loopsRef.current = loops; }, [loops]);
  useEffect(() => { audioExperimentsRef.current = audioExperiments; }, [audioExperiments]);
  useEffect(() => { loopRendersRef.current = loopRenders; }, [loopRenders]);
  useEffect(() => { loopWorkspaceDraftsRef.current = loopWorkspaceDrafts; }, [loopWorkspaceDrafts]);
  useEffect(() => { loopRevisionsRef.current = loopRevisions; }, [loopRevisions]);
  useEffect(() => { songAnalysesRef.current = songAnalyses; }, [songAnalyses]);
  useEffect(() => { radioInboxItemsRef.current = radioInboxItems; }, [radioInboxItems]);
  useEffect(() => { radioPlaylistsRef.current = radioPlaylists; }, [radioPlaylists]);
  useEffect(() => { radioBanksRef.current = radioBanks; }, [radioBanks]);
  useEffect(() => { radioWebExportsRef.current = radioWebExports; }, [radioWebExports]);
  useEffect(() => { radioDashboardReceiptsRef.current = radioDashboardReceipts; }, [radioDashboardReceipts]);
  useEffect(() => { loopchainDraftRef.current = loopchainDraft; }, [loopchainDraft]);
  useEffect(() => { loopchainSectionAcceptancesRef.current = loopchainSectionAcceptances; }, [loopchainSectionAcceptances]);
  useEffect(() => { loopchainObservationsRef.current = loopchainObservations; }, [loopchainObservations]);
  useEffect(() => { loopBinViewStateRef.current = loopBinViewState; }, [loopBinViewState]);
  useEffect(() => { libraryGapsRef.current = libraryGaps; }, [libraryGaps]);

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
      crates: cratesRef.current,
      loops: loopsRef.current.length ? loopsRef.current : undefined,
      audioExperiments: audioExperimentsRef.current.length ? audioExperimentsRef.current : undefined,
      loopRenders: loopRendersRef.current.length ? loopRendersRef.current : undefined,
      loopWorkspaceDrafts: loopWorkspaceDraftsRef.current.length ? loopWorkspaceDraftsRef.current : undefined,
      loopRevisions: loopRevisionsRef.current.length ? loopRevisionsRef.current : undefined,
      songAnalyses: songAnalysesRef.current.length ? songAnalysesRef.current : undefined,
      radioInboxItems: radioInboxItemsRef.current.length ? radioInboxItemsRef.current : undefined,
      radioPlaylists: radioPlaylistsRef.current.length ? radioPlaylistsRef.current : undefined,
      radioBanks: radioBanksRef.current.length ? radioBanksRef.current : undefined,
      radioDashboardReceipts: radioDashboardReceiptsRef.current.length ? radioDashboardReceiptsRef.current : undefined,
      radioWebExports: radioWebExportsRef.current.length ? radioWebExportsRef.current : undefined,
      loopchainDraft: loopchainDraftRef.current,
      loopchainSectionAcceptances: loopchainSectionAcceptancesRef.current.length ? loopchainSectionAcceptancesRef.current : undefined,
      loopchainObservations: loopchainObservationsRef.current.length ? loopchainObservationsRef.current : undefined,
      loopBinViewState: loopBinViewStateRef.current,
      loopRevisionsMigrationVersion: loopRevisionsMigrationVersionRef.current,
      libraryGaps: libraryGapsRef.current.length ? libraryGapsRef.current : undefined,
      metadataImportHistory: metadataImportHistoryRef.current.length ? metadataImportHistoryRef.current : undefined,
      externalIdentityRepairHistory: externalRepairHistoryRef.current.length ? externalRepairHistoryRef.current : undefined,
      externalIdentityBatchRepairHistory: externalBatchRepairHistoryRef.current.length ? externalBatchRepairHistoryRef.current : undefined,
      ignoredIssueIds: ignoredIssueIdsRef.current.length ? ignoredIssueIdsRef.current : undefined,
      deferredIssueIds: deferredIssueIdsRef.current.length ? deferredIssueIdsRef.current : undefined,
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
    // Section mode (0711): regeneration must use section-by-section logic,
    // not the flat curve-fit pool, when this playlist has an active arcConfig.
    const plForArc = playlistsRef.current.find((p) => p.playlistId === plId);
    if (plForArc?.arcConfig && plForArc.arcConfig.mode !== "none" && !plForArc.manualOrderDirty) {
      handleRegenerateWithSections(plId);
      return;
    }
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
        // Use crate pool if playlist has crates attached, else fall back to recipe/library
        let rawCandidates: Track[];
        const cratesMap = new Map(cratesRef.current.map((c) => [c.id, c]));
        if (pl.crateIds && pl.crateIds.length > 0) {
          rawCandidates = resolveCratePool(pl.crateIds, cratesMap, lib);
        } else {
          const eligible = filterTracksForPlaylist({ tracks: lib, playlist: pl });
          rawCandidates = pl.buildRecipe ? filterTracksByRecipe(eligible, pl.buildRecipe) : eligible;
        }
        // Pre-generation codec gate (0709): blocked tracks never reach the
        // curve assigner — they cannot occupy or reserve a slot.
        // Readiness gate (0712): imported-but-not-yet-analyzed tracks aren't
        // automatic-generation candidates yet (manual add still allows them,
        // with a warning — see handleDropTracksOnPlaylist).
        const gate = gatePlaylistCandidates(excludePendingImports(rawCandidates), {
          mode: "casual",
          playbackIssues: trackPlaybackIssuesRef.current,
          excludedTrackIds: excl,
        }, "regenerate");
        const { slots: rawSlots, orphans: o } = assignPlaylistToCurve({
          tracks: gate.eligibleTracks,
          curve: pl.curve, locks: pl.locks,
          excludedTrackIds: [],
          targetDurationSeconds: pl.targetDurationMinutes * 60,
          duplicateRules: pl.duplicateRules,
        });
        // Final output gate (0709 leak audit): defense-in-depth — re-validates
        // the assigned output even though candidates were already gated above.
        const tbmFinal = new Map(lib.map((t) => [t.trackId, t]));
        const finalized = finalizeGeneratedPlaylistSlots({
          entryPoint: "regenerateForPL",
          slots: rawSlots,
          candidatePool: gate.eligibleTracks,
          tracksById: tbmFinal,
          eligibilityContext: { playbackIssues: trackPlaybackIssuesRef.current, excludedTrackIds: excl },
        });
        const s = finalized.slots ?? rawSlots.map((sl) => ({ ...sl, assignedTrackId: undefined }));
        newPL = { ...pl, slots: s, orphans: o, updatedAt: now };
        if (gate.rejectedTracks.length > 0 || finalized.leakDetected) {
          const leakStr = finalized.leakDetected
            ? ` Safety gate caught ${finalized.removedCount} leaked at assignment, backfilled ${finalized.backfilledCount}.`
            : "";
          setTimeout(() => showNotify(
            `Generated ${s.filter(sl => sl.assignedTrackId).length} tracks from ${gate.eligibleTracks.length} eligible candidates. Skipped ${gate.rejectedTracks.length} blocked: ${describeSkipReport(gate.rejectedByReason)}.${leakStr}`,
          ), 0);
        }
      }

      const next = prev.map((p) => (p.playlistId === plId ? newPL : p));
      savePlayProject(makeProj(next, lib, excl));
      return next;
    });
  }

  function regenerate(lib: Track[], excl: Set<string>) {
    regenerateForPL(lib, excl, activePlaylistIdRef.current);
  }

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
    // Section mode (0711): "Fill From Crate" / "Regenerate from curve" both
    // route through section logic when this playlist has an active arcConfig.
    const plForArc = playlistsRef.current.find((p) => p.playlistId === plId);
    if (plForArc?.arcConfig && plForArc.arcConfig.mode !== "none") {
      handleRegenerateWithSections(plId);
      return;
    }
    const lib = libraryTracksRef.current;
    const excl = excludedTrackIdsRef.current;
    const now = nowIso();
    let assignedCount = 0;
    let hasCrates = false;
    const gateReportBox: { value: CandidateGateResult<Track> | null } = { value: null };
    let finalGateLeaked = false;
    let finalGateRemoved = 0;
    let finalGateBackfilled = 0;
    setPlaylists((prev) => {
      const pl = prev.find((p) => p.playlistId === plId);
      if (!pl) return prev;
      if (pl.locked) {
        showNotify("Playlist is locked. Duplicate or unlock to edit.");
        return prev;
      }
      const cratesMap = new Map(cratesRef.current.map((c) => [c.id, c]));
      let rawCandidates: Track[];
      hasCrates = !!(pl.crateIds && pl.crateIds.length > 0);
      if (hasCrates) {
        rawCandidates = resolveCratePool(pl.crateIds!, cratesMap, lib);
        console.log("[handleRegenerateFromCurve] using crate pool:", pl.crateIds, "candidates:", rawCandidates.length);
      } else {
        const eligibleTracks = filterTracksForPlaylist({ tracks: lib, playlist: pl });
        rawCandidates = pl.buildRecipe
          ? filterTracksByRecipe(eligibleTracks, pl.buildRecipe)
          : eligibleTracks;
      }
      // Pre-generation codec gate (0709): candidates are gated BEFORE curve
      // fitting/slot assignment — blocked tracks never reserve a slot.
      // Readiness gate (0712): excludes imported-but-not-yet-analyzed tracks.
      const gate = gatePlaylistCandidates(excludePendingImports(rawCandidates), {
        mode: "casual",
        playbackIssues: trackPlaybackIssuesRef.current,
        excludedTrackIds: excl,
      }, "regenerate from curve");
      gateReportBox.value = gate;
      const { slots: rawSlots, orphans: o } = assignPlaylistToCurve({
        tracks: gate.eligibleTracks,
        curve: pl.curve,
        locks: pl.locks,
        excludedTrackIds: [],
        targetDurationSeconds: pl.targetDurationMinutes * 60,
        duplicateRules: pl.duplicateRules,
      });
      // Final output gate (0709 leak audit): defense-in-depth re-validation.
      const tbmFinal = new Map(lib.map((t) => [t.trackId, t]));
      const finalized = finalizeGeneratedPlaylistSlots({
        entryPoint: "handleRegenerateFromCurve",
        slots: rawSlots,
        candidatePool: gate.eligibleTracks,
        tracksById: tbmFinal,
        eligibilityContext: { playbackIssues: trackPlaybackIssuesRef.current, excludedTrackIds: excl },
      });
      finalGateLeaked = finalized.leakDetected;
      finalGateRemoved = finalized.removedCount;
      finalGateBackfilled = finalized.backfilledCount;
      const s = finalized.slots ?? rawSlots.map((sl) => ({ ...sl, assignedTrackId: undefined }));
      assignedCount = s.filter(sl => sl.assignedTrackId).length;
      const updated: PlaylistRecord = {
        ...pl, slots: s, orphans: o, manualOrderDirty: false, updatedAt: now,
      };
      const next = prev.map((p) => (p.playlistId === plId ? updated : p));
      savePlayProject(makeProj(next, lib, excl));
      return next;
    });
    const label = hasCrates ? "Fill From Crate" : "Regenerate from curve";
    const leakStr = finalGateLeaked ? ` Safety gate caught ${finalGateRemoved} leaked at assignment, backfilled ${finalGateBackfilled}.` : "";
    const gateReport = gateReportBox.value;
    if (gateReport && gateReport.rejectedTracks.length > 0) {
      showNotify(
        `${label} — ${assignedCount} tracks assigned from ${gateReport.eligibleTracks.length} eligible candidates. ` +
        `Skipped ${gateReport.rejectedTracks.length} blocked: ${describeSkipReport(gateReport.rejectedByReason)}.${leakStr}`,
      );
    } else if (finalGateLeaked) {
      showNotify(`${label} — ${assignedCount} tracks assigned.${leakStr}`);
    } else {
      showNotify(`${label} — ${assignedCount} tracks assigned.`);
    }
  }

  // ── Path Options (0704G) ──────────────────────────────────────────────────

  const [generatingOptions, setGeneratingOptions] = useState(false);
  const [showOptionsPopup, setShowOptionsPopup] = useState(false);

  function handleGeneratePathOptions() {
    const plId = activePlaylistIdRef.current;
    const lib = libraryTracksRef.current;
    const excl = excludedTrackIdsRef.current;
    const pl = playlistsRef.current.find((p) => p.playlistId === plId);
    if (!pl || !(pl.crateIds?.length)) return;
    // Section mode (0711): curve-based path options don't apply once a
    // playlist has sections — regenerate with section budgets instead.
    if (pl.arcConfig && pl.arcConfig.mode !== "none") {
      handleRegenerateWithSections(plId);
      return;
    }

    setGeneratingOptions(true);
    const cratesMap = new Map(cratesRef.current.map((c) => [c.id, c]));
    const cratePoolTracks = resolveCratePool(pl.crateIds, cratesMap, lib);

    // Build crateUsageMap: crateId → trackIds (for usage stats)
    const crateUsageMap = new Map<string, string[]>();
    for (const crateId of pl.crateIds) {
      const crate = cratesMap.get(crateId);
      if (crate) {
        const { tracks } = resolveCrateTracks(crate, lib);
        crateUsageMap.set(crateId, tracks.map((t) => t.trackId));
      }
    }

    // Pre-generation codec gate (0709): the pool passed to the generator
    // contains only playback-eligible tracks — metadata/usage stats still
    // read from the full cratePoolTracks so crate reporting stays accurate.
    // Readiness gate (0712): excludes imported-but-not-yet-analyzed tracks.
    const gate = gatePlaylistCandidates(excludePendingImports(cratePoolTracks), {
      mode: "casual",
      playbackIssues: trackPlaybackIssuesRef.current,
      excludedTrackIds: excl,
    }, "path options");

    // generatePlaylistPathOptions is sync — run in a timeout to let UI show "Generating…"
    setTimeout(() => {
      const latestImportId = metadataImportHistoryRef.current[0]?.importId;
      const metadataRevision = computeCratePoolMetadataRevision(cratePoolTracks);
      const metadataSnapshot = buildPlaylistGenerationMetadataSnapshot(
        cratePoolTracks,
        pl.crateIds ?? [],
        latestImportId,
      );
      const options = generatePlaylistPathOptions({
        cratePoolTracks: gate.eligibleTracks,
        excludedTrackIds: [],
        targetDurationSeconds: pl.targetDurationMinutes * 60,
        locks: pl.locks,
        duplicateRules: pl.duplicateRules,
        crateUsageMap,
        metadataRevision,
        metadataSnapshot,
      });

      const now = nowIso();
      const crateSignature = pl.crateIds ? [...pl.crateIds].sort().join(",") : "";
      mutatePLAndSave(plId, (p) => ({
        ...p,
        pathOptions: options,
        acceptedPathOptionId: undefined,
        metadataRepairImpact: undefined,
        updatedAt: now,
        optionsGeneratedAt: now,
        optionsGeneratedFromCrateIds: pl.crateIds ? [...pl.crateIds] : [],
        optionsGeneratedFromTrackSignature: crateSignature,
        playlistOptionsStaleReason: null,
      }));
      setGeneratingOptions(false);
      const skipStr = gate.rejectedTracks.length > 0
        ? ` (from ${gate.eligibleTracks.length} eligible candidates — skipped ${gate.rejectedTracks.length} blocked: ${describeSkipReport(gate.rejectedByReason)})`
        : "";
      showNotify(`Generated ${options.length} playlist option${options.length !== 1 ? "s" : ""}${skipStr}.`);
    }, 50);
  }

  function handleAcceptPathOption(optionId: string) {
    const plId = activePlaylistIdRef.current;
    const lib = libraryTracksRef.current;
    const excl = excludedTrackIdsRef.current;
    const now = nowIso();
    const finalizeResultBox: { value: ReturnType<typeof finalizeGeneratedPlaylistSlots> | null } = { value: null };

    setPlaylists((prev) => {
      const pl = prev.find((p) => p.playlistId === plId);
      if (!pl) return prev;

      const opt = pl.pathOptions?.find((o) => o.id === optionId);
      if (!opt) return prev;

      // Build slots from the option's ordered trackIds
      const tracksById = new Map(lib.map((t) => [t.trackId, t]));
      let cumulativeTime = 0;
      const rawSlots = opt.trackIds.map((trackId, i) => {
        const t = tracksById.get(trackId);
        const dur = t?.durationSeconds ?? 0;
        const energy = t?.energy ?? 0.5;
        const slot = {
          slotId: `slot_${i}`,
          slotIndex: i,
          startTimeSeconds: cumulativeTime,
          targetEnergy: energy,
          targetBpm: t?.bpm ?? 120,
          assignedTrackId: trackId,
          warningLevel: "none" as const,
          warningMessages: [] as string[],
        };
        cumulativeTime += dur;
        return slot;
      });

      // Final output gate (0709 leak audit): opt.trackIds was cached at
      // generation time — a track can go unplayable in the gap before Accept
      // is clicked. Re-validate the committed output, never the cached list.
      const cratesMap = new Map(cratesRef.current.map((c) => [c.id, c]));
      const candidatePool = pl.crateIds && pl.crateIds.length > 0
        ? resolveCratePool(pl.crateIds, cratesMap, lib)
        : filterTracksForPlaylist({ tracks: lib, playlist: pl });
      const finalized = finalizeGeneratedPlaylistSlots({
        entryPoint: "handleAcceptPathOption",
        slots: rawSlots,
        candidatePool,
        tracksById,
        eligibilityContext: { playbackIssues: trackPlaybackIssuesRef.current, excludedTrackIds: excl },
      });
      finalizeResultBox.value = finalized;
      if (!finalized.slots) return prev; // recording/broadcast mode hard-abort (not reachable in casual)
      const slots = finalized.slots;

      // Derive updated FlowCurve from accepted option's energy sequence
      const updatedCurve = opt.derivedCurvePoints.length > 0
        ? {
            ...pl.curve,
            points: opt.derivedCurvePoints.map((p, i) => ({
              pointId: `p${i}`,
              timePercent: p.timePercent,
              energy: p.energy,
            })),
          }
        : pl.curve;

      const updated = {
        ...pl,
        slots,
        orphans: [],
        curve: updatedCurve,
        acceptedPathOptionId: optionId,
        manualOrderDirty: false,
        updatedAt: now,
      };
      const next = prev.map((p) => (p.playlistId === plId ? updated : p));
      savePlayProject(makeProj(next, lib, excl));
      return next;
    });

    const finalizeResult = finalizeResultBox.value;
    if (finalizeResult && finalizeResult.leakDetected) {
      if (finalizeResult.slots === null) {
        showNotify(`Generation blocked: ${finalizeResult.removedCount} unsafe tracks still reached the output. No playlist was saved.`);
      } else {
        showNotify(`Safety gate removed ${finalizeResult.removedCount} blocked track${finalizeResult.removedCount !== 1 ? "s" : ""} and backfilled ${finalizeResult.backfilledCount} safe alternative${finalizeResult.backfilledCount !== 1 ? "s" : ""}.`);
      }
    } else {
      showNotify("Playlist Option accepted — output updated.");
    }
  }

  function handleDuplicatePathOption(optionId: string) {
    const plId = activePlaylistIdRef.current;
    const lib = libraryTracksRef.current;
    const excl = excludedTrackIdsRef.current;
    const now = nowIso();
    const finalizeResultBox: { value: ReturnType<typeof finalizeGeneratedPlaylistSlots> | null } = { value: null };

    setPlaylists((prev) => {
      const pl = prev.find((p) => p.playlistId === plId);
      if (!pl) return prev;

      const opt = pl.pathOptions?.find((o) => o.id === optionId);
      if (!opt) return prev;

      const tracksById = new Map(lib.map((t) => [t.trackId, t]));
      let cumulativeTime = 0;
      const rawSlots = opt.trackIds.map((trackId, i) => {
        const t = tracksById.get(trackId);
        const dur = t?.durationSeconds ?? 0;
        const slot = {
          slotId: `slot_${i}`,
          slotIndex: i,
          startTimeSeconds: cumulativeTime,
          targetEnergy: t?.energy ?? 0.5,
          targetBpm: t?.bpm ?? 120,
          assignedTrackId: trackId,
          warningLevel: "none" as const,
          warningMessages: [] as string[],
        };
        cumulativeTime += dur;
        return slot;
      });

      // Final output gate (0709 leak audit): same staleness risk as Accept —
      // cached opt.trackIds is re-validated against live playback issues here.
      const cratesMap = new Map(cratesRef.current.map((c) => [c.id, c]));
      const candidatePool = pl.crateIds && pl.crateIds.length > 0
        ? resolveCratePool(pl.crateIds, cratesMap, lib)
        : filterTracksForPlaylist({ tracks: lib, playlist: pl });
      const finalized = finalizeGeneratedPlaylistSlots({
        entryPoint: "handleDuplicatePathOption",
        slots: rawSlots,
        candidatePool,
        tracksById,
        eligibilityContext: { playbackIssues: trackPlaybackIssuesRef.current, excludedTrackIds: excl },
      });
      finalizeResultBox.value = finalized;
      if (!finalized.slots) return prev;
      const slots = finalized.slots;

      const newId = `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      const newPlaylist = {
        ...pl,
        playlistId: newId,
        title: `${pl.title} — ${opt.name}`,
        slots,
        orphans: [],
        locks: [],
        pathOptions: undefined,
        acceptedPathOptionId: undefined,
        manualOrderDirty: false,
        createdAt: now,
        updatedAt: now,
      };

      const next = [...prev, newPlaylist];
      savePlayProject(makeProj(next, lib, excl));
      return next;
    });

    const finalizeResult = finalizeResultBox.value;
    if (finalizeResult && finalizeResult.leakDetected) {
      if (finalizeResult.slots === null) {
        showNotify(`Generation blocked: ${finalizeResult.removedCount} unsafe tracks still reached the output. No playlist was saved.`);
      } else {
        showNotify(`Duplicated as new playlist. Safety gate removed ${finalizeResult.removedCount} blocked track${finalizeResult.removedCount !== 1 ? "s" : ""} and backfilled ${finalizeResult.backfilledCount}.`);
      }
    } else {
      showNotify(`Duplicated as new playlist.`);
    }
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

  function handleSetDuplicateRules(playlistId: string, rules: import("./data/playProjectTypes").PlaylistDuplicateRules) {
    mutatePLAndSave(playlistId, (pl) => ({ ...pl, duplicateRules: rules }));
  }

  // ── Playlist sections / weights (0711) ────────────────────────────────────

  function handleSetArcConfig(playlistId: string, config: PlaylistArcConfig) {
    mutatePLAndSave(playlistId, (pl) => ({ ...pl, arcConfig: config, updatedAt: nowIso() }));
  }

  function handleRegenerateWithSections(playlistId: string) {
    const lib = libraryTracksRef.current;
    const excl = excludedTrackIdsRef.current;
    const pl = playlistsRef.current.find((p) => p.playlistId === playlistId);
    if (!pl?.arcConfig || pl.arcConfig.mode === "none") return;
    if (pl.locked) { showNotify("Playlist is locked. Duplicate or unlock to edit."); return; }

    const eligibilityCtx = { playbackIssues: trackPlaybackIssuesRef.current, excludedTrackIds: excl };
    const { eligible: safeLibrary, report: skipReport } = partitionEligibleTracks(lib, eligibilityCtx, "regenerate with sections");

    // Crate source handoff (0711 fix): section generation must draw from the
    // same crate-scoped pool as normal generation (regenerateForPL), not the
    // raw library — otherwise sections silently ignore the playlist's chosen
    // crate sources entirely.
    const cratesMap = new Map(cratesRef.current.map((c) => [c.id, c]));
    const hasCrateSources = !!(pl.crateIds && pl.crateIds.length > 0);
    const sectionCandidatePool = hasCrateSources
      ? resolveCratePool(pl.crateIds!, cratesMap, safeLibrary)
      : safeLibrary;

    if (hasCrateSources && sectionCandidatePool.length === 0) {
      showNotify("Could not generate sectioned playlist: playlist's crate sources have no eligible tracks.");
      return;
    }

    const targetDurationSeconds = pl.targetDurationMinutes ? pl.targetDurationMinutes * 60 : undefined;
    // Track-count budget: prefer an explicit user-set count, else derive from
    // the target duration so a 3-hour playlist doesn't collapse to the bare
    // "12" fallback (which produced a section playlist a fraction of the
    // requested length). Falls back to current slot count, then 12, only when
    // neither a track count nor a duration target is available at all.
    const avgDurSecs = (() => {
      const withDur = sectionCandidatePool.map((t) => t.durationSeconds).filter((d): d is number => !!d && d > 0);
      return withDur.length > 0 ? withDur.reduce((a, b) => a + b, 0) / withDur.length : 180;
    })();
    const totalCount =
      pl.targetTrackCount ??
      (targetDurationSeconds ? Math.max(1, Math.ceil(targetDurationSeconds / avgDurSecs)) : undefined) ??
      pl.slots.filter((s) => s.assignedTrackId).length ??
      12;

    console.info("[section-generation:start]", {
      playlistId,
      playlistTitle: pl.title,
      arcMode: pl.arcConfig.mode,
      sectionCount: pl.arcConfig.sections.length,
      crateSourceCount: pl.crateIds?.length ?? 0,
      targetDurationSeconds,
      targetTrackCount: totalCount || 12,
      libraryTrackCount: sectionCandidatePool.length,
    });

    const arcResult = buildArcPlaylist({
      libraryTracks: sectionCandidatePool,
      config: pl.arcConfig,
      totalTrackCount: totalCount || 12,
      targetDurationSeconds,
    });

    console.info("[section-generation:pools]", {
      sections: arcResult.assignments.map((a) => ({
        sectionId: a.sectionId,
        label: a.sectionLabel,
        targetCount: a.targetCount,
        selectedCount: a.tracks.length,
      })),
    });

    if (arcResult.tracks.length === 0) {
      const emptySections = arcResult.assignments.filter((a) => a.tracks.length === 0);
      const detail = emptySections.length > 0
        ? `no eligible tracks found for section "${emptySections[0].sectionLabel}"`
        : "no tracks matched any section";
      console.error("[section-generation:failed]", { entryPoint: "handleRegenerateWithSections", detail, arcConfig: pl.arcConfig, playlistId });
      showNotify(`Could not generate sectioned playlist: ${detail} — playlist unchanged.`);
      return;
    }

    const rawSlots = buildSlotsFromArcResult(arcResult);
    const tracksById = new Map(lib.map((t) => [t.trackId, t]));
    const beforeSlotCount = rawSlots.filter((s) => s.assignedTrackId).length;
    // Final output gate (0709 leak audit pattern): re-validate the assigned
    // output before it's committed, same as every other generation path.
    const finalized = finalizeGeneratedPlaylistSlots({
      entryPoint: "handleRegenerateWithSections",
      slots: rawSlots,
      candidatePool: sectionCandidatePool,
      tracksById,
      eligibilityContext: eligibilityCtx,
    });
    const slots = finalized.slots ?? rawSlots.map((s) => ({ ...s, assignedTrackId: undefined }));
    const afterSlotCount = slots.filter((s) => s.assignedTrackId).length;

    console.info("[section-generation:final-gate]", {
      beforeSlotCount,
      afterSlotCount,
      removedCount: finalized.removedCount ?? 0,
      blockedCount: beforeSlotCount - afterSlotCount,
    });

    mutatePLAndSave(playlistId, (p) => ({ ...p, slots, orphans: [], manualOrderDirty: false, updatedAt: nowIso() }));

    const configWarnings = describeArcConfigWarnings(pl.arcConfig);
    const skipStr = skipReport.codec > 0 ? ` Codec-blocked skipped: ${skipReport.codec}.` : "";
    const leakStr = finalized.leakDetected ? ` Safety gate caught ${finalized.removedCount} at assignment, backfilled ${finalized.backfilledCount}.` : "";
    const warnStr = [...arcResult.warnings, ...configWarnings].length ? ` ⚠ ${[...arcResult.warnings, ...configWarnings].join("; ")}` : "";
    showNotify(`Regenerated with sections — ${afterSlotCount} tracks.${skipStr}${leakStr}${warnStr}`);
  }

  // ── Crate CRUD (Phase 1) ──────────────────────────────────────────────────

  function handleCreateCrate(name?: string) {
    const now = nowIso();
    const crate: CrateRecord = {
      id: genId("crate"),
      name: name?.trim() || "New Crate",
      createdAt: now,
      updatedAt: now,
      sourceOwners: ["studiorich"],
      filters: defaultCrateFilters(),
    };
    const next = [...cratesRef.current, crate];
    cratesRef.current = next;
    setCrates(next);
    setActiveCrateId(crate.id);
    setViewMode("crate_detail");
    savePlayProject(makeProj(playlistsRef.current));
  }

  function handleUpdateCrate(updated: CrateRecord) {
    const next = cratesRef.current.map((c) => (c.id === updated.id ? updated : c));
    cratesRef.current = next;
    setCrates(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  function handleDeleteCrate(id: string) {
    const next = cratesRef.current.filter((c) => c.id !== id);
    cratesRef.current = next;
    setCrates(next);
    // Remove from any playlists that reference it
    setPlaylists((prev) => {
      const updated = prev.map((pl) =>
        pl.crateIds?.includes(id)
          ? { ...pl, crateIds: pl.crateIds.filter((cid) => cid !== id) }
          : pl,
      );
      savePlayProject(makeProj(updated));
      return updated;
    });
    if (activeCrateId === id) {
      setActiveCrateId(null);
      setViewMode("crates_grid");
    }
  }

  // ── Sectional Looper and Loop Library ─────────────────────────────────────
  function handleSaveLoop(loop: LoopAsset) {
    const exists = loopsRef.current.some((l) => l.id === loop.id);
    const next = exists
      ? loopsRef.current.map((l) => (l.id === loop.id ? loop : l))
      : [...loopsRef.current, loop];
    loopsRef.current = next;
    setLoops(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  function handleUpdateLoop(id: string, patch: Partial<LoopAsset>) {
    const next = loopsRef.current.map((l) => (l.id === id ? { ...l, ...patch, updatedAt: nowIso() } : l));
    loopsRef.current = next;
    setLoops(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  // 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §17-§20 —
  // one draft per sourceTrackId(+experimentId), upserted exactly like
  // handleSaveLoop/handleUpdateLoop above.
  function handleSaveDraftSelection(draft: DraftLoopSelection) {
    const matches = (d: DraftLoopSelection) =>
      d.sourceTrackId === draft.sourceTrackId && d.experimentId === draft.experimentId;
    const exists = loopWorkspaceDraftsRef.current.some(matches);
    const next = exists
      ? loopWorkspaceDraftsRef.current.map((d) => (matches(d) ? draft : d))
      : [...loopWorkspaceDraftsRef.current, draft];
    loopWorkspaceDraftsRef.current = next;
    setLoopWorkspaceDrafts(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  function handleClearDraftSelection(sourceTrackId: string, experimentId?: string) {
    const next = loopWorkspaceDraftsRef.current.filter(
      (d) => !(d.sourceTrackId === sourceTrackId && d.experimentId === experimentId),
    );
    loopWorkspaceDraftsRef.current = next;
    setLoopWorkspaceDrafts(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  // §22-§24 — "Create New Revision" and "Update Existing" are the same
  // underlying data operation (append a revision, repoint activeRevisionId
  // — see loopRevisions.ts's updateExistingRevision doc comment); the only
  // difference visible here is which caller-supplied `revision` object was
  // built (a fresh chain root vs. one carrying parentRevisionId). Render
  // staleness is never flipped imperatively — it's derived at display time
  // from LoopRenderRecord.renderedRevisionId vs. the loop's new
  // activeRevisionId (loopRenderStaleness.ts), so nothing else to update.
  function handleSaveLoopRevision(revision: LoopRevision) {
    const nextRevisions = [...loopRevisionsRef.current, revision];
    loopRevisionsRef.current = nextRevisions;
    setLoopRevisions(nextRevisions);
    handleUpdateLoop(revision.loopId, { activeRevisionId: revision.id });
  }

  // 0715E_MUSIC_Loop_Revision_Activation_And_Stem_Source_Entry §5-§9 — the
  // "Make Active" flow: repoints activeRevisionId at a past (or the
  // implicit original, revisionId: null) revision. Every consumer already
  // resolves current bounds through resolveActiveLoopBoundsFrames, so this
  // one pointer update is the entire state change — no bounds/render/
  // staleness recomputation needed here.
  function handleMakeActiveRevision(loopId: string, revisionId: string | null) {
    handleUpdateLoop(loopId, { activeRevisionId: revisionId ?? undefined });
  }

  function handleSaveLoopBinViewState(next: LoopBinViewState) {
    loopBinViewStateRef.current = next;
    setLoopBinViewState(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  // §36 — deleting a rendered file must default to the safest behavior:
  // clear the render record back to "not_rendered" while preserving the
  // LoopAsset's own metadata untouched. Never deletes the source track.
  function handleDeleteLoopRenderedFile(loopId: string) {
    const next = loopRendersRef.current.map((r) =>
      r.loopId === loopId
        ? { ...r, status: "not_rendered" as const, filename: undefined, outputPath: undefined, fileSizeBytes: undefined, checksum: undefined, renderedAt: undefined }
        : r,
    );
    loopRendersRef.current = next;
    setLoopRenders(next);
    handleUpdateLoop(loopId, { loopFilePath: undefined });
    savePlayProject(makeProj(playlistsRef.current));
  }

  function getLoopRenderRecord(loopId: string): LoopRenderRecord | undefined {
    return loopRendersRef.current.find((r) => r.loopId === loopId);
  }

  function upsertLoopRenderRecord(record: LoopRenderRecord) {
    const exists = loopRendersRef.current.some((r) => r.loopId === record.loopId);
    const next = exists
      ? loopRendersRef.current.map((r) => (r.loopId === record.loopId ? record : r))
      : [...loopRendersRef.current, record];
    loopRendersRef.current = next;
    setLoopRenders(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  // §8 — cache decoded source buffers by track id within this session so a
  // batch render (or repeated renders of the same source) never re-decodes
  // the same file. Never persisted (§37 — decoded buffers are explicitly
  // excluded from persistence).
  async function getDecodedSourceBufferForRender(track: Track): Promise<AudioBuffer | null> {
    const cached = decodedSourceBufferCacheRef.current.get(track.trackId);
    if (cached) return cached;
    const url = getTrackPlayUrl(track);
    if (!url) return null;
    try {
      const ctx = renderDecodeCtxRef.current ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      renderDecodeCtxRef.current = ctx;
      const resp = await fetch(url);
      const arrayBuf = await resp.arrayBuffer();
      const buffer = await ctx.decodeAudioData(arrayBuf);
      decodedSourceBufferCacheRef.current.set(track.trackId, buffer);
      return buffer;
    } catch {
      return null;
    }
  }

  // 0717C_MUSIC_Complete_Song_Intelligence_and_Section_Map — song analysis
  // lifecycle. 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation §16
  // extracted the actual orchestration logic (dedup/attach-to-in-flight,
  // state transitions, cancellation, the armed-cancel debug hook) out of
  // this file into songAnalysisOrchestrator.ts — a plain, testable factory
  // — since this codebase has no React-component test harness (the same
  // reason 0717B extracted sectionalRadioBridgeOrchestrator.ts). App.tsx
  // now only owns the actual persisted state + a stable orchestrator
  // instance closed over accessor/mutator callbacks into that state.
  const [songAnalysisProgress, setSongAnalysisProgress] = useState<Record<string, ChunkedDspProgress>>({});

  function handleSaveSongAnalysis(analysis: CompleteSongAnalysis) {
    const exists = songAnalysesRef.current.some((a) => a.id === analysis.id);
    const next = exists
      ? songAnalysesRef.current.map((a) => (a.id === analysis.id ? analysis : a))
      : [...songAnalysesRef.current, analysis];
    songAnalysesRef.current = next;
    setSongAnalyses(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  function handleUpdateSongAnalysis(id: string, patch: Partial<CompleteSongAnalysis>) {
    const next = songAnalysesRef.current.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: nowIso() } : a));
    songAnalysesRef.current = next;
    setSongAnalyses(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  const songAnalysisOrchestratorRef = useRef(
    createSongAnalysisOrchestrator({
      getSongAnalyses: () => songAnalysesRef.current,
      saveSongAnalysis: handleSaveSongAnalysis,
      updateSongAnalysis: handleUpdateSongAnalysis,
      getDecodedSourceBufferForRender,
      setProgress: (trackId, progress) => setSongAnalysisProgress((prev) => ({ ...prev, [trackId]: progress })),
    }),
  );
  const ensureSongAnalysisReady = songAnalysisOrchestratorRef.current.ensureSongAnalysisReady;
  const cancelSongAnalysis = songAnalysisOrchestratorRef.current.cancelSongAnalysis;
  const recomputeSongAnalysisStatus = songAnalysisOrchestratorRef.current.recomputeSongAnalysisStatus;

  // 0717C debt closure #2 — deterministic live-Cancel proof, mirrors the
  // armMidTransitionPause install pattern below (App.tsx:5020-5023). No
  // dependency array (runs after every render): window.MUSIC_DEBUG itself
  // is installed asynchronously (inside the startup-recovery effect, after
  // an awaited assessStartupRecovery() call), so a mount-only effect here
  // can run before it exists and never get a second chance to attach.
  useEffect(() => {
    if (typeof window !== "undefined") {
      const w = window as unknown as { MUSIC_DEBUG?: Record<string, unknown> };
      if (w.MUSIC_DEBUG) w.MUSIC_DEBUG.armSongAnalysisCancel = songAnalysisOrchestratorRef.current.armSongAnalysisCancel;
    }
  });

  // §8, §19, §21, §22, §26 — the real render action: decode (or reuse the
  // cached decode) → extract/process/encode → validate the header → decode
  // the produced WAV back and compare (never claim success from a written
  // file alone) → trigger the browser's own download → persist the render
  // record. No custom output-folder path is available in this browser-only
  // build — the download itself is the honest substitute (see completion
  // report).
  // 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion — `provenance`
  // is stamped onto the render record BEFORE loopRenderStaleness.ts ever
  // reads it back (see that module's StalenessCheckInput doc comment). Both
  // ids come from the looper workspace's own already-derived
  // activeGridRevisionId/segmentationRevisionId (0714T/0715B) — this
  // function never computes them itself.
  async function handleRenderLoop(
    loopId: string,
    provenance?: { gridRevisionId?: string; segmentationRevisionId?: string },
  ): Promise<{ ok: boolean; error?: string }> {
    const loop = loopsRef.current.find((l) => l.id === loopId);
    if (!loop) return { ok: false, error: "loop_not_found" };
    const track = libraryTracksRef.current.find((t) => t.trackId === loop.sourceTrackId);
    if (!track) return { ok: false, error: "source_missing" };
    const buffer = await getDecodedSourceBufferForRender(track);
    if (!buffer) return { ok: false, error: "source_decode_failed" };

    // 0715D_MUSIC_0715C_Live_Verification_And_Typecheck_Process_Repair —
    // live-caught real defect: rendering always used the LoopAsset's own
    // frozen original startSeconds/endSeconds, never the active revision's
    // bounds, so editing a loop via Create-New-Revision/Update-Existing and
    // then rendering silently re-rendered the ORIGINAL region instead of the
    // edited one. The render pipeline itself (loopRenderService.ts,
    // protected scope) has no notion of revisions at all, so this resolves
    // the active revision's frame bounds to seconds HERE and passes a
    // shallow-copied loop-shaped view — the persisted LoopAsset's own
    // stored bounds are never touched (§21's "must not silently mutate the
    // original" still holds; this only changes what gets RENDERED).
    const activeBounds = resolveActiveLoopBoundsFrames(loop, loopRevisionsRef.current, buffer.sampleRate);
    const renderableLoop: LoopAsset = activeBounds.activeRevision
      ? {
          ...loop,
          startSeconds: activeBounds.startFrame / buffer.sampleRate,
          endSeconds: activeBounds.endFrame / buffer.sampleRate,
          durationSeconds: (activeBounds.endFrame - activeBounds.startFrame) / buffer.sampleRate,
        }
      : loop;

    const settings: LoopRenderSettings = defaultRenderSettings(buffer.sampleRate, buffer.numberOfChannels >= 2 ? 2 : 1);
    const existingNames = new Set(
      loopRendersRef.current.filter((r) => r.filename).map((r) => r.filename as string),
    );

    try {
      const { record, wavBuffer, filename } = await renderLoopToWav({
        loop: renderableLoop, sourceBuffer: buffer, settings, existingFileNames: existingNames,
      });
      const integrity = await verifyRenderedAudioIntegrity(wavBuffer, {
        sampleRate: settings.sampleRate, channels: settings.channels,
        durationSeconds: renderableLoop.endSeconds - renderableLoop.startSeconds,
      });
      if (!integrity.ok) {
        upsertLoopRenderRecord({
          id: getLoopRenderRecord(loop.id)?.id ?? record.id, loopId: loop.id, status: "failed",
          settings, sourceFingerprint: record.sourceFingerprint,
          sourceStartSeconds: renderableLoop.startSeconds, sourceEndSeconds: renderableLoop.endSeconds,
          error: `integrity_check_failed: ${integrity.reasons.join(", ")}`,
        });
        return { ok: false, error: integrity.reasons.join(", ") };
      }
      downloadWavBuffer(wavBuffer, filename);
      upsertLoopRenderRecord({
        ...record,
        id: getLoopRenderRecord(loop.id)?.id ?? record.id,
        renderedRevisionId: loop.activeRevisionId,
        renderedGridRevisionId: provenance?.gridRevisionId,
        renderedSegmentationRevisionId: provenance?.segmentationRevisionId,
      });
      handleUpdateLoop(loop.id, { loopFilePath: filename });
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "render_failed";
      upsertLoopRenderRecord({
        id: getLoopRenderRecord(loop.id)?.id ?? `render_${genId("render")}`, loopId: loop.id, status: "failed",
        settings, sourceFingerprint: track.playbackBounds?.sourceFingerprint ?? "",
        sourceStartSeconds: renderableLoop.startSeconds, sourceEndSeconds: renderableLoop.endSeconds,
        error: message,
      });
      return { ok: false, error: message };
    }
  }

  // §34 — batch render, sequential (§35: 1-2 simultaneous recommended; this
  // build renders one at a time — the safest, simplest concurrency choice),
  // reusing the same decoded-buffer cache across every loop from the same
  // source track.
  async function handleRenderAllApproved(): Promise<{ rendered: number; failed: number }> {
    const targets = loopsRef.current.filter((l) => l.status === "approved");
    let rendered = 0, failed = 0;
    for (const loop of targets) {
      const existing = getLoopRenderRecord(loop.id);
      if (existing?.status === "rendered") continue;
      const result = await handleRenderLoop(loop.id);
      if (result.ok) rendered++; else failed++;
    }
    return { rendered, failed };
  }

  // 0716B_MUSIC_RadioLoop_Library_Foundation — same "resolve source track →
  // decode (or reuse cached decode) → resolve active revision bounds"
  // shape as handleRenderLoop above; the actual promotion pipeline
  // (eligibility → staging → lossless render → encode → server-side
  // validate/finalize/manifest) lives in radioPromotionOrchestrator.ts.
  // Promotion state is intentionally NOT persisted into PlayProject — the
  // on-disk package + local-manifest.json are the durable source of truth
  // (doctrine §4); this handler's result is transient, session-scoped UI
  // feedback only.
  async function handlePromoteToRadio(
    loopId: string,
    formInput: RadioPromotionFormInput,
    onProgress?: (phase: RadioPromotionPhase) => void,
  ): Promise<PromoteLoopToRadioResult> {
    const loop = loopsRef.current.find((l) => l.id === loopId);
    if (!loop) return { ok: false, issues: [{ code: "RADIO_ELIGIBILITY_LOOP_MISSING", message: "Loop not found", severity: "error" }] };
    const track = libraryTracksRef.current.find((t) => t.trackId === loop.sourceTrackId);
    if (!track) return { ok: false, issues: [{ code: "RADIO_ELIGIBILITY_SOURCE_TRACK_MISSING", message: "Source track not found", severity: "error" }] };
    const buffer = await getDecodedSourceBufferForRender(track);
    if (!buffer) return { ok: false, issues: [{ code: "RADIO_ELIGIBILITY_SOURCE_UNREADABLE", message: "Could not decode source audio", severity: "error" }] };
    return promoteLoopToRadio({ loop, track, revisions: loopRevisionsRef.current, sourceBuffer: buffer, formInput, onProgress });
  }

  function handleUpsertAudioExperiment(record: AudioExperimentRecord) {
    const exists = audioExperimentsRef.current.some((e) => e.id === record.id);
    const next = exists
      ? audioExperimentsRef.current.map((e) => (e.id === record.id ? record : e))
      : [...audioExperimentsRef.current, record];
    audioExperimentsRef.current = next;
    setAudioExperiments(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  // §25 — opening a track in the Sectional Looper creates (or resumes) one
  // persisted, resumable AudioExperimentRecord per source track.
  function handleSelectLooperSourceTrack(trackId: string | null) {
    setLooperSourceTrackId(trackId);
    if (!trackId) return;
    const track = libraryTracksRef.current.find((t) => t.trackId === trackId);
    if (!track) return;
    const existing = audioExperimentsRef.current.find(
      (e) => e.type === "sectional_looper" && e.sourceTrackId === trackId,
    );
    const approvedLoopIds = loopsRef.current.filter((l) => l.sourceTrackId === trackId && l.status === "approved").map((l) => l.id);
    const now = nowIso();
    handleUpsertAudioExperiment({
      id: existing?.id ?? genId("experiment"),
      type: "sectional_looper",
      sourceTrackId: trackId,
      sourceFingerprint: track.playbackBounds?.sourceFingerprint ?? `${track.durationSeconds}`,
      status: "review",
      candidateLoopIds: existing?.candidateLoopIds ?? [],
      approvedLoopIds,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
  }

  function handleGenerateMoodCrates(): { created: number; skipped: number; empty: number } {
    // Count mode: allTags — a track qualifies if the mood appears anywhere in moodTags,
    // not just primary. Balanced excluded: neutral bucket, not a useful crate.
    const tracks = libraryTracks.filter((t) =>
      !(t.moodTags ?? []).every((m) => m.toLowerCase() === "balanced"),
    );
    const result = generateMissingAutoMoodCrates(
      cratesRef.current,
      tracks,
      { minTracks: 1 },
    );
    // Strip any Balanced crate from created list
    result.created = result.created.filter((c) => c.name.toLowerCase() !== "balanced");
    if (result.created.length > 0) {
      const next = [...cratesRef.current, ...result.created];
      cratesRef.current = next;
      setCrates(next);
      savePlayProject(makeProj(playlistsRef.current));
    }
    return { created: result.created.length, skipped: result.skippedExisting.length, empty: result.empty.length };
  }

  function handlePromoteSuggested(trackId: string, mood: string) {
    const next = libraryTracksRef.current.map((t) => {
      if (t.trackId !== trackId) return t;
      const existing = t.moodTags ?? [];
      if (existing.some((m) => m.toLowerCase() === mood.toLowerCase())) return t;
      return { ...t, moodTags: [...existing, mood], updatedAt: nowIso() };
    });
    libraryTracksRef.current = next;
    setLibraryTracks(next);
    savePlayProject(makeProj(playlistsRef.current, next));
  }

  function handleAssignMechanism(trackId: string, mechanism: string) {
    const next = libraryTracksRef.current.map((t) => {
      if (t.trackId !== trackId) return t;
      const existing = t.mechanismTags ?? [];
      if (existing.includes(mechanism)) return t;
      return { ...t, mechanismTags: [...existing, mechanism], updatedAt: nowIso() };
    });
    libraryTracksRef.current = next;
    setLibraryTracks(next);
    savePlayProject(makeProj(playlistsRef.current, next));
  }

  const [importProgress, setImportProgress] = useState<{ done: number; total: number; current: string } | null>(null);
  const [importIntakeItems, setImportIntakeItems] = useState<MusicImportIntakeItem[] | null>(null);

  // ── Canonical analysis orchestration (0712_MUSIC_Catalog_Analysis_Orchestration) ──
  // One shared in-flight guard + one shared serial batch runner reused by:
  // the single-track "Analyze DSP" button, "Analyze All Missing", and the
  // import-commit auto-analysis hook. No second analyzer, no parallel logic.
  const dspInFlightRef = useRef<Set<string>>(new Set());
  const [dspBatchProgress, setDspBatchProgress] = useState<{
    missing: number; queued: number; running: number; complete: number; failed: number; remaining: number;
  } | null>(null);

  async function runCanonicalDspAnalysis(trackIds: string[]): Promise<{ completed: number; failed: number }> {
    const pending = trackIds.filter((id) => !dspInFlightRef.current.has(id));
    if (pending.length === 0) return { completed: 0, failed: 0 };
    pending.forEach((id) => dspInFlightRef.current.add(id));

    let completed = 0;
    let failed = 0;
    setDspBatchProgress((prev) => ({
      missing: (prev?.missing ?? 0) + pending.length,
      queued: (prev?.queued ?? 0) + pending.length,
      running: prev?.running ?? 0,
      complete: prev?.complete ?? 0,
      failed: prev?.failed ?? 0,
      remaining: (prev?.remaining ?? 0) + pending.length,
    }));

    for (const id of pending) {
      const track = libraryTracksRef.current.find((t) => t.trackId === id);
      if (!track) { dspInFlightRef.current.delete(id); continue; }
      setDspBatchProgress((prev) => prev && { ...prev, running: prev.running + 1, queued: Math.max(0, prev.queued - 1) });

      const updated = await analyzeTrackDspFeatures(track);
      const next = libraryTracksRef.current.map((t) => (t.trackId === id ? updated : t));
      libraryTracksRef.current = next;
      setLibraryTracks(next);

      const ok = updated.analysisStatus !== "failed";
      if (ok) completed++; else failed++;
      dspInFlightRef.current.delete(id);
      setDspBatchProgress((prev) => prev && {
        ...prev,
        running: Math.max(0, prev.running - 1),
        complete: prev.complete + (ok ? 1 : 0),
        failed: prev.failed + (ok ? 0 : 1),
        remaining: Math.max(0, prev.remaining - 1),
      });
    }

    savePlayProject(makeProj(playlistsRef.current, libraryTracksRef.current));
    return { completed, failed };
  }

  // Scope per spec §5.1/§9: Catalog + External only, never Sounds (reference).
  function handleAnalyzeAllMissingCatalog(includeExternal = false) {
    const candidates = libraryTracksRef.current.filter((t) =>
      (t.sourceOwner === "studiorich" || (includeExternal && t.sourceOwner === "external")) &&
      requiresCanonicalAnalysis(t) &&
      !dspInFlightRef.current.has(t.trackId),
    );
    if (candidates.length === 0) {
      showNotify("No Catalog tracks are missing analysis.");
      return;
    }
    setDspBatchProgress(null);
    void runCanonicalDspAnalysis(candidates.map((t) => t.trackId)).then(({ completed, failed }) => {
      showNotify(`Analyze All Missing — ${completed} completed, ${failed} failed.`);
    });
  }

  function handleRetryFailedAnalysis() {
    const failedTracks = libraryTracksRef.current.filter((t) => t.analysisStatus === "failed" && !dspInFlightRef.current.has(t.trackId));
    if (failedTracks.length === 0) { showNotify("No failed analyses to retry."); return; }
    void runCanonicalDspAnalysis(failedTracks.map((t) => t.trackId)).then(({ completed, failed }) => {
      showNotify(`Retry Failed — ${completed} completed, ${failed} still failed.`);
    });
  }

  async function handleAnalyzerReviewDsp(trackId: string) {
    const track = libraryTracksRef.current.find((t) => t.trackId === trackId);
    if (!track) return;
    if (dspInFlightRef.current.has(trackId)) return;
    dspInFlightRef.current.add(trackId);
    const updated = await analyzeTrackDspFeatures(track);
    dspInFlightRef.current.delete(trackId);
    const next = libraryTracksRef.current.map((t) => t.trackId === trackId ? updated : t);
    libraryTracksRef.current = next;
    setLibraryTracks(next);
    savePlayProject(makeProj(playlistsRef.current, next));
  }

  function handleAnalyzerReviewMood(trackId: string, force = false) {
    const track = libraryTracksRef.current.find((t) => t.trackId === trackId);
    if (!track) return;
    const { track: updated } = analyzeTrackMood(track, { force });
    const next = libraryTracksRef.current.map((t) => t.trackId === trackId ? updated : t);
    libraryTracksRef.current = next;
    setLibraryTracks(next);
    savePlayProject(makeProj(playlistsRef.current, next));
  }

  async function handleAnalyzerReviewBatchDsp(trackIds: string[]) {
    // Routes through the same shared runner as "Analyze All Missing" and the
    // import-commit hook — no second batch implementation. The 25-track cap
    // stays here since it's this specific UI's manual-selection affordance,
    // not a limitation of the runner itself (which has no cap).
    const limited = trackIds.slice(0, 25);
    await runCanonicalDspAnalysis(limited);
  }

  function handleAnalyzerReviewBatchMood(trackIds: string[]) {
    const limited = trackIds.slice(0, 25);
    let next = libraryTracksRef.current;
    for (const id of limited) {
      const track = next.find((t) => t.trackId === id);
      if (!track) continue;
      const { track: updated } = analyzeTrackMood(track, { force: false });
      next = next.map((t) => t.trackId === id ? updated : t);
    }
    libraryTracksRef.current = next;
    setLibraryTracks(next);
    savePlayProject(makeProj(playlistsRef.current, next));
  }

  async function handleImportAudio(destination: TrackSourceOwner = "studiorich") {
    const files = await pickAudioFiles();
    if (files.length === 0) return;
    const unsupported = files.filter((f) => !isSupportedAudioExtension(f.name));
    const supportedFiles = files.filter((f) => isSupportedAudioExtension(f.name));
    if (supportedFiles.length === 0) {
      showNotify("Could not import: no supported audio files found.");
      return;
    }
    setImportProgress({ done: 0, total: supportedFiles.length, current: supportedFiles[0]?.name ?? "" });
    const { imported, failed } = await importAudioFiles(supportedFiles, destination, (done, total, current) => {
      setImportProgress({ done, total, current });
    });
    setImportProgress(null);
    if (imported.length === 0) {
      showNotify(failed.length > 0 ? `Import failed for all ${failed.length} file(s).` : "Could not import: no supported audio files found.");
      return;
    }
    // Import-to-crate intake pipeline (0711): imported files land in a review
    // queue — codec/playability scan, duplicate check, crate assignment — and
    // only get appended to the active library on explicit commit. Nothing
    // here bypasses gatePlaylistCandidates()/finalizeGeneratedPlaylistSlots().
    const items = imported.map((r) => buildIntakeItem(r, libraryTracksRef.current));
    setImportIntakeItems(items);
    if (unsupported.length > 0) {
      showNotify(`${unsupported.length} file(s) had an unsupported extension and were not imported.`);
    }
    if (failed.length > 0) {
      console.warn("[import] Some files failed upload:", failed);
    }
  }

  // 0715G_MUSIC_Sectional_Looper_Simplification_And_Stem_Ready_Export §5 —
  // "Import Existing Stems," never "Create Stems": this only registers
  // already-separated files the user picks (via the same pickAudioFiles/
  // importAudioFiles upload path "+ Import Audio" uses), tagging each with
  // derivedKind: "stem"/parentTrackId/stemRole. It deliberately bypasses the
  // crate-intake review queue (buildIntakeItem/handleCommitImportIntake) —
  // that pipeline is for end-user library additions (duplicate check, crate
  // assignment); a derived, parent-linked stem has neither concern and
  // registers directly, mirroring handleCommitImportIntake's own
  // direct-append-to-library pattern.
  async function handleImportStems(parentTrackId: string) {
    const parentTrack = libraryTracksRef.current.find((t) => t.trackId === parentTrackId);
    if (!parentTrack) return;
    const files = await pickAudioFiles();
    if (files.length === 0) return;
    const supportedFiles = files.filter((f) => isSupportedAudioExtension(f.name));
    if (supportedFiles.length === 0) {
      showNotify("Could not import: no supported audio files found.");
      return;
    }
    const { imported, failed } = await importAudioFiles(supportedFiles, "reference");
    if (imported.length === 0) {
      showNotify(failed.length > 0 ? `Import failed for all ${failed.length} file(s).` : "Could not import: no supported audio files found.");
      return;
    }
    const matched: { role: StemRole; importedTrack: Track }[] = [];
    const unmatched: string[] = [];
    for (const r of imported) {
      const nameForMatch = r.track.audioFileName ?? r.track.title ?? "";
      const role = matchStemRoleFromFileName(nameForMatch);
      if (!role) { unmatched.push(nameForMatch); continue; }
      matched.push({ role, importedTrack: r.track });
    }
    const entries: StemImportEntry[] = matched.map((m) => ({
      role: m.role, fileName: m.importedTrack.audioFileName ?? m.importedTrack.title ?? "", filePath: m.importedTrack.audioRelPath ?? "",
    }));
    const newStubs = buildNewStemTracks({ libraryTracks: libraryTracksRef.current, parentTrack, entries });
    // buildNewStemTracks only knows the fixed role/fileName/filePath shape —
    // merge back the REAL upload metadata (audioRelPath/category/duration)
    // from importAudioFiles so the registered stem is actually playable via
    // the same getTrackPlayUrl resolution every other track uses.
    const roleToImportedTrack = new Map(matched.map((m) => [m.role, m.importedTrack]));
    const finalStems = newStubs.map((stub) => {
      const importedTrack = stub.stemRole ? roleToImportedTrack.get(stub.stemRole) : undefined;
      if (!importedTrack) return stub;
      return {
        ...stub,
        filePath: undefined,
        audioRelPath: importedTrack.audioRelPath,
        audioCategory: importedTrack.audioCategory,
        audioFileName: importedTrack.audioFileName,
        audioStatus: importedTrack.audioStatus,
        audioLinked: importedTrack.audioLinked,
        durationSeconds: importedTrack.durationSeconds,
      };
    });
    if (finalStems.length === 0) {
      showNotify(unmatched.length > 0
        ? `Could not match a stem role for: ${unmatched.join(", ")}.`
        : "All selected stems are already registered for this track.");
      return;
    }
    const nextLibrary = [...libraryTracksRef.current, ...finalStems];
    libraryTracksRef.current = nextLibrary;
    setLibraryTracks(nextLibrary);
    savePlayProject(makeProj(playlistsRef.current, nextLibrary), { reason: "update_library" });
    showNotify(
      `Registered ${finalStems.length} stem track(s) for "${parentTrack.title}".`
      + (unmatched.length > 0 ? ` Could not match role for: ${unmatched.join(", ")}.` : ""),
    );
  }

  function resolveIntakeItemUrl(item: MusicImportIntakeItem): string | null {
    if (item.track.audioRelPath) return `/music-audio/${item.track.audioRelPath}`;
    if (item.track.filePath) return getAudioUrl(item.track.filePath);
    return null;
  }

  function handleCommitImportIntake(result: {
    committedItems: MusicImportIntakeItem[];
    updatedCrates: CrateRecord[];
    skippedCount: number;
    blockedCount: number;
  }) {
    const newTracks = result.committedItems.map((it) => it.track);
    const nextLibrary = [...libraryTracksRef.current, ...newTracks];
    libraryTracksRef.current = nextLibrary;
    setLibraryTracks(nextLibrary);
    cratesRef.current = result.updatedCrates;
    setCrates(result.updatedCrates);
    savePlayProject(makeProj(playlistsRef.current, nextLibrary), { reason: "update_library" });
    showNotify(
      `Import complete. Committed ${newTracks.length}. Skipped ${result.skippedCount}. Blocked ${result.blockedCount}.`,
    );

    // Auto-analysis (0712_MUSIC_Catalog_Analysis_Orchestration §9): Catalog
    // and External imports queue the canonical analyzer immediately on
    // commit — the user never has to open a track editor manually. Sounds
    // (reference) stays out of scope per §5.2.
    const analyzableIds = newTracks
      .filter((t) => t.sourceOwner === "studiorich" || t.sourceOwner === "external")
      .map((t) => t.trackId);
    if (analyzableIds.length > 0) {
      void runCanonicalDspAnalysis(analyzableIds).then(({ completed, failed }) => {
        showNotify(`Import analysis complete — ${completed} ready, ${failed} failed.`);
      });
    }
  }

  function handleAddCrateToPlaylist(playlistId: string, crateId: string) {
    mutatePLAndSave(playlistId, (pl) => {
      const newCrateIds = [...new Set([...(pl.crateIds ?? []), crateId])];
      const hadOptions = (pl.pathOptions?.length ?? 0) > 0;
      return {
        ...pl,
        crateIds: newCrateIds,
        sourceCrateIds: newCrateIds,
        playlistOptionsStaleReason: hadOptions ? "crate_sources_changed" : pl.playlistOptionsStaleReason,
      };
    });
  }

  function handleRemoveCrateFromPlaylist(playlistId: string, crateId: string) {
    mutatePLAndSave(playlistId, (pl) => {
      const newCrateIds = (pl.crateIds ?? []).filter((id) => id !== crateId);
      const hadOptions = (pl.pathOptions?.length ?? 0) > 0;
      return {
        ...pl,
        crateIds: newCrateIds,
        sourceCrateIds: newCrateIds,
        playlistOptionsStaleReason: hadOptions ? "crate_sources_changed" : pl.playlistOptionsStaleReason,
      };
    });
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

  function handlePlaylistBroadcastBgChange(src: string | undefined) {
    mutatePLAndSave(activePlaylistId, (pl) => ({ ...pl, broadcastBackgroundArt: src, updatedAt: nowIso() }));
  }

  function handlePlaylistAccentColorChange(color: string | undefined) {
    mutatePLAndSave(activePlaylistId, (pl) => ({ ...pl, accentColor: color, updatedAt: nowIso() }));
  }

  function handleArtworkDisplayModeChange(mode: NonNullable<import("./data/playProjectTypes").PlaylistRecord["artworkDisplayMode"]>) {
    mutatePLAndSave(activePlaylistId, (pl) => ({ ...pl, artworkDisplayMode: mode, updatedAt: nowIso() }));
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
            targetBpm: t.bpm ?? 120,
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
    const rawPatch = patch as Record<string, unknown>;
    const isMoodAdd = rawPatch["_bulkMoodMode"] === "add";
    const genreMode = rawPatch["_bulkGenreMode"] as "add" | "remove" | "replace" | undefined;
    const incomingGenres = rawPatch["genres"] as string[] | undefined;
    const { _bulkMoodMode: _ignored, _bulkGenreMode: _ignored2, ...cleanPatch } = rawPatch;
    const safePatch = cleanPatch as Partial<Track>;
    const next = libraryTracksRef.current.map((t) => {
      if (!idSet.has(t.trackId)) return t;
      let updated: Track = { ...t, ...safePatch };
      if (isMoodAdd && safePatch.moodTags) {
        updated.moodTags = [...new Set([...(t.moodTags ?? []), ...safePatch.moodTags])];
      }
      if (genreMode && incomingGenres) {
        // Genre is stored as `genres` (array, source of truth) plus a `genre`
        // display string kept in sync — per-track merge, never a flat
        // overwrite, so a shared bulk edit can't erase one track's existing
        // multi-genre value with another's (spec: "do not silently overwrite
        // existing multi-genre values").
        const existing = t.genres ?? (t.genre ? t.genre.split(",").map((g) => g.trim()).filter(Boolean) : []);
        let merged: string[];
        if (genreMode === "add") {
          merged = [...new Set([...existing, ...incomingGenres])];
        } else if (genreMode === "remove") {
          const removeSet = new Set(incomingGenres.map((g) => g.toLowerCase()));
          merged = existing.filter((g) => !removeSet.has(g.toLowerCase()));
        } else {
          merged = [...new Set(incomingGenres)];
        }
        updated = { ...updated, genres: merged, genre: merged.join(", ") || undefined };
      }
      return updated;
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
    reference:  { sourceLibrary: "Sounds",             platformUse: ["reference_only"],                analysisSources: ["import", "external_tool"] },
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
            const fn = (t.audioFilename ?? t.fileName ?? "").toLowerCase();
            const matched = fn ? byLower.get(fn) : undefined;
            if (matched) {
              audioLinked++;
              return {
                ...t,
                filePath: matched,
                audioLinked: true,
                audioMissing: false,
                audioLastScannedAt: now,
                // Portable fields — filename is canonical, relPath uses catalog category
                audioFileName: t.audioFilename ?? t.fileName,
                audioRelPath: `catalog/audio/${t.audioFilename ?? t.fileName}`,
                audioCategory: "catalog" as const,
                audioStatus: "linked" as const,
              };
            }
            return { ...t, audioMissing: true, audioLastScannedAt: now, audioStatus: "missing" as const };
          });
          console.log(`[UpdateLibrary] StudioRich linked: ${audioLinked}`);
        } else {
          // External / Reference: audio files become track rows
          const audioCategory = owner === "reference" ? "reference" : "external";
          const incoming: Track[] = audioFiles.map((f) => ({
            trackId: genId(owner.slice(0, 3)),
            title: f.name.replace(/\.[^.]+$/, ""),
            artist: "",
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
            // Portable fields
            audioFileName: f.name,
            audioRelPath: `${audioCategory}/audio/${f.name}`,
            audioCategory: audioCategory as Track["audioCategory"],
            audioStatus: "linked" as const,
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
    const cacheSaved = savePlayProject(makeProj(playlistsRef.current, current), { reason: "update_library" });
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

  const [, setAudioLinkReport] = useState<AudioLinkReport | null>(null);

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

  function handleLoadSampler(playlistId: string) {
    const pl = playlistsRef.current.find((p) => p.playlistId === playlistId) ?? null;
    setSamplerBank(pl);
    if (pl) setSamplerVisible(true);
  }

  function handleCreateSamplerBank(title?: string) {
    // Guard: title may arrive as a DOM Event if the button passes onClick directly
    const safeTitle = typeof title === "string" && title.trim() ? title.trim() : "New Bank";
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
    const tbm = new Map(libraryTracksRef.current.map((t) => [t.trackId, t]));
    setPlaylists((prev) => {
      const next = prev.map((pl) => {
        if (pl.playlistId !== bankId) return pl;
        const existingIds = new Set(pl.slots.map((s) => s.assignedTrackId).filter(Boolean));
        let startTimeSeconds = pl.slots.reduce((sum, s) => sum + (tbm.get(s.assignedTrackId ?? "")?.durationSeconds ?? 0), 0);
        const newSlots: TrackSlot[] = trackIds
          .filter((id) => !existingIds.has(id))
          .map((trackId, i) => {
            const t = tbm.get(trackId);
            const slot: TrackSlot = {
              slotId: genId("slot"),
              slotIndex: pl.slots.length + i,
              startTimeSeconds,
              targetEnergy: t?.energy ?? 0.5,
              targetBpm: t?.bpm ?? 120,
              assignedTrackId: trackId,
              warningLevel: "none",
              warningMessages: [],
            };
            startTimeSeconds += t?.durationSeconds ?? 0;
            return slot;
          });
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
    const tbmBank = new Map(libraryTracksRef.current.map((t) => [t.trackId, t]));
    let bankStartTimeSeconds = 0;
    const slots: TrackSlot[] = trackIds.map((trackId, i) => {
      const t = tbmBank.get(trackId);
      const slot: TrackSlot = {
        slotId: genId("slot"),
        slotIndex: i,
        startTimeSeconds: bankStartTimeSeconds,
        targetEnergy: t?.energy ?? 0.5,
        targetBpm: t?.bpm ?? 120,
        assignedTrackId: trackId,
        warningLevel: "none",
        warningMessages: [],
      };
      bankStartTimeSeconds += t?.durationSeconds ?? 0;
      return slot;
    });
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

  function handleUpdatePlaylistNotes(playlistId: string, notes: string) {
    setPlaylists((prev) => {
      const next = prev.map((pl) => pl.playlistId === playlistId ? { ...pl, description: notes, updatedAt: nowIso() } : pl);
      playlistsRef.current = next;
      savePlayProject(makeProj(next, libraryTracksRef.current));
      return next;
    });
  }

  const [, setImportFlash] = useState("");
  const [libraryUpdating, setLibraryUpdating] = useState<TrackSourceOwner | null>(null);
  const audioRescanRefs = useRef<Partial<Record<TrackSourceOwner, HTMLInputElement | null>>>({});
  const csvImportRefs = useRef<Partial<Record<TrackSourceOwner, HTMLInputElement | null>>>({});

  // ── New Playlist Dialog ───────────────────────────────────────────────────
  const [showNewPlaylistWizard, setShowNewPlaylistWizard] = useState(false);
  const [showImportAudioModal, setShowImportAudioModal] = useState(false);
  const [newPlaylistDefaultTitle, setNewPlaylistDefaultTitle] = useState("Untitled Playlist");

  function handleCreatePlaylist() {
    const existingNames = new Set(playlists.map((p) => p.title));
    let title = "Untitled Playlist";
    let n = 2;
    while (existingNames.has(title)) { title = `Untitled Playlist ${n++}`; }
    setNewPlaylistDefaultTitle(title);
    setShowNewPlaylistWizard(true);
  }

  function handleNewPlaylistWizardComplete(result: NewPlaylistWizardResult) {
    setShowNewPlaylistWizard(false);
    const now = nowIso();
    const crateSignature = result.crateIds.length > 0 ? [...result.crateIds].sort().join(",") : "";
    const lib = libraryTracksRef.current;

    // Final output gate (0709 leak audit): defense-in-depth — the wizard
    // already gates+finalizes internally, but this is the actual commit point
    // into app state, so it re-validates once more before anything is saved.
    let finalSlots = result.acceptedSlots ?? [];
    let wizardLeak: ReturnType<typeof finalizeGeneratedPlaylistSlots> | null = null;
    if (finalSlots.length > 0) {
      const cratesMap = new Map(cratesRef.current.map((c) => [c.id, c]));
      const candidatePool = result.crateIds.length > 0
        ? resolveCratePool(result.crateIds, cratesMap, lib)
        : lib;
      const tracksById = new Map(lib.map((t) => [t.trackId, t]));
      wizardLeak = finalizeGeneratedPlaylistSlots({
        entryPoint: "handleNewPlaylistWizardComplete",
        slots: finalSlots,
        candidatePool,
        tracksById,
        eligibilityContext: { playbackIssues: trackPlaybackIssuesRef.current },
      });
      finalSlots = wizardLeak.slots ?? finalSlots.map((s) => ({ ...s, assignedTrackId: undefined }));
    }

    const newPL = makeDefaultPlaylist({
      title: result.title,
      targetDurationMinutes: result.targetDurationMinutes,
      crateIds: result.crateIds.length > 0 ? result.crateIds : undefined,
      sourceCrateIds: result.crateIds.length > 0 ? result.crateIds : undefined,
      slots: finalSlots,
      manualOrderDirty: finalSlots.length > 0,
      optionsGeneratedAt: result.optionsGeneratedAt,
      optionsGeneratedFromCrateIds: result.optionsGeneratedFromCrateIds,
      optionsGeneratedFromTrackSignature: crateSignature || undefined,
      playlistOptionsStaleReason: finalSlots.length > 0 ? null : "options_never_generated",
      // Crate-first shape (0711_MUSIC_Crate_First_Playlist_Shape_UX_Revision) —
      // undefined for playlists created via "Skip setup / Create empty playlist".
      shapeConfig: result.shapeConfig,
      updatedAt: now,
      createdAt: now,
    });
    const next = [...playlists, newPL];
    setPlaylists(next);
    setActivePlaylistId(newPL.playlistId);
    activePlaylistIdRef.current = newPL.playlistId;
    slotsRef.current = newPL.slots;
    const saveReason =
      result.mode === "accepted" ? "playlist_wizard_option_accepted"
      : result.mode === "options_only" ? "playlist_wizard_options_generated"
      : "playlist_created_empty_manual";
    savePlayProject(makeProj(next, undefined, undefined, newPL.playlistId), { reason: saveReason });
    setViewMode("playlist");
    setCurrentSlotIdx(null);
    setSelectedSlotIdx(null);
    if (wizardLeak?.leakDetected) {
      showNotify(`Safety gate removed ${wizardLeak.removedCount} blocked track${wizardLeak.removedCount !== 1 ? "s" : ""} and backfilled ${wizardLeak.backfilledCount} safe alternative${wizardLeak.backfilledCount !== 1 ? "s" : ""}.`);
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
    const { filters, title, mode, arcConfig } = result;

    // Codec/playback safety (0709): builder pulls only playback-eligible tracks
    const eligibilityCtx = {
      playbackIssues: trackPlaybackIssuesRef.current,
      excludedTrackIds: excludedTrackIdsRef.current,
    };
    const { eligible: safeLibrary, report: builderSkipReport } =
      partitionEligibleTracks(libraryTracksRef.current, eligibilityCtx, "playlist builder");

    // Arc mode: delegate to arc builder
    if (arcConfig && arcConfig.mode !== "none") {
      const totalCount = filters.trackCount ? filters.trackCount : 12;
      const arcResult = buildArcPlaylist({
        libraryTracks: safeLibrary,
        config: arcConfig,
        totalTrackCount: totalCount,
        targetDurationSeconds: filters.targetMinutes ? filters.targetMinutes * 60 : undefined,
      });

      if (arcResult.tracks.length === 0) {
        setImportFlash("Arc Builder: no tracks matched any section — playlist not created");
        setTimeout(() => setImportFlash(""), 4000);
        return;
      }

      const targetSecs = filters.targetMinutes ? filters.targetMinutes * 60 : DEFAULT_TARGET_MINUTES * 60;
      const newPL = makeDefaultPlaylist({ title, targetDurationMinutes: Math.round(targetSecs / 60) });
      newPL.slots = buildSlotsFromArcResult(arcResult);
      // Persist section config (0711) so it can be edited and regeneration
      // respects section structure instead of collapsing to a flat pool.
      newPL.arcConfig = arcConfig;

      const configWarnings = describeArcConfigWarnings(arcConfig);
      const skipStr = builderSkipReport.codec > 0 ? `  Codec-blocked skipped: ${builderSkipReport.codec}` : "";
      const warnStr = ([...arcResult.warnings, ...configWarnings].length
        ? `  ⚠ ${[...arcResult.warnings, ...configWarnings].join("; ")}`
        : "") + skipStr;
      const nextPlaylists = [...playlistsRef.current, newPL];
      playlistsRef.current = nextPlaylists;
      setPlaylists(nextPlaylists);
      setActivePlaylistId(newPL.playlistId);
      activePlaylistIdRef.current = newPL.playlistId;
      savePlayProject(makeProj(nextPlaylists, undefined, undefined, newPL.playlistId), { reason: "playlist_arc_generation" });
      setViewMode("playlist");
      setImportFlash(`Created "${title}" with ${arcResult.tracks.length} tracks (arc)${warnStr}`);
      setTimeout(() => setImportFlash(""), 5000);
      return;
    }

    // Filter tracks from library by the builder's criteria
    const candidate = safeLibrary.filter((t) => {
      if (filters.sourceOwners.length && !filters.sourceOwners.includes(t.sourceOwner ?? "unknown")) return false;
      if (filters.bpmMin !== undefined && (t.bpm ?? -Infinity) < filters.bpmMin) return false;
      if (filters.bpmMax !== undefined && (t.bpm ?? Infinity) > filters.bpmMax) return false;
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
    // Pre-generation codec gate (0709): warn (don't fail) when the eligible
    // pool can't cover the requested count — never silently ship a shorter list.
    const insufficiency = filters.trackCount
      ? describeInsufficientCandidates(candidate.length, filters.trackCount)
      : null;

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
        targetBpm: t.bpm ?? 120,
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

    // Final output gate (0709 leak audit): defense-in-depth re-validation
    // immediately before this brand-new playlist is committed.
    const builderFinal = finalizeGeneratedPlaylistSlots({
      entryPoint: "handlePlaylistBuilderConfirm",
      slots: newPL.slots,
      candidatePool: safeLibrary,
      tracksById: new Map(safeLibrary.map((t) => [t.trackId, t])),
      eligibilityContext: { playbackIssues: trackPlaybackIssuesRef.current },
    });
    if (builderFinal.leakDetected && builderFinal.slots) newPL.slots = builderFinal.slots;

    const nextPlaylists = [...playlistsRef.current, newPL];
    playlistsRef.current = nextPlaylists;
    setPlaylists(nextPlaylists);
    setActivePlaylistId(newPL.playlistId);
    activePlaylistIdRef.current = newPL.playlistId;
    savePlayProject(makeProj(nextPlaylists, undefined, undefined, newPL.playlistId), { reason: "standard_playlist_generation" });
    setViewMode("playlist");
    setImportFlash(
      `Created "${title}" with ${newPL.slots.filter(s => s.assignedTrackId).length} tracks` +
      (builderSkipReport.codec > 0 ? ` — codec-blocked skipped: ${builderSkipReport.codec}` : "") +
      (builderFinal.leakDetected ? ` — safety gate caught ${builderFinal.removedCount} at assignment, backfilled ${builderFinal.backfilledCount}` : "") +
      (insufficiency ? ` ${insufficiency}` : ""),
    );
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

  function handleLibraryGapsChange(gaps: import("./data/playlistRepairTypes").LibraryGapRecord[]) {
    setLibraryGaps(gaps);
    libraryGapsRef.current = gaps;
    savePlayProject(makeProj(playlistsRef.current));
  }

  function handleRepairStateChange(state: import("./data/playlistRepairTypes").PlaylistRepairState) {
    if (!activePlaylistId) return;
    mutatePLAndSave(activePlaylistId, (p) => ({ ...p, repairState: state, updatedAt: nowIso() }));
  }

  // Reanalyze Entire Playlist (0713_MUSIC_Playlist_Repair_Analyzer_Export_
  // Completion §5) — one implementation, reused by both the Repair panel and
  // Playlist Analyzer Review entry points (both call this same function).
  async function handleReanalyzePlaylist() {
    const pl = playlistsRef.current.find((p) => p.playlistId === activePlaylistId);
    if (!pl || reanalyzingPlaylistId) return;
    setReanalyzingPlaylistId(pl.playlistId);
    setReanalysisProgress(null);
    try {
      const { updatedLibraryTracks, progress, summary } = await reanalyzeEntirePlaylist(pl, libraryTracksRef.current, nowIso());
      setReanalysisProgress(progress);
      libraryTracksRef.current = updatedLibraryTracks;
      setLibraryTracks(updatedLibraryTracks);
      mutatePLAndSave(pl.playlistId, (p) => ({
        ...p,
        repairState: { ...p.repairState, dispositions: p.repairState?.dispositions ?? {}, lastReanalysis: summary },
        updatedAt: nowIso(),
      }), updatedLibraryTracks);
    } finally {
      setReanalyzingPlaylistId(null);
    }
  }

  // Playlist Transition Preparation (0714_MUSIC_Playlist_Transition_Preparation)
  function handlePreparationChange(preparation: import("./data/playProjectTypes").PlaylistRecord["playbackPreparation"]) {
    if (!activePlaylistId) return;
    mutatePLAndSave(activePlaylistId, (p) => ({ ...p, playbackPreparation: preparation, updatedAt: nowIso() }));
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

  // ── Remove blocked tracks (0709) ────────────────────────────────────────
  // Codec/unplayable/missing-audio tracks can persist in saved playlists from
  // before their issue was detected, or from before this enforcement build.
  // Explicit playlist-level cleanup, using the same canonical eligibility
  // helper as generation/queue enforcement.
  function handleRemoveBlockedTracks() {
    const pl = activePlaylist;
    if (!pl) return;
    const tbm = tracksById_live();
    const ctx = {
      playbackIssues: trackPlaybackIssuesRef.current,
      excludedTrackIds: undefined, // manual exclusion is a separate axis — only playback safety here
    };

    const report = { codec: 0, missing_audio: 0, explicit_exclusion: 0, unplayable: 0 };
    let changed = false;
    const newSlots = pl.slots.map((s) => {
      const id = s.assignedTrackId;
      if (!id) return s;
      const track = tbm.get(id);
      if (!track) return s; // unresolved track — leave alone, not our concern here
      const result = getTrackEligibility(track, ctx);
      if (result.eligible) return s;
      changed = true;
      for (const reason of result.reasons) report[reason]++;
      return { ...s, assignedTrackId: undefined };
    });

    if (!changed) { showNotify("No blocked tracks found"); return; }

    const compacted = newSlots.filter((s) => s.assignedTrackId !== undefined);
    const reindexed = reindexPlaylistSlots(compacted, tbm);
    const evaluated = evaluateSlotWarnings({ slots: reindexed, tracksById: tbm });
    applyManualSlots(evaluated, pl.playlistId);

    const removedCount = report.codec + report.missing_audio + report.unplayable;
    showNotify(`Removed ${removedCount} blocked track${removedCount !== 1 ? "s" : ""}: ${describeSkipReport(report)}.`);
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

  // ── Codec/playback recheck (0709) ─────────────────────────────────────────
  // A previous CODEC/MISSING mark can go stale — file replaced, path fixed,
  // or the original failure was a transient browser/load hiccup. This probes
  // the current audio source with an offscreen <audio> and only clears the
  // issue if the file proves playable (loadedmetadata + canplay). A track that
  // still fails stays blocked, with lastCheckedAt bumped so staleness is visible.
  function resolveTrackAudioUrl(track: Track): string | null {
    if (track.audioRelPath) return `/music-audio/${track.audioRelPath}`;
    if (track.filePath) return getAudioUrl(track.filePath);
    if (track.objectUrl) return track.objectUrl;
    return null;
  }

  function recheckTrackPlayback(track: Track): Promise<{ trackId: string; cleared: boolean }> {
    const trackId = track.trackId;
    const url = resolveTrackAudioUrl(track);
    const now = nowIso();

    if (!url) {
      setTrackPlaybackIssues((prev) => {
        const existing = prev[trackId];
        const issue: TrackPlaybackIssue = {
          status: "unplayable", code: "NO_SOURCE", message: "no audio path",
          detectedAt: existing?.detectedAt ?? now,
          firstSeenAt: existing?.firstSeenAt ?? now, lastSeenAt: now, lastCheckedAt: now,
        };
        const next = { ...prev, [trackId]: issue };
        trackPlaybackIssuesRef.current = next;
        return next;
      });
      return Promise.resolve({ trackId, cleared: false });
    }

    return new Promise((resolve) => {
      const probe = new Audio();
      let settled = false;
      const finish = (cleared: boolean, code?: TrackPlaybackIssue["code"], message?: string) => {
        if (settled) return;
        settled = true;
        probe.src = "";
        if (cleared) {
          setPlaybackErrors((prev) => { const n = new Map(prev); n.delete(trackId); return n; });
          setTrackPlaybackIssues((prev) => {
            const { [trackId]: _, ...rest } = prev;
            trackPlaybackIssuesRef.current = rest;
            return rest;
          });
        } else {
          setPlaybackErrors((prev) => new Map(prev).set(trackId, code ?? "ERR"));
          setTrackPlaybackIssues((prev) => {
            const existing = prev[trackId];
            const issue: TrackPlaybackIssue = {
              status: "unplayable", code: code ?? existing?.code ?? "UNKNOWN",
              message: message ?? existing?.message,
              detectedAt: existing?.detectedAt ?? now,
              firstSeenAt: existing?.firstSeenAt ?? now, lastSeenAt: now, lastCheckedAt: now,
              sourcePath: url,
            };
            const next = { ...prev, [trackId]: issue };
            trackPlaybackIssuesRef.current = next;
            return next;
          });
        }
        resolve({ trackId, cleared });
      };

      probe.addEventListener("canplay", () => finish(true), { once: true });
      probe.addEventListener("error", () => {
        const code = probe.error?.code;
        if (code === MediaError.MEDIA_ERR_DECODE) finish(false, "CODEC", "codec decode failure (recheck)");
        else if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) finish(false, "CODEC", "format not supported (recheck)");
        else if (code === MediaError.MEDIA_ERR_NETWORK) finish(false, "NETWORK", "network error (recheck)");
        else finish(false, "UNKNOWN", "playback recheck failed");
      }, { once: true });
      // Bound the probe — a hanging load should not block a bulk recheck forever.
      setTimeout(() => finish(false, "UNKNOWN", "recheck timed out"), 8000);

      probe.preload = "auto";
      probe.src = url;
      probe.load();
    });
  }

  function handleRecheckPlaybackIssue(trackId: string) {
    const track = libraryTracksRef.current.find((t) => t.trackId === trackId);
    if (!track) return;
    showNotify("Rechecking…");
    void recheckTrackPlayback(track).then(({ cleared }) => {
      showNotify(cleared ? "Track is playable — CODEC issue cleared." : "Still unplayable — issue kept.");
    });
  }

  const [bulkRechecking, setBulkRechecking] = useState(false);

  async function handleBulkRecheckCodecIssues() {
    const issues = trackPlaybackIssuesRef.current;
    const codecTrackIds = Object.entries(issues)
      .filter(([, i]) => i.status === "unplayable" && i.code === "CODEC")
      .map(([id]) => id);
    if (codecTrackIds.length === 0) { showNotify("No codec issues to recheck."); return; }

    setBulkRechecking(true);
    showNotify(`Rechecking ${codecTrackIds.length} codec issue${codecTrackIds.length !== 1 ? "s" : ""}…`);

    let cleared = 0;
    let stillBlocked = 0;
    const tbm = new Map(libraryTracksRef.current.map((t) => [t.trackId, t]));

    // Serial, not parallel — avoids overloading the audio pipeline (per spec).
    for (const trackId of codecTrackIds) {
      const track = tbm.get(trackId);
      if (!track) continue;
      const result = await recheckTrackPlayback(track);
      if (result.cleared) cleared++; else stillBlocked++;
    }

    setBulkRechecking(false);
    showNotify(`Rechecked ${codecTrackIds.length} codec issues. Cleared ${cleared}. Still blocked ${stillBlocked}.`);
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
    const resolvedTracks = payload.trackIds
      .map((id) => tbm.get(id))
      .filter((t): t is Track => !!t);

    // Codec/playback safety (0709): codec-blocked / unplayable tracks never
    // enter a playlist, even via manual selection or "Add all filtered".
    // Explicit exclusion is NOT enforced here — dragging an excluded track is
    // a deliberate user action; only playback safety blocks.
    const { eligible: tracksToAdd, report: safetyReport, skippedCount: unsafeCount } =
      partitionEligibleTracks(resolvedTracks, {
        playbackIssues: trackPlaybackIssuesRef.current,
      }, "add to playlist");

    if (tracksToAdd.length === 0) {
      if (unsafeCount > 0) showNotify(`No tracks added — ${describeSkipReport(safetyReport)}.`);
      return;
    }

    // Readiness (0712): manual add is a deliberate user action, so pending
    // imports are allowed through — just warned about, never silently
    // excluded (unlike automatic generation, which does exclude them).
    const pendingAnalysisCount = tracksToAdd.filter(isPendingImportAnalysis).length;

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
      const safetyStr = unsafeCount > 0 ? ` Skipped ${describeSkipReport(safetyReport)}.` : "";
      const readinessStr = pendingAnalysisCount > 0
        ? ` ⚠ ${pendingAnalysisCount} added track${pendingAnalysisCount !== 1 ? "s are" : " is"} still analysis-pending.`
        : "";
      if (addedCount === 0) {
        showNotify(`No tracks added. ${skippedCount} duplicate${skippedCount !== 1 ? "s" : ""} already in ${targetTitle}.${safetyStr}`);
      } else if (skippedCount > 0) {
        showNotify(`Added ${addedCount} track${addedCount !== 1 ? "s" : ""} to ${targetTitle}. Skipped ${skippedCount} duplicate${skippedCount !== 1 ? "s" : ""}.${safetyStr}${readinessStr}`);
      } else {
        showNotify(`Added ${addedCount} track${addedCount !== 1 ? "s" : ""} to ${targetTitle}.${safetyStr}${readinessStr}`);
      }
    }, 0);
  }

  // ── Bulk library → playlist ────────────────────────────────────────────────
  function handleBulkAddTracksToPlaylist(targetPlaylistId: string, trackIds: string[]) {
    handleDropTracksOnPlaylist(targetPlaylistId, { type: "track", source: "library", trackIds });
  }

  function handleBulkCreatePlaylistFromTracks(trackIds: string[]) {
    const tbm = tracksById_live();
    const allResolved = trackIds.map((id) => tbm.get(id)).filter((t): t is Track => !!t);

    // Codec/playback safety (0709): filtered views can contain CODEC rows —
    // they must not enter the new playlist. Report skipped count.
    const { eligible: resolvedTracks, report: safetyReport, skippedCount: unsafeCount } =
      partitionEligibleTracks(allResolved, {
        playbackIssues: trackPlaybackIssuesRef.current,
      }, "new playlist from filtered");

    if (resolvedTracks.length === 0) {
      if (unsafeCount > 0) showNotify(`No playlist created — ${describeSkipReport(safetyReport)}.`);
      return;
    }

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
    showNotify(
      `Created "${title}" with ${resolvedTracks.length} track${resolvedTracks.length !== 1 ? "s" : ""}.` +
      (unsafeCount > 0 ? ` Skipped ${describeSkipReport(safetyReport)}.` : ""),
    );
  }

  // ── Add Music panel ───────────────────────────────────────────────────────
  const [showAddMusic, setShowAddMusic] = useState(false);
  const [showCrateMetadataPanel, setShowCrateMetadataPanel] = useState(false);
  const [metadataImportHistory, setMetadataImportHistory] = useState<MetadataImportRecord[]>(
    () => (loadPlayProject() as { metadataImportHistory?: MetadataImportRecord[] })?.metadataImportHistory ?? []
  );
  const metadataImportHistoryRef = useRef<MetadataImportRecord[]>([]);
  useEffect(() => { metadataImportHistoryRef.current = metadataImportHistory; }, [metadataImportHistory]);

  const externalRepairHistoryRef = useRef<import("./logic/externalIdentityRepair").ExternalIdentityRepairRecord[]>([]);
  useEffect(() => { externalRepairHistoryRef.current = externalRepairHistory; }, [externalRepairHistory]);

  const [externalBatchRepairHistory, setExternalBatchRepairHistory] = useState<import("./logic/externalIdentityBatchReview").ExternalIdentityBatchRepairRecord[]>(
    () => (loadPlayProject() as any)?.externalIdentityBatchRepairHistory ?? []
  );
  const externalBatchRepairHistoryRef = useRef<import("./logic/externalIdentityBatchReview").ExternalIdentityBatchRepairRecord[]>([]);
  useEffect(() => { externalBatchRepairHistoryRef.current = externalBatchRepairHistory; }, [externalBatchRepairHistory]);
  const ignoredIssueIdsRef = useRef<string[]>([]);
  useEffect(() => { ignoredIssueIdsRef.current = ignoredIssueIds; }, [ignoredIssueIds]);
  const deferredIssueIdsRef = useRef<string[]>([]);
  useEffect(() => { deferredIssueIdsRef.current = deferredIssueIds; }, [deferredIssueIds]);

  function handleApplyMetadataUpdates(updates: MetadataUpdate[]) {
    if (updates.length === 0) return;
    const trackMap = new Map(libraryTracksRef.current.map((t) => [t.trackId, t]));
    for (const u of updates) {
      const existing = trackMap.get(u.trackId);
      if (!existing) continue;
      // u.fields.camelotKey is validated upstream (metadataCsvImport's validateField)
      // to match the canonical camelot-key format, but is typed as plain `string`
      // there rather than the narrower `CamelotKey` template literal type — hence
      // the cast, not a real type violation.
      trackMap.set(u.trackId, { ...existing, ...u.fields } as Track);
    }
    const next = Array.from(trackMap.values());
    setLibraryTracks(next);
    savePlayProject(makeProj(playlistsRef.current, next, excludedTrackIdsRef.current));
  }

  function handleApplyImportPreview(
    preview: MetadataImportPreview,
    options: { selectedTrackIds?: Set<string>; forceConflictIds?: string[] },
  ): MetadataImportRecord {
    const oldTracks = libraryTracksRef.current;
    const { updatedTracks, importRecord } = applyImportPreview(preview, oldTracks, {
      safeOnly: true,
      selectedTrackIds: options.selectedTrackIds,
      forceConflictIds: options.forceConflictIds,
    });
    // Identify which track IDs had scoring-relevant fields updated
    const oldById = new Map(oldTracks.map((t) => [t.trackId, t]));
    const changedIds = new Set(
      updatedTracks
        .filter((t) => {
          const old = oldById.get(t.trackId);
          return (
            old &&
            (t.durationSeconds !== old.durationSeconds ||
              t.bpm !== old.bpm ||
              t.camelotKey !== old.camelotKey ||
              Math.abs((t.energy ?? 0) - (old.energy ?? 0)) > 0.001)
          );
        })
        .map((t) => t.trackId),
    );

    // Mark path options stale on playlists whose crate pool contains updated tracks
    const cratesMap = new Map(cratesRef.current.map((c) => [c.id, c]));
    const now = nowIso();
    const updatedPlaylists = playlistsRef.current.map((pl) => {
      if (!pl.crateIds?.length || !pl.pathOptions?.length || changedIds.size === 0) return pl;
      const poolTracks = resolveCratePool(pl.crateIds, cratesMap, oldTracks);
      const poolIds = new Set(poolTracks.map((t) => t.trackId));
      if (![...changedIds].some((id) => poolIds.has(id))) return pl;

      const newPoolTracks = resolveCratePool(pl.crateIds, cratesMap, updatedTracks);
      const beforeSnapshot = buildPlaylistGenerationMetadataSnapshot(
        poolTracks,
        pl.crateIds,
        importRecord.importId,
      );
      const afterSnapshot = buildPlaylistGenerationMetadataSnapshot(
        newPoolTracks,
        pl.crateIds,
        importRecord.importId,
      );
      const repairImpact: PlaylistMetadataRepairImpact = {
        latestImportId: importRecord.importId,
        beforeSnapshot,
        afterSnapshot,
        staleOptionCount: pl.pathOptions.length,
        createdAt: now,
      };
      const staleOptions = pl.pathOptions.map((opt) => ({
        ...opt,
        staleReason: "audiolab_import_applied" as const,
      }));
      return { ...pl, pathOptions: staleOptions, metadataRepairImpact: repairImpact };
    });

    // Collect coverage fields for the import record
    const affectedPlaylists = updatedPlaylists.filter((pl) => pl.metadataRepairImpact?.latestImportId === importRecord.importId);
    const affectedCrateIds = [...new Set(affectedPlaylists.flatMap((pl) => pl.crateIds ?? []))];
    const enrichedRecord: typeof importRecord = {
      ...importRecord,
      affectedCrateIds,
      affectedPlaylistIds: affectedPlaylists.map((pl) => pl.playlistId),
      staleOptionCount: affectedPlaylists.reduce((s, pl) => s + (pl.pathOptions?.length ?? 0), 0),
    };
    const enrichedHistory = [enrichedRecord, ...metadataImportHistoryRef.current.slice(1)];

    setLibraryTracks(updatedTracks);
    setMetadataImportHistory(enrichedHistory);
    setPlaylists(updatedPlaylists);
    savePlayProject(makeProj(updatedPlaylists, updatedTracks, excludedTrackIdsRef.current));
    return enrichedRecord;
  }

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
          targetBpm: t.bpm ?? 120,
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
    void (async () => {
      // Run startup assessment before applying state.
      // If assessment says prompt, show modal and wait for user choice.
      const assessment = await assessStartupRecovery();
      console.log("[MUSIC] Startup assessment:", assessment.severity, assessment.reasons);

      // Install window.MUSIC_DEBUG — must happen before any early return so debug
      // helpers are available even when the startup recovery prompt is showing.
      installMusicDebug(
        (p) => {
          const repaired = repairStoredProject(p);
          applyProject(repaired);
          savePlayProject(repaired, { reason: "debug_recovery" });
        },
        () => makeProj(playlistsRef.current, libraryTracksRef.current, excludedTrackIdsRef.current),
      );
      // Extend MUSIC_DEBUG with startup recovery tools and mood audit
      if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).MUSIC_DEBUG) {
        const dbg = (window as unknown as Record<string, unknown>).MUSIC_DEBUG as Record<string, unknown>;
        dbg.assessStartupRecovery = assessStartupRecovery;
        dbg.showStartupRecoveryPrompt = async () => {
          const a = await assessStartupRecovery();
          // Force prompt for debug inspection even if healthy
          setStartupRecovery({ ...a, shouldPrompt: true });
        };
        dbg.auditMoodVocabulary = () =>
          import("../src/logic/moodTaxonomy").then(({ auditMoodVocabulary }) =>
            auditMoodVocabulary(libraryTracksRef.current),
          );
        dbg.auditAutoMoodCrates = () =>
          auditAutoMoodCrates(cratesRef.current, libraryTracksRef.current);

        dbg.auditMoodCrateCounts = () =>
          auditMoodCrateCounts(cratesRef.current, libraryTracksRef.current);

        // 0715F_MUSIC_Sample_Accurate_Loop_Audition_And_Playhead_Synchronization
        // §6/§22 — live-verification access to wrap-observation statistics
        // (mean/max wrap-observation delay, mean/max visual-observation lag).
        // Deliberately named "observations", not "overshoot" — see
        // loopWrapDiagnostics.ts's doc comment for why JS/rAF cannot measure
        // actual audio-thread loop overshoot.
        dbg.getLoopWrapObservations = () => loopAudition.getWrapObservationSummary();

        dbg.getCrateByName = (name: string) => {
          const lower = name.toLowerCase();
          const crate = cratesRef.current.find((c) => c.name.toLowerCase() === lower);
          if (!crate) { console.warn(`[getCrateByName] no crate found: "${name}"`); return null; }
          const all = libraryTracksRef.current;
          const { tracks } = resolveCrateTracks(crate, all);
          const moodMatch = (t: (typeof all)[0]) =>
            (t.moodTags ?? []).some((m) => m.toLowerCase() === lower);
          const globalAllTagsCount = all.filter(moodMatch).length;
          // scopedAllTagsCount: global filtered to tracks whose sourceOwner is within this crate's scope
          const crateOwners = new Set(crate.sourceOwners as string[]);
          const scopedAllTagsCount = all.filter(
            (t) => crateOwners.has(t.sourceOwner ?? "") && moodMatch(t),
          ).length;
          const excludedByScopeCount = globalAllTagsCount - scopedAllTagsCount;
          const resolvedDelta = scopedAllTagsCount - tracks.length;
          const result = {
            id: crate.id,
            name: crate.name,
            kind: crate.kind,
            sourceOwners: crate.sourceOwners,
            moodTagFilter: crate.filters.moodTags,
            resolvedTrackCount: tracks.length,
            scopedAllTagsCount,
            globalAllTagsCount,
            excludedByScopeCount,
            resolvedDelta,
          };
          console.group(`[getCrateByName] "${crate.name}"`);
          console.table(result);
          if (excludedByScopeCount > 0) {
            console.info(
              `${excludedByScopeCount} tracks carry this mood globally but are excluded by this crate's source scope` +
              ` (sourceOwners: [${crate.sourceOwners.join(", ")}]).` +
              ` This is expected for a scoped crate. Use sourceScope: "all-separated" to see per-owner breakdown.`,
            );
          }
          if (resolvedDelta > 0) {
            console.warn(
              `resolvedTrackCount (${tracks.length}) < scopedAllTagsCount (${scopedAllTagsCount})` +
              ` — ${resolvedDelta} scoped tracks are excluded by additional crate filters (search, rating, playableOnly).`,
            );
          } else if (resolvedDelta === 0 && excludedByScopeCount === 0) {
            console.log("✓ resolvedTrackCount matches globalAllTagsCount — crate is fully in scope.");
          } else if (resolvedDelta === 0) {
            console.log("✓ resolvedTrackCount matches scopedAllTagsCount — crate is healthy within its scope.");
          }
          console.groupEnd();
          return result;
        };

        dbg.regenerateMoodCratesFromCurrentTags = (opts: {
          mode?: MoodCrateCountMode;
          excludeBalanced?: boolean;
          sourceScope?: MoodCrateSourceScope;
          dryRun?: boolean;
        } = {}) => {
          const { dryRun = false, ...rest } = opts;
          const result = regenerateMoodCratesFromCurrentTags(
            cratesRef.current,
            libraryTracksRef.current,
            rest,
          );
          const next = [...result.retained, ...result.created];
          console.group(`[regenerateMoodCratesFromCurrentTags]${dryRun ? " DRY RUN" : ""}`);
          console.log(
            `retained=${result.retained.length} created=${result.created.length}` +
            ` sourceScopeUpdated=${result.sourceScopeUpdated}` +
            ` droppedMixed=${result.droppedMixed.length}` +
            ` removedBalanced=${result.removedBalanced}`,
          );
          if (result.created.length) console.log("new crates:", result.created.map((c) => c.name));
          if (result.sourceScopeUpdated) console.log(`reset sourceOwners on ${result.sourceScopeUpdated} existing crates`);
          if (result.droppedMixed.length) console.warn("dropped mixed-source crates:", result.droppedMixed.map((c) => c.name));
          if (result.removedBalanced) console.warn("Balanced auto_mood crate removed (excludeBalanced=true)");
          console.log(`total crates after: ${next.length}`);
          console.groupEnd();

          if (!dryRun) {
            cratesRef.current = next;
            setCrates(next);
            savePlayProject(makeProj(playlistsRef.current, libraryTracksRef.current, excludedTrackIdsRef.current));
          }
          return result;
        };
        dbg.auditAutoMoodCrateSources = () => {
          const tracks = libraryTracksRef.current;
          const results = cratesRef.current
            .filter((c) => c.kind === "auto_mood")
            .map((crate) => {
              const { tracks: resolved } = resolveCrateTracks(crate, tracks);
              const cat = resolved.filter((t) => t.sourceOwner === "studiorich").length;
              const ext = resolved.filter((t) => t.sourceOwner === "external").length;
              const ref = resolved.filter((t) => t.sourceOwner === "reference").length;
              const other = resolved.length - cat - ext - ref;
              const isMixedConfigured = (crate.sourceOwners?.length ?? 0) > 1;
              const isMixedResolved = cat > 0 && ext > 0;
              return {
                name: crate.name,
                id: crate.id,
                sourceOwners: crate.sourceOwners,
                moodTagFilter: crate.filters.moodTags,
                resolvedTrackCount: resolved.length,
                resolvedSourceCounts: { cat, ext, ref, other },
                isMixedConfigured,
                isMixedResolved,
              };
            });
          const mixed = results.filter((r) => r.isMixedConfigured || r.isMixedResolved);
          console.group("[auditAutoMoodCrateSources]");
          console.table(results.map((r) => ({
            name: r.name,
            configured: r.sourceOwners.join(", "),
            total: r.resolvedTrackCount,
            cat: r.resolvedSourceCounts.cat,
            ext: r.resolvedSourceCounts.ext,
            mixedCfg: r.isMixedConfigured,
            mixedRes: r.isMixedResolved,
          })));
          if (mixed.length) {
            console.warn(`⚠ ${mixed.length} auto_mood crate(s) are mixed. Run resetAutoMoodCratesToCatalogOnly() to repair.`);
          } else {
            console.log("✓ All auto_mood crates are single-source.");
          }
          console.groupEnd();
          return results;
        };
        dbg.resetAutoMoodCratesToCatalogOnly = (dryRun = false) => {
          // dbg is a debug bag typed Record<string, unknown> — narrow-cast to the
          // exact signature assigned just above, not a blanket `any`.
          const regen = dbg.regenerateMoodCratesFromCurrentTags as (opts: {
            sourceScope?: MoodCrateSourceScope;
            excludeBalanced?: boolean;
            dryRun?: boolean;
          }) => unknown;
          return regen({
            sourceScope: "cat",
            excludeBalanced: true,
            dryRun,
          });
        };
        dbg.auditMoodSignals = () =>
          auditMoodSignals(libraryTracksRef.current);
        dbg.auditAudioAnalysis = () =>
          auditAudioAnalysis(libraryTracksRef.current);
        dbg.reanalyzeTrack = (trackId: string) => {
          const t = libraryTracksRef.current.find((x) => x.trackId === trackId);
          if (!t) { console.warn("track not found:", trackId); return null; }
          const updated = reanalyzeTrack(t);
          const next = libraryTracksRef.current.map((x) => x.trackId === trackId ? updated : x);
          libraryTracksRef.current = next;
          setLibraryTracks(next);
          savePlayProject(makeProj(playlistsRef.current, next));
          return updated;
        };
        dbg.reanalyzeMissing = () => {
          const next = reanalyzeMissing(libraryTracksRef.current);
          libraryTracksRef.current = next;
          setLibraryTracks(next);
          savePlayProject(makeProj(playlistsRef.current, next));
          console.info("[reanalyzeMissing] done");
        };
        installMoodAnalyzerDebug(dbg);

        dbg.auditTrackAnalysisFields = () =>
          auditTrackAnalysisFields(libraryTracksRef.current);

        dbg.countDspCoverage = () => {
          const tracks = libraryTracksRef.current;
          const n = tracks.length;
          const count = (fn: (t: Track) => boolean) => tracks.filter(fn).length;
          const pct = (c: number) => `${c} / ${n} (${n > 0 ? Math.round(c / n * 100) : 0}%)`;
          const report = {
            "audioAnalysis.rmsMean":         pct(count((t) => t.audioAnalysis?.rmsMean        != null)),
            "audioAnalysis.rmsEnergy":        pct(count((t) => t.audioAnalysis?.rmsEnergy      != null)),
            "audioAnalysis.spectralCentroid": pct(count((t) => t.audioAnalysis?.spectralCentroid != null)),
            "audioAnalysis.spectralRolloff":  pct(count((t) => t.audioAnalysis?.spectralRolloff  != null)),
            "audioAnalysis.zeroCrossingRate": pct(count((t) => t.audioAnalysis?.zeroCrossingRate != null)),
            "audioAnalysis.brightness":       pct(count((t) => t.audioAnalysis?.brightness       != null)),
            "audioAnalysis.onsetDensity":     pct(count((t) => t.audioAnalysis?.onsetDensity     != null)),
            "hasDspAnalysis (all required)":  pct(count((t) => {
              const aa = t.audioAnalysis;
              if (!aa) return false;
              return (aa.rmsEnergy != null || aa.rmsMean != null) &&
                     (aa.brightness != null || aa.spectralCentroid != null || aa.spectralCentroidNorm != null) &&
                     (aa.spectralBandwidth != null || aa.spectralBandwidthNorm != null || aa.spectralRolloff != null) &&
                     aa.zeroCrossingRate != null;
            })),
          };
          console.group("[countDspCoverage]");
          console.table(report);
          console.groupEnd();
          return report;
        };

        dbg.trackToAudioFeatures = (trackId: string) => {
          const t = libraryTracksRef.current.find((x) => x.trackId === trackId);
          if (!t) { console.warn("track not found:", trackId); return null; }
          const result = trackToAudioFeatures(t);
          console.group(`trackToAudioFeatures — ${t.title ?? trackId}`);
          console.log("features:", result.features);
          console.log("confidence:", result.confidence);
          console.log("warnings:", result.warnings);
          console.groupEnd();
          return result;
        };

        dbg.analyzeTrackMood = (trackId: string, force = false) => {
          const t = libraryTracksRef.current.find((x) => x.trackId === trackId);
          if (!t) { console.warn("track not found:", trackId); return null; }
          const result = analyzeTrackMood(t, { force });
          console.group(`analyzeTrackMood — ${t.title ?? trackId}`);
          console.log("features:", result.features);
          console.log("top 5 scores:", result.rankedScores.slice(0, 5).map(
            (s) => `${s.mood} ${(s.confidence * 100).toFixed(1)}%`,
          ));
          console.log("moodTags:", result.track.moodTags);
          console.log("suggestedMoods:", result.track.moodSuggestions);
          console.log("confidence:", result.confidence);
          console.log("warnings:", result.warnings);
          console.groupEnd();
          return result;
        };

        dbg.analyzeAllMissingMoods = (force = false) => {
          const result = analyzeAllMissingMoods(libraryTracksRef.current, { force });
          libraryTracksRef.current = result.tracks;
          setLibraryTracks(result.tracks);
          savePlayProject(makeProj(playlistsRef.current, result.tracks));
          return { analyzed: result.analyzed, skipped: result.skipped, failed: result.failed };
        };

        // ── DSP debug helpers ──────────────────────────────────────────────
        function findTrack(id: string) {
          return libraryTracksRef.current.find(
            (x) => x.trackId === id || (x as Record<string, unknown>).id === id || (x as Record<string, unknown>).objectId === id,
          ) ?? null;
        }

        function hasAudioSource(t: Track): boolean {
          const r = t as Record<string, unknown>;
          return !!(t.objectUrl ?? t.audioRelPath ?? t.filePath ?? r.audioUrl ?? r.path);
        }

        dbg.listTrackIds = (limit = 20) => {
          const rows = libraryTracksRef.current.slice(0, limit).map((t) => ({
            id: t.trackId,
            title: t.title ?? "(untitled)",
            artist: t.artist ?? "",
            bpm: t.bpm,
            energy: t.energy,
            camelotKey: t.camelotKey,
            hasAudioSource: hasAudioSource(t),
          }));
          console.table(rows);
          return rows;
        };

        dbg.extractDspFeatures = async (trackId: string) => {
          const t = findTrack(trackId);
          if (!t) { console.warn("[dbg] track not found:", trackId); return null; }
          if (!hasAudioSource(t)) {
            const msg = `[dbg] no audio source for "${t.title ?? trackId}" — set objectUrl or audioRelPath first`;
            console.warn(msg);
            return { audioAnalysis: null, warnings: [msg] };
          }
          console.group(`extractDspFeatures — ${t.title ?? trackId}`);
          const result = await extractDspFeatures(t);
          console.log("audioAnalysis:", result.audioAnalysis);
          console.log("warnings:", result.warnings);
          console.groupEnd();
          return result;
        };

        dbg.analyzeTrackDspFeatures = async (trackId: string, force = true) => {
          const t = findTrack(trackId);
          if (!t) { console.warn("[dbg] track not found:", trackId); return null; }
          const before = t.moodTags;
          const updated = await analyzeTrackDspFeatures(t, { forceMoodAnalysis: force });
          const next = libraryTracksRef.current.map((x) => x.trackId === t.trackId ? updated : x);
          libraryTracksRef.current = next;
          setLibraryTracks(next);
          savePlayProject(makeProj(playlistsRef.current, next));
          console.group(`analyzeTrackDspFeatures — ${t.title ?? trackId}`);
          console.log("moodTags before:", before);
          console.log("moodTags after:", updated.moodTags);
          console.log("audioAnalysis:", updated.audioAnalysis);
          console.log("suggestedMechanismTags:", updated.suggestedMechanismTags);
          console.groupEnd();
          return updated;
        };

        // 0714_MUSIC_Beat_Map_Confidence_Calibration §7/§27 — diagnostics
        // available to development tooling without a separate calibration
        // UI. Reads the track's already-persisted beatMap; does not
        // recompute or re-decode.
        dbg.diagnoseTrackBeatMap = (trackId: string) => {
          const t = findTrack(trackId);
          if (!t) { console.warn("[dbg] track not found:", trackId); return null; }
          const diagnostic = buildDiagnostic(trackId, "stable_electronic", t.beatMap, undefined, undefined);
          console.group(`diagnoseTrackBeatMap — ${t.title ?? trackId}`);
          console.log("status:", diagnostic.status, "trusted:", diagnostic.trusted);
          console.log("components:", diagnostic.confidence);
          console.log("dominantFailureCauses:", diagnostic.dominantFailureCauses);
          console.log("warnings:", diagnostic.warnings);
          console.groupEnd();
          return diagnostic;
        };

        // §21/§22 — regenerate the synthetic calibration report on demand
        // (dev tooling only; does not write to disk from the browser).
        dbg.runBeatMapCalibration = () => {
          const fixtures = buildSyntheticFixtures();
          const diagnostics = fixtures.map(diagnoseFixture);
          const summary = summarizeCalibration(diagnostics);
          console.table(diagnostics.map((d) => ({ fixture: d.trackId, class: d.trackClass, total: d.confidence.total, status: d.status })));
          console.log("summary:", summary);
          return { diagnostics, summary, markdown: buildCalibrationReportMarkdown(diagnostics) };
        };

        dbg.analyzeMissingDspFeatures = async (arg: AnalyzeMissingDspDebugArg = 10) => {
          const DSP_FIELDS = [
            "audioAnalysis.rmsMean", "audioAnalysis.rmsEnergy",
            "audioAnalysis.spectralCentroid", "audioAnalysis.spectralRolloff",
            "audioAnalysis.zeroCrossingRate",
          ] as const;
          const countDsp = (tracks: Track[]) => {
            const counts: Record<string, number> = {};
            for (const f of DSP_FIELDS) counts[f] = 0;
            for (const t of tracks) {
              if (t.audioAnalysis?.rmsMean           != null) counts["audioAnalysis.rmsMean"]++;
              if (t.audioAnalysis?.rmsEnergy         != null) counts["audioAnalysis.rmsEnergy"]++;
              if (t.audioAnalysis?.spectralCentroid  != null) counts["audioAnalysis.spectralCentroid"]++;
              if (t.audioAnalysis?.spectralRolloff   != null) counts["audioAnalysis.spectralRolloff"]++;
              if (t.audioAnalysis?.zeroCrossingRate  != null) counts["audioAnalysis.zeroCrossingRate"]++;
            }
            return counts;
          };
          const printCoverage = (label: string, counts: Record<string, number>, total: number, prev?: Record<string, number>) => {
            console.group(`[analyzeMissingDspFeatures] ${label}`);
            console.table(Object.fromEntries(DSP_FIELDS.map((f) => {
              const delta = prev ? ` (+${counts[f] - prev[f]})` : "";
              return [f, `${counts[f]} / ${total}${delta}`];
            })));
            console.groupEnd();
          };

          const totalLib = libraryTracksRef.current.length;
          const before = countDsp(libraryTracksRef.current);
          printCoverage("before coverage", before, totalLib);

          let result: Awaited<ReturnType<typeof analyzeMissingDspFeatures>> | null = null;
          try {
            result = await analyzeMissingDspFeatures(libraryTracksRef.current, arg);
          } finally {
            // Commit whatever was processed, even on early stop
            if (result) {
              libraryTracksRef.current = result.tracks;
              setLibraryTracks(result.tracks);
              savePlayProject(makeProj(playlistsRef.current, result.tracks, excludedTrackIdsRef.current));
            }
            const after = countDsp(libraryTracksRef.current);
            printCoverage("after coverage", after, totalLib, before);
            if (result) {
              console.group("[analyzeMissingDspFeatures] result");
              console.log(
                `analyzed=${result.analyzed} skipped=${result.skipped} failed=${result.failed}` +
                ` stoppedEarly=${result.stoppedEarly} libraryLength=${result.tracks.length}`,
              );
              if (result.stoppedEarly) console.warn(`stopReason: ${result.stopReason}`, `lastTrack:`, result.lastTrack);
              if (result.failedTracks.length) {
                console.group(`failedTracks (${result.failedTracks.length})`);
                console.table(result.failedTracks);
                console.groupEnd();
              }
              if (Object.keys(result.warningSummary).length) console.table(result.warningSummary);
              console.groupEnd();
            }
          }

          return result ? {
            analyzed: result.analyzed,
            skipped: result.skipped,
            failed: result.failed,
            stoppedEarly: result.stoppedEarly,
            stopReason: result.stopReason,
            lastTrack: result.lastTrack,
            failedTracks: result.failedTracks,
            beforeCoverage: before,
            afterCoverage: countDsp(libraryTracksRef.current),
            libraryLength: result.tracks.length,
            warningSummary: result.warningSummary,
          } : null;
        };

        dbg.listDspCandidates = (opts: { limit?: number; offset?: number; skipReference?: boolean } = {}) => {
          const { limit = 20, offset = 0, skipReference = false } = opts;
          const tracks = libraryTracksRef.current;
          const needsDsp = (t: (typeof tracks)[0]) => {
            const aa = t.audioAnalysis;
            if (!aa) return true;
            return !(
              (aa.brightness != null || aa.spectralCentroid != null || aa.spectralCentroidNorm != null) &&
              (aa.spectralBandwidth != null || aa.spectralBandwidthNorm != null || aa.spectralRolloff != null) &&
              aa.zeroCrossingRate != null &&
              (aa.rmsEnergy != null || aa.rmsMean != null)
            );
          };
          const hasAudio = (t: (typeof tracks)[0]) =>
            !!(t.objectUrl ?? (t as Record<string, unknown>).audioUrl ?? t.audioRelPath ?? t.filePath ?? (t as Record<string, unknown>).path);
          const isRef = (t: (typeof tracks)[0]) => {
            const r = t as Record<string, unknown>;
            for (const v of [r.sourceKind, r.sourceType, r.source, r.kind, r.libraryKind, r.category, t.sourceOwner]) {
              if (typeof v === "string" && ["reference","ref","external"].includes(v.toLowerCase())) return true;
            }
            return false;
          };
          let candidates = tracks.filter(needsDsp).filter(hasAudio);
          if (skipReference) candidates = candidates.filter((t) => !isRef(t));
          const slice = candidates.slice(offset, offset + limit);
          return slice.map((t) => ({
            id: t.trackId,
            title: t.title,
            artist: t.artist,
            sourceKind: (t as Record<string, unknown>).sourceKind ?? t.sourceOwner ?? "unknown",
            hasAudioSource: hasAudio(t),
            hasDspAnalysis: !needsDsp(t),
          }));
        };

        dbg.auditDspAudioSources = async (opts: { limit?: number; offset?: number; skipReference?: boolean } = {}) => {
          const results = await auditDspAudioSources(libraryTracksRef.current, opts);
          console.table(results.map((r) => ({
            title: r.title,
            urlSource: r.urlSource,
            resolvedUrl: r.resolvedUrl,
            existsStatus: r.existsStatus,
          })));
          return results;
        };

        dbg.getMoodAnalysisReviewRows = (opts: Parameters<typeof getMoodAnalysisReviewRows>[1] = {}) => {
          const rows = getMoodAnalysisReviewRows(libraryTracksRef.current, opts);
          console.table(rows.map((r) => ({
            title: r.title,
            source: r.sourceKind,
            dsp: r.hasDspAnalysis ? "✓" : "—",
            moodTags: r.moodTags.join(", "),
            topMood: r.topScores[0]?.mood ?? "—",
            topConf: r.topScores[0] ? `${Math.round(r.topScores[0].confidence * 100)}%` : "—",
            confidence: r.analysisConfidence != null ? `${Math.round(r.analysisConfidence * 100)}%` : "—",
            flags: r.calibrationFlags.join(", "),
            warnings: r.analysisWarnings.length,
          })));
          return rows;
        };

        dbg.printMoodAnalysisReviewRows = (opts: Parameters<typeof getMoodAnalysisReviewRows>[1] = {}) => {
          // dbg is a debug bag typed Record<string, unknown> — narrow-cast to the
          // exact signature assigned just above (single-arg wrapper), not a blanket `any`.
          const getRows = dbg.getMoodAnalysisReviewRows as (
            opts: Parameters<typeof getMoodAnalysisReviewRows>[1],
          ) => ReturnType<typeof getMoodAnalysisReviewRows>;
          return getRows(opts);
        };

        dbg.getMoodCalibrationSummary = () => {
          const summary = getMoodCalibrationSummary(libraryTracksRef.current);
          console.group("[getMoodCalibrationSummary]");
          console.log(`total=${summary.total} hasDsp=${summary.hasDsp} needsDsp=${summary.needsDsp} noSource=${summary.noAudioSource}`);
          console.log(`withWarnings=${summary.withWarnings} lowConfidence=${summary.lowConfidence}`);
          console.group("Primary mood (committed moodTags[0])");
          console.table(summary.primaryMoodCounts);
          console.groupEnd();
          console.group("Live primary mood (topScores[0])");
          console.table(summary.livePrimaryMoodCounts);
          console.groupEnd();
          console.group("Top-3 tag distribution (live scoring)");
          console.table(summary.top3TagCounts);
          console.groupEnd();
          console.group("Calibration flags");
          console.table(summary.calibrationFlagCounts);
          console.groupEnd();
          console.groupEnd();
          return summary;
        };

        dbg.snapshotMoodCalibration = (label?: string) => {
          const snap = snapshotMoodCalibration(libraryTracksRef.current, label);
          console.group(`[snapshotMoodCalibration] ${snap.label ?? "(unlabeled)"} — ${snap.createdAt}`);
          console.log(`total=${snap.total} avgConfidence=${snap.averageConfidence} lowConf=${snap.lowConfidenceCount}`);
          console.group("Top moods (primary)");
          console.table(snap.topMoodCounts);
          console.groupEnd();
          console.group("Tag counts");
          console.table(snap.tagCounts);
          console.groupEnd();
          console.group("Calibration flags");
          console.table(snap.calibrationFlagCounts);
          console.groupEnd();
          console.groupEnd();
          return snap;
        };

        dbg.compareMoodCalibrationSnapshots = (
          before: ReturnType<typeof snapshotMoodCalibration>,
          after: ReturnType<typeof snapshotMoodCalibration>,
        ) => {
          const diff = compareMoodCalibrationSnapshots(before, after);
          console.group(`[compareMoodCalibrationSnapshots] "${diff.beforeLabel ?? "before"}" → "${diff.afterLabel ?? "after"}"`);
          console.log(`confidenceDelta=${diff.confidenceDelta > 0 ? "+" : ""}${diff.confidenceDelta}`);
          console.group("Top mood delta");
          console.table(diff.topMoodDelta);
          console.groupEnd();
          console.group("Tag delta");
          console.table(diff.tagDelta);
          console.groupEnd();
          console.group("Flag delta");
          console.table(diff.flagDelta);
          console.groupEnd();
          console.groupEnd();
          return diff;
        };

        dbg.repairTrustedStaleMoodAssignments = (opts: { dryRun?: boolean; limit?: number } = {}) => {
          const { dryRun = false, limit = Infinity } = opts;
          const tracks = libraryTracksRef.current;

          type Example = { id: string; title: string; was: string; now: string; reason: string };
          let scanned = 0;
          let repaired = 0;
          let skippedWeak = 0;
          let skippedFallback = 0;
          const examples: Example[] = [];

          const next = tracks.map((t) => {
            if (repaired >= limit) return t;
            const row = buildMoodAnalysisReviewRow(t);
            scanned++;

            const isStale = row.calibrationFlags.includes("stale_mood_assignment");
            const isWeak  = row.calibrationFlags.includes("weak_live_mood_mismatch");
            const isFallback = row.calibrationFlags.includes("metadata_fallback") && !row.hasDspAnalysis;

            if (!isStale && !isWeak) return t;

            if (isWeak) { skippedWeak++; return t; }
            if (isFallback) { skippedFallback++; return t; }
            // Belt-and-suspenders: confirm trust gate independently of flag
            const trusted = row.hasDspAnalysis || (row.analysisConfidence ?? 0) >= 0.75;
            if (!trusted) { skippedWeak++; return t; }

            // Re-run mood analysis with force — picks up current vectors + penalties
            const result = analyzeTrackMood(t, { force: true });
            if (!result.features) { skippedFallback++; return t; }

            if (!dryRun) {
              repaired++;
              if (examples.length < 10) {
                examples.push({
                  id: t.trackId,
                  title: t.title ?? t.trackId,
                  was: row.moodTags[0] ?? "—",
                  now: result.track.moodTags?.[0] ?? "—",
                  reason: `hasDsp=${row.hasDspAnalysis} featConf=${row.analysisConfidence?.toFixed(2) ?? "?"}`,
                });
              }
              return result.track;
            } else {
              repaired++; // count as "would repair" in dry run
              if (examples.length < 10) {
                examples.push({
                  id: t.trackId,
                  title: t.title ?? t.trackId,
                  was: row.moodTags[0] ?? "—",
                  now: row.topScores[0]?.mood ?? "—",
                  reason: `DRY RUN hasDsp=${row.hasDspAnalysis} featConf=${row.analysisConfidence?.toFixed(2) ?? "?"}`,
                });
              }
              return t;
            }
          });

          if (!dryRun && repaired > 0) {
            libraryTracksRef.current = next;
            setLibraryTracks(next);
            savePlayProject(makeProj(playlistsRef.current, next, excludedTrackIdsRef.current));
          }

          const summary = { scanned, repaired, skippedWeak, skippedFallback, dryRun };
          console.group(`[repairTrustedStaleMoodAssignments]${dryRun ? " DRY RUN" : ""}`);
          console.log(`scanned=${scanned} repaired=${repaired} skippedWeak=${skippedWeak} skippedFallback=${skippedFallback}`);
          if (examples.length) {
            console.group("examples (up to 10)");
            console.table(examples);
            console.groupEnd();
          }
          console.groupEnd();
          return { ...summary, examples };
        };
      }

      // Recovery prompt only fires for genuine structural invalidity — see
      // musicStartupRecovery.ts. A valid state (regardless of how its counts
      // compare to any prior snapshot) loads directly and is recorded as the
      // accepted baseline, so this never re-litigates itself on the next
      // reload/dev-restart/rebuild (0712_MUSIC_Recovery_Screen_Removal §2.1).
      if (assessment.shouldPrompt) {
        setStartupRecovery(assessment);
        return;
      }

      const saved = assessment.currentState
        ? repairStoredProject(assessment.currentState)
        : await loadPlayProjectAsync();
      if (saved) {
        applyProject(saved);
        saveAcceptedLibraryState(saved);
      } else {
        console.warn("[MUSIC] No saved state found. Starting with defaults.");
      }
      hydrationReadyRef.current = true;
      setHasHydratedProject(true);

      // Index-wins hydration: for external/reference, if the library.index.json
      // has MORE tracks than what IDB restored, replace with the index.
      // This handles: stale/partial saves, first run.
      const savedTracks = saved?.libraryTracks ?? [];
      (["external", "reference"] as const).forEach(async (owner) => {
      const savedCount = savedTracks.filter((t) => t.sourceOwner === owner).length;
      const indexPath = `${__LIBRARY_ROOT__}/${owner}/library.index.json`;
      try {
        const resp = await fetch(`/library-data?path=${encodeURIComponent(indexPath)}`);
        if (!resp.ok) return;
        const tracks: Track[] = JSON.parse(await resp.text());
        if (!Array.isArray(tracks) || tracks.length === 0) return;
        // Index wins when count differs, filePaths drift, or index has analysis data that saved lacks
        const savedOwnerTracks = savedTracks.filter((t) => t.sourceOwner === owner);
        const indexById = new Map(tracks.map((t) => [t.trackId, t]));
        const pathsDiffer = savedOwnerTracks.some((s) => {
          const ix = indexById.get(s.trackId);
          return ix && ix.filePath && s.filePath && ix.filePath !== s.filePath;
        });
        const analysisDrifted = savedOwnerTracks.some((s) => {
          const ix = indexById.get(s.trackId);
          return ix && ix.analysisStatus === "analyzed" && !s.bpm;
        });
        const moodDrifted = savedOwnerTracks.some((s) => {
          const ix = indexById.get(s.trackId);
          const ixMood = ix ? ((ix as Record<string, unknown>).suggestedMood as unknown[]) : undefined;
          const sMood = (s as Record<string, unknown>).suggestedMood as unknown[] | undefined;
          return ix && Array.isArray(ixMood) && ixMood.length > 0 && (!Array.isArray(sMood) || sMood.length === 0);
        });
        if (tracks.length === savedCount && !pathsDiffer && !analysisDrifted && !moodDrifted) return;
        console.log(`[PLAY] Index wins for ${owner}: count=${tracks.length} vs ${savedCount}, pathsDiffer=${pathsDiffer}, analysisDrifted=${analysisDrifted}, moodDrifted=${moodDrifted}`);
        // Guard: do not save until hydration refs are synced
        if (!hydrationReadyRef.current) {
          console.warn(`[PLAY] Index wins fired before hydration ready — skipping save for ${owner}`);
          return;
        }
        setLibraryTracks((prev) => {
          const merged = [...prev.filter((t) => t.sourceOwner !== owner), ...tracks];
          libraryTracksRef.current = merged;
          savePlayProject(makeProj(playlistsRef.current, merged), { reason: "index_wins_hydration" });
          return merged;
        });
      } catch {
        // Index file absent or unreadable — skip silently
      }
    });

    // Sampler bank persistence: hydrate from filesystem index.
      // Banks file is the source of truth — merge any banks not already in IDB.
      const banksPath = `${__LIBRARY_ROOT__}/sampler-banks/banks.json`;
      try {
        const resp = await fetch(`/library-data?path=${encodeURIComponent(banksPath)}`);
        if (resp.ok) {
          const fsbanks: PlaylistRecord[] = JSON.parse(await resp.text());
          if (Array.isArray(fsbanks) && fsbanks.length > 0) {
            setPlaylists((prev) => {
              const existingIds = new Set(prev.map((p) => p.playlistId));
              const incoming = fsbanks.filter(
                (b) => b.playlistKind === "reference_overlay" && !existingIds.has(b.playlistId),
              );
              if (incoming.length === 0) return prev;
              console.log(`[PLAY] Hydrated ${incoming.length} sampler bank(s) from filesystem index`);
              const next = [...prev, ...incoming];
              playlistsRef.current = next;
              savePlayProject(makeProj(next), { reason: "sampler_bank_hydration" });
              return next;
            });
          }
        }
      } catch {
        // Banks file absent — skip silently
      }
    })();
  }, []);

  function applyProject(p: PlayProject) {
    libraryTracksRef.current = p.libraryTracks;
    setLibraryTracks(p.libraryTracks);
    setExcludedTrackIds(new Set(p.excludedTrackIds ?? []));
    const pls = p.playlists.length > 0 ? p.playlists : [makeDefaultPlaylist()];
    playlistsRef.current = pls;
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
    const loadedCrates = p.crates ?? [];
    cratesRef.current = loadedCrates;
    setCrates(loadedCrates);
    const loadedLoops = p.loops ?? [];
    loopsRef.current = loadedLoops;
    setLoops(loadedLoops);
    const loadedAudioExperiments = p.audioExperiments ?? [];
    audioExperimentsRef.current = loadedAudioExperiments;
    setAudioExperiments(loadedAudioExperiments);
    const loadedLoopRenders = p.loopRenders ?? [];
    loopRendersRef.current = loadedLoopRenders;
    setLoopRenders(loadedLoopRenders);
    // 0715D_MUSIC_0715C_Live_Verification_And_Typecheck_Process_Repair —
    // live-caught real defect: these three 0715C fields were only ever
    // seeded from the SYNC `loadPlayProject()` cache used in each
    // useState initializer, never re-applied here after the AUTHORITATIVE
    // async IndexedDB load resolves — so on a real page load, a
    // just-created revision (or draft, or Loop Bin view state) could be
    // silently reverted to a stale/empty snapshot, and any SUBSEQUENT save
    // would persist that emptiness over the real data.
    const loadedLoopWorkspaceDrafts = p.loopWorkspaceDrafts ?? [];
    loopWorkspaceDraftsRef.current = loadedLoopWorkspaceDrafts;
    setLoopWorkspaceDrafts(loadedLoopWorkspaceDrafts);
    const loadedLoopRevisions = p.loopRevisions ?? [];
    loopRevisionsRef.current = loadedLoopRevisions;
    setLoopRevisions(loadedLoopRevisions);
    const loadedSongAnalyses = p.songAnalyses ?? [];
    songAnalysesRef.current = loadedSongAnalyses;
    setSongAnalyses(loadedSongAnalyses);
    const loadedLoopBinViewState = p.loopBinViewState ?? { tab: "approved", filters: {}, sort: "start_time", updatedAt: nowIso() };
    loopBinViewStateRef.current = loadedLoopBinViewState;
    setLoopBinViewState(loadedLoopBinViewState);
    // 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation — same
    // mandatory re-seed step, same 0715C bug class: without this, the
    // authoritative async IndexedDB load could silently revert a
    // just-created Inbox item or RADIO playlist to the sync-cache snapshot.
    const loadedRadioInboxItems = p.radioInboxItems ?? [];
    radioInboxItemsRef.current = loadedRadioInboxItems;
    setRadioInboxItems(loadedRadioInboxItems);
    const loadedRadioPlaylists = p.radioPlaylists ?? [];
    radioPlaylistsRef.current = loadedRadioPlaylists;
    setRadioPlaylists(loadedRadioPlaylists);
    // 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows — same re-seed
    // step, plus a one-time additive, non-destructive backfill so any
    // pre-receipt-model Inbox item (sent under 0717D's now-removed picker)
    // gets a real receipt instead of silently vanishing from the dashboard.
    const loadedRadioBanks = p.radioBanks ?? [];
    radioBanksRef.current = loadedRadioBanks;
    setRadioBanks(loadedRadioBanks);
    const loadedRadioDashboardReceipts = migrateLegacyInboxItemsToReceipts(loadedRadioInboxItems, p.radioDashboardReceipts ?? []);
    radioDashboardReceiptsRef.current = loadedRadioDashboardReceipts;
    setRadioDashboardReceipts(loadedRadioDashboardReceipts);
    // 0718B_RADIO_Web_Publication_Asset_Export_Bridge — same re-seed step.
    const loadedRadioWebExports = p.radioWebExports ?? [];
    radioWebExportsRef.current = loadedRadioWebExports;
    setRadioWebExports(loadedRadioWebExports);
    // 0721_MUSIC_RADIO_Sectional_Loopchain_Player — same re-seed step.
    loopchainDraftRef.current = p.loopchainDraft;
    setLoopchainDraft(p.loopchainDraft);
    const loadedLoopchainSectionAcceptances = p.loopchainSectionAcceptances ?? [];
    loopchainSectionAcceptancesRef.current = loadedLoopchainSectionAcceptances;
    setLoopchainSectionAcceptances(loadedLoopchainSectionAcceptances);
    const loadedLoopchainObservations = p.loopchainObservations ?? [];
    loopchainObservationsRef.current = loadedLoopchainObservations;
    setLoopchainObservations(loadedLoopchainObservations);
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
    savePlayProject(repaired, { reason: "import_project" });
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
        const blocked = new Set<string>();
        for (const [id, issue] of Object.entries(trackPlaybackIssuesRef.current)) {
          if (issue.status === "unplayable") blocked.add(id);
        }
        const next = getNextPlayableSlot({ slots: ps, currentSlotIndex: currentSlotIdxRef.current, blockedTrackIds: blocked });
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
        const now = new Date().toISOString();
        const track = libraryTracksRef.current.find((t) => t.trackId === trackId);
        setTrackPlaybackIssues((prev) => {
          const existing = prev[trackId];
          const issue: TrackPlaybackIssue = {
            status: "unplayable", code, message: msg,
            detectedAt: existing?.detectedAt ?? now,
            firstSeenAt: existing?.firstSeenAt ?? now,
            lastSeenAt: now, lastCheckedAt: now,
            sourcePath: track ? (resolveTrackAudioUrl(track) ?? undefined) : existing?.sourcePath,
          };
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
        const probeUrl = track?.audioRelPath
          ? `/music-audio/${track.audioRelPath}`
          : track?.filePath ? getAudioUrl(track.filePath) : null;
        if (probeUrl) {
          fetch(probeUrl, { method: "HEAD" })
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

      // Auto-clear stale CODEC/unplayable issues (0709): if a flagged track
      // actually reaches 3s of real playback, the flag was stale — clear it.
      if (audio.currentTime >= 3 && !audio.paused) {
        const slotIdx = currentSlotIdxRef.current;
        const slot = slotIdx !== null ? playingSlotsRef.current[slotIdx] : undefined;
        const trackId = slot?.assignedTrackId;
        if (trackId && trackPlaybackIssuesRef.current[trackId]?.status === "unplayable") {
          setPlaybackErrors((prev) => { const n = new Map(prev); n.delete(trackId); return n; });
          setTrackPlaybackIssues((prev) => {
            const { [trackId]: _, ...rest } = prev;
            trackPlaybackIssuesRef.current = rest;
            return rest;
          });
          showNotify("Playback confirmed — CODEC issue cleared automatically.");
        }
      }

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
  // §19 — shared keyboard shortcuts must route through the same command
  // router as the visible transport controls, never command the standard
  // player directly once the engine holds authority.
  useEffect(() => {
    playActionRef.current = routedPlay;
    pauseActionRef.current = routedPause;
    stopActionRef.current = routedStop;
    nextActionRef.current = routedNext;
    prevActionRef.current = routedPrevious;
    transportIsPlayingRef.current = transportStatus === "playing";
    // Dual-Deck Control Edge-Case Verification — deterministic mid-transition
    // pause trigger, exposed for live verification only (see completion
    // report's "Next Recommended Step"). Not part of any user-facing UI.
    if (typeof window !== "undefined") {
      const w = window as unknown as { MUSIC_DEBUG?: Record<string, unknown> };
      if (w.MUSIC_DEBUG) w.MUSIC_DEBUG.armMidTransitionPause = preparedPlayback.armMidTransitionPause;
    }
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
        if (viewModeRef.current === "sectional_looper") return; // looper owns Space while open
        e.preventDefault();
        if (transportIsPlayingRef.current) pauseActionRef.current();
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

  // §30 — playback isolation: starting a loop preview must pause or duck
  // ANY currently active player (standard, prepared, or dual-deck engine)
  // rather than allowing hidden simultaneous playback.
  function handleBeforeLoopPreview() {
    audioRef.current?.pause();
    setPlaybackStatus("paused");
    if (preparedPlayback.authority === "dual_deck_engine") preparedPlayback.pause();
  }

  // 0714S §5-§9 — instantiated ONCE here at the App root (not inside
  // SectionalLooperWorkspace, which unmounts on navigation) so loop-preview
  // audio and its controls survive navigating anywhere else in MUSIC.
  // §9 — stopping audition must not silently resume prior playback.
  const loopAudition = useLoopAuditionController({
    onAcquire: handleBeforeLoopPreview,
    onRelease: () => {},
  });

  // 0717A §8.4 — a genuinely SEPARATE audition engine, instantiated once
  // here for the same "survive navigation" reason as loopAudition above,
  // but deliberately NOT wired through handleBeforeLoopPreview or any
  // other MUSIC-transport chokepoint (see radioLoopAudition.ts's own doc
  // comment and radioLoopAudition.isolation.test.ts).
  const radioLoopAudition = useRadioLoopAudition();

  // 0717A — lightweight nav badge count. The workspace itself fetches the
  // full row set on open; this is only for the sidebar's number badge.
  // 0717B — extracted into a named function so a promotion started from
  // Sectional Looper (which never mounts RadioLoopsWorkspace) can also
  // refresh it; still called once on mount exactly as before.
  const [radioLoopCount, setRadioLoopCount] = useState(0);
  function refreshRadioLoopCount() {
    fetch("/radio-library-index")
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { entries?: unknown[] } | null) => { if (json?.entries) setRadioLoopCount(json.entries.length); })
      .catch(() => {});
  }
  useEffect(() => {
    refreshRadioLoopCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 0717B §9 — "Open RadioLoops" navigation target from the Sectional
  // Looper bridge's completion state. Never depends on a filesystem path.
  // 0717D — RadioLoopsWorkspace is no longer a top-level destination.
  // 0718A — this now opens the RADIO Dashboard, which auto-opens the
  // "Published Loop Packages" escape-hatch panel whenever focusRadioLoopId
  // is set.
  const [focusRadioLoopId, setFocusRadioLoopId] = useState<string | undefined>(undefined);
  function openRadioLoops(radioLoopId?: string) {
    setFocusRadioLoopId(radioLoopId);
    setViewMode("radio");
  }

  // 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §12 — after a
  // successful first send or confirmed update-send, land on the RADIO
  // Dashboard (never a deep-linked playlist/bank editor) so the new/
  // refreshed grouped-receipt card is visible.
  const [focusRadioPlaylistId, setFocusRadioPlaylistId] = useState<string | undefined>(undefined);
  const [focusRadioBankId, setFocusRadioBankId] = useState<string | undefined>(undefined);

  function handleStop() {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    setPlaybackStatus("idle");
    setPlaybackError(undefined);
    setAudioTime(0);
  }

  // Codec/playback safety (0709): tracks with known unplayable issues are
  // skipped by queue advance — they never reach the audio element mid-mix.
  function blockedTrackIds_live(): Set<string> {
    const out = new Set<string>();
    for (const [id, issue] of Object.entries(trackPlaybackIssuesRef.current)) {
      if (issue.status === "unplayable") out.add(id);
    }
    return out;
  }

  function handleNext() {
    // Continuation runs on the PLAYING playlist (0622A), not the editor selection.
    const ps = playingSlotsRef.current;
    const next = getNextPlayableSlot({ slots: ps, currentSlotIndex: currentSlotIdxRef.current ?? -1, blockedTrackIds: blockedTrackIds_live() });
    if (next) playSlotDirect(next.slotIndex, ps, libraryTracksRef.current);
  }

  function handlePrevious() {
    const ps = playingSlotsRef.current;
    const prev = getPreviousPlayableSlot({ slots: ps, currentSlotIndex: currentSlotIdxRef.current ?? ps.length, blockedTrackIds: blockedTrackIds_live() });
    if (prev) playSlotDirect(prev.slotIndex, ps, libraryTracksRef.current);
  }

  function handleSeek(time: number) {
    if (audioRef.current) audioRef.current.currentTime = time;
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const tbm = new Map(libraryTracks.map((t) => [t.trackId, t]));
  const lockedTrackIds = new Set(locks.map((l) => l.trackId));

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
  // HUD/transport reflect the playing playlist; fall back to editor when idle.
  const hudPlaylist = playingPlaylist ?? activePlaylist;

  // Dual-Deck Playback (0714_MUSIC_Dual_Deck_Playback_And_Crossfade_Execution)
  // — delegates transition EXECUTION to the prepared-playback controller when
  // enabled; standard single-track playback above is otherwise unaffected.
  const currentPlayingSlot = currentSlotIdx !== null ? playingSlots[currentSlotIdx] : undefined;
  const preparedPlayback = usePreparedPlaybackController({
    enabled: preparedPlaybackEnabled && !!playingPlaylist,
    playlistId: playingPlaylist?.playlistId,
    slots: playingSlots,
    tracksById: tbm,
    preparation: playingPlaylist?.playbackPreparation,
    resolveTrackUrl: getTrackPlayUrl,
    blockedTrackIds: blockedTrackIds_live(),
    startAtSlotId: currentPlayingSlot?.slotId,
    standardPlaybackTimeSeconds: audioTime,
    onHandoffToEngine: () => { audioRef.current?.pause(); },
    onHandoffToStandard: () => { /* standard playback resumes via existing play/pause controls */ },
  });
  const preparedNextPlan = playingPlaylist?.playbackPreparation
    ? findOutgoingPlan(playingPlaylist.playbackPreparation, preparedPlayback.session?.currentSlotId)
    : undefined;
  const preparedNextTrack = preparedNextPlan ? tbm.get(preparedNextPlan.toTrackId) : undefined;

  // Dual-Deck Transport Authority Completion (0714_MUSIC_Dual_Deck_Transport_
  // Authority_Completion) — §20 transport command router. The UI must not
  // command both playback systems directly: route to whichever authority is
  // current, never both.
  const isEngineAuthority = preparedPlayback.authority === "dual_deck_engine";
  const routedPlay = () => { if (isEngineAuthority) { void preparedPlayback.resume(); } else { handlePlay(); } };
  const routedPause = () => { if (isEngineAuthority) { preparedPlayback.pause(); } else { handlePause(); } };
  const routedStop = () => { if (isEngineAuthority) { preparedPlayback.stop(); } else { handleStop(); } };
  const routedNext = () => { if (isEngineAuthority) { void preparedPlayback.skipNext(); } else { handleNext(); } };
  const routedPrevious = () => { if (isEngineAuthority) { void preparedPlayback.skipPrevious(); } else { handlePrevious(); } };
  const routedSeek = (t: number) => { if (isEngineAuthority) { preparedPlayback.seek(t); } else { handleSeek(t); } };
  // §24 — playlist row play buttons must not start a second, uncoordinated
  // standard-player session while the engine holds authority; release the
  // engine first so exactly one playback system is ever active.
  const routedPlayFromSlot = (slotIndex: number) => {
    if (isEngineAuthority) preparedPlayback.stop();
    handlePlayFromSlot(slotIndex);
  };
  // §8/§11 — displayed position/duration follow the current authority, never
  // a paused standard <audio> element after handoff.
  const transportPositionSeconds = isEngineAuthority ? (preparedPlayback.authorityState?.positionSeconds ?? audioTime) : audioTime;
  const transportDurationSeconds = isEngineAuthority ? (preparedPlayback.authorityState?.durationSeconds ?? audioDuration) : audioDuration;
  const transportStatus: PlaybackStatus = isEngineAuthority
    ? (preparedPlayback.authorityState?.isPlaying ? "playing" : preparedPlayback.authorityState?.isPaused ? "paused" : playbackStatus)
    : playbackStatus;

  // Playback Authority Surface and Control Completion (0714_MUSIC_Playback_
  // Authority_Surface_And_Control_Completion) — §8 shared surface snapshot;
  // every visible playback surface (main transport, secondary Now Playing,
  // playlist rows) derives from THIS, never independently from standard
  // player state after handoff.
  const playbackSurface = preparedPlayback.authorityState
    ? buildSurfaceSnapshot(preparedPlayback.authorityState, preparedPlayback.session, preparedPlayback.decks)
    : null;
  // §9/§17 — row highlighting must follow the engine's active slot after
  // handoff, not the standard player's currentSlotIdx (which the engine
  // advances independently and never writes back to).
  const engineActiveSlotIndex = isEngineAuthority && playbackSurface?.activeSlotId
    ? playingSlots.findIndex((s) => s.slotId === playbackSurface.activeSlotId)
    : -1;
  const effectiveSlotIdx = isEngineAuthority && engineActiveSlotIndex >= 0 ? engineActiveSlotIndex : currentSlotIdx;
  const effectiveCurrentTrack = isEngineAuthority && playbackSurface?.activeTrackId
    ? (tbm.get(playbackSurface.activeTrackId) ?? currentTrack)
    : currentTrack;

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
        items.push({ label: "New Bank", action: handleCreateSamplerBank });
      }
      return items;
    }
    if (viewMode === "playlists_grid") {
      return [
        { label: "New Playlist", action: handleCreatePlaylist },
        { label: "Build from Catalog", action: () => handleOpenPlaylistBuilder("studiorich") },
      ];
    }
    if (viewMode === "sampler_banks_grid") {
      return [
        { label: "New Bank", action: handleCreateSamplerBank },
      ];
    }
    return [];
  })();

  // ── Startup recovery handlers (0712_MUSIC_Recovery_Screen_Removal) ────────
  // The startup prompt only ever appears for a genuinely invalid/unreadable
  // state (see musicStartupRecovery.ts) — so its only actions are the three
  // from spec §4: download raw current data, restore an earlier snapshot,
  // or open a non-persisting temporary session.
  async function handleRecoveryRestoreSnapshot(id: string) {
    const state = id === "lastKnownGood" ? await loadLkgState() : await loadCheckpointState(id);
    if (!state) return;
    const repaired = repairStoredProject(state);
    applyProject(repaired);
    savePlayProject(repaired, { reason: id === "lastKnownGood" ? "startup_restore_last_known_good" : "startup_restore_checkpoint" });
    saveAcceptedLibraryState(repaired);
    setStartupRecovery(null);
    hydrationReadyRef.current = true;
    setHasHydratedProject(true);
  }

  function handleRecoveryDownloadCurrent() {
    const state = startupRecovery?.currentState;
    if (state) downloadStateAsJson(state, "Current");
  }

  // Opens MUSIC with a blank in-memory state WITHOUT persisting anything —
  // distinct from the removed "Start Blank" action, which immediately wrote
  // an empty state to storage (spec §2.6: creating/replacing a library is a
  // library-management action, not a recovery action).
  function handleOpenEmptyTemporarySession() {
    setStartupRecovery(null);
    hydrationReadyRef.current = true;
    setHasHydratedProject(true);
  }

  // ── Data Management → Backups & Recovery (user-initiated only) ───────────
  async function openDataManagement() {
    const [lkgRec, checkpoints] = await Promise.all([
      loadStateRecord("lastKnownGood"),
      listCheckpointSummaries(),
    ]);
    setDataManagementLkgSummary(lkgRec?.summary ?? null);
    setDataManagementCheckpoints(checkpoints);
    setShowDataManagement(true);
  }

  async function handleDataManagementRestore(id: string) {
    // Automatic current-state backup before any restore (spec §5.1).
    const currentSnapshot = makeProj(playlistsRef.current, libraryTracksRef.current, excludedTrackIdsRef.current);
    savePlayProject(currentSnapshot, { reason: "pre_restore_backup" });

    const state = id === "lastKnownGood" ? await loadLkgState() : await loadCheckpointState(id);
    if (!state) return;
    const repaired = repairStoredProject(state);
    applyProject(repaired);
    savePlayProject(repaired, { reason: "data_management_restore" });
    saveAcceptedLibraryState(repaired);
    setShowDataManagement(false);
  }

  function handleDataManagementDownloadSnapshot(id: string) {
    void (async () => {
      const state = id === "lastKnownGood" ? await loadLkgState() : await loadCheckpointState(id);
      if (state) downloadStateAsJson(state, id === "lastKnownGood" ? "LastKnownGood" : id);
    })();
  }

  function handleDataManagementDownloadCurrent() {
    const current = makeProj(playlistsRef.current, libraryTracksRef.current, excludedTrackIdsRef.current);
    downloadStateAsJson(current, "Current");
  }

  // 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation — Inbox/Playlist
  // handlers, mirroring the exact songAnalyses upsert/patch shape above.
  // Returns the resolved item (new or reused) so callers needing it
  // regardless of `created` — e.g. 0718A's individual-send handlers below,
  // which must add/reactivate a dashboard receipt even when the item
  // already existed — can act on it without re-resolving.
  function handleAddInboxItem(kind: RadioAssetKind, sourceRef: RadioInboxSourceRef): RadioInboxItem {
    const { item, created } = resolveOrCreateInboxItem(radioInboxItemsRef.current, kind, sourceRef);
    if (created) {
      const next = [...radioInboxItemsRef.current, item];
      radioInboxItemsRef.current = next;
      setRadioInboxItems(next);
      savePlayProject(makeProj(playlistsRef.current));
    }
    return item;
  }

  function handleUpdateRadioInboxItem(id: string, patch: Partial<RadioInboxItem>) {
    const next = radioInboxItemsRef.current.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: nowIso() } : i));
    radioInboxItemsRef.current = next;
    setRadioInboxItems(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  function handleUpdateRadioPlaylist(id: string, patch: Partial<RadioPlaylist>) {
    const next = radioPlaylistsRef.current.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: nowIso() } : p));
    radioPlaylistsRef.current = next;
    setRadioPlaylists(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  // 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §4/§8 — mirrors
  // handleUpdateRadioPlaylist exactly.
  function handleUpdateRadioBank(id: string, patch: Partial<RadioBank>) {
    const next = radioBanksRef.current.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: nowIso() } : b));
    radioBanksRef.current = next;
    setRadioBanks(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  function handleDismissRadioDashboardReceipt(receiptId: string) {
    const next = dismissReceipt(radioDashboardReceiptsRef.current, receiptId);
    radioDashboardReceiptsRef.current = next;
    setRadioDashboardReceipts(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  // 0718B_RADIO_Web_Publication_Asset_Export_Bridge — append-only history;
  // called ONLY with an already-validated RadioWebExportRecord (built by
  // radioWebBundleExportOrchestrator.ts's buildExportRecord after the
  // server confirms the bundle self-validated ok).
  function handleExportWebBundle(record: RadioWebExportRecord) {
    const next = [...radioWebExportsRef.current, record];
    radioWebExportsRef.current = next;
    setRadioWebExports(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  // 0721_MUSIC_RADIO_Sectional_Loopchain_Player — thin persistence wrappers,
  // same shape as every handler above. The player itself never touches
  // playProject state directly.
  function handleUpdateLoopchainDraft(next: LoopchainDraft) {
    loopchainDraftRef.current = next;
    setLoopchainDraft(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  function handleAcceptLoopchainSection(acceptance: RadioLoopchainSectionAcceptance) {
    const next = [...loopchainSectionAcceptancesRef.current, acceptance];
    loopchainSectionAcceptancesRef.current = next;
    setLoopchainSectionAcceptances(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  function handleRecordLoopchainObservation(observation: LoopchainObservation) {
    const next = [...loopchainObservationsRef.current, observation];
    loopchainObservationsRef.current = next;
    setLoopchainObservations(next);
    savePlayProject(makeProj(playlistsRef.current));
  }

  function handleOpenLoopchainPlayer(candidateSourceTrackIds: string[]) {
    setLoopchainCandidateSourceTrackIds(candidateSourceTrackIds);
    setViewMode("radio_loopchain_player");
  }

  // §6.3 — create-or-update a draft RADIO playlist. sendPlaylistToRadio
  // (pure) already computes the full merged Inbox array and the correct
  // playlist record (including the PUBLISHED-is-immutable new-draft
  // branch); this is a thin persistence wrapper, same shape as every other
  // handler above.
  function handleSendPlaylistToRadio(musicPlaylistId: string) {
    const musicPlaylist = playlistsRef.current.find((p) => p.playlistId === musicPlaylistId);
    if (!musicPlaylist) return;
    const existing = radioPlaylistsRef.current
      .filter((rp) => rp.sourceMusicPlaylistId === musicPlaylistId && rp.state !== "RETIRED")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
    const result = sendPlaylistToRadio(musicPlaylist, existing, radioInboxItemsRef.current, libraryTracksRef.current);

    radioInboxItemsRef.current = result.inboxItems;
    setRadioInboxItems(result.inboxItems);
    const nextPlaylists = existing && result.radioPlaylist.id === existing.id
      ? radioPlaylistsRef.current.map((rp) => (rp.id === result.radioPlaylist.id ? result.radioPlaylist : rp))
      : [...radioPlaylistsRef.current, result.radioPlaylist];
    radioPlaylistsRef.current = nextPlaylists;
    setRadioPlaylists(nextPlaylists);
    // 0718A §7 — a playlist send creates/reactivates exactly ONE receipt
    // for the playlist itself (never one per member), and only when the
    // sync actually changed something — an unchanged re-send stays a true
    // no-op, touching no receipt at all.
    if (result.changed) {
      const nextReceipts = addOrReactivateReceipt(radioDashboardReceiptsRef.current, "playlist", result.radioPlaylist.id, nowIso());
      radioDashboardReceiptsRef.current = nextReceipts;
      setRadioDashboardReceipts(nextReceipts);
    }
    savePlayProject(makeProj(playlistsRef.current));
  }

  // 0718A §4 — mirrors handleSendPlaylistToRadio exactly for banks.
  function handleSendBankToRadio(musicBankId: string) {
    const musicBank = playlistsRef.current.find((p) => p.playlistId === musicBankId);
    if (!musicBank) return;
    const existing = radioBanksRef.current.find((rb) => rb.sourceMusicBankId === musicBankId) ?? null;
    const result = sendBankToRadio(musicBank, existing, radioInboxItemsRef.current, libraryTracksRef.current);

    radioInboxItemsRef.current = result.inboxItems;
    setRadioInboxItems(result.inboxItems);
    const nextBanks = existing
      ? radioBanksRef.current.map((rb) => (rb.id === result.radioBank.id ? result.radioBank : rb))
      : [...radioBanksRef.current, result.radioBank];
    radioBanksRef.current = nextBanks;
    setRadioBanks(nextBanks);
    if (result.changed) {
      const nextReceipts = addOrReactivateReceipt(radioDashboardReceiptsRef.current, "bank", result.radioBank.id, nowIso());
      radioDashboardReceiptsRef.current = nextReceipts;
      setRadioDashboardReceipts(nextReceipts);
    }
    savePlayProject(makeProj(playlistsRef.current));
  }

  // 0718A §3/§12 — compare-before-send UX, relocated from RadioPlaylistsView
  // to MUSIC's own playlist card/detail click handlers. Unchanged re-sends
  // are a silent no-op (brief flash only, no dialog, no navigation);
  // changed re-sends require the explicit compare-and-confirm dialog; a
  // first send goes straight through and lands on the RADIO Dashboard.
  const [pendingRadioSend, setPendingRadioSend] = useState<
    | { kind: "playlist"; musicId: string; existingTitle: string; diff: RadioPlaylistUpdateDiff }
    | { kind: "bank"; musicId: string; existingTitle: string; diff: RadioBankUpdateDiff }
    | null
  >(null);

  function handleSendPlaylistToRadioClick(musicPlaylistId: string) {
    const musicPlaylist = playlistsRef.current.find((p) => p.playlistId === musicPlaylistId);
    if (!musicPlaylist) return;
    const existing = radioPlaylistsRef.current
      .filter((rp) => rp.sourceMusicPlaylistId === musicPlaylistId && rp.state !== "RETIRED")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0] ?? null;
    if (!existing) {
      handleSendPlaylistToRadio(musicPlaylistId);
      setFocusRadioPlaylistId(musicPlaylistId);
      setViewMode("radio");
      return;
    }
    const diff = compareMusicPlaylistToRadioPlaylist(musicPlaylist, existing, radioInboxItemsRef.current);
    if (!diff.orderChanged && !diff.membershipChanged) {
      handleSendPlaylistToRadio(musicPlaylistId);
      showFlashMsg("Already up to date in RADIO");
      return;
    }
    setPendingRadioSend({ kind: "playlist", musicId: musicPlaylistId, existingTitle: existing.title, diff });
  }

  function handleSendBankToRadioClick(musicBankId: string) {
    const musicBank = playlistsRef.current.find((p) => p.playlistId === musicBankId);
    if (!musicBank) return;
    const existing = radioBanksRef.current.find((rb) => rb.sourceMusicBankId === musicBankId) ?? null;
    if (!existing) {
      handleSendBankToRadio(musicBankId);
      setFocusRadioBankId(musicBankId);
      setViewMode("radio");
      return;
    }
    const diff = compareMusicBankToRadioBank(musicBank, existing, radioInboxItemsRef.current);
    if (!diff.orderChanged && !diff.membershipChanged) {
      handleSendBankToRadio(musicBankId);
      showFlashMsg("Already up to date in RADIO");
      return;
    }
    setPendingRadioSend({ kind: "bank", musicId: musicBankId, existingTitle: existing.title, diff });
  }

  function handleConfirmPendingRadioSend() {
    if (!pendingRadioSend) return;
    if (pendingRadioSend.kind === "playlist") {
      handleSendPlaylistToRadio(pendingRadioSend.musicId);
      setFocusRadioPlaylistId(pendingRadioSend.musicId);
    } else {
      handleSendBankToRadio(pendingRadioSend.musicId);
      setFocusRadioBankId(pendingRadioSend.musicId);
    }
    setPendingRadioSend(null);
    setViewMode("radio");
  }

  // 0718A §5/§13 — individual-asset sends reuse resolveOrCreateInboxItem
  // directly (not handleAddInboxItem, which historically returned early on
  // `created: false` — the receipt must still be added/reactivated on a
  // repeat direct send even when the underlying Inbox item already
  // existed, e.g. because it was first received only as a playlist/bank
  // member). addAssetReceipt is idempotent, so this never duplicates.
  function handleSendTrackToRadio(trackId: string) {
    const track = libraryTracksRef.current.find((t) => t.trackId === trackId);
    if (!track) return;
    const kind: RadioAssetKind = track.sourceOwner === "reference" ? "sound" : "track";
    const fingerprint = computeSourceFingerprint(track.audioRelPath ?? track.filePath, track.durationSeconds);
    const sourceRef: RadioInboxSourceRef = kind === "sound"
      ? { sourceSoundId: trackId, sourceFingerprint: fingerprint }
      : { sourceTrackId: trackId, sourceFingerprint: fingerprint };
    const item = handleAddInboxItem(kind, sourceRef);
    const nextReceipts = addAssetReceipt(radioDashboardReceiptsRef.current, item.id);
    radioDashboardReceiptsRef.current = nextReceipts;
    setRadioDashboardReceipts(nextReceipts);
    savePlayProject(makeProj(playlistsRef.current));
    showFlashMsg("Sent to RADIO");
  }

  function handleSendLoopToRadio(loopId: string) {
    const loop = loopsRef.current.find((l) => l.id === loopId);
    if (!loop) return;
    const sourceTrack = libraryTracksRef.current.find((t) => t.trackId === loop.sourceTrackId);
    const fingerprint = loop.sourceFingerprint ?? computeSourceFingerprint(sourceTrack?.audioRelPath ?? sourceTrack?.filePath, sourceTrack?.durationSeconds ?? 0);
    const item = handleAddInboxItem("loop", { sourceTrackId: loop.sourceTrackId, sourceLoopId: loop.id, sourceFingerprint: fingerprint });
    const nextReceipts = addAssetReceipt(radioDashboardReceiptsRef.current, item.id);
    radioDashboardReceiptsRef.current = nextReceipts;
    setRadioDashboardReceipts(nextReceipts);
    savePlayProject(makeProj(playlistsRef.current));
    showFlashMsg("Sent to RADIO");
  }

  // The RADIO multi-track prep workspace mounts the exact same
  // SectionalLooperWorkspace component the standalone page below uses, per
  // expanded row — built once here and reused by both call sites so they
  // can never drift apart.
  const radioLooperShared: RadioLooperSharedProps = {
    libraryTracks,
    resolveTrackUrl: getTrackPlayUrl,
    onSaveLoop: handleSaveLoop,
    onBeforeLoopPreview: handleBeforeLoopPreview,
    onRenderLoop: handleRenderLoop,
    getLoopRenderRecord,
    loops,
    loopAudition,
    loopWorkspaceDrafts,
    onSaveDraftSelection: handleSaveDraftSelection,
    onClearDraftSelection: handleClearDraftSelection,
    loopRevisions,
    onSaveLoopRevision: handleSaveLoopRevision,
    onMakeActiveRevision: handleMakeActiveRevision,
    loopBinViewState,
    onSaveLoopBinViewState: handleSaveLoopBinViewState,
    onPromoteToRadio: handlePromoteToRadio,
    onUpdateLoop: handleUpdateLoop,
    onOpenRadioLoops: openRadioLoops,
    refreshRadioLoopCount,
    songAnalyses,
    onUpdateSongAnalysis: handleUpdateSongAnalysis,
    ensureSongAnalysisReady,
    cancelSongAnalysis,
    recomputeSongAnalysisStatus,
    songAnalysisProgress,
  };

  return (
    <div className="app">
      {startupRecovery !== null && (
        <StartupRecoveryPrompt
          assessment={startupRecovery}
          onRestoreSnapshot={(id) => { void handleRecoveryRestoreSnapshot(id); }}
          onDownloadCurrent={handleRecoveryDownloadCurrent}
          onOpenEmptyTemporarySession={handleOpenEmptyTemporarySession}
        />
      )}
      {showDataManagement && (
        <DataManagementPanel
          currentSummary={summarizeMusicState(makeProj(playlists, libraryTracks, excludedTrackIds))}
          lastKnownGoodSummary={dataManagementLkgSummary}
          checkpointSummaries={dataManagementCheckpoints}
          onClose={() => setShowDataManagement(false)}
          onDownloadCurrent={handleDataManagementDownloadCurrent}
          onDownloadSnapshot={handleDataManagementDownloadSnapshot}
          onConfirmRestore={(id) => { void handleDataManagementRestore(id); }}
        />
      )}
      {importProgress && (
        <div className="import-progress-overlay">
          <div className="import-progress-box">
            <div className="import-progress-label">
              Importing {importProgress.done + 1} / {importProgress.total}
            </div>
            {importProgress.current && (
              <div className="import-progress-file">{importProgress.current}</div>
            )}
            <div className="import-progress-bar">
              <div
                className="import-progress-fill"
                style={{ width: `${((importProgress.done / importProgress.total) * 100).toFixed(1)}%` }}
              />
            </div>
          </div>
        </div>
      )}
      {notify && <div className="app-notify">{notify}</div>}
      {showNewPlaylistWizard && (
        <NewPlaylistWizard
          defaultTitle={newPlaylistDefaultTitle}
          crates={crates}
          libraryTracks={libraryTracks}
          trackPlaybackIssues={trackPlaybackIssues}
          onComplete={handleNewPlaylistWizardComplete}
          onCancel={() => setShowNewPlaylistWizard(false)}
        />
      )}
      {showImportAudioModal && (
        <ImportAudioModal
          onConfirm={(destination) => { setShowImportAudioModal(false); void handleImportAudio(destination); }}
          onCancel={() => setShowImportAudioModal(false)}
        />
      )}
      {importIntakeItems && (
        <ImportIntakePanel
          initialItems={importIntakeItems}
          crates={crates}
          resolveItemUrl={resolveIntakeItemUrl}
          onCommit={(result) => { handleCommitImportIntake(result); setImportIntakeItems(null); }}
          onCancel={() => setImportIntakeItems(null)}
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
        onOpenVersionHistory={() => { void openDataManagement(); }}
        currentProjectSummary={{ playlistCount: playlists.length, crateCount: crates.length, trackCount: libraryTracks.length }}
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
          crateCount={crates.length}
          onViewCrates={() => setViewMode("crates_grid")}
          artistCount={17}
          onImportAudioClick={() => setShowImportAudioModal(true)}
          loopCount={loops.length}
          radioPlaylistCount={radioPlaylists.length}
          radioBankCount={radioBanks.length}
        />

        {/* Right column — playlist header, flow curve, and all workspace content */}
        <div className={`workspace-right${viewMode === "playlist" && activePlaylist && (activePlaylist.artworkDisplayMode ?? "cover_only") !== "cover_only" ? ` workspace-right--atm workspace-right--atm-${activePlaylist.artworkDisplayMode}` : ""}`}>
          {viewMode === "playlist" && activePlaylist && activePlaylist.playlistKind !== "reference_overlay" && (
            <PlaylistAtmosphereLayer playlist={activePlaylist} />
          )}
          {viewMode === "playlist" && activePlaylist && activePlaylist.playlistKind !== "reference_overlay" && (
            <PlaylistHeader
              playlist={activePlaylist}
              libraryTracks={libraryTracks}
              flash={flash}
              onTitleChange={handlePlaylistTitleChange}
              onDescriptionChange={handlePlaylistDescriptionChange}
              onTargetDurationChange={handleTargetDurationChange}
              onPresetChange={handlePresetChange}
              onFillMissingTime={handleFillMissingTime}
              onRegenerateFromCurve={handleRegenerateFromCurve}
              blockedTrackCount={blockedTrackCount}
              onRemoveBlockedTracks={handleRemoveBlockedTracks}
              onExportM3u={handleExportM3u}
              onCoverImageChange={handlePlaylistCoverImageChange}
              onBackgroundImageChange={handlePlaylistBackgroundImageChange}
              onBroadcastBgChange={handlePlaylistBroadcastBgChange}
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
              libraryGaps={libraryGaps}
              onLibraryGapsChange={handleLibraryGapsChange}
              onReplaceSlot={handleReplaceSlot}
              onRepairStateChange={handleRepairStateChange}
              onReanalyzePlaylist={handleReanalyzePlaylist}
              onPreparationChange={handlePreparationChange}
              reanalysisProgress={reanalysisProgress}
              reanalysisRunning={reanalyzingPlaylistId === activePlaylist.playlistId}
              onAddMusic={() => {
                if (slots.length === 0) {
                  builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                } else {
                  setShowAddMusic(true);
                }
              }}
              onGoHome={() => setViewMode("playlists_grid")}
              onNewPlaylist={handleCreatePlaylist}
              crates={crates}
              cratePoolTracks={cratePoolTracks}
              onAddCrate={(crateId) => handleAddCrateToPlaylist(activePlaylist.playlistId, crateId)}
              onRemoveCrate={(crateId) => handleRemoveCrateFromPlaylist(activePlaylist.playlistId, crateId)}
              onOpenCrate={(crateId) => { setActiveCrateId(crateId); setViewMode("crate_detail"); }}
              onSetDuplicateRules={(rules) => handleSetDuplicateRules(activePlaylist.playlistId, rules)}
              onArcConfigChange={(config) => handleSetArcConfig(activePlaylist.playlistId, config)}
              onRegenerateWithSections={() => handleRegenerateWithSections(activePlaylist.playlistId)}
              pathOptions={activePlaylist.pathOptions ?? []}
              acceptedPathOptionId={activePlaylist.acceptedPathOptionId}
              isGeneratingOptions={generatingOptions}
              onGenerateOptions={handleGeneratePathOptions}
              onAcceptOption={handleAcceptPathOption}
              onDuplicateOption={handleDuplicatePathOption}
              onFixMetadata={() => setShowCrateMetadataPanel(true)}
              currentMetadataRevision={currentMetadataRevision}
              metadataRepairImpact={activePlaylist.metadataRepairImpact}
              playlistOptionsStaleReason={activePlaylist.playlistOptionsStaleReason}
              onArtworkDisplayModeChange={handleArtworkDisplayModeChange}
              recoveryWarning={true}
              onReviewRecovery={() => { void openDataManagement(); }}
              showOptionsPopup={showOptionsPopup}
              onOpenOptionsPopup={() => setShowOptionsPopup(true)}
              onCloseOptionsPopup={() => setShowOptionsPopup(false)}
              onSendToRadio={() => handleSendPlaylistToRadioClick(activePlaylist.playlistId)}
            />
          )}
          <div className={`workspace-main${viewMode === "playlist" && activePlaylist?.playlistKind !== "reference_overlay" ? " workspace-main--builder" : ""}${viewMode === "playlist" && Boolean(activePlaylist?.acceptedPathOptionId) && (activePlaylist?.slots.filter(s => s.assignedTrackId).length ?? 0) > 0 ? " workspace-main--accepted" : ""}`}>
          {showCoveragePanel && (
            <LibraryHealthPanel
              externalTracks={libraryTracks.filter((t) => t.sourceOwner === "external")}
              libraryTracks={libraryTracks}
              crates={crates}
              playlists={playlists}
              latestImport={metadataImportHistory[0]}
              repairHistory={externalRepairHistory}
              ignoredIssueIds={ignoredIssueIds}
              deferredIssueIds={deferredIssueIds}
              batchRepairHistory={externalBatchRepairHistory}
              onApplyRepairs={(updatedTracks, newRecords, batchRecord) => {
                const nextTracks = libraryTracks.map((t) => {
                  const u = updatedTracks.find((u) => u.trackId === t.trackId);
                  return u ?? t;
                });
                libraryTracksRef.current = nextTracks;
                setLibraryTracks(nextTracks);
                const nextHistory = [...externalRepairHistoryRef.current, ...newRecords].slice(-200);
                externalRepairHistoryRef.current = nextHistory;
                setExternalRepairHistory(nextHistory);
                if (batchRecord) {
                  const nextBatch = [batchRecord, ...externalBatchRepairHistoryRef.current].slice(0, 20);
                  externalBatchRepairHistoryRef.current = nextBatch;
                  setExternalBatchRepairHistory(nextBatch);
                }
                savePlayProject(makeProj(playlistsRef.current, nextTracks));
              }}
              onUpdateBatchHistory={(nextBatch) => {
                externalBatchRepairHistoryRef.current = nextBatch;
                setExternalBatchRepairHistory(nextBatch);
                savePlayProject(makeProj(playlistsRef.current));
              }}
              onIgnoreIssue={(id) => {
                const next = [...ignoredIssueIdsRef.current, id];
                ignoredIssueIdsRef.current = next;
                setIgnoredIssueIds(next);
                savePlayProject(makeProj(playlistsRef.current));
              }}
              onDeferIssue={(id) => {
                const next = [...deferredIssueIdsRef.current, id];
                deferredIssueIdsRef.current = next;
                setDeferredIssueIds(next);
                savePlayProject(makeProj(playlistsRef.current));
              }}
              onApplyImportPreview={handleApplyImportPreview}
              onApplyIntakeRepairs={(updatedTracks, _batch, newIgnored, newDeferred) => {
                const nextTracks = libraryTracks.map((t) => {
                  const u = updatedTracks.find((u) => u.trackId === t.trackId);
                  return u ?? t;
                });
                libraryTracksRef.current = nextTracks;
                setLibraryTracks(nextTracks);
                if (newIgnored.length) {
                  const next = [...ignoredIssueIdsRef.current, ...newIgnored];
                  ignoredIssueIdsRef.current = next;
                  setIgnoredIssueIds(next);
                }
                if (newDeferred.length) {
                  const next = [...deferredIssueIdsRef.current, ...newDeferred];
                  deferredIssueIdsRef.current = next;
                  setDeferredIssueIds(next);
                }
                savePlayProject(makeProj(playlistsRef.current, nextTracks));
              }}
              onClose={() => setShowCoveragePanel(false)}
            />
          )}
          {showCrateMetadataPanel && activePlaylist && cratePoolTracks.length > 0 && (
            <CrateMetadataPanel
              tracks={cratePoolTracks}
              poolName={activePlaylist.crateIds?.length === 1 ? "Crate Pool" : `${activePlaylist.crateIds?.length ?? 0} Crates`}
              onApplyUpdates={handleApplyMetadataUpdates}
              onApplyImportPreview={handleApplyImportPreview}
              onClose={() => setShowCrateMetadataPanel(false)}
              lastImportRecord={metadataImportHistory[0]}
            />
          )}
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
          {viewMode === "playlist" && activePlaylist && activePlaylist.playlistKind !== "reference_overlay" && (() => {
            const hasCrates = (activePlaylist.crateIds?.length ?? 0) > 0;
            if (hasCrates) {
              // Crate-controlled playlist: builder is suppressed; crate pool is the only candidate source.
              // Empty-output hint is shown inline within MainTrackWindow tabs.
              return null;
            }
            // Build from Filtered hidden (v1.1.0): crate/options is the primary path.
            return null;
          })()}
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
            const labels: Record<string, string> = { studiorich: "Catalog", external: "External", reference: "Sounds" };
            const unitLabel = owner === "reference" ? "clips" : "tracks";
            const sourceTracks = libraryTracks.filter((t) => t.sourceOwner === owner);
            const count = sourceTracks.length;
            const isUpdating = libraryUpdating === owner;
            const externalOpenIssues = owner === "external"
              ? computeOpenIssueCount(sourceTracks, metadataImportHistory[0]?.unmatchedRows_detail ?? [], ignoredIssueIds, deferredIssueIds)
              : 0;
            return (
              <div className="lib-page-header">
                <span className="lib-page-title">{labels[owner] ?? owner}</span>
                <span className="lib-page-count">{count} {unitLabel}</span>
                {owner === "external" && (
                  <button
                    className="lib-update-btn"
                    onClick={() => setShowCoveragePanel(true)}
                  >
                    {externalOpenIssues === 0 ? "Library Health: 0 issues" : `Library Health: ${externalOpenIssues} issue${externalOpenIssues !== 1 ? "s" : ""}`}
                  </button>
                )}
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

          {viewMode === "crates_grid" ? (
            <CratesGrid
              crates={crates}
              libraryTracks={libraryTracks}
              onOpen={(id) => { setActiveCrateId(id); setViewMode("crate_detail"); }}
              onDelete={handleDeleteCrate}
              onCreate={handleCreateCrate}
              onGenerateMoodCrates={handleGenerateMoodCrates}
            />
          ) : viewMode === "crate_detail" && activeCrateId ? (
            <CrateDetail
              crate={crates.find((c) => c.id === activeCrateId) ?? crates[0]}
              libraryTracks={libraryTracks}
              onChange={handleUpdateCrate}
              onDelete={handleDeleteCrate}
              onGoHome={() => setViewMode("crates_grid")}
              onNewCrate={handleCreateCrate}
              onAuditionTrack={handleAuditionTrack}
              onPause={handlePause}
              auditionTrackId={auditionTrackId}
              playbackStatus={playbackStatus}
            />
          ) : viewMode === "mood_signal_audit" ? (
            <MoodSignalAuditView
              tracks={libraryTracks}
              onPromoteSuggested={handlePromoteSuggested}
              onAssignMechanism={handleAssignMechanism}
              onImportAudio={handleImportAudio}
            />
          ) : viewMode === "analyzer_review" ? (
            <MoodAnalysisReviewView
              tracks={libraryTracks}
              onAnalyzeDsp={handleAnalyzerReviewDsp}
              onRerunMood={(id) => handleAnalyzerReviewMood(id, false)}
              onForceRerunMood={(id) => handleAnalyzerReviewMood(id, true)}
              onAnalyzeBatchDsp={handleAnalyzerReviewBatchDsp}
              onRerunBatchMood={handleAnalyzerReviewBatchMood}
              onAnalyzeAllMissing={handleAnalyzeAllMissingCatalog}
              onRetryFailed={handleRetryFailedAnalysis}
              batchProgress={dspBatchProgress}
            />
          ) : viewMode === "artists" ? (
            <ArtistLibraryPanel libraryTracks={libraryTracks} />
          ) : viewMode === "sectional_looper" ? (
            <SectionalLooperWorkspace
              libraryTracks={libraryTracks}
              sourceTrackId={looperSourceTrackId}
              onSelectSourceTrack={handleSelectLooperSourceTrack}
              resolveTrackUrl={getTrackPlayUrl}
              onSaveLoop={handleSaveLoop}
              onBeforeLoopPreview={handleBeforeLoopPreview}
              onRenderLoop={handleRenderLoop}
              getLoopRenderRecord={getLoopRenderRecord}
              loops={loops}
              loopAudition={loopAudition}
              loopWorkspaceDrafts={loopWorkspaceDrafts}
              onSaveDraftSelection={handleSaveDraftSelection}
              onClearDraftSelection={handleClearDraftSelection}
              loopRevisions={loopRevisions}
              onSaveLoopRevision={handleSaveLoopRevision}
              onMakeActiveRevision={handleMakeActiveRevision}
              loopBinViewState={loopBinViewState}
              onSaveLoopBinViewState={handleSaveLoopBinViewState}
              onPromoteToRadio={handlePromoteToRadio}
              onUpdateLoop={handleUpdateLoop}
              onOpenRadioLoops={openRadioLoops}
              refreshRadioLoopCount={refreshRadioLoopCount}
              songAnalyses={songAnalyses}
              onUpdateSongAnalysis={handleUpdateSongAnalysis}
              ensureSongAnalysisReady={ensureSongAnalysisReady}
              cancelSongAnalysis={cancelSongAnalysis}
              recomputeSongAnalysisStatus={recomputeSongAnalysisStatus}
              songAnalysisProgress={songAnalysisProgress}
            />
          ) : viewMode === "loop_library" ? (
            <LoopLibraryView
              loops={loops}
              libraryTracks={libraryTracks}
              resolveTrackUrl={getTrackPlayUrl}
              onUpdateLoop={handleUpdateLoop}
              onOpenSourceTrack={(trackId) => { setViewMode("library"); void trackId; }}
              onReopenInLooper={(trackId) => { handleSelectLooperSourceTrack(trackId); setViewMode("sectional_looper"); }}
              onBeforeLoopPreview={handleBeforeLoopPreview}
              onDeleteRenderedFile={handleDeleteLoopRenderedFile}
              loopRenders={loopRenders}
              onRenderLoop={handleRenderLoop}
              onRenderAllApproved={handleRenderAllApproved}
              loopRevisions={loopRevisions}
              onPromoteToRadio={handlePromoteToRadio}
              onSendLoopToRadio={handleSendLoopToRadio}
            />
          ) : viewMode === "radio" ? (
            <RadioDashboardView
              key={focusRadioLoopId ?? focusRadioPlaylistId ?? focusRadioBankId ?? "radio-default"}
              radioInboxItems={radioInboxItems}
              radioPlaylists={radioPlaylists}
              radioBanks={radioBanks}
              radioDashboardReceipts={radioDashboardReceipts}
              libraryTracks={libraryTracks}
              loops={loops}
              publishedLoopPackageCount={radioLoopCount}
              onOpenPlaylists={() => setViewMode("radio_playlists_grid")}
              onOpenBanks={() => setViewMode("radio_banks_grid")}
              onDismissReceipt={handleDismissRadioDashboardReceipt}
              onOpenSourceLoop={(trackId) => { handleSelectLooperSourceTrack(trackId); setViewMode("sectional_looper"); }}
              audition={radioLoopAudition}
              focusRadioLoopId={focusRadioLoopId}
            />
          ) : viewMode === "radio_playlists_grid" ? (
            <RadioPlaylistsView
              radioPlaylists={radioPlaylists}
              radioInboxItems={radioInboxItems}
              libraryTracks={libraryTracks}
              songAnalyses={songAnalyses}
              radioWebExports={radioWebExports}
              onUpdateRadioPlaylist={handleUpdateRadioPlaylist}
              onUpdateRadioInboxItem={handleUpdateRadioInboxItem}
              onExportWebBundle={handleExportWebBundle}
              looperShared={radioLooperShared}
              onOpenLoopchainPlayer={handleOpenLoopchainPlayer}
            />
          ) : viewMode === "radio_loopchain_player" ? (
            <RadioLoopchainPlayer
              candidateSourceTrackIds={loopchainCandidateSourceTrackIds}
              libraryTracks={libraryTracks}
              songAnalyses={songAnalyses}
              draft={loopchainDraft}
              onUpdateDraft={handleUpdateLoopchainDraft}
              sectionAcceptances={loopchainSectionAcceptances}
              onAcceptSection={handleAcceptLoopchainSection}
              observations={loopchainObservations}
              onRecordObservation={handleRecordLoopchainObservation}
              getDecodedSourceBufferForRender={getDecodedSourceBufferForRender}
              onBack={() => setViewMode("radio_playlists_grid")}
            />
          ) : viewMode === "radio_banks_grid" ? (
            <RadioBanksView
              radioBanks={radioBanks}
              radioInboxItems={radioInboxItems}
              libraryTracks={libraryTracks}
              onUpdateRadioBank={handleUpdateRadioBank}
            />
          ) : viewMode === "collections_overview" ? (
            <CollectionsOverview
              crateCount={crates.length}
              playlistCount={playlists.filter((pl) => pl.playlistKind !== "reference_overlay").length}
              bankCount={playlists.filter((pl) => pl.playlistKind === "reference_overlay").length}
              onViewCrates={() => setViewMode("crates_grid")}
              onViewPlaylists={() => setViewMode("playlists_grid")}
              onViewBanks={() => setViewMode("sampler_banks_grid")}
            />
          ) : viewMode === "playlists_grid" ? (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "8px 16px 0", gap: 8 }}>
                <button className="tb-btn" onClick={() => handleOpenPlaylistBuilder("studiorich")}>
                  Build from Catalog
                </button>
              </div>
              <PlaylistsGrid
                playlists={playlists.filter((pl) => pl.playlistKind !== "reference_overlay")}
                libraryTracks={libraryTracks}
                activePlaylistId={activePlaylistId}
                onOpen={(id) => { setActivePlaylistId(id); setViewMode("playlist"); }}
                onPlay={(id) => handleSelectPlaylist(id)}
                onDuplicate={handleDuplicatePlaylist}
                onDelete={handleDeletePlaylist}
                onCreate={handleCreatePlaylist}
                onSendToRadio={handleSendPlaylistToRadioClick}
              />
            </div>
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
              onSendToRadio={handleSendBankToRadioClick}
            />
          ) : viewMode === "playlist" && activePlaylist?.playlistKind === "reference_overlay" ? (
            <SamplerBankView
              bank={activePlaylist}
              libraryTracks={libraryTracks}
              onLoadInSampler={handleLoadSampler}
              onAddReferenceTracksToBank={handleAddTracksToSamplerBank}
              referenceTrackCount={libraryTracks.filter((t) => t.sourceOwner === "reference").length}
              onGoHome={() => setViewMode("sampler_banks_grid")}
              onNewBank={handleCreateSamplerBank}
              onDeleteBank={() => {
                handleDeletePlaylist(activePlaylist.playlistId);
                setViewMode("sampler_banks_grid");
              }}
              onSendToRadio={handleSendBankToRadioClick}
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
            nowPlayingSlotIndex={isEditingPlayingPlaylist ? effectiveSlotIdx : null}
            hoveredSlotIndex={hoveredSlotIndex}
            selectedSlotIndex={selectedSlotIdx}
            playbackErrors={playbackErrors}
            trackPlaybackIssues={trackPlaybackIssues}
            onToggleLock={handleToggleLock}
            onExclude={handleExclude}
            onRestore={handleRestore}
            onRemove={handleRemove}
            onRestoreOrphan={handleRestoreOrphan}
            onLockChange={handleLockChange}
            onPlayFromSlot={routedPlayFromSlot}
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
            onRecheckPlaybackIssue={handleRecheckPlaybackIssue}
            onBulkRecheckCodecIssues={handleBulkRecheckCodecIssues}
            bulkRechecking={bulkRechecking}
            onBulkUpdate={handleBulkUpdateTracks}
            onCreateLibraryGroup={handleCreateLibraryGroupFromSelection}
            onGenerateMoodSuggestions={handleGenerateMoodSuggestionsForTracks}
            onApplyMoodSuggestions={handleApplyMoodSuggestionsToTracks}
            onRestoreSuggestionsFromImport={handleRestoreSuggestionsFromImport}
            onRestoreSuggestionsFromMechanical={handleRestoreSuggestionsFromMechanical}
            onClearSuggestedMoods={handleClearSuggestedMoods}
            onCreateLoops={(trackId) => { handleSelectLooperSourceTrack(trackId); setViewMode("sectional_looper"); }}
            onImportStems={handleImportStems}
            onAuditionTrack={handleAuditionTrack}
            onAuditionAndAdd={handleAuditionAndAdd}
            auditionTrackId={auditionTrackId}
            playbackStatus={playbackStatus}
            onPauseTrack={handlePause}
            onResumeTrack={handlePlay}
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
            cratePoolTracks={cratePoolTracks}
            isAcceptedMode={Boolean(activePlaylist?.acceptedPathOptionId) && (activePlaylist?.slots.filter(s => s.assignedTrackId).length ?? 0) > 0}
            onSendTrackToRadio={handleSendTrackToRadio}
          />
          )}
          {viewMode === "playlist" && (
            <PlaylistDeck
              playlistTitle={activePlaylist?.title ?? ""}
              slots={slots}
              tracksById={tbm}
              nowPlayingSlotIndex={isEditingPlayingPlaylist ? effectiveSlotIdx : null}
              playbackStatus={transportStatus ?? "idle"}
              currentTimeSeconds={transportPositionSeconds}
              durationSeconds={transportDurationSeconds}
              volume={musicVolume}
              isPlayingThisPlaylist={isEditingPlayingPlaylist}
              onPlayFromSlot={routedPlayFromSlot}
              onPause={routedPause}
              onResume={routedPlay}
              onSeek={routedSeek}
              onVolumeChange={setMusicVolume}
              onRateTrack={handleRateTrack}
            />
          )}
        </div>
          {Boolean(activePlaylist?.acceptedPathOptionId) && (activePlaylist?.slots.filter(s => s.assignedTrackId).length ?? 0) > 0 && viewMode === "playlist" && (
            <PlaylistLowerPanel
              playlist={activePlaylist!}
              slots={slots}
              tracksById={tbm}
              locks={locks}
              crates={crates}
              cratePoolTracks={cratePoolTracks}
              nowPlayingSlotIndex={isEditingPlayingPlaylist ? effectiveSlotIdx : null}
              hoveredSlotIndex={hoveredSlotIndex}
              selectedSlotIndex={selectedSlotIdx}
              onNodeHoverChange={setHoveredSlotIndex}
              onNodeClick={(idx) => setSelectedSlotIdx((prev) => prev === idx ? null : idx)}
              onUpdateNotes={(notes) => handleUpdatePlaylistNotes(activePlaylistId, notes)}
              eligibilityContext={{ playbackIssues: trackPlaybackIssues, excludedTrackIds: excludedTrackIdsRef.current }}
              acceptedOption={
                activePlaylist?.acceptedPathOptionId
                  ? activePlaylist.pathOptions?.find(o => o.id === activePlaylist.acceptedPathOptionId) ?? null
                  : null
              }
              hasGeneratedOptions={(activePlaylist?.pathOptions?.length ?? 0) > 0}
              isOptionsStale={!!(activePlaylist?.playlistOptionsStaleReason && activePlaylist.playlistOptionsStaleReason !== "options_never_generated")}
              onOpenOptions={() => setShowOptionsPopup(true)}
              onRegenerate={handleGeneratePathOptions}
            />
          )}
        </div>{/* end workspace-right */}
      </div>}

      {/* Player + Sampler — always mounted so audio survives workspace navigation.
          Hidden (not unmounted) in broadcast_hud so audio keeps playing. */}
      <div className={`player-sampler-bar${workspaceMode === "broadcast_hud" ? " player-sampler-bar--hidden" : ""}`}>
        {loopAudition.session && (
          // 0714S §7/§8 — persistent, navigation-safe loop-audition
          // transport, rendered in the ALWAYS-MOUNTED bar so it stays
          // visible and controllable no matter what viewMode is active.
          <LoopAuditionBar
            session={loopAudition.session}
            loopIteration={loopAudition.loopIteration}
            onPause={loopAudition.pause}
            onResume={loopAudition.resume}
            onStop={loopAudition.stop}
            onPrevious={loopAudition.previous}
            onNext={loopAudition.next}
            onOpenInLooper={() => {
              handleSelectLooperSourceTrack(loopAudition.session!.sourceTrackId);
              setViewMode("sectional_looper");
            }}
          />
        )}
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
            status={transportStatus}
            currentSlotIndex={effectiveSlotIdx}
            currentTrack={effectiveCurrentTrack}
            errorMessage={playbackError}
            totalSlots={playingPlaylist ? playingSlots.length : slots.length}
            currentTimeSeconds={transportPositionSeconds}
            durationSeconds={transportDurationSeconds}
            volume={musicVolume}
            onPlay={routedPlay}
            onPause={routedPause}
            onStop={routedStop}
            onNext={routedNext}
            onPrevious={routedPrevious}
            onPlayFromSlot={routedPlayFromSlot}
            onSeek={routedSeek}
            onVolumeChange={setMusicVolume}
            onRateTrack={handleRateTrack}
          />
          {playingPlaylist && (
            <PreparedPlaybackStatus
              enabled={preparedPlaybackEnabled}
              onToggle={setPreparedPlaybackEnabled}
              session={preparedPlayback.session}
              decks={preparedPlayback.decks}
              currentTrack={effectiveCurrentTrack}
              nextTrack={preparedNextTrack}
              nextPlan={preparedNextPlan}
              authority={preparedPlayback.authority}
              authorityState={preparedPlayback.authorityState}
              authorityEvents={preparedPlayback.authorityEvents}
              jitterMetrics={preparedPlayback.jitterMetrics}
              lifecycleMetrics={preparedPlayback.lifecycleMetrics}
              handoffPhase={preparedPlayback.handoffPhase}
              handoffFailureReason={preparedPlayback.handoffFailureReason}
              runtimeFallback={preparedPlayback.runtimeFallback}
            />
          )}
        </div>
        {samplerBank && (
        <div className={`sampler-panel${!samplerVisible ? " sampler-panel--collapsed" : ""}`}>
          {samplerVisible && (
            <div className="player-panel-label">Sampler</div>
          )}
          <SamplerPlayer
            bank={samplerBank}
            libraryTracks={libraryTracks}
            collapsed={!samplerVisible}
            onCollapse={() => setSamplerVisible(false)}
            onExpand={() => setSamplerVisible(true)}
            onClear={() => { setSamplerBank(null); setSamplerVisible(false); }}
          />
        </div>
        )}
      </div>

      {/* 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §3/§4/§12 —
          explicit update-comparison, shared verbatim between playlist and
          bank sends. Confirming re-syncs via handleConfirmPendingRadioSend;
          dismissing leaves the RADIO record untouched. */}
      {pendingRadioSend && (
        <RadioPlaylistUpdateCompareDialog
          diff={pendingRadioSend.diff}
          radioPlaylistTitle={pendingRadioSend.existingTitle}
          libraryTracks={libraryTracks}
          kindLabel={pendingRadioSend.kind}
          onConfirm={handleConfirmPendingRadioSend}
          onCancel={() => setPendingRadioSend(null)}
        />
      )}

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
