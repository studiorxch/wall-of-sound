// ── OrbProfileApplyAdapters v1.0.0 ───────────────────────────────────────────
// 0730C_MAPS_Orb_Profiles_Library_and_Active_Hero_Runtime
// Status: active | Classification: presentation-authority / orb-profile-adapters
//
// Translates a profile-field edit into the correct live-renderer mutation —
// the structural-vs-cosmetic diff that decides whether OrbProfileRenderer
// disposes and rebuilds its active Three.js object graph, or just refreshes
// materials/lights/scale on the objects it already has. Called by
// orbProfileAuthority.js's setPropertyValue(), same responsibility shape as
// vehicleStyleApplyAdapters.js's apply()/read(), just against profile data
// instead of one external live singleton (Hero Car).
//
// Placement: wall/systems/presentation/orbProfileApplyAdapters.js
// Load: AFTER orbProfileRegistry.js. BEFORE orbProfileAuthority.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // Called only when `profile` is the currently active or previewed profile —
  // orbProfileAuthority.js already gates that, matching every other authority's
  // "only re-apply if this record is the one currently live" convention.
  function apply(propId, profile) {
    var renderer = SBE.OrbProfileRenderer;
    var factory = SBE.OrbObjectFactory;
    if (!renderer) return;
    var structural = factory ? factory.isStructuralField(propId) : true;
    if (structural) {
      renderer.rebuildActive(profile);
    } else {
      renderer.refreshActive(profile);
    }
  }

  function read(propId, profile) {
    var registry = SBE.OrbProfileRegistry;
    return registry ? registry.getPath(profile, propId) : undefined;
  }

  SBE.OrbProfileApplyAdapters = Object.freeze({
    VERSION: VERSION,
    apply: apply,
    read: read,
  });

  console.log('[OrbProfileApplyAdapters] v' + VERSION + ' loaded');

})(window);
