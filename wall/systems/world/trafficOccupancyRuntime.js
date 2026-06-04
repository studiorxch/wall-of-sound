// ── TrafficOccupancyRuntime v1.0.0 ────────────────────────────────────────────
// 0531I_WOS_TrafficOccupancy_v1.0.0
// Status: prototype
// Classification: world-actor-runtime
//
// Manages a small pool of non-hero traffic actors that move along short road
// segments near the current drive position. Purely visual occupancy —
// no AI, no collision, no lane logic.
//
// Authority:
//   OWNS: traffic actor state (position, heading, progress, speed)
//   READS: HeroVehicleRuntime (spawn anchor), MapboxViewportRuntime (camera pos)
//   MUST NOT: control the camera, affect the hero route, or block hero launch
//
// Placement: wall/systems/world/trafficOccupancyRuntime.js
// Load: AFTER heroVehicleRuntime.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Constants ─────────────────────────────────────────────────────────────────
  var MAX_ACTORS       = 10;
  var DEFAULT_COUNT    = 5;
  var SPAWN_DIST_MIN_M = 300;
  var SPAWN_DIST_MAX_M = 1500;
  var DESPAWN_DIST_M   = 2500;   // remove actor when it drifts > 2.5km from hero
  var GRACE_PERIOD_MS  = 30000;  // never despawn in first 30s (prevents instant loss)

  // Default speed band for traffic actors (m/s). Hero speed multiplier does NOT
  // apply — traffic moves at an independent realistic pace.
  var TRAFFIC_SPEED_MS_MIN = 7;    // ~25 km/h city
  var TRAFFIC_SPEED_MS_MAX = 16;   // ~58 km/h arterial

  // ── Spawn pool definition ─────────────────────────────────────────────────────
  var SPAWN_POOL = Object.freeze([
    { type: 'compact_car', variant: 'sedan_dark',         weight: 3 },
    { type: 'compact_car', variant: 'sedan_light',        weight: 2 },
    { type: 'box_truck',   variant: 'clean_white',        weight: 2 },
    { type: 'box_truck',   variant: 'sticker_graffiti_test', weight: 1 },
    { type: 'compact_car', variant: 'taxi_yellow',        weight: 1 },
    { type: 'box_truck',   variant: 'weathered',          weight: 1 },
  ]);

  // ── State ─────────────────────────────────────────────────────────────────────
  var _actors    = [];   // array of actor objects
  var _active    = false;
  var _rafId     = null;
  var _lastMs    = 0;
  var _idCounter = 0;

  // ── Math helpers ──────────────────────────────────────────────────────────────

  function _haversineM(lat1, lng1, lat2, lng2) {
    var R    = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a    = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function _bearing(p0, p1) {
    var dLng = (p1.lng - p0.lng) * Math.PI / 180;
    var lat1 = p0.lat * Math.PI / 180;
    var lat2 = p1.lat * Math.PI / 180;
    var y    = Math.sin(dLng) * Math.cos(lat2);
    var x    = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  }

  function _offsetPosition(lat, lng, headingDeg, distM) {
    var R    = 6371000;
    var d    = distM / R;
    var brg  = headingDeg * Math.PI / 180;
    var lat1 = lat * Math.PI / 180;
    var lng1 = lng * Math.PI / 180;
    var lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) +
                         Math.cos(lat1) * Math.sin(d) * Math.cos(brg));
    var lng2 = lng1 + Math.atan2(Math.sin(brg) * Math.sin(d) * Math.cos(lat1),
                                 Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
    return { lat: lat2 * 180 / Math.PI, lng: ((lng2 * 180 / Math.PI) + 540) % 360 - 180 };
  }

  function _rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function _pickFromPool() {
    // Weighted random selection from spawn pool
    var total = SPAWN_POOL.reduce(function (s, e) { return s + e.weight; }, 0);
    var r     = Math.random() * total;
    var acc   = 0;
    for (var i = 0; i < SPAWN_POOL.length; i++) {
      acc += SPAWN_POOL[i].weight;
      if (r <= acc) return SPAWN_POOL[i];
    }
    return SPAWN_POOL[0];
  }

  // ── Route building ────────────────────────────────────────────────────────────

  function _buildSegments(points) {
    var distances = [], total = 0;
    for (var i = 0; i < points.length - 1; i++) {
      var d = _haversineM(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng);
      distances.push(d);
      total += d;
    }
    var cumFrac = [], cum = 0;
    for (var j = 0; j < distances.length; j++) {
      cum += distances[j];
      cumFrac.push(total > 0 ? cum / total : 1);
    }
    return { distances: distances, total: total, cumFrac: cumFrac };
  }

  function _lookaheadM(speedMs) {
    var d = (speedMs || 10) * 2.5;
    return Math.max(25, Math.min(80, d));
  }

  function _lookaheadBearing(points, segs, t, speedMs) {
    if (!points || points.length < 2 || !segs || segs.total <= 0) return 0;
    var lookFrac = _lookaheadM(speedMs) / segs.total;
    var tAhead   = Math.min(1, t + lookFrac);
    var cur      = _interpolatePos(points, segs, t);
    var ahead    = _interpolatePos(points, segs, tAhead);
    if (Math.abs(ahead.lat - cur.lat) < 1e-8 && Math.abs(ahead.lng - cur.lng) < 1e-8) {
      return _bearing(points[Math.max(0, points.length - 2)], points[points.length - 1]);
    }
    return _bearing(cur, ahead);
  }

  function _interpolatePos(points, segs, t) {
    var n = points.length;
    if (t <= 0) return { lat: points[0].lat, lng: points[0].lng };
    if (t >= 1) return { lat: points[n - 1].lat, lng: points[n - 1].lng };
    var segIdx = segs.cumFrac.length - 1;
    for (var i = 0; i < segs.cumFrac.length; i++) {
      if (t <= segs.cumFrac[i]) { segIdx = i; break; }
    }
    var segStart = segIdx === 0 ? 0 : segs.cumFrac[segIdx - 1];
    var segEnd   = segs.cumFrac[segIdx];
    var segT     = segEnd > segStart ? (t - segStart) / (segEnd - segStart) : 0;
    return {
      lat: points[segIdx].lat + (points[segIdx + 1].lat - points[segIdx].lat) * segT,
      lng: points[segIdx].lng + (points[segIdx + 1].lng - points[segIdx].lng) * segT,
    };
  }

  function _interpolate(points, segs, t) {
    var n = points.length;
    if (t <= 0) return { lat: points[0].lat, lng: points[0].lng, headingDeg: n > 1 ? _bearing(points[0], points[1]) : 0 };
    if (t >= 1) return { lat: points[n - 1].lat, lng: points[n - 1].lng, headingDeg: n > 1 ? _bearing(points[n - 2], points[n - 1]) : 0 };
    var segIdx = segs.cumFrac.length - 1;
    for (var i = 0; i < segs.cumFrac.length; i++) {
      if (t <= segs.cumFrac[i]) { segIdx = i; break; }
    }
    var segStart = segIdx === 0 ? 0 : segs.cumFrac[segIdx - 1];
    var segEnd   = segs.cumFrac[segIdx];
    var segT     = segEnd > segStart ? (t - segStart) / (segEnd - segStart) : 0;
    var p0 = points[segIdx], p1 = points[segIdx + 1];
    return {
      lat:        p0.lat + (p1.lat - p0.lat) * segT,
      lng:        p0.lng + (p1.lng - p0.lng) * segT,
      headingDeg: _bearing(p0, p1),
    };
  }

  // ── Route fetching ────────────────────────────────────────────────────────────

  function _fetchShortRoute(originLat, originLng, headingDeg) {
    var token = global.mapboxgl && global.mapboxgl.accessToken;
    if (!token) return Promise.resolve(null);

    // Pick a destination ~500–1200m ahead in the current direction, slight angle variation
    var angleVariation = (Math.random() - 0.5) * 60;
    var dist = _rand(500, 1200);
    var dest = _offsetPosition(originLat, originLng, (headingDeg + angleVariation + 360) % 360, dist);

    var url = 'https://api.mapbox.com/directions/v5/mapbox/driving/'
      + originLng.toFixed(6) + ',' + originLat.toFixed(6) + ';'
      + dest.lng.toFixed(6)  + ',' + dest.lat.toFixed(6)
      + '?geometries=geojson&overview=full&steps=false'
      + '&access_token=' + encodeURIComponent(token);

    return fetch(url)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        if (!data.routes || !data.routes.length) return null;
        var r      = data.routes[0];
        var points = r.geometry.coordinates.map(function (c) { return { lat: c[1], lng: c[0] }; });
        if (points.length < 2) return null;
        return { source: 'mapbox-directions', points: points, distanceMeters: r.distance, durationSeconds: r.duration };
      })
      .catch(function () { return null; });
  }

  function _buildFallbackRoute(originLat, originLng, headingDeg) {
    var points = [];
    var totalDist = _rand(400, 900);
    var nPts = 8;
    for (var i = 0; i <= nPts; i++) {
      var angle = headingDeg + (Math.random() - 0.5) * 20;
      var pt = _offsetPosition(originLat, originLng, angle, totalDist * i / nPts);
      points.push(pt);
      originLat = pt.lat;
      originLng = pt.lng;
    }
    return { source: 'fallback', points: points, distanceMeters: totalDist, durationSeconds: totalDist / 11 };
  }

  // ── Actor creation ─────────────────────────────────────────────────────────────

  function _heroAnchor() {
    var hv  = global.SBE && SBE.HeroVehicleRuntime;
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    // Prefer hero vehicle position
    if (hv) {
      var s = hv.getState();
      if (s.active) return { lat: s.lat, lng: s.lng, headingDeg: s.headingDeg };
    }
    // Fallback: map center
    var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    if (map) {
      try {
        var c = map.getCenter();
        return { lat: c.lat, lng: c.lng, headingDeg: 0 };
      } catch (e) {}
    }
    return null;
  }

  function _spawnActor(poolEntry, routeData, progressOffset) {
    if (_actors.length >= MAX_ACTORS) return null;
    if (!routeData || !routeData.points || routeData.points.length < 2) return null;

    var segs     = _buildSegments(routeData.points);
    var progress = Math.max(0, Math.min(0.9, progressOffset || Math.random() * 0.5));
    var pos      = _interpolate(routeData.points, segs, progress);

    var actor = {
      id:              'traffic_' + String(++_idCounter).padStart(3, '0'),
      type:            poolEntry.type,
      variant:         poolEntry.variant,
      routeSource:     routeData.source,
      mode:            poolEntry.mode || 'random_route',
      spawnedAtMs:     Date.now(),
      route:           routeData.points,
      segments:        segs,
      progress:        progress,
      progressMs:      progress * routeData.durationSeconds * 1000,
      durationMs:      routeData.durationSeconds * 1000,
      speedMs:         _rand(TRAFFIC_SPEED_MS_MIN, TRAFFIC_SPEED_MS_MAX),
      // Raw position from route
      rawLat:          pos.lat,
      rawLng:          pos.lng,
      rawHeadingDeg:   pos.headingDeg,
      // Smoothed values
      lat:             pos.lat,
      lng:             pos.lng,
      headingDeg:      pos.headingDeg,
      active:          true,
      static:          poolEntry.static || false,   // static=true → no progress advance
    };

    _actors.push(actor);
    return actor;
  }

  // ── RAF tick ──────────────────────────────────────────────────────────────────

  function _tick(nowMs) {
    if (!_active) { _rafId = null; return; }
    _rafId = global.requestAnimationFrame(_tick);

    var dt = _lastMs > 0 ? Math.min((nowMs - _lastMs) / 1000, 0.1) : 0.016;
    _lastMs = nowMs;

    var anchor   = _heroAnchor();
    var renderer = global.SBE && SBE.TrafficOccupancyRenderer;

    for (var i = _actors.length - 1; i >= 0; i--) {
      var a    = _actors[i];
      var ageMs = nowMs - a.spawnedAtMs;

      // ── Static actors: no progress, never despawn ───────────────────────────
      if (a.static) {
        if (renderer && typeof renderer.updateActor === 'function') renderer.updateActor(a);
        continue;
      }

      // ── Despawn guard: grace period + log-not-remove for out-of-viewport ───
      if (ageMs < GRACE_PERIOD_MS) {
        // During grace period: never despawn, just update
      } else if (anchor) {
        var distM = _haversineM(a.lat, a.lng, anchor.lat, anchor.lng);
        if (distM > DESPAWN_DIST_M) {
          // Log-not-remove first occurrence; despawn only if well outside range
          if (!a._outOfRangeMs) {
            a._outOfRangeMs = nowMs;
            console.log('[TrafficOccupancyRuntime]', a.id, 'outside range (', Math.round(distM) + 'm ) — watching');
          } else if (nowMs - a._outOfRangeMs > 5000) {
            if (renderer && typeof renderer.removeActor === 'function') renderer.removeActor(a.id);
            _actors.splice(i, 1);
            continue;
          }
        } else {
          a._outOfRangeMs = null;   // back in range, reset
        }
      }

      // ── Advance progress ────────────────────────────────────────────────────
      a.progressMs += dt * 1000 * (a.speedMs / (a.segments.total / a.durationMs * 1000));
      a.progress    = Math.min(1, a.progressMs / a.durationMs);

      if (a.progress >= 1) {
        if (renderer && typeof renderer.removeActor === 'function') renderer.removeActor(a.id);
        _actors.splice(i, 1);
        continue;
      }

      // ── Position + heading update ───────────────────────────────────────────
      var pos = _interpolate(a.route, a.segments, a.progress);
      a.rawLat        = pos.lat;
      a.rawLng        = pos.lng;
      a.rawHeadingDeg = _lookaheadBearing(a.route, a.segments, a.progress, a.speedMs);

      var pf = 1 - Math.exp(-6 * dt);
      a.lat += (a.rawLat - a.lat) * pf;
      a.lng += (a.rawLng - a.lng) * pf;

      var hDelta = ((a.rawHeadingDeg - a.headingDeg + 540) % 360) - 180;
      if (Math.abs(hDelta) > 0.4) {
        var hf = 1 - Math.exp(-4 * dt);
        a.headingDeg = (a.headingDeg + hDelta * hf + 360) % 360;
      }

      if (renderer && typeof renderer.updateActor === 'function') renderer.updateActor(a);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  // Spawn actors directly on the hero vehicle's route polyline.
  // Guaranteed to appear on the same road corridor — no random lat/lng offset.
  // Actors are spaced ahead of the hero's current progress position.
  function spawnOnHeroRoute(count) {
    count = Math.min(MAX_ACTORS - _actors.length, count || 3);
    if (count <= 0) { console.warn('[TrafficOccupancyRuntime] at max count'); return; }

    var hv = global.SBE && SBE.HeroVehicleRuntime;
    if (!hv || typeof hv.getRoute !== 'function') {
      console.warn('[TrafficOccupancyRuntime] spawnOnHeroRoute: HeroVehicleRuntime not available or not driving');
      return;
    }
    var heroRoute = hv.getRoute();
    if (!heroRoute || !heroRoute.points || heroRoute.points.length < 2) {
      console.warn('[TrafficOccupancyRuntime] spawnOnHeroRoute: hero route not ready — launch Drive first');
      return;
    }
    var heroState = hv.getState();
    var heroProgress = (heroState && heroState.progressPct != null) ? heroState.progressPct / 100 : 0;

    var renderer = global.SBE && SBE.TrafficOccupancyRenderer;

    // Build a durationSeconds estimate from route distance
    var estDuration = heroRoute.distanceMeters / 13.8;   // 50 km/h average

    // Spread actors ahead of hero at even progress intervals (0.05–0.25 ahead)
    for (var i = 0; i < count; i++) {
      var progressAhead = heroProgress + 0.05 + (i * 0.07);
      if (progressAhead >= 1) progressAhead = heroProgress + 0.02 * (i + 1);
      progressAhead = Math.min(0.95, progressAhead);

      var pool = _pickFromPool();
      pool = Object.assign({}, pool, { mode: 'hero_route' });

      var routeData = {
        source:          heroRoute.source,
        points:          heroRoute.points,
        distanceMeters:  heroRoute.distanceMeters,
        durationSeconds: estDuration,
      };

      var actor = _spawnActor(pool, routeData, progressAhead);
      if (actor && renderer && typeof renderer.addActor === 'function') {
        renderer.addActor(actor);
        console.log('[TrafficOccupancyRuntime] spawnOnHeroRoute', actor.id,
          actor.type + '/' + actor.variant,
          'progress:', (progressAhead * 100).toFixed(1) + '%',
          'at', actor.lat.toFixed(5), actor.lng.toFixed(5));
      }
    }

    if (!_active) _startTick();
    _scheduleWorldRebind();
  }

  // Spawn a batch of traffic actors near the hero position
  function spawn(count) {
    count = Math.min(MAX_ACTORS - _actors.length, count || DEFAULT_COUNT);
    if (count <= 0) { console.warn('[TrafficOccupancyRuntime] at max actor count'); return; }

    var anchor = _heroAnchor();
    if (!anchor) { console.warn('[TrafficOccupancyRuntime] no anchor position — is Drive active?'); return; }

    var renderer = global.SBE && SBE.TrafficOccupancyRenderer;

    for (var i = 0; i < count; i++) {
      (function (idx) {
        var pool = _pickFromPool();
        // Stagger spawn distances so actors don't all start at same point
        var spreadDist = _rand(SPAWN_DIST_MIN_M, SPAWN_DIST_MAX_M);
        var spreadAngle = anchor.headingDeg + _rand(-40, 40);
        var origin = _offsetPosition(anchor.lat, anchor.lng, spreadAngle, spreadDist);

        _fetchShortRoute(origin.lat, origin.lng, spreadAngle)
          .then(function (routeData) {
            if (!routeData) routeData = _buildFallbackRoute(origin.lat, origin.lng, spreadAngle);
            var actor = _spawnActor(pool, routeData, 0);
            if (actor && renderer && typeof renderer.addActor === 'function') {
              renderer.addActor(actor);
            }
          });
      })(i);
    }

    if (!_active) _startTick();
    _scheduleWorldRebind();
    console.log('[TrafficOccupancyRuntime] spawning', count, 'actors');
  }

  // Spawn a specific truck variant
  function spawnTruck(variant) {
    variant = variant || 'clean_white';
    var anchor = _heroAnchor();
    if (!anchor) { console.warn('[TrafficOccupancyRuntime] no anchor'); return; }

    var spreadDist = _rand(SPAWN_DIST_MIN_M, 800);
    var origin = _offsetPosition(anchor.lat, anchor.lng, anchor.headingDeg + _rand(-30, 30), spreadDist);
    var renderer = global.SBE && SBE.TrafficOccupancyRenderer;

    _fetchShortRoute(origin.lat, origin.lng, anchor.headingDeg)
      .then(function (routeData) {
        if (!routeData) routeData = _buildFallbackRoute(origin.lat, origin.lng, anchor.headingDeg);
        var actor = _spawnActor({ type: 'box_truck', variant: variant }, routeData, 0);
        if (actor) {
          console.log('[TrafficOccupancyRuntime] truck spawned:', actor.id, '—', variant);
          if (renderer && typeof renderer.addActor === 'function') renderer.addActor(actor);
        }
      });

    if (!_active) _startTick();
    _scheduleWorldRebind();
  }

  function clear() {
    var renderer = global.SBE && SBE.TrafficOccupancyRenderer;
    _actors.forEach(function (a) {
      if (renderer && typeof renderer.removeActor === 'function') renderer.removeActor(a.id);
    });
    _actors = [];
    console.log('[TrafficOccupancyRuntime] cleared all traffic actors');
  }

  function setCount(n) {
    n = Math.max(0, Math.min(MAX_ACTORS, Number(n) || DEFAULT_COUNT));
    if (n < _actors.length) {
      // Remove excess
      var excess = _actors.splice(n);
      var renderer = global.SBE && SBE.TrafficOccupancyRenderer;
      excess.forEach(function (a) {
        if (renderer && typeof renderer.removeActor === 'function') renderer.removeActor(a.id);
      });
    } else if (n > _actors.length) {
      spawn(n - _actors.length);
    }
  }

  function getState() {
    return {
      active:   _active,
      count:    _actors.length,
      maxCount: MAX_ACTORS,
      actors:   _actors.map(function (a) {
        return {
          id:          a.id,
          type:        a.type,
          variant:     a.variant,
          mode:        a.mode,
          routeSource: a.routeSource,
          progressPct: Math.round(a.progress * 1000) / 10,
          ageSeconds:  Math.round((Date.now() - a.spawnedAtMs) / 100) / 10,
          static:      a.static || false,
        };
      }),
    };
  }

  function _startTick() {
    _active  = true;
    _lastMs  = 0;
    _rafId   = global.requestAnimationFrame(_tick);
    console.log('[TrafficOccupancyRuntime] RAF tick started');
  }

  // 0601B — after a spawn settles (route fetch is async), ask the world-space
  // layer to re-register any actors missing from its registry. Deferred so async
  // spawns have added their actors first. Idempotent + safe.
  function _scheduleWorldRebind() {
    global.setTimeout(function () {
      var wsl = global.SBE && SBE.WorldSpaceVehicleLayer;
      if (wsl && typeof wsl.attemptSessionRebind === 'function') {
        try { wsl.attemptSessionRebind(); } catch (e) {}
      }
    }, 250);
  }

  // Synchronous visibility test.
  // Default: static (frozen in place). Pass { moving: true } for moving actors.
  // Uses geo offsets from current hero/camera position — NO route fetch, NO async.
  // Actors placed 80m and 140m left/right of the heading axis.
  function spawnVisibleTest(opts) {
    opts = opts || {};
    var moving = !!(opts.moving);

    var anchor = _heroAnchor();
    if (!anchor) {
      var mvr = global.SBE && SBE.MapboxViewportRuntime;
      var map = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
      if (map) {
        try { var c = map.getCenter(); anchor = { lat: c.lat, lng: c.lng, headingDeg: 0 }; } catch (e) {}
      }
    }
    if (!anchor) { console.error('[TrafficOccupancyRuntime] spawnVisibleTest: no position'); return; }

    var renderer = global.SBE && SBE.TrafficOccupancyRenderer;
    var mode = moving ? 'visible_moving' : 'visible_static';

    var testSpecs = [
      { type: 'compact_car', variant: 'taxi_yellow',          offsetM:  80, side:  90 },
      { type: 'box_truck',   variant: 'clean_white',           offsetM:  80, side: -90 },
      { type: 'compact_car', variant: 'sedan_dark',            offsetM: 140, side:  90 },
      { type: 'box_truck',   variant: 'sticker_graffiti_test', offsetM: 140, side: -90 },
    ];

    testSpecs.forEach(function (spec) {
      var sideHeading = (anchor.headingDeg + spec.side + 360) % 360;
      var origin      = _offsetPosition(anchor.lat, anchor.lng, sideHeading, spec.offsetM);
      var aheadPt     = _offsetPosition(origin.lat, origin.lng, anchor.headingDeg, 200);

      var routeData = {
        source:          'visible-test',
        points:          [origin, aheadPt],
        distanceMeters:  200,
        durationSeconds: 24,
      };

      var poolEntry = { type: spec.type, variant: spec.variant, mode: mode, static: !moving };
      var actor = _spawnActor(poolEntry, routeData, 0);

      if (actor && renderer && typeof renderer.addActor === 'function') {
        renderer.addActor(actor, { scaleOverride: 2.0, zIndex: '30' });
        console.log('[TrafficOccupancyRuntime] spawnVisibleTest',
          moving ? '(moving)' : '(STATIC)',
          actor.id, spec.type + '/' + spec.variant,
          'at', actor.lat.toFixed(5), actor.lng.toFixed(5),
          spec.offsetM + 'm', (spec.side > 0 ? 'right' : 'left'));
      }
    });

    if (!_active) _startTick();
    _scheduleWorldRebind();

    global.setTimeout(function () {
      var debug = global._wos && global._wos.debug && global._wos.debug.traffic;
      if (debug) {
        console.group('[spawnVisibleTest] auto-report');
        if (typeof debug.visual === 'function') debug.visual();
        if (typeof debug.state  === 'function') debug.state();
        console.groupEnd();
      }
    }, 500);
  }

  function stop() {
    _active = false;
    if (_rafId) { global.cancelAnimationFrame(_rafId); _rafId = null; }
    clear();
    console.log('[TrafficOccupancyRuntime] stopped');
  }

  SBE.TrafficOccupancyRuntime = Object.freeze({
    VERSION:            VERSION,
    spawn:              spawn,
    spawnTruck:         spawnTruck,
    spawnVisibleTest:   spawnVisibleTest,
    spawnOnHeroRoute:   spawnOnHeroRoute,
    clear:              clear,
    setCount:           setCount,
    getState:           getState,
    stop:               stop,
  });

  console.log('[TrafficOccupancyRuntime] v' + VERSION + ' loaded');

})(window);
