// ── TrafficOccupancyRenderer v1.0.0 ──────────────────────────────────────────
// 0531I_WOS_TrafficOccupancy_v1.0.0
// Status: prototype
// Classification: render-actor
//
// Renders traffic actors as DOM markers on the Mapbox map.
// Each actor type/variant gets a distinct SVG shape sized smaller than the
// hero vehicle so it reads as environment, not foreground.
//
// Box truck geometry:
//   cab block  — short square front section
//   cargo box  — wide rectangular rear section
//   windshield — blue pane on cab front
//   heading cue — white chevron on cab nose
//   graffiti variant — procedural coloured marks on cargo side
//   contact shadow — thin blurred strip under chassis
//
// Authority:
//   OWNS: traffic DOM markers and their visual state
//   READS: MapboxViewportRuntime.getMap()
//   MUST NOT: move hero vehicle, control camera, affect route
//
// Placement: wall/systems/render/trafficOccupancyRenderer.js
// Load: AFTER trafficOccupancyRuntime.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.1.0';

  var _markers = {};   // actorId → { marker, wrapEl, lastScale, worldBound, worldVisible }

  // ── World-space binding ───────────────────────────────────────────────────────
  // Separate from WSL's own enable: traffic can be forced DOM-only via world(false)
  // even when WSL is enabled (e.g. to isolate hero rendering during debugging).
  var _worldBindingEnabled = true;
  var _lastWorldSuccess    = null;   // { id, actorType, variant }
  var _lastWorldFailure    = null;   // { id, reason }
  var _warnThrottle        = {};     // "id|reason" → lastWarnMs
  var WORLD_WARN_INTERVAL  = 2000;

  function _warnOnce(id, reason, detail) {
    var key = id + '|' + reason;
    var now = Date.now();
    if (_warnThrottle[key] && (now - _warnThrottle[key]) < WORLD_WARN_INTERVAL) return;
    _warnThrottle[key] = now;
    console.warn('[TrafficOccupancyRenderer] world bind failed:', id, '—', reason,
      detail ? '| ' + detail : '', '— DOM fallback active');
  }

  // ── Zoom-scale ────────────────────────────────────────────────────────────────
  function _zoomScale(zoom) {
    if (zoom == null) return 0.6;
    if (zoom >= 17.0) return 0.72;   // smaller than hero's 1.0
    if (zoom >= 15.0) return 0.55;
    return 0.38;
  }

  // ── SVG generators ────────────────────────────────────────────────────────────
  // Compact car — smaller, rounder variant of the hero car
  function _svgCompactCar(variant) {
    var bodyColor = variant === 'taxi_yellow'  ? '#f7c800'
                  : variant === 'sedan_light'  ? '#c4c8cc'
                  : '#3d4a5c';
    var roofColor = variant === 'taxi_yellow'  ? '#e0b400'
                  : variant === 'sedan_light'  ? '#a8abaf'
                  : '#2a3340';
    return [
      '<svg width="32" height="22" viewBox="0 0 32 22" xmlns="http://www.w3.org/2000/svg">',
      // contact shadow
      '<rect x="4" y="19" width="24" height="2.5" rx="1.5" fill="rgba(0,0,0,0.22)"',
      '      filter="url(#tr-blur)"/>',
      '<defs><filter id="tr-blur"><feGaussianBlur stdDeviation="0.9"/></filter></defs>',
      // body
      '<rect x="2" y="3" width="28" height="16" rx="4"',
      '      fill="' + bodyColor + '" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/>',
      // roof
      '<rect x="7" y="6" width="18" height="9" rx="2.5" fill="' + roofColor + '"/>',
      // windshield (front = top)
      '<rect x="8.5" y="4" width="15" height="4" rx="1.5" fill="#bde0ff" opacity="0.80"/>',
      // nose cue
      '<polygon points="16,0.5 12,3.5 20,3.5" fill="#ffffffaa"/>',
      '</svg>',
    ].join('');
  }

  // Box truck — cab + cargo box, top-down
  function _svgBoxTruck(variant) {
    var cargoFill = variant === 'weathered' ? '#d4cfc6'
                  : '#f4f4f4';   // white/off-white for clean and graffiti

    // Graffiti marks — procedural color blocks on cargo sides
    var graffitiLayer = '';
    if (variant === 'sticker_graffiti_test') {
      // A few hard-edged coloured rectangles suggesting sticker/block lettering
      graffitiLayer = [
        '<rect x="16" y="6"  width="8"  height="3.5" rx="0.5" fill="#e63e2a" opacity="0.88"/>',
        '<rect x="25" y="6"  width="5"  height="3.5" rx="0.5" fill="#2b8cde" opacity="0.88"/>',
        '<rect x="16" y="10" width="5"  height="3.5" rx="0.5" fill="#f5c518" opacity="0.88"/>',
        '<rect x="22" y="10" width="8"  height="3.5" rx="0.5" fill="#3ab56f" opacity="0.88"/>',
        // tag-like thin line
        '<line x1="17" y1="14.5" x2="29" y2="14.5" stroke="#e63e2a" stroke-width="1.0" opacity="0.70"/>',
      ].join('');
    }

    return [
      '<svg width="48" height="22" viewBox="0 0 48 22" xmlns="http://www.w3.org/2000/svg">',
      // contact shadow
      '<rect x="2" y="19" width="44" height="2.5" rx="1.5" fill="rgba(0,0,0,0.22)"',
      '      filter="url(#tr-blur)"/>',
      '<defs><filter id="tr-blur"><feGaussianBlur stdDeviation="0.9"/></filter></defs>',
      // cargo box (rear, larger section)
      '<rect x="13" y="3" width="34" height="16" rx="2"',
      '      fill="' + cargoFill + '" stroke="rgba(0,0,0,0.30)" stroke-width="0.8"/>',
      // graffiti / art layer on cargo side
      graffitiLayer,
      // cargo panel seam (centre horizontal)
      '<line x1="14" y1="11" x2="46" y2="11" stroke="rgba(0,0,0,0.10)" stroke-width="0.5"/>',
      // cab (front, shorter)
      '<rect x="2" y="5" width="14" height="12" rx="3"',
      '      fill="#5a6068" stroke="rgba(0,0,0,0.40)" stroke-width="0.8"/>',
      // windshield (cab front = top of svg)
      '<rect x="3.5" y="5.5" width="11" height="4.5" rx="1.5" fill="#bde0ff" opacity="0.82"/>',
      // heading cue
      '<polygon points="9,0 5.5,5 12.5,5" fill="#ffffffb0"/>',
      // cab–cargo join shadow
      '<rect x="13" y="3" width="1.5" height="16" fill="rgba(0,0,0,0.15)"/>',
      '</svg>',
    ].join('');
  }

  function _svgForActor(actor) {
    if (actor.type === 'box_truck') return _svgBoxTruck(actor.variant);
    return _svgCompactCar(actor.variant);
  }

  function _sizeForActor(actor) {
    if (actor.type === 'box_truck') return { w: 48, h: 22 };
    return { w: 32, h: 22 };
  }

  // ── Marker management ─────────────────────────────────────────────────────────

  function _getMap() {
    var mvr = global.SBE && SBE.MapboxViewportRuntime;
    return mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
  }

  function addActor(actor, opts) {
    var mapboxgl = global.mapboxgl;
    var map      = _getMap();
    if (!mapboxgl || !map) {
      console.warn('[TrafficOccupancyRenderer] map not ready for actor', actor.id);
      return false;
    }
    if (_markers[actor.id]) return true;   // already added

    opts = opts || {};
    var scaleOverride = opts.scaleOverride || null;   // multiplier on top of zoom scale
    var zIndex        = opts.zIndex        || '10';

    var size    = _sizeForActor(actor);
    var wrapEl  = document.createElement('div');
    wrapEl.className = 'wos-traffic-actor';
    wrapEl.style.cssText = [
      'width:' + size.w + 'px;',
      'height:' + size.h + 'px;',
      'will-change:transform;',
      'pointer-events:none;',
      'transform-origin:50% 50%;',
      'z-index:' + zIndex + ';',
      'position:relative;',
    ].join('');
    if (scaleOverride != null) {
      wrapEl.dataset.scaleOverride = String(scaleOverride);
    }
    wrapEl.innerHTML = _svgForActor(actor);

    var marker = new mapboxgl.Marker({
      element:           wrapEl,
      rotationAlignment: 'map',
      pitchAlignment:    'map',
      anchor:            'center',
    }).setLngLat([actor.lng, actor.lat]).addTo(map);

    if (!marker) { console.error('[TrafficOccupancyRenderer] marker creation failed for', actor.id); return false; }

    _markers[actor.id] = {
      marker: marker, wrapEl: wrapEl, lastScale: -1,
      worldBound: false, worldVisible: false,
      lastActor: actor, actorType: actor.type, variant: actor.variant,
    };

    // Verify DOM attachment — a marker not attached to the map body is invisible.
    var attached = !!(wrapEl && wrapEl.isConnected);
    if (!attached) {
      console.warn('[TrafficOccupancyRenderer] marker DOM not connected for', actor.id,
        '— map may not have container ready yet');
    } else {
      console.log('[TrafficOccupancyRenderer] added', actor.id, actor.type + '/' + actor.variant,
        'at', actor.lat.toFixed(5), actor.lng.toFixed(5), 'DOM attached:', attached);
    }
    return attached;
  }

  // Map traffic actor type names to world-space layer actorType values
  function _wsActorType(trafficType) {
    if (trafficType === 'box_truck') return 'box_truck';
    return 'traffic_car';
  }

  function updateActor(actor) {
    var entry = _markers[actor.id];
    // Keep last-known actor snapshot for session rebind recovery (0601B)
    if (entry) {
      entry.lastActor = actor;
      entry.actorType = actor.type;
      entry.variant   = actor.variant;
    }

    // ── World-space layer path (preferred) ──────────────────────────────────
    var wsl = global.SBE && SBE.WorldSpaceVehicleLayer;
    var wslReady = !!(_worldBindingEnabled && wsl &&
      typeof wsl.getEnabled    === 'function' && wsl.getEnabled() &&
      typeof wsl.isRenderReady === 'function' && wsl.isRenderReady());

    if (wslReady) {
      var ok = false;
      try {
        ok = wsl.upsertVehicle({
          id:         actor.id,
          actorType:  _wsActorType(actor.type),
          variant:    actor.variant || 'sedan_dark',
          lat:        actor.lat,
          lng:        actor.lng,
          headingDeg: actor.headingDeg || 0,
          scale:      1,
          visible:    true,
          source:     actor.mode || actor.source || 'traffic',
        });
      } catch (e) {
        // upsertVehicle has its own total-failure guard; this is belt-and-braces
        _warnOnce(actor.id, 'upsert_threw', e && e.message);
        ok = false;
      }

      if (ok) {
        _lastWorldSuccess = { id: actor.id, actorType: _wsActorType(actor.type), variant: actor.variant };
        // Shape-mode aware: calibration modes (block/slab/wedge) keep DOM visible
        // for comparison; vehicle mode hides DOM once world-space confirmed.
        var shapeMode = (typeof wsl.getShapeMode === 'function') ? wsl.getShapeMode()
                      : (typeof wsl.getVisibilityMode === 'function') ? wsl.getVisibilityMode()
                      : 'vehicle';
        var calibration = (shapeMode === 'block' || shapeMode === 'slab' || shapeMode === 'wedge');
        if (entry) {
          entry.worldBound   = true;
          entry.worldVisible = true;
          entry.wrapEl.style.display = calibration ? '' : 'none';
        }
        if (!calibration) return;   // vehicle mode: world-space owns rendering
        // calibration mode: fall through to also update DOM marker
      } else {
        // upsert returned false — record reason from WSL trace if available
        var reason = 'upsert_false';
        if (typeof wsl.getUpsertTraceState === 'function') {
          var ts = wsl.getUpsertTraceState();
          if (ts && ts.lastFailure && ts.lastFailure.payload && ts.lastFailure.payload.id === actor.id) {
            reason = ts.lastFailure.reason;
          }
        }
        _lastWorldFailure = { id: actor.id, reason: reason };
        _warnOnce(actor.id, reason);
        if (entry) { entry.worldBound = false; entry.worldVisible = false; }
        // fall through to DOM fallback
      }
    } else if (entry) {
      // WSL not handling this actor
      entry.worldBound = false;
      entry.worldVisible = false;
    }

    // ── DOM marker fallback ─ restore visibility when world layer not handling ──
    if (!entry) return;
    if (entry.wrapEl.style.display === 'none' && !(entry.worldBound)) {
      entry.wrapEl.style.display = '';
    }
    entry.marker.setLngLat([actor.lng, actor.lat]);
    entry.marker.setRotation(actor.headingDeg || 0);

    // Zoom-aware scale, with optional per-actor override
    var map = _getMap();
    var zoom = null;
    if (map) { try { zoom = map.getZoom(); } catch (e) {} }
    var baseScale = _zoomScale(zoom);
    var scaleOverride = entry.wrapEl.dataset.scaleOverride;
    var scale = scaleOverride ? baseScale * Number(scaleOverride) : baseScale;
    if (scale !== entry.lastScale) {
      entry.lastScale = scale;
      entry.wrapEl.style.transform = 'scale(' + scale + ')';
    }
  }

  function removeActor(id) {
    // Remove from world-space layer if present (safe no-op if not found)
    var wsl = global.SBE && SBE.WorldSpaceVehicleLayer;
    if (wsl && typeof wsl.removeVehicle === 'function') wsl.removeVehicle(id);

    // Clear any throttle keys for this actor
    Object.keys(_warnThrottle).forEach(function (k) {
      if (k.indexOf(id + '|') === 0) delete _warnThrottle[k];
    });

    var entry = _markers[id];
    if (!entry) return;
    try { entry.marker.remove(); } catch (e) {}
    delete _markers[id];
  }

  function clearAll() {
    Object.keys(_markers).forEach(removeActor);
  }

  // ── World-space binding control ───────────────────────────────────────────────

  // setWorldBinding(false) forces DOM-only traffic. Removes all world meshes so
  // DOM markers take over cleanly (no ghost world-space vehicles).
  function setWorldBinding(on) {
    _worldBindingEnabled = !!on;
    if (!_worldBindingEnabled) {
      var wsl = global.SBE && SBE.WorldSpaceVehicleLayer;
      Object.keys(_markers).forEach(function (id) {
        if (wsl && typeof wsl.removeVehicle === 'function') wsl.removeVehicle(id);
        var e = _markers[id];
        if (e) { e.worldBound = false; e.worldVisible = false; e.wrapEl.style.display = ''; }
      });
    }
    return _worldBindingEnabled;
  }
  function getWorldBinding() { return _worldBindingEnabled; }

  // rebindWorld — re-emit every live actor into WorldSpaceVehicleLayer.
  // Called by WSL.attemptSessionRebind() after runtime transitions. Idempotent:
  // updateActor() upserts (creates-or-updates) so repeated calls converge.
  // Uses each marker's last-known actor snapshot (kept fresh by the RAF tick).
  function rebindWorld() {
    var n = 0;
    Object.keys(_markers).forEach(function (id) {
      var e = _markers[id];
      if (e && e.lastActor) { try { updateActor(e.lastActor); n++; } catch (err) {} }
    });
    return n;
  }

  function getWorldState() {
    var wsl = global.SBE && SBE.WorldSpaceVehicleLayer;
    var ids = Object.keys(_markers);
    var worldActorCount = 0, domVisibleCount = 0, domFallbackCount = 0;
    ids.forEach(function (id) {
      var e = _markers[id];
      if (e.worldBound) worldActorCount++;
      var domVisible = e.wrapEl && e.wrapEl.style.display !== 'none' && e.wrapEl.isConnected;
      if (domVisible) domVisibleCount++;
      if (domVisible && !e.worldBound) domFallbackCount++;
    });
    return {
      enabled:          _worldBindingEnabled,
      wslEnabled:       !!(wsl && typeof wsl.getEnabled === 'function' && wsl.getEnabled()),
      wslRenderReady:   !!(wsl && typeof wsl.isRenderReady === 'function' && wsl.isRenderReady()),
      actorCount:       ids.length,
      worldActorCount:  worldActorCount,
      domVisibleCount:  domVisibleCount,
      domFallbackCount: domFallbackCount,
      lastWorldSuccess: _lastWorldSuccess,
      lastWorldFailure: _lastWorldFailure,
    };
  }

  function getVisualState() {
    var mvr  = global.SBE && SBE.MapboxViewportRuntime;
    var map  = mvr && typeof mvr.getMap === 'function' ? mvr.getMap() : null;
    var zoom = null;
    var bounds = null;
    if (map) {
      try { zoom = map.getZoom(); } catch (e) {}
      try { bounds = map.getBounds(); } catch (e) {}
    }

    var ids = Object.keys(_markers);
    return {
      markerCount: ids.length,
      markerIds:   ids,
      currentZoom: zoom != null ? Math.round(zoom * 10) / 10 : null,
      scale:       _zoomScale(zoom),
      actors:      ids.map(function (id) {
        var e   = _markers[id];
        var pos = null;
        try { pos = e.marker.getLngLat(); } catch (err) {}

        var inBounds = null;
        if (bounds && pos) {
          inBounds = pos.lng >= bounds.getWest() && pos.lng <= bounds.getEast() &&
                     pos.lat >= bounds.getSouth() && pos.lat <= bounds.getNorth();
          if (!inBounds) {
            console.warn('[TrafficOccupancyRenderer]', id, 'is OUTSIDE viewport bounds!',
              'Actor:', pos.lat.toFixed(5), pos.lng.toFixed(5),
              '| Bounds:', bounds.getSouth().toFixed(4), bounds.getNorth().toFixed(4),
              bounds.getWest().toFixed(4), bounds.getEast().toFixed(4));
          }
        }

        // Cross-reference runtime state for mode + age
        var rt     = global.SBE && SBE.TrafficOccupancyRuntime;
        var rtState = rt && typeof rt.getState === 'function' ? rt.getState() : null;
        var rtActor = rtState && rtState.actors.find(function (a) { return a.id === id; });

        var domVisible = !!(e.wrapEl && e.wrapEl.style.display !== 'none' && e.wrapEl.isConnected);
        return {
          id:          id,
          actorType:   rtActor ? (rtActor.type || rtActor.actorType) : (e.actorType || '—'),
          variant:     rtActor ? rtActor.variant : (e.variant || '—'),
          mode:        rtActor ? rtActor.mode : '—',
          domAttached: !!(e.wrapEl && e.wrapEl.isConnected),
          domVisible:  domVisible,
          worldBound:  !!e.worldBound,
          worldVisible: !!e.worldVisible,
          inBounds:    inBounds,
          lat:         pos ? Math.round(pos.lat * 1e5) / 1e5 : null,
          lng:         pos ? Math.round(pos.lng * 1e5) / 1e5 : null,
          headingDeg:  rtActor ? rtActor.headingDeg : null,
          scale:       e.lastScale,
          ageSeconds:  rtActor ? rtActor.ageSeconds : '—',
          static:      rtActor ? rtActor.static : null,
        };
      }),
    };
  }

  SBE.TrafficOccupancyRenderer = Object.freeze({
    VERSION:         VERSION,
    addActor:        addActor,
    updateActor:     updateActor,
    removeActor:     removeActor,
    clearAll:        clearAll,
    getVisualState:  getVisualState,
    setWorldBinding: setWorldBinding,
    getWorldBinding: getWorldBinding,
    getWorldState:   getWorldState,
    rebindWorld:     rebindWorld,
  });

  console.log('[TrafficOccupancyRenderer] v' + VERSION + ' loaded');

})(window);
