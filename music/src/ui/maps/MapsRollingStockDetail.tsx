import { useEffect, useState } from "react";
import { CollectionDetailBar } from "../CollectionDetailBar";
import * as bridge from "../../maps/wallRollingStockAdminBridge";
import type {
  LogicalTrain, LogicalConsist, LogicalCar, TrainPositionState, CarSurface, ArtworkPlacement,
} from "../../data/subwayRollingStockAdminTypes";

type Props = {
  logicalTrainId: string;
  onBack: () => void;
};

type Snapshot = {
  train: LogicalTrain | null;
  consist: LogicalConsist | null;
  cars: LogicalCar[];
  position: TrainPositionState | null;
};

function readSnapshot(id: string): Snapshot {
  const trainResult = bridge.getTrain(id);
  const train = trainResult.ok ? trainResult.data : null;
  if (!train) return { train: null, consist: null, cars: [], position: null };
  const consistResult = bridge.getConsist(train.consistId);
  const consist = consistResult.ok ? consistResult.data : null;
  const carsResult = bridge.getCarsForConsist(train.consistId);
  const cars = carsResult.ok ? carsResult.data : [];
  const posResult = bridge.getPositionState(id);
  const position = posResult.ok ? posResult.data : null;
  return { train, consist, cars, position };
}

// No artwork canvas / brush / upload here (BUILD §29 explicit exclusion) —
// "Place seed artwork" creates a plainly-labeled DEV_ART_* record and places
// it, proving the persistence/history chain without pretending to be a real
// creation tool.
function CarSurfaceRow({ car }: { car: LogicalCar }) {
  const [surfaces, setSurfaces] = useState<CarSurface[]>(() => {
    const r = bridge.getSurfacesForCar(car.id);
    return r.ok ? r.data : [];
  });
  const [placementsBySurface, setPlacementsBySurface] = useState<Record<string, { active: ArtworkPlacement | null; history: ArtworkPlacement[] }>>({});
  const [expandedHistory, setExpandedHistory] = useState<string | null>(null);

  function refreshPlacements(list: CarSurface[]) {
    const next: Record<string, { active: ArtworkPlacement | null; history: ArtworkPlacement[] }> = {};
    list.forEach((s) => {
      const active = bridge.getActivePlacementForSurface(s.id);
      const history = bridge.getPlacementHistoryForSurface(s.id);
      next[s.id] = { active: active.ok ? active.data : null, history: history.ok ? history.data : [] };
    });
    setPlacementsBySurface(next);
  }

  useEffect(() => {
    const r = bridge.ensureSurfacesForCar(car.id);
    const list = r.ok ? r.data : [];
    setSurfaces(list);
    refreshPlacements(list);
    const unsubscribe = bridge.subscribe(() => refreshPlacements(list));
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [car.id]);

  function placeSeedArtwork(surfaceId: string) {
    const artResult = bridge.createSeedArtwork(`DEV_ART_${Date.now().toString(36).toUpperCase()}`);
    if (!artResult.ok) return;
    bridge.placeArtwork({ artworkId: artResult.data.id, surfaceId, targetType: "surface", targetId: surfaceId });
    refreshPlacements(surfaces);
  }

  function retire(placementId: string, surfaceId: string) {
    bridge.retirePlacement(placementId);
    refreshPlacements(surfaces);
  }

  return (
    <div className="station-detail-section">
      <div className="station-detail-section-label">
        Car {car.slotIndex + 1} · <span className="geo-row-hex">{car.id}</span>
      </div>
      <table className="geo-rows-table">
        <thead>
          <tr>
            <th>Surface</th>
            <th>Active Placement</th>
            <th>History</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {surfaces.map((s) => {
            const info = placementsBySurface[s.id];
            const active = info?.active ?? null;
            const history = info?.history ?? [];
            return (
              <tr key={s.id} className="geo-row">
                <td className="geo-row-hex">{s.surfaceType}</td>
                <td>
                  {active ? (
                    <span title={active.id}>{active.artworkId} <span className="geo-row-cell-empty">(layer {active.layerIndex})</span></span>
                  ) : (
                    <span className="geo-row-cell-empty">empty</span>
                  )}
                </td>
                <td>
                  <button
                    className="station-detail-sibling-link"
                    onClick={(e) => { e.stopPropagation(); setExpandedHistory(expandedHistory === s.id ? null : s.id); }}
                  >
                    {history.length} placement{history.length === 1 ? "" : "s"}
                  </button>
                  {expandedHistory === s.id && (
                    <ul className="station-detail-sibling-list">
                      {history.map((p) => (
                        <li key={p.id}>
                          {p.artworkId} — {p.placementState} (layer {p.layerIndex}, started {new Date(p.startedAt).toLocaleTimeString()}
                          {p.endedAt ? `, ended ${new Date(p.endedAt).toLocaleTimeString()}` : ""})
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td>
                  <button className="station-detail-sibling-link" onClick={(e) => { e.stopPropagation(); placeSeedArtwork(s.id); }}>
                    {active ? "Cover with seed artwork" : "Place seed artwork"}
                  </button>
                  {active && (
                    <button className="station-detail-sibling-link" onClick={(e) => { e.stopPropagation(); retire(active.id, s.id); }}>
                      Retire
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function MapsRollingStockDetail({ logicalTrainId, onBack }: Props) {
  const [{ train, consist, cars, position }, setSnapshot] = useState<Snapshot>(() => readSnapshot(logicalTrainId));

  function refresh() {
    setSnapshot(readSnapshot(logicalTrainId));
  }

  useEffect(() => {
    const unsubscribe = bridge.subscribe(refresh);
    const interval = window.setInterval(refresh, 5000);
    return () => { unsubscribe(); window.clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logicalTrainId]);

  if (!train) {
    return (
      <div className="md-root">
        <CollectionDetailBar collectionLabel="Rolling Stock" onBackToCollection={onBack} />
        <div className="pg-empty"><div className="pg-empty-msg">Logical train not found (it may have ended and aged out of the active set).</div></div>
      </div>
    );
  }

  return (
    <div className="md-root">
      <CollectionDetailBar collectionLabel="Rolling Stock" onBackToCollection={onBack} />
      <div className="station-detail">
        <h2 className="station-detail-title">{train.id} · {train.routeId.replace("subway:route:", "")}</h2>

        <div className="station-detail-section">
          <div className="station-detail-section-label">Logical Train Identity</div>
          <dl className="station-detail-fields">
            <dt>Route</dt><dd>{train.routeId.replace("subway:route:", "")} ({train.routeFamily ?? "—"})</dd>
            <dt>Active trip</dt><dd className="geo-row-hex">{train.activeTripId ? train.activeTripId.replace("subway:trip:", "") : "—"}</dd>
            <dt>Lifecycle state</dt><dd>{train.lifecycleState}</dd>
            <dt>Consist</dt><dd className="geo-row-hex">{train.consistId} ({consist?.configuredCarCount ?? cars.length} cars)</dd>
            <dt>Position</dt>
            <dd>
              {position ? `${position.truthState}${position.observedStopId ? ` · from ${position.observedStopId.replace("subway:stop:", "")}` : ""}${position.nextStopId ? ` · to ${position.nextStopId.replace("subway:stop:", "")}` : ""}` : "unknown"}
            </dd>
          </dl>
        </div>

        <div className="station-detail-section">
          <div className="station-detail-section-label">Cars → Surfaces → Active Placement → History</div>
          {cars.map((car) => <CarSurfaceRow key={car.id} car={car} />)}
        </div>
      </div>
    </div>
  );
}
