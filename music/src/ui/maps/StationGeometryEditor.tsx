// ── StationGeometryEditor.tsx — Bay Ridge Av Station Editor V0 ───────────────
// 0908_WOS_Subway_Bay_Ridge_Av_Station_Geometry — Editor V0 checkpoint.
//
// 2D station-local-meter plan view + numeric inspector for authoring the two
// side-platform footprints only. V0 is deliberately single-station
// (Bay Ridge Av / R42) and self-contained — no navigation wiring into the
// existing MapsSection "stations" library (that library is keyed by a
// different, unrelated StudioRich station identity; coupling this V0 editor
// to it would be new, unauthorized architectural coupling). Reached instead
// via its own isolated #stationGeometryEditor hash route in App.tsx.
//
// Plan-view coordinate mapping: local +X (along-track) -> screen right,
// local +Y (left-of-travel) -> screen UP (screenY = -localY), i.e. a
// top-down "north-up-like" reading convention. This is a display-only
// convention; it has no bearing on the underlying station-local coordinate
// convention itself (see stationGeometryCoordinates.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  LocalPoint2D,
  Provenance,
  StationGeometryData,
  StationPlatform,
} from "../../data/stationGeometryTypes";
import { makeStationGeometryId } from "../../data/stationGeometryTypes";
import {
  buildBayRidgeAvStationGeometrySeed,
  buildBayRidgeAvTrackAlignmentGuides,
} from "../../logic/maps/stationGeometryBayRidgeAvSeed";
import {
  addFootprintVertex,
  clearFootprint,
  moveFootprintVertex,
  removeFootprintVertex,
  roundLocalPoint,
} from "../../logic/maps/stationGeometryEditGeometry";
import {
  isPlausibleStationGeometryData,
  loadStationGeometryFromDB,
  saveStationGeometryToDB,
} from "../../data/stationGeometryStore";
import { downloadFile } from "../../data/exportPlaylist";
import {
  DEFAULT_UG_SIDE_2TRACK_PARAMETERS,
  UG_SIDE_2TRACK_ARCHETYPE_ID,
  type UndergroundSide2TrackParameters,
} from "../../data/stationArchetypeTypes";
import { deriveUndergroundSide2TrackGeometry } from "../../logic/maps/stationArchetypeUndergroundSide2Track";

type SelectedVertex = { platformId: string; index: number };
type StationSource = "bayRidge" | "temporary";

const TEMPORARY_STATION_GTFS_STOP_ID = "TEMP";

const ARCHETYPE_PARAMETER_FIELDS: Array<{ key: keyof UndergroundSide2TrackParameters; label: string }> = [
  { key: "platformLengthM", label: "Platform length (m)" },
  { key: "northboundPlatformWidthM", label: "Northbound width (m)" },
  { key: "southboundPlatformWidthM", label: "Southbound width (m)" },
  { key: "trackCenterSpacingM", label: "Track center spacing (m)" },
  { key: "platformEdgeToTrackCenterM", label: "Edge-to-track distance (m)" },
  { key: "platformElevationM", label: "Platform elevation (m)" },
  { key: "mezzanineElevationM", label: "Mezzanine elevation (m)" },
  { key: "mezzanineLengthM", label: "Mezzanine length (m)" },
  { key: "mezzanineWidthM", label: "Mezzanine width (m)" },
];

/** A bare, empty StationGeometryData shell — no archetype applied yet. Never touches Bay Ridge Av's own id/record. */
function createEmptyTemporaryStation(): StationGeometryData {
  const now = new Date().toISOString();
  return {
    id: makeStationGeometryId(TEMPORARY_STATION_GTFS_STOP_ID),
    stationRef: { gtfsStopId: TEMPORARY_STATION_GTFS_STOP_ID, routeIds: [] },
    version: 1,
    createdAt: now,
    updatedAt: now,
    origin: {
      longitude: 0,
      latitude: 0,
      altitudeM: 0,
      orientationDeg: 0,
      provenance: { source: "unknown", note: "Placeholder temporary station — not a real geographic location." },
    },
    levels: [],
    platforms: [],
    trackCenterlines: [],
    connections: [],
    platformLinks: [],
    evidenceConflicts: [],
    entrances: [],
    wallSurfaces: [],
  };
}

const VIEW_MIN_X = -30;
const VIEW_MIN_Y = -35;
const VIEW_W = 260;
const VIEW_H = 70;

