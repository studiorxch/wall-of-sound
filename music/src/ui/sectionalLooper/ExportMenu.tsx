import { useEffect, useRef, useState } from "react";

// Sectional Looper Radio Export Bridge (0717B §8.1) — replaces the single
// "Export WAV" button with an [Export ▾] menu (WAV / RADIO). Modeled
// directly on src/ui/playlistShape/SectionRowMenu.tsx's open/outside-click
// pattern (same npw-row-menu* CSS family), extended with Escape-to-close.
interface ExportMenuProps {
  onSelectWav: () => void;
  onSelectRadio: () => void;
  wavDisabled?: boolean;
  radioDisabled?: boolean;
  radioDisabledReason?: string;
}

export function ExportMenu({ onSelectWav, onSelectRadio, wavDisabled, radioDisabled, radioDisabledReason }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="npw-row-menu looper-export-menu" ref={ref}>
      <button
        type="button"
        className="npw-row-menu-trigger looper-export-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Export"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        Export ▾
      </button>
      {open && (
        <div className="npw-row-menu-list" role="menu">
          <button
            type="button" role="menuitem" className="npw-row-menu-item"
            disabled={wavDisabled}
            onClick={() => { setOpen(false); onSelectWav(); }}
          >
            WAV
          </button>
          <button
            type="button" role="menuitem" className="npw-row-menu-item"
            disabled={radioDisabled}
            title={radioDisabled ? radioDisabledReason : undefined}
            onClick={() => { setOpen(false); onSelectRadio(); }}
          >
            RADIO
          </button>
        </div>
      )}
    </div>
  );
}
