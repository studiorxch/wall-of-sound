// Shared Comments cell — used identically by Catalog, External, and
// Sounds. Truncated single-line preview with a real expandable tooltip;
// click or Enter opens a multiline editor. Cmd/Ctrl+Enter or the Save
// button commits; Escape restores the prior value; blur commits only when
// focus leaves the whole editor surface (container-based relatedTarget
// check, not the textarea alone) so clicking Save doesn't fire a
// conflicting blur-commit. Keystrokes are stopped from bubbling to the
// grid's own keyboard handler while editing — the grid's own key handler
// also early-returns whenever a comment is being edited, so this is
// defense in depth, not the only guard.

import { useEffect, useRef, useState } from "react";
import type { Track } from "../../data/trackTypes";
import { normalizeCommentInput, truncateCommentPreview } from "../../logic/library/libraryComments";

interface Props {
  track: Track;
  isEditing: boolean;
  onStartEdit: () => void;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

export function LibraryCommentsCell({ track, isEditing, onStartEdit, onCommit, onCancel }: Props) {
  const [draft, setDraft] = useState(track.notes ?? "");
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  // Reset the draft the instant editing turns on, without an effect's
  // extra render pass — React's documented pattern for deriving state from
  // a prop transition (https://react.dev/learn/you-might-not-need-an-effect).
  const [wasEditing, setWasEditing] = useState(isEditing);
  if (isEditing !== wasEditing) {
    setWasEditing(isEditing);
    if (isEditing) setDraft(track.notes ?? "");
  }

  useEffect(() => {
    if (isEditing) requestAnimationFrame(() => textareaRef.current?.focus());
  }, [isEditing]);

  if (!isEditing) {
    const preview = truncateCommentPreview(track.notes, 60);
    const full = (track.notes ?? "").trim();
    return (
      <div
        className="cat-comments-preview"
        tabIndex={-1}
        onClick={onStartEdit}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onStartEdit(); } }}
        onMouseEnter={() => full && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {preview || <span className="dim">—</span>}
        {showTooltip && full && (
          <div className="cat-comments-tooltip">{full}</div>
        )}
      </div>
    );
  }

  function commit() {
    onCommit(normalizeCommentInput(draft) ?? "");
  }

  return (
    <div
      ref={containerRef}
      className="cat-comments-editor"
      onBlur={(e) => {
        if (!containerRef.current?.contains(e.relatedTarget as Node | null)) {
          commit();
        }
      }}
    >
      <textarea
        ref={textareaRef}
        className="cat-comments-textarea"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") { e.preventDefault(); onCancel(); return; }
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit(); }
        }}
      />
      <div className="cat-comments-editor-actions">
        <button type="button" className="tb-btn sm" onMouseDown={(e) => e.preventDefault()} onClick={commit}>Save</button>
        <button type="button" className="tb-btn sm" onMouseDown={(e) => e.preventDefault()} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
