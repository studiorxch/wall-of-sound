import { useEffect, useRef, useState } from "react";
import { CollectionDetailBar } from "../CollectionDetailBar";
import * as wallPaletteBridge from "../../maps/wallPaletteBridge";
import type { PaletteRecord, RegistryRecord } from "../../maps/wallPaletteBridge";
import { dockPreviewMap, undockPreviewMap, getPreviewState, subscribePreviewState } from "../../maps/wallMapPreview";
import { MapsGeographicCatalog } from "./MapsGeographicCatalog";

type Props = {
  paletteId: string;
  onBack: () => void;
  onOpenPalette: (paletteId: string) => void;
};

type Snapshot = {
  palette: PaletteRecord | null;
  registry: RegistryRecord[];
  activeId: string | null;
  previewId: string | null;
  previewMapReady: boolean;
};

// The parent (MapsSection) mounts this component with key={paletteId}, so a
// palette switch is a fresh mount, not a prop change — every state field
// below can be computed once via a lazy initializer instead of resynced in
// an effect.
function readSnapshot(paletteId: string): Snapshot {
  const p = wallPaletteBridge.getPalette(paletteId);
  const reg = wallPaletteBridge.getRegistry();
  return {
    palette: p.ok ? p.data : null,
    registry: reg.ok ? reg.data : [],
    activeId: wallPaletteBridge.getActiveId(),
    previewId: wallPaletteBridge.getPreviewId(),
    previewMapReady: getPreviewState() === "ready",
  };
}

export function MapsPaletteDetail({ paletteId, onBack, onOpenPalette }: Props) {
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [{ palette, registry, activeId, previewId, previewMapReady }, setSnapshot] = useState<Snapshot>(
    () => readSnapshot(paletteId)
  );
  const [renameDraft, setRenameDraft] = useState<string | null>(null);

  function refresh() {
    setSnapshot(readSnapshot(paletteId));
  }

  useEffect(() => {
    const unsubscribeBridge = wallPaletteBridge.subscribe(refresh);
    const unsubscribePreview = subscribePreviewState(refresh);
    const el = previewContainerRef.current;
    if (el) dockPreviewMap(el);
    return () => {
      unsubscribeBridge();
      unsubscribePreview();
      undockPreviewMap();
      // Leaving the detail view must never leave another palette's preview
      // applied to the shared map — restore whatever is actually active.
      if (wallPaletteBridge.getPreviewId() === paletteId) wallPaletteBridge.endPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDefault = palette?.id === wallPaletteBridge.DEFAULT_PALETTE_ID;
  const isActive = palette?.id === activeId;
  const isPreviewing = palette?.id === previewId;

  // The preview area below must always mount (and keep its ref attached)
  // regardless of whether `palette` has resolved yet — it's what triggers
  // dockPreviewMap()/ensurePreviewMap(), which is in turn what makes the
  // authority initialize and `palette` resolve in the first place. Gating
  // this whole return on `palette` (an earlier version did) created a
  // deadlock on a direct/reloaded detail URL: the ref never attached, so
  // the map never initialized, so the palette never loaded, so the ref
  // stayed unmounted forever.
  return (
    <div className="md-root">
      <CollectionDetailBar
        collectionLabel="Geographic"
        onBackToCollection={onBack}
        createLabel="Duplicate"
        onCreate={() => {
          if (!palette) return;
          const result = wallPaletteBridge.duplicatePalette(palette.id);
          if (result.ok) onOpenPalette(result.data.id);
        }}
      />

      {palette ? (
        <div className="md-header">
          {renameDraft != null ? (
            <input
              className="cat-filter-search"
              style={{ fontSize: 18, width: 260 }}
              value={renameDraft}
              autoFocus
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { wallPaletteBridge.renamePalette(palette.id, renameDraft); setRenameDraft(null); }
                if (e.key === "Escape") setRenameDraft(null);
              }}
              onBlur={() => setRenameDraft(null)}
            />
          ) : (
            <h2
              className="md-title"
              onClick={() => !isDefault && setRenameDraft(palette.title)}
              title={isDefault ? "Default's title is protected" : "Click to rename"}
            >
              {isActive && <span className="mg-star" title="Active">★</span>} {palette.title}
            </h2>
          )}
          <div className="md-state">
            {isActive && !isPreviewing && <span className="md-state-badge md-state-badge--active">Active</span>}
            {isPreviewing && <span className="md-state-badge md-state-badge--preview">Previewing</span>}
          </div>
          <div className="md-actions">
            {isPreviewing ? (
              <button className="tb-btn" onClick={() => wallPaletteBridge.endPreview()}>End Preview</button>
            ) : (
              <button className="tb-btn" onClick={() => wallPaletteBridge.previewPalette(palette.id)}>Preview</button>
            )}
            <button
              className="tb-btn"
              disabled={isActive}
              onClick={() => wallPaletteBridge.activatePalette(palette.id)}
            >
              Activate
            </button>
          </div>
        </div>
      ) : (
        <div className="md-header">
          <span className="md-title">Loading Geographic Style…</span>
        </div>
      )}

      <div className="md-preview-area" ref={previewContainerRef}>
        {!previewMapReady && (
          <div className="md-preview-loading">Map preview loading…</div>
        )}
      </div>

      {palette && (
        <MapsGeographicCatalog
          paletteId={palette.id}
          registry={registry}
          values={palette.values}
          isDefault={isDefault}
        />
      )}
    </div>
  );
}
