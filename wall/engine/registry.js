// 0508_WOS_RegistryStatusSpine_v1.0.0
// Architecture truth layer — registry of WOS systems, tools, commands, modes,
// layer types, renderers, and channels.
// Vanilla IIFE — attaches to global SBE.Registry.

(function initRegistry(global) {
  "use strict";

  var SBE = (global.SBE = global.SBE || {});

  // ── Statuses ─────────────────────────────────────────────────────────────────
  var statuses = {
    active:       { id: "active",       label: "Active",       signal: "normal",   showInUserUI: true,  showInDevUI: true  },
    selected:     { id: "selected",     label: "Selected",     signal: "accent",   showInUserUI: true,  showInDevUI: true  },
    available:    { id: "available",    label: "Available",    signal: "quiet",    showInUserUI: true,  showInDevUI: true  },
    experimental: { id: "experimental", label: "Experimental", signal: "muted",    showInUserUI: false, showInDevUI: true  },
    legacy:       { id: "legacy",       label: "Legacy",       signal: "muted",    showInUserUI: false, showInDevUI: true  },
    disabled:     { id: "disabled",     label: "Disabled",     signal: "disabled", showInUserUI: false, showInDevUI: true  },
    unhooked:     { id: "unhooked",     label: "Unhooked",     signal: "flagged",  showInUserUI: false, showInDevUI: true  },
    error:        { id: "error",        label: "Error",        signal: "error",    showInUserUI: false, showInDevUI: true  },
  };

  // ── Systems ──────────────────────────────────────────────────────────────────
  var systems = {
    canvas: {
      id: "canvas",
      label: "Canvas",
      status: "active",
      ownsState: "state.canvas",
      description: "Scene canvas dimensions, camera transform, surface stamp layer",
      visibleIn: ["canvasPanel", "devHud"],
    },
    world: {
      id: "world",
      label: "World",
      status: "active",
      ownsState: "state.world",
      description: "Physics mode, gravity strength, world layers (grid environment)",
      visibleIn: ["inspectorWorld", "devHud"],
    },
    objects: {
      id: "objects",
      label: "Objects",
      status: "active",
      ownsState: "state.strokes, state.lines, state.shapes, state.textObjects, state.balls",
      description: "All scene objects — strokes, shapes, text, balls",
      visibleIn: ["inspectorObject", "devHud"],
    },
    sound: {
      id: "sound",
      label: "Sound",
      status: "active",
      ownsState: "state.audio, state.soundResponse",
      description: "Audio engine, note dispatch, MIDI out, sample banks",
      visibleIn: ["inspectorObject", "devHud"],
    },
    transport: {
      id: "transport",
      label: "Transport",
      status: "active",
      ownsState: "state.transport, state.loop",
      description: "Playback timing, loop recording, BPM, bar count",
      visibleIn: ["transportBar", "devHud"],
    },
    selection: {
      id: "selection",
      label: "Selection",
      status: "active",
      ownsState: "state.selection, state.multiSelection",
      description: "Single and multi-selection, group membership",
      visibleIn: ["inspectorObject", "devHud"],
    },
    cache: {
      id: "cache",
      label: "Cache",
      status: "active",
      ownsState: "state.collisionMemory, state.midiCartridges, state.gridBanks",
      description: "Collision memory, MIDI cartridge cache, grid bank cache",
      visibleIn: ["devHud"],
    },
    devHud: {
      id: "devHud",
      label: "Dev HUD",
      status: "experimental",
      ownsState: "state.debug",
      description: "Debug overlay — walkers, paths, info",
      visibleIn: ["devHud"],
    },
    grid: {
      id: "grid",
      label: "Grid System",
      status: "active",
      ownsState: "state.world.layers, state.gridBanks",
      description: "MIDI → Grid Layer environment map, block library, playback bridge",
      visibleIn: ["inspectorWorld", "devHud"],
    },
    midi: {
      id: "midi",
      label: "MIDI Import",
      status: "active",
      ownsState: "state.midiCartridges, state.midiBanks, state.midiPoints",
      description: "MIDI file import, cartridge parsing, bank wrappers, note projection",
      visibleIn: ["inspectorObject", "devHud"],
    },
    material: {
      id: "material",
      label: "Material System",
      status: "active",
      ownsState: "line.material",
      description: "Rigid, oscillating, pendulum, elastic material types on lines",
      visibleIn: ["inspectorObject", "devHud"],
    },
    walkers: {
      id: "walkers",
      label: "Walkers",
      status: "active",
      ownsState: "state.walkers",
      description: "Path-following walkers with audio trigger, MIDI cartridge tick",
      visibleIn: ["inspectorObject", "devHud"],
    },
  };

  // ── Tools ────────────────────────────────────────────────────────────────────
  var tools = {
    pen: {
      id: "pen",
      label: "Pen",
      status: "active",
      kind: "create",
      icon: "✏",
      creates: "stroke",
      toolbarProperties: ["color", "thickness", "note", "sound"],
      visibleIn: ["toolbar", "devHud"],
    },
    text: {
      id: "text",
      label: "Text",
      status: "available",
      kind: "create",
      icon: "T",
      creates: "textObject",
      toolbarProperties: ["color", "fontSize", "fontFile"],
      visibleIn: ["toolbar", "devHud"],
    },
    ball: {
      id: "ball",
      label: "Ball",
      status: "available",
      kind: "create",
      icon: "●",
      creates: "ball",
      toolbarProperties: ["color", "radius", "velocity"],
      visibleIn: ["toolbar", "devHud"],
    },
    select: {
      id: "select",
      label: "Select",
      status: "active",
      kind: "select",
      icon: "↖",
      creates: null,
      toolbarProperties: [],
      visibleIn: ["toolbar", "devHud"],
    },
    lineTool: {
      id: "lineTool",
      label: "Line",
      status: "available",
      kind: "create",
      icon: "/",
      creates: "line",
      toolbarProperties: ["color", "note", "behavior", "mechanic"],
      visibleIn: ["toolbar", "devHud"],
    },
    midiImport: {
      id: "midiImport",
      label: "MIDI Import",
      status: "active",
      kind: "import",
      icon: "♪",
      creates: "midiCartridge",
      toolbarProperties: [],
      visibleIn: ["dropZone", "devHud"],
    },
    generateBauhausGrid: {
      id: "generateBauhausGrid",
      label: "Generate Bauhaus Grid",
      status: "experimental",
      kind: "generate",
      icon: "⊞",
      creates: "gridLayer",
      toolbarProperties: ["columns", "rows", "placementMode", "blockStyle", "fitMode"],
      visibleIn: ["inspectorWorld", "devHud"],
    },
  };

  // ── Commands ─────────────────────────────────────────────────────────────────
  var commands = {
    duplicateSelection: {
      id: "duplicateSelection",
      label: "Duplicate Selection",
      status: "active",
      shortcut: "Cmd+D",
      group: "edit",
      requires: "selection",
      visibleIn: ["contextMenu", "devHud"],
      hooked: true,
    },
    deleteSelection: {
      id: "deleteSelection",
      label: "Delete Selection",
      status: "active",
      shortcut: "Delete / Backspace",
      group: "edit",
      requires: "selection",
      visibleIn: ["contextMenu", "devHud"],
      hooked: true,
    },
    groupSelection: {
      id: "groupSelection",
      label: "Group Selection",
      status: "available",
      shortcut: "Cmd+G",
      group: "edit",
      requires: "multiSelection",
      visibleIn: ["contextMenu", "devHud"],
      hooked: true,
    },
    ungroupSelection: {
      id: "ungroupSelection",
      label: "Ungroup Selection",
      status: "available",
      shortcut: "Cmd+Shift+G",
      group: "edit",
      requires: "groupSelection",
      visibleIn: ["contextMenu", "devHud"],
      hooked: true,
    },
    undo: {
      id: "undo",
      label: "Undo",
      status: "active",
      shortcut: "Cmd+Z",
      group: "history",
      requires: null,
      visibleIn: ["contextMenu", "devHud"],
      hooked: true,
    },
    redo: {
      id: "redo",
      label: "Redo",
      status: "unhooked",
      shortcut: "Cmd+Shift+Z",
      group: "history",
      requires: null,
      visibleIn: ["devHud"],
      hooked: false,
    },
    selectAll: {
      id: "selectAll",
      label: "Select All",
      status: "active",
      shortcut: "Cmd+A",
      group: "selection",
      requires: null,
      visibleIn: ["devHud"],
      hooked: true,
    },
    addBankToGridLayer: {
      id: "addBankToGridLayer",
      label: "Add Bank to Grid Layer",
      status: "active",
      shortcut: null,
      group: "grid",
      requires: "midiCartridge",
      visibleIn: ["inspectorWorld", "devHud"],
      hooked: true,
    },
    regenerateGrid: {
      id: "regenerateGrid",
      label: "Regenerate Grid",
      status: "active",
      shortcut: null,
      group: "grid",
      requires: "gridLayer",
      visibleIn: ["inspectorWorld", "devHud"],
      hooked: true,
    },
  };

  // ── Modes ────────────────────────────────────────────────────────────────────
  var modes = {
    select: {
      id: "select",
      label: "Select",
      status: "active",
      visibleIn: ["toolbar", "devHud"],
    },
    transform: {
      id: "transform",
      label: "Transform",
      status: "available",
      visibleIn: ["toolbar", "devHud"],
    },
    camera: {
      id: "camera",
      label: "Camera",
      status: "available",
      visibleIn: ["devHud"],
    },
    draw: {
      id: "draw",
      label: "Draw",
      status: "active",
      visibleIn: ["toolbar", "devHud"],
    },
    performance: {
      id: "performance",
      label: "Performance",
      status: "available",
      visibleIn: ["devHud"],
    },
    presentation: {
      id: "presentation",
      label: "Presentation",
      status: "available",
      visibleIn: ["devHud"],
    },
  };

  // ── Layer Types ──────────────────────────────────────────────────────────────
  var layerTypes = {
    background: {
      id: "background",
      label: "Background",
      status: "active",
      family: "visual",
      visibleIn: ["inspectorFrame", "devHud"],
    },
    grid: {
      id: "grid",
      label: "Grid Layer",
      status: "active",
      family: "visual",
      visibleIn: ["inspectorWorld", "devHud"],
    },
    objectLayer: {
      id: "objectLayer",
      label: "Object Layer",
      status: "active",
      family: "visual",
      visibleIn: ["devHud"],
    },
    interactionOverlay: {
      id: "interactionOverlay",
      label: "Interaction Overlay",
      status: "active",
      family: "overlay",
      visibleIn: ["devHud"],
    },
    dataOverlay: {
      id: "dataOverlay",
      label: "Data Overlay",
      status: "experimental",
      family: "data",
      visibleIn: ["devHud"],
    },
    devOverlay: {
      id: "devOverlay",
      label: "Dev Overlay",
      status: "experimental",
      family: "dev",
      visibleIn: ["devHud"],
    },
  };

  // ── Renderers ────────────────────────────────────────────────────────────────
  var renderers = {
    squareTiles: {
      id: "squareTiles",
      label: "Square Tiles",
      status: "active",
      appliesTo: ["grid"],
      visibleIn: ["inspectorWorld", "devHud"],
    },
    bauhausMinimal: {
      id: "bauhausMinimal",
      label: "Bauhaus Minimal",
      status: "experimental",
      appliesTo: ["grid", "objectLayer"],
      visibleIn: ["devHud"],
    },
  };

  // ── Channels ─────────────────────────────────────────────────────────────────
  var channels = {
    master: {
      id: "master",
      label: "Master",
      status: "active",
      type: "audio",
      visibleIn: ["devHud"],
    },
    gridNotes: {
      id: "gridNotes",
      label: "Grid Notes",
      status: "active",
      type: "eventAudio",
      visibleIn: ["inspectorWorld", "devHud"],
    },
    collisions: {
      id: "collisions",
      label: "Collisions",
      status: "active",
      type: "eventAudio",
      visibleIn: ["devHud"],
    },
    walkers: {
      id: "walkers",
      label: "Walkers",
      status: "active",
      type: "eventAudio",
      visibleIn: ["devHud"],
    },
    ambient: {
      id: "ambient",
      label: "Ambient",
      status: "unhooked",
      type: "audio",
      visibleIn: ["devHud"],
    },
    midiOut: {
      id: "midiOut",
      label: "MIDI Out",
      status: "available",
      type: "midi",
      visibleIn: ["devHud"],
    },
  };

  // ── Validation ───────────────────────────────────────────────────────────────
  function validateRegistry() {
    var registry = SBE.Registry;
    var errors = [];
    var warnings = [];

    function checkGroup(groupName) {
      var group = registry[groupName] || {};
      Object.keys(group).forEach(function (id) {
        var item = group[id];
        if (!item.id)     warnings.push(groupName + "." + id + " missing id");
        if (!item.label)  warnings.push(groupName + "." + id + " missing label");
        if (!item.status) warnings.push(groupName + "." + id + " missing status");
        if (item.status && !registry.statuses[item.status]) {
          errors.push(groupName + "." + id + " has unknown status: " + item.status);
        }
      });
    }

    ["systems", "tools", "commands", "modes", "layerTypes", "renderers", "channels"]
      .forEach(checkGroup);

    return { errors: errors, warnings: warnings };
  }

  // ── Attach ───────────────────────────────────────────────────────────────────
  SBE.Registry = {
    statuses:   statuses,
    systems:    systems,
    tools:      tools,
    commands:   commands,
    modes:      modes,
    layerTypes: layerTypes,
    renderers:  renderers,
    channels:   channels,
    validate:   validateRegistry,
  };

  console.log("[WOS Registry] Loaded —",
    Object.keys(systems).length, "systems,",
    Object.keys(tools).length, "tools,",
    Object.keys(commands).length, "commands,",
    Object.keys(channels).length, "channels"
  );
})(window);
