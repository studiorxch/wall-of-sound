// ── VehicleStyleApplyAdapters v1.0.0 ──────────────────────────────────────────
// 0729D_MAPS_Vehicle_Overlay_Libraries_Foundation
// Status: active | Classification: presentation-authority / vehicle-style-adapters
//
// Translates a VehicleFieldRecord + value into the correct live mutation for
// its source object, and reads the current live value back. Identical shape
// to mapsGeographicStyleApplyAdapters.js's former _applyVehicle/_readVehicle
// dispatch, standalone now that Vehicles is its own library.
//
// Placement: wall/systems/presentation/vehicleStyleApplyAdapters.js
// Load: AFTER vehicleStyleRegistry.js. BEFORE vehicleStyleAuthority.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  function apply(field, value) {
    if (value === undefined || value === null) return;
    if (field.sourceObject === 'HeroVehicleRenderer' && SBE.HeroVehicleRenderer) {
      var partial = {};
      partial[field.sourceProperty] = value;
      SBE.HeroVehicleRenderer.setColors(partial);
    }
  }

  function read(field) {
    if (field.sourceObject === 'HeroVehicleRenderer') {
      var hvr = SBE.HeroVehicleRenderer;
      if (!hvr || !hvr.getColors) return undefined;
      return hvr.getColors()[field.sourceProperty];
    }
    return undefined;
  }

  SBE.VehicleStyleApplyAdapters = Object.freeze({
    VERSION: VERSION,
    apply: apply,
    read: read,
  });

  console.log('[VehicleStyleApplyAdapters] v' + VERSION + ' loaded');

})(window);
