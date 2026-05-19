(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── RoutePlannerRuntime (0518C + 0518E + 0518I) ──────────────────────────
  // Stateful runtime for route geometry, waypoint editing, metrics, and camera
  // targets. One instance per route surface; state lives in surface.meta.
  //
  // As of 0518I: direct geographic interaction (click-to-create, drag, delete,
  // double-click insert). Interaction state is ephemeral — never persisted.

  var TRAVEL_SPEED_KMH = 40;
  var HIT_RADIUS_PX    = 14;  // CSS pixels for waypoint hit detection

  var _nextRouteId    = 1;
  var _nextWaypointId = 1;

  // ── Haversine distance (meters) ────────────────────────────────────────────
  function _haversine(lon1, lat1, lon2, lat2) {
    var R  = 6371000;
    var φ1 = lat1 * Math.PI / 180;
    var φ2 = lat2 * Math.PI / 180;
    var Δφ = (lat2 - lat1) * Math.PI / 180;
    var Δλ = (lon2 - lon1) * Math.PI / 180;
    var a  = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
             Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  // ── Waypoint factory ───────────────────────────────────────────────────────
  function _makeWaypoint(longitude, latitude, type, label) {
    return {
      id:        SBE.ID ? SBE.ID.create() : ("wp-" + (_nextWaypointId++)),
      longitude: longitude,
      latitude:  latitude,
      type:      type  || "checkpoint",
      label:     label || "",
    };
  }

  // ── Route factory ─────────────────────────────────────────────────────────
  function _makeRoute(name) {
    var now = Date.now();
    return {
      id:        SBE.ID ? SBE.ID.create() : ("route-" + (_nextRouteId++)),
      name:      name || "Route " + (_nextRouteId++),
      visible:   true,
      locked:    false,
      color:     "#4a9eff",
      waypoints: [],
      metrics: {
        distanceKm:       0,
        estimatedMinutes: 0,
        avgSegmentLength: 0,
        waypointCount:    0,
      },
      style: {
        color:   "#4a9eff",
        width:   3,
        opacity: 0.9,
      },
      camera: {
        mode:          "observe",   // "follow" | "observe" | "drift"
        speed:         1.0,
        anticipation:  0.3,
        lateralDrift:  0,
        zoomMin:       11,
        zoomMax:       15,
      },
      metadata: {
        tags:           [],
        notes:          "",
        mood:           null,
        pacing:         "balanced",   // "dense" | "balanced" | "open"
        soundtrackBias: [],
        districtType:   null,
        cinematicValue: 5,
      },
      playback: {
        speed:       1.0,
        progression: 0,
        paused:      true,
        loop:        false,
      },
      meta: {
        createdAt:  now,
        modifiedAt: now,
      },
    };
  }

  // ── RouteAnchor factory ───────────────────────────────────────────────────
  function _makeAnchor(routeId, opts) {
    opts = opts || {};
    return {
      routeId:              routeId,
      segmentId:            opts.segmentId            || null,
      waypointId:           opts.waypointId           || null,
      distanceAlongRoute:   opts.distanceAlongRoute   || 0,
    };
  }

  // ── Metrics ────────────────────────────────────────────────────────────────
  function _computeMetrics(route) {
    var wps = route.waypoints;
    if (wps.length < 2) {
      route.metrics = {
        distanceKm:       0,
        estimatedMinutes: 0,
        avgSegmentLength: 0,
        waypointCount:    wps.length,
      };
      return route.metrics;
    }

    var totalM = 0;
    for (var i = 1; i < wps.length; i++) {
      totalM += _haversine(wps[i - 1].longitude, wps[i - 1].latitude, wps[i].longitude, wps[i].latitude);
    }

    var distanceKm       = totalM / 1000;
    var estimatedMinutes = (distanceKm / TRAVEL_SPEED_KMH) * 60;
    var avgSegmentM      = totalM / (wps.length - 1);

    route.metrics = {
      distanceKm:       Math.round(distanceKm * 100) / 100,
      estimatedMinutes: Math.round(estimatedMinutes * 10) / 10,
      avgSegmentLength: Math.round(avgSegmentM),
      waypointCount:    wps.length,
    };
    return route.metrics;
  }

  // ── Point-to-segment distance (screen space) ──────────────────────────────
  function _ptSegDist(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - ax, py - ay);
    var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  // ── Event emission helper ──────────────────────────────────────────────────
  function _emit(event, docId, extra) {
    SBE.WorkspaceEventBus.emit(event, Object.assign({
      source:     "RoutePlannerRuntime",
      timestamp:  performance.now(),
      documentId: docId,
    }, extra));
  }

  // ── Runtime factory ────────────────────────────────────────────────────────
  function createInstance(document) {
    if (!document) throw new Error("[RoutePlannerRuntime] document required");

    var _docId         = document.id;
    var _routes        = [];
    var _activeRouteId = null;

    // Runtime mode — "view" = natural map navigation, "route-edit" = waypoint manipulation
    var _runtimeMode = "view";

    function setRuntimeMode(mode) {
      if (mode !== "view" && mode !== "route-edit") return;
      _runtimeMode = mode;
      if (SBE.WorkspaceEventBus) {
        SBE.WorkspaceEventBus.emit("runtime:modeChanged", { mode: mode, docId: _docId });
      }
    }

    // Ephemeral interaction state — never persisted
    var _interaction = {
      hoveredWaypointId:  null,
      selectedWaypointId: null,
      draggedWaypointId:  null,
      hoveredSegmentIdx:  null,  // segment index (i → waypoint i to i+1)
      insertionPreview:   null,  // {x, y, longitude, latitude, segmentIdx}
    };

    // Double-click detection
    var _lastClickTime = 0;
    var _lastClickWp   = null;

    // Restore persisted state if available
    var saved = document.meta && document.meta.runtimeState;
    if (saved && saved.version === "0518C.1") {
      _routes        = saved.routes        || [];
      _activeRouteId = saved.activeRouteId || null;
      _routes.forEach(function (r) {
        var rn = parseInt((r.id || "").replace("route-", ""), 10);
        if (rn >= _nextRouteId) _nextRouteId = rn + 1;
        (r.waypoints || []).forEach(function (wp) {
          var wn = parseInt((wp.id || "").replace("wp-", ""), 10);
          if (wn >= _nextWaypointId) _nextWaypointId = wn + 1;
        });
      });
    }

    function _persist() {
      document.meta.runtimeState = serialize();
    }

    function _getRoute(routeId) {
      return _routes.find(function (r) { return r.id === routeId; }) || null;
    }

    function _getActiveRoute() {
      return _activeRouteId ? _getRoute(_activeRouteId) : (_routes[0] || null);
    }

    // ── Coordinate helpers ────────────────────────────────────────────────────
    // Convert event to CSS-pixel map coords (matches mbr.project/unproject space)
    function _eventToMapPx(e) {
      var canvas = e.target;
      if (!canvas) return { x: e.clientX, y: e.clientY };
      var rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    // Project all waypoints of a route to CSS-pixel screen space
    function _projectWaypoints(route) {
      var mbr = SBE.MapboxViewportRuntime;
      if (!mbr || !mbr.isReady()) return [];
      return route.waypoints.map(function (wp) {
        return mbr.project([wp.longitude, wp.latitude]);
      });
    }

    // Hit-test pointer against route waypoints; returns waypoint or null
    function _hitWaypoint(px, py, route) {
      var pts = _projectWaypoints(route);
      for (var i = 0; i < pts.length; i++) {
        if (Math.hypot(px - pts[i].x, py - pts[i].y) <= HIT_RADIUS_PX) {
          return route.waypoints[i];
        }
      }
      return null;
    }

    // Hit-test pointer against route segments; returns {segmentIdx, t, x, y} or null
    function _hitSegment(px, py, route) {
      var pts = _projectWaypoints(route);
      var best = null;
      var bestDist = 12; // px threshold for segment hover
      for (var i = 0; i < pts.length - 1; i++) {
        var d = _ptSegDist(px, py, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        if (d < bestDist) {
          bestDist = d;
          // Compute interpolated screen position
          var dx = pts[i + 1].x - pts[i].x;
          var dy = pts[i + 1].y - pts[i].y;
          var lenSq = dx * dx + dy * dy;
          var t = lenSq === 0 ? 0 : Math.max(0, Math.min(1,
            ((px - pts[i].x) * dx + (py - pts[i].y) * dy) / lenSq));
          best = {
            segmentIdx: i,
            t:          t,
            x:          pts[i].x + t * dx,
            y:          pts[i].y + t * dy,
          };
        }
      }
      return best;
    }

    // ── Route lifecycle ──────────────────────────────────────────────────────
    function createRoute(name) {
      var route = _makeRoute(name);
      _routes.push(route);
      if (!_activeRouteId) _activeRouteId = route.id;
      _persist();
      _emit("route:created", _docId, { routeId: route.id, route: route });
      return route;
    }

    function deleteRoute(routeId) {
      var idx = _routes.findIndex(function (r) { return r.id === routeId; });
      if (idx === -1) return;
      var removed = _routes.splice(idx, 1)[0];
      if (_activeRouteId === routeId) {
        _activeRouteId = _routes.length ? _routes[Math.min(idx, _routes.length - 1)].id : null;
      }
      _persist();
      _emit("route:deleted", _docId, { routeId: routeId, route: removed });
    }

    function duplicateRoute(routeId) {
      var src = _getRoute(routeId);
      if (!src) return null;
      var copy = JSON.parse(JSON.stringify(src));
      copy.id   = "route-" + (_nextRouteId++);
      copy.name = src.name + " copy";
      copy.meta.createdAt  = Date.now();
      copy.meta.modifiedAt = Date.now();
      copy.waypoints = copy.waypoints.map(function (wp) {
        return Object.assign({}, wp, { id: SBE.ID ? SBE.ID.create() : ("wp-" + (_nextWaypointId++)) });
      });
      _routes.push(copy);
      _persist();
      _emit("route:created", _docId, { routeId: copy.id, route: copy });
      return copy;
    }

    function selectRoute(routeId) {
      if (!_getRoute(routeId)) return;
      _activeRouteId = routeId;
      _emit("route:selected", _docId, { routeId: routeId });
    }

    function reverseRoute(routeId) {
      var route = _getRoute(routeId);
      if (!route) return;
      route.waypoints = route.waypoints.slice().reverse();
      route.meta.modifiedAt = Date.now();
      _computeMetrics(route);
      _persist();
      _emit("route:modified",       _docId, { routeId: routeId, route: route });
      _emit("route:metricsUpdated", _docId, { routeId: routeId, metrics: route.metrics });
    }

    function setRouteMetadata(routeId, meta) {
      var route = _getRoute(routeId);
      if (!route) return;
      Object.assign(route.metadata, meta);
      route.meta.modifiedAt = Date.now();
      _persist();
    }

    function setPlayback(routeId, playback) {
      var route = _getRoute(routeId);
      if (!route) return;
      Object.assign(route.playback, playback);
    }

    // ── Waypoints ────────────────────────────────────────────────────────────
    function addWaypoint(routeId, longitude, latitude, type, label) {
      var route = _getRoute(routeId);
      if (!route) return null;
      var wp = _makeWaypoint(longitude, latitude, type, label);
      route.waypoints.push(wp);
      route.meta.modifiedAt = Date.now();
      _computeMetrics(route);
      _persist();
      _emit("route:waypointAdded",  _docId, { routeId: routeId, waypoint: wp });
      _emit("route:metricsUpdated", _docId, { routeId: routeId, metrics: route.metrics });
      return wp;
    }

    function insertWaypoint(routeId, afterIdx, longitude, latitude) {
      var route = _getRoute(routeId);
      if (!route) return null;
      var wp = _makeWaypoint(longitude, latitude, "checkpoint", "");
      route.waypoints.splice(afterIdx + 1, 0, wp);
      route.meta.modifiedAt = Date.now();
      _computeMetrics(route);
      _persist();
      _emit("route:waypointAdded",  _docId, { routeId: routeId, waypoint: wp });
      _emit("route:metricsUpdated", _docId, { routeId: routeId, metrics: route.metrics });
      return wp;
    }

    function moveWaypoint(routeId, waypointId, longitude, latitude) {
      var route = _getRoute(routeId);
      if (!route) return;
      var wp = route.waypoints.find(function (w) { return w.id === waypointId; });
      if (!wp) return;
      wp.longitude = longitude;
      wp.latitude  = latitude;
      route.meta.modifiedAt = Date.now();
      _computeMetrics(route);
      _persist();
      _emit("route:waypointMoved",  _docId, { routeId: routeId, waypointId: waypointId, longitude: longitude, latitude: latitude });
      _emit("route:metricsUpdated", _docId, { routeId: routeId, metrics: route.metrics });
    }

    function removeWaypoint(routeId, waypointId) {
      var route = _getRoute(routeId);
      if (!route) return;
      var idx = route.waypoints.findIndex(function (w) { return w.id === waypointId; });
      if (idx === -1) return;
      route.waypoints.splice(idx, 1);
      if (_interaction.selectedWaypointId === waypointId) _interaction.selectedWaypointId = null;
      if (_interaction.hoveredWaypointId  === waypointId) _interaction.hoveredWaypointId  = null;
      route.meta.modifiedAt = Date.now();
      _computeMetrics(route);
      _persist();
      _emit("route:modified",       _docId, { routeId: routeId, route: route });
      _emit("route:metricsUpdated", _docId, { routeId: routeId, metrics: route.metrics });
    }

    // ── Interaction handlers ──────────────────────────────────────────────────
    // Pointer handlers — only active in "route-edit" mode.
    // In "view" mode all events pass through to Mapbox for natural navigation.
    function handlePointerDown(e) {
      if (_runtimeMode !== "route-edit") return;
      var mbr = SBE.MapboxViewportRuntime;
      if (!mbr || !mbr.isReady()) return;

      var pt    = _eventToMapPx(e);
      var route = _getActiveRoute();
      if (!route) return; // no auto-create in route-edit; routes come from RouteInputSystem

      // Double-click on segment → insert waypoint
      var now = performance.now();
      var isDbl = (now - _lastClickTime < 350);
      _lastClickTime = now;

      if (isDbl) {
        var seg = _hitSegment(pt.x, pt.y, route);
        if (seg) {
          var geo = mbr.unproject({ x: seg.x, y: seg.y });
          insertWaypoint(route.id, seg.segmentIdx, geo.lng, geo.lat);
          _interaction.insertionPreview = null;
          e.stopPropagation();
          return;
        }
      }

      // Hit-test existing waypoints — start drag
      var hitWp = _hitWaypoint(pt.x, pt.y, route);
      if (hitWp) {
        _interaction.selectedWaypointId = hitWp.id;
        _interaction.draggedWaypointId  = hitWp.id;
        e.stopPropagation();
        return;
      }
      // No fallthrough — unhandled clicks pass to Mapbox
    }

    function handlePointerMove(e) {
      if (_runtimeMode !== "route-edit") return;
      var mbr = SBE.MapboxViewportRuntime;
      if (!mbr || !mbr.isReady()) return;

      var pt    = _eventToMapPx(e);
      var route = _getActiveRoute();
      if (!route) return;

      if (_interaction.draggedWaypointId) {
        var geo = mbr.unproject({ x: pt.x, y: pt.y });
        if (geo) moveWaypoint(route.id, _interaction.draggedWaypointId, geo.lng, geo.lat);
        e.stopPropagation();
        return;
      }

      // Hover detection
      var hitWp = _hitWaypoint(pt.x, pt.y, route);
      _interaction.hoveredWaypointId = hitWp ? hitWp.id : null;
      if (!hitWp) {
        var seg = _hitSegment(pt.x, pt.y, route);
        _interaction.hoveredSegmentIdx = seg ? seg.segmentIdx : null;
        if (seg) {
          var geo2 = mbr.unproject({ x: seg.x, y: seg.y });
          _interaction.insertionPreview = geo2
            ? { x: seg.x, y: seg.y, longitude: geo2.lng, latitude: geo2.lat, segmentIdx: seg.segmentIdx }
            : null;
        } else {
          _interaction.insertionPreview = null;
        }
      } else {
        _interaction.hoveredSegmentIdx = null;
        _interaction.insertionPreview  = null;
      }
    }

    function handlePointerUp(e) {
      if (_runtimeMode !== "route-edit") return;
      if (_interaction.draggedWaypointId) {
        _interaction.draggedWaypointId = null;
        e.stopPropagation();
      }
    }

    function handleKeyDown(e) {
      if (e.key !== "Backspace" && e.key !== "Delete") return;
      var route = _getActiveRoute();
      if (!route || !_interaction.selectedWaypointId) return;
      // Only delete if a WOS waypoint is selected — don't swallow other delete targets
      var wp = route.waypoints.find(function (w) { return w.id === _interaction.selectedWaypointId; });
      if (!wp) return;
      removeWaypoint(route.id, _interaction.selectedWaypointId);
      e.preventDefault();
    }

    // ── Metrics ──────────────────────────────────────────────────────────────
    function computeMetrics(routeId) {
      var route = _getRoute(routeId);
      if (!route) return null;
      return _computeMetrics(route);
    }

    // ── Camera targets ────────────────────────────────────────────────────────
    function getCameraTargets(routeId) {
      var route = _getRoute(routeId || _activeRouteId);
      if (!route) return [];
      return route.waypoints.map(function (wp, i) {
        var isEndpoint = (i === 0 || i === route.waypoints.length - 1);
        return {
          longitude:  wp.longitude,
          latitude:   wp.latitude,
          importance: isEndpoint ? 1.0 : 0.5,
          radius:     isEndpoint ? 200 : 80,
          type:       wp.type,
          waypointId: wp.id,
        };
      });
    }

    // ── Route anchor ──────────────────────────────────────────────────────────
    function createAnchor(opts) {
      var route = _getActiveRoute();
      if (!route) return null;
      return _makeAnchor(route.id, opts);
    }

    // ── Serialization ─────────────────────────────────────────────────────────
    function serialize() {
      return {
        version:       "0518C.1",
        routes:        JSON.parse(JSON.stringify(_routes)),
        activeRouteId: _activeRouteId,
      };
    }

    function deserialize(data) {
      if (!data || data.version !== "0518C.1") {
        console.warn("[RoutePlannerRuntime] incompatible serialized state");
        return;
      }
      _routes        = data.routes        || [];
      _activeRouteId = data.activeRouteId || null;
    }

    // ── Operator overlay rendering ────────────────────────────────────────────
    function renderOperatorOverlay(ctx, options) {
      if (!ctx) return;
      if (SBE.MapboxOperatorRenderer) {
        SBE.MapboxOperatorRenderer.render(ctx, options, _interaction);
      }
    }

    // ── Presentation layer rendering ──────────────────────────────────────────
    function renderPresentationLayer(ctx, options) {
      if (!ctx) return;
      if (SBE.MapboxPresentationRenderer) {
        SBE.MapboxPresentationRenderer.render(ctx, options);
      }
    }

    // ── Public instance API ───────────────────────────────────────────────────
    return {
      id:   "routePlanner-" + _docId,
      name: "routePlanner",
      type: "routePlanner",
      activeDocumentId: _docId,

      get routes()       { return _routes.slice(); },
      get activeRouteId(){ return _activeRouteId; },
      get interaction()  { return _interaction; },
      get mode()         { return _runtimeMode; },
      setMode:           setRuntimeMode,

      createRoute:    createRoute,
      deleteRoute:    deleteRoute,
      duplicateRoute: duplicateRoute,
      selectRoute:    selectRoute,
      reverseRoute:   reverseRoute,
      setRouteMetadata: setRouteMetadata,
      setPlayback:      setPlayback,

      addWaypoint:    addWaypoint,
      insertWaypoint: insertWaypoint,
      moveWaypoint:   moveWaypoint,
      removeWaypoint: removeWaypoint,

      computeMetrics:   computeMetrics,
      getCameraTargets: getCameraTargets,
      createAnchor:     createAnchor,

      handlePointerDown: handlePointerDown,
      handlePointerMove: handlePointerMove,
      handlePointerUp:   handlePointerUp,
      handleKeyDown:     handleKeyDown,

      renderOperatorOverlay:   renderOperatorOverlay,
      renderPresentationLayer: renderPresentationLayer,

      serialize:   serialize,
      deserialize: deserialize,

      destroy: function() {
        _routes = [];
        _activeRouteId = null;
        _interaction = {};
        _runtimeMode = "view";
      },
    };
  }

  // ── Register in RuntimeRegistry ────────────────────────────────────────────
  SBE.RuntimeRegistry.register({
    id: "routePlanner",
    type: "routePlanner",
    label: "Route Planner",
    create: function (document) {
      return createInstance(document);
    },
  });

  SBE.RoutePlannerRuntime = { createInstance: createInstance };

})(window);
