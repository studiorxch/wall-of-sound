// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §25 — compact
// before/after revision comparison. No full visual diff, per spec.

import type { RevisionCompareSummary as Summary } from "../../logic/loops/loopRevisions";

interface RevisionCompareSummaryProps {
  summary: Summary;
}

function fmt(n: number): string {
  return n.toFixed(3);
}

export function RevisionCompareSummary({ summary }: RevisionCompareSummaryProps) {
  return (
    <div className="looper-revision-compare" role="table" aria-label="Revision comparison">
      <div role="row"><span>Start</span><span>{fmt(summary.startBeforeSeconds)} → {fmt(summary.startAfterSeconds)}</span></div>
      <div role="row"><span>End</span><span>{fmt(summary.endBeforeSeconds)} → {fmt(summary.endAfterSeconds)}</span></div>
      <div role="row">
        <span>Length</span>
        <span>
          {summary.barsBefore != null && summary.barsAfter != null
            ? `${summary.barsBefore.toFixed(2)} bars → ${summary.barsAfter.toFixed(2)} bars`
            : `${fmt(summary.durationBeforeSeconds)}s → ${fmt(summary.durationAfterSeconds)}s`}
        </span>
      </div>
    </div>
  );
}
