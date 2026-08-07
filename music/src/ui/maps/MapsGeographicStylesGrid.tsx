import { useEffect, useState } from "react";
import { CollectionGrid } from "../CollectionGrid";
import { CollectionCard } from "../CollectionCard";
import * as wallGeographicStyleBridge from "../../maps/wallGeographicStyleBridge";
import type { GeographicStyleRecord, RegistryRecord } from "../../maps/wallGeographicStyleBridge";
import { ensurePreviewMap, getPreviewState, subscribePreviewState } from "../../maps/wallMapPreview";

type Props = {
  onOpen: (styleId: string) => void;
};

type LoadState = "authority_unavailable" | "preview_loading" | "preview_unavailable" | "ready";

// A handful of representative registry groups used for the card's swatch
// strip — a preview surface (spec §7 allows this in place of a captured
// thumbnail), not a resting hex label: colors only, no text values.
const SWATCH_GROUPS = ["Water", "Land", "Roads", "Route", "Vehicles", "HUD"];

function swatchesFor(style: GeographicStyleRecord, registry: RegistryRecord[]): string[] {
  const seen = new Set<string>();
  const swatches: string[] = [];
  for (const group of SWATCH_GROUPS) {
    const rec = registry.find((r) => r.group === group && !seen.has(r.group));
    if (rec && style.values[rec.id]) {
      swatches.push(style.values[rec.id]);
      seen.add(group);
    }
  }
  return swatches;
}

function PreviewSurface({ style, registry }: { style: GeographicStyleRecord; registry: RegistryRecord[] }) {
  const swatches = swatchesFor(style, registry);
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
  styles: GeographicStyleRecord[];
  registry: RegistryRecord[];
  activeId: string | null;
};

function readSnapshot(): Snapshot {
  if (!wallGeographicStyleBridge.isBridgeAvailable()) {
    return { loadState: "authority_unavailable", styles: [], registry: [], activeId: null };
  }
  if (wallGeographicStyleBridge.isAuthorityInitialized()) {
    const list = wallGeographicStyleBridge.listGeographicStyles();
    const reg = wallGeographicStyleBridge.getRegistry();
    return {
      loadState: "ready",
      styles: list.ok ? list.data : [],
      registry: reg.ok ? reg.data : [],
      activeId: wallGeographicStyleBridge.getActiveId(),
    };
  }
  return {
    loadState: getPreviewState() === "unavailable" ? "preview_unavailable" : "preview_loading",
    styles: [],
    registry: [],
    activeId: null,
  };
}

export function MapsGeographicStylesGrid({ onOpen }: Props) {
  const [{ loadState, styles, registry, activeId }, setState] = useState<Snapshot>(readSnapshot);

  function refresh() {
    setState(readSnapshot());
  }

  useEffect(() => {
    if (!wallGeographicStyleBridge.isBridgeAvailable()) return;
    if (!wallGeographicStyleBridge.isAuthorityInitialized()) ensurePreviewMap(() => refresh());
    const unsubPreview = subscribePreviewState(() => refresh());
    const unsubscribe = wallGeographicStyleBridge.subscribe(refresh);
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
      items={styles}
      itemId={(p) => p.id}
      title="Geographic"
      createLabel="+ New Geographic Style"
      onCreate={() => {
        const result = wallGeographicStyleBridge.duplicateGeographicStyle(wallGeographicStyleBridge.DEFAULT_GEOGRAPHIC_STYLE_ID);
        if (result.ok) onOpen(result.data.id);
      }}
      emptyMessage="No Geographic Styles yet."
      onDelete={() => { /* delete/archive intentionally not built — never requested */ }}
      onDuplicate={(id) => {
        const result = wallGeographicStyleBridge.duplicateGeographicStyle(id);
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
      renderCard={(style, { openCtxMenu }) => (
        <CollectionCard
          key={style.id}
          id={style.id}
          title={style.title}
          artSlot={<PreviewSurface style={style} registry={registry} />}
          titleSlot={
            <span className="pgc-title">
              {style.id === activeId && <span className="mg-star" title="Active">★</span>} {style.title}
            </span>
          }
          activeClass={style.id === activeId ? "pgc--active" : undefined}
          onClick={() => onOpen(style.id)}
          onContextMenu={(e) => openCtxMenu(e, style.id)}
          hoverActions={
            <>
              <button className="pgc-ha-btn" title="Open" onClick={() => onOpen(style.id)}>Open</button>
              <button className="pgc-ha-btn" title="More" onClick={(e) => openCtxMenu(e, style.id)}>⋮</button>
            </>
          }
        />
      )}
    />
  );
}
