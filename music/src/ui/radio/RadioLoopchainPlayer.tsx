// 0721_MUSIC_RADIO_Sectional_Loopchain_Player — the one screen. A
// listening instrument, not a publishing surface: nothing here renders
// assets, touches RADIO export, or adds an approval layer. Doctrine §6/§7
// — normal state stays quiet; `review`/`loopable`/`forward_only` are
// honest status labels, never a pass/fail badge; listening/seeking never
// mutates anything beyond this screen's own local draft/acceptance/
// observation state.

import { useEffect, useMemo, useRef, useState } from "react";
import type { Track } from "../../data/trackTypes";
import type { CompleteSongAnalysis, SongSection, SongStructuralType } from "../../data/songAnalysisTypes";
import type {
  LoopchainDraft, LoopchainBlock, LoopchainRepeatMode,
  RadioLoopchainSectionAcceptance, LoopchainObservation,
} from "../../data/radioLoopchainTypes";
import { resolveActiveSongSection } from "../../logic/songAnalysis/songSectionRevisions";
import { resolveSectionPlayability, buildSectionAcceptance, type CurrentSectionBounds } from "../../logic/radio/radioSectionPlayability";
import { addBlock, reorderBlock, duplicateBlock, removeBlock, setBlockRepeatMode, formatBlockLabel } from "../../logic/radio/radioLoopchainEditor";
import {
  recordChainPlayed, recordEarlyStop, recordJunctionAudition, recordEnduranceCompleted,
} from "../../logic/radio/radioLoopchainObservations";
import {
  LoopchainPlaybackEngine, buildLoopchainSchedule, LoopchainScheduleError,
  type LoopchainBlockPlan, type LoopchainSchedule,
} from "../../audio/loopchainPlaybackEngine";

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
  getDecodedSourceBufferForRender: (track: Track) => Promise<AudioBuffer | null>;
  onBack: () => void;
}

