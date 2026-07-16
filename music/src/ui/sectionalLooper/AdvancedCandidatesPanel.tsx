// 0715G_MUSIC_Sectional_Looper_Simplification_And_Stem_Ready_Export §4 —
// collapsed-by-default wrapper around the EXISTING compact candidate table
// (and, nested inside it, the existing developer-debug-only card wall).
// Zero changes to what it wraps — this is chrome only. Must never be
// required to select/preview/customize/export a loop through the new
// default flow; it stays closed until the user explicitly opens it.

import { useState, type ReactNode } from "react";

interface AdvancedCandidatesPanelProps {
  children: ReactNode;
  count: number;
}

export function AdvancedCandidatesPanel({ children, count }: AdvancedCandidatesPanelProps) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="looper-advanced-candidates">
      <button
        className="looper-advanced-candidates-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
      >
        {expanded ? "▾" : "▸"} Advanced Candidates ({count})
      </button>
      {expanded && <div className="looper-advanced-candidates-body">{children}</div>}
    </div>
  );
}
