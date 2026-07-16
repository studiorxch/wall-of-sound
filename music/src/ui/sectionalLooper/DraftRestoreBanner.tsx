// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §20 —
// "Draft selection needs review" banner. Pure presentational: the actual
// staleness computation lives in logic/loops/draftSelectionStaleness.ts.

interface DraftRestoreBannerProps {
  onClear: () => void;
}

export function DraftRestoreBanner({ onClear }: DraftRestoreBannerProps) {
  return (
    <div className="looper-warning looper-draft-stale-banner" role="alert">
      <span>Draft selection needs review — the source, grid, or segmentation changed since this draft was saved.</span>
      <button onClick={onClear}>Clear Draft</button>
    </div>
  );
}