function genDraftId(): string {
  return `loopchain_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
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

export function RadioLoopchainPlayer({
  candidateSourceTrackIds, libraryTracks, songAnalyses, draft, onUpdateDraft,
  sectionAcceptances, onAcceptSection, observations, onRecordObservation,
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
  const chainStartedAtSecondsRef = useRef(0); // for "actual residence" observation reporting

  const [playState, setPlayState] = useState<"idle" | "playing" | "paused" | "auditioning">("idle");
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [currentSchedule, setCurrentSchedule] = useState<LoopchainSchedule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auditionedSectionKeys, setAuditionedSectionKeys] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

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

  async function ensureBuffersLoaded(sourceTrackIds: string[]): Promise<boolean> {
    const engine = ensureEngine();
    for (const trackId of new Set(sourceTrackIds)) {
      const track = trackById(trackId);
      if (!track) { setError(`Source track ${trackId} is not available.`); return false; }
      const buffer = await getDecodedSourceBufferForRender(track);
      if (!buffer) { setError(`Could not decode audio for "${track.title}".`); return false; }
      engine.setBuffer(trackId, buffer);
    }
    return true;
  }

  function handleAddSection(track: Track, info: ResolvedSectionInfo) {
    const next = addBlock(currentDraft(), {
      sourceTrackId: track.trackId,
      sectionId: info.section.id,
      repeatMode: { mode: "repeatCount", count: 8 },
    });
    onUpdateDraft(next);
  }

  function handleSetRepeatMode(blockId: string, mode: LoopchainRepeatMode) {
    onUpdateDraft(setBlockRepeatMode(currentDraft(), blockId, mode));
  }

  function handleRemoveBlock(blockId: string) {
    onUpdateDraft(removeBlock(currentDraft(), blockId));
  }

  function handleDuplicateBlock(blockId: string) {
    onUpdateDraft(duplicateBlock(currentDraft(), blockId));
  }

  function handleMoveBlock(index: number, direction: -1 | 1) {
    onUpdateDraft(reorderBlock(currentDraft(), index, index + direction));
  }

  function handleSetJunctionCrossfade(junctionId: string, seconds: number) {
    const d = currentDraft();
    onUpdateDraft({ ...d, junctions: d.junctions.map((j) => (j.id === junctionId ? { ...j, crossfadeDurationSeconds: seconds } : j)), updatedAt: nowIso() });
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
      return buildLoopchainSchedule(plans, d.junctions);
    } catch (err) {
      setError(err instanceof LoopchainScheduleError ? err.message : "Could not build the chain schedule.");
      return null;
    }
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
    chainStartedAtSecondsRef.current = 0;
    setPlayState("playing");
    startPlayheadLoop();
    d.blocks.forEach((b) => {
      const timing = blockCycleSeconds(b);
      if (!timing) return;
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

  async function handleAuditionJunction(outgoing: LoopchainBlock, incoming: LoopchainBlock, junctionId: string, crossfadeDurationSeconds: number) {
    setError(null);
    const outTiming = blockCycleSeconds(outgoing);
    const inTiming = blockCycleSeconds(incoming);
    if (!outTiming || !inTiming) return;
    const preRoll = Math.max(crossfadeDurationSeconds + 2, 4);
    const postRoll = Math.max(crossfadeDurationSeconds + 2, 4);
    const outgoingPreview: LoopchainBlock = {
      ...outgoing,
      repeatMode: { mode: "repeatCount", count: 1 },
      crossfadeDurationSeconds: outgoing.crossfadeDurationSeconds,
    };
    const incomingPreview: LoopchainBlock = { ...incoming, repeatMode: { mode: "repeatCount", count: 1 } };
    const outgoingCycle = Math.min(preRoll, outTiming.cycleDurationSeconds);
    const incomingCycle = Math.min(postRoll, inTiming.cycleDurationSeconds);
    if (crossfadeDurationSeconds >= outgoingCycle || crossfadeDurationSeconds >= incomingCycle) {
      setError("Not enough pre-roll/post-roll room to audition this junction's crossfade.");
      return;
    }
    const plans: LoopchainBlockPlan[] = [
      { block: outgoingPreview, sourceTrackId: outgoing.sourceTrackId, cycleDurationSeconds: outgoingCycle, sourceOffsetSeconds: outTiming.sourceOffsetSeconds + (outTiming.cycleDurationSeconds - outgoingCycle) },
      { block: incomingPreview, sourceTrackId: incoming.sourceTrackId, cycleDurationSeconds: incomingCycle, sourceOffsetSeconds: inTiming.sourceOffsetSeconds },
    ];
    const junctionPreview = { id: "preview", outgoingBlockId: outgoingPreview.id, incomingBlockId: incomingPreview.id, crossfadeDurationSeconds };
    let schedule: LoopchainSchedule;
    try {
      schedule = buildLoopchainSchedule(plans, [junctionPreview]);
    } catch (err) {
      setError(err instanceof LoopchainScheduleError ? err.message : "Could not audition this transition.");
      return;
    }
    const loaded = await ensureBuffersLoaded([outgoing.sourceTrackId, incoming.sourceTrackId]);
    if (!loaded) return;
    const engine = ensureEngine();
    engine.play(schedule);
    setCurrentSchedule(schedule);
    setPlayState("auditioning");
    startPlayheadLoop();
    const d = currentDraft();
    onRecordObservation(recordJunctionAudition(d.id, junctionId));
  }

  const d = currentDraft();
  const pickerTrack = pickerTrackId ? trackById(pickerTrackId) : undefined;
  const pickerSections = pickerTrack ? resolveSections(pickerTrack, analysisFor(pickerTrack.trackId)) : [];

  const activeOccurrence = currentSchedule?.occurrences.find(
    (o) => playheadSeconds >= o.chainStartSeconds && playheadSeconds < o.chainEndSeconds,
  );

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

      <div className="radio-loopchain-playhead">
        Playhead: {fmtSeconds(playheadSeconds)}
        {currentSchedule ? ` / ${fmtSeconds(currentSchedule.totalChainDurationSeconds)}` : ""}
        {activeOccurrence ? ` — ${activeOccurrence.blockId} (occurrence ${activeOccurrence.occurrenceIndexInBlock + 1})` : ""}
      </div>

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
            const track = trackById(block.sourceTrackId);
            const label = resolved ? formatBlockLabel(resolved.displayLabel, block.repeatMode) : block.sectionId;
            const junctionAfter = d.junctions.find((j) => j.outgoingBlockId === block.id);
            const nextBlock = d.blocks[index + 1];
            const isActive = activeOccurrence?.blockId === block.id;
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
                <div className="radio-loopchain-block-repeat">
                  <label>
                    <input
                      type="radio"
                      checked={block.repeatMode.mode === "repeatCount"}
                      onChange={() => handleSetRepeatMode(block.id, { mode: "repeatCount", count: 8 })}
                    />
                    Repeat count
                  </label>
                  {block.repeatMode.mode === "repeatCount" && (
                    <input
                      type="number"
                      min={1}
                      value={block.repeatMode.count}
                      onChange={(e) => handleSetRepeatMode(block.id, { mode: "repeatCount", count: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  )}
                  <label>
                    <input
                      type="radio"
                      checked={block.repeatMode.mode === "targetResidenceSeconds"}
                      onChange={() => handleSetRepeatMode(block.id, { mode: "targetResidenceSeconds", seconds: 120 })}
                    />
                    Target residence
                  </label>
                  {block.repeatMode.mode === "targetResidenceSeconds" && (
                    <input
                      type="number"
                      min={1}
                      value={block.repeatMode.seconds}
                      onChange={(e) => handleSetRepeatMode(block.id, { mode: "targetResidenceSeconds", seconds: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  )}
                </div>
                {junctionAfter && nextBlock && (
                  <div className="radio-loopchain-junction">
                    <span>Transition → {nextBlock.sectionId}</span>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      value={junctionAfter.crossfadeDurationSeconds}
                      onChange={(e) => handleSetJunctionCrossfade(junctionAfter.id, Math.max(0, Number(e.target.value) || 0))}
                    />
                    <button type="button" onClick={() => handleAuditionJunction(block, nextBlock, junctionAfter.id, junctionAfter.crossfadeDurationSeconds)}>
                      Audition transition
                    </button>
                  </div>
                )}
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
