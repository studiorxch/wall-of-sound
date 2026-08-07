// ── RacetrackRaceScene v1.0.0 ─────────────────────────────────────────────────
// 0806C_RACETRACK_Multi_Racer_Runtime_Foundation
// Status: active | Classification: presentation / racetrack-race-scene
//
// The ONE shared multi-racer Three.js visual — one scene, one renderer, one
// route line, one Orb instance per racer, never one canvas per racer. Mounted
// once by racetrackSelectionScene.js for `running` and kept alive through
// `finish` (0806C decisions #8/#10) — this file owns no RAF loop of its own;
// every render(racers) call is driven externally by racetrackRaceRuntime.js's
// single fixed-step loop, so there is exactly one animation loop touching
// this canvas at any time.
//
// mount()/dispose() are called ONLY by racetrackSelectionScene.js (mount
// authority, decision #10) — this file never appends/removes itself from the
// DOM on its own initiative. render()/showWinnerOverlay() are called by the
// race runtime, which only ever holds the handle it was given.
//
// Reuses SBE.OrbObjectFactory.build(profile, THREE) — the SAME archetype
// builder canonical LIVE MAP and MUSIC's own Orb editor preview already use —
// called once per racer into this one shared scene. Route/racer positions
// share one consistent coordinate space via
// SBE.RacetrackRaceCourseSampler.projectCourseToWorld().
//
// Camera framing and celebration presentation (winner spotlight, music cue,
// commentary) are explicitly deferred to the next build
// ("RACETRACK Camera, HUD, Music Cue, and Finish Presentation") — this build
// uses one fixed bounding-box-fit camera for the whole course, and a plain
// text winner-overlay banner with zero celebration effects.
//
// Load: after racetrackRaceCourseSampler.js and racetrackRaceRanking.js,
// before racetrackRaceRuntime.js.
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';
  var doc = global.document;

  function _el(tag, className, text) {
    var e = doc.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }

  function _resolveOrbProfile(competitor) {
    var authority = SBE.OrbProfileAuthority;
    return authority ? authority.getOrbProfile(competitor.orbProfileId) : null;
  }

  // opts: { raceInput, racers }
  // raceInput carries both the resolved `coursePackage` (geometry) and
  // `competitors` (name/team/orbProfileId per competitorId) — the single
  // source of truth for everything this scene needs to build.
  // Returns { element, render(racers), showWinnerOverlay(winnerCompetitor),
  // hideWinnerOverlay(), dispose() } — same shape RacetrackOrbStage already
  // uses. The caller (racetrackSelectionScene.js) appends `element`
  // wherever it needs to; this function never appends itself into the DOM.
  function mount(opts) {
    var THREE = global.THREE;
    var factory = SBE.OrbObjectFactory;
    var sampler = SBE.RacetrackRaceCourseSampler;
    var ranking = SBE.RacetrackRaceRanking;
    var raceInput = opts.raceInput;
    var coursePackage = raceInput.coursePackage;

    var wrap = _el('div', 'racetrack-race-scene');
    var canvasHost = _el('div', 'racetrack-race-scene-canvas');
    wrap.appendChild(canvasHost);

    var leaderboard = _el('div', 'racetrack-race-leaderboard');
    wrap.appendChild(leaderboard);

    var winnerOverlay = _el('div', 'racetrack-race-winner-overlay');
    wrap.appendChild(winnerOverlay);

    var competitorsById = {};
    raceInput.competitors.forEach(function (c) { competitorsById[c.id] = c; });

    var leaderboardRows = {}; // competitorId -> row element
    raceInput.competitors.forEach(function (c) {
      var row = _el('div', 'racetrack-race-leaderboard-row');
      row.appendChild(_el('span', 'racetrack-race-leaderboard-rank', '—'));
      row.appendChild(_el('span', 'racetrack-race-leaderboard-name', c.name));
      leaderboard.appendChild(row);
      leaderboardRows[c.id] = row;
    });

    var live = false;
    var renderer = null;
    var scene = null;
    var camera = null;
    var project = null;
    var resizeObserver = null;
    var startedAt = null;
    var racerVisuals = {}; // competitorId -> { wrapper, instance }

    if (THREE && factory && sampler) {
      var canvas = doc.createElement('canvas');
      canvas.style.cssText = 'width:100%; height:100%; display:block;';
      canvasHost.appendChild(canvas);

      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
      var rect = canvasHost.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height));
      renderer.setPixelRatio(Math.min(2, global.devicePixelRatio || 1));

      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(42, rect.width / Math.max(1, rect.height), 0.1, 500);

      project = sampler.projectCourseToWorld(coursePackage);

      // ── Route line ──
      var samples = coursePackage.progressSamples || [];
      if (samples.length >= 2) {
        var positions = new Float32Array(samples.length * 3);
        var minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
        for (var s = 0; s < samples.length; s++) {
          var p = project(samples[s].coordinate);
          positions[s * 3] = p.x;
          positions[s * 3 + 1] = 0;
          positions[s * 3 + 2] = p.z;
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.z < minZ) minZ = p.z;
          if (p.z > maxZ) maxZ = p.z;
        }
        var routeGeometry = new THREE.BufferGeometry();
        routeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        var routeMaterial = new THREE.LineBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.85 });
        scene.add(new THREE.Line(routeGeometry, routeMaterial));

        var spanX = Math.max(1, maxX - minX);
        var spanZ = Math.max(1, maxZ - minZ);
        var radius = Math.sqrt(spanX * spanX + spanZ * spanZ) / 2;
        var fitDistance = Math.max(10, radius * 1.9);
        camera.position.set(0, fitDistance * 0.62, fitDistance * 0.78);
        camera.lookAt(0, 0, 0);
      } else {
        camera.position.set(0, 10, 14);
        camera.lookAt(0, 0, 0);
      }

      scene.add(new THREE.AmbientLight(0xffffff, 0.7));
      var keyLight = new THREE.DirectionalLight(0xffffff, 0.6);
      keyLight.position.set(6, 10, 4);
      scene.add(keyLight);

      // ── One Orb instance per racer, each in its own positioning wrapper
      // so per-frame position.set() never fights the factory's own
      // rotation.y writes. ──
      opts.racers.forEach(function (racer) {
        var competitor = competitorsById[racer.competitorId];
        var profile = competitor ? _resolveOrbProfile(competitor) : null;
        if (!profile) return;
        try {
          var instance = factory.build(profile, THREE);
          var wrapper = new THREE.Group();
          wrapper.add(instance.group);
          scene.add(wrapper);
          racerVisuals[racer.competitorId] = { wrapper: wrapper, instance: instance };
        } catch (e) {
          /* a broken profile skips this racer's visual, not the whole scene */
        }
      });

      resizeObserver = new global.ResizeObserver(function () {
        var r = canvasHost.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return;
        renderer.setSize(r.width, r.height);
        camera.aspect = r.width / r.height;
        camera.updateProjectionMatrix();
      });
      resizeObserver.observe(canvasHost);

      startedAt = global.performance.now();
      live = true;
    }

    function render(racers) {
      if (!live) return;
      var elapsedSeconds = (global.performance.now() - startedAt) / 1000;

      racers.forEach(function (racer) {
        var visual = racerVisuals[racer.competitorId];
        if (visual) {
          var sample = sampler.sampleCourseAtProgress(coursePackage, racer.progress01);
          var pos = project(sample.coordinate);
          visual.wrapper.position.set(pos.x, 0, pos.z);
          visual.wrapper.rotation.y = -(sample.headingDeg * Math.PI) / 180;
          if (visual.instance.update) visual.instance.update(elapsedSeconds);
        }
      });

      var order = ranking.computeRanking(racers);
      order.forEach(function (entry, idx) {
        var row = leaderboardRows[entry.competitorId];
        if (!row) return;
        row.children[0].textContent = String(idx + 1);
        row.style.order = String(idx);
        row.classList.toggle('racetrack-race-leaderboard-row--finished', entry.status === 'finished');
      });

      renderer.render(scene, camera);
    }

    function showWinnerOverlay(winnerCompetitor) {
      winnerOverlay.textContent = '';
      winnerOverlay.appendChild(_el('div', 'racetrack-hud-label', 'WINNER'));
      winnerOverlay.appendChild(_el('div', 'racetrack-race-winner-name', winnerCompetitor.name));
      if (winnerCompetitor.team) winnerOverlay.appendChild(_el('div', 'racetrack-race-winner-team', winnerCompetitor.team));
      winnerOverlay.classList.add('racetrack-race-winner-overlay--visible');
    }

    function hideWinnerOverlay() {
      winnerOverlay.classList.remove('racetrack-race-winner-overlay--visible');
    }

    function dispose() {
      if (!live && !renderer) return;
      live = false;
      if (resizeObserver) resizeObserver.disconnect();
      Object.keys(racerVisuals).forEach(function (id) {
        try { racerVisuals[id].instance.dispose(); } catch (e) {}
      });
      racerVisuals = {};
      if (renderer) {
        try { renderer.dispose(); } catch (e) {}
        if (renderer.domElement && renderer.domElement.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      }
    }

    return {
      element: wrap,
      render: render,
      showWinnerOverlay: showWinnerOverlay,
      hideWinnerOverlay: hideWinnerOverlay,
      dispose: dispose,
    };
  }

  SBE.RacetrackRaceScene = Object.freeze({
    VERSION: VERSION,
    mount: mount,
  });

  console.log('[RacetrackRaceScene] v' + VERSION + ' loaded');

})(window);
