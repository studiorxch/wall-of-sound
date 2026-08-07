// ── RacetrackSelectionScene v2.3.0 ────────────────────────────────────────────
// 0805E_RACETRACK_Wall_Mode_and_Cached_Course_Runtime, overhauled 0805H,
// cold-start/scheduling repair 0806A, responsive composition repair 0806B,
// race runtime foundation 0806C
// Status: active | Classification: presentation / racetrack-selection-scene
//
// 0806C — real countdown/running/results scenes replace the old inert
// placeholder. This file remains the sole DOM mounting/teardown authority
// (decision #10) — it builds the shared multi-racer scene directly via
// SBE.RacetrackRaceScene.mount() and hands the handle to
// SBE.RacetrackRaceRuntime.startRunning() for per-tick driving; the race
// runtime never constructs or disposes DOM itself. A continuity special
// case in _render() (decisions #12/#16) keeps the shared race scene alive
// and rendering, undisturbed, across the running->finish edge (the winner
// overlay is applied directly by the runtime, not through a render pass)
// and across any redundant same-scene notification — only genuinely leaving
// running/finish tears the scene down, via _disposeRaceMount() calling
// detachRacePresentation() then .dispose() (decision #13).
//
// 0806B — the route column now composes THREE ordered children instead of
// two: RacetrackRouteVisual, the course RacetrackSelector, then
// RacetrackRouteMeta. This DOM order is itself the required narrow/stacked
// responsive flow; wall/styles.css restores the original wide visual order
// via flex `order:` at ≥1280px without touching DOM order.
//
// 0806A — fixes a real cold-start bug: ensureDefaultRoster()/
// ensureDefaultCourseSelection() write via _setSelection(), which notifies
// SYNCHRONOUSLY. Subscribing _render() directly meant a notify firing while
// already inside _render() (as it would on any true cold start, since
// neither default has been written yet) re-entered _render() and appended a
// SECOND full Selection tree before the outer call returned. Fixed with a
// coalescing scheduler (_createScheduler) — runtime subscribers now call
// schedule() (never _render() directly), so a burst of synchronous notifies
// coalesces into exactly one queued microtask flush. _render() also now
// runs ensureDefaultRoster()/ensureDefaultCourseSelection() itself, BEFORE
// touching the DOM, and aborts immediately if either wrote state (a fresh
// render is already queued by that point) — plus a hydration gate on
// RacetrackCoursePackageRuntime.isHydrated() so Selection never composes
// against a course package that simply hasn't loaded yet.
//
// Scene composition + event-wiring layer for RACETRACK's Attract/Selection/
// Lobby scenes, mounted into `#racetrack-overlay` (wall/index.html). The
// actual DOM-building primitives live in racetrackPresentationKit.js
// (SBE.RacetrackPresentationKit) — this file stays a thin composer: data in,
// DOM out, full teardown/rebuild every render (no diffing), same contract as
// before 0805H.
//
// 0805H replaced the diagnostic 5-panel stacked-card layout with a premium
// 3D-Orb-configurator composition per the approved concept image: a large
// dominant featured Orb, a floating route presentation, a minimal identity
// strip, and a compact 4-segment bottom control bar. See the 0805H
// completion report for the disclosed visual compromises (no
// location/elevation data exists on RacetrackCoursePackage; team renders as
// text only, no logo asset exists; roster "thumbnails" are CSS color
// swatches keyed to each Orb's real material.baseColor, not live mini 3D
// renders).
//
// Load: LAST — after OrbProfileAuthority, racetrackCoursePackageRuntime.js,
// racetrackSessionRuntime.js, racetrackReadiness.js, and
// racetrackPresentationKit.js.
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '2.1.0';
  var doc = global.document;

  var _root = null;
  var _orbStageHandle = null; // { element, dispose() } from RacetrackPresentationKit.RacetrackOrbStage

  // 0806C — race-scene mount authority (decision #10): this file owns ALL
  // DOM mounting/teardown for countdown/running/results; the race runtime
  // never constructs or disposes DOM itself. `_raceMountHandle` is the same
  // slot for whichever of the three is currently live (only one ever is).
  var _raceMountHandle = null; // { element, dispose() }
  var _previousScene = null;
  var RACE_CONTINUOUS_SCENES = ['running', 'finish'];

  // 0806A — coalescing render scheduler. Every runtime notification (scene
  // transitions, catalog storage events, course-package hydration, and
  // critically the SYNCHRONOUS _setSelection()→_notify() calls that fire
  // from inside ensureDefaultRoster()/ensureDefaultCourseSelection() during
  // this very render) now goes through schedule() rather than calling
  // _render() directly. A burst of synchronous schedule() calls within the
  // same task coalesces into exactly one queued microtask flush, which
  // always runs against the LATEST state — this is what eliminates the
  // cold-start re-entrancy bug (a notify firing DURING _render() used to
  // synchronously re-invoke _render(), building and appending a second full
  // Selection tree before the outer call had even returned).
  //
  // Extracted as an independent factory (not tied to _root/document) so it
  // is genuinely unit-testable without a real DOM — see
  // racetrackSelectionScene.tests.js and the __test export below.
  function _createScheduler(flush) {
    var generation = 0;
    var scheduled = false;
    function schedule() {
      generation++;
      if (scheduled) return;
      scheduled = true;
      Promise.resolve().then(function () {
        scheduled = false;
        flush();
      });
    }
    function currentGeneration() { return generation; }
    function isStale(token) { return token !== generation; }
    return { schedule: schedule, currentGeneration: currentGeneration, isStale: isStale };
  }

  var _scheduler = _createScheduler(function () { _render(); });

  function _el(tag, className, text) {
    var e = doc.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }

  // 0805F required correction: a genuine "no records" state reads very
  // differently from "MUSIC hasn't mirrored this catalog yet" (a real
  // startup-timing state, not an absence) or "the stored value is
  // corrupted." Each gets its own honest message instead of one generic
  // "No X available yet."
  function _emptyStateMessage(status, kindLabel) {
    if (status === 'not_initialized') {
      return 'Not yet initialized — open MUSIC once to seed this catalog.';
    }
    if (status === 'parse_error') {
      return 'Catalog data is corrupted — check MUSIC’s console.';
    }
    return 'No ' + kindLabel + ' available yet.';
  }

  function _disposeOrbStage() {
    if (_orbStageHandle) { _orbStageHandle.dispose(); _orbStageHandle = null; }
  }

  // 0806C decision #13 — the runtime is told a handle is going away BEFORE
  // it's actually disposed (identity-checked no-op unless the runtime is
  // still holding this exact handle; force-stops its loop if it's
  // unexpectedly still active). `.dispose()` itself is called only here —
  // the runtime never disposes DOM/THREE resources on its own.
  function _disposeRaceMount() {
    if (_raceMountHandle) {
      if (SBE.RacetrackRaceRuntime) SBE.RacetrackRaceRuntime.detachRacePresentation(_raceMountHandle);
      _raceMountHandle.dispose();
      _raceMountHandle = null;
    }
  }

  // ── Scenes ────────────────────────────────────────────────────────────────

  function _renderAttract() {
    var wrap = _el('div', 'racetrack-attract');
    wrap.appendChild(_el('div', 'racetrack-attract-ambient'));
    wrap.appendChild(_el('div', 'racetrack-attract-title', 'RACETRACK'));
    wrap.appendChild(_el('div', 'racetrack-attract-subtitle', 'Tap to begin'));
    wrap.addEventListener('click', function () { SBE.RacetrackSessionRuntime.enterSelection(); });
    return wrap;
  }

  // 0806A — opts.isStale is threaded through to RacetrackOrbStage so a
  // deferred (next-frame) Three.js mount can detect it's attached to a
  // render that's since been superseded. ensureDefaultRoster()/
  // ensureDefaultCourseSelection() are NO LONGER called here — _render()
  // runs them as a pre-flight check before ever calling this function, so
  // by the time we get here the selection is guaranteed already-resolved
  // (or this function wouldn't have been invoked this pass at all).
  function _renderSelection(opts) {
    var runtime = SBE.RacetrackSessionRuntime;
    var kit = SBE.RacetrackPresentationKit;

    var wrap = _el('div', 'racetrack-selection');

    // ── Identity strip ──
    var identity = _el('div', 'racetrack-identity-strip');
    identity.appendChild(_el('div', 'racetrack-identity-left', 'RACETRACK'));
    identity.appendChild(_el('div', 'racetrack-identity-right', 'STUDIORICH'));
    wrap.appendChild(identity);

    // ── Stage: featured Orb + route, the dominant visual zone ──
    var stage = _el('div', 'racetrack-stage');

    var competitor = runtime.getFeaturedCompetitor();
    var orbProfile = null;
    if (competitor) {
      var orbAuthority = SBE.OrbProfileAuthority;
      orbProfile = orbAuthority ? orbAuthority.getOrbProfile(competitor.orbProfileId) : null;
    }
    var orbColumn = _el('div', 'racetrack-orb-column');
    if (competitor) {
      _orbStageHandle = kit.RacetrackOrbStage({ orbProfile: orbProfile, name: competitor.name, team: competitor.team, isStale: opts && opts.isStale });
      orbColumn.appendChild(_orbStageHandle.element);
    } else {
      var emptyOrb = _el('div', 'racetrack-orb-plinth');
      emptyOrb.appendChild(_el('div', 'racetrack-empty-note', _emptyStateMessage(runtime.getCompetitorCatalogStatus(), 'competitors')));
      orbColumn.appendChild(emptyOrb);
    }
    var competitors = runtime.listCompetitors();
    orbColumn.appendChild(kit.RacetrackSelector({
      label: 'FEATURED ORB', value: competitor ? competitor.name : '—',
      onPrev: function () { runtime.prevCompetitor(); }, onNext: function () { runtime.nextCompetitor(); },
      disabled: competitors.length <= 1,
    }));
    stage.appendChild(orbColumn);

    // 0806B — three ordered children (visual, then course selector, then
    // metadata+warnings), not two: this DOM order IS the required narrow/
    // stacked responsive flow (route visual → course selector → route
    // metadata). At ≥1280px, wall/styles.css applies flex `order:` to these
    // exact three children to restore the original wide visual (visual,
    // meta, selector) without touching DOM order.
    var routeColumn = _el('div', 'racetrack-route-column');
    var selectedPackage = runtime.getSelectedCoursePackage();
    routeColumn.appendChild(kit.RacetrackRouteVisual({ coursePackage: selectedPackage }));
    var currentCourses = SBE.RacetrackCoursePackageRuntime ? SBE.RacetrackCoursePackageRuntime.listCurrentPublishedCoursePackages() : [];
    routeColumn.appendChild(kit.RacetrackSelector({
      label: 'COURSE', value: selectedPackage ? selectedPackage.name : '—',
      onPrev: function () { runtime.prevCoursePackage(); }, onNext: function () { runtime.nextCoursePackage(); },
      disabled: currentCourses.length <= 1,
    }));
    var routeMeta = kit.RacetrackRouteMeta({ coursePackage: selectedPackage });
    if (routeMeta) routeColumn.appendChild(routeMeta);
    stage.appendChild(routeColumn);

    wrap.appendChild(stage);

    // ── Bottom bar: Game Mode / Competitors / Playlist / Enter Lobby ──
    var bar = _el('div', 'racetrack-bottom-bar');

    var format = runtime.getActiveGameFormat();
    var formats = runtime.listGameFormats();
    var gameSeg = _el('div', 'racetrack-bottom-bar-segment');
    if (format) {
      gameSeg.appendChild(kit.RacetrackSelector({
        label: 'GAME MODE', value: format.name,
        onPrev: function () { runtime.prevGameFormat(); }, onNext: function () { runtime.nextGameFormat(); },
        disabled: formats.length <= 1,
      }));
      gameSeg.appendChild(_el('div', 'racetrack-game-objective', format.objective));
    } else {
      gameSeg.appendChild(_el('div', 'racetrack-empty-note', _emptyStateMessage(runtime.getGameFormatCatalogStatus(), 'Game Formats')));
    }
    bar.appendChild(gameSeg);

    var rosterSeg = _el('div', 'racetrack-bottom-bar-segment');
    var roster = runtime.getRoster();
    var rosterIds = roster.map(function (c) { return c.id; });
    rosterSeg.appendChild(kit.RacetrackRoster({
      roster: roster,
      availableToAdd: competitors.filter(function (c) { return rosterIds.indexOf(c.id) === -1; }),
      onAdd: function (id) { runtime.addToRoster(id); },
      onRemove: function (id) { runtime.removeFromRoster(id); },
    }));
    bar.appendChild(rosterSeg);

    var playlistSeg = _el('div', 'racetrack-bottom-bar-segment');
    var playlist = runtime.getActivePlaylist();
    var playlists = runtime.listPlaylists();
    if (playlist || playlists.length > 0) {
      playlistSeg.appendChild(kit.RacetrackPlaylistControl({
        playlist: playlist, disabled: playlists.length <= 1,
        onPrev: function () { runtime.prevPlaylist(); }, onNext: function () { runtime.nextPlaylist(); },
      }));
    } else {
      playlistSeg.appendChild(_el('div', 'racetrack-empty-note', _emptyStateMessage(runtime.getPlaylistCatalogStatus(), 'MUSIC playlists')));
    }
    bar.appendChild(playlistSeg);

    // 0805G required correction: enterLobby() is async and ordered (saves
    // the durable record before ever committing scene:'lobby'). The button
    // shows a real pending state and stays disabled while a save is in
    // flight — the duplicate-click guard's UI half — and a real, actionable
    // error (not a silent failure) if the save rejects.
    var enterSeg = _el('div', 'racetrack-bottom-bar-segment racetrack-bottom-bar-segment--enter');
    var readiness = runtime.getReadiness();
    var entering = runtime.getIsEnteringLobby();
    var enterBtn = _el('button', 'racetrack-enter-btn', entering ? 'Entering Lobby…' : 'Enter Lobby');
    enterBtn.type = 'button';
    enterBtn.disabled = !readiness.ready || entering;
    enterBtn.addEventListener('click', function () {
      if (runtime.getIsEnteringLobby()) return;
      runtime.enterLobby();
    });
    enterSeg.appendChild(enterBtn);
    if (!readiness.ready) {
      enterSeg.appendChild(_el('div', 'racetrack-readiness-note', readiness.reasons.join(', ').replace(/_/g, ' ')));
    } else if (runtime.getEnterLobbyError()) {
      enterSeg.appendChild(_el('div', 'racetrack-readiness-note', runtime.getEnterLobbyError()));
    }
    bar.appendChild(enterSeg);

    wrap.appendChild(bar);
    return wrap;
  }

  function _renderLobby() {
    var runtime = SBE.RacetrackSessionRuntime;
    var raceRuntime = SBE.RacetrackRaceRuntime;
    var kit = SBE.RacetrackPresentationKit;
    var snapshot = runtime.getSnapshot();
    var restoreState = runtime.getSnapshotRestoreState();
    var wrap = _el('div', 'racetrack-lobby');
    // 0805G: the only moment a snapshot-less Lobby view ever renders is the
    // brief async gap while a restore is in flight — once it resolves, the
    // runtime has either populated the snapshot or already flipped the
    // scene back to 'selection' itself (never a lingering error-only view).
    if (restoreState === 'restoring') {
      wrap.appendChild(_el('div', 'racetrack-empty-note', 'Restoring session…'));
    } else if (!snapshot) {
      wrap.appendChild(_el('div', 'racetrack-empty-note', 'No session snapshot — return to Selection.'));
    } else {
      wrap.appendChild(kit.RacetrackLobbySummary({ snapshot: snapshot }));
    }

    var actions = _el('div', 'racetrack-lobby-actions');

    // 0806C — the real Begin Race control. Disabled both while validation
    // would fail (getBeginRaceError()) AND while a race is already active
    // (getIsRaceActive(), decision #17) — the button goes inert immediately
    // after an accepted click, matching Enter Lobby's own disabled-while-
    // pending discipline.
    var beginError = raceRuntime ? raceRuntime.getBeginRaceError() : 'Race runtime unavailable';
    var raceActive = raceRuntime ? raceRuntime.getIsRaceActive() : false;
    var beginBtn = _el('button', 'racetrack-lobby-begin-btn', 'Begin Race');
    beginBtn.type = 'button';
    beginBtn.disabled = !snapshot || !!beginError || raceActive;
    beginBtn.addEventListener('click', function () {
      if (!raceRuntime || raceRuntime.getIsRaceActive()) return;
      raceRuntime.beginRace();
    });
    actions.appendChild(beginBtn);
    if (snapshot && beginError && !raceActive) {
      actions.appendChild(_el('div', 'racetrack-readiness-note', beginError));
    }

    var back = _el('button', 'racetrack-lobby-back', 'Back to Selection');
    back.type = 'button';
    back.addEventListener('click', function () { runtime.backToSelectionFromLobby(); });
    actions.appendChild(back);

    wrap.appendChild(actions);
    return wrap;
  }

  // ── 0806C race scenes ────────────────────────────────────────────────────
  // countdown/running/results all follow the same {element, dispose()}
  // contract every other mount in this file uses, stored in the shared
  // `_raceMountHandle` slot (only one of the three is ever live at a time).

  function _renderCountdown() {
    var raceRuntime = SBE.RacetrackRaceRuntime;
    var kit = SBE.RacetrackPresentationKit;
    var wrap = _el('div', 'racetrack-countdown');
    wrap.appendChild(_el('div', 'racetrack-identity-strip-title', 'GET READY'));

    var raceInput = raceRuntime ? raceRuntime.getRaceInput() : null;
    if (raceInput) {
      var rosterZone = _el('div', 'racetrack-hud-zone');
      rosterZone.appendChild(kit.RacetrackHudLabel('COMPETITORS'));
      var strip = _el('div', 'racetrack-roster-strip');
      raceInput.competitors.forEach(function (c) {
        var chip = _el('div', 'racetrack-roster-chip racetrack-roster-chip--static');
        chip.appendChild(_el('span', 'racetrack-roster-chip-text', c.name + ' — ' + c.team));
        strip.appendChild(chip);
      });
      rosterZone.appendChild(strip);
      wrap.appendChild(rosterZone);
    }

    var digit = _el('div', 'racetrack-countdown-digit', '3');
    wrap.appendChild(digit);

    // 0806C decision #14 — the only UI path to cancel a race mid-countdown.
    // resetRace() cancels the countdown controller (RAF + its own
    // visibility listener) before it can ever reach completion, so GO
    // cannot fire afterward.
    var cancelBtn = _el('button', 'racetrack-cancel-race-btn', 'Cancel');
    cancelBtn.type = 'button';
    cancelBtn.addEventListener('click', function () {
      if (raceRuntime) raceRuntime.resetRace();
    });
    wrap.appendChild(cancelBtn);

    var unsubscribe = raceRuntime ? raceRuntime.subscribeCountdown(function (seconds) {
      digit.textContent = seconds > 0 ? String(seconds) : 'GO';
    }) : function () {};

    return {
      element: wrap,
      dispose: function () { unsubscribe(); },
    };
  }

  // Fresh mount only — never called for the running<->finish continuity
  // edge, which is handled entirely by the early-return special case in
  // _render() below. Builds the shared multi-racer scene directly (mount
  // authority stays in this file, decision #10) and hands the resulting
  // handle to the race runtime via startRunning() for per-tick driving.
  function _renderRunning() {
    var raceRuntime = SBE.RacetrackRaceRuntime;
    if (!raceRuntime || !SBE.RacetrackRaceScene) return null;

    var raceInput = raceRuntime.getRaceInput();
    var racers = raceRuntime.getRacers();
    if (!raceInput || !racers) return null;

    var handle = SBE.RacetrackRaceScene.mount({ raceInput: raceInput, racers: racers });
    raceRuntime.startRunning(handle);
    return handle;
  }

  function _renderResults() {
    var raceRuntime = SBE.RacetrackRaceRuntime;
    var kit = SBE.RacetrackPresentationKit;
    var wrap = _el('div', 'racetrack-results');
    wrap.appendChild(_el('div', 'racetrack-identity-strip-title', 'RESULTS'));

    var result = raceRuntime ? raceRuntime.getRaceResult() : null;
    var raceInput = raceRuntime ? raceRuntime.getRaceInput() : null;
    if (result && raceInput) {
      var competitorsById = {};
      raceInput.competitors.forEach(function (c) { competitorsById[c.id] = c; });

      var table = _el('div', 'racetrack-results-table');
      result.finishOrder.forEach(function (entry) {
        var competitor = competitorsById[entry.competitorId];
        var row = _el('div', 'racetrack-results-row' + (entry.status === 'finished' ? ' racetrack-results-row--finished' : ' racetrack-results-row--dnf'));
        row.appendChild(_el('span', 'racetrack-results-placement', String(entry.placement)));
        row.appendChild(_el('span', 'racetrack-results-name', competitor ? competitor.name : entry.competitorId));
        row.appendChild(_el('span', 'racetrack-results-status', entry.status === 'finished' ? 'Finished' : 'DNF'));
        table.appendChild(row);
      });
      wrap.appendChild(table);
    } else {
      wrap.appendChild(_el('div', 'racetrack-empty-note', 'No result available.'));
    }

    var resetBtn = _el('button', 'racetrack-lobby-back', 'Reset');
    resetBtn.type = 'button';
    resetBtn.addEventListener('click', function () {
      if (raceRuntime) raceRuntime.resetRace();
    });
    wrap.appendChild(resetBtn);

    return { element: wrap, dispose: function () {} };
  }

  // 0806A — pre-flight + hydration gate + generation capture, all BEFORE
  // any DOM teardown/rebuild happens. Order matters: ensureDefaultRoster()/
  // ensureDefaultCourseSelection() are checked first (and short-circuit on
  // the first one that writes) so a cold start never composes against a
  // selection object it's about to mutate out from under itself — the
  // _setSelection() call inside either of them has ALREADY synchronously
  // called _notify() → _scheduler.schedule() by the time we check its
  // return value, so a fresh render is already queued and this pass can
  // simply return without touching _root at all.
  function _render() {
    if (!_root) return;
    var myGeneration = _scheduler.currentGeneration();
    var runtime = SBE.RacetrackSessionRuntime;
    if (!runtime || !SBE.RacetrackPresentationKit) return;
    var scene = runtime.getScene();

    // 0806C decisions #12/#16 — running<->finish continuity, checked before
    // any teardown. Fires whenever BOTH the previous and new scene are
    // members of RACE_CONTINUOUS_SCENES — regardless of whether they're
    // equal, since a redundant running->running/finish->finish notification
    // from an unrelated subscriber (catalog storage events, course-package
    // updates) must be just as much a no-op as the genuine running->finish
    // edge, or the live race scene would be torn down and rebuilt (and its
    // RAF loop restarted) for no reason — AND only when a live
    // `_raceMountHandle` actually exists. If the scene-membership condition
    // is met but there's no live mount (a state that should not normally
    // arise), this early return does NOT fire; execution falls through to
    // the normal dispatch path below, which either rebuilds a fresh
    // `running` mount or recovers to `lobby` — the app can never end up
    // silently stuck on a blank #racetrack-overlay.
    if (
      _previousScene && RACE_CONTINUOUS_SCENES.indexOf(_previousScene) !== -1 &&
      RACE_CONTINUOUS_SCENES.indexOf(scene) !== -1 && _raceMountHandle
    ) {
      _previousScene = scene;
      return;
    }

    if (scene === 'selection') {
      if (runtime.ensureDefaultRoster()) return;
      if (runtime.ensureDefaultCourseSelection()) return;
      var pkgRuntime = SBE.RacetrackCoursePackageRuntime;
      if (pkgRuntime && typeof pkgRuntime.isHydrated === 'function' && !pkgRuntime.isHydrated()) {
        // Required RACETRACK mirror (the Course Package runtime's initial
        // hydration) isn't ready yet — don't compose the final Selection
        // layout against incomplete data. isHydrated() flipping true fires
        // its own notify(), which schedules the real render.
        _disposeOrbStage();
        _disposeRaceMount();
        while (_root.firstChild) _root.removeChild(_root.firstChild);
        _root.appendChild(_el('div', 'racetrack-empty-note', 'Loading…'));
        _previousScene = scene;
        return;
      }
    }

    _disposeOrbStage();
    _disposeRaceMount();
    while (_root.firstChild) _root.removeChild(_root.firstChild);

    if (scene === 'attract') {
      _root.appendChild(_renderAttract());
    } else if (scene === 'selection') {
      _root.appendChild(_renderSelection({ isStale: function () { return _scheduler.isStale(myGeneration); } }));
    } else if (scene === 'lobby') {
      _root.appendChild(_renderLobby());
    } else if (scene === 'countdown') {
      _raceMountHandle = _renderCountdown();
      _root.appendChild(_raceMountHandle.element);
    } else if (scene === 'running') {
      _raceMountHandle = _renderRunning();
      if (_raceMountHandle) {
        _root.appendChild(_raceMountHandle.element);
      } else if (SBE.RacetrackRaceRuntime) {
        // Liveness-guard recovery (decision #16): no valid race state to
        // rebuild the running scene from — recover to Lobby rather than
        // rendering nothing.
        SBE.RacetrackRaceRuntime.resetRace();
      }
    } else if (scene === 'results') {
      _raceMountHandle = _renderResults();
      _root.appendChild(_raceMountHandle.element);
    } else {
      // finish (unreachable as a fresh dispatch target — reached only via
      // the continuity special case above, which mutates the running
      // mount's overlay in place rather than requesting a new mount) /
      // reset (never set under this design) — a typed, inert placeholder
      // as a defensive fallback only.
      _root.appendChild(_el('div', 'racetrack-attract-title', scene.toUpperCase()));
    }

    _previousScene = scene;
  }

  function mount() {
    _root = doc.getElementById('racetrack-overlay');
    if (!_root) return;
    var runtime = SBE.RacetrackSessionRuntime;
    if (runtime) runtime.subscribe(_scheduler.schedule);
    _scheduler.schedule();
  }

  var SBE_NS = (global.SBE = global.SBE || {});
  SBE_NS.RacetrackSelectionScene = Object.freeze({
    VERSION: VERSION,
    mount: mount,
    renderNow: _render,
    // Test-only — never used by production code. createScheduler is exposed
    // as a factory (not the module's own live _scheduler instance) so tests
    // can create an ISOLATED scheduler with a fake flush function, with zero
    // real DOM/runtime dependency.
    __test: {
      createScheduler: _createScheduler,
    },
  });

  console.log('[RacetrackSelectionScene] v' + VERSION + ' loaded');

})(window);
