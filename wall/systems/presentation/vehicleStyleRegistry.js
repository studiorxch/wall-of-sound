// ── VehicleStyleRegistry v1.0.0 ───────────────────────────────────────────────
// 0729D_MAPS_Vehicle_Overlay_Libraries_Foundation
// Status: active | Classification: presentation-authority / vehicle-style-registry
//
// Vehicles are reusable primary objects, each a real record with its own
// editable style properties — NOT a single flat "Default Vehicle Style" that
// every vehicle shares. discoverVehicles() returns already record-shaped
// data (grouping happens HERE, at the source, unlike Geographic's flat-
// registry-then-geographicTargets.ts-groups-it pattern) so a future second
// vehicle (Bus, Boat, Bike, Plane) is simply another entry in this same
// array, never a variant of Hero Car. "Orb" was removed from the category
// union in 0730C — Orb Profiles are their own first-class MAPS library
// (orbProfileRegistry.js et al.), not a Vehicle category.
//
// Today: exactly one real record — Hero Car, backed by the same DOM/SVG
// marker heroVehicleRenderer.js has always rendered (USE_HERO_MODEL is
// false; no dormant 3D path is claimed here). Its 6 fields keep the exact
// property ids (`vehicle.hero.*`) the 0729C Visual Property Authority Audit
// already catalogued — this is a RECLASSIFICATION of those ids to a new
// owning authority, not a rename, so the audit inventory's citations stay
// valid without a second migration.
//
// This registry, together with vehicleStyleApplyAdapters.js/
// vehicleStyleAuthority.js, is what mapsGeographicStyleRegistry.js's
// _discoverHeroVehicle() used to own — removed from there in this same
// build per the spec's "do not force vehicle materials … into Geographic
// Styles."
//
// Placement: wall/systems/presentation/vehicleStyleRegistry.js
// Load: AFTER heroVehicleRenderer.js. BEFORE vehicleStyleApplyAdapters.js.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  /**
   * @typedef {"solid"} VehicleFieldValueKind
   *
   * @typedef {Object} VehicleFieldRecord
   * @property {string} propId
   * @property {string} roleLabel
   * @property {VehicleFieldValueKind} valueKind
   * @property {string} currentValue
   * @property {string} sourceObject
   * @property {string} sourceProperty
   *
   * @typedef {Object} VehicleRecord
   * @property {string} id
   * @property {string} label
   * @property {"Car"|"Bus"|"Boat"|"Bike"|"Plane"|"Other"} category
   * @property {string} sourceObject
   * @property {VehicleFieldRecord[]} fields
   */

  // ── Hero Car — heroVehicleRenderer.js DOM/SVG marker ──────────────────────
  var HERO_CAR_FIELD_DEFAULTS = {
    body: '#c8352e', roof: '#a02820', windshield: '#c8e8ff',
    rearGlass: '#9ab8d0', chevron: '#ffd34d', headlight: '#fffbe0',
  };
  var HERO_CAR_FIELD_LABELS = {
    body: 'Body', roof: 'Roof', windshield: 'Windshield',
    rearGlass: 'Rear Glass', chevron: 'Heading Chevron', headlight: 'Headlights',
  };

  function _discoverHeroCar() {
    var hvr = SBE.HeroVehicleRenderer;
    var colors = (hvr && typeof hvr.getColors === 'function') ? hvr.getColors() : null;
    var fields = Object.keys(HERO_CAR_FIELD_DEFAULTS).map(function (key) {
      var value = (colors && colors[key]) || HERO_CAR_FIELD_DEFAULTS[key];
      return {
        propId: 'vehicle.hero.' + key,
        roleLabel: HERO_CAR_FIELD_LABELS[key],
        valueKind: 'solid',
        currentValue: value,
        sourceObject: 'HeroVehicleRenderer',
        sourceProperty: key,
      };
    });
    return {
      id: 'vehicle.hero-car',
      label: 'Hero Car',
      category: 'Car',
      sourceObject: 'HeroVehicleRenderer',
      fields: fields,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  // No fictional Orb/Bus/Boat/Bike/Plane records — only real, current objects
  // appear here. Adding a real future object means adding one more entry to
  // this array, never inventing a placeholder.
  function discoverVehicles() {
    var records = [];
    if (SBE.HeroVehicleRenderer) records.push(_discoverHeroCar());
    return records;
  }

  SBE.VehicleStyleRegistry = Object.freeze({
    VERSION: VERSION,
    discoverVehicles: discoverVehicles,
  });

  console.log('[VehicleStyleRegistry] v' + VERSION + ' loaded');

})(window);
