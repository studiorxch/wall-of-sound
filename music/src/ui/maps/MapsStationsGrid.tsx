import { useEffect, useState } from "react";
import * as wallStationLibraryBridge from "../../maps/wallStationLibraryBridge";
import type { StationLibraryRecord } from "../../data/subwayStationLibraryTypes";

type Props = {
  onOpen: (studioRichStationId: string) => void;
};

type LoadState = "authority_unavailable" | "importing" | "ready";

type Snapshot = {
  loadState: LoadState;
  stations: StationLibraryRecord[];
  duplicateNameSet: Set<string>;
};

function readSnapshot(): Snapshot {
  if (!wallStationLibraryBridge.isBridgeAvailable()) {
    return { loadState: "authority_unavailable", stations: [], duplicateNameSet: new Set() };
  }
  const list = wallStationLibraryBridge.listStations();
  const dupGroups = wallStationLibraryBridge.getDuplicateNameGroups();
  const duplicateNameSet = new Set(dupGroups.ok ? dupGroups.data.map((g) => g.displayName) : []);
  const stations = list.ok ? list.data : [];
  return {
    loadState: stations.length > 0 ? "ready" : "importing",
    stations,
    duplicateNameSet,
  };
}

// Station Library's list surface — a plain sortable/searchable table (reused
// verbatim from Geographic's .geo-rows-table styling), not a card gallery:
// ~500 real stations is table-shaped data, not gallery-shaped data.
export function MapsStationsGrid({ onOpen }: Props) {
  const [{ loadState, stations, duplicateNameSet }, setState] = useState<Snapshot>(readSnapshot);
  const [query, setQuery] = useState("");

  function refresh() {
    setState(readSnapshot());
  }

  useEffect(() => {
    if (!wallStationLibraryBridge.isBridgeAvailable()) return;
    wallStationLibraryBridge.ensureStationsImported().then(refresh);
    const unsubscribe = wallStationLibraryBridge.subscribe(refresh);
    return () => unsubscribe();
  }, []);

  if (loadState === "authority_unavailable") {
    return (
      <div className="pg-empty">
        <div className="pg-empty-msg">MAPS Stations library is unavailable — Wall's runtime could not be reached.</div>
      </div>
    );
  }
  if (loadState === "importing") {
    return (
      <div className="pg-empty">
        <div className="pg-empty-msg">Importing stations from the normalized MTA model…</div>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? stations.filter((s) => {
        const name = (s.operational.displayName ?? "").toLowerCase();
        const borough = (s.operational.borough ?? "").toLowerCase();
        const stopId = (s.authoritativeLink.gtfsStopId ?? "").toLowerCase();
        return name.includes(q) || borough.includes(q) || stopId.includes(q);
      })
    : stations;

  const sorted = [...filtered].sort((a, b) =>
    (a.operational.displayName ?? "").localeCompare(b.operational.displayName ?? "")
  );

  return (
    <div className="md-root">
      <div className="stations-toolbar">
        <span className="stations-title">Stations</span>
        <span className="stations-count">{stations.length} stations</span>
        <input
          className="cat-filter-search"
          placeholder="Search by name, borough, or stop ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {sorted.length === 0 ? (
        <div className="pg-empty"><div className="pg-empty-msg">No stations match your search.</div></div>
      ) : (
        <div className="geo-rows-scroll">
          <table className="geo-rows-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Borough</th>
                <th>Routes</th>
                <th>Stop ID</th>
                <th>Complex</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s) => {
                const isDuplicateName = !!s.operational.displayName && duplicateNameSet.has(s.operational.displayName);
                return (
                  <tr key={s.studioRichStationId} className="geo-row" onClick={() => onOpen(s.studioRichStationId)}>
                    <td className="geo-row-name">
                      {s.operational.displayName ?? "—"}
                      {isDuplicateName && (
                        <span className="stations-dup-badge" title="Another station shares this display name — see the record's identity for the distinguishing stop/complex ID">
                          also elsewhere
                        </span>
                      )}
                    </td>
                    <td>{s.operational.borough ?? "—"}</td>
                    <td>{s.operational.routeIds.length ? s.operational.routeIds.join(" ") : <span className="geo-row-cell-empty">—</span>}</td>
                    <td className="geo-row-hex">{s.authoritativeLink.gtfsStopId ?? "—"}</td>
                    <td>{s.operational.complexIsMultiStation ? `complex (${s.operational.complexMemberStopIds.length})` : <span className="geo-row-cell-empty">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
