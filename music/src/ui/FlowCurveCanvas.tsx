import { useRef, useCallback, useState, useEffect } from "react";
import type { FlowCurve, FlowPoint } from "../data/flowCurveTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type { Track } from "../data/trackTypes";
import { formatNumber } from "../logic/dateFormat";

const W = 900;
const H = 190;                                      // reduced from 240; bottom padding trimmed (legend hidden)
const PAD = { top: 14, right: 16, bottom: 14, left: 40 };
const INNER_W = W - PAD.left - PAD.right;
const INNER_H = H - PAD.top - PAD.bottom;
const POINT_R = 5;
const NODE_R = 4;

// Node creation guardrails
const MIN_POINT_TIME_DISTANCE = 0.03;  // 3% of curve width — reject near-duplicates
const MIN_POINT_ENERGY_DISTANCE = 0.04;

function toSvgX(t: number) { return PAD.left + t * INNER_W; }
function toSvgY(e: number) { return PAD.top + (1 - e) * INNER_H; }
function fromSvgX(x: number) { return Math.max(0, Math.min(1, (x - PAD.left) / INNER_W)); }
function fromSvgY(y: number) { return Math.max(0, Math.min(1, 1 - (y - PAD.top) / INNER_H)); }

export type FlowCurveDisplayMode = "editor" | "hud_compact" | "hud_minimal";

type Props = {
  curve: FlowCurve;
  slots: TrackSlot[];
  tracksById: Map<string, Track>;
  locks: { trackId: string; lockType: string }[];
  onCurveChange: (curve: FlowCurve) => void;
  nowPlayingSlotIndex: number | null;
  hoveredSlotIndex: number | null;
  selectedSlotIndex?: number | null;
  onNodeHoverChange: (idx: number | null) => void;
  onNodeClick?: (idx: number) => void;
  readOnly?: boolean;
  displayMode?: FlowCurveDisplayMode;
};

