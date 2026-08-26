// ── MTASubwayMapFeatures v1.0.0 ───────────────────────────────────────────────
// 0818_SUBWAY_Live_Data_Foundation_v1.0.0_BUILD — Logic Layer §13
// Status: active | Classification: pure (no Mapbox, no fetch, no DOM)
//
// Converts SBE.MTASubwayTransitStore's canonical state into plain GeoJSON
// FeatureCollections. Deliberately independent of Mapbox — this module could
// feed any renderer (or a future poster/print pipeline; see
// 0818_SUBWAY_Resumption_Audit §13 on poster compatibility). The Mapbox
// integration (mtaSubwayMapLayer.js) only ever reads these FeatureCollections
// and hands them to a Mapbox GeoJSON source — it never touches the store or
// raw protobuf/GTFS rows directly (Store Rule, BUILD §11).
//
// ── NO FAKE MOVEMENT (BUILD §13, hard requirement) ───────────────────────────
// Verified during this build (see mtaSubwayFeedSourceInventory.js /
// mtaSubwayRealtimeAdapter.js headers): current MTA subway VehiclePosition
// entities NEVER carry a `position` (latitude/longitude) field — checked
// across every line group, always null. There is therefore NO literal train
// GPS coordinate to render, and this module never invents one.
//
// What IS genuinely available and IS rendered: a train's real, verified
// `currentStationId` (the canonical station its current_stop_sequence/
// current_status/stop_id fields identify) and `currentStatus`
// (STOPPED_AT / IN_TRANSIT_TO / INCOMING_AT). buildVehiclePresenceFeatures()
// places a marker at that STATION's real, static-GTFS-verified coordinate —
// never an interpolated/smoothed point between stops — and tags every such
// feature `positionSource: 'nearest_verified_stop'` (never `'gps'`) so no
// downstream consumer can mistake it for continuous vehicle telemetry. This
// is the honest "strongest verified realtime state without simulation" the
// BUILD requires when direct coordinates aren't available.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '2.0.0'; // +buildTrainBodyFeatures/buildTrainCarSectionFeatures — 0818_SUBWAY_Train_Rendering_Palette_Library_v1.0.0_BUILD

  function _store() { return SBE.MTASubwayTransitStore || null; }
  function _stationLibrary() { return SBE.MTASubwayStationLibrary || null; }
  function _semanticFamily() { return SBE.MTASubwaySemanticFamily || null; }
  function _paletteAuthority() { return SBE.MTASubwayPaletteAuthority || null; }
  function _rollingStock() { return SBE.SubwayLogicalRollingStockAuthority || null; }
  function _trainVisualState() { return SBE.SubwayTrainVisualState || null; }
  function _motionModel() { return SBE.SubwayTrainMotionModel || null; }

  // ── Directional lane side (Check N-Line Direction/Lane Behavior Against
  //    Working Train Motion) — real forward-travel-derived, never a fixed
  //    NORTH/SOUTH->side guess. ────────────────────────────────────────────
  //
  // ROOT CAUSE (found live, quantified before any code change): the prior
  // implementation applied a FIXED sign per real NYCT direction
  // (directionLaneKey 'A'->+1, 'B'->-1) straight into Mapbox's line-offset.
  // But line-offset is relative to a LineString FEATURE's own vertex order
  // (confirmed empirically live, via a controlled test line — Mapbox's real
  // convention is POSITIVE = RIGHT / NEGATIVE = LEFT of the geometry's own
  // low-index-to-high-index direction, not an absolute compass frame). A
  // train's body polyline (SubwayTrainMotionModel._walkBodyPolyline) always
  // walks a shape's points in increasing-index order regardless of which
  // way the train is actually travelling along it — so a train whose real
  // travel runs toward DECREASING shape index is drawn with its own
  // geometry "backwards" relative to its real motion, and a fixed sign
  // keyed only on NORTH/SOUTH has no way to know that.
  //
  // Live-verified against the N route's real, live-fetched shape
  // (N..S20R — the only shape any real N train ever resolves to, since
  // MTASubwayTransitStore.getRoute('subway:route:N').shapeIds lists it
  // first and it comprehensively covers every real N station with a
  // distance-0 match): every real station's matched index increases
  // strictly monotonically from Astoria-Ditmars Blvd (idx 0) to Coney
  // Island-Stillwell Av (idx 957) — i.e. NORTH is always decreasing-index,
  // SOUTH is always increasing-index, GLOBALLY consistent on this shape.
  // Combined with the corrected Mapbox sign convention, this means the old
  // fixed A=+1/B=-1 code put BOTH real directions on their real LEFT-hand
  // side of travel, not their right — a uniform inversion, not a random
  // per-train flip (a user watching any single train would see it "on the
  // wrong side," exactly as reported).
  //
  // Fix: derive the sign from THIS train's own real forward direction,
  // computed fresh per train/per call — never a route-level or
  // direction-level cached assumption, so a genuine future mid-route
  // shape-orientation anomaly (a different shape, a reversed section) is
  // handled correctly too, not just today's live data.
  function _travelRightSign(store, motion, nextStopId) {
    var seg = motion.shapeSegment;
    if (!seg || !seg.points || seg.points.length < 2) return null;
    if (seg.toIdx !== seg.fromIdx) {
      // Moving: the resolved segment's own index order directly encodes
      // real travel direction (fromIdx = departed/current, toIdx = target).
      // Matches the geometry's own low->high order -> right (+1, per the
      // empirically-confirmed Mapbox convention above); reversed -> left (-1).
      return seg.toIdx > seg.fromIdx ? 1 : -1;
    }
    // Dwelling (fromIdx === toIdx): no directional signal from the segment
    // alone. Derive a real forward tangent from the train's own current
    // position toward its real next stop (both real, already-known
    // values — never a guess), compared against the shape's own local
    // tangent at this index via a plain dot product (only the SIGN of the
    // dot product matters — same general direction vs. opposite).
    if (!nextStopId || !motion.bodyCenter) return null;
    var nextStation = store.getStation(nextStopId);
    if (!nextStation) return null;
    var idx = seg.fromIdx;
    var i0 = Math.max(0, idx - 1), i1 = Math.min(seg.points.length - 1, idx + 1);
    if (i0 === i1) return null;
    var geomDLat = seg.points[i1][0] - seg.points[i0][0], geomDLon = seg.points[i1][1] - seg.points[i0][1];
    var travelDLon = nextStation.longitude - motion.bodyCenter[0], travelDLat = nextStation.latitude - motion.bodyCenter[1];
    var dot = geomDLat * travelDLat + geomDLon * travelDLon;
    if (dot === 0) return null;
    return dot > 0 ? 1 : -1;
  }

  // Resolves a route's semantic family + active-palette display color.
  // Never mutates the route ref; a pure lookup. Returns nulls (not a
  // fabricated default) if either module isn't loaded or the route's real
  // MTA color isn't one of the 10 known values (see mtaSubwaySemanticFamily.js).
  function _resolveDisplayColor(route) {
    var sf = _semanticFamily(), pa = _paletteAuthority();
    var semanticFamily = sf ? sf.familyForRoute(route) : null;
    var resolvedColor = (pa && semanticFamily) ? pa.resolveFamilyColor(semanticFamily) : null;
    return { semanticFamily: semanticFamily, resolvedColor: resolvedColor };
  }

  function _stationFeature(station) {
    return {
      type: 'Feature',
      id: station.id,   // stable — the canonical subway:stop:* id, not an array index
      geometry: { type: 'Point', coordinates: [station.longitude, station.latitude] },
      properties: {
        id: station.id,
        gtfsStopId: station.authoritativeIds.gtfsStopId,
        displayName: station.displayName,
        kind: station.kind,
        complexId: station.complexId,
        parentId: station.parentId,
        routeIds: station.routeIds,
      },
    };
  }

  // Station point features — one per GTFS stop (station-level AND platform),
  // real static-GTFS coordinates. `onlyStationLevel` (default true) excludes
  // directional-platform sub-points, which is what a first-pass commuter map
  // wants (one dot per station, not one per platform direction).
  function buildStationFeatures(opts) {
    var store = _store();
    if (!store) return { type: 'FeatureCollection', features: [] };
    var onlyStationLevel = !opts || opts.onlyStationLevel !== false;
    var routeFilter = opts && opts.routeId ? opts.routeId : null;

    var stations = store.getAllStations().filter(function (s) {
      if (onlyStationLevel && s.kind !== 'station') return false;
      if (routeFilter && s.routeIds.indexOf(routeFilter) === -1) return false;
      return true;
    });

    return { type: 'FeatureCollection', features: stations.map(_stationFeature) };
  }

  // Route line features — one LineString per shape actually referenced by the
  // route (a route usually has several: different branches/directions).
  // Real static-GTFS shapes.txt geometry, unmodified.
  function buildRouteFeatures(routeId) {
    var store = _store();
    if (!store) return { type: 'FeatureCollection', features: [] };
    var route = store.getRoute(routeId);
    if (!route) return { type: 'FeatureCollection', features: [] };

    var display = _resolveDisplayColor(route);
    var features = [];
    route.shapeIds.forEach(function (shapeId) {
      var points = store.getShapePoints(shapeId);
      if (!points || points.length < 2) return; // reject degenerate geometry, don't invent points
      features.push({
        type: 'Feature',
        id: route.id + ':' + shapeId,
        geometry: { type: 'LineString', coordinates: points.map(function (p) { return [p[1], p[0]]; }) }, // [lat,lon] -> [lon,lat]
        properties: {
          routeId: route.id,
          shapeId: shapeId,
          displayName: route.displayName,
          realtimeFeedGroup: route.routeFamily, // e.g. "ace" — NOT the color family; see semanticFamily below
          // Raw MTA-supplied metadata, preserved unmodified.
          sourceColor: route.sourceColor,
          sourceTextColor: route.sourceTextColor,
          // Palette-resolved display color — route identity (routeId) is
          // NEVER derived from this; switching the active palette changes
          // only this field, never routeId/semanticFamily.
          semanticFamily: display.semanticFamily,
          resolvedColor: display.resolvedColor,
        },
      });
    });
    return { type: 'FeatureCollection', features: features };
  }

  // Full-network route lines — one call, every real route, palette-resolved.
  function buildAllRouteFeatures() {
    var store = _store();
    if (!store) return { type: 'FeatureCollection', features: [] };
    var allFeatures = [];
    store.getAllRoutes().forEach(function (route) {
      var fc = buildRouteFeatures(route.id);
      allFeatures = allFeatures.concat(fc.features);
    });
    return { type: 'FeatureCollection', features: allFeatures };
  }

  // Production station layer — sourced from the Station Library, NOT raw
  // GTFS/transit-store data (BUILD §10: "Do not render the production
  // station layer directly from raw GTFS records when a Station Library
  // record exists"). Thin delegation to the Library's own builder — kept
  // here too so map-layer code has one place to import full-network
  // collections from.
  function buildStationLibraryFeatures() {
    var lib = _stationLibrary();
    if (!lib) return { type: 'FeatureCollection', features: [] };
    return lib.buildMapFeatureCollection();
  }

  // One call for the required full-network collections (BUILD §12, extended
  // by 0818_SUBWAY_Logical_Rolling_Stock_v1.0.0_BUILD §23 with logical_trains).
  function buildFullNetworkFeatureCollections() {
    return {
      routes: buildAllRouteFeatures(),
      stations: buildStationLibraryFeatures(),
      live_operational_state: buildVehiclePresenceFeatures(),
      logical_trains: buildLogicalTrainFeatures(),
    };
  }

  // "Vehicle presence" — see header. NEVER a literal GPS position.
  function buildVehiclePresenceFeatures(routeId) {
    var store = _store();
    if (!store) return { type: 'FeatureCollection', features: [] };
    var vehicles = routeId ? store.getVehiclesForRoute(routeId) : store.getAllVehicles();

    var features = [];
    vehicles.forEach(function (v) {
      if (!v.currentStationId) return; // no verified station reference — nothing honest to plot
      var station = store.getStation(v.currentStationId);
      if (!station) return;
      features.push({
        type: 'Feature',
        id: v.id,
        geometry: { type: 'Point', coordinates: [station.longitude, station.latitude] },
        properties: {
          id: v.id,
          tripId: v.tripId,
          routeId: v.routeId,
          trainId: v.authoritativeId,
          currentStationId: v.currentStationId,
          currentStationDisplayName: station.displayName,
          currentStatus: v.currentStatus,          // STOPPED_AT | IN_TRANSIT_TO | INCOMING_AT
          currentStopSequence: v.currentStopSequence,
          timestampUtcMs: v.timestampUtcMs,
          // Explicit, load-bearing honesty marker — never 'gps'.
          positionSource: 'nearest_verified_stop',
        },
      });
    });
    return { type: 'FeatureCollection', features: features };
  }

  // ── Logical train layer (0818_SUBWAY_Logical_Rolling_Stock_v1.0.0_BUILD §23) ─
  // Reads SubwayLogicalRollingStockAuthority's already-reconciled, persistent
  // logical trains + their freshly-computed TrainPositionState — never
  // recomputes association/position itself (Store Rule equivalent: this file
  // stays a pure GeoJSON+palette translation layer, never an identity owner).
  // Only trains with a real plottable position (observed_stop or
  // inferred_segment) become features — 'unknown' trains have no honest
  // coordinate to plot, matching the no-fabricated-position rule already
  // established for buildVehiclePresenceFeatures(). 'stale' trains keep
  // their last-known coordinate (frozen, not moving) so the interface can
  // visually distinguish "stopped reporting" from "actively absent".
  function buildLogicalTrainFeatures() {
    var rs = _rollingStock(), store = _store();
    if (!rs || !store) return { type: 'FeatureCollection', features: [] };

    var visual = _trainVisualState();

    var features = [];
    rs.getActiveLogicalTrains().forEach(function (train) {
      var pos = rs.getPositionState(train.id);
      if (!pos || !pos.position) return; // unknown / no evidence — nothing honest to plot

      var route = store.getRoute(train.routeId);
      var display = _resolveDisplayColor(route);
      var consist = rs.getLogicalConsist(train.consistId);
      // Bearing/headsign (0818_SUBWAY_Live_Train_Visualization_v1.0.0_BUILD
      // §9/§21) — a pure derivation, never recomputed here; null (never
      // fabricated) when SubwayTrainVisualState isn't loaded or evidence is
      // insufficient.
      var vs = visual ? visual.buildVisualState(train.id) : null;

      features.push({
        type: 'Feature',
        id: train.id,
        geometry: { type: 'Point', coordinates: pos.position },
        properties: {
          logicalTrainId: train.id,
          routeId: train.routeId,
          routeFamily: train.routeFamily,
          semanticFamily: display.semanticFamily,
          resolvedColor: display.resolvedColor,
          activeTripId: train.activeTripId,
          consistId: train.consistId,
          logicalCarCount: consist ? consist.configuredCarCount : null,
          direction: train.direction,
          lifecycleState: train.lifecycleState,
          positionTruthState: pos.truthState,   // observed_stop | inferred_segment | stale
          positionConfidence: pos.confidence,
          observedStopId: pos.observedStopId,
          nextStopId: pos.nextStopId,
          observedTimestamp: pos.observedTimestamp,
          // Explicit, load-bearing honesty marker — same convention as
          // buildVehiclePresenceFeatures(); never 'gps'.
          positionSource: pos.source,
          // 0818_SUBWAY_Live_Train_Visualization_v1.0.0_BUILD §9/§13/§21
          geometryBearing: vs ? vs.geometryBearing : null, // degrees, 0=north — null when unresolvable, never guessed
          headsign: vs ? vs.headsign : null, // real last-stop station name — null when unresolvable, never fabricated
        },
      });
    });
    return { type: 'FeatureCollection', features: features };
  }

  // Real geographic destination-point formula (standard spherical
  // approximation — accurate enough at "a few dozen meters" scale, which is
  // all this is ever used for). Given a real [lon,lat] origin, a real
  // bearing in degrees, and a distance in meters, returns the real
  // [lon,lat] point that bearing/distance away. Used only to draw a short
  // directional "nose" line off an already-real, already-computed train
  // position — never a substitute for the rolling-stock authority's own
  // position/bearing evidence.
  var EARTH_RADIUS_M = 6371000;
  function _destinationPoint(lon, lat, bearingDeg, distanceM) {
    var bearingRad = (bearingDeg * Math.PI) / 180;
    var latRad = (lat * Math.PI) / 180, lonRad = (lon * Math.PI) / 180;
    var angularDist = distanceM / EARTH_RADIUS_M;
    var lat2 = Math.asin(Math.sin(latRad) * Math.cos(angularDist) + Math.cos(latRad) * Math.sin(angularDist) * Math.cos(bearingRad));
    var lon2 = lonRad + Math.atan2(
      Math.sin(bearingRad) * Math.sin(angularDist) * Math.cos(latRad),
      Math.cos(angularDist) - Math.sin(latRad) * Math.sin(lat2)
    );
    return [(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
  }

  // Directional "nose" line features (0818_SUBWAY_Live_Train_Visualization_
  // v1.0.0_BUILD §13 — "directional nose" is one of the BUILD's own named
  // acceptable representations). A short real LineString from each train's
  // real position toward its real resolved bearing — rendered as a 'line'
  // layer rather than an icon/symbol (this codebase's pre-existing
  // navigationSymbolSuppressor.js and, separately, this session's own live
  // verification of Mapbox symbol-layer placement in this environment, both
  // made icon/symbol-based direction cues unreliable here — a plain colored
  // line segment sidesteps both, and satisfies the BUILD's own listed
  // alternative). Only trains with a real resolved geometryBearing get a
  // line — never a fabricated default heading.
  var HEADING_NOSE_LENGTH_M = 45;
  function buildTrainHeadingFeatures() {
    var trainFc = buildLogicalTrainFeatures();
    var features = [];
    trainFc.features.forEach(function (f) {
      var bearing = f.properties.geometryBearing;
      if (bearing == null) return;
      var origin = f.geometry.coordinates;
      var tip = _destinationPoint(origin[0], origin[1], bearing, HEADING_NOSE_LENGTH_M);
      features.push({
        type: 'Feature',
        id: f.properties.logicalTrainId,
        geometry: { type: 'LineString', coordinates: [origin, tip] },
        properties: {
          logicalTrainId: f.properties.logicalTrainId,
          routeId: f.properties.routeId,
          resolvedColor: f.properties.resolvedColor,
          geometryBearing: bearing,
        },
      });
    });
    return { type: 'FeatureCollection', features: features };
  }

  // ── Train body layer (0818_SUBWAY_Train_Rendering_Palette_Library_v1.0.0_
  // BUILD §10-16, §26-28) — replaces the point-like logical-train marker as
  // the map's PRIMARY live-train representation with an elongated mono-line
  // body sitting on real, canonical route-shape geometry (walked by
  // SubwayTrainMotionModel — never a straight-line chord that could leave
  // the shape on a tight curve; see that module's header). This function
  // stays a pure GeoJSON translator: all physics (shape-segment resolution,
  // eased motion progress, direction-lane key, real-world body length) is
  // computed by SubwayTrainMotionModel and merely read here — same Geometry
  // Authority Rule mtaSubwayMapLayer.js documents for this whole file.
  //
  // `opts.zoomLevel` (a plain number — this module stays Mapbox-independent)
  // drives the zoom-dependent MINIMUM readable body length (BUILD §11);
  // defaults to a NEAR-ish zoom so pure/test callers get a valid non-empty
  // body without needing a real map. `buildLogicalTrainFeatures()`/
  // `buildTrainHeadingFeatures()` above are UNCHANGED and still exported —
  // this is an additive replacement of what the map actually RENDERS, not a
  // removal of the prior build's pure builders.
  var DEFAULT_ZOOM_FOR_PURE_CALLS = 14;
  function buildTrainBodyFeatures(opts) {
    var rs = _rollingStock(), mm = _motionModel();
    if (!rs || !mm) return { type: 'FeatureCollection', features: [] };
    var zoomLevel = (opts && typeof opts.zoomLevel === 'number') ? opts.zoomLevel : DEFAULT_ZOOM_FOR_PURE_CALLS;

    var store = _store();
    var features = [];
    rs.getActiveLogicalTrains().forEach(function (train) {
      var motion = mm.buildMotionState(train.id);
      if (!motion || !motion.bodyPolyline || motion.bodyPolyline.length < 2) return; // no honest geometry to plot (unknown / unresolvable shape)

      var pos = rs.getPositionState(train.id);
      var travelRightSign = _travelRightSign(store, motion, pos ? pos.nextStopId : null);

      var route = _store().getRoute(train.routeId);
      var display = _resolveDisplayColor(route);
      var latForScale = motion.bodyCenter ? motion.bodyCenter[1] : motion.bodyPolyline[0][1];
      var renderLength = mm.renderLengthMeters(motion.physicalLengthMeters, zoomLevel, latForScale);
      // The walked polyline already carries physicalLengthMeters worth of
      // real geometry; if the zoom-driven minimum readable length is LONGER
      // than the physical length (FAR/CITY zoom — BUILD §12), re-walk a
      // longer real sub-polyline from the same center/segment rather than
      // stretching the existing points synthetically.
      var bodyPoints = motion.bodyPolyline;
      if (renderLength > motion.physicalLengthMeters + 1 && motion.shapeSegment) {
        bodyPoints = mm.__walkBodyPolyline(motion.shapeSegment.points,
          motion.shapeSegment.fromIdx + (motion.segmentProgressEased != null ? motion.segmentProgressEased : 0) * (motion.shapeSegment.toIdx - motion.shapeSegment.fromIdx),
          renderLength / 2);
      }
      if (bodyPoints.length < 2) return;

      features.push({
        type: 'Feature',
        id: train.id,
        geometry: { type: 'LineString', coordinates: bodyPoints },
        properties: {
          logicalTrainId: train.id,
          routeId: train.routeId,
          routeFamily: train.routeFamily,
          semanticFamily: display.semanticFamily,
          resolvedColor: display.resolvedColor,
          activeTripId: train.activeTripId,
          consistId: train.consistId,
          direction: train.direction,
          directionLaneKey: motion.directionLaneKey, // 'A' | 'B' | null — BUILD §14
          travelRightSign: travelRightSign, // 1 | -1 | null — real forward-travel-derived lane side (see _travelRightSign header)
          lifecycleState: train.lifecycleState,
          positionTruthState: motion.positionState, // observed_stop | inferred_segment | stale
          motionPhase: motion.motionPhase,           // dwell | accelerating | cruising | decelerating | frozen
          configuredCarCount: motion.configuredCarCount,
          renderLengthMeters: renderLength,
          evidenceTier: motion.evidenceTier || null, // A|B|C|D — Continuous Motion Fix fallback hierarchy, diagnostic only
          segmentProgressRaw: motion.segmentProgressRaw != null ? motion.segmentProgressRaw : null,
        },
      });
    });
    return { type: 'FeatureCollection', features: features };
  }

  // Close-zoom car-section detail (BUILD §13) — subtle perpendicular tick
  // marks along an already-built train body, evenly spaced by real car
  // length. Secondary detail only: never a separate train identity (no
  // `id` collision risk — these features are keyed by a composite id and
  // carry the SAME logicalTrainId as their parent body), never rendered
  // below `closeZoomThreshold`.
  var CAR_SECTION_TICK_HALF_WIDTH_M = 2.2;
  function buildTrainCarSectionFeatures(opts) {
    var mm = _motionModel();
    if (!mm) return { type: 'FeatureCollection', features: [] };
    var zoomLevel = (opts && typeof opts.zoomLevel === 'number') ? opts.zoomLevel : DEFAULT_ZOOM_FOR_PURE_CALLS;
    var closeZoomThreshold = (opts && typeof opts.closeZoomThreshold === 'number') ? opts.closeZoomThreshold : 16;
    if (zoomLevel < closeZoomThreshold) return { type: 'FeatureCollection', features: [] };

    var bodyFc = buildTrainBodyFeatures(opts);
    var features = [];
    bodyFc.features.forEach(function (bodyFeature) {
      var coords = bodyFeature.geometry.coordinates;
      var carCount = bodyFeature.properties.configuredCarCount || 10;
      if (coords.length < 2 || carCount < 2) return;

      // Real cumulative arc length along the already-real body polyline.
      var cum = [0];
      for (var i = 1; i < coords.length; i++) cum.push(cum[i - 1] + mm.__haversineMeters(coords[i - 1], coords[i]));
      var totalLen = cum[cum.length - 1];
      if (totalLen <= 0) return;

      for (var carIdx = 1; carIdx < carCount; carIdx++) { // N-1 internal divisions for N cars
        var targetDist = (carIdx / carCount) * totalLen;
        var segIdx = 0;
        while (segIdx < cum.length - 1 && cum[segIdx + 1] < targetDist) segIdx++;
        var segStart = coords[segIdx], segEnd = coords[Math.min(segIdx + 1, coords.length - 1)];
        var segLen = cum[Math.min(segIdx + 1, cum.length - 1)] - cum[segIdx];
        var t = segLen > 0 ? (targetDist - cum[segIdx]) / segLen : 0;
        var tickCenter = [segStart[0] + (segEnd[0] - segStart[0]) * t, segStart[1] + (segEnd[1] - segStart[1]) * t];
        var dx = segEnd[0] - segStart[0], dy = segEnd[1] - segStart[1];
        var tangentBearingDeg = (Math.atan2(dx, dy) * 180) / Math.PI; // atan2(east,north) -> compass bearing
        var perpBearing = tangentBearingDeg + 90;
        var tickA = _destinationPoint(tickCenter[0], tickCenter[1], perpBearing, CAR_SECTION_TICK_HALF_WIDTH_M);
        var tickB = _destinationPoint(tickCenter[0], tickCenter[1], perpBearing + 180, CAR_SECTION_TICK_HALF_WIDTH_M);
        features.push({
          type: 'Feature',
          id: bodyFeature.properties.logicalTrainId + ':car-section:' + carIdx,
          geometry: { type: 'LineString', coordinates: [tickA, tickB] },
          properties: {
            logicalTrainId: bodyFeature.properties.logicalTrainId, // same train — never an independent identity
            resolvedColor: bodyFeature.properties.resolvedColor,
          },
        });
      }
    });
    return { type: 'FeatureCollection', features: features };
  }

  // Alert-informed station/route ids, for a UI to highlight — not a geometry.
  function getAlertedRouteIds() {
    var store = _store();
    if (!store) return [];
    var ids = {};
    store.getAlerts().forEach(function (a) { (a.routeIds || []).forEach(function (r) { ids[r] = true; }); });
    return Object.keys(ids);
  }

  SBE.MTASubwayMapFeatures = Object.freeze({
    VERSION: VERSION,
    buildStationFeatures: buildStationFeatures, // legacy/raw-store path — kept for back-compat, NOT the production station layer (see buildStationLibraryFeatures)
    buildRouteFeatures: buildRouteFeatures,
    buildAllRouteFeatures: buildAllRouteFeatures,
    buildStationLibraryFeatures: buildStationLibraryFeatures,
    buildFullNetworkFeatureCollections: buildFullNetworkFeatureCollections,
    buildVehiclePresenceFeatures: buildVehiclePresenceFeatures,
    buildLogicalTrainFeatures: buildLogicalTrainFeatures,
    buildTrainHeadingFeatures: buildTrainHeadingFeatures,
    buildTrainBodyFeatures: buildTrainBodyFeatures,
    buildTrainCarSectionFeatures: buildTrainCarSectionFeatures,
    __destinationPoint: _destinationPoint,
    __travelRightSign: _travelRightSign,
    getAlertedRouteIds: getAlertedRouteIds,
  });

  console.log('[MTASubwayMapFeatures] v' + VERSION + ' loaded (pure GeoJSON builder — no Mapbox dependency)');
})(window);
