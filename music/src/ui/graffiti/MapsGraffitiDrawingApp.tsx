import { useEffect, useMemo, useState } from "react";
import { CollectionDetailBar } from "../CollectionDetailBar";
import { GraffitiCanvas } from "./GraffitiCanvas";
import { createSession } from "../../graffiti/graffitiStrokeStore";
import { emptyHistory, undo, redo, hardReset } from "../../graffiti/graffitiHistory";
import { serializeSession } from "../../graffiti/graffitiArtworkSerializer";
import { sizeCanvasForDPR, renderSession } from "../../graffiti/graffitiCanvasRenderer";
import { BRUSH_IDS, BRUSH_LABELS } from "../../graffiti/graffitiBrushRegistry";
import type { ArtworkCreationSession, BrushId, DrawingTargetMode, HistoryState } from "../../graffiti/graffitiTypes";
import * as graffitiBridge from "../../maps/wallGraffitiArtworkBridge";
import * as rollingStockBridge from "../../maps/wallRollingStockAdminBridge";
import type { Artwork, ArtworkPlacement } from "../../data/subwayRollingStockAdminTypes";
import stickerTemplate from "../../assets/graffiti/sticker-template.png";
import carTemplate from "../../assets/graffiti/subway-car-template.webp";

// 0818_SUBWAY_Artwork_Creation_Drawing_App_v1.0.0 — BUILD §16-17, §21-26
//
// One component serves both required modes (Sticker §16, Subway Car §17) —
// they share the same engine/canvas/toolbar; only the target mode, canvas
// aspect ratio, and background template differ. Save and Place stay
// distinct actions (BUILD §25): Save always creates a fresh sr-art-*;
// Place is only offered once an artwork exists, and only in car_surface
// mode (a sticker has nowhere on the subway network to be placed).

const PALETTE = ["#f5f5f5", "#111111", "#ff0066", "#ffb703", "#00c2ff", "#00ff88", "#8b2e8b", "#ffffff"];
const STICKER_ASPECT = 988 / 745;
const CAR_ASPECT = 1800 / 350;

type Props = {
  targetMode: DrawingTargetMode;
  onBack: () => void;
  onPlaced?: () => void;
};

