// 0721_MUSIC_RADIO_Sectional_Loopchain_Player, upgraded by
// 0722A_RADIOOS_Loopchain_Player_Web_Demo into a followable listening
// instrument. Still a listening instrument, not a publishing surface:
// nothing here renders assets, touches RADIO export, or adds an approval
// layer. Doctrine §6/§7 — normal state stays quiet;
// `review`/`loopable`/`forward_only` are honest status labels, never a
// pass/fail badge; listening/seeking never mutates anything beyond this
// screen's own local draft/acceptance/observation/feedback state (the one
// exception, per §2.1, is the mount-time intro/outro normalization repair
// write — a data-integrity fix, not a side effect of listening).

import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "../../data/trackTypes";
import type { CompleteSongAnalysis, SongSection, SongStructuralType } from "../../data/songAnalysisTypes";
import type {
  LoopchainDraft, LoopchainBlock, LoopchainJunction, LoopchainRepeatMode, LoopchainRepeatPreference,
  LoopchainTransitionRequest, LoopchainResolvedTransitionDecision,
  RadioLoopchainSectionAcceptance, LoopchainObservation,
} from "../../data/radioLoopchainTypes";
import type { LoopchainListenerFeedback, LoopchainFeedbackTarget } from "../../data/loopchainFeedbackTypes";
import { resolveActiveSongSection } from "../../logic/songAnalysis/songSectionRevisions";
import { resolveSectionPlayability, buildSectionAcceptance, type CurrentSectionBounds } from "../../logic/radio/radioSectionPlayability";
import {
  addBlock, reorderBlock, duplicateBlock, removeBlock, setBlockRepeatMode, setBlockRepeatPreference,
  formatBlockLabel, type AddBlockResult,
} from "../../logic/radio/radioLoopchainEditor";
import { resolveRepeatPreference } from "../../logic/radio/radioLoopchainRepeatPreference";
import { normalizeIntroOutroSingleUse, type LoopchainNormalizationWarning } from "../../logic/radio/radioLoopchainNormalization";
import { resolveTransitionTiming, type JunctionGridInput } from "../../logic/radio/radioLoopchainTransitionResolver";
import { chainTimeToOccurrence, occurrenceSourceTimeToChainTime } from "../../logic/radio/radioLoopchainTimeMapping";
import { computeCueWindow } from "../../logic/radio/radioLoopchainCueWindow";
import { recordChainPlayed, recordEarlyStop, recordJunctionAudition, recordEnduranceCompleted } from "../../logic/radio/radioLoopchainObservations";
import { recordSave, recordLessLikeThis, recordComment } from "../../logic/radio/radioLoopchainFeedback";
import {
  LoopchainPlaybackEngine, buildLoopchainSchedule, buildOccurrenceEnvelopes, LoopchainScheduleError,
  type LoopchainBlockPlan, type LoopchainSchedule, type ScheduledOccurrence,
} from "../../audio/loopchainPlaybackEngine";
import { buildMusicalGridFromBeatMap } from "../../logic/loops/musicalGrid";
import { getOrComputeLoopchainPeaks } from "./loopchainWaveformPeakCache";
import { LoopchainOverviewWaveform } from "./LoopchainOverviewWaveform";
import { LoopchainTransitionDetail } from "./LoopchainTransitionDetail";
import type { WaveformPeak } from "../../data/loopTypes";

interface Props {
  candidateSourceTrackIds: string[];
  libraryTracks: Track[];
  songAnalyses: CompleteSongAnalysis[];
  draft: LoopchainDraft | undefined;
  onUpdateDraft: (draft: LoopchainDraft) => void;
  sectionAcceptances: RadioLoopchainSectionAcceptance[];
  onAcceptSection: (acceptance: RadioLoopchainSectionAcceptance) => void;
  observations: LoopchainObservation[];
  onRecordObservation: (observation: LoopchainObservation) => void;
  listenerFeedback: LoopchainListenerFeedback[];
  onRecordListenerFeedback: (feedback: LoopchainListenerFeedback) => void;
  getDecodedSourceBufferForRender: (track: Track) => Promise<AudioBuffer | null>;
  onBack: () => void;
}

