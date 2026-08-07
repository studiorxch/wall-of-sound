// Glyph Notes — Laser layer controls
// (docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md §13).
// The spec's own "recommended first-slice laser controls": Laser On/Off,
// Mode, Strength, Smoothing, Color mode — nothing beyond that (activity
// threshold/vertical offset/stroke width stay fixed defaults this slice,
// per the Creative Interface Doctrine: expose only what was asked for).
// Renders nothing until a laser analysis actually exists.

import type { CSSProperties } from "react";
import type { GlyphLayerVisibility, GlyphColorMode } from "../../data/glyphCompositionTypes";
import type { LaserRenderMode, LaserRenderSettings } from "../../data/glyphLaserLayerTypes";

type Props = {
  layerVisibility: GlyphLayerVisibility;
  onLayerVisibilityChange: (next: GlyphLayerVisibility) => void;
  laserRenderSettings: LaserRenderSettings;
  onLaserRenderSettingsChange: (next: LaserRenderSettings) => void;
  colorMode: GlyphColorMode;
  onColorModeChange: (mode: GlyphColorMode) => void;
  laserAvailable: boolean;
};

const chipStyle = (active: boolean): CSSProperties => ({
  fontSize: 11, padding: "3px 8px", borderRadius: 999, cursor: "pointer",
  border: "1px solid rgba(255,255,255,0.15)",
  background: active ? "rgba(56,189,248,0.18)" : "transparent",
  color: active ? "#38bdf8" : "#aaa",
});

const selectStyle: CSSProperties = {
  background: "#111", color: "#f5f5f5", border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 4, fontSize: 12, padding: "2px 4px",
};

export function GlyphLaserLayerEditor({
  layerVisibility, onLayerVisibilityChange, laserRenderSettings, onLaserRenderSettingsChange,
  colorMode, onColorModeChange, laserAvailable,
}: Props) {
  if (!laserAvailable) return null;

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 12 }}>
      <span
        style={chipStyle(layerVisibility.laserLayer)}
        onClick={() => onLayerVisibilityChange({ ...layerVisibility, laserLayer: !layerVisibility.laserLayer })}
      >
        Laser
      </span>

      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        Mode
        <select
          style={selectStyle} value={laserRenderSettings.mode}
          onChange={(e) => onLaserRenderSettingsChange({ ...laserRenderSettings, mode: e.target.value as LaserRenderMode })}
        >
          <option value="oscillationLine">Oscillation line</option>
          <option value="segmentedBeam">Segmented beam</option>
        </select>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        Strength
        <input
          type="range" min={2} max={30} value={laserRenderSettings.amplitude}
          onChange={(e) => onLaserRenderSettingsChange({ ...laserRenderSettings, amplitude: Number(e.target.value) })}
        />
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        Smoothing
        <input
          type="range" min={0} max={1} step={0.05} value={laserRenderSettings.smoothing}
          onChange={(e) => onLaserRenderSettingsChange({ ...laserRenderSettings, smoothing: Number(e.target.value) })}
        />
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        Color
        <select style={selectStyle} value={colorMode} onChange={(e) => onColorModeChange(e.target.value as GlyphColorMode)}>
          <option value="monochrome">Monochrome</option>
          <option value="cover">Cover</option>
        </select>
      </label>
    </div>
  );
}
