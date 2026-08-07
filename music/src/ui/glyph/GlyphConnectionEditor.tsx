// Glyph Notes — connection grammar controls
// (docs/glyph-audio/0804_GLYPH_NOTES_Connection_Grammar_Spec_v0.1.0.md §19.1,
// recommended v1 UI): Connection mode, Bar punctuation, Break at section,
// Connector style, Gap size, Dot size. Phrase behavior, silence rest marks,
// manual overrides, inherited-curvature tuning, and every other advanced
// control are explicitly deferred past this slice (§30) — not hidden behind
// a disclosure that doesn't exist yet, simply not built.
//
// Purely a controlled editor over a ConnectionGrammar value — updates the
// live preview immediately via onChange; GlyphWorkspace.tsx is the only
// place that ever persists it (explicit Save, never on every keystroke).
//
// Styled entirely with inline styles (no styles.css changes — outside this
// build's file allowlist, same as every other Glyph UI file).

import type { CSSProperties } from "react";
import type { ConnectionGrammar, ConnectionMode, ConnectorMode, BoundaryBehavior } from "../../data/glyphConnectionTypes";

type Props = {
  grammar: ConnectionGrammar;
  onChange: (next: ConnectionGrammar) => void;
};

const MODE_OPTIONS: Array<{ value: ConnectionMode; label: string }> = [
  { value: "never", label: "Never" },
  { value: "withinBar", label: "Within bar" },
  { value: "withinPhrase", label: "Within phrase" },
  { value: "withinSection", label: "Within section" },
  { value: "always", label: "Always" },
];

const BAR_BEHAVIOR_OPTIONS: Array<{ value: BoundaryBehavior; label: string }> = [
  { value: "keepConnected", label: "None" },
  { value: "dot", label: "Dot" },
  { value: "smallGap", label: "Gap" },
  { value: "break", label: "Break" },
  { value: "dotAndGap", label: "Dot + gap" },
];

const SECTION_BEHAVIOR_OPTIONS: Array<{ value: BoundaryBehavior; label: string }> = [
  { value: "break", label: "Break" },
  { value: "largeGap", label: "Large gap" },
  { value: "breakAndDotCluster", label: "Break + dot cluster" },
  { value: "newRow", label: "New row" },
];

const CONNECTOR_OPTIONS: Array<{ value: ConnectorMode; label: string }> = [
  { value: "straight", label: "Straight" },
  { value: "softSag", label: "Soft sag" },
  { value: "softRise", label: "Soft rise" },
  { value: "tensionCurve", label: "Tension curve" },
  { value: "inheritNeighboringCurvature", label: "Inherited curvature" },
];

const selectStyle: CSSProperties = {
  background: "#111", color: "#f5f5f5", border: "1px solid rgba(255,255,255,0.15)",
  borderRadius: 4, fontSize: 12, padding: "2px 4px",
};

export function GlyphConnectionEditor({ grammar, onChange }: Props) {
  function patch(fields: Partial<ConnectionGrammar>) {
    onChange({ ...grammar, ...fields, updatedAt: new Date().toISOString() });
  }

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", fontSize: 12 }}>
      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        Connection mode
        <select
          style={selectStyle}
          value={grammar.connectionMode}
          onChange={(e) => patch({ connectionMode: e.target.value as ConnectionMode })}
        >
          {MODE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        Bar punctuation
        <select
          style={selectStyle}
          value={grammar.barBoundaryBehavior}
          onChange={(e) => patch({ barBoundaryBehavior: e.target.value as BoundaryBehavior })}
        >
          {BAR_BEHAVIOR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        Break at section
        <select
          style={selectStyle}
          value={grammar.sectionBoundaryBehavior}
          onChange={(e) => patch({ sectionBoundaryBehavior: e.target.value as BoundaryBehavior })}
        >
          {SECTION_BEHAVIOR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        Connector style
        <select
          style={selectStyle}
          value={grammar.connectorMode}
          onChange={(e) => patch({ connectorMode: e.target.value as ConnectorMode })}
        >
          {CONNECTOR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        Gap size
        <input
          type="number" min={0} step={0.1} value={grammar.punctuationGapSize}
          onChange={(e) => patch({ punctuationGapSize: Math.max(0, Number(e.target.value) || 0) })}
          style={{ width: 48 }}
        />
      </label>

      <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
        Dot size
        <input
          type="number" min={0} step={0.1} value={grammar.punctuationDotSize}
          onChange={(e) => patch({ punctuationDotSize: Math.max(0, Number(e.target.value) || 0) })}
          style={{ width: 48 }}
        />
      </label>
    </div>
  );
}
