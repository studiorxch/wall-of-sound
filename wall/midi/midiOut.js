(function initMidi(global) {
  const SBE = global.SBE = global.SBE || {};

  function MidiOut() {
    this.access = null;
    this.outputId = "";
    this.enabled = true;
    this.status = "Web MIDI not connected.";
  }

  MidiOut.prototype.connect = async function connect() {
    if (!navigator.requestMIDIAccess) {
      this.status = "Web MIDI API is not supported in this browser.";
      return [];
    }

    this.access = await navigator.requestMIDIAccess();
    const outputs = this.getOutputs();

    if (!this.outputId && outputs[0]) {
      this.outputId = outputs[0].id;
    }

    this.status = outputs.length ? "Connected to Web MIDI." : "No MIDI outputs detected.";
    return outputs;
  };

  MidiOut.prototype.getOutputs = function getOutputs() {
    if (!this.access) {
      return [];
    }

    return Array.from(this.access.outputs.values()).map((output) => ({
      id: output.id,
      name: output.name || "Unnamed output"
    }));
  };

  MidiOut.prototype.setOutput = function setOutput(id) {
    this.outputId = id;
  };

  MidiOut.prototype.getSelectedOutput = function getSelectedOutput() {
    if (!this.access || !this.outputId) {
      return null;
    }

    return this.access.outputs.get(this.outputId) || null;
  };

  MidiOut.prototype.sendNote = function sendNote(channel, note, velocity) {
    if (!this.enabled) {
      return false;
    }

    const output = this.getSelectedOutput();
    if (!output) {
      return false;
    }

    const channelIndex = Math.max(0, Math.min(15, channel - 1));
    const noteNumber = Math.max(0, Math.min(127, Math.round(note)));
    const velocityValue = Math.max(1, Math.min(127, Math.round(velocity)));
    const timestamp = performance.now();

    output.send([0x90 + channelIndex, noteNumber, velocityValue], timestamp);
    output.send([0x80 + channelIndex, noteNumber, 0], timestamp + 120);
    return true;
  };

  MidiOut.prototype.sendAllNotesOff = function sendAllNotesOff() {
    const output = this.getSelectedOutput();
    if (!output) {
      return false;
    }

    const timestamp = performance.now();
    for (let channel = 0; channel < 16; channel += 1) {
      output.send([0xb0 + channel, 123, 0], timestamp);
    }
    return true;
  };

  SBE.MidiOut = MidiOut;
})(window);
