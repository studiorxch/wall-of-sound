// 0508_WOS_SchemaStateSpine_v1.0.0
// Property-level schema layer — defines what each WOS thing is allowed to have,
// what defaults it carries, whether it persists across saves, and what UI control
// should eventually render it.
// Vanilla IIFE — attaches to global SBE.Schemas.
// Load order: registry.js → schemas.js → main.js

(function initSchemas(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── Field descriptor helpers ─────────────────────────────────────────────────
  // p(default)            → persistent field, not runtime
  // r(default)            → runtime-only field, not saved
  // field(opts)           → full descriptor for complex cases
  function p(defaultValue, control, description) {
    return { default: defaultValue, persistent: true, runtime: false, control: control || null, description: description || null };
  }
  function r(defaultValue, control, description) {
    return { default: defaultValue, persistent: false, runtime: true, control: control || null, description: description || null };
  }

  // ── CanvasSchema ─────────────────────────────────────────────────────────────
  // Owns: state.canvas
  var CanvasSchema = {
    width:                 p(1280,   "numberInput",   "Canvas pixel width"),
    height:                p(720,    "numberInput",   "Canvas pixel height"),
    framePreset:           p("16:9", "select",        "Named aspect ratio preset"),
    backgroundColor:       p("#111111", "colorPicker","Canvas background fill"),
    transparentBackground: p(false,  "toggle",        "Render canvas with alpha-transparent background"),
  };

  // ── WorldSchema ──────────────────────────────────────────────────────────────
  // Owns: state.world
  var WorldSchema = {
    mode:      p("gravity",  "select",       "Physics mode — gravity | drift | bounce | off"),
    strength:  p(0.5,        "sliderFloat",  "Gravity / force strength  0–1"),
    direction: p(270,        "sliderDeg",    "Force direction in degrees (270 = down)"),
    layers:    p([],         null,           "Ordered list of layer ids in this world"),
  };

  // ── LayerSchema ──────────────────────────────────────────────────────────────
  // Owns: one entry in state.layers[]
  var LayerSchema = {
    id:             p(null,      null,          "Unique layer id"),
    type:           p("stroke",  "select",      "Layer type — matches Registry.layerTypes"),
    label:          p("Layer",   "textInput",   "Display name"),
    status:         p("active",  "select",      "Registry status id"),
    visible:        p(true,      "toggle",      "Layer visibility"),
    locked:         p(false,     "toggle",      "Prevents edits when true"),
    opacity:        p(1.0,       "sliderFloat", "Layer opacity 0–1"),
    zIndex:         p(0,         "numberInput", "Stacking order"),
    depth:          p(0,         "sliderFloat", "Parallax / z-depth hint"),
    source:         p(null,      null,          "Data source id or null"),
    renderer:       p("canvas2d","select",      "Renderer id — matches Registry.renderers"),
    audioChannelId: p(null,      "select",      "Bound audio channel id or null"),
  };

  // ── ChannelSchema ─────────────────────────────────────────────────────────────
  // Owns: one entry in state.audio.channels[]
  var ChannelSchema = {
    id:     p(null,    null,          "Unique channel id"),
    label:  p("Ch",   "textInput",   "Display name"),
    status: p("active","select",     "Registry status id"),
    muted:  p(false,   "toggle",     "Channel mute state"),
    volume: p(0.8,     "sliderFloat","Channel volume 0–1"),
    type:   p("tone",  "select",     "Signal type — tone | sample | midi | noise"),
    output: p("master","select",     "Output bus id"),
  };

  // ── ObjectSchemas ─────────────────────────────────────────────────────────────
  // Each object type has its own schema.
  // All share a common base then extend with type-specific fields.

  var ObjectBase = {
    id:             p(null,    null,          "Unique object id"),
    type:           p(null,    null,          "Object type key"),
    layerId:        p(null,    null,          "Parent layer id"),
    visible:        p(true,    "toggle",      "Object visibility"),
    locked:         p(false,   "toggle",      "Prevents interaction when true"),
    opacity:        p(1.0,     "sliderFloat", "Object opacity 0–1"),
    audioChannelId: p(null,    "select",      "Bound channel or null"),
  };

  var StrokeSchema = Object.assign({}, ObjectBase, {
    type:        p("stroke",  null,          "Fixed type key"),
    points:      p([],        null,          "Array of {x,y} control points"),
    color:       p("#ffffff", "colorPicker", "Stroke color"),
    width:       p(2,         "sliderInt",   "Stroke width px"),
    smoothing:   p(0.5,       "sliderFloat", "Catmull-Rom smoothing 0–1"),
    responsive:  p(true,      "toggle",      "Reacts to physics / audio"),
  });

  var BallSchema = Object.assign({}, ObjectBase, {
    type:     p("ball",    null,          "Fixed type key"),
    x:        p(0,         "numberInput", "Position x"),
    y:        p(0,         "numberInput", "Position y"),
    radius:   p(10,        "sliderInt",   "Radius px"),
    color:    p("#ffffff", "colorPicker", "Fill color"),
    mass:     p(1.0,       "sliderFloat", "Physics mass"),
    restitution: p(0.7,    "sliderFloat", "Bounciness 0–1"),
    velocityX: r(0,        null,          "Current x velocity — runtime only"),
    velocityY: r(0,        null,          "Current y velocity — runtime only"),
  });

  var TextSchema = Object.assign({}, ObjectBase, {
    type:      p("text",    null,          "Fixed type key"),
    content:   p("",        "textArea",    "Text content"),
    x:         p(0,         "numberInput", "Position x"),
    y:         p(0,         "numberInput", "Position y"),
    fontSize:  p(24,        "sliderInt",   "Font size px"),
    fontFamily:p("monospace","select",     "Font family"),
    color:     p("#ffffff", "colorPicker", "Text color"),
    align:     p("left",    "select",      "Text align — left | center | right"),
  });

  var ShapeSchema = Object.assign({}, ObjectBase, {
    type:        p("shape",   null,          "Fixed type key"),
    shapeType:   p("rect",    "select",      "Primitive — rect | ellipse | polygon | line"),
    x:           p(0,         "numberInput", "Position x"),
    y:           p(0,         "numberInput", "Position y"),
    width:       p(100,       "numberInput", "Bounding width px"),
    height:      p(100,       "numberInput", "Bounding height px"),
    fillColor:   p("#333333", "colorPicker", "Fill color"),
    strokeColor: p("#ffffff", "colorPicker", "Stroke color"),
    strokeWidth: p(1,         "sliderInt",   "Stroke width px"),
    rotation:    p(0,         "sliderDeg",   "Rotation degrees"),
  });

  var GridLayerSchema = Object.assign({}, ObjectBase, {
    type:        p("gridLayer", null,         "Fixed type key"),
    columns:     p(16,          "sliderInt",  "Grid columns"),
    rows:        p(9,           "sliderInt",  "Grid rows"),
    cellWidth:   p(80,          "numberInput","Cell width px"),
    cellHeight:  p(80,          "numberInput","Cell height px"),
    lineColor:   p("#333333",  "colorPicker", "Grid line color"),
    lineWidth:   p(1,           "sliderInt",  "Grid line width px"),
    snapEnabled: p(true,        "toggle",     "Objects snap to grid cells"),
  });

  // ── ToolDefaultsSchema ────────────────────────────────────────────────────────
  // Default property values applied when a tool creates a new object.
  // Keyed by tool id (matches Registry.tools).
  var ToolDefaultsSchema = {
    stroke: {
      color:     p("#ffffff", "colorPicker", "Default stroke color"),
      width:     p(2,         "sliderInt",   "Default stroke width"),
      smoothing: p(0.5,       "sliderFloat", "Default smoothing"),
    },
    ball: {
      radius:      p(10,  "sliderInt",   "Default ball radius"),
      mass:        p(1.0, "sliderFloat", "Default ball mass"),
      restitution: p(0.7, "sliderFloat", "Default restitution"),
    },
    text: {
      fontSize:   p(24,       "sliderInt",  "Default font size"),
      fontFamily: p("monospace","select",   "Default font family"),
    },
    shape: {
      shapeType:   p("rect",    "select",      "Default shape primitive"),
      strokeWidth: p(1,         "sliderInt",   "Default stroke width"),
    },
    select: {},
    eraser: {},
    pan:    {},
  };

  // ── RuntimeSchema ─────────────────────────────────────────────────────────────
  // Describes live runtime state — none of this is persisted in saves.
  var RuntimeSchema = {

    transport: {
      playing:    r(false,  null, "Playback running"),
      recording:  r(false,  null, "Record mode active"),
      bpm:        r(120,    null, "Current BPM"),
      beat:       r(0,      null, "Current beat count"),
      bar:        r(0,      null, "Current bar count"),
      elapsed:    r(0,      null, "Elapsed ms since play start"),
      loopStart:  r(null,   null, "Loop region start beat or null"),
      loopEnd:    r(null,   null, "Loop region end beat or null"),
    },

    selection: {
      activeId:       r(null, null, "Single-selected object id"),
      multiIds:       r([],   null, "Multi-selected object id array"),
      hoveredId:      r(null, null, "Currently hovered object id"),
      dragInProgress: r(false,null, "Drag gesture active"),
    },

    cache: {
      collisionMemory: r({}, null, "Object-pair collision state map"),
      midiCartridges:  r({}, null, "Loaded MIDI cartridge data keyed by id"),
      gridBanks:       r({}, null, "Grid cell state banks keyed by layer id"),
    },

    pointer: {
      x:       r(0,     null, "Canvas-space pointer x"),
      y:       r(0,     null, "Canvas-space pointer y"),
      down:    r(false, null, "Primary pointer button held"),
      tool:    r(null,  null, "Active tool id"),
    },

    camera: {
      x:    r(0,   null, "Camera pan offset x"),
      y:    r(0,   null, "Camera pan offset y"),
      zoom: r(1.0, null, "Camera zoom scale"),
    },

    ui: {
      activePanelId:   r(null,  null, "Currently focused panel id"),
      inspectorTarget: r(null,  null, "Object or layer id shown in inspector"),
      devHudVisible:   r(false, null, "Dev HUD overlay visible"),
      modalId:         r(null,  null, "Open modal id or null"),
    },
  };

  // ── SignalActivitySchema ──────────────────────────────────────────────────────
  // Owns: state.signalActivity
  var SignalActivitySchema = {
    active:  r(null,  null, "Map<cellId, SignalRecord> — live activations"),
    pending: r([],    null, "Delayed neighbor activations array"),
  };

  // ── LayerControlSchema ────────────────────────────────────────────────────────
  // Owns: one entry in state.layerControls
  var LayerControlSchema = {
    visible: p(true,  "toggle",      "Layer is rendered"),
    opacity: p(1.0,   "sliderFloat", "Layer global opacity 0–1"),
    solo:    r(false, null,          "Solo mode — only this layer renders"),
  };

  // ── InfiniteWorldSchema ───────────────────────────────────────────────────────
  // Owns: state.infiniteWorld
  var InfiniteWorldSchema = {
    enabled:        r(false,        null,          "IW currently running"),
    autoStart:      p(false,        "toggle",      "Auto-start IW on page load"),
    density:        p(0.35,         "sliderFloat", "Cell density 0–1"),
    energy:         p(0.45,         "sliderFloat", "Activation energy 0–1"),
    tickMs:         p(180,          "numberInput", "Tick interval ms"),
    maxEvents:      p(260,          "numberInput", "Max events per cycle"),
    beatCursor:     r(0,            null,          "Current beat position"),
    sourceIndex:    r(0,            null,          "Current source event index"),
    mode:           p("sparseField","select",      "IW generation mode"),
    simulatedAudio: p(true,         "toggle",      "Simulate audio events"),
    terrainBankId:  r(null,         null,          "Active terrain bank id"),
    terrainLayerId: r(null,         null,          "Active terrain layer id"),
    probeId:        r(null,         null,          "Active probe id"),
  };

  // ── PlayableCellSignalSchema ──────────────────────────────────────────────────
  // Owns: block._signal (runtime, per-block)
  var PlayableCellSignalSchema = {
    energy:         r(0,       null, "Current normalized signal energy 0–1"),
    type:           r("origin",null, "Signal hierarchy — origin | neighbor"),
    velocity:       r(0,       null, "Normalized MIDI velocity 0–1"),
    active:         r(false,   null, "True during attack phase"),
    attackProgress: r(0,       null, "Attack phase progress 0–1"),
    startedAt:      r(0,       null, "Activation timestamp ms"),
    release:        r(0,       null, "Release tail energy 0–1"),
  };

  // ── RouteWorldSchema ─────────────────────────────────────────────────────────
  // Owns: state.routeWorld.world
  var RouteWorldSchema = {
    id:             p(null,             null,    "Unique route-world id"),
    name:           p("Untitled Route World", "textInput", "Display name"),
    version:        p("1.0.0",          null,    "Schema version"),
    provider: {
      type:         p("manual",         "select","manual | geojson | mapbox | osm | google"),
      sourceId:     p(null,             null,    "External map source id"),
      attribution:  p("",              "textInput","Attribution string"),
    },
    routeId:        p(null,             null,    "Active route id"),
    activeCameraId: p("route-follow",   "select","Active camera rig id"),
    durationSec:    p(7200,             "numberInput","World playback duration seconds"),
    loopMode:       p("destination",    "select","destination | loop | infinite"),
    mood:           p("night-drive",    "select","World mood preset"),
    timeOfDay:      p("night",          "select","Time of day"),
    weather:        p("clear",          "select","Weather state"),
    layers: {
      map:          p(true,  "toggle", "Map base layer visible"),
      skin:         p(true,  "toggle", "Skin render layer visible"),
      traffic:      p(true,  "toggle", "Traffic layer visible"),
      ecology:      p(true,  "toggle", "Ecology layer visible"),
      events:       p(true,  "toggle", "Event zone markers visible"),
      surfaces:     p(true,  "toggle", "Surface anchors visible"),
      subway:       p(false, "toggle", "Subway underlay visible"),
    },
  };

  // ── RouteSchema ───────────────────────────────────────────────────────────────
  // Owns: one entry in state.routeWorld.routes[]
  var RouteSchema = {
    id:              p(null,          null,         "Unique route id"),
    name:            p("Route",       "textInput",  "Display name"),
    start: {
      label:         p("Home",        "textInput",  "Start label"),
      lat:           p(null,          null,         "Start latitude"),
      lng:           p(null,          null,         "Start longitude"),
      x:             p(0,             "numberInput","Start x px"),
      y:             p(0,             "numberInput","Start y px"),
    },
    end: {
      label:         p("Destination", "textInput",  "End label"),
      lat:           p(null,          null,         "End latitude"),
      lng:           p(null,          null,         "End longitude"),
      x:             p(0,             "numberInput","End x px"),
      y:             p(0,             "numberInput","End y px"),
    },
    distanceMeters:  p(0,    "numberInput", "Total route distance in meters"),
    durationSec:     p(7200, "numberInput", "Route travel time in seconds"),
    points:          p([],   null,          "Array of {x,y} route waypoints"),
    segments:        p([],   null,          "Array of RouteSegment ids"),
    metadata:        p({},   null,          "Arbitrary provider metadata"),
  };

  // ── RouteSegmentSchema ────────────────────────────────────────────────────────
  // Owns: one entry in state.routeWorld.segments[]
  var RouteSegmentSchema = {
    id:                   p(null,       null,         "Unique segment id"),
    index:                p(0,          "numberInput","Segment index along route"),
    type:                 p("road",     "select",     "local | road | highway | bridge | tunnel | waterfront | forest | industrial"),
    startT:               p(0,          null,         "Normalized start t along route 0–1"),
    endT:                 p(1,          null,         "Normalized end t along route 0–1"),
    startDistanceMeters:  p(0,          null,         "Distance from route start (meters)"),
    endDistanceMeters:    p(0,          null,         "Distance from route end (meters)"),
    speedLimitKph:        p(50,         "numberInput","Speed limit km/h"),
    mood:                 p("neutral",  "select",     "Segment mood preset"),
    density:              p(0.35,       "sliderFloat","Environmental density 0–1"),
    cameraHint:           p("follow",   "select",     "Camera behavior hint"),
    skinHint:             p("suburban", "select",     "Skin renderer hint"),
    eventPoolIds:         p([],         null,         "Attached event pool ids"),
  };

  // ── RouteActorSchema ──────────────────────────────────────────────────────────
  // Owns: one entry in state.routeWorld.actors[]
  var RouteActorSchema = {
    id:      p(null,      null,        "Unique actor id"),
    type:    p("vehicle", "select",    "vehicle | pedestrian | bird | fish | train | boat"),
    role:    p("hero-car","select",    "Actor role"),
    routeId: p(null,      null,        "Bound route id"),
    t:       r(0,         null,        "Normalized progress along route 0–1"),
    speed:   r(1,         null,        "Speed multiplier"),
    x:       r(0,         null,        "Current canvas x"),
    y:       r(0,         null,        "Current canvas y"),
    heading: r(0,         null,        "Current heading radians"),
    visual: {
      color:  p("#f6d36b", "colorPicker","Actor color"),
      radius: p(8,         "sliderInt", "Actor dot radius px"),
      trail:  p(true,      "toggle",    "Render trail"),
      halo:   p(true,      "toggle",    "Render halo glow"),
    },
    audio: {
      enabled: p(false,    "toggle",    "Audio output active"),
      role:    p("traffic","select",    "Audio role"),
    },
  };

  // ── RouteEventZoneSchema ──────────────────────────────────────────────────────
  // Owns: one entry in state.routeWorld.eventZones[]
  var RouteEventZoneSchema = {
    id:           p(null,       null,         "Unique zone id"),
    label:        p("Event Zone","textInput", "Display label"),
    routeId:      p(null,       null,         "Bound route id"),
    t:            p(0,          null,         "Normalized trigger t along route 0–1"),
    radiusMeters: p(100,        "numberInput","Trigger radius in meters"),
    type:         p("ambient",  "select",     "traffic | weather | wildlife | music | surface | surreal | ambient"),
    rarity:       p(1,          "sliderFloat","Trigger probability 0–1"),
    cooldownSec:  p(300,        "numberInput","Cooldown between triggers (seconds)"),
    conditions: {
      weather:      p([], null, "Required weather states (empty = any)"),
      timeOfDay:    p([], null, "Required time-of-day values (empty = any)"),
      segmentTypes: p([], null, "Required segment types (empty = any)"),
    },
    actions:           p([],   null, "Array of action descriptors"),
    lastTriggeredAt:   r(0,    null, "Timestamp of last trigger (ms)"),
  };

  // ── RouteSkinSchema ───────────────────────────────────────────────────────────
  // Owns: one entry in state.routeWorld.skins[]
  var RouteSkinSchema = {
    id:                p(null,          null,    "Unique skin id"),
    routeWorldId:      p(null,          null,    "Owning route-world id"),
    style:             p("wos-map",     "select","wos-map | bauhaus-city | night-drive | candy-city"),
    buildingDensity:   p(0.35, "sliderFloat",    "Building density 0–1"),
    waterDensity:      p(0.15, "sliderFloat",    "Water feature density 0–1"),
    greenDensity:      p(0.2,  "sliderFloat",    "Green zone density 0–1"),
    roadRenderMode:    p("signal-line",  "select","Road render style"),
    buildingRenderMode:p("grid-symbol", "select","Building render style"),
    waterRenderMode:   p("organic-void","select","Water render style"),
    paletteId:         p("nightMap",    "select","Palette id"),
    glyphSystemId:     p("bauhaus",     "select","Glyph system id"),
  };

  // ── CameraRigSchema ───────────────────────────────────────────────────────────
  // Owns: one entry in state.routeWorld.cameraRigs[]
  var CameraRigSchema = {
    id:            p("route-follow", null,    "Camera rig id"),
    mode:          p("follow",       "select","overview | follow | dual | infinite"),
    targetActorId: p("hero-car",     null,    "Actor id to follow"),
    zoom:          r(1.8,            null,    "Current zoom"),
    targetZoom:    r(1.8,            null,    "Target zoom (interpolated towards)"),
    lookAhead:     p(0.035, "sliderFloat",    "Normalized look-ahead offset 0–1"),
    smoothing:     p(0.08,  "sliderFloat",    "Camera smoothing 0–1"),
    drift:         p(0.15,  "sliderFloat",    "Camera drift factor 0–1"),
    viewLayout:    p("single", "select",      "single | dualPortrait | overviewOnly | cameraOnly"),
  };

  // ── SurfaceAnchorSchema ───────────────────────────────────────────────────────
  // Owns: one entry in state.routeWorld.surfaceAnchors[]
  var SurfaceAnchorSchema = {
    id:                  p(null,      null,         "Unique anchor id"),
    routeWorldId:        p(null,      null,         "Owning route-world id"),
    type:                p("wall",    "select",     "wall | billboard | subway-wall | roof | parking-lot | tunnel"),
    label:               p("Surface", "textInput",  "Display label"),
    x:                   p(0,         "numberInput","Canvas x"),
    y:                   p(0,         "numberInput","Canvas y"),
    lat:                 p(null,      null,         "Geo latitude"),
    lng:                 p(null,      null,         "Geo longitude"),
    width:               p(640,       "numberInput","Surface width px"),
    height:              p(360,       "numberInput","Surface height px"),
    surfaceId:           p(null,      null,         "Bound WOS surface id"),
    visibleFromRouteT:   p(0,         null,         "Normalized t at which anchor becomes visible"),
  };

  // ── Attach ───────────────────────────────────────────────────────────────────
  SBE.Schemas = {
    Canvas:      CanvasSchema,
    World:       WorldSchema,
    Layer:       LayerSchema,
    Channel:     ChannelSchema,
    Objects: {
      base:      ObjectBase,
      stroke:    StrokeSchema,
      ball:      BallSchema,
      text:      TextSchema,
      shape:     ShapeSchema,
      gridLayer: GridLayerSchema,
    },
    ToolDefaults:       ToolDefaultsSchema,
    Runtime:            RuntimeSchema,
    SignalActivity:     SignalActivitySchema,
    LayerControl:       LayerControlSchema,
    InfiniteWorld:      InfiniteWorldSchema,
    PlayableCellSignal: PlayableCellSignalSchema,
    RouteWorld:         RouteWorldSchema,
    Route:              RouteSchema,
    RouteSegment:       RouteSegmentSchema,
    RouteActor:         RouteActorSchema,
    RouteEventZone:     RouteEventZoneSchema,
    RouteSkin:          RouteSkinSchema,
    CameraRig:          CameraRigSchema,
    SurfaceAnchor:      SurfaceAnchorSchema,
  };

  console.log("[WOS Schemas] Loaded —",
    Object.keys(SBE.Schemas).length, "top-level schemas,",
    Object.keys(SBE.Schemas.Objects).length - 1, "object types,",
    "signal/layer/IW/routeWorld schemas registered"
  );
})(window);
