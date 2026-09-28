// Narrow HOME adapter. MAP, MEMBER and RADIO keep their existing document owners.
(function (global) {
  'use strict';
  var SBE = global.SBE = global.SBE || {};
  var identity = SBE.WosEndpointGuard.homeIdentity;
  if (!identity) return;
  var reported = false;
  SBE.HomeMapSurface = Object.freeze({
    requestNavigate: function (destination) {
      return global.parent.StudioRichHome.requestNavigate(global.document, identity, destination);
    }
  });
  function reportReady() {
    if (reported) return;
    reported = true;
    global.document.documentElement.dataset.homeReady = JSON.stringify(identity);
    global.parent.StudioRichHome.ready(global.document, identity);
  }
  // Existing viewport readiness is the rendering authority; no new map boot or polling loop.
  global.document.addEventListener('DOMContentLoaded', function () {
    SBE.MapboxViewportRuntime.onReady(reportReady);
  }, { once: true });
})(window);