function genDraftId(): string {
  return `loopchain_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function genSessionId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
function nowIso(): string {
  return new Date().toISOString();
}
function fmtSeconds(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "—";
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const BLOCK_COLORS = ["#5b9cf6", "#f6b85b", "#8bd17c", "#e28bd1", "#f6716b", "#6be0d8"];
function colorForBlockId(blockId: string): string {
  let hash = 0;
  for (let i = 0; i < blockId.length; i++) hash = (hash * 31 + blockId.charCodeAt(i)) | 0;
  return BLOCK_COLORS[Math.abs(hash) % BLOCK_COLORS.length];
}

interface ResolvedSectionInfo {
  section: SongSection;
  displayLabel: string;
  structuralType: SongStructuralType;
  startSeconds: number;
  endSeconds: number;
  currentBounds: CurrentSectionBounds;
}

function resolveSections(track: Track, analysis: CompleteSongAnalysis | undefined): ResolvedSectionInfo[] {
  if (!analysis) return [];
  const sr = analysis.sampleRate || 44100;
  return analysis.sections.map((section) => {
    const resolved = resolveActiveSongSection(section, analysis.sectionRevisions);
    return {
      section,
      displayLabel: resolved.displayLabel,
      structuralType: resolved.structuralType,
      startSeconds: resolved.startFrame / sr,
      endSeconds: resolved.endFrame / sr,
      currentBounds: {
        sourceTrackId: track.trackId,
        sectionId: section.id,
        startFrame: resolved.startFrame,
        endFrame: resolved.endFrame,
        revisionId: resolved.activeRevision?.id,
      },
    };
  });
}

const FEEDBACK_TARGET_OPTIONS: { key: string; label: string }[] = [
  { key: "overall_chain", label: "Overall chain" },
  { key: "section", label: "This section" },
  { key: "repetition", label: "This repeat" },
  { key: "transition", label: "This transition" },
];

export function RadioLoopchainPlayer({
  candidateSourceTrackIds, libraryTracks, songAnalyses, draft, onUpdateDraft,
  sectionAcceptances, onAcceptSection, observations, onRecordObservation,
  listenerFeedback, onRecordListenerFeedback,
  getDecodedSourceBufferForRender, onBack,
}: Props) {
  const candidateTracks = useMemo(
    () => candidateSourceTrackIds
      .map((id) => libraryTracks.find((t) => t.trackId === id))
      .filter((t): t is Track => Boolean(t)),
    [candidateSourceTrackIds, libraryTracks],
  );
  const [pickerTrackId, setPickerTrackId] = useState<string | undefined>(candidateTracks[0]?.trackId);

  const engineRef = useRef<LoopchainPlaybackEngine | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const previewTimeoutRef = useRef<number | null>(null);
  // State, not a ref: several render-time computations (peaks, grid trust)
  // read decoded buffers directly, and react-hooks/refs correctly flags a
  // plain ref read reachable from render as unsafe/non-reactive — a state
  // map (immutably updated in ensureBuffersLoaded) is the React-idiomatic
  // way to make "buffers just finished decoding" a real render input.
  const [decodedBuffers, setDecodedBuffers] = useState<Map<string, AudioBuffer>>(new Map());
  const [sessionId] = useState(genSessionId);

  const [playState, setPlayState] = useState<"idle" | "playing" | "paused" | "auditioning">("idle");
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [currentSchedule, setCurrentSchedule] = useState<LoopchainSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditionedSectionKeys, setAuditionedSectionKeys] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [selectedJunctionId, setSelectedJunctionId] = useState<string | undefined>(undefined);
  const [advancedRepeatBlockIds, setAdvancedRepeatBlockIds] = useState<Set<string>>(new Set());
  const [introOutroWarnings, setIntroOutroWarnings] = useState<LoopchainNormalizationWarning[]>([]);
  const [warningsDismissed, setWarningsDismissed] = useState(false);
  const [normalizedForDraftKey, setNormalizedForDraftKey] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [feedbackNotice, setFeedbackNotice] = useState<string | null>(null);

  function ensureEngine(): LoopchainPlaybackEngine {
    if (!audioContextRef.current) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContextRef.current = new Ctor();
    }
    if (!engineRef.current) {
      engineRef.current = new LoopchainPlaybackEngine({ audioContext: audioContextRef.current });
    }
    return engineRef.current;
  }

  function sectionKey(bounds: CurrentSectionBounds): string {
    return `${bounds.sourceTrackId}::${bounds.sectionId}::${bounds.startFrame}::${bounds.endFrame}::${bounds.revisionId ?? ""}`;
  }

  function markAudited(bounds: CurrentSectionBounds) {
    setAuditionedSectionKeys((prev) => {
      const next = new Set(prev);
      next.add(sectionKey(bounds));
      return next;
    });
  }

  useEffect(() => () => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (previewTimeoutRef.current != null) window.clearTimeout(previewTimeoutRef.current);
    engineRef.current?.stop();
    void audioContextRef.current?.close();
  }, []);

  function tickPlayhead() {
    const engine = engineRef.current;
    if (!engine || !engine.isPlaying()) {
      rafRef.current = null;
      return;
    }
    setPlayheadSeconds(engine.chainElapsedSeconds());
    rafRef.current = requestAnimationFrame(tickPlayhead);
  }

  function startPlayheadLoop() {
    if (rafRef.current == null) rafRef.current = requestAnimationFrame(tickPlayhead);
  }

  function analysisFor(trackId: string): CompleteSongAnalysis | undefined {
    return songAnalyses.find((a) => a.sourceTrackId === trackId);
  }

  function trackById(trackId: string): Track | undefined {
    return libraryTracks.find((t) => t.trackId === trackId);
  }

  function currentDraft(): LoopchainDraft {
    return draft ?? {
      id: genDraftId(),
      blocks: [],
      junctions: [],
      defaultCrossfadeDurationSeconds: 2,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
  }

  function resolveStructuralTypeForBlock(block: LoopchainBlock): SongStructuralType | undefined {
    const analysis = analysisFor(block.sourceTrackId);
    const section = analysis?.sections.find((s) => s.id === block.sectionId);
    if (!analysis || !section) return undefined;
    return resolveActiveSongSection(section, analysis.sectionRevisions).structuralType;
  }

  function blockCycleSeconds(block: LoopchainBlock): { cycleDurationSeconds: number; sourceOffsetSeconds: number } | null {
    const analysis = analysisFor(block.sourceTrackId);
    const section = analysis?.sections.find((s) => s.id === block.sectionId);
    if (!analysis || !section) return null;
    const resolved = resolveActiveSongSection(section, analysis.sectionRevisions);
    const sr = analysis.sampleRate || 44100;
    return {
      cycleDurationSeconds: (resolved.endFrame - resolved.startFrame) / sr,
      sourceOffsetSeconds: resolved.startFrame / sr,
    };
  }

  function junctionGridInput(block: LoopchainBlock | undefined, cycleDurationSeconds: number): JunctionGridInput {
    const track = block ? trackById(block.sourceTrackId) : undefined;
    if (!track) return { grid: null, playbackBounds: null, cycleDurationSeconds };
    const buffer = decodedBuffers.get(track.trackId);
    const sampleRate = buffer?.sampleRate ?? 44100;
    const sourceDurationSeconds = track.durationSeconds ?? buffer?.duration ?? cycleDurationSeconds;
    const grid = buildMusicalGridFromBeatMap(track.beatMap, track.bpm, track.trackId, sourceDurationSeconds, sampleRate);
    return { grid, playbackBounds: track.playbackBounds ?? null, cycleDurationSeconds };
  }

  async function ensureBuffersLoaded(sourceTrackIds: string[]): Promise<boolean> {
    const engine = ensureEngine();
    const newlyLoaded = new Map<string, AudioBuffer>();
    for (const trackId of new Set(sourceTrackIds)) {
      const track = trackById(trackId);
      if (!track) { setError(`Source track ${trackId} is not available.`); return false; }
      const buffer = await getDecodedSourceBufferForRender(track);
      if (!buffer) { setError(`Could not decode audio for "${track.title}".`); return false; }
      engine.setBuffer(trackId, buffer);
      newlyLoaded.set(trackId, buffer);
    }
    if (newlyLoaded.size > 0) {
      setDecodedBuffers((prev) => {
        const next = new Map(prev);
        newlyLoaded.forEach((buf, id) => next.set(id, buf));
        return next;
      });
    }
    return true;
  }

  // §2.1 — repair of an older chain that already violates the intro/outro
  // invariant, run once per distinct draft identity. The warning banner's
  // OWN state is derived synchronously during render (React's documented
  // "adjust state during render" pattern — the same idiom this codebase's
  // LibraryCommentsCell.tsx already uses) so it never needs a setState call
  // inside an effect; the actual repaired-draft WRITE to the parent still
  // belongs in an effect (it's a real side effect on external/parent
  // state), which independently recomputes the same pure repair rather than
  // threading the render-time result through a ref.
  const currentDraftKey = draft ? `${draft.id}::${draft.updatedAt}` : null;
  if (draft && currentDraftKey !== normalizedForDraftKey) {
    const { warnings } = normalizeIntroOutroSingleUse(draft, resolveStructuralTypeForBlock);
    setNormalizedForDraftKey(currentDraftKey);
    setIntroOutroWarnings(warnings);
    setWarningsDismissed(false);
  }
  useEffect(() => {
    if (!draft) return;
    const { draft: repaired, warnings } = normalizeIntroOutroSingleUse(draft, resolveStructuralTypeForBlock);
    if (warnings.length > 0) onUpdateDraft(repaired);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft?.id, draft?.updatedAt]);

  function handleAddSection(track: Track, info: ResolvedSectionInfo) {
    const result = addBlock(
      currentDraft(),
      { sourceTrackId: track.trackId, sectionId: info.section.id, repeatMode: { mode: "repeatCount", count: 8 }, structuralType: info.structuralType },
      resolveStructuralTypeForBlock,
    );
    applyAddResult(result);
  }

  function applyAddResult(result: AddBlockResult) {
    if (result.ok) {
      onUpdateDraft(result.draft);
      setError(null);
    } else {
      setError(`This track's ${result.reason === "intro_outro_already_used" ? "intro/outro" : "section"} is already used in this chain.`);
    }
  }

  function handleSetRepeatMode(blockId: string, mode: LoopchainRepeatMode, structuralType: SongStructuralType) {
    onUpdateDraft(setBlockRepeatMode(currentDraft(), blockId, mode, structuralType));
  }

  function handleSetRepeatPreference(blockId: string, preference: LoopchainRepeatPreference, structuralType: SongStructuralType) {
    onUpdateDraft(setBlockRepeatPreference(currentDraft(), blockId, preference, structuralType));
  }

  function handleRemoveBlock(blockId: string) {
    onUpdateDraft(removeBlock(currentDraft(), blockId));
  }

  function handleDuplicateBlock(blockId: string) {
    applyAddResult(duplicateBlock(currentDraft(), blockId, resolveStructuralTypeForBlock));
  }

  function handleMoveBlock(index: number, direction: -1 | 1) {
    onUpdateDraft(reorderBlock(currentDraft(), index, index + direction));
  }

  function handleSetJunctionTransitionRequest(junctionId: string, request: LoopchainTransitionRequest) {
    const d = currentDraft();
    onUpdateDraft({ ...d, junctions: d.junctions.map((j) => (j.id === junctionId ? { ...j, transitionRequest: request } : j)), updatedAt: nowIso() });
  }

  function handleAcceptLoopable(info: ResolvedSectionInfo) {
    if (!auditionedSectionKeys.has(sectionKey(info.currentBounds))) return;
    onAcceptSection(buildSectionAcceptance(info.currentBounds));
  }

  async function buildChainSchedule(d: LoopchainDraft): Promise<LoopchainSchedule | null> {
    const plans: LoopchainBlockPlan[] = [];
    for (const block of d.blocks) {
      const timing = blockCycleSeconds(block);
      if (!timing) { setError(`Section for a chain block is no longer available.`); return null; }
      plans.push({ block, sourceTrackId: block.sourceTrackId, ...timing });
    }
    try {
      return buildLoopchainSchedule(plans, resolvedJunctionsForSchedule(d));
    } catch (err) {
      setError(err instanceof LoopchainScheduleError ? err.message : "Could not build the chain schedule.");
      return null;
    }
  }

  // Builds the junction array actually passed to buildLoopchainSchedule,
  // with each junction's crossfadeDurationSeconds replaced by its
  // RESOLVED decision (§2.3) — the persisted transitionRequest is source
  // intent, the scheduled duration is always the freshly-resolved value.
  function resolvedJunctionsForSchedule(d: LoopchainDraft): LoopchainJunction[] {
    return d.junctions.map((j) => {
      const decision = resolveJunctionDecision(d, j);
      return decision ? { ...j, crossfadeDurationSeconds: decision.computedDurationSeconds } : j;
    });
  }

  function resolveJunctionDecision(d: LoopchainDraft, junction: LoopchainJunction): LoopchainResolvedTransitionDecision | null {
    const outgoingBlock = d.blocks.find((b) => b.id === junction.outgoingBlockId);
    const incomingBlock = d.blocks.find((b) => b.id === junction.incomingBlockId);
    const outTiming = outgoingBlock ? blockCycleSeconds(outgoingBlock) : null;
    const inTiming = incomingBlock ? blockCycleSeconds(incomingBlock) : null;
    if (!outTiming || !inTiming) return null;
    const outgoingInput = junctionGridInput(outgoingBlock, outTiming.cycleDurationSeconds);
    const incomingInput = junctionGridInput(incomingBlock, inTiming.cycleDurationSeconds);
    return resolveTransitionTiming(
      outgoingInput, incomingInput,
      junction.transitionRequest ?? { kind: "auto" },
      junction.id,
      junction.crossfadeDurationSeconds,
    );
  }

  async function handlePlayChain() {
    setError(null);
    const d = currentDraft();
    if (d.blocks.length === 0) return;
    setBusy(true);
    const schedule = await buildChainSchedule(d);
    if (!schedule) { setBusy(false); return; }
    const loaded = await ensureBuffersLoaded(d.blocks.map((b) => b.sourceTrackId));
    setBusy(false);
    if (!loaded) return;
    const engine = ensureEngine();
    engine.play(schedule);
    setCurrentSchedule(schedule);
    setPlayState("playing");
    startPlayheadLoop();
    d.blocks.forEach((b) => {
      const analysis = analysisFor(b.sourceTrackId);
      const section = analysis?.sections.find((s) => s.id === b.sectionId);
      if (!section) return;
      const resolved = resolveActiveSongSection(section, analysis!.sectionRevisions);
      markAudited({ sourceTrackId: b.sourceTrackId, sectionId: b.sectionId, startFrame: resolved.startFrame, endFrame: resolved.endFrame, revisionId: resolved.activeRevision?.id });
    });
    onRecordObservation(recordChainPlayed(d.id, schedule.totalChainDurationSeconds, schedule.occurrences.length));
  }

  function handleStop(kind: "manual_stop" | "endurance") {
    const engine = engineRef.current;
    const elapsed = engine?.chainElapsedSeconds() ?? 0;
    engine?.stop();
    setPlayState("idle");
    if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    const d = currentDraft();
    if (kind === "endurance") {
      onRecordObservation(recordEnduranceCompleted(d.id, elapsed));
    } else if (currentSchedule && elapsed < currentSchedule.totalChainDurationSeconds - 0.5) {
      onRecordObservation(recordEarlyStop(d.id, elapsed));
    }
    setPlayheadSeconds(0);
  }

  function handlePauseResume() {
    const engine = engineRef.current;
    if (!engine) return;
    if (playState === "playing") {
      engine.pause();
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      setPlayState("paused");
    } else if (playState === "paused") {
      engine.resume();
      setPlayState("playing");
      startPlayheadLoop();
    }
  }

  // §1.2 — click/drag-to-seek on the overview waveform. Always snaps to
  // the covering occurrence's own start (engine.seek()'s contract); the
  // displayed playhead is set to the value seek() actually returns, never
  // the raw click position.
  function handleSeek(chainTimeSeconds: number) {
    const engine = engineRef.current;
    if (!engine) return;
    const snapped = engine.seek(chainTimeSeconds);
    if (snapped != null) setPlayheadSeconds(snapped);
  }

  async function handleAuditionSelfLoop(block: LoopchainBlock) {
    setError(null);
    const timing = blockCycleSeconds(block);
    if (!timing) return;
    const auditionBlock: LoopchainBlock = { ...block, repeatMode: { mode: "repeatCount", count: 2 } };
    const schedule = buildLoopchainSchedule([{ block: auditionBlock, sourceTrackId: block.sourceTrackId, ...timing }], []);
    const loaded = await ensureBuffersLoaded([block.sourceTrackId]);
    if (!loaded) return;
    const engine = ensureEngine();
    engine.play(schedule);
    setCurrentSchedule(schedule);
    setPlayState("auditioning");
    startPlayheadLoop();
    const analysis = analysisFor(block.sourceTrackId);
    const section = analysis?.sections.find((s) => s.id === block.sectionId);
    if (analysis && section) {
      const resolved = resolveActiveSongSection(section, analysis.sectionRevisions);
      markAudited({ sourceTrackId: block.sourceTrackId, sectionId: block.sectionId, startFrame: resolved.startFrame, endFrame: resolved.endFrame, revisionId: resolved.activeRevision?.id });
    }
  }

  // §1.4 — "Preview transition": plays the REAL chain schedule, seeks to a
  // bounded window around the selected junction (computeCueWindow), and
  // auto-stops at the window's end. Restores the prior playback state only
  // if it was actively playing before ("when practical" per spec) —
  // otherwise simply stops.
  async function handlePreviewTransition(junction: LoopchainJunction) {
    setError(null);
    const d = currentDraft();
    const schedule = currentSchedule ?? await buildChainSchedule(d);
    if (!schedule) return;
    const cue = computeCueWindow(schedule, junction, 8);
    if (!cue) { setError("Could not compute a preview window for this transition."); return; }
    const loaded = await ensureBuffersLoaded(d.blocks.map((b) => b.sourceTrackId));
    if (!loaded) return;

    const wasPlaying = playState === "playing";
    const priorPlayhead = playheadSeconds;
    const engine = ensureEngine();
    engine.play(schedule);
    const snapped = engine.seek(cue.startChainSeconds) ?? cue.startChainSeconds;
    setCurrentSchedule(schedule);
    setPlayState("auditioning");
    setPlayheadSeconds(snapped);
    startPlayheadLoop();
    onRecordObservation(recordJunctionAudition(d.id, junction.id));

    if (previewTimeoutRef.current != null) window.clearTimeout(previewTimeoutRef.current);
    const windowMs = Math.max(200, (cue.endChainSeconds - cue.startChainSeconds) * 1000);
    previewTimeoutRef.current = window.setTimeout(() => {
      engine.stop();
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      if (wasPlaying) {
        engine.play(schedule);
        const restored = engine.seek(priorPlayhead) ?? priorPlayhead;
        setPlayheadSeconds(restored);
        setPlayState("playing");
        startPlayheadLoop();
      } else {
        setPlayState("idle");
        setPlayheadSeconds(0);
      }
    }, windowMs);
  }

  const d = currentDraft();
  const pickerTrack = pickerTrackId ? trackById(pickerTrackId) : undefined;
  const pickerSections = pickerTrack ? resolveSections(pickerTrack, analysisFor(pickerTrack.trackId)) : [];

  const activeLocation = currentSchedule ? chainTimeToOccurrence(currentSchedule, playheadSeconds) : null;
  const activeOccurrence = activeLocation?.occurrence;
  const activeBlock = activeOccurrence ? d.blocks.find((b) => b.id === activeOccurrence.blockId) : undefined;
  const activeTrack = activeBlock ? trackById(activeBlock.sourceTrackId) : undefined;
  const activeAnalysis = activeBlock ? analysisFor(activeBlock.sourceTrackId) : undefined;
  const activeSection = activeBlock ? activeAnalysis?.sections.find((s) => s.id === activeBlock.sectionId) : undefined;
  const activeResolved = activeSection && activeAnalysis ? resolveActiveSongSection(activeSection, activeAnalysis.sectionRevisions) : undefined;
  const activeOccurrenceCountForBlock = activeOccurrence && currentSchedule
    ? currentSchedule.occurrences.filter((o) => o.blockId === activeOccurrence.blockId).length
    : 0;

  function labelForBlockId(blockId: string): string {
    const block = d.blocks.find((b) => b.id === blockId);
    if (!block) return blockId;
    const track = trackById(block.sourceTrackId);
    const analysis = analysisFor(block.sourceTrackId);
    const section = analysis?.sections.find((s) => s.id === block.sectionId);
    const resolved = section && analysis ? resolveActiveSongSection(section, analysis.sectionRevisions) : undefined;
    return `${track?.title ?? block.sourceTrackId} — ${resolved?.displayLabel ?? block.sectionId}`;
  }

  const nextCue = useMemo(() => {
    if (!currentSchedule || !activeOccurrence) return null;
    const candidates = currentSchedule.occurrences.filter((o) => o.chainStartSeconds > playheadSeconds && o.blockId !== activeOccurrence.blockId);
    if (candidates.length === 0) return null;
    const next = candidates.reduce((a, b) => (b.chainStartSeconds < a.chainStartSeconds ? b : a));
    return { label: labelForBlockId(next.blockId), inSeconds: next.chainStartSeconds - playheadSeconds };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSchedule, activeOccurrence?.blockId, playheadSeconds]);

  // §1.2 — per-occurrence peaks, cached by source-offset/duration tuple so
  // repeated occurrences of the same block share one computed set.
  function peaksForOccurrence(occurrence: ScheduledOccurrence): WaveformPeak[] | undefined {
    const buffer = decodedBuffers.get(occurrence.sourceTrackId);
    if (!buffer) return undefined;
    return getOrComputeLoopchainPeaks(
      occurrence.sourceTrackId, buffer,
      occurrence.sourceOffsetSeconds, occurrence.sourceOffsetSeconds + occurrence.sourceDurationSeconds,
      64,
    );
  }

  function isIntroOrOutroOccurrence(occurrence: ScheduledOccurrence): boolean {
    const block = d.blocks.find((b) => b.id === occurrence.blockId);
    if (!block) return false;
    const role = resolveStructuralTypeForBlock(block);
    return role === "intro" || role === "outro";
  }

  function labelForDrag(chainTimeSeconds: number): string {
    if (!currentSchedule) return fmtSeconds(chainTimeSeconds);
    const loc = chainTimeToOccurrence(currentSchedule, chainTimeSeconds);
    if (!loc) return fmtSeconds(chainTimeSeconds);
    return `${labelForBlockId(loc.occurrence.blockId)} · ${fmtSeconds(chainTimeSeconds)}`;
  }

  const selectedJunction = selectedJunctionId ? d.junctions.find((j) => j.id === selectedJunctionId) : undefined;
  const selectedJunctionDecision = selectedJunction ? resolveJunctionDecision(d, selectedJunction) : null;

  function feedbackNoticeFor(kind: string) {
    setFeedbackNotice(`${kind} recorded.`);
    window.setTimeout(() => setFeedbackNotice(null), 3000);
  }

  const alreadySavedThisVersion = listenerFeedback.some(
    (f) => f.kind === "save" && f.chainId === d.id && f.chainVersion === d.updatedAt && f.sessionId === sessionId,
  );

  function handleSave() {
    onRecordListenerFeedback(recordSave(d.id, d.updatedAt, sessionId, playheadSeconds));
    feedbackNoticeFor("Save");
  }

  function handleLessLikeThis(scope: string) {
    let target: LoopchainFeedbackTarget;
    if (scope === "section" && activeOccurrence) target = { scope: "section", blockId: activeOccurrence.blockId };
    else if (scope === "repetition" && activeOccurrence) target = { scope: "repetition", blockId: activeOccurrence.blockId, occurrenceIndexInBlock: activeOccurrence.occurrenceIndexInBlock };
    else if (scope === "transition" && selectedJunction) target = { scope: "transition", junctionId: selectedJunction.id };
    else target = { scope: "overall_chain" };
    onRecordListenerFeedback(recordLessLikeThis(d.id, d.updatedAt, sessionId, target, selectedJunctionDecision ?? undefined, playheadSeconds));
    feedbackNoticeFor("Less like this");
  }

  function handleSubmitComment() {
    if (!commentDraft.trim()) return;
    onRecordListenerFeedback(recordComment(d.id, d.updatedAt, sessionId, commentDraft.trim(), { scope: "overall_chain" }, playheadSeconds));
    setCommentDraft("");
    feedbackNoticeFor("Comment");
  }

  return (
    <div className="radio-loopchain-player">
      <div className="radio-loopchain-header">
        <button type="button" className="radio-loopchain-back" onClick={onBack}>← Back</button>
        <div className="radio-loopchain-title">Sectional Loopchain Player</div>
        <div className="radio-loopchain-transport">
          {playState === "idle" && (
            <button type="button" disabled={busy || d.blocks.length === 0} onClick={handlePlayChain}>
              {busy ? "Loading…" : "Play chain"}
            </button>
          )}
          {(playState === "playing" || playState === "paused") && (
            <>
              <button type="button" onClick={handlePauseResume}>{playState === "playing" ? "Pause" : "Resume"}</button>
              <button type="button" onClick={() => handleStop("manual_stop")}>Stop</button>
              <button type="button" onClick={() => handleStop("endurance")}>Stop (mark endurance run complete)</button>
            </>
          )}
          {playState === "auditioning" && (
            <button type="button" onClick={() => handleStop("manual_stop")}>Stop audition</button>
          )}
        </div>
      </div>

      {error && <div className="radio-loopchain-error">{error}</div>}

      {introOutroWarnings.length > 0 && !warningsDismissed && (
        <div className="radio-loopchain-warning-banner">
          {introOutroWarnings.map((w) => (
            <div key={w.role}>
              {w.removedDuplicateBlockIds.length > 0 && (
                <span>This chain had more than one {w.role} — kept the first, removed {w.removedDuplicateBlockIds.length} duplicate(s). </span>
              )}
              {w.repeatCountClampedBlockIds.length > 0 && (
                <span>The {w.role} block's repeat count was reset to 1×.</span>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setWarningsDismissed(true)}>Dismiss</button>
        </div>
      )}

      {/* §1.1 — Now Playing */}
      <div className="radio-loopchain-now-playing">
        {activeTrack && activeResolved ? (
          <>
            <div className="radio-loopchain-now-playing-main">
              <span className="radio-loopchain-now-playing-title">{activeTrack.title}</span>
              <span className="radio-loopchain-now-playing-artist">{activeTrack.artist}</span>
              <span className="radio-loopchain-now-playing-role">{activeResolved.displayLabel}</span>
              {activeOccurrenceCountForBlock > 1 && (
                <span className="radio-loopchain-now-playing-repeat">
                  repeat {(activeOccurrence?.occurrenceIndexInBlock ?? 0) + 1} of {activeOccurrenceCountForBlock}
                </span>
              )}
            </div>
            <div className="radio-loopchain-now-playing-time">
              {fmtSeconds(playheadSeconds)} elapsed · {currentSchedule ? fmtSeconds(currentSchedule.totalChainDurationSeconds - playheadSeconds) : "—"} remaining
            </div>
            {nextCue && (
              <div className="radio-loopchain-now-playing-next">Next: {nextCue.label} in {fmtSeconds(nextCue.inSeconds)}</div>
            )}
          </>
        ) : (
          <div className="radio-loopchain-now-playing-idle">Nothing playing.</div>
        )}
      </div>

      {/* §1.2 — whole-chain overview waveform */}
      <LoopchainOverviewWaveform
        schedule={currentSchedule}
        isPlaying={playState === "playing" || playState === "auditioning"}
        getPlayheadSeconds={() => engineRef.current?.chainElapsedSeconds() ?? 0}
        activeOccurrenceId={activeOccurrence?.occurrenceId}
        peaksForOccurrence={peaksForOccurrence}
        colorForBlock={colorForBlockId}
        isIntroOrOutroOccurrence={isIntroOrOutroOccurrence}
        labelForDrag={labelForDrag}
        onSeek={handleSeek}
      />

      {/* §3 — listener feedback (Save / Less like this / Comment) —
          replaces star ratings inside this player specifically; Track.rating
          elsewhere in the app (Editorial Rating) is untouched. */}
      <div className="radio-loopchain-feedback-bar">
        <button type="button" className={alreadySavedThisVersion ? "active" : ""} onClick={handleSave}>
          {alreadySavedThisVersion ? "♥ Saved" : "♡ Save"}
        </button>
        <span className="radio-loopchain-feedback-less-like">
          Less like this:
          {FEEDBACK_TARGET_OPTIONS.map((opt) => (
            <button key={opt.key} type="button" onClick={() => handleLessLikeThis(opt.key)}>{opt.label}</button>
          ))}
        </span>
        <span className="radio-loopchain-feedback-comment">
          <input
            type="text"
            placeholder="Comment…"
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmitComment(); }}
          />
          <button type="button" onClick={handleSubmitComment}>Add</button>
        </span>
        {feedbackNotice && <span className="radio-loopchain-feedback-notice">{feedbackNotice}</span>}
      </div>

      {/* §1.3 — transition detail for the selected junction only */}
      {selectedJunction && selectedJunctionDecision && (() => {
        const outgoingBlock = d.blocks.find((b) => b.id === selectedJunction.outgoingBlockId);
        const incomingBlock = d.blocks.find((b) => b.id === selectedJunction.incomingBlockId);
        const schedule = currentSchedule;
        if (!outgoingBlock || !incomingBlock || !schedule) return null;
        const outgoingOccurrences = schedule.occurrences.filter((o) => o.blockId === outgoingBlock.id);
        const incomingOccurrences = schedule.occurrences.filter((o) => o.blockId === incomingBlock.id);
        if (outgoingOccurrences.length === 0 || incomingOccurrences.length === 0) return null;
        const outgoingLast = outgoingOccurrences[outgoingOccurrences.length - 1];
        const incomingFirst = incomingOccurrences[0];
        const cue = computeCueWindow(schedule, selectedJunction, 8);
        if (!cue) return null;
        const { fadeOut, fadeIn } = buildOccurrenceEnvelopes(outgoingLast);
        const { fadeIn: incomingFadeIn } = buildOccurrenceEnvelopes(incomingFirst);
        const outgoingPeaks = peaksForOccurrence(outgoingLast);
        const incomingPeaks = peaksForOccurrence(incomingFirst);
        const outgoingBounds = trackById(outgoingBlock.sourceTrackId)?.playbackBounds;
        const incomingBounds = trackById(incomingBlock.sourceTrackId)?.playbackBounds;
        const outgoingAudibleEndChain = outgoingBounds
          ? occurrenceSourceTimeToChainTime(schedule, outgoingLast.occurrenceId, outgoingBounds.audibleEndSeconds) ?? undefined
          : undefined;
        const incomingAudibleStartChain = incomingBounds
          ? occurrenceSourceTimeToChainTime(schedule, incomingFirst.occurrenceId, incomingBounds.audibleStartSeconds) ?? undefined
          : undefined;
        return (
          <LoopchainTransitionDetail
            outgoingLabel={labelForBlockId(outgoingBlock.id)}
            incomingLabel={labelForBlockId(incomingBlock.id)}
            windowStartChainSeconds={cue.startChainSeconds}
            windowEndChainSeconds={cue.endChainSeconds}
            overlapStartChainSeconds={incomingFirst.chainStartSeconds}
            overlapEndChainSeconds={outgoingLast.chainEndSeconds}
            outgoingPeaks={outgoingPeaks}
            incomingPeaks={incomingPeaks}
            fadeOut={fadeOut}
            fadeIn={fadeIn ?? incomingFadeIn}
            outgoingAudibleEndChainSeconds={outgoingAudibleEndChain}
            incomingAudibleStartChainSeconds={incomingAudibleStartChain}
            decision={selectedJunctionDecision}
          />
        );
      })()}

      <div className="radio-loopchain-body">
        <div className="radio-loopchain-picker">
          <div className="radio-loopchain-picker-tracks">
            {candidateTracks.map((t) => (
              <button
                key={t.trackId}
                type="button"
                className={t.trackId === pickerTrackId ? "active" : ""}
                onClick={() => setPickerTrackId(t.trackId)}
              >
                {t.title}
              </button>
            ))}
          </div>
          {pickerTrack && (
            <div className="radio-loopchain-picker-sections">
              {pickerSections.length === 0 && <div className="radio-loopchain-empty">No analyzed sections for this track yet.</div>}
              {pickerSections.map((info) => {
                const playability = resolveSectionPlayability(info.currentBounds, info.structuralType, sectionAcceptances);
                const canAccept = auditionedSectionKeys.has(sectionKey(info.currentBounds));
                return (
                  <div key={info.section.id} className="radio-loopchain-section-row">
                    <span className="radio-loopchain-section-label">{info.displayLabel}</span>
                    <span className="radio-loopchain-section-time">{fmtSeconds(info.startSeconds)}–{fmtSeconds(info.endSeconds)}</span>
                    <span className={`radio-loopchain-playability radio-loopchain-playability-${playability}`}>{playability}</span>
                    <button type="button" onClick={() => handleAddSection(pickerTrack, info)}>Add to chain</button>
                    {playability !== "loopable" && (
                      <button
                        type="button"
                        disabled={!canAccept}
                        title={canAccept ? "Mark this exact region as loopable" : "Audition this region as a loop first"}
                        onClick={() => handleAcceptLoopable(info)}
                      >
                        Accept as loopable
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="radio-loopchain-strip">
          {d.blocks.length === 0 && <div className="radio-loopchain-empty">Add a section to start the chain.</div>}
          {d.blocks.map((block, index) => {
            const timing = blockCycleSeconds(block);
            const analysis = analysisFor(block.sourceTrackId);
            const section = analysis?.sections.find((s) => s.id === block.sectionId);
            const resolved = section ? resolveActiveSongSection(section, analysis!.sectionRevisions) : undefined;
            const structuralType = resolved?.structuralType;
            const track = trackById(block.sourceTrackId);
            const label = resolved ? formatBlockLabel(resolved.displayLabel, block.repeatMode) : block.sectionId;
            const junctionAfter = d.junctions.find((j) => j.outgoingBlockId === block.id);
            const nextBlock = d.blocks[index + 1];
            const isActive = activeOccurrence?.blockId === block.id;
            const isSingleUseRole = structuralType === "intro" || structuralType === "outro";
            const showAdvanced = advancedRepeatBlockIds.has(block.id);
            return (
              <div key={block.id} className={`radio-loopchain-block${isActive ? " active" : ""}`}>
                <div className="radio-loopchain-block-header">
                  <span className="radio-loopchain-block-track">{track?.title ?? block.sourceTrackId}</span>
                  <span className="radio-loopchain-block-label">{label}</span>
                </div>
                <div className="radio-loopchain-block-controls">
                  <button type="button" disabled={index === 0} onClick={() => handleMoveBlock(index, -1)}>↑</button>
                  <button type="button" disabled={index === d.blocks.length - 1} onClick={() => handleMoveBlock(index, 1)}>↓</button>
                  <button type="button" onClick={() => handleDuplicateBlock(block.id)}>Duplicate</button>
                  <button type="button" onClick={() => handleRemoveBlock(block.id)}>Remove</button>
                  <button type="button" disabled={!timing} onClick={() => timing && handleAuditionSelfLoop(block)}>Audition seam</button>
                </div>
                {/* §2.1/§2.2 — intro/outro blocks show a fixed, non-editable
                    1× and never render the repeat-preference controls at
                    all ("cannot be increased through the interface"). */}
                {isSingleUseRole ? (
                  <div className="radio-loopchain-block-repeat radio-loopchain-block-repeat--fixed">1× (required — {structuralType})</div>
                ) : (
                  <div className="radio-loopchain-block-repeat">
                    {(["low", "medium", "high"] as LoopchainRepeatPreference[]).map((pref) => {
                      const resolvedForPref = structuralType ? resolveRepeatPreference(structuralType, pref) : null;
                      const isActivePref = block.repeatPreference === pref
                        && resolvedForPref
                        && block.repeatMode.mode === resolvedForPref.mode
                        && JSON.stringify(block.repeatMode) === JSON.stringify(resolvedForPref);
                      return (
                        <button
                          key={pref}
                          type="button"
                          className={isActivePref ? "active" : ""}
                          disabled={!structuralType}
                          onClick={() => structuralType && handleSetRepeatPreference(block.id, pref, structuralType)}
                        >
                          {pref[0].toUpperCase() + pref.slice(1)}
                        </button>
                      );
                    })}
                    <span className="radio-loopchain-block-repeat-exact">{formatBlockLabel("", block.repeatMode)}</span>
                    <button type="button" onClick={() => setAdvancedRepeatBlockIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(block.id)) next.delete(block.id); else next.add(block.id);
                      return next;
                    })}>
                      {showAdvanced ? "Hide exact…" : "Custom…"}
                    </button>
                    {showAdvanced && structuralType && (
                      <span className="radio-loopchain-block-repeat-advanced">
                        <label>
                          <input
                            type="radio"
                            checked={block.repeatMode.mode === "repeatCount"}
                            onChange={() => handleSetRepeatMode(block.id, { mode: "repeatCount", count: 8 }, structuralType)}
                          />
                          Count
                        </label>
                        {block.repeatMode.mode === "repeatCount" && (
                          <input
                            type="number"
                            min={1}
                            value={block.repeatMode.count}
                            onChange={(e) => handleSetRepeatMode(block.id, { mode: "repeatCount", count: Math.max(1, Number(e.target.value) || 1) }, structuralType)}
                          />
                        )}
                        <label>
                          <input
                            type="radio"
                            checked={block.repeatMode.mode === "targetResidenceSeconds"}
                            onChange={() => handleSetRepeatMode(block.id, { mode: "targetResidenceSeconds", seconds: 120 }, structuralType)}
                          />
                          Target residence
                        </label>
                        {block.repeatMode.mode === "targetResidenceSeconds" && (
                          <input
                            type="number"
                            min={1}
                            value={block.repeatMode.seconds}
                            onChange={(e) => handleSetRepeatMode(block.id, { mode: "targetResidenceSeconds", seconds: Math.max(1, Number(e.target.value) || 1) }, structuralType)}
                          />
                        )}
                      </span>
                    )}
                  </div>
                )}
                {junctionAfter && nextBlock && (() => {
                  const outTiming = blockCycleSeconds(block);
                  const inTiming = blockCycleSeconds(nextBlock);
                  const outGrid = outTiming ? junctionGridInput(block, outTiming.cycleDurationSeconds) : null;
                  const inGrid = inTiming ? junctionGridInput(nextBlock, inTiming.cycleDurationSeconds) : null;
                  const bothTrusted = outGrid?.grid?.trust === "trusted" && inGrid?.grid?.trust === "trusted";
                  const decision = resolveJunctionDecision(d, junctionAfter);
                  return (
                    <div className="radio-loopchain-junction">
                      <span>Transition → {labelForBlockId(nextBlock.id)}</span>
                      <span className="radio-loopchain-junction-duration">
                        {decision ? `${decision.computedDurationSeconds.toFixed(1)}s (${decision.alignment.replace("_", " ")})` : "—"}
                      </span>
                      <select
                        value={junctionAfter.transitionRequest?.kind ?? "auto"}
                        onChange={(e) => {
                          const kind = e.target.value;
                          if (kind === "auto") handleSetJunctionTransitionRequest(junctionAfter.id, { kind: "auto" });
                          else if (kind.startsWith("bars:")) handleSetJunctionTransitionRequest(junctionAfter.id, { kind: "bars", bars: Number(kind.split(":")[1]) as 1 | 2 | 4 | 8 });
                          else if (kind.startsWith("seconds:")) handleSetJunctionTransitionRequest(junctionAfter.id, { kind: "seconds", seconds: Number(kind.split(":")[1]) as 2 | 4 | 8 | 12 });
                        }}
                      >
                        <option value="auto">Auto</option>
                        {bothTrusted && [1, 2, 4, 8].map((n) => <option key={`bars:${n}`} value={`bars:${n}`}>{n} bar{n > 1 ? "s" : ""}</option>)}
                        {[2, 4, 8, 12].map((n) => <option key={`seconds:${n}`} value={`seconds:${n}`}>{n} sec</option>)}
                      </select>
                      <button type="button" onClick={() => setSelectedJunctionId(junctionAfter.id)}>Show transition</button>
                      <button type="button" onClick={() => handlePreviewTransition(junctionAfter)}>Preview transition</button>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      </div>

      {observations.length > 0 && (
        <details className="radio-loopchain-observations">
          <summary>Observation log ({observations.length})</summary>
          <ul>
            {observations.slice(-20).reverse().map((o) => (
              <li key={o.id}>
                {o.kind} — {o.recordedAt}
                {o.actualResidenceSeconds != null && ` — actual ${fmtSeconds(o.actualResidenceSeconds)}`}
                {o.plannedResidenceSeconds != null && ` — planned ${fmtSeconds(o.plannedResidenceSeconds)}`}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
