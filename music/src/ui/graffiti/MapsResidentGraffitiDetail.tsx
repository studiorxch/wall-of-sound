import { useEffect, useState } from "react";
import { CollectionDetailBar } from "../CollectionDetailBar";
import * as bridge from "../../maps/wallResidentGraffitiBridge";
import * as rollingStockBridge from "../../maps/wallRollingStockAdminBridge";
import { GraffitiPreviewCanvas } from "./GraffitiPreviewCanvas";
import type { ResidentGraffitiArtist, GraffitiStyleProfile } from "../../data/subwayResidentGraffitiTypes";
import type { ResidentPreview, ResidentPlacementOutcome } from "../../maps/wallResidentGraffitiBridge";

// BUILD §27: "Resident Artwork/Placement history must be reference/index-
// only, not duplicated bodies — canonical Artwork Authority remains source
// of truth." The Resident's own history entry.status is a frozen snapshot
// taken at creation time (before placement resolution even runs), so a
// safe-failure draft-marking that happens moments later would otherwise
// never show up here — resolve the CURRENT status from the canonical
// Artwork Authority instead of trusting the snapshot.
function liveArtworkStatus(artworkId: string, fallback: string): string {
  const result = rollingStockBridge.getArtwork(artworkId);
  return result.ok ? result.data.status : fallback;
}

type Props = {
  residentId: string;
  onBack: () => void;
};

// Matches the car-exterior surface aspect ratio (MapsGraffitiDrawingApp's
// CAR_ASPECT) — Resident pieces are generated against the same proportions
// they will actually be judged against once placed.
const PREVIEW_ASPECT = 1800 / 350;
const PREVIEW_WIDTH = 1000;
const PREVIEW_HEIGHT = Math.round(PREVIEW_WIDTH / PREVIEW_ASPECT);
const PREVIEW_CSS_WIDTH = 480;
const PREVIEW_CSS_HEIGHT = Math.round(PREVIEW_CSS_WIDTH / PREVIEW_ASPECT);

type Snapshot = {
  resident: ResidentGraffitiArtist | null;
  style: GraffitiStyleProfile | null;
};

function readSnapshot(id: string): Snapshot {
  const r = bridge.getResident(id);
  const resident = r.ok ? r.data : null;
  if (!resident) return { resident: null, style: null };
  const s = bridge.getStyleProfile(resident.styleProfileId);
  return { resident, style: s.ok ? s.data : null };
}

