import { useMemo, useState } from "react";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import type { Track } from "../../data/trackTypes";
import type { DjPreparationCueRole } from "../../data/djTrackPreparationTypes";
import { DJ_PREPARATION_FAILURE_LABELS, buildDjEditWorkspaceModel } from "../../logic/edit/djEditWorkspace";
import {
  DJ_PHRASE_GROUPINGS,
  DJ_PREPARATION_CUE_ORDER,
  appendPreparationGridRevision,
  approveDjTrackPreparation,
  buildDjPreparationCue,
  deriveDjPhraseGrid,
  reviewDjTrackPreparation,
  setPreparationCue,
  setPreparationPhraseGrid,
} from "../../logic/edit/djTrackPreparation";
import { doubleBpm, halfBpm, nudgeGridOrigin, resetToDetectedGrid, setManualBpm, setManualOrigin } from "../../logic/loops/musicalGrid";
import { createSongSectionRevision, resolveActiveSongSection } from "../../logic/songAnalysis/songSectionRevisions";
import { EditTimeline } from "./EditTimeline";

interface Props {
  libraryTracks: Track[];
  sourceTrackId: string | null;
  onSelectSourceTrack(trackId: string): void;
  songAnalyses: CompleteSongAnalysis[];
  onUpdateSongAnalysis(id: string, patch: Partial<CompleteSongAnalysis>): void;
}

const id = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

export function DjTrackEditWorkspace({ libraryTracks, sourceTrackId, onSelectSourceTrack, songAnalyses, onUpdateSongAnalysis }: Props) {
  const selectedId = sourceTrackId ?? libraryTracks[0]?.trackId ?? null;
  const track = libraryTracks.find((candidate) => candidate.trackId === selectedId) ?? null;
  const analysis = songAnalyses.find((candidate) => candidate.sourceTrackId === selectedId) ?? null;
  return <DjTrackEditor key={selectedId ?? "empty"} {...{ libraryTracks, selectedId, track, analysis, onSelectSourceTrack, onUpdateSongAnalysis }} />;
}

interface EditorProps {
  libraryTracks: Track[];
  selectedId: string | null;
  track: Track | null;
  analysis: CompleteSongAnalysis | null;
  onSelectSourceTrack(trackId: string): void;
  onUpdateSongAnalysis(id: string, patch: Partial<CompleteSongAnalysis>): void;
}

