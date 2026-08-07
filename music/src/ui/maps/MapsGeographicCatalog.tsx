import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as wallGeographicStyleBridge from "../../maps/wallGeographicStyleBridge";
import type { RegistryRecord } from "../../maps/wallGeographicStyleBridge";
import { getLayerVisibility, getLayerPaintInfo } from "../../maps/wallMapPreview";
import { buildGeographicTargets, sortTargetsByCategory, type GeographicTarget } from "../../logic/maps/geographicTargets";
import { MapsGeographicGrid } from "./MapsGeographicGrid";
import { MapsGeographicRows } from "./MapsGeographicRows";
import { GeographicHexColorField } from "./GeographicHexColorField";
import { GeographicFieldEditor } from "./GeographicFieldEditor";

// 0729_MAPS_Geographic_Catalog_Dual_View — replaces the old flat
// .md-property-groups list with a scalable Grid|Rows catalog over
// consolidated Geographic targets for ONE Geographic Style (the style-level
// header/breadcrumb/Preview/Activate/Duplicate actions above this component,
// in MapsGeographicStyleDetail.tsx, are unchanged). Owns every piece of shared
// view-state (search/filter/sort/selection/view mode/focused target) so
// switching Grid<->Rows never reloads data or clears anything.

export type ViewMode = "grid" | "rows";
type StatusFilter = "all" | "expression" | "customized";
type SortKey = "category" | "name";

const VIEW_MODE_STORAGE_KEY = "wos:maps:catalogViewMode";

export type TargetWithVisibility = GeographicTarget & {
  visibility?: "visible" | "none";
  opacity?: unknown;
  pattern?: unknown;
};

type Props = {
  styleId: string;
  registry: RegistryRecord[];
  values: Record<string, string>;
  isDefault: boolean;
};

