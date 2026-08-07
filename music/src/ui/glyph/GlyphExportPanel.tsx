// Glyph Audio — export trigger (docs/glyph-audio/09_GLYPH_AUDIO_MVP_Spec.md,
// "SVG export"). Calls the pure glyphSvgExport.ts builder — never scrapes
// the on-screen preview DOM (the one thing
// apps/glyphlab-reference/src/App.tsx:244-267's exportSVG got wrong for
// this purpose) — and downloads the result via the same blob+anchor
// pattern that file already established, extracted here as a small shared
// utility rather than copied inline.

import type { LayoutDocument } from "../../data/glyphLayoutTypes";
import type { GeneratedGlyphInstance } from "../../data/glyphGrammarTypes";
import type { RenderProfile, ExportRecord } from "../../data/glyphCompositionTypes";
import type { ConnectionDecision, ConnectionGrammar } from "../../data/glyphConnectionTypes";
import { buildGlyphSvgDocument, GLYPH_SVG_RENDERER_VERSION } from "../../logic/glyph/glyphSvgExport";

export function downloadBlob(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export type GlyphExportMetadata = {
  compositionId: string;
  compositionUpdatedAt: string;
  analysisId: string;
  analyzerVersion: string;
  mappingPresetId: string;
  grammarId: string;
  layoutPresetId: string;
  seed: number;
  cacheKey: string;
};

type Props = {
  layout: LayoutDocument | null;
  glyphInstances: GeneratedGlyphInstance[];
  renderProfile: RenderProfile;
  metadata: GlyphExportMetadata | null;
  onRecordExport: (record: ExportRecord) => void;
  // Connectors/punctuation (docs/glyph-audio/0804_GLYPH_NOTES_Connection_Grammar_Spec_v0.1.0.md
  // §22 "preview and export use the same run and connector geometry") —
  // optional so an export triggered before any connection data exists
  // (or a composition saved before this build) still produces a valid,
  // glyph-only SVG rather than erroring.
  connections?: { decisions: ConnectionDecision[]; grammar: ConnectionGrammar };
};

function nowIso() {
  return new Date().toISOString();
}

export function GlyphExportPanel({ layout, glyphInstances, renderProfile, metadata, onRecordExport, connections }: Props) {
  function handleExport() {
    if (!layout || !metadata) return;

    const svg = buildGlyphSvgDocument(layout, glyphInstances, renderProfile, {
      compositionId: metadata.compositionId,
      analysisId: metadata.analysisId,
      mappingPresetId: metadata.mappingPresetId,
      grammarId: metadata.grammarId,
      layoutPresetId: metadata.layoutPresetId,
      seed: metadata.seed,
      rendererVersion: GLYPH_SVG_RENDERER_VERSION,
    }, connections);

    const fileName = `glyph-composition-${metadata.compositionId}.svg`;
    downloadBlob(svg, fileName, "image/svg+xml;charset=utf-8");

    onRecordExport({
      id: `export-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      compositionId: metadata.compositionId,
      exportedAt: nowIso(),
      format: "svg",
      renderProfileId: renderProfile.id,
      fileName,
      cacheKey: metadata.cacheKey,
      metadata: {
        compositionId: metadata.compositionId,
        compositionUpdatedAt: metadata.compositionUpdatedAt,
        analysisId: metadata.analysisId,
        analyzerVersion: metadata.analyzerVersion,
        mappingPresetId: metadata.mappingPresetId,
        grammarId: metadata.grammarId,
        layoutPresetId: metadata.layoutPresetId,
        seed: metadata.seed,
        rendererVersion: GLYPH_SVG_RENDERER_VERSION,
      },
    });
  }

  return (
    <button className="tb-btn sm" onClick={handleExport} disabled={!layout || !metadata}>
      Export SVG
    </button>
  );
}
