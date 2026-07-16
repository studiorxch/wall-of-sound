import { useMemo, useState } from "react";
import type { TrackSlot } from "../data/playlistTypes";
import type { Track } from "../data/trackTypes";
import type { TrackEligibilityContext } from "../logic/trackEligibility";
import {
  computeFlowAnalysis,
  classifyMovement,
  formatFlowTimestamp,
  type PlaylistFlowPoint,
} from "../lib/playlistFlowAnalysis";

// Read-only, tracklist-bound flow analysis (0711_MUSIC_Playlist_Flow_Curve_Analysis_Rebind).
// Every dot is a real playlist row — no editable dragging, no generated ideal
// curve. Wizard = create playlist; this = analyze it.

const EXPANDED_STORAGE_KEY = "music.playlist.flowCurve.expanded";

function readExpandedPref(): boolean {
  try {
    const raw = localStorage.getItem(EXPANDED_STORAGE_KEY);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
}

function writeExpandedPref(expanded: boolean) {
  try {
    localStorage.setItem(EXPANDED_STORAGE_KEY, expanded ? "1" : "0");
  } catch {
    // localStorage unavailable — preference just won't persist this session
  }
}

function fmtHM(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

type Props = {
  slots: TrackSlot[];
  tracksById: Map<string, Track>;
  eligibilityContext?: TrackEligibilityContext;
  selectedSlotIndex?: number | null;
  onSelectSlot?: (slotIndex: number | null) => void;
};

const CHART_W = 640;
const CHART_H = 90;
const PAD_X = 6;
const PAD_TOP = 10;
const PAD_BOTTOM = 18;

export function PlaylistFlowChart({ slots, tracksById, eligibilityContext, selectedSlotIndex, onSelectSlot }: Props) {
  const [expanded, setExpanded] = useState(readExpandedPref);
  const [clickedIdx, setClickedIdx] = useState<number | null>(null);

  // Explicit derived analysis every render — no memoized staleness across
  // playlist edits (spec §Accuracy Requirements). slots/tracksById/context
  // are cheap to recompute against; useMemo here only avoids redundant work
  // within a single render pass, not across stale renders.
  const analysis = useMemo(
    () => computeFlowAnalysis(slots, tracksById, eligibilityContext),
    [slots, tracksById, eligibilityContext],
  );

  function toggleExpanded() {
    setExpanded((e) => {
      const next = !e;
      writeExpandedPref(next);
      return next;
    });
  }

  const { points, sections, totalDurationSeconds, redCount, yellowCount, missingEnergyCount } = analysis;
  const movement = classifyMovement(analysis);

  const activeIdx = clickedIdx ?? selectedSlotIndex ?? null;
  const activePoint = activeIdx !== null ? points.find((p) => p.slotIndex === activeIdx) ?? null : null;

  function selectPoint(p: PlaylistFlowPoint | null) {
    setClickedIdx(p?.slotIndex ?? null);
    onSelectSlot?.(p?.slotIndex ?? null);
  }

  if (points.length === 0) {
    return (
      <div className="pfc pfc--empty">
        <span>No playlist output to analyze.</span>
      </div>
    );
  }

  if (missingEnergyCount === points.length) {
    return (
      <div className={`pfc${expanded ? "" : " pfc--collapsed"}`}>
        <button className="pfc-toggle" onClick={toggleExpanded}>
          {expanded ? "Flow ▾" : "Flow ▸"} {points.length} tracks · {fmtHM(totalDurationSeconds)}
        </button>
        {expanded && (
          <div className="pfc-empty-note">
            Flow curve unavailable: {points.length} track{points.length !== 1 ? "s are" : " is"} missing energy values.
          </div>
        )}
      </div>
    );
  }

  const usableEnergies = points.map((p) => p.energy).filter((e): e is number => e !== null);
  const energyMin = Math.min(0, ...usableEnergies);
  const energyMax = Math.max(1, ...usableEnergies);
  const xStep = points.length > 1 ? (CHART_W - PAD_X * 2) / (points.length - 1) : 0;

  function xOf(i: number) { return PAD_X + i * xStep; }
  function yOf(e: number) {
    const t = (e - energyMin) / (energyMax - energyMin || 1);
    return CHART_H - PAD_BOTTOM - t * (CHART_H - PAD_TOP - PAD_BOTTOM);
  }

  // Only draw a connecting line between consecutive points that both have
  // real energy — never bridge over a missing-energy gap with an invented value.
  const segments: string[] = [];
  let currentSeg: string[] = [];
  points.forEach((p, i) => {
    if (p.energy === null) {
      if (currentSeg.length > 1) segments.push(currentSeg.join(" "));
      currentSeg = [];
      return;
    }
    currentSeg.push(`${xOf(i)},${yOf(p.energy)}`);
  });
  if (currentSeg.length > 1) segments.push(currentSeg.join(" "));

  // Section boundary markers — first track of each new section only.
  const sectionStarts = sections.map((s) => ({ label: s.label, x: xOf(s.startSlotIndex) }));
  const showSectionLabels = sections.length > 1 || sections[0]?.label !== "Playlist";

  return (
    <div className={`pfc${expanded ? "" : " pfc--collapsed"}`}>
      <button className="pfc-toggle" onClick={toggleExpanded}>
        {expanded
          ? "Flow ▾"
          : `Flow ▸ ${points.length} tracks · ${fmtHM(totalDurationSeconds)} · ${redCount} red · ${yellowCount} yellow`}
      </button>

      {expanded && (
        <>
          <svg className="pfc-svg" viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none">
            {showSectionLabels && sectionStarts.map((s, i) => (
              <g key={i}>
                <line x1={s.x} y1={0} x2={s.x} y2={CHART_H - PAD_BOTTOM} className="pfc-section-line" />
                <text x={s.x + 3} y={10} className="pfc-section-label">{s.label.toUpperCase()}</text>
              </g>
            ))}
            {segments.map((d, i) => <polyline key={i} points={d} className="pfc-line" />)}
            {points.map((p, i) => {
              const cy = p.energy !== null ? yOf(p.energy) : CHART_H - PAD_BOTTOM;
              const worstSeverity = p.warnings.some((w) => w.severity === "red") ? "red"
                : p.warnings.some((w) => w.severity === "yellow") ? "yellow" : null;
              const isActive = activeIdx === p.slotIndex;
              return (
                <circle
                  key={p.slotIndex}
                  cx={xOf(i)}
                  cy={cy}
                  r={isActive ? 5 : p.energy === null ? 3 : 3.5}
                  className={`pfc-dot${p.energy === null ? " pfc-dot--missing" : ""}${worstSeverity ? ` pfc-dot--${worstSeverity}` : ""}${isActive ? " pfc-dot--active" : ""}`}
                  onClick={() => selectPoint(isActive ? null : p)}
                >
                  <title>
                    {`#${p.slotIndex + 1} · ${formatFlowTimestamp(p.startSeconds)}${p.sectionLabel ? ` · ${p.sectionLabel}` : ""}\n${p.title}${p.artist ? ` — ${p.artist}` : ""}\n${p.energy !== null ? `E ${p.energy.toFixed(2)}` : "E —"}${p.bpm ? ` · ${Math.round(p.bpm)} BPM` : ""}${p.key ? ` · ${p.key}` : ""}${p.warnings.length ? `\n${p.warnings.map((w) => w.message).join("\n")}` : ""}`}
                  </title>
                </circle>
              );
            })}
          </svg>

          <div className="pfc-summary">
            {activePoint ? (
              <div className="pfc-detail">
                <span className="pfc-chip">#{activePoint.slotIndex + 1}</span>
                <span className="pfc-chip">{formatFlowTimestamp(activePoint.startSeconds)}</span>
                {activePoint.sectionLabel && <span className="pfc-chip">{activePoint.sectionLabel}</span>}
                <span className="pfc-title">{activePoint.title}</span>
                {activePoint.artist && <span className="pfc-artist">{activePoint.artist}</span>}
                <span className="pfc-chip">{activePoint.energy !== null ? `E ${activePoint.energy.toFixed(2)}` : "E —"}</span>
                {activePoint.bpm ? <span className="pfc-chip">{Math.round(activePoint.bpm)} BPM</span> : null}
                {activePoint.key && <span className="pfc-chip">{activePoint.key}</span>}
                {activePoint.warnings.map((w, i) => (
                  <span key={i} className={`pfc-warn pfc-warn--${w.severity}`}>⚠ {w.message}</span>
                ))}
              </div>
            ) : (
              <div className="pfc-strip">
                <span className="pfc-chip pfc-chip--movement">{movement}</span>
                <span className="pfc-chip">{points.length} tracks</span>
                <span className="pfc-chip">{fmtHM(totalDurationSeconds)}</span>
                {redCount > 0 && <span className="pfc-warn pfc-warn--red">{redCount} red</span>}
                {yellowCount > 0 && <span className="pfc-warn pfc-warn--yellow">{yellowCount} yellow</span>}
                {missingEnergyCount > 0 && (
                  <span className="pfc-warn pfc-warn--yellow">
                    {missingEnergyCount === points.length
                      ? "Flow curve unavailable"
                      : `Partial flow curve: ${missingEnergyCount} missing energy`}
                  </span>
                )}
                {sections.length > 1 && <span className="pfc-chip">{sections.length} sections</span>}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
