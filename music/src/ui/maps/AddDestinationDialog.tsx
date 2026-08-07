import { useState } from "react";
import { Icon } from "../Icon";
import { geocode, getMapboxToken } from "../../logic/maps/itineraryRouting";
import type { GeocodeResult, GeocodeFailureReason } from "../../logic/maps/itineraryRouting";

const FAILURE_MESSAGES: Record<GeocodeFailureReason, string> = {
  no_token: "Map connection isn't ready yet — wait a moment for Wall's runtime to connect and try again.",
  network_error: "Couldn't reach the geocoding service — check your connection and try again.",
  http_error: "The geocoding service returned an error — try again in a moment.",
  no_match: "No match found for that address/place.",
};

// 0729E_MAPS_Itinerary_Collections_Foundation — "+ Add Destination" per the
// mockup: a single search field. Reuses the real Mapbox Geocoding call
// (itineraryRouting.geocode) — no fabricated place data. Real token is read
// once here (getMapboxToken()) and passed down; the routing module itself
// stays DOM-free/testable (see itineraryRouting.ts).

type Props = {
  onAdd: (result: GeocodeResult) => void;
  onClose: () => void;
};

export function AddDestinationDialog({ onAdd, onClose }: Props) {
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

  return (
    <div className="export-modal-overlay" onClick={onClose}>
      <div className="export-modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="export-modal-header">
          <span>Add Destination</span>
          <button className="export-modal-close" onClick={onClose}><Icon name="close" /></button>
        </div>
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
        <div className="export-modal-footer">
          <button className="tb-btn" onClick={onClose}>Cancel</button>
          <button className="tb-btn" disabled={searching || !query.trim()} onClick={handleSearch}>
            {searching ? "Searching…" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
