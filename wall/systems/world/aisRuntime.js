// ── AISRuntime v1.6.1 ──────────────────────────────────────────────────────
// 0520Q_WOS_AISRuntime_v1.6.1
// Surgical contract-extension patch on v1.5.1.
// Additions: canonical continuity scalar contract, heading freeze doctrine,
//            state-differentiated dormant thresholds, protected forced-coast
//            extension (120s), AIS code 6→RESTRICTED, connectFeed() expansion.
// Owns: deterministic vessel state, lifecycle management, fixed-step simulation,
//       continuity resolution, continuity scalar derivation, atmospheric output.
// Does NOT own: feed connection, AIS translation, or environmental physics.
// ──────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  // ── Vessel state constants ────────────────────────────────────────────────
  var STATE_UNDERWAY     = 'STATUS_UNDERWAY';
  var STATE_ANCHORED     = 'STATUS_ANCHORED';
  var STATE_MOORED       = 'STATUS_MOORED';
  var STATE_RESTRICTED   = 'STATUS_RESTRICTED';
  var STATE_EMERGENCY    = 'STATUS_EMERGENCY';
  var STATE_STALE        = 'STATUS_STALE';
  var STATE_OFFLINE      = 'STATUS_OFFLINE';
  var STATE_DORMANT      = 'STATUS_DORMANT';
  var STATE_FORCED_COAST = 'STATUS_FORCED_COAST';

  // ── Feed state constants ──────────────────────────────────────────────────
  var FEED_LIVE     = 'FEED_LIVE';
  var FEED_DEGRADED = 'FEED_DEGRADED';
  var FEED_OFFLINE  = 'FEED_OFFLINE';

  // ── Lifecycle thresholds ──────────────────────────────────────────────────
  var STABILIZATION_WINDOW_MS       = 10000;
  var REPROJECTION_BLEND_MS         = 7000;    // exposed for renderer
  var FORCED_COAST_DURATION_MS      = 30000;   // standard (non-protected)
  var FORCED_COAST_PROTECTED_MS     = 120000;  // §14 v1.6.1: protected near-camera
  var DEFAULT_ANCHOR_RADIUS_M       = 120;
  var STALE_THRESHOLD_MS            = 300000;  // 5 min → STALE
  var OFFLINE_THRESHOLD_MS          = 900000;  // 15 min → OFFLINE
  // §13 v1.6.1: state-differentiated dormant thresholds
  var DORMANT_UNDERWAY_MS           = 600000;  // 10 min for underway vessels
  var DORMANT_MOORED_MS             = 7200000; // 2 hours for moored vessels
  var DORMANT_PROTECTED_MS          = 86400000;// 24 hours for protected vessels
  // Heading freeze (§10 v1.6.1)
  var HEADING_FREEZE_SPEED_KTS      = 1.0;
  // Continuity scalar half-lives (§3 v1.6.1)
  var CONTINUITY_FRESHNESS_HALF_LIFE= 120;     // seconds — signalConfidence freshness
  var CONTINUITY_ALPHA_HALF_LIFE    = 180;     // seconds — visual persistence
  var CONTINUITY_DR_HALF_LIFE       = 60;      // seconds — dead-reckoning confidence

  // ── Dormant bucket limits ─────────────────────────────────────────────────
  var MAX_DORMANT_VESSELS        = 200;
  var PROTECTED_DORMANT_TTL_MS   = 86400000; // 24 hours

  // ── Feed degradation timers ───────────────────────────────────────────────
  var FEED_DEGRADED_THRESHOLD_MS = 120000;  // 2 min
  var FEED_OFFLINE_THRESHOLD_MS  = 600000;  // 10 min
  var FEED_RECOVERY_PACKETS      = 3;
  var FEED_RECOVERY_WINDOW_MS    = 30000;

  // ── Camera protection ─────────────────────────────────────────────────────
  var CAMERA_PROTECTION_FRACTION = 0.20;

  // ── Schmidt trigger ───────────────────────────────────────────────────────
  var SCHMIDT_DEPART_SPEED_KTS   = 0.8;
  var SCHMIDT_DEPART_CONSECUTIVE = 4;
  var SCHMIDT_RELOCK_SPEED_KTS   = 0.2;
  var SCHMIDT_RELOCK_DURATION_MS = 60000;

  // ── 0522Q: Constitutional Precision Freeze ───────────────────────────────
  // These values are constitutionally frozen. Changes require amendment-level
  // governance review. Do NOT derive, alias, or locally override them.

  var FIXED_TIMESTEP_MS              = 50;       // canonical tick size (ms) — frozen
  var FIXED_TIMESTEP_SEC             = 0.05;     // canonical tick size (s) — frozen
  var DORMANT_CONFIDENCE_THRESHOLD   = 0.1;      // frozen — dormant exit floor
  var MIN_TIER_DWELL_MS              = 5000;     // frozen — minimum dwell before tier change
  var FAULT_ROSTER_SIZE              = 50;       // frozen — ring buffer max entries
  var TELEMETRY_FLUSH_MS             = 1000;     // frozen — 1Hz telemetry cadence

  // Tick tier rates (Hz) — frozen
  var TICK_TIER_ACTIVE_HZ   = 20;    // ACTIVE:  20Hz — every tick (50ms)
  var TICK_TIER_REDUCED_HZ  = 5;     // REDUCED:  5Hz — every 4 ticks (200ms)
  var TICK_TIER_DORMANT_HZ  = 0.1;   // DORMANT:  0.1Hz — every 200 ticks (10s)

  // Derived skip intervals (ticks) — frozen from rates above
  var TIER_SKIP_ACTIVE  = 1;                                     //   1 tick
  var TIER_SKIP_REDUCED = Math.round(TICK_TIER_ACTIVE_HZ / TICK_TIER_REDUCED_HZ);  //   4 ticks
  var TIER_SKIP_DORMANT = Math.round(TICK_TIER_ACTIVE_HZ / TICK_TIER_DORMANT_HZ);  // 200 ticks

  // AIS packet validation bounds — frozen
  var AIS_MAX_VALID_SPEED_KTS   = 60;
  var AIS_MAX_VALID_HEADING_DEG = 360;
  var AIS_MAX_PACKET_AGE_MS     = 300000;

  // AIS rejection escalation thresholds — frozen
  var AIS_REJECT_AGE_THRESHOLD  = 3;    // consecutive rejections → double effective age
  var AIS_REJECT_DORM_THRESHOLD = 10;   // consecutive rejections → force dormant

  // Fault type identifiers — frozen
  var FAULT_MARITIME_RENDER_DIVERGENCE = 'MARITIME_RENDER_DIVERGENCE_FAULT';
  var FAULT_RECONCILIATION_OSCILLATION = 'RECONCILIATION_OSCILLATION_FAULT';
  var FAULT_INVALID_AIS_PACKET         = 'INVALID_AIS_PACKET_FAULT';
  var FAULT_VARIABLE_TICK_DETERMINISM  = 'VARIABLE_TICK_DETERMINISM_FAULT';
  var FAULT_DORMANT_LEAK               = 'DORMANT_LEAK_FAULT';
  var FAULT_MARITIME_BACKPRESSURE      = 'MARITIME_RUNTIME_BACKPRESSURE';

  // Runtime mode — PRODUCTION may optimize scheduling; it may NOT mutate continuity math
  var _runtimeMode = 'PRODUCTION'; // 'DETERMINISTIC' | 'PRODUCTION'

  // ── Runtime state ─────────────────────────────────────────────────────────
  var _activeBucket          = {};  // mmsi → vessel
  var _dormantBucket         = [];  // LRU array {vessel, dormantSinceMs}
  var _protectedDormantBucket= {};  // mmsi → {vessel, dormantSinceMs}
  var _persistentRegistry    = {};  // mmsi → metadata override

  var _feedState       = FEED_OFFLINE;
  var _lastPacketMs    = 0;
  var _recoveryPackets = [];        // timestamps for DEGRADED→LIVE recovery

  var _viewportDiagonal = 0;
  var _cameraCenter     = { x: 0, y: 0 };

  // ── Accumulator clock — replaces single-fire setInterval ──────────────────
  // Clock source: performance.now() ONLY. Date.now() and rAF timestamps are
  // constitutionally forbidden as timing inputs (0522Q §Clock Source Freeze).
  var _accumulatorMs    = 0;
  var _lastClockMs      = 0;
  var _tickCount        = 0;
  var _pollTimer        = null;     // drives _drainAccumulator at ~10ms poll

  // ── AIS flood suppression — latest-packet-per-MMSI-per-tick ───────────────
  // Packets arriving during a tick window compete; only the latest survives.
  // Earlier packets are discarded and do not enter reconciliation (0522Q §AIS Flood).
  var _pendingPackets   = {};       // mmsi → latest packet (overwritten on flood)

  // ── Per-vessel validation rejection tracking ──────────────────────────────
  var _rejectionCount   = {};       // mmsi → consecutive invalid packet count

  // ── Per-vessel tick tier metadata ─────────────────────────────────────────
  // Stored separately from vessel objects to avoid polluting AIS truth.
  // tickTier: 'ACTIVE' | 'REDUCED' | 'DORMANT'
  // tierDwellMs: timestamp when tier was entered (for MIN_TIER_DWELL_MS enforcement)
  // ticksSinceLast: ticks since vessel was last processed (for skip logic)
  var _vesselTickMeta   = {};       // mmsi → { tier, tierDwellMs, ticksSinceLast }

  // ── Fault system ──────────────────────────────────────────────────────────
  // Ring buffer — max FAULT_ROSTER_SIZE entries. Silent faults are forbidden.
  // Fault telemetry emits immediately; aggregate telemetry flushes at 1Hz.
  var _faultRoster      = [];       // ring buffer [{mmsi, faultType, timestampMs, lifecycleState}]

  // ── Telemetry aggregate ───────────────────────────────────────────────────
  // Flushed once per second — NOT on every tick.
  var _telemetryLastMs  = 0;
  var _telemetryAgg     = { ticks: 0, ingested: 0, rejected: 0, faultsTotal: 0 };

  var _initialized      = false;

  // ── Geo utilities ─────────────────────────────────────────────────────────

  function _distanceMeters(lat1, lng1, lat2, lng2) {
    var R    = 6371000;
    var dLat = (lat2 - lat1) * Math.PI / 180;
    var dLng = (lng2 - lng1) * Math.PI / 180;
    var a    = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
               Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function _bearingDeg(lat1, lng1, lat2, lng2) {
    var dLng  = (lng2 - lng1) * Math.PI / 180;
    var lat1R = lat1 * Math.PI / 180;
    var lat2R = lat2 * Math.PI / 180;
    var y     = Math.sin(dLng) * Math.cos(lat2R);
    var x     = Math.cos(lat1R) * Math.sin(lat2R) -
                Math.sin(lat1R) * Math.cos(lat2R) * Math.cos(dLng);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  }

  function _offsetPosition(lat, lng, bearingDeg, distanceMeters) {
    var R          = 6371000;
    var brg        = bearingDeg * Math.PI / 180;
    var latR       = lat * Math.PI / 180;
    var dR         = distanceMeters / R;
    var newLatR    = Math.asin(Math.sin(latR) * Math.cos(dR) +
                               Math.cos(latR) * Math.sin(dR) * Math.cos(brg));
    var newLngR    = (lng * Math.PI / 180) +
                    Math.atan2(Math.sin(brg) * Math.sin(dR) * Math.cos(latR),
                               Math.cos(dR) - Math.sin(latR) * Math.sin(newLatR));
    return { lat: newLatR * 180 / Math.PI, lng: newLngR * 180 / Math.PI };
  }

  // ── Fault emission ────────────────────────────────────────────────────────
  // Every fault must emit immediately. Silent faults are constitutionally forbidden.

  function _emitFault(mmsi, faultType, lifecycleState) {
    var entry = {
      mmsi:          mmsi,
      faultType:     faultType,
      timestampMs:   performance.now(),
      lifecycleState: lifecycleState || 'UNKNOWN',
    };
    _faultRoster.push(entry);
    if (_faultRoster.length > FAULT_ROSTER_SIZE) _faultRoster.shift();
    _telemetryAgg.faultsTotal++;
    console.warn('[AISRuntime FAULT] ' + faultType, {
      mmsi: mmsi,
      state: lifecycleState,
      ts: Math.round(entry.timestampMs),
    });
  }

  // ── Telemetry flush — constitutionally 1Hz ────────────────────────────────

  function _flushTelemetry(now) {
    if (now - _telemetryLastMs < TELEMETRY_FLUSH_MS) return;
    _telemetryLastMs = now;
    var snap = {
      ticks:       _telemetryAgg.ticks,
      ingested:    _telemetryAgg.ingested,
      rejected:    _telemetryAgg.rejected,
      faultsTotal: _telemetryAgg.faultsTotal,
      active:      Object.keys(_activeBucket).length,
      dormant:     _dormantBucket.length,
      feedState:   _feedState,
      tickCount:   _tickCount,
    };
    // Console output gated by flag — telemetry counters always reset regardless.
    // Enable: SBE.runtimeFlags.showAISTelemetryLogs = true
    var _flags = global.SBE && global.SBE.runtimeFlags;
    if (_flags && _flags.showAISTelemetryLogs) {
      console.log('[AISRuntime TELEMETRY]', snap);
    }
    _telemetryAgg.ticks    = 0;
    _telemetryAgg.ingested = 0;
    _telemetryAgg.rejected = 0;
    // faultsTotal is running total — do NOT reset
  }

  // ── AIS packet validation — frozen bounds (0522Q §AIS Validation Freeze) ──
  // Rejected packets do NOT update lastAIS timestamp, do NOT reset reconciliation,
  // do NOT alter lifecycle state.

  function _validatePacket(packet, now) {
    var tel  = packet.telemetry || {};
    var mmsi = String(packet.mmsi);
    var fail = null;

    if (typeof tel.speedKnots === 'number' && tel.speedKnots > AIS_MAX_VALID_SPEED_KTS) {
      fail = 'speed ' + tel.speedKnots.toFixed(1) + 'kts > ' + AIS_MAX_VALID_SPEED_KTS + 'kts';
    } else if (typeof tel.trueHeading === 'number' &&
               (tel.trueHeading < 0 || tel.trueHeading > AIS_MAX_VALID_HEADING_DEG)) {
      fail = 'heading ' + tel.trueHeading + '° out of range';
    } else if (packet.timestampMs && (now - packet.timestampMs) > AIS_MAX_PACKET_AGE_MS) {
      fail = 'packet age ' + Math.round(now - packet.timestampMs) + 'ms';
    }

    if (!fail) {
      _rejectionCount[mmsi] = 0;
      return true;
    }

    _rejectionCount[mmsi] = (_rejectionCount[mmsi] || 0) + 1;
    var count = _rejectionCount[mmsi];
    _telemetryAgg.rejected++;
    _emitFault(mmsi, FAULT_INVALID_AIS_PACKET,
      _activeBucket[mmsi] ? _activeBucket[mmsi].state : 'UNKNOWN');

    if (count >= AIS_REJECT_DORM_THRESHOLD) {
      // Force dormant — persistent bad actor
      var vessel = _activeBucket[mmsi];
      if (vessel) {
        _evictVessel(vessel, mmsi, now);
        console.warn('[AISRuntime] ' + mmsi + ' forced dormant after ' + count + ' consecutive rejections');
      }
    }
    // AIS_REJECT_AGE_THRESHOLD case: effective age doubles naturally because
    // lastUpdateMs is not updated (packet rejected before merge).

    return false;
  }

  // ── Tick tier resolution ──────────────────────────────────────────────────
  // Tier transitions are suppressed if MIN_TIER_DWELL_MS has not elapsed.
  // Tier may derive ONLY from lifecycle state — NOT from viewport or camera.

  function _resolveTickTier(vessel, mmsi, now) {
    var meta = _vesselTickMeta[mmsi];
    if (!meta) {
      meta = { tier: 'ACTIVE', tierDwellMs: now, ticksSinceLast: 0 };
      _vesselTickMeta[mmsi] = meta;
    }

    var desired;
    if (vessel.state === STATE_UNDERWAY || vessel.state === STATE_EMERGENCY) {
      desired = 'ACTIVE';
    } else if (vessel.state === STATE_OFFLINE || vessel.state === STATE_DORMANT) {
      desired = 'DORMANT';
    } else {
      // MOORED, ANCHORED, RESTRICTED, STALE, FORCED_COAST
      desired = 'REDUCED';
    }

    // Enforce dwell — suppress premature transitions
    if (desired !== meta.tier && (now - meta.tierDwellMs) >= MIN_TIER_DWELL_MS) {
      meta.tier        = desired;
      meta.tierDwellMs = now;
      // ticksSinceLast preserved — no reset on tier change
    }

    return meta;
  }

  // ── AIS status mapping ────────────────────────────────────────────────────
  // Canonical table per v1.6.1 §15. Unknown codes → STALE (not UNDERWAY).
  // v1.6.1 correction: code 6 (aground) → RESTRICTED (was STALE in v1.5.1).

  var AIS_STATUS_MAP = {
    0:  STATE_UNDERWAY,   // Under way using engine
    1:  STATE_ANCHORED,   // At anchor
    2:  STATE_RESTRICTED, // Not under command
    3:  STATE_RESTRICTED, // Restricted maneuverability
    4:  STATE_RESTRICTED, // Constrained by draught
    5:  STATE_MOORED,     // Moored
    6:  STATE_RESTRICTED, // Aground — v1.6.1: RESTRICTED (not STALE)
    7:  STATE_RESTRICTED, // Engaged in fishing
    8:  STATE_UNDERWAY,   // Under way sailing
    9:  STATE_RESTRICTED, // Reserved / HSC
    10: STATE_RESTRICTED, // Reserved / WIG
    11: STATE_RESTRICTED,
    12: STATE_RESTRICTED,
    13: STATE_RESTRICTED,
    14: STATE_EMERGENCY,  // AIS-SART / MOB-AIS / EPIRB-AIS
    15: STATE_STALE,      // Undefined
  };

  function _mapAISStatus(code) {
    if (typeof code !== 'number') return STATE_STALE;
    var mapped = AIS_STATUS_MAP[code];
    return mapped !== undefined ? mapped : STATE_STALE; // unknown → STALE
  }

  // ── Label validation ──────────────────────────────────────────────────────

  var _DIRTY_LABELS = { 'UNKNOWN': 1, 'N/A': 1, '???': 1, '': 1, 'NONE': 1 };

  function _isCleanLabel(s) {
    if (!s || typeof s !== 'string') return false;
    return !_DIRTY_LABELS[s.toUpperCase().trim()] && s.trim().length > 0;
  }

  // ── Anchor radius resolution ──────────────────────────────────────────────
  // Lightweight continuity constraint — NOT a live physics simulation (§7).

  function _resolveAnchorRadius(vessel) {
    if (vessel.lengthMeters > 200) return 200;
    if (vessel.lengthMeters > 100) return 150;
    return DEFAULT_ANCHOR_RADIUS_M;
  }

  // ── Importance / visibility weights ──────────────────────────────────────
  // Runtime-derived per §15. NOT feed-supplied fields.

  function _computeWeights(vessel) {
    var imp = 0.3;
    var vis = 0.5;

    if (vessel.isPersistent)               { imp += 0.4; vis += 0.3; }
    if (vessel.isProtected)                { imp += 0.2; vis += 0.1; }
    if (vessel.routeIdentity)              { imp += 0.2; }
    if (vessel.state === STATE_EMERGENCY)  { imp  = 1.0; vis = 1.0; }
    if (vessel.state === STATE_RESTRICTED) { imp += 0.1; }
    if (vessel.lengthMeters > 200)         { imp += 0.15; vis += 0.1; }
    else if (vessel.lengthMeters > 100)    { imp += 0.05; }

    vessel.importanceWeight = Math.min(1, imp);
    vessel.visibilityWeight = Math.min(1, vis);
  }

  // ── Continuity scalar derivation ─────────────────────────────────────────
  // §3 v1.6.1. AISRuntime is sole derivation authority. All formulas use
  // Math.exp(-t/halfLife) — no per-frame delta accumulation (§4 forbidden).
  // Evaluated at fixed 1Hz sim cadence (§5).

  function _computeContinuityScalars(vessel, now) {
    var c    = vessel.continuity;
    var ageS = (now - vessel.lastUpdateMs) / 1000; // seconds since last telemetry

    // ── signalConfidence ─────────────────────────────────────────────────────
    // freshnessWeight × cadenceWeight × validityWeight × reprojectionWeight
    var freshnessW    = Math.exp(-ageS / CONTINUITY_FRESHNESS_HALF_LIFE);
    var validityW     = (vessel.state === STATE_STALE || vessel.state === STATE_OFFLINE) ? 0.25 : 1.0;
    var reprojectionW = vessel.stabilizing ? 0.2 : 1.0;
    c.signalConfidence = Math.max(0, Math.min(1, freshnessW * validityW * reprojectionW));

    // ── continuityAlpha ──────────────────────────────────────────────────────
    // Visual persistence. Smooth exponential decay — survives brief packet loss.
    c.continuityAlpha = Math.exp(-ageS / CONTINUITY_ALPHA_HALF_LIFE);
    if (vessel.stabilizing) c.continuityAlpha *= 0.5;
    c.continuityAlpha = Math.max(0, Math.min(1, c.continuityAlpha));

    // ── deadReckoningWeight ──────────────────────────────────────────────────
    // Confidence in extrapolated motion. Decays from last DR anchor.
    var drAgeS = (now - vessel.drLastMs) / 1000;
    c.deadReckoningWeight = Math.exp(-drAgeS / CONTINUITY_DR_HALF_LIFE);
    if (vessel.stabilizing)          c.deadReckoningWeight *= 0.3;
    if (vessel.state !== STATE_UNDERWAY) c.deadReckoningWeight *= 0.5;
    c.deadReckoningWeight = Math.max(0, Math.min(1, c.deadReckoningWeight));

    // ── staleWeight ──────────────────────────────────────────────────────────
    // Telemetry uncertainty accumulation — inverse of signalConfidence.
    c.staleWeight = 1 - c.signalConfidence;

    // ── coastAlpha ───────────────────────────────────────────────────────────
    // Forced-coast cinematic persistence visibility.
    if (vessel.state === STATE_FORCED_COAST && vessel.forcedCoastEndMs > 0) {
      var coastDur  = vessel.isProtected ? FORCED_COAST_PROTECTED_MS : FORCED_COAST_DURATION_MS;
      var coastRem  = Math.max(0, vessel.forcedCoastEndMs - now);
      c.coastAlpha  = Math.min(1, coastRem / coastDur);
    } else {
      c.coastAlpha  = 0;
    }

    // ── interpolationWeight ──────────────────────────────────────────────────
    // Renderer smoothing permissibility. NOT whether interpolation occurs —
    // interpolation is mandatory (§18). Controls aggressiveness only.
    c.interpolationWeight = c.signalConfidence;
    if (vessel.stabilizing) c.interpolationWeight = Math.min(c.interpolationWeight, 0.2);
    // Underway vessels always permit minimum smoothing
    if (vessel.state === STATE_UNDERWAY) c.interpolationWeight = Math.max(0.3, c.interpolationWeight);
    c.interpolationWeight = Math.max(0, Math.min(1, c.interpolationWeight));
  }

  // ── Persistent metadata application ──────────────────────────────────────

  function _applyPersistentMetadata(vessel) {
    var meta = _persistentRegistry[vessel.mmsi];
    if (!meta) return;
    vessel.isPersistent = true;
    if (meta.vesselName)       vessel.vesselName       = meta.vesselName;
    if (meta.callsign)         vessel.callsign         = meta.callsign;
    if (meta.operator)         vessel.operator         = meta.operator;
    if (meta.routeIdentity)    vessel.routeIdentity    = meta.routeIdentity;
    if (meta.appearanceProfile)vessel.appearanceProfile= meta.appearanceProfile;
    if (meta.homeHarborZone)   vessel.homeHarborZone   = meta.homeHarborZone;
  }

  // ── Vessel construction ───────────────────────────────────────────────────

  function _makeVessel(mmsi, packet) {
    var now = performance.now();
    var tel = packet.telemetry || {};
    var dim = packet.dimensions || {};
    var state = packet.state || STATE_STALE;

    var vessel = {
      mmsi:             mmsi,
      vesselName:       packet.vesselName || '',
      callsign:         packet.callsign   || '',
      operator:         '',
      routeIdentity:    null,
      appearanceProfile:null,
      homeHarborZone:   null,
      notes:            null,

      state:            state,
      previousState:    null,

      lat:              tel.lat || 0,
      lng:              tel.lng || 0,
      speedKnots:       tel.speedKnots       || 0,
      courseOverGround: tel.courseOverGround || 0,
      trueHeading:      tel.trueHeading      || tel.courseOverGround || 0,

      lengthMeters:     dim.lengthMeters || 0,
      widthMeters:      dim.widthMeters  || 0,

      lastUpdateMs:     packet.timestampMs || now,
      spawnMs:          now,

      isProtected:      false,
      isPersistent:     false,

      mooringReference:   null,
      anchoringReference: null,
      anchorRadiusMeters: DEFAULT_ANCHOR_RADIUS_M,

      // Schmidt trigger
      schmidtDepartCount: 0,
      schmidtRelockMs:    0,

      // Stabilization
      stabilizing:               false,
      stabilizationEndMs:        0,
      stabilizationPacketCount:  0,

      // Forced Coast
      forcedCoastEndMs: 0,

      // Reprojection blend
      blendFromLat: null,
      blendFromLng: null,
      blendEndMs:   0,

      // Runtime-derived weights (legacy — retained for ingest path)
      importanceWeight: 0.5,
      visibilityWeight: 0.5,

      // Heading freeze (§10 v1.6.1)
      headingFrozen: false,

      // Dead reckoning
      drLat:   tel.lat || 0,
      drLng:   tel.lng || 0,
      drLastMs:now,

      // ── 0522Q: Dormant position anchor — for DORMANT_LEAK_FAULT detection ───
      // Captured at last processed tick; compared next tick for unexpected drift.
      dormantAnchorLat: tel.lat || 0,
      dormantAnchorLng: tel.lng || 0,

      // ── Canonical continuity contract (v1.6.1 §2) ──────────────────────────
      // AISRuntime is sole derivation authority. Renderers consume read-only.
      continuity: {
        signalConfidence:    1.0, // telemetry validity confidence (0→1)
        continuityAlpha:     1.0, // visual persistence strength (0→1)
        deadReckoningWeight: 1.0, // extrapolated motion confidence (0→1)
        staleWeight:         0.0, // telemetry uncertainty accumulation (0→1)
        coastAlpha:          0.0, // forced-coast cinematic fade (0→1)
        interpolationWeight: 1.0, // renderer smoothing permissibility (0→1)
      },
    };

    // Stationary reference capture
    if (state === STATE_MOORED) {
      vessel.mooringReference = { lat: vessel.lat, lng: vessel.lng };
    } else if (state === STATE_ANCHORED) {
      vessel.anchoringReference = { lat: vessel.lat, lng: vessel.lng };
      vessel.anchorRadiusMeters = _resolveAnchorRadius(vessel);
    }

    _applyPersistentMetadata(vessel);
    _computeWeights(vessel);
    return vessel;
  }

  // ── Camera protection ─────────────────────────────────────────────────────

  function _updateProtection(vessel) {
    if (_viewportDiagonal <= 0) return;
    var map = global.SBE && SBE.MapboxViewportRuntime;
    if (!map || !map.project) return;
    // Guard: coordinates MUST be finite before projection (§3 v1.6.1)
    if (!Number.isFinite(vessel.lng) || !Number.isFinite(vessel.lat)) return;
    // Mapbox project() requires LngLatLike: [lng, lat] array (NOT positional args)
    var pt = map.project([vessel.lng, vessel.lat]);
    if (!pt) return;
    var dx   = pt.x - _cameraCenter.x;
    var dy   = pt.y - _cameraCenter.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    vessel.isProtected = dist <= _viewportDiagonal * CAMERA_PROTECTION_FRACTION;
  }

  // ── Schmidt trigger ───────────────────────────────────────────────────────

  function _checkSchmidtDeparture(vessel, newSpeed, newLat, newLng) {
    if (newSpeed < SCHMIDT_DEPART_SPEED_KTS) {
      vessel.schmidtDepartCount = 0;
      return false;
    }
    var ref = vessel.state === STATE_MOORED
      ? vessel.mooringReference
      : vessel.anchoringReference;
    if (!ref) return false;
    var curDist = _distanceMeters(ref.lat, ref.lng, vessel.lat, vessel.lng);
    var newDist = _distanceMeters(ref.lat, ref.lng, newLat, newLng);
    if (newDist > curDist) {
      vessel.schmidtDepartCount++;
    } else {
      vessel.schmidtDepartCount = 0;
    }
    return vessel.schmidtDepartCount >= SCHMIDT_DEPART_CONSECUTIVE;
  }

  function _checkSchmidtRelock(vessel, newSpeed, now) {
    if (newSpeed < SCHMIDT_RELOCK_SPEED_KTS) {
      if (vessel.schmidtRelockMs === 0) {
        vessel.schmidtRelockMs = now;
      } else if (now - vessel.schmidtRelockMs >= SCHMIDT_RELOCK_DURATION_MS) {
        vessel.schmidtRelockMs = 0;
        return true;
      }
    } else {
      vessel.schmidtRelockMs = 0;
    }
    return false;
  }

  // ── State transitions ─────────────────────────────────────────────────────
  // Valid matrix per §11.

  function _transitionVessel(vessel, newState, freshAISExplicit, now) {
    if (vessel.state === newState) return;

    var fromStationary = vessel.state === STATE_MOORED || vessel.state === STATE_ANCHORED;
    var toStationary   = newState    === STATE_MOORED  || newState    === STATE_ANCHORED;

    // Direct stationary↔stationary without fresh AIS: disallowed
    if (fromStationary && toStationary && !freshAISExplicit) return;

    vessel.previousState = vessel.state;
    vessel.state         = newState;

    if (newState === STATE_MOORED) {
      vessel.mooringReference   = { lat: vessel.lat, lng: vessel.lng };
      vessel.schmidtDepartCount = 0;
    } else if (newState === STATE_ANCHORED) {
      vessel.anchoringReference = { lat: vessel.lat, lng: vessel.lng };
      vessel.anchorRadiusMeters = _resolveAnchorRadius(vessel);
      vessel.schmidtDepartCount = 0;
    } else if (newState === STATE_UNDERWAY) {
      // §10 v1.6.1: heading MAY resume immediately after departure gate completion
      vessel.headingFrozen = false;
    }

    _computeWeights(vessel);
  }

  // ── Packet merge ──────────────────────────────────────────────────────────

  function _isValidInWaterPacket(packet) {
    var tel = packet.telemetry || {};
    return (
      typeof tel.lat === 'number' && typeof tel.lng === 'number' &&
      tel.lat > -90 && tel.lat < 90 &&
      tel.lng > -180 && tel.lng < 180
    );
  }

  function _mergePacketIntoVessel(vessel, packet, now) {
    var tel      = packet.telemetry || {};
    var newLat   = tel.lat   !== undefined ? tel.lat   : vessel.lat;
    var newLng   = tel.lng   !== undefined ? tel.lng   : vessel.lng;
    var newSpeed = tel.speedKnots        !== undefined ? tel.speedKnots        : vessel.speedKnots;
    var newCOG   = tel.courseOverGround  !== undefined ? tel.courseOverGround  : vessel.courseOverGround;
    var newHdg   = tel.trueHeading       !== undefined ? tel.trueHeading       : newCOG;
    var newState = packet.state || STATE_STALE;
    var dim      = packet.dimensions || {};

    // ── Stabilization window: freeze visible motion ─────────────────────────
    if (vessel.stabilizing && now < vessel.stabilizationEndMs) {
      if (_isValidInWaterPacket(packet)) {
        vessel.stabilizationPacketCount++;
        if (vessel.stabilizationPacketCount >= 2) {
          // 2 consecutive valid in-water packets → end early
          vessel.stabilizing               = false;
          vessel.stabilizationPacketCount  = 0;
          vessel.state = newState;
        }
      }
      vessel.lastUpdateMs = packet.timestampMs || now;
      return; // position locked, internal metadata only
    }

    // ── Metadata merge (per §21 rehydration merge table) ───────────────────
    if (!vessel.isPersistent) {
      if (_isCleanLabel(packet.vesselName)) vessel.vesselName = packet.vesselName;
      if (_isCleanLabel(packet.callsign))   vessel.callsign   = packet.callsign;
    }
    if (dim.lengthMeters > 0) vessel.lengthMeters = dim.lengthMeters;
    if (dim.widthMeters  > 0) vessel.widthMeters  = dim.widthMeters;

    vessel.lastUpdateMs = packet.timestampMs || now;

    // ── Stationary vessel: Schmidt departure check ──────────────────────────
    var isStationary = vessel.state === STATE_MOORED || vessel.state === STATE_ANCHORED;

    if (isStationary) {
      var departs = _checkSchmidtDeparture(vessel, newSpeed, newLat, newLng);
      if (departs) {
        _transitionVessel(vessel, STATE_UNDERWAY, false, now);
        // Fall through to position update
      } else {
        // Lock to reference position
        var ref = vessel.state === STATE_MOORED
          ? vessel.mooringReference
          : vessel.anchoringReference;
        if (ref) { vessel.lat = ref.lat; vessel.lng = ref.lng; }
        vessel.speedKnots = newSpeed;
        return;
      }
    } else if (vessel.state === STATE_UNDERWAY) {
      // Schmidt re-lock check
      var relocks = _checkSchmidtRelock(vessel, newSpeed, now);
      if (relocks) {
        var targetState = (newState === STATE_MOORED || newState === STATE_ANCHORED)
          ? newState
          : STATE_MOORED;
        _transitionVessel(vessel, targetState, true, now);
        // Set final position then freeze
        vessel.lat = newLat; vessel.lng = newLng;
        vessel.speedKnots = newSpeed;
        return;
      }
    }

    // ── Anchor radius enforcement ───────────────────────────────────────────
    if (vessel.state === STATE_ANCHORED && vessel.anchoringReference) {
      var anchorDist = _distanceMeters(
        vessel.anchoringReference.lat, vessel.anchoringReference.lng,
        newLat, newLng
      );
      if (anchorDist > vessel.anchorRadiusMeters) {
        var brg   = _bearingDeg(
          vessel.anchoringReference.lat, vessel.anchoringReference.lng,
          newLat, newLng
        );
        var clamp = _offsetPosition(
          vessel.anchoringReference.lat, vessel.anchoringReference.lng,
          brg, vessel.anchorRadiusMeters
        );
        newLat = clamp.lat;
        newLng = clamp.lng;
      }
    }

    // ── Heading freeze (§10 v1.6.1) ────────────────────────────────────────
    // Applies ONLY to already-UNDERWAY vessels decelerating below 1.0 kts.
    // MUST NOT block moored/anchored departure (cleared in _transitionVessel).
    if (vessel.state === STATE_UNDERWAY) {
      if (newSpeed < HEADING_FREEZE_SPEED_KTS) {
        vessel.headingFrozen = true;   // suppress bow jitter at low speed
      } else {
        vessel.headingFrozen = false;  // speed above threshold: reactivate
      }
    }

    // ── Apply position ──────────────────────────────────────────────────────
    vessel.lat              = newLat;
    vessel.lng              = newLng;
    vessel.speedKnots       = newSpeed;
    vessel.courseOverGround = newCOG;
    // Heading: respect freeze state for UNDERWAY deceleration
    if (!vessel.headingFrozen) {
      vessel.trueHeading    = newHdg;
    }

    // Dead-reckoning anchor
    vessel.drLat    = newLat;
    vessel.drLng    = newLng;
    vessel.drLastMs = now;
  }

  // ── Flood suppression queue ───────────────────────────────────────────────
  // Incoming packets are staged here; only the latest per MMSI per tick is kept.
  // Flushed at the start of each fixed-step continuityTick().
  // Direct path used only by the debug vessel (which bypasses flood suppression
  // because it generates exactly one packet per tick interval by design).

  function _queuePacket(packet) {
    if (!packet.mmsi) return;
    _pendingPackets[packet.mmsi] = packet; // latest wins — earlier discarded
  }

  function _flushPendingPackets(now) {
    var mmsis = Object.keys(_pendingPackets);
    for (var i = 0; i < mmsis.length; i++) {
      var pkt = _pendingPackets[mmsis[i]];
      if (_validatePacket(pkt, now)) {
        _ingestValidatedPacket(pkt, now);
      }
      // rejected packets silently discarded — no downstream state mutation
    }
    _pendingPackets = {};
  }

  // ── Ingest normalized packet ──────────────────────────────────────────────
  // Public entry point (via ingestPacket). Stages into flood suppression queue.
  // Internal direct path is _ingestValidatedPacket (used post-validation).

  function _ingestNormalizedPacket(packet) {
    _queuePacket(packet);
  }

  function _ingestValidatedPacket(packet, now) {
    var mmsi = packet.mmsi;
    if (!mmsi) return;

    _lastPacketMs = now;
    _updateFeedState(now, true);
    _telemetryAgg.ingested++;

    var vessel = _activeBucket[mmsi];

    if (!vessel) {
      vessel = _rehydrateFromDormant(mmsi, packet);
      if (!vessel) {
        vessel = _makeVessel(mmsi, packet);
        _activeBucket[mmsi] = vessel;
      }
    } else {
      _mergePacketIntoVessel(vessel, packet, now);
    }

    _updateProtection(vessel);
    _computeWeights(vessel);
  }

  // ── Dead reckoning ────────────────────────────────────────────────────────

  function _deadReckonVessel(vessel, now) {
    if (vessel.state !== STATE_UNDERWAY) return;
    if (vessel.speedKnots <= 0) return;

    var dtMs = now - vessel.drLastMs;
    if (dtMs <= 0 || dtMs > 120000) return; // skip if >2 min stale

    var mps           = vessel.speedKnots * 0.514444;
    var distM         = mps * (dtMs / 1000);
    var hdgRad        = vessel.trueHeading * Math.PI / 180;
    var dLat          = (distM * Math.cos(hdgRad)) / 111320;
    var dLng          = (distM * Math.sin(hdgRad)) /
                        (111320 * Math.cos(vessel.drLat * Math.PI / 180));

    vessel.drLat   += dLat;
    vessel.drLng   += dLng;
    vessel.drLastMs = now;
  }

  // ── Lifecycle management ──────────────────────────────────────────────────

  function _hasUsefulMetadata(vessel) {
    return !!(vessel.vesselName || vessel.callsign || vessel.routeIdentity);
  }

  function _enterForcedCoast(vessel, now) {
    vessel.state = STATE_FORCED_COAST;
    // §14 v1.6.1: protected vessels near active camera → up to 120s
    var duration = (vessel.isProtected) ? FORCED_COAST_PROTECTED_MS : FORCED_COAST_DURATION_MS;
    vessel.forcedCoastEndMs = now + duration;
  }

  function _resolveForceCoast(vessel, mmsi, now) {
    if (vessel.isPersistent) {
      _protectedDormantBucket[mmsi] = {
        vessel:         Object.assign({}, vessel),
        dormantSinceMs: now,
      };
    } else if (_hasUsefulMetadata(vessel)) {
      _pushDormant({ vessel: Object.assign({}, vessel), dormantSinceMs: now });
    }
    // else: full eviction — low-value transient
    delete _activeBucket[mmsi];
  }

  function _evictVessel(vessel, mmsi, now) {
    if (_hasUsefulMetadata(vessel)) {
      _pushDormant({ vessel: Object.assign({}, vessel), dormantSinceMs: now });
    }
    delete _activeBucket[mmsi];
  }

  function _dormantThresholdFor(vessel) {
    // §13 v1.6.1: state-differentiated thresholds
    if (vessel.isProtected || vessel.isPersistent) return DORMANT_PROTECTED_MS;
    if (vessel.state === STATE_MOORED || vessel.state === STATE_ANCHORED) return DORMANT_MOORED_MS;
    return DORMANT_UNDERWAY_MS;
  }

  function _lifetimeTick(now) {
    var mmsis = Object.keys(_activeBucket);
    for (var i = 0; i < mmsis.length; i++) {
      var mmsi   = mmsis[i];
      var vessel = _activeBucket[mmsi];
      var age    = now - vessel.lastUpdateMs;

      // ── Tick tier gating ────────────────────────────────────────────────────
      // Resolve tier and enforce dwell. Skip processing if below tier rate.
      // Tier derives from lifecycle state only — not viewport or camera.
      var meta = _resolveTickTier(vessel, mmsi, now);
      meta.ticksSinceLast++;
      var skipInterval = meta.tier === 'DORMANT' ? TIER_SKIP_DORMANT
                       : meta.tier === 'REDUCED' ? TIER_SKIP_REDUCED
                       : TIER_SKIP_ACTIVE;
      if (meta.ticksSinceLast < skipInterval) continue;
      meta.ticksSinceLast = 0;

      // Forced Coast resolution check
      if (vessel.state === STATE_FORCED_COAST) {
        if (now >= vessel.forcedCoastEndMs) {
          _resolveForceCoast(vessel, mmsi, now);
        } else {
          _computeContinuityScalars(vessel, now); // coastAlpha evolves during coast
        }
        continue;
      }

      // Stabilization expiry
      if (vessel.stabilizing && now >= vessel.stabilizationEndMs) {
        vessel.stabilizing              = false;
        vessel.stabilizationPacketCount = 0;
      }

      // §13 v1.6.1: state-differentiated dormant threshold
      var dormantThreshold = _dormantThresholdFor(vessel);
      if (age >= dormantThreshold) {
        if (vessel.isProtected) {
          // Forced Coast is PROTECTED-only per §2 doctrine
          _enterForcedCoast(vessel, now);
        } else {
          _evictVessel(vessel, mmsi, now);
        }
        continue;
      }

      // Degradation state progression
      if (age >= OFFLINE_THRESHOLD_MS && vessel.state !== STATE_OFFLINE && vessel.state !== STATE_STALE) {
        vessel.state = STATE_OFFLINE;
      } else if (age >= STALE_THRESHOLD_MS && vessel.state === STATE_UNDERWAY) {
        vessel.state = STATE_STALE;
      }

      _updateProtection(vessel);
      _deadReckonVessel(vessel, now);
      // §5 v1.6.1: continuity scalars evaluated at fixed sim cadence
      _computeContinuityScalars(vessel, now);

      // ── DORMANT_LEAK_FAULT ────────────────────────────────────────────────
      // Dormant / REDUCED vessels must not drift. If DR anchor has moved > 1m
      // since last tick for a non-underway vessel, fault and reset.
      if (vessel.state !== STATE_UNDERWAY && vessel.state !== STATE_FORCED_COAST) {
        var anchorDelta = _distanceMeters(
          vessel.dormantAnchorLat, vessel.dormantAnchorLng,
          vessel.drLat, vessel.drLng
        );
        if (anchorDelta > 1) {
          _emitFault(mmsi, FAULT_DORMANT_LEAK, vessel.state);
          // Recovery: reset DR to anchor, clear velocity source
          vessel.drLat    = vessel.dormantAnchorLat;
          vessel.drLng    = vessel.dormantAnchorLng;
          vessel.drLastMs = now;
        }
      }
      // Advance dormant anchor to current position for next comparison
      vessel.dormantAnchorLat = vessel.drLat;
      vessel.dormantAnchorLng = vessel.drLng;

      // ── DORMANT_CONFIDENCE_THRESHOLD ─────────────────────────────────────
      // If signalConfidence drops below threshold for a non-protected vessel,
      // downgrade tick tier to DORMANT (dwell permitting).
      if (!vessel.isProtected && !vessel.isPersistent &&
          vessel.continuity.signalConfidence < DORMANT_CONFIDENCE_THRESHOLD) {
        if (meta.tier !== 'DORMANT' && (now - meta.tierDwellMs) >= MIN_TIER_DWELL_MS) {
          meta.tier        = 'DORMANT';
          meta.tierDwellMs = now;
        }
      }
    }

    // Protected dormant TTL pruning
    var pKeys = Object.keys(_protectedDormantBucket);
    for (var j = 0; j < pKeys.length; j++) {
      var rec = _protectedDormantBucket[pKeys[j]];
      if (now - rec.dormantSinceMs > PROTECTED_DORMANT_TTL_MS) {
        delete _protectedDormantBucket[pKeys[j]];
      }
    }
  }

  // ── Dormant bucket ────────────────────────────────────────────────────────

  function _pushDormant(record) {
    _dormantBucket.push(record);
    if (_dormantBucket.length > MAX_DORMANT_VESSELS) {
      _dormantBucket.shift(); // LRU
    }
  }

  function _rehydrateFromDormant(mmsi, packet) {
    var now = performance.now();

    // §20 lookup order: ACTIVE (already checked) → PROTECTED_DORMANT → DORMANT
    if (_protectedDormantBucket[mmsi]) {
      var protRec = _protectedDormantBucket[mmsi];
      delete _protectedDormantBucket[mmsi];
      var v = _rehydrateMerge(protRec.vessel, packet, now);
      _activeBucket[mmsi] = v;
      return v;
    }

    for (var i = _dormantBucket.length - 1; i >= 0; i--) {
      if (String(_dormantBucket[i].vessel.mmsi) === String(mmsi)) {
        var rec = _dormantBucket.splice(i, 1)[0];
        var rv  = _rehydrateMerge(rec.vessel, packet, now);
        _activeBucket[mmsi] = rv;
        return rv;
      }
    }

    return null;
  }

  function _rehydrateMerge(existing, packet, now) {
    // §21 Rehydration merge table
    var tel = packet.telemetry || {};
    var dim = packet.dimensions || {};

    // Fresh telemetry always wins for position/motion
    if (tel.lat   !== undefined) existing.lat              = tel.lat;
    if (tel.lng   !== undefined) existing.lng              = tel.lng;
    if (tel.speedKnots        !== undefined) existing.speedKnots       = tel.speedKnots;
    if (tel.courseOverGround  !== undefined) existing.courseOverGround = tel.courseOverGround;
    if (tel.trueHeading       !== undefined) existing.trueHeading      = tel.trueHeading;

    if (packet.state) existing.state = packet.state;
    existing.lastUpdateMs   = packet.timestampMs || now;
    existing.drLat          = existing.lat;
    existing.drLng          = existing.lng;
    existing.drLastMs       = now;
    existing.stabilizing    = false;
    existing.headingFrozen  = false;
    existing.schmidtDepartCount = 0;
    existing.schmidtRelockMs    = 0;
    // §12 v1.6.1: dormant continuity state wins for continuity memory.
    // Preserve continuity object from dormancy — it carries decay history.
    // _computeContinuityScalars will evolve from this base on next tick.
    if (!existing.continuity) {
      existing.continuity = {
        signalConfidence: 0.5, continuityAlpha: 0.5,
        deadReckoningWeight: 0.5, staleWeight: 0.5,
        coastAlpha: 0, interpolationWeight: 0.5,
      };
    }

    // Metadata: dormant/persistent cache wins unless feed value is clean
    // (persistent registry takes highest precedence)
    if (!existing.isPersistent) {
      if (_isCleanLabel(packet.vesselName)) existing.vesselName = packet.vesselName;
      if (_isCleanLabel(packet.callsign))   existing.callsign   = packet.callsign;
    }

    // Dimensions: fresh feed only if valid
    if (dim.lengthMeters > 0) existing.lengthMeters = dim.lengthMeters;
    if (dim.widthMeters  > 0) existing.widthMeters  = dim.widthMeters;

    // Re-apply persistent registry in case it was updated since dormancy
    _applyPersistentMetadata(existing);
    _computeWeights(existing);

    return existing;
  }

  // ── Feed state machine ────────────────────────────────────────────────────

  function _updateFeedState(now, freshPacket) {
    if (freshPacket) {
      if (_feedState === FEED_OFFLINE) {
        // §14: OFFLINE → DEGRADED on reconnect — cannot jump directly to LIVE
        _feedState       = FEED_DEGRADED;
        _recoveryPackets = [];
      }
      if (_feedState === FEED_DEGRADED) {
        _recoveryPackets.push(now);
        // Prune outside window
        _recoveryPackets = _recoveryPackets.filter(function (t) {
          return now - t <= FEED_RECOVERY_WINDOW_MS;
        });
        if (_recoveryPackets.length >= FEED_RECOVERY_PACKETS) {
          _feedState       = FEED_LIVE;
          _recoveryPackets = [];
        }
      }
      // FEED_LIVE: sustained by continued packets
      return;
    }

    // No fresh packet — check degradation timers
    if (_lastPacketMs === 0) return; // never received a packet
    var silence = now - _lastPacketMs;
    if (_feedState === FEED_LIVE && silence >= FEED_DEGRADED_THRESHOLD_MS) {
      _feedState = FEED_DEGRADED;
    } else if (_feedState === FEED_DEGRADED && silence >= FEED_OFFLINE_THRESHOLD_MS) {
      _feedState = FEED_OFFLINE;
    }
  }

  // ── Fixed-step accumulator loop ───────────────────────────────────────────
  // Clock source: performance.now() exclusively (0522Q §Clock Source Freeze).
  // Forbidden: Date.now(), rAF timestamps, wall clock, timezone-adjusted clocks.
  //
  // _pollTimer fires every ~10ms to drain the accumulator.
  // Each drain fires _continuityTick() for every completed FIXED_TIMESTEP_MS.
  // Partial milliseconds remain in _accumulatorMs for the next poll.
  //
  // In DETERMINISTIC_MODE, tick variance > 1ms emits VARIABLE_TICK_DETERMINISM_FAULT.

  function _continuityTick(now) {
    _tickCount++;
    _telemetryAgg.ticks++;

    // 1. Flush pending packets (flood suppression — latest per MMSI wins)
    _flushPendingPackets(now);

    // 2. Feed degradation check (no fresh packet this tick)
    _updateFeedState(now, false);

    // 3. Per-vessel lifecycle + continuity
    _lifetimeTick(now);

    // 4. Telemetry flush at constitutionally frozen 1Hz cadence
    _flushTelemetry(now);
  }

  function _drainAccumulator() {
    var now = performance.now();

    if (_lastClockMs === 0) {
      // First poll — initialize clock without advancing accumulator
      _lastClockMs = now;
      return;
    }

    var delta = now - _lastClockMs;
    _lastClockMs = now;

    // VARIABLE_TICK_DETERMINISM_FAULT: deterministic mode requires precise scheduling.
    // delta should track closely against the poll interval. If a tick fires more than
    // FIXED_TIMESTEP_MS late and deterministic mode is active, emit fault.
    // (Production mode: scheduling drift is expected and tolerated.)
    if (_runtimeMode === 'DETERMINISTIC' && _tickCount > 0 && delta > FIXED_TIMESTEP_MS + 1) {
      _emitFault('RUNTIME', FAULT_VARIABLE_TICK_DETERMINISM, 'RUNTIME');
      // Recovery: clear accumulator drift
      _accumulatorMs = 0;
    }

    _accumulatorMs += delta;

    while (_accumulatorMs >= FIXED_TIMESTEP_MS) {
      _continuityTick(now);
      _accumulatorMs -= FIXED_TIMESTEP_MS;
    }
  }

  // ── Debug vessel route ────────────────────────────────────────────────────
  // Upper Bay → Buttermilk Channel → East River route.
  // 12 waypoints; vessel loops continuously.

  var DEBUG_VESSEL_MMSI = 999000001;
  var DEBUG_VESSEL_ROUTE = [
    { lat: 40.7008, lng: -74.0085 }, // Harbor center — immediately visible at boot
    { lat: 40.6960, lng: -74.0200 }, // Upper Bay N / Governors Island corridor
    { lat: 40.6820, lng: -74.0500 }, // Upper Bay mid
    { lat: 40.6600, lng: -74.0550 }, // Upper Bay S
    { lat: 40.6420, lng: -74.0500 }, // Outer Upper Bay
    { lat: 40.6270, lng: -74.0430 }, // Gravesend Bay approach
    { lat: 40.6600, lng: -74.0550 }, // Upper Bay S
    { lat: 40.6820, lng: -74.0500 }, // Upper Bay mid
    { lat: 40.6960, lng: -74.0350 }, // Upper Bay N / Governors Island S
    { lat: 40.6930, lng: -74.0170 }, // Buttermilk Channel S
    { lat: 40.6970, lng: -74.0020 }, // Buttermilk Channel N
    { lat: 40.7010, lng: -73.9960 }, // East River entrance
    { lat: 40.7080, lng: -73.9870 }, // East River S Manhattan
    { lat: 40.7150, lng: -73.9800 }, // East River mid
    { lat: 40.7220, lng: -73.9760 }, // East River N
    { lat: 40.7290, lng: -73.9730 }, // East River upper
  ];
  var _debugVesselActive   = false;
  var _debugVesselTimer    = null;
  var _debugVesselWpIdx    = 0;
  var _debugVesselProgress = 0; // 0..1 along current segment

  function _debugVesselTick() {
    if (!_debugVesselActive) return;
    var now  = performance.now();
    var wp   = DEBUG_VESSEL_ROUTE;
    var nWp  = wp.length;
    var curr = wp[_debugVesselWpIdx];
    var next = wp[(_debugVesselWpIdx + 1) % nWp];
    var segDistM  = _distanceMeters(curr.lat, curr.lng, next.lat, next.lng);
    var speedMs   = (10 * 1852) / 3600; // 10 knots → m/s
    var stepM     = speedMs * 5;        // advance per 5s tick
    _debugVesselProgress += stepM / Math.max(1, segDistM);
    if (_debugVesselProgress >= 1) {
      _debugVesselProgress -= 1;
      _debugVesselWpIdx    = (_debugVesselWpIdx + 1) % nWp;
      curr = wp[_debugVesselWpIdx];
      next = wp[(_debugVesselWpIdx + 1) % nWp];
    }
    var t    = _debugVesselProgress;
    var lat  = curr.lat + (next.lat - curr.lat) * t;
    var lng  = curr.lng + (next.lng - curr.lng) * t;
    var hdg  = _bearingDeg(curr.lat, curr.lng, next.lat, next.lng);
    // Patch A (0522F): impossible-to-miss vessel — 220m container ship at harbor center
    var pkt  = {
      mmsi:        DEBUG_VESSEL_MMSI,
      vesselName:  'WOS-DEBUG-01',
      callsign:    'DEBUG',
      state:        STATE_UNDERWAY,
      timestampMs:  now,
      telemetry: {
        lat:             lat,
        lng:             lng,
        speedKnots:      12,
        courseOverGround:hdg,
        trueHeading:     hdg,
      },
      dimensions: {
        lengthMeters: 80,  // realistic harbor vessel (ferry/tug scale)
        widthMeters:  18,
      },
    };
    // Debug vessel bypasses flood suppression — it generates exactly one packet per
    // interval and is trusted by construction (validated synthetically).
    var now = performance.now();
    _ingestValidatedPacket(pkt, now);
    // Force full visibility — NO fading, NO stale, NO interpolation suppression.
    // coastAlpha = 1 so forced-coast path also draws at full strength.
    var v = _activeBucket[DEBUG_VESSEL_MMSI];
    if (v) {
      v.continuity.signalConfidence    = 1.0;
      v.continuity.continuityAlpha     = 1.0;
      v.continuity.deadReckoningWeight = 1.0;
      v.continuity.interpolationWeight = 0.0; // snap to truth, no interpolation lag
      v.continuity.staleWeight         = 0.0;
      v.continuity.coastAlpha          = 1.0;
      v.isProtected                    = true;
      v.isPersistent                   = true;
    }
  }

  function injectDebugVessel(enable) {
    var on = (enable !== false);
    if (on && !_debugVesselActive) {
      _debugVesselActive   = true;
      _debugVesselWpIdx    = 0;
      _debugVesselProgress = 0;
      _debugVesselTick();
      _debugVesselTimer = setInterval(_debugVesselTick, 5000);
      console.log('[AISRuntime] debug vessel injected — MMSI', DEBUG_VESSEL_MMSI);
    } else if (!on && _debugVesselActive) {
      _debugVesselActive = false;
      clearInterval(_debugVesselTimer);
      _debugVesselTimer = null;
      delete _activeBucket[DEBUG_VESSEL_MMSI];
      console.log('[AISRuntime] debug vessel removed');
    }
    return _debugVesselActive;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init() {
    if (_initialized) return;
    _initialized     = true;
    _lastPacketMs    = 0;
    _feedState       = FEED_OFFLINE;
    _lastClockMs     = 0;
    _accumulatorMs   = 0;
    _tickCount       = 0;
    _telemetryLastMs = 0;
    // Poll every 10ms — accumulator drains in 50ms steps (FIXED_TIMESTEP_MS).
    // At 10ms poll rate we get ≤10ms scheduling jitter per tick, well within tolerance.
    _pollTimer       = setInterval(_drainAccumulator, 10);
    console.log('[AISRuntime v1.7.0] initialized — 0522Q constitutional precision freeze');
    console.log('  fixedTimestepMs:', FIXED_TIMESTEP_MS, '  runtimeMode:', _runtimeMode);
  }

  function destroy() {
    if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; }
    _activeBucket           = {};
    _dormantBucket          = [];
    _protectedDormantBucket = {};
    _persistentRegistry     = {};
    _pendingPackets         = {};
    _rejectionCount         = {};
    _vesselTickMeta         = {};
    _faultRoster            = [];
    _accumulatorMs          = 0;
    _lastClockMs            = 0;
    _tickCount              = 0;
    _initialized            = false;
  }

  // §19 v1.6.1 connectFeed — expanded field contract
  // AISIngestBridge owns actual connection; runtime validates and delegates.
  function connectFeed(config) {
    if (!config.url)                 throw new Error('[AISRuntime] connectFeed: url required');
    if (!config.protocol)            throw new Error('[AISRuntime] connectFeed: protocol required');
    if (!config.normalizationProfile)throw new Error('[AISRuntime] connectFeed: normalizationProfile required');
    var fullConfig = Object.assign({
      reconnect:           true,
      retryIntervalMs:     config.reconnectInterval || 5000, // v1.6.1: reconnectInterval canonical
      reconnectInterval:   config.reconnectInterval || 5000,
      transport:           config.transport           || 'websocket',
      retryPolicy:         config.retryPolicy         || 'exponentialBackoff',
      authToken:           null,
    }, config);
    if (SBE.AISIngestBridge) {
      SBE.AISIngestBridge.connect(fullConfig);
    } else {
      console.warn('[AISRuntime] AISIngestBridge not available — feed config stored for deferred connect');
    }
  }

  // §17 Persistent vessel promotion API
  function promotePersistentVessel(mmsi, metadata) {
    _persistentRegistry[mmsi] = Object.assign({}, metadata);
    var vessel = _activeBucket[mmsi];
    if (vessel) {
      vessel.isPersistent = true;
      _applyPersistentMetadata(vessel);
      _computeWeights(vessel);
    }
  }

  function demotePersistentVessel(mmsi) {
    delete _persistentRegistry[mmsi];
    var vessel = _activeBucket[mmsi];
    if (vessel) {
      vessel.isPersistent = false;
      _computeWeights(vessel);
    }
  }

  // Viewport context for camera protection radius computation (§12)
  function setViewportContext(diagonalPx, cameraCenterX, cameraCenterY) {
    _viewportDiagonal  = diagonalPx;
    _cameraCenter.x    = cameraCenterX;
    _cameraCenter.y    = cameraCenterY;
  }

  // Ingest a pre-normalized packet (used by AISIngestBridge).
  // Staged into flood suppression queue — latest per MMSI survives per tick.
  function ingestPacket(packet) {
    _queuePacket(packet);
  }

  // ── Runtime mode control ──────────────────────────────────────────────────
  function setRuntimeMode(mode) {
    if (mode !== 'DETERMINISTIC' && mode !== 'PRODUCTION') {
      console.warn('[AISRuntime] unknown mode:', mode);
      return;
    }
    _runtimeMode = mode;
    console.log('[AISRuntime] runtimeMode:', _runtimeMode);
  }

  function getRuntimeMode() { return _runtimeMode; }

  // ── Fault roster access ───────────────────────────────────────────────────
  function getFaultRoster() {
    return _faultRoster.slice(); // defensive copy
  }

  function getLatestFaults(n) {
    return _faultRoster.slice(-(n || 10));
  }

  function getActiveVessels() {
    return Object.values(_activeBucket);
  }

  function getVessel(mmsi) {
    return _activeBucket[mmsi] || null;
  }

  function getFeedState() {
    return _feedState;
  }

  function getStats() {
    return {
      active:           Object.keys(_activeBucket).length,
      dormant:          _dormantBucket.length,
      protectedDormant: Object.keys(_protectedDormantBucket).length,
      feedState:        _feedState,
    };
  }

  // ── Exports ───────────────────────────────────────────────────────────────

  SBE.AISRuntime = {
    init,
    destroy,
    connectFeed,
    ingestPacket,
    getActiveVessels,
    getVessel,
    getFeedState,
    getStats,
    setViewportContext,
    promotePersistentVessel,
    demotePersistentVessel,
    injectDebugVessel,

    // State constants
    STATE_UNDERWAY,
    STATE_ANCHORED,
    STATE_MOORED,
    STATE_RESTRICTED,
    STATE_EMERGENCY,
    STATE_STALE,
    STATE_OFFLINE,
    STATE_DORMANT,
    STATE_FORCED_COAST,

    // Feed state constants
    FEED_LIVE,
    FEED_DEGRADED,
    FEED_OFFLINE,

    // Lifecycle constants (exposed for renderer)
    REPROJECTION_BLEND_MS,
    FORCED_COAST_DURATION_MS,
    FORCED_COAST_PROTECTED_MS,

    // AIS translation (accessible to AISIngestBridge)
    mapAISStatus: _mapAISStatus,

    // ── 0522Q: Runtime mode and fault APIs ───────────────────────────────────
    setRuntimeMode,
    getRuntimeMode,
    getFaultRoster,
    getLatestFaults,

    // 0522Q: Constitutional freeze constants (read-only access for renderer/debug)
    FIXED_TIMESTEP_MS,
    FIXED_TIMESTEP_SEC,
    FAULT_MARITIME_RENDER_DIVERGENCE,
    FAULT_RECONCILIATION_OSCILLATION,
    FAULT_INVALID_AIS_PACKET,
    FAULT_DORMANT_LEAK,
    FAULT_MARITIME_BACKPRESSURE,
    FAULT_VARIABLE_TICK_DETERMINISM,

    // Internal access for bridge and debug tools
    _activeBucket:          function () { return _activeBucket; },
    _dormantBucket:         function () { return _dormantBucket; },
    _protectedDormantBucket:function () { return _protectedDormantBucket; },
    _persistentRegistry:    function () { return _persistentRegistry; },
    _faultRoster:           function () { return _faultRoster; },
    _vesselTickMeta:        function () { return _vesselTickMeta; },
  };

})(window);
