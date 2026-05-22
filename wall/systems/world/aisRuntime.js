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

  // ── Simulation tick interval ──────────────────────────────────────────────
  var SIM_STEP_MS = 1000;

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

  var _simTimer    = null;
  var _initialized = false;

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
    var pt = map.project(vessel.lat, vessel.lng);
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

  // ── Ingest normalized packet ──────────────────────────────────────────────

  function _ingestNormalizedPacket(packet) {
    var now  = performance.now();
    var mmsi = packet.mmsi;
    if (!mmsi) return;

    _lastPacketMs = now;
    _updateFeedState(now, true);

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

  // ── Fixed-step simulation tick ────────────────────────────────────────────

  function _simTick() {
    var now = performance.now();
    _updateFeedState(now, false);
    _lifetimeTick(now);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function init() {
    if (_initialized) return;
    _initialized  = true;
    _lastPacketMs = 0;
    _feedState    = FEED_OFFLINE;
    _simTimer     = setInterval(_simTick, SIM_STEP_MS);
    console.log('[AISRuntime v1.6.1] initialized');
  }

  function destroy() {
    if (_simTimer) { clearInterval(_simTimer); _simTimer = null; }
    _activeBucket           = {};
    _dormantBucket          = [];
    _protectedDormantBucket = {};
    _persistentRegistry     = {};
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

  // Ingest a pre-normalized packet directly (used by AISIngestBridge)
  function ingestPacket(packet) {
    _ingestNormalizedPacket(packet);
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

    // Internal access for bridge and debug tools
    _activeBucket:          function () { return _activeBucket; },
    _dormantBucket:         function () { return _dormantBucket; },
    _protectedDormantBucket:function () { return _protectedDormantBucket; },
    _persistentRegistry:    function () { return _persistentRegistry; },
  };

})(window);
