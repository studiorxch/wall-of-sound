// ThreeSkyLayer focused regression tests — Subway geographic view isolation.
// Run via: SBE.ThreeSkyLayerTests.run()
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  function _assert(name, condition) {
    return { name: name, pass: !!condition };
  }

  function _mapHarness() {
    var calls = { addLayer: 0, removeLayer: 0, setLayoutProperty: 0 };
    return {
      calls: calls,
      addLayer: function () { calls.addLayer++; },
      removeLayer: function () { calls.removeLayer++; },
      setLayoutProperty: function () { calls.setLayoutProperty++; },
      getLayer: function () { return null; },
      getStyle: function () { return { layers: [{ id: 'buildings', type: 'fill-extrusion' }] }; },
      loaded: function () { return true; },
    };
  }

  function run() {
    var sky = SBE.ThreeSkyLayer;
    var results = [];
    if (!sky || !sky.__test) {
      results.push(_assert('ThreeSkyLayer test surface is loaded', false));
    } else {
      results.push(_assert('Subway query is identified', sky.__test.isSubwayMode('?mode=subway')));
      results.push(_assert('Other Wall modes retain sky eligibility', !sky.__test.isSubwayMode('?mode=racetrack')));

      var subwayMap = _mapHarness();
      var mounted = sky.mount(subwayMap, '?mode=subway');
      results.push(_assert('Subway suppresses the fullscreen sky custom layer', mounted === false && subwayMap.calls.addLayer === 0));
      results.push(_assert('Subway suppression does not remove or mutate building layers', subwayMap.calls.removeLayer === 0 && subwayMap.calls.setLayoutProperty === 0));

      var wallMap = _mapHarness();
      sky.mount(wallMap, '?mode=map');
      results.push(_assert('Non-Subway Wall modes still mount ThreeSkyLayer', wallMap.calls.addLayer === 1));
    }

    var failed = results.filter(function (result) { return !result.pass; });
    var summary = { ok: failed.length === 0, total: results.length, failed: failed.length, results: results };
    console.log('[ThreeSkyLayerTests] ' + (summary.ok ? 'PASS' : 'FAIL') + ' — ' + (results.length - failed.length) + '/' + results.length);
    if (failed.length) console.warn('[ThreeSkyLayerTests] failures:', failed);
    return summary;
  }

  SBE.ThreeSkyLayerTests = { run: run };
})(window);
