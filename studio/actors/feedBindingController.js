// ── WOS FeedBindingController ─────────────────────────────────────────────────
// 0613_WOS_3DCanvasLabPhase4Governance_v1.0.0_BUILD
// Live-validate feed bindings. Advisory during Draft editing.
// Authoritative validation occurs in the Promotion Gate.
// Feed endpoints are not available in the Lab browser context;
// the controller returns FEED_ERROR with context so the gate records it.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var DEFAULT_POLL_HZ = { ais: 0.017, gtfs_rt: 0.1, gbfs: 0.033 };
  var DEFAULT_DR_ENABLED = { ais: true, gtfs_rt: true, gbfs: false };

  var BINDING_KEYS = {
    ais:     ['mmsi', 'imo', 'vessel_name'],
    gtfs_rt: ['vehicle_id', 'trip_id', 'route_id', 'stop_id'],
    gbfs:    ['station_id', 'system_id'],
  };

  var Controller = {
    // Returns the default poll rate (Hz) for a feed type.
    defaultPollHz: function (feedType) {
      return DEFAULT_POLL_HZ[feedType] || 0.1;
    },

    // Returns the default drEnabled value for a feed type.
    defaultDrEnabled: function (feedType) {
      return DEFAULT_DR_ENABLED[feedType] !== false;
    },

    // Returns valid binding keys for a feed type.
    bindingKeysFor: function (feedType) {
      return (BINDING_KEYS[feedType] || []).slice();
    },

    // Validate a live feed binding. Returns { status, message }.
    // status: 'FOUND' | 'NOT_FOUND' | 'FEED_ERROR'
    // In the Lab context, feed endpoints are unavailable — always returns FEED_ERROR
    // with an advisory message. The Promotion Gate treats FEED_ERROR as a Group C warning.
    validate: function (feedType, feedSourceId, bindingKey, bindingValue, callback) {
      if (!feedType || !bindingValue) {
        callback({ status: 'FEED_ERROR', message: 'feedType and bindingValue are required.' });
        return;
      }

      // AIS: MMSI format check (9 digits) as a structural pre-check.
      if (feedType === 'ais' && bindingKey === 'mmsi') {
        if (!/^\d{9}$/.test(bindingValue.trim())) {
          callback({ status: 'NOT_FOUND', message: 'MMSI must be exactly 9 digits.' });
          return;
        }
      }

      // All feeds are unreachable from the Lab browser context.
      // Report FEED_ERROR with advisory note.
      setTimeout(function () {
        callback({
          status: 'FEED_ERROR',
          message: 'Feed endpoint unreachable from Lab. Binding format accepted; validate against live feed before promotion.',
        });
      }, 400);
    },

    // Default liveTracking block for a given feedType.
    defaultBlock: function (feedType) {
      var block = {
        feedType:     feedType,
        feedSourceId: '',
        bindingKey:   BINDING_KEYS[feedType] ? BINDING_KEYS[feedType][0] : '',
        bindingValue: '',
        feedUrl:      null,
        pollHz:       DEFAULT_POLL_HZ[feedType] || 0.1,
        drEnabled:    DEFAULT_DR_ENABLED[feedType] !== false,
        drMaxSec:     300,
      };
      if (feedType === 'ais')     block.ais     = { statusCodes: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], hideOnSART: true };
      if (feedType === 'gtfs_rt') block.gtfsRt  = { routeId: '', tripId: '' };
      if (feedType === 'gbfs')    block.gbfs     = { stationId: '', dockStatus: null };
      return block;
    },
  };

  global.WOSFeedBindingController = Controller;
  console.log('[FeedBindingController] ready');
})(window);
