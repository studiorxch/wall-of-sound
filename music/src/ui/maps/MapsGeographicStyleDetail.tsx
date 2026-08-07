import { useEffect, useRef, useState } from "react";
import { CollectionDetailBar } from "../CollectionDetailBar";
import * as wallGeographicStyleBridge from "../../maps/wallGeographicStyleBridge";
import type { GeographicStyleRecord, RegistryRecord } from "../../maps/wallGeographicStyleBridge";
import { dockPreviewMap, undockPreviewMap, getPreviewState, subscribePreviewState } from "../../maps/wallMapPreview";
import { MapsGeographicCatalog } from "./MapsGeographicCatalog";

type Props = {
  styleId: string;
  onBack: () => void;
  onOpenStyle: (styleId: string) => void;
};

type Snapshot = {
  style: GeographicStyleRecord | null;
  registry: RegistryRecord[];
  activeId: string | null;
  previewId: string | null;
  previewMapReady: boolean;
};

// The parent (MapsSection) mounts this component with key={styleId}, so a
// style switch is a fresh mount, not a prop change — every state field
// below can be computed once via a lazy initializer instead of resynced in
// an effect.
function readSnapshot(styleId: string): Snapshot {
  const p = wallGeographicStyleBridge.getGeographicStyle(styleId);
  const reg = wallGeographicStyleBridge.getRegistry();
  return {
    style: p.ok ? p.data : null,
    registry: reg.ok ? reg.data : [],
    activeId: wallGeographicStyleBridge.getActiveId(),
    previewId: wallGeographicStyleBridge.getPreviewId(),
    previewMapReady: getPreviewState() === "ready",
  };
}

export function MapsGeographicStyleDetail({ styleId, onBack, onOpenStyle }: Props) {
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [{ style, registry, activeId, previewId, previewMapReady }, setSnapshot] = useState<Snapshot>(
    () => readSnapshot(styleId)
  );
  const [renameDraft, setRenameDraft] = useState<string | null>(null);

  function refresh() {
    setSnapshot(readSnapshot(styleId));
  }

  useEffect(() => {
    const unsubscribeBridge = wallGeographicStyleBridge.subscribe(refresh);
    const unsubscribePreview = subscribePreviewState(refresh);
    const el = previewContainerRef.current;
    if (el) dockPreviewMap(el);
    return () => {
      unsubscribeBridge();
      unsubscribePreview();
      undockPreviewMap();
      // Leaving the detail view must never leave another style's preview
      // applied to the shared map — restore whatever is actually active.
      if (wallGeographicStyleBridge.getPreviewId() === styleId) wallGeographicStyleBridge.endPreview();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDefault = style?.id === wallGeographicStyleBridge.DEFAULT_GEOGRAPHIC_STYLE_ID;
  const isActive = style?.id === activeId;
  const isPreviewing = style?.id === previewId;

  // The preview area below must always mount (and keep its ref attached)
  // regardless of whether `style` has resolved yet — it's what triggers
  // dockPreviewMap()/ensurePreviewMap(), which is in turn what makes the
  // authority initialize and `style` resolve in the first place. Gating
  // this whole return on `style` (an earlier version did) created a
  // deadlock on a direct/reloaded detail URL: the ref never attached, so
  // the map never initialized, so the style never loaded, so the ref
  // stayed unmounted forever.
  return (
    <div className="md-root">
      <CollectionDetailBar
        collectionLabel="Geographic"
        onBackToCollection={onBack}
        createLabel="Duplicate"
        onCreate={() => {
          if (!style) return;
          const result = wallGeographicStyleBridge.duplicateGeographicStyle(style.id);
          if (result.ok) onOpenStyle(result.data.id);
        }}
      />

      {style ? (
        <div className="md-header">
          {renameDraft != null ? (
            <input
              className="cat-filter-search"
              style={{ fontSize: 18, width: 260 }}
              value={renameDraft}
              autoFocus
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { wallGeographicStyleBridge.renameGeographicStyle(style.id, renameDraft); setRenameDraft(null); }
                if (e.key === "Escape") setRenameDraft(null);
              }}
              onBlur={() => setRenameDraft(null)}
            />
          ) : (
            <h2
              className="md-title"
              onClick={() => !isDefault && setRenameDraft(style.title)}
              title={isDefault ? "Default's title is protected" : "Click to rename"}
            >
              {isActive && <span className="mg-star" title="Active">★</span>} {style.title}
            </h2>
          )}
          <div className="md-state">
            {isActive && !isPreviewing && <span className="md-state-badge md-state-badge--active">Active</span>}
            {isPreviewing && <span className="md-state-badge md-state-badge--preview">Previewing</span>}
          </div>
          <div className="md-actions">
            {isPreviewing ? (
              <button className="tb-btn" onClick={() => wallGeographicStyleBridge.endPreview()}>End Preview</button>
            ) : (
              <button className="tb-btn" onClick={() => wallGeographicStyleBridge.previewGeographicStyle(style.id)}>Preview</button>
            )}
            <button
              className="tb-btn"
              disabled={isActive}
              onClick={() => wallGeographicStyleBridge.activateGeographicStyle(style.id)}
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

      {style && (
        <MapsGeographicCatalog
          styleId={style.id}
          registry={registry}
          values={style.values}
          isDefault={isDefault}
        />
      )}
    </div>
  );
}
