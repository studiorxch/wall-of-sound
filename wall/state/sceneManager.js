(function initSceneManager(global) {
  const SBE = global.SBE = global.SBE || {};
  const STORAGE_KEY = "sbe-scene";

  function serializeScene(state) {
    const textObjects =
      SBE.TextSystem && Array.isArray(state.textObjects)
        ? state.textObjects.map(SBE.TextSystem.serializeTextObject)
        : [];

    const shapes =
      SBE.ShapeSystem && Array.isArray(state.shapes)
        ? state.shapes.map(SBE.ShapeSystem.serializeShape)
        : [];

    // Serialize routeWorld — persistent data only, no runtime caches
    var routeWorldData = null;
    var rw = state.routeWorld;
    if (rw && (rw.world || rw.routes.length > 0)) {
      var RC = window.SBE && window.SBE.RouteCamera;
      var UC = window.SBE && window.SBE.UniversalClock;
      var ES = window.SBE && window.SBE.EnvironmentState;
      var CS = window.SBE && window.SBE.CommsSystem;
      var SI = window.SBE && window.SBE.SpatialInfrastructure;
      routeWorldData = {
        world:          rw.world   ? JSON.parse(JSON.stringify(rw.world))   : null,
        routes:         serializeRoutes(rw.routes),
        segments:       rw.segments       ? JSON.parse(JSON.stringify(rw.segments))       : [],
        actors:         serializeActors(rw.actors),
        eventZones:     rw.eventZones     ? JSON.parse(JSON.stringify(rw.eventZones))     : [],
        skins:          rw.skins          ? JSON.parse(JSON.stringify(rw.skins))          : [],
        cameraRigs:     rw.cameraRigs     ? JSON.parse(JSON.stringify(rw.cameraRigs))     : [],
        surfaceAnchors: rw.surfaceAnchors ? JSON.parse(JSON.stringify(rw.surfaceAnchors)) : [],
        camera:         rw.camera && RC ? RC.serializeCamera(rw.camera) : null,
        // Foundation Protocols — Human Aquarium v1.0.0
        clock:          rw.clock && UC ? UC.serializeClock(rw.clock)       : null,
        env:            rw.env   && ES ? ES.serializeEnvironment(rw.env)   : null,
        comms:          rw.comms && CS ? CS.serializeComms(rw.comms)       : null,
        // Spatial Infrastructure v1.1.0
        spatial:        rw.spatial && SI ? SI.serializeSpatial(rw.spatial) : null,
      };
    }

    return {
      lines: state.lines.map((line) => ({
        id: line.id,
        x1: line.x1,
        y1: line.y1,
        x2: line.x2,
        y2: line.y2,
        color: line.color,
        thickness: line.thickness,
        midiChannel: line.midiChannel,
        note: line.note,
        velocityRange: [line.velocityRange[0], line.velocityRange[1]],
        life: line.life,
        behavior: {
          type: line.behavior.type,
          strength: line.behavior.strength,
          velocityMultiplier: line.behavior.velocityMultiplier || 1,
        },
        style: line.style
          ? {
              color: line.style.color,
              colorMode: line.style.colorMode,
              thickness: line.style.thickness,
            }
          : undefined,
        midi: line.midi
          ? {
              note: line.midi.note,
              channel: line.midi.channel,
            }
          : undefined,
        gravity: line.gravity
          ? {
              enabled: !!line.gravity.enabled,
              direction: line.gravity.direction,
              strength: line.gravity.strength,
            }
          : undefined,
        groupId: line.groupId || null,
      })),
      canvas: {
        width: state.canvas.width,
        height: state.canvas.height,
      },
      swarm: {
        count: state.swarm.count,
        speed: state.swarm.speed,
        randomness: state.swarm.randomness,
        radius: state.swarm.radius,
        collisionRadius: state.swarm.collisionRadius,
        renderRadius: state.swarm.renderRadius,
        ballStyle: state.swarm.ballStyle,
        color: state.swarm.color,
      },
      textObjects,
      shapes,
      groups: Array.isArray(state.groups) ? state.groups.slice() : [],
      balls: Array.isArray(state.balls) ? state.balls.slice() : [],
      background: state.backgroundDataUrl,
      routeWorld: routeWorldData,
      // SymbolObjects — stored as reference + transform only, no geometry
      symbolObjects: SBE.SymbolObjectSystem && Array.isArray(state.symbolObjects)
        ? state.symbolObjects.map(SBE.SymbolObjectSystem.serialize)
        : [],
    };
  }

  // Strip internal pixel-cache fields before JSON serialization
  function serializeRoutes(routes) {
    return (routes || []).map(function (route) {
      var r = JSON.parse(JSON.stringify(route));
      delete r._totalPixelLength;
      delete r._cumulativeDistances;
      delete r._skinSeed;
      return r;
    });
  }

  // Strip runtime-only fields from actors
  function serializeActors(actors) {
    var AN = window.SBE && window.SBE.AgentNeeds;
    return (actors || []).map(function (actor) {
      return {
        id:      actor.id,
        type:    actor.type,
        role:    actor.role,
        routeId: actor.routeId,
        visual:  actor.visual ? JSON.parse(JSON.stringify(actor.visual)) : {},
        audio:   actor.audio  ? JSON.parse(JSON.stringify(actor.audio))  : {},
        needs:   actor.needs && AN ? AN.serializeNeeds(actor.needs) : null,
        // t, speed, x, y, heading are runtime — not persisted
      };
    });
  }

  function applyScene(state, scene) {
    const lineSystem = SBE.LineSystem;

    state.lines = (scene.lines || []).map(lineSystem.hydrateLine);
    state.textObjectsRaw = Array.isArray(scene.textObjects)
      ? scene.textObjects.slice()
      : [];
    state.textObjects = [];

    // Hydrate shapes if ShapeSystem is available
    state.shapes = SBE.ShapeSystem && Array.isArray(scene.shapes)
      ? scene.shapes.map(SBE.ShapeSystem.hydrateShape)
      : [];

    if (scene.canvas && scene.canvas.width && scene.canvas.height) {
      state.canvas.width = scene.canvas.width;
      state.canvas.height = scene.canvas.height;
    }
    state.swarm.count = scene.swarm && scene.swarm.count ? scene.swarm.count : state.swarm.count;
    state.swarm.speed = scene.swarm && scene.swarm.speed ? scene.swarm.speed : state.swarm.speed;
    state.swarm.randomness = scene.swarm && typeof scene.swarm.randomness === "number" ? scene.swarm.randomness : state.swarm.randomness;
    state.swarm.radius = scene.swarm && scene.swarm.radius ? scene.swarm.radius : state.swarm.radius;
    state.swarm.color = scene.swarm && scene.swarm.color ? scene.swarm.color : state.swarm.color;
    state.backgroundDataUrl = scene.background || null;
    state.groups = Array.isArray(scene.groups) ? scene.groups.slice() : [];
    state.balls = Array.isArray(scene.balls) ? scene.balls.slice() : [];
    state.selectedLineId = null;
    state.selectedTextId = null;
    if (state.selectedShapeIds) { state.selectedShapeIds.clear(); }
    state.selectedSegmentId = null;

    // Hydrate SymbolObjects — reference-only, no geometry
    state.symbolObjects = SBE.SymbolObjectSystem && Array.isArray(scene.symbolObjects)
      ? scene.symbolObjects.map(SBE.SymbolObjectSystem.hydrate).filter(Boolean)
      : [];
    state.selectedSymbolObjectIds = new Set();
    if (state.collisionMemory) {
      state.collisionMemory.clear();
    }

    // Rehydrate routeWorld — rebuild pixel caches from persisted geo data
    if (scene.routeWorld && state.routeWorld) {
      var saved = scene.routeWorld;
      var rw = state.routeWorld;

      rw.world          = saved.world          || null;
      rw.segments       = saved.segments        || [];
      rw.eventZones     = saved.eventZones      || [];
      rw.skins          = saved.skins           || [];
      rw.cameraRigs     = saved.cameraRigs      || [];
      rw.surfaceAnchors = saved.surfaceAnchors  || [];

      // Rehydrate routes — rebuild pixel-distance caches
      rw.routes = (saved.routes || []).map(function (r) {
        var route = JSON.parse(JSON.stringify(r));
        rehydrateRouteCache(route);
        return route;
      });

      // Rehydrate actors — restore with fresh runtime state
      rw.actors = (saved.actors || []).map(function (a) {
        return Object.assign({ t: 0, speed: 1, x: 0, y: 0, heading: 0 }, a);
      });

      // Reset runtime
      rw.runtime = {
        elapsedSec:        0,
        activeRouteId:     rw.world ? rw.world.routeId : null,
        activeActorId:     rw.actors.length > 0 ? rw.actors[0].id : null,
        activeSegmentId:   null,
        triggeredEventIds: new Set(),
      };
      rw.active = false; // never auto-start on load

      // Rehydrate camera
      var RC2 = window.SBE && window.SBE.RouteCamera;
      rw.camera = RC2 ? RC2.rehydrateCamera(saved.camera) : null;

      // Rehydrate Foundation Protocol systems
      var UC2 = window.SBE && window.SBE.UniversalClock;
      var ES2 = window.SBE && window.SBE.EnvironmentState;
      var CS2 = window.SBE && window.SBE.CommsSystem;
      var AN2 = window.SBE && window.SBE.AgentNeeds;
      var SI2 = window.SBE && window.SBE.SpatialInfrastructure;

      rw.clock = UC2 ? UC2.rehydrateClock(saved.clock)           : null;
      rw.env   = ES2 ? ES2.rehydrateEnvironment(saved.env)       : null;
      rw.comms = CS2 ? CS2.rehydrateComms(saved.comms)           : null;
      // Spatial: rehydrate from saved if available, otherwise will lazy-init Phase 1 on first tick
      rw.spatial = SI2 && saved.spatial
        ? SI2.rehydrateSpatial(saved.spatial, window._wos && window._wos.state && window._wos.state.canvas)
        : null;

      // Rehydrate actor needs
      if (AN2) {
        rw.actors.forEach(function (actor) {
          var savedActor = (saved.actors || []).find(function (a) { return a.id === actor.id; });
          var savedNeeds = savedActor && savedActor.needs ? savedActor.needs : null;
          actor.needs = AN2.rehydrateNeeds(savedNeeds);
        });
      }

      // Prime hero-car starting position and camera
      var heroRoute = rw.routes.find(function (r) { return r.id === rw.runtime.activeRouteId; });
      var heroActor = rw.actors.find(function (a) { return a.id === rw.runtime.activeActorId; });
      if (heroRoute && heroActor && heroRoute.points && heroRoute.points[0]) {
        heroActor.x = heroRoute.points[0].x;
        heroActor.y = heroRoute.points[0].y;
        if (rw.camera) {
          rw.camera.x = heroRoute.points[0].x;
          rw.camera.y = heroRoute.points[0].y;
          rw.camera.targetX = rw.camera.x;
          rw.camera.targetY = rw.camera.y;
          rw.camera._overviewFitted = false;
        }
      }
    }

    return state;
  }

  function rehydrateRouteCache(route) {
    var pts = route.points || [];
    if (pts.length < 2) {
      route._totalPixelLength    = 0;
      route._cumulativeDistances = [0];
      route._skinSeed            = route._skinSeed || Math.floor(Math.random() * 1e8);
      return;
    }

    // Attempt re-projection if geo data exists and RouteIngestion is available
    var hasGeo = pts[0].lat != null && pts[0].lng != null;
    var RI = window.SBE && window.SBE.RouteIngestion;
    if (hasGeo && RI && route.metadata && route.metadata.projection) {
      // Re-project so canvas-fit applies to current canvas dimensions
      // (canvas may differ at load time vs save time — re-project is safer)
      var geoPoints = pts.map(function (p) { return { lat: p.lat, lng: p.lng }; });
      var proj = RI.projectLatLngToWorld(geoPoints, window._wos && window._wos.state && window._wos.state.canvas);
      pts.forEach(function (p, i) {
        if (proj.points[i]) { p.x = proj.points[i].x; p.y = proj.points[i].y; }
      });
      route.metadata.projection = proj.projection;
    }

    // Rebuild pixel cumulative distances
    var pixCum = [0];
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i].x - pts[i - 1].x;
      var dy = pts[i].y - pts[i - 1].y;
      pixCum.push(pixCum[i - 1] + Math.hypot(dx, dy));
    }
    route._totalPixelLength    = pixCum[pixCum.length - 1] || 1;
    route._cumulativeDistances = pixCum;
    route._skinSeed            = route._skinSeed || Math.floor(Math.random() * 1e8);
  }

  function downloadScene(state, name) {
    const blob = new Blob([JSON.stringify(serializeScene(state), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = (name || "sbe-scene") + ".json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function saveToLocal(state) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeScene(state)));
  }

  function loadFromLocal() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }

  function loadFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(JSON.parse(String(reader.result)));
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  SBE.SceneManager = {
    applyScene,
    downloadScene,
    loadFromFile,
    loadFromLocal,
    saveToLocal,
    serializeScene
  };
})(window);
