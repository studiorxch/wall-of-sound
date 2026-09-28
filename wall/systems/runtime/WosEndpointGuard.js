(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── WosEndpointGuard — detects which runtime context this page is in ──────────

  var ENDPOINT_ROLES = Object.freeze({
    WALL_HOME:       'wall_home',       // explicit same-origin HOME surface
    WALL_EMBEDDED:   'wall_embedded',   // WALL iframe inside PLAY
    WALL_STANDALONE: 'wall_standalone', // WALL opened directly in browser
    PLAY_HOST:       'play_host',       // PLAY app shell (not applicable here)
    UNKNOWN:         'unknown'
  });

  function homeIdentity() {
    try {
      var p = new URLSearchParams(global.location.search);
      var runtimeId = p.get('homeRuntime');
      var navigationId = Number(p.get('homeNavigation'));
      if (p.get('host') !== 'home' || global === global.parent ||
          global.parent.location.origin !== global.location.origin ||
          global.parent.StudioRichHome?.version !== 1 || !runtimeId ||
          !Number.isSafeInteger(navigationId) || navigationId < 1) return null;
      return Object.freeze({ runtimeId: runtimeId, navigationId: navigationId, routeKey: 'surface=map' });
    } catch (e) { return null; }
  }
  var identity = homeIdentity();

  function detectWosEndpointRole() {
    var isEmbedded  = global !== global.parent;
    var pathname    = global.location ? global.location.pathname : '';
    var hostname    = global.location ? global.location.hostname : '';
    var port        = global.location ? global.location.port    : '';

    var role;
    if (identity) {
      role = ENDPOINT_ROLES.WALL_HOME;
    } else if (isEmbedded) {
      role = ENDPOINT_ROLES.WALL_EMBEDDED;
    } else if (pathname.indexOf('wall') !== -1 || port === '3001') {
      role = ENDPOINT_ROLES.WALL_STANDALONE;
    } else {
      role = ENDPOINT_ROLES.UNKNOWN;
    }

    return Object.freeze({
      role:                role,
      pathname:            pathname,
      hostname:            hostname,
      port:                port,
      isEmbedded:          isEmbedded,
      canonicalEntrypoint: hostname + (port ? ':' + port : '') + pathname
    });
  }

  SBE.WosEndpointGuard = Object.freeze({
    ROLES:  ENDPOINT_ROLES,
    detect: detectWosEndpointRole,
    homeIdentity: identity,
    isHome: !!identity
  });

  // Eagerly detect and cache at load time
  SBE.WosEndpointRole = detectWosEndpointRole();

})(window);
