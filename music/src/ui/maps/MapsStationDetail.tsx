import { useEffect, useState } from "react";
import { CollectionDetailBar } from "../CollectionDetailBar";
import * as wallStationLibraryBridge from "../../maps/wallStationLibraryBridge";
import type { StationLibraryRecord } from "../../data/subwayStationLibraryTypes";

type Props = {
  studioRichStationId: string;
  onBack: () => void;
  onOpenStation: (studioRichStationId: string) => void;
};

type Snapshot = {
  station: StationLibraryRecord | null;
  siblings: StationLibraryRecord[]; // other records sharing the same display name
};

function readSnapshot(id: string): Snapshot {
  const result = wallStationLibraryBridge.getStation(id);
  const station = result.ok ? result.data : null;
  let siblings: StationLibraryRecord[] = [];
  if (station?.operational.displayName) {
    const groups = wallStationLibraryBridge.getDuplicateNameGroups();
    const group = groups.ok ? groups.data.find((g) => g.displayName === station.operational.displayName) : undefined;
    siblings = group ? group.records.filter((r) => r.studioRichStationId !== id) : [];
  }
  return { station, siblings };
}

// The parent (MapsSection) mounts this with key={studioRichStationId}, so a
// station switch is a fresh mount — same convention as MapsGeographicStyleDetail.
export function MapsStationDetail({ studioRichStationId, onBack, onOpenStation }: Props) {
  const [{ station, siblings }, setSnapshot] = useState<Snapshot>(() => readSnapshot(studioRichStationId));
  const [notesDraft, setNotesDraft] = useState<string>(() => station?.studioRich.notes ?? "");

  function refresh() {
    setSnapshot(readSnapshot(studioRichStationId));
  }

  useEffect(() => {
    const unsubscribe = wallStationLibraryBridge.subscribe(refresh);
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studioRichStationId]);

  function saveNotes() {
    wallStationLibraryBridge.updateStudioRichMetadata(studioRichStationId, { notes: notesDraft.trim() || null });
  }

  if (!station) {
    return (
      <div className="md-root">
        <CollectionDetailBar collectionLabel="Stations" onBackToCollection={onBack} />
        <div className="pg-empty"><div className="pg-empty-msg">Station not found.</div></div>
      </div>
    );
  }

  const op = station.operational;
  const link = station.authoritativeLink;

  return (
    <div className="md-root">
      <CollectionDetailBar collectionLabel="Stations" onBackToCollection={onBack} />
      <div className="station-detail">
        <h2 className="station-detail-title">{op.displayName ?? "(unnamed station)"}</h2>

        {siblings.length > 0 && (
          <div className="station-detail-section station-detail-dup-notice">
            <div className="station-detail-section-label">Duplicate display name</div>
            <p>
              {siblings.length} other station{siblings.length > 1 ? "s" : ""} also display{siblings.length === 1 ? "s" : ""} as
              "{op.displayName}". Each is a distinct, uniquely-addressable record:
            </p>
            <ul className="station-detail-sibling-list">
              {siblings.map((s) => (
                <li key={s.studioRichStationId}>
                  <button className="station-detail-sibling-link" onClick={() => onOpenStation(s.studioRichStationId)}>
                    {s.operational.borough ?? "?"} · stop {s.authoritativeLink.gtfsStopId ?? "—"} · {s.studioRichStationId}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="station-detail-section">
          <div className="station-detail-section-label">StudioRich Identity</div>
          <dl className="station-detail-fields">
            <dt>StudioRich Station ID</dt><dd className="geo-row-hex">{station.studioRichStationId}</dd>
            <dt>Created</dt><dd>{new Date(station.createdAt).toLocaleString()}</dd>
            <dt>Last refreshed from MTA</dt><dd>{new Date(station.lastRefreshedAt).toLocaleString()}</dd>
          </dl>
        </div>

        <div className="station-detail-section">
          <div className="station-detail-section-label">Authoritative MTA Link</div>
          <dl className="station-detail-fields">
            <dt>GTFS Stop ID</dt><dd className="geo-row-hex">{link.gtfsStopId ?? "—"}</dd>
            <dt>Complex ID</dt><dd className="geo-row-hex">{link.complexId ?? "—"}</dd>
            <dt>Link confidence</dt><dd>{link.linkConfidence}</dd>
            {link.migratedFrom && <><dt>Migrated from</dt><dd className="geo-row-hex">{link.migratedFrom}</dd></>}
          </dl>
        </div>

        <div className="station-detail-section">
          <div className="station-detail-section-label">Operational (MTA-sourced — refreshable)</div>
          <dl className="station-detail-fields">
            <dt>Coordinates</dt><dd>{op.latitude.toFixed(6)}, {op.longitude.toFixed(6)}</dd>
            <dt>Borough</dt><dd>{op.borough ?? "—"}</dd>
            <dt>Neighborhood</dt><dd>{op.neighborhood ?? <span className="geo-row-cell-empty">not supplied by current MTA source</span>}</dd>
            <dt>Routes</dt><dd>{op.routeIds.length ? op.routeIds.join(" ") : "—"}</dd>
            <dt>Station complex</dt>
            <dd>{op.complexIsMultiStation ? `Yes — ${op.complexMemberStopIds.length} member stops (${op.complexMemberStopIds.join(", ")})` : "No (single-station complex)"}</dd>
          </dl>
        </div>

        <div className="station-detail-section">
          <div className="station-detail-section-label">StudioRich Notes (persistent — survives MTA refresh)</div>
          <textarea
            className="station-detail-notes"
            value={notesDraft}
            onChange={(e) => setNotesDraft(e.target.value)}
            onBlur={saveNotes}
            placeholder="Add a StudioRich-authored note for this station…"
            rows={3}
          />
        </div>
      </div>
    </div>
  );
}
