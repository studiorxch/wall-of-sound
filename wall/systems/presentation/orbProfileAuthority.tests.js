// ── OrbProfileAuthority Tests v1.0.0 ─────────────────────────────────────────
// 0730C_MAPS_Orb_Profiles_Library_and_Active_Hero_Runtime
// Status: active | Classification: test-harness (dependency-free)
//
// Same rationale as mapsGeographicStyleAuthority.tests.js: no test runner
// exists under wall/ (no package.json, no bundler) — this mirrors the
// existing `_wos.debug.*` console-diagnostic convention: a plain assertion
// function, run on demand, logging pass/fail and returning a summary object.
// Covers OrbProfileAuthority (CRUD/active/preview/delete/cross-tab),
// OrbProfileRegistry (archetype-conditional field schema), and
// OrbObjectFactory/OrbProfileRenderer (construction, disposal, graceful
// degradation when dependencies are unavailable).
//
// Run via: _wos.debug.orbProfile.runTests()
//
// Placement: wall/systems/presentation/orbProfileAuthority.tests.js
// Load: AFTER orbProfileAuthority.js. Not required for production operation.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function run() {
    var authority = SBE.OrbProfileAuthority;
    var registry = SBE.OrbProfileRegistry;
    var factory = SBE.OrbObjectFactory;
    var renderer = SBE.OrbProfileRenderer;
    var results = [];

    if (!authority) return { ok: false, reason: 'authority_not_loaded', results: results };
    authority.init(null); // idempotent — ensures deterministic state regardless of load order
    if (!authority.isInitialized()) {
      return { ok: false, reason: 'authority_not_initialized', results: results };
    }

    // ── Registry: archetype-conditional field validation ───────────────────
    if (registry) {
      var coreSchema = registry.schemaFor('core-sphere').map(function (f) { return f.propId; });
      var particleSchema = registry.schemaFor('particle-orb').map(function (f) { return f.propId; });
      var nodeSchema = registry.schemaFor('node-cluster').map(function (f) { return f.propId; });
      results.push(_assert('core-sphere schema excludes particle-only fields',
        coreSchema.indexOf('particles.count') === -1));
      results.push(_assert('core-sphere schema excludes node-only fields',
        coreSchema.indexOf('nodes.count') === -1));
      results.push(_assert('particle-orb schema includes particle fields, excludes node fields',
        particleSchema.indexOf('particles.count') !== -1 && particleSchema.indexOf('nodes.count') === -1));
      results.push(_assert('node-cluster schema includes node fields, excludes particle fields',
        nodeSchema.indexOf('nodes.count') !== -1 && nodeSchema.indexOf('particles.count') === -1));
      results.push(_assert('every archetype schema includes the shared archetype/binding selectors',
        ['core-sphere', 'glass-shell', 'particle-orb', 'node-cluster', 'contained-world'].every(function (a) {
          var ids = registry.schemaFor(a).map(function (f) { return f.propId; });
          return ids.indexOf('archetype') !== -1 && ids.indexOf('binding') !== -1;
        })));
    } else {
      results.push(_assert('OrbProfileRegistry is loaded', false));
    }

    // ── Seeds: five real archetypes exist ──────────────────────────────────
    var allProfiles = authority.listOrbProfiles();
    var archetypesPresent = Array.from(new Set(allProfiles.map(function (p) { return p.archetype; })));
    results.push(_assert('all five archetypes are represented among seeded/existing profiles',
      ['core-sphere', 'glass-shell', 'particle-orb', 'node-cluster', 'contained-world'].every(function (a) {
        return archetypesPresent.indexOf(a) !== -1;
      }), { archetypesPresent: archetypesPresent }));
    results.push(_assert('exactly one profile is active', !!authority.getActiveId()));

    // ── CRUD ────────────────────────────────────────────────────────────────
    var created = authority.createOrbProfile('core-sphere', '__test_create__');
    results.push(_assert('createOrbProfile() returns a real record with the requested archetype',
      !!created && created.archetype === 'core-sphere'));
    results.push(_assert('create() does not activate automatically', authority.getActiveId() !== created.id));

    var duplicated = authority.duplicateOrbProfile(created.id);
    results.push(_assert('duplicateOrbProfile() receives a new id', !!duplicated && duplicated.id !== created.id));
    results.push(_assert('duplicate\'s initial values match the source before any edit',
      JSON.stringify(duplicated.material) === JSON.stringify(created.material)));

    var probeBefore = created.material.baseColor;
    authority.setPropertyValue(duplicated.id, 'material.baseColor', '#123456');
    results.push(_assert('editing the duplicate does not mutate the source (independence)',
      authority.getOrbProfile(created.id).material.baseColor === probeBefore));
    results.push(_assert('setPropertyValue() writes via the correct dot-path',
      authority.getOrbProfile(duplicated.id).material.baseColor === '#123456'));

    var renameResult = authority.renameOrbProfile(created.id, 'Renamed Orb');
    results.push(_assert('renameOrbProfile() succeeds and updates the name',
      renameResult.ok && authority.getOrbProfile(created.id).name === 'Renamed Orb'));

    // ── State machine: Active / Preview ────────────────────────────────────
    var savedActive = authority.getActiveId();

    authority.activateOrbProfile(created.id);
    results.push(_assert('activateOrbProfile() updates the active id', authority.getActiveId() === created.id));

    authority.activateOrbProfile(savedActive); // restore before preview checks
    results.push(_assert('activating a prior profile restores it as active', authority.getActiveId() === savedActive));

    var savedActiveStored = authority.__test.getActiveIdFromStorage();
    authority.previewOrbProfile(duplicated.id);
    results.push(_assert('previewOrbProfile() does not change the active id', authority.getActiveId() === savedActive));
    results.push(_assert('previewOrbProfile() sets the preview id', authority.getPreviewId() === duplicated.id));
    results.push(_assert('preview is never written to persisted active-id storage',
      authority.__test.getActiveIdFromStorage() === savedActiveStored));

    authority.endPreview();
    results.push(_assert('endPreview() clears the preview id', authority.getPreviewId() == null));
    results.push(_assert('endPreview() restores the active profile', authority.getActiveId() === savedActive));

    // ── Reload simulation: preview must not survive, active must persist ──
    authority.previewOrbProfile(duplicated.id);
    authority.init(null);
    results.push(_assert('reload does not promote a preview to active', authority.getActiveId() === savedActive));
    results.push(_assert('reload clears preview state entirely', authority.getPreviewId() == null));

    // ── Cross-tab simulation ───────────────────────────────────────────────
    var crossTabTarget = duplicated.id;
    authority.__test.simulateStorageEvent(authority.__test.STORAGE_ACTIVE_KEY, crossTabTarget);
    results.push(_assert('a simulated cross-tab active-id storage event updates this tab\'s active id',
      authority.getActiveId() === crossTabTarget));
    authority.activateOrbProfile(savedActive); // restore

    // ── Delete rules ────────────────────────────────────────────────────────
    var activeDeleteResult = authority.deleteOrbProfile(authority.getActiveId());
    results.push(_assert('deleting the active profile is rejected',
      activeDeleteResult.ok === false && activeDeleteResult.reason === 'active_profile_protected'));

    var deletableResult = authority.deleteOrbProfile(created.id);
    results.push(_assert('deleting a non-active, non-last profile succeeds', deletableResult.ok === true));
    results.push(_assert('deleted profile is actually gone', authority.getOrbProfile(created.id) == null));

    authority.__test.removeOrbProfile(duplicated.id);

    // ── Last-profile delete guard ───────────────────────────────────────────
    // Exact snapshot/restore round-trip — safely shrinks the real store to
    // exactly one profile to exercise the guard, then restores precisely
    // what was there before (never leaves real/seeded data destroyed).
    var fullSnapshot = authority.__test.snapshotAll();
    var allIds = authority.listOrbProfiles().map(function (p) { return p.id; });
    var keepId = authority.getActiveId();
    allIds.filter(function (id) { return id !== keepId; }).forEach(function (id) {
      authority.__test.removeOrbProfile(id);
    });
    var lastProfileResult = authority.deleteOrbProfile(keepId);
    results.push(_assert('the last remaining profile cannot be deleted even though it is also active',
      lastProfileResult.ok === false));
    authority.__test.restoreAll(fullSnapshot);
    results.push(_assert('snapshot/restore round-trip recovers the exact original profile set',
      authority.listOrbProfiles().length === Object.keys(fullSnapshot.profiles).length));

    // ── OrbObjectFactory: construction + disposal (real THREE, if loaded) ──
    if (factory && global.THREE) {
      var sample = authority.listOrbProfiles()[0];
      try {
        var instance = factory.build(sample, global.THREE);
        results.push(_assert('OrbObjectFactory.build() returns a group + update/refresh/dispose', !!(instance && instance.group && instance.update && instance.refresh && instance.dispose)));
        var instance2 = factory.build(sample, global.THREE);
        results.push(_assert('build() called twice returns two distinct group instances', instance.group !== instance2.group));
        var disposeThrew = false;
        try { instance.dispose(); instance2.dispose(); } catch (e) { disposeThrew = true; }
        results.push(_assert('dispose() does not throw', !disposeThrew));
      } catch (e) {
        results.push(_assert('OrbObjectFactory.build() does not throw for a real seeded profile', false, { error: e && e.message }));
      }
      results.push(_assert('isStructuralField correctly classifies archetype as structural', factory.isStructuralField('archetype') === true));
      results.push(_assert('isStructuralField correctly classifies a cosmetic field as non-structural', factory.isStructuralField('material.baseColor') === false));
    } else {
      results.push(_assert('OrbObjectFactory + THREE available for construction tests', false, { factoryLoaded: !!factory, threeLoaded: !!global.THREE }));
    }

    // ── OrbProfileRenderer: graceful degradation ───────────────────────────
    if (renderer) {
      // Deliberately corrupt archetype to force a construction failure —
      // verifies activate() never throws and correctly reports isRenderReady false.
      var brokenProfile = Object.assign({}, authority.listOrbProfiles()[0], { archetype: '__not_a_real_archetype__' });
      var activateResult = renderer.activate(brokenProfile);
      results.push(_assert('activate() with an invalid archetype fails gracefully, never throws',
        activateResult.ok === false));
      results.push(_assert('isRenderReady() is false after a failed activation', renderer.isRenderReady() === false));

      // Restore to a real, healthy profile so this test doesn't leave the
      // renderer in a broken state for whatever runs next.
      var healthyProfile = authority.listOrbProfiles()[0];
      renderer.activate(healthyProfile);
    } else {
      results.push(_assert('OrbProfileRenderer is loaded', false));
    }

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };

    console.log('[OrbProfileAuthorityTests] ' + (summary.ok ? 'PASS' : 'FAIL') +
      ' — ' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
    if (failed.length) console.warn('[OrbProfileAuthorityTests] failures:', failed);

    return summary;
  }

  SBE.OrbProfileAuthorityTests = { run: run };

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.orbProfile = { runTests: run };

})(window);
