(function initLineSystem(global) {
  const SBE = (global.SBE = global.SBE || {});
  let lineId = 0;

  function nextLineId() {
    lineId += 1;
    return "line-" + lineId;
  }

  function createLine(points, settings) {
    const line = {
      id: nextLineId(),
      x1: points.x1,
      y1: points.y1,
      x2: points.x2,
      y2: points.y2,
      color: settings.color,
      thickness: settings.thickness,
      midiChannel: settings.midiChannel,
      note: settings.note,
      velocityRange: [settings.velocityRange[0], settings.velocityRange[1]],
      life: settings.life,
      behavior: {
        type: settings.behavior.type,
        strength: settings.behavior.strength,
      },
      // 🔥 NEW
      interaction: {
        highlightColor: "#ffffff",
        duration: 140,
      },
    };

    if (settings.style) {
      line.style = {
        color: settings.style.color,
        colorMode: settings.style.colorMode || "auto",
        thickness: settings.style.thickness || settings.thickness,
      };
    }

    if (settings.midi) {
      line.midi = {
        note:
          typeof settings.midi.note === "number"
            ? settings.midi.note
            : settings.note,
        channel:
          typeof settings.midi.channel === "number"
            ? settings.midi.channel
            : settings.midiChannel,
      };
    }

    if (typeof settings.groupId === "string") {
      line.groupId = settings.groupId;
    }

    if (settings.gravity) {
      line.gravity = {
        enabled: !!settings.gravity.enabled,
        direction: settings.gravity.direction || "down",
        strength:
          typeof settings.gravity.strength === "number"
            ? settings.gravity.strength
            : 0,
      };
    }

    if (typeof settings.behavior.velocityMultiplier === "number") {
      line.behavior.velocityMultiplier = settings.behavior.velocityMultiplier;
    }

    return line;
  }

  function duplicateLine(line) {
    return {
      id: nextLineId(),
      x1: line.x1 + 24,
      y1: line.y1 + 24,
      x2: line.x2 + 24,
      y2: line.y2 + 24,
      color: line.color,
      thickness: line.thickness,
      midiChannel: line.midiChannel,
      note: line.note,
      velocityRange: [line.velocityRange[0], line.velocityRange[1]],
      life: line.life,
      behavior: {
        type: line.behavior.type,
        strength: line.behavior.strength,
      },
    };
  }

  function getClosestPoint(line, point) {
    const dx = line.x2 - line.x1;
    const dy = line.y2 - line.y1;
    const lengthSq = dx * dx + dy * dy || 1;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((point.x - line.x1) * dx + (point.y - line.y1) * dy) / lengthSq,
      ),
    );

    return {
      x: line.x1 + dx * t,
      y: line.y1 + dy * t,
      t,
    };
  }

  function getLineNormal(line, point) {
    const closest = getClosestPoint(line, point);
    const nx = point.x - closest.x;
    const ny = point.y - closest.y;
    const magnitude = Math.hypot(nx, ny) || 1;
    return { x: nx / magnitude, y: ny / magnitude };
  }

  function getMidpoint(line) {
    return {
      x: (line.x1 + line.x2) * 0.5,
      y: (line.y1 + line.y2) * 0.5,
    };
  }

  function calculateBehaviorForce(ball, line) {
    if (
      !line.behavior ||
      line.behavior.type === "normal" ||
      line.behavior.strength <= 0
    ) {
      return { x: 0, y: 0 };
    }

    const closest = getClosestPoint(line, ball);
    const dx = closest.x - ball.x;
    const dy = closest.y - ball.y;
    const distance = Math.hypot(dx, dy);
    const radius = 80 + line.behavior.strength * 42 + line.thickness * 3;

    if (distance === 0 || distance > radius) {
      return { x: 0, y: 0 };
    }

    const falloff = 1 - distance / radius;
    const force = line.behavior.strength * falloff * 55;
    const normalX = dx / distance;
    const normalY = dy / distance;

    switch (line.behavior.type) {
      case "attract":
        return { x: normalX * force, y: normalY * force };
      case "repel":
        return { x: -normalX * force, y: -normalY * force };
      case "gravity":
        return {
          x: normalX * force * 0.55,
          y: normalY * force * 0.55 + force * 0.45,
        };
      case "orbital":
        return {
          x: -normalY * force,
          y: normalX * force,
        };
      default:
        return { x: 0, y: 0 };
    }
  }

  function findNearestLine(lines, point, threshold) {
    let closestLine = null;
    let closestDistance = threshold;

    lines.forEach((line) => {
      const nearest = getClosestPoint(line, point);
      const distance =
        Math.hypot(point.x - nearest.x, point.y - nearest.y) -
        line.thickness * 0.5;
      if (distance <= closestDistance) {
        closestDistance = distance;
        closestLine = line;
      }
    });

    return closestLine;
  }

  function applyLineSettings(line, settings) {
    line.color = settings.color;
    line.thickness = settings.thickness;
    line.midiChannel = settings.midiChannel;
    line.note = settings.note;
    line.velocityRange = [settings.velocityRange[0], settings.velocityRange[1]];
    line.life = settings.life;
    line.behavior.type = settings.behavior.type;
    line.behavior.strength = settings.behavior.strength;
    if (typeof settings.behavior.velocityMultiplier === "number") {
      line.behavior.velocityMultiplier = settings.behavior.velocityMultiplier;
    }
  }

  function hydrateLine(rawLine) {
    if (typeof rawLine.id === "string") {
      const match = rawLine.id.match(/^line-(\d+)$/);
      if (match) {
        lineId = Math.max(lineId, Number(match[1]));
      }
    }

    return {
      id: rawLine.id || nextLineId(),
      x1: rawLine.x1,
      y1: rawLine.y1,
      x2: rawLine.x2,
      y2: rawLine.y2,
      color: rawLine.color || "#ff7a59",
      thickness: rawLine.thickness || 4,
      midiChannel: rawLine.midiChannel || 1,
      note: rawLine.note || 60,
      velocityRange: Array.isArray(rawLine.velocityRange)
        ? rawLine.velocityRange.slice(0, 2)
        : [48, 110],
      life: rawLine.life || 128,
      behavior: {
        type:
          rawLine.behavior && rawLine.behavior.type
            ? rawLine.behavior.type
            : "normal",
        strength:
          rawLine.behavior && typeof rawLine.behavior.strength === "number"
            ? rawLine.behavior.strength
            : 1,
        velocityMultiplier:
          rawLine.behavior &&
          typeof rawLine.behavior.velocityMultiplier === "number"
            ? rawLine.behavior.velocityMultiplier
            : 1,
      },
      style: rawLine.style
        ? {
            color: rawLine.style.color || rawLine.color || "#ff7a59",
            colorMode: rawLine.style.colorMode || rawLine.colorMode || "auto",
            thickness: rawLine.style.thickness || rawLine.thickness || 4,
          }
        : undefined,
      midi: rawLine.midi
        ? {
            note:
              typeof rawLine.midi.note === "number"
                ? rawLine.midi.note
                : rawLine.note || 60,
            channel:
              typeof rawLine.midi.channel === "number"
                ? rawLine.midi.channel
                : rawLine.midiChannel || 1,
          }
        : undefined,
      gravity: rawLine.gravity
        ? {
            enabled: !!rawLine.gravity.enabled,
            direction: rawLine.gravity.direction || "down",
            strength:
              typeof rawLine.gravity.strength === "number"
                ? rawLine.gravity.strength
                : 0,
          }
        : undefined,
      groupId: rawLine.groupId || null,
      interaction: rawLine.interaction
        ? {
            highlightColor:
              rawLine.interaction.highlightColor || "#ffffff",
            duration:
              typeof rawLine.interaction.duration === "number"
                ? rawLine.interaction.duration
                : 140,
          }
        : undefined,
    };
  }

  SBE.LineSystem = {
    applyLineSettings,
    calculateBehaviorForce,
    createLine,
    duplicateLine,
    findNearestLine,
    getClosestPoint,
    getLineNormal,
    getMidpoint,
    hydrateLine,
  };
})(window);
