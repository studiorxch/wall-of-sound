(function initSceneManager(global) {
  const SBE = global.SBE = global.SBE || {};
  const STORAGE_KEY = "sbe-scene";

  function serializeScene(state) {
    const textObjects =
      SBE.TextSystem && Array.isArray(state.textObjects)
        ? state.textObjects.map(SBE.TextSystem.serializeTextObject)
        : [];

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
      groups: Array.isArray(state.groups) ? state.groups.slice() : [],
      balls: Array.isArray(state.balls) ? state.balls.slice() : [],
      background: state.backgroundDataUrl,
    };
  }

  function applyScene(state, scene) {
    const lineSystem = SBE.LineSystem;

    state.lines = (scene.lines || []).map(lineSystem.hydrateLine);
    state.textObjectsRaw = Array.isArray(scene.textObjects)
      ? scene.textObjects.slice()
      : [];
    state.textObjects = [];
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
    if (state.collisionMemory) {
      state.collisionMemory.clear();
    }

    return state;
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
