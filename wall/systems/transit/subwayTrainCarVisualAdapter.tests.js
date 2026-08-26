// ── SubwayTrainCarVisualAdapter Tests v1.0.0 ─────────────────────────────────
// 0825_MAPS_Ep2_3D_Train_Actor_Foundation_v1.0.0
// Status: active | Classification: test-harness (dependency-free)
//
// Covers only the pure, dependency-free seams: role-name mapping and
// material-role lookup. GLB loading, Three.js rendering, and Mapbox
// positioning are live-browser verification only (this codebase's
// established convention for THREE.js/Mapbox-heavy rendering code).
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function _fakeGroup(names) {
    // Minimal traverse()-compatible stand-in — no THREE dependency needed
    // for this pure test, matching the adapter's own dependency-free seam.
    var children = names.map(function (n) { return { name: n, isMesh: true, children: [] }; });
    return {
      name: '',
      children: children,
      traverse: function (fn) {
        fn(this);
        children.forEach(function (c) { fn(c); });
      },
    };
  }

  function run() {
    var adapter = SBE.SubwayTrainCarVisualAdapter;
    var results = [];

    if (!adapter || !adapter.__mapSourceRolesForTests) {
      results.push(_assert('SBE.SubwayTrainCarVisualAdapter.__mapSourceRolesForTests is available', false));
      console.log('[SubwayTrainCarVisualAdapterTests] FAIL — module/test seam not available');
      return { ok: false, total: 1, failed: 1, results: results };
    }

    (function () {
      var group = _fakeGroup(['Body', 'Doors', 'Windows', 'WheelsFront', 'WheelsRear']);
      var mapped = adapter.__mapSourceRolesForTests(group);
      results.push(_assert('present role names resolve to their objects',
        !!mapped.roles.Body && !!mapped.roles.Doors && !!mapped.roles.Windows &&
        !!mapped.roles.WheelsFront && !!mapped.roles.WheelsRear,
        mapped.roles));
      results.push(_assert('missing role names resolve to null, not throw',
        mapped.roles.FrontBumper === null && mapped.roles.LowerBody === null &&
        mapped.roles.RearBumper === null && mapped.roles.RearPanel === null,
        mapped.roles));
      results.push(_assert('graffiti mounts absent when not in hierarchy',
        mapped.graffiti.left === false && mapped.graffiti.right === false,
        mapped.graffiti));
    })();

    (function () {
      var group = _fakeGroup(['Body', 'Graffiti_Left', 'Graffiti_Right']);
      var mapped = adapter.__mapSourceRolesForTests(group);
      results.push(_assert('graffiti mounts detected by exact name when present',
        mapped.graffiti.left === true && mapped.graffiti.right === true,
        mapped.graffiti));
    })();

    (function () {
      var group = _fakeGroup([]);
      var mapped = adapter.__mapSourceRolesForTests(group);
      var allNull = Object.keys(mapped.roles).every(function (k) { return mapped.roles[k] === null; });
      results.push(_assert('empty hierarchy maps every role to null without throwing', allNull, mapped.roles));
    })();

    (function () {
      results.push(_assert('material role lookup: Body/bumpers/panel -> BodyMetal',
        adapter.__materialRoleForObjectNameForTests('Body') === 'BodyMetal' &&
        adapter.__materialRoleForObjectNameForTests('FrontBumper') === 'BodyMetal' &&
        adapter.__materialRoleForObjectNameForTests('RearBumper') === 'BodyMetal' &&
        adapter.__materialRoleForObjectNameForTests('RearPanel') === 'BodyMetal'));
      results.push(_assert('material role lookup: Doors -> DoorMetal',
        adapter.__materialRoleForObjectNameForTests('Doors') === 'DoorMetal'));
      results.push(_assert('material role lookup: Windows -> WindowGlass',
        adapter.__materialRoleForObjectNameForTests('Windows') === 'WindowGlass'));
      results.push(_assert('material role lookup: LowerBody/wheels -> UndercarriageDark',
        adapter.__materialRoleForObjectNameForTests('LowerBody') === 'UndercarriageDark' &&
        adapter.__materialRoleForObjectNameForTests('WheelsFront') === 'UndercarriageDark' &&
        adapter.__materialRoleForObjectNameForTests('WheelsRear') === 'UndercarriageDark'));
      results.push(_assert('material role lookup: unknown/missing name -> null',
        adapter.__materialRoleForObjectNameForTests('SomethingElse') === null &&
        adapter.__materialRoleForObjectNameForTests(null) === null));
    })();

    (function () {
      var before = adapter.getCanonicalConfig();
      var updated = adapter.setCanonicalConfig({ scaleToMeters: 2.5, groundOffsetM: 0.1 });
      results.push(_assert('setCanonicalConfig updates only numeric known keys',
        updated.scaleToMeters === 2.5 && updated.groundOffsetM === 0.1 &&
        updated.forwardAxisCorrectionRad === before.forwardAxisCorrectionRad,
        updated));
      // restore, so this test is not order-dependent against later live use
      adapter.setCanonicalConfig(before);
    })();

    // ── Coordinate-system contract — locks down the actual raw-model-axis
    // -> world-axis mapping numerically, not just a screenshot expectation.
    // Confirmed inverted 2026-08-25 (4-Car Consist Gate live investigation)
    // and fixed by adjusting forwardAxisCorrectionRad only — this test
    // exists specifically so a future change to either correction constant
    // that breaks this contract fails LOUDLY here rather than only being
    // visible as an upside-down car in a live screenshot. Uses the real
    // THREE library (guarded — this file's dependency-free tests normally
    // avoid it, but the contract IS about THREE's own rotation composition,
    // which this app already loads before this adapter in wall/index.html)
    // applied to the REAL, current getCanonicalConfig() values via the
    // EXACT same rotation.set() calls setTransform() itself makes — not a
    // reimplementation that could drift out of sync with production code.
    if (global.THREE && global.THREE.Object3D && global.THREE.Vector3) {
      (function () {
        var THREE = global.THREE;
        var config = adapter.getCanonicalConfig();
        var probe = new THREE.Object3D();
        probe.rotation.set(config.upAxisCorrectionRad, 0, 0);
        probe.rotation.z = config.forwardAxisCorrectionRad;
        probe.updateMatrixWorld(true);

        function mapAxis(v) {
          return new THREE.Vector3(v[0], v[1], v[2]).applyMatrix4(probe.matrixWorld);
        }
        function approxEqual(v, x, y, z, tol) {
          return Math.abs(v.x - x) < (tol || 1e-6) && Math.abs(v.y - y) < (tol || 1e-6) && Math.abs(v.z - z) < (tol || 1e-6);
        }

        var mappedUp = mapAxis([0, 1, 0]);     // raw model's own up/roof axis (glTF Y-up)
        var mappedForward = mapAxis([0, 0, 1]); // raw model's own forward axis
        var mappedRight = mapAxis([1, 0, 0]);   // raw model's own right axis

        results.push(_assert('coordinate contract: raw +Y (up/roof) maps to runtime +Z (world altitude/up)',
          approxEqual(mappedUp, 0, 0, 1), mappedUp));
        results.push(_assert('coordinate contract: raw +Z (forward) maps to runtime +Y (existing heading convention, unaffected by the fix)',
          approxEqual(mappedForward, 0, 1, 0), mappedForward));
        results.push(_assert('coordinate contract: raw +X maps to runtime -X (the necessary consequence of a proper right-handed rotation satisfying the other two)',
          approxEqual(mappedRight, -1, 0, 0), mappedRight));
      })();
    } else {
      results.push(_assert('window.THREE is available for the coordinate-system contract test', false));
    }

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };

    console.log('[SubwayTrainCarVisualAdapterTests] ' + (summary.ok ? 'PASS' : 'FAIL') +
      ' — ' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
    if (failed.length) console.warn('[SubwayTrainCarVisualAdapterTests] failures:', failed);

    return summary;
  }

  SBE.SubwayTrainCarVisualAdapterTests = { run: run };

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.subwayTrainCarVisualAdapter = { runTests: run };
})(window);
