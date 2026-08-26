#!/usr/bin/env node
// ── acquireTrackStructureSnapshot.js ────────────────────────────────────────
// Offline, one-time acquisition/join script — NOT part of the browser runtime
// bundle (never referenced from wall/index.html). Run manually with `node`
// whenever the source dataset needs refreshing.
//
// Produces wall/data/subway/mtaSubwayTrackStructureSnapshot.json by spatially
// joining the real-world NYC Subway Lines ROW_TYPE dataset (official City of
// New York / NYC Department of City Planning source, maintained by
// maps.nyc.data) against this app's own already-bundled GTFS shapes in
// wall/data/subway/mtaSubwayStaticSnapshot.json.
//
// ── Source dataset ───────────────────────────────────────────────────────
// Canonical listing: https://data.cityofnewyork.us/Transportation/Subway-Lines/3qz8-muuu
// Metadata: https://github.com/CityOfNewYork/nyc-geo-metadata/blob/main/Metadata/Metadata_SubwayLines.md
// The canonical NYC Open Data (Socrata) host was not reachable from the
// environment this script was first run in; the same underlying dataset is
// also published as a live ArcGIS Feature Service by the official
// "maps.nyc.data" account:
//   Item:    https://www.arcgis.com/home/item.html?id=d2aff75c6bc64e60ad19d1eafdb13816
//   Service: https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/Subway_view/FeatureServer
// Query used to pull the raw data (5,801 features, verified against the
// service's own returnCountOnly=true count):
//   {service}/0/query?where=1=1&outFields=*&returnGeometry=true&outSR=4326&f=geojson
//   (paginated via resultOffset/resultRecordCount=2000, orderByFields=OBJECTID)
// Raw pulled data archived at:
//   WOS-share/SUBWAY/IMPORT/NYC_Subway_Lines_ROW_TYPE_raw_query_2026-08-26.geojson
//   (git-ignored, not committed — re-run the query above to reproduce)
//
// ── What this script does NOT do ─────────────────────────────────────────
// - Does not wire this data into any consumer. This is a pure data-generation
//   step for SubwayTrackStructureAuthority's own snapshot.
// - Does not collapse the official 8-value ROW_TYPE taxonomy — both the raw
//   ROW_TYPE code and a separate normalized structureType are preserved.
// - Does not invent altitude/depth constants — FROM_LEVEL_CODE/TO_LEVEL_CODE
//   are carried through raw, uninterpreted, for future work.
//
// ── Method ────────────────────────────────────────────────────────────────
// 1. Filter source features to RAIL_TYPE='1' (true subway) — RAIL_TYPE='2' is
//    Staten Island Railway (395 features, no DIVISION), out of scope this pass
//    since it isn't part of this app's own "subway" GTFS shapes join target
//    in any case that matters yet. A future pass could join SIR separately.
// 2. Expand each source feature's polyline into 2-point line segments,
//    preserving the parent feature's attributes on each.
// 3. Build a coarse spatial grid index over those segments (~0.005deg cells)
//    for tractable nearest-neighbor queries — 150,744 GTFS points against
//    5,406 source features is not tractable as a naive O(n*m) scan.
// 4. For every point of every GTFS shape (wall/data/subway/mtaSubwayStaticSnapshot.json's
//    own `shapes` — the exact same shapes SubwayTrainMotionModel/
//    subway3DTrainActorLayer already consume), find the nearest source line
//    segment. Beyond UNMATCHED_THRESHOLD_M, the point is left unclassified
//    ('unknown') rather than forced to a distant, untrustworthy match.
// 5. Distinguish two very different kinds of "nearby conflicting ROW_TYPE"
//    signal, since conflating them produced a misleadingly high ambiguous
//    rate (72% of segments) in this script's own first draft:
//      - transitionBoundary: the next-nearest conflicting candidate belongs
//        to the SAME real line — expected and benign (e.g. a tunnel portal,
//        where a line legitimately changes structure type over a short
//        span; that line's own adjacent micro-segments will always look
//        "close" right at the seam).
//      - ambiguous (crossLineAmbiguous): the next-nearest conflicting
//        candidate belongs to a DIFFERENT real line — the genuine risk of
//        nearby/parallel unrelated lines being cross-matched. Only this one
//        is surfaced as `ambiguous` in the output.
// 6. Compress consecutive same-classification points per shape into
//    contiguous segments — {shapeId, fromIdx, toIdx} — matching
//    SubwayTrainMotionModel's own shapeSegment.fromIdx/toIdx convention, so
//    SubwayTrackStructureAuthority.classifyForShapeSegment() can look these
//    up directly without any unit conversion.
//
// Verified via a proof-of-join on 6 representative real segments before this
// full run: Union Square (Subterranean), Queensboro Plaza (Elevated), Dyre
// Ave Line (Surface), Sea Beach Line (Open Cut Depression), Brighton Line
// (Embankment), Flushing Line (Viaduct) — all matched correctly, all
// non-ambiguous, all consistent with well-documented real-world structure.

