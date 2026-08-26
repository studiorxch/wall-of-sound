import { useEffect, useState } from "react";
import { Icon } from "../Icon";
import { geocode, getMapboxToken } from "../../logic/maps/itineraryRouting";
import type { GeocodeResult, GeocodeFailureReason } from "../../logic/maps/itineraryRouting";
import { findNearestStationPreview, searchStations, isBridgeAvailable } from "../../maps/wallSubwayItineraryBridge";
import type { NearestStationPreview } from "../../maps/wallSubwayItineraryBridge";
import { pickPointOnMap, cancelPickPointOnMap } from "../../maps/wallMapPreview";
import type { TransitStationRef } from "../../data/itineraryTypes";

const FAILURE_MESSAGES: Record<GeocodeFailureReason, string> = {
  no_token: "Map connection isn't ready yet — wait a moment for Wall's runtime to connect and try again.",
  network_error: "Couldn't reach the geocoding service — check your connection and try again.",
  http_error: "The geocoding service returned an error — try again in a moment.",
  no_match: "No match found for that address/place.",
};

// 0729E_MAPS_Itinerary_Collections_Foundation — "+ Add Destination" per the
// mockup: a single search field.
//
// 0819_SUBWAY_Itinerary_Execution_Map_Authoring — text geocoding alone
// repeatedly resolved ambiguous station names/addresses to the wrong real
// point during live testing (see the governing report's STATION RESOLUTION
// section) — three real ways to add a stop now exist side by side: Search
// (unchanged, real Mapbox Geocoding), Select Station (station-first — the
// canonical station's own real coordinates, never re-geocoded from its
// name), and Pick on Map (a real click on the existing preview canvas,
// previewed against the nearest real subway station before committing).

type Mode = "search" | "station" | "map";

// 0821_SUBWAY_Boarding_UX — Select Station is explicit transit-authoring
// intent; Search/Pick on Map retain their existing default (undefined ->
// caller's own default, unchanged). Passed as a second argument rather than
// folded into GeocodeResult, which stays a plain geocoding shape shared with
// the unrelated Search mode.
type Props = {
  onAdd: (result: GeocodeResult, sourceMode?: "transit") => void;
  onClose: () => void;
};

