// ── MapsGeographicStyleAuthority Tests v1.0.0 ─────────────────────────────────
// 0729A_MAPS_Palette_Audit_Default_Wiring; renamed from MapsPaletteAuthority
// Tests by 0729D_MAPS_Vehicle_Overlay_Libraries_Foundation's terminology-
// migration gate.
// Status: active | Classification: test-harness (dependency-free)
//
// No test runner exists anywhere under wall/ or studio/ (no package.json, no
// bundler) — this is a deliberately dependency-free, script-tag codebase.
// Rather than introduce vitest/jest/etc. for one module, this mirrors the
// existing `_wos.debug.*` console-diagnostic convention: a plain assertion
// function, run on demand, logging pass/fail and returning a summary object.
//
// Run via: _wos.debug.mapsGeographicStyle.runTests()
//
// Placement: wall/systems/presentation/mapsGeographicStyleAuthority.tests.js
// Load: AFTER mapsGeographicStyleAuthority.js. Not required for production
// operation — safe to omit from a minimal production bundle if one is ever
// introduced.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  // ── Mock map ───────────────────────────────────────────────────────────────
  // A minimal, network-free stand-in for a mapboxgl.Map, implementing exactly
  // the surface MapsGeographicStyleRegistry/MapsGeographicStyleApplyAdapters
  // use: getStyle()/getLayer()/setPaintProperty()/getPaintProperty()/getZoom().
  // Lets the state-machine/registry/migration/diagnostic logic be verified
  // deterministically regardless of real Mapbox network/tile availability —
  // none of that logic needs actual tiles, only a parsed style + live paint
  // property storage. Production code is untouched; this exists only here.
  function createMockMap() {
    var layers = [
      { id: 'water',           type: 'fill',           paint: { 'fill-color': '#0e3a52' } },
      { id: 'land',             type: 'fill',           paint: { 'fill-color': '#12161c' } },
      { id: 'road-primary',     type: 'line',           paint: { 'line-color': '#4a5866' } },
      { id: 'place-label',      type: 'symbol',         paint: { 'text-color': '#cfe9f6', 'text-halo-color': '#000000' } },
      { id: 'admin-boundary',   type: 'line',           paint: { 'line-color': '#5c6b78' } },
      // Deliberately included to verify buildings are excluded from the wired
      // base-map set (per the per-building-authoring-authority exclusion).
      { id: 'building-3d',      type: 'fill-extrusion', paint: { 'fill-extrusion-color': '#8899aa' } },
    ];
    var paintStore = {};
    layers.forEach(function (l) { paintStore[l.id] = Object.assign({}, l.paint); });
    var zoom = 12.8;

    return {
      __mock: true,
      getStyle: function () {
        return { layers: layers.map(function (l) { return { id: l.id, type: l.type, paint: paintStore[l.id] }; }) };
      },
      getLayer: function (id) { return layers.some(function (l) { return l.id === id; }) ? { id: id } : undefined; },
      setPaintProperty: function (id, prop, value) {
        if (!paintStore[id]) return;
        paintStore[id][prop] = value;
      },
      getPaintProperty: function (id, prop) {
        return paintStore[id] ? paintStore[id][prop] : undefined;
      },
      getZoom: function () { return zoom; },
    };
  }

  // run(map) — map is optional. Pass nothing to test against whatever the
  // live page already initialized (production/manual debugging use). Pass an
  // explicit map (e.g. createMockMap()) to force-(re)init against it first —
  // used for network-independent verification, never happens implicitly.
  function run(map) {
    var authority = SBE.MapsGeographicStyleAuthority;
    var results = [];

    if (!authority) return { ok: false, reason: 'authority_not_loaded', results: results };

    if (map) authority.init(map);
    if (!authority.isInitialized()) {
      return { ok: false, reason: 'authority_not_initialized', results: results };
    }

    var registry = authority.getRegistry();
    var ids = registry.map(function (r) { return r.id; });

    // ── Registry ───────────────────────────────────────────────────────────
    var seen = {};
    var dupes = [];
    ids.forEach(function (id) { if (seen[id]) dupes.push(id); seen[id] = true; });
    results.push(_assert('registry ids are unique', dupes.length === 0, { dupes: dupes }));
    results.push(_assert('registry has at least one wired property', registry.length > 0, { count: registry.length }));
    results.push(_assert('every record has a label and group',
      registry.every(function (r) { return !!r.label && !!r.group; })));

    // ── Default coverage ───────────────────────────────────────────────────
    var def = authority.getGeographicStyle(authority.DEFAULT_GEOGRAPHIC_STYLE_ID);
    var missingInDefault = ids.filter(function (id) { return !(id in def.values); });
    results.push(_assert('Default contains every wired property', missingInDefault.length === 0, { missing: missingInDefault }));

    // ── Default protection (0729B §9) ───────────────────────────────────────
    var defaultTitleBefore = def.title;
    var renameResult = authority.renameGeographicStyle(authority.DEFAULT_GEOGRAPHIC_STYLE_ID, '__should_not_apply__');
    results.push(_assert('renaming Default is rejected', renameResult.ok === false && renameResult.reason === 'default_protected'));
    results.push(_assert('Default title is unchanged after a rejected rename',
      authority.getGeographicStyle(authority.DEFAULT_GEOGRAPHIC_STYLE_ID).title === defaultTitleBefore));

    var ep2Probe = authority.duplicateGeographicStyle(authority.DEFAULT_GEOGRAPHIC_STYLE_ID);
    var ep2ProbeIds = Object.keys(ep2Probe.values);
    results.push(_assert('duplicating Default produces the exact same property-id set (not a superset/subset)',
      ep2ProbeIds.length === ids.length && ids.every(function (id) { return ep2ProbeIds.indexOf(id) !== -1; })));
    results.push(_assert('duplicate\'s initial values exactly match Default before any edit',
      ids.every(function (id) { return String(ep2Probe.values[id]) === String(def.values[id]); })));

    if (ids.length) {
      var probeId = ids[0];
      var defaultValueBefore = authority.getGeographicStyle(authority.DEFAULT_GEOGRAPHIC_STYLE_ID).values[probeId];
      authority.setPropertyValue(ep2Probe.id, probeId, '#123456');
      results.push(_assert('editing the duplicate does not mutate Default (deep-copy independence)',
        authority.getGeographicStyle(authority.DEFAULT_GEOGRAPHIC_STYLE_ID).values[probeId] === defaultValueBefore));
    }
    authority.__test.removeGeographicStyle(ep2Probe.id);

    var activeBeforeAvailabilityCheck = authority.getActiveId();
    var otherProbe = authority.createGeographicStyle('__test_default_availability__');
    authority.activateGeographicStyle(otherProbe.id);
    results.push(_assert('Default remains listed and available while another style is active',
      !!authority.getGeographicStyle(authority.DEFAULT_GEOGRAPHIC_STYLE_ID)));
    authority.activateGeographicStyle(authority.DEFAULT_GEOGRAPHIC_STYLE_ID);
    results.push(_assert('Default can be reactivated at any time',
      authority.getActiveId() === authority.DEFAULT_GEOGRAPHIC_STYLE_ID));
    authority.__test.removeGeographicStyle(otherProbe.id);
    authority.activateGeographicStyle(activeBeforeAvailabilityCheck); // restore whatever was actually active before this test ran

    // ── CRUD / schema completeness ─────────────────────────────────────────
    var created = authority.createGeographicStyle('__test_create__');
    var createdKeys = Object.keys(created.values);
    results.push(_assert('create() produces the full wired schema',
      ids.every(function (id) { return createdKeys.indexOf(id) !== -1; }) && createdKeys.length === ids.length,
      { expected: ids.length, actual: createdKeys.length }));
    results.push(_assert('create() does not activate automatically', authority.getActiveId() !== created.id));

    var duplicated = authority.duplicateGeographicStyle(created.id);
    var dupKeys = Object.keys(duplicated.values);
    results.push(_assert('duplicate() copies the complete schema',
      ids.every(function (id) { return dupKeys.indexOf(id) !== -1; }) && dupKeys.length === ids.length));
    results.push(_assert('duplicate() receives a new id', duplicated.id !== created.id));
    results.push(_assert('duplicate() does not activate automatically', authority.getActiveId() !== duplicated.id));

    // ── State machine: Active / Preview / Inactive ─────────────────────────
    var savedActive = authority.getActiveId();

    authority.activateGeographicStyle(created.id);
    results.push(_assert('activateGeographicStyle() updates the active id', authority.getActiveId() === created.id));

    authority.activateGeographicStyle(savedActive); // restore before preview checks
    results.push(_assert('activating a prior style deactivates the previous one',
      authority.getActiveId() === savedActive));

    // Baseline captured AFTER the restore above settles — isolates what preview,
    // specifically, does or doesn't write.
    var savedActiveStored = authority.__test.getActiveIdFromStorage();

    authority.previewGeographicStyle(duplicated.id);
    results.push(_assert('previewGeographicStyle() does not change the active id', authority.getActiveId() === savedActive));
    results.push(_assert('previewGeographicStyle() sets the preview id', authority.getPreviewId() === duplicated.id));
    results.push(_assert('preview is never written to persisted active-id storage',
      authority.__test.getActiveIdFromStorage() === savedActiveStored));

    authority.endPreview();
    results.push(_assert('endPreview() clears the preview id', authority.getPreviewId() == null));
    results.push(_assert('endPreview() restores the active style', authority.getActiveId() === savedActive));

    // ── Reload simulation: preview must not survive, active must persist ──
    // Re-runs init() against the same live map — exercises the exact code path
    // a real page reload takes (fresh in-memory state, storage re-read).
    authority.activateGeographicStyle(savedActive);
    authority.previewGeographicStyle(duplicated.id);
    var mapRef = authority.__test.getMap();
    authority.init(mapRef);
    results.push(_assert('reload does not promote a preview to active',
      authority.getActiveId() === savedActive));
    results.push(_assert('reload clears preview state entirely',
      authority.getPreviewId() == null));

    // ── Schema migration ────────────────────────────────────────────────────
    var incompleteStored = { id: '__test_migrate__', title: 'Incomplete', values: {}, createdAt: 0, updatedAt: 0 };
    if (ids.length) {
      // Deliberately omit the first wired id to simulate a stale/older style.
      ids.slice(1).forEach(function (id) { incompleteStored.values[id] = def.values[id]; });
      incompleteStored.values['__unknown_future_field__'] = 'keep-me';
    }
    var migrated = authority.__test.migrateAgainstDefault(incompleteStored);
    results.push(_assert('migration fills every missing wired id from Default',
      ids.every(function (id) { return id in migrated.values; })));
    if (ids.length) {
      results.push(_assert('migration inherits the missing id\'s value from Default',
        migrated.values[ids[0]] === def.values[ids[0]]));
    }
    results.push(_assert('migration preserves unknown future-compatible fields',
      migrated.values['__unknown_future_field__'] === 'keep-me'));

    // ── Diagnostic round trip ──────────────────────────────────────────────
    var diagResult = authority.runDiagnosticSequence();
    results.push(_assert('diagnostic sequence changes at least one wired property',
      diagResult.propertiesChangedDuringDiagnostic > 0, diagResult));
    results.push(_assert('diagnostic sequence restores every wired property exactly',
      diagResult.restoredExactly === true, { mismatched: diagResult.mismatchedAfterRestore }));
    results.push(_assert('active/preview state unchanged after diagnostic sequence',
      authority.getActiveId() === savedActive && authority.getPreviewId() == null));

    // ── Episode 2 seed data (0729C) ─────────────────────────────────────────
    // Non-destructive: exercises SBE.MapsGeographicStyleSeeds directly rather
    // than clearing real localStorage (which would wipe an actual user's
    // saved styles if this ever runs on a live profile).
    if (SBE.MapsGeographicStyleSeeds) {
      var seed = SBE.MapsGeographicStyleSeeds.buildEpisode2Seed(registry);
      var seedKeys = Object.keys(seed.values);
      results.push(_assert('Episode 2 seed produces the exact current schema',
        seedKeys.length === ids.length && ids.every(function (id) { return id in seed.values; })));
      results.push(_assert('Episode 2 seed is titled "Episode 2"', seed.title === 'Episode 2'));
      results.push(_assert('Episode 2 seed values are valid color strings',
        seedKeys.every(function (id) { return /^#|^rgba?\(/i.test(String(seed.values[id])); })));
    } else {
      results.push(_assert('SBE.MapsGeographicStyleSeeds is loaded', false));
    }

    // ── Same-tab subscribe/notify (0729D — centralized Library bridge) ──────
    var notifyCount = 0;
    var unsubscribe = authority.subscribe(function () { notifyCount += 1; });
    authority.activateGeographicStyle(duplicated.id);
    results.push(_assert('subscribe() fires on activateGeographicStyle()', notifyCount === 1));
    authority.previewGeographicStyle(created.id);
    results.push(_assert('subscribe() fires on previewGeographicStyle()', notifyCount === 2));
    authority.endPreview();
    results.push(_assert('subscribe() fires on endPreview()', notifyCount === 3));
    unsubscribe();
    authority.activateGeographicStyle(savedActive);
    results.push(_assert('unsubscribe() stops further notifications', notifyCount === 3));

    // ── Cleanup test fixtures ──────────────────────────────────────────────
    authority.__test.removeGeographicStyle(created.id);
    authority.__test.removeGeographicStyle(duplicated.id);

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };

    console.log('[MapsGeographicStyleAuthorityTests] ' + (summary.ok ? 'PASS' : 'FAIL') +
      ' — ' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
    if (failed.length) console.warn('[MapsGeographicStyleAuthorityTests] failures:', failed);

    return summary;
  }

  SBE.MapsGeographicStyleAuthorityTests = { run: run, createMockMap: createMockMap };

  // Temporary compat alias (0729D terminology migration) — remove once
  // nothing references the old name. New code must use MapsGeographicStyleAuthorityTests.
  SBE.MapsPaletteAuthorityTests = SBE.MapsGeographicStyleAuthorityTests;

})(window);