var fs = require('fs');
var path = require('path');

var RAW_SOURCE_PATH = path.join(__dirname, '..', '..', '..', 'WOS-share', 'SUBWAY', 'IMPORT', 'NYC_Subway_Lines_ROW_TYPE_raw_query_2026-08-26.geojson');
var STATIC_SNAPSHOT_PATH = path.join(__dirname, 'mtaSubwayStaticSnapshot.json');
var OUTPUT_PATH = path.join(__dirname, 'mtaSubwayTrackStructureSnapshot.json');

var SOURCE_DATASET_NAME = 'NYC Subway Lines (ROW_TYPE)';
var SOURCE_DATASET_CANONICAL_URL = 'https://data.cityofnewyork.us/Transportation/Subway-Lines/3qz8-muuu';
var SOURCE_DATASET_ID = '3qz8-muuu';
var SOURCE_SERVICE_URL = 'https://services6.arcgis.com/yG5s3afENB5iO9fj/arcgis/rest/services/Subway_view/FeatureServer/0';
var SOURCE_CRS = 'EPSG:4326';

var ROW_TYPE_NAMES = {
  '1': 'Subterranean', '2': 'Elevated', '3': 'Surface', '4': 'Hidden',
  '5': 'Open Cut Depression', '6': 'Embankment', '7': 'Viaduct', '8': 'Subterranean Coincident with Boundary'
};
// Approved normalized mapping — preserves Open Cut Depression and Embankment
// as their own distinct StudioRich categories rather than collapsing them.
var NORMALIZED_MAP = {
  '1': 'underground', '2': 'elevated', '3': 'at_grade', '4': 'underground',
  '5': 'open_cut', '6': 'embankment', '7': 'elevated', '8': 'underground'
};

var CONFIDENCE_MATCH_M = 20;
var CONFIDENCE_NEAR_M = 60;
var UNMATCHED_THRESHOLD_M = 150;
var AMBIGUITY_BAND_M = 15;

function projectLocal(refLon, refLat, lon, lat) {
  var mPerDegLat = 111320;
  var mPerDegLon = 111320 * Math.cos(refLat * Math.PI / 180);
  return [(lon - refLon) * mPerDegLon, (lat - refLat) * mPerDegLat];
}
function pointToSegmentDistM(px, py, ax, ay, bx, by) {
  var dx = bx - ax, dy = by - ay;
  var lenSq = dx * dx + dy * dy;
  var t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  var cx = ax + t * dx, cy = ay + t * dy;
  var ex = px - cx, ey = py - cy;
  return Math.sqrt(ex * ex + ey * ey);
}

