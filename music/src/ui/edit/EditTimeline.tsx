import type { Track } from "../../data/trackTypes";
import type { DjEditWorkspaceModel } from "../../logic/edit/djEditWorkspace";
import { buildGridBackdropBands } from "../../logic/loops/gridBackdrop";
import { GridBackdropLayer } from "../sectionalLooper/GridBackdropLayer";
import { MusicalRuler } from "../sectionalLooper/MusicalRuler";
import { createTimelineTransform } from "../sectionalLooper/timelineTransform";

const VIEW_W = 1000;
const VIEW_H = 120;

interface Props {
  track: Track;
  model: DjEditWorkspaceModel;
  cursorFrame: number;
  onCursorFrameChange(frame: number): void;
}

export function EditTimeline({ track, model, cursorFrame, onCursorFrameChange }: Props) {
  const analysis = model.analysis;
  if (!analysis) return null;
  const transform = createTimelineTransform(0, analysis.decodedFrameCount, VIEW_W, analysis.sampleRate);
  const waveform = analysis.waveformSummary;
  const count = waveform ? Math.min(waveform.minValues.length, waveform.maxValues.length) : 0;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let index = 0; index < count; index++) {
    const x = (index / Math.max(1, count - 1)) * VIEW_W;
    top.push(`${x.toFixed(2)},${(VIEW_H / 2 - (waveform?.maxValues[index] ?? 0) * (VIEW_H / 2 - 5)).toFixed(2)}`);
    bottom.push(`${x.toFixed(2)},${(VIEW_H / 2 - (waveform?.minValues[index] ?? 0) * (VIEW_H / 2 - 5)).toFixed(2)}`);
  }
  const grid = model.activeGrid?.grid ?? null;
  const backdrop = grid ? buildGridBackdropBands(grid.barFrames) : null;
  const phraseBoundaries = model.phraseGrid?.boundaries ?? [];
  const preparationCues = Object.values(analysis.djPreparation?.cues ?? {});

  return (
    <div className="edit-timeline-shell">
      <MusicalRuler grid={grid} sampleRate={analysis.sampleRate} zoomLevel="bars" transform={transform} />
      <div
        className="edit-timeline"
        role="application"
        aria-label={`DJ preparation timeline for ${track.title}`}
        onPointerDown={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          const frame = transform.xToFrame(((event.clientX - bounds.left) / Math.max(1, bounds.width)) * VIEW_W);
          onCursorFrameChange(Math.max(0, Math.min(analysis.decodedFrameCount - 1, Math.round(frame))));
        }}
      >
        <GridBackdropLayer
          durationSeconds={model.durationSeconds}
          sampleRate={analysis.sampleRate}
          backdropLevels={backdrop}
          groupingEmphasis={8}
          structuralSections={model.sections}
          showBackdrop
          showStructure
          beatFrames={grid?.beatFrames}
        />
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="edit-timeline__waveform">
          {count > 0 ? <polygon points={[...top, ...bottom.reverse()].join(" ")} className="edit-timeline__peaks" /> : null}
          {phraseBoundaries.map((boundary) => {
            const frame = grid?.barFrames[boundary.barIndex];
            if (frame == null) return null;
            const x = transform.frameToX(frame);
            return <line key={`${boundary.groupingBars}-${boundary.barIndex}`} x1={x} x2={x} y1="0" y2={VIEW_H}
              className={`edit-timeline__phrase is-${boundary.provenance}`} />;
          })}
          {(track.cuePoints ?? []).map((cue) => {
            const x = transform.secondsToX(cue.timeSeconds);
            return <line key={cue.id} x1={x} x2={x} y1="0" y2={VIEW_H} className="edit-timeline__generic-cue" />;
          })}
          {preparationCues.map((cue) => {
            const x = transform.frameToX(cue.frame);
            return <g key={cue.id}><line x1={x} x2={x} y1="0" y2={VIEW_H} className="edit-timeline__preparation-cue" />
              <text x={x + 3} y={VIEW_H - 6} className="edit-timeline__cue-label">{cue.role}</text></g>;
          })}
          <line x1={transform.frameToX(cursorFrame)} x2={transform.frameToX(cursorFrame)} y1="0" y2={VIEW_H} className="edit-timeline__cursor" />
        </svg>
        {count === 0 && <div className="edit-timeline__empty">Persisted waveform unavailable. Analyze this track in Looper.</div>}
      </div>
    </div>
  );
}
