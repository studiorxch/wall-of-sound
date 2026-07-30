// ── MapsPaletteApplyAdapters v1.0.0 ───────────────────────────────────────────
// 0729A_MAPS_Palette_Audit_Default_Wiring
// Status: active | Classification: presentation-authority / palette-adapters
//
// Translates a PalettePropertyRecord + value into the correct live mutation for
// its source, and reads the current live value back (used by the diagnostic
// round-trip check). One small function per wired source — nothing here
// touches a deferred system.
//
// Placement: wall/systems/presentation/mapsPaletteApplyAdapters.js
// Load: AFTER mapsPaletteRegistry.js, BEFORE mapsPaletteAuthority.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Mapbox style paint properties ─────────────────────────────────────────
  // Palette values are always stored as strings (PaletteRecord.values is
  // Record<string,string>) — opacity properties need the numeric form
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

  // ── Hero vehicle (heroVehicleRenderer.js) ─────────────────────────────────
  function _applyVehicle(record, value) {
    var key = record.sourceProperty;
    if (SBE.HeroVehicleRenderer) {
      var partial = {};
      partial[key] = value;
      SBE.HeroVehicleRenderer.setColors(partial);
    }
  }

  function _readVehicle(record) {
    var hvr = SBE.HeroVehicleRenderer;
    if (!hvr || !hvr.getColors) return undefined;
    return hvr.getColors()[record.sourceProperty];
  }

  // ── HUD (environmentalTelemetryHUD.js) ────────────────────────────────────
  function _applyHud(record, value) {
    var key = record.sourceProperty;
    if (SBE.EnvironmentalTelemetryHUD) {
      var partial = {};
      partial[key] = value;
      SBE.EnvironmentalTelemetryHUD.setColors(partial);
    }
  }

  function _readHud(record) {
    var hud = SBE.EnvironmentalTelemetryHUD;
    if (!hud || !hud.getColors) return undefined;
    return hud.getColors()[record.sourceProperty];
  }

  // ── Runtime overlay toggles (atmosphereComposite.js, etc.) ────────────────
  // Not a Mapbox property or a color renderer — a whole canvas
  // compositor's on/off state. init()/destroy() are the module's only real
  // toggle; "enabled" has no public getter, so read live from the DOM node
  // init() itself guards on (same check the module uses internally).
  function _applyOverlay(record, value) {
    if (record.sourceObject === 'AtmosphereComposite') {
      var ac = SBE.AtmosphereComposite;
      if (!ac) return;
      var wantEnabled = value === 'true' || value === true;
      var isEnabled = typeof document !== 'undefined' && !!document.getElementById('atmosphere-composite');
      if (wantEnabled && !isEnabled && ac.init) ac.init();
      if (!wantEnabled && isEnabled && ac.destroy) ac.destroy();
    }
  }

  function _readOverlay(record) {
    if (record.sourceObject === 'AtmosphereComposite') {
      return (typeof document !== 'undefined' && !!document.getElementById('atmosphere-composite')) ? 'true' : 'false';
    }
    return undefined;
  }

  // ── Dispatch ───────────────────────────────────────────────────────────────
  function apply(record, value, map) {
    if (value === undefined || value === null) return;
    switch (record.source) {
      case 'mapbox-style': return _applyMapboxStyle(record, value, map);
      case 'route':        return _applyRoute(record, value);
      case 'vehicle':      return _applyVehicle(record, value);
      case 'hud':          return _applyHud(record, value);
      case 'overlay':      return _applyOverlay(record, value);
      default:
        console.warn('[MapsPaletteApplyAdapters] unknown source for apply:', record.source, record.id);
    }
  }

  function read(record, map) {
    switch (record.source) {
      case 'mapbox-style': return _readMapboxStyle(record, map);
      case 'route':        return _readRoute(record);
      case 'vehicle':      return _readVehicle(record);
      case 'hud':          return _readHud(record);
      case 'overlay':      return _readOverlay(record);
      default:             return undefined;
    }
  }

  SBE.MapsPaletteApplyAdapters = Object.freeze({
    VERSION: VERSION,
    apply: apply,
    read: read,
  });

  console.log('[MapsPaletteApplyAdapters] v' + VERSION + ' loaded');

})(window);
