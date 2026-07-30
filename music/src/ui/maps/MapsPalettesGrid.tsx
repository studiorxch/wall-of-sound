import { useEffect, useState } from "react";
import { CollectionGrid } from "../CollectionGrid";
import { CollectionCard } from "../CollectionCard";
import * as wallPaletteBridge from "../../maps/wallPaletteBridge";
import type { PaletteRecord, RegistryRecord } from "../../maps/wallPaletteBridge";
import { ensurePreviewMap, getPreviewState, subscribePreviewState } from "../../maps/wallMapPreview";

type Props = {
  onOpen: (paletteId: string) => void;
};

type LoadState = "authority_unavailable" | "preview_loading" | "preview_unavailable" | "ready";

// A handful of representative registry groups used for the card's swatch
// strip — a preview surface (spec §7 allows this in place of a captured
// thumbnail), not a resting hex label: colors only, no text values.
const SWATCH_GROUPS = ["Water", "Land", "Roads", "Route", "Vehicles", "HUD"];

function swatchesFor(palette: PaletteRecord, registry: RegistryRecord[]): string[] {
  const seen = new Set<string>();
  const swatches: string[] = [];
  for (const group of SWATCH_GROUPS) {
    const rec = registry.find((r) => r.group === group && !seen.has(r.group));
    if (rec && palette.values[rec.id]) {
      swatches.push(palette.values[rec.id]);
      seen.add(group);
    }
  }
  return swatches;
}

function PreviewSurface({ palette, registry }: { palette: PaletteRecord; registry: RegistryRecord[] }) {
  const swatches = swatchesFor(palette, registry);
  return (
    <div className="pgc-art maps-preview-surface">
      {swatches.length > 0 ? (
        <div className="maps-swatch-strip">
          {swatches.map((color, i) => (
            <span key={i} className="maps-swatch-chip" style={{ background: color }} />
          ))}
        </div>
      ) : (
        <span className="pgc-art-initials">◐</span>
      )}
    </div>
  );
}

type Snapshot = {
  loadState: LoadState;
  palettes: PaletteRecord[];
  registry: RegistryRecord[];
  activeId: string | null;
};

function readSnapshot(): Snapshot {
  if (!wallPaletteBridge.isBridgeAvailable()) {
    return { loadState: "authority_unavailable", palettes: [], registry: [], activeId: null };
  }
  if (wallPaletteBridge.isAuthorityInitialized()) {
    const list = wallPaletteBridge.listPalettes();
    const reg = wallPaletteBridge.getRegistry();
    return {
      loadState: "ready",
      palettes: list.ok ? list.data : [],
      registry: reg.ok ? reg.data : [],
      activeId: wallPaletteBridge.getActiveId(),
    };
  }
  return {
    loadState: getPreviewState() === "unavailable" ? "preview_unavailable" : "preview_loading",
    palettes: [],
    registry: [],
    activeId: null,
  };
}

export function MapsPalettesGrid({ onOpen }: Props) {
  const [{ loadState, palettes, registry, activeId }, setState] = useState<Snapshot>(readSnapshot);

  function refresh() {
    setState(readSnapshot());
  }

  useEffect(() => {
    if (!wallPaletteBridge.isBridgeAvailable()) return;
    if (!wallPaletteBridge.isAuthorityInitialized()) ensurePreviewMap(() => refresh());
    const unsubPreview = subscribePreviewState(() => refresh());
    const unsubscribe = wallPaletteBridge.subscribe(refresh);
    return () => { unsubPreview(); unsubscribe(); };
  }, []);

  if (loadState === "authority_unavailable") {
    return (
      <div className="pg-empty">
        <div className="pg-empty-msg">MAPS Geographic library is unavailable — Wall's runtime could not be reached.</div>
      </div>
    );
  }
  if (loadState === "preview_loading") {
    return (
      <div className="pg-empty">
        <div className="pg-empty-msg">Loading Geographic Style data…</div>
      </div>
    );
  }
  if (loadState === "preview_unavailable") {
    return (
      <div className="pg-empty">
        <div className="pg-empty-msg">Map preview is temporarily unavailable. Geographic Style data will appear once the connection to Wall's map succeeds.</div>
      </div>
    );
  }

  return (
    <CollectionGrid
      items={palettes}
      itemId={(p) => p.id}
      title="Geographic"
      createLabel="+ New Geographic Style"
      onCreate={() => {
        const result = wallPaletteBridge.duplicatePalette(wallPaletteBridge.DEFAULT_PALETTE_ID);
        if (result.ok) onOpen(result.data.id);
      }}
      emptyMessage="No Geographic Styles yet."
      onDelete={() => { /* delete/archive intentionally not built — never requested */ }}
      onDuplicate={(id) => {
        const result = wallPaletteBridge.duplicatePalette(id);
        if (result.ok) onOpen(result.data.id);
      }}
      deleteModalTitle=""
      deleteModalBody={() => ""}
      deleteActionLabel=""
      renderCtxMenu={(id, { onDuplicate, close }) => (
        <>
          <button className="ctx-item" onClick={() => { onOpen(id); close(); }}>Open</button>
          {onDuplicate && <button className="ctx-item" onClick={() => onDuplicate(id)}>Duplicate</button>}
        </>
      )}
      renderCard={(palette, { openCtxMenu }) => (
        <CollectionCard
          key={palette.id}
          id={palette.id}
          title={palette.title}
          artSlot={<PreviewSurface palette={palette} registry={registry} />}
          titleSlot={
            <span className="pgc-title">
              {palette.id === activeId && <span className="mg-star" title="Active">★</span>} {palette.title}
            </span>
          }
          activeClass={palette.id === activeId ? "pgc--active" : undefined}
          onClick={() => onOpen(palette.id)}
          onContextMenu={(e) => openCtxMenu(e, palette.id)}
          hoverActions={
            <>
              <button className="pgc-ha-btn" title="Open" onClick={() => onOpen(palette.id)}>Open</button>
              <button className="pgc-ha-btn" title="More" onClick={(e) => openCtxMenu(e, palette.id)}>⋮</button>
            </>
          }
        />
      )}
    />
  );
}
