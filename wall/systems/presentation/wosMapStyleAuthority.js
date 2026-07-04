// ── WOSMapStyleAuthority v1.0.0 ──────────────────────────────────────────────
// 0612Q_WOS_MapStyleAuthoritySync_v1.0.0_BUILD
// Status: active | Classification: runtime-authority / map-style-authority
//
// Purpose:
//   Single source of truth for which Mapbox style WOS is using right now.
//   Both the Wall map and Studio Map Lab consume this authority so their base
//   styles stay in sync without any manual coordination.
//
//   Style profiles:
//     wos.dark.cyan  — WOS presentation style (studiorich/cm3goyx23003901qkb60ff29p)
//                      Cyan buildings on dark harbor basemap. Wall default.
//     wos.operator   — Editable dark-v11 basemap (mapbox/dark-v11).
//                      Active when EditableBasemapAuthority is engaged.
//
// Authority boundary:
//   READS:   localStorage wos:styleAuthority:activeProfile, MapboxViewportRuntime,
//            WOSMapLab.MapboxAdapter (Studio)
//   WRITES:  localStorage wos:styleAuthority:activeProfile (cross-tab sync)
//   MUST NOT: touch actor archetypes, replacement manifest, atmosphere, camera,
//             audio, actor feeds, Wall layer state
//
// Cross-tab sync:
//   Wall calls setActiveProfile() when setPresentationMode() fires.
//   setActiveProfile() writes to localStorage.
//   Storage event fires in the Studio tab → applyToMap() is called on the
//   Studio map instance automatically.
//
//   Same-tab: init() reads localStorage so Studio Map Lab resolves the correct
//   style on first load without waiting for a storage event.
//
// Load order:
//   Wall:   AFTER mapboxViewportRuntime.js — wire-up uses mvr.onReady
//   Studio: BEFORE mapboxAdapter.js — adapter reads getMapboxStyle() on init
//
// Placement: wall/systems/presentation/wosMapStyleAuthority.js
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE     = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // ── Style profiles ────────────────────────────────────────────────────────────

  var PROFILES = {
    'wos.dark.cyan': {
      id:    'wos.dark.cyan',
      label: 'WOS Presentation (cyan-on-dark)',
      url:   'mapbox://styles/studiorich/cm3goyx23003901qkb60ff29p',
    },
    'wos.operator': {
      id:    'wos.operator',
      label: 'WOS Operator (dark-v11 editable)',
      url:   'mapbox://styles/mapbox/dark-v11',
    },
  };

  var DEFAULT_PROFILE_ID = 'wos.dark.cyan';
  var STORAGE_KEY        = 'wos:styleAuthority:activeProfile';

  // ── Shared Mapbox token — both Wall and Studio resolve via SBE.MapboxToken ──
  // 0619F: exposing here because wosMapStyleAuthority.js is the one shared module
  // loaded by both wall/index.html (before mapboxViewportRuntime) and studio/index.html.
  // Wall's mapboxViewportRuntime.js continues to use its own ACCESS_TOKEN constant —
  // that is unchanged. Studio reads SBE.MapboxToken via WOSMapboxAccessController.
  if (!SBE.MapboxToken) {
    SBE.MapboxToken = 'MAPBOX_TOKEN_REMOVED';
  }

  // ── State ─────────────────────────────────────────────────────────────────────

  var _activeProfileId = DEFAULT_PROFILE_ID;

  // id → { getMap: fn, getAppliedStyleUrl: fn }
  var _consumers = {};

  // ── Storage helpers ───────────────────────────────────────────────────────────

  function _readFromStorage() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw && PROFILES[raw]) { _activeProfileId = raw; }
    } catch (e) { /* localStorage unavailable — use default */ }
  }

  function _writeToStorage(profileId) {
    try { global.localStorage.setItem(STORAGE_KEY, profileId); } catch (e) {}
  }

  // ── Profile resolution ────────────────────────────────────────────────────────

  function _urlToProfileId(url) {
    if (!url) return null;
    // Direct URL match
    var found = null;
    Object.keys(PROFILES).forEach(function (id) {
      if (PROFILES[id].url === url) found = id;
    });
    if (found) return found;
    // Substring match (sprite-based URL fragments)
    if (url.indexOf('cm3goyx23003901qkb60ff29p') !== -1) return 'wos.dark.cyan';
    if (url.indexOf('dark-v11') !== -1)                  return 'wos.operator';
    return null;
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  // getActiveStyleProfile() — returns the full profile object for the active style.
  function getActiveStyleProfile() {
    return PROFILES[_activeProfileId] || PROFILES[DEFAULT_PROFILE_ID];
  }

  // getMapboxStyle() — returns the Mapbox style URL for the active profile.
  // Used by mapboxAdapter.init() to resolve the initial Studio style.
  function getMapboxStyle() {
    return getActiveStyleProfile().url;
  }

  // setActiveProfile(profileId) — updates the active profile and writes to
  // localStorage so the other tab picks up the change via storage event.
  // Does NOT call applyToMap on consumers — each tab applies independently
  // via its own storage event handler (or directly, for the calling tab).
  function setActiveProfile(profileId) {
    if (!PROFILES[profileId]) {
      console.warn('[WOSMapStyleAuthority] unknown profile:', profileId);
      return { ok: false, reason: 'unknown_profile' };
    }
    var changed = _activeProfileId !== profileId;
    _activeProfileId = profileId;
    _writeToStorage(profileId);
    if (changed) {
      console.log('[WOSMapStyleAuthority] active profile →', profileId,
        '|', PROFILES[profileId].url);
    }
    return { ok: true, profileId: profileId, changed: changed };
  }

  // registerConsumer(id, getMapFn, getAppliedStyleUrlFn) — registers a map
  // instance as a consumer of this authority.
  //   id                  — 'wall' | 'studioMapLab' (or custom)
  //   getMapFn            — function() → Mapbox GL JS map instance
  //   getAppliedStyleUrlFn — function() → currently applied style URL on that map
  function registerConsumer(id, getMapFn, getAppliedStyleUrlFn) {
    _consumers[id] = {
      id:                 id,
      getMap:             getMapFn             || null,
      getAppliedStyleUrl: getAppliedStyleUrlFn || null,
    };
    console.log('[WOSMapStyleAuthority] consumer registered:', id);
  }

  // applyToMap(map, opts) — applies the current active profile style to a map.
  // opts.consumer (string) — label for console output
  function applyToMap(map, opts) {
    if (!map) return { ok: false, reason: 'no_map' };
    var url = getMapboxStyle();
    try {
      map.setStyle(url);
      console.log('[WOSMapStyleAuthority] applyToMap:',
        (opts && opts.consumer) || 'unknown', '→', url);
      return { ok: true, url: url };
    } catch (e) {
      return { ok: false, reason: String(e && e.message || e) };
    }
  }

  // getDebugState() — returns consumer state and any style mismatches.
  // Expected shape per spec:
  //   { activeStyleId, consumers: { wall: { registered, appliedStyleId }, ... }, mismatches: [] }
  function getDebugState() {
    var profile    = getActiveStyleProfile();
    var consumers  = {};
    var mismatches = [];

    Object.keys(_consumers).forEach(function (cid) {
      var c            = _consumers[cid];
      var appliedUrl   = null;
      try { appliedUrl = c.getAppliedStyleUrl ? c.getAppliedStyleUrl() : null; } catch (ex) {}
      var appliedId    = _urlToProfileId(appliedUrl) || 'unknown';
      var matches      = appliedId === profile.id;
      consumers[cid]   = {
        registered:      true,
        appliedStyleId:  appliedId,
        appliedStyleUrl: appliedUrl,
        matches:         matches,
      };
      if (!matches) {
        mismatches.push({
          consumer:        cid,
          appliedStyleId:  appliedId,
          expected:        profile.id,
        });
      }
    });

    // Consumers declared but not yet registered appear as absent
    ['wall', 'studioMapLab'].forEach(function (cid) {
      if (!consumers[cid]) {
        consumers[cid] = { registered: false, appliedStyleId: null, matches: false };
        mismatches.push({ consumer: cid, appliedStyleId: null, expected: profile.id });
      }
    });

    var result = {
      activeStyleId:  profile.id,
      activeStyleUrl: profile.url,
      activeLabel:    profile.label,
      consumers:      consumers,
      mismatches:     mismatches,
    };
    console.log('[WOSMapStyleAuthority] getDebugState:', JSON.stringify(result, null, 2));
    return result;
  }

  // ── Cross-tab storage event ───────────────────────────────────────────────────
  //
  // When Wall calls setActiveProfile(), the storage event fires in the Studio tab.
  // Studio picks it up here and applies the new style to its map.

  function _onStorageEvent(e) {
    if (e.key !== STORAGE_KEY) return;
    var profileId = e.newValue;
    if (!profileId || !PROFILES[profileId]) return;
    if (_activeProfileId === profileId) return;
    console.log('[WOSMapStyleAuthority] cross-tab profile update →', profileId);
    _activeProfileId = profileId;
    // Apply to all consumers registered in this tab
    Object.keys(_consumers).forEach(function (cid) {
      var c = _consumers[cid];
      try {
        var map = c.getMap ? c.getMap() : null;
        if (map) { applyToMap(map, { consumer: cid + ' (cross-tab)' }); }
      } catch (ex) {
        console.warn('[WOSMapStyleAuthority] cross-tab apply failed for', cid, ':', ex.message || ex);
      }
    });
  }

  // ── Wall consumer self-wiring ─────────────────────────────────────────────────
  //
  // Runs after MapboxViewportRuntime is ready (via onReady callback).
  // Sets the initial profile from the Wall's boot mode.

  function _wireWallConsumer() {
    var mvr = global.SBE && global.SBE.MapboxViewportRuntime;
    if (!mvr) return;

    // Register Wall as a consumer
    registerConsumer('wall',
      function () { return (mvr.getMap && mvr.getMap()) || null; },
      function () {
        // Read currently applied style URL from the live map
        var map = mvr.getMap && mvr.getMap();
        if (!map) return null;
        try {
          var s      = map.getStyle();
          var imps   = (s && s.imports) || [];
          if (imps.length && imps[0].url) return imps[0].url;
          // Non-import style — derive from sprite URL
          return (s && s.sprite) ? s.sprite.split('/sprite')[0] : null;
        } catch (ex) { return null; }
      }
    );

    // Set initial profile from Wall's current mode
    var isPres = (typeof mvr.isPresentationMode === 'function') ? mvr.isPresentationMode() : true;
    var initialId = isPres ? 'wos.dark.cyan' : 'wos.operator';
    // Only write to storage if we're the authoritative Wall tab
    _activeProfileId = initialId;
    _writeToStorage(initialId);
    console.log('[WOSMapStyleAuthority] Wall wired | initial profile:', initialId);
  }

  // ── Initialization ────────────────────────────────────────────────────────────

  function _init() {
    // Read current profile from storage (Studio reads this to know which style to load)
    _readFromStorage();

    // Cross-tab storage listener
    try { global.addEventListener('storage', _onStorageEvent); } catch (e) {}

    // Wire Wall consumer via onReady (Wall context only)
    var mvr = global.SBE && global.SBE.MapboxViewportRuntime;
    if (mvr) {
      if (typeof mvr.onReady === 'function') {
        mvr.onReady(_wireWallConsumer);
      } else {
        // mvr present but no onReady yet — delay
        setTimeout(_wireWallConsumer, 1000);
      }
    }
    // Studio consumer is registered by mapboxAdapter.init() when it calls registerConsumer()
  }

  // ── Export ────────────────────────────────────────────────────────────────────

  SBE.WOSMapStyleAuthority = Object.freeze({
    VERSION:               VERSION,
    PROFILES:              Object.freeze(PROFILES),
    DEFAULT_PROFILE_ID:    DEFAULT_PROFILE_ID,
    getActiveStyleProfile: getActiveStyleProfile,
    getMapboxStyle:        getMapboxStyle,
    setActiveProfile:      setActiveProfile,
    registerConsumer:      registerConsumer,
    applyToMap:            applyToMap,
    getDebugState:         getDebugState,
  });

  // ── Debug surface wiring ──────────────────────────────────────────────────────

  function _wireDebug() {
    global._wos            = global._wos            || {};
    global._wos.debug      = global._wos.debug      || {};
    global._wos.debug.mapStyle = {
      getActiveProfile:  getActiveStyleProfile,
      getMapboxStyle:    getMapboxStyle,
      setActiveProfile:  setActiveProfile,
      getDebugState:     getDebugState,
      profiles:          PROFILES,
    };
  }

  _wireDebug();
  (function () {
    var _mvr = global.SBE && global.SBE.MapboxViewportRuntime;
    if (_mvr && typeof _mvr.onReady === 'function') {
      _mvr.onReady(_wireDebug);
    } else {
      setTimeout(_wireDebug, 3000);
    }
  })();

  _init();

  console.log('[WOSMapStyleAuthority] v' + VERSION +
    ' loaded | active:', _activeProfileId,
    '| _wos.debug.mapStyle.getDebugState()');

})(window);
