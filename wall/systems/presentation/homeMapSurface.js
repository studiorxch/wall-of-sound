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
    },
    // HOST-03B -- requests HOME's own never-nested window initiate/complete
    // the Google popup; resolves to an opaque credential for this surface's
    // OWN MemberIdentityAuthority.signInWithCredential. Must be called
    // synchronously within the sign-in click handler to preserve the user
    // gesture -- see subwayMemberRuntime.ts's own caller.
    requestGoogleCredential: function () {
      return global.parent.StudioRichHome.requestGoogleCredential(global.document, identity);
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
