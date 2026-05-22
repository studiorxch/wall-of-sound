// ── AISIngestBridge v1.5.1 ────────────────────────────────────────────────
// 0520Q_WOS_AISRuntime_v1.5.1 — §23 AISIngestBridge Boundary
// Owns: provider authentication, WebSocket connection, reconnect behavior,
//       provider schema translation, AIS status translation, packet validation,
//       normalized payload emission, dormant lookup before allocation.
//
// Does NOT own: vessel state, lifecycle management, simulation, or continuity.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── AIS navigation status → WOS state ────────────────────────────────────
  // Canonical translation table per §3. Owned here — runtime re-receives
  // already-mapped state in the normalized payload.

  var AIS_STATUS_MAP = {
    0:  'STATUS_UNDERWAY',    // Under way using engine
    1:  'STATUS_ANCHORED',    // At anchor
    2:  'STATUS_RESTRICTED',  // Not under command
    3:  'STATUS_RESTRICTED',  // Restricted maneuverability
    4:  'STATUS_RESTRICTED',  // Constrained by draught
    5:  'STATUS_MOORED',      // Moored
    6:  'STATUS_STALE',       // Aground
    7:  'STATUS_RESTRICTED',  // Engaged in fishing
    8:  'STATUS_UNDERWAY',    // Under way sailing
    9:  'STATUS_RESTRICTED',  // Reserved / HSC
    10: 'STATUS_RESTRICTED',  // Reserved / WIG
    11: 'STATUS_RESTRICTED',
    12: 'STATUS_RESTRICTED',
    13: 'STATUS_RESTRICTED',
    14: 'STATUS_EMERGENCY',   // AIS-SART / MOB-AIS / EPIRB-AIS
    15: 'STATUS_STALE',       // Undefined — unknown → STALE, not UNDERWAY
  };

  function _mapAISStatus(code) {
    if (typeof code !== 'number') return 'STATUS_STALE';
    var mapped = AIS_STATUS_MAP[code];
    return mapped !== undefined ? mapped : 'STATUS_STALE';
  }

  // ── Label cleaning ────────────────────────────────────────────────────────

  var _DIRTY = { 'UNKNOWN': 1, 'N/A': 1, '???': 1, '': 1, 'NONE': 1 };

  function _cleanLabel(s) {
    if (!s || typeof s !== 'string') return '';
    var up = s.toUpperCase().trim();
    return _DIRTY[up] ? '' : s.trim();
  }

  // ── Packet validation ─────────────────────────────────────────────────────

  function _validatePacket(packet) {
    if (!packet || !packet.mmsi || isNaN(packet.mmsi)) return false;
    var tel = packet.telemetry || {};
    if (typeof tel.lat !== 'number' || typeof tel.lng !== 'number') return false;
    if (tel.lat <= -90  || tel.lat >= 90)  return false;
    if (tel.lng <= -180 || tel.lng >= 180) return false;
    return true;
  }

  // ── Normalization profiles ────────────────────────────────────────────────
  // §22 normalizationProfile field selects which schema to use.

  var _profiles = {

    // ── aisstream.io ──────────────────────────────────────────────────────
    // https://aisstream.io — binary WebSocket feed with JSON-encoded envelopes
    'aisstream': {
      normalize: function (raw) {
        var msg     = raw.Message   || {};
        var meta    = raw.MetaData  || {};
        var pos     = msg.PositionReport
                   || msg.StandardClassBPositionReport
                   || msg.ExtendedClassBPositionReport
                   || {};
        var ship    = msg.ShipStaticData || {};
        var dim     = ship.Dimension     || {};

        // SOG and COG are sent ×10 in aisstream
        var speedKts = typeof pos.Sog === 'number' ? pos.Sog / 10 : 0;
        var cog      = typeof pos.Cog === 'number' ? pos.Cog / 10 : 0;
        var hdg      = typeof pos.TrueHeading === 'number' && pos.TrueHeading !== 511
          ? pos.TrueHeading
          : cog;

        return {
          mmsi:       parseInt(meta.MMSI || pos.UserID, 10),
          vesselName: _cleanLabel(meta.ShipName || ship.Name || ''),
          callsign:   _cleanLabel(ship.CallSign || ''),
          state:      _mapAISStatus(
            typeof pos.NavigationalStatus === 'number' ? pos.NavigationalStatus : 15
          ),
          telemetry: {
            lat:              meta.latitude  || pos.Latitude  || 0,
            lng:              meta.longitude || pos.Longitude || 0,
            speedKnots:       speedKts,
            courseOverGround: cog,
            trueHeading:      hdg,
          },
          dimensions: {
            lengthMeters: (dim.A || 0) + (dim.B || 0),
            widthMeters:  (dim.C || 0) + (dim.D || 0),
          },
          timestampMs: Date.now(),
        };
      },
    },

    // ── vesseltracker.com / MarineTraffic generic JSON ────────────────────
    'generic': {
      normalize: function (raw) {
        var statusCode = typeof raw.navigational_status === 'number'
          ? raw.navigational_status
          : parseInt(raw.status || raw.nav_status || '15', 10);
        var cog = parseFloat(raw.course || raw.cog || 0);
        var hdg = parseFloat(raw.heading || raw.true_heading || cog);
        if (isNaN(hdg) || hdg > 360) hdg = cog;

        return {
          mmsi:       parseInt(raw.mmsi, 10),
          vesselName: _cleanLabel(raw.shipname || raw.vessel_name || raw.name || ''),
          callsign:   _cleanLabel(raw.callsign || ''),
          state:      _mapAISStatus(isNaN(statusCode) ? 15 : statusCode),
          telemetry: {
            lat:              parseFloat(raw.lat || raw.latitude  || 0),
            lng:              parseFloat(raw.lon || raw.longitude || raw.lng || 0),
            speedKnots:       parseFloat(raw.speed || raw.sog || 0),
            courseOverGround: cog,
            trueHeading:      hdg,
          },
          dimensions: {
            lengthMeters: parseFloat(raw.length || raw.length_meters || 0),
            widthMeters:  parseFloat(raw.width  || raw.width_meters  || 0),
          },
          timestampMs: raw.timestamp
            ? new Date(raw.timestamp).getTime()
            : Date.now(),
        };
      },
    },

    // ── NMEA decoded JSON (kplex / gpsd / AISdispatcher) ─────────────────
    'nmea-json': {
      normalize: function (raw) {
        // Typical kplex/AISdecoder output: flat object with field names
        // matching NMEA sentence field labels
        var statusCode = typeof raw.status === 'number'
          ? raw.status
          : parseInt(raw.navigational_status || '15', 10);
        var cog = parseFloat(raw.cog || 0);
        var hdg = parseFloat(raw.heading || cog);

        return {
          mmsi:       parseInt(raw.mmsi, 10),
          vesselName: _cleanLabel(raw.shipname || ''),
          callsign:   _cleanLabel(raw.callsign || ''),
          state:      _mapAISStatus(isNaN(statusCode) ? 15 : statusCode),
          telemetry: {
            lat:              parseFloat(raw.lat || 0),
            lng:              parseFloat(raw.lon || raw.lng || 0),
            speedKnots:       parseFloat(raw.sog || raw.speed || 0),
            courseOverGround: cog,
            trueHeading:      hdg,
          },
          dimensions: {
            lengthMeters: parseFloat(raw.length || 0),
            widthMeters:  parseFloat(raw.beam   || 0),
          },
          timestampMs: raw.time
            ? new Date(raw.time).getTime()
            : Date.now(),
        };
      },
    },

  };

  // ── Connection state ──────────────────────────────────────────────────────

  var _ws          = null;
  var _config      = null;
  var _connected   = false;
  var _destroyed   = false;
  var _retryTimer  = null;
  var _pollTimer   = null;

  // ── Message processing ────────────────────────────────────────────────────

  function _handleRaw(rawData) {
    var profile = _config && _profiles[_config.normalizationProfile];
    if (!profile) {
      console.warn('[AISIngestBridge] Unknown normalization profile:',
        _config && _config.normalizationProfile);
      return;
    }

    var raw;
    try {
      raw = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
    } catch (e) {
      return; // discard malformed
    }

    // Some feeds send arrays of updates in one message
    if (Array.isArray(raw)) {
      for (var i = 0; i < raw.length; i++) { _processOne(raw[i], profile); }
    } else {
      _processOne(raw, profile);
    }
  }

  function _processOne(raw, profile) {
    var packet;
    try {
      packet = profile.normalize(raw);
    } catch (e) {
      return; // discard normalization failures silently
    }

    if (!_validatePacket(packet)) return;

    // trueHeading 511 = not available in AIS spec
    if (packet.telemetry.trueHeading > 360) {
      packet.telemetry.trueHeading = packet.telemetry.courseOverGround;
    }

    _emitToRuntime(packet);
  }

  function _emitToRuntime(packet) {
    var runtime = global.SBE && SBE.AISRuntime;
    if (!runtime) {
      console.warn('[AISIngestBridge] AISRuntime not available — packet dropped');
      return;
    }
    // §20: multiple active vessels with same MMSI are STRICTLY FORBIDDEN.
    // AISRuntime.ingestPacket() performs the dormant lookup internally.
    runtime.ingestPacket(packet);
  }

  // ── WebSocket connection ──────────────────────────────────────────────────

  function _attemptConnect() {
    if (_destroyed) return;

    // Clean up any existing socket
    if (_ws) {
      _ws.onopen = _ws.onmessage = _ws.onerror = _ws.onclose = null;
      try { _ws.close(); } catch (e) { /* ignore */ }
      _ws = null;
    }

    var proto = _config.protocol;

    if (proto === 'ws' || proto === 'wss') {
      try {
        _ws = new WebSocket(_config.url);

        _ws.onopen = function () {
          _connected = true;
          // Some providers (aisstream.io) require auth token as first message
          if (_config.authToken) {
            _ws.send(JSON.stringify({ APIKey: _config.authToken }));
          }
        };

        _ws.onmessage = function (event) {
          _handleRaw(event.data);
        };

        _ws.onerror = function (e) {
          console.warn('[AISIngestBridge] WebSocket error', e && e.type);
        };

        _ws.onclose = function (event) {
          _connected = false;
          if (!_destroyed && _config.reconnect) {
            _retryTimer = setTimeout(_attemptConnect, _config.retryIntervalMs || 5000);
          }
        };

      } catch (e) {
        console.warn('[AISIngestBridge] WebSocket construction failed:', e.message);
        if (!_destroyed && _config.reconnect) {
          _retryTimer = setTimeout(_attemptConnect, _config.retryIntervalMs || 5000);
        }
      }

    } else if (proto === 'polling') {
      _startPolling();
    } else {
      console.warn('[AISIngestBridge] Unknown protocol:', proto);
    }
  }

  // ── Polling transport ─────────────────────────────────────────────────────

  function _startPolling() {
    if (_pollTimer) { clearTimeout(_pollTimer); _pollTimer = null; }
    if (_destroyed) return;

    var headers = {};
    if (_config.authToken) {
      headers['Authorization'] = 'Bearer ' + _config.authToken;
    }

    fetch(_config.url, { headers: headers })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        _connected = true;
        return res.json();
      })
      .then(function (data) {
        var packets = Array.isArray(data) ? data : [data];
        packets.forEach(function (item) {
          _handleRaw(JSON.stringify(item));
        });
      })
      .catch(function (e) {
        _connected = false;
        // silent — retry on schedule
      })
      .then(function () { // finally
        if (!_destroyed) {
          _pollTimer = setTimeout(_startPolling, _config.retryIntervalMs || 5000);
        }
      });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function connect(config) {
    if (!config || !config.url || !config.protocol || !config.normalizationProfile) {
      throw new Error('[AISIngestBridge] connect(): url, protocol, normalizationProfile required');
    }
    _destroyed = false;
    _config    = Object.assign({ reconnect: true, retryIntervalMs: 5000 }, config);
    _attemptConnect();
  }

  function disconnect() {
    _destroyed = true;
    _connected = false;
    if (_retryTimer) { clearTimeout(_retryTimer); _retryTimer = null; }
    if (_pollTimer)  { clearTimeout(_pollTimer);  _pollTimer  = null; }
    if (_ws) {
      _ws.onopen = _ws.onmessage = _ws.onerror = _ws.onclose = null;
      try { _ws.close(); } catch (e) { /* ignore */ }
      _ws = null;
    }
  }

  function isConnected() {
    return _connected;
  }

  // Register a custom provider normalization profile at runtime
  function registerNormalizationProfile(name, profile) {
    if (!name || typeof name !== 'string') throw new Error('[AISIngestBridge] profile name required');
    if (!profile || typeof profile.normalize !== 'function') {
      throw new Error('[AISIngestBridge] profile must expose normalize(raw) function');
    }
    _profiles[name] = profile;
  }

  // Manual packet injection — for testing, seed data, or operator override
  function injectPacket(packet) {
    if (!_validatePacket(packet)) {
      console.warn('[AISIngestBridge] injectPacket: invalid packet', packet);
      return false;
    }
    // Normalize trueHeading if unavailable
    if (!packet.telemetry.trueHeading || packet.telemetry.trueHeading > 360) {
      packet.telemetry.trueHeading = packet.telemetry.courseOverGround;
    }
    _emitToRuntime(packet);
    return true;
  }

  // Inject a batch of seed vessels (for NYC harbor demo data, test scenarios)
  function injectSeedVessels(vessels) {
    if (!Array.isArray(vessels)) return;
    var now = Date.now();
    vessels.forEach(function (v) {
      var packet = {
        mmsi:       v.mmsi,
        vesselName: v.vesselName || '',
        callsign:   v.callsign   || '',
        state:      v.state      || 'STATUS_UNDERWAY',
        telemetry: {
          lat:              v.lat,
          lng:              v.lng,
          speedKnots:       v.speedKnots       || 0,
          courseOverGround: v.courseOverGround || 0,
          trueHeading:      v.trueHeading      || v.courseOverGround || 0,
        },
        dimensions: {
          lengthMeters: v.lengthMeters || 0,
          widthMeters:  v.widthMeters  || 0,
        },
        timestampMs: now,
      };
      injectPacket(packet);
    });
  }

  SBE.AISIngestBridge = {
    connect,
    disconnect,
    isConnected,
    injectPacket,
    injectSeedVessels,
    registerNormalizationProfile,
    mapAISStatus: _mapAISStatus,

    // Internal access for introspection / debug
    _profiles: function () { return _profiles; },
    _config:   function () { return _config; },
  };

})(window);
