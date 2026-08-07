// ── MapsGeographicStyleApplyAdapters v1.0.0 ───────────────────────────────────
// 0729A_MAPS_Palette_Audit_Default_Wiring; renamed from MapsPaletteApplyAdapters
// by 0729D_MAPS_Vehicle_Overlay_Libraries_Foundation's terminology-migration gate.
// Status: active | Classification: presentation-authority / geographic-style-adapters
//
// Translates a GeographicStylePropertyRecord + value into the correct live
// mutation for its source, and reads the current live value back (used by the
// diagnostic round-trip check). One small function per wired source — nothing
// here touches a deferred system.
//
// vehicle/hud/overlay dispatch moved OUT of this file in 0729D Phase 2/3 —
// see standalone vehicleStyleApplyAdapters.js/overlayStyleApplyAdapters.js.
//
// Placement: wall/systems/presentation/mapsGeographicStyleApplyAdapters.js
// Load: AFTER mapsGeographicStyleRegistry.js, BEFORE mapsGeographicStyleAuthority.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Mapbox style paint properties ─────────────────────────────────────────
  // Geographic Style values are always stored as strings (GeographicStyleRecord.
  // values is Record<string,string>) — opacity properties need the numeric form
  // Mapbox's setPaintProperty actually expects; color properties pass the
  // string straight through unchanged, same as before this build.
  function _applyMapboxStyle(record, value, map) {
    if (!map || typeof map.setPaintProperty !== 'function') return;
    if (!map.getLayer(record.sourceObject)) return; // layer not present on this map/style — skip, no throw
    var applied = value;
    if (record.valueKind === 'opacity') {
      var n = parseFloat(value);
      if (isNaN(n)) return;
      applied = Math.max(0, Math.min(1, n));
    }
    map.setPaintProperty(record.sourceObject, record.sourceProperty, applied);
  }

  function _readMapboxStyle(record, map) {
    if (!map || typeof map.getPaintProperty !== 'function') return undefined;
    if (!map.getLayer(record.sourceObject)) return undefined;
    var value = map.getPaintProperty(record.sourceObject, record.sourceProperty);
    return record.valueKind === 'opacity' && typeof value === 'number' ? String(value) : value;
  }

  // ── Route (mapboxOperatorRenderer.js / routePlannerRuntime.js / routePanel.js) ──
  function _applyRoute(record, value) {
    if (record.id === 'route.line.default-color') {
      if (SBE.MapboxOperatorRenderer) SBE.MapboxOperatorRenderer.setColors({ routeLine: value });
      if (SBE.RoutePlannerRuntime)    SBE.RoutePlannerRuntime.setDefaultColor(value);
    } else if (record.id === 'route.selection.color') {
      if (SBE.MapboxOperatorRenderer) SBE.MapboxOperatorRenderer.setColors({ selection: value });
    } else if (record.id === 'route.panel.visible-indicator') {
      if (SBE.RoutePanel) SBE.RoutePanel.setVisibleColor(value);
    }
  }

  function _readRoute(record) {
    if (record.id === 'route.line.default-color') {
      var mor = SBE.MapboxOperatorRenderer;
      return mor && mor.getColors ? mor.getColors().routeLine : undefined;
    }
    if (record.id === 'route.selection.color') {
      var mor2 = SBE.MapboxOperatorRenderer;
      return mor2 && mor2.getColors ? mor2.getColors().selection : undefined;
    }
    if (record.id === 'route.panel.visible-indicator') {
      var rp = SBE.RoutePanel;
      return rp && rp.getVisibleColor ? rp.getVisibleColor() : undefined;
    }
    return undefined;
  }

  // ── Dispatch ───────────────────────────────────────────────────────────────
  function apply(record, value, map) {
    if (value === undefined || value === null) return;
    switch (record.source) {
      case 'mapbox-style': return _applyMapboxStyle(record, value, map);
      case 'route':        return _applyRoute(record, value);
      default:
        console.warn('[MapsGeographicStyleApplyAdapters] unknown source for apply:', record.source, record.id);
    }
  }

  function read(record, map) {
    switch (record.source) {
      case 'mapbox-style': return _readMapboxStyle(record, map);
      case 'route':        return _readRoute(record);
      default:             return undefined;
    }
  }

  SBE.MapsGeographicStyleApplyAdapters = Object.freeze({
    VERSION: VERSION,
    apply: apply,
    read: read,
  });

  // Temporary compat alias (0729D terminology migration) — remove once
  // nothing references the old name. New code must use MapsGeographicStyleApplyAdapters.
  SBE.MapsPaletteApplyAdapters = SBE.MapsGeographicStyleApplyAdapters;

  console.log('[MapsGeographicStyleApplyAdapters] v' + VERSION + ' loaded');

})(window);
