import { useEffect, useRef, useState } from "react";

// Inline duration editing (0712_MUSIC_Playlist_Shape_Inline_Editing §7).
// Display "20m" -> click -> "[20] min" -> Enter/blur commits, Escape cancels.
export function InlineSectionDuration({
  minutes, min = 1, max = 180, onCommit,
}: {
  minutes: number;
  min?: number;
  max?: number;
  onCommit: (next: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(minutes));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(String(minutes));
  }, [minutes, editing]);

  function startEdit() {
    setDraft(String(minutes));
    setEditing(true);
  }

  function commit() {
    const n = Math.round(Number(draft));
    if (Number.isFinite(n)) onCommit(Math.min(max, Math.max(min, n)));
    setEditing(false);
  }

  function cancel() {
    setDraft(String(minutes));
    setEditing(false);
  }

  if (!editing) {
    return (
      <button type="button" className="npw-inline-dur npw-inline-dur--display" onClick={startEdit} title="Click to edit duration">
        {minutes}m
      </button>
    );
  }

  return (
    <span className="npw-inline-dur npw-inline-dur--editing">
      <input
        ref={inputRef}
        className="tb-num"
        type="number"
        min={min}
        max={max}
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          else if (e.key === "Escape") { e.preventDefault(); cancel(); }
        }}
        aria-label="Section duration in minutes"
      />
      <span>min</span>
    </span>
  );
}