function DjTrackEditor({ libraryTracks, selectedId, track, analysis, onSelectSourceTrack, onUpdateSongAnalysis }: EditorProps) {
  const model = useMemo(() => buildDjEditWorkspaceModel(track, analysis, nowIso()), [track, analysis]);
  const [cursorFrame, setCursorFrame] = useState(0);
  const [phraseOriginBar, setPhraseOriginBar] = useState(model.phraseGrid?.originBarIndex ?? 0);
  const [preciseBpm, setPreciseBpm] = useState(model.activeGrid?.grid.bpm ?? track?.bpm ?? 120);
  const [downbeatSeconds, setDownbeatSeconds] = useState(model.activeGrid?.grid.originSeconds ?? 0);
  const [message, setMessage] = useState<string | null>(null);

  const persist = (next: CompleteSongAnalysis) => onUpdateSongAnalysis(next.id, {
    djPreparation: next.djPreparation,
    sections: next.sections,
    sectionRevisions: next.sectionRevisions,
  });
  const applyGrid = (nextGrid: NonNullable<typeof model.activeGrid>["grid"], reason: Parameters<typeof appendPreparationGridRevision>[2]) => {
    if (!analysis) return;
    persist(appendPreparationGridRevision(analysis, nextGrid, reason, id("gridrev"), analysis.djPreparation?.id ?? id("djprep"), nowIso()));
    setPreciseBpm(nextGrid.bpm);
    setDownbeatSeconds(nextGrid.originSeconds);
    setPhraseOriginBar(0);
    setMessage("A new append-only grid revision is active. Phrase and cue evidence must be reconfirmed.");
  };
  const setCueAtCursor = (role: DjPreparationCueRole) => {
    if (!analysis || !model.activeGrid) return;
    const cue = buildDjPreparationCue(role, cursorFrame, analysis, model.activeGrid, id("djcue"), nowIso());
    persist(setPreparationCue(analysis, cue, analysis.djPreparation?.id ?? id("djprep"), nowIso()));
    setMessage(`${role} set at ${(cue.frame / analysis.sampleRate).toFixed(3)}s.`);
  };
  const failure = model.validation.valid ? null : DJ_PREPARATION_FAILURE_LABELS[model.validation.reason];

  return (
    <main className="dj-edit-workspace">
      <header className="dj-edit-header">
        <div><p className="dj-edit-eyebrow">AudioLab / Edit</p><h1>Track Preparation</h1><p>What is musically true about this track?</p></div>
        <label className="dj-edit-track-picker">Track<select value={selectedId ?? ""} onChange={(event) => onSelectSourceTrack(event.target.value)}>
          {libraryTracks.map((candidate) => <option key={candidate.trackId} value={candidate.trackId}>{candidate.artist ? `${candidate.artist} - ` : ""}{candidate.title}</option>)}
        </select></label>
      </header>
      {!track ? <section className="dj-edit-empty">No MUSIC track is available.</section> : !analysis ? (
        <section className="dj-edit-empty"><h2>{track.title}</h2><p>No Complete Song Analysis exists. Analyze the track in Looper before creating DJ preparation truth.</p></section>
      ) : (
        <>
          <section className="dj-edit-summary">
            <div><span>Track</span><strong>{track.title}</strong><small>{track.artist || "Unknown artist"} / {track.trackId}</small></div>
            <div><span>Preparation</span><strong className={`is-${model.preparationStatus}`}>{model.preparationStatus.replace("_", " ")}</strong><small>{failure ?? "All approval prerequisites are current."}</small></div>
            <div><span>Active grid</span><strong>{model.activeGrid ? `${model.activeGrid.grid.bpm.toFixed(3)} BPM` : "Unavailable"}</strong><small>{model.activeGrid ? `${model.activeGrid.grid.trust} / ${model.activeGrid.revisionId}` : "No detector evidence"}</small></div>
            <div><span>Origin</span><strong>{model.activeGrid ? `${model.activeGrid.grid.originSeconds.toFixed(3)}s` : "Unavailable"}</strong><small>{model.activeGrid ? `${model.activeGrid.grid.beatFrames.length} beats / ${model.activeGrid.grid.barFrames.length} bars` : ""}</small></div>
          </section>
          <EditTimeline track={track} model={model} cursorFrame={cursorFrame} onCursorFrameChange={setCursorFrame} />
          <p className="dj-edit-cursor">Edit cursor: {(cursorFrame / analysis.sampleRate).toFixed(3)}s / frame {cursorFrame}</p>
          {message && <p className="dj-edit-message" role="status">{message}</p>}

          <div className="dj-edit-columns">
            <section className="dj-edit-panel"><h2>Musical Grid</h2><p className="dj-edit-provenance">Detector evidence remains immutable. Commands append revisions to the shared preparation authority.</p>
              <div className="dj-edit-field"><label>Downbeat / origin (seconds)<input type="number" step="0.001" value={downbeatSeconds} onChange={(event) => setDownbeatSeconds(Number(event.target.value))} /></label>
                <button disabled={!model.activeGrid} onClick={() => model.activeGrid && applyGrid(setManualOrigin(model.activeGrid.grid, downbeatSeconds, model.durationSeconds, analysis.sampleRate, nowIso()), "manual_origin")}>Set downbeat</button></div>
              <div className="dj-edit-actions"><button disabled={!model.activeGrid} onClick={() => model.activeGrid && applyGrid(nudgeGridOrigin(model.activeGrid.grid, -0.001, model.durationSeconds, analysis.sampleRate, nowIso()), "manual_nudge")}>Nudge -1ms</button><button disabled={!model.activeGrid} onClick={() => model.activeGrid && applyGrid(nudgeGridOrigin(model.activeGrid.grid, 0.001, model.durationSeconds, analysis.sampleRate, nowIso()), "manual_nudge")}>Nudge +1ms</button></div>
              <div className="dj-edit-field"><label>Precise BPM<input type="number" min="1" step="0.001" value={preciseBpm} onChange={(event) => setPreciseBpm(Number(event.target.value))} /></label>
                <button disabled={!model.activeGrid || preciseBpm <= 0} onClick={() => model.activeGrid && applyGrid(setManualBpm(model.activeGrid.grid, preciseBpm, model.durationSeconds, analysis.sampleRate, nowIso()), "manual_bpm")}>Set BPM</button></div>
              <div className="dj-edit-actions"><button disabled={!model.activeGrid} onClick={() => model.activeGrid && applyGrid(halfBpm(model.activeGrid.grid, model.durationSeconds, analysis.sampleRate, nowIso()), "half_bpm")}>Half BPM</button><button disabled={!model.activeGrid} onClick={() => model.activeGrid && applyGrid(doubleBpm(model.activeGrid.grid, model.durationSeconds, analysis.sampleRate, nowIso()), "double_bpm")}>Double BPM</button><button disabled={!model.detectedGrid} onClick={() => {
                const reset = resetToDetectedGrid(track.beatMap, track.bpm, analysis.sourceMediaFingerprint, model.durationSeconds, analysis.sampleRate, nowIso());
                if (reset) applyGrid(reset, "reset_detected");
              }}>Reset detected</button></div>
            </section>

            <section className="dj-edit-panel"><h2>Phrase Review</h2><p className="dj-edit-provenance">4 / 8 / 16 / 32-bar boundaries are deterministic grid inference, never detector truth.</p>
              <label>Phrase origin bar<input type="number" min="0" max={Math.max(0, (model.activeGrid?.grid.barFrames.length ?? 1) - 1)} value={phraseOriginBar} onChange={(event) => setPhraseOriginBar(Number(event.target.value))} /></label>
              <div className="dj-edit-phrase-key"><span className="is-inferred">Inferred</span><span className="is-confirmed">Manually confirmed</span></div>
              <p>{model.phraseGrid?.boundaries.length ?? 0} boundaries across {DJ_PHRASE_GROUPINGS.join(" / ")} bars. {model.phraseGridPersisted ? "Saved in preparation." : "Preview only."}</p>
              <button disabled={!model.activeGrid} onClick={() => {
                if (!analysis || !model.activeGrid) return;
                const phrase = deriveDjPhraseGrid(model.activeGrid, phraseOriginBar, DJ_PHRASE_GROUPINGS, "manually_confirmed", nowIso());
                persist(setPreparationPhraseGrid(analysis, phrase, analysis.djPreparation?.id ?? id("djprep"), nowIso()));
                setMessage("Phrase alignment manually confirmed for the active grid.");
              }}>Confirm phrase alignment</button>
            </section>

            <section className="dj-edit-panel"><h2>DJ Preparation Cues</h2><p className="dj-edit-provenance">Frame-authoritative, track-level preparation truth. Click the timeline, then set each role.</p>
              <div className="dj-edit-cue-list">{DJ_PREPARATION_CUE_ORDER.map((role) => {
                const cue = analysis.djPreparation?.cues[role];
                return <div key={role}><strong>{role}</strong><span>{cue ? `${(cue.frame / analysis.sampleRate).toFixed(3)}s / frame ${cue.frame}` : "Not set"}</span><button disabled={!model.activeGrid} onClick={() => setCueAtCursor(role)}>{cue ? "Move to cursor" : "Set at cursor"}</button></div>;
              })}</div>
              <div className="dj-edit-generic-cues"><h3>Generic Track Cues</h3><p>Separate library markers, not semantic DJ preparation cues.</p>{(track.cuePoints ?? []).length ? <ul>{track.cuePoints!.map((cue) => <li key={cue.id}>{cue.label || "Cue"} / {cue.timeSeconds.toFixed(3)}s</li>)}</ul> : <p>None</p>}</div>
            </section>

            <section className="dj-edit-panel"><h2>Sections & Approval</h2><div className="dj-edit-section-list">{analysis.sections.map((section) => {
              const resolved = resolveActiveSongSection(section, analysis.sectionRevisions);
              return <div key={section.id}><span>{resolved.displayLabel}</span><strong>{resolved.verification}</strong>{resolved.verification === "provisional" && <button onClick={() => {
                const revision = createSongSectionRevision(section, { parentRevisionId: section.activeRevisionId, verification: "reviewed" });
                persist({ ...analysis, sections: analysis.sections.map((candidate) => candidate.id === section.id ? { ...candidate, activeRevisionId: revision.id } : candidate), sectionRevisions: [...analysis.sectionRevisions, revision] });
                setMessage(`${resolved.displayLabel} marked reviewed through an append-only section revision.`);
              }}>Mark reviewed</button>}</div>;
            })}</div>
              <div className="dj-edit-approval"><p className={failure ? "is-blocked" : "is-ready"}>{failure ?? "Preparation is ready for review or approval."}</p>
                <button disabled={!model.activeGrid} onClick={() => {
                  if (!track || !analysis || !model.activeGrid) return;
                  const next = reviewDjTrackPreparation(analysis, model.activeGrid, nowIso());
                  if (next !== analysis) { persist(next); setMessage("Preparation reviewed against the current evidence."); }
                  else setMessage(failure ?? "Preparation could not be reviewed.");
                }}>Review preparation</button>
                <button disabled={!model.activeGrid} onClick={() => {
                  if (!track || !analysis || !model.activeGrid) return;
                  const next = approveDjTrackPreparation(track, analysis, model.activeGrid, nowIso());
                  if (next !== analysis) { persist(next); setMessage("Preparation approved against the current evidence basis."); }
                  else setMessage(analysis.djPreparation?.status === "reviewed" ? (failure ?? "Preparation could not be approved.") : "Review preparation before approval.");
                }}>Approve preparation</button>
              </div>
            </section>
          </div>
        </>
      )}
    </main>
  );
}
