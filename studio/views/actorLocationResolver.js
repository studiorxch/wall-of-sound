// ── WOS Actor Location Resolver ───────────────────────────────────────────────
// 0615B_WOS_StudioActorLocationIntelligencePass_v1.0.0_BUILD
//
// Resolves placed actor anchor coordinates into human-readable map geography
// using the Studio Mapbox rendered feature query API.
//
// Owns:
//   - Mapbox rendered feature query around actor anchor
//   - Location summary generation (borough, neighborhood, road, place, water)
//   - Authoring-session cache (never written to manifests or Wall bundles)
//
// Does NOT own:
//   - Actor selection / placement / persistence
//   - Promotion state
//   - Reverse geocoding (no network calls)
//   - Wall runtime loading
//   - Mapbox style authority
//
// Security: location summaries are never written to WOSActorManifest or
// wos-wall-runtime-bundle.json. They are ephemeral per authoring session.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var _map   = null;
  var _store = null;
  var _cache = {};          // objectId → WOSActorLocationSummary
  var _ready = false;
  var _lastResolvedAt = null;

  var DEFAULT_RADIUS_PX  = 24;
  var FALLBACK_RADIUS_PX = 64;

  var BOROUGH_NAMES = ['manhattan', 'brooklyn', 'queens', 'bronx', 'staten island'];

  // ── Feature classification ────────────────────────────────────────────────────
  function _classifyFeature(feature) {
    var props  = feature.properties || {};
    var layerId = (feature.layer && feature.layer.id) || '';
    var name   = props.name_en || props.name || null;
    if (!name || typeof name !== 'string' || !name.trim()) return null;

    var lid = layerId.toLowerCase();
    var cls = (props['class'] || props['type'] || '').toLowerCase();
    var type;

    if (lid.indexOf('place')     !== -1 || lid.indexOf('settlement') !== -1 ||
        lid.indexOf('locality')  !== -1 || lid.indexOf('country')    !== -1 ||
        lid.indexOf('state')     !== -1) {
      type = 'place';
    } else if (lid.indexOf('neighborhood') !== -1 || lid.indexOf('neighbour') !== -1 ||
               lid.indexOf('suburb')       !== -1) {
      type = 'neighborhood';
    } else if (lid.indexOf('road')   !== -1 || lid.indexOf('street') !== -1 ||
               lid.indexOf('bridge') !== -1 || lid.indexOf('tunnel') !== -1 ||
               lid.indexOf('ferry')  !== -1) {
      type = 'road';
    } else if (lid.indexOf('poi')      !== -1 || lid.indexOf('park')     !== -1 ||
               lid.indexOf('landmark') !== -1 || lid.indexOf('transit')  !== -1) {
      type = 'poi';
    } else if (lid.indexOf('water')  !== -1 || lid.indexOf('ocean') !== -1 ||
               lid.indexOf('river')  !== -1 || lid.indexOf('lake')  !== -1 ||
               lid.indexOf('bay')    !== -1) {
      type = 'water';
    } else if (lid.indexOf('building') !== -1) {
      type = 'building';
    } else {
      // Classify from feature class / type field
      if (cls === 'borough' || cls === 'city' || cls === 'town' ||
          cls === 'village' || cls === 'locality' || cls === 'district') {
        type = 'place';
      } else if (cls === 'neighborhood' || cls === 'suburb') {
        type = 'neighborhood';
      } else if (cls === 'street'   || cls === 'road'      || cls === 'motorway' ||
                 cls === 'trunk'    || cls === 'primary'   || cls === 'secondary' ||
                 cls === 'tertiary' || cls === 'service'   || cls === 'path'      ||
                 cls === 'ferry'    || cls === 'bridge'    || cls === 'tunnel') {
        type = 'road';
      } else if (cls === 'park'      || cls === 'garden'  || cls === 'stadium' ||
                 cls === 'pier'      || cls === 'pitch'   || cls === 'plaza'   ||
                 cls === 'recreation_area') {
        type = 'poi';
      } else if (cls === 'ocean'  || cls === 'river'   || cls === 'lake' ||
                 cls === 'water'  || cls === 'reservoir'|| cls === 'bay'  ||
                 cls === 'strait' || cls === 'canal'   || cls === 'creek') {
        type = 'water';
      } else {
        type = 'unknown';
      }
    }

    return { name: name.trim(), type: type, layerId: layerId, cls: cls, props: props };
  }

  // ── Rendered feature query ────────────────────────────────────────────────────
  function _queryFeatures(lat, lon, radiusPx) {
    if (!_map) return [];
    try {
      var pt = _map.project([lon, lat]);
      var r  = radiusPx || DEFAULT_RADIUS_PX;
      return _map.queryRenderedFeatures([
        [pt.x - r, pt.y - r],
        [pt.x + r, pt.y + r]
      ]) || [];
    } catch (e) {
      return [];
    }
  }

  // ── Summary builder ───────────────────────────────────────────────────────────
  function _buildSummary(objectId, lat, lon, features) {
    var borough             = null;
    var neighborhood        = null;
    var locality            = null;
    var nearestRoad         = null;
    var nearestPlace        = null;
    var nearestBuildingName = null;
    var waterbody           = null;

    // Classify + de-dupe
    var seen = {};
    var classified = [];
    features.forEach(function (f) {
      var c = _classifyFeature(f);
      if (!c) return;
      if (seen[c.name]) return;
      seen[c.name] = true;
      classified.push(c);
    });

    // Extract geography fields in one pass
    classified.forEach(function (c) {
      var nameLower = c.name.toLowerCase();
      if (c.type === 'place') {
        if (BOROUGH_NAMES.indexOf(nameLower) !== -1) {
          if (!borough) borough = c.name;
        } else if (!locality) {
          locality = c.name;
        }
      } else if (c.type === 'neighborhood') {
        if (!neighborhood) neighborhood = c.name;
      } else if (c.type === 'road') {
        if (!nearestRoad) nearestRoad = c.name;
      } else if (c.type === 'poi') {
        if (!nearestPlace) nearestPlace = c.name;
      } else if (c.type === 'water') {
        if (!waterbody) waterbody = c.name;
      } else if (c.type === 'building') {
        if (!nearestBuildingName) nearestBuildingName = c.name;
      }
    });

    // Confidence
    var confidence;
    if ((neighborhood || locality) && nearestRoad) confidence = 'high';
    else if (neighborhood || locality || borough)  confidence = 'medium';
    else if (nearestRoad || nearestPlace)          confidence = 'low';
    else                                           confidence = 'unknown';

    // Summary string: "Neighborhood, Borough · near Road"
    var primary   = neighborhood || locality;
    var locParts  = [];
    if (primary)                       locParts.push(primary);
    if (borough && borough !== primary) locParts.push(borough);

    var secondaryParts = [];
    if (nearestRoad)        secondaryParts.push('near ' + nearestRoad);
    else if (nearestPlace)  secondaryParts.push('near ' + nearestPlace);

    var summary;
    if (locParts.length === 0 && secondaryParts.length === 0) {
      summary = lat.toFixed(4) + ', ' + lon.toFixed(4);
    } else {
      summary = locParts.join(', ');
      if (secondaryParts.length) summary += (summary ? ' · ' : '') + secondaryParts.join(', ');
    }

    // Short label for marker
    var shortLabel = neighborhood || locality || borough || null;

    // Full search text (lowercase, space-joined)
    var searchTerms = [
      borough, neighborhood, locality,
      nearestRoad, nearestPlace, nearestBuildingName, waterbody,
      lat.toFixed(4), lon.toFixed(4),
    ].filter(Boolean);
    var searchText = searchTerms.join(' ').toLowerCase();

    return {
      objectId:            objectId || null,
      resolvedAt:          new Date().toISOString(),
      lat:                 lat,
      lon:                 lon,
      borough:             borough,
      neighborhood:        neighborhood,
      locality:            locality,
      nearestRoad:         nearestRoad,
      nearestPlace:        nearestPlace,
      nearestBuildingName: nearestBuildingName,
      waterbody:           waterbody,
      landmark:            null,
      summary:             summary,
      shortLabel:          shortLabel,
      searchText:          searchText,
      confidence:          confidence,
      source:              features.length > 0 ? 'rendered-features' : 'fallback-coordinates',
      rawFeatureCount:     features.length,
    };
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  function init(map, store) {
    _map   = map;
    _store = store;
    _ready = true;
    console.log('[WOSActorLocationResolver] initialized');
  }

  // Resolve a raw lat/lon (no objectId, no cache write)
  function resolvePoint(lat, lon, options) {
    options  = options || {};
    var features = _queryFeatures(lat, lon, options.radius || DEFAULT_RADIUS_PX);
    if (features.length === 0) {
      features = _queryFeatures(lat, lon, options.radiusFallback || FALLBACK_RADIUS_PX);
    }
    return _buildSummary(null, lat, lon, features);
  }

  // Resolve an actor (by object or objectId), write to cache
  function resolveActor(actorOrObjectId, options) {
    var actor;
    if (typeof actorOrObjectId === 'string') {
      actor = _store && _store.get(actorOrObjectId);
    } else {
      actor = actorOrObjectId;
    }
    if (!actor || !actor.anchor) return null;

    var summary = resolvePoint(actor.anchor.lat, actor.anchor.lon, options);
    summary.objectId = actor.objectId;
    _cache[actor.objectId] = summary;
    _lastResolvedAt = summary.resolvedAt;

    // Notify library rows + inspector to refresh with new location data
    document.dispatchEvent(new CustomEvent('wos:location-resolved', {
      detail: { objectId: actor.objectId, summary: summary }
    }));

    return summary;
  }

  // Get cached summary for an actor
  function get(objectId) {
    return _cache[objectId] || null;
  }

  // Clear cache for one actor (or all if no objectId given)
  function clear(objectId) {
    if (objectId) { delete _cache[objectId]; }
    else          { _cache = {}; }
  }

  // Re-resolve all actors currently in the store
  function resync() {
    if (!_store || !_map) return 0;
    var actors = _store.list();
    actors.forEach(function (a) { resolveActor(a); });
    return actors.length;
  }

  function debugSnapshot() {
    var actorEntries = Object.keys(_cache).map(function (id) {
      var s = _cache[id];
      return {
        objectId:        id,
        summary:         s.summary,
        confidence:      s.confidence,
        rawFeatureCount: s.rawFeatureCount,
      };
    });
    var unresolvedCount = 0;
    if (_store) {
      _store.list().forEach(function (a) {
        if (!_cache[a.objectId]) unresolvedCount++;
      });
    }
    return {
      ready:           _ready,
      cachedCount:     actorEntries.length,
      unresolvedCount: unresolvedCount,
      lastResolvedAt:  _lastResolvedAt,
      actors:          actorEntries,
    };
  }

  global.WOSActorLocationResolver = {
    init:          init,
    resolveActor:  resolveActor,
    resolvePoint:  resolvePoint,
    get:           get,
    clear:         clear,
    resync:        resync,
    debugSnapshot: debugSnapshot,
  };
  console.log('[WOSActorLocationResolver] ready');
})(window);
