import { useEffect, useMemo, useRef, useState } from "react";
import * as wallOrbProfileBridge from "../../maps/wallOrbProfileBridge";
import type { OrbFieldRecord } from "../../maps/wallOrbProfileBridge";
import type { OrbProfile, OrbArchetype } from "../../data/orbProfileTypes";
import { ORB_ARCHETYPE_LABELS } from "../../data/orbProfileTypes";
import type { GeographicTarget } from "../../logic/maps/geographicTargets";
import type { TargetWithVisibility } from "./MapsGeographicCatalog";
import { MapsGeographicGrid } from "./MapsGeographicGrid";
import { MapsGeographicRows } from "./MapsGeographicRows";
import { GeographicFieldEditor } from "./GeographicFieldEditor";
import { Icon } from "../Icon";
import { mountOrbPreview, unmountOrbPreview, getPreviewState, subscribePreviewState } from "../../maps/orbPreviewRuntime";

// Live Three.js preview — dark neutral scene, slow rotation, no route map or
// unrelated controls underneath, per the approved mockup. Remounts whenever
// the focused profile's serialized values change (a small "flash" on edit is
// an acceptable cost for a single editor preview instance — unlike the
// canonical LIVE MAP renderer, there's no broadcast continuity to protect
// here, so the structural-vs-cosmetic distinction isn't worth replicating).
function OrbPreviewPanel({ profile }: { profile: OrbProfile }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState(getPreviewState);
  const serialized = JSON.stringify(profile);

  useEffect(() => subscribePreviewState(setState), []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    void mountOrbPreview(el, profile);
    return () => unmountOrbPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized]);

  return (
    <div className="orb-preview-panel">
      <div className="orb-preview-canvas" ref={containerRef} />
      {state === "loading" && <div className="orb-preview-status">Loading preview…</div>}
      {state === "unavailable" && <div className="orb-preview-status">Preview unavailable.</div>}
    </div>
  );
}

// 0730C_MAPS_Orb_Profiles_Library_and_Active_Hero_Runtime — Orbs library.
// Unlike Vehicles/Overlays (one fixed object, no Active/Preview concept),
// Orb Profiles are multiple, independent, user-created records with exactly
// one ACTIVE profile (replaces Hero Car on canonical LIVE MAP) and a
// transient, never-persisted Preview state — closer to Geographic Styles'
// record lifecycle than to Vehicles/Overlays' single-object shape. Reuses
// the same Grid/Rows dual view + inline focused-record editor panel
// Vehicles/Overlays already use (no separate routed detail page — Orb's
// 5-6 rich-field records with no Default/variant concept fit that pattern,
// not Geographic's routed detail view).

const VIEW_MODE_STORAGE_KEY = "wos:maps:orbsViewMode";
type ViewMode = "grid" | "rows";

function fieldsFor(profile: OrbProfile): OrbFieldRecord[] {
  const result = wallOrbProfileBridge.getFieldsForProfile(profile);
  return result.ok ? result.data : [];
}

function toTarget(profile: OrbProfile, activeId: string | null): GeographicTarget {
  return {
    targetId: profile.id,
    name: profile.name,
    category: ORB_ARCHETYPE_LABELS[profile.archetype],
    sourceType: "vehicle", // no dedicated sourceType exists for Orb yet; only used here for the icon/heuristics MapsGeographicGrid/Rows don't actually branch on
    layerType: undefined,
    colorFields: fieldsFor(profile).map((f) => ({
      propId: f.propId,
      roleLabel: f.roleLabel,
      value: f.currentValue,
      isExpression: false,
      valueKind: f.valueKind === "solid" ? "color" : f.valueKind,
      numberRange: f.min != null && f.max != null && f.step != null ? { min: f.min, max: f.max, step: f.step } : undefined,
      selectOptions: f.options,
    })),
    hasExpression: false,
    isCustomized: false,
    isActive: profile.id === activeId,
  };
}

function readOrbProfiles(): OrbProfile[] {
  const list = wallOrbProfileBridge.listOrbProfiles();
  return list.ok ? list.data : [];
}

