// ── MaritimeValidationFeed v1.0.0 ────────────────────────────────────────────
// 0523H_WOS_MaritimeValidationFeed_v1.0.0
//
// Purpose: AIS-backed validation vessel feed for the maritime occupancy renderer.
//   Replaces renderer-local seed vessels as the primary test path by injecting
//   35 deterministic validation vessels through AISRuntime.ingestPacket() —
//   the exact same runtime path that live AIS data will use.
//
// Authority boundary:
//   - Injects ONLY via SBE.AISRuntime.ingestPacket() (public API)
//   - Does NOT mutate AISRuntime private buckets
//   - Does NOT write to MaritimeOccupancyRenderer seed arrays
//   - Does NOT emit wake segments directly
//   - Does NOT alter vessel coordinates, heading, speed, or lifecycle state
//   - Read-only with respect to all runtime authorities
//
// Vessel source:
//   51 vessels across 12 NYC harbor corridors — same water-safe coordinates as
//   MaritimeOccupancyRenderer._SEED_DATA v1.3.0. Each vessel has a stable MMSI
//   in the validation namespace (999001001–999001051) to prevent MMSI collisions
//   with debug vessel (999000001) or live AIS vessels.
//
// Packet cadence:
//   1Hz per vessel — one packet per vessel per second, staggered by vessel index
//   within the tick so flood suppression (latest-per-MMSI-per-tick) is never
//   triggered for validation packets.
//
// Underway vessel motion:
//   Deterministic dead-reckoning from simulationTimeMs. Each underway vessel
//   advances along its heading at its catalogued speed. Position loops back to
//   origin after a configurable leg length (default: 2000m) to stay in viewport.
//   No Math.random() is used anywhere.
//
// AIS packet shape:
//   Matches AISRuntime._validatePacket() and _mergePacketIntoVessel() contract:
//     mmsi              → stable number (999001001–999001051)
//     vesselName        → string or ''
//     callsign          → 'VAL-NNN'
//     state             → STATE_* constant from AISRuntime
//     timestampMs       → performance.now() (must be < AIS_MAX_PACKET_AGE_MS = 300s)
//     telemetry.lat/lng → computed position
//     telemetry.speedKnots → catalog speed (0 if stationary)
//     telemetry.courseOverGround → catalog heading
//     telemetry.trueHeading      → catalog heading
//     dimensions.lengthMeters    → class-appropriate length
//     dimensions.widthMeters     → class-appropriate width
//     validation.source          → 'MARITIME_VALIDATION_FEED'
//
// Acceptance:
//   _wos.enableMaritimeValidationFeed(true) → AISRuntime-backed vessels appear
//   _wos.debugAIS() shows validation vessels (MMSI 999001xxx)
//   _wos.debugOccupancy() shows AIS vessels, not only seed count
//   No renderer-local seedWaterCorridors() call is required
//
// Renderer-local seeds:
//   _wos.seedWaterCorridors() remains available and is marked visual-only.
//   It is NOT the primary validation path once this feed is active.
//
// Placement: wall/validation/maritimeValidationFeed.js
// Load after: aisRuntime.js
// Load before: (any script that calls SBE.MaritimeValidationFeed)
// ─────────────────────────────────────────────────────────────────────────────
(function (global) {
  'use strict';

  var SBE = (global.SBE = global.SBE || {});

  var VERSION = '1.0.0';

  // ── State ─────────────────────────────────────────────────────────────────

  var _enabled         = false;
  var _tickTimer       = null;
  var _tickCount       = 0;
  var _startMs         = 0;   // performance.now() when feed was enabled

  // Per-vessel DR state — keyed by catalog index.
  // Holds the DR position accumulated since enable time.
  // Reset on feed reset(). Never used as AIS truth.
  var _drState = {};

  // Telemetry
  var _tel = {
    packetsInjected: 0,
    ticksEmitted:    0,
    rejectedByRuntime: 0,       // packets we tried to inject but runtime rejected
    underwayVessels: 0,         // from catalog (static count)
    stationaryVessels: 0,       // from catalog (static count)
    validationWaterClampCount: 0, // §0524L — positions clamped back into corridor envelope
  };

  // ── §0524L Corridor water envelopes ──────────────────────────────────────
  // Bounding boxes (WGS-84) for each named corridor.  A dead-reckoned position
  // that drifts outside its envelope is clamped back to the nearest envelope
  // edge before injection.  This guards against heading + leg-distance
  // combinations that walk a vessel onto land at the corridor boundaries.
  // Envelopes are intentionally conservative (tighter than the full waterway)
  // to keep vessels visually centred on the navigable channel.
  //
  // Authority boundary: clamping happens inside _computePosition() before the
  // packet is built.  AISRuntime truth is never mutated — the clamped lat/lng
  // is what gets injected as the packet's reported position.

  var _CORRIDOR_ENVELOPES = {
    'Upper Bay':          { latMin: 40.602, latMax: 40.698, lngMin: -74.048, lngMax: -74.012 },
    'SI Ferry Lane':      { latMin: 40.643, latMax: 40.703, lngMin: -74.078, lngMax: -74.012 },
    'East River':         { latMin: 40.698, latMax: 40.758, lngMin: -73.990, lngMax: -73.958 },
    'Hudson River':       { latMin: 40.700, latMax: 40.778, lngMin: -74.028, lngMax: -74.002 },
    'Kill Van Kull':      { latMin: 40.638, latMax: 40.648, lngMin: -74.122, lngMax: -74.070 },
    'Verrazzano':         { latMin: 40.568, latMax: 40.612, lngMin: -74.058, lngMax: -74.032 },
    'Red Hook/BCT':       { latMin: 40.667, latMax: 40.682, lngMin: -74.028, lngMax: -74.008 },
    'Lower Bay':          { latMin: 40.552, latMax: 40.598, lngMin: -74.068, lngMax: -74.022 },
    'Ambrose Channel':    { latMin: 40.472, latMax: 40.532, lngMin: -73.992, lngMax: -73.965 },
    'Jamaica Bay Outer':  { latMin: 40.575, latMax: 40.596, lngMin: -73.942, lngMax: -73.878 },
    'Rockaway Inlet':     { latMin: 40.554, latMax: 40.570, lngMin: -73.952, lngMax: -73.896 },
  };

  function _clampToEnvelope(pos, corridor) {
    var env = _CORRIDOR_ENVELOPES[corridor];
    if (!env) return pos;
    var lat = pos.lat < env.latMin ? env.latMin : pos.lat > env.latMax ? env.latMax : pos.lat;
    var lng = pos.lng < env.lngMin ? env.lngMin : pos.lng > env.lngMax ? env.lngMax : pos.lng;
    if (lat !== pos.lat || lng !== pos.lng) {
      _tel.validationWaterClampCount++;
    }
    return { lat: lat, lng: lng };
  }

  // ── MMSI namespace ────────────────────────────────────────────────────────
  // 999001001–999001051: validation namespace, clear of debug vessel (999000001)
  // and clear of real MMSI space (all real MMSIs are 9-digit < 999000000).

  var MMSI_BASE = 999001000;

  // ── Vessel class → physical dimensions ───────────────────────────────────
  // Matches MaritimeOccupancyRenderer._classSize for consistent rendering.

  var _DIM = {
    CARGO:        { len: 200, wid: 32 },
    TANKER:       { len: 180, wid: 30 },
    PASSENGER:    { len: 250, wid: 35 },
    FERRY:        { len:  80, wid: 20 },
    TUG:          { len:  30, wid: 10 },
    SERVICE:      { len:  35, wid: 10 },
    FISHING:      { len:  25, wid:  7 },
    RECREATIONAL: { len:  15, wid:  5 },
    MILITARY:     { len: 120, wid: 16 },
    INDUSTRIAL:   { len: 100, wid: 22 },
    UNKNOWN:      { len:  40, wid: 10 },
  };

  // ── Vessel class → AIS ship-type code ────────────────────────────────────
  // Passed as telemetry.shipType so AISRuntime's taxonomy resolver can classify.
  // Codes per ITU-R M.1371 / NMEA AIS type_and_cargo field (coarse class only).

  var _SHIP_TYPE = {
    CARGO:        70,  // Cargo vessel
    TANKER:       80,  // Tanker
    PASSENGER:    60,  // Passenger
    FERRY:        60,  // Passenger (ferry is a passenger class in AIS)
    TUG:          52,  // Tug
    SERVICE:      90,  // Other (service)
    FISHING:      30,  // Fishing
    RECREATIONAL: 37,  // Pleasure craft
    MILITARY:     35,  // Military
    INDUSTRIAL:   33,  // Dredger/industrial
    UNKNOWN:       0,
  };

  // ── AIS status code → AISRuntime state string ─────────────────────────────
  // AISRuntime.mapAISStatus maps numeric codes → state strings (0=UNDERWAY, 5=MOORED, 1=ANCHORED).
  // We use the state string directly (matching AISRuntime STATE_* exports).

  var STATE_UNDERWAY = 'STATUS_UNDERWAY';
  var STATE_ANCHORED = 'STATUS_ANCHORED';
  var STATE_MOORED   = 'STATUS_MOORED';

  // ── Leg length for underway vessel DR loop ────────────────────────────────
  // After advancing this many meters the vessel loops back to origin.
  // 2000m ≈ ~1.1 nautical miles — keeps vessels within NYC harbor viewport.

  var DR_LEG_METERS = 2000;

  // ── Validation catalog — 51 vessels, 12 corridors ──────────────────────────
  // Source coordinates: MaritimeOccupancyRenderer._SEED_DATA v1.3.0.
  // All positions verified on navigable water (see renderer coordinate comments).
  //
  // Fields:
  //   name      — vessel name (shown in renderer label / debugAIS)
  //   class     — vessel class (resolved by taxonomy)
  //   lat/lng   — origin position (water-safe, per renderer audit)
  //   heading   — degrees (bow direction, 0=N)
  //   speed     — knots (0 = stationary)
  //   state     — AISRuntime state string
  //   tier      — population tier hint (informational — AISRuntime owns tier)
  //   corridor  — corridor label (informational)

  var _CATALOG = [

    // ── [01-05] Upper Bay — Main Ship Channel ────────────────────────────────
    // N-S deep-draft lane, lng −74.028…−74.042, clear of both shores.
    { name:'MSC ADRIANA',      class:'CARGO',   lat:40.6112, lng:-74.0418, heading:355, speed:10, state:STATE_UNDERWAY, corridor:'Upper Bay',      waterway:'Upper Bay'            },
    { name:'',                 class:'TANKER',  lat:40.6298, lng:-74.0385, heading:175, speed: 8, state:STATE_UNDERWAY, corridor:'Upper Bay',      waterway:'Upper Bay'            },
    { name:'',                 class:'CARGO',   lat:40.6480, lng:-74.0322, heading:355, speed: 9, state:STATE_UNDERWAY, corridor:'Upper Bay',      waterway:'Upper Bay'            },
    { name:'CAROL ANN',        class:'TUG',     lat:40.6558, lng:-74.0290, heading:355, speed: 6, state:STATE_UNDERWAY, corridor:'Upper Bay',      waterway:'Upper Bay'            },
    { name:'',                 class:'TANKER',  lat:40.6420, lng:-74.0352, heading:  0, speed: 0, state:STATE_ANCHORED, corridor:'Upper Bay',      waterway:'Upper Bay'            },

    // ── [06-09] Staten Island Ferry Lane ─────────────────────────────────────
    // Diagonal crossing, bearing ~42°/222°, St George terminal (~40.644°N −74.074°W)
    // to Whitehall terminal (~40.700°N −74.013°W). All positions are open Upper Bay water;
    // the southernmost point (40.653°N) is well north of the SI north shore (40.644°N).
    { name:'STATEN ISLAND FERRY', class:'FERRY',   lat:40.6530, lng:-74.0618, heading: 42, speed:16, state:STATE_UNDERWAY, corridor:'SI Ferry Lane', waterway:'Staten Island Ferry' },
    { name:'STATEN ISLAND FERRY', class:'FERRY',   lat:40.6680, lng:-74.0462, heading:222, speed:15, state:STATE_UNDERWAY, corridor:'SI Ferry Lane', waterway:'Staten Island Ferry' },
    { name:'',                    class:'FERRY',   lat:40.6605, lng:-74.0540, heading: 42, speed:14, state:STATE_UNDERWAY, corridor:'SI Ferry Lane', waterway:'Staten Island Ferry' },
    { name:'',                    class:'SERVICE', lat:40.6748, lng:-74.0385, heading:222, speed: 7, state:STATE_UNDERWAY, corridor:'SI Ferry Lane', waterway:'Staten Island Ferry' },

    // ── [10-15] East River Ferry Lane ────────────────────────────────────────
    // Mid-channel lngs computed per-latitude; critical: no lngs more neg than −73.974 above 40.710°N.
    { name:'NYC FERRY',        class:'FERRY',        lat:40.7025, lng:-73.9932, heading: 15, speed:12, state:STATE_UNDERWAY, corridor:'East River',   waterway:'East River'           },
    { name:'NYC FERRY',        class:'FERRY',        lat:40.7148, lng:-73.9682, heading:195, speed:11, state:STATE_UNDERWAY, corridor:'East River',   waterway:'East River'           },
    { name:'HUNTER',           class:'TUG',          lat:40.7088, lng:-73.9858, heading: 15, speed: 6, state:STATE_UNDERWAY, corridor:'East River',   waterway:'East River'           },
    { name:'',                 class:'CARGO',        lat:40.7228, lng:-73.9718, heading: 18, speed: 7, state:STATE_UNDERWAY, corridor:'East River',   waterway:'East River'           },
    { name:'',                 class:'SERVICE',      lat:40.7358, lng:-73.9688, heading:195, speed: 4, state:STATE_UNDERWAY, corridor:'East River',   waterway:'East River'           },
    { name:'',                 class:'RECREATIONAL', lat:40.7482, lng:-73.9632, heading: 20, speed: 5, state:STATE_UNDERWAY, corridor:'East River',   waterway:'East River'           },

    // ── [16-20] Hudson River — West Lane ─────────────────────────────────────
    // Mid-channel, lng −74.012…−74.026, clear of BPC piers and NJ shore.
    { name:'SPIRIT OF NY',     class:'PASSENGER',    lat:40.7082, lng:-74.0252, heading:355, speed:10, state:STATE_UNDERWAY, corridor:'Hudson River', waterway:'Hudson River'         },
    { name:'NY WATERWAY',      class:'FERRY',        lat:40.7215, lng:-74.0210, heading:175, speed:14, state:STATE_UNDERWAY, corridor:'Hudson River', waterway:'Hudson River'         },
    { name:'',                 class:'TUG',          lat:40.7355, lng:-74.0148, heading:355, speed: 5, state:STATE_UNDERWAY, corridor:'Hudson River', waterway:'Hudson River'         },
    { name:'',                 class:'CARGO',        lat:40.7488, lng:-74.0112, heading:175, speed: 8, state:STATE_UNDERWAY, corridor:'Hudson River', waterway:'Hudson River'         },
    { name:'',                 class:'TANKER',       lat:40.7622, lng:-74.0092, heading:355, speed: 6, state:STATE_UNDERWAY, corridor:'Hudson River', waterway:'Hudson River'         },

    // ── [21-25] Kill Van Kull — Industrial Lane ───────────────────────────────
    // FIXED: original lats (40.6368–40.6372) clipped the SI north shore near
    // New Brighton / Tompkinsville (shore reaches ~40.638°N at eastern KVK).
    // Corrected to mid-channel band: lat 40.6428–40.6445°N.
    // Channel geometry: SI north shore ~40.634–40.638°N; Bayonne/NJ south shore
    // ~40.647–40.650°N; navigable mid-channel ~40.641–40.645°N.
    { name:'',                 class:'TANKER',       lat:40.6428, lng:-74.1185, heading: 90, speed: 7, state:STATE_UNDERWAY, corridor:'Kill Van Kull', waterway:'Kill Van Kull'       },
    { name:'',                 class:'CARGO',        lat:40.6432, lng:-74.1025, heading:270, speed: 6, state:STATE_UNDERWAY, corridor:'Kill Van Kull', waterway:'Kill Van Kull'       },
    { name:'',                 class:'TUG',          lat:40.6438, lng:-74.0872, heading: 90, speed: 4, state:STATE_UNDERWAY, corridor:'Kill Van Kull', waterway:'Kill Van Kull'       },
    { name:'',                 class:'INDUSTRIAL',   lat:40.6445, lng:-74.0728, heading: 90, speed: 3, state:STATE_UNDERWAY, corridor:'Kill Van Kull', waterway:'Kill Van Kull'       },
    { name:'',                 class:'TANKER',       lat:40.6432, lng:-74.0948, heading:  0, speed: 0, state:STATE_ANCHORED,  corridor:'Kill Van Kull', waterway:'Kill Van Kull'      },

    // ── [26-28] Verrazzano / Narrows ─────────────────────────────────────────
    // Narrows center at ~−74.044°W (40.607°N); open Lower Bay south of bridge.
    { name:'COSCO SHIPPING',   class:'CARGO',        lat:40.6068, lng:-74.0442, heading:355, speed:10, state:STATE_UNDERWAY, corridor:'Verrazzano',   waterway:'Narrows'              },
    { name:'',                 class:'TANKER',       lat:40.5942, lng:-74.0468, heading:175, speed: 8, state:STATE_UNDERWAY, corridor:'Verrazzano',   waterway:'Narrows'              },
    { name:'',                 class:'CARGO',        lat:40.5818, lng:-74.0495, heading:355, speed:11, state:STATE_UNDERWAY, corridor:'Verrazzano',   waterway:'Narrows'              },

    // ── [29-31] Red Hook / Brooklyn Cruise Terminal ───────────────────────────
    // BCT pier face ~−74.012°W; seeds at lng −74.018…−74.021 = open basin water.
    { name:'CARNIVAL SUNRISE', class:'PASSENGER',    lat:40.6782, lng:-74.0205, heading:  0, speed: 0, state:STATE_MOORED,   corridor:'Red Hook/BCT', waterway:'Red Hook Basin'       },
    { name:'',                 class:'TUG',          lat:40.6758, lng:-74.0178, heading:170, speed: 3, state:STATE_UNDERWAY, corridor:'Red Hook/BCT', waterway:'Red Hook Basin'       },
    { name:'',                 class:'SERVICE',      lat:40.6732, lng:-74.0198, heading:270, speed: 4, state:STATE_UNDERWAY, corridor:'Red Hook/BCT', waterway:'Red Hook Basin'       },

    // ── [32-35] Lower Bay Anchorage ───────────────────────────────────────────
    // Open water lat 40.558…40.587°N — well north of Sandy Hook, west of Coney Island.
    { name:'',                 class:'CARGO',        lat:40.5688, lng:-74.0382, heading:  0, speed: 0, state:STATE_ANCHORED,  corridor:'Lower Bay',    waterway:'Lower Bay'            },
    { name:'',                 class:'TANKER',       lat:40.5755, lng:-74.0552, heading:  0, speed: 0, state:STATE_ANCHORED,  corridor:'Lower Bay',    waterway:'Lower Bay'            },
    { name:'',                 class:'CARGO',        lat:40.5598, lng:-74.0318, heading:  0, speed: 0, state:STATE_ANCHORED,  corridor:'Lower Bay',    waterway:'Lower Bay'            },
    { name:'',                 class:'CARGO',        lat:40.5868, lng:-74.0428, heading:355, speed: 7, state:STATE_UNDERWAY,  corridor:'Lower Bay',    waterway:'Lower Bay'            },

    // ── [36-42] Lower Bay East Approach — Ambrose / Atlantic ─────────────────
    // Open deep water east of Lower Bay, west of Rockaway Peninsula.
    { name:'MAERSK HARTFORD',  class:'CARGO',        lat:40.5022, lng:-73.9748, heading:355, speed:12, state:STATE_UNDERWAY, corridor:'Ambrose Channel',   waterway:'Ambrose Channel'   },
    { name:'',                 class:'TANKER',       lat:40.4912, lng:-73.9782, heading:175, speed: 9, state:STATE_UNDERWAY, corridor:'Ambrose Channel',   waterway:'Ambrose Channel'   },
    { name:'',                 class:'CARGO',        lat:40.5148, lng:-73.9712, heading:355, speed:10, state:STATE_UNDERWAY, corridor:'Ambrose Channel',   waterway:'Ambrose Channel'   },
    { name:'',                 class:'SERVICE',      lat:40.5268, lng:-73.9698, heading:175, speed: 6, state:STATE_UNDERWAY, corridor:'Ambrose Channel',   waterway:'Ambrose Channel'   },
    { name:'',                 class:'TANKER',       lat:40.5088, lng:-73.9842, heading:  0, speed: 0, state:STATE_ANCHORED,  corridor:'Ambrose Anchorage', waterway:'Ambrose Channel'  },
    { name:'',                 class:'FISHING',      lat:40.5358, lng:-73.9622, heading: 80, speed: 4, state:STATE_UNDERWAY, corridor:'Lower Bay East',    waterway:'Lower Bay East'    },
    { name:'',                 class:'CARGO',        lat:40.4788, lng:-73.9818, heading:  0, speed: 0, state:STATE_ANCHORED,  corridor:'Ambrose Anchorage', waterway:'Ambrose Channel'  },

    // ── [43-47] Jamaica Bay Outer Channel ─────────────────────────────────────
    // Outer bay tidal channel, E–W at lat 40.580–40.592°N.
    { name:'',                 class:'FISHING',      lat:40.5852, lng:-73.9122, heading: 90, speed: 5, state:STATE_UNDERWAY, corridor:'Jamaica Bay Outer', waterway:'Jamaica Bay'       },
    { name:'',                 class:'RECREATIONAL', lat:40.5828, lng:-73.8952, heading:270, speed: 6, state:STATE_UNDERWAY, corridor:'Jamaica Bay Outer', waterway:'Jamaica Bay'       },
    { name:'',                 class:'SERVICE',      lat:40.5878, lng:-73.9288, heading: 90, speed: 4, state:STATE_UNDERWAY, corridor:'Jamaica Bay Outer', waterway:'Jamaica Bay'       },
    { name:'',                 class:'FISHING',      lat:40.5812, lng:-73.9042, heading:  0, speed: 0, state:STATE_ANCHORED,  corridor:'Jamaica Bay Outer', waterway:'Jamaica Bay'      },
    { name:'',                 class:'RECREATIONAL', lat:40.5862, lng:-73.8842, heading: 85, speed: 7, state:STATE_UNDERWAY, corridor:'Jamaica Bay Outer', waterway:'Jamaica Bay'       },

    // ── [48-51] Rockaway Inlet ────────────────────────────────────────────────
    // Tidal channel, E–W orientation. Depth sufficient for small vessels only.
    { name:'',                 class:'FISHING',      lat:40.5618, lng:-73.9328, heading:270, speed: 5, state:STATE_UNDERWAY, corridor:'Rockaway Inlet',    waterway:'Rockaway Inlet'    },
    { name:'',                 class:'RECREATIONAL', lat:40.5642, lng:-73.9188, heading: 90, speed: 6, state:STATE_UNDERWAY, corridor:'Rockaway Inlet',    waterway:'Rockaway Inlet'    },
    { name:'',                 class:'SERVICE',      lat:40.5598, lng:-73.9422, heading:  0, speed: 0, state:STATE_MOORED,    corridor:'Rockaway Inlet',    waterway:'Rockaway Inlet'   },
    { name:'',                 class:'FISHING',      lat:40.5628, lng:-73.9052, heading:270, speed: 4, state:STATE_UNDERWAY, corridor:'Rockaway Inlet',    waterway:'Rockaway Inlet'    },

  ];

  // ── Geo utility — offset position by bearing + distance ──────────────────
  // Mirrors AISRuntime._offsetPosition without importing it.

  function _offsetPosition(lat, lng, bearingDeg, distanceMeters) {
    var R       = 6371000;
    var brg     = bearingDeg * Math.PI / 180;
    var latR    = lat * Math.PI / 180;
    var dR      = distanceMeters / R;
    var newLatR = Math.asin(
      Math.sin(latR) * Math.cos(dR) +
      Math.cos(latR) * Math.sin(dR) * Math.cos(brg)
    );
    var newLngR = (lng * Math.PI / 180) +
      Math.atan2(
        Math.sin(brg) * Math.sin(dR) * Math.cos(latR),
        Math.cos(dR) - Math.sin(latR) * Math.sin(newLatR)
      );
    return {
      lat: newLatR * 180 / Math.PI,
      lng: newLngR * 180 / Math.PI,
    };
  }

  // ── DR position for a single underway vessel at time t ────────────────────
  // Deterministic: position = origin + advance(heading, speed × elapsed), looped.
  // elapsed = seconds since feed start. Uses the DR_LEG_METERS loop boundary.
  // Stationary vessels always return their catalog origin.

  function _computePosition(catalogIdx, elapsedSec) {
    var entry = _CATALOG[catalogIdx];
    if (entry.speed <= 0) {
      return { lat: entry.lat, lng: entry.lng };
    }

    var mps         = entry.speed * 0.514444; // knots → m/s
    var totalMeters = mps * elapsedSec;

    // Loop within leg — vessel oscillates along heading/reverse heading.
    // Using modulo: 0..LEG = forward, LEG..2×LEG = reverse (loop direction only,
    // heading reported as catalog heading regardless for visual clarity).
    var legPos = totalMeters % (DR_LEG_METERS * 2);
    var legDist = legPos <= DR_LEG_METERS ? legPos : DR_LEG_METERS * 2 - legPos;

    var pos = _offsetPosition(entry.lat, entry.lng, entry.heading, legDist);
    return _clampToEnvelope(pos, entry.corridor); // §0524L water guard
  }

  // ── Build one AIS packet for catalog index i ──────────────────────────────

  function _buildPacket(catalogIdx, elapsedSec) {
    var entry = _CATALOG[catalogIdx];
    var mmsi  = MMSI_BASE + catalogIdx + 1; // 999001001 … 999001051
    var pos   = _computePosition(catalogIdx, elapsedSec);
    var dim   = _DIM[entry.class] || _DIM.UNKNOWN;
    var now   = performance.now();

    return {
      mmsi:       mmsi,
      vesselName: entry.name || '',
      callsign:   'VAL-' + String(mmsi).slice(-3),
      state:      entry.state,
      timestampMs: now,         // must be < AIS_MAX_PACKET_AGE_MS (300s) — always fresh
      telemetry: {
        lat:             pos.lat,
        lng:             pos.lng,
        speedKnots:      entry.speed,
        courseOverGround:entry.heading,
        trueHeading:     entry.heading,
        shipType:        _SHIP_TYPE[entry.class] || 0,
      },
      dimensions: {
        lengthMeters: dim.len,
        widthMeters:  dim.wid,
      },
      // Informational metadata — not parsed by AISRuntime validation path
      validation: {
        source:    'MARITIME_VALIDATION_FEED',
        corridor:  entry.corridor,
        catalogIdx: catalogIdx,
        feedVersion: VERSION,
      },
    };
  }

  // ── Tick — emit one packet per vessel ────────────────────────────────────
  // 1Hz cadence via setInterval. Each call iterates all catalog entries (51 vessels).
  // Staggered injection: one ingestPacket() call per entry, not batched,
  // so flood suppression (latest-per-MMSI-per-tick) never fires for these
  // (they each have a unique MMSI and arrive in the same JS tick at 1Hz,
  // well within the AISRuntime 50ms fixed-step window — flood suppression
  // only collapses multiple packets for the SAME MMSI within one tick).

  function _tick() {
    var ais = SBE.AISRuntime;
    if (!ais || !ais.ingestPacket) {
      _log('AISRuntime not available — skipping tick');
      return;
    }

    _tickCount++;
    var elapsedSec = _startMs > 0 ? (performance.now() - _startMs) / 1000 : 0;

    for (var i = 0; i < _CATALOG.length; i++) {
      var pkt = _buildPacket(i, elapsedSec);
      try {
        ais.ingestPacket(pkt);
        _tel.packetsInjected++;
      } catch (err) {
        _tel.rejectedByRuntime++;
        _log('ingestPacket error for MMSI ' + pkt.mmsi + ': ' + err.message);
      }
    }

    _tel.ticksEmitted++;
  }

  // ── Logging helper ────────────────────────────────────────────────────────

  function _log(msg) {
    var flags = SBE.runtimeFlags || {};
    if (flags.showMaritimeValidationFeedLogs) {
      console.log('[MaritimeValidationFeed] ' + msg);
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  function enable(on) {
    on = (on !== false);
    if (on === _enabled) return;

    if (on) {
      _enabled  = true;
      _startMs  = performance.now();
      _drState  = {};
      // Immediately emit one round of packets so vessels appear without waiting 1s
      _tick();
      _tickTimer = setInterval(_tick, 1000);
      console.log('[MaritimeValidationFeed v' + VERSION + '] enabled — ' +
        _CATALOG.length + ' vessels across 12 corridors → SBE.AISRuntime');
    } else {
      _enabled = false;
      if (_tickTimer) { clearInterval(_tickTimer); _tickTimer = null; }
      console.log('[MaritimeValidationFeed v' + VERSION + '] disabled — ' +
        _tel.ticksEmitted + ' ticks, ' + _tel.packetsInjected + ' packets injected');
    }
  }

  function reset() {
    enable(false);
    _tickCount = 0;
    _drState   = {};
    _tel.packetsInjected  = 0;
    _tel.ticksEmitted     = 0;
    _tel.rejectedByRuntime = 0;
    _tel.validationWaterClampCount = 0;
    _startMs = 0;
    console.log('[MaritimeValidationFeed] reset');
  }

  // tick(simulationTimeMs) — manual tick for testing or custom cadence control.
  // simulationTimeMs: optional override for elapsed time (uses performance.now() if omitted).
  function tick(simulationTimeMs) {
    var elapsedSec = simulationTimeMs !== undefined
      ? simulationTimeMs / 1000
      : (_startMs > 0 ? (performance.now() - _startMs) / 1000 : 0);

    var ais = SBE.AISRuntime;
    if (!ais || !ais.ingestPacket) {
      console.warn('[MaritimeValidationFeed] AISRuntime not available');
      return;
    }

    for (var i = 0; i < _CATALOG.length; i++) {
      var pkt = _buildPacket(i, elapsedSec);
      try {
        ais.ingestPacket(pkt);
        _tel.packetsInjected++;
      } catch (err) {
        _tel.rejectedByRuntime++;
      }
    }
    _tel.ticksEmitted++;
  }

  function debug() {
    var ais  = SBE.AISRuntime;
    var active = ais ? ais.getActiveVessels() : [];
    // Filter to validation namespace
    var valVessels = active.filter(function (v) {
      return v.mmsi >= MMSI_BASE + 1 && v.mmsi <= MMSI_BASE + _CATALOG.length;
    });

    // Count catalog types
    var underway = 0, stationary = 0;
    for (var i = 0; i < _CATALOG.length; i++) {
      if (_CATALOG[i].speed > 0) underway++;
      else stationary++;
    }

    var result = {
      version:          VERSION,
      enabled:          _enabled,
      catalogSize:      _CATALOG.length,
      ticksEmitted:     _tel.ticksEmitted,
      packetsInjected:  _tel.packetsInjected,
      rejectedByRuntime:_tel.rejectedByRuntime,
      validationWaterClampCount: _tel.validationWaterClampCount,
      activeInRuntime:  valVessels.length,
      underwayInCatalog: underway,
      stationaryInCatalog: stationary,
      elapsedSec: _startMs > 0 ? +((performance.now() - _startMs) / 1000).toFixed(1) : 0,
      corridors: [
        'Upper Bay [01-05]',
        'SI Ferry Lane [06-09]',
        'East River [10-15]',
        'Hudson River [16-20]',
        'Kill Van Kull [21-25]',
        'Verrazzano [26-28]',
        'Red Hook/BCT [29-31]',
        'Lower Bay [32-35]',
      ],
    };

    console.group('[MaritimeValidationFeed v' + VERSION + ']');
    console.log('  enabled:         ', result.enabled);
    console.log('  catalog size:    ', result.catalogSize, '(', underway, 'underway,', stationary, 'stationary)');
    console.log('  ticks emitted:   ', result.ticksEmitted);
    console.log('  packets injected:', result.packetsInjected);
    console.log('  active in AIS:   ', result.activeInRuntime, '/ ' + result.catalogSize);
    console.log('  elapsed:         ', result.elapsedSec + 's');
    if (result.rejectedByRuntime > 0) {
      console.warn('  rejected by runtime:', result.rejectedByRuntime);
    }
    console.groupEnd();

    return result;
  }

  // ── Auto-start from runtimeFlags ──────────────────────────────────────────
  // If maritimeValidationFeedAutostart is set at load time, enable immediately.
  // (AISRuntime must be initialized before packets will be ingested.)

  (function _autostart() {
    var flags = SBE.runtimeFlags || {};
    if (flags.maritimeValidationFeedAutostart) {
      console.log('[MaritimeValidationFeed] autostart from runtimeFlags');
      // Defer one microtask to allow AISRuntime.init() to run first
      setTimeout(function () { enable(true); }, 0);
    }
  })();

  // ── MMSI → vessel-class lookup ────────────────────────────────────────────
  // AISRuntime does not carry telemetry.shipType onto the vessel object, so
  // renderers cannot resolve class from the vessel directly for validation
  // vessels. This lookup lets the renderer query us by MMSI.
  //
  // Returns the vessel class string (e.g. 'CARGO', 'FERRY') for a validation
  // MMSI (999001001–999001051), or null if the MMSI is outside our namespace.

  function isEnabled() { return _enabled; }

  // ── Water placement risk assessment ──────────────────────────────────────
  // Shoreline risk rules per waterway. A vessel is flagged if it falls inside
  // the known shoal/land zone for that waterway type.
  // Extend _RISK_RULES with additional waterways as needed.

  var _RISK_RULES = {
    'Kill Van Kull': function(e) {
      // SI north shore reaches ~40.638°N at the eastern approach (lng −74.07).
      // Safe channel: lat > 40.638°N. Below that risks clipping shoreline.
      return e.lat < 40.638 ? 'SHORELINE_RISK' : 'OK';
    },
    'Staten Island Ferry': function(e) {
      // Route crosses open Upper Bay between 40.644°N and 40.700°N.
      // Anything south of 40.648°N risks proximity to SI north shore.
      return e.lat < 40.648 ? 'SHORELINE_RISK' : 'OK';
    },
  };

  function _assessRisk(entry) {
    var rule = _RISK_RULES[entry.waterway];
    return rule ? rule(entry) : 'OK';
  }

  // debugValidationWaterPlacement() — console.table of all catalog entries with
  // position, waterway, and shoreline risk assessment.
  // Call as: _wos.debugValidationWaterPlacement() or SBE.MaritimeValidationFeed.debugValidationWaterPlacement()

  function debugValidationWaterPlacement() {
    var rows = [];
    for (var i = 0; i < _CATALOG.length; i++) {
      var e    = _CATALOG[i];
      var mmsi = MMSI_BASE + i + 1;
      var risk = _assessRisk(e);
      rows.push({
        mmsi:        mmsi,
        idx:         i + 1,
        name:        e.name || '—',
        class:       e.class,
        lat:         +e.lat.toFixed(5),
        lng:         +e.lng.toFixed(5),
        corridor:    e.corridor,
        waterway:    e.waterway || '—',
        status:      e.state.replace('STATUS_', ''),
        speed:       e.speed,
        likelyRisk:  risk,
      });
    }

    var risks = rows.filter(function(r) { return r.likelyRisk !== 'OK'; });
    console.group('[MaritimeValidationFeed] Water Placement Audit — ' + rows.length + ' vessels');
    console.log('  Risk flags: ' + risks.length + ' / ' + rows.length);
    if (risks.length > 0) {
      console.warn('  SHORELINE_RISK vessels:');
      console.table(risks);
    }
    console.log('  Full placement:');
    console.table(rows);
    console.groupEnd();
    return rows;
  }

  function getVesselClass(mmsi) {
    var idx = Number(mmsi) - MMSI_BASE - 1; // 999001001 → 0, … 999001051 → 50
    if (idx < 0 || idx >= _CATALOG.length) return null;
    return _CATALOG[idx].class || null;
  }

  // ── Export ────────────────────────────────────────────────────────────────

  SBE.MaritimeValidationFeed = {
    enable,
    isEnabled,
    reset,
    tick,
    debug,
    getVesselClass,
    debugValidationWaterPlacement,
    VERSION,
    MMSI_BASE,
    CATALOG_SIZE: _CATALOG.length,
  };

  console.log('[MaritimeValidationFeed v' + VERSION + '] loaded — ' +
    _CATALOG.length + ' vessels ready | call enable(true) or _wos.enableMaritimeValidationFeed(true)');

})(window);
