// Glyph Notes — Event layer controls
// (docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md §13).
// Owns ONLY the new clap/accent toggles — the existing Pulse/Drums/Sections/
// Safe-area toggles stay in GlyphCanvasEditor.tsx, untouched. Renders
// nothing until classification has actually run (Creative Interface
// Doctrine: no control for a layer that has no data to toggle yet).

import type { CSSProperties } from "react";
import type { GlyphLayerVisibility } from "../../data/glyphCompositionTypes";

type Props = {
  layerVisibility: GlyphLayerVisibility;
  onLayerVisibilityChange: (next: GlyphLayerVisibility) => void;
  eventsAvailable: boolean;
};

const chipStyle = (active: boolean): CSSProperties => ({
  fontSize: 11, padding: "3px 8px", borderRadius: 999, cursor: "pointer",
  border: "1px solid rgba(255,255,255,0.15)",
  background: active ? "rgba(56,189,248,0.18)" : "transparent",
  color: active ? "#38bdf8" : "#aaa",
});

export function GlyphEventLayerEditor({ layerVisibility, onLayerVisibilityChange, eventsAvailable }: Props) {
  if (!eventsAvailable) return null;

  function toggle(key: "clapEvents" | "accentEvents") {
    onLayerVisibilityChange({ ...layerVisibility, [key]: !layerVisibility[key] });
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
      <span style={{ opacity: 0.6 }}>Events</span>
      <span style={chipStyle(layerVisibility.clapEvents)} onClick={() => toggle("clapEvents")}>Claps</span>
      <span style={chipStyle(layerVisibility.accentEvents)} onClick={() => toggle("accentEvents")}>Accents</span>
    </div>
  );
}
