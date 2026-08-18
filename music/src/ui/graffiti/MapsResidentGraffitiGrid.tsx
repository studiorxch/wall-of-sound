import { useEffect, useState } from "react";
import * as bridge from "../../maps/wallResidentGraffitiBridge";
import type { ResidentGraffitiArtist } from "../../data/subwayResidentGraffitiTypes";

type Props = {
  onOpen: (residentId: string) => void;
};

type LoadState = "authority_unavailable" | "ready";

type Snapshot = {
  loadState: LoadState;
  residents: ResidentGraffitiArtist[];
};

function readSnapshot(): Snapshot {
  if (!bridge.isBridgeAvailable()) return { loadState: "authority_unavailable", residents: [] };
  bridge.ensureResidentsSeeded();
  const list = bridge.listResidents();
  return { loadState: "ready", residents: list.ok ? list.data : [] };
}

// Primary tools are a style-profile property (the resident's real tool
// preference), not something derived from artwork history — a resident with
// zero artworks created so far still has a real, inspectable tool set.
function toolsForResident(r: ResidentGraffitiArtist): string {
  const style = bridge.getStyleProfile(r.styleProfileId);
  return style.ok ? style.data.preferredTools.join(", ") : "—";
}

// BUILD §29-30 — "MAPS → Residents → Graffiti Artists". Grid of the seeded
// Machine Life Residents: tag/display name, resident ID, status, preferred
// routes, primary tools, artworks created, active placements.
export function MapsResidentGraffitiGrid({ onOpen }: Props) {
  const [{ loadState, residents }, setState] = useState<Snapshot>(readSnapshot);
  const [query, setQuery] = useState("");

  function refresh() {
    setState(readSnapshot());
  }

  useEffect(() => {
    if (!bridge.isBridgeAvailable()) return;
    const unsubscribe = bridge.subscribe(refresh);
    return unsubscribe;
  }, []);

  if (loadState === "authority_unavailable") {
    return (
      <div className="pg-empty">
        <div className="pg-empty-msg">Resident Graffiti Artists is unavailable — Wall's runtime could not be reached.</div>
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const filtered = q
    ? residents.filter((r) => {
        const routes = [...r.preferredRoutes, ...r.preferredRouteFamilies].join(" ").toLowerCase();
        return r.tagName.toLowerCase().includes(q) || r.displayName.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || routes.includes(q);
      })
    : residents;

  const sorted = [...filtered].sort((a, b) => a.tagName.localeCompare(b.tagName));

  return (
    <div className="md-root">
      <div className="stations-toolbar">
        <span className="stations-title">Graffiti Artists</span>
        <span className="stations-count">{residents.length} residents</span>
        <input
          className="cat-filter-search"
          placeholder="Search by tag, name, ID, or route…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {sorted.length === 0 ? (
        <div className="pg-empty"><div className="pg-empty-msg">No residents match your search.</div></div>
      ) : (
        <div className="geo-rows-scroll">
          <table className="geo-rows-table">
            <thead>
              <tr>
                <th>Tag</th>
                <th>Resident</th>
                <th>Status</th>
                <th>Routes</th>
                <th>Tools</th>
                <th>Artworks</th>
                <th>Active Placements</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="geo-row" onClick={() => onOpen(r.id)}>
                  <td>{r.tagName}</td>
                  <td className="geo-row-hex">{r.id}</td>
                  <td>{r.status}</td>
                  <td>{[...r.preferredRoutes.map((x) => x.replace("subway:route:", "")), ...r.preferredRouteFamilies].join(", ") || <span className="geo-row-cell-empty">any</span>}</td>
                  <td>{toolsForResident(r)}</td>
                  <td>{r.artworkHistory.length}</td>
                  <td>{r.placementHistory.filter((p) => p.endedAt == null).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