function run() {
  var rawGeojson = JSON.parse(fs.readFileSync(RAW_SOURCE_PATH, 'utf8'));
  var staticSnapshot = JSON.parse(fs.readFileSync(STATIC_SNAPSHOT_PATH, 'utf8'));

  var allFeatures = rawGeojson.features;
  var subwayFeatures = allFeatures.filter(function (f) { return f.properties.RAIL_TYPE === '1'; });

  var maxModifiedDate = subwayFeatures.reduce(function (max, f) {
    var d = f.properties.MODIFIED_DATE;
    return (typeof d === 'number' && d > max) ? d : max;
  }, 0);

  var segments = [];
  subwayFeatures.forEach(function (f) {
    var coords = f.geometry.coordinates;
    for (var i = 0; i < coords.length - 1; i++) {
      var a = coords[i], b = coords[i + 1];
      segments.push({
        lon1: a[0], lat1: a[1], lon2: b[0], lat2: b[1],
        minLon: Math.min(a[0], b[0]), maxLon: Math.max(a[0], b[0]),
        minLat: Math.min(a[1], b[1]), maxLat: Math.max(a[1], b[1]),
        props: f.properties,
      });
    }
  });

  var CELL = 0.005;
  var grid = {};
  segments.forEach(function (seg, idx) {
    var c0x = Math.floor(seg.minLon / CELL), c1x = Math.floor(seg.maxLon / CELL);
    var c0y = Math.floor(seg.minLat / CELL), c1y = Math.floor(seg.maxLat / CELL);
    for (var cx = c0x; cx <= c1x; cx++) {
      for (var cy = c0y; cy <= c1y; cy++) {
        var key = cx + '_' + cy;
        if (!grid[key]) grid[key] = [];
        grid[key].push(idx);
      }
    }
  });

  function nearestCandidates(lon, lat) {
    var cx = Math.floor(lon / CELL), cy = Math.floor(lat / CELL);
    var candidateIdxSet = {};
    var radius = 1, found = false;
    while (!found && radius <= 6) {
      for (var dx = -radius; dx <= radius; dx++) {
        for (var dy = -radius; dy <= radius; dy++) {
          var key = (cx + dx) + '_' + (cy + dy);
          if (grid[key]) { grid[key].forEach(function (i) { candidateIdxSet[i] = true; }); found = true; }
        }
      }
      radius++;
    }
    var idxs = Object.keys(candidateIdxSet).map(Number);
    var results = idxs.map(function (i) {
      var seg = segments[i];
      var a = projectLocal(lon, lat, seg.lon1, seg.lat1);
      var b = projectLocal(lon, lat, seg.lon2, seg.lat2);
      var d = pointToSegmentDistM(0, 0, a[0], a[1], b[0], b[1]);
      return { distM: d, props: seg.props };
    });
    results.sort(function (a, b) { return a.distM - b.distM; });
    return results;
  }

  var shapes = staticSnapshot.shapes;
  var shapeIds = Object.keys(shapes);
  var pointResults = {};
  var stats = {
    totalPoints: 0, matched: 0, unmatched: 0, ambiguousCount: 0,
    confidenceCounts: { high: 0, medium: 0, low: 0, unmatched: 0 },
    rowTypeCounts: {}, normalizedCounts: {},
  };

  shapeIds.forEach(function (shapeId) {
    var pts = shapes[shapeId];
    var results = [];
    for (var i = 0; i < pts.length; i++) {
      var lat = pts[i][0], lon = pts[i][1];
      stats.totalPoints++;
      var cands = nearestCandidates(lon, lat);
      if (!cands.length || cands[0].distM > UNMATCHED_THRESHOLD_M) {
        stats.unmatched++;
        stats.confidenceCounts.unmatched++;
        stats.normalizedCounts['unknown'] = (stats.normalizedCounts['unknown'] || 0) + 1;
        results.push({ idx: i, structureType: 'unknown', sourceRowType: null, distM: cands.length ? cands[0].distM : null, confidence: 'unmatched', ambiguous: false, transitionBoundary: false });
        continue;
      }
      var best = cands[0];
      var differing = cands.filter(function (c) { return c.distM <= best.distM + AMBIGUITY_BAND_M && c.props.ROW_TYPE !== best.props.ROW_TYPE; });
      var transitionBoundary = differing.some(function (c) { return c.props.LINE === best.props.LINE; });
      var crossLineAmbiguous = differing.some(function (c) { return c.props.LINE !== best.props.LINE; });
      if (crossLineAmbiguous) stats.ambiguousCount++;
      var confidence = best.distM <= CONFIDENCE_MATCH_M ? 'high' : (best.distM <= CONFIDENCE_NEAR_M ? 'medium' : 'low');
      stats.confidenceCounts[confidence]++;
      stats.matched++;
      var rt = best.props.ROW_TYPE;
      stats.rowTypeCounts[rt] = (stats.rowTypeCounts[rt] || 0) + 1;
      var norm = NORMALIZED_MAP[rt];
      stats.normalizedCounts[norm] = (stats.normalizedCounts[norm] || 0) + 1;
      results.push({
        idx: i, structureType: norm, sourceRowType: rt, distM: best.distM, confidence: confidence,
        ambiguous: crossLineAmbiguous, transitionBoundary: transitionBoundary,
        fromLevel: best.props.FROM_LEVEL_CODE, toLevel: best.props.TO_LEVEL_CODE,
        line: best.props.LINE, route: best.props.ROUTE, division: best.props.DIVISION, segmentId: best.props.SEGMENTID,
      });
    }
    pointResults[shapeId] = results;
  });

  var outSegments = [];
  shapeIds.forEach(function (shapeId) {
    var results = pointResults[shapeId];
    var runStart = 0;
    for (var i = 1; i <= results.length; i++) {
      var boundary = (i === results.length) ||
        (results[i].structureType !== results[runStart].structureType) ||
        (results[i].sourceRowType !== results[runStart].sourceRowType);
      if (boundary) {
        var runPts = results.slice(runStart, i);
        var avgDist = runPts.reduce(function (s, r) { return s + (r.distM || 0); }, 0) / runPts.length;
        var rep = results[runStart];
        outSegments.push({
          shapeId: shapeId,
          fromIdx: runStart,
          toIdx: i - 1,
          pointCount: runPts.length,
          structureType: rep.structureType,
          sourceRowType: rep.sourceRowType,
          sourceRowTypeName: rep.sourceRowType ? ROW_TYPE_NAMES[rep.sourceRowType] : null,
          fromLevelCode: rep.fromLevel !== undefined ? rep.fromLevel : null,
          toLevelCode: rep.toLevel !== undefined ? rep.toLevel : null,
          line: rep.line || null,
          route: rep.route || null,
          division: rep.division || null,
          confidence: rep.confidence,
          avgDistM: Math.round(avgDist * 100) / 100,
          ambiguous: runPts.some(function (r) { return r.ambiguous; }),
          transitionBoundary: runPts.some(function (r) { return r.transitionBoundary; }),
        });
        runStart = i;
      }
    }
  });

  var snapshot = {
    schemaVersion: '1.0.0',
    generatedAt: '2026-08-26T00:00:00.000Z',
    sourceDataset: {
      name: SOURCE_DATASET_NAME,
      canonicalUrl: SOURCE_DATASET_CANONICAL_URL,
      canonicalDatasetId: SOURCE_DATASET_ID,
      queriedServiceUrl: SOURCE_SERVICE_URL,
      steward: 'New York City Office of Technology and Innovation / NYC Department of City Planning',
      crs: SOURCE_CRS,
      sourceFeatureCountTotal: allFeatures.length,
      sourceFeatureCountSubwayOnly: subwayFeatures.length,
      sourceFeatureCountExcludedSIR: allFeatures.length - subwayFeatures.length,
      sourceMaxModifiedDateMs: maxModifiedDate || null,
      sourceMaxModifiedDateIso: maxModifiedDate ? new Date(maxModifiedDate).toISOString() : null,
      note: 'FROM_LEVEL_CODE/TO_LEVEL_CODE are carried through raw and uninterpreted — ' +
        'their numeric ranges overlap across every ROW_TYPE category in this dataset, so they ' +
        'do NOT appear to be a simple universal above/below-grade scale; treat as opaque ' +
        'provenance pending real investigation, not as ready-to-use altitude/depth values.',
    },
    joinMethod: {
      description: 'Nearest-line-segment spatial join (point-to-segment distance, grid-indexed) ' +
        'between each GTFS shape point and the source dataset\'s subway-only (RAIL_TYPE=1) line segments.',
      confidenceThresholdsM: { high: CONFIDENCE_MATCH_M, medium: CONFIDENCE_NEAR_M, unmatchedBeyond: UNMATCHED_THRESHOLD_M },
      ambiguityBandM: AMBIGUITY_BAND_M,
      ambiguityDefinition: 'A point is "ambiguous" only if a conflicting-ROW_TYPE candidate within the ' +
        'ambiguity band belongs to a DIFFERENT real LINE than the best match. A conflicting candidate ' +
        'from the SAME line is a "transitionBoundary" (expected, e.g. a tunnel portal) and does not count as ambiguous.',
    },
    stats: stats,
    rowTypeNames: ROW_TYPE_NAMES,
    normalizedMap: NORMALIZED_MAP,
    segments: outSegments,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(snapshot));
  console.log('Wrote', outSegments.length, 'segments to', OUTPUT_PATH);
  console.log('Stats:', JSON.stringify(stats, null, 1));
}

run();
