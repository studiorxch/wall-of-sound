(function initTrafficEcology(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Corridor route definitions ─────────────────────────────────────────────
  // World-space waypoints spanning: Downtown → Williamsburg Bridge → Bushwick
  // Bidirectional: each named route has a mirrored reverse for return traffic.
  var ROUTES = {

    // ── Manhattan → Williamsburg (north lane) ────────────────────────────────
    "mhtn-wburg-n": {
      id:       "mhtn-wburg-n",
      label:    "Downtown → Williamsburg (N)",
      districts: ["downtown", "williamsburg"],
      waypoints: [
        { x: -3000, y: -180 },
        { x: -2200, y: -140 },
        { x: -1400, y: -80  },
        { x: -700,  y:  20  },
        { x: -100,  y:  90  },
        { x:  500,  y:  140 },
        { x:  950,  y:  160 },
      ],
    },

    // ── Williamsburg → Manhattan (south return lane) ──────────────────────────
    "wburg-mhtn-s": {
      id:       "wburg-mhtn-s",
      label:    "Williamsburg → Downtown (S)",
      districts: ["williamsburg", "downtown"],
      waypoints: [
        { x:  950,  y:  220 },
        { x:  500,  y:  200 },
        { x: -100,  y:  150 },
        { x: -700,  y:  80  },
        { x: -1400, y:  20  },
        { x: -2200, y: -60  },
        { x: -3000, y: -100 },
      ],
    },

    // ── Williamsburg → Bushwick (upper) ──────────────────────────────────────
    "wburg-bwick-u": {
      id:       "wburg-bwick-u",
      label:    "Williamsburg → Bushwick (Upper)",
      districts: ["williamsburg", "bushwick"],
      waypoints: [
        { x:  800,  y:  100 },
        { x: 1100,  y:  170 },
        { x: 1450,  y:  230 },
        { x: 1850,  y:  290 },
        { x: 2300,  y:  340 },
        { x: 2800,  y:  370 },
      ],
    },

    // ── Bushwick → Williamsburg (lower return) ───────────────────────────────
    "bwick-wburg-l": {
      id:       "bwick-wburg-l",
      label:    "Bushwick → Williamsburg (Lower)",
      districts: ["bushwick", "williamsburg"],
      waypoints: [
        { x: 2800,  y:  450 },
        { x: 2300,  y:  420 },
        { x: 1850,  y:  380 },
        { x: 1450,  y:  320 },
        { x: 1100,  y:  260 },
        { x:  800,  y:  190 },
      ],
    },

    // ── Cross-corridor: Downtown → Bushwick (express) ────────────────────────
    "mhtn-bwick-x": {
      id:       "mhtn-bwick-x",
      label:    "Downtown → Bushwick (Express)",
      districts: ["downtown", "williamsburg", "bushwick"],
      waypoints: [
        { x: -3000, y:  -50 },
        { x: -1800, y:   30 },
        { x: -600,  y:  110 },
        { x:  400,  y:  170 },
        { x: 1200,  y:  240 },
        { x: 2000,  y:  310 },
        { x: 2800,  y:  380 },
      ],
    },
  };

  // ── Vehicle type definitions ───────────────────────────────────────────────
  var VEHICLE_TYPES = {
    rideshare: {
      label:       "Rideshare",
      baseSpeed:   200,   // world units per second (abstract)
      subjectStyle: "arrow",
      pathStyle:    "dashed",
      color:        "#3dd8c5",
      spawnWeight:  0.6,
    },
    delivery: {
      label:       "Delivery",
      baseSpeed:   140,
      subjectStyle: "dot",
      pathStyle:    "dotted",
      color:        "#ffbf2f",
      spawnWeight:  0.4,
    },
  };

  // ── Route geometry helpers ─────────────────────────────────────────────────
  function _routeLength(route) {
    var wps = route.waypoints;
    var len = 0;
    for (var i = 0; i < wps.length - 1; i++) {
      len += Math.hypot(wps[i + 1].x - wps[i].x, wps[i + 1].y - wps[i].y);
    }
    return len;
  }

  // Get world position at normalized progress t (0–1) along route
  function routePosition(route, t) {
    var wps   = route.waypoints;
    if (wps.length < 2) return wps[0] || { x: 0, y: 0 };
    var total = _routeLength(route);
    var target = Math.max(0, Math.min(1, t)) * total;
    var acc = 0;
    for (var i = 0; i < wps.length - 1; i++) {
      var dx  = wps[i + 1].x - wps[i].x;
      var dy  = wps[i + 1].y - wps[i].y;
      var seg = Math.hypot(dx, dy);
      if (acc + seg >= target || i === wps.length - 2) {
        var frac = seg > 0 ? (target - acc) / seg : 0;
        return {
          x:  wps[i].x + dx * frac,
          y:  wps[i].y + dy * frac,
          vx: seg > 0 ? dx / seg : 0,  // normalized direction
          vy: seg > 0 ? dy / seg : 0,
        };
      }
      acc += seg;
    }
    return { x: wps[wps.length - 1].x, y: wps[wps.length - 1].y, vx: 0, vy: 0 };
  }

  // ── Vehicle lifecycle ──────────────────────────────────────────────────────
  var _nextVehicleId = 1;

  function createVehicle(typeId, routeId, startT) {
    var type  = VEHICLE_TYPES[typeId]  || VEHICLE_TYPES.rideshare;
    var route = ROUTES[routeId];
    if (!route) return null;
    var id = "av_" + (_nextVehicleId++);
    return {
      id:            id,
      type:          typeId,
      routeId:       routeId,
      routeProgress: startT != null ? startT : Math.random(), // 0–1
      state:         "moving",  // "moving" | "waiting" | "complete"
      district:      route.districts[0],
      destination:   route.districts[route.districts.length - 1],
      // World position (updated each abstract tick)
      wx: 0, wy: 0,
      // Speed — will be modulated by pressure
      speedMult: 0.85 + Math.random() * 0.3,
      // Realization handle
      _walkerId:   null,    // set by WorldRealizer when realized
      _realized:   false,
    };
  }

  // ── Pressure-weighted route selection ─────────────────────────────────────
  var _ROUTE_KEYS = Object.keys(ROUTES);

  function _pickRoute(world) {
    // Simple random for now — future: weight by district pressure
    return _ROUTE_KEYS[Math.floor(Math.random() * _ROUTE_KEYS.length)];
  }

  function _pickType(world) {
    // Weighted by type spawn weights
    var r = Math.random();
    return r < VEHICLE_TYPES.rideshare.spawnWeight ? "rideshare" : "delivery";
  }

  // ── Target vehicle count driven by pressure ───────────────────────────────
  function _targetCount(world) {
    if (!world || !world.pressure) return 12;
    var dp = world.pressure.districts;
    var total = 0;
    Object.keys(dp).forEach(function (id) {
      total += (dp[id].traffic + dp[id].delivery) * 0.5;
    });
    // Scale: 0 pressure → 4 vehicles, full pressure → 40 vehicles
    return Math.round(4 + (total / Object.keys(dp).length) * 36);
  }

  // ── Main ecology tick ──────────────────────────────────────────────────────
  // dt in seconds. Called every ~3s from main tick.
  function tick(world, dt) {
    if (!world) return;
    var vehicles = world.abstractVehicles = world.abstractVehicles || [];

    // Advance vehicle positions along routes
    vehicles.forEach(function (v) {
      if (v.state !== "moving" || v._realized) return; // realizer drives realized ones

      var type  = VEHICLE_TYPES[v.type]  || VEHICLE_TYPES.rideshare;
      var route = ROUTES[v.routeId];
      if (!route) return;

      // Pressure modifies speed: high traffic → slower vehicles
      var dp = world.pressure && world.pressure.districts[v.district];
      var congestion = dp ? 1 - dp.traffic * 0.4 : 1;
      var speedPx = type.baseSpeed * v.speedMult * congestion;
      var totalLen = _routeLength(route);
      var advance  = totalLen > 0 ? (speedPx * dt) / totalLen : 0;

      v.routeProgress += advance;

      // Update world position
      var pos = routePosition(route, v.routeProgress);
      v.wx = pos.x;
      v.wy = pos.y;

      // Complete route → pick a new one
      if (v.routeProgress >= 1) {
        v.state = "complete";
      }
    });

    // Remove completed vehicles and respawn
    world.abstractVehicles = vehicles.filter(function (v) { return v.state !== "complete"; });

    // Spawn new vehicles up to target count
    var target  = _targetCount(world);
    var deficit = target - world.abstractVehicles.length;
    for (var i = 0; i < Math.min(deficit, 3); i++) {
      var routeId = _pickRoute(world);
      var typeId  = _pickType(world);
      var v       = createVehicle(typeId, routeId, Math.random() * 0.8); // spread across route
      if (v) {
        // Set initial position
        var pos = routePosition(ROUTES[routeId], v.routeProgress);
        v.wx = pos.x;
        v.wy = pos.y;
        world.abstractVehicles.push(v);
      }
    }

    // Update district pressure: delivery completion boosts delivery demand briefly
    // (handled passively via DistrictPressure — just emit symbolic events here)
  }

  // ── Public API ─────────────────────────────────────────────────────────────
  SBE.TrafficEcology = {
    ROUTES:        ROUTES,
    VEHICLE_TYPES: VEHICLE_TYPES,
    routePosition: routePosition,
    createVehicle: createVehicle,
    tick:          tick,
  };

})(window);
