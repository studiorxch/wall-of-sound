(function initExamplePreset(global) {
  const SBE = global.SBE = global.SBE || {};

  SBE.ExampleScene = {
    lines: [
      {
        id: "preset-line-1",
        x1: 240,
        y1: 480,
        x2: 830,
        y2: 610,
        color: "#ff7a59",
        thickness: 8,
        midiChannel: 1,
        note: 60,
        velocityRange: [48, 112],
        life: 9999,
        behavior: { type: "normal", strength: 1.5 }
      },
      {
        id: "preset-line-2",
        x1: 180,
        y1: 990,
        x2: 920,
        y2: 900,
        color: "#ffd166",
        thickness: 6,
        midiChannel: 2,
        note: 67,
        velocityRange: [52, 118],
        life: 9999,
        behavior: { type: "orbital", strength: 2.4 }
      },
      {
        id: "preset-line-3",
        x1: 320,
        y1: 1340,
        x2: 810,
        y2: 1600,
        color: "#7ed7a6",
        thickness: 10,
        midiChannel: 3,
        note: 72,
        velocityRange: [40, 108],
        life: 9999,
        behavior: { type: "attract", strength: 3.1 }
      },
      {
        id: "preset-line-4",
        x1: 120,
        y1: 1600,
        x2: 420,
        y2: 1260,
        color: "#77bdfb",
        thickness: 5,
        midiChannel: 4,
        note: 55,
        velocityRange: [55, 120],
        life: 9999,
        behavior: { type: "repel", strength: 2.8 }
      }
    ],
    swarm: {
      count: 24,
      speed: 1.4,
      randomness: 0.22,
      radius: 6,
      color: "#f3f2ef"
    },
    textObjects: [],
    background: null
  };
})(window);
