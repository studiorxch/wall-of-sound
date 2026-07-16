import { useCallback, useRef } from "react";
import type { PlaylistEnergyShape, PlaylistSectionEnergyEnvelope } from "../../data/playlistShapeTypes";
import { energyToDisplay, energyFromDisplay, sampleEnergyCurvePoints, getEnergyCurveBounds } from "../../logic/playlistEnergyEnvelope";

// The complete interactive section-energy control (0712_MUSIC_Playlist_Shape_
// Inline_Editing §9-§14): a shared 1–10 axis, a positioned Start/End bracket
// with draggable handles and body, the shape rendered inside the bracket, and
// a compact trailing shape selector. Internal values stay 0–1 throughout —
// only the handle labels/keyboard step size go through energyToDisplay /
// energyFromDisplay (the UI boundary), per §13.

const SHAPE_LABELS: Record<PlaylistEnergyShape, string> = {
  flat: "Flat", rise: "Rise", fall: "Fall", arc: "Arc", valley: "Valley",
};

const CURVE_SAMPLE_COUNT = 12;
const KEYBOARD_STEP = 1 / 9; // one display step (1–10 scale) in 0–1 terms

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function SectionEnergyMeter({
  envelope,
  sectionLabel,
  onChangeStart,
  onChangeEnd,
  onChangeBracket,
  onChangeShape,
}: {
  envelope: PlaylistSectionEnergyEnvelope;
  sectionLabel: string;
  onChangeStart: (value: number) => void;
  onChangeEnd: (value: number) => void;
  onChangeBracket: (start: number, end: number) => void;
  onChangeShape: (value: "auto" | PlaylistEnergyShape) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const { start, end, shape } = envelope;

  const valueFromClientX = useCallback((clientX: number): number => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    return clamp01((clientX - rect.left) / rect.width);
  }, []);

  function beginDrag(
    e: React.PointerEvent<HTMLElement>,
    onMove: (value: number) => void,
  ) {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    onMove(valueFromClientX(e.clientX));

    function handleMove(ev: PointerEvent) {
      onMove(valueFromClientX(ev.clientX));
    }
    function handleUp() {
      el.releasePointerCapture(e.pointerId);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    }
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  }

  function onTrackPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Clicking an empty point on the meter moves the nearest handle
    // (§11 "Meter click") — a clear, deterministic rule.
    if (e.target !== e.currentTarget) return; // handles/bracket handle their own pointerdown
    const value = valueFromClientX(e.clientX);
    const distToStart = Math.abs(value - start);
    const distToEnd = Math.abs(value - end);
    if (distToStart <= distToEnd) onChangeStart(value);
    else onChangeEnd(value);
  }

  function onBracketPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const grabStart = start;
    const grabEnd = end;
    const grabValue = valueFromClientX(e.clientX);
    beginDrag(e, (value) => {
      const delta = value - grabValue;
      const span = grabEnd - grabStart;
      // Preserve span and direction — clamp the delta so neither endpoint
      // leaves 0–1, not just the one nearer the drag.
      const minDelta = -Math.min(grabStart, grabEnd);
      const maxDelta = 1 - Math.max(grabStart, grabEnd);
      const clampedDelta = Math.max(minDelta, Math.max(-1, Math.min(1, delta)));
      const boundedDelta = Math.min(maxDelta, clampedDelta);
      onChangeBracket(grabStart + boundedDelta, grabStart + span + boundedDelta);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent, current: number, onChange: (v: number) => void) {
    if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      onChange(clamp01(current - KEYBOARD_STEP));
    } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      onChange(clamp01(current + KEYBOARD_STEP));
    }
  }

  // Bracket highlight spans the full rendered curve (Arc/Valley legitimately
  // bulge past both endpoints on the energy axis — that bulge IS the shape),
  // not just [min(start,end), max(start,end)].
  const bounds = getEnergyCurveBounds(envelope, CURVE_SAMPLE_COUNT);
  const points = sampleEnergyCurvePoints(envelope, CURVE_SAMPLE_COUNT);
  // x = the point's OWN energy value (never its sample index) — this is what
  // makes a Fall envelope visibly run right-to-left instead of mirroring a
  // Rise. y = chronological position (p: 0 at Start, 1 at End), so direction
  // stays legible as a separate dimension from the energy-axis position.
  const pathD = points
    .map((pt, i) => `${i === 0 ? "M" : "L"} ${clamp01(pt.value) * 100} ${pt.p * 100}`)
    .join(" ");

  return (
    <div className="sem-root">
      <span className="sem-axis-label sem-axis-label--min">1</span>
      <div
        className="sem-track"
        ref={trackRef}
        onPointerDown={onTrackPointerDown}
        role="presentation"
      >
        {/* Highlight + drag hit-area — sized to the full rendered curve
            (including any Arc/Valley bulge), but carries NO coordinate
            system of its own; it's purely a background rectangle so the
            curve's positions (below) stay in one consistent full-track
            percentage space, matching the handles exactly. */}
        <div
          className="sem-bracket"
          style={{ left: `${bounds.min * 100}%`, width: `${Math.max(0, bounds.max - bounds.min) * 100}%` }}
          onPointerDown={onBracketPointerDown}
        />
        {/* Curve trace — full-track-width SVG overlay. viewBox 0..100 on
            both axes maps 1:1 to the 0–1 energy scale on x (same space the
            handles use) and to chronological position (Start→End) on y. */}
        <svg
          className="sem-curve"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d={pathD} fill="none" />
        </svg>
        <div
          className="sem-handle sem-handle--start"
          style={{ left: `${start * 100}%` }}
          onPointerDown={(e) => { e.stopPropagation(); beginDrag(e, onChangeStart); }}
          onKeyDown={(e) => handleKeyDown(e, start, onChangeStart)}
          role="slider"
          tabIndex={0}
          aria-label={`${sectionLabel} energy start`}
          aria-valuemin={1}
          aria-valuemax={10}
          aria-valuenow={energyToDisplay(start)}
        />
        <div
          className="sem-handle sem-handle--end"
          style={{ left: `${end * 100}%` }}
          onPointerDown={(e) => { e.stopPropagation(); beginDrag(e, onChangeEnd); }}
          onKeyDown={(e) => handleKeyDown(e, end, onChangeEnd)}
          role="slider"
          tabIndex={0}
          aria-label={`${sectionLabel} energy end`}
          aria-valuemin={1}
          aria-valuemax={10}
          aria-valuenow={energyToDisplay(end)}
        />
      </div>
      <span className="sem-axis-label sem-axis-label--max">10</span>
      <select
        className="sem-shape-select"
        aria-label={`${sectionLabel} energy shape`}
        value={envelope.shapeSource === "inferred" ? "auto" : shape}
        onChange={(e) => onChangeShape(e.target.value as "auto" | PlaylistEnergyShape)}
      >
        <option value="auto">Auto</option>
        <option value="flat">Flat</option>
        <option value="rise">Rise</option>
        <option value="fall">Fall</option>
        <option value="arc">Arc</option>
        <option value="valley">Valley</option>
      </select>
      <span className="sem-shape-readout">{envelope.shapeSource === "inferred" ? `${SHAPE_LABELS[shape]}` : SHAPE_LABELS[shape]}</span>
    </div>
  );
}

// Re-exported so row-level callers can convert a raw display-step edit (e.g.
// a future numeric fallback input) without importing the logic module twice.
export { energyFromDisplay, energyToDisplay };
