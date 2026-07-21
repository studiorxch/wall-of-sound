// Complete Song Intelligence and Section Map (0717C §7) — the horizontal,
// waveform-aligned, interactive Section Map. Placed as its own row (a
// sibling AFTER .looper-waveform-stack closes, not another absolutely-
// positioned overlay inside it — see SectionalLooperWorkspace.tsx). A
// stateless SVG renderer with onPointerDown-callback props, matching
// TimelineSelectionOverlay.tsx's exact pattern — all actual drag-state
// machinery (dragModeRef + one shared window pointermove/pointerup effect)
// lives in the workspace, not here, so the whole app has exactly one
// listener registration for this class of interaction.
//
// §7.5 overlay-architecture contract: only "structure" is implemented —
// the type is already widened to the full future set so a later build can
// add modes without a breaking prop-shape change; no crowded multi-layer
// visualization is built now.

import type { SongSectionVerification, SongStructuralType } from "../../data/songAnalysisTypes";

export type SectionMapOverlayMode = "structure" | "radio_role" | "energy" | "transition" | "stems";

export interface SectionMapDisplaySection {
  id: string;
  structuralType: SongStructuralType;
  displayLabel: string;
  startFrame: number;
  endFrame: number;
  verification: SongSectionVerification;
}

interface SectionMapProps {
  sections: SectionMapDisplaySection[];
  totalFrames: number;
  sampleRate: number;
  viewStartSeconds?: number;
  viewEndSeconds?: number;
  selectedSectionId?: string | null;
  overlayMode?: SectionMapOverlayMode;
  onSectionClick: (id: string) => void;
  onSectionDoubleClick: (id: string) => void;
  onBoundaryDown: (sectionId: string, edge: "start" | "end", e: React.PointerEvent) => void;
}

const VIEW_W = 1000;
const VIEW_H = 40;
const HANDLE_W = 5;

// spec §7.2 — stable structural color families. Same base type = same hue;
// variations use shade/marker differences only (handled via the
// verification treatment below), never a different hue.
const STRUCTURAL_COLOR_CLASS: Record<SongStructuralType, string> = {
  intro: "song-section-cyan",
  outro: "song-section-cyan",
  body: "song-section-green",
  verse: "song-section-green",
  chorus: "song-section-amber",
  breakdown: "song-section-violet",
  bridge: "song-section-blue",
  interlude: "song-section-blue",
  full_composition: "song-section-gray",
  independent: "song-section-gray",
  unknown: "song-section-gray",
};

export function SectionMap({
  sections, totalFrames, sampleRate, viewStartSeconds, viewEndSeconds,
  selectedSectionId, overlayMode = "structure", onSectionClick, onSectionDoubleClick, onBoundaryDown,
}: SectionMapProps) {
  const durationSeconds = Math.max(totalFrames / Math.max(sampleRate, 1), 0.001);
  const viewStart = Math.max(0, viewStartSeconds ?? 0);
  const viewEnd = Math.min(durationSeconds, viewEndSeconds ?? durationSeconds);
  const windowDur = Math.max(viewEnd - viewStart, 0.001);
  const xAt = (frame: number) => ((frame / sampleRate - viewStart) / windowDur) * VIEW_W;

  if (sections.length === 0) return null;
  // Only "structure" is implemented in this build — see file header.
  if (overlayMode !== "structure") return null;

  return (
    <div className="looper-section-map" role="region" aria-label="Section Map">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} preserveAspectRatio="none" className="looper-section-map-svg">
        {sections.map((section) => {
          const x1 = xAt(section.startFrame);
          const x2 = xAt(section.endFrame);
          const width = Math.max(0, x2 - x1);
          const isSelected = section.id === selectedSectionId;
          const colorClass = STRUCTURAL_COLOR_CLASS[section.structuralType];
          const verificationClass = `is-${section.verification}`;

          return (
            <g key={section.id}>
              <rect
                x={x1} y={0} width={width} height={VIEW_H}
                className={`looper-section-band ${colorClass} ${verificationClass}${isSelected ? " is-selected" : ""}`}
                onClick={() => onSectionClick(section.id)}
                onDoubleClick={() => onSectionDoubleClick(section.id)}
                role="button"
                tabIndex={0}
                aria-label={`${section.displayLabel} — ${section.structuralType}, ${section.verification}. ${section.startFrame} to ${section.endFrame} frames.`}
                aria-pressed={isSelected}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSectionClick(section.id); } }}
              />
              {width > 28 && (
                <text x={x1 + 6} y={VIEW_H / 2 + 4} className="looper-section-label" pointerEvents="none">
                  {section.displayLabel}{section.verification === "provisional" ? " (provisional)" : section.verification === "reviewed" ? " ✓" : " ✓✓"}
                </text>
              )}
              <rect
                x={x1 - HANDLE_W / 2} y={0} width={HANDLE_W} height={VIEW_H}
                className="looper-section-handle"
                style={{ cursor: "ew-resize" }}
                onPointerDown={(e) => onBoundaryDown(section.id, "start", e)}
                role="slider"
                aria-label={`${section.displayLabel} start boundary`}
              />
              <rect
                x={x2 - HANDLE_W / 2} y={0} width={HANDLE_W} height={VIEW_H}
                className="looper-section-handle"
                style={{ cursor: "ew-resize" }}
                onPointerDown={(e) => onBoundaryDown(section.id, "end", e)}
                role="slider"
                aria-label={`${section.displayLabel} end boundary`}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
