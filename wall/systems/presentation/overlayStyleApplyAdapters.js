// ── OverlayStyleApplyAdapters v1.0.0 ──────────────────────────────────────────
// 0729D_MAPS_Vehicle_Overlay_Libraries_Foundation
// Status: active | Classification: presentation-authority / overlay-style-adapters
//
// Translates an OverlayFieldRecord + value into the correct live mutation for
// its source object, and reads the current live value back. Only Atmosphere
// Composite (boolean) and Environmental Telemetry HUD (color) have editable
// fields today — Now Playing HUD and Flight Data HUD have none, so neither
// needs dispatch logic here.
//
// Placement: wall/systems/presentation/overlayStyleApplyAdapters.js
// Load: AFTER overlayStyleRegistry.js. BEFORE overlayStyleAuthority.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  function _applyAtmosphereComposite(field, value) {
    var ac = SBE.AtmosphereComposite;
    if (!ac) return;
    var wantEnabled = value === 'true' || value === true;
    var isEnabled = typeof document !== 'undefined' && !!document.getElementById('atmosphere-composite');
    if (wantEnabled && !isEnabled && ac.init) ac.init();
    if (!wantEnabled && isEnabled && ac.destroy) ac.destroy();
  }

  function _readAtmosphereComposite() {
    return (typeof document !== 'undefined' && !!document.getElementById('atmosphere-composite')) ? 'true' : 'false';
  }

  function _applyEnvironmentalTelemetryHud(field, value) {
    var hud = SBE.EnvironmentalTelemetryHUD;
    if (!hud || !hud.setColors) return;
    var partial = {};
    partial[field.sourceProperty] = value;
    hud.setColors(partial);
  }

  function _readEnvironmentalTelemetryHud(field) {
    var hud = SBE.EnvironmentalTelemetryHUD;
    if (!hud || !hud.getColors) return undefined;
    return hud.getColors()[field.sourceProperty];
  }

  function apply(field, value) {
    if (value === undefined || value === null) return;
    if (field.sourceObject === 'AtmosphereComposite') return _applyAtmosphereComposite(field, value);
    if (field.sourceObject === 'EnvironmentalTelemetryHUD') return _applyEnvironmentalTelemetryHud(field, value);
  }

  function read(field) {
    if (field.sourceObject === 'AtmosphereComposite') return _readAtmosphereComposite();
    if (field.sourceObject === 'EnvironmentalTelemetryHUD') return _readEnvironmentalTelemetryHud(field);
    return undefined;
  }

  SBE.OverlayStyleApplyAdapters = Object.freeze({
    VERSION: VERSION,
    apply: apply,
    read: read,
  });

  console.log('[OverlayStyleApplyAdapters] v' + VERSION + ' loaded');

})(window);
