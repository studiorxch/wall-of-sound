// ── ActorAssetLibraryAuthority v1.0.0 ─────────────────────────────────────────
// 0603O_WOS_ActorAssetLibraryAuthority_v1.0.0
// Status: active | Classification: asset-authority
//
// Maps actor visual identities → reusable ASSET records (variants / LOD refs /
// palette / glyph / authoring metadata). The bridge from "silhouetteClass →
// hardcoded builder" toward "visualIdentityKey → asset → variant → renderer".
// PRESENTATION ONLY — never mutates truth, identity, feeds, camera, or WSL.
// Load AFTER actorVisualIdentityAuthority.js + actorPresentationPaletteRegistry.js,
// before actorRenderAuthority.js (ARA guards if absent).
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // Build an asset record with safe defaults + procedural LOD variants.
  function A(category, key, label, o) {
    o = o || {};
    var sil = o.silhouetteClass;
    var base = (o.variantBase || key);
    var stationLike = (sil === 'station-node');
    var variants = o.variants || {
      dot:     { kind: 'procedural', renderVariant: stationLike ? 'station_dot'  : base + '_dot',     minZoom: 8,  maxZoom: 12 },
      icon:    { kind: 'procedural', renderVariant: stationLike ? 'station_icon' : base + '_icon',    minZoom: 12, maxZoom: 14 },
      lowpoly: { kind: 'procedural', renderVariant: stationLike ? 'station_node' : base + '_lowpoly', minZoom: 14, maxZoom: 20 },
      hero:    { kind: 'future-asset', uri: null, renderVariant: stationLike ? 'station_node' : base + '_lowpoly', minZoom: 16, maxZoom: 22 },
    };
    return {
      id: 'asset://' + category + '/' + key,
      key: key, category: category, label: label,
      actorTypes: o.actorTypes || [],
      identityKeys: o.identityKeys || [],
      silhouetteClass: sil || null,
      defaultVariant: o.defaultVariant || 'lowpoly',
      variants: variants,
      paletteRef: o.paletteRef || null,
      glyphRef: o.glyphRef || null,
      materialClass: o.materialClass || 'standard',
      lightClass: o.lightClass || 'none',
      scaleClass: o.scaleClass || 'standard',
      priorityClass: o.priorityClass || 'background',
      editable: o.editable !== false,
      source: o.source || 'system',
      tags: o.tags || [],
      files: { svg: null, glb: null, webp: null, thumbnail: null },
      authoring: { editable: o.editable !== false, locked: false, version: '1.0.0', createdAt: null, updatedAt: null },
      metadata: o.metadata || {},
    };
  }

  var ASSETS = [
    // Road
    A('road', 'mta_bus_standard', 'MTA Bus Standard', { silhouetteClass: 'city-bus', variantBase: 'bus',
      actorTypes: ['vehicle.bus'], identityKeys: ['mta.bus', 'generic.bus'],
      paletteRef: 'mta.bus.blue-white', glyphRef: 'bus', materialClass: 'transit-plastic', lightClass: 'head-tail',
      scaleClass: 'large-road-vehicle', priorityClass: 'public-transit', tags: ['road', 'transit', 'bus', 'mta'] }),
    A('road', 'dot_utility_truck', 'DOT Utility Truck', { silhouetteClass: 'utility-truck', variantBase: 'utility',
      actorTypes: ['vehicle.utility'], identityKeys: ['dot.utility', 'generic.utility'],
      paletteRef: 'dot.yellow-orange', glyphRef: 'utility', materialClass: 'industrial', lightClass: 'amber-flash',
      scaleClass: 'medium-heavy-vehicle', priorityClass: 'civic-service', tags: ['road', 'civic', 'utility'] }),
    A('road', 'synthetic_ambient_car', 'Synthetic Ambient Car', { silhouetteClass: 'ambient-car', variantBase: 'car',
      actorTypes: ['vehicle.synthetic'], identityKeys: ['synthetic.vehicle'],
      paletteRef: 'synthetic.muted-road', glyphRef: 'none', materialClass: 'low-priority', lightClass: 'minimal',
      scaleClass: 'small-road-vehicle', priorityClass: 'background', tags: ['road', 'synthetic'] }),
    // Civic
    A('civic', 'citibike_station_node', 'Citi Bike Station Node', { silhouetteClass: 'station-node',
      actorTypes: ['bike.station'], identityKeys: ['citibike.station', 'generic.station'],
      paletteRef: 'citibike.cyan', glyphRef: 'bike.station', materialClass: 'flat-emissive', lightClass: 'none',
      scaleClass: 'micro-infrastructure', priorityClass: 'civic-utility', tags: ['civic', 'station', 'citibike'] }),
    A('civic', 'incident_marker', 'Incident Marker', { silhouetteClass: 'alert-marker', variantBase: 'incident',
      actorTypes: ['civic.incident'], identityKeys: ['generic.incident'],
      paletteRef: 'civic.alert', glyphRef: 'alert', materialClass: 'flat-emissive', lightClass: 'alert-flash',
      scaleClass: 'marker', priorityClass: 'civic-alert', tags: ['civic', 'alert'] }),
    // ── Marine vessel pack (0603T) — 19 editable harbor assets ───────────────
    // Utility / markers (vessel_generic stays the marine.vessel actorType fallback
    // + ais.vessel default; passenger_ferry stays the nyc.ferry/generic.ferry default).
    A('marine', 'vessel_generic', 'Generic Vessel', { silhouetteClass: 'vessel-generic', variantBase: 'vessel',
      actorTypes: ['marine.vessel'], identityKeys: ['ais.vessel', 'generic.vessel'],
      paletteRef: 'marine.truth-blue', glyphRef: 'vessel', materialClass: 'marine-matte', lightClass: 'navigation',
      scaleClass: 'marine-medium', priorityClass: 'harbor-truth', tags: ['marine', 'vessel'],
      metadata: { vesselRole: 'generic', expectedAISShipTypes: [], visualNotes: 'Fallback vessel silhouette.', taxonomyReady: true } }),
    A('marine', 'unknown_vessel', 'Unknown Vessel', { silhouetteClass: 'unknown-vessel', variantBase: 'unknown',
      actorTypes: ['marine.vessel'], identityKeys: [],
      paletteRef: 'marine.unknown.gray', glyphRef: 'unknown', materialClass: 'marine-matte', lightClass: 'navigation',
      scaleClass: 'marine-marker', priorityClass: 'background', tags: ['marine', 'unknown'],
      metadata: { vesselRole: 'unknown', expectedAISShipTypes: [0], visualNotes: 'Unclassified AIS contact marker.', taxonomyReady: true } }),

    // Working harbor
    A('marine', 'tug_boat', 'Tug Boat', { silhouetteClass: 'tug-boat', variantBase: 'tug',
      actorTypes: ['marine.vessel'], identityKeys: [],
      paletteRef: 'marine.workboat.orange', glyphRef: 'tug', materialClass: 'marine-matte', lightClass: 'navigation',
      scaleClass: 'marine-small', priorityClass: 'commercial', tags: ['marine', 'tug', 'workboat'],
      metadata: { vesselRole: 'tug', expectedAISShipTypes: [52], visualNotes: 'Compact high-cabin working vessel for harbor support.', taxonomyReady: true } }),
    A('marine', 'pilot_boat', 'Pilot Boat', { silhouetteClass: 'pilot-boat', variantBase: 'pilot',
      actorTypes: ['marine.vessel'], identityKeys: [],
      paletteRef: 'marine.service.yellow', glyphRef: 'pilot', materialClass: 'marine-matte', lightClass: 'navigation',
      scaleClass: 'marine-small', priorityClass: 'civic-service', tags: ['marine', 'pilot', 'workboat'],
      metadata: { vesselRole: 'pilot', expectedAISShipTypes: [50], visualNotes: 'Fast small pilot transfer craft.', taxonomyReady: true } }),
    A('marine', 'service_boat', 'Service Boat', { silhouetteClass: 'service-boat', variantBase: 'service',
      actorTypes: ['marine.vessel'], identityKeys: [],
      paletteRef: 'marine.service.yellow', glyphRef: 'service', materialClass: 'marine-matte', lightClass: 'navigation',
      scaleClass: 'marine-small', priorityClass: 'civic-service', tags: ['marine', 'service', 'workboat'],
      metadata: { vesselRole: 'service', expectedAISShipTypes: [53], visualNotes: 'General harbor service / maintenance craft.', taxonomyReady: true } }),
    A('marine', 'police_boat', 'Police Boat', { silhouetteClass: 'police-boat', variantBase: 'police',
      actorTypes: ['marine.vessel'], identityKeys: [],
      paletteRef: 'marine.police.blue-white', glyphRef: 'police', materialClass: 'marine-clean', lightClass: 'navigation',
      scaleClass: 'marine-small', priorityClass: 'emergency', tags: ['marine', 'police', 'emergency'],
      metadata: { vesselRole: 'police', expectedAISShipTypes: [55], visualNotes: 'Law-enforcement patrol craft.', taxonomyReady: true } }),
    A('marine', 'fire_boat', 'Fire Boat', { silhouetteClass: 'fire-boat', variantBase: 'fire',
      actorTypes: ['marine.vessel'], identityKeys: [],
      paletteRef: 'marine.fire.red-white', glyphRef: 'fire', materialClass: 'marine-clean', lightClass: 'navigation',
      scaleClass: 'marine-medium', priorityClass: 'emergency', tags: ['marine', 'fire', 'emergency'],
      metadata: { vesselRole: 'fire', expectedAISShipTypes: [55], visualNotes: 'Fireboat with monitor towers.', taxonomyReady: true } }),

    // Commercial
    A('marine', 'cargo_small', 'Small Cargo Vessel', { silhouetteClass: 'cargo-ship', variantBase: 'cargo',
      actorTypes: ['marine.vessel'], identityKeys: [],
      paletteRef: 'marine.cargo.rust', glyphRef: 'cargo', materialClass: 'marine-matte', lightClass: 'navigation',
      scaleClass: 'marine-medium', priorityClass: 'commercial', tags: ['marine', 'cargo'],
      metadata: { vesselRole: 'cargo', expectedAISShipTypes: [70], visualNotes: 'General cargo vessel.', taxonomyReady: true } }),
    A('marine', 'cargo_large', 'Large Cargo Vessel', { silhouetteClass: 'cargo-ship', variantBase: 'cargo_large',
      actorTypes: ['marine.vessel'], identityKeys: [],
      paletteRef: 'marine.cargo.rust', glyphRef: 'cargo', materialClass: 'marine-matte', lightClass: 'navigation',
      scaleClass: 'marine-large', priorityClass: 'commercial', tags: ['marine', 'cargo', 'large'],
      metadata: { vesselRole: 'cargo', expectedAISShipTypes: [70, 79], visualNotes: 'Large general cargo ship.', taxonomyReady: true } }),
    A('marine', 'container_ship', 'Container Ship', { silhouetteClass: 'container-ship', variantBase: 'container',
      actorTypes: ['marine.vessel'], identityKeys: [],
      paletteRef: 'marine.container.dark', glyphRef: 'container', materialClass: 'marine-matte', lightClass: 'navigation',
      scaleClass: 'marine-xl', priorityClass: 'commercial', tags: ['marine', 'container', 'commercial'],
      metadata: { vesselRole: 'container', expectedAISShipTypes: [71], visualNotes: 'Stacked-container long hull.', taxonomyReady: true } }),
    A('marine', 'tanker', 'Tanker', { silhouetteClass: 'tanker', variantBase: 'tanker',
      actorTypes: ['marine.vessel'], identityKeys: [],
      paletteRef: 'marine.tanker.black-red', glyphRef: 'tanker', materialClass: 'marine-matte', lightClass: 'navigation',
      scaleClass: 'marine-xl', priorityClass: 'commercial', tags: ['marine', 'tanker', 'commercial'],
      metadata: { vesselRole: 'tanker', expectedAISShipTypes: [80, 84], visualNotes: 'Low long tanker hull, manifold midship.', taxonomyReady: true } }),
    A('marine', 'barge', 'Barge', { silhouetteClass: 'barge', variantBase: 'barge',
      actorTypes: ['marine.vessel'], identityKeys: [],
      paletteRef: 'marine.barge.gray', glyphRef: 'barge', materialClass: 'marine-matte', lightClass: 'navigation',
      scaleClass: 'marine-long', priorityClass: 'commercial', tags: ['marine', 'barge'],
      metadata: { vesselRole: 'barge', expectedAISShipTypes: [57], visualNotes: 'Flat low rectangle, often towed.', taxonomyReady: true } }),

    // Passenger / public
    A('marine', 'passenger_ferry', 'Passenger Ferry', { silhouetteClass: 'passenger-ferry', variantBase: 'ferry',
      actorTypes: ['marine.ferry'], identityKeys: ['nyc.ferry', 'generic.ferry'],
      paletteRef: 'marine.ferry.blue-white', glyphRef: 'ferry', materialClass: 'marine-clean', lightClass: 'navigation',
      scaleClass: 'marine-large', priorityClass: 'public-transit', tags: ['marine', 'transit', 'ferry'],
      metadata: { vesselRole: 'ferry', expectedAISShipTypes: [60, 69], visualNotes: 'Double-deck passenger ferry.', taxonomyReady: true } }),
    A('marine', 'nyc_ferry_small', 'NYC Ferry (Small)', { silhouetteClass: 'passenger-ferry', variantBase: 'ferry_small',
      actorTypes: ['marine.ferry'], identityKeys: [],
      paletteRef: 'marine.ferry.blue-white', glyphRef: 'ferry', materialClass: 'marine-clean', lightClass: 'navigation',
      scaleClass: 'marine-medium', priorityClass: 'public-transit', tags: ['marine', 'transit', 'ferry', 'nyc'],
      metadata: { vesselRole: 'ferry', expectedAISShipTypes: [60], visualNotes: 'Smaller catamaran-style commuter ferry.', taxonomyReady: true } }),
    A('marine', 'cruise_ship', 'Cruise Ship', { silhouetteClass: 'cruise-ship', variantBase: 'cruise',
      actorTypes: ['marine.vessel'], identityKeys: [],
      paletteRef: 'marine.cruise.white', glyphRef: 'cruise', materialClass: 'marine-clean', lightClass: 'navigation',
      scaleClass: 'marine-xl', priorityClass: 'public-transit', tags: ['marine', 'cruise', 'passenger'],
      metadata: { vesselRole: 'cruise', expectedAISShipTypes: [69], visualNotes: 'Tall multi-deck white passenger hull.', taxonomyReady: true } }),

    // Private / small craft
    A('marine', 'yacht_small', 'Small Yacht', { silhouetteClass: 'yacht', variantBase: 'yacht',
      actorTypes: ['marine.vessel'], identityKeys: [],
      paletteRef: 'marine.yacht.white', glyphRef: 'yacht', materialClass: 'marine-clean', lightClass: 'navigation',
      scaleClass: 'marine-small', priorityClass: 'background', tags: ['marine', 'yacht', 'private'],
      metadata: { vesselRole: 'yacht', expectedAISShipTypes: [37], visualNotes: 'Sleek small pleasure craft.', taxonomyReady: true } }),
    A('marine', 'yacht_large', 'Large Yacht', { silhouetteClass: 'yacht', variantBase: 'yacht_large',
      actorTypes: ['marine.vessel'], identityKeys: [],
      paletteRef: 'marine.yacht.white', glyphRef: 'yacht', materialClass: 'marine-clean', lightClass: 'navigation',
      scaleClass: 'marine-medium', priorityClass: 'background', tags: ['marine', 'yacht', 'private', 'large'],
      metadata: { vesselRole: 'yacht', expectedAISShipTypes: [37], visualNotes: 'Multi-deck luxury motor yacht.', taxonomyReady: true } }),
    A('marine', 'sailboat', 'Sailboat', { silhouetteClass: 'sailboat', variantBase: 'sailboat',
      actorTypes: ['marine.vessel'], identityKeys: [],
      paletteRef: 'marine.sailboat.white', glyphRef: 'sailboat', materialClass: 'marine-clean', lightClass: 'navigation',
      scaleClass: 'marine-small', priorityClass: 'background', tags: ['marine', 'sailboat', 'private'],
      metadata: { vesselRole: 'sailing', expectedAISShipTypes: [36], visualNotes: 'Hull with tall mast / sail cue.', taxonomyReady: true } }),
    A('marine', 'fishing_boat', 'Fishing Boat', { silhouetteClass: 'fishing-boat', variantBase: 'fishing',
      actorTypes: ['marine.vessel'], identityKeys: [],
      paletteRef: 'marine.fishing.green-white', glyphRef: 'fishing', materialClass: 'marine-matte', lightClass: 'navigation',
      scaleClass: 'marine-small', priorityClass: 'commercial', tags: ['marine', 'fishing'],
      metadata: { vesselRole: 'fishing', expectedAISShipTypes: [30], visualNotes: 'Small cabin-forward working fishing vessel.', taxonomyReady: true } }),
    // Aircraft
    A('aircraft', 'aircraft_light', 'Light Aircraft Token', { silhouetteClass: 'aircraft-light', variantBase: 'aircraft',
      actorTypes: ['aircraft.plane'], identityKeys: ['aircraft.truth', 'generic.aircraft'],
      paletteRef: 'aircraft.cool-white', glyphRef: 'aircraft', materialClass: 'high-altitude', lightClass: 'nav-strobe',
      scaleClass: 'sky-variable', priorityClass: 'airspace-truth', tags: ['aircraft'] }),
    A('aircraft', 'regional_jet', 'Regional Jet', { silhouetteClass: 'aircraft-light', variantBase: 'regionaljet',
      actorTypes: ['aircraft.plane'], identityKeys: [],
      paletteRef: 'aircraft.cool-white', glyphRef: 'aircraft', materialClass: 'high-altitude', lightClass: 'nav-strobe',
      scaleClass: 'sky-variable', priorityClass: 'airspace-truth', tags: ['aircraft', 'jet'] }),
    // Transit
    A('transit', 'subway_train_basic', 'Subway Train (Basic)', { silhouetteClass: 'subway-train', variantBase: 'train',
      actorTypes: ['transit.train'], identityKeys: ['mta.subway.train', 'generic.train'],
      paletteRef: 'mta.subway.line-color', glyphRef: 'subway', materialClass: 'rail-metal', lightClass: 'interior-strip',
      scaleClass: 'rail-long', priorityClass: 'public-transit', tags: ['transit', 'rail', 'subway'] }),
    // World
    A('world', 'prop_generic', 'Generic Prop', { silhouetteClass: 'world-prop', variantBase: 'prop',
      actorTypes: ['world.prop'], identityKeys: ['generic.prop'],
      paletteRef: 'world.generic', glyphRef: 'none', materialClass: 'flat', lightClass: 'none',
      scaleClass: 'prop', priorityClass: 'background', tags: ['world', 'prop'] }),
    A('world', 'building_marker', 'Building Marker', { silhouetteClass: 'world-prop', variantBase: 'building',
      actorTypes: ['world.prop'], identityKeys: [],
      paletteRef: 'world.generic', glyphRef: 'none', materialClass: 'flat', lightClass: 'none',
      scaleClass: 'prop', priorityClass: 'background', tags: ['world', 'building'] }),
    // Debug
    A('debug', 'proof_actor_marker', 'Proof Actor Marker', { silhouetteClass: 'generic-actor', variantBase: 'proof',
      actorTypes: [], identityKeys: [],
      paletteRef: 'actor.generic', glyphRef: 'none', materialClass: 'standard', lightClass: 'none',
      scaleClass: 'standard', priorityClass: 'background', tags: ['debug'] }),
  ];

  var DEFAULT_ASSIGNMENTS = {
    'mta.bus': 'asset://road/mta_bus_standard',
    'generic.bus': 'asset://road/mta_bus_standard',
    'dot.utility': 'asset://road/dot_utility_truck',
    'generic.utility': 'asset://road/dot_utility_truck',
    'synthetic.vehicle': 'asset://road/synthetic_ambient_car',
    'citibike.station': 'asset://civic/citibike_station_node',
    'generic.station': 'asset://civic/citibike_station_node',
    'ais.vessel': 'asset://marine/vessel_generic',
    'generic.vessel': 'asset://marine/vessel_generic',
    'nyc.ferry': 'asset://marine/passenger_ferry',
    'generic.ferry': 'asset://marine/passenger_ferry',
    'aircraft.truth': 'asset://aircraft/aircraft_light',
    'generic.aircraft': 'asset://aircraft/aircraft_light',
    'mta.subway.train': 'asset://transit/subway_train_basic',
    'generic.train': 'asset://transit/subway_train_basic',
    'generic.incident': 'asset://civic/incident_marker',
    'generic.prop': 'asset://world/prop_generic',
  };
  var GENERIC_ASSET_ID = 'asset://world/prop_generic';

  // Indices (O(1) lookups).
  var _byId = {}, _byActorType = {}, _bySilhouette = {};
  function _index() {
    _byId = {}; _byActorType = {}; _bySilhouette = {};
    ASSETS.forEach(function (a) {
      _byId[a.id] = a;
      (a.actorTypes || []).forEach(function (t) { if (!_byActorType[t]) _byActorType[t] = a; });
      if (a.silhouetteClass && !_bySilhouette[a.silhouetteClass]) _bySilhouette[a.silhouetteClass] = a;
    });
  }
  _index();
  var _assignments = {}; (function () { for (var k in DEFAULT_ASSIGNMENTS) _assignments[k] = DEFAULT_ASSIGNMENTS[k]; })();

  var _enabled = true, _debug = false;
  var _stats = { resolved: 0, fallback: 0, registerCount: 0, assignmentUpdateCount: 0, lastResolvedAt: 0, lastError: null,
                 lastExportAt: null, lastImportAt: null, lastImportResult: null };
  var ASSIGNMENT_SCHEMA = 'wos.actorAssetAssignments';

  // ── Variant resolution from LOD tier ────────────────────────────────────────
  function _resolveVariant(asset, lodTier) {
    if (lodTier === 'hidden') return null;
    var v = asset.variants || {};
    var want;
    if (lodTier === 'dot') want = 'dot';
    else if (lodTier === 'icon') want = 'icon';
    else if (lodTier === 'node') want = v.lowpoly ? 'lowpoly' : 'icon';
    else if (lodTier === 'model') want = 'lowpoly';
    else if (lodTier === 'hero') want = v.hero ? 'hero' : 'lowpoly';
    else want = asset.defaultVariant;
    if (!v[want]) want = asset.defaultVariant;
    if (!v[want]) { for (var k in v) { if (v.hasOwnProperty(k)) { want = k; break; } } }
    return want && v[want] ? { variantKey: want, variant: v[want] } : null;
  }

  // ── resolveAsset(actor, renderPayload) ──────────────────────────────────────
  function resolveAsset(actor, payload) {
    payload = payload || {};
    var idKey = payload.visualIdentityKey;
    var asset = null, matchLevel;

    if (idKey && _assignments[idKey] && _byId[_assignments[idKey]]) { asset = _byId[_assignments[idKey]]; matchLevel = 'identity'; }
    else if (payload.actorType && _byActorType[payload.actorType]) { asset = _byActorType[payload.actorType]; matchLevel = 'actorType'; }
    else if (payload.silhouetteClass && _bySilhouette[payload.silhouetteClass]) { asset = _bySilhouette[payload.silhouetteClass]; matchLevel = 'silhouette'; }
    else { asset = _byId[GENERIC_ASSET_ID]; matchLevel = 'generic'; }

    _stats.resolved++;
    if (matchLevel !== 'identity') _stats.fallback++;
    _stats.lastResolvedAt = Date.now();

    var vr = _resolveVariant(asset, payload.lodTier);
    if (actor) {
      actor._assetId = asset.id; actor._assetKey = asset.key;
      actor._assetIdentityKey = idKey || null;   // cache invalidation key
    }
    return {
      assetId: asset.id, assetKey: asset.key, assetCategory: asset.category, assetLabel: asset.label,
      assetSource: asset.source, assetEditable: asset.editable,
      variantKey: vr ? vr.variantKey : null,
      renderVariant: vr && vr.variant ? vr.variant.renderVariant : null,
      silhouetteClass: asset.silhouetteClass,
      paletteRef: asset.paletteRef, glyphRef: asset.glyphRef,
      materialClass: asset.materialClass, lightClass: asset.lightClass,
      scaleClass: asset.scaleClass, priorityClass: asset.priorityClass,
      tags: (asset.tags || []).slice(), metadata: asset.metadata || {},
      matchLevel: matchLevel,
    };
  }

  // ── Registry / assignment management ────────────────────────────────────────
  function getAsset(id) { return _byId[id] || null; }
  function listAssets() { return ASSETS.map(function (a) { return a; }); }
  function listByCategory(cat) { return ASSETS.filter(function (a) { return a.category === cat; }); }
  function listAssignments() { var o = {}; for (var k in _assignments) o[k] = _assignments[k]; return o; }
  function registerAsset(asset) {
    if (!asset || !asset.id || !asset.key || !asset.category) return false;
    if (!_byId[asset.id]) ASSETS.push(asset);
    _index(); _stats.registerCount++;
    return true;
  }
  // 0603R — in-memory identity → asset assignment. Returns a result object; never
  // throws for normal user errors. Does NOT mutate asset records.
  function assignIdentity(identityKey, assetId) {
    if (typeof identityKey !== 'string' || !identityKey) return { ok: false, reason: 'invalid_identity_key' };
    if (!_byId[assetId]) return { ok: false, reason: 'asset_not_found' };
    _assignments[identityKey] = assetId;
    _stats.assignmentUpdateCount++;
    return { ok: true, identityKey: identityKey, assetId: assetId, asset: _byId[assetId] };
  }

  // 0603R — restore the default assignment map (in-memory).
  function resetAssignments() {
    _assignments = {};
    for (var k in DEFAULT_ASSIGNMENTS) if (DEFAULT_ASSIGNMENTS.hasOwnProperty(k)) _assignments[k] = DEFAULT_ASSIGNMENTS[k];
    _stats.assignmentUpdateCount++;
    return getState();
  }

  // 0603R — current assignment for an identity (resolved asset record).
  function getAssignment(identityKey) {
    if (!identityKey || !_assignments[identityKey]) return null;
    var assetId = _assignments[identityKey];
    return { identityKey: identityKey, assetId: assetId, asset: _byId[assetId] || null };
  }

  // ── 0603S Persistence — manual export / validate / import (in-memory only) ───
  function exportAssignments() {
    var copy = {};
    for (var k in _assignments) if (_assignments.hasOwnProperty(k)) copy[k] = _assignments[k];   // deep copy (flat strings)
    _stats.lastExportAt = new Date().toISOString();
    return {
      schema: ASSIGNMENT_SCHEMA, version: VERSION, exportedAt: _stats.lastExportAt,
      assignmentCount: Object.keys(copy).length, assignments: copy,
      metadata: { source: 'studio', note: 'Manual export from WOS Studio' },
    };
  }

  // Validate a payload without mutating. Collects invalid entries (no throw).
  function validateAssignments(payload) {
    var out = { ok: false, reason: null, validCount: 0, invalidCount: 0, invalid: [] };
    if (!payload || typeof payload !== 'object') { out.reason = 'invalid_payload'; return out; }
    if (payload.schema !== ASSIGNMENT_SCHEMA) { out.reason = 'invalid_schema'; return out; }
    if (!payload.assignments || typeof payload.assignments !== 'object') { out.reason = 'missing_assignments'; return out; }
    var a = payload.assignments;
    for (var key in a) {
      if (!a.hasOwnProperty(key)) continue;
      var assetId = a[key];
      if (typeof key !== 'string' || !key) { out.invalid.push({ identityKey: key, assetId: assetId, reason: 'invalid_identity_key' }); continue; }
      if (typeof assetId !== 'string' || !_byId[assetId]) { out.invalid.push({ identityKey: key, assetId: assetId, reason: 'asset_not_found' }); continue; }
      out.validCount++;
    }
    out.invalidCount = out.invalid.length;
    out.ok = true;
    return out;
  }

  // importAssignments(payload, { mode:'merge'|'replace', dryRun:false }). Never throws.
  function importAssignments(payload, options) {
    options = options || {};
    var mode = options.mode === 'replace' ? 'replace' : 'merge';
    var dryRun = options.dryRun === true;
    var v = validateAssignments(payload);
    if (!v.ok) {
      var failRes = { ok: false, reason: v.reason, mode: mode, dryRun: dryRun, appliedCount: 0, skippedCount: 0, invalid: v.invalid, state: getState() };
      _stats.lastImportAt = new Date().toISOString(); _stats.lastImportResult = failRes;
      return failRes;
    }
    var a = payload.assignments, valid = {};
    for (var key in a) {
      if (!a.hasOwnProperty(key)) continue;
      if (typeof key === 'string' && key && typeof a[key] === 'string' && _byId[a[key]]) valid[key] = a[key];
    }
    var appliedCount = Object.keys(valid).length;
    var skippedCount = v.invalid.length;

    if (!dryRun) {
      if (mode === 'replace') { resetAssignments(); }
      for (var vk in valid) if (valid.hasOwnProperty(vk)) _assignments[vk] = valid[vk];
      _stats.assignmentUpdateCount++;
    }
    var res = { ok: true, mode: mode, dryRun: dryRun, appliedCount: appliedCount, skippedCount: skippedCount, invalid: v.invalid, state: getState() };
    _stats.lastImportAt = new Date().toISOString(); _stats.lastImportResult = res;
    return res;
  }

  function getState() {
    return {
      version: VERSION, enabled: _enabled, debug: _debug,
      assetCount: ASSETS.length, assignmentCount: Object.keys(_assignments).length,
      resolvedCount: _stats.resolved, fallbackCount: _stats.fallback,
      registerCount: _stats.registerCount, assignmentUpdateCount: _stats.assignmentUpdateCount,
      lastResolvedAt: _stats.lastResolvedAt, lastError: _stats.lastError,
      lastExportAt: _stats.lastExportAt, lastImportAt: _stats.lastImportAt, lastImportResult: _stats.lastImportResult,
    };
  }
  function setEnabled(on) { _enabled = on !== false; return _enabled; }
  function setDebug(on) { _debug = on !== false; return _debug; }

  SBE.ActorAssetLibraryAuthority = Object.freeze({
    VERSION:         VERSION,
    resolveAsset:    resolveAsset,
    getAsset:        getAsset,
    listAssets:      listAssets,
    listByCategory:  listByCategory,
    listAssignments: listAssignments,
    registerAsset:   registerAsset,
    assignIdentity:  assignIdentity,
    resetAssignments: resetAssignments,
    getAssignment:   getAssignment,
    exportAssignments:   exportAssignments,
    validateAssignments: validateAssignments,
    importAssignments:   importAssignments,
    getState:        getState,
    setEnabled:      setEnabled,
    setDebug:        setDebug,
  });

  console.log('[ActorAssetLibraryAuthority] v' + VERSION + ' loaded — ' + ASSETS.length + ' assets, ' +
    Object.keys(_assignments).length + ' assignments');
})(window);