export function AddDestinationDialog({ onAdd, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("search");

  // ── Search mode (unchanged) ──
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSearch() {
    if (!query.trim()) return;
    setSearching(true);
    setError(null);
    const result = await geocode(query, getMapboxToken());
    setSearching(false);
    if (!result.ok) {
      setError(FAILURE_MESSAGES[result.reason]);
      return;
    }
    onAdd(result.data);
  }

  // ── Select Station mode ──
  const [stationQuery, setStationQuery] = useState("");
  const [stationResults, setStationResults] = useState<TransitStationRef[]>([]);
  const [stationSearching, setStationSearching] = useState(false);

  useEffect(() => {
    if (mode !== "station") return;
    let cancelled = false;
    setStationSearching(true);
    searchStations(stationQuery).then((results) => {
      if (!cancelled) { setStationResults(results); setStationSearching(false); }
    });
    return () => { cancelled = true; };
  }, [mode, stationQuery]);

  function handleAddStation(station: TransitStationRef) {
    // Station-first: the station's own canonical coordinates, directly —
    // never geocoded from its name back into arbitrary street coordinates.
    // Explicit transit-authoring intent (0821_SUBWAY_Boarding_UX §5) — the
    // new leg this stop forms should default to Transit, not DRIVE.
    onAdd({ name: station.name, longitude: station.longitude, latitude: station.latitude }, "transit");
  }

  // ── Pick on Map mode ──
  const [picking, setPicking] = useState(false);
  const [pickedPoint, setPickedPoint] = useState<{ longitude: number; latitude: number } | null>(null);
  const [nearestPreview, setNearestPreview] = useState<NearestStationPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    return () => { if (picking) cancelPickPointOnMap(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleStartPicking() {
    setPickedPoint(null);
    setNearestPreview(null);
    setPicking(true);
    const point = await pickPointOnMap();
    setPicking(false);
    if (!point) return;
    setPickedPoint(point);
    setPreviewLoading(true);
    const preview = await findNearestStationPreview(point.longitude, point.latitude);
    setPreviewLoading(false);
    setNearestPreview(preview);
  }

  function handleAddPickedPoint() {
    if (!pickedPoint) return;
    onAdd({
      name: nearestPreview ? nearestPreview.station.name : `${pickedPoint.latitude.toFixed(5)}, ${pickedPoint.longitude.toFixed(5)}`,
      longitude: pickedPoint.longitude,
      latitude: pickedPoint.latitude,
    });
  }

  // While actively picking, the real modal overlay would block clicks on
  // the map underneath it — hide the modal and show only a small,
  // non-blocking hint instead until the click lands.
  if (picking) {
    return (
      <div className="add-dest-picking-hint">
        <span>Click a point on the map…</span>
        <button className="tb-btn sm" onClick={() => { cancelPickPointOnMap(); setPicking(false); }}>Cancel</button>
      </div>
    );
  }

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="export-modal-header">
          <span>Add Destination</span>
          <button className="export-modal-close" onClick={onClose}><Icon name="close" /></button>
        </div>

        <div className="add-dest-mode-tabs">
          <button className={`add-dest-mode-tab${mode === "search" ? " add-dest-mode-tab--active" : ""}`} onClick={() => setMode("search")}>Search Place/Address</button>
          <button className={`add-dest-mode-tab${mode === "station" ? " add-dest-mode-tab--active" : ""}`} onClick={() => setMode("station")} disabled={!isBridgeAvailable()} title={!isBridgeAvailable() ? "Live map data unavailable" : undefined}>Select Station</button>
          <button className={`add-dest-mode-tab${mode === "map" ? " add-dest-mode-tab--active" : ""}`} onClick={() => setMode("map")}>Pick on Map</button>
        </div>

        {mode === "search" && (
          <div style={{ padding: "14px 16px" }}>
            <input
              className="cat-filter-search"
              style={{ width: "100%" }}
              placeholder="Address, place, or city…"
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
            />
            {error && <div style={{ color: "var(--danger, #e05a4a)", fontSize: 12, marginTop: 8 }}>{error}</div>}
          </div>
        )}

        {mode === "station" && (
          <div style={{ padding: "14px 16px" }}>
            <input
              className="cat-filter-search"
              style={{ width: "100%" }}
              placeholder="Station name (e.g. 59 St, Atlantic Av)…"
              value={stationQuery}
              autoFocus
              onChange={(e) => setStationQuery(e.target.value)}
            />
            <div className="add-dest-station-results">
              {stationSearching && <div className="add-dest-station-hint">Searching…</div>}
              {!stationSearching && stationQuery.trim().length >= 2 && stationResults.length === 0 && (
                <div className="add-dest-station-hint">No stations match "{stationQuery}"</div>
              )}
              {stationResults.map((s) => (
                <button key={s.id} className="add-dest-station-row" onClick={() => handleAddStation(s)}>
                  <Icon name="subway" />
                  <span className="add-dest-station-row-name">{s.name}</span>
                  {!!s.routeLabels?.length && (
                    <span className="add-dest-station-row-badges">
                      {s.routeLabels.map((label) => (
                        <span key={label} className="add-dest-station-row-badge">{label}</span>
                      ))}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === "map" && (
          <div style={{ padding: "14px 16px" }}>
            {!pickedPoint && (
              <button className="tb-btn" onClick={handleStartPicking}>Click to choose a point on the map</button>
            )}
            {pickedPoint && (
              <div className="add-dest-map-preview">
                <div className="add-dest-map-preview-label">Selected location</div>
                <div className="add-dest-map-preview-coords">{pickedPoint.latitude.toFixed(5)}, {pickedPoint.longitude.toFixed(5)}</div>
                {previewLoading && <div className="add-dest-station-hint">Checking nearby subway stations…</div>}
                {!previewLoading && nearestPreview && (
                  <div className="add-dest-map-nearest">
                    <div className="add-dest-map-preview-label">Nearest subway ({nearestPreview.distanceMeters}m)</div>
                    <div className="add-dest-map-nearest-name">
                      <Icon name="subway" /> {nearestPreview.station.name}
                      {nearestPreview.routeLabels.length > 0 && <span className="add-dest-map-nearest-routes"> · {nearestPreview.routeLabels.join(" / ")}</span>}
                    </div>
                  </div>
                )}
                {!previewLoading && !nearestPreview && (
                  <div className="add-dest-station-hint">No subway station nearby — this stop will need a different mode.</div>
                )}
                <button className="tb-btn sm" onClick={handleStartPicking}>Pick a different point</button>
              </div>
            )}
          </div>
        )}

        <div className="export-modal-footer">
          <button className="tb-btn" onClick={onClose}>Cancel</button>
          {mode === "search" && (
            <button className="tb-btn" disabled={searching || !query.trim()} onClick={handleSearch}>
              {searching ? "Searching…" : "Add"}
            </button>
          )}
          {mode === "map" && (
            <button className="tb-btn" disabled={!pickedPoint} onClick={handleAddPickedPoint}>Add as Destination</button>
          )}
        </div>
      </div>
    </div>
  );
}