export function MapsGeographicCatalog({ styleId, registry, values, isDefault }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "rows" ? "rows" : "grid"; } catch { return "grid"; }
  });
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [visibilityFilter, setVisibilityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("category");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedTargetId, setFocusedTargetId] = useState<string | null>(null);
  const [dockAnchor] = useState<HTMLElement | null>(() =>
    typeof document !== "undefined" ? document.getElementById("selection-dock-root") : null,
  );

  function changeViewMode(next: ViewMode) {
    setViewMode(next);
    try { localStorage.setItem(VIEW_MODE_STORAGE_KEY, next); } catch { /* best-effort */ }
  }

  const defaultValues = isDefault
    ? null
    : (() => { const d = wallGeographicStyleBridge.getGeographicStyle(wallGeographicStyleBridge.DEFAULT_GEOGRAPHIC_STYLE_ID); return d.ok ? d.data.values : null; })();

  const allTargets: TargetWithVisibility[] = useMemo(() => {
    const built = sortTargetsByCategory(buildGeographicTargets(registry, values, defaultValues));
    return built.map((t) => {
      if (t.sourceType !== "mapbox-style") return t;
      const layerId = t.targetId.replace(/^mapbox:/, "");
      const paintInfo = getLayerPaintInfo(layerId, t.layerType);
      return { ...t, visibility: getLayerVisibility(layerId), opacity: paintInfo.opacity, pattern: paintInfo.pattern };
    });
  }, [registry, values, defaultValues]);

  const categories = useMemo(() => Array.from(new Set(allTargets.map((t) => t.category))).sort(), [allTargets]);
  const types = useMemo(
    () => Array.from(new Set(allTargets.map((t) => t.layerType ?? t.sourceType))).sort(),
    [allTargets],
  );

  const filtered = useMemo(() => {
    let list = allTargets;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q));
    }
    if (categoryFilter !== "all") list = list.filter((t) => t.category === categoryFilter);
    if (typeFilter !== "all") list = list.filter((t) => (t.layerType ?? t.sourceType) === typeFilter);
    if (visibilityFilter !== "all") list = list.filter((t) => (t.visibility ?? "visible") === visibilityFilter);
    if (statusFilter === "expression") list = list.filter((t) => t.hasExpression);
    if (statusFilter === "customized") list = list.filter((t) => t.isCustomized);
    if (sortKey === "name") list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    return list;
  }, [allTargets, search, categoryFilter, typeFilter, visibilityFilter, statusFilter, sortKey]);

  const selectedTargets = allTargets.filter((t) => selectedIds.has(t.targetId));
  const focusedTarget = allTargets.find((t) => t.targetId === focusedTargetId) ?? null;

  function toggleSelect(targetId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(targetId)) next.delete(targetId); else next.add(targetId);
      return next;
    });
  }

  function setField(propId: string, hex: string) {
    wallGeographicStyleBridge.setPropertyValue(styleId, propId, hex);
  }

  // "Assign Color" applies to each selected target's PRIMARY color field
  // (Fill for fill/circle layers, Color for line/background, the first
  // field for route/vehicle/HUD) — the one color a user means by "recolor
  // this." Secondary fields (Outline, Stroke, …) are untouched; edit those
  // from the target's own detail editor.
  function bulkAssignColor(hex: string) {
    for (const t of selectedTargets) {
      const primary = t.colorFields.find((f) => f.valueKind === "color");
      if (primary) setField(primary.propId, hex);
    }
  }

  // "Assign Opacity" — real, backed by the same setPropertyValue path,
  // applied to each selected target's opacity field (skips targets that
  // don't have one, per "disable/skip incompatible rows, never silently").
  const targetsWithOpacity = selectedTargets.filter((t) => t.colorFields.some((f) => f.valueKind === "opacity"));
  function bulkAssignOpacity(value: string) {
    for (const t of selectedTargets) {
      const field = t.colorFields.find((f) => f.valueKind === "opacity");
      if (field) setField(field.propId, value);
    }
  }

  function bulkResetToDefault() {
    if (isDefault || !defaultValues) return;
    for (const t of selectedTargets) {
      for (const f of t.colorFields) {
        const d = defaultValues[f.propId];
        if (d != null) setField(f.propId, d);
      }
    }
  }

  const dock = selectedIds.size > 0 && (
    <div className="cat-action-bar">
      <div className="cat-action-bar-row">
        <span className="bulk-bar-count">{selectedIds.size} selected</span>
        <BulkColorAction onAssign={bulkAssignColor} />
        <button
          className="tb-btn sm"
          disabled={isDefault}
          title={isDefault ? "Default has no baseline to reset to" : "Reset selected targets to Default's values"}
          onClick={bulkResetToDefault}
        >
          Reset to Default
        </button>
        {targetsWithOpacity.length > 0 ? (
          <BulkOpacityAction onAssign={bulkAssignOpacity} />
        ) : (
          <button className="tb-btn sm" disabled title="None of the selected targets have an editable opacity property">Assign Opacity</button>
        )}
        <button className="tb-btn sm" disabled title="Visibility has no editable path yet — Wall's Geographic Style authority only wires color properties">Toggle Visibility</button>
        <span className="bulk-bar-sep" />
        <button className="tb-btn sm" onClick={() => setSelectedIds(new Set())}>Clear</button>
      </div>
    </div>
  );

  return (
    <div className="geo-catalog">
      <div className="geo-toolbar">
        <input
          className="cat-filter-search"
          placeholder="Search targets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="cat-filter-sel" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="all">Category: All</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="cat-filter-sel" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">Type: All</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="cat-filter-sel" value={visibilityFilter} onChange={(e) => setVisibilityFilter(e.target.value)}>
          <option value="all">Visibility: All</option>
          <option value="visible">Visible</option>
          <option value="none">Hidden</option>
        </select>
        <select className="cat-filter-sel" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">Status: All</option>
          <option value="expression">Has Expression</option>
          <option value="customized">Customized</option>
        </select>
        <select className="cat-filter-sel" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
          <option value="category">Sort: Category</option>
          <option value="name">Sort: Name</option>
        </select>
        <span className="geo-toolbar-spacer" />
        <span className="geo-view-toggle" role="group" aria-label="Grid or Rows view">
          <button className={`geo-view-btn${viewMode === "grid" ? " active" : ""}`} onClick={() => changeViewMode("grid")}>Grid</button>
          <button className={`geo-view-btn${viewMode === "rows" ? " active" : ""}`} onClick={() => changeViewMode("rows")}>Rows</button>
        </span>
        <span className="geo-toolbar-status">{filtered.length} of {allTargets.length}{selectedIds.size > 0 ? ` · ${selectedIds.size} selected` : ""}</span>
      </div>

      {focusedTarget && (
        <div className="geo-target-editor">
          <div className="geo-target-editor-header">
            <span className="geo-target-editor-name">{focusedTarget.name}</span>
            <span className="geo-target-editor-category">{focusedTarget.category}</span>
            {focusedTarget.hasExpression && <span className="geo-badge geo-badge--expression">Expression</span>}
            {focusedTarget.isCustomized && <span className="geo-badge geo-badge--customized">Customized</span>}
            <button className="tb-btn sm" onClick={() => setFocusedTargetId(null)}>Close</button>
          </div>
          <div className="geo-target-editor-fields">
            {focusedTarget.colorFields.map((f) => (
              <div key={f.propId} className="geo-target-editor-field">
                <span className="geo-target-editor-field-label">{f.roleLabel}</span>
                {f.isExpression ? (
                  <span className="geo-hex-expression-note" title="This property is a Mapbox expression (zoom stops, gradient, etc.) — editing here replaces it with a single flat color.">Expression value — edit will flatten it</span>
                ) : null}
                <GeographicFieldEditor field={f} onChange={(v) => setField(f.propId, v)} />
              </div>
            ))}
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

      {dock && dockAnchor && createPortal(dock, dockAnchor)}
      {dock && !dockAnchor && dock}
    </div>
  );
}

function BulkColorAction({ onAssign }: { onAssign: (hex: string) => void }) {
  const [open, setOpen] = useState(false);
  const [hex, setHex] = useState("#000000");
  if (!open) {
    return <button className="tb-btn sm" onClick={() => setOpen(true)}>Assign Color…</button>;
  }
  return (
    <span className="cat-group-input-row">
      <GeographicHexColorField value={hex} onChange={setHex} />
      <button className="tb-btn sm" onClick={() => { onAssign(hex); setOpen(false); }}>Apply</button>
      <button className="tb-btn sm" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  );
}

function BulkOpacityAction({ onAssign }: { onAssign: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(1);
  if (!open) {
    return <button className="tb-btn sm" onClick={() => setOpen(true)}>Assign Opacity…</button>;
  }
  return (
    <span className="cat-group-input-row">
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={value}
        onChange={(e) => setValue(parseFloat(e.target.value))}
        className="geo-opacity-slider"
      />
      <span className="geo-opacity-value">{Math.round(value * 100)}%</span>
      <button className="tb-btn sm" onClick={() => { onAssign(String(value)); setOpen(false); }}>Apply</button>
      <button className="tb-btn sm" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  );
}
