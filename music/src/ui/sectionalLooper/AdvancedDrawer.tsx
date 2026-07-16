// 0716A_MUSIC_Direct_Manipulation_Looper_And_Playhead — the ONE collapsed
// "Advanced" disclosure the spec asks for. Nests everything demoted out of
// the default direct-manipulation view: boundary-audition mode, grid-phase
// nudge, Zoom/Backdrop/Grouping/Structure, raw numeric boundary fields and
// diagnostic readouts, Undo/Redo, the grid-status and segment panels, the
// Mark Heard/Reject/Create Stem Loops actions, and — nested one level
// deeper, completely unchanged — the existing 0715G AdvancedCandidatesPanel
// (candidate table + developer-only card wall). Collapsed by default; never
// required for selection, preview, movement, or export.

import { useState, type ReactNode } from "react";

interface AdvancedDrawerProps {
  children: ReactNode;
}

export function AdvancedDrawer({ children }: AdvancedDrawerProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="looper-advanced-drawer">
      <button
        className="looper-advanced-drawer-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? "▾" : "▸"} Advanced
      </button>
      {expanded && <div className="looper-advanced-drawer-body">{children}</div>}
    </div>
  );
}
