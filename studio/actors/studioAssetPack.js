// ── WOS Studio Asset Pack ──────────────────────────────────────────────────────
// 0616A_WOS_StudioAssetPackAuthoringPass_v1.0.0_BUILD
// Seeds a Studio-only starter asset inventory across structure/vehicle/maritime/
// aircraft/prop categories. Registers through the EXISTING ActorAssetLibraryAuthority
// registry (registerAsset) — no new registry system, no Wall runtime changes, no
// actor manifest fields. Placement defaults still flow entirely through 0615F's
// WOSAssetResolver.resolvePlacementDefaults(); this file only supplies registry data.
// Studio-only file — lives under studio/actors/, never under wall/.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  function _ala() { return global.SBE && global.SBE.ActorAssetLibraryAuthority; }

  // Mirrors the shape produced by wall/systems/actors/actorAssetLibraryAuthority.js's
  // internal A() builder (same registry pattern) — registerAsset() only requires
  // id/key/category, but the full shape keeps these assets consistent with the
  // rest of the registry (variants, palette/glyph hooks, authoring metadata).
  function _seed(category, id, label, opts) {
    opts = opts || {};
    return {
      id: id,
      key: id,
      category: category,
      label: label,
      actorTypes: opts.actorTypes || [],
      identityKeys: opts.identityKeys || [],
      silhouetteClass: opts.silhouetteClass || null,
      defaultVariant: 'lowpoly',
      variants: {
        dot:     { kind: 'procedural', renderVariant: id + '_dot',     minZoom: 8,  maxZoom: 12 },
        icon:    { kind: 'procedural', renderVariant: id + '_icon',    minZoom: 12, maxZoom: 14 },
        lowpoly: { kind: 'procedural', renderVariant: id + '_lowpoly', minZoom: 14, maxZoom: 20 },
      },
      paletteRef: opts.paletteRef || null,
      glyphRef: opts.glyphRef || null,
      materialClass: opts.materialClass || 'standard',
      lightClass: 'none',
      scaleClass: opts.scaleClass || 'standard',
      priorityClass: 'background',
      editable: true,
      source: 'studio-pack',
      tags: opts.tags || [],
      files: { svg: null, glb: null, webp: null, thumbnail: null },
      authoring: { editable: true, locked: false, version: '1.0.0', createdAt: null, updatedAt: null },
      metadata: opts.metadata || {},
    };
  }

  var PACK = [
    // ── Structure (6) — tags drive structure inference in assetResolver.js ─────
    _seed('structure', 'structure.block.lowrise', 'Lowrise Block',
      { silhouetteClass: 'structure-block', tags: ['structure', 'building', 'lowrise'], actorTypes: ['structure.building'] }),
    _seed('structure', 'structure.block.midrise', 'Midrise Block',
      { silhouetteClass: 'structure-block', tags: ['structure', 'building', 'midrise'], actorTypes: ['structure.building'] }),
    _seed('structure', 'structure.block.tower', 'Tower Block',
      { silhouetteClass: 'structure-tower', tags: ['structure', 'building', 'tower'], actorTypes: ['structure.building'] }),
    _seed('structure', 'structure.rooftop.kiosk', 'Rooftop Kiosk',
      { silhouetteClass: 'structure-rooftop', tags: ['structure', 'building', 'rooftop', 'kiosk'], actorTypes: ['structure.building'] }),
    _seed('structure', 'structure.rooftop.antenna', 'Rooftop Antenna',
      { silhouetteClass: 'structure-rooftop', tags: ['structure', 'building', 'rooftop', 'antenna'], actorTypes: ['structure.building'] }),
    _seed('structure', 'structure.landmark.placeholder', 'Landmark Placeholder',
      { silhouetteClass: 'structure-landmark', tags: ['structure', 'building', 'landmark'], actorTypes: ['structure.building'] }),

    // ── Vehicle (6) — category 'road' → actorCategory 'vehicle' per CATEGORY_MAP ──
    _seed('road', 'vehicle.car.compact', 'Compact Car',
      { silhouetteClass: 'ambient-car', tags: ['vehicle', 'road', 'car', 'compact'], actorTypes: ['vehicle.car'] }),
    _seed('road', 'vehicle.van.delivery', 'Delivery Van',
      { silhouetteClass: 'utility-truck', tags: ['vehicle', 'road', 'van', 'delivery'], actorTypes: ['vehicle.van'] }),
    _seed('road', 'vehicle.bus.city', 'City Bus',
      { silhouetteClass: 'city-bus', tags: ['vehicle', 'road', 'transit', 'bus'], actorTypes: ['vehicle.bus'] }),
    _seed('road', 'vehicle.truck.box', 'Box Truck',
      { silhouetteClass: 'utility-truck', tags: ['vehicle', 'road', 'truck', 'box'], actorTypes: ['vehicle.truck'] }),
    _seed('road', 'vehicle.taxi.generic', 'Generic Taxi',
      { silhouetteClass: 'ambient-car', tags: ['vehicle', 'road', 'taxi'], actorTypes: ['vehicle.taxi'] }),
    _seed('road', 'vehicle.service.utility', 'Utility Service Vehicle',
      { silhouetteClass: 'utility-truck', tags: ['vehicle', 'road', 'service', 'utility'], actorTypes: ['vehicle.utility'] }),

    // ── Maritime (6) — actorTypes contain 'vessel' so assetResolver infers actorType 'vessel' ──
    _seed('marine', 'maritime.boat.service', 'Service Boat',
      { silhouetteClass: 'service-boat', tags: ['maritime', 'marine', 'vessel', 'boat', 'service'], actorTypes: ['marine.vessel'] }),
    _seed('marine', 'maritime.ferry.small', 'Small Ferry',
      { silhouetteClass: 'passenger-ferry', tags: ['maritime', 'marine', 'vessel', 'boat', 'ferry'], actorTypes: ['marine.vessel'] }),
    _seed('marine', 'maritime.tug.generic', 'Generic Tug',
      { silhouetteClass: 'tug-boat', tags: ['maritime', 'marine', 'vessel', 'boat', 'tug'], actorTypes: ['marine.vessel'] }),
    _seed('marine', 'maritime.barge.flat', 'Flat Barge',
      { silhouetteClass: 'barge', tags: ['maritime', 'marine', 'vessel', 'boat', 'barge'], actorTypes: ['marine.vessel'] }),
    _seed('marine', 'maritime.sailboat.simple', 'Simple Sailboat',
      { silhouetteClass: 'sailboat', tags: ['maritime', 'marine', 'vessel', 'boat', 'sailboat'], actorTypes: ['marine.vessel'] }),
    _seed('marine', 'maritime.cargo.small', 'Small Cargo Vessel',
      { silhouetteClass: 'cargo-ship', tags: ['maritime', 'marine', 'vessel', 'boat', 'cargo'], actorTypes: ['marine.vessel'] }),

    // ── Aircraft (4) — category 'aircraft' → actorCategory 'vehicle', actorType 'aircraft' ──
    _seed('aircraft', 'aircraft.light.plane', 'Light Plane',
      { silhouetteClass: 'aircraft-light', tags: ['aircraft', 'plane', 'light'], actorTypes: ['aircraft.plane'] }),
    _seed('aircraft', 'aircraft.helicopter.placeholder', 'Helicopter Placeholder',
      { silhouetteClass: 'aircraft-light', tags: ['aircraft', 'helicopter'], actorTypes: ['aircraft.helicopter'] }),
    _seed('aircraft', 'aircraft.regional.jet', 'Regional Jet',
      { silhouetteClass: 'aircraft-light', tags: ['aircraft', 'jet', 'regional'], actorTypes: ['aircraft.plane'] }),
    _seed('aircraft', 'aircraft.drone.placeholder', 'Drone Placeholder',
      { silhouetteClass: 'aircraft-light', tags: ['aircraft', 'drone'], actorTypes: ['aircraft.drone'] }),

    // ── Prop (8) — category 'prop' → actorCategory 'prop', actorType 'custom' ──
    _seed('prop', 'prop.kioMAPBOX_SECRET_TOKEN_REMOVED', 'Small Kiosk',
      { silhouetteClass: 'world-prop', tags: ['prop', 'kiosk', 'street'], actorTypes: ['world.prop'] }),
    _seed('prop', 'prop.billboard.standard', 'Standard Billboard',
      { silhouetteClass: 'world-prop', tags: ['prop', 'billboard', 'signage'], actorTypes: ['world.prop'] }),
    _seed('prop', 'prop.sign.tall', 'Tall Sign',
      { silhouetteClass: 'world-prop', tags: ['prop', 'sign', 'signage'], actorTypes: ['world.prop'] }),
    _seed('prop', 'prop.stage.block', 'Stage Block',
      { silhouetteClass: 'world-prop', tags: ['prop', 'stage', 'event'], actorTypes: ['world.prop'] }),
    _seed('prop', 'prop.crate.stack', 'Crate Stack',
      { silhouetteClass: 'world-prop', tags: ['prop', 'crate'], actorTypes: ['world.prop'] }),
    _seed('prop', 'prop.light.tower', 'Light Tower',
      { silhouetteClass: 'world-prop', tags: ['prop', 'light', 'tower'], actorTypes: ['world.prop'] }),
    _seed('prop', 'prop.marker.event', 'Event Marker',
      { silhouetteClass: 'world-prop', tags: ['prop', 'marker', 'event'], actorTypes: ['world.prop'] }),
    _seed('prop', 'prop.rooftop.box', 'Rooftop Box',
      { silhouetteClass: 'world-prop', tags: ['prop', 'rooftop', 'box'], actorTypes: ['world.prop'] }),
  ];

  function _seedAll() {
    var ala = _ala();
    if (!ala || !ala.registerAsset) {
      console.warn('[StudioAssetPack] ActorAssetLibraryAuthority unavailable — pack not seeded');
      return 0;
    }
    var count = 0;
    PACK.forEach(function (a) { if (ala.registerAsset(a)) count++; });
    return count;
  }

  var _seededCount = _seedAll();

  global.WOSStudioAssetPack = {
    PACK_IDS:     PACK.map(function (a) { return a.id; }),
    seededCount:  function () { return _seededCount; },
    reseed:       _seedAll,
  };
  console.log('[StudioAssetPack] ready — seeded ' + _seededCount + '/' + PACK.length + ' assets');
})(window);
