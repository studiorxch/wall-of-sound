(function initDistrictPressure(global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── District definitions — world-space anchor points ───────────────────────
  // Corridor: Downtown Manhattan → Williamsburg → Bushwick
  // World space: origin at screen center, +x east, +y south
  var DISTRICTS = {
    downtown: {
      id: "downtown",
      label: "Downtown",
      x: -2400, y: -100,
      radius: 900,
      baseNightlife: 0.25,
      baseTraffic:   0.65,
      baseDelivery:  0.70,
    },
    williamsburg: {
      id: "williamsburg",
      label: "Williamsburg",
      x: 200, y: 80,
      radius: 700,
      baseNightlife: 0.60,
      baseTraffic:   0.50,
      baseDelivery:  0.50,
    },
    bushwick: {
      id: "bushwick",
      label: "Bushwick",
      x: 1900, y: 320,
      radius: 750,
      baseNightlife: 0.82,
      baseTraffic:   0.38,
      baseDelivery:  0.42,
    },
  };

  // ── Time-of-day pressure curves ────────────────────────────────────────────
  // Each returns 0–1 influence for a given normalized time (0 = midnight, 0.5 = noon)
  function _tod(t) { return t; } // identity alias for clarity

  // Nightlife: peaks midnight–3am (tod 0.0–0.125 and 0.875–1.0)
  function nightlifeCurve(tod) {
    // Map so midnight = 1.0, noon = 0.0
    var dist = Math.abs(tod - 1.0) < Math.abs(tod) ? 1 - tod : tod;
    return Math.max(0, 1 - dist * 4.5);
  }

  // Traffic: peaks 8–10am (tod ~0.33) and 5–7pm (tod ~0.71)
  function trafficCurve(tod) {
    var am = Math.exp(-Math.pow((tod - 0.33) * 8, 2));
    var pm = Math.exp(-Math.pow((tod - 0.71) * 8, 2));
    return Math.min(1, am + pm);
  }

  // Delivery: elevated 9am–8pm (tod 0.375–0.833)
  function deliveryCurve(tod) {
    if (tod < 0.35 || tod > 0.87) return 0.05;
    var mid = 0.61;
    return Math.max(0.1, 1 - Math.pow((tod - mid) * 3.2, 2));
  }

  // ── Pressure init ──────────────────────────────────────────────────────────
  function initPressure() {
    var out = { districts: {} };
    Object.keys(DISTRICTS).forEach(function (id) {
      var d = DISTRICTS[id];
      out.districts[id] = {
        nightlife: d.baseNightlife,
        traffic:   d.baseTraffic,
        delivery:  d.baseDelivery,
        weather:   0.0,
        energy:    (d.baseNightlife + d.baseTraffic) * 0.5,
        // smoothed output values (interpolated toward targets each tick)
        _nightlifeSm: d.baseNightlife,
        _trafficSm:   d.baseTraffic,
        _deliverySm:  d.baseDelivery,
        _energySm:    (d.baseNightlife + d.baseTraffic) * 0.5,
      };
    });
    return out;
  }

  // ── Per-tick update ────────────────────────────────────────────────────────
  // dt in seconds. world = state.world (ecology namespace)
  function tick(world, dt) {
    if (!world || !world.pressure) return;

    var todNorm = world.timeOfDay || 0;   // 0–1 (midnight=0, noon=0.5)
    var weather  = world.weather  || { intensity: 0 };
    var events   = world.events   || [];
    var pressure = world.pressure;

    // Advance abstract world clock
    // 1 real second = timeScale world-minutes (default: 1 real min = 10 world min)
    var timeScaleMin = world.timeScale || 10;
    world.time = ((world.time || 720) + dt * timeScaleMin / 60) % 1440;
    world.timeOfDay = world.time / 1440;

    // Sum active event modifiers per district
    var eventMods = {};
    Object.keys(DISTRICTS).forEach(function (id) { eventMods[id] = { nightlife: 0, traffic: 0, delivery: 0 }; });
    events.forEach(function (ev) {
      if (!ev.active || !ev.districtId || !eventMods[ev.districtId]) return;
      var m = eventMods[ev.districtId];
      if (ev.nightlifeMod) m.nightlife += ev.nightlifeMod;
      if (ev.trafficMod)   m.traffic   += ev.trafficMod;
      if (ev.deliveryMod)  m.delivery  += ev.deliveryMod;
    });

    var smooth = Math.min(1, dt * 0.4); // lerp speed — gradual drift

    Object.keys(DISTRICTS).forEach(function (id) {
      var d  = DISTRICTS[id];
      var dp = pressure.districts[id];
      if (!dp) return;

      var emod = eventMods[id] || {};

      // Target pressures from time-of-day curves + base + event mods
      var tNight = Math.min(1, d.baseNightlife * 0.3 + nightlifeCurve(todNorm) * 0.7 + (emod.nightlife || 0));
      var tTraff  = Math.min(1, d.baseTraffic   * 0.4 + trafficCurve(todNorm)  * 0.6 + (emod.traffic   || 0));
      var tDeliv  = Math.min(1, d.baseDelivery  * 0.4 + deliveryCurve(todNorm) * 0.6 + (emod.delivery  || 0));
      var weatherDamp = 1 - weather.intensity * 0.35; // rain reduces movement density

      tTraff *= weatherDamp;
      tDeliv *= weatherDamp;

      // Smooth interpolation toward targets
      dp._nightlifeSm += (tNight - dp._nightlifeSm) * smooth;
      dp._trafficSm   += (tTraff  - dp._trafficSm)  * smooth;
      dp._deliverySm  += (tDeliv  - dp._deliverySm) * smooth;

      // Exposed values
      dp.nightlife = dp._nightlifeSm;
      dp.traffic   = dp._trafficSm;
      dp.delivery  = dp._deliverySm;
      dp.weather   = weather.intensity;
      dp.energy    = (dp.nightlife * 0.5 + dp.traffic * 0.3 + dp.delivery * 0.2);
      dp._energySm += (dp.energy - dp._energySm) * smooth;
      dp.energy    = dp._energySm;
    });
  }

  // ── Event helpers ──────────────────────────────────────────────────────────
  function createEvent(opts) {
    return {
      id:          "ev_" + Math.random().toString(36).slice(2, 8),
      type:        opts.type        || "generic",
      label:       opts.label       || "Event",
      districtId:  opts.districtId  || "williamsburg",
      duration:    opts.duration    || 3600,  // seconds
      elapsed:     0,
      active:      true,
      nightlifeMod: opts.nightlifeMod || 0,
      trafficMod:   opts.trafficMod   || 0,
      deliveryMod:  opts.deliveryMod  || 0,
    };
  }

  function tickEvents(world, dt) {
    if (!world || !world.events) return;
    world.events = world.events.filter(function (ev) {
      if (!ev.active) return false;
      ev.elapsed += dt;
      if (ev.elapsed >= ev.duration) { ev.active = false; return false; }
      return true;
    });
  }

  // ── Query helpers ──────────────────────────────────────────────────────────
  function getPressure(world, districtId) {
    if (!world || !world.pressure || !world.pressure.districts) return null;
    return world.pressure.districts[districtId] || null;
  }

  function getNearestDistrict(wx, wy) {
    var best = null, bestD = Infinity;
    Object.values(DISTRICTS).forEach(function (d) {
      var dist = Math.hypot(wx - d.x, wy - d.y);
      if (dist < bestD) { bestD = dist; best = d; }
    });
    return best;
  }

  // Public API
  SBE.DistrictPressure = {
    DISTRICTS:          DISTRICTS,
    initPressure:       initPressure,
    tick:               tick,
    tickEvents:         tickEvents,
    createEvent:        createEvent,
    getPressure:        getPressure,
    getNearestDistrict: getNearestDistrict,
  };

})(window);
