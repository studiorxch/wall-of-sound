// ── SubwayTrackStructureAuthority v1.0.0 ─────────────────────────────────────
// Read-only Subway Track Structure Authority / Data Source investigation
// (2026-08-26) — infrastructure TRUTH only. This module answers "what kind of
// physical right-of-way is this stretch of track" (underground, elevated,
// at_grade, open_cut, embankment, or unknown) from a real, official source —
// it has no opinion on rendering, altitude math, visibility/LOD, camera
// behavior, or audio, and none of those systems call into it yet (explicit
// scope boundary for this pass).
//
// Source of truth: the official NYC Subway Lines dataset (ROW_TYPE field),
// steward New York City Office of Technology and Innovation / NYC Department
// of City Planning. Loaded from a pre-generated, offline-joined snapshot
// (wall/data/subway/mtaSubwayTrackStructureSnapshot.json) — this module never
// depends on NYC Open Data or any external network availability at runtime.
// See wall/data/subway/acquireTrackStructureSnapshot.js for exactly how that
// snapshot was produced (spatial join against this app's own GTFS shapes in
// mtaSubwayStaticSnapshot.json) and its full real join-quality numbers.
//
// The snapshot preserves the OFFICIAL 8-value ROW_TYPE taxonomy
// (1 Subterranean .. 8 Subterranean Coincident with Boundary) on every
// segment record — never collapsed — alongside a separate normalized
// StudioRich structureType. See getRowTypeTaxonomy()/NORMALIZED_STRUCTURE_TYPES.
//
// FROM_LEVEL_CODE/TO_LEVEL_CODE are carried through raw, uninterpreted (the
// snapshot's own acquisition script found their numeric ranges overlap across
// every ROW_TYPE category — they are NOT a simple universal above/below-grade
// scale as initially assumed from the source's own field description; treat
// them as opaque provenance for now, not ready-to-use altitude/depth values).
//
// Lookup API — classifyForShapeSegment() is primary (exact, keyed by the same
// shapeId/fromIdx/toIdx convention SubwayTrainMotionModel's own shapeSegment
// already uses); classifyPosition() is a secondary coordinate-based fallback,
// intentionally slower and less precise since nearby parallel real lines can
// make nearest-coordinate classification ambiguous in a way an exact
// shape-segment lookup cannot be.
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var SNAPSHOT_URL = (function () {
    try {
      var scripts = global.document ? global.document.getElementsByTagName('script') : null;
      var scriptUrl = null;
      if (scripts) {
        for (var i = 0; i < scripts.length; i++) {
          if (scripts[i].src && scripts[i].src.indexOf('subwayTrackStructureAuthority.js') !== -1) { scriptUrl = scripts[i].src; break; }
        }
      }
      if (scriptUrl) return new global.URL('../../data/subway/mtaSubwayTrackStructureSnapshot.json', scriptUrl).href;
    } catch (e) {}
    return './data/subway/mtaSubwayTrackStructureSnapshot.json'; // fallback — only correct when loaded from wall/'s own page
  })();

  var NORMALIZED_STRUCTURE_TYPES = Object.freeze(['underground', 'elevated', 'at_grade', 'open_cut', 'embankment', 'unknown']);

  var UNKNOWN_RESULT = Object.freeze({
    structureType: 'unknown',
    sourceRowType: null,
    sourceRowTypeName: null,
    fromLevelCode: null,
    toLevelCode: null,
    line: null,
    route: null,
    division: null,
    confidence: 'none',
    ambiguous: false,
    transitionBoundary: false,
    source: 'unmatched',
    distM: null,
  });

  // ── Load state ───────────────────────────────────────────────────────────
  var _loadPromise = null;
  var _loaded = false;
  var _loadError = null;
  var _snapshot = null;
  var _segmentsByShapeId = null; // shapeId -> array of segment records, sorted by fromIdx

  function _indexSnapshot(snapshot) {
    var byShape = {};
    (snapshot.segments || []).forEach(function (seg) {
      if (!byShape[seg.shapeId]) byShape[seg.shapeId] = [];
      byShape[seg.shapeId].push(seg);
    });
    Object.keys(byShape).forEach(function (shapeId) {
      byShape[shapeId].sort(function (a, b) { return a.fromIdx - b.fromIdx; });
    });
    return byShape;
  }

  function load() {
    if (_loadPromise) return _loadPromise;
    _loadPromise = global.fetch(SNAPSHOT_URL)
      .then(function (resp) {
        if (!resp.ok) throw new Error('fetch_failed: HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (json) {
        _snapshot = json;
        _segmentsByShapeId = _indexSnapshot(json);
        _loaded = true;
        console.log('[SubwayTrackStructureAuthority] loaded — ' + (json.segments ? json.segments.length : 0) +
          ' segments, source: ' + (json.sourceDataset ? json.sourceDataset.name : 'unknown'));
        return { ok: true };
      })
      .catch(function (err) {
        _loadError = err && err.message ? err.message : String(err);
        console.warn('[SubwayTrackStructureAuthority] load failed:', _loadError);
        return { ok: false, reason: _loadError };
      });
    return _loadPromise;
  }

  function isLoaded() { return _loaded; }

  function _segmentToResult(seg, extra) {
    var out = {
      structureType: seg.structureType,
      sourceRowType: seg.sourceRowType,
      sourceRowTypeName: seg.sourceRowTypeName,
      fromLevelCode: seg.fromLevelCode,
      toLevelCode: seg.toLevelCode,
      line: seg.line,
      route: seg.route,
      division: seg.division,
      confidence: seg.confidence,
      ambiguous: seg.ambiguous,
      transitionBoundary: seg.transitionBoundary,
      source: 'shapeSegment',
      distM: seg.avgDistM,
    };
    if (extra) Object.keys(extra).forEach(function (k) { out[k] = extra[k]; });
    return out;
  }

  // Primary lookup — exact, keyed by the same {shapeId, fromIdx, toIdx}
  // convention SubwayTrainMotionModel's own shapeSegment already uses.
  // Ranges are inclusive point indices, matching that convention.
  // Overlap semantics: a stored authority segment "covers" the query range if
  // it shares ANY index with it. If the query range spans a real structure
  // transition (covers indices from more than one stored segment), the
  // stored segment with the GREATEST overlap wins — never silently averaged
  // or first-wins, since that could hide a genuine short elevated/underground
  // portal stretch inside a longer at-grade query range.
  function classifyForShapeSegment(shapeId, fromIdx, toIdx) {
    if (!_loaded || !shapeId || typeof fromIdx !== 'number' || typeof toIdx !== 'number') {
      return Object.assign({}, UNKNOWN_RESULT, { source: _loaded ? 'no_query' : 'not_loaded' });
    }
    var lo = Math.min(fromIdx, toIdx), hi = Math.max(fromIdx, toIdx);
    var candidates = _segmentsByShapeId[shapeId];
    if (!candidates || !candidates.length) {
      return Object.assign({}, UNKNOWN_RESULT, { source: 'shape_not_in_snapshot' });
    }
    var best = null, bestOverlap = -1;
    for (var i = 0; i < candidates.length; i++) {
      var seg = candidates[i];
      var overlapLo = Math.max(lo, seg.fromIdx), overlapHi = Math.min(hi, seg.toIdx);
      var overlap = overlapHi - overlapLo + 1;
      if (overlap > bestOverlap) { bestOverlap = overlap; best = seg; }
    }
    if (!best || bestOverlap <= 0) {
      return Object.assign({}, UNKNOWN_RESULT, { source: 'no_overlapping_segment' });
    }
    return _segmentToResult(best, { queryOverlapPoints: bestOverlap });
  }

  // Secondary, coordinate-based fallback — intentionally slower/less precise.
  // Searches every stored segment's own underlying GTFS shape points (via
  // MTASubwayStaticAdapter.getShapePoints(), never re-fetching the shapes
  // itself) for the nearest point to (lon, lat), then returns that segment's
  // classification. Documented explicitly as secondary because nearby
  // parallel real lines can make nearest-coordinate classification ambiguous
  // in a way an exact shapeId/fromIdx/toIdx lookup cannot be — prefer
  // classifyForShapeSegment() whenever the caller already knows which shape
  // segment it's asking about (it almost always does, via
  // SubwayTrainMotionModel's own shapeSegment).
  var MAX_POSITION_MATCH_DIST_M = 60; // beyond this, report unknown rather than a low-confidence guess
  function classifyPosition(lon, lat) {
    if (!_loaded || typeof lon !== 'number' || typeof lat !== 'number') {
      return Object.assign({}, UNKNOWN_RESULT, { source: _loaded ? 'no_query' : 'not_loaded' });
    }
    var adapter = SBE.MTASubwayStaticAdapter;
    if (!adapter || typeof adapter.getShapePoints !== 'function') {
      return Object.assign({}, UNKNOWN_RESULT, { source: 'static_adapter_unavailable' });
    }
    var mPerDegLat = 111320;
    var mPerDegLon = 111320 * Math.cos(lat * Math.PI / 180);
    var bestDistM = Infinity, bestSeg = null;
    var shapeIds = Object.keys(_segmentsByShapeId);
    for (var s = 0; s < shapeIds.length; s++) {
      var shapeId = shapeIds[s];
      var points = adapter.getShapePoints(shapeId); // [[lat,lon], ...] or null
      if (!points) continue;
      var segs = _segmentsByShapeId[shapeId];
      for (var i = 0; i < segs.length; i++) {
        var seg = segs[i];
        var lo = Math.max(0, seg.fromIdx), hi = Math.min(points.length - 1, seg.toIdx);
        for (var p = lo; p <= hi; p++) {
          var dLon = (points[p][1] - lon) * mPerDegLon;
          var dLat = (points[p][0] - lat) * mPerDegLat;
          var d = Math.sqrt(dLon * dLon + dLat * dLat);
          if (d < bestDistM) { bestDistM = d; bestSeg = seg; }
        }
      }
    }
    if (!bestSeg || bestDistM > MAX_POSITION_MATCH_DIST_M) {
      return Object.assign({}, UNKNOWN_RESULT, { source: 'no_match_within_range', distM: isFinite(bestDistM) ? bestDistM : null });
    }
    return _segmentToResult(bestSeg, { source: 'position', distM: Math.round(bestDistM * 100) / 100 });
  }

  function getRowTypeTaxonomy() {
    return _snapshot && _snapshot.rowTypeNames ? Object.assign({}, _snapshot.rowTypeNames) : null;
  }

  function getNormalizedStructureTypes() { return NORMALIZED_STRUCTURE_TYPES.slice(); }

  function getDiagnostics() {
    return {
      loaded: _loaded,
      loadError: _loadError,
      segmentCount: _snapshot && _snapshot.segments ? _snapshot.segments.length : 0,
      shapeCount: _segmentsByShapeId ? Object.keys(_segmentsByShapeId).length : 0,
      sourceDataset: _snapshot ? _snapshot.sourceDataset : null,
      joinStats: _snapshot ? _snapshot.stats : null,
    };
  }

  // Diagnostic-only, mirrors this codebase's own convention — returns a copy,
  // never the live reference, and never mutates snapshot state.
  function getRawSnapshotForTests() { return _snapshot ? JSON.parse(JSON.stringify(_snapshot)) : null; }

  SBE.SubwayTrackStructureAuthority = Object.freeze({
    VERSION: VERSION,
    load: load,
    isLoaded: isLoaded,
    classifyForShapeSegment: classifyForShapeSegment,
    classifyPosition: classifyPosition,
    getRowTypeTaxonomy: getRowTypeTaxonomy,
    getNormalizedStructureTypes: getNormalizedStructureTypes,
    getDiagnostics: getDiagnostics,
    __getRawSnapshotForTests: getRawSnapshotForTests,
    __setSnapshotForTests: function (snapshot) { _snapshot = snapshot; _segmentsByShapeId = _indexSnapshot(snapshot); _loaded = true; },
    __resetForTests: function () { _loadPromise = null; _loaded = false; _loadError = null; _snapshot = null; _segmentsByShapeId = null; },
  });

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.subwayTrackStructure = global._wos.debug.subwayTrackStructure || {};
  global._wos.debug.subwayTrackStructure.status = getDiagnostics;
  global._wos.debug.subwayTrackStructure.classifyForShapeSegment = classifyForShapeSegment;
  global._wos.debug.subwayTrackStructure.classifyPosition = classifyPosition;

  console.log('[SubwayTrackStructureAuthority] v' + VERSION + ' loaded');
})(window);