export function MapsOrbsCatalog() {
  const [profiles, setProfiles] = useState<OrbProfile[]>(readOrbProfiles);
  const [activeId, setActiveId] = useState<string | null>(() => wallOrbProfileBridge.getActiveId());
  const [previewId, setPreviewId] = useState<string | null>(() => wallOrbProfileBridge.getPreviewId());
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try { return localStorage.getItem(VIEW_MODE_STORAGE_KEY) === "rows" ? "rows" : "grid"; } catch { return "grid"; }
  });
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | string>("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedTargetId, setFocusedTargetId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState<string | null>(null);

  useEffect(() => {
    function refresh() {
      setProfiles(readOrbProfiles());
      setActiveId(wallOrbProfileBridge.getActiveId());
      setPreviewId(wallOrbProfileBridge.getPreviewId());
    }
    return wallOrbProfileBridge.subscribe(refresh);
  }, []);

  // Leaving the catalog (unmount) restores ACTIVE if a preview was left running.
  useEffect(() => {
    return () => { wallOrbProfileBridge.endPreview(); };
  }, []);

  function changeViewMode(next: ViewMode) {
    setViewMode(next);
    try { localStorage.setItem(VIEW_MODE_STORAGE_KEY, next); } catch { /* best-effort */ }
  }

  const allTargets: TargetWithVisibility[] = useMemo(() => profiles.map((p) => toTarget(p, activeId)), [profiles, activeId]);

  const categories = useMemo(
    () => Array.from(new Set(allTargets.map((t) => t.category))).sort(),
    [allTargets],
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

  const focusedProfile = profiles.find((p) => p.id === focusedTargetId) ?? null;
  const focusedTarget = allTargets.find((t) => t.targetId === focusedTargetId) ?? null;

  function toggleSelect(targetId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(targetId)) next.delete(targetId); else next.add(targetId);
      return next;
    });
  }

  function setField(propId: string, value: string) {
    if (!focusedProfile) return;
    wallOrbProfileBridge.setPropertyValue(focusedProfile.id, propId, value);
  }

  function handleCreate() {
    const result = wallOrbProfileBridge.createOrbProfile("core-sphere" as OrbArchetype, "New Orb");
    if (result.ok) setFocusedTargetId(result.data.id);
  }

  function handleDuplicate(id: string) {
    const result = wallOrbProfileBridge.duplicateOrbProfile(id);
    if (result.ok) setFocusedTargetId(result.data.id);
  }

  function handleDelete(id: string) {
    wallOrbProfileBridge.deleteOrbProfile(id);
    if (focusedTargetId === id) setFocusedTargetId(null);
  }

  function submitTitle() {
    if (focusedProfile && titleDraft != null && titleDraft.trim()) {
      wallOrbProfileBridge.renameOrbProfile(focusedProfile.id, titleDraft.trim());
    }
    setTitleDraft(null);
  }

  if (!wallOrbProfileBridge.isBridgeAvailable() || profiles.length === 0) {
    return (
      <div className="pg-empty">
        <div className="pg-empty-msg">MAPS Orbs library is unavailable — Wall's runtime could not be reached.</div>
      </div>
    );
  }

  return (
    <div className="geo-catalog">
      <div className="cd-filter-row cd-filter-row--source">
        <span className="cd-filter-label">Search</span>
        <input
          className="cd-search-input"
          placeholder="Search orbs…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="cd-filter-row cd-filter-row--rating">
        <span className="cd-filter-label">Type</span>
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
        <button className="tb-btn" onClick={handleCreate}><Icon name="add" /> New Orb</button>
        <span className="geo-toolbar-spacer" />
        <span className="geo-view-toggle" role="group" aria-label="Grid or Rows view">
          <button className={`geo-view-btn${viewMode === "grid" ? " active" : ""}`} onClick={() => changeViewMode("grid")}>Grid</button>
          <button className={`geo-view-btn${viewMode === "rows" ? " active" : ""}`} onClick={() => changeViewMode("rows")}>Rows</button>
        </span>
        <span className="geo-toolbar-status">{filtered.length} of {allTargets.length}</span>
      </div>

      {focusedTarget && focusedProfile && (
        <div className="geo-target-editor">
          <div className="geo-target-editor-header">
            {titleDraft != null ? (
              <input
                className="cat-filter-search"
                style={{ fontSize: 14, maxWidth: 220 }}
                value={titleDraft}
                autoFocus
                onChange={(e) => setTitleDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submitTitle(); if (e.key === "Escape") setTitleDraft(null); }}
                onBlur={submitTitle}
              />
            ) : (
              <span className="geo-target-editor-name" onClick={() => setTitleDraft(focusedProfile.name)} title="Click to rename">
                {focusedTarget.name}
              </span>
            )}
            <span className="geo-target-editor-category">{focusedTarget.category}</span>
            {focusedTarget.isActive && <span className="geo-badge geo-badge--active">Active</span>}
            {previewId === focusedProfile.id && <span className="geo-badge geo-badge--expression">Previewing</span>}

            <span className="geo-toolbar-spacer" />
            {!focusedTarget.isActive && (
              <button className="tb-btn sm" onClick={() => wallOrbProfileBridge.activateOrbProfile(focusedProfile.id)}>Activate</button>
            )}
            {previewId === focusedProfile.id ? (
              <button className="tb-btn sm" onClick={() => wallOrbProfileBridge.endPreview()}>Stop Preview</button>
            ) : (
              !focusedTarget.isActive && (
                <button className="tb-btn sm" onClick={() => wallOrbProfileBridge.previewOrbProfile(focusedProfile.id)}>Preview</button>
              )
            )}
            <button className="tb-btn sm" onClick={() => handleDuplicate(focusedProfile.id)}>Duplicate</button>
            <button
              className="tb-btn sm"
              disabled={focusedTarget.isActive || profiles.length <= 1}
              title={focusedTarget.isActive ? "Activate a different Orb first" : profiles.length <= 1 ? "At least one Orb Profile must remain" : undefined}
              onClick={() => handleDelete(focusedProfile.id)}
            >
              Delete
            </button>
            <button className="tb-btn sm" onClick={() => setFocusedTargetId(null)}>Close</button>
          </div>
          <div className="orb-editor-body">
            <div className="geo-target-editor-fields orb-editor-fields">
              {focusedTarget.colorFields.map((f) => (
                <div key={f.propId} className="geo-target-editor-field">
                  <span className="geo-target-editor-field-label">{f.roleLabel}</span>
                  <GeographicFieldEditor field={f} onChange={(v) => setField(f.propId, v)} />
                </div>
              ))}
            </div>
            <OrbPreviewPanel profile={focusedProfile} />
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
