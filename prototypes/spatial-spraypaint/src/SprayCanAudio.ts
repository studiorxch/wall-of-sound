export type SprayAudioTransition = "start" | "stop" | "none";

export function resolveSprayAudioTransition(
  wasSpraying: boolean,
  isSpraying: boolean,
): SprayAudioTransition {
  if (!wasSpraying && isSpraying) return "start";
  if (wasSpraying && !isSpraying) return "stop";
  return "none";
}

export class SprayCanAudio {
  private context: AudioContext | null = null;
  private recordingDestination: MediaStreamAudioDestinationNode | null = null;
  private effectsBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private hissSource: AudioBufferSourceNode | null = null;
  private hissGain: GainNode | null = null;
  private spraying = false;
  private lastRattleTime = 0;

  public async unlock(): Promise<void> {
    const context = this.ensureGraph();
    if (context.state === "suspended") await context.resume();
  }

  public attachMusicElement(element: HTMLAudioElement): void {
    const context = this.ensureGraph();
    const source = context.createMediaElementSource(element);
    source.connect(this.musicBus!);
  }

  public getRecordingStream(): MediaStream {
    this.ensureGraph();
    return this.recordingDestination!.stream;
  }

  public getIsSpraying(): boolean {
    return this.spraying;
  }

  public async setSpraying(isSpraying: boolean): Promise<SprayAudioTransition> {
    const transition = resolveSprayAudioTransition(this.spraying, isSpraying);
    this.spraying = isSpraying;
    if (transition === "none") return transition;

    if (transition === "start") {
      await this.unlock();
      if (!this.spraying) return "none";
      this.startHiss();
    } else {
      this.stopHiss();
    }
    return transition;
  }

  public async playRattle(): Promise<void> {
    const nowMilliseconds = performance.now();
    if (nowMilliseconds - this.lastRattleTime < 480) return;
    this.lastRattleTime = nowMilliseconds;
    await this.unlock();
    const context = this.context!;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const now = context.currentTime;

    source.buffer = this.createNoiseBuffer(0.42);
    filter.type = "bandpass";
    filter.frequency.value = 2300;
    filter.Q.value = 1.7;
    gain.gain.setValueAtTime(0.0001, now);
    for (let index = 0; index < 7; index += 1) {
      const hitTime = now + index * 0.052;
      gain.gain.setValueAtTime(0.0001, hitTime);
      gain.gain.exponentialRampToValueAtTime(0.16 - index * 0.012, hitTime + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, hitTime + 0.038);
    }

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.effectsBus!);
    source.start(now);
    source.stop(now + 0.42);
  }

  private ensureGraph(): AudioContext {
    if (this.context) return this.context;

    const AudioContextConstructor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextConstructor) throw new Error("Web Audio is not supported in this browser.");

    this.context = new AudioContextConstructor();
    this.recordingDestination = this.context.createMediaStreamDestination();
    this.effectsBus = this.context.createGain();
    this.musicBus = this.context.createGain();
    this.effectsBus.gain.value = 0.72;
    this.musicBus.gain.value = 1;
    this.effectsBus.connect(this.context.destination);
    this.effectsBus.connect(this.recordingDestination);
    this.musicBus.connect(this.context.destination);
    this.musicBus.connect(this.recordingDestination);
    console.info("[Spatial Spraypaint] Spray-can audio initialized");
    return this.context;
  }

  private startHiss(): void {
    if (!this.context || !this.effectsBus || this.hissSource) return;

    const source = this.context.createBufferSource();
    const highpass = this.context.createBiquadFilter();
    const body = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const now = this.context.currentTime;

    source.buffer = this.createNoiseBuffer(1.25);
    source.loop = true;
    highpass.type = "highpass";
    highpass.frequency.value = 540;
    body.type = "bandpass";
    body.frequency.value = 1850;
    body.Q.value = 0.62;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12, now + 0.025);

    source.connect(highpass);
    highpass.connect(body);
    body.connect(gain);
    gain.connect(this.effectsBus);
    source.start(now);

    this.hissSource = source;
    this.hissGain = gain;
    console.info("[Spatial Spraypaint] Aerosol hiss started");
  }

  private stopHiss(): void {
    if (!this.context || !this.hissSource || !this.hissGain) return;

    const source = this.hissSource;
    const now = this.context.currentTime;
    this.hissGain.gain.cancelScheduledValues(now);
    this.hissGain.gain.setValueAtTime(Math.max(0.0001, this.hissGain.gain.value), now);
    this.hissGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);
    source.stop(now + 0.06);
    this.hissSource = null;
    this.hissGain = null;
    console.info("[Spatial Spraypaint] Aerosol hiss stopped");
  }

  private createNoiseBuffer(durationSeconds: number): AudioBuffer {
    const context = this.context!;
    const frameCount = Math.ceil(context.sampleRate * durationSeconds);
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < frameCount; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.18 + white * 0.82;
      channel[index] = previous;
    }
    return buffer;
  }
}
