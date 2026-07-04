(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});

  // ── WosEndpointGuard — detects which runtime context this page is in ──────────

  var ENDPOINT_ROLES = Object.freeze({
    WALL_EMBEDDED:   'wall_embedded',   // WALL iframe inside PLAY
    WALL_STANDALONE: 'wall_standalone', // WALL opened directly in browser
    PLAY_HOST:       'play_host',       // PLAY app shell (not applicable here)
    UNKNOWN:         'unknown'
  });

  function detectWosEndpointRole() {
    var isEmbedded  = global !== global.parent;
    var pathname    = global.location ? global.location.pathname : '';
    var hostname    = global.location ? global.location.hostname : '';
    var port        = global.location ? global.location.port    : '';

    var role;
    if (isEmbedded) {
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
    detect: detectWosEndpointRole
  });

  // Eagerly detect and cache at load time
  SBE.WosEndpointRole = detectWosEndpointRole();

})(window);