export function FlowCurveCanvas({
  curve, slots, tracksById, locks, onCurveChange,
  nowPlayingSlotIndex, hoveredSlotIndex, selectedSlotIndex = null,
  onNodeHoverChange, onNodeClick,
  readOnly = false,
  displayMode = "editor",
}: Props) {
  const isHud = displayMode === "hud_compact" || displayMode === "hud_minimal";
  const isMinimal = displayMode === "hud_minimal";
  // Axes and legend are hidden by default in editor mode — toggle via showChartDetails
  const showAxes = false;
  const showLegend = false;
  const showHint = !isHud;
  const showGrid = !isMinimal;
  const showWarningBands = !isHud;
  const gridOpacity = isHud ? 0.25 : 1;
  const curveOpacity = isHud ? 0.55 : 1;
  const curveStrokeWidth = isHud ? 1.5 : 2.5;
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const draggingPointId = useRef<string | null>(null);
  const suppressNextCanvasClick = useRef<boolean>(false);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (readOnly) return;
    function onKeyDown(e: KeyboardEvent) {
      if (!selectedPointId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (curve.points.length <= 2) return;
        const idx = curve.points.findIndex(p => p.pointId === selectedPointId);
        if (idx === -1) return;
        e.preventDefault();
        setSelectedPointId(null);
        onCurveChange({ ...curve, points: curve.points.filter((_, i) => i !== idx) });
      } else if (e.key === 'Escape') {
        setSelectedPointId(null);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readOnly, selectedPointId, curve, onCurveChange]);

  const sorted = [...curve.points].sort((a, b) => a.timePercent - b.timePercent);

  const pathD = sorted.length < 2
    ? ""
    : `M ${sorted.map((p) => `${toSvgX(p.timePercent)},${toSvgY(p.energy)}`).join(" L ")}`;

  const lockedTrackIds = new Set(locks.map((l) => l.trackId));

  function getSvgCoords(clientX: number, clientY: number): { x: number; y: number } {
    const svg = svgRef.current!;
    const ctm = svg.getScreenCTM();
    if (!ctm) {
      // fallback: simple rect-based mapping
      const rect = svg.getBoundingClientRect();
      return { x: (clientX - rect.left) * (W / rect.width), y: (clientY - rect.top) * (H / rect.height) };
    }
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }

  const onPointPointerDown = useCallback((e: React.PointerEvent, pointId: string) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedPointId(pointId);
    draggingPointId.current = pointId;
    svgRef.current?.setPointerCapture(e.pointerId);
  }, [readOnly]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingPointId.current) return;
    const { x, y } = getSvgCoords(e.clientX, e.clientY);
    const t = fromSvgX(x);
    const energy = fromSvgY(y);
    const pid = draggingPointId.current;
    const newPoints = curve.points.map((p) =>
      p.pointId === pid ? { ...p, timePercent: t, energy } : p
    );
    onCurveChange({ ...curve, points: newPoints });
  }, [curve, onCurveChange]);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    if (draggingPointId.current) {
      svgRef.current?.releasePointerCapture(e.pointerId);
      draggingPointId.current = null;
      suppressNextCanvasClick.current = true;
    }
  }, []);

  const onPointerCancel = useCallback(() => {
    draggingPointId.current = null;
  }, []);

  function addPoint(e: React.MouseEvent<SVGSVGElement>) {
    if (readOnly) return;
    if (suppressNextCanvasClick.current) {
      suppressNextCanvasClick.current = false;
      return;
    }
    if ((e.target as Element).closest(".curve-point,.track-node")) return;
    // Require Shift+Click to add a point — prevents accidental node creation
    if (!e.shiftKey) {
      setSelectedPointId(null);
      return;
    }
    // Hard cap at 16 — decoupled from slot count so curve editing works
    // regardless of current track assignment state (slots may be empty when
    // tracks haven't been linked yet, but the curve itself is still editable).
    if (curve.points.length >= 16) {
      return; // silently ignore — enforced max
    }
    const { x, y } = getSvgCoords(e.clientX, e.clientY);
    const t = fromSvgX(x);
    const energy = fromSvgY(y);
    // Reject if too close to an existing point
    const tooClose = curve.points.some(
      (p) => Math.abs(p.timePercent - t) < MIN_POINT_TIME_DISTANCE &&
             Math.abs(p.energy - energy) < MIN_POINT_ENERGY_DISTANCE
    );
    if (tooClose) return;
    const newPoint: FlowPoint = {
      pointId: `p_${Date.now()}`,
      timePercent: t,
      energy,
    };
    onCurveChange({ ...curve, points: [...curve.points, newPoint] });
  }

  function removePoint(idx: number, e: React.MouseEvent) {
    if (readOnly) return;
    e.stopPropagation();
    if (curve.points.length <= 2) return;
    const newPoints = curve.points.filter((_, i) => i !== idx);
    onCurveChange({ ...curve, points: newPoints });
  }

  // Red warning zones behind the curve
  const redZones = slots
    .filter((s) => s.warningLevel === "red")
    .map((s) => {
      const slotWidth = slots.length > 1 ? 1 / slots.length : 1;
      const x = toSvgX(s.slotIndex / slots.length);
      const w = slotWidth * INNER_W;
      return { x, w };
    });

  // Track nodes — placed at actual track energy, x = slot time percent
  const trackNodes = slots.map((s) => {
    const t = slots.length > 1 ? s.slotIndex / (slots.length - 1) : 0.5;
    const track = s.assignedTrackId ? tracksById.get(s.assignedTrackId) : undefined;
    const isLocked = track ? lockedTrackIds.has(track.trackId) : false;
    const x = toSvgX(t);
    const y = track ? toSvgY(track.energy) : toSvgY(s.targetEnergy);
    const slotNum = s.slotIndex + 1;
    const tooltip = track
      ? `#${slotNum} · ${track.bpm ?? "—"} BPM · ${track.camelotKey ?? "—"} · E ${formatNumber(track.energy, 2)}`
      : `Slot ${slotNum} — empty`;
    return { x, y, isLocked, warningLevel: s.warningLevel, tooltip, hasTrack: !!track, slotNum, slotIndex: s.slotIndex };
  });

  return (
    <div className="curve-container">
      <div className="curve-header">
        <span className="preset-name">{curve.name}</span>
        {showHint && <span className="curve-hint">Shift+Click to add point · Click point to select · Delete/Backspace to remove</span>}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="flow-curve-svg"
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onMouseLeave={() => onNodeHoverChange(null)}
        onClick={addPoint}
      >
        {/* Grid */}
        {showGrid && [0, 0.25, 0.5, 0.75, 1].map((e) => (
          <line
            key={e}
            x1={PAD.left} y1={toSvgY(e)}
            x2={W - PAD.right} y2={toSvgY(e)}
            stroke="var(--grid-line)" strokeWidth={1} opacity={gridOpacity}
          />
        ))}
        {showGrid && [0, 0.25, 0.5, 0.75, 1].map((t) => (
          <line
            key={t}
            x1={toSvgX(t)} y1={PAD.top}
            x2={toSvgX(t)} y2={H - PAD.bottom}
            stroke="var(--grid-line)" strokeWidth={1} opacity={gridOpacity}
          />
        ))}

        {/* Axis labels */}
        {showAxes && [0, 0.25, 0.5, 0.75, 1].map((e) => (
          <text key={e} x={PAD.left - 6} y={toSvgY(e) + 4} textAnchor="end" className="axis-label">
            {e.toFixed(2)}
          </text>
        ))}
        {showAxes && <text x={PAD.left + INNER_W / 2} y={H - 4} textAnchor="middle" className="axis-label">Time →</text>}
        {showAxes && <text x={8} y={PAD.top + INNER_H / 2} textAnchor="middle" className="axis-label" transform={`rotate(-90, 8, ${PAD.top + INNER_H / 2})`}>Energy</text>}

        {/* Plot clip — prevents markers from leaking outside the plot area */}
        <defs>
          <clipPath id="flowCurvePlotClip">
            <rect x={PAD.left} y={PAD.top} width={INNER_W} height={INNER_H} />
          </clipPath>
        </defs>

        {/* Clipped plot contents */}
        <g clipPath="url(#flowCurvePlotClip)">

        {/* Red warning zones */}
        {showWarningBands && redZones.map((z, i) => (
          <rect key={i} x={z.x} y={PAD.top} width={z.w} height={INNER_H} fill="rgba(255,60,60,0.10)" />
        ))}

        {/* Curve line */}
        {pathD && (
          <path d={pathD} fill="none" stroke="var(--curve-line)" strokeWidth={curveStrokeWidth} strokeLinejoin="round" opacity={curveOpacity} />
        )}

        {/* Track nodes */}
        {trackNodes.map((n, i) => {
          if (!n.hasTrack) return null;
          const isNowPlaying = n.slotIndex === nowPlayingSlotIndex;
          const isHovered = n.slotIndex === hoveredSlotIndex;
          const isSelected = n.slotIndex === selectedSlotIndex;
          // In minimal mode, only show the now-playing node
          if (isMinimal && !isNowPlaying) return null;
          const ringColor = n.warningLevel === "red" ? "var(--red)" : n.warningLevel === "yellow" ? "var(--yellow)" : "none";
          const fillColor = isNowPlaying
            ? "var(--green)"
            : n.isLocked
            ? "var(--accent)"
            : "#fff";
          const nodeR = (isHovered || isSelected) ? NODE_R + 2 : NODE_R;
          // HUD: non-playing nodes are more transparent
          const baseOpacity = isHud && !isNowPlaying && !isHovered ? 0.35 : (isHovered || isSelected) ? 1 : 0.85;
          // HUD: suppress warning rings on non-critical items
          const showWarningRing = n.warningLevel !== "none" && (!isHud || n.warningLevel === "red");

          return (
            <g
              key={i}
              className="track-node"
              style={{ cursor: onNodeClick ? "pointer" : "default" }}
              onMouseEnter={() => onNodeHoverChange(n.slotIndex)}
              onMouseLeave={() => onNodeHoverChange(null)}
              onClick={(e) => { e.stopPropagation(); onNodeClick?.(n.slotIndex); }}
            >
              <title>{n.tooltip}</title>
              <circle cx={n.x} cy={n.y} r={NODE_R + 6} fill="transparent" />
              {isNowPlaying && (
                <circle cx={n.x} cy={n.y} r={nodeR + 5} fill="none" stroke="var(--green)" strokeWidth={1} opacity={0.5} />
              )}
              {isSelected && !isNowPlaying && (
                <circle cx={n.x} cy={n.y} r={nodeR + 5} fill="none" stroke="var(--accent)" strokeWidth={1.5} opacity={0.8} />
              )}
              {showWarningRing && (
                <circle cx={n.x} cy={n.y} r={nodeR + 3} fill="none" stroke={ringColor} strokeWidth={1.5} opacity={isHud ? 0.4 : 0.7} />
              )}
              <circle cx={n.x} cy={n.y} r={nodeR} fill={fillColor} opacity={baseOpacity} />
              {!isHud && (
                <text
                  x={n.x}
                  y={n.y - nodeR - 3}
                  textAnchor="middle"
                  className="node-label"
                  opacity={isHovered || isNowPlaying ? 1 : 0.45}
                >
                  {n.slotNum}
                </text>
              )}
            </g>
          );
        })}

        {/* Control points — editor only */}
        {!isHud && sorted.map((p) => {
          const origIdx = curve.points.findIndex((cp) => cp.pointId === p.pointId);
          const isSelected = p.pointId === selectedPointId;
          return (
            <g key={p.pointId}>
              {isSelected && (
                <circle
                  cx={toSvgX(p.timePercent)}
                  cy={toSvgY(p.energy)}
                  r={POINT_R + 4}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth={1.5}
                  opacity={0.8}
                  style={{ pointerEvents: 'none' }}
                />
              )}
              <circle
                className="curve-point"
                cx={toSvgX(p.timePercent)}
                cy={toSvgY(p.energy)}
                r={POINT_R}
                style={{ fill: isSelected ? 'var(--accent)' : undefined }}
                onPointerDown={(e) => onPointPointerDown(e, p.pointId)}
                onContextMenu={(e) => { e.preventDefault(); removePoint(origIdx, e); }}
              />
            </g>
          );
        })}

        </g>{/* end clipPath group */}

        {/* Legend — editor only */}
        {showLegend && (
          <g className="canvas-legend" transform={`translate(${PAD.left + 4}, ${H - PAD.bottom + 10})`}>
            {[
              { color: "var(--curve-line)", shape: "line", label: "Flow Curve" },
              { color: "#fff",              shape: "dot",  label: "Track" },
              { color: "var(--green)",      shape: "dot",  label: "Playing" },
              { color: "var(--accent)",     shape: "dot",  label: "Locked" },
              { color: "var(--yellow)",     shape: "ring", label: "Weak" },
              { color: "var(--red)",        shape: "ring", label: "Critical" },
            ].map((item, i) => {
              const x = i * 100;
              return (
                <g key={i} transform={`translate(${x}, 0)`}>
                  {item.shape === "line" && <line x1={0} y1={5} x2={12} y2={5} stroke={item.color} strokeWidth={2} />}
                  {item.shape === "dot"  && <circle cx={6} cy={5} r={3} fill={item.color} />}
                  {item.shape === "ring" && <circle cx={6} cy={5} r={4} fill="none" stroke={item.color} strokeWidth={1.5} />}
                  <text x={16} y={9} className="legend-label">{item.label}</text>
                </g>
              );
            })}
          </g>
        )}
      </svg>

      {/* Rich node inspector — shown when a node is hovered */}
      {(() => {
        if (isHud || hoveredSlotIndex === null) return null;
        const hoveredNode = trackNodes.find((n) => n.slotIndex === hoveredSlotIndex);
        const hoveredSlot = slots.find((s) => s.slotIndex === hoveredSlotIndex);
        const hoveredTrack = hoveredSlot?.assignedTrackId ? tracksById.get(hoveredSlot.assignedTrackId) : undefined;
        if (!hoveredNode || !hoveredSlot) return null;

        // Position: convert SVG x to % for left anchor, cap at right edge
        const leftPct = Math.min(85, (hoveredNode.x / W) * 100);
        const above = hoveredNode.y < H / 2; // show below if node is high, above if low

        return (
          <div
            className={`fcc-inspector${above ? " fcc-inspector--below" : " fcc-inspector--above"}`}
            style={{ left: `${leftPct}%` }}
          >
            <div className="fcc-inspector-title">
              #{hoveredNode.slotNum} — {hoveredTrack?.title ?? "Empty Slot"}
            </div>
            {hoveredTrack && (
              <div className="fcc-inspector-meta">
                {hoveredTrack.bpm ? `${hoveredTrack.bpm} BPM` : "—"}
                {hoveredTrack.camelotKey ? ` · ${hoveredTrack.camelotKey}` : ""}
                {hoveredTrack.energy != null ? ` · E ${hoveredTrack.energy.toFixed(2)}` : ""}
                {hoveredTrack.durationSeconds ? ` · ${Math.floor(hoveredTrack.durationSeconds / 60)}:${String(Math.round(hoveredTrack.durationSeconds % 60)).padStart(2, "0")}` : ""}
              </div>
            )}
            {(hoveredSlot.warningMessages ?? []).length > 0 && (
              <div className="fcc-inspector-warnings">
                {(hoveredSlot.warningMessages ?? []).map((msg, i) => (
                  <div
                    key={i}
                    className={`fcc-inspector-warn-item fcc-inspector-warn--${hoveredSlot.warningLevel}`}
                  >
                    {msg}
                  </div>
                ))}
              </div>
            )}
            {(hoveredSlot.warningMessages ?? []).length === 0 && hoveredTrack && (
              <div className="fcc-inspector-clean">No warnings</div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
