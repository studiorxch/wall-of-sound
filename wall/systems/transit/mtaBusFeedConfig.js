// ── MTABusFeedConfig v1.0.0 ───────────────────────────────────────────────────
// 0604G_WOS_MTABusFeedSourceInventory_v1.0.0  (merged: Version A build target +
// Version B constants / failure vocabulary)
// Status: active | Classification: runtime-config (inventory-only)
//
// Bounded, single-location configuration for the future MTA Bus GTFS-Realtime
// adapter (0604H). INVENTORY-ONLY: never fetches, decodes, renders, or mutates
// ActorRuntime. No committed secrets — the API key lives in localStorage under
// `apiKeyStorageKey`, never in source. Load BEFORE mtaBusFeedSourceInventory.js.
// Never throws.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';
  var SBE = (global.SBE = global.SBE || {});
  var VERSION = '1.0.0';

  // Version B baseline constants (implementation baselines, not permanent doctrine).
  var MTA_BUS_REFRESH_CADENCE_MS = 15000;
  var MTA_BUS_STALE_AFTER_MS     = 45000;
  var MTA_BUS_DISABLED_AFTER_MS  = 180000;
  var MTA_BUS_MIN_REFRESH_MS     = 10000;
  var MTA_BUS_REQUEST_TIMEOUT_MS = 10000;
  var MTA_BUS_MAX_VEHICLES       = 1500;

  // Version B failure vocabulary the 0604H adapter must report. Defined here so
  // the inventory + adapter share one canonical enum.
  var MTA_BUS_FEED_FAILURE_REASONS = Object.freeze([
    'not_configured',
    'api_key_missing',
    'network_error',
    'http_error',
    'decode_failed',
    'empty_feed',
    'missing_vehicle_position',
    'missing_coordinates',
    'missing_route_id',
    'stale_feed',
    'rate_limited',
    'unknown_error',
  ]);

  SBE.MTABusFeedConfig = Object.freeze({
    VERSION:                VERSION,
    // Endpoints (key appended by the adapter at fetch time; never stored here).
    vehiclePositionsUrl:    'https://gtfsrt.prod.obanyc.com/vehiclePositions',
    tripUpdatesUrl:         'https://gtfsrt.prod.obanyc.com/tripUpdates',
    alertsUrl:              'https://gtfsrt.prod.obanyc.com/alerts',
    // Secret handling — localStorage only; no committed/hardcoded key.
    apiKeyStorageKey:       'wos.mtaBusTime.apiKey',
    // Cadence / lifecycle (merged Version A + Version B).
    defaultRefreshMs:       MTA_BUS_REFRESH_CADENCE_MS,
    refreshCadenceMs:       MTA_BUS_REFRESH_CADENCE_MS,
    minimumRefreshMs:       MTA_BUS_MIN_REFRESH_MS,
    staleAfterMs:           MTA_BUS_STALE_AFTER_MS,
    disabledAfterMs:        MTA_BUS_DISABLED_AFTER_MS,
    requestTimeoutMs:       MTA_BUS_REQUEST_TIMEOUT_MS,
    maxVehicles:            MTA_BUS_MAX_VEHICLES,
    // Constants exposed individually for adapter reuse.
    MTA_BUS_REFRESH_CADENCE_MS: MTA_BUS_REFRESH_CADENCE_MS,
    MTA_BUS_STALE_AFTER_MS:     MTA_BUS_STALE_AFTER_MS,
    MTA_BUS_DISABLED_AFTER_MS:  MTA_BUS_DISABLED_AFTER_MS,
    FAILURE_REASONS:        MTA_BUS_FEED_FAILURE_REASONS,
  });

  console.log('[MTABusFeedConfig] v' + VERSION + ' loaded (inventory-only — no fetch)');
})(window);