// BUILD §31-33: identity, style profile, tool/color/route preferences,
// cover behavior, artwork/placement history, and the required "Create
// Artwork Now" action — preview (generateResidentPreview, pure/unsaved)
// rendered through the EXISTING Drawing App renderer (GraffitiPreviewCanvas
// -> renderStroke, no parallel rasterizer), then Place / Regenerate with
// new seed / Cancel, matching the BUILD document's own verbatim wording.
export function MapsResidentGraffitiDetail({ residentId, onBack }: Props) {
  const [{ resident, style }, setSnapshot] = useState<Snapshot>(() => readSnapshot(residentId));
  const [preview, setPreview] = useState<ResidentPreview | null>(null);
  const [seed, setSeed] = useState<number>(0);
  const [outcome, setOutcome] = useState<ResidentPlacementOutcome | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  function refresh() {
    setSnapshot(readSnapshot(residentId));
  }

  useEffect(() => {
    const unsubscribe = bridge.subscribe(refresh);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [residentId]);

  function generate(nextSeed: number) {
    setSeed(nextSeed);
    const result = bridge.generateResidentPreview(residentId, nextSeed, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    setOutcome(null);
    if (!result.ok) { setStatusMessage(`Preview generation failed: ${result.error}`); return; }
    setPreview(result.data);
    setStatusMessage(null);
  }

  function cancelPreview() {
    setPreview(null);
    setOutcome(null);
  }

  function place() {
    if (!preview) return;
    const result = bridge.createAndPlaceResidentArtwork(preview, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    if (!result.ok) { setStatusMessage(`Placement failed: ${result.error}`); return; }
    setOutcome(result.data);
    setStatusMessage(
      result.data.placed
        ? `Placed as ${result.data.placementId} on ${result.data.surfaceId}${result.data.covered ? ` (covered ${result.data.covered})` : ""}`
        : `Artwork ${result.data.artworkId} saved as draft — ${result.data.reason}`
    );
    setPreview(null);
    refresh();
  }

  if (!resident) {
    return (
      <div className="md-root">
        <CollectionDetailBar collectionLabel="Graffiti Artists" onBackToCollection={onBack} />
        <div className="pg-empty"><div className="pg-empty-msg">Resident not found.</div></div>
      </div>
    );
  }

  const artworkHistory = [...resident.artworkHistory].sort((a, b) => b.createdAt - a.createdAt);
  const placementHistory = [...resident.placementHistory].sort((a, b) => b.startedAt - a.startedAt);

  return (
    <div className="md-root">
      <CollectionDetailBar collectionLabel="Graffiti Artists" onBackToCollection={onBack} />
      <div className="station-detail">
        <h2 className="station-detail-title">{resident.tagName} · {resident.displayName}</h2>
        {statusMessage && <span className="graffiti-status">{statusMessage}</span>}

        <div className="station-detail-section">
          <div className="station-detail-section-label">Identity</div>
          <dl className="station-detail-fields">
            <dt>Resident ID</dt><dd className="geo-row-hex">{resident.id}</dd>
            <dt>Status</dt><dd>{resident.status}</dd>
            <dt>Home borough</dt><dd>{resident.homeBorough ?? "—"}</dd>
          </dl>
        </div>

        {style && (
          <div className="station-detail-section">
            <div className="station-detail-section-label">Style Profile</div>
            <dl className="station-detail-fields">
              <dt>Label</dt><dd>{style.label}</dd>
              <dt>Tools</dt><dd>{style.preferredTools.join(", ")}</dd>
              <dt>Palette</dt>
              <dd>
                <div className="graffiti-swatch-row">
                  {style.preferredColors.map((c) => (
                    <span key={c} className="graffiti-swatch" style={{ background: c }} title={c} />
                  ))}
                </div>
              </dd>
              <dt>Width range</dt><dd>{style.widthRange.min} – {style.widthRange.max}</dd>
              <dt>Stroke count</dt><dd>{style.strokeCountRange.min} – {style.strokeCountRange.max}</dd>
              <dt>Angularity / Curvature</dt><dd>{style.angularity.toFixed(2)} / {style.curvature.toFixed(2)}</dd>
              <dt>Marker / Fatcap / Drip affinity</dt><dd>{style.markerAffinity.toFixed(2)} / {style.fatcapAffinity.toFixed(2)} / {style.dripAffinity.toFixed(2)}</dd>
              <dt>Density / Complexity</dt><dd>{style.density.toFixed(2)} / {style.complexity.toFixed(2)}</dd>
              <dt>Pressure bias</dt><dd>{style.pressureBias != null ? style.pressureBias.toFixed(2) : "none"}</dd>
            </dl>
          </div>
        )}

        <div className="station-detail-section">
          <div className="station-detail-section-label">Route Preferences</div>
          <dl className="station-detail-fields">
            <dt>Routes</dt><dd>{resident.preferredRoutes.length > 0 ? resident.preferredRoutes.map((r) => r.replace("subway:route:", "")).join(", ") : "any"}</dd>
            <dt>Families</dt><dd>{resident.preferredRouteFamilies.length > 0 ? resident.preferredRouteFamilies.join(", ") : "any"}</dd>
            <dt>Surface types</dt><dd>{resident.preferredSurfaceTypes.join(", ")}</dd>
          </dl>
        </div>

        <div className="station-detail-section">
          <div className="station-detail-section-label">Cover Behavior</div>
          <dl className="station-detail-fields">
            <dt>Cover permission</dt><dd>{resident.behaviorProfile.coverPermission}</dd>
            <dt>Cover probability</dt><dd>{resident.behaviorProfile.coverProbability.toFixed(2)}</dd>
            <dt>Empty-surface preference</dt><dd>{resident.behaviorProfile.emptySurfacePreference.toFixed(2)}</dd>
            <dt>Repeat-car avoidance</dt><dd>{resident.behaviorProfile.repeatCarAvoidance.toFixed(2)}</dd>
            <dt>Recent placements considered</dt><dd>{resident.behaviorProfile.maxRecentPlacementsConsidered}</dd>
          </dl>
        </div>

        <div className="station-detail-section">
          <div className="station-detail-section-label">Create Artwork</div>
          {!preview ? (
            <button className="station-detail-sibling-link" onClick={() => generate(Date.now())}>Create Artwork Now</button>
          ) : (
            <div className="graffiti-confirm-panel">
              <GraffitiPreviewCanvas
                strokes={preview.strokes}
                canvasWidth={PREVIEW_WIDTH}
                canvasHeight={PREVIEW_HEIGHT}
                cssWidth={PREVIEW_CSS_WIDTH}
                cssHeight={PREVIEW_CSS_HEIGHT}
              />
              <dl className="station-detail-fields">
                <dt>Seed</dt><dd className="geo-row-hex">{preview.intent.seed}</dd>
                <dt>Tool sequence</dt><dd>{preview.intent.toolSequence.join(", ")}</dd>
                <dt>Palette</dt><dd>{preview.intent.palette.join(", ")}</dd>
                <dt>Strokes</dt><dd>{preview.intent.strokeCount}</dd>
              </dl>
              <div className="graffiti-toolbar-actions">
                <button className="station-detail-sibling-link" onClick={place}>Place</button>
                <button className="station-detail-sibling-link" onClick={() => generate(seed + 1)}>Regenerate with new seed</button>
                <button className="station-detail-sibling-link" onClick={cancelPreview}>Cancel</button>
              </div>
            </div>
          )}
          {outcome && (
            <dl className="station-detail-fields">
              <dt>Artwork</dt><dd className="geo-row-hex">{outcome.artworkId}</dd>
              <dt>Placed</dt><dd>{outcome.placed ? "yes" : `no — ${outcome.reason}`}</dd>
              {outcome.placed && (
                <>
                  <dt>Placement</dt><dd className="geo-row-hex">{outcome.placementId}</dd>
                  <dt>Surface</dt><dd className="geo-row-hex">{outcome.surfaceId}</dd>
                </>
              )}
            </dl>
          )}
        </div>

        <div className="station-detail-section">
          <div className="station-detail-section-label">Artwork History</div>
          {artworkHistory.length === 0 ? (
            <div className="pg-empty-msg">No artwork created yet.</div>
          ) : (
            <table className="geo-rows-table">
              <thead><tr><th>Artwork</th><th>Created</th><th>Status</th><th>Seed</th><th>Tools</th></tr></thead>
              <tbody>
                {artworkHistory.map((a) => (
                  <tr key={a.artworkId} className="geo-row">
                    <td className="geo-row-hex">{a.artworkId}</td>
                    <td>{new Date(a.createdAt).toLocaleTimeString()}</td>
                    <td>{liveArtworkStatus(a.artworkId, a.status)}</td>
                    <td>{a.generationSeed}</td>
                    <td>{a.toolSequence.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="station-detail-section">
          <div className="station-detail-section-label">Placement History</div>
          {placementHistory.length === 0 ? (
            <div className="pg-empty-msg">No placements yet.</div>
          ) : (
            <table className="geo-rows-table">
              <thead><tr><th>Placement</th><th>Surface</th><th>Car</th><th>Route</th><th>Started</th><th>Ended</th></tr></thead>
              <tbody>
                {placementHistory.map((p) => (
                  <tr key={p.placementId} className="geo-row">
                    <td className="geo-row-hex">{p.placementId}</td>
                    <td className="geo-row-hex">{p.surfaceId}</td>
                    <td className="geo-row-hex">{p.logicalCarId}</td>
                    <td>{p.routeId.replace("subway:route:", "")}</td>
                    <td>{new Date(p.startedAt).toLocaleTimeString()}</td>
                    <td>{p.endedAt ? new Date(p.endedAt).toLocaleTimeString() : <span className="geo-row-cell-empty">active</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