export function MapsGraffitiDrawingApp({ targetMode, onBack, onPlaced }: Props) {
  const [session, setSession] = useState<ArtworkCreationSession>(() => {
    const isSticker = targetMode.kind === "sticker";
    const width = isSticker ? 1000 : 1800;
    const height = isSticker ? Math.round(1000 / STICKER_ASPECT) : Math.round(1800 / CAR_ASPECT);
    return createSession(targetMode, width, height, PALETTE, Date.now());
  });
  const [history, setHistory] = useState<HistoryState>(emptyHistory);
  const [activeTool, setActiveTool] = useState<BrushId>("marker");
  const [activeColor, setActiveColor] = useState<string>(PALETTE[2]);
  const [activeWidth, setActiveWidth] = useState<number>(0.02);
  const [savedArtwork, setSavedArtwork] = useState<Artwork | null>(null);
  const [placedResult, setPlacedResult] = useState<(ArtworkPlacement & { covered?: string | null }) | null>(null);
  const [existingActivePlacement, setExistingActivePlacement] = useState<ArtworkPlacement | null>(null);
  const [confirmingPlace, setConfirmingPlace] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const isSticker = targetMode.kind === "sticker";
  const cssWidth = isSticker ? 480 : 640;
  const cssHeight = Math.round(cssWidth / (isSticker ? STICKER_ASPECT : CAR_ASPECT));

  useEffect(() => {
    if (targetMode.kind !== "car_surface") return;
    const existing = rollingStockBridge.getActivePlacementForSurface(targetMode.surfaceId);
    if (existing.ok) setExistingActivePlacement(existing.data);
  }, [targetMode]);

  function markDirtyReset() {
    setSavedArtwork(null);
    setPlacedResult(null);
  }

  function onUndo() {
    const result = undo(session, history, Date.now());
    setSession(result.session);
    setHistory(result.history);
    markDirtyReset();
  }
  function onRedo() {
    const result = redo(session, history, Date.now());
    setSession(result.session);
    setHistory(result.history);
    markDirtyReset();
  }
  function onClear() {
    if (session.strokes.length === 0) return;
    if (!window.confirm("Clear the entire drawing? This cannot be undone.")) return;
    const result = hardReset(session, Date.now());
    setSession(result.session);
    setHistory(result.history);
    markDirtyReset();
  }

  function exportRasterPreview(): string | undefined {
    try {
      const canvas = document.createElement("canvas");
      sizeCanvasForDPR(canvas, session.canvasWidth, session.canvasHeight, 1);
      const ctx = canvas.getContext("2d");
      if (!ctx) return undefined;
      // A flat, honest export of the structured stroke data only — the
      // template background is a drawing GUIDE (BUILD §17: "not the
      // artwork itself"), so it is deliberately excluded from the saved
      // raster preview.
      renderSession(ctx, session, canvas.width, canvas.height);
      return canvas.toDataURL("image/png");
    } catch {
      return undefined;
    }
  }

  function onSave() {
    const payload = serializeSession(session);
    const result = graffitiBridge.saveDrawingAsArtwork({
      payload,
      rasterPreviewDataUrl: exportRasterPreview(),
      sourceType: isSticker ? "sticker" : "drawing",
      title: isSticker ? "Sticker" : `Car artwork — ${targetMode.kind === "car_surface" ? targetMode.surfaceType : ""}`,
    });
    if (!result.ok) { setStatusMessage(`Save failed: ${result.error}`); return; }
    setSavedArtwork(result.data);
    setStatusMessage(`Saved as ${result.data.id}`);
  }

  function onImport(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const result = graffitiBridge.importAssetAsArtwork({ assetDataUrl: dataUrl, title: file.name });
      if (!result.ok) { setStatusMessage(`Import failed: ${result.error}`); return; }
      setSavedArtwork(result.data);
      setStatusMessage(`Imported as ${result.data.id}`);
    };
    reader.readAsDataURL(file);
  }

  function requestPlace() {
    if (!savedArtwork || targetMode.kind !== "car_surface") return;
    if (existingActivePlacement) { setConfirmingPlace(true); return; }
    doPlace();
  }

  function doPlace() {
    if (!savedArtwork || targetMode.kind !== "car_surface") return;
    const result = graffitiBridge.placeArtworkOnSurface({ artworkId: savedArtwork.id, surfaceId: targetMode.surfaceId });
    setConfirmingPlace(false);
    if (!result.ok) { setStatusMessage(`Placement failed: ${result.error}`); return; }
    setPlacedResult(result.data);
    setStatusMessage(`Placed as ${result.data.id}${result.data.covered ? ` (covered ${result.data.covered})` : ""}`);
    onPlaced?.();
  }

  const modeLabel = useMemo(() => {
    if (targetMode.kind === "sticker") return "Sticker Sandbox";
    return `${targetMode.routeId.replace("subway:route:", "")} · ${targetMode.logicalCarId} · ${targetMode.surfaceType}`;
  }, [targetMode]);

  return (
    <div className="md-root graffiti-app">
      <CollectionDetailBar collectionLabel="Rolling Stock" onBackToCollection={onBack} />
      <div className="graffiti-header">
        <h2 className="station-detail-title">{modeLabel}</h2>
        {statusMessage && <span className="graffiti-status">{statusMessage}</span>}
      </div>

      <div className="graffiti-workspace">
        <GraffitiCanvas
          session={session}
          onSessionChange={(s) => { setSession(s); markDirtyReset(); }}
          history={history}
          onHistoryChange={setHistory}
          activeTool={activeTool}
          activeColor={activeColor}
          activeWidth={activeWidth}
          backgroundImageSrc={isSticker ? stickerTemplate : carTemplate}
          cssWidth={cssWidth}
          cssHeight={cssHeight}
        />

        <div className="graffiti-toolbar">
          <div className="graffiti-toolbar-group">
            <div className="station-detail-section-label">Brush</div>
            <div className="graffiti-brush-row">
              {BRUSH_IDS.map((id) => (
                <button key={id} className={`station-detail-sibling-link${activeTool === id ? " active" : ""}`} onClick={() => setActiveTool(id)}>
                  {BRUSH_LABELS[id]}
                </button>
              ))}
            </div>
          </div>

          <div className="graffiti-toolbar-group">
            <div className="station-detail-section-label">Size</div>
            <input type="range" min={0.005} max={0.08} step={0.005} value={activeWidth} onChange={(e) => setActiveWidth(Number(e.target.value))} />
          </div>

          <div className="graffiti-toolbar-group">
            <div className="station-detail-section-label">Color</div>
            <div className="graffiti-swatch-row">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  className={`graffiti-swatch${activeColor === c ? " active" : ""}`}
                  style={{ background: c }}
                  onClick={() => setActiveColor(c)}
                  aria-label={c}
                />
              ))}
              <input type="color" value={activeColor} onChange={(e) => setActiveColor(e.target.value)} title="Custom color" />
            </div>
          </div>

          <div className="graffiti-toolbar-group graffiti-toolbar-actions">
            <button className="station-detail-sibling-link" onClick={onUndo} disabled={history.undoStack.length === 0}>Undo</button>
            <button className="station-detail-sibling-link" onClick={onRedo} disabled={history.redoStack.length === 0}>Redo</button>
            <button className="station-detail-sibling-link" onClick={onClear} disabled={session.strokes.length === 0}>Clear</button>
            <label className="station-detail-sibling-link graffiti-import-label">
              Import
              <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onImport(f); }} />
            </label>
          </div>

          <div className="graffiti-toolbar-group graffiti-toolbar-actions">
            <button className="station-detail-sibling-link" onClick={onSave} disabled={session.strokes.length === 0}>Save Artwork</button>
            {targetMode.kind === "car_surface" && (
              <button className="station-detail-sibling-link" onClick={requestPlace} disabled={!savedArtwork}>Place Artwork</button>
            )}
          </div>

          {savedArtwork && (
            <div className="graffiti-toolbar-group">
              <div className="station-detail-section-label">Saved Artwork</div>
              <div className="geo-row-hex">{savedArtwork.id}</div>
            </div>
          )}
        </div>
      </div>

      {confirmingPlace && targetMode.kind === "car_surface" && (
        <div className="graffiti-confirm-panel">
          <div className="station-detail-section-label">Confirm Placement</div>
          <dl className="station-detail-fields">
            <dt>Artwork</dt><dd className="geo-row-hex">{savedArtwork?.id}</dd>
            <dt>Route</dt><dd>{targetMode.routeId.replace("subway:route:", "")}</dd>
            <dt>Logical train</dt><dd className="geo-row-hex">{targetMode.logicalTrainId}</dd>
            <dt>Consist</dt><dd className="geo-row-hex">{targetMode.consistId}</dd>
            <dt>Car</dt><dd className="geo-row-hex">{targetMode.logicalCarId}</dd>
            <dt>Surface</dt><dd>{targetMode.surfaceType}</dd>
            <dt>Existing active placement</dt><dd className="geo-row-hex">{existingActivePlacement?.artworkId} ({existingActivePlacement?.id}) — will be covered, not deleted</dd>
          </dl>
          <div className="graffiti-toolbar-actions">
            <button className="station-detail-sibling-link" onClick={doPlace}>Place &amp; Cover</button>
            <button className="station-detail-sibling-link" onClick={() => setConfirmingPlace(false)}>Cancel</button>
          </div>
        </div>
      )}

      {placedResult && (
        <div className="graffiti-toolbar-group">
          <div className="station-detail-section-label">Placement Confirmed</div>
          <div className="geo-row-hex">{placedResult.id}</div>
        </div>
      )}
    </div>
  );
}
