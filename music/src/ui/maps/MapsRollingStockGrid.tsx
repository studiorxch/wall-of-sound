import { useEffect, useState } from "react";
import * as bridge from "../../maps/wallRollingStockAdminBridge";
import type { LogicalTrain } from "../../data/subwayRollingStockAdminTypes";

type Props = {
  onOpen: (logicalTrainId: string) => void;
};

type LoadState = "authority_unavailable" | "loading" | "ready";

type Snapshot = {
  loadState: LoadState;
  trains: LogicalTrain[];
};

function readSnapshot(): Snapshot {
  if (!bridge.isBridgeAvailable()) return { loadState: "authority_unavailable", trains: [] };
  const list = bridge.listActiveTrains();
  const trains = list.ok ? list.data : [];
  return { loadState: trains.length > 0 ? "ready" : "loading", trains };
}

// Development/admin inspection surface (BUILD §24-25) — a live view of
// currently active StudioRich logical trains, one row per real MTA trip
// this origin's own poll has resolved. Not a creative-content library like
// Stations/Orbs: this is diagnostic/dev-oriented, per the governing BUILD's
// own explicit "may be development/admin-oriented" allowance.
export function MapsRollingStockGrid({ onOpen }: Props) {
  const [{ loadState, trains }, setState] = useState<Snapshot>(readSnapshot);
  const [query, setQuery] = useState("");

  function refresh() {
    setState(readSnapshot());
  }

  useEffect(() => {
    if (!bridge.isBridgeAvailable()) return;
    bridge.ensureLiveTracking().then(refresh);
    const unsubscribe = bridge.subscribe(refresh);
    const interval = window.setInterval(() => { bridge.reconcile(); refresh(); }, 5000);
    return () => { unsubscribe(); window.clearInterval(interval); };
  }, []);

  if (loadState === "authority_unavailable") {
    return (
      <div className="pg-empty">
        <div className="pg-empty-msg">Rolling Stock is unavailable — Wall's runtime could not be reached.</div>
      </div>
    );
  }
  if (loadState === "loading") {
    return (
      <div className="pg-empty">
        <div className="pg-empty-msg">Connecting to the live MTA feed and resolving active logical trains…</div>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? trains.filter((t) => {
        const route = t.routeId.replace("subway:route:", "").toLowerCase();
        return route.includes(q) || t.id.toLowerCase().includes(q) || t.lifecycleState.toLowerCase().includes(q);
      })
    : trains;

  const sorted = [...filtered].sort((a, b) => a.routeId.localeCompare(b.routeId) || a.id.localeCompare(b.id));

  return (
    <div className="md-root">
      <div className="stations-toolbar">
        <span className="stations-title">Rolling Stock</span>
        <span className="stations-count">{trains.length} active logical trains</span>
        <input
          className="cat-filter-search"
          placeholder="Search by route, train ID, or state…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {sorted.length === 0 ? (
        <div className="pg-empty"><div className="pg-empty-msg">No active logical trains match your search.</div></div>
      ) : (
        <div className="geo-rows-scroll">
          <table className="geo-rows-table">
            <thead>
              <tr>
                <th>Train</th>
                <th>Route</th>
                <th>State</th>
                <th>Active Trip</th>
                <th>Consist</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((t) => (
                <tr key={t.id} className="geo-row" onClick={() => onOpen(t.id)}>
                  <td className="geo-row-hex">{t.id}</td>
                  <td>{t.routeId.replace("subway:route:", "")}</td>
                  <td>{t.lifecycleState}</td>
                  <td className="geo-row-hex">{t.activeTripId ? t.activeTripId.replace("subway:trip:", "") : <span className="geo-row-cell-empty">—</span>}</td>
                  <td className="geo-row-hex">{t.consistId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