function toScreen(p: LocalPoint2D): { x: number; y: number } {
  return { x: p.x, y: -p.y };
}

function clientPointToLocal(svg: SVGSVGElement, clientX: number, clientY: number): LocalPoint2D {
  const pt = svg.createSVGPoint();
  pt.x = clientX;
  pt.y = clientY;
  const ctm = svg.getScreenCTM();
  if (!ctm) return { x: 0, y: 0 };
  const local = pt.matrixTransform(ctm.inverse());
  return { x: local.x, y: -local.y };
}

function provenanceBadgeClass(source: Provenance["source"]): string {
  return `sge-prov-badge sge-prov-badge--${source}`;
}

function ProvenanceRow({ label, provenance }: { label: string; provenance: Provenance }) {
  return (
    <div className="sge-prov-row">
      <span className="sge-prov-label">{label}</span>
      <span className={provenanceBadgeClass(provenance.source)}>{provenance.source}</span>
      {typeof provenance.confidence === "number" && (
        <span className="sge-prov-confidence">{Math.round(provenance.confidence * 100)}%</span>
      )}
      {provenance.note && <span className="sge-prov-note">{provenance.note}</span>}
    </div>
  );
}

export function StationGeometryEditor({ onBack }: { onBack?: () => void }) {
  const [geometry, setGeometry] = useState<StationGeometryData>(() => buildBayRidgeAvStationGeometrySeed());
  const [dbLoaded, setDbLoaded] = useState(false);
  const [drawingPlatformId, setDrawingPlatformId] = useState<string | null>(null);
  const [selectedVertex, setSelectedVertex] = useState<SelectedVertex | null>(null);
  const [draggingVertex, setDraggingVertex] = useState<SelectedVertex | null>(null);
  const [importText, setImportText] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // ── Archetype Editor Integration V0 ─────────────────────────────────────
  // stationSource distinguishes Bay Ridge Av (always the real canonical
  // record, never archetype-derived, never frozen/converted) from a
  // separate, in-memory-only temporary station a user creates to try the
  // UG_SIDE_2TRACK archetype. Switching sources REPLACES `geometry` wholesale
  // — Bay Ridge's own object/DB record is never mutated by anything below.
  const [stationSource, setStationSource] = useState<StationSource>("bayRidge");
  const [archetypeParams, setArchetypeParams] = useState<UndergroundSide2TrackParameters>(
    DEFAULT_UG_SIDE_2TRACK_PARAMETERS,
  );
  // Frozen = "converted to custom geometry": parameter edits stop
  // auto-regenerating, and manual vertex editing becomes allowed. Re-derived
  // on load from the data itself (see the mount effect) so a reload never
  // forgets a prior freeze and silently re-arms auto-regeneration.
  const [isFrozen, setIsFrozen] = useState(false);

  const alignmentGuides = useMemo(() => buildBayRidgeAvTrackAlignmentGuides(), []);
  const bayRidgeId = useMemo(() => buildBayRidgeAvStationGeometrySeed().id, []);

  // A temporary station counts as "custom/frozen" once every platform is
  // marked authored (see handleFreeze) — re-derived from the data itself
  // rather than trusted from a separate flag, so a reload/import never
  // forgets a prior freeze and silently re-arms auto-regeneration.
  function inferIsFrozenFromGeometry(g: StationGeometryData): boolean {
    return g.platforms.length > 0 && g.platforms.every((p) => p.provenance.source === "authored");
  }

  function applyLoadedGeometry(loaded: StationGeometryData) {
    setGeometry(loaded);
    const isBayRidge = loaded.id === bayRidgeId;
    setStationSource(isBayRidge ? "bayRidge" : "temporary");
    setIsFrozen(isBayRidge ? false : inferIsFrozenFromGeometry(loaded));
    setSelectedVertex(null);
    setDrawingPlatformId(null);
  }

  // Load-on-mount: prefer a previously-saved record over the built-in seed,
  // so a reload genuinely reflects what was last saved. Always loads Bay
  // Ridge Av's own id on mount — a temporary station is only ever created
  // explicitly, in-session, via handleNewTemporaryStation below.
  useEffect(() => {
    let cancelled = false;
    loadStationGeometryFromDB(bayRidgeId)
      .then((saved) => {
        if (!cancelled && saved) applyLoadedGeometry(saved);
      })
      .catch((err) => {
        if (!cancelled) setStatusMessage(`Load failed: ${err instanceof Error ? err.message : String(err)}`);
      })
      .finally(() => {
        if (!cancelled) setDbLoaded(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const platforms = geometry.platforms;
  // Bay Ridge Av's real geometry is always manually editable, exactly as
  // before this checkpoint. A temporary archetype station only becomes
  // manually editable once explicitly frozen — editing raw, un-frozen
  // archetype-derived geometry would leave stale "heuristic" provenance on
  // data that's actually now hand-authored.
  const canManuallyEdit = stationSource === "bayRidge" || isFrozen;

  function updatePlatform(platformId: string, mutate: (p: StationPlatform) => StationPlatform) {
    setGeometry((g) => ({
      ...g,
      platforms: g.platforms.map((p) => (p.id === platformId ? mutate(p) : p)),
    }));
  }

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!canManuallyEdit || !drawingPlatformId || !svgRef.current) return;
      const local = roundLocalPoint(clientPointToLocal(svgRef.current, e.clientX, e.clientY));
      updatePlatform(drawingPlatformId, (p) => ({ ...p, footprint: addFootprintVertex(p.footprint, local) }));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [drawingPlatformId, canManuallyEdit],
  );

  const handleVertexPointerDown = useCallback(
    (platformId: string, index: number, e: React.PointerEvent) => {
      e.stopPropagation();
      setSelectedVertex({ platformId, index }); // viewing a vertex's coordinates is always allowed
      if (canManuallyEdit) setDraggingVertex({ platformId, index }); // dragging is not, until frozen (or Bay Ridge)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canManuallyEdit],
  );

  useEffect(() => {
    if (!draggingVertex) return;
    function onMove(e: PointerEvent) {
      if (!svgRef.current || !draggingVertex) return;
      const local = clientPointToLocal(svgRef.current, e.clientX, e.clientY);
      updatePlatform(draggingVertex.platformId, (p) => ({
        ...p,
        footprint: moveFootprintVertex(p.footprint ?? [], draggingVertex.index, local),
      }));
    }
    function onUp(e: PointerEvent) {
      if (!svgRef.current || !draggingVertex) return;
      const local = roundLocalPoint(clientPointToLocal(svgRef.current, e.clientX, e.clientY));
      updatePlatform(draggingVertex.platformId, (p) => ({
        ...p,
        footprint: moveFootprintVertex(p.footprint ?? [], draggingVertex.index, local),
      }));
      setDraggingVertex(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingVertex]);

  function deleteSelectedVertex() {
    if (!selectedVertex) return;
    updatePlatform(selectedVertex.platformId, (p) => ({
      ...p,
      footprint: removeFootprintVertex(p.footprint ?? [], selectedVertex.index),
    }));
    setSelectedVertex(null);
  }

  function clearPlatformFootprint(platformId: string) {
    updatePlatform(platformId, (p) => ({ ...p, footprint: clearFootprint() }));
    setSelectedVertex(null);
  }

  function setSelectedVertexCoord(axis: "x" | "y", value: number) {
    if (!selectedVertex) return;
    updatePlatform(selectedVertex.platformId, (p) => {
      const current = (p.footprint ?? [])[selectedVertex.index];
      if (!current) return p;
      const next = { ...current, [axis]: value };
      return { ...p, footprint: moveFootprintVertex(p.footprint ?? [], selectedVertex.index, next) };
    });
  }

  async function handleSave() {
    try {
      await saveStationGeometryToDB(geometry);
      setStatusMessage(`Saved at ${new Date().toLocaleTimeString()}.`);
    } catch (err) {
      setStatusMessage(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function handleReload() {
    try {
      const saved = await loadStationGeometryFromDB(geometry.id);
      if (saved) {
        applyLoadedGeometry(saved);
        setStatusMessage(`Reloaded saved record from ${saved.updatedAt}.`);
      } else {
        setStatusMessage("No saved record found — nothing to reload.");
      }
    } catch (err) {
      setStatusMessage(`Reload failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function handleExport() {
    downloadFile(`${geometry.id.replace(":", "_")}.json`, JSON.stringify(geometry, null, 2), "application/json");
  }

  function handleImport() {
    try {
      const parsed = JSON.parse(importText);
      if (!isPlausibleStationGeometryData(parsed)) {
        setStatusMessage("Import failed: JSON doesn't look like a StationGeometryData record.");
        return;
      }
      applyLoadedGeometry(parsed);
      setStatusMessage("Imported from pasted JSON.");
    } catch (err) {
      setStatusMessage(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Archetype Editor Integration V0 handlers ────────────────────────────

  function handleNewTemporaryStation() {
    setGeometry(createEmptyTemporaryStation());
    setStationSource("temporary");
    setIsFrozen(false);
    setArchetypeParams(DEFAULT_UG_SIDE_2TRACK_PARAMETERS);
    setSelectedVertex(null);
    setDrawingPlatformId(null);
    setStatusMessage("Created a fresh temporary station. Apply the archetype to generate geometry.");
  }

  async function handleBackToBayRidge() {
    try {
      const saved = await loadStationGeometryFromDB(bayRidgeId);
      applyLoadedGeometry(saved ?? buildBayRidgeAvStationGeometrySeed());
      setStatusMessage("Back to Bay Ridge Av.");
    } catch (err) {
      setStatusMessage(`Load failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Deterministic — same params + same stationRef always produce the same generated geometry. Only ever called while unfrozen. */
  function regenerateFromArchetypeParams(nextParams: UndergroundSide2TrackParameters) {
    const derived = deriveUndergroundSide2TrackGeometry(nextParams, geometry.stationRef.gtfsStopId);
    setGeometry((g) => ({
      ...g,
      levels: derived.levels,
      platforms: derived.platforms,
      trackCenterlines: derived.trackCenterlines,
      connections: derived.connections,
    }));
  }

  function handleApplyArchetypeDefaults() {
    setArchetypeParams(DEFAULT_UG_SIDE_2TRACK_PARAMETERS);
    regenerateFromArchetypeParams(DEFAULT_UG_SIDE_2TRACK_PARAMETERS);
    setStatusMessage(`Applied ${UG_SIDE_2TRACK_ARCHETYPE_ID} defaults.`);
  }

  function handleArchetypeParamChange(key: keyof UndergroundSide2TrackParameters, value: number) {
    const nextParams = { ...archetypeParams, [key]: value };
    setArchetypeParams(nextParams);
    // Deterministic live regeneration ONLY while archetype-derived (unfrozen).
    // Once frozen this is a no-op on geometry — see handleDestructiveRegenerate.
    if (!isFrozen) regenerateFromArchetypeParams(nextParams);
  }

  function handleFreeze() {
    const freezeNote = "Frozen by user action — converted from archetype-derived default to custom/authored geometry.";
    setGeometry((g) => ({
      ...g,
      levels: g.levels.map((l) => ({ ...l, provenance: { ...l.provenance, source: "authored", note: freezeNote } })),
      platforms: g.platforms.map((p) => ({ ...p, provenance: { ...p.provenance, source: "authored", note: freezeNote } })),
      trackCenterlines: g.trackCenterlines.map((t) => ({
        ...t,
        provenance: { ...t.provenance, source: "authored", note: freezeNote },
      })),
      connections: g.connections.map((c) => ({ ...c, provenance: { ...c.provenance, source: "authored", note: freezeNote } })),
    }));
    setIsFrozen(true);
    setStatusMessage("Frozen. Geometry is now custom/authored — parameter edits will no longer auto-regenerate it.");
  }

  function handleDestructiveRegenerate() {
    if (
      !window.confirm(
        "This will REPLACE all custom geometry with fresh archetype defaults from the current parameters. This cannot be undone. Continue?",
      )
    ) {
      return;
    }
    regenerateFromArchetypeParams(archetypeParams);
    setIsFrozen(false); // freshly regenerated geometry is archetype-derived again, not custom
    setStatusMessage("Regenerated from parameters — previous custom geometry was replaced.");
  }

  const originScreen = toScreen({ x: 0, y: 0 });
  const axisEnd = toScreen({ x: VIEW_W + VIEW_MIN_X - 10, y: 0 });

  return (
    <div className="sge-root">
      <div className="sge-topbar">
        {onBack && (
          <button type="button" className="sge-back" onClick={onBack}>
            ← Back
          </button>
        )}
        <div className="sge-title">
          Station Geometry Editor · {geometry.stationRef.gtfsStopId} · {dbLoaded ? "" : "loading…"}
        </div>
        <div className="sge-actions">
          {stationSource === "bayRidge" ? (
            <button type="button" onClick={handleNewTemporaryStation}>New temporary station</button>
          ) : (
            <button type="button" onClick={handleBackToBayRidge}>Back to Bay Ridge Av</button>
          )}
          <button type="button" onClick={handleSave}>Save</button>
          <button type="button" onClick={handleReload}>Reload saved</button>
          <button type="button" onClick={handleExport}>Export JSON</button>
        </div>
      </div>
      {statusMessage && <div className="sge-status">{statusMessage}</div>}

      <div className="sge-body">
        <svg
          ref={svgRef}
          className="sge-canvas"
          viewBox={`${VIEW_MIN_X} ${VIEW_MIN_Y} ${VIEW_W} ${VIEW_H}`}
          onClick={handleCanvasClick}
        >
          {/* Longitudinal axis (+X), real compass bearing named by origin.orientationDeg */}
          <line
            x1={originScreen.x}
            y1={originScreen.y}
            x2={axisEnd.x}
            y2={axisEnd.y}
            className="sge-axis-line"
          />
          <text x={axisEnd.x - 20} y={axisEnd.y - 3} className="sge-axis-label">
            +X · {geometry.origin.orientationDeg.toFixed(2)}° true
          </text>
          {/* Lateral axis (+Y), left-of-travel */}
          <line x1={originScreen.x} y1={originScreen.y} x2={originScreen.x} y2={originScreen.y - 15} className="sge-axis-line sge-axis-line--y" />
          <text x={originScreen.x + 2} y={originScreen.y - 17} className="sge-axis-label">+Y</text>
          <circle cx={originScreen.x} cy={originScreen.y} r={0.8} className="sge-origin-dot" />
          <text x={originScreen.x + 2} y={originScreen.y + 6} className="sge-axis-label">{geometry.stationRef.gtfsStopId} origin</text>

          {/* Track alignment guides — Bay Ridge Av's own real GTFS-derived guides only; meaningless for a generic temporary/archetype station */}
          {stationSource === "bayRidge" &&
            alignmentGuides.map((guide) => (
              <polyline
                key={guide.trackId}
                points={guide.points.map((p) => { const s = toScreen(p); return `${s.x},${s.y}`; }).join(" ")}
                className="sge-alignment-guide"
              />
            ))}

          {/* Platform footprints */}
          {platforms.map((platform) => {
            const pts = platform.footprint ?? [];
            const screenPts = pts.map(toScreen);
            const isDrawing = drawingPlatformId === platform.id;
            return (
              <g key={platform.id} className={`sge-platform sge-platform--${platform.id.includes("northbound") ? "northbound" : "southbound"}`}>
                {screenPts.length >= 2 && (
                  <polygon points={screenPts.map((s) => `${s.x},${s.y}`).join(" ")} className="sge-platform-polygon" />
                )}
                {screenPts.map((s, i) => (
                  <circle
                    key={i}
                    cx={s.x}
                    cy={s.y}
                    r={0.9}
                    className={`sge-vertex${selectedVertex?.platformId === platform.id && selectedVertex.index === i ? " sge-vertex--selected" : ""}`}
                    onPointerDown={(e) => handleVertexPointerDown(platform.id, i, e)}
                  />
                ))}
                {isDrawing && screenPts.length === 0 && (
                  <text x={originScreen.x} y={originScreen.y + (platform.id.includes("northbound") ? -10 : 10)} className="sge-hint-label">
                    Click the canvas to place {platform.id}'s first vertex
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        <div className="sge-inspector">
          <div className="sge-panel">
            <h3>Platforms</h3>
            {platforms.map((platform) => (
              <div key={platform.id} className="sge-platform-row">
                <div className="sge-platform-row-head">
                  <strong>{platform.id}</strong>
                  <span className="sge-platform-config">{platform.config}</span>
                </div>
                <div className="sge-platform-row-actions">
                  <button
                    type="button"
                    className={drawingPlatformId === platform.id ? "sge-btn-active" : ""}
                    disabled={!canManuallyEdit}
                    onClick={() => setDrawingPlatformId(drawingPlatformId === platform.id ? null : platform.id)}
                  >
                    {drawingPlatformId === platform.id ? "Stop drawing" : "Draw footprint"}
                  </button>
                  <button type="button" onClick={() => clearPlatformFootprint(platform.id)} disabled={!canManuallyEdit || !platform.footprint}>
                    Clear
                  </button>
                </div>
                {!canManuallyEdit && (
                  <div className="sge-platform-row-meta">Freeze this station to enable manual editing.</div>
                )}
                <div className="sge-platform-row-meta">
                  {(platform.footprint?.length ?? 0)} vertices · serves {platform.servesRouteIds.join(", ")}
                </div>
                <ProvenanceRow label="footprint/config" provenance={platform.provenance} />
              </div>
            ))}
          </div>

          {stationSource === "temporary" && (
            <div className="sge-panel">
              <h3>Archetype</h3>
              <div className="sge-archetype-badge-row">
                <span className={`sge-prov-badge sge-prov-badge--${isFrozen ? "authored" : "heuristic"}`}>
                  {geometry.platforms.length === 0 ? "empty" : isFrozen ? "custom (frozen)" : "archetype-derived"}
                </span>
              </div>
              <label className="sge-archetype-select-row">
                Archetype
                <select value={UG_SIDE_2TRACK_ARCHETYPE_ID} disabled>
                  <option value={UG_SIDE_2TRACK_ARCHETYPE_ID}>{UG_SIDE_2TRACK_ARCHETYPE_ID}</option>
                </select>
              </label>
              <button type="button" onClick={handleApplyArchetypeDefaults} disabled={isFrozen}>
                Apply defaults
              </button>
              <div className="sge-archetype-params">
                {ARCHETYPE_PARAMETER_FIELDS.map(({ key, label }) => (
                  <label key={key} className="sge-archetype-param-row">
                    {label}
                    <input
                      type="number"
                      step="0.1"
                      value={archetypeParams[key]}
                      onChange={(e) => handleArchetypeParamChange(key, Number(e.target.value))}
                    />
                  </label>
                ))}
              </div>
              {!isFrozen ? (
                <button type="button" onClick={handleFreeze} disabled={geometry.platforms.length === 0}>
                  Freeze / Convert to custom geometry
                </button>
              ) : (
                <button type="button" className="sge-btn-destructive" onClick={handleDestructiveRegenerate}>
                  Regenerate from parameters (overwrites custom geometry)
                </button>
              )}
            </div>
          )}

          <div className="sge-panel">
            <h3>Selected vertex</h3>
            {selectedVertex ? (
              (() => {
                const platform = platforms.find((p) => p.id === selectedVertex.platformId);
                const point = platform?.footprint?.[selectedVertex.index];
                if (!point) return <div className="sge-empty">Vertex no longer exists.</div>;
                return (
                  <div className="sge-vertex-fields">
                    <label>
                      x (m)
                      <input
                        type="number"
                        step="0.01"
                        value={point.x}
                        disabled={!canManuallyEdit}
                        onChange={(e) => setSelectedVertexCoord("x", Number(e.target.value))}
                      />
                    </label>
                    <label>
                      y (m)
                      <input
                        type="number"
                        step="0.01"
                        value={point.y}
                        disabled={!canManuallyEdit}
                        onChange={(e) => setSelectedVertexCoord("y", Number(e.target.value))}
                      />
                    </label>
                    <button type="button" onClick={deleteSelectedVertex} disabled={!canManuallyEdit}>Delete vertex</button>
                  </div>
                );
              })()
            ) : (
              <div className="sge-empty">No vertex selected. Click a vertex to select it.</div>
            )}
          </div>

          <div className="sge-panel">
            <h3>Topology &amp; provenance</h3>
            <ProvenanceRow label="origin" provenance={geometry.origin.provenance} />
            {geometry.levels.map((level) => (
              <ProvenanceRow key={level.id} label={`level: ${level.label}`} provenance={level.provenance} />
            ))}
            {geometry.trackCenterlines.map((track) => (
              <ProvenanceRow key={track.id} label={`track: ${track.id}`} provenance={track.provenance} />
            ))}
            {geometry.connections.map((c) => (
              <ProvenanceRow key={c.id} label={`connection: ${c.kind}`} provenance={c.provenance} />
            ))}
            {geometry.platformLinks.map((link) => (
              <ProvenanceRow key={link.id} label={`platformLink: ${link.kind} (${link.approximatePosition})`} provenance={link.provenance} />
            ))}
          </div>

          <div className="sge-panel">
            <h3>Import JSON</h3>
            <textarea
              className="sge-import-textarea"
              placeholder="Paste an exported StationGeometryData JSON record…"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <button type="button" onClick={handleImport} disabled={!importText.trim()}>
              Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
