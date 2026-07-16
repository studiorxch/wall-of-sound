import { useEffect, useRef, useState } from "react";

// Compact row overflow menu (0712_MUSIC_Playlist_Shape_Inline_Editing §15) —
// the only place Duplicate/Remove live now; no permanent action buttons,
// no section Lock control.
export function SectionRowMenu({ onDuplicate, onRemove }: { onDuplicate: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="npw-row-menu" ref={ref}>
      <button
        type="button"
        className="npw-row-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Section actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        ⋯
      </button>
      {open && (
        <div className="npw-row-menu-list" role="menu">
          <button type="button" role="menuitem" className="npw-row-menu-item" onClick={() => { onDuplicate(); setOpen(false); }}>
            Duplicate section
          </button>
          <button type="button" role="menuitem" className="npw-row-menu-item npw-row-menu-item--danger" onClick={() => { onRemove(); setOpen(false); }}>
            Remove section
          </button>
        </div>
      )}
    </div>
  );
}
