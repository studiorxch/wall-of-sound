// Glyph Notes — Canvas + Layer controls
// (docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md §13, §19).
// Combines the spec's optional GlyphCanvasEditor and GlyphLayerEditor into
// one compact control strip — both are small, closely related toggle
// groups, and the spec's own §26 layout recommendation keeps "Canvas |
// View | Connection | Layers" together in one compact controls row anyway.
//
// Purely controlled: every change updates the live preview immediately via
// its own onChange; GlyphWorkspace.tsx is the only place any of this is
// ever persisted (explicit Save).

import type { CSSProperties } from "react";
import type { GlyphCanvasShape, GlyphViewportMode } from "../../data/glyphCanvasTypes";
import type { GlyphLayerVisibility } from "../../data/glyphCompositionTypes";

type Props = {
  canvasShape: GlyphCanvasShape;
  onCanvasShapeChange: (shape: GlyphCanvasShape) => void;
  viewportMode: GlyphViewportMode;
  onViewportModeChange: (mode: GlyphViewportMode) => void;
  layerVisibility: GlyphLayerVisibility;
  onLayerVisibilityChange: (next: GlyphLayerVisibility) => void;
  drumLayerAvailable: boolean;
};

const selectStyle: CSSProperties = {
  background: "#111", color: "#f5f5f5", border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 4, fontSize: 12, padding: "2px 4px",
};

const chipStyle = (active: boolean): CSSProperties => ({
  fontSize: 11, padding: "3px 8px", borderRadius: 999, cursor: "pointer",
  border: "1px solid rgba(255,255,255,0.15)",
  background: active ? "rgba(56,189,248,0.18)" : "transparent",
  color: active ? "#38bdf8" : "#aaa",
});

export function GlyphCanvasEditor({
  canvasShape, onCanvasShapeChange, viewportMode, onViewportModeChange,
  layerVisibility, onLayerVisibilityChange, drumLayerAvailable,
}: Props) {
  function toggleLayer(key: keyof GlyphLayerVisibility) {
    onLayerVisibilityChange({ ...layerVisibility, [key]: !layerVisibility[key] });
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 12 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        Canvas
        <select style={selectStyle} value={canvasShape} onChange={(e) => onCanvasShapeChange(e.target.value as GlyphCanvasShape)}>
          <option value="square">Square</option>
          <option value="portrait">Portrait</option>
        </select>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        View
        <select style={selectStyle} value={viewportMode} onChange={(e) => onViewportModeChange(e.target.value as GlyphViewportMode)}>
          <option value="fitCanvas">Fit canvas</option>
          <option value="fitWidth">Fit width</option>
          <option value="actualSize">Actual size</option>
        </select>
      </label>

      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <span style={{ opacity: 0.6 }}>Layers</span>
        <span style={chipStyle(layerVisibility.pulseManuscript)} onClick={() => toggleLayer("pulseManuscript")}>Pulse</span>
        <span style={chipStyle(layerVisibility.sections)} onClick={() => toggleLayer("sections")}>Sections</span>
        {drumLayerAvailable && (
          <span style={chipStyle(layerVisibility.drumEvents)} onClick={() => toggleLayer("drumEvents")}>Drums</span>
        )}
        <span style={chipStyle(layerVisibility.safeArea)} onClick={() => toggleLayer("safeArea")}>Safe area</span>
      </div>
    </div>
  );
}
