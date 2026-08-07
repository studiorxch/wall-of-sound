// ── RacetrackPresentationKit v1.2.0 ───────────────────────────────────────────
// 0805H_RACETRACK_Presentation_Surface_Overhaul, repaired 0806A/0806B,
// extended 0806C
// Status: active | Classification: presentation / racetrack-presentation-kit
//
// 0806C — removed the inert "START SESSION — COMING SOON" placeholder from
// RacetrackLobbySummary; the real Begin Race control now lives in
// racetrackSelectionScene.js's _renderLobby(), beside Back to Selection.
//
// Reusable DOM-building primitives for RACETRACK's Attract/Selection/Lobby
// scenes — pure rendering helpers (not React, not a component framework;
// wall/ stays vanilla JS). racetrackSelectionScene.js composes these into
// the actual scenes; this file owns no runtime state of its own beyond the
// featured Orb's own THREE.js stage instance (which IS genuinely stateful —
// a live WebGL canvas/RAF loop — everything else here is a stateless
// builder function returning a fresh DOM node every call, matching this
// codebase's "full teardown/rebuild every render, no diffing" convention).
//
// 0806B — RacetrackRoutePresentation split into RacetrackRouteVisual +
// RacetrackRouteMeta so the scene composer can place the course selector
// BETWEEN them in DOM order, required for the narrow/stacked responsive
// flow (route visual → course selector → route metadata+warnings), which
// couldn't be achieved by CSS alone while both halves were one DOM node.
//
// The featured Orb stage reuses SBE.OrbObjectFactory.build(profile, THREE)
// — the SAME archetype builder canonical LIVE MAP's hero renderer and
// MUSIC's own Orb editor preview already use — in its own small, independent
// canvas/scene/camera. Never a second Mapbox instance, never a second live
// map: the route stays an inline SVG projected from the course package's own
// previewRoute.
//
// Load: after OrbProfileAuthority, racetrackCoursePackageRuntime.js,
// racetrackSessionRuntime.js, racetrackReadiness.js — before
// racetrackSelectionScene.js, which depends on this file.
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.1.0';
  var doc = global.document;

  function _el(tag, className, text) {
    var e = doc.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }

  function _fmtDistance(m) {
    if (typeof m !== 'number' || !isFinite(m)) return '—';
    var miles = m / 1609.344;
    return miles.toFixed(2) + ' mi';
  }

  // ── RacetrackHudLabel — small-caps AR/HUD-style label ──────────────────────
  // Consolidates every ad hoc "SELECTED ORB" / "GAME MODE" / "START" /
  // "FINISH" style label into one shared primitive.
  function RacetrackHudLabel(text) {
    return _el('span', 'racetrack-hud-label', text);
  }

  // ── RacetrackSelector — generic prev/next pager ────────────────────────────
  // opts: { label, value, onPrev, onNext, disabled }
  function RacetrackSelector(opts) {
    var row = _el('div', 'racetrack-selector');
    var prev = _el('button', 'racetrack-selector-btn', '‹');
    prev.type = 'button';
    prev.disabled = !!opts.disabled;
    prev.setAttribute('aria-label', 'Previous ' + opts.label);
    prev.addEventListener('click', function (e) { e.stopPropagation(); opts.onPrev(); });
    var mid = _el('div', 'racetrack-selector-mid');
    mid.appendChild(RacetrackHudLabel(opts.label));
    mid.appendChild(_el('div', 'racetrack-selector-value', opts.value));
    var next = _el('button', 'racetrack-selector-btn', '›');
    next.type = 'button';
    next.disabled = !!opts.disabled;
    next.setAttribute('aria-label', 'Next ' + opts.label);
    next.addEventListener('click', function (e) { e.stopPropagation(); opts.onNext(); });
    row.appendChild(prev); row.appendChild(mid); row.appendChild(next);
    return row;
  }

  // ── RacetrackOrbStage — the dominant featured-Orb hero stage ───────────────
  // Owns its OWN small THREE.js canvas/scene/camera/RAF loop, independent of
  // canonical LIVE MAP's Mapbox-coupled orbProfileRenderer.js (wrong tool
  // here — this is a standalone hero shot, not a globe-positioned entity).
  function _disposeOrbStageState(state) {
    if (!state) return;
    global.cancelAnimationFrame(state.rafId);
    if (state.resizeObserver) state.resizeObserver.disconnect();
    try { if (state.instance && state.instance.dispose) state.instance.dispose(); } catch (e) {}
    try { state.renderer.dispose(); } catch (e) {}
    if (state.canvas.parentNode) state.canvas.parentNode.removeChild(state.canvas);
  }

  function _mountOrbStageState(container, orbProfile) {
    var THREE = global.THREE;
    var factory = SBE.OrbObjectFactory;
    if (!THREE || !factory || !orbProfile) return null;

    var canvas = doc.createElement('canvas');
    canvas.style.cssText = 'width:100%; height:100%; display:block;';
    container.appendChild(canvas);

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    var rect = container.getBoundingClientRect();
    renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height));
    renderer.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(38, rect.width / Math.max(1, rect.height), 0.1, 100);
    camera.position.set(0, 0, 3.4);
    camera.lookAt(0, 0, 0);

    var instance = null;
    try {
      instance = factory.build(orbProfile, THREE);
      scene.add(instance.group);
      // 0806A — fit the camera to the built geometry's ACTUAL bounding
      // sphere (including any halo/ring extending past the base radius)
      // instead of a fixed distance tuned for one archetype. Fixes clipping
      // across different Orb archetypes and after cycling between them.
      var box = new THREE.Box3().setFromObject(instance.group);
      var sphere = box.getBoundingSphere(new THREE.Sphere());
      if (isFinite(sphere.radius) && sphere.radius > 0) {
        var fovRad = camera.fov * Math.PI / 180;
        var fitDistance = (sphere.radius / Math.sin(fovRad / 2)) * 1.15; // 15% margin
        camera.position.set(0, 0, Math.max(2.2, fitDistance));
        camera.lookAt(0, 0, 0);
      }
    } catch (e) {
      /* a broken profile renders an empty stage rather than throwing */
    }

    var resizeObserver = new ResizeObserver(function () {
      var r = container.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) return;
      renderer.setSize(r.width, r.height);
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(container);

    var startedAt = performance.now();
    var state = { renderer: renderer, scene: scene, camera: camera, instance: instance, canvas: canvas, resizeObserver: resizeObserver, rafId: 0 };
    function frame() {
      if (!state.live) return;
      if (state.instance && state.instance.update) state.instance.update((performance.now() - startedAt) / 1000);
      renderer.render(scene, camera);
      state.rafId = global.requestAnimationFrame(frame);
    }
    state.live = true;
    frame();
    return state;
  }

  // opts: { orbProfile, name, team, isStale }
  // Returns { element, dispose() } — caller (the scene's teardown-per-render
  // cycle) MUST call dispose() before discarding, same discipline the
  // module-singleton version used before this file existed.
  //
  // 0806A — the actual Three.js mount is DEFERRED to the next animation
  // frame rather than run synchronously here. At the point RacetrackOrbStage
  // is called, `canvasHost` is still a detached DOM node (the caller hasn't
  // appended the composed tree to `_root` yet) — measuring it immediately
  // (the pre-0806A behavior) returns {width:0,height:0}, seeding the
  // renderer/camera at a degenerate size until a later ResizeObserver
  // callback corrects it. By the time a rAF callback fires, the caller has
  // already synchronously appended the tree in the same task, so the real
  // laid-out size is measurable. `disposed` and the caller-supplied
  // `isStale()` are two independent guards against a deferred mount
  // attaching after a NEWER render has already superseded this one.
  function RacetrackOrbStage(opts) {
    var plinth = _el('div', 'racetrack-orb-plinth');
    var canvasHost = _el('div', 'racetrack-orb-canvas');
    plinth.appendChild(canvasHost);

    var state = null;
    var disposed = false;
    if (opts.orbProfile) {
      global.requestAnimationFrame(function () {
        if (disposed) return;
        if (opts.isStale && opts.isStale()) return;
        state = _mountOrbStageState(canvasHost, opts.orbProfile);
      });
    }

    var caption = _el('div', 'racetrack-orb-caption');
    caption.appendChild(RacetrackHudLabel('SELECTED ORB'));
    caption.appendChild(_el('div', 'racetrack-orb-name', opts.name || '—'));
    if (opts.team) caption.appendChild(_el('div', 'racetrack-orb-team', opts.team));
    plinth.appendChild(caption);

    return {
      element: plinth,
      dispose: function () {
        disposed = true;
        if (state) { state.live = false; _disposeOrbStageState(state); state = null; }
      },
    };
  }

  // ── RacetrackRoutePresentation — the floating route/course zone ───────────
  // Inline SVG, lng/lat-projected from the package's own previewRoute —
  // never a second live Mapbox instance. Altitude data doesn't exist on
  // RacetrackCoursePackage, so start/finish callouts show DISTANCE (real
  // data) rather than a fabricated elevation figure — a disclosed
  // simplification vs. the concept image, not invented data.
  function _buildRouteSvg(previewRoute) {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = doc.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 300 220');
    svg.setAttribute('class', 'racetrack-route-svg');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    if (!previewRoute || previewRoute.length < 2) return svg;

    var minLng = previewRoute[0].coordinate[0], maxLng = previewRoute[0].coordinate[0];
    var minLat = previewRoute[0].coordinate[1], maxLat = previewRoute[0].coordinate[1];
    for (var i = 0; i < previewRoute.length; i++) {
      var c = previewRoute[i].coordinate;
      minLng = Math.min(minLng, c[0]); maxLng = Math.max(maxLng, c[0]);
      minLat = Math.min(minLat, c[1]); maxLat = Math.max(maxLat, c[1]);
    }
    var padding = 18;
    var w = 300 - padding * 2, h = 220 - padding * 2;
    var lngSpan = Math.max(1e-9, maxLng - minLng);
    var latSpan = Math.max(1e-9, maxLat - minLat);
    var scale = Math.min(w / lngSpan, h / latSpan);

    function project(coord) {
      var x = padding + (coord[0] - minLng) * scale;
      var y = padding + (1 - (coord[1] - minLat) / latSpan) * h;
      return [x, y];
    }

    var d = '';
    for (var j = 0; j < previewRoute.length; j++) {
      var p = project(previewRoute[j].coordinate);
      d += (j === 0 ? 'M ' : 'L ') + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + ' ';
    }
    var path = doc.createElementNS(ns, 'path');
    path.setAttribute('d', d.trim());
    path.setAttribute('class', 'racetrack-route-path');
    svg.appendChild(path);

    var startP = project(previewRoute[0].coordinate);
    var finishP = project(previewRoute[previewRoute.length - 1].coordinate);
    [['start', startP], ['finish', finishP]].forEach(function (pair) {
      var dot = doc.createElementNS(ns, 'circle');
      dot.setAttribute('cx', pair[1][0]); dot.setAttribute('cy', pair[1][1]); dot.setAttribute('r', 4);
      dot.setAttribute('class', 'racetrack-route-dot racetrack-route-dot--' + pair[0]);
      svg.appendChild(dot);
    });
    return svg;
  }

  // 0806B — split from the formerly-bundled RacetrackRoutePresentation into
  // two independent pieces (RacetrackRouteVisual + RacetrackRouteMeta) so
  // the scene composer can sandwich the course selector BETWEEN them in DOM
  // order — required for the narrow/stacked responsive flow (route visual,
  // then course selector, then route metadata+warnings), which cannot be
  // achieved by CSS alone when both halves are welded into one DOM node.
  //
  // opts: { coursePackage } — coursePackage may be null (not-ready state).
  // The visual half (title + SVG + start/finish callouts) — never omitted,
  // shows an empty-state note when there's no package yet.
  function RacetrackRouteVisual(opts) {
    var wrap = _el('div', 'racetrack-route-zone');
    var pkg = opts.coursePackage;
    if (!pkg) {
      wrap.appendChild(_el('div', 'racetrack-empty-note', 'No Course Package published yet — compile one from MAPS Race Courses.'));
      return wrap;
    }

    wrap.appendChild(_el('div', 'racetrack-route-title', pkg.name));
    var svgWrap = _el('div', 'racetrack-route-svg-wrap');
    svgWrap.appendChild(_buildRouteSvg(pkg.previewRoute));

    var startCallout = _el('div', 'racetrack-route-callout racetrack-route-callout--start');
    startCallout.appendChild(RacetrackHudLabel('START'));
    startCallout.appendChild(_el('div', 'racetrack-route-callout-value', '0 mi'));
    svgWrap.appendChild(startCallout);

    var finishCallout = _el('div', 'racetrack-route-callout racetrack-route-callout--finish');
    finishCallout.appendChild(RacetrackHudLabel('FINISH'));
    finishCallout.appendChild(_el('div', 'racetrack-route-callout-value', _fmtDistance(pkg.finish.distanceMeters)));
    svgWrap.appendChild(finishCallout);

    wrap.appendChild(svgWrap);
    return wrap;
  }

  // opts: { coursePackage } — the metadata half (stats + optional runtime
  // warning). Returns null when there's no package (nothing to show, and
  // no empty-state duplication — RacetrackRouteVisual already carries that).
  function RacetrackRouteMeta(opts) {
    var pkg = opts.coursePackage;
    if (!pkg) return null;

    var wrap = _el('div', 'racetrack-route-meta');
    var stats = _el('div', 'racetrack-route-stats');
    stats.appendChild(_el('span', 'racetrack-route-stat', _fmtDistance(pkg.finish.distanceMeters)));
    stats.appendChild(_el('span', 'racetrack-route-stat', pkg.checkpoints.length + ' checkpoints'));
    wrap.appendChild(stats);

    if (pkg.warnings && pkg.warnings.length > 0) {
      // Never hidden — a presentation-ready package may still carry real
      // runtime-only warnings (e.g. offset_intersection); disclosed here,
      // not treated as a blocker for Attract/Selection/Lobby.
      wrap.appendChild(_el('div', 'racetrack-readiness-note', 'Runtime warnings: ' + pkg.warnings.join(', ').replace(/_/g, ' ')));
    }
    return wrap;
  }

  // ── RacetrackRoster — compact strip + a lightweight add-competitor picker ──
  // Each roster member shows only an Orb-color-keyed swatch + name + team —
  // no verbose buttons/duplicate text on the main surface. Adding a
  // competitor opens a compact overlay (styled off this codebase's proven
  // .shortcut-hud fixed-overlay pattern — no native <dialog> precedent
  // exists here, confirmed, so this doesn't introduce one).
  function _resolveBaseColor(competitor) {
    var authority = SBE.OrbProfileAuthority;
    var profile = authority ? authority.getOrbProfile(competitor.orbProfileId) : null;
    return (profile && profile.material && profile.material.baseColor) || '#666';
  }

  function _closePicker(overlay, onKeydown) {
    if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    doc.removeEventListener('keydown', onKeydown);
  }

  function _openRosterPicker(trigger, available, onAdd) {
    var overlay = _el('div', 'racetrack-roster-picker');
    var card = _el('div', 'racetrack-roster-picker-card');
    card.appendChild(_el('div', 'racetrack-panel-title', 'Add Competitor'));
    var list = _el('div', 'racetrack-roster-picker-list');
    if (available.length === 0) {
      list.appendChild(_el('div', 'racetrack-empty-note', 'No more competitors available.'));
    }
    available.forEach(function (c) {
      var row = _el('button', 'racetrack-roster-picker-row');
      row.type = 'button';
      var swatch = _el('span', 'racetrack-roster-swatch');
      swatch.style.background = _resolveBaseColor(c);
      row.appendChild(swatch);
      row.appendChild(_el('span', 'racetrack-roster-picker-name', c.name + ' — ' + c.team));
      row.addEventListener('click', function () {
        onAdd(c.id);
        close();
      });
      list.appendChild(row);
    });
    card.appendChild(list);
    overlay.appendChild(card);

    function onKeydown(e) {
      if (e.key === 'Escape') close();
    }
    function close() {
      _closePicker(overlay, onKeydown);
      if (trigger && trigger.focus) trigger.focus();
    }
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });
    doc.addEventListener('keydown', onKeydown);
    doc.body.appendChild(overlay);
    var firstRow = list.querySelector('button');
    if (firstRow) firstRow.focus();
  }

  // opts: { roster, availableToAdd, onAdd, onRemove }
  function RacetrackRoster(opts) {
    var wrap = _el('div', 'racetrack-roster');
    wrap.appendChild(RacetrackHudLabel('COMPETITORS'));
    var strip = _el('div', 'racetrack-roster-strip');
    opts.roster.forEach(function (c) {
      var chip = _el('div', 'racetrack-roster-chip');
      var swatch = _el('span', 'racetrack-roster-swatch');
      swatch.style.background = _resolveBaseColor(c);
      chip.appendChild(swatch);
      var text = _el('span', 'racetrack-roster-chip-text', c.name);
      chip.appendChild(text);
      var removeBtn = _el('button', 'racetrack-roster-remove', '×');
      removeBtn.type = 'button';
      removeBtn.setAttribute('aria-label', 'Remove ' + c.name);
      removeBtn.addEventListener('click', function () { opts.onRemove(c.id); });
      chip.appendChild(removeBtn);
      strip.appendChild(chip);
    });
    var addBtn = _el('button', 'racetrack-roster-add-trigger', '+');
    addBtn.type = 'button';
    addBtn.setAttribute('aria-label', 'Add competitor');
    addBtn.addEventListener('click', function () {
      _openRosterPicker(addBtn, opts.availableToAdd, opts.onAdd);
    });
    strip.appendChild(addBtn);
    wrap.appendChild(strip);
    return wrap;
  }

  // ── RacetrackPlaylistControl — one compact selected-playlist row ──────────
  // opts: { playlist, disabled, onPrev, onNext }
  function RacetrackPlaylistControl(opts) {
    var wrap = _el('div', 'racetrack-playlist-control');
    var playlist = opts.playlist;
    var valueText = playlist ? playlist.title : '—';
    wrap.appendChild(RacetrackSelector({
      label: 'PLAYLIST', value: valueText,
      onPrev: opts.onPrev, onNext: opts.onNext, disabled: opts.disabled,
    }));
    if (playlist) {
      var meta = _el('div', 'racetrack-playlist-meta',
        playlist.trackCount + ' tracks · ' + playlist.targetDurationMinutes + ' min');
      wrap.appendChild(meta);
    }
    return wrap;
  }

  // ── RacetrackLobbySummary — the composed pre-event Lobby view ─────────────
  // The frozen session snapshot is the ONLY authority here — this never
  // re-reads any live catalog/course-package source.
  // opts: { snapshot }
  function RacetrackLobbySummary(opts) {
    var snapshot = opts.snapshot;
    var wrap = _el('div', 'racetrack-lobby-summary');

    wrap.appendChild(_el('div', 'racetrack-identity-strip-title', 'LOBBY'));

    wrap.appendChild(RacetrackRouteVisual({ coursePackage: snapshot.coursePackage }));
    var routeMeta = RacetrackRouteMeta({ coursePackage: snapshot.coursePackage });
    if (routeMeta) wrap.appendChild(routeMeta);

    var gameRow = _el('div', 'racetrack-hud-zone');
    gameRow.appendChild(RacetrackHudLabel('GAME MODE'));
    gameRow.appendChild(_el('div', 'racetrack-lobby-value', snapshot.gameFormatSnapshot.name));
    gameRow.appendChild(_el('div', 'racetrack-game-objective', snapshot.gameFormatSnapshot.objective));
    wrap.appendChild(gameRow);

    var rosterZone = _el('div', 'racetrack-hud-zone');
    rosterZone.appendChild(RacetrackHudLabel('COMPETITORS'));
    var strip = _el('div', 'racetrack-roster-strip');
    snapshot.competitorSnapshots.forEach(function (c) {
      var chip = _el('div', 'racetrack-roster-chip racetrack-roster-chip--static');
      chip.appendChild(_el('span', 'racetrack-roster-chip-text', c.name + ' — ' + c.team));
      strip.appendChild(chip);
    });
    rosterZone.appendChild(strip);
    wrap.appendChild(rosterZone);

    if (snapshot.playlistSnapshot) {
      var playlistZone = _el('div', 'racetrack-hud-zone');
      playlistZone.appendChild(RacetrackHudLabel('PLAYLIST'));
      playlistZone.appendChild(_el('div', 'racetrack-lobby-value', snapshot.playlistSnapshot.title));
      wrap.appendChild(playlistZone);
    }

    // 0806C — the "START SESSION — COMING SOON" placeholder is gone; the
    // real Begin Race control now lives beside "Back to Selection" in
    // racetrackSelectionScene.js's _renderLobby(), matching where every
    // other Lobby action (Back to Selection) already lives outside this
    // purely-presentational summary — avoids duplicating the control here.
    wrap.appendChild(_el('div', 'racetrack-lobby-meta', 'Seed ' + snapshot.seed));

    return wrap;
  }

  SBE.RacetrackPresentationKit = Object.freeze({
    VERSION: VERSION,
    RacetrackHudLabel: RacetrackHudLabel,
    RacetrackSelector: RacetrackSelector,
    RacetrackOrbStage: RacetrackOrbStage,
    RacetrackRouteVisual: RacetrackRouteVisual,
    RacetrackRouteMeta: RacetrackRouteMeta,
    RacetrackRoster: RacetrackRoster,
    RacetrackPlaylistControl: RacetrackPlaylistControl,
    RacetrackLobbySummary: RacetrackLobbySummary,
  });

  console.log('[RacetrackPresentationKit] v' + VERSION + ' loaded');

})(window);
