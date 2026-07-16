// 0714R — section + length grouping (§17, §18). Groups candidate indices by
// their sectionLabel, shows a header with timing/trust/count, and applies a
// length filter (default 8/16/32 visible, 4/64 behind a "Show all lengths"
// toggle) so the buffet stays comparable without becoming a flat card wall.

import { useState, type ReactNode } from "react";
import type { LoopCandidate } from "../../logic/loops/loopCandidates";

export interface SectionEntry {
  label: string;
  start: number;
  end: number;
  indices: number[]; // indices into the full candidates array
}

const DEFAULT_VISIBLE_LENGTHS = new Set([8, 16, 32]);

function candidateLengthKey(c: LoopCandidate): number {
  return c.length.kind === "bars" ? c.length.bars : c.length.seconds;
}

export function groupCandidatesBySection(candidates: LoopCandidate[]): SectionEntry[] {
  const bySection = new Map<string, SectionEntry>();
  candidates.forEach((c, i) => {
    const key = c.sectionLabel;
    let entry = bySection.get(key);
    if (!entry) {
      entry = { label: key, start: c.startSeconds, end: c.endSeconds, indices: [] };
      bySection.set(key, entry);
    }
    entry.start = Math.min(entry.start, c.startSeconds);
    entry.end = Math.max(entry.end, c.endSeconds);
    entry.indices.push(i);
  });
  return Array.from(bySection.values()).sort((a, b) => a.start - b.start);
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

interface Props {
  section: SectionEntry;
  candidates: LoopCandidate[];
  renderCandidate: (index: number, candidate: LoopCandidate) => ReactNode;
}

export function LoopSectionGroup({ section, candidates, renderCandidate }: Props) {
  const [showAllLengths, setShowAllLengths] = useState(false);

  const trusted = section.indices.some((i) => candidates[i].gridTrusted);
  const provisional = section.indices.some((i) => candidates[i].provisional);
  const trustLabel = trusted ? "Trusted grid" : provisional ? "Provisional grid" : "Time-based";

  const visibleIndices = section.indices.filter((i) => {
    if (showAllLengths) return true;
    return DEFAULT_VISIBLE_LENGTHS.has(candidateLengthKey(candidates[i]));
  });
  const hiddenCount = section.indices.length - visibleIndices.length;

  return (
    <div className="looper-section-group" id={`looper-section-${section.label.replace(/\s+/g, "-")}`}>
      <div className="looper-section-header">
        <span className="looper-section-name">{section.label}</span>
        <span className="looper-section-range">{fmtTime(section.start)} → {fmtTime(section.end)}</span>
        <span className="looper-section-trust">{trustLabel}</span>
        <span className="looper-section-count">{section.indices.length} candidate{section.indices.length === 1 ? "" : "s"}</span>
        {hiddenCount > 0 && (
          <button className="looper-section-toggle" onClick={() => setShowAllLengths(true)}>
            Show {hiddenCount} more (4 / 64 bar)
          </button>
        )}
        {showAllLengths && (
          <button className="looper-section-toggle" onClick={() => setShowAllLengths(false)}>
            Show fewer lengths
          </button>
        )}
      </div>
      <div className="looper-section-cards">
        {visibleIndices.map((i) => renderCandidate(i, candidates[i]))}
      </div>
    </div>
  );
}
