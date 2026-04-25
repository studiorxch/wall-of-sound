(function initTextSystem(global) {
  const SBE = (global.SBE = global.SBE || {});
  const DEFAULT_FONT = "Wallace_Default, sans-serif";
  const FONT_SCRIPT_SRC =
    "https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const fontCache = new Map();
  let textId = 0;
  let opentypePromise = null;
  let measurementSvg = null;

  function nextTextId() {
    textId += 1;
    return "text-" + textId;
  }

  async function createTextObject(textSettings, lineSettings) {
    const fontFile = textSettings.font.file || null;

    const geometry = await buildGeometry(
      textSettings.value,
      fontFile,
      textSettings.font.size,
    );
    const behaviorType =
      lineSettings.behavior.type === "none"
        ? "normal"
        : lineSettings.behavior.type;

    return attachRuntime({
      id: nextTextId(),
      type: "text",
      value: textSettings.value,
      font: {
        file: textSettings.font.file,
        name: textSettings.font.name || "Uploaded font",
        size: textSettings.font.size,
      },
      transform: {
        x: textSettings.transform.x,
        y: textSettings.transform.y,
        scale: textSettings.transform.scale,
        rotation: textSettings.transform.rotation,
      },
      interaction: {
        mode: textSettings.interaction.mode,
      },
      midiChannel: lineSettings.midiChannel,
      note: lineSettings.note,
      velocityRange: [
        lineSettings.velocityRange[0],
        lineSettings.velocityRange[1],
      ],
      life: lineSettings.life,
      behavior: {
        type: behaviorType,
        strength: lineSettings.behavior.strength,
        velocityMultiplier:
          typeof lineSettings.behavior.velocityMultiplier === "number"
            ? lineSettings.behavior.velocityMultiplier
            : 1,
      },
      color: lineSettings.color,
      thickness: lineSettings.thickness,
      style: {
        color: lineSettings.color,
        colorMode:
          lineSettings.style && lineSettings.style.colorMode
            ? lineSettings.style.colorMode
            : "auto",
        thickness: lineSettings.thickness,
      },
      midi: {
        note: lineSettings.note,
        channel: lineSettings.midiChannel,
      },
      gravity: {
        enabled: !!(lineSettings.gravity && lineSettings.gravity.enabled),
        direction:
          lineSettings.gravity && lineSettings.gravity.direction
            ? lineSettings.gravity.direction
            : "down",
        strength:
          lineSettings.gravity &&
          typeof lineSettings.gravity.strength === "number"
            ? lineSettings.gravity.strength
            : 0,
      },
      groupId: textSettings.groupId || null,
      lastHitAt: 0,
      geometry,
    });
  }

  async function updateTextObject(textObject, textSettings, lineSettings) {
    const needsGeometryRefresh =
      textObject.value !== textSettings.value ||
      textObject.font.file !== textSettings.font.file ||
      textObject.font.size !== textSettings.font.size;

    textObject.value = textSettings.value;
    textObject.font.file = textSettings.font.file;
    textObject.font.name = textSettings.font.name || textObject.font.name;
    textObject.font.size = textSettings.font.size;
    textObject.transform.x = textSettings.transform.x;
    textObject.transform.y = textSettings.transform.y;
    textObject.transform.scale = textSettings.transform.scale;
    textObject.transform.rotation = textSettings.transform.rotation;
    textObject.interaction.mode = textSettings.interaction.mode;
    textObject.midiChannel = lineSettings.midiChannel;
    textObject.note = lineSettings.note;
    textObject.velocityRange = [
      lineSettings.velocityRange[0],
      lineSettings.velocityRange[1],
    ];
    textObject.life = lineSettings.life;
    textObject.behavior.type = lineSettings.behavior.type;
    textObject.behavior.strength = lineSettings.behavior.strength;
    textObject.behavior.velocityMultiplier =
      typeof lineSettings.behavior.velocityMultiplier === "number"
        ? lineSettings.behavior.velocityMultiplier
        : textObject.behavior.velocityMultiplier || 1;
    textObject.color = lineSettings.color;
    textObject.thickness = lineSettings.thickness;
    textObject.style = textObject.style || {};
    textObject.style.color = lineSettings.color;
    textObject.style.colorMode =
      lineSettings.style && lineSettings.style.colorMode
        ? lineSettings.style.colorMode
        : textObject.style.colorMode || "auto";
    textObject.style.thickness = lineSettings.thickness;
    textObject.midi = textObject.midi || {};
    textObject.midi.note = lineSettings.note;
    textObject.midi.channel = lineSettings.midiChannel;
    textObject.gravity = textObject.gravity || {};
    textObject.gravity.enabled = !!(
      lineSettings.gravity && lineSettings.gravity.enabled
    );
    textObject.gravity.direction =
      lineSettings.gravity && lineSettings.gravity.direction
        ? lineSettings.gravity.direction
        : textObject.gravity.direction || "down";
    textObject.gravity.strength =
      lineSettings.gravity && typeof lineSettings.gravity.strength === "number"
        ? lineSettings.gravity.strength
        : textObject.gravity.strength || 0;
    if (typeof textSettings.groupId !== "undefined") {
      textObject.groupId = textSettings.groupId;
    }

    if (needsGeometryRefresh) {
      textObject.geometry = await buildGeometry(
        textObject.value,
        textObject.font.file,
        textObject.font.size,
      );
      attachRuntime(textObject);
    }

    return textObject;
  }

  async function hydrateTextObjects(rawTextObjects) {
    const hydrated = [];

    for (const rawTextObject of rawTextObjects) {
      hydrated.push(await hydrateTextObject(rawTextObject));
    }

    return hydrated;
  }

  async function hydrateTextObject(rawTextObject) {
    if (typeof rawTextObject.id === "string") {
      const match = rawTextObject.id.match(/^text-(\d+)$/);
      if (match) {
        textId = Math.max(textId, Number(match[1]));
      }
    }

    const geometry = await buildGeometry(
      rawTextObject.value || "",
      rawTextObject.font && rawTextObject.font.file
        ? rawTextObject.font.file
        : "",
      rawTextObject.font && rawTextObject.font.size
        ? rawTextObject.font.size
        : 160,
    );

    return attachRuntime({
      id: rawTextObject.id || nextTextId(),
      type: "text",
      value: rawTextObject.value || "",
      font: {
        file:
          rawTextObject.font && rawTextObject.font.file
            ? rawTextObject.font.file
            : "",
        name:
          rawTextObject.font && rawTextObject.font.name
            ? rawTextObject.font.name
            : "Uploaded font",
        size:
          rawTextObject.font && rawTextObject.font.size
            ? rawTextObject.font.size
            : 160,
      },
      transform: {
        x:
          rawTextObject.transform &&
          typeof rawTextObject.transform.x === "number"
            ? rawTextObject.transform.x
            : 540,
        y:
          rawTextObject.transform &&
          typeof rawTextObject.transform.y === "number"
            ? rawTextObject.transform.y
            : 960,
        scale:
          rawTextObject.transform &&
          typeof rawTextObject.transform.scale === "number"
            ? rawTextObject.transform.scale
            : 1,
        rotation:
          rawTextObject.transform &&
          typeof rawTextObject.transform.rotation === "number"
            ? rawTextObject.transform.rotation
            : 0,
      },
      interaction: {
        mode:
          rawTextObject.interaction && rawTextObject.interaction.mode
            ? rawTextObject.interaction.mode
            : "letter",
      },
      midiChannel: rawTextObject.midiChannel || 1,
      note: rawTextObject.note || 60,
      velocityRange: Array.isArray(rawTextObject.velocityRange)
        ? rawTextObject.velocityRange.slice(0, 2)
        : [48, 110],
      life: rawTextObject.life || 128,
      behavior: {
        type:
          rawTextObject.behavior && rawTextObject.behavior.type
            ? rawTextObject.behavior.type
            : "normal",
        strength:
          rawTextObject.behavior &&
          typeof rawTextObject.behavior.strength === "number"
            ? rawTextObject.behavior.strength
            : 1.4,
        velocityMultiplier:
          rawTextObject.behavior &&
          typeof rawTextObject.behavior.velocityMultiplier === "number"
            ? rawTextObject.behavior.velocityMultiplier
            : 1,
      },
      color: rawTextObject.color || "#ff7a59",
      thickness: rawTextObject.thickness || 5,
      style: rawTextObject.style
        ? {
            color:
              rawTextObject.style.color || rawTextObject.color || "#ff7a59",
            colorMode:
              rawTextObject.style.colorMode ||
              rawTextObject.colorMode ||
              "auto",
            thickness:
              rawTextObject.style.thickness || rawTextObject.thickness || 5,
          }
        : undefined,
      midi: rawTextObject.midi
        ? {
            note:
              typeof rawTextObject.midi.note === "number"
                ? rawTextObject.midi.note
                : rawTextObject.note || 60,
            channel:
              typeof rawTextObject.midi.channel === "number"
                ? rawTextObject.midi.channel
                : rawTextObject.midiChannel || 1,
          }
        : undefined,
      gravity: rawTextObject.gravity
        ? {
            enabled: !!rawTextObject.gravity.enabled,
            direction: rawTextObject.gravity.direction || "down",
            strength:
              typeof rawTextObject.gravity.strength === "number"
                ? rawTextObject.gravity.strength
                : 0,
          }
        : undefined,
      groupId: rawTextObject.groupId || null,
      lastHitAt: 0,
      geometry,
    });
  }

  function serializeTextObject(textObject) {
    return {
      id: textObject.id,
      type: "text",
      value: textObject.value,
      font: {
        file: textObject.font.file,
        name: textObject.font.name,
        size: textObject.font.size,
      },
      transform: {
        x: textObject.transform.x,
        y: textObject.transform.y,
        scale: textObject.transform.scale,
        rotation: textObject.transform.rotation,
      },
      interaction: {
        mode: textObject.interaction.mode,
      },
      midiChannel: textObject.midiChannel,
      note: textObject.note,
      velocityRange: [textObject.velocityRange[0], textObject.velocityRange[1]],
      life: textObject.life,
      behavior: {
        type: textObject.behavior.type,
        strength: textObject.behavior.strength,
        velocityMultiplier: textObject.behavior.velocityMultiplier || 1,
      },
      color: textObject.color,
      thickness: textObject.thickness,
      style: textObject.style
        ? {
            color: textObject.style.color,
            colorMode: textObject.style.colorMode,
            thickness: textObject.style.thickness,
          }
        : undefined,
      midi: textObject.midi
        ? {
            note: textObject.midi.note,
            channel: textObject.midi.channel,
          }
        : undefined,
      gravity: textObject.gravity
        ? {
            enabled: !!textObject.gravity.enabled,
            direction: textObject.gravity.direction,
            strength: textObject.gravity.strength,
          }
        : undefined,
      groupId: textObject.groupId || null,
    };
  }

  function attachRuntime(textObject) {
    textObject.geometry.letters.forEach((letter) => {
      letter.path2d = letter.pathData ? new Path2D(letter.pathData) : null;
      letter.lastHitAt = 0;
    });

    textObject.lastHitAt = 0;
    return textObject;
  }

  function applyTransform(textObject, nextTransform, canvas, snapThreshold) {
    const center = getCanvasCenter(canvas);
    const threshold = typeof snapThreshold === "number" ? snapThreshold : 18;

    if (typeof nextTransform.x === "number") {
      textObject.transform.x = nextTransform.x;
    }

    if (typeof nextTransform.y === "number") {
      textObject.transform.y = nextTransform.y;
    }

    if (typeof nextTransform.scale === "number") {
      textObject.transform.scale = Math.max(0.1, nextTransform.scale);
    }

    if (typeof nextTransform.rotation === "number") {
      textObject.transform.rotation = nextTransform.rotation;
    }

    snapTransformToCenter(textObject, center, threshold);
    return textObject;
  }

  function centerTextObject(textObject, canvas) {
    const center = getCanvasCenter(canvas);
    textObject.transform.x = center.x;
    textObject.transform.y = center.y;
    return textObject;
  }

  function hitTestTextObjects(textObjects, point) {
    for (let index = textObjects.length - 1; index >= 0; index -= 1) {
      const textObject = textObjects[index];
      if (containsPoint(textObject, point)) {
        return textObject;
      }
    }

    return null;
  }

  async function buildGeometry(value, fontFile, fontSize) {
    if (!fontFile) {
      return buildCanvasFallbackGeometry(value, fontSize);
    }

    const font = await loadFont(fontFile);
    const letters = buildLetters(font, value, fontSize);
    const bounds = combineBounds(
      letters
        .map((letter) => letter.bounds)
        .filter((boundsItem) => boundsItem && boundsItem.width > 0),
    );

    return {
      letters,
      bounds,
    };
  }

  function buildCanvasFallbackGeometry(value, fontSize) {
    const letters = [];
    let penX = 0;

    for (let i = 0; i < value.length; i++) {
      const char = value[i];

      // approximate width (fast + good enough)
      const width = fontSize * 0.6;

      const bounds = {
        minX: penX,
        minY: -fontSize,
        maxX: penX + width,
        maxY: 0,
        width: width,
        height: fontSize,
        centerX: penX + width * 0.5,
        centerY: -fontSize * 0.5,
      };

      letters.push({
        char,
        pathData: null, // 🚨 no Path2D
        segments: [],
        bounds,
        lastHitAt: 0,
        isFallback: true, // 🔥 flag for renderer
      });

      penX += width;
    }

    return {
      letters,
      bounds: combineBounds(letters.map((l) => l.bounds)),
    };
  }

  function buildLetters(font, value, fontSize) {
    const glyphs = font.stringToGlyphs(value);
    const scale = fontSize / font.unitsPerEm;
    const letters = [];
    let penX = 0;
    let previousGlyph = null;

    glyphs.forEach((glyph, index) => {
      if (previousGlyph && font.getKerningValue) {
        penX += font.getKerningValue(previousGlyph, glyph) * scale;
      }

      const char = value[index] || "";
      const path = glyph.getPath(penX, 0, fontSize);
      const pathData = commandsToPathData(path.commands || []);
      const segments = pathData ? samplePathData(path.commands || [], 4) : [];
      const bounds = segments.length
        ? getBoundsFromSegments(segments)
        : {
            minX: penX,
            minY: 0,
            maxX: penX,
            maxY: 0,
            width: 0,
            height: 0,
            centerX: penX,
            centerY: 0,
          };

      letters.push({
        char,
        pathData,
        segments,
        bounds,
        lastHitAt: 0,
      });

      penX += (glyph.advanceWidth || font.unitsPerEm * 0.35) * scale;
      previousGlyph = glyph;
    });

    return letters;
  }

  function getCollisionLines(textObjects) {
    const collisionLines = [];

    textObjects.forEach((textObject) => {
      textObject.geometry.letters.forEach((letter, letterIndex) => {
        const transformedSegments = letter.segments.map(
          (segment, segmentIndex) => {
            const transformed = transformSegment(segment, textObject);
            return {
              id:
                textObject.id +
                ":" +
                String(letterIndex) +
                ":" +
                String(segmentIndex),
              x1: transformed.x1,
              y1: transformed.y1,
              x2: transformed.x2,
              y2: transformed.y2,
              color: textObject.color,
              thickness: textObject.thickness,
              midiChannel: textObject.midiChannel,
              note: textObject.note,
              velocityRange: [
                textObject.velocityRange[0],
                textObject.velocityRange[1],
              ],
              behavior: {
                type: textObject.behavior.type,
                strength: textObject.behavior.strength,
              },
              sourceType: "text",
              sourceTextObject: textObject,
              sourceLetterIndex: letterIndex,
              collisionGroupId:
                textObject.interaction.mode === "word"
                  ? textObject.id
                  : textObject.id + ":" + String(letterIndex),
            };
          },
        );

        collisionLines.push.apply(collisionLines, transformedSegments);
      });
    });

    return collisionLines;
  }

  function containsPoint(textObject, point) {
    if (!textObject.geometry || !textObject.geometry.bounds) {
      return false;
    }

    const localPoint = inverseTransformPoint(
      point.x,
      point.y,
      textObject.transform,
      textObject.geometry.bounds,
    );

    if (!isPointInBounds(localPoint, textObject.geometry.bounds, 12)) {
      return false;
    }

    for (
      let index = 0;
      index < textObject.geometry.letters.length;
      index += 1
    ) {
      const letter = textObject.geometry.letters[index];
      if (!isPointInBounds(localPoint, letter.bounds, 8)) {
        continue;
      }

      for (
        let segmentIndex = 0;
        segmentIndex < letter.segments.length;
        segmentIndex += 1
      ) {
        if (
          distanceToSegment(localPoint, letter.segments[segmentIndex]) <= 10
        ) {
          return true;
        }
      }
    }

    return false;
  }

  function transformSegment(segment, textObject) {
    const start = transformPoint(
      segment.x1,
      segment.y1,
      textObject.transform,
      textObject.geometry.bounds,
    );
    const end = transformPoint(
      segment.x2,
      segment.y2,
      textObject.transform,
      textObject.geometry.bounds,
    );

    return {
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
    };
  }

  function transformPoint(x, y, transform, bounds) {
    const centeredX = (x - bounds.centerX) * transform.scale;
    const centeredY = (y - bounds.centerY) * transform.scale;
    const angle = (transform.rotation * Math.PI) / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);

    return {
      x: centeredX * cosine - centeredY * sine + transform.x,
      y: centeredX * sine + centeredY * cosine + transform.y,
    };
  }

  function inverseTransformPoint(x, y, transform, bounds) {
    const translatedX = x - transform.x;
    const translatedY = y - transform.y;
    const angle = (-transform.rotation * Math.PI) / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const rotatedX = translatedX * cosine - translatedY * sine;
    const rotatedY = translatedX * sine + translatedY * cosine;
    const scale = transform.scale || 1;

    return {
      x: rotatedX / scale + bounds.centerX,
      y: rotatedY / scale + bounds.centerY,
    };
  }

  function markHit(textObject, letterIndex, now) {
    if (textObject.interaction.mode === "word") {
      textObject.lastHitAt = now;
      return;
    }

    const letter = textObject.geometry.letters[letterIndex];
    if (letter) {
      letter.lastHitAt = now;
    }
  }

  async function loadFont(fontSource) {
    if (!fontSource) {
      throw new Error("Missing font source.");
    }

    if (!fontCache.has(fontSource)) {
      fontCache.set(
        fontSource,
        (async function parseFontSource() {
          const opentype = await ensureOpenType();
          const arrayBuffer = await sourceToArrayBuffer(fontSource);
          return opentype.parse(arrayBuffer);
        })(),
      );
    }

    return fontCache.get(fontSource);
  }

  function ensureOpenType() {
    if (global.opentype) {
      return Promise.resolve(global.opentype);
    }

    if (opentypePromise) {
      return opentypePromise;
    }

    opentypePromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = FONT_SCRIPT_SRC;
      script.async = true;
      script.onload = function onLoad() {
        if (global.opentype) {
          resolve(global.opentype);
          return;
        }

        reject(new Error("opentype.js loaded but is unavailable."));
      };
      script.onerror = function onError() {
        reject(new Error("Failed to load opentype.js."));
      };
      document.head.appendChild(script);
    });

    return opentypePromise;
  }

  async function sourceToArrayBuffer(source) {
    if (source.indexOf("data:") === 0) {
      const payload = source.split(",")[1] || "";
      const binary = global.atob(payload);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      return bytes.buffer;
    }

    const response = await fetch(source);
    if (!response.ok) {
      throw new Error("Unable to fetch font.");
    }
    return response.arrayBuffer();
  }

  function samplePathData(commands, resolution) {
    const segments = [];
    const svg = getMeasurementSvg();
    const subpathCommands = splitCommandsBySubpath(commands);

    subpathCommands.forEach((commandSet) => {
      const pathData = commandsToPathData(commandSet);
      if (!pathData) {
        return;
      }

      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", pathData);
      svg.appendChild(path);

      try {
        const length = path.getTotalLength();
        const stepCount = Math.max(8, Math.ceil(length / resolution));
        const points = [];

        for (let index = 0; index <= stepCount; index += 1) {
          const point = path.getPointAtLength((index / stepCount) * length);
          points.push({ x: point.x, y: point.y });
        }

        segments.push.apply(segments, pointsToSegments(points));
      } finally {
        svg.removeChild(path);
      }
    });

    return segments;
  }

  function splitCommandsBySubpath(commands) {
    const groups = [];
    let current = [];

    commands.forEach((command) => {
      if (command.type === "M" && current.length) {
        groups.push(current);
        current = [command];
        return;
      }

      current.push(command);
    });

    if (current.length) {
      groups.push(current);
    }

    return groups;
  }

  function commandsToPathData(commands) {
    return commands
      .map((command) => {
        switch (command.type) {
          case "M":
          case "L":
            return command.type + " " + command.x + " " + command.y;
          case "C":
            return (
              "C " +
              command.x1 +
              " " +
              command.y1 +
              " " +
              command.x2 +
              " " +
              command.y2 +
              " " +
              command.x +
              " " +
              command.y
            );
          case "Q":
            return (
              "Q " +
              command.x1 +
              " " +
              command.y1 +
              " " +
              command.x +
              " " +
              command.y
            );
          case "Z":
            return "Z";
          default:
            return "";
        }
      })
      .filter(Boolean)
      .join(" ");
  }

  function pointsToSegments(points) {
    const segments = [];

    for (let index = 0; index < points.length - 1; index += 1) {
      segments.push({
        x1: points[index].x,
        y1: points[index].y,
        x2: points[index + 1].x,
        y2: points[index + 1].y,
      });
    }

    return segments;
  }

  function getBoundsFromSegments(segments) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    segments.forEach((segment) => {
      minX = Math.min(minX, segment.x1, segment.x2);
      minY = Math.min(minY, segment.y1, segment.y2);
      maxX = Math.max(maxX, segment.x1, segment.x2);
      maxY = Math.max(maxY, segment.y1, segment.y2);
    });

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
      centerX: (minX + maxX) * 0.5,
      centerY: (minY + maxY) * 0.5,
    };
  }

  function combineBounds(boundsList) {
    if (!boundsList.length) {
      return emptyBounds();
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    boundsList.forEach((bounds) => {
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    });

    return {
      minX,
      minY,
      maxX,
      maxY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY),
      centerX: (minX + maxX) * 0.5,
      centerY: (minY + maxY) * 0.5,
    };
  }

  function emptyGeometry() {
    return {
      letters: [],
      bounds: emptyBounds(),
    };
  }

  function emptyBounds() {
    return {
      minX: 0,
      minY: 0,
      maxX: 0,
      maxY: 0,
      width: 0,
      height: 0,
      centerX: 0,
      centerY: 0,
    };
  }

  function getCanvasCenter(canvas) {
    return {
      x: canvas.width * 0.5,
      y: canvas.height * 0.5,
    };
  }

  function snapTransformToCenter(textObject, center, threshold) {
    if (Math.abs(textObject.transform.x - center.x) <= threshold) {
      textObject.transform.x = center.x;
    }

    if (Math.abs(textObject.transform.y - center.y) <= threshold) {
      textObject.transform.y = center.y;
    }
  }

  function isPointInBounds(point, bounds, padding) {
    return (
      point.x >= bounds.minX - padding &&
      point.x <= bounds.maxX + padding &&
      point.y >= bounds.minY - padding &&
      point.y <= bounds.maxY + padding
    );
  }

  function distanceToSegment(point, segment) {
    const dx = segment.x2 - segment.x1;
    const dy = segment.y2 - segment.y1;
    const lengthSq = dx * dx + dy * dy || 1;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - segment.x1) * dx + (point.y - segment.y1) * dy) / lengthSq,
      ),
    );
    const px = segment.x1 + dx * t;
    const py = segment.y1 + dy * t;
    return Math.hypot(point.x - px, point.y - py);
  }

  function getMeasurementSvg() {
    if (measurementSvg) {
      return measurementSvg;
    }

    measurementSvg = document.createElementNS(SVG_NS, "svg");
    measurementSvg.setAttribute("width", "0");
    measurementSvg.setAttribute("height", "0");
    measurementSvg.style.position = "absolute";
    measurementSvg.style.visibility = "hidden";
    measurementSvg.style.pointerEvents = "none";
    document.body.appendChild(measurementSvg);
    return measurementSvg;
  }

  SBE.TextSystem = {
    applyTransform,
    centerTextObject,
    createTextObject,
    getCollisionLines,
    hitTestTextObjects,
    hydrateTextObject,
    hydrateTextObjects,
    markHit,
    serializeTextObject,
    updateTextObject,
  };
})(window);
