// ── SubwayResidentGraffitiArtistAuthority v1.0.0 ──────────────────────────────
// 0818_SUBWAY_Resident_Graffiti_Artists_v1.0.0_BUILD — Data Layer §5-10, §17-22
// Status: active | Classification: runtime-authority (persistent — localStorage)
//
// Owns persistent Resident graffiti-artist identity, reusable
// GraffitiStyleProfile records, and eligible-surface resolution — the SAME
// architectural role every other SUBWAY identity authority plays
// (Rolling Stock, Car Surface, Artwork, Placement), so this is a NEW,
// dedicated authority rather than an extension of the existing Machine
// Life system: Machine Life's own "resident" concept
// (music/src/data/machineLifeTypes.ts's "resident-seed" disposition /
// MachineLifeGeneratePanel.tsx's free-text `residentId` conditioning tag)
// is an unrelated, narrower concept — a loose optional label on generated
// MUSIC audio, not a named/identified entity with style/behavior/history —
// and its own generator module (machineLifeGeneratorClient.ts) is
// currently missing from the tree (a pre-existing gap predating this
// entire SUBWAY effort, confirmed via `git log`). There is nothing
// passing to reuse there, so this build does not couple to it.
//
// Artwork generation itself (intent → structured strokes) deliberately
// does NOT live here — it lives in music/src/graffiti/residentArtworkGenerator.ts,
// since it must produce real Stroke objects compatible with the existing
// Drawing App's own renderer/brushes (BUILD §11: "Do not create a parallel
// raster-only generator"), which are pure TypeScript modules on the MUSIC
// side. This file owns identity/style/behavior/history and the
// canonical-ID-only eligible-surface resolution that generation depends on.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  var STORAGE_KEY = 'wos:subwayResidentGraffitiArtistAuthority:v1';

  // "older_only" cover policy threshold — how old an active placement must
  // be before a Resident with this policy may cover it. Kept short enough
  // to be genuinely demonstrable within one live verification session
  // (minutes, not days) while still being a real, documented age gate, not
  // a rubber-stamp — a fictional-world parameter, not a claim about real
  // graffiti culture.
  var OLDER_ONLY_MIN_AGE_MS = 90000; // 90s

  function _rollingStock() { return SBE.SubwayLogicalRollingStockAuthority || null; }
  function _surfaces() { return SBE.SubwayCarSurfaceAuthority || null; }
  function _placements() { return SBE.SubwayArtworkPlacementAuthority || null; }
  function _ls() { try { return global.localStorage || null; } catch (e) { return null; } }

  var _residents = {};
  var _styleProfiles = {};
  var _nextResidentCounter = 1;
  var _nextStyleCounter = 1;
  var _seeded = false;
  var _loaded = false;
  var _listeners = [];

  function _notify() { _listeners.forEach(function (fn) { try { fn(); } catch (e) {} }); }
  function subscribe(fn) { _listeners.push(fn); return function () { _listeners = _listeners.filter(function (f) { return f !== fn; }); }; }

  function _mintResidentId() { var id = 'sr-resident-' + String(_nextResidentCounter).padStart(6, '0'); _nextResidentCounter++; return id; }
  function _mintStyleId() { var id = 'sr-style-' + String(_nextStyleCounter).padStart(6, '0'); _nextStyleCounter++; return id; }

  function _save() {
    var ls = _ls(); if (!ls) return false;
    try {
      ls.setItem(STORAGE_KEY, JSON.stringify({
        version: VERSION, nextResidentCounter: _nextResidentCounter, nextStyleCounter: _nextStyleCounter,
        residents: _residents, styleProfiles: _styleProfiles, seeded: _seeded,
      }));
      return true;
    } catch (e) { console.warn('[SubwayResidentGraffitiArtistAuthority] save failed:', e && e.message || e); return false; }
  }

  function _load() {
    if (_loaded) return true;
    _loaded = true;
    var ls = _ls(); if (!ls) return false;
    try {
      var raw = ls.getItem(STORAGE_KEY);
      if (!raw) return true;
      var parsed = JSON.parse(raw);
      _residents = (parsed && parsed.residents) || {};
      _styleProfiles = (parsed && parsed.styleProfiles) || {};
      _nextResidentCounter = (parsed && parsed.nextResidentCounter) || 1;
      _nextStyleCounter = (parsed && parsed.nextStyleCounter) || 1;
      _seeded = !!(parsed && parsed.seeded);
      return true;
    } catch (e) {
      console.warn('[SubwayResidentGraffitiArtistAuthority] load failed (starting empty):', e && e.message || e);
      _residents = {}; _styleProfiles = {}; _nextResidentCounter = 1; _nextStyleCounter = 1; _seeded = false;
      return false;
    }
  }

  function _mintStyleProfile(input) {
    var id = _mintStyleId();
    _styleProfiles[id] = {
      id: id, label: input.label,
      preferredTools: input.preferredTools, preferredColors: input.preferredColors,
      widthRange: input.widthRange, pressureBias: input.pressureBias != null ? input.pressureBias : null,
      density: input.density, strokeCountRange: input.strokeCountRange,
      angularity: input.angularity, curvature: input.curvature,
      dripAffinity: input.dripAffinity, fatcapAffinity: input.fatcapAffinity, markerAffinity: input.markerAffinity,
      symmetryBias: input.symmetryBias != null ? input.symmetryBias : null,
      verticality: input.verticality != null ? input.verticality : null,
      horizontalStretch: input.horizontalStretch != null ? input.horizontalStretch : null,
      complexity: input.complexity, seedSalt: input.seedSalt,
    };
    return _styleProfiles[id];
  }

  function _mintResident(input, styleProfileId, now) {
    var id = _mintResidentId();
    _residents[id] = {
      id: id, displayName: input.displayName, tagName: input.tagName,
      creatorType: 'resident', creatorId: id, status: 'active',
      homeBorough: input.homeBorough || null,
      preferredRoutes: input.preferredRoutes || [], preferredRouteFamilies: input.preferredRouteFamilies || [],
      preferredSurfaceTypes: input.preferredSurfaceTypes || ['exterior_side_a', 'exterior_side_b'],
      styleProfileId: styleProfileId,
      behaviorProfile: input.behaviorProfile,
      createdAt: now, updatedAt: now,
      artworkHistory: [], placementHistory: [],
    };
    return _residents[id];
  }

  // ── Seed population (BUILD §7) — 8 fictional, StudioRich-owned graffiti
  //    Residents. Names/tags are invented and never imply real people or
  //    real graffiti writers. Each has a genuinely distinct style profile
  //    (different tool affinities, palette, geometry parameters) and
  //    behavior profile (different cover policy, route affinity, repeat
  //    avoidance) so BUILD §39's style-distinction requirement has real,
  //    structurally different generative inputs to work from. ──────────────
  function _seedPopulation(now) {
    if (_seeded) return;
    _seeded = true;

    function seed(def) {
      var style = _mintStyleProfile(def.style);
      _mintResident(def.resident, style.id, now);
    }

    seed({
      resident: {
        displayName: 'Velvet Ghost', tagName: 'VLVT', homeBorough: 'Manhattan',
        preferredRoutes: [], preferredRouteFamilies: ['numbered'],
        behaviorProfile: { emptySurfacePreference: 0.95, coverPermission: 'never', coverProbability: 0, routeAffinity: 0.8, recencyAvoidance: 0.6, repeatCarAvoidance: 0.7, maxRecentPlacementsConsidered: 5 },
      },
      style: { label: 'Minimal Clean Line', preferredTools: ['marker'], preferredColors: ['#f5f5f5', '#111111'], widthRange: { min: 0.012, max: 0.02 }, pressureBias: 0.5, density: 0.2, strokeCountRange: { min: 2, max: 4 }, angularity: 0.2, curvature: 0.7, dripAffinity: 0.0, fatcapAffinity: 0.0, markerAffinity: 1.0, symmetryBias: 0.6, verticality: 0.3, horizontalStretch: 0.7, complexity: 0.2, seedSalt: 11 },
    });

    seed({
      resident: {
        displayName: 'Static Bloom', tagName: 'STBLM', homeBorough: 'Brooklyn',
        preferredRoutes: [], preferredRouteFamilies: ['ace'],
        behaviorProfile: { emptySurfacePreference: 0.7, coverPermission: 'older_only', coverProbability: 0.4, routeAffinity: 0.7, recencyAvoidance: 0.4, repeatCarAvoidance: 0.4, maxRecentPlacementsConsidered: 4 },
      },
      style: { label: 'Dense Spray Bloom', preferredTools: ['fatcap'], preferredColors: ['#ff0066', '#ffb703', '#00c2ff'], widthRange: { min: 0.03, max: 0.06 }, pressureBias: 0.7, density: 0.85, strokeCountRange: { min: 5, max: 9 }, angularity: 0.3, curvature: 0.8, dripAffinity: 0.1, fatcapAffinity: 1.0, markerAffinity: 0.0, symmetryBias: 0.3, verticality: 0.5, horizontalStretch: 0.5, complexity: 0.7, seedSalt: 23 },
    });

    seed({
      resident: {
        displayName: 'Steel Orchid', tagName: 'STLORK', homeBorough: 'Brooklyn',
        preferredRoutes: [], preferredRouteFamilies: ['l'],
        behaviorProfile: { emptySurfacePreference: 0.6, coverPermission: 'allowed', coverProbability: 0.5, routeAffinity: 0.9, recencyAvoidance: 0.3, repeatCarAvoidance: 0.9, maxRecentPlacementsConsidered: 6 },
      },
      style: { label: 'Wet Drip Bloom', preferredTools: ['mop'], preferredColors: ['#8b2e8b', '#00ff88'], widthRange: { min: 0.025, max: 0.05 }, pressureBias: 0.6, density: 0.5, strokeCountRange: { min: 3, max: 6 }, angularity: 0.1, curvature: 0.9, dripAffinity: 1.0, fatcapAffinity: 0.0, markerAffinity: 0.0, symmetryBias: 0.2, verticality: 0.8, horizontalStretch: 0.2, complexity: 0.6, seedSalt: 37 },
    });

    seed({
      resident: {
        displayName: 'Copper Wolf', tagName: 'CPRWLF', homeBorough: 'Queens',
        preferredRoutes: [], preferredRouteFamilies: ['numbered', 'g'],
        behaviorProfile: { emptySurfacePreference: 0.75, coverPermission: 'older_only', coverProbability: 0.3, routeAffinity: 0.5, recencyAvoidance: 0.5, repeatCarAvoidance: 0.5, maxRecentPlacementsConsidered: 5 },
      },
      style: { label: 'Mixed Practice', preferredTools: ['marker', 'fatcap'], preferredColors: ['#ffb703', '#111111', '#f5f5f5'], widthRange: { min: 0.02, max: 0.04 }, pressureBias: 0.5, density: 0.5, strokeCountRange: { min: 4, max: 6 }, angularity: 0.5, curvature: 0.5, dripAffinity: 0.1, fatcapAffinity: 0.5, markerAffinity: 0.5, symmetryBias: 0.5, verticality: 0.5, horizontalStretch: 0.5, complexity: 0.5, seedSalt: 41 },
    });

    seed({
      resident: {
        displayName: 'Pale Signal', tagName: 'PLSGNL', homeBorough: 'Brooklyn',
        preferredRoutes: [], preferredRouteFamilies: ['jz'],
        behaviorProfile: { emptySurfacePreference: 0.9, coverPermission: 'never', coverProbability: 0, routeAffinity: 0.85, recencyAvoidance: 0.7, repeatCarAvoidance: 0.6, maxRecentPlacementsConsidered: 5 },
      },
      style: { label: 'Sharp Angular Hand', preferredTools: ['marker', 'fatcap'], preferredColors: ['#00c2ff', '#111111'], widthRange: { min: 0.015, max: 0.03 }, pressureBias: 0.6, density: 0.4, strokeCountRange: { min: 3, max: 5 }, angularity: 0.9, curvature: 0.15, dripAffinity: 0.0, fatcapAffinity: 0.4, markerAffinity: 0.6, symmetryBias: 0.4, verticality: 0.6, horizontalStretch: 0.4, complexity: 0.45, seedSalt: 53 },
    });

    seed({
      resident: {
        displayName: 'Night Compass', tagName: 'NGHTCMP', homeBorough: 'Manhattan',
        preferredRoutes: [], preferredRouteFamilies: ['nqrw'],
        behaviorProfile: { emptySurfacePreference: 0.65, coverPermission: 'allowed', coverProbability: 0.35, routeAffinity: 0.6, recencyAvoidance: 0.4, repeatCarAvoidance: 0.4, maxRecentPlacementsConsidered: 4 },
      },
      style: { label: 'Curved Symmetric Bloom', preferredTools: ['fatcap', 'mop'], preferredColors: ['#ffb703', '#8b2e8b'], widthRange: { min: 0.025, max: 0.045 }, pressureBias: 0.55, density: 0.6, strokeCountRange: { min: 4, max: 7 }, angularity: 0.1, curvature: 0.95, dripAffinity: 0.4, fatcapAffinity: 0.7, markerAffinity: 0.0, symmetryBias: 0.85, verticality: 0.4, horizontalStretch: 0.6, complexity: 0.55, seedSalt: 67 },
    });

    seed({
      resident: {
        displayName: 'Rust Choir', tagName: 'RSTCHR', homeBorough: 'Bronx',
        preferredRoutes: [], preferredRouteFamilies: ['bdfm'],
        behaviorProfile: { emptySurfacePreference: 0.55, coverPermission: 'allowed', coverProbability: 0.6, routeAffinity: 0.5, recencyAvoidance: 0.3, repeatCarAvoidance: 0.3, maxRecentPlacementsConsidered: 6 },
      },
      style: { label: 'Complex Layered Mark', preferredTools: ['marker', 'fatcap', 'mop'], preferredColors: ['#ff0066', '#00ff88', '#111111', '#f5f5f5'], widthRange: { min: 0.02, max: 0.05 }, pressureBias: 0.65, density: 0.9, strokeCountRange: { min: 6, max: 10 }, angularity: 0.6, curvature: 0.6, dripAffinity: 0.3, fatcapAffinity: 0.5, markerAffinity: 0.5, symmetryBias: 0.3, verticality: 0.5, horizontalStretch: 0.5, complexity: 0.9, seedSalt: 79 },
    });

    seed({
      resident: {
        displayName: 'Glass Rook', tagName: 'GLSROK', homeBorough: 'Staten Island',
        preferredRoutes: [], preferredRouteFamilies: ['si'],
        behaviorProfile: { emptySurfacePreference: 0.98, coverPermission: 'never', coverProbability: 0, routeAffinity: 0.95, recencyAvoidance: 0.8, repeatCarAvoidance: 0.8, maxRecentPlacementsConsidered: 3 },
      },
      style: { label: 'Sparse Quiet Mark', preferredTools: ['marker'], preferredColors: ['#f5f5f5'], widthRange: { min: 0.01, max: 0.015 }, pressureBias: 0.4, density: 0.15, strokeCountRange: { min: 1, max: 3 }, angularity: 0.4, curvature: 0.4, dripAffinity: 0.0, fatcapAffinity: 0.0, markerAffinity: 1.0, symmetryBias: 0.5, verticality: 0.5, horizontalStretch: 0.5, complexity: 0.1, seedSalt: 83 },
    });

    _save();
  }

  function ensureSeeded() {
    _load();
    if (!_seeded) _seedPopulation(Date.now());
    return { ok: true, residentCount: Object.keys(_residents).length };
  }

  // ── Read-only accessors ───────────────────────────────────────────────────
  function getResident(id) { _load(); return _residents[id] || null; }
  function getAllResidents() { _load(); return Object.keys(_residents).map(function (k) { return _residents[k]; }); }
  function getStyleProfile(id) { _load(); return _styleProfiles[id] || null; }
  function getAllStyleProfiles() { _load(); return Object.keys(_styleProfiles).map(function (k) { return _styleProfiles[k]; }); }

  function getRecentSurfacesUsed(residentId, n) {
    var r = getResident(residentId);
    if (!r) return [];
    return r.placementHistory.slice(-n).map(function (p) { return p.surfaceId; });
  }
  function getRecentCarsUsed(residentId, n) {
    var r = getResident(residentId);
    if (!r) return [];
    return r.placementHistory.slice(-n).map(function (p) { return p.logicalCarId; });
  }
  function getArtworkHistory(residentId) { var r = getResident(residentId); return r ? r.artworkHistory.slice() : []; }
  function getPlacementHistory(residentId) { var r = getResident(residentId); return r ? r.placementHistory.slice() : []; }

  // ── History recording — called ONLY after a real save/placement
  //    succeeded through the canonical Artwork/Placement authorities
  //    (BUILD §8: never a separate Resident-owned artwork store). ────────
  function recordArtworkCreated(residentId, entry) {
    _load();
    var r = _residents[residentId];
    if (!r) return { ok: false, reason: 'resident_not_found' };
    r.artworkHistory.push({ artworkId: entry.artworkId, createdAt: entry.createdAt, status: entry.status || 'active', styleProfileId: entry.styleProfileId, generationSeed: entry.generationSeed, toolSequence: entry.toolSequence, palette: entry.palette });
    r.updatedAt = entry.createdAt;
    _save();
    _notify();
    return { ok: true };
  }

  function recordPlacementCreated(residentId, entry) {
    _load();
    var r = _residents[residentId];
    if (!r) return { ok: false, reason: 'resident_not_found' };
    r.placementHistory.push({ placementId: entry.placementId, artworkId: entry.artworkId, surfaceId: entry.surfaceId, routeId: entry.routeId, logicalCarId: entry.logicalCarId, startedAt: entry.startedAt, endedAt: null });
    r.updatedAt = entry.startedAt;
    _save();
    _notify();
    return { ok: true };
  }

  // ── Eligible surface resolution (BUILD §17-22) — canonical IDs only,
  //    never a display/tag name anywhere in this function. ────────────────
  function resolveEligibleSurface(residentId, opts) {
    _load();
    var resident = _residents[residentId];
    if (!resident) return { ok: false, reason: 'resident_not_found' };
    var rs = _rollingStock(), sf = _surfaces(), pl = _placements();
    if (!rs || !sf || !pl) return { ok: false, reason: 'authority_unavailable' };

    var now = (opts && opts.now) || Date.now();
    var randFn = (opts && opts.rand) || Math.random;

    var hasRoutePref = resident.preferredRoutes.length > 0;
    var hasFamilyPref = resident.preferredRouteFamilies.length > 0;
    var eligibleTrains = rs.getActiveLogicalTrains().filter(function (t) {
      if (!hasRoutePref && !hasFamilyPref) return true;
      var routeOk = hasRoutePref && resident.preferredRoutes.indexOf(t.routeId) !== -1;
      var familyOk = hasFamilyPref && resident.preferredRouteFamilies.indexOf(t.routeFamily) !== -1;
      return routeOk || familyOk;
    });

    var recentSurfaces = getRecentSurfacesUsed(residentId, resident.behaviorProfile.maxRecentPlacementsConsidered);
    var recentCars = getRecentCarsUsed(residentId, resident.behaviorProfile.maxRecentPlacementsConsidered);

    var candidates = [];
    eligibleTrains.forEach(function (train) {
      rs.getLogicalCarsForConsist(train.consistId).forEach(function (car) {
        if (resident.behaviorProfile.repeatCarAvoidance > 0 && recentCars.indexOf(car.id) !== -1) return;
        var ensured = sf.ensureSurfacesForCar(car.id);
        var carSurfaces = ensured.ok ? ensured.surfaces : sf.getSurfacesForCar(car.id);
        carSurfaces.filter(function (s) { return resident.preferredSurfaceTypes.indexOf(s.surfaceType) !== -1; })
          .forEach(function (s) {
            if (recentSurfaces.indexOf(s.id) !== -1) return;
            candidates.push({ surface: s, car: car, train: train, activePlacement: pl.getActivePlacementForSurface(s.id) });
          });
      });
    });

    var emptyCandidates = candidates.filter(function (c) { return !c.activePlacement; });
    if (emptyCandidates.length > 0) {
      var chosen = emptyCandidates[Math.floor(randFn() * emptyCandidates.length)];
      return { ok: true, surface: chosen.surface, car: chosen.car, train: chosen.train, coverAction: false, covering: null };
    }

    var policy = resident.behaviorProfile.coverPermission;
    if (policy === 'never') return { ok: false, reason: 'no_eligible_surface' };

    var occupied = candidates;
    if (policy === 'older_only') {
      occupied = occupied.filter(function (c) { return (now - c.activePlacement.createdAt) >= OLDER_ONLY_MIN_AGE_MS; });
      if (occupied.length === 0) return { ok: false, reason: 'no_eligible_surface' };
    } else if (policy === 'allowed') {
      if (occupied.length === 0) return { ok: false, reason: 'no_eligible_surface' };
      if (randFn() > resident.behaviorProfile.coverProbability) return { ok: false, reason: 'cover_declined_by_probability' };
    }

    var chosenOccupied = occupied[Math.floor(randFn() * occupied.length)];
    return { ok: true, surface: chosenOccupied.surface, car: chosenOccupied.car, train: chosenOccupied.train, coverAction: true, covering: chosenOccupied.activePlacement };
  }

  // ── Diagnostics ───────────────────────────────────────────────────────────
  function getDiagnostics() {
    _load();
    var residents = getAllResidents(), styles = getAllStyleProfiles();
    var residentIdSet = {}, residentCollisions = 0;
    residents.forEach(function (r) { if (residentIdSet[r.id]) residentCollisions++; residentIdSet[r.id] = true; });
    var totalArtworks = residents.reduce(function (n, r) { return n + r.artworkHistory.length; }, 0);
    var totalPlacements = residents.reduce(function (n, r) { return n + r.placementHistory.length; }, 0);

    var artAuth = SBE.SubwayArtworkAuthority || null;
    var plAuth = _placements();
    var orphanArtworkRefs = 0, orphanPlacementRefs = 0;
    residents.forEach(function (r) {
      r.artworkHistory.forEach(function (a) { if (artAuth && !artAuth.getArtwork(a.artworkId)) orphanArtworkRefs++; });
      r.placementHistory.forEach(function (p) { if (plAuth && !plAuth.getPlacement(p.placementId)) orphanPlacementRefs++; });
    });

    return {
      version: VERSION,
      residentCount: residents.length,
      styleProfileCount: styles.length,
      residentIdentityCollisionCount: residentCollisions, // required invariant: must be 0
      totalArtworksCreated: totalArtworks,
      totalPlacementsCreated: totalPlacements,
      orphanArtworkReferenceCount: orphanArtworkRefs,
      orphanPlacementReferenceCount: orphanPlacementRefs,
    };
  }

  function __resetForTests() {
    _residents = {}; _styleProfiles = {}; _nextResidentCounter = 1; _nextStyleCounter = 1; _seeded = false; _loaded = true;
    var ls = _ls(); if (ls) { try { ls.removeItem(STORAGE_KEY); } catch (e) {} }
  }

  SBE.SubwayResidentGraffitiArtistAuthority = Object.freeze({
    VERSION: VERSION,
    OLDER_ONLY_MIN_AGE_MS: OLDER_ONLY_MIN_AGE_MS,
    ensureSeeded: ensureSeeded,
    getResident: getResident,
    getAllResidents: getAllResidents,
    getStyleProfile: getStyleProfile,
    getAllStyleProfiles: getAllStyleProfiles,
    getRecentSurfacesUsed: getRecentSurfacesUsed,
    getRecentCarsUsed: getRecentCarsUsed,
    getArtworkHistory: getArtworkHistory,
    getPlacementHistory: getPlacementHistory,
    recordArtworkCreated: recordArtworkCreated,
    recordPlacementCreated: recordPlacementCreated,
    resolveEligibleSurface: resolveEligibleSurface,
    getDiagnostics: getDiagnostics,
    subscribe: subscribe,
    __resetForTests: __resetForTests,
  });

  console.log('[SubwayResidentGraffitiArtistAuthority] v' + VERSION + ' loaded (persistent — call .ensureSeeded() to populate)');
})(window);
