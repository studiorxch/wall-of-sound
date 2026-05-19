(function (global) {
  "use strict";
  var SBE = (global.SBE = global.SBE || {});

  // ── Corridor Zero (0518J_WOS_CorridorZeroAuthoring_v1.0.0) ──────────────────
  // CZ-001 — Brooklyn → Cold Spring
  // The canonical WOS proof-of-concept traversal corridor.
  //
  // Zone sequence:
  //   1. Urban Compression    — dense Brooklyn departure
  //   2. Mechanical Transit   — FDR Drive / bridge infrastructure
  //   3. Transitional Drift   — leaving Manhattan density
  //   4. River Corridor       — Yonkers → Tarrytown → Hudson emergence
  //   5. Hudson Meditation    — long-form atmospheric flow
  //   6. Arrival              — Cold Spring exhale

  var WAYPOINTS = [
    // ── Zone 1: Urban Compression ──────────────────────────────────────────
    { longitude: -73.9441, latitude: 40.6782, type: "origin",      label: "Crown Heights",    zone: "urban-compression"  },
    { longitude: -73.9578, latitude: 40.6793, type: "checkpoint",  label: "",                 zone: "urban-compression"  },
    { longitude: -73.9664, latitude: 40.6832, type: "checkpoint",  label: "Atlantic Ave",     zone: "urban-compression"  },
    { longitude: -73.9751, latitude: 40.6882, type: "checkpoint",  label: "",                 zone: "urban-compression"  },
    { longitude: -73.9844, latitude: 40.6952, type: "checkpoint",  label: "Fort Greene",      zone: "urban-compression"  },
    { longitude: -73.9898, latitude: 40.7030, type: "scenic",      label: "DUMBO",            zone: "urban-compression"  },
    // ── Zone 2: Mechanical Transit ─────────────────────────────────────────
    { longitude: -73.9964, latitude: 40.7057, type: "scenic",      label: "Brooklyn Bridge",  zone: "mechanical-transit" },
    { longitude: -73.9978, latitude: 40.7071, type: "checkpoint",  label: "",                 zone: "mechanical-transit" },
    { longitude: -73.9852, latitude: 40.7156, type: "checkpoint",  label: "FDR South",        zone: "mechanical-transit" },
    { longitude: -73.9724, latitude: 40.7439, type: "checkpoint",  label: "",                 zone: "mechanical-transit" },
    { longitude: -73.9573, latitude: 40.7682, type: "checkpoint",  label: "East 72nd",        zone: "mechanical-transit" },
    { longitude: -73.9460, latitude: 40.7847, type: "checkpoint",  label: "",                 zone: "mechanical-transit" },
    { longitude: -73.9307, latitude: 40.8280, type: "scenic",      label: "Harlem River",     zone: "mechanical-transit" },
    // ── Zone 3: Transitional Drift ─────────────────────────────────────────
    { longitude: -73.9225, latitude: 40.8480, type: "checkpoint",  label: "Washington Bridge",zone: "transitional-drift" },
    { longitude: -73.9130, latitude: 40.8650, type: "checkpoint",  label: "",                 zone: "transitional-drift" },
    { longitude: -73.8991, latitude: 40.8890, type: "scenic",      label: "Van Cortlandt",    zone: "transitional-drift" },
    // ── Zone 4: River Corridor ─────────────────────────────────────────────
    { longitude: -73.8983, latitude: 40.9320, type: "checkpoint",  label: "Yonkers",          zone: "river-corridor"     },
    { longitude: -73.8879, latitude: 40.9660, type: "scenic",      label: "Hudson Reveal",    zone: "river-corridor"     },
    { longitude: -73.8680, latitude: 41.0025, type: "checkpoint",  label: "Dobbs Ferry",      zone: "river-corridor"     },
    { longitude: -73.8620, latitude: 41.0360, type: "checkpoint",  label: "",                 zone: "river-corridor"     },
    { longitude: -73.8588, latitude: 41.0620, type: "scenic",      label: "Tarrytown",        zone: "river-corridor"     },
    // ── Zone 5: Hudson Meditation ──────────────────────────────────────────
    { longitude: -73.8608, latitude: 41.1274, type: "checkpoint",  label: "Ossining",         zone: "hudson-meditation"  },
    { longitude: -73.8744, latitude: 41.1638, type: "checkpoint",  label: "",                 zone: "hudson-meditation"  },
    { longitude: -73.8878, latitude: 41.2110, type: "scenic",      label: "Croton",           zone: "hudson-meditation"  },
    { longitude: -73.9213, latitude: 41.2855, type: "scenic",      label: "Peekskill",        zone: "hudson-meditation"  },
    { longitude: -73.9466, latitude: 41.3806, type: "scenic",      label: "Garrison",         zone: "hudson-meditation"  },
    // ── Zone 6: Arrival ────────────────────────────────────────────────────
    { longitude: -73.9568, latitude: 41.4016, type: "checkpoint",  label: "",                 zone: "arrival"            },
    { longitude: -73.9601, latitude: 41.4194, type: "destination", label: "Cold Spring",      zone: "arrival"            },
  ];

  var ZONE_METADATA = {
    "urban-compression":  { pacing: "dense",    cameraZone: { mode: "follow",   zoomMin: 14, zoomMax: 16, anticipation: 0.45, lateralDrift: 0   } },
    "mechanical-transit": { pacing: "dense",    cameraZone: { mode: "follow",   zoomMin: 13, zoomMax: 15, anticipation: 0.50, lateralDrift: 0   } },
    "transitional-drift": { pacing: "balanced", cameraZone: { mode: "observe",  zoomMin: 12, zoomMax: 14, anticipation: 0.30, lateralDrift: 0.2 } },
    "river-corridor":     { pacing: "balanced", cameraZone: { mode: "observe",  zoomMin: 11, zoomMax: 13, anticipation: 0.20, lateralDrift: 0.3 } },
    "hudson-meditation":  { pacing: "open",     cameraZone: { mode: "float",    zoomMin: 10, zoomMax: 12, anticipation: 0.15, lateralDrift: 0.5 } },
    "arrival":            { pacing: "open",     cameraZone: { mode: "float",    zoomMin: 11, zoomMax: 14, anticipation: 0.20, lateralDrift: 0.3 } },
  };

  function author(runtime) {
    if (!runtime || typeof runtime.createRoute !== "function") {
      console.warn("[CorridorZero] author() requires a RoutePlannerRuntime instance");
      return null;
    }

    var route = runtime.createRoute("Corridor Zero");

    // Route metadata
    Object.assign(route.metadata, {
      tags:           ["CZ-001", "brooklyn", "cold-spring", "hudson", "corridor"],
      notes:          "Canonical WOS traversal — Brooklyn → Cold Spring",
      mood:           "atmospheric",
      pacing:         "balanced",
      soundtrackBias: ["ambient", "industrial", "pastoral", "meditative"],
      districtType:   "traversal",
      cinematicValue: 10,
    });

    // Playback config
    route.playback = {
      speed:       1.0,
      progression: 0,
      paused:      true,
      loop:        false,
    };

    // Route-level camera envelope
    route.camera = {
      mode:         "observe",
      speed:        1.0,
      anticipation: 0.30,
      lateralDrift: 0.25,
      zoomMin:      10,
      zoomMax:      16,
    };

    // Route color
    route.style.color = "#4a9eff";

    // Author waypoints
    WAYPOINTS.forEach(function (def) {
      var wp = runtime.addWaypoint(route.id, def.longitude, def.latitude, def.type, def.label);
      if (wp && def.zone) {
        wp.zone = def.zone;
        var zoneMeta = ZONE_METADATA[def.zone];
        if (zoneMeta && zoneMeta.cameraZone) {
          wp.cameraZone = zoneMeta.cameraZone;
        }
      }
    });

    console.log("[CorridorZero] authored — " + WAYPOINTS.length + " waypoints · CZ-001 · Brooklyn → Cold Spring");
    return route;
  }

  SBE.CorridorZero = {
    id:          "CZ-001",
    name:        "Corridor Zero",
    origin:      "Brooklyn, NY",
    destination: "Cold Spring, NY",
    zoneCount:   Object.keys(ZONE_METADATA).length,
    WAYPOINTS:   WAYPOINTS,
    ZONE_METADATA: ZONE_METADATA,
    author:      author,
  };

})(window);
