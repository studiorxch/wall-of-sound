(function initEventBus(global) {
  const SBE = (global.SBE = global.SBE || {});

  function EventBus() {
    this.outputs = [];
  }

  EventBus.prototype.registerOutput = function registerOutput(output) {
    this.outputs.push(output);
  };

  EventBus.prototype.triggerEvent = function triggerEvent(type, sourceObject) {
    if (!sourceObject || !sourceObject.sound) {
      return;
    }

    const sound = sourceObject.sound;

    if (!sound.enabled) {
      return;
    }

    if (sound.event !== type) {
      return;
    }

    const now = performance.now();
    const cooldown =
      typeof sound.cooldownMs === "number" ? sound.cooldownMs : 50;

    if (
      typeof sound.lastPlayed === "number" &&
      now - sound.lastPlayed < cooldown
    ) {
      return;
    }

    sound.lastPlayed = now;

    for (let i = 0; i < this.outputs.length; i += 1) {
      const output = this.outputs[i];

      if (!output.enabled) {
        continue;
      }

      output.handle(type, sourceObject);
    }
  };

  SBE.EventBus = EventBus;
})(window);
