# 0601R_WOS_RoadBoundTrafficShowcase_v1.0.0_BUILD

## Goal

Replace the current traffic showcase grid with road-bound placement.

Current issue:

```txt
trafficShowcase(24)
```

spawns cars in a visible grid around the hero/map center. This proves multi-actor rendering, but it does not prove world traffic.

New goal:

```txt
spawn showcase cars along nearby road/path geometry
```

using existing map data where possible.

---

## Scope

Debug/showcase only.

Do not build full traffic simulation.

Do not fix overpasses/underpasses.

Do not change:

```txt
WorldSpaceVehicleLayer render lifecycle
modelMatrix transform path
hard remount logic
styledata debounce
hero routing
camera runtime
```

The existing layer already supports multiple vehicle meshes and per-object scenes. Preserve that.

---

# Required Changes

## A — Add Road Candidate Query

In `worldSpaceVehicleDebug.js`, add helper:

```js
function _queryRoadFeaturesNearCenter(limit) {
  var mvr = _mvr();
  var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
  if (!map || typeof map.queryRenderedFeatures !== 'function') return [];

  var canvas = map.getCanvas();
  var w = canvas.clientWidth;
  var h = canvas.clientHeight;

  var bbox = [
    [Math.round(w * 0.20), Math.round(h * 0.20)],
    [Math.round(w * 0.80), Math.round(h * 0.80)]
  ];

  var features = map.queryRenderedFeatures(bbox).filter(function (f) {
    var type = f.geometry && f.geometry.type;
    var props = f.properties || {};
    var layerId = f.layer && f.layer.id || '';

    return (
      (type === 'LineString' || type === 'MultiLineString') &&
      (
        /road|street|motorway|highway|bridge|tunnel|ramp|route/i.test(layerId) ||
        /road|street|motorway|highway|bridge|tunnel|ramp|route/i.test(JSON.stringify(props))
      )
    );
  });

  return features.slice(0, limit || 80);
}
```

---

## B — Extract Road Coordinates

Add:

```js
function _featureLineCoords(feature) {
  if (!feature || !feature.geometry) return [];

  if (feature.geometry.type === 'LineString') {
    return feature.geometry.coordinates || [];
  }

  if (feature.geometry.type === 'MultiLineString') {
    var out = [];
    (feature.geometry.coordinates || []).forEach(function (line) {
      if (line && line.length) out = out.concat(line);
    });
    return out;
  }

  return [];
}
```

---

## C — Sample Points Along Roads

Add:

```js
function _sampleRoadTrafficPoints(count) {
  var features = _queryRoadFeaturesNearCenter(120);
  var points = [];

  features.forEach(function (feature) {
    var coords = _featureLineCoords(feature);
    if (!coords || coords.length < 2) return;

    for (var i = 0; i < coords.length - 1; i += 2) {
      var a = coords[i];
      var b = coords[i + 1];
      if (!a || !b) continue;

      var lng = (a[0] + b[0]) / 2;
      var lat = (a[1] + b[1]) / 2;

      var heading = Math.atan2(
        b[0] - a[0],
        b[1] - a[1]
      ) * 180 / Math.PI;

      points.push({
        lat: lat,
        lng: lng,
        headingDeg: heading,
        layerId: feature.layer && feature.layer.id || null
      });

      if (points.length >= count) return;
    }
  });

  return points.slice(0, count);
}
```

---

## D — Replace Grid Placement In `trafficShowcase(count)`

Current behavior:

```txt
deterministic grid around hero/map center
```

Replace with:

```txt
road-bound sampled points first
fallback to old grid only if no road points found
```

Pseudo:

```js
var points = _sampleRoadTrafficPoints(count);

if (!points.length) {
  console.warn('[worldVehicles] no road features found — falling back to grid showcase');
  points = _gridTrafficPoints(anchor, count);
}
```

For each point:

```js
wsl.upsertVehicle({
  id: id,
  actorType: actorType,
  variant: variant,
  lat: point.lat,
  lng: point.lng,
  headingDeg: point.headingDeg,
  scale: 1,
  visible: true,
  source: 'showcase-road'
});
```

---

## E — Add Debug Report

After spawning, print:

```txt
road features sampled
road-bound vehicles placed
fallback used true/false
first 5 layer ids
```

Example:

```js
console.log('[worldVehicles] trafficShowcase road-bound —',
  'placed:', placed,
  '| fallback:', fallbackUsed,
  '| layers:', sampledLayers.slice(0, 5)
);
```

---

# Acceptance Criteria

## Pass

Running:

```js
_wos.debug.worldVehicles.clearTrafficShowcase()
_wos.debug.worldVehicles.trafficShowcase(40)
```

shows cars placed on visible roads/ramps/bridges instead of a grid.

Expected:

```txt
showcase cars align with road network
headings roughly match road direction
no hero replacement
renderedCount increases
```

## Acceptable Fallback

If no road line features are returned:

```txt
fallback grid is used
warning prints clearly
```

## Failure

Any of:

```txt
cars still spawn in grid when road features exist
hero disappears
render lifecycle changes
remount spam returns
traffic replaces hero
```

---

# Important Notes

This is not yet true traffic logic.

This is only:

```txt
road-bound actor placement
```

The next separate pass can add:

```txt
lane offsets
road filtering
movement along sampled polyline
grade separation tagging
```

Do not solve those in this patch.