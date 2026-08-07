import { useEffect, useMemo, useState } from "react";
import * as wallOverlayStyleBridge from "../../maps/wallOverlayStyleBridge";
import type { OverlayRecord, OverlayCategory } from "../../maps/wallOverlayStyleBridge";
import type { GeographicTarget } from "../../logic/maps/geographicTargets";
import type { TargetWithVisibility } from "./MapsGeographicCatalog";
import { MapsGeographicGrid } from "./MapsGeographicGrid";
import { MapsGeographicRows } from "./MapsGeographicRows";
import { GeographicFieldEditor } from "./GeographicFieldEditor";

// 0729D_MAPS_Vehicle_Overlay_Libraries_Foundation — Overlays library.
// Four separate real records (Atmosphere Composite, Environmental Telemetry
// HUD, Now Playing HUD, Flight Data HUD) — never one vague "Appearance"
// blob. Now Playing HUD and Flight Data HUD are real records with zero
// editable fields today; they render with an explicit Read-only status
// (see MapsGeographicGrid/Rows' editable===false handling) rather than an
// empty or broken editor.

const VIEW_MODE_STORAGE_KEY = "wos:maps:overlaysViewMode";
type ViewMode = "grid" | "rows";

function toTarget(record: OverlayRecord): GeographicTarget {
  return {
    targetId: record.id,
    name: record.label,
    category: record.category,
    sourceType: "overlay",
    layerType: undefined,
    colorFields: record.fields.map((f) => ({
      propId: f.propId,
      roleLabel: f.roleLabel,
      value: f.currentValue,
      isExpression: false,
      valueKind: f.valueKind,
    })),
    hasExpression: false,
    isCustomized: false,
    editable: record.editable,
  };
}

function readOverlays(): OverlayRecord[] {
  const list = wallOverlayStyleBridge.listOverlays();
  return list.ok ? list.data : [];
}

export function MapsOverlaysCatalog() {
  const [records, setRecords] = useState<OverlayRecord[]>(readOverlays);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "rows" ? "rows" : "grid"; } catch { return "grid"; }
  });
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | OverlayCategory>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedTargetId, setFocusedTargetId] = useState<string | null>(null);

  useEffect(() => {
    function refresh() { setRecords(readOverlays()); }
    return wallOverlayStyleBridge.subscribe(refresh);
  }, []);

  function changeViewMode(next: ViewMode) {
    setViewMode(next);
    try { localStorage.setItem(VIEW_MODE_STORAGE_KEY, next); } catch { /* best-effort */ }
  }

  const allTargets: TargetWithVisibility[] = useMemo(() => records.map(toTarget), [records]);

  // Auto-derived from real records present — today: "HUD" and "Atmosphere"
  // only. A future real Captions/Markers/etc. record adds its chip
  // automatically, with zero UI code changes.
  const categories = useMemo(
    () => Array.from(new Set(records.map((r) => r.category))).sort() as OverlayCategory[],
    [records],
  );

  const filtered = useMemo(() => {
    let list = allTargets;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }
    if (categoryFilter !== "all") list = list.filter((t) => t.category === categoryFilter);
    return list;
  }, [allTargets, search, categoryFilter]);

  const focusedTarget = allTargets.find((t) => t.targetId === focusedTargetId) ?? null;
  const focusedRecord = records.find((r) => r.id === focusedTargetId) ?? null;

  function toggleSelect(targetId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(targetId)) next.delete(targetId); else next.add(targetId);
      return next;
    });
  }

  function setField(propId: string, value: string) {
    wallOverlayStyleBridge.setPropertyValue(propId, value);
  }

  if (records.length === 0) {
    return (
      <div className="pg-empty">
        <div className="pg-empty-msg">MAPS Overlays library is unavailable — Wall's runtime could not be reached.</div>
      </div>
    );
  }

  return (
    <div className="geo-catalog">
      <div className="cd-filter-row cd-filter-row--source">
        <span className="cd-filter-label">Search</span>
        <input
          className="cd-search-input"
          placeholder="Search overlays…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="cd-filter-row cd-filter-row--rating">
        <span className="cd-filter-label">Category</span>
        <div className="cd-rating-chips">
          <button
            className={`cd-rating-chip${categoryFilter === "all" ? " active" : ""}`}
            onClick={() => setCategoryFilter("all")}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              className={`cd-rating-chip${categoryFilter === c ? " active" : ""}`}
              onClick={() => setCategoryFilter(c)}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="geo-toolbar">
        <span className="geo-toolbar-spacer" />
        <span className="geo-view-toggle" role="group" aria-label="Grid or Rows view">
          <button className={`geo-view-btn${viewMode === "grid" ? " active" : ""}`} onClick={() => changeViewMode("grid")}>Grid</button>
          <button className={`geo-view-btn${viewMode === "rows" ? " active" : ""}`} onClick={() => changeViewMode("rows")}>Rows</button>
        </span>
        <span className="geo-toolbar-status">{filtered.length} of {allTargets.length}</span>
      </div>

      {focusedTarget && (
        <div className="geo-target-editor">
          <div className="geo-target-editor-header">
            <span className="geo-target-editor-name">{focusedTarget.name}</span>
            <span className="geo-target-editor-category">{focusedTarget.category}</span>
            {focusedTarget.editable === false && <span className="geo-badge">Read-only</span>}
            <button className="tb-btn sm" onClick={() => setFocusedTargetId(null)}>Close</button>
          </div>
          <div className="geo-target-editor-fields">
            {focusedTarget.editable === false ? (
              <div className="geo-target-editor-field">
                <span className="geo-hex-expression-note">
                  Presentation-only — no editable properties.
                  {focusedRecord && ` Real source: ${focusedRecord.sourceLocation}.`}
                  {focusedRecord && !focusedRecord.runtimeActive && " Running on canonical LIVE MAP only."}
                </span>
              </div>
            ) : (
              focusedTarget.colorFields.map((f) => (
                <div key={f.propId} className="geo-target-editor-field">
                  <span className="geo-target-editor-field-label">{f.roleLabel}</span>
                  <GeographicFieldEditor field={f} onChange={(v) => setField(f.propId, v)} />
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {viewMode === "grid" ? (
        <MapsGeographicGrid
          targets={filtered}
          selectedIds={selectedIds}
          focusedTargetId={focusedTargetId}
          onToggleSelect={toggleSelect}
          onFocus={setFocusedTargetId}
        />
      ) : (
        <MapsGeographicRows
          targets={filtered}
          selectedIds={selectedIds}
          focusedTargetId={focusedTargetId}
          onToggleSelect={toggleSelect}
          onFocus={setFocusedTargetId}
        />
      )}
    </div>
  );
}
