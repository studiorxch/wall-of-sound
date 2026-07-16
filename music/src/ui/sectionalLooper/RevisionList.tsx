// 0715E_MUSIC_Loop_Revision_Activation_And_Stem_Source_Entry §8 — the full
// per-loop revision timeline (v1 · Original plus every stored LoopRevision),
// replacing the single-line "Revision: vN · reason" summary. Every row's
// active/previous state comes from `entry.isActive`, already computed via
// revisionIdsMatch in buildRevisionTimeline — never re-derived here.

import type { RevisionTimelineEntry } from "../../logic/loops/loopRevisions";

interface RevisionListProps {
  timeline: RevisionTimelineEntry[];
  rendering: boolean;
  onMakeActive: (revisionId: string | null) => void;
  onOpen: (revisionId: string | null) => void;
  onRender: () => void;
  onCompare: (revisionId: string | null) => void;
}

export function RevisionList({ timeline, rendering, onMakeActive, onOpen, onRender, onCompare }: RevisionListProps) {
  return (
    <div className="looper-revision-list" role="table" aria-label="Loop revisions">
      {timeline.map((entry) => (
        <div
          key={entry.id ?? "original"}
          role="row"
          className={`looper-revision-row${entry.isActive ? " looper-revision-row-active" : ""}`}
        >
          <span className="looper-revision-row-label">
            {entry.label} · {entry.isActive ? "Active" : "Previous"}
          </span>
          <span className="looper-revision-row-actions">
            {!entry.isActive && <button onClick={() => onMakeActive(entry.id)}>Make Active</button>}
            <button onClick={() => onOpen(entry.id)}>Open</button>
            <button disabled={!entry.isActive || rendering} onClick={onRender}>
              {rendering ? "Rendering…" : "Render"}
            </button>
            <button onClick={() => onCompare(entry.id)}>Compare</button>
          </span>
        </div>
      ))}
    </div>
  );
}
