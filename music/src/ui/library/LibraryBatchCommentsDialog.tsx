// Shared batch Comments editing — used identically by Catalog, External,
// and Sounds. Defaults to Append (never Replace/Clear); shows the exact
// affected count and a before/after preview; Replace/Clear require an
// explicit confirm.

import { useMemo, useState } from "react";
import type { Track } from "../../data/trackTypes";
import { previewBatchCommentOperation, type BatchCommentMode } from "../../logic/library/libraryComments";

interface Props {
  selectedTracks: Track[];
  onApply: (mode: BatchCommentMode, text: string) => void;
  onClose: () => void;
}

export function LibraryBatchCommentsDialog({ selectedTracks, onApply, onClose }: Props) {
  const [mode, setMode] = useState<BatchCommentMode>("append");
  const [text, setText] = useState("");
  const [confirmingDestructive, setConfirmingDestructive] = useState(false);

  const preview = useMemo(
    () => previewBatchCommentOperation(mode, text, selectedTracks),
    [mode, text, selectedTracks],
  );

  const isDestructive = mode === "replace" || mode === "clear";

  function handleApplyClick() {
    if (isDestructive && !confirmingDestructive) {
      setConfirmingDestructive(true);
      return;
    }
    onApply(mode, text);
  }

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal cat-batch-comments-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Edit Comments — {selectedTracks.length} track{selectedTracks.length !== 1 ? "s" : ""}</h3>
        <div className="cat-batch-comments-modes">
          <label><input type="radio" checked={mode === "append"} onChange={() => { setMode("append"); setConfirmingDestructive(false); }} /> Append to every selected track</label>
          <label><input type="radio" checked={mode === "replace"} onChange={() => { setMode("replace"); setConfirmingDestructive(false); }} /> Replace on every selected track</label>
          <label><input type="radio" checked={mode === "clear"} onChange={() => { setMode("clear"); setConfirmingDestructive(false); }} /> Clear on every selected track</label>
        </div>
        {mode !== "clear" && (
          <textarea
            className="cat-batch-comments-textarea"
            autoFocus
            placeholder={mode === "append" ? "Text to append…" : "New comment text…"}
            value={text}
            onChange={(e) => { setText(e.target.value); setConfirmingDestructive(false); }}
          />
        )}
        <div className="cat-batch-comments-preview">
          Affects <b>{preview.affectedCount}</b> track{preview.affectedCount !== 1 ? "s" : ""}.
          {preview.sampleBefore !== undefined || preview.sampleAfter !== undefined ? (
            <div className="cat-batch-comments-sample">
              <div><span className="dim">Before:</span> {preview.sampleBefore || <span className="dim">(empty)</span>}</div>
              <div><span className="dim">After:</span> {preview.sampleAfter || <span className="dim">(empty)</span>}</div>
            </div>
          ) : null}
        </div>
        {confirmingDestructive && (
          <div className="cat-batch-comments-confirm">
            This will {mode === "clear" ? "clear" : "overwrite"} comments on {preview.affectedCount} track{preview.affectedCount !== 1 ? "s" : ""}. Continue?
          </div>
        )}
        <div className="cat-batch-comments-actions">
          <button className="tb-btn sm" onClick={onClose}>Cancel</button>
          <button className={`tb-btn sm${isDestructive ? " remove-btn" : ""}`} onClick={handleApplyClick}>
            {confirmingDestructive ? "Confirm" : "Apply"}
          </button>
        </div>
      </div>
    </div>
  );
}
