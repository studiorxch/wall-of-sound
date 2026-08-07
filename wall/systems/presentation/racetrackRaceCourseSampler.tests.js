// ── RacetrackRaceCourseSampler Tests v1.0.0 ───────────────────────────────────
// 0806C_RACETRACK_Multi_Racer_Runtime_Foundation
// Status: active | Classification: test-harness (dependency-free)
//
// Same bespoke console-diagnostic convention as every other wall/ *.tests.js
// file — no test runner exists under wall/.
//
// Run via: _wos.debug.racetrackRaceCourseSampler.runTests()
//
// Placement: wall/systems/presentation/racetrackRaceCourseSampler.tests.js
// Load: AFTER racetrackRaceCourseSampler.js. Not required for production.
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, cond, details) {
    return { name: name, pass: !!cond, details: details === undefined ? null : details };
  }

  function _approx(a, b, tol) {
    return Math.abs(a - b) <= (tol == null ? 1e-6 : tol);
  }

  function _straightCoursePackage() {
    return {
      progressSamples: [
        { index: 0, distanceMeters: 0, progress01: 0, coordinate: [-74.00, 40.00], headingDeg: 90 },
        { index: 1, distanceMeters: 500, progress01: 0.5, coordinate: [-73.99, 40.00], headingDeg: 90 },
        { index: 2, distanceMeters: 1000, progress01: 1, coordinate: [-73.98, 40.00], headingDeg: 90 },
      ],
    };
  }

  function _wrapHeadingCoursePackage() {
    return {
      progressSamples: [
        { index: 0, distanceMeters: 0, progress01: 0, coordinate: [0, 0], headingDeg: 350 },
        { index: 1, distanceMeters: 100, progress01: 1, coordinate: [1, 1], headingDeg: 10 },
      ],
    };
  }

  async function run() {
    var sampler = SBE.RacetrackRaceCourseSampler;
    var results = [];

    if (!sampler) {
      results.push(_assert('SBE.RacetrackRaceCourseSampler is available', false));
      console.log('[RacetrackRaceCourseSamplerTests] FAIL — module not available');
      return { ok: false, total: 1, failed: 1, results: results };
    }

    (function () {
      var pkg = _straightCoursePackage();
      var atStart = sampler.sampleCourseAtProgress(pkg, 0);
      results.push(_assert('progress 0 returns the first sample coordinate', _approx(atStart.coordinate[0], -74.00) && _approx(atStart.coordinate[1], 40.00), atStart));

      var atEnd = sampler.sampleCourseAtProgress(pkg, 1);
      results.push(_assert('progress 1 returns the last sample coordinate', _approx(atEnd.coordinate[0], -73.98) && _approx(atEnd.coordinate[1], 40.00), atEnd));

      var atMid = sampler.sampleCourseAtProgress(pkg, 0.25);
      results.push(_assert('progress 0.25 (midpoint of first bracket) linearly interpolates', _approx(atMid.coordinate[0], -73.995, 1e-4), atMid));
      results.push(_assert('interpolated distanceMeters matches expected fraction', _approx(atMid.distanceMeters, 250, 1), atMid));

      var below = sampler.sampleCourseAtProgress(pkg, -0.5);
      results.push(_assert('progress below 0 clamps to the first sample', _approx(below.coordinate[0], -74.00), below));
      var above = sampler.sampleCourseAtProgress(pkg, 1.7);
      results.push(_assert('progress above 1 clamps to the last sample', _approx(above.coordinate[0], -73.98), above));
    })();

    (function () {
      var pkg = _wrapHeadingCoursePackage();
      var mid = sampler.sampleCourseAtProgress(pkg, 0.5);
      var wrapped = ((mid.headingDeg % 360) + 360) % 360;
      results.push(_assert('heading interpolation takes the shortest arc across the 0/360 boundary', _approx(wrapped, 0, 1) || _approx(wrapped, 360, 1), mid.headingDeg));
    })();

    (function () {
      var pkg = _straightCoursePackage();
      var project = sampler.projectCourseToWorld(pkg);
      var p0 = project(pkg.progressSamples[0].coordinate);
      var p2 = project(pkg.progressSamples[2].coordinate);
      results.push(_assert('projectCourseToWorld produces finite, distinct points for distinct coordinates',
        isFinite(p0.x) && isFinite(p0.z) && isFinite(p2.x) && isFinite(p2.z) && (p0.x !== p2.x || p0.z !== p2.z),
        { p0: p0, p2: p2 }));
    })();

    (function () {
      var project = SBE.RacetrackRaceCourseSampler.projectCourseToWorld({ progressSamples: [] });
      var p = project([1, 2]);
      results.push(_assert('projectCourseToWorld degenerates safely for an empty sample list', p.x === 0 && p.z === 0, p));
    })();

    var failed = results.filter(function (r) { return !r.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };

    console.log('[RacetrackRaceCourseSamplerTests] ' + (summary.ok ? 'PASS' : 'FAIL') +
      ' — ' + (results.length - failed.length) + '/' + results.length + ' assertions passed');
    if (failed.length) console.warn('[RacetrackRaceCourseSamplerTests] failures:', failed);

    return summary;
  }

  SBE.RacetrackRaceCourseSamplerTests = { run: run };

  global._wos = global._wos || {};
  global._wos.debug = global._wos.debug || {};
  global._wos.debug.racetrackRaceCourseSampler = { runTests: run };

})(window);
