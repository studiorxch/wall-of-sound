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
    ToolDefaults: ToolDefaultsSchema,
    Runtime:      RuntimeSchema,
  };

  console.log("[WOS Schemas] Loaded —",
    Object.keys(SBE.Schemas).length, "top-level schemas,",
    Object.keys(SBE.Schemas.Objects).length - 1, "object types"  // -1 for base
  );
})(window);
