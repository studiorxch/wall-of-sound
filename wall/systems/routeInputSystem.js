(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  var _routes = {};

  function _uid() {
    return "route_" + Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
  }

  function _emit(event, payload) {
    if (SBE.WorkspaceEventBus) SBE.WorkspaceEventBus.emit(event, payload);
  }

  function createRoute(name, origin, destination) {
    var r = {
      id: _uid(),
      name: name || "Route",
      origin: origin || { id: _uid(), name: "", longitude: 0, latitude: 0 },
      destination: destination || { id: _uid(), name: "", longitude: 0, latitude: 0 },
      stops: [],
      geometry: { coordinates: [] },
      metadata: { distanceKm: 0, durationMinutes: 0, travelMode: "driving", generated: false },
      visible: true,
      locked: false,
      camera: { mode: "overview" }
    };
    _routes[r.id] = r;
    _emit("routes:changed", { routes: getRoutes() });
    return r;
  }

  function addStop(routeId, stop) {
    var r = _routes[routeId];
    if (!r) return;
    var s = Object.assign({ id: _uid() }, stop);
    r.stops.push(s);
    _emit("routes:changed", { routes: getRoutes() });
    return s;
  }

  function removeStop(routeId, stopId) {
    var r = _routes[routeId];
    if (!r) return;
    r.stops = r.stops.filter(function (s) { return s.id !== stopId; });
    _emit("routes:changed", { routes: getRoutes() });
  }

  function reorderStop(routeId, fromIdx, toIdx) {
    var r = _routes[routeId];
    if (!r) return;
    var stops = r.stops;
    if (fromIdx < 0 || fromIdx >= stops.length || toIdx < 0 || toIdx >= stops.length) return;
    var item = stops.splice(fromIdx, 1)[0];
    stops.splice(toIdx, 0, item);
    _emit("routes:changed", { routes: getRoutes() });
  }

  function _straightLine(r) {
    var coords = [r.origin].concat(r.stops).concat([r.destination]);
    r.geometry.coordinates = coords.map(function (s) {
      return { longitude: s.longitude, latitude: s.latitude };
    });
    var total = 0;
    for (var i = 1; i < coords.length; i++) {
      var dlng = (coords[i].longitude - coords[i-1].longitude) * Math.PI / 180;
      var dlat = (coords[i].latitude - coords[i-1].latitude) * Math.PI / 180;
      var a = Math.sin(dlat/2)*Math.sin(dlat/2) +
              Math.cos(coords[i-1].latitude*Math.PI/180)*Math.cos(coords[i].latitude*Math.PI/180)*
              Math.sin(dlng/2)*Math.sin(dlng/2);
      total += 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    }
    r.metadata.distanceKm = Math.round(total * 10) / 10;
    r.metadata.durationMinutes = Math.round(total / 50 * 60);
    r.metadata.generated = true;
  }

  function generateGeometry(routeId) {
    var r = _routes[routeId];
    if (!r) return Promise.reject(new Error("route not found"));
    _emit("route:generating", { routeId: routeId });

    var token = global.mapboxgl && global.mapboxgl.accessToken;
    if (!token) {
      _straightLine(r);
      _emit("route:generated", { routeId: routeId, route: r });
      _emit("routes:changed", { routes: getRoutes() });
      return Promise.resolve(r);
    }

    var waypoints = [r.origin].concat(r.stops).concat([r.destination]);
    var coordStr = waypoints.map(function (s) { return s.longitude + "," + s.latitude; }).join(";");
    var url = "https://api.mapbox.com/directions/v5/mapbox/driving/" + encodeURIComponent(coordStr) +
              "?access_token=" + token + "&geometries=geojson&overview=full";

    return fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.routes && data.routes[0]) {
          var route = data.routes[0];
          r.geometry.coordinates = route.geometry.coordinates.map(function (c) {
            return { longitude: c[0], latitude: c[1] };
          });
          r.metadata.distanceKm = Math.round(route.distance / 100) / 10;
          r.metadata.durationMinutes = Math.round(route.duration / 60);
          r.metadata.generated = true;
        } else {
          _straightLine(r);
        }
        _emit("route:generated", { routeId: routeId, route: r });
        _emit("routes:changed", { routes: getRoutes() });
        return r;
      })
      .catch(function () {
        _straightLine(r);
        _emit("route:generated", { routeId: routeId, route: r });
        _emit("routes:changed", { routes: getRoutes() });
        return r;
      });
  }

  function fitRoute(routeId) {
    var r = _routes[routeId];
    if (!r || !r.geometry.coordinates.length) return;
    var map = SBE.MapboxViewportRuntime && SBE.MapboxViewportRuntime.getMap && SBE.MapboxViewportRuntime.getMap();
    if (!map) return;
    var coords = r.geometry.coordinates;
    var minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
    coords.forEach(function (c) {
      if (c.longitude < minLng) minLng = c.longitude;
      if (c.longitude > maxLng) maxLng = c.longitude;
      if (c.latitude < minLat) minLat = c.latitude;
      if (c.latitude > maxLat) maxLat = c.latitude;
    });
    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 80 });
  }

  function setVisible(routeId, bool) {
    if (_routes[routeId]) {
      _routes[routeId].visible = bool;
      _emit("routes:changed", { routes: getRoutes() });
    }
  }

  function setLocked(routeId, bool) {
    if (_routes[routeId]) {
      _routes[routeId].locked = bool;
      _emit("routes:changed", { routes: getRoutes() });
    }
  }

  function deleteRoute(routeId) {
    delete _routes[routeId];
    _emit("routes:changed", { routes: getRoutes() });
  }

  function getRoutes() {
    return Object.values(_routes);
  }

  function getRoute(id) {
    return _routes[id];
  }

  function serialize() {
    return JSON.parse(JSON.stringify(_routes));
  }

  function deserialize(data) {
    _routes = {};
    if (data && typeof data === "object") {
      Object.keys(data).forEach(function (k) { _routes[k] = data[k]; });
    }
    _emit("routes:changed", { routes: getRoutes() });
  }

  function init() {}

  SBE.RouteInputSystem = {
    init: init,
    createRoute: createRoute,
    addStop: addStop,
    removeStop: removeStop,
    reorderStop: reorderStop,
    generateGeometry: generateGeometry,
    fitRoute: fitRoute,
    setVisible: setVisible,
    setLocked: setLocked,
    deleteRoute: deleteRoute,
    getRoutes: getRoutes,
    getRoute: getRoute,
    serialize: serialize,
    deserialize: deserialize
  };

})(window);
